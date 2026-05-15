'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const fabricService  = require('../services/fabricBridge');

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
    res.json({ success: true, data: point });
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
            `INSERT INTO raffle_nfts (id, user_id, wallet_address, user_did_hash, status)
             VALUES (?, ?, ?, ?, 'ISSUED')`,
            [raffleNftId, wallet.user_id, walletAddress, userDidHash]
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

// GET /api/points/events  (디버그용: mock 이벤트 로그 전체)
router.get('/events', async (req, res) => {
  try {
    const events = await fabricService.getEvents();
    res.json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, setPool };
