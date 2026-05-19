require('dotenv').config();

// 필수 보안 환경변수 미설정 시 서버 시작 거부
for (const key of ['JWT_SECRET', 'QR_SECRET']) {
  if (!process.env[key]) {
    console.error(`[startup] 필수 환경변수 미설정: ${key} — server/.env 를 확인하세요`);
    process.exit(1);
  }
}

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const { initDB, DB_NAME, DB_CONFIG } = require("./db/init");

const authMiddleware = require('./middleware/auth');
const authRoute      = require('./routes/auth');
const walletRoute    = require('./routes/wallet');
const didRoute       = require('./routes/did');
const ticketRoute    = require('./routes/ticket');
const myTicketRoute  = require('./routes/myTicket');
const noticeRoute    = require('./routes/notice');
const combineRoute   = require('./routes/combine');
const marketRoute       = require('./routes/market');
const ticketResaleRoute = require('./routes/ticketResale');
const txHistoryRoute    = require('./routes/txHistory');
const entryRoute        = require('./routes/entryRoutes');
const pointRoute        = require('./routes/pointRoutes');
const refundRoute       = require('./routes/refundRoutes');
const settlementRoute   = require('./routes/settlementRoutes');
const raffleRoute       = require('./routes/raffleRoutes');
const mockFabric        = require('./services/fabricBridge');

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];
    // ngrok / 외부 접속 허용 (개발 환경)
    if (!origin || allowed.includes(origin) ||
        origin.endsWith('.ngrok-free.app') ||
        origin.endsWith('.ngrok-free.dev') ||
        origin.endsWith('.ngrok.io')) {
      return callback(null, true);
    }
    // 로컬 네트워크 IP 허용 (192.168.x.x, 10.x.x.x, 172.x.x.x)
    if (/^https?:\/\/(192\.168\.|10\.|172\.)/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS 차단: ' + origin));
  },
  credentials: true,
}));
app.use(express.json());

let pool;

// ─── 서버 시작 ────────────────────────────────────────────

