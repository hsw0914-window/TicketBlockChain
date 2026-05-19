const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
let _pool;

function setPool(pool) {
  _pool = pool;
}

const jwtSecret = () => process.env.JWT_SECRET;

// POST /api/auth/register — 회원가입
router.post('/register', async (req, res) => {
  try {
    const { email, password, nickname } = req.body;
    if (!email || !password || !nickname) {
      return res.status(400).json({ error: '이메일, 비밀번호, 닉네임을 모두 입력해주세요.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
    }

    const [[existing]] = await _pool.query(
      'SELECT user_id FROM users WHERE email = ?',
      [email]
    );
    if (existing) return res.status(400).json({ error: '이미 등록된 이메일입니다.' });

    const user_id = 'u_' + crypto.randomBytes(8).toString('hex');
    const password_hash = await bcrypt.hash(password, 10);

    await _pool.query(
      'INSERT INTO users (user_id, nickname, email, password_hash, login_type) VALUES (?, ?, ?, ?, ?)',
      [user_id, nickname, email, password_hash, 'local']
    );

    const token = jwt.sign({ sub: user_id }, jwtSecret(), { expiresIn: '7d' });
    console.log(`[auth] 회원가입: ${email} | 닉네임: ${nickname} | ID: ${user_id}`);
    res.status(201).json({ token, user: { user_id, nickname, email } });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/auth/login — 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    const [[user]] = await _pool.query(
      'SELECT * FROM users WHERE email = ? AND login_type = ?',
      [email, 'local']
    );
    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = jwt.sign({ sub: user.user_id }, jwtSecret(), { expiresIn: '7d' });
    console.log(`[auth] 로그인: ${email} | ID: ${user.user_id}`);
    res.json({ token, user: { user_id: user.user_id, nickname: user.nickname, email: user.email } });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/auth/google — 구글 로그인 / 자동 회원가입
router.post('/google', async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token) return res.status(400).json({ error: 'access_token이 필요합니다.' });

    // Google userinfo API로 사용자 정보 검증
    const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!googleRes.ok) return res.status(401).json({ error: '구글 토큰 검증 실패' });

    const { sub: google_id, email, name, picture } = await googleRes.json();
    if (!google_id || !email) return res.status(401).json({ error: '구글 사용자 정보를 가져올 수 없습니다.' });

    // 1) google_id로 기존 사용자 조회
    let [[user]] = await _pool.query('SELECT * FROM users WHERE google_id = ?', [google_id]);

    if (!user) {
      // 2) 이메일로 기존 로컬 계정 확인 → 있으면 google_id 연결
      [[user]] = await _pool.query('SELECT * FROM users WHERE email = ?', [email]);

      if (user) {
        await _pool.query(
          'UPDATE users SET google_id = ?, profile_image = COALESCE(profile_image, ?) WHERE user_id = ?',
          [google_id, picture ?? null, user.user_id]
        );
        [[user]] = await _pool.query('SELECT * FROM users WHERE user_id = ?', [user.user_id]);
      } else {
        // 3) 신규 사용자 자동 회원가입
        const user_id = 'u_' + crypto.randomBytes(8).toString('hex');
        const nickname = name ?? email.split('@')[0];

        await _pool.query(
          'INSERT INTO users (user_id, nickname, email, google_id, login_type, profile_image) VALUES (?, ?, ?, ?, ?, ?)',
          [user_id, nickname, email, google_id, 'google', picture ?? null]
        );
        [[user]] = await _pool.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
      }
    }

    if (!user.is_active) return res.status(403).json({ error: '비활성화된 계정입니다.' });

    const token = jwt.sign({ sub: user.user_id }, jwtSecret(), { expiresIn: '7d' });
    console.log(`[auth] 구글 로그인: ${email} | ID: ${user.user_id}`);
    res.json({
      token,
      user: {
        user_id: user.user_id,
        nickname: user.nickname,
        email: user.email,
        profile_image: user.profile_image ?? null,
      },
    });
  } catch (err) {
    console.error('[google-auth]', err);
    res.status(500).json({ error: '구글 로그인에 실패했습니다.' });
  }
});

// POST /api/auth/find-id — 닉네임으로 이메일(아이디) 찾기
router.post('/find-id', async (req, res) => {
  try {
    const { nickname } = req.body;
    if (!nickname) return res.status(400).json({ error: '닉네임을 입력해주세요.' });

    const [[user]] = await _pool.query(
      "SELECT email FROM users WHERE nickname = ? AND login_type = 'local'",
      [nickname]
    );
    if (!user) return res.status(404).json({ error: '해당 닉네임으로 등록된 계정이 없습니다.' });

    // 이메일 마스킹: ex***@gmail.com
    const [local, domain] = user.email.split('@');
    const masked = local.slice(0, 2) + '*'.repeat(Math.max(local.length - 2, 3)) + '@' + domain;
    res.json({ maskedEmail: masked });
  } catch (err) {
    console.error('[find-id]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/auth/find-password — 이메일로 임시 비밀번호 발급
router.post('/find-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: '이메일을 입력해주세요.' });

    const [[user]] = await _pool.query(
      "SELECT user_id FROM users WHERE email = ? AND login_type = 'local'",
      [email]
    );
    if (!user) return res.status(404).json({ error: '해당 이메일로 등록된 계정이 없습니다.' });

    // 임시 비밀번호 생성 (영문+숫자 8자리)
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const tempPassword = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

    const password_hash = await bcrypt.hash(tempPassword, 10);
    await _pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [password_hash, user.user_id]);
    res.json({ tempPassword });
  } catch (err) {
    console.error('[find-password]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/auth/me — 내 정보 조회 (JWT 필요)
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// GET /api/auth/wallet — 내 등록 지갑 주소 조회 (JWT 필요)
router.get('/wallet', requireAuth, async (req, res) => {
  try {
    const [[row]] = await _pool.query(
      'SELECT wallet_address FROM user_wallets WHERE user_id = ?',
      [req.user.user_id]
    );
    res.json({ walletAddress: row?.wallet_address ?? null });
  } catch (err) {
    console.error('[auth/wallet]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/auth/membership — 멤버십 등급 및 입장 횟수 조회
const TIER_ORDER = ['일반', '브론즈', '실버', '골드'];
const TIER_REQUIREMENTS = { '일반': 0, '브론즈': 3, '실버': 6, '골드': 10 };

router.get('/membership', requireAuth, async (req, res) => {
  try {
    const [[boxRow]] = await _pool.query(
      'SELECT season_count FROM user_boxes WHERE user_id = ?',
      [req.user.user_id]
    );
    const season_count = boxRow?.season_count ?? 0;

    // 현재 등급 계산
    let currentTier = '일반';
    for (const tier of TIER_ORDER) {
      if (season_count >= TIER_REQUIREMENTS[tier]) currentTier = tier;
    }

    const currentIdx = TIER_ORDER.indexOf(currentTier);
    const nextTier = currentIdx < TIER_ORDER.length - 1 ? TIER_ORDER[currentIdx + 1] : null;
    const nextTierCount = nextTier ? TIER_REQUIREMENTS[nextTier] : null;
    const canTierUp = nextTier ? season_count >= TIER_REQUIREMENTS[nextTier] : false;

    res.json({ success: true, currentTier, season_count, nextTier, nextTierCount, canTierUp });
  } catch (err) {
    console.error('[auth/membership]', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// GET /api/auth/early-access-count — 보유 응모권 수 조회
router.get('/early-access-count', requireAuth, async (req, res) => {
  try {
    const [[row]] = await _pool.query(
      "SELECT COUNT(*) AS cnt FROM raffle_nfts WHERE user_id = ? AND status = 'ISSUED'",
      [req.user.user_id]
    );
    res.json({ success: true, count: row?.cnt ?? 0 });
  } catch (err) {
    console.error('[auth/early-access-count]', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /api/auth/tier-up — 티어 업그레이드
router.post('/tier-up', requireAuth, async (req, res) => {
  try {
    const [[boxRow]] = await _pool.query(
      'SELECT season_count FROM user_boxes WHERE user_id = ?',
      [req.user.user_id]
    );
    const season_count = boxRow?.season_count ?? 0;

    let currentTier = '일반';
    for (const tier of TIER_ORDER) {
      if (season_count >= TIER_REQUIREMENTS[tier]) currentTier = tier;
    }

    const currentIdx = TIER_ORDER.indexOf(currentTier);
    const nextTier = currentIdx < TIER_ORDER.length - 1 ? TIER_ORDER[currentIdx + 1] : null;

    if (!nextTier) return res.status(400).json({ error: '이미 최고 등급입니다.' });
    if (season_count < TIER_REQUIREMENTS[nextTier]) {
      return res.status(400).json({ error: `${nextTier} 달성 조건 미충족 (필요: ${TIER_REQUIREMENTS[nextTier]}회)` });
    }

    res.json({ success: true, message: `${nextTier} 등급으로 티어업 완료!`, newTier: nextTier, awardedCards: [] });
  } catch (err) {
    console.error('[auth/tier-up]', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = { router, setPool };
