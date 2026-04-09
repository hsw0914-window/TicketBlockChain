const jwt = require('jsonwebtoken');

let _pool = null;

function setPool(pool) {
  _pool = pool;
}

async function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 없습니다.' });
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'fallback-secret');
  } catch {
    return res.status(401).json({ error: '인증 정보가 유효하지 않습니다.' });
  }

  const [[user]] = await _pool.query(
    'SELECT user_id, nickname, email, login_type FROM users WHERE user_id = ?',
    [payload.sub]
  );
  if (!user) return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });

  req.user = user;
  next();
}

module.exports = { requireAuth, setPool };
