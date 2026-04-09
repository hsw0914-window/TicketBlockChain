did-prototype/backend-node/
├── package.json
├── .env.example
└── src/
    ├── index.js        ← 진입점 (포트 8000)
    ├── db.js           ← SQLite (node:sqlite 내장, 설치 불필요)
    ├── auth.js         ← JWT + bcrypt + requireAuth 미들웨어
    ├── didUtils.js     ← DID/VC/VP 로직 (MetaMask 호환)
    └── routes/
        ├── auth.js     ← /auth/register, /login, /me
        ├── wallet.js   ← /wallet/connect, /challenge, /verify-signature
        ├── did.js      ← /did/create, /document, /status
        └── vc.js       ← /vc/issue, /list, /verify-vc, /create-vp, /verify-vp

cd did-prototype/backend-node
npm start        # 또는 npm run dev (nodemon)
