// routes/auth.js — 회원가입 / 로그인
const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, createAccessToken, requireAuth } = require('../auth');

const router = express.Router();

// POST /auth/register
router.post('/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(400).json({ error: '이미 등록된 이메일입니다.' });
  }

  const { lastInsertRowid: userId } = db
    .prepare('INSERT INTO users (email, hashed_password) VALUES (?, ?)')
    .run(email, hashPassword(password));

  res.json({ access_token: createAccessToken(userId), token_type: 'bearer' });
});

// POST /auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.hashed_password)) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  res.json({ access_token: createAccessToken(user.id), token_type: 'bearer' });
});

// GET /auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, created_at: req.user.created_at });
});

module.exports = router;
