const express = require("express");
const crypto  = require("crypto");
const { purchaseTicket } = require("../services/ticketService");
const { mintBoxOnChain, mintTicketOnChain } = require("../services/nftService");
const fabricService = require("../services/fabricBridge");
const { confirmPayment, cancelPayment } = require("../services/tossPayService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
let _pool;

function setPool(pool) {
  _pool = pool;
}

async function requireVerifiedDidForWallet(req, res, next) {
  try {
    const walletAddress = String(req.body.walletAddress || "").trim().toLowerCase();

    if (!walletAddress) {
      return res.status(400).json({ success: false, message: "지갑 주소가 필요합니다" });
    }

    const [[wallet]] = await _pool.query(
      `SELECT uw.wallet_address, uw.is_verified,
              dv.wallet_address AS did_wallet_address,
              dv.status AS did_status
       FROM user_wallets uw
       LEFT JOIN did_verifications dv ON dv.user_id = uw.user_id
       WHERE uw.user_id = ?`,
      [req.user.user_id],
    );

    if (!wallet) {
      return res.status(403).json({ success: false, message: "먼저 지갑을 연결해주세요" });
    }

    const registeredWallet = String(wallet.wallet_address || "").toLowerCase();
    const didWallet = String(wallet.did_wallet_address || "").toLowerCase();

    if (registeredWallet !== walletAddress) {
      return res.status(403).json({ success: false, message: "DID 인증된 본인 지갑으로만 예매할 수 있습니다" });
    }

    if (!wallet.is_verified || wallet.did_status !== "verified" || didWallet !== registeredWallet) {
      return res.status(403).json({ success: false, message: "DID 인증 완료 후 예매할 수 있습니다" });
    }

    req.verifiedWalletAddress = registeredWallet;
    next();
  } catch (err) {
    console.error("[ticket did gate]", err);
    res.status(500).json({ success: false, message: "DID 인증 상태 확인 실패" });
  }
}

// ─── QR 유틸 ──────────────────────────────────────────────

const QR_SECRET = process.env.QR_SECRET || "base-chain-qr-secret-2026";

// 테스트용: DEBUG_TIME_OFFSET_HOURS 만큼 현재 시간을 앞당김
function getNowMs() {
  const offset = parseFloat(process.env.DEBUG_TIME_OFFSET_HOURS || "0");
  return Date.now() + offset * 60 * 60 * 1000;
}

function getCurrentSlot(nowMs) {
  return Math.floor(nowMs / 1000 / 60); // 1분 슬롯
}

function generateQRToken(ticketId, slot) {
  return crypto
    .createHmac("sha256", QR_SECRET)
    .update(`${ticketId}:${slot}`)
    .digest("hex")
    .slice(0, 32);
}

// 경기 목록 조회
router.get("/games", async (req, res) => {
  try {
    const [games] = await _pool.query(`
      SELECT g.id, g.home_team, g.away_team,
        DATE_FORMAT(g.game_date, '%Y-%m-%d') AS game_date,
        g.game_time, g.stadium_id, g.status, g.base_price,
        s.name AS stadium_name, s.location,
        ELT(WEEKDAY(g.game_date)+1, '월','화','수','목','금','토','일') AS day_of_week
      FROM games g
      JOIN stadiums s ON g.stadium_id = s.id
      ORDER BY g.game_date ASC
    `);
    res.json({ success: true, data: games });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "경기 목록 조회 실패" });
  }
});

// 경기 상세 조회
router.get("/games/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await _pool.query(
      `SELECT g.id, g.home_team, g.away_team,
         DATE_FORMAT(g.game_date, '%Y-%m-%d') AS game_date,
         TIME_FORMAT(g.game_time, '%H:%i:%s') AS game_time,
         g.stadium_id, g.status, g.base_price,
         s.name AS stadium_name, s.location, s.capacity
       FROM games g
       JOIN stadiums s ON g.stadium_id = s.id
       WHERE g.id = ?`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "경기를 찾을 수 없습니다" });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "경기 상세 조회 실패" });
  }
});

// 특정 경기의 예약된 좌석 조회
router.get("/seats/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;
    const [rows] = await _pool.query(
      "SELECT block, row_num, seat_number FROM tickets WHERE game_id = ? AND status = 'confirmed'",
      [gameId],
    );
    const bookedSeats = rows.map((t) => `${t.block}:${t.row_num}-${t.seat_number}`);
    res.json({ success: true, data: bookedSeats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "좌석 조회 실패" });
  }
});

