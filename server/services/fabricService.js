'use strict';
/**
 * fabricService.js  —  Phase 2: 실제 Hyperledger Fabric SDK 연동
 *
 * Phase 1 (mock):   FABRIC_MODE=mock  → fabricBridge.js가 mockFabricService 반환
 * Phase 2 (real):   FABRIC_MODE=real  → fabricBridge.js가 이 파일 반환
 */

const { Wallets, Gateway } = require('fabric-network');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const channelName   = 'channel1';
const chaincodeName = 'ticket';

const ccpPath    = path.resolve(__dirname, '../../fabric/application/connection-org1.json');
const walletPath = path.join(__dirname,    '../../fabric/wallet');

function hashDid(walletAddress) {
  return crypto.createHash('sha256').update(walletAddress.toLowerCase()).digest('hex');
}

async function getGateway() {
  const ccp    = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
  const wallet = await Wallets.newFileSystemWallet(walletPath);
  const gateway = new Gateway();
  await gateway.connect(ccp, {
    wallet,
    identity:  'appUser',
    discovery: { enabled: true, asLocalhost: false },
  });
  return gateway;
}

async function submitTx(func, ...args) {
  const gateway = await getGateway();
  try {
    const network  = await gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);
    const result   = await contract.submitTransaction(func, ...args.map(String));
    return result ? result.toString() : '';
  } finally {
    gateway.disconnect();
  }
}

async function evaluateTx(func, ...args) {
  const gateway = await getGateway();
  try {
    const network  = await gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);
    const result   = await contract.evaluateTransaction(func, ...args.map(String));
    return result ? result.toString() : '';
  } finally {
    gateway.disconnect();
  }
}

// ─── 1. RegisterTicket ────────────────────────────────────
async function registerTicket({ ticketId, tokenId, gameId, seatId, walletAddress, price, purchaseType, gameDate }) {
  await submitTx(
    'RegisterTicket',
    ticketId,
    String(tokenId || '0'),
    gameId,
    seatId,
    walletAddress,
    purchaseType || 'PRIMARY',
    gameDate     || '',
    String(price),
  );
  return { success: true, txId: 'fabric-tx' };
}

// ─── 2. VerifyEntry ──────────────────────────────────────
async function verifyEntry({ ticketId, gateId }) {
  const raw = await submitTx('VerifyEntry', ticketId, gateId || 'GATE_DEFAULT');
  return JSON.parse(raw);
}

// ─── 3. EarnPointByEntry ─────────────────────────────────
async function earnPointByEntry({ userDidHash, price }) {
  const raw = await submitTx('EarnPointByEntry', userDidHash, String(price));
  return JSON.parse(raw);
}

// ─── 4. UpdateMembershipGrade ────────────────────────────
async function updateMembershipGrade({ userDidHash }) {
  const raw = await submitTx('UpdateMembershipGrade', userDidHash);
  return JSON.parse(raw);
}

// ─── 5. UsePointForTicket ────────────────────────────────
async function usePointForTicket({ userDidHash, ticketId, pointAmount }) {
  await submitTx('UsePointForTicket', userDidHash, ticketId || '', String(pointAmount));
  return { success: true };
}

// ─── 6. ExchangePointItem ────────────────────────────────
async function exchangePointItem({ userDidHash, itemType }) {
  const raw = await submitTx('ExchangePointItem', userDidHash, itemType);
  return JSON.parse(raw);
}

// ─── 7. RequestRefund ────────────────────────────────────
async function requestRefund({ ticketId, refundReason }) {
  const raw = await submitTx('RequestRefund', ticketId, refundReason || '사용자 요청');
  return JSON.parse(raw);
}

// ─── 8. CompleteRefund ───────────────────────────────────
async function completeRefund({ refundId, ticketId }) {
  await submitTx('CompleteRefund', refundId, ticketId);
  return { success: true, refundId };
}

// ─── 9. CancelGameRefundAll ──────────────────────────────
// 경기 취소 시 전체 티켓 환불: Fabric에서 범위 조회 후 루프
async function cancelGameRefundAll({ gameId }) {
  // Phase 2: 서버 측에서 DB 티켓 목록 받아 개별 RequestRefund 호출
  // raffleRoutes/settlementRoutes에서 티켓 목록을 조회해 개별 호출하는 방식으로 처리
  throw new Error('cancelGameRefundAll: 호출자에서 티켓별 requestRefund를 개별 호출하세요');
}

