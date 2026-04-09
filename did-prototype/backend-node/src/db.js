// db.js — SQLite DB 초기화 (Node.js 22+ 내장 node:sqlite 사용)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'did_prototype.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wallets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER UNIQUE NOT NULL REFERENCES users(id),
    address      TEXT UNIQUE NOT NULL,
    is_verified  INTEGER DEFAULT 0,
    connected_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS did_documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER UNIQUE NOT NULL REFERENCES users(id),
    did           TEXT UNIQUE NOT NULL,
    document_json TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS verifiable_credentials (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    vc_type    TEXT NOT NULL,
    vc_jwt     TEXT NOT NULL,
    vc_json    TEXT NOT NULL,
    issued_at  TEXT DEFAULT (datetime('now')),
    is_revoked INTEGER DEFAULT 0
  );
`);

module.exports = db;
