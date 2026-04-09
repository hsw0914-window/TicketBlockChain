// routes/wallet.js — MetaMask 지갑 연결 및 서명 검증
//
// 흐름: POST /connect → GET /challenge → POST /verify-signature
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../auth');
const { verifyEthSignature } = require('../didUtils');

const router = express.Router();

// 챌린지 임시 저장 (실제 서비스에서는 Redis + TTL)
const pendingChallenges = new Map();

// POST /wallet/connect — MetaMask 주소 등록
router.post('/connect', requireAuth, (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address가 필요합니다.' });

  if (db.prepare('SELECT id FROM wallets WHERE user_id = ?').get(req.user.id)) {
    return res.status(400).json({ error: '이미 지갑이 연결되어 있습니다.' });
  }
  if (db.prepare('SELECT id FROM wallets WHERE address = ?').get(address.toLowerCase())) {
    return res.status(400).json({ error: '이미 다른 계정에 연결된 지갑 주소입니다.' });
  }

  db.prepare('INSERT INTO wallets (user_id, address) VALUES (?, ?)').run(req.user.id, address.toLowerCase());
  res.json({ message: '지갑이 연결되었습니다. 서명 검증을 진행해주세요.', address: address.toLowerCase(), is_verified: false });
});

// GET /wallet/challenge — 일회성 챌린지 발급
router.get('/challenge', requireAuth, (req, res) => {
  if (!db.prepare('SELECT id FROM wallets WHERE user_id = ?').get(req.user.id)) {
    return res.status(400).json({ error: '먼저 지갑을 연결해주세요.' });
  }
  const challenge = `DID-AUTH:${crypto.randomBytes(16).toString('hex')}`;
  pendingChallenges.set(req.user.id, challenge);
  res.json({ challenge });
});

// POST /wallet/verify-signature — MetaMask personal_sign 검증
router.post('/verify-signature', requireAuth, (req, res) => {
  const { challenge, signature } = req.body;
  if (!challenge || !signature) return res.status(400).json({ error: 'challenge와 signature가 필요합니다.' });

  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
  if (!wallet) return res.status(400).json({ error: '먼저 지갑을 연결해주세요.' });

  const stored = pendingChallenges.get(req.user.id);
  if (!stored || stored !== challenge) {
    return res.status(400).json({ error: '챌린지가 일치하지 않습니다. 다시 발급받아주세요.' });
  }

  if (!verifyEthSignature(challenge, signature, wallet.address)) {
    return res.status(400).json({ error: '서명 검증 실패. MetaMask로 올바르게 서명했는지 확인하세요.' });
  }

  db.prepare('UPDATE wallets SET is_verified = 1 WHERE user_id = ?').run(req.user.id);
  pendingChallenges.delete(req.user.id);
  res.json({ message: '지갑 서명 검증 완료!', verified: true });
});

// GET /wallet/info
router.get('/info', requireAuth, (req, res) => {
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
  if (!wallet) return res.json({ connected: false });
  res.json({ connected: true, address: wallet.address, is_verified: Boolean(wallet.is_verified), connected_at: wallet.connected_at });
});

module.exports = router;
