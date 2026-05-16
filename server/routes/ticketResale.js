const express = require('express');
const crypto  = require('crypto');
const { Interface, JsonRpcProvider, getAddress, verifyMessage } = require('ethers');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const fabricService = require('../services/fabricBridge');

const router = express.Router();
let _pool;

function setPool(pool) { _pool = pool; }

const MAX_PRICE_RATIO = 1.1;
const TICKET_RESALE_FEE_RATE = 0.03;
const HOODI_RPC_URL = process.env.HOODI_RPC_URL || process.env.RPC_URL || 'https://ethereum-hoodi-rpc.publicnode.com';
const WEI_PER_KRW = 1_000_000_000n;
const TICKET_MARKETPLACE_ADDRESS = process.env.TICKET_MARKETPLACE_ADDRESS || '0x277124B8AB865AD9b1E0E7c7E6BE3Cc8Db8d5F60';
const MARKETPLACE_INTERFACE = new Interface([
  'function buyTicket(uint256 tokenId) payable',
]);

let _provider;

function getProvider() {
  if (!_provider) _provider = new JsonRpcProvider(HOODI_RPC_URL);
  return _provider;
}

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

const SEAT_SECTION_SQL = `
  TRIM(CONCAT_WS(' ',
    NULLIF(t.grade, ''),
    CASE WHEN t.block IS NOT NULL AND t.block <> '' THEN CONCAT(t.block, '블록') END,
    CASE WHEN t.row_num IS NOT NULL THEN CONCAT(t.row_num, '열') END,
    CASE WHEN t.seat_number IS NOT NULL THEN CONCAT(t.seat_number, '번') END
  ))
`;

function calculateTicketSettlement(price) {
  const grossAmount = Number(price) || 0;
  const platformFee = Math.round(grossAmount * TICKET_RESALE_FEE_RATE);
  const settlementAmount = grossAmount - platformFee;
  return { grossAmount, platformFee, settlementAmount };
}

async function ensureListingSignatureColumns(conn) {
  const [columns] = await conn.query(`SHOW COLUMNS FROM ticket_listings`);
  const existing = new Set(columns.map((c) => c.Field));
  const alters = [];
  if (!existing.has('seller_wallet_address')) {
    alters.push(`ADD COLUMN seller_wallet_address VARCHAR(42) DEFAULT NULL AFTER seller_id`);
  }
  if (!existing.has('listing_message')) {
    alters.push(`ADD COLUMN listing_message TEXT DEFAULT NULL AFTER list_tx_hash`);
  }
  if (!existing.has('listing_signature')) {
    alters.push(`ADD COLUMN listing_signature TEXT DEFAULT NULL AFTER listing_message`);
  }
  if (alters.length > 0) {
    await conn.query(`ALTER TABLE ticket_listings ${alters.join(', ')}`);
  }
}

async function ensureTradeColumns(conn) {
  const [columns] = await conn.query(`SHOW COLUMNS FROM ticket_trades`);
  const existing = new Set(columns.map((c) => c.Field));
  const alters = [];
  if (!existing.has('platform_fee')) {
    alters.push(`ADD COLUMN platform_fee INT NOT NULL DEFAULT 0 AFTER price`);
  }
  if (!existing.has('settlement_amount')) {
    alters.push(`ADD COLUMN settlement_amount INT NOT NULL DEFAULT 0 AFTER platform_fee`);
  }
  if (alters.length > 0) {
    await conn.query(`ALTER TABLE ticket_trades ${alters.join(', ')}`);
  }
}

function normalizeAddress(address) {
  return String(address || '').trim().toLowerCase();
}

function krwToWei(price) {
  return BigInt(Math.round(Number(price) || 0)) * WEI_PER_KRW;
}

function sameAddress(a, b) {
  try {
    return getAddress(String(a)) === getAddress(String(b));
  } catch {
    return false;
  }
}

