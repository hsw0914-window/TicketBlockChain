const mysql = require("mysql2/promise");

const DB_CONFIG = {
  host: "localhost",
  user: "root",
  password: "8973", // 👈 재현님 비밀번호 적용 완료
  multipleStatements: true,
};

const DB_NAME = "ticketblockchain";

async function initDB() {
  const conn = await mysql.createConnection(DB_CONFIG);

  console.log("🛠️ [최종 호환 버전] DB 초기화 및 테이블 생성 시작...");
  
  await conn.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  await conn.query(`CREATE DATABASE \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4`);
  await conn.query(`USE \`${DB_NAME}\``);

  // 1. 유저 테이블
  await conn.query(`
    CREATE TABLE users (
      wallet_address VARCHAR(255) PRIMARY KEY,
      nickname       VARCHAR(50)  NOT NULL DEFAULT '루키',
      assets         INT          DEFAULT 0,
      preferences    JSON         DEFAULT NULL,
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. 공지사항 테이블 (id, type, is_pinned 반영)
  await conn.query(`
    CREATE TABLE notices (
      id           INT           PRIMARY KEY AUTO_INCREMENT,
      wallet_address VARCHAR(255) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
      title        VARCHAR(255)  NOT NULL,
      content      TEXT          NOT NULL,
      type         ENUM('공지', '이벤트', '업데이트') NOT NULL DEFAULT '공지',
      is_pinned    TINYINT(1)    DEFAULT 0,
      image_url    VARCHAR(512)  DEFAULT NULL,
      view_count   INT           DEFAULT 0,
      created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
    )
  `);

  // 3. 테스트 데이터
  await conn.query(
    "INSERT INTO users (wallet_address, nickname, assets) VALUES (?, ?, ?)",
    ["0x0000000000000000000000000000000000000000", "운영자", 1000]
  );

  console.log("✅ 모든 테이블이 소스 코드와 일치하게 생성되었습니다!");
  await conn.end();
}

initDB().catch(console.error);