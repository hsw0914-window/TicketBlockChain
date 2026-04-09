// auth.js — JWT 인증 헬퍼
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SECRET_KEY = process.env.JWT_SECRET || 'did-prototype-secret-key-change-in-production';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hashed) {
  return bcrypt.compareSync(plain, hashed);
}

function createAccessToken(userId) {
  return jwt.sign({ sub: userId }, SECRET_KEY, { expiresIn: '1h' });
}

// Express 미들웨어: Authorization Bearer 토큰 검증 후 req.user 주입
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 없습니다.' });
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), SECRET_KEY);
  } catch {
    return res.status(401).json({ error: '인증 정보가 유효하지 않습니다.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user) return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });

  req.user = user;
  next();
}

module.exports = { hashPassword, verifyPassword, createAccessToken, requireAuth };