async function verifyDirectPaymentTx({ txHash, buyerWalletAddress, sellerWalletAddress, expectedWei }) {
  if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
    const error = new Error('MetaMask 결제 트랜잭션 해시가 필요합니다');
    error.statusCode = 400;
    throw error;
  }
  const provider = getProvider();
  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    const error = new Error('결제 트랜잭션을 아직 찾을 수 없습니다. 잠시 후 다시 시도해주세요.');
    error.statusCode = 400;
    throw error;
  }
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) {
    const error = new Error('결제 트랜잭션이 아직 확정되지 않았거나 실패했습니다.');
    error.statusCode = 400;
    throw error;
  }
  if (!sameAddress(tx.from, buyerWalletAddress)) {
    const error = new Error('결제한 지갑이 현재 구매자 지갑과 일치하지 않습니다');
    error.statusCode = 400;
    throw error;
  }
  if (!sameAddress(tx.to, sellerWalletAddress)) {
    const error = new Error('결제 수신 지갑이 판매자 지갑과 일치하지 않습니다');
    error.statusCode = 400;
    throw error;
  }
  if (BigInt(tx.value.toString()) < expectedWei) {
    const error = new Error('결제 금액이 매물 가격보다 적습니다');
    error.statusCode = 400;
    throw error;
  }
}

async function verifyMarketplacePurchaseTx({ txHash, buyerWalletAddress, expectedWei, tokenId }) {
  if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
    const error = new Error('MetaMask 구매 컨펌 거래 해시가 필요합니다');
    error.statusCode = 400;
    throw error;
  }
  const provider = getProvider();
  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    const error = new Error('구매 트랜잭션을 아직 찾을 수 없습니다. 잠시 후 다시 시도해주세요.');
    error.statusCode = 400;
    throw error;
  }
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) {
    const error = new Error('구매 트랜잭션이 아직 확정되지 않았거나 실패했습니다.');
    error.statusCode = 400;
    throw error;
  }
  if (!sameAddress(tx.from, buyerWalletAddress)) {
    const error = new Error('구매한 지갑이 현재 구매자 지갑과 일치하지 않습니다');
    error.statusCode = 400;
    throw error;
  }
  if (!sameAddress(tx.to, TICKET_MARKETPLACE_ADDRESS)) {
    const error = new Error('구매 트랜잭션 대상이 장터 컨트랙트가 아닙니다');
    error.statusCode = 400;
    throw error;
  }
  try {
    const parsed = MARKETPLACE_INTERFACE.parseTransaction({ data: tx.data, value: tx.value });
    const purchasedTokenId = parsed?.args?.[0]?.toString();
    if (parsed?.name !== 'buyTicket' || purchasedTokenId !== String(tokenId)) {
      const error = new Error('구매 트랜잭션의 NFT 티켓 정보가 매물과 일치하지 않습니다');
      error.statusCode = 400;
      throw error;
    }
  } catch (err) {
    if (err.statusCode) throw err;
    const error = new Error('구매 트랜잭션 데이터를 검증할 수 없습니다');
    error.statusCode = 400;
    throw error;
  }
  if (BigInt(tx.value.toString()) < expectedWei) {
    const error = new Error('구매 결제 금액이 매물 가격보다 적습니다');
    error.statusCode = 400;
    throw error;
  }
}

async function getBuyerWalletOrThrow(conn, userId) {
  const [[buyerWallet]] = await conn.query(
    'SELECT wallet_address FROM user_wallets WHERE user_id = ?',
    [userId],
  );
  if (!buyerWallet?.wallet_address) {
    const error = new Error('지갑 연결 후 구매할 수 있습니다.');
    error.statusCode = 400;
    throw error;
  }
  return buyerWallet.wallet_address;
}

async function ensureTransferredTicket(conn, listing, buyerWalletAddress) {
  if (listing.ticket_id) {
    await conn.query(
      `UPDATE tickets SET wallet_address = ?, status = 'confirmed', purchase_type = 'TRANSFERRED' WHERE id = ?`,
      [buyerWalletAddress, listing.ticket_id],
    );
    return listing.ticket_id;
  }

  const [[game]] = await conn.query(
    `SELECT g.id, s.name AS stadium_name
       FROM games g
       LEFT JOIN stadiums s ON s.id = g.stadium_id
      WHERE g.home_team = ? AND g.away_team = ? AND g.game_date = ?
      LIMIT 1`,
    [listing.home_team, listing.away_team, listing.game_date],
  );

  if (!game?.id) {
    const error = new Error('경기 정보를 찾을 수 없어 티켓을 발급할 수 없습니다.');
    error.statusCode = 500;
    throw error;
  }

  const ticketId = crypto.randomUUID();
  await conn.query(
    `INSERT INTO tickets
      (id, wallet_address, game_id, stadium, grade, price, status)
     VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`,
    [
      ticketId,
      buyerWalletAddress,
      game.id,
      game.stadium_name ?? null,
      listing.seat_section,
      listing.listed_price,
    ],
  );
  await conn.query(`UPDATE ticket_listings SET ticket_id = ? WHERE id = ?`, [ticketId, listing.id]);
  return ticketId;
}

