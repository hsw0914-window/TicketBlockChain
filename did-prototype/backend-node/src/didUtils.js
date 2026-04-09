// didUtils.js — DID/VC/VP 핵심 유틸리티
//
// DID Method : did:pkh:eip155:1:0x{address} (MetaMask Ethereum 주소 기반)
// VC 서명    : HS256 JWT (프로토타입용)
// 서명 검증  : ethers.verifyMessage (MetaMask personal_sign 호환)
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const _VC_SECRET = process.env.VC_SECRET || 'vc-signing-secret-prototype-change-in-production';
const SERVER_DID = 'did:pkh:eip155:1:0xSERVER0000000000000000000000000000000000';

// ── DID 생성 ──────────────────────────────────────────────

// Ethereum 주소 → did:pkh:eip155:1:0x{checksum address}
function addressToDid(address) {
  return `did:pkh:eip155:1:${ethers.getAddress(address)}`;
}

// W3C DID Document 생성 (did:pkh/eip155 스펙)
function createDidDocument(did) {
  const keyId = `${did}#blockchainAccountId`;
  const address = did.split(':').pop();
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/secp256k1recovery-2020/v2',
    ],
    id: did,
    verificationMethod: [{
      id: keyId,
      type: 'EcdsaSecp256k1RecoveryMethod2020',
      controller: did,
      blockchainAccountId: `eip155:1:${address}`,
    }],
    authentication: [keyId],
    assertionMethod: [keyId],
  };
}

// ── MetaMask 서명 검증 ────────────────────────────────────

// MetaMask personal_sign 서명 검증
// ethers.verifyMessage가 "\x19Ethereum Signed Message:\n" prefix를 자동 처리
function verifyEthSignature(message, signature, expectedAddress) {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

// ── VC 발급 ───────────────────────────────────────────────

function issueVc(subjectDid, vcType, claims) {
  const now = Math.floor(Date.now() / 1000);
  const vcId = `urn:uuid:${crypto
    .createHash('sha256')
    .update(`${SERVER_DID}${subjectDid}${now}${vcType}`)
    .digest('hex')
    .slice(0, 32)}`;

  const vcJson = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    id: vcId,
    type: ['VerifiableCredential', vcType],
    issuer: SERVER_DID,
    issuanceDate: new Date().toISOString(),
    credentialSubject: { id: subjectDid, ...claims },
  };

  const vcJwt = jwt.sign(
    { iss: SERVER_DID, sub: subjectDid, iat: now, exp: now + 365 * 24 * 3600, jti: vcId, vc: vcJson },
    _VC_SECRET,
    { algorithm: 'HS256' }
  );

  return { vcJwt, vcJson };
}

// ── VC 검증 ───────────────────────────────────────────────

function verifyVc(vcJwt) {
  try {
    const payload = jwt.verify(vcJwt, _VC_SECRET, { algorithms: ['HS256'] });
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// ── VP 검증 ───────────────────────────────────────────────

function verifyVp(vpJson, signature, walletAddress) {
  const vpCanonical = JSON.stringify(vpJson, Object.keys(vpJson).sort());
  const sigValid = verifyEthSignature(vpCanonical, signature, walletAddress);
  if (!sigValid) {
    return { valid: false, error: 'VP 서명이 유효하지 않습니다.', signatureValid: false };
  }

  const vcResults = (vpJson.verifiableCredential || []).map(verifyVc);
  return {
    valid: vcResults.every((r) => r.valid),
    signatureValid: true,
    vcCount: vcResults.length,
    vcResults,
    holder: vpJson.holder,
  };
}

module.exports = { SERVER_DID, addressToDid, createDidDocument, verifyEthSignature, issueVc, verifyVc, verifyVp };
