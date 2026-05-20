'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const fabricService  = require('../services/fabricBridge');
const membershipService = require('../services/membershipService');

const router = express.Router();
let _pool;
function setPool(pool) { _pool = pool; }

// GET /api/points?walletAddress=0x...
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { walletAddress } = req.query;
    if (!walletAddress) return res.status(400).json({ error: 'walletAddress 필요' });

    const userDidHash = fabricService.hashDid(walletAddress);
    const point = await fabricService.getPointBalance({ userDidHash });
    const membership = req.user?.user_id
      ? await membershipService.getUserMembership(_pool, req.user.user_id)
      : { joined: true };
    res.json({
      success: true,
      data: membership.joined ? point : { ...point, balance: 0, totalEarned: 0, totalUsed: 0 },
      membershipJoined: membership.joined,
    });
  } catch (err) {
    console.error('[pointRoutes] GET /:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/points/membership?walletAddress=0x...
router.get('/membership', optionalAuth, async (req, res) => {
  try {
    const { walletAddress } = req.query;
    if (!walletAddress) return res.status(400).json({ error: 'walletAddress 필요' });

    const userDidHash = fabricService.hashDid(walletAddress);
    const membership = await fabricService.getMembership({ userDidHash });
    res.json({ success: true, data: membership });
  } catch (err) {
    console.error('[pointRoutes] GET /membership:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/points/use
// Body: { walletAddress, ticketId?, pointAmount }
router.post('/use', requireAuth, async (req, res) => {
  try {
    const { walletAddress, ticketId, pointAmount } = req.body;
    if (!walletAddress || !pointAmount) {
      return res.status(400).json({ error: '필수 항목 누락 (walletAddress, pointAmount)' });
    }

    const userDidHash = fabricService.hashDid(walletAddress);
    const result = await fabricService.usePointForTicket({
      userDidHash,
      ticketId: ticketId || null,
      pointAmount: Number(pointAmount),
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[pointRoutes] POST /use:', err);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/points/exchange
// Body: { walletAddress, itemType: 'RAFFLE_NFT' | 'CARD_NFT' }
router.post('/exchange', requireAuth, async (req, res) => {
  try {
    const { walletAddress, itemType } = req.body;
    if (!walletAddress || !itemType) {
      return res.status(400).json({ error: '필수 항목 누락 (walletAddress, itemType)' });
    }

    const userDidHash = fabricService.hashDid(walletAddress);
    const result = await fabricService.exchangePointItem({ userDidHash, itemType });

    // fabric_events 로그
    await _pool.query(
      `INSERT INTO fabric_events
         (id, event_name, user_did_hash, payload_json, fabric_tx_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        itemType === 'RAFFLE_NFT' ? 'RAFFLE_NFT_MINT_REQUESTED' : 'CARD_NFT_MINT_REQUESTED',
        userDidHash,
        JSON.stringify({
          exchangeId: result.exchangeId,
          itemType,
          pointUsed: result.pointUsed,
          remainingBalance: result.remainingBalance,
        }),
        result.txId,
      ]
    );

    // RAFFLE_NFT 교환 시 → Fabric 등록 + DB raffle_nfts 저장
    if (itemType === 'RAFFLE_NFT') {
      try {
        const [[wallet]] = await _pool.query(
          'SELECT user_id FROM user_wallets WHERE wallet_address = ?',
          [walletAddress]
        );
        if (wallet) {
          const raffleNftId = uuidv4();
          await fabricService.registerRaffleNFT({ raffleNftId, userDidHash, gameId: '' });
          await _pool.query(
            `INSERT INTO raffle_nfts
               (id, user_id, wallet_address, user_did_hash, status, source, expires_at)
             VALUES (?, ?, ?, ?, 'ISSUED', 'POINT_EXCHANGE', ?)`,
            [raffleNftId, wallet.user_id, walletAddress, userDidHash, membershipService.addDays(new Date(), 60)]
          );
          result.raffleNftId = raffleNftId;
        }
      } catch (raffleErr) {
        console.error('[pointRoutes] RAFFLE_NFT 등록 실패 (무시):', raffleErr.message);
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[pointRoutes] POST /exchange:', err);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/points/events — 최근 포인트 적립 알림
router.get('/events', requireAuth, async (req, res) => {
  try {
    const [rows] = await _pool.query(
      `SELECT id, event_type, reason, amount, metadata_json, read_at,
              DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s+09:00') AS created_at
         FROM point_events
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 10`,
      [req.user.user_id],
    );
    const [[unread]] = await _pool.query(
      `SELECT COUNT(*) AS cnt FROM point_events WHERE user_id = ? AND read_at IS NULL`,
      [req.user.user_id],
    );
    res.json({ success: true, data: rows, unreadCount: Number(unread?.cnt ?? 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/events/read', requireAuth, async (req, res) => {
  try {
    await _pool.query(
      `UPDATE point_events SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL`,
      [req.user.user_id],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, setPool };
