const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
let _pool;

function setPool(pool) { _pool = pool; }

// 티어별 월 교환 제한
const TIER_LIMITS = {
  '일반':   { raffle: 1, nft: 1 },
  '브론즈': { raffle: 1, nft: 1 },
  '실버':   { raffle: 2, nft: 1 },
  '골드':   { raffle: 2, nft: 2 },
};

// 이번 달 교환 횟수 조회 헬퍼
// RAFFLE_PURCHASE는 payload의 count 합산, 나머지는 건수 카운트
async function getMonthlyCount(userId, actionType) {
  if (actionType === 'RAFFLE_PURCHASE') {
    const [[row]] = await _pool.query(
      `SELECT COALESCE(SUM(JSON_EXTRACT(payload_json, '$.count')), 0) AS cnt
       FROM onchain_tx_logs
       WHERE user_id = ? AND action_type = ?
         AND YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())`,
      [userId, actionType]
    );
    return Number(row.cnt);
  }
  const [[row]] = await _pool.query(
    `SELECT COUNT(*) AS cnt FROM onchain_tx_logs
     WHERE user_id = ? AND action_type = ?
       AND YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())`,
    [userId, actionType]
  );
  return Number(row.cnt);
}

// GET /api/exchange/status — 티어 + 이번 달 사용량 조회
router.get('/status', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  try {
    const [[user]] = await _pool.query('SELECT membership_tier FROM users WHERE user_id = ?', [userId]);
    const tier = user?.membership_tier ?? '일반';
    const limits = TIER_LIMITS[tier] ?? TIER_LIMITS['일반'];

    const [nftCount, raffleCount] = await Promise.all([
      getMonthlyCount(userId, 'NFT_EXCHANGE_REQUESTED'),
      getMonthlyCount(userId, 'RAFFLE_PURCHASE'),
    ]);

    res.json({
      success: true,
      tier,
      limits,
      used: { nft: nftCount, raffle: raffleCount },
      remaining: {
        nft: Math.max(0, limits.nft - nftCount),
        raffle: Math.max(0, limits.raffle - raffleCount),
      },
    });
  } catch (err) {
    console.error('[exchange/status]', err);
    res.status(500).json({ error: '상태 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/exchange/nft — NFT 카드 실물 교환 신청
router.post('/nft', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  const { cardId, delivery } = req.body;

  if (!cardId) return res.status(400).json({ error: '카드 ID가 필요합니다.' });

  try {
    const [[user]] = await _pool.query('SELECT membership_tier FROM users WHERE user_id = ?', [userId]);
    const tier = user?.membership_tier ?? '일반';
    const limits = TIER_LIMITS[tier] ?? TIER_LIMITS['일반'];
    const used = await getMonthlyCount(userId, 'NFT_EXCHANGE_REQUESTED');

    if (used >= limits.nft) {
      return res.status(400).json({
        error: `이번 달 실물 NFT 교환 횟수를 초과했습니다. (${tier} 등급: 월 ${limits.nft}회)`,
      });
    }

    const [[card]] = await _pool.query(
      `SELECT uc.id, uc.nft_id, uc.display_name, ct.name AS card_type_name
       FROM user_cards uc
       JOIN card_types ct ON ct.id = uc.card_type_id
       WHERE uc.id = ? AND uc.user_id = ?`,
      [cardId, userId]
    );

    if (!card) return res.status(404).json({ error: '카드를 찾을 수 없거나 권한이 없습니다.' });

    await _pool.query('DELETE FROM user_cards WHERE id = ? AND user_id = ?', [cardId, userId]);

    await _pool.query(
      `INSERT INTO onchain_tx_logs (id, user_id, wallet_address, action_type, tx_hash, payload_json)
       VALUES (UUID(), ?, '', 'NFT_EXCHANGE_REQUESTED', UUID(), ?)`,
      [userId, JSON.stringify({ cardId, nftId: card.nft_id, name: card.display_name || card.card_type_name, tier, delivery: delivery ?? null })]
    );

    res.json({
      success: true,
      message: `${card.display_name || card.card_type_name} 교환 신청이 완료되었습니다.`,
      remaining: Math.max(0, limits.nft - used - 1),
    });
  } catch (err) {
    console.error('[exchange/nft]', err);
    res.status(500).json({ error: '교환 신청 중 서버 오류가 발생했습니다.' });
  }
});

// POST /api/exchange/buy-raffle — 포인트로 응모권 구매
router.post('/buy-raffle', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  const { count } = req.body;

  const VALID_COUNTS = [1, 2, 3];
  if (!VALID_COUNTS.includes(Number(count))) {
    return res.status(400).json({ error: '올바른 수량이 아닙니다. (1, 2, 3장 중 선택)' });
  }

  try {
    const [[user]] = await _pool.query('SELECT membership_tier FROM users WHERE user_id = ?', [userId]);
    const tier = user?.membership_tier ?? '일반';
    const limits = TIER_LIMITS[tier] ?? TIER_LIMITS['일반'];
    const used = await getMonthlyCount(userId, 'RAFFLE_PURCHASE');

    if (used + count > limits.raffle) {
      return res.status(400).json({
        error: `이번 달 응모권 교환 한도를 초과합니다. (${tier} 등급: 월 ${limits.raffle}장, 남은 수량: ${Math.max(0, limits.raffle - used)}장)`,
      });
    }

    await _pool.query(
      `INSERT INTO user_fragments (user_id, fragment_type_id, count)
       VALUES (?, 'early-access-pass', ?)
       ON DUPLICATE KEY UPDATE count = count + ?`,
      [userId, count, count]
    );

    await _pool.query(
      `INSERT INTO onchain_tx_logs (id, user_id, wallet_address, action_type, tx_hash, payload_json)
       VALUES (UUID(), ?, '', 'RAFFLE_PURCHASE', UUID(), ?)`,
      [userId, JSON.stringify({ count, tier })]
    );

    const [[result]] = await _pool.query(
      `SELECT count FROM user_fragments WHERE user_id = ? AND fragment_type_id = 'early-access-pass'`,
      [userId]
    );

    res.json({
      success: true,
      newCount: result?.count ?? count,
      message: `응모권 ${count}장을 구매했습니다.`,
      remaining: Math.max(0, limits.raffle - used - 1),
    });
  } catch (err) {
    console.error('[exchange/buy-raffle]', err);
    res.status(500).json({ error: '구매 중 서버 오류가 발생했습니다.' });
  }
});

module.exports = { router, setPool };