async function start() {
  await initDB();

  pool = mysql.createPool({ ...DB_CONFIG, database: DB_NAME });

  // 테스트 계정 Fabric 포인트/멤버십 사전 세팅 (DB 실제 지갑 주소 기준)
  const seedWallets = ['0x15f7cc396e4C66296cE92225830e24f491941Fc2'];
  try {
    const [[row]] = await pool.query(
      "SELECT wallet_address FROM user_wallets WHERE user_id = 'test_user'"
    );
    if (row?.wallet_address && !seedWallets.includes(row.wallet_address)) {
      seedWallets.push(row.wallet_address);
    }
  } catch (_) {}
  for (const walletAddress of seedWallets) {
    mockFabric.seedUser({ walletAddress, pointBalance: 10000, totalEarned: 15000, totalUsed: 5000, entryCount: 7 });
  }
  console.log(`[Seed] 포인트 시드 완료: ${seedWallets.join(', ')}`);

  // pool 주입
  authMiddleware.setPool(pool);
  authRoute.setPool(pool);
  walletRoute.setPool(pool);
  didRoute.setPool(pool);
  ticketRoute.setPool(pool);
  myTicketRoute.setPool(pool);
  noticeRoute.setPool(pool);
  combineRoute.setPool(pool);
  marketRoute.setPool(pool);
  ticketResaleRoute.setPool(pool);
  txHistoryRoute.setPool(pool);
  entryRoute.setPool(pool);
  pointRoute.setPool(pool);
  refundRoute.setPool(pool);
  settlementRoute.setPool(pool);
  raffleRoute.setPool(pool);

  // ─── 신규 라우트 ────────────────────────────────────────
  app.use('/api/auth',       authRoute.router);
  app.use('/api/wallet',     walletRoute.router);
  app.use('/api/did',        didRoute.router);
  app.use('/api/tickets',    ticketRoute.router);
  app.use('/api/my-tickets', myTicketRoute.router);
  app.use('/api/notices',    noticeRoute.router);
  app.use('/api',            combineRoute.router);
  app.use('/api/market',        marketRoute.router);
  app.use('/api/ticket-resale', ticketResaleRoute.router);
  app.use('/api/tx-history',   txHistoryRoute.router);
  app.use('/api/entry',        entryRoute.router);
  app.use('/api/points',       pointRoute.router);
  app.use('/api/refunds',      refundRoute.router);
  app.use('/api/settlements',  settlementRoute.router);
  app.use('/api/raffle',       raffleRoute.router);

  // 업로드 이미지 정적 서빙
  app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

  // ─── 기존 게시판 라우트 ─────────────────────────────────

  app.get("/api/users", async (req, res) => {
    const [rows] = await pool.query("SELECT user_id, nickname FROM users");
    res.json(rows);
  });

  app.get("/api/posts", async (req, res) => {
    const [rows] = await pool.query(`
      SELECT p.*, u.nickname AS author_nickname
      FROM posts p
      JOIN users u ON p.user_id = u.user_id
      WHERE p.deleted = FALSE
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
  });

  app.get("/api/posts/:id", async (req, res) => {
    await pool.query(
      "UPDATE posts SET view_count = view_count + 1 WHERE post_id = ?",
      [req.params.id]
    );
    const [[row]] = await pool.query(
      `SELECT p.*, u.nickname AS author_nickname
       FROM posts p JOIN users u ON p.user_id = u.user_id
       WHERE p.post_id = ? AND p.deleted = FALSE`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: "게시글 없음" });
    res.json(row);
  });

  app.post("/api/posts", async (req, res) => {
    const { user_id, title, excerpt, content, category } = req.body;
    if (!user_id || !title || !content || !category)
      return res.status(400).json({ error: "필수 항목 누락" });

    const [result] = await pool.query(
      "INSERT INTO posts (user_id, title, excerpt, content, category) VALUES (?, ?, ?, ?, ?)",
      [user_id, title, excerpt ?? "", content, category]
    );
    const [[newPost]] = await pool.query(
      "SELECT * FROM posts WHERE post_id = ?",
      [result.insertId]
    );
    res.status(201).json(newPost);
  });

  app.put("/api/posts/:id", async (req, res) => {
    const { title, excerpt, content, category } = req.body;
    await pool.query(
      "UPDATE posts SET title=?, excerpt=?, content=?, category=? WHERE post_id=?",
      [title, excerpt, content, category, req.params.id]
    );
    const [[updated]] = await pool.query(
      "SELECT * FROM posts WHERE post_id = ?",
      [req.params.id]
    );
    res.json(updated);
  });

  app.delete("/api/posts/:id", async (req, res) => {
    await pool.query(
      "UPDATE posts SET deleted = TRUE WHERE post_id = ?",
      [req.params.id]
    );
    res.json({ ok: true });
  });

  app.post("/api/posts/:id/like", async (req, res) => {
    const { user_id } = req.body;
    const postId = req.params.id;

    const [[existing]] = await pool.query(
      "SELECT * FROM post_likes WHERE user_id=? AND post_id=?",
      [user_id, postId]
    );

    if (existing) {
      await pool.query("DELETE FROM post_likes WHERE user_id=? AND post_id=?", [user_id, postId]);
      await pool.query("UPDATE posts SET like_count = like_count - 1 WHERE post_id=?", [postId]);
      res.json({ liked: false });
    } else {
      await pool.query("INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)", [user_id, postId]);
      await pool.query("UPDATE posts SET like_count = like_count + 1 WHERE post_id=?", [postId]);
      res.json({ liked: true });
    }
  });

  app.get("/api/posts/:id/comments", async (req, res) => {
    const [rows] = await pool.query(
      `SELECT c.*, u.nickname AS author_nickname
       FROM comments c JOIN users u ON c.user_id = u.user_id
       WHERE c.post_id = ? AND c.deleted = FALSE
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  });

  app.post("/api/posts/:id/comments", async (req, res) => {
    const { user_id, content, parent_id } = req.body;
    if (!user_id || !content)
      return res.status(400).json({ error: "필수 항목 누락" });

    const [result] = await pool.query(
      "INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)",
      [req.params.id, user_id, content, parent_id ?? null]
    );
    const [[newComment]] = await pool.query(
      "SELECT * FROM comments WHERE comment_id = ?",
      [result.insertId]
    );
    res.status(201).json(newComment);
  });

  app.delete("/api/comments/:id", async (req, res) => {
    await pool.query(
      "UPDATE comments SET deleted = TRUE WHERE comment_id = ?",
      [req.params.id]
    );
    res.json({ ok: true });
  });

  app.get("/api/comments", async (req, res) => {
    const [rows] = await pool.query(
      `SELECT c.*, u.nickname AS author_nickname
       FROM comments c JOIN users u ON c.user_id = u.user_id
       WHERE c.deleted = FALSE
       ORDER BY c.created_at ASC`
    );
    res.json(rows);
  });

  app.listen(process.env.PORT || 4000, () => {
    console.log(`🚀 서버 실행 중: http://localhost:${process.env.PORT || 4000}`);
  });
}

start().catch((err) => {
  console.error("❌ 서버 시작 실패:", err);
  process.exit(1);
});