// 티켓 구매
router.post("/purchase", requireAuth, requireVerifiedDidForWallet, async (req, res) => {
  try {
    const { walletAddress, gameId, stadium, grade, block, row, seatNumber, price } = req.body;
    const verifiedWalletAddress = req.verifiedWalletAddress || String(walletAddress).toLowerCase();

    if (!walletAddress || !gameId || !grade || !block || !row || !seatNumber) {
      return res.status(400).json({ success: false, message: "필수 정보가 누락되었습니다" });
    }

    const result = await purchaseTicket(_pool, {
      walletAddress: verifiedWalletAddress,
      gameId,
      stadium,
      grade,
      block,
      row,
      seatNumber,
      price,
    });

    // 티켓 구매 성공 시 → 지갑 주소로 user_id 조회 후 시즌 박스 1개 지급
    let ticketTokenId = null;
    let ticketTxHash  = null;
    let boxTxHash     = null;

    try {
      const [[walletRow]] = await _pool.query(
        'SELECT user_id FROM user_wallets WHERE wallet_address = ?',
        [verifiedWalletAddress]
      );
      if (walletRow) {
        // DB 박스 지급
        await _pool.query(
          `INSERT INTO user_boxes (user_id, season_count) VALUES (?, 1)
           ON DUPLICATE KEY UPDATE season_count = season_count + 1`,
          [walletRow.user_id]
        );

        // 티켓 NFT는 프론트(MetaMask)에서 이미 민팅 완료 → 서버 측 이중 민팅 생략
        // BoxNFT만 서버 지갑으로 민팅
        const boxOnChainEnabled = !!(process.env.MINTER_PRIVATE_KEY && process.env.BOX_NFT_ADDRESS);
        if (boxOnChainEnabled) {
          try {
            boxTxHash = await mintBoxOnChain(verifiedWalletAddress);
          } catch (mintErr) {
            console.error('[ticket] 박스 온체인 민팅 실패 (DB는 정상):', mintErr.message);
          }
        }
      }
    } catch (boxErr) {
      console.error('[ticket box reward]', boxErr);
    }

    // Fabric 티켓 등록 + 예약 레코드 생성 (실패해도 구매 자체는 성공 처리)
    try {
      const [[gameRow]] = await _pool.query(
        "SELECT DATE_FORMAT(game_date, '%Y-%m-%d') AS game_date FROM games WHERE id = ?",
        [gameId]
      );
      const { v4: uuidv4 } = require('uuid');
      await fabricService.registerTicket({
        ticketId:     result.id,
        tokenId:      ticketTokenId || '0',
        gameId:       String(gameId),
        seatId:       `${block}-${row}-${seatNumber}`,
        walletAddress: verifiedWalletAddress,
        price:        Number(price),
        purchaseType: 'PRIMARY',
        gameDate:     gameRow?.game_date || '',
      });

      // Fabric 예약 레코드 (1차 구매 = 일반 예약)
      const userDidHash    = fabricService.hashDid(walletAddress);
      const reservationId  = uuidv4();
      await fabricService.createReservation({
        reservationId,
        userDidHash,
        gameId:      String(gameId),
        raffleNftId: '',
        isPriority:  false,
      });
      await fabricService.confirmReservation({ reservationId, ticketId: result.id });
    } catch (fabErr) {
      console.error('[ticket] Fabric registerTicket/reservation 실패 (무시):', fabErr.message);
    }

    res.json({
      success: true,
      data: { ...result, ticketTokenId, ticketTxHash, boxTxHash },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "티켓 구매 실패" });
  }
});

