'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const fabricService = require('../services/fabricBridge');

const router = express.Router();
let _pool;
function setPool(pool) { _pool = pool; }

// ─── POST /api/raffle/register ────────────────────────────
// 포인트 교환 후 호출 → Fabric에 응모권 NFT 등록 + DB raffle_nfts 저장
// Body: { walletAddress, gameId? }
router.post('/register', requireAuth, async (req, res) => {
  try {
    const { walletAddress, gameId } = req.body;
    if (!walletAddress) return res.status(400).json({ error: 'walletAddress 필요' });

    const [[wallet]] = await _pool.query(
      'SELECT user_id FROM user_wallets WHERE wallet_address = ?',
      [walletAddress]
    );
    if (!wallet) return res.status(404).json({ error: '등록된 지갑 없음' });

    const userDidHash  = fabricService.hashDid(walletAddress);
    const raffleNftId  = uuidv4();

    await fabricService.registerRaffleNFT({ raffleNftId, userDidHash, gameId: gameId || '' });

    await _pool.query(
      `INSERT INTO raffle_nfts (id, user_id, wallet_address, user_did_hash, game_id, status)
       VALUES (?, ?, ?, ?, ?, 'ISSUED')`,
      [raffleNftId, wallet.user_id, walletAddress, userDidHash, gameId || null]
    );

    await _pool.query(
      `INSERT INTO fabric_events (id, event_name, user_did_hash, payload_json)
       VALUES (?, 'RAFFLE_NFT_REGISTERED', ?, ?)`,
      [uuidv4(), userDidHash, JSON.stringify({ raffleNftId, gameId })]
    );

    res.json({ success: true, data: { raffleNftId, status: 'ISSUED' } });
  } catch (err) {
    console.error('[raffleRoutes] POST /register:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/raffle/my ───────────────────────────────────
// 내 응모권 NFT 목록 조회 (DB 기준)
// Query: walletAddress
router.get('/my', requireAuth, async (req, res) => {
  try {
    const { walletAddress } = req.query;
    if (!walletAddress) return res.status(400).json({ error: 'walletAddress 필요' });

    const [rows] = await _pool.query(
      `SELECT r.*, d.game_id AS draw_game_id,
              DATE_FORMAT(g.game_date,'%Y-%m-%d') AS game_date,
              g.home_team, g.away_team
       FROM raffle_nfts r
       LEFT JOIN draws d ON r.draw_id = d.id
       LEFT JOIN games g ON COALESCE(r.game_id, d.game_id) = g.id
       WHERE r.wallet_address = ?
       ORDER BY r.issued_at DESC`,
      [walletAddress]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[raffleRoutes] GET /my:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/raffle/draws ────────────────────────────────
// 전체 추첨 목록 조회 (진행 중 draws)
router.get('/draws', async (req, res) => {
  try {
    const [rows] = await _pool.query(
      `SELECT d.*,
              DATE_FORMAT(g.game_date,'%Y-%m-%d') AS game_date,
              g.home_team, g.away_team, g.stadium_id,
              COUNT(r.id) AS entry_count
       FROM draws d
       JOIN games g ON d.game_id = g.id
       LEFT JOIN raffle_nfts r ON r.draw_id = d.id AND r.status = 'ENTERED'
       GROUP BY d.id
       ORDER BY d.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[raffleRoutes] GET /draws:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/raffle/draws/:gameId ────────────────────────
// 특정 경기 추첨 조회
router.get('/draws/:gameId', async (req, res) => {
  try {
    const [rows] = await _pool.query(
      `SELECT d.*,
              DATE_FORMAT(g.game_date,'%Y-%m-%d') AS game_date,
              g.home_team, g.away_team
       FROM draws d
       JOIN games g ON d.game_id = g.id
       WHERE d.game_id = ?
       ORDER BY d.created_at DESC`,
      [req.params.gameId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[raffleRoutes] GET /draws/:gameId:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/raffle/draw/create ─────────────────────────
// (관리자용) 추첨 생성
// Body: { gameId, winnerCount }
router.post('/draw/create', requireAuth, async (req, res) => {
  try {
    const { gameId, winnerCount } = req.body;
    if (!gameId) return res.status(400).json({ error: 'gameId 필요' });

    const drawId = uuidv4();
    await _pool.query(
      `INSERT INTO draws (id, game_id, status, winner_count) VALUES (?, ?, 'PENDING', ?)`,
      [drawId, gameId, winnerCount || 10]
    );
    await fabricService.createDraw({ drawId, gameId, winnerCount: winnerCount || 10 });

    res.json({ success: true, data: { drawId, gameId, status: 'PENDING' } });
  } catch (err) {
    console.error('[raffleRoutes] POST /draw/create:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/raffle/enter ───────────────────────────────
// 응모권 NFT로 추첨 참여
// Body: { raffleNftId, walletAddress, drawId }
router.post('/enter', requireAuth, async (req, res) => {
  const conn = await _pool.getConnection();
  try {
    const { raffleNftId, walletAddress, drawId } = req.body;
    if (!raffleNftId || !walletAddress || !drawId) {
      return res.status(400).json({ error: '필수 항목 누락 (raffleNftId, walletAddress, drawId)' });
    }

    const [[nft]] = await _pool.query(
      'SELECT * FROM raffle_nfts WHERE id = ? AND wallet_address = ?',
      [raffleNftId, walletAddress]
    );
    if (!nft) return res.status(404).json({ error: '응모권 NFT를 찾을 수 없습니다' });
    if (nft.status !== 'ISSUED') return res.status(400).json({ error: `이미 사용된 응모권: ${nft.status}` });

    const [[draw]] = await _pool.query('SELECT * FROM draws WHERE id = ?', [drawId]);
    if (!draw) return res.status(404).json({ error: '추첨을 찾을 수 없습니다' });
    if (draw.status === 'COMPLETED') return res.status(400).json({ error: '이미 완료된 추첨입니다' });

    await conn.beginTransaction();

    await conn.query(
      "UPDATE raffle_nfts SET status = 'ENTERED', draw_id = ?, updated_at = NOW() WHERE id = ?",
      [drawId, raffleNftId]
    );
    await conn.query(
      "UPDATE draws SET total_entries = total_entries + 1 WHERE id = ?",
      [drawId]
    );

    const userDidHash = fabricService.hashDid(walletAddress);
    await fabricService.enterDraw({ raffleNftId, userDidHash, drawId });

    await conn.query(
      `INSERT INTO fabric_events (id, event_name, user_did_hash, payload_json)
       VALUES (?, 'RAFFLE_ENTERED', ?, ?)`,
      [uuidv4(), userDidHash, JSON.stringify({ raffleNftId, drawId })]
    );

    await conn.commit();
    res.json({ success: true, data: { raffleNftId, drawId, status: 'ENTERED' } });
  } catch (err) {
    await conn.rollback();
    console.error('[raffleRoutes] POST /enter:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ─── POST /api/raffle/draw/execute ────────────────────────
// (관리자용) 추첨 실행
// Body: { drawId }
router.post('/draw/execute', requireAuth, async (req, res) => {
  const conn = await _pool.getConnection();
  try {
    const { drawId } = req.body;
    if (!drawId) return res.status(400).json({ error: 'drawId 필요' });

    const [[draw]] = await _pool.query('SELECT * FROM draws WHERE id = ?', [drawId]);
    if (!draw) return res.status(404).json({ error: '추첨을 찾을 수 없습니다' });
    if (draw.status === 'COMPLETED') return res.status(400).json({ error: '이미 완료된 추첨입니다' });

    // Fabric 원장에 draw가 없으면 (DB 시드 데이터 등) 먼저 생성
    let fabricResult;
    try {
      fabricResult = await fabricService.executeDraw({ drawId });
    } catch (execErr) {
      if (execErr.message && execErr.message.includes('DRAW_NOT_FOUND')) {
        await fabricService.createDraw({ drawId: draw.id, gameId: draw.game_id, winnerCount: draw.winner_count });
        fabricResult = await fabricService.executeDraw({ drawId });
      } else {
        throw execErr;
      }
    }

    await conn.beginTransaction();

    // winners → WINNER, others → LOST
    if (fabricResult.winners && fabricResult.winners.length > 0) {
      const placeholders = fabricResult.winners.map(() => '?').join(',');
      await conn.query(
        `UPDATE raffle_nfts SET status = 'WINNER', updated_at = NOW()
         WHERE id IN (${placeholders}) AND draw_id = ?`,
        [...fabricResult.winners, drawId]
      );
    }
    await conn.query(
      `UPDATE raffle_nfts SET status = 'LOST', updated_at = NOW()
       WHERE draw_id = ? AND status = 'ENTERED'`,
      [drawId]
    );
    await conn.query(
      "UPDATE draws SET status = 'COMPLETED', executed_at = NOW() WHERE id = ?",
      [drawId]
    );

    await conn.query(
      `INSERT INTO fabric_events (id, event_name, game_id, payload_json)
       VALUES (?, 'DRAW_EXECUTED', ?, ?)`,
      [uuidv4(), draw.game_id, JSON.stringify(fabricResult)]
    );

    await conn.commit();
    res.json({ success: true, data: fabricResult });
  } catch (err) {
    await conn.rollback();
    console.error('[raffleRoutes] POST /draw/execute:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ─── GET /api/raffle/winners/:gameId ─────────────────────
// 특정 경기 당첨자 목록 조회
router.get('/winners/:gameId', async (req, res) => {
  try {
    const [rows] = await _pool.query(
      `SELECT r.*, u.nickname
       FROM raffle_nfts r
       JOIN users u ON r.user_id = u.user_id
       JOIN draws d ON r.draw_id = d.id
       WHERE d.game_id = ? AND r.status IN ('WINNER','USED')
       ORDER BY r.updated_at DESC`,
      [req.params.gameId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[raffleRoutes] GET /winners/:gameId:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/raffle/use ─────────────────────────────────
// 당첨된 응모권으로 우선 예매 확정 (티켓 구매 후 호출)
// Body: { raffleNftId, walletAddress, ticketId }
router.post('/use', requireAuth, async (req, res) => {
  try {
    const { raffleNftId, walletAddress, ticketId } = req.body;
    if (!raffleNftId || !walletAddress || !ticketId) {
      return res.status(400).json({ error: '필수 항목 누락' });
    }

    const [[nft]] = await _pool.query(
      'SELECT * FROM raffle_nfts WHERE id = ? AND wallet_address = ?',
      [raffleNftId, walletAddress]
    );
    if (!nft) return res.status(404).json({ error: '응모권 NFT 없음' });
    if (nft.status !== 'WINNER') return res.status(400).json({ error: `당첨 상태가 아님: ${nft.status}` });

    const userDidHash = fabricService.hashDid(walletAddress);
    await fabricService.useRaffleNFT({ raffleNftId, userDidHash, ticketId });

    await _pool.query(
      "UPDATE raffle_nfts SET status = 'USED', updated_at = NOW() WHERE id = ?",
      [raffleNftId]
    );

    res.json({ success: true, data: { raffleNftId, status: 'USED', ticketId } });
  } catch (err) {
    console.error('[raffleRoutes] POST /use:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/raffle/:raffleNftId ────────────────────────
// 단건 조회
router.get('/:raffleNftId', async (req, res) => {
  try {
    const [[row]] = await _pool.query(
      `SELECT r.*, g.home_team, g.away_team,
              DATE_FORMAT(g.game_date,'%Y-%m-%d') AS game_date
       FROM raffle_nfts r
       LEFT JOIN games g ON r.game_id = g.id
       WHERE r.id = ?`,
      [req.params.raffleNftId]
    );
    if (!row) return res.status(404).json({ error: '응모권 NFT 없음' });
    res.json({ success: true, data: row });
  } catch (err) {
    console.error('[raffleRoutes] GET /:raffleNftId:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, setPool };
