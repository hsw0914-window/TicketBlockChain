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
    'SELECT user_id, nickname, email, login_type, role FROM users WHERE user_id = ?',
    [payload.sub]
  );
  if (!user) return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });

  req.user = user;
  next();
}

// 토큰이 있으면 req.user 세팅, 없어도 통과
async function optionalAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'fallback-secret');
    const [[user]] = await _pool.query(
      'SELECT user_id, nickname, email, login_type, role FROM users WHERE user_id = ?',
      [payload.sub]
    );
    if (user) req.user = user;
  } catch {
    // 토큰 이상해도 그냥 통과
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin, setPool };
