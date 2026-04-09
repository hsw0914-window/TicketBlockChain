require('dotenv').config();
const mysql = require("mysql2/promise");

const DB_CONFIG = {
  host: "localhost",
  user: "root",
  password: process.env.DB_PASSWORD || "",
  multipleStatements: true,
};

const DB_NAME = "ticketblockchain";

// ─── 시드 데이터 ──────────────────────────────────────────

const SEED_USERS = [
  { user_id: "admin_01",  nickname: "BASE NINE 운영팀" },
  { user_id: "user_bh",   nickname: "Baseball Hunter" },
  { user_id: "user_tm",   nickname: "Ticket Mint" },
  { user_id: "viewer",    nickname: "나" },
];

const SEED_POSTS = [
  {
    user_id:  "user_bh",
    title:    "2026 개막 시리즈 1루 지정석 양도합니다",
    excerpt:  "개인 사정으로 못 가게 됐어요. 정가 양도합니다. 자세한 건 댓글로요.",
    content:  "개인 사정으로 개막 시리즈 2경기를 못 가게 됐습니다.\n1루 지정석 2연석이고 정가 그대로 양도합니다.\n직거래 또는 플랫폼 내 공식 양도 방식으로 진행할게요.\n댓글이나 쪽지 주세요.",
    category: "ticket",
  },
  {
    user_id:  "viewer",
    title:    "잠실 주말 경기 티켓 급하게 구합니다",
    excerpt:  "이번 주말 잠실 경기 티켓 1장만 구합니다. 구역 상관없어요.",
    content:  "이번 주말 잠실 경기 갑자기 같이 가게 됐는데 티켓이 1장 부족합니다.\n구역은 상관없고 1장만 구합니다.\n연락 주시면 바로 확인할게요.",
    category: "ticket",
  },
  {
    user_id:  "user_tm",
    title:    "두산 홈런볼 카드 18,500원에 올렸어요",
    excerpt:  "현재 마켓 최저가 근처입니다. 거래량 붙는 거 확인하고 올렸어요.",
    content:  "두산 홈런볼 카드 1장을 18,500원에 등록했습니다.\n현재 최저가 근처라서 빠르게 나갈 것 같아요.\n거래량이 붙는 타이밍이라 관심 있으신 분은 바로 확인해 보세요.",
    category: "fragment",
  },
  {
    user_id:  "user_bh",
    title:    "LG 승리 배지 2개 세트로 판매합니다",
    excerpt:  "따로 팔기엔 애매해서 2개 묶음으로 올립니다. 합리적인 가격으로.",
    content:  "LG 승리 배지가 2개 있는데 1개짜리 매물이 너무 많아서 2개 묶어서 올립니다.\n개별 최저가 합산보다 조금 낮게 책정했어요.\n관심 있으신 분 댓글 주세요.",
    category: "fragment",
  },
  {
    user_id:  "admin_01",
    title:    "직관 처음 가는데 뭐 챙겨야 하나요?",
    excerpt:  "이번 시즌 처음으로 직관 갑니다. 선배 팬분들 조언 부탁드려요.",
    content:  "야구 직관은 처음인데 이번 주말에 처음 가게 됐습니다.\n응원 도구는 현장에서 사도 되나요? 음식 반입은 어떻게 되는지, 자리에 일찍 가야 하는지도 궁금합니다.\n경험 많으신 분들 조언 부탁드립니다.",
    category: "baseball",
  },
  {
    user_id:  "user_tm",
    title:    "롯데 원정 응원 분위기 어떤가요?",
    excerpt:  "부산 사직 말고 원정 응원 가보신 분 후기 궁금합니다.",
    content:  "평소에 사직 홈경기 위주로 봤는데 이번엔 원정 응원을 가보려고 합니다.\n원정 응원석 분위기나 주의할 점 있으면 알려주세요.\n잠실 원정 응원 가보신 분 계신가요?",
    category: "baseball",
  },
  {
    user_id:  "user_bh",
    title:    "개막 이후 카드 시세 흐름 패턴 정리",
    excerpt:  "매년 반복되는 개막 직후 시세 흐름을 정리해봤습니다.",
    content:  "개막 시리즈가 끝나고 나면 카드 시세가 일정한 패턴을 보이더라고요.\n1. 개막 직후 2~3일은 거래량이 급등하고 가격도 같이 오릅니다.\n2. 첫 주 후반부터 매물이 쌓이면서 횡보 구간이 옵니다.\n3. 첫 주말 홈경기 공지가 붙으면 다시 한 번 단기 급등 가능성이 있습니다.\n이 흐름을 활용해서 1~2번 구간에 매수, 3번 구간에 매도하는 게 가장 무난했습니다.",
    category: "strategy",
  },
  {
    user_id:  "user_tm",
    title:    "팬팩 개봉 직후 바로 팔면 손해인 이유",
    excerpt:  "개봉 직후 매물이 몰리면서 가격이 일시적으로 내려가는 구간이 있어요.",
    content:  "팬팩 개봉 이벤트가 있는 날은 많은 사람이 동시에 개봉하면서 매물이 한꺼번에 쏟아집니다.\n이때 바로 올리면 최저가 경쟁에 끌려다니게 돼요.\n개인적으로는 개봉 당일보다 1~2일 후에 올리는 게 체감 정산가가 더 좋았습니다.\n급하게 팔 이유가 없다면 하루 기다려보는 걸 추천합니다.",
    category: "strategy",
  },
];

