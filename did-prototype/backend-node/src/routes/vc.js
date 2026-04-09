// routes/vc.js — VC 발급 / 검증 / VP 생성·검증
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { issueVc, verifyVc, verifyVp } = require('../didUtils');

const router = express.Router();

const VC_DEFINITIONS = {
  VerifiedUserCredential: {
    requiresVerifiedWallet: false,
    claimsFactory: (user) => ({ email: user.email, emailVerified: true }),
  },
  WalletLinkedCredential: {
    requiresVerifiedWallet: true,
    claimsFactory: (user, wallet) => ({
      walletAddress: wallet?.address ?? null,
      walletVerified: Boolean(wallet?.is_verified),
    }),
  },
};

// POST /vc/issue
router.post('/issue', requireAuth, (req, res) => {
  const { vc_type } = req.body;
  const didDoc = db.prepare('SELECT * FROM did_documents WHERE user_id = ?').get(req.user.id);
  if (!didDoc) return res.status(400).json({ error: '먼저 DID를 생성해주세요. (/did/create)' });

  const vcDef = VC_DEFINITIONS[vc_type];
  if (!vcDef) return res.status(400).json({ error: `지원하지 않는 VC 타입: ${vc_type}`, supported: Object.keys(VC_DEFINITIONS) });

  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
  if (vcDef.requiresVerifiedWallet && (!wallet || !wallet.is_verified)) {
    return res.status(400).json({ error: '이 VC를 발급받으려면 지갑 서명 검증이 완료되어야 합니다.' });
  }

  const existing = db.prepare('SELECT * FROM verifiable_credentials WHERE user_id = ? AND vc_type = ? AND is_revoked = 0').get(req.user.id, vc_type);
  if (existing) {
    return res.json({ message: `이미 ${vc_type}이 발급되어 있습니다.`, vc_id: existing.id, vc_jwt: existing.vc_jwt, vc_json: JSON.parse(existing.vc_json), already_exists: true });
  }

  const { vcJwt, vcJson } = issueVc(didDoc.did, vc_type, vcDef.claimsFactory(req.user, wallet));
  const { lastInsertRowid: vcId } = db
    .prepare('INSERT INTO verifiable_credentials (user_id, vc_type, vc_jwt, vc_json) VALUES (?, ?, ?, ?)')
    .run(req.user.id, vc_type, vcJwt, JSON.stringify(vcJson));

  res.json({ message: `${vc_type} 발급 완료!`, vc_id: vcId, vc_jwt: vcJwt, vc_json: vcJson, already_exists: false });
});

// GET /vc/list
router.get('/list', requireAuth, (req, res) => {
  const vcs = db.prepare('SELECT * FROM verifiable_credentials WHERE user_id = ? AND is_revoked = 0').all(req.user.id);
  res.json(vcs.map((vc) => ({ id: vc.id, type: vc.vc_type, vc_jwt: vc.vc_jwt, vc_json: JSON.parse(vc.vc_json), issued_at: vc.issued_at })));
});

// POST /vc/verify-vc
router.post('/verify-vc', requireAuth, (req, res) => {
  const { vc_jwt } = req.body;
  if (!vc_jwt) return res.status(400).json({ error: 'vc_jwt가 필요합니다.' });
  const result = verifyVc(vc_jwt);
  if (result.valid) {
    const vcData = result.payload.vc || {};
    return res.json({ valid: true, message: 'VC가 유효합니다.', vc_type: vcData.type, issuer: vcData.issuer, subject: vcData.credentialSubject?.id, issued_at: vcData.issuanceDate });
  }
  res.json({ valid: false, message: 'VC가 유효하지 않습니다.', error: result.error });
});

// POST /vc/create-vp — VP 생성 (반환된 vp_string을 MetaMask로 서명)
router.post('/create-vp', requireAuth, (req, res) => {
  const { vc_ids } = req.body;
  if (!Array.isArray(vc_ids) || vc_ids.length === 0) return res.status(400).json({ error: 'vc_ids 배열이 필요합니다.' });

  const didDoc = db.prepare('SELECT * FROM did_documents WHERE user_id = ?').get(req.user.id);
  if (!didDoc) return res.status(400).json({ error: 'DID가 없습니다.' });

  const placeholders = vc_ids.map(() => '?').join(',');
  const vcs = db.prepare(`SELECT * FROM verifiable_credentials WHERE id IN (${placeholders}) AND user_id = ? AND is_revoked = 0`).all(...vc_ids, req.user.id);
  if (!vcs.length) return res.status(400).json({ error: '선택한 VC가 없거나 유효하지 않습니다.' });

  const vp = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiablePresentation'],
    holder: didDoc.did,
    verifiableCredential: vcs.map((vc) => vc.vc_jwt),
  };

  res.json({ message: 'VP가 생성되었습니다. vp_string을 MetaMask로 서명해주세요.', vp, vp_string: JSON.stringify(vp, Object.keys(vp).sort()) });
});

// POST /vc/verify-vp
router.post('/verify-vp', requireAuth, (req, res) => {
  const { vp, signature } = req.body;
  if (!vp || !signature) return res.status(400).json({ error: 'vp와 signature가 필요합니다.' });

  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
  if (!wallet) return res.status(400).json({ error: '지갑이 연결되어 있지 않습니다.' });

  const result = verifyVp(vp, signature, wallet.address);
  if (result.valid) {
    return res.json({ valid: true, message: 'VP 검증 성공! 이 사용자는 DID 인증 완료 상태입니다.', holder: result.holder, vc_count: result.vcCount, vc_results: result.vcResults });
  }
  res.json({ valid: false, message: 'VP 검증 실패', error: result.error, signature_valid: result.signatureValid });
});

module.exports = router;
