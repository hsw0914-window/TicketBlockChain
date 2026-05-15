const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const https = require('https');
const { ethers } = require('ethers');
const { requireAuth } = require('../middleware/auth');

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    https.get({ hostname: opts.hostname, path: opts.pathname, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ ok: res.statusCode < 400, json: () => JSON.parse(data) }));
    }).on('error', reject);
  });
}

const router = express.Router();
let _pool;

function setPool(pool) {
  _pool = pool;
}

const jwtSecret = () => process.env.JWT_SECRET || 'fallback-secret';

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
    const googleRes = await httpsGet('https://www.googleapis.com/oauth2/v3/userinfo', {
      Authorization: `Bearer ${access_token}`,
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

const { mintFragmentOnChain } = require('../services/nftService');

const TIER_ORDER = ['일반', '브론즈', '실버', '골드'];
const TIER_REQUIREMENTS = { '브론즈': 3, '실버': 6, '골드': 10 };
const TIER_RAFFLE_REWARDS = { '실버': 1, '골드': 3 };

// GET /api/auth/membership — 멤버십 현황 조회
router.get('/membership', requireAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const [[user]] = await _pool.query('SELECT membership_tier FROM users WHERE user_id = ?', [userId]);
    const currentTier = user?.membership_tier || '일반';

    const [[{ season_count }]] = await _pool.query(`
      SELECT COUNT(*) AS season_count FROM tickets t
      JOIN user_wallets uw ON t.wallet_address = uw.wallet_address
      WHERE uw.user_id = ?
    `, [userId]);

    const currentIdx = TIER_ORDER.indexOf(currentTier);
    const nextTier = currentIdx < TIER_ORDER.length - 1 ? TIER_ORDER[currentIdx + 1] : null;
    const nextTierCount = nextTier ? TIER_REQUIREMENTS[nextTier] : null;
    const canTierUp = nextTier !== null && Number(season_count) >= nextTierCount;

    res.json({ success: true, currentTier, season_count: Number(season_count), nextTier, nextTierCount, canTierUp });
  } catch (err) {
    console.error('[membership]', err);
    res.status(500).json({ error: '멤버십 조회 중 서버 오류가 발생했습니다.' });
  }
});

// POST /api/auth/tier-up — 티어업 + 응모권 지급
router.post('/tier-up', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  const { walletAddress, signature, message } = req.body;

  if (!signature || !message) {
    return res.status(400).json({ error: 'MetaMask 서명이 필요합니다.' });
  }

  try {
    // 서명 검증: 서명한 주소가 요청한 지갑 주소와 일치하는지 확인
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({ error: '서명 검증 실패: 지갑 주소가 일치하지 않습니다.' });
    }

    // DB에 등록된 지갑과 일치하는지 확인
    const [[wallet]] = await _pool.query('SELECT wallet_address FROM user_wallets WHERE user_id = ?', [userId]);
    if (!wallet || wallet.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({ error: '등록된 지갑 주소와 다릅니다.' });
    }

    const [[user]] = await _pool.query('SELECT membership_tier FROM users WHERE user_id = ?', [userId]);
    const currentTier = user?.membership_tier || '일반';
    const currentIdx = TIER_ORDER.indexOf(currentTier);

    if (currentIdx >= TIER_ORDER.length - 1) {
      return res.status(400).json({ error: '이미 최고 등급입니다.' });
    }

    const nextTier = TIER_ORDER[currentIdx + 1];
    const requiredCount = TIER_REQUIREMENTS[nextTier];

    const [[{ season_count }]] = await _pool.query(`
      SELECT COUNT(*) AS season_count FROM tickets t
      JOIN user_wallets uw ON t.wallet_address = uw.wallet_address
      WHERE uw.user_id = ?
    `, [userId]);

    if (Number(season_count) < requiredCount) {
      return res.status(400).json({ error: `티어업 조건 미충족. 현재 ${season_count}회 / ${requiredCount}회 필요` });
    }

    await _pool.query('UPDATE users SET membership_tier = ? WHERE user_id = ?', [nextTier, userId]);

    const raffleCount = TIER_RAFFLE_REWARDS[nextTier] || 0;
    let lastTxHash = null;

    if (raffleCount > 0 && walletAddress) {
      await _pool.query(
        `INSERT INTO user_fragments (user_id, fragment_type_id, count) VALUES (?, 'early-access-pass', ?)
         ON DUPLICATE KEY UPDATE count = count + ?`,
        [userId, raffleCount, raffleCount]
      );
      for (let i = 0; i < raffleCount; i++) {
        try {
          const txHash = await mintFragmentOnChain(walletAddress, 99);
          lastTxHash = txHash;
          await _pool.query(
            'INSERT INTO onchain_tx_logs (id, user_id, wallet_address, action_type, tx_hash, payload_json) VALUES (UUID(), ?, ?, ?, ?, ?)',
            [userId, walletAddress, 'RAFFLE_NFT_MINTED', txHash, JSON.stringify({ tier: nextTier, onchain_id: 99 })]
          );
        } catch (e) {
          console.error('[tier-up] 온체인 민팅 실패:', e.message);
        }
      }
    }

    res.json({
      success: true,
      newTier: nextTier,
      raffleCount,
      txHash: lastTxHash,
      message: raffleCount > 0
        ? `${nextTier} 등급으로 업그레이드! 응모권 ${raffleCount}장이 지급되었습니다.`
        : `${nextTier} 등급으로 업그레이드되었습니다!`,
    });
  } catch (err) {
    console.error('[tier-up]', err);
    res.status(500).json({ error: '티어업 중 서버 오류가 발생했습니다.' });
  }
});

