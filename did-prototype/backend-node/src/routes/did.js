// routes/did.js — DID 생성 및 조회
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { addressToDid, createDidDocument, SERVER_DID } = require('../didUtils');

const router = express.Router();

// POST /did/create — 지갑 서명 검증 완료 후 DID 생성
router.post('/create', requireAuth, (req, res) => {
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
  if (!wallet) return res.status(400).json({ error: '먼저 지갑을 연결해주세요.' });
  if (!wallet.is_verified) return res.status(400).json({ error: '지갑 서명 검증을 먼저 완료해주세요.' });

  const existing = db.prepare('SELECT * FROM did_documents WHERE user_id = ?').get(req.user.id);
  if (existing) {
    return res.json({ message: '이미 DID가 존재합니다.', did: existing.did, document: JSON.parse(existing.document_json), already_exists: true });
  }

  const did = addressToDid(wallet.address);
  const didDoc = createDidDocument(did);
  db.prepare('INSERT INTO did_documents (user_id, did, document_json) VALUES (?, ?, ?)').run(req.user.id, did, JSON.stringify(didDoc));

  res.json({ message: 'DID가 성공적으로 생성되었습니다!', did, document: didDoc, already_exists: false });
});

// GET /did/document
router.get('/document', requireAuth, (req, res) => {
  const doc = db.prepare('SELECT * FROM did_documents WHERE user_id = ?').get(req.user.id);
  if (!doc) return res.status(404).json({ error: 'DID가 없습니다. 먼저 /did/create를 호출하세요.' });
  res.json({ did: doc.did, document: JSON.parse(doc.document_json), created_at: doc.created_at });
});

// GET /did/status — 전체 인증 상태 한눈에 확인
router.get('/status', requireAuth, (req, res) => {
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
  const didDoc = db.prepare('SELECT * FROM did_documents WHERE user_id = ?').get(req.user.id);
  const credentials = db.prepare('SELECT * FROM verifiable_credentials WHERE user_id = ? AND is_revoked = 0').all(req.user.id);

  const walletConnected = Boolean(wallet);
  const walletVerified = walletConnected && Boolean(wallet.is_verified);
  const hasDid = Boolean(didDoc);

  res.json({
    user_id: req.user.id,
    email: req.user.email,
    has_did: hasDid,
    did: hasDid ? didDoc.did : null,
    wallet_connected: walletConnected,
    wallet_address: walletConnected ? wallet.address : null,
    wallet_verified: walletVerified,
    credentials: credentials.map((vc) => ({ id: vc.id, type: vc.vc_type, issued_at: vc.issued_at })),
    server_did: SERVER_DID,
    is_fully_authenticated: hasDid && walletVerified && credentials.length > 0,
    auth_steps: {
      '1_registered': true,
      '2_wallet_connected': walletConnected,
      '3_wallet_verified': walletVerified,
      '4_did_created': hasDid,
      '5_vc_issued': credentials.length > 0,
    },
  });
});

module.exports = router;
