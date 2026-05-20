const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const fabricService = require('../services/fabricBridge');
const membershipService = require('../services/membershipService');
const notificationService = require('../services/notificationService');

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

// GET /api/auth/membership — 가입 상태, 티어, 혜택, 월 응모권 조회
router.get('/membership', requireAuth, async (req, res) => {
  try {
    const summary = await membershipService.getMembershipSummary(_pool, req.user.user_id);
    res.json(summary);
  } catch (err) {
    console.error('[auth/membership]', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /api/auth/join-membership — 멤버십 가입(베이직 시작)
router.post('/join-membership', requireAuth, async (req, res) => {
  try {
    const walletAddress = await membershipService.getVerifiedWallet(
      _pool,
      req.user.user_id,
      String(req.body.walletAddress || '').trim(),
    );
    if (!walletAddress) {
      return res.status(400).json({ error: '멤버십 가입은 인증된 지갑 연결 후 가능합니다.' });
    }

    const current = await membershipService.getUserMembership(_pool, req.user.user_id);
    if (current.joined) {
      return res.json({ success: true, message: '이미 멤버십에 가입되어 있습니다.', currentTier: current.tier });
    }

    const userDidHash = fabricService.hashDid(walletAddress);
    await fabricService.joinMembership({ userDidHash });
    await _pool.query(
      `UPDATE users
          SET membership_tier = '베이직', membership_joined_at = NOW()
        WHERE user_id = ?`,
      [req.user.user_id],
    );
    await _pool.query(
      `INSERT INTO user_boxes (user_id, season_count)
       VALUES (?, 0)
       ON DUPLICATE KEY UPDATE season_count = season_count`,
      [req.user.user_id],
    );
    await notificationService.recordNotification(_pool, {
      userId: req.user.user_id,
      category: 'MEMBERSHIP',
      title: '멤버십 가입 완료',
      message: '베이직 등급으로 시작합니다. 이제 포인트 적립과 티어업 혜택을 받을 수 있습니다.',
      metadata: { tier: '베이직' },
    });

    res.json({ success: true, message: '멤버십 가입 완료! 베이직 등급으로 시작합니다.', currentTier: '베이직' });
  } catch (err) {
    console.error('[auth/join-membership]', err);
    res.status(500).json({ error: err.message || '멤버십 가입 실패' });
  }
});

// GET /api/auth/early-access-count — 사용 가능한 응모권 수 조회
router.get('/early-access-count', requireAuth, async (req, res) => {
  try {
    await _pool.query(
      `UPDATE raffle_nfts
          SET status = 'EXPIRED'
        WHERE user_id = ? AND status = 'ISSUED' AND expires_at IS NOT NULL AND expires_at < NOW()`,
      [req.user.user_id],
    );
    const [[row]] = await _pool.query(
      `SELECT COUNT(*) AS cnt
         FROM raffle_nfts
        WHERE user_id = ? AND status = 'ISSUED'
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [req.user.user_id],
    );
    const membership = await membershipService.getUserMembership(_pool, req.user.user_id);
    res.json({ success: true, count: row?.cnt ?? 0, tier: membership.tier, joined: membership.joined });
  } catch (err) {
    console.error('[auth/early-access-count]', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /api/auth/tier-up — 수동 티어업 + 최초 달성 혜택 지급
router.post('/tier-up', requireAuth, async (req, res) => {
  try {
    const membership = await membershipService.getUserMembership(_pool, req.user.user_id);
    if (!membership.joined) return res.status(400).json({ error: '멤버십 가입 후 티어업할 수 있습니다.' });

    const seasonCount = await membershipService.getSeasonCount(_pool, req.user.user_id);
    const currentIdx = membershipService.TIER_ORDER.indexOf(membership.tier);
    const nextTier = currentIdx < membershipService.TIER_ORDER.length - 1
      ? membershipService.TIER_ORDER[currentIdx + 1]
      : null;

    if (!nextTier) return res.status(400).json({ error: '이미 최고 등급입니다.' });
    if (seasonCount < membershipService.TIER_REQUIREMENTS[nextTier]) {
      return res.status(400).json({ error: `${nextTier} 달성 조건 미충족(필요: ${membershipService.TIER_REQUIREMENTS[nextTier]}회)` });
    }

    const walletAddress = await membershipService.getVerifiedWallet(
      _pool,
      req.user.user_id,
      String(req.body.walletAddress || '').trim(),
    );
    if (!walletAddress) return res.status(400).json({ error: '인증된 지갑 연결이 필요합니다.' });

    const userDidHash = fabricService.hashDid(walletAddress);
    await fabricService.tierUpMembership({ userDidHash, targetGrade: membershipService.toFabricTier(nextTier) });

    const [[existingReward]] = await _pool.query(
      `SELECT id FROM membership_tier_rewards WHERE user_id = ? AND tier = ?`,
      [req.user.user_id, nextTier],
    );
    if (existingReward) return res.status(409).json({ error: '이미 해당 티어 최초 혜택을 수령했습니다.' });

    const reward = membershipService.TIER_REWARDS[nextTier] || { cards: 0, raffles: 0 };
    const awardedCards = await membershipService.issueRewardCards(_pool, req.user.user_id, reward.cards, nextTier);
    const issuedRaffleNftIds = await membershipService.issueRaffleNfts({
      pool: _pool,
      fabricService,
      userId: req.user.user_id,
      walletAddress,
      count: reward.raffles,
      source: 'TIER_REWARD',
      expiresAt: membershipService.addDays(new Date(), 60),
    });

    await _pool.query(
      'UPDATE users SET membership_tier = ? WHERE user_id = ?',
      [nextTier, req.user.user_id],
    );
    await _pool.query(
      `INSERT INTO membership_tier_rewards
         (id, user_id, tier, reward_cards, reward_raffles, card_payload_json, raffle_nft_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        req.user.user_id,
        nextTier,
        reward.cards,
        reward.raffles,
        JSON.stringify(awardedCards),
        JSON.stringify(issuedRaffleNftIds),
      ],
    );
    const rewardMessage = [
      reward.cards > 0 ? `실물 NFT ${reward.cards}장` : '',
      reward.raffles > 0 ? `응모권 ${reward.raffles}장` : '',
    ].filter(Boolean).join(', ');
    await notificationService.recordNotification(_pool, {
      userId: req.user.user_id,
      category: 'MEMBERSHIP',
      title: `${nextTier} 티어업 완료`,
      message: rewardMessage ? `최초 달성 혜택으로 ${rewardMessage}이 지급되었습니다.` : '새 멤버십 등급이 적용되었습니다.',
      metadata: { tier: nextTier, rewardCards: reward.cards, rewardRaffles: reward.raffles, issuedRaffleNftIds },
    });
    if (issuedRaffleNftIds.length > 0) {
      await notificationService.recordNotification(_pool, {
        userId: req.user.user_id,
        category: 'RAFFLE',
        title: '응모권 획득',
        message: `${nextTier} 최초 혜택으로 응모권 ${issuedRaffleNftIds.length}장이 지급되었습니다.`,
        amount: issuedRaffleNftIds.length,
        metadata: { source: 'TIER_REWARD', tier: nextTier, raffleNftIds: issuedRaffleNftIds },
      });
    }

    res.json({
      success: true,
      message: `${nextTier} 등급으로 티어업 완료! 최초 달성 혜택이 지급되었습니다.`,
      newTier: nextTier,
      raffleCount: issuedRaffleNftIds.length,
      issuedRaffleNftIds,
      awardedCards,
    });
  } catch (err) {
    console.error('[auth/tier-up]', err);
    res.status(500).json({ error: err.message || '서버 오류' });
  }
});

// POST /api/auth/claim-monthly-raffles — 등급별 월 응모권 수령
router.post('/claim-monthly-raffles', requireAuth, async (req, res) => {
  try {
    const membership = await membershipService.getUserMembership(_pool, req.user.user_id);
    if (!membership.joined) return res.status(400).json({ error: '멤버십 가입 후 월 응모권을 받을 수 있습니다.' });

    const limit = membershipService.TIER_MONTHLY_RAFFLES[membership.tier] || 0;
    if (limit <= 0) return res.status(400).json({ error: `${membership.tier} 등급은 월 응모권 지급 대상이 아닙니다.` });

    const claimMonth = membershipService.formatMonth();
    const [[existing]] = await _pool.query(
      `SELECT id FROM membership_monthly_raffle_claims WHERE user_id = ? AND claim_month = ?`,
      [req.user.user_id, claimMonth],
    );
    if (existing) return res.status(400).json({ error: '이번 달 응모권은 이미 수령했습니다.' });

    const walletAddress = await membershipService.getVerifiedWallet(
      _pool,
      req.user.user_id,
      String(req.body.walletAddress || '').trim(),
    );
    if (!walletAddress) return res.status(400).json({ error: '인증된 지갑 연결이 필요합니다.' });

    const expiresAt = membershipService.nextMonthEnd();
    const issuedRaffleNftIds = await membershipService.issueRaffleNfts({
      pool: _pool,
      fabricService,
      userId: req.user.user_id,
      walletAddress,
      count: limit,
      source: 'MONTHLY_GRANT',
      expiresAt,
      claimedMonth: claimMonth,
    });

    await _pool.query(
      `INSERT INTO membership_monthly_raffle_claims
         (id, user_id, claim_month, tier, claimed_count, raffle_nft_ids, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), req.user.user_id, claimMonth, membership.tier, limit, JSON.stringify(issuedRaffleNftIds), expiresAt],
    );
    await notificationService.recordNotification(_pool, {
      userId: req.user.user_id,
      category: 'MEMBERSHIP',
      title: '월 응모권 수령 완료',
      message: `${claimMonth} 월 응모권 ${limit}장이 지급되었습니다.`,
      amount: limit,
      metadata: { claimMonth, tier: membership.tier, raffleNftIds: issuedRaffleNftIds },
    });
    await notificationService.recordNotification(_pool, {
      userId: req.user.user_id,
      category: 'RAFFLE',
      title: '응모권 획득',
      message: `멤버십 월 혜택으로 응모권 ${limit}장이 지급되었습니다.`,
      amount: limit,
      metadata: { source: 'MONTHLY_GRANT', claimMonth, raffleNftIds: issuedRaffleNftIds },
    });

    res.json({
      success: true,
      message: `${claimMonth} 월 응모권 ${limit}장이 지급되었습니다.`,
      count: limit,
      raffleNftIds: issuedRaffleNftIds,
      expiresAt,
    });
  } catch (err) {
    console.error('[auth/claim-monthly-raffles]', err);
    res.status(500).json({ error: err.message || '월 응모권 수령 실패' });
  }
});

module.exports = { router, setPool };
