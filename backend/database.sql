-- [재현: 마이페이지 & 공지사항 통합 설계도 - 최종 호환본]

CREATE DATABASE IF NOT EXISTS ticketblockchain;
USE ticketblockchain;

-- 1. 유저 (마이페이지 관련)
CREATE TABLE IF NOT EXISTS users (
    wallet_address   VARCHAR(255)  PRIMARY KEY,          -- 지갑 주소
    nickname         VARCHAR(50)   NOT NULL DEFAULT '루키', 
    assets           INT           DEFAULT 0,            
    preferences      JSON          DEFAULT NULL,         
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. 공지사항 (백엔드 소스 id 명칭 및 타입 반영)
CREATE TABLE IF NOT EXISTS notices (
    id           INT           PRIMARY KEY AUTO_INCREMENT, -- 소스 코드와 일치시킨 ID
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
);