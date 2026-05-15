'use strict';
const express  = require('express');
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fabricService = require('../services/fabricBridge');
const nftBridge     = require('../services/nftBridgeAdapter');

const router = express.Router();
let _pool;
function setPool(pool) { _pool = pool; }

const QR_SECRET = process.env.QR_SECRET || 'base-chain-qr-secret-2026';

function getCurrentSlot() {
  return Math.floor(Date.now() / 1000 / 60);
}

function generateQRToken(ticketId, slot) {
  return crypto
    .createHmac('sha256', QR_SECRET)
    .update(`${ticketId}:${slot}`)
    .digest('hex')
    .slice(0, 32);
}

// 현재 슬롯 + 이전 슬롯 둘 다 허용 (슬롯 경계 타이밍 대응)
function isValidQRToken(ticketId, token) {
  const slot = getCurrentSlot();
  return token === generateQRToken(ticketId, slot) ||
         token === generateQRToken(ticketId, slot - 1);
}

// POST /api/entry/verify
// Body: { ticketId, qrToken, gateId? }
router.post('/verify', async (req, res) => {
  try {
    const { ticketId, qrToken, gateId } = req.body;

    if (!ticketId || !qrToken) {
      return res.status(400).json({ allowed: false, reason: 'MISSING_PARAMS' });
    }

    // 1. QR 토큰 유효성 검증
    if (!isValidQRToken(ticketId, qrToken)) {
      return res.json({ allowed: false, reason: 'INVALID_QR_TOKEN' });
    }

    // 2. DB에서 티켓 + 경기 정보 조회
    const [[ticket]] = await _pool.query(
      `SELECT t.*, g.game_date, g.game_time, g.status AS game_status
       FROM tickets t
       LEFT JOIN games g ON t.game_id = g.id
       WHERE t.id = ?`,
      [ticketId]
    );

    if (!ticket) {
      return res.json({ allowed: false, reason: 'TICKET_NOT_FOUND' });
    }
    if (ticket.status === 'used') {
      return res.json({ allowed: false, reason: 'ALREADY_USED' });
    }
    if (ticket.status !== 'confirmed') {
      return res.json({ allowed: false, reason: `INVALID_STATUS:${ticket.status}` });
    }

    // 3. NFT 소유권 확인 (Phase 1: mock → 항상 true)
    const isOwner = await nftBridge.checkNftOwner(ticket.token_id, ticket.wallet_address);
    if (!isOwner) {
      return res.json({ allowed: false, reason: 'NOT_NFT_OWNER' });
    }

    // 4. Fabric 입장 처리 (mock in-memory)
    // 서버 재시작으로 mock 스토어가 비어있을 경우 DB 기반으로 자동 재등록
    let fabricResult = await fabricService.verifyEntry({
      ticketId,
      tokenId:       ticket.token_id || '0',
      walletAddress: ticket.wallet_address,
      gateId:        gateId || 'GATE_DEFAULT',
    });

    if (!fabricResult.allowed && fabricResult.reason === 'TICKET_NOT_FOUND') {
      try {
        const gameDateStr = ticket.game_date instanceof Date
          ? ticket.game_date.toISOString().split('T')[0]
          : String(ticket.game_date || '').split('T')[0];
        await fabricService.registerTicket({
          ticketId,
          tokenId:      ticket.token_id || '0',
          gameId:       String(ticket.game_id),
          seatId:       `${ticket.block}-${ticket.row_num}-${ticket.seat_number}`,
          walletAddress: ticket.wallet_address,
          price:        Number(ticket.price),
          purchaseType: ticket.purchase_type || 'PRIMARY',
          gameDate:     gameDateStr,
        });
        fabricResult = await fabricService.verifyEntry({
          ticketId,
          tokenId:       ticket.token_id || '0',
          walletAddress: ticket.wallet_address,
          gateId:        gateId || 'GATE_DEFAULT',
        });
      } catch (reRegErr) {
        console.error('[entryRoutes] Fabric 재등록 실패:', reRegErr.message);
      }
    }

    if (!fabricResult.allowed) {
      return res.json({ allowed: false, reason: fabricResult.reason });
    }

    // 5. MySQL 상태 업데이트
    await _pool.query(
      "UPDATE tickets SET status = 'used' WHERE id = ?",
      [ticketId]
    );

    // 6. fabric_events 로그 기록
    await _pool.query(
      `INSERT INTO fabric_events
         (id, event_name, ticket_id, game_id, user_did_hash, payload_json, fabric_tx_id)
       VALUES (?, 'ENTRY_VERIFIED', ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        ticketId,
        ticket.game_id,
        fabricService.hashDid(ticket.wallet_address),
        JSON.stringify({
          gateId:  gateId || 'GATE_DEFAULT',
          entryId: fabricResult.entryId,
        }),
        fabricResult.txId,
      ]
    );

    return res.json({
      allowed:         true,
      ticketId,
      earnedPoint:     fabricResult.earnedPoint,
      membershipGrade: fabricResult.membershipGrade,
      entryId:         fabricResult.entryId,
      walletAddress:   ticket.wallet_address,
    });

  } catch (err) {
    console.error('[entryRoutes] verify error:', err);
    res.status(500).json({ allowed: false, reason: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = { router, setPool };