// ─── 10. CreateSettlement ────────────────────────────────
async function createSettlement({ gameId, totalSales, refundAmount, pointUsedAmount }) {
  const raw = await submitTx(
    'CreateSettlement',
    gameId,
    String(totalSales    || 0),
    String(refundAmount  || 0),
    String(pointUsedAmount || 0),
  );
  return JSON.parse(raw);
}

// ─── 11. EarnPointFromTrade ──────────────────────────────
async function earnPointFromTrade({ userDidHash, amount, rate }) {
  const raw = await submitTx('EarnPointFromTrade', userDidHash, String(amount), String(rate));
  return JSON.parse(raw);
}

// ─── 조회 함수 ────────────────────────────────────────────

async function getTicket({ ticketId }) {
  const raw = await evaluateTx('GetTicket', ticketId);
  return JSON.parse(raw);
}

async function getPointBalance({ userDidHash }) {
  const raw = await evaluateTx('GetPointBalance', userDidHash);
  return JSON.parse(raw);
}

async function getMembership({ userDidHash }) {
  const raw = await evaluateTx('GetMembership', userDidHash);
  return JSON.parse(raw);
}

async function getEvents() {
  return [];
}

// ─── Raffle / Draw / Reservation ─────────────────────────

async function registerRaffleNFT({ raffleNftId, userDidHash, gameId }) {
  await submitTx('RegisterRaffleNFT', raffleNftId, userDidHash, gameId || '');
  return { success: true, raffleNftId };
}

async function enterDraw({ raffleNftId, userDidHash, drawId }) {
  await submitTx('EnterDraw', raffleNftId, userDidHash, drawId);
  return { success: true };
}

async function createDraw({ drawId, gameId, winnerCount }) {
  await submitTx('CreateDraw', drawId, gameId, String(winnerCount || 10));
  return { success: true, drawId };
}

async function executeDraw({ drawId, entryIds }) {
  // Go 체인코드 ExecuteDraw(drawId, entryIdsJSON)
  const raw = await submitTx('ExecuteDraw', drawId, JSON.stringify(entryIds || []));
  return JSON.parse(raw);
}

async function useRaffleNFT({ raffleNftId, userDidHash, ticketId }) {
  await submitTx('UseRaffleNFT', raffleNftId, userDidHash, ticketId || '');
  return { success: true };
}

async function createReservation({ reservationId, userDidHash, gameId, raffleNftId, isPriority }) {
  await submitTx(
    'CreateReservation',
    reservationId,
    userDidHash,
    gameId,
    raffleNftId  || '',
    String(!!isPriority),
  );
  return { success: true, reservationId };
}

async function confirmReservation({ reservationId, ticketId }) {
  await submitTx('ConfirmReservation', reservationId, ticketId || '');
  return { success: true };
}

async function cancelReservation({ reservationId }) {
  await submitTx('CancelReservation', reservationId);
  return { success: true };
}

async function mapTicketNFT({ ticketId, tokenId, walletAddress }) {
  await submitTx('MapTicketNFT', ticketId, String(tokenId), walletAddress);
  return { success: true };
}

async function getRaffleNFT({ raffleNftId }) {
  const raw = await evaluateTx('GetRaffleNFT', raffleNftId);
  return JSON.parse(raw);
}

async function getUserRaffleNFTs({ userDidHash }) {
  const raw = await evaluateTx('GetUserRaffleNFTs', userDidHash);
  return JSON.parse(raw);
}

async function getDraw({ drawId }) {
  const raw = await evaluateTx('GetDraw', drawId);
  return JSON.parse(raw);
}

async function getAllDraws() {
  const raw = await evaluateTx('GetAllDraws');
  return JSON.parse(raw);
}

// seedUser는 mock 전용 — real Fabric에서는 불필요
function seedUser() {}

module.exports = {
  hashDid,
  registerTicket,
  verifyEntry,
  earnPointByEntry,
  updateMembershipGrade,
  usePointForTicket,
  exchangePointItem,
  requestRefund,
  completeRefund,
  cancelGameRefundAll,
  createSettlement,
  earnPointFromTrade,
  getTicket,
  getPointBalance,
  getMembership,
  getEvents,
  registerRaffleNFT,
  enterDraw,
  createDraw,
  executeDraw,
  useRaffleNFT,
  createReservation,
  confirmReservation,
  cancelReservation,
  mapTicketNFT,
  getRaffleNFT,
  getUserRaffleNFTs,
  getDraw,
  getAllDraws,
  seedUser,
};