// 내가 예매한 티켓 목록 (양도 등록 전용)
router.get('/my-tickets', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  try {
    const [rows] = await _pool.query(
      `SELECT t.id, t.token_id AS tokenId, t.ticket_tx_hash AS txHash,
         DATE_FORMAT(g.game_date, '%Y-%m-%d') AS gameDate,
         g.home_team AS homeTeam, g.away_team AS awayTeam,
         s.name AS stadiumName,
         t.grade, t.block, t.row_num AS rowNum, t.seat_number AS seatNumber,
         ${SEAT_SECTION_SQL} AS seatSection,
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
         COALESCE(tl.seller_wallet_address, uw.wallet_address) AS sellerWalletAddress,
         tl.created_at AS listedAtRaw
       FROM ticket_listings tl
       JOIN users u ON u.user_id = tl.seller_id
       LEFT JOIN user_wallets uw ON uw.user_id = tl.seller_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT 100`,
      params,
    );
    res.json(rows.map(r => ({
      ...r,
      isMine: userId ? r.sellerId === userId : false,
      sellerId: undefined,
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
         tt.price AS tradePrice,
         tt.platform_fee AS platformFee,
         tt.settlement_amount AS settlementAmount,
         tt.buy_tx_hash AS buyTxHash,
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
    const [[summary]] = await _pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN buyer_id = ? THEN price ELSE 0 END), 0) AS totalSpent,
         COALESCE(SUM(CASE WHEN seller_id = ? THEN settlement_amount ELSE 0 END), 0) AS totalEarned,
         COALESCE(SUM(CASE WHEN seller_id = ? THEN platform_fee ELSE 0 END), 0) AS totalFees,
         COALESCE(SUM(CASE WHEN buyer_id = ? THEN 1 ELSE 0 END), 0) AS buyCount,
         COALESCE(SUM(CASE WHEN seller_id = ? THEN 1 ELSE 0 END), 0) AS sellCount
       FROM ticket_trades`,
      [userId, userId, userId, userId, userId],
    );
    res.json({
      myListings: myListings.map(r => ({ ...r, createdAt: formatDateTime(r.createdAtRaw) })),
      history:    history.map(r => ({ ...r, tradedAt: r.tradedAtRaw ? formatDateTime(r.tradedAtRaw) : null })),
      summary: {
        totalSpent:  Number(summary?.totalSpent ?? 0),
        totalEarned: Number(summary?.totalEarned ?? 0),
        totalFees:   Number(summary?.totalFees ?? 0),
        netProfit:   Number(summary?.totalEarned ?? 0) - Number(summary?.totalSpent ?? 0),
        buyCount:    Number(summary?.buyCount ?? 0),
        sellCount:   Number(summary?.sellCount ?? 0),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 판매 등록
router.post('/listings', requireAuth, async (req, res) => {
  const userId = req.user.user_id;
  const {
    ticketId,
    listedPrice,
    nftTokenId,
    priceWei,
    listTxHash,
    sellerWalletAddress,
    listingMessage,
    listingSignature,
  } = req.body;
  if (!ticketId || !listedPrice)
    return res.status(400).json({ error: 'ticketId와 listedPrice가 필요합니다' });

  const conn = await _pool.getConnection();
  try {
    await ensureListingSignatureColumns(conn);
    await conn.beginTransaction();

    const [[ticket]] = await conn.query(
      `SELECT t.id, t.price AS originalPrice, t.token_id AS tokenId,
         DATE_FORMAT(g.game_date, '%Y-%m-%d') AS gameDate,
         g.home_team AS homeTeam, g.away_team AS awayTeam,
         ${SEAT_SECTION_SQL} AS seatSection
       FROM tickets t
       JOIN user_wallets uw ON uw.wallet_address = t.wallet_address
       JOIN games g ON g.id = t.game_id
       WHERE t.id = ? AND uw.user_id = ? AND t.status = 'confirmed' AND g.game_date >= CURDATE()
       FOR UPDATE`,
      [ticketId, userId],
    );
    if (!ticket) {
      await conn.rollback();
      return res.status(404).json({ error: '유효한 티켓을 찾을 수 없습니다' });
    }

    const maxPrice = Math.floor(Number(ticket.originalPrice) * MAX_PRICE_RATIO);
    if (Number(listedPrice) > maxPrice) {
      await conn.rollback();
      return res.status(400).json({ error: `원가의 110% (${maxPrice.toLocaleString()}원)를 초과할 수 없습니다` });
    }
    if (Number(listedPrice) < 1000) {
      await conn.rollback();
      return res.status(400).json({ error: '거래 가격은 1,000원 이상이어야 합니다' });
    }

    if (!sellerWalletAddress || !listingMessage || !listingSignature) {
      await conn.rollback();
      return res.status(400).json({ error: 'MetaMask 판매 등록 서명이 필요합니다' });
    }

    const [[wallet]] = await conn.query(
      `SELECT wallet_address FROM user_wallets WHERE user_id = ? AND LOWER(wallet_address) = LOWER(?) LIMIT 1`,
      [userId, sellerWalletAddress],
    );
    if (!wallet?.wallet_address) {
      await conn.rollback();
      return res.status(400).json({ error: '서명한 지갑이 현재 계정에 연결된 지갑과 일치하지 않습니다' });
    }

    let recoveredAddress = '';
    try {
      recoveredAddress = verifyMessage(String(listingMessage), String(listingSignature));
    } catch {
      await conn.rollback();
      return res.status(400).json({ error: 'MetaMask 서명을 검증할 수 없습니다' });
    }
    if (normalizeAddress(recoveredAddress) !== normalizeAddress(sellerWalletAddress)) {
      await conn.rollback();
      return res.status(400).json({ error: 'MetaMask 서명자와 판매자 지갑이 일치하지 않습니다' });
    }
    if (!String(listingMessage).includes(String(ticketId)) || !String(listingMessage).includes(String(ticket.seatSection))) {
      await conn.rollback();
      return res.status(400).json({ error: '판매 등록 서명 메시지와 티켓 정보가 일치하지 않습니다' });
    }
    if (!nftTokenId || !priceWei || !listTxHash) {
      await conn.rollback();
      return res.status(400).json({ error: 'NFT 티켓은 MetaMask approve/listTicket 컨펌 후에만 장터에 등록할 수 있습니다' });
    }

    const listingId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO ticket_listings
         (id, seller_id, seller_wallet_address, ticket_id, nft_token_id, price_wei, list_tx_hash,
          listing_message, listing_signature,
          game_date, home_team, away_team, seat_section, original_price, listed_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        listingId, userId, sellerWalletAddress, ticketId,
        nftTokenId ?? null, priceWei ?? null, listTxHash ?? null,
        listingMessage, listingSignature,
        ticket.gameDate, ticket.homeTeam, ticket.awayTeam,
        ticket.seatSection, ticket.originalPrice, Number(listedPrice),
      ],
    );

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
  const {
    buyTxHash,
    buyerWalletAddress: signedBuyerWalletAddress,
    legacyBuyMessage,
    legacyBuySignature,
  } = req.body;
  const conn = await _pool.getConnection();
  try {
    await ensureTradeColumns(conn);
    await conn.beginTransaction();
    const buyerWalletAddress = await getBuyerWalletOrThrow(conn, userId);
    const [[listing]] = await conn.query(
      `SELECT tl.*, u.nickname AS seller_name,
              COALESCE(tl.seller_wallet_address, uw.wallet_address) AS resolved_seller_wallet_address
       FROM ticket_listings tl
       JOIN users u ON u.user_id = tl.seller_id
       LEFT JOIN user_wallets uw ON uw.user_id = tl.seller_id
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

    if (buyTxHash) {
      const [[usedTrade]] = await conn.query(
        `SELECT id FROM ticket_trades WHERE buy_tx_hash = ? LIMIT 1`,
        [buyTxHash],
      );
      if (usedTrade) {
        await conn.rollback();
        return res.status(400).json({ error: '이미 사용된 구매 트랜잭션입니다' });
      }
    }

    const isNftListing = Boolean(listing.nft_token_id && listing.price_wei);
    if (isNftListing) {
      await verifyMarketplacePurchaseTx({
        txHash: buyTxHash,
        buyerWalletAddress,
        expectedWei: BigInt(listing.price_wei),
        tokenId: listing.nft_token_id,
      });
    } else {
      if (listing.resolved_seller_wallet_address) {
        await verifyDirectPaymentTx({
          txHash: buyTxHash,
          buyerWalletAddress,
          sellerWalletAddress: listing.resolved_seller_wallet_address,
          expectedWei: krwToWei(listing.listed_price),
        });
      } else if (!signedBuyerWalletAddress || !legacyBuyMessage || !legacyBuySignature) {
        await conn.rollback();
        return res.status(400).json({ error: '판매자 지갑이 없는 매물은 실제 지갑 결제가 불가능합니다' });
      } else {
        if (normalizeAddress(signedBuyerWalletAddress) !== normalizeAddress(buyerWalletAddress)) {
          await conn.rollback();
          return res.status(400).json({ error: '서명한 지갑이 현재 계정에 연결된 지갑과 일치하지 않습니다' });
        }
        let recoveredAddress = '';
        try {
          recoveredAddress = verifyMessage(String(legacyBuyMessage), String(legacyBuySignature));
        } catch {
          await conn.rollback();
          return res.status(400).json({ error: 'MetaMask 구매 서명을 검증할 수 없습니다' });
        }
        if (normalizeAddress(recoveredAddress) !== normalizeAddress(signedBuyerWalletAddress)) {
          await conn.rollback();
          return res.status(400).json({ error: 'MetaMask 서명자와 구매자 지갑이 일치하지 않습니다' });
        }
        if (
          !String(legacyBuyMessage).includes(String(req.params.id)) ||
          !String(legacyBuyMessage).includes(String(listing.seat_section))
        ) {
          await conn.rollback();
          return res.status(400).json({ error: '구매 서명 메시지와 티켓 정보가 일치하지 않습니다' });
        }
      }
    }

    const { grossAmount, platformFee, settlementAmount } = calculateTicketSettlement(listing.listed_price);
    await conn.query(`UPDATE ticket_listings SET status = 'completed' WHERE id = ?`, [req.params.id]);
    await conn.query(
      `INSERT INTO ticket_trades (id, listing_id, buyer_id, seller_id, price, platform_fee, settlement_amount, buy_tx_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), req.params.id, userId, listing.seller_id, grossAmount, platformFee, settlementAmount, buyTxHash ?? null],
    );
    await ensureTransferredTicket(conn, listing, buyerWalletAddress);
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
        homeTeam:         listing.home_team,
        awayTeam:         listing.away_team,
        gameDate:         listing.game_date instanceof Date ? formatDate(listing.game_date) : String(listing.game_date).slice(0, 10),
        seatSection:      listing.seat_section,
        price:            grossAmount,
        platformFee,
        settlementAmount,
        sellerName:       listing.seller_name,
        buyTxHash:        buyTxHash ?? null,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message || '구매 처리 중 오류가 발생했습니다' });
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
      `SELECT ticket_id, nft_token_id FROM ticket_listings
       WHERE id = ? AND seller_id = ? AND status = 'active'
       FOR UPDATE`,
      [req.params.id, userId],
    );
    if (!listing) {
      await conn.rollback();
      return res.status(404).json({ error: '취소할 수 있는 티켓이 없습니다' });
    }
    if (!listing.nft_token_id) {
      await conn.rollback();
      return res.status(400).json({ error: 'NFT 발급 기록이 없는 티켓은 블록체인 취소가 불가능합니다' });
    }
    await conn.query(
      `UPDATE ticket_listings SET status = 'cancelled' WHERE id = ?`,
      [req.params.id],
    );
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
