const express = require('express');
const crypto  = require('crypto');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const fabricService = require('../services/fabricBridge');

const router = express.Router();
let _pool;

function setPool(pool) { _pool = pool; }

const MAX_PRICE_RATIO = 1.1;

function formatDate(v) {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
  }).format(new Date(v));
}

function formatDateTime(v) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  }).format(new Date(v));
}

// 내가 예매한 티켓 목록 (양도 등록 전용)
router.get('/my-tickets', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  try {
    // user_id → wallet_address → tickets
    const [rows] = await _pool.query(
      `SELECT t.id, t.token_id AS tokenId, t.ticket_tx_hash AS txHash,
         DATE_FORMAT(g.game_date, '%Y-%m-%d') AS gameDate,
         g.home_team AS homeTeam, g.away_team AS awayTeam,
         s.name AS stadiumName,
         t.grade, t.block, t.row_num AS rowNum, t.seat_number AS seatNumber,
         CONCAT(t.grade, ' ', t.block, '-', t.row_num, '-', t.seat_number) AS seatSection,
         t.price AS originalPrice, t.status
       FROM tickets t
       JOIN user_wallets uw ON uw.wallet_address = t.wallet_address
       JOIN games g ON g.id = t.game_id
       JOIN stadiums s ON s.id = g.stadium_id
       WHERE uw.user_id = ? AND t.status = 'confirmed' AND g.game_date >= CURDATE()
       ORDER BY g.game_date ASC`,
      [userId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 매물 목록 조회
router.get('/listings', optionalAuth, async (req, res) => {
  const { team, sort } = req.query;
  const userId = req.user?.user_id ?? null;
  try {
    const conditions = ["tl.status = 'active'", 'tl.game_date >= CURDATE()'];
    const params = [];
    if (team) {
      const teams = Array.isArray(team) ? team : [team];
      const placeholders = teams.map(() => '?').join(', ');
      conditions.push(`(tl.home_team IN (${placeholders}) OR tl.away_team IN (${placeholders}))`);
      params.push(...teams, ...teams);
    }
    const orderBy =
      sort === 'price_asc'  ? 'tl.listed_price ASC' :
      sort === 'price_desc' ? 'tl.listed_price DESC' :
      'tl.game_date ASC, tl.listed_price ASC';
    const [rows] = await _pool.query(
      `SELECT tl.id, u.nickname AS sellerName, tl.seller_id AS sellerId,
         DATE_FORMAT(tl.game_date, '%Y-%m-%d') AS gameDate,
         tl.home_team AS homeTeam, tl.away_team AS awayTeam,
         tl.seat_section AS seatSection,
         tl.original_price AS originalPrice,
         tl.listed_price AS listedPrice,
         tl.nft_token_id AS nftTokenId,
         tl.price_wei AS priceWei,
         tl.created_at AS listedAtRaw
       FROM ticket_listings tl
       JOIN users u ON u.user_id = tl.seller_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT 100`,
      params,
    );
    res.json(rows.map(r => ({
      ...r,
      isMine: userId ? r.sellerId === userId : false,
      sellerId: undefined,   // 외부에 user_id 노출 방지
      listedAt: formatDateTime(r.listedAtRaw),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 내 거래 현황 (내 매물 + 이력)
router.get('/my', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  try {
    const [myListings] = await _pool.query(
      `SELECT tl.id,
         DATE_FORMAT(tl.game_date, '%Y-%m-%d') AS gameDate,
         tl.home_team AS homeTeam, tl.away_team AS awayTeam,
         tl.seat_section AS seatSection,
         tl.original_price AS originalPrice, tl.listed_price AS listedPrice,
         tl.nft_token_id AS nftTokenId,
         tl.price_wei AS priceWei,
         tl.status, tl.created_at AS createdAtRaw
       FROM ticket_listings tl
       WHERE tl.seller_id = ? AND tl.status = 'active' AND tl.game_date >= CURDATE()
       ORDER BY tl.game_date ASC, tl.created_at DESC`,
      [userId],
    );
    const [history] = await _pool.query(
      `SELECT tl.id,
         tl.home_team AS homeTeam, tl.away_team AS awayTeam,
         DATE_FORMAT(tl.game_date, '%Y-%m-%d') AS gameDate,
         tl.seat_section AS seatSection, tl.listed_price AS listedPrice,
         tl.status,
         CASE WHEN tl.seller_id = ? THEN 'sold' ELSE 'bought' END AS role,
         tt.traded_at AS tradedAtRaw
       FROM ticket_listings tl
       LEFT JOIN ticket_trades tt ON tt.listing_id = tl.id
       WHERE (tl.seller_id = ? OR tt.buyer_id = ?) AND tl.status = 'completed'
       ORDER BY tt.traded_at DESC
       LIMIT 20`,
      [userId, userId, userId],
    );
    res.json({
      myListings: myListings.map(r => ({ ...r, createdAt: formatDateTime(r.createdAtRaw) })),
      history:    history.map(r => ({ ...r, tradedAt: r.tradedAtRaw ? formatDateTime(r.tradedAtRaw) : null })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 판매 등록 (예매한 티켓 ID + 희망가격 + 온체인 정보)
router.post('/listings', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  const { ticketId, listedPrice, nftTokenId, priceWei, listTxHash } = req.body;
  if (!ticketId || !listedPrice)
    return res.status(400).json({ error: 'ticketId와 listedPrice가 필요합니다' });

  const conn = await _pool.getConnection();
  try {
    await conn.beginTransaction();

    // 티켓 소유 확인 + 게임 정보 조회
    const [[ticket]] = await conn.query(
      `SELECT t.id, t.price AS originalPrice, t.token_id AS tokenId,
         DATE_FORMAT(g.game_date, '%Y-%m-%d') AS gameDate,
         g.home_team AS homeTeam, g.away_team AS awayTeam,
         CONCAT(t.grade, ' ', t.block, '-', t.row_num, '-', t.seat_number) AS seatSection
       FROM tickets t
       JOIN user_wallets uw ON uw.wallet_address = t.wallet_address
       JOIN games g ON g.id = t.game_id
       WHERE t.id = ? AND uw.user_id = ? AND t.status = 'confirmed' AND g.game_date >= CURDATE()
       FOR UPDATE`,
      [ticketId, userId],
    );
    if (!ticket)
      return res.status(404).json({ error: '유효한 티켓을 찾을 수 없습니다' });

    const maxPrice = Math.floor(Number(ticket.originalPrice) * MAX_PRICE_RATIO);
    if (Number(listedPrice) > maxPrice)
      return res.status(400).json({ error: `원가의 110% (${maxPrice.toLocaleString()}원)를 초과할 수 없습니다` });
    if (Number(listedPrice) < 1000)
      return res.status(400).json({ error: '거래 가격은 1,000원 이상이어야 합니다' });

    const listingId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO ticket_listings
         (id, seller_id, ticket_id, nft_token_id, price_wei, list_tx_hash,
          game_date, home_team, away_team, seat_section, original_price, listed_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        listingId, userId, ticketId,
        nftTokenId ?? null, priceWei ?? null, listTxHash ?? null,
        ticket.gameDate, ticket.homeTeam, ticket.awayTeam,
        ticket.seatSection, ticket.originalPrice, Number(listedPrice),
      ],
    );

    // 티켓 상태 → listed (중복 등록 방지)
    await conn.query(`UPDATE tickets SET status = 'listed' WHERE id = ?`, [ticketId]);

    await conn.commit();
    res.json({ listingId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: '티켓 등록 중 오류가 발생했습니다' });
  } finally {
    conn.release();
  }
});

// 구매
router.post('/buy/:id', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  const { buyTxHash } = req.body;
  const conn = await _pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[listing]] = await conn.query(
      `SELECT tl.*, u.nickname AS seller_name
       FROM ticket_listings tl
       JOIN users u ON u.user_id = tl.seller_id
       WHERE tl.id = ? AND tl.status = 'active' AND tl.game_date >= CURDATE()
       FOR UPDATE`,
      [req.params.id],
    );
    if (!listing) {
      await conn.rollback();
      return res.status(404).json({ error: '티켓을 찾을 수 없거나 이미 거래 완료됐습니다' });
    }
    if (listing.seller_id === userId) {
      await conn.rollback();
      return res.status(400).json({ error: '본인이 올린 티켓은 구매할 수 없습니다' });
    }
    await conn.query(`UPDATE ticket_listings SET status = 'completed' WHERE id = ?`, [req.params.id]);
    await conn.query(
      `INSERT INTO ticket_trades (id, listing_id, buyer_id, seller_id, price, buy_tx_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), req.params.id, userId, listing.seller_id, listing.listed_price, buyTxHash ?? null],
    );
    // 원본 티켓 소유권 → 구매자 지갑으로 이전, 상태 → confirmed (입장권에서 보이도록)
    if (listing.ticket_id) {
      const [[buyerWallet]] = await conn.query(
        'SELECT wallet_address FROM user_wallets WHERE user_id = ?',
        [userId]
      );
      if (buyerWallet?.wallet_address) {
        await conn.query(
          `UPDATE tickets SET wallet_address = ?, status = 'confirmed', purchase_type = 'TRANSFERRED' WHERE id = ?`,
          [buyerWallet.wallet_address, listing.ticket_id]
        );
      } else {
        await conn.query(
          `UPDATE tickets SET status = 'confirmed', purchase_type = 'TRANSFERRED' WHERE id = ?`,
          [listing.ticket_id]
        );
      }
    }
    await conn.commit();

    // 판매자 포인트 적립 (거래금액 0.3%, 하루 3건 한도)
    let earnedPoint = 0;
    try {
      const [[sellerWalletRow]] = await _pool.query(
        'SELECT wallet_address FROM user_wallets WHERE user_id = ?',
        [listing.seller_id]
      );
      if (sellerWalletRow?.wallet_address) {
        const [[{ cnt }]] = await _pool.query(
          'SELECT COUNT(*) AS cnt FROM ticket_trades WHERE seller_id = ? AND DATE(traded_at) = CURDATE()',
          [listing.seller_id]
        );
        if (Number(cnt) <= 3) {
          const result = await fabricService.earnPointFromTrade({
            userDidHash: fabricService.hashDid(sellerWalletRow.wallet_address),
            amount: listing.listed_price,
            rate:   0.003,
          });
          earnedPoint = result.earnedPoint;
        }
      }
    } catch (pointErr) {
      console.error('[ticketResale] 포인트 적립 실패:', pointErr.message);
    }

    res.json({
      success: true,
      earnedPoint,
      receipt: {
        homeTeam:    listing.home_team,
        awayTeam:    listing.away_team,
        gameDate:    listing.game_date instanceof Date ? formatDate(listing.game_date) : String(listing.game_date).slice(0, 10),
        seatSection: listing.seat_section,
        price:       listing.listed_price,
        sellerName:  listing.seller_name,
        buyTxHash:   buyTxHash ?? null,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: '구매 처리 중 오류가 발생했습니다' });
  } finally {
    conn.release();
  }
});

// 등록 취소
router.delete('/listings/:id', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  const conn = await _pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[listing]] = await conn.query(
      `SELECT ticket_id FROM ticket_listings
       WHERE id = ? AND seller_id = ? AND status = 'active'
       FOR UPDATE`,
      [req.params.id, userId],
    );
    if (!listing) {
      await conn.rollback();
      return res.status(404).json({ error: '취소할 수 있는 티켓이 없습니다' });
    }
    await conn.query(
      `UPDATE ticket_listings SET status = 'cancelled' WHERE id = ?`,
      [req.params.id],
    );
    // 원본 티켓 상태 → confirmed (다시 양도 가능하도록)
    if (listing.ticket_id) {
      await conn.query(`UPDATE tickets SET status = 'confirmed' WHERE id = ?`, [listing.ticket_id]);
    }
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: '취소 중 오류가 발생했습니다' });
  } finally {
    conn.release();
  }
});

module.exports = { router, setPool };
