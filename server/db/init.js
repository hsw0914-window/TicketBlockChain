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
  { user_id: "admin_01",  nickname: "BASE CHAIN 운영팀" },
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
    title:    "KIA 나성범 사인볼 파편 26,000원에 올렸어요",
    excerpt:  "현재 마켓 최저가 근처입니다. 거래량 붙는 거 확인하고 올렸어요.",
    content:  "KIA 나성범 사인볼 파편 1개를 26,000원에 등록했습니다.\n현재 최저가 근처라서 빠르게 나갈 것 같아요.\n거래량이 붙는 타이밍이라 관심 있으신 분은 바로 확인해 보세요.",
    category: "fragment",
  },
  {
    user_id:  "user_bh",
    title:    "LG 트윈스 야구배트 파편 2개 세트로 판매합니다",
    excerpt:  "따로 팔기엔 애매해서 2개 묶음으로 올립니다. 합리적인 가격으로.",
    content:  "LG 트윈스 야구배트 파편이 2개 있는데 1개짜리 매물이 너무 많아서 2개 묶어서 올립니다.\n개별 최저가 합산보다 조금 낮게 책정했어요.\n관심 있으신 분 댓글 주세요.",
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

const SEED_STADIUMS = [
  { id: "jamsil",  name: "잠실야구장",              location: "서울특별시 송파구",   capacity: 25000 },
  { id: "sajik",   name: "사직야구장",              location: "부산광역시 동래구",   capacity: 24000 },
  { id: "munhak",  name: "인천SSG랜더스필드",        location: "인천광역시 미추홀구", capacity: 23000 },
  { id: "gochuck", name: "고척스카이돔",             location: "서울특별시 구로구",   capacity: 16744 },
  { id: "gwangju", name: "광주-기아 챔피언스 필드",  location: "광주광역시 북구",     capacity: 20000 },
  { id: "daejeon", name: "한화생명 이글스파크",      location: "대전광역시 중구",     capacity: 13000 },
];

const SEED_GAMES = [
  { id: "G001", home_team: "두산", away_team: "LG",   game_date: "2026-05-20", game_time: "18:30:00", stadium_id: "jamsil",  status: "OPEN",     base_price: 13000, booking_open_at: "2026-05-15 10:00:00", raffle_open_at: "2026-05-15 08:00:00", raffle_winners_count: 5 },
  { id: "G002", home_team: "삼성", away_team: "KT",   game_date: "2026-05-20", game_time: "18:30:00", stadium_id: "munhak",  status: "ALMOST",   base_price: 13000, booking_open_at: "2026-05-15 10:00:00", raffle_open_at: "2026-05-15 08:00:00", raffle_winners_count: 5 },
  { id: "G003", home_team: "롯데", away_team: "NC",   game_date: "2026-05-20", game_time: "14:00:00", stadium_id: "sajik",   status: "SOLDOUT",  base_price: 13000, booking_open_at: "2026-05-15 10:00:00", raffle_open_at: "2026-05-15 08:00:00", raffle_winners_count: 5 },
  { id: "G004", home_team: "삼성", away_team: "LG",   game_date: "2026-05-21", game_time: "18:30:00", stadium_id: "jamsil",  status: "UPCOMING", base_price: 13000, booking_open_at: "2026-05-19 10:00:00", raffle_open_at: "2026-05-19 08:00:00", raffle_winners_count: 5 },
  { id: "G005", home_team: "키움", away_team: "한화", game_date: "2026-05-21", game_time: "18:30:00", stadium_id: "gochuck", status: "UPCOMING", base_price: 13000, booking_open_at: "2026-05-19 10:00:00", raffle_open_at: "2026-05-19 08:00:00", raffle_winners_count: 5 },
  { id: "G006", home_team: "KIA",  away_team: "두산", game_date: "2026-05-24", game_time: "14:00:00", stadium_id: "gwangju", status: "UPCOMING", base_price: 13000, booking_open_at: "2026-05-22 10:00:00", raffle_open_at: "2026-05-22 08:00:00", raffle_winners_count: 5 },
  { id: "G007", home_team: "LG",   away_team: "NC",   game_date: "2026-05-25", game_time: "18:30:00", stadium_id: "jamsil",  status: "UPCOMING", base_price: 13000, booking_open_at: "2026-05-22 10:00:00", raffle_open_at: "2026-05-22 08:00:00", raffle_winners_count: 5 },
  { id: "G008", home_team: "한화", away_team: "SSG",  game_date: "2026-05-25", game_time: "18:30:00", stadium_id: "daejeon", status: "UPCOMING", base_price: 13000, booking_open_at: "2026-05-22 10:00:00", raffle_open_at: "2026-05-22 08:00:00", raffle_winners_count: 5 },
  { id: "G009", home_team: "두산", away_team: "키움", game_date: "2026-05-28", game_time: "18:30:00", stadium_id: "jamsil",  status: "UPCOMING", base_price: 13000, booking_open_at: "2026-05-26 10:00:00", raffle_open_at: "2026-05-26 08:00:00", raffle_winners_count: 5 },
  { id: "G010", home_team: "KIA",  away_team: "롯데", game_date: "2026-05-31", game_time: "14:00:00", stadium_id: "sajik",   status: "UPCOMING", base_price: 13000, booking_open_at: "2026-05-28 10:00:00", raffle_open_at: "2026-05-28 08:00:00", raffle_winners_count: 5 },
];

// ─── 초기화 함수 ──────────────────────────────────────────

async function initDB() {
  const conn = await mysql.createConnection(DB_CONFIG);

  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`
  );
  await conn.query(`USE \`${DB_NAME}\``);

  const shouldReset = process.env.RESET_DB === "true";
  const [existingUserTables] = await conn.query(`SHOW TABLES LIKE 'users'`);
  if (existingUserTables.length > 0 && !shouldReset) {
    // 기존 DB에 마이그레이션만 실행
    const [tierCol] = await conn.query(`SHOW COLUMNS FROM users LIKE 'membership_tier'`);
    if (tierCol.length === 0) {
      await conn.query(`ALTER TABLE users ADD COLUMN membership_tier ENUM('일반','브론즈','실버','골드') NOT NULL DEFAULT '일반'`);
      console.log("✅ membership_tier 컬럼 추가 완료");
    }
    const [earlyAccessRow] = await conn.query(`SELECT id FROM fragment_types WHERE id = 'early-access-pass'`);
    if (earlyAccessRow.length === 0) {
      await conn.query(
        `INSERT INTO fragment_types (id, onchain_id, family, team, name, result_name, image_url, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['early-access-pass', 99, 'raffle', '플랫폼', '응모권', '응모권', 'https://images.unsplash.com/photo-1518688248740-7c31f1a945c4?w=400&q=80', '티어업 보상으로 지급되는 응모권 NFT']
      );
      console.log("✅ early-access-pass fragment_type 추가 완료");
    }
    // game_raffle_entries 테이블 마이그레이션
    const [raffleTable] = await conn.query(`SHOW TABLES LIKE 'game_raffle_entries'`);
    if (raffleTable.length === 0) {
      await conn.query(`
        CREATE TABLE game_raffle_entries (
          id           INT          PRIMARY KEY AUTO_INCREMENT,
          user_id      VARCHAR(50)  NOT NULL,
          game_id      VARCHAR(50)  NOT NULL,
          tickets_used INT          NOT NULL DEFAULT 1,
          status       ENUM('applied','won','lost') NOT NULL DEFAULT 'applied',
          applied_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_user_game (user_id, game_id),
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
          FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
        )
      `);
      console.log("✅ game_raffle_entries 테이블 생성 완료");
    } else {
      // tickets_used 컬럼 마이그레이션
      const [ticketsUsedCol] = await conn.query(`SHOW COLUMNS FROM game_raffle_entries LIKE 'tickets_used'`);
      if (ticketsUsedCol.length === 0) {
        await conn.query(`ALTER TABLE game_raffle_entries ADD COLUMN tickets_used INT NOT NULL DEFAULT 1 AFTER game_id`);
        console.log("✅ game_raffle_entries.tickets_used 컬럼 추가 완료");
      }
    }
    // booking_open_at 컬럼 마이그레이션
    const [bookingCol] = await conn.query(`SHOW COLUMNS FROM games LIKE 'booking_open_at'`);
    if (bookingCol.length === 0) {
      await conn.query(`ALTER TABLE games ADD COLUMN booking_open_at DATETIME DEFAULT NULL`);
      console.log("✅ booking_open_at 컬럼 추가 완료");
    }
    // raffle_open_at 컬럼 마이그레이션
    const [raffleOpenCol] = await conn.query(`SHOW COLUMNS FROM games LIKE 'raffle_open_at'`);
    if (raffleOpenCol.length === 0) {
      await conn.query(`ALTER TABLE games ADD COLUMN raffle_open_at DATETIME DEFAULT NULL`);
      console.log("✅ raffle_open_at 컬럼 추가 완료");
    }
    // raffle_winners_count 컬럼 마이그레이션
    const [winnersCol] = await conn.query(`SHOW COLUMNS FROM games LIKE 'raffle_winners_count'`);
    if (winnersCol.length === 0) {
      await conn.query(`ALTER TABLE games ADD COLUMN raffle_winners_count INT NOT NULL DEFAULT 5`);
      console.log("✅ raffle_winners_count 컬럼 추가 완료");
    }
    // 테스트용 경기 (항상 예매 가능)
    const [[testGame]] = await conn.query(`SELECT id FROM games WHERE id = 'G_TEST'`);
    if (!testGame) {
      await conn.query(
        `INSERT INTO games (id, home_team, away_team, game_date, game_time, stadium_id, status, base_price, booking_open_at)
         VALUES ('G_TEST', '테스트홈', '테스트어웨이', '2099-12-31', '18:30:00', 'jamsil', 'OPEN', 13000, '2020-01-01 00:00:00')`
      );
      console.log("✅ 테스트 경기 G_TEST 생성 완료");
    }
    // 경기장 데이터 없으면 삽입 (games JOIN stadiums 이라 비어 있으면 경기가 안 뜸)
    for (const s of SEED_STADIUMS) {
      await conn.query(
        `INSERT INTO stadiums (id, name, location, capacity) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), location=VALUES(location), capacity=VALUES(capacity)`,
        [s.id, s.name, s.location, s.capacity]
      );
    }
    console.log("✅ stadiums 시드 완료 (없으면 삽입, 있으면 유지)");

    // 경기 데이터 없으면 삽입, 있으면 날짜/상태 업데이트
    for (const g of SEED_GAMES) {
      await conn.query(
        `INSERT INTO games (id, home_team, away_team, game_date, game_time, stadium_id, status, base_price, booking_open_at, raffle_open_at, raffle_winners_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           game_date=VALUES(game_date), game_time=VALUES(game_time),
           status=VALUES(status), booking_open_at=VALUES(booking_open_at),
           raffle_open_at=VALUES(raffle_open_at), raffle_winners_count=VALUES(raffle_winners_count)`,
        [g.id, g.home_team, g.away_team, g.game_date, g.game_time, g.stadium_id, g.status, g.base_price, g.booking_open_at, g.raffle_open_at, g.raffle_winners_count]
      );
    }
    console.log("✅ 경기 데이터 시드 완료 (없으면 삽입, 있으면 5월 날짜/상태 업데이트)");
    // G_TEST: 서버 시작 기준 -1시간 → 항상 응모 창 오픈 상태
    await conn.query(`UPDATE games SET raffle_open_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = 'G_TEST'`);
    // G_TEST2: 즉시 결과 공개 전용 테스트 경기 (없으면 생성)
    const [[testGame2]] = await conn.query(`SELECT id FROM games WHERE id = 'G_TEST2'`);
    if (!testGame2) {
      await conn.query(
        `INSERT INTO games (id, home_team, away_team, game_date, game_time, stadium_id, status, base_price, booking_open_at, raffle_open_at, raffle_winners_count)
         VALUES ('G_TEST2', '[TEST] 응모결과', '[TEST] 즉시공개', '2099-12-31', '18:30:00', 'jamsil', 'OPEN', 13000, '2020-01-01 00:00:00', DATE_SUB(NOW(), INTERVAL 1 HOUR), 1)`
      );
      console.log("✅ 테스트 경기 G_TEST2 생성 완료");
    } else {
      // 매 서버 시작마다 raffle_open_at 갱신 + 당첨자 수 1명 고정 + 응모 내역 초기화
      await conn.query(
        `UPDATE games SET raffle_open_at = DATE_SUB(NOW(), INTERVAL 1 HOUR), raffle_winners_count = 1 WHERE id = 'G_TEST2'`
      );
      await conn.query(`DELETE FROM game_raffle_entries WHERE game_id = 'G_TEST2'`);
      console.log("✅ G_TEST2 응모 내역 초기화 완료 (테스트용)");
    }
    console.log("✅ raffle_open_at 설정 완료");
    console.log("✅ 기존 DB 유지 (초기화 생략). RESET_DB=true 설정 시에만 재생성합니다.");
    await conn.end();
    return;
  }

  if (shouldReset) {
    // ─── 명시적으로 요청한 경우에만 초기화: FK 역순으로 DROP ───────────
    await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);
    // combine/market 테이블 (FK 역순)
    await conn.query(`DROP TABLE IF EXISTS box_open_logs`);
    await conn.query(`DROP TABLE IF EXISTS combine_logs`);
    await conn.query(`DROP TABLE IF EXISTS purchase_history`);
    await conn.query(`DROP TABLE IF EXISTS price_history`);
    await conn.query(`DROP TABLE IF EXISTS trades`);
    await conn.query(`DROP TABLE IF EXISTS market_listings`);
    await conn.query(`DROP TABLE IF EXISTS market_assets`);
    await conn.query(`DROP TABLE IF EXISTS onchain_tx_logs`);
    await conn.query(`DROP TABLE IF EXISTS nft_tokens`);
    await conn.query(`DROP TABLE IF EXISTS user_boxes`);
    await conn.query(`DROP TABLE IF EXISTS user_cards`);
    await conn.query(`DROP TABLE IF EXISTS user_fragments`);
    await conn.query(`DROP TABLE IF EXISTS box_reward_pool`);
    await conn.query(`DROP TABLE IF EXISTS combine_recipes`);
    await conn.query(`DROP TABLE IF EXISTS card_types`);
    await conn.query(`DROP TABLE IF EXISTS fragment_types`);
    // ticket resale 테이블
    await conn.query(`DROP TABLE IF EXISTS ticket_trades`);
    await conn.query(`DROP TABLE IF EXISTS ticket_listings`);
    // 기존 테이블
    await conn.query(`DROP TABLE IF EXISTS tickets`);
    await conn.query(`DROP TABLE IF EXISTS did_verifications`);
    await conn.query(`DROP TABLE IF EXISTS user_wallets`);
    await conn.query(`DROP TABLE IF EXISTS post_likes`);
    await conn.query(`DROP TABLE IF EXISTS comments`);
    await conn.query(`DROP TABLE IF EXISTS posts`);
    await conn.query(`DROP TABLE IF EXISTS games`);
    await conn.query(`DROP TABLE IF EXISTS stadiums`);
    await conn.query(`DROP TABLE IF EXISTS notices`);
    await conn.query(`DROP TABLE IF EXISTS users`);
    await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);
  }

  // ─── 테이블 생성 ──────────────────────────────────────

  await conn.query(`
    CREATE TABLE users (
      user_id       VARCHAR(50)  PRIMARY KEY,
      nickname      VARCHAR(50)  NOT NULL,
      email         VARCHAR(255) UNIQUE DEFAULT NULL,
      password_hash VARCHAR(255) DEFAULT NULL,
      login_type    ENUM('local','google') NOT NULL DEFAULT 'local',
      google_id     VARCHAR(255) UNIQUE DEFAULT NULL,
      profile_image VARCHAR(255) DEFAULT NULL,
      is_active       TINYINT(1)   NOT NULL DEFAULT 1,
      membership_tier ENUM('일반','브론즈','실버','골드') NOT NULL DEFAULT '일반',
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE posts (
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
    CREATE TABLE comments (
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
    CREATE TABLE post_likes (
      user_id    VARCHAR(50)  NOT NULL,
      post_id    INT          NOT NULL,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, post_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (post_id) REFERENCES posts(post_id)
    )
  `);

  await conn.query(`
    CREATE TABLE user_wallets (
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
    CREATE TABLE did_verifications (
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

  await conn.query(`
    CREATE TABLE stadiums (
      id       VARCHAR(50)  PRIMARY KEY,
      name     VARCHAR(100) NOT NULL,
      location VARCHAR(200),
      capacity INT
    )
  `);

  await conn.query(`
    CREATE TABLE games (
      id                   VARCHAR(50)  PRIMARY KEY,
      home_team            VARCHAR(50)  NOT NULL,
      away_team            VARCHAR(50)  NOT NULL,
      game_date            DATE         NOT NULL,
      game_time            TIME,
      stadium_id           VARCHAR(50)  NOT NULL,
      status               ENUM('OPEN','ALMOST','SOLDOUT','UPCOMING','ENDED') NOT NULL DEFAULT 'OPEN',
      base_price           DECIMAL(10,2) DEFAULT NULL,
      booking_open_at      DATETIME     DEFAULT NULL,
      raffle_open_at       DATETIME     DEFAULT NULL,
      raffle_winners_count INT          NOT NULL DEFAULT 5,
      FOREIGN KEY (stadium_id) REFERENCES stadiums(id)
    )
  `);

  await conn.query(`
    CREATE TABLE notices (
      id           INT           PRIMARY KEY AUTO_INCREMENT,
      title        VARCHAR(255)  NOT NULL,
      content      TEXT          NOT NULL,
      type         ENUM('공지', '이벤트', '업데이트') NOT NULL DEFAULT '공지',
      is_pinned    TINYINT(1)    DEFAULT 0,
      image_url    VARCHAR(512)  DEFAULT NULL,
      view_count   INT           DEFAULT 0,
      created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE tickets (
      id             VARCHAR(36)   PRIMARY KEY,
      wallet_address VARCHAR(100)  NOT NULL,
      game_id        VARCHAR(50)   NOT NULL,
      stadium        VARCHAR(50),
      grade          VARCHAR(50),
      block          VARCHAR(50),
      row_num        INT,
      seat_number    INT,
      price          DECIMAL(15,2),
      token_id       INT           DEFAULT NULL,
      ticket_tx_hash VARCHAR(66)   DEFAULT NULL,
      status         ENUM('confirmed','used','listed','sold') NOT NULL DEFAULT 'confirmed',
      booked_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES games(id)
    )
  `);

  await conn.query(`
    CREATE TABLE game_raffle_entries (
      id           INT          PRIMARY KEY AUTO_INCREMENT,
      user_id      VARCHAR(50)  NOT NULL,
      game_id      VARCHAR(50)  NOT NULL,
      tickets_used INT          NOT NULL DEFAULT 1,
      status       ENUM('applied','won','lost') NOT NULL DEFAULT 'applied',
      applied_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_game (user_id, game_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    )
  `);

  // ─── 티켓 2차 거래 테이블 ─────────────────────────────

  await conn.query(`
    CREATE TABLE ticket_listings (
      id             CHAR(36)     PRIMARY KEY,
      seller_id      VARCHAR(50)  NOT NULL,
      ticket_id      VARCHAR(36)  DEFAULT NULL,
      nft_token_id   INT          DEFAULT NULL,
      price_wei      VARCHAR(40)  DEFAULT NULL,
      list_tx_hash   VARCHAR(66)  DEFAULT NULL,
      game_date      DATE         NOT NULL,
      home_team      VARCHAR(20)  NOT NULL,
      away_team      VARCHAR(20)  NOT NULL,
      seat_section   VARCHAR(50)  NOT NULL,
      original_price INT          NOT NULL,
      listed_price   INT          NOT NULL,
      status         VARCHAR(20)  NOT NULL DEFAULT 'active',
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seller_id) REFERENCES users(user_id)
    )
  `);

  await conn.query(`
    CREATE TABLE ticket_trades (
      id           CHAR(36)    PRIMARY KEY,
      listing_id   CHAR(36)    NOT NULL,
      buyer_id     VARCHAR(50) NOT NULL,
      seller_id    VARCHAR(50) NOT NULL,
      price        INT         NOT NULL,
      buy_tx_hash  VARCHAR(66) DEFAULT NULL,
      traded_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (listing_id) REFERENCES ticket_listings(id),
      FOREIGN KEY (buyer_id)   REFERENCES users(user_id),
      FOREIGN KEY (seller_id)  REFERENCES users(user_id)
    )
  `);

  // ─── combine/market 테이블 생성 ──────────────────────

  await conn.query(`
    CREATE TABLE fragment_types (
      id          VARCHAR(60)  PRIMARY KEY,
      onchain_id  INT          NOT NULL UNIQUE,
      family      VARCHAR(60)  NOT NULL,
      team        VARCHAR(20)  NOT NULL,
      name        VARCHAR(100) NOT NULL,
      result_name VARCHAR(100) NOT NULL,
      image_url   TEXT         NOT NULL,
      note        TEXT         NOT NULL
    )
  `);

  await conn.query(`
    CREATE TABLE card_types (
      id        INT          PRIMARY KEY AUTO_INCREMENT,
      team      VARCHAR(20)  NOT NULL,
      name      VARCHAR(100) NOT NULL,
      image_url TEXT         NOT NULL,
      note      TEXT         NOT NULL
    )
  `);

  await conn.query(`
    CREATE TABLE combine_recipes (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      fragment_type_id    VARCHAR(60) NOT NULL UNIQUE,
      result_card_type_id INT         NOT NULL,
      required_count      INT         NOT NULL DEFAULT 2,
      FOREIGN KEY (fragment_type_id)    REFERENCES fragment_types(id),
      FOREIGN KEY (result_card_type_id) REFERENCES card_types(id)
    )
  `);

  await conn.query(`
    CREATE TABLE box_reward_pool (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      type             VARCHAR(20)  NOT NULL,
      fragment_type_id VARCHAR(60)  NULL,
      card_type_id     INT          NULL,
      weight           INT          NOT NULL DEFAULT 10,
      name             VARCHAR(100) NOT NULL,
      image_url        TEXT         NOT NULL,
      description      TEXT         NOT NULL,
      FOREIGN KEY (fragment_type_id) REFERENCES fragment_types(id),
      FOREIGN KEY (card_type_id)     REFERENCES card_types(id)
    )
  `);

  await conn.query(`
    CREATE TABLE user_fragments (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      user_id          VARCHAR(50)  NOT NULL,
      fragment_type_id VARCHAR(60)  NOT NULL,
      count            INT          NOT NULL DEFAULT 0,
      UNIQUE KEY uq_user_fragment (user_id, fragment_type_id),
      FOREIGN KEY (user_id)          REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (fragment_type_id) REFERENCES fragment_types(id)
    )
  `);

  await conn.query(`
    CREATE TABLE user_cards (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      user_id           VARCHAR(50)  NOT NULL,
      card_type_id      INT          NOT NULL,
      nft_id            VARCHAR(30)  NOT NULL UNIQUE,
      display_team      VARCHAR(40)  NULL,
      display_name      VARCHAR(140) NULL,
      display_image_url TEXT         NULL,
      display_note      TEXT         NULL,
      source_mode       VARCHAR(20)  NULL,
      obtained_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id)      REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (card_type_id) REFERENCES card_types(id)
    )
  `);

  await conn.query(`
    CREATE TABLE user_boxes (
      user_id      VARCHAR(50) PRIMARY KEY,
      season_count INT         NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE nft_tokens (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      token_id         VARCHAR(40)  NOT NULL UNIQUE,
      token_type       VARCHAR(20)  NOT NULL,
      owner_user_id    VARCHAR(50)  NOT NULL,
      owner_wallet     VARCHAR(42)  NOT NULL,
      fragment_type_id VARCHAR(60)  NULL,
      listed_listing_id CHAR(36)    NULL,
      status           VARCHAR(20)  NOT NULL DEFAULT 'owned',
      source_action    VARCHAR(30)  NOT NULL DEFAULT 'sync',
      mint_tx_hash     VARCHAR(66)  NOT NULL,
      last_tx_hash     VARCHAR(66)  NOT NULL,
      minted_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id)    REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (fragment_type_id) REFERENCES fragment_types(id)
    )
  `);

  await conn.query(`
    CREATE TABLE onchain_tx_logs (
      id             CHAR(36)    PRIMARY KEY,
      user_id        VARCHAR(50) NOT NULL,
      wallet_address VARCHAR(42) NOT NULL,
      action_type    VARCHAR(30) NOT NULL,
      tx_hash        VARCHAR(66) NOT NULL UNIQUE,
      token_id       VARCHAR(40) NULL,
      payload_json   JSON        NULL,
      created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE market_assets (
      id               VARCHAR(60)  PRIMARY KEY,
      fragment_type_id VARCHAR(60)  NULL,
      idol             VARCHAR(20)  NOT NULL,
      asset_name       VARCHAR(100) NOT NULL,
      tier             VARCHAR(20)  NOT NULL DEFAULT 'STEADY',
      color            VARCHAR(10)  NOT NULL DEFAULT '#1456a0',
      accent           VARCHAR(10)  NOT NULL DEFAULT '#7ec8ff',
      demand_score     INT          NOT NULL DEFAULT 50,
      description      TEXT         NOT NULL,
      UNIQUE KEY uq_market_asset_fragment (fragment_type_id),
      FOREIGN KEY (fragment_type_id) REFERENCES fragment_types(id)
    )
  `);

  await conn.query(`
    CREATE TABLE market_listings (
      id                   CHAR(36)    PRIMARY KEY,
      seller_id            VARCHAR(50) NOT NULL,
      seller_wallet_address VARCHAR(42) NULL,
      fragment_type_id     VARCHAR(60) NOT NULL,
      price                INT         NOT NULL,
      quantity             INT         NOT NULL,
      is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
      reserved_by          VARCHAR(50) NULL,
      reserved_until       DATETIME    NULL,
      posted_at            DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seller_id)        REFERENCES users(user_id),
      FOREIGN KEY (reserved_by)      REFERENCES users(user_id),
      FOREIGN KEY (fragment_type_id) REFERENCES fragment_types(id)
    )
  `);

  await conn.query(`
    CREATE TABLE trades (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      fragment_type_id     VARCHAR(60) NOT NULL,
      listing_id           CHAR(36)    NULL,
      buyer_id             VARCHAR(50) NULL,
      seller_id            VARCHAR(50) NULL,
      buyer_wallet_address VARCHAR(42) NULL,
      seller_wallet_address VARCHAR(42) NULL,
      token_id             VARCHAR(40) NULL,
      price                INT         NOT NULL,
      quantity             INT         NOT NULL DEFAULT 1,
      platform_fee         INT         NOT NULL DEFAULT 0,
      settlement_amount    INT         NOT NULL DEFAULT 0,
      tx_hash              VARCHAR(66) NULL,
      traded_at            DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fragment_type_id) REFERENCES fragment_types(id),
      FOREIGN KEY (listing_id)       REFERENCES market_listings(id),
      FOREIGN KEY (buyer_id)         REFERENCES users(user_id),
      FOREIGN KEY (seller_id)        REFERENCES users(user_id)
    )
  `);

  await conn.query(`
    CREATE TABLE price_history (
      fragment_type_id VARCHAR(60) NOT NULL,
      price            INT         NOT NULL,
      recorded_date    DATE        NOT NULL,
      PRIMARY KEY (fragment_type_id, recorded_date),
      FOREIGN KEY (fragment_type_id) REFERENCES fragment_types(id)
    )
  `);

  await conn.query(`
    CREATE TABLE purchase_history (
      id                   CHAR(36)    PRIMARY KEY,
      buyer_id             VARCHAR(50) NOT NULL,
      fragment_type_id     VARCHAR(60) NOT NULL,
      listing_id           CHAR(36)    NULL,
      seller_id            VARCHAR(50) NULL,
      buyer_wallet_address VARCHAR(42) NULL,
      seller_wallet_address VARCHAR(42) NULL,
      token_id             VARCHAR(40) NULL,
      price                INT         NOT NULL,
      quantity             INT         NOT NULL DEFAULT 1,
      platform_fee         INT         NOT NULL DEFAULT 0,
      settlement_amount    INT         NOT NULL DEFAULT 0,
      tx_hash              VARCHAR(66) NULL,
      purchased_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (buyer_id)         REFERENCES users(user_id),
      FOREIGN KEY (fragment_type_id) REFERENCES fragment_types(id),
      FOREIGN KEY (listing_id)       REFERENCES market_listings(id),
      FOREIGN KEY (seller_id)        REFERENCES users(user_id)
    )
  `);

  await conn.query(`
    CREATE TABLE combine_logs (
      id                  CHAR(36)    PRIMARY KEY,
      user_id             VARCHAR(50) NOT NULL,
      fragment_type_id_1  VARCHAR(60) NOT NULL,
      fragment_type_id_2  VARCHAR(60) NOT NULL,
      result_card_type_id INT         NULL,
      result_name         VARCHAR(100) NOT NULL,
      result_nft_id       VARCHAR(30)  NULL,
      combined_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id)             REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (fragment_type_id_1)  REFERENCES fragment_types(id),
      FOREIGN KEY (fragment_type_id_2)  REFERENCES fragment_types(id),
      FOREIGN KEY (result_card_type_id) REFERENCES card_types(id)
    )
  `);

  await conn.query(`
    CREATE TABLE box_open_logs (
      id                      CHAR(36)    PRIMARY KEY,
      user_id                 VARCHAR(50) NOT NULL,
      wallet_address          VARCHAR(42) NULL,
      box_token_id            VARCHAR(40) NULL,
      reward_type             VARCHAR(20) NOT NULL,
      reward_fragment_type_id VARCHAR(60) NULL,
      reward_card_type_id     INT         NULL,
      reward_name             VARCHAR(100) NOT NULL,
      reward_token_id         VARCHAR(40) NULL,
      reward_nft_id           VARCHAR(30) NULL,
      tx_hash                 VARCHAR(66) NULL,
      opened_at               DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id)                 REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (reward_fragment_type_id) REFERENCES fragment_types(id),
      FOREIGN KEY (reward_card_type_id)     REFERENCES card_types(id)
    )
  `);

  // ─── 시드 데이터 삽입 ─────────────────────────────────

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

  for (const s of SEED_STADIUMS) {
    await conn.query(
      "INSERT INTO stadiums (id, name, location, capacity) VALUES (?, ?, ?, ?)",
      [s.id, s.name, s.location, s.capacity]
    );
  }

  for (const g of SEED_GAMES) {
    await conn.query(
      `INSERT INTO games (id, home_team, away_team, game_date, game_time, stadium_id, status, base_price, booking_open_at, raffle_open_at, raffle_winners_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [g.id, g.home_team, g.away_team, g.game_date, g.game_time, g.stadium_id, g.status, g.base_price, g.booking_open_at, g.raffle_open_at, g.raffle_winners_count]
    );
  }

  // 테스트용 경기 (항상 예매/응모 가능)
  await conn.query(
    `INSERT INTO games (id, home_team, away_team, game_date, game_time, stadium_id, status, base_price, booking_open_at, raffle_open_at, raffle_winners_count)
     VALUES ('G_TEST', '테스트홈', '테스트어웨이', '2099-12-31', '18:30:00', 'jamsil', 'OPEN', 13000, '2020-01-01 00:00:00', DATE_SUB(NOW(), INTERVAL 1 HOUR), 5)`
  );
  await conn.query(
    `INSERT INTO games (id, home_team, away_team, game_date, game_time, stadium_id, status, base_price, booking_open_at, raffle_open_at, raffle_winners_count)
     VALUES ('G_TEST2', '[TEST] 응모결과', '[TEST] 즉시공개', '2099-12-31', '18:30:00', 'jamsil', 'OPEN', 13000, '2020-01-01 00:00:00', DATE_SUB(NOW(), INTERVAL 1 HOUR), 1)`
  );

  // ─── combine/market 시드 데이터 ──────────────────────

  await conn.query(`
    INSERT INTO card_types (id, team, name, image_url, note) VALUES
    (1,  'KT',  'KT 위즈 공인구 사인볼 카드',          '/goods/kt-sign-ball.png',    'KT 위즈 선수단의 공식 공인구 사인볼 완성 카드'),
    (2,  'NC',  'NC 다이노스 시즌 스티커 컬렉션 카드',  '/goods/nc-sticker.png',      'NC 다이노스 팬만을 위한 시즌 한정 스티커 컬렉션'),
    (3,  'SSG', 'SSG 랜더스 개막 굿즈 카드',            '/goods/ssg.png',             'SSG 랜더스 개막 시즌 공식 굿즈 완성 카드'),
    (4,  'KIA', 'KIA 나성범 친필 사인볼 카드',          '/goods/kia-sign-ball.png',   '나성범 선수의 친필 사인이 담긴 레전드 카드'),
    (5,  '두산', '두산 베어스 선수단 유니폼 카드',       '/goods/doosan-uniform.png',  '두산 베어스 공식 레플리카 유니폼 완성 카드'),
    (6,  '롯데', '롯데 자이언츠 황금배트 카드',          '/goods/lotte-bat.png',       '롯데 자이언츠 시즌 황금배트 기념 완성 카드'),
    (7,  '삼성', '삼성 라이온즈 여름 응원 부채 카드',   '/goods/samsung-fan.png',     '삼성 라이온즈 여름 한정 공식 응원 부채 카드'),
    (8,  'LG',  'LG 트윈스 레전드 기념배트 카드',       '/goods/lg-bat.png',          'LG 트윈스 레전드 선수 기념 미니배트 완성 카드'),
    (9,  '키움', '키움 히어로즈 홈 유니폼 카드',         '/goods/kiwoom-uniform.png',  '키움 히어로즈 홈 공식 유니폼 완성 카드'),
    (10, '한화', '한화 이글스 팬 포토 스티커 카드',      '/goods/hanwha-sticker.png',  '한화 이글스 팬 한정 포토 스티커 컬렉션 카드')
  `);

  await conn.query(`
    INSERT INTO fragment_types (id, onchain_id, family, team, name, result_name, image_url, note) VALUES
    ('kt-sign-ball',      1,  'kt-goods',      'KT',  'KT 위즈 사인볼 파편',             'KT 위즈 공인구 사인볼 카드',          '/goods/kt-sign-ball.png',   '위즈 파크의 열기를 담은 공인구 사인볼 조각'),
    ('nc-sticker',        2,  'nc-goods',      'NC',  'NC 다이노스 스티커 파편',          'NC 다이노스 시즌 스티커 컬렉션 카드',  '/goods/nc-sticker.png',     '창원 NC파크 한정 시즌 스티커 조각'),
    ('ssg-goods',         3,  'ssg-goods',     'SSG', 'SSG 랜더스 개막 굿즈 파편',        'SSG 랜더스 개막 굿즈 카드',            '/goods/ssg.png',            '문학구장 개막 시리즈 기념 굿즈 조각'),
    ('kia-sign-ball',     4,  'kia-goods',     'KIA', 'KIA 나성범 사인볼 파편',           'KIA 나성범 친필 사인볼 카드',          '/goods/kia-sign-ball.png',  '나성범 선수 친필 사인이 담긴 희귀 조각'),
    ('doosan-uniform',    5,  'doosan-goods',  '두산', '두산 베어스 유니폼 파편',          '두산 베어스 선수단 유니폼 카드',        '/goods/doosan-uniform.png', '잠실의 전통을 이어가는 베어스 유니폼 조각'),
    ('lotte-bat',         6,  'lotte-goods',   '롯데', '롯데 자이언츠 야구배트 파편',      '롯데 자이언츠 황금배트 카드',          '/goods/lotte-bat.png',      '사직구장의 함성을 담은 황금배트 조각'),
    ('samsung-fan',       7,  'samsung-goods', '삼성', '삼성 라이온즈 응원 부채 파편',    '삼성 라이온즈 여름 응원 부채 카드',    '/goods/samsung-fan.png',    '대구 한화생명볼파크의 뜨거운 여름 부채 조각'),
    ('lg-bat',            8,  'lg-goods',      'LG',  'LG 트윈스 야구배트 파편',          'LG 트윈스 레전드 기념배트 카드',       '/goods/lg-bat.png',         '잠실의 레전드 트윈스 기념 미니배트 조각'),
    ('kiwoom-uniform',    9,  'kiwoom-goods',  '키움', '키움 히어로즈 유니폼 파편',        '키움 히어로즈 홈 유니폼 카드',          '/goods/kiwoom-uniform.png', '고척돔을 가득 채운 히어로즈 유니폼 조각'),
    ('hanwha-sticker',    10, 'hanwha-goods',  '한화', '한화 이글스 포토 스티커 파편',    '한화 이글스 팬 포토 스티커 카드',      '/goods/hanwha-sticker.png', '대전 이글스파크 팬 한정 포토 스티커 조각'),
    ('early-access-pass', 99, 'raffle',        '플랫폼', '응모권', '응모권',              'https://images.unsplash.com/photo-1518688248740-7c31f1a945c4?w=400&q=80', '티어업 보상으로 지급되는 응모권 NFT')
  `);

  await conn.query(`
    INSERT INTO combine_recipes (fragment_type_id, result_card_type_id, required_count) VALUES
    ('kt-sign-ball',   1,  2),
    ('nc-sticker',     2,  2),
    ('ssg-goods',      3,  2),
    ('kia-sign-ball',  4,  2),
    ('doosan-uniform', 5,  2),
    ('lotte-bat',      6,  2),
    ('samsung-fan',    7,  2),
    ('lg-bat',         8,  2),
    ('kiwoom-uniform', 9,  2),
    ('hanwha-sticker', 10, 2)
  `);

  await conn.query(`
    INSERT INTO box_reward_pool (type, fragment_type_id, card_type_id, weight, name, image_url, description) VALUES
    ('fragment', 'kt-sign-ball',   NULL, 14, 'KT 위즈 사인볼 파편',           '/goods/kt-sign-ball.png',   'KT 위즈 사인볼 파편 1개를 획득했습니다.'),
    ('fragment', 'nc-sticker',     NULL, 14, 'NC 다이노스 스티커 파편',        '/goods/nc-sticker.png',     'NC 다이노스 스티커 파편 1개를 획득했습니다.'),
    ('fragment', 'ssg-goods',      NULL, 14, 'SSG 랜더스 개막 굿즈 파편',      '/goods/ssg.png',            'SSG 랜더스 개막 굿즈 파편 1개를 획득했습니다.'),
    ('fragment', 'kia-sign-ball',  NULL,  8, 'KIA 나성범 사인볼 파편',         '/goods/kia-sign-ball.png',  'KIA 나성범 사인볼 파편 1개를 획득했습니다.'),
    ('fragment', 'doosan-uniform', NULL, 12, '두산 베어스 유니폼 파편',         '/goods/doosan-uniform.png', '두산 베어스 유니폼 파편 1개를 획득했습니다.'),
    ('fragment', 'lotte-bat',      NULL, 12, '롯데 자이언츠 야구배트 파편',     '/goods/lotte-bat.png',      '롯데 자이언츠 야구배트 파편 1개를 획득했습니다.'),
    ('fragment', 'samsung-fan',    NULL, 14, '삼성 라이온즈 응원 부채 파편',    '/goods/samsung-fan.png',    '삼성 라이온즈 응원 부채 파편 1개를 획득했습니다.'),
    ('fragment', 'lg-bat',         NULL, 10, 'LG 트윈스 야구배트 파편',         '/goods/lg-bat.png',         'LG 트윈스 야구배트 파편 1개를 획득했습니다.'),
    ('fragment', 'kiwoom-uniform', NULL, 10, '키움 히어로즈 유니폼 파편',       '/goods/kiwoom-uniform.png', '키움 히어로즈 유니폼 파편 1개를 획득했습니다.'),
    ('fragment', 'hanwha-sticker', NULL, 12, '한화 이글스 포토 스티커 파편',    '/goods/hanwha-sticker.png', '한화 이글스 포토 스티커 파편 1개를 획득했습니다.'),
    ('goods',    NULL, 1,   6, 'KT 위즈 공인구 사인볼 카드',          '/goods/kt-sign-ball.png',   'KT 위즈 공인구 사인볼 원본 굿즈 NFT를 획득했습니다!'),
    ('goods',    NULL, 2,   6, 'NC 다이노스 시즌 스티커 컬렉션 카드',  '/goods/nc-sticker.png',     'NC 다이노스 시즌 스티커 원본 굿즈 NFT를 획득했습니다!'),
    ('goods',    NULL, 3,   6, 'SSG 랜더스 개막 굿즈 카드',            '/goods/ssg.png',            'SSG 랜더스 개막 굿즈 원본 NFT를 획득했습니다!'),
    ('goods',    NULL, 4,   4, 'KIA 나성범 친필 사인볼 카드',          '/goods/kia-sign-ball.png',  'KIA 나성범 친필 사인볼 원본 굿즈 NFT를 획득했습니다!'),
    ('goods',    NULL, 5,   6, '두산 베어스 선수단 유니폼 카드',        '/goods/doosan-uniform.png', '두산 베어스 레플리카 유니폼 원본 굿즈 NFT를 획득했습니다!'),
    ('goods',    NULL, 6,   6, '롯데 자이언츠 황금배트 카드',          '/goods/lotte-bat.png',      '롯데 자이언츠 황금배트 원본 굿즈 NFT를 획득했습니다!'),
    ('goods',    NULL, 7,   6, '삼성 라이온즈 여름 응원 부채 카드',   '/goods/samsung-fan.png',    '삼성 라이온즈 응원 부채 원본 굿즈 NFT를 획득했습니다!'),
    ('goods',    NULL, 8,   5, 'LG 트윈스 레전드 기념배트 카드',       '/goods/lg-bat.png',         'LG 트윈스 레전드 기념배트 원본 굿즈 NFT를 획득했습니다!'),
    ('goods',    NULL, 9,   6, '키움 히어로즈 홈 유니폼 카드',         '/goods/kiwoom-uniform.png', '키움 히어로즈 홈 유니폼 원본 굿즈 NFT를 획득했습니다!'),
    ('goods',    NULL, 10,  5, '한화 이글스 팬 포토 스티커 카드',      '/goods/hanwha-sticker.png', '한화 이글스 팬 포토 스티커 원본 굿즈 NFT를 획득했습니다!')
  `);

  await conn.query(`
    INSERT INTO market_assets (id, fragment_type_id, idol, asset_name, tier, color, accent, demand_score, description) VALUES
    ('kt-sign-ball',   'kt-sign-ball',   'KT',  'KT 위즈 사인볼 파편',           'HOT',    '#c8102e', '#ff6b6b', 88, '위즈 파크 현장 직관 팬들 사이에서 빠르게 수요가 붙는 파편입니다.'),
    ('nc-sticker',     'nc-sticker',     'NC',  'NC 다이노스 스티커 파편',        'RISING', '#0033a0', '#7ec8ff', 74, '창원 원정 팬들이 가장 많이 찾는 시즌 한정 파편입니다.'),
    ('ssg-goods',      'ssg-goods',      'SSG', 'SSG 랜더스 개막 굿즈 파편',      'LIVE',   '#ce1141', '#ff9d3b', 65, '개막 시즌 문학구장 기념 굿즈 파편으로 꾸준히 거래됩니다.'),
    ('kia-sign-ball',  'kia-sign-ball',  'KIA', 'KIA 나성범 사인볼 파편',         'HOT',    '#ff5800', '#ffe100', 92, '나성범 선수 친필 사인이 담긴 초희귀 파편입니다.'),
    ('doosan-uniform', 'doosan-uniform', '두산', '두산 베어스 유니폼 파편',         'RISING', '#131230', '#7ec8ff', 79, '잠실 베어스 레플리카 유니폼 파편으로 수집 수요가 높습니다.'),
    ('lotte-bat',      'lotte-bat',      '롯데', '롯데 자이언츠 야구배트 파편',     'LIVE',   '#002d62', '#ff9d3b', 67, '사직구장 응원석의 뜨거운 배트 응원 장면을 담은 파편입니다.'),
    ('samsung-fan',    'samsung-fan',    '삼성', '삼성 라이온즈 응원 부채 파편',    'STEADY', '#074ca1', '#ffe100', 55, '대구 여름 직관의 필수템, 삼성 응원 부채 파편입니다.'),
    ('lg-bat',         'lg-bat',         'LG',  'LG 트윈스 야구배트 파편',         'RISING', '#c60c30', '#8d7cf6', 81, '잠실 레전드 트윈스의 기념 미니배트 파편입니다.'),
    ('kiwoom-uniform', 'kiwoom-uniform', '키움', '키움 히어로즈 유니폼 파편',        'STEADY', '#570514', '#ff9d3b', 58, '고척돔 히어로즈 홈 유니폼 파편으로 꾸준한 거래를 보입니다.'),
    ('hanwha-sticker', 'hanwha-sticker', '한화', '한화 이글스 포토 스티커 파편',    'STEADY', '#ff6600', '#ffe100', 51, '대전 이글스파크 팬 전용 포토 스티커 파편입니다.')
  `);

  await conn.query(`
    INSERT INTO ticket_listings (id, seller_id, game_date, home_team, away_team, seat_section, original_price, listed_price, status) VALUES
    ('tl-seed-0000-0000-000000000001', 'user_bh',  '2026-04-15', '삼성', 'LG',  '1루 내야 지정석', 13000, 14000, 'active'),
    ('tl-seed-0000-0000-000000000002', 'user_tm',  '2026-04-19', 'LG',  'NC',  '외야 응원석',      13000, 13000, 'active'),
    ('tl-seed-0000-0000-000000000003', 'admin_01', '2026-04-22', '두산', '키움', '3루 내야 지정석', 13000, 13500, 'active'),
    ('tl-seed-0000-0000-000000000004', 'user_bh',  '2026-04-22', '두산', '키움', '외야 응원석',     13000, 12000, 'active'),
    ('tl-seed-0000-0000-000000000005', 'user_tm',  '2026-04-15', '키움', '한화', '내야 일반석',     13000, 13000, 'active')
  `);

  await conn.query(`
    INSERT INTO price_history (fragment_type_id, price, recorded_date) VALUES
    ('kt-sign-ball',   15200, DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
    ('kt-sign-ball',   16400, DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
    ('kt-sign-ball',   17800, DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
    ('kt-sign-ball',   18500, DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
    ('kt-sign-ball',   17900, DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
    ('kt-sign-ball',   19200, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
    ('kt-sign-ball',   20500, CURDATE()),
    ('nc-sticker',     11200, DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
    ('nc-sticker',     11800, DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
    ('nc-sticker',     12300, DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
    ('nc-sticker',     12100, DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
    ('nc-sticker',     13000, DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
    ('nc-sticker',     13400, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
    ('nc-sticker',     14200, CURDATE()),
    ('ssg-goods',       8800, DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
    ('ssg-goods',       9100, DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
    ('ssg-goods',       9400, DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
    ('ssg-goods',       9200, DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
    ('ssg-goods',       9700, DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
    ('ssg-goods',      10100, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
    ('ssg-goods',      10600, CURDATE()),
    ('kia-sign-ball',  22000, DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
    ('kia-sign-ball',  23500, DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
    ('kia-sign-ball',  24800, DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
    ('kia-sign-ball',  26200, DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
    ('kia-sign-ball',  25700, DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
    ('kia-sign-ball',  27400, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
    ('kia-sign-ball',  29800, CURDATE()),
    ('doosan-uniform', 14100, DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
    ('doosan-uniform', 15200, DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
    ('doosan-uniform', 16000, DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
    ('doosan-uniform', 15700, DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
    ('doosan-uniform', 17100, DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
    ('doosan-uniform', 17900, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
    ('doosan-uniform', 18800, CURDATE()),
    ('lotte-bat',      10500, DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
    ('lotte-bat',      11200, DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
    ('lotte-bat',      11800, DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
    ('lotte-bat',      12400, DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
    ('lotte-bat',      12000, DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
    ('lotte-bat',      13100, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
    ('lotte-bat',      13800, CURDATE()),
    ('samsung-fan',     6800, DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
    ('samsung-fan',     7100, DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
    ('samsung-fan',     7300, DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
    ('samsung-fan',     7500, DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
    ('samsung-fan',     7200, DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
    ('samsung-fan',     7700, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
    ('samsung-fan',     8200, CURDATE()),
    ('lg-bat',         16800, DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
    ('lg-bat',         17500, DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
    ('lg-bat',         18200, DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
    ('lg-bat',         19000, DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
    ('lg-bat',         18600, DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
    ('lg-bat',         20100, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
    ('lg-bat',         21400, CURDATE()),
    ('kiwoom-uniform',  7900, DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
    ('kiwoom-uniform',  8200, DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
    ('kiwoom-uniform',  8500, DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
    ('kiwoom-uniform',  8300, DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
    ('kiwoom-uniform',  8800, DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
    ('kiwoom-uniform',  9200, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
    ('kiwoom-uniform',  9700, CURDATE()),
    ('hanwha-sticker',  5500, DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
    ('hanwha-sticker',  5800, DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
    ('hanwha-sticker',  6000, DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
    ('hanwha-sticker',  6200, DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
    ('hanwha-sticker',  6100, DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
    ('hanwha-sticker',  6500, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
    ('hanwha-sticker',  7000, CURDATE())
  `);

  await conn.end();
  console.log("✅ DB 초기화 및 시드 데이터 삽입 완료");
}

module.exports = { initDB, DB_NAME, DB_CONFIG };
