// index.js — Express 앱 진입점
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));
app.use(express.json());

app.use('/auth',   require('./routes/auth'));
app.use('/wallet', require('./routes/wallet'));
app.use('/did',    require('./routes/did'));
app.use('/vc',     require('./routes/vc'));

app.get('/', (req, res) => {
  res.json({
    message: 'DID/VC 프로토타입 API (Node.js)',
    version: '0.1.0',
    flow: [
      'POST /auth/register       — 1단계: 회원가입',
      'POST /auth/login          — 로그인',
      'POST /wallet/connect      — 2단계: MetaMask 주소 등록',
      'GET  /wallet/challenge    — 서명용 챌린지 발급',
      'POST /wallet/verify-signature — 3단계: MetaMask 서명 검증',
      'POST /did/create          — 4단계: DID 생성',
      'POST /vc/issue            — VC 발급',
      'POST /vc/create-vp        — VP 생성',
      'POST /vc/verify-vp        — VP 검증 (본인인증 완료)',
      'GET  /did/status          — 전체 인증 상태 조회',
    ],
  });
});

app.listen(PORT, () => console.log(`DID 프로토타입 서버 실행 중: http://localhost:${PORT}`));
