const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const fabricService = require('../services/fabricBridge');
const membershipService = require('../services/membershipService');
const notificationService = require('../services/notificationService');

const router = express.Router();
let _pool;

function setPool(pool) {
  _pool = pool;
}

const TIER_LIMITS = {
  '베이직': { raffle: 1, nft: 1 },
  '브론즈': { raffle: 1, nft: 1 },
  '실버':   { raffle: 2, nft: 1 },
  '골드':   { raffle: 2, nft: 2 },
};

async function getMonthlyCount(userId, actionType) {
  if (actionType !== 'RAFFLE_PURCHASE') {
    const [[row]] = await _pool.query(
      `SELECT COUNT(*) AS cnt
         FROM onchain_tx_logs
        WHERE user_id = ? AND action_type = ?
          AND YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())`,
      [userId, actionType],
    );
    return Number(row?.cnt ?? 0);
  }

  const [[row]] = await _pool.query(
    `SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.count')) AS UNSIGNED)), 0) AS cnt
       FROM onchain_tx_logs
      WHERE user_id = ? AND action_type = ?
        AND YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())`,
    [userId, actionType],
  );
  return Number(row?.cnt ?? 0);
}

async function getTier(userId) {
  const membership = await membershipService.getUserMembership(_pool, userId);
  return membership.joined ? membership.tier : null;
}

router.get('/status', requireAuth, async (req, res) => {
  try {
    const tier = await getTier(req.user.user_id);
    const limits = tier ? (TIER_LIMITS[tier] || TIER_LIMITS['베이직']) : { raffle: 0, nft: 0 };
    const [raffleUsed, nftUsed] = await Promise.all([
      getMonthlyCount(req.user.user_id, 'RAFFLE_PURCHASE'),
      getMonthlyCount(req.user.user_id, 'NFT_EXCHANGE_REQUESTED'),
    ]);

    res.json({
      success: true,
      tier,
      limits,
      used: { raffle: raffleUsed, nft: nftUsed },
      remaining: {
        raffle: Math.max(0, limits.raffle - raffleUsed),
        nft: Math.max(0, limits.nft - nftUsed),
      },
    });
  } catch (err) {
    console.error('[exchange/status]', err);
    res.status(500).json({ error: '교환소 상태 조회 실패' });
  }
});

router.post('/buy-raffle', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  const count = Math.max(1, Number(req.body.count || 1));
  const walletAddress = String(req.body.walletAddress || '').trim();

  if (!walletAddress) return res.status(400).json({ error: '지갑 주소가 필요합니다.' });
  if (![1, 2, 3].includes(count)) return res.status(400).json({ error: '올바른 수량이 아닙니다.' });

  try {
    const [[wallet]] = await _pool.query(
      `SELECT wallet_address FROM user_wallets WHERE user_id = ? AND LOWER(wallet_address) = LOWER(?)`,
      [userId, walletAddress],
    );
    if (!wallet) return res.status(400).json({ error: '현재 계정에 연결된 지갑으로만 교환할 수 있습니다.' });

    const tier = await getTier(userId);
    if (!tier) return res.status(400).json({ error: '멤버십 가입 후 응모권을 교환할 수 있습니다.' });
    const limits = TIER_LIMITS[tier] || TIER_LIMITS['베이직'];
    const used = await getMonthlyCount(userId, 'RAFFLE_PURCHASE');
    if (used + count > limits.raffle) {
      return res.status(400).json({
        error: `이번 달 응모권 교환 한도를 초과합니다. (${tier} 등급: 월 ${limits.raffle}장)`,
      });
    }

    const userDidHash = fabricService.hashDid(walletAddress);
    let lastResult = null;
    const issued = [];
    for (let i = 0; i < count; i += 1) {
      lastResult = await fabricService.exchangePointItem({ userDidHash, itemType: 'RAFFLE_NFT' });
      const raffleNftId = uuidv4();
      await fabricService.registerRaffleNFT({ raffleNftId, userDidHash, gameId: '' });
      await _pool.query(
        `INSERT INTO raffle_nfts
           (id, user_id, wallet_address, user_did_hash, status, source, expires_at)
         VALUES (?, ?, ?, ?, 'ISSUED', 'POINT_EXCHANGE', ?)`,
        [raffleNftId, userId, walletAddress, userDidHash, membershipService.addDays(new Date(), 60)],
      );
      issued.push(raffleNftId);
    }

    await _pool.query(
      `INSERT INTO onchain_tx_logs (id, user_id, wallet_address, action_type, tx_hash, payload_json)
       VALUES (?, ?, ?, 'RAFFLE_PURCHASE', ?, ?)`,
      [uuidv4(), userId, walletAddress, lastResult?.txId || uuidv4(), JSON.stringify({ count, tier, raffleNftIds: issued })],
    );
    await _pool.query(
      `INSERT INTO fabric_events (id, event_name, user_did_hash, payload_json, fabric_tx_id)
       VALUES (?, 'RAFFLE_NFT_MINT_REQUESTED', ?, ?, ?)`,
      [uuidv4(), userDidHash, JSON.stringify({ count, raffleNftIds: issued, pointUsed: count * 1500 }), lastResult?.txId || null],
    );

    await membershipService.recordPointEvent(_pool, {
      userId,
      walletAddress,
      eventType: 'POINT_EXCHANGE_RAFFLE',
      reason: '응모권 교환',
      amount: -Math.abs(Number(lastResult?.pointUsed || 1500) * count),
      metadata: { count, raffleNftIds: issued },
    });
    await notificationService.recordNotification(_pool, {
      userId,
      category: 'RAFFLE',
      title: '응모권 획득',
      message: `포인트 교환으로 응모권 NFT ${count}장이 지급되었습니다.`,
      amount: count,
      metadata: { raffleNftIds: issued },
    });

    const [[row]] = await _pool.query(
      `SELECT COUNT(*) AS cnt
         FROM raffle_nfts
        WHERE user_id = ? AND status = 'ISSUED'
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId],
    );

    res.json({
      success: true,
      newCount: Number(row?.cnt ?? issued.length),
      raffleNftIds: issued,
      remainingBalance: lastResult?.remainingBalance,
      remaining: Math.max(0, limits.raffle - used - count),
    });
  } catch (err) {
    console.error('[exchange/buy-raffle]', err);
    res.status(400).json({ error: err.message || '응모권 교환 실패' });
  }
});

module.exports = { router, setPool };
