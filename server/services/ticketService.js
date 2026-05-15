const { randomUUID: uuidv4 } = require("crypto");

const PLATFORM_FEE_RATE = 0.03; // 3% 서비스 이용료

async function purchaseTicket(pool, {
  walletAddress,
  gameId,
  stadium,
  grade,
  block,
  row,
  seatNumber,
  price,
}) {
  // 1. 좌석 중복 확인
  const [existing] = await pool.query(
    "SELECT id FROM tickets WHERE game_id = ? AND block = ? AND row_num = ? AND seat_number = ?",
    [gameId, block, row, seatNumber],
  );

  if (existing.length > 0) {
    throw new Error("이미 예매된 좌석입니다");
  }

  // 2. 수수료 계산
  const ticketPrice  = Number(price);
  const platformFee  = Math.round(ticketPrice * PLATFORM_FEE_RATE);
  const totalCharged = ticketPrice + platformFee;

  // 3. DB에 티켓 저장 (price = 티켓 원가, 수수료 별도)
  const id = uuidv4();
  await pool.query(
    `INSERT INTO tickets (id, wallet_address, game_id, stadium, grade, block, row_num, seat_number, price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, walletAddress, gameId, stadium, grade, block, row, seatNumber, ticketPrice],
  );

  return {
    id,
    walletAddress,
    gameId,
    stadium,
    grade,
    block,
    row,
    seatNumber,
    price: ticketPrice,
    platformFee,
    totalCharged,
    status: "confirmed",
  };
}

module.exports = { purchaseTicket };