// ─── QR 발급 ──────────────────────────────────────────────
router.get("/:ticketId/qr", async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { walletAddress } = req.query;

    if (!walletAddress) {
      return res.status(400).json({ available: false, message: "지갑 주소가 필요합니다" });
    }

    // 티켓 + 경기 정보 조회
    const [rows] = await _pool.query(
      `SELECT t.*, g.game_date, g.game_time
       FROM tickets t
       LEFT JOIN games g ON t.game_id = g.id
       WHERE t.id = ? AND t.wallet_address = ?`,
      [ticketId, walletAddress],
    );

    if (rows.length === 0) {
      return res.status(404).json({ available: false, message: "티켓을 찾을 수 없습니다" });
    }

    const ticket = rows[0];

    // 티켓 상태 확인
    if (ticket.status === "used") {
      return res.json({ available: false, message: "이미 사용된 티켓입니다" });
    }

    // 경기 정보 없음 → QR 불가
    if (!ticket.game_date || !ticket.game_time) {
      return res.json({ available: false, message: "경기 정보를 찾을 수 없습니다" });
    }

    // 경기 시작 시간 계산
    const gameDate    = ticket.game_date instanceof Date
      ? [
          ticket.game_date.getFullYear(),
          String(ticket.game_date.getMonth() + 1).padStart(2, "0"),
          String(ticket.game_date.getDate()).padStart(2, "0"),
        ].join("-")
      : String(ticket.game_date).slice(0, 10);
    const gameTime    = String(ticket.game_time).slice(0, 8);
    const gameDateTime = new Date(`${gameDate}T${gameTime}+09:00`);

    // 날짜 파싱 실패 → QR 불가
    if (isNaN(gameDateTime.getTime())) {
      return res.json({ available: false, message: "경기 시간 정보가 올바르지 않습니다" });
    }

    const nowMs          = getNowMs();
    const msUntilGame    = gameDateTime.getTime() - nowMs;
    const hoursUntilGame = msUntilGame / (1000 * 60 * 60);

    // 경기 시작 2시간 전부터만 QR 활성화
    if (hoursUntilGame > 2) {
      return res.json({
        available: false,
        message:   "경기 시작 2시간 전부터 QR 조회 가능",
      });
    }

    // 경기 종료 후 2시간 이상 지난 경우
    if (hoursUntilGame < -2) {
      return res.json({ available: false, message: "경기가 종료되었습니다" });
    }

    // QR 토큰 생성 (1분 슬롯 기반)
    const slot             = getCurrentSlot(nowMs);
    const qrToken          = generateQRToken(ticketId, slot);
    const slotEndMs        = (slot + 1) * 60 * 1000;
    const remainingSeconds = Math.max(1, Math.ceil((slotEndMs - nowMs) / 1000));

    res.json({
      available:        true,
      qrToken,
      expiresAt:        new Date(slotEndMs).toISOString(),
      remainingSeconds,
      message:          "QR 조회 가능",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ available: false, message: "QR 조회 실패" });
  }
});

