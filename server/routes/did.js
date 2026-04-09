const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { addressToDid } = require('../utils/didUtils');

const router = express.Router();
let _pool;

function setPool(pool) {
  _pool = pool;
}

// POST /api/did/create — 지갑 서명 검증 완료 후 DID 생성
router.post('/create', requireAuth, async (req, res) => {
  try {
    const [[wallet]] = await _pool.query(
      'SELECT * FROM user_wallets WHERE user_id = ?',
      [req.user.user_id]
    );
    if (!wallet) return res.status(400).json({ error: '먼저 지갑을 연결해주세요.' });
    if (!wallet.is_verified) return res.status(400).json({ error: '지갑 서명 검증을 먼저 완료해주세요.' });

    const [[existing]] = await _pool.query(
      'SELECT * FROM did_verifications WHERE user_id = ?',
      [req.user.user_id]
    );

    if (existing && existing.status === 'verified') {
      return res.json({
        message: '이미 DID 인증이 완료된 계정입니다.',
        did: existing.did_value,
        already_exists: true,
      });
    }

    const did = addressToDid(wallet.wallet_address);

    if (existing) {
      await _pool.query(
        'UPDATE did_verifications SET did_value = ?, wallet_address = ?, status = ?, verified_at = NOW() WHERE user_id = ?',
        [did, wallet.wallet_address, 'verified', req.user.user_id]
      );
    } else {
      await _pool.query(
        'INSERT INTO did_verifications (user_id, did_value, wallet_address, status, verified_at) VALUES (?, ?, ?, ?, NOW())',
        [req.user.user_id, did, wallet.wallet_address, 'verified']
      );
    }

    res.json({ message: 'DID 인증이 완료되었습니다!', did, already_exists: false });
  } catch (err) {
    console.error('[did/create]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/did/status — 전체 인증 단계 상태 조회
router.get('/status', requireAuth, async (req, res) => {
  try {
    const [[wallet]] = await _pool.query(
      'SELECT wallet_address, is_verified FROM user_wallets WHERE user_id = ?',
      [req.user.user_id]
    );
    const [[did]] = await _pool.query(
      'SELECT did_value, status, verified_at FROM did_verifications WHERE user_id = ?',
      [req.user.user_id]
    );

    res.json({
      user_id: req.user.user_id,
      nickname: req.user.nickname,
      wallet_connected: Boolean(wallet),
      wallet_address: wallet?.wallet_address ?? null,
      wallet_verified: Boolean(wallet?.is_verified),
      did_value: did?.did_value ?? null,
      did_status: did?.status ?? 'none',
      did_verified_at: did?.verified_at ?? null,
      auth_steps: {
        step1_registered: true,
        step2_wallet_connected: Boolean(wallet),
        step3_wallet_verified: Boolean(wallet?.is_verified),
        step4_did_created: Boolean(did),
      },
    });
  } catch (err) {
    console.error('[did/status]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = { router, setPool };