const SEED_COMMENTS = [
  {
    post_title: "직관 처음 가는데 뭐 챙겨야 하나요?",
    user_id:    "user_bh",
    content:    "응원 도구는 현장에서 사도 되는데 줄이 길 수 있어요. 미리 구매해두는 게 편합니다.",
  },
  {
    post_title: "직관 처음 가는데 뭐 챙겨야 하나요?",
    user_id:    "viewer",
    content:    "음식 반입은 구장마다 다른데 잠실은 외부 음식 반입이 어느 정도 됩니다.",
  },
  {
    post_title: "개막 이후 카드 시세 흐름 패턴 정리",
    user_id:    "user_tm",
    content:    "정리 감사해요. 저도 비슷한 흐름 느꼈는데 이렇게 정리해주시니 이해가 쉽네요.",
  },
];

// ─── 초기화 함수 ──────────────────────────────────────────

async function initDB() {
  const conn = await mysql.createConnection(DB_CONFIG);

  // ✅ DROP 제거 — DB가 없을 때만 생성
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`
  );
  await conn.query(`USE \`${DB_NAME}\``);

  // ─── 기존 테이블 (IF NOT EXISTS) ──────────────────────

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id       VARCHAR(50)  PRIMARY KEY,
      nickname      VARCHAR(50)  NOT NULL,
      email         VARCHAR(255) UNIQUE DEFAULT NULL,
      password_hash VARCHAR(255) DEFAULT NULL,
      login_type    ENUM('local','google') NOT NULL DEFAULT 'local',
      google_id     VARCHAR(255) UNIQUE DEFAULT NULL,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ─── 기존 users 테이블에 새 컬럼 마이그레이션 ────────
  // 이미 있는 컬럼은 무시하고, 없는 컬럼만 추가
  const newColumns = [
    `ALTER TABLE users ADD COLUMN email         VARCHAR(255) UNIQUE DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN login_type    ENUM('local','google') NOT NULL DEFAULT 'local'`,
    `ALTER TABLE users ADD COLUMN google_id     VARCHAR(255) UNIQUE DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN profile_image VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN is_active     TINYINT(1) NOT NULL DEFAULT 1`,
  ];
  for (const sql of newColumns) {
    try {
      await conn.query(sql);
    } catch (e) {
      // 이미 존재하는 컬럼이면 에러 코드 1060 → 무시
      if (e.errno !== 1060) throw e;
    }
  }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS posts (
      post_id    INT          PRIMARY KEY AUTO_INCREMENT,
      user_id    VARCHAR(50)  NOT NULL,
      title      VARCHAR(255) NOT NULL,
      excerpt    TEXT,
      content    TEXT         NOT NULL,
      category   ENUM('ticket','fragment','baseball','strategy') NOT NULL,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      view_count INT          NOT NULL DEFAULT 0,
      like_count INT          NOT NULL DEFAULT 0,
      hidden     BOOLEAN      NOT NULL DEFAULT FALSE,
      deleted    BOOLEAN      NOT NULL DEFAULT FALSE,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS comments (
      comment_id INT          PRIMARY KEY AUTO_INCREMENT,
      post_id    INT          NOT NULL,
      user_id    VARCHAR(50)  NOT NULL,
      content    TEXT         NOT NULL,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      parent_id  INT          DEFAULT NULL,
      hidden     BOOLEAN      NOT NULL DEFAULT FALSE,
      deleted    BOOLEAN      NOT NULL DEFAULT FALSE,
      FOREIGN KEY (post_id)   REFERENCES posts(post_id),
      FOREIGN KEY (user_id)   REFERENCES users(user_id),
      FOREIGN KEY (parent_id) REFERENCES comments(comment_id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS post_likes (
      user_id    VARCHAR(50)  NOT NULL,
      post_id    INT          NOT NULL,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, post_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (post_id) REFERENCES posts(post_id)
    )
  `);

  // ─── 신규 테이블 ───────────────────────────────────────

  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_wallets (
      wallet_id      INT          PRIMARY KEY AUTO_INCREMENT,
      user_id        VARCHAR(50)  NOT NULL,
      wallet_address VARCHAR(42)  NOT NULL,
      nonce          VARCHAR(100) DEFAULT NULL,
      is_verified    BOOLEAN      NOT NULL DEFAULT FALSE,
      connected_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      verified_at    DATETIME     DEFAULT NULL,
      UNIQUE KEY uq_user_wallet (user_id),
      UNIQUE KEY uq_wallet_addr (wallet_address),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS did_verifications (
      did_id         INT          PRIMARY KEY AUTO_INCREMENT,
      user_id        VARCHAR(50)  NOT NULL,
      did_value      VARCHAR(255) NOT NULL,
      wallet_address VARCHAR(42)  NOT NULL,
      last_signature TEXT         DEFAULT NULL,
      status         ENUM('pending','verified','revoked') NOT NULL DEFAULT 'pending',
      verified_at    DATETIME     DEFAULT NULL,
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_did (user_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);

  // ─── 시드: 테이블이 비어있을 때만 삽입 ──────────────────

  const [[{ cnt }]] = await conn.query("SELECT COUNT(*) AS cnt FROM users");
  if (cnt === 0) {
    for (const user of SEED_USERS) {
      await conn.query(
        "INSERT INTO users (user_id, nickname) VALUES (?, ?)",
        [user.user_id, user.nickname]
      );
    }

    for (const post of SEED_POSTS) {
      await conn.query(
        "INSERT INTO posts (user_id, title, excerpt, content, category) VALUES (?, ?, ?, ?, ?)",
        [post.user_id, post.title, post.excerpt, post.content, post.category]
      );
    }

    for (const comment of SEED_COMMENTS) {
      const [[post]] = await conn.query(
        "SELECT post_id FROM posts WHERE title = ?",
        [comment.post_title]
      );
      if (!post) continue;
      await conn.query(
        "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
        [post.post_id, comment.user_id, comment.content]
      );
    }

    console.log("✅ 시드 데이터 삽입 완료");
  }

  await conn.end();
  console.log("✅ DB 초기화 완료");
}

module.exports = { initDB, DB_NAME, DB_CONFIG };