// ─── 토스페이 결제 확인 + 티켓 발급 ──────────────────────────
router.post("/toss/confirm", requireAuth, requireVerifiedDidForWallet, async (req, res) => {
  const {
    paymentKey, orderId, amount,
    walletAddress, gameId, stadium, grade, block, seats,
  } = req.body;

  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ success: false, message: "paymentKey, orderId, amount는 필수입니다" });
  }
  if (!walletAddress || !gameId || !grade || !block || !Array.isArray(seats) || seats.length === 0) {
    return res.status(400).json({ success: false, message: "티켓 정보가 누락되었습니다" });
  }

  const verifiedWalletAddress = req.verifiedWalletAddress || String(walletAddress).toLowerCase();

  // 1. 토스페이 결제 승인
  const tossResult = await confirmPayment({ paymentKey, orderId, amount });
  if (!tossResult.success) {
    return res.status(400).json({ success: false, message: `결제 승인 실패: ${tossResult.message}` });
  }

  const [[gameRow]] = await _pool.query(
    `SELECT DATE_FORMAT(game_date, '%Y-%m-%d') AS game_date, home_team, away_team FROM games WHERE id = ?`,
    [gameId]
  );

  const ticketResults = [];

  try {
    // Phase 1: 모든 좌석 DB 저장 (순서대로, 빠름)
    const ticketRows = [];
    for (const seat of seats) {
      const { row, seatNumber, price } = seat;
      const ticketResult = await purchaseTicket(_pool, {
        walletAddress: verifiedWalletAddress,
        gameId, stadium, grade, block, row, seatNumber, price,
      });
      await _pool.query("UPDATE tickets SET payment_key = ? WHERE id = ?", [paymentKey, ticketResult.id]);
      ticketRows.push({ ticketId: ticketResult.id, row, seatNumber, price });
    }

    // Phase 2: NFT 민팅 병렬 처리
    // nftService.getNextNonce()가 뮤텍스로 nonce를 순차 할당하므로 충돌 없이 병렬 실행 가능
    let mintedResults;
    try {
      mintedResults = await Promise.all(
        ticketRows.map(({ ticketId, row, seatNumber, price }) =>
          mintTicketOnChain(verifiedWalletAddress, {
            gameId:        String(gameId),
            gameDate:      gameRow?.game_date || '',
            homeTeam:      gameRow?.home_team || '',
            awayTeam:      gameRow?.away_team || '',
            seatSection:   `${block}-${row}-${seatNumber}`,
            originalPrice: Number(price),
          }).then(async (mintResult) => {
            await _pool.query(
              "UPDATE tickets SET token_id = ?, ticket_tx_hash = ? WHERE id = ?",
              [mintResult.tokenId, mintResult.txHash, ticketId]
            );
            return { ticketId, tokenId: mintResult.tokenId, txHash: mintResult.txHash };
          })
        )
      );
    } catch (mintErr) {
      console.error('[toss] NFT 민팅 실패:', mintErr.message);
      await cancelPayment({ paymentKey, cancelReason: 'NFT 발급 실패로 인한 자동 환불', cancelAmount: amount }).catch(() => {});
      const placeholders = ticketRows.map(() => '?').join(',');
      await _pool.query(
        `UPDATE tickets SET status = 'cancelled' WHERE id IN (${placeholders})`,
        ticketRows.map(r => r.ticketId)
      ).catch(() => {});
      return res.status(500).json({ success: false, message: 'NFT 발급 실패로 자동 환불되었습니다' });
    }

    ticketResults.push(...mintedResults);

    // Phase 3: Fabric 등록 병렬 처리 (nonce 없음 — 동시 실행 안전, 실패해도 무시)
    const { v4: uuidv4 } = require('uuid');
    await Promise.allSettled(
      mintedResults.map(({ ticketId, tokenId }, i) => {
        const { row, seatNumber, price } = ticketRows[i];
        return fabricService.registerTicket({
          ticketId,
          tokenId:       String(tokenId || '0'),
          gameId:        String(gameId),
          seatId:        `${block}-${row}-${seatNumber}`,
          walletAddress: verifiedWalletAddress,
          price:         Number(price),
          purchaseType:  'PRIMARY',
          gameDate:      gameRow?.game_date || '',
        }).then(async () => {
          const userDidHash = fabricService.hashDid ? fabricService.hashDid(verifiedWalletAddress) : '';
          if (userDidHash) {
            const reservationId = uuidv4();
            await fabricService.createReservation({
              reservationId, userDidHash, gameId: String(gameId), raffleNftId: '', isPriority: false,
            });
            await fabricService.confirmReservation({ reservationId, ticketId });
          }
        }).catch(fabErr => {
          console.error('[toss] Fabric 등록 실패 (무시):', fabErr.message);
        });
      })
    );

    // 6. 박스 NFT 지급 (좌석 수만큼)
    let boxTxHash = null;
    try {
      const [[walletRow]] = await _pool.query(
        'SELECT user_id FROM user_wallets WHERE wallet_address = ?',
        [verifiedWalletAddress]
      );
      if (walletRow) {
        await _pool.query(
          `INSERT INTO user_boxes (user_id, season_count) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE season_count = season_count + ?`,
          [walletRow.user_id, seats.length, seats.length]
        );
        if (process.env.MINTER_PRIVATE_KEY && process.env.BOX_NFT_ADDRESS) {
          boxTxHash = await mintBoxOnChain(verifiedWalletAddress);
        }
      }
    } catch (boxErr) {
      console.error('[toss] 박스 지급 실패 (무시):', boxErr.message);
    }

    res.json({ success: true, data: { tickets: ticketResults, boxTxHash, paymentKey } });

  } catch (err) {
    console.error('[toss/confirm]', err);
    if (ticketResults.length === 0) {
      await cancelPayment({ paymentKey, cancelReason: '티켓 저장 실패로 인한 자동 환불', cancelAmount: amount }).catch(() => {});
    }
    res.status(500).json({ success: false, message: err.message || '티켓 발급 실패' });
  }
});

// tokenId 업데이트 (MetaMask 민팅 완료 후 호출)
router.patch("/:id/token", async (req, res) => {
  const { tokenId, txHash } = req.body;
  const { id } = req.params;
  if (tokenId == null) return res.status(400).json({ success: false, message: "tokenId가 필요합니다" });
  try {
    await _pool.query(
      "UPDATE tickets SET token_id = ?, ticket_tx_hash = ? WHERE id = ?",
      [tokenId, txHash ?? null, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "tokenId 업데이트 실패" });
  }
});

module.exports = { router, setPool };