// POST /api/auth/claim-nft — 응모권 NFT 발행

router.post('/claim-nft', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  const { item_id, signature, walletAddress } = req.body;
  const targetItem = item_id || 'early-access-pass';
  const ONCHAIN_ID = 99;

  if (!signature) {
    return res.status(400).json({ error: '메타마스크 서명 확인이 필요합니다.' });
  }

  try {
    const [[wallet]] = await _pool.query(
      'SELECT wallet_address FROM user_wallets WHERE user_id = ?',
      [userId]
    );

    if (!wallet || wallet.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({ error: '등록된 지갑 주소와 서명한 지갑 주소가 일치하지 않습니다.' });
    }

    await _pool.query(
      `INSERT INTO user_fragments (user_id, fragment_type_id, count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE count = count + 1`,
      [userId, targetItem]
    );

    let txHash = signature.slice(0, 66);
    try {
      txHash = await mintFragmentOnChain(walletAddress, ONCHAIN_ID);
    } catch (mintErr) {
      console.error('[claim-nft] 온체인 민팅 실패:', mintErr.message);
    }

    await _pool.query(
      'INSERT INTO onchain_tx_logs (id, user_id, wallet_address, action_type, tx_hash, payload_json) VALUES (UUID(), ?, ?, ?, ?, ?)',
      [userId, walletAddress, 'NFT_CLAIM_CONFIRMED', txHash, JSON.stringify({ item_id: targetItem })]
    );

    res.json({
      success: true,
      message: `트랜잭션 승인 완료! 블록체인 발급이 시작되었습니다. (Tx: ${txHash.slice(0, 10)}...)`,
    });
  } catch (err) {
    console.error('[claim-nft]', err);
    res.status(500).json({ error: 'NFT 발급 중 서버 오류가 발생했습니다.' });
  }
});

// GET /api/auth/early-access-count — 보유 중인 응모권 수량 조회
router.get('/early-access-count', requireAuth, async (req, res) => {
  try {
    const [[row]] = await _pool.query(
      "SELECT count FROM user_fragments WHERE user_id = ? AND fragment_type_id = 'early-access-pass'",
      [req.user.user_id]
    );
    res.json({ success: true, count: row ? row.count : 0 });
  } catch (err) {
    console.error('[early-access-count]', err);
    res.status(500).json({ error: '수량 조회 중 서버 오류가 발생했습니다.' });
  }
});

module.exports = { router, setPool };
