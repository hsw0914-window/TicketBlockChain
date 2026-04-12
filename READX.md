# TicketBlockChain — 실행 가이드

## 프로젝트 구조

```
TicketBlockChain/
├── Proje/          # 프론트엔드 (React + Vite + TypeScript)
├── server/         # 메인 백엔드 API (Express + MySQL)
├── blockchain/     # 스마트 컨트랙트 (Hardhat + Solidity)
└── did-prototype/
    └── backend-node/  # DID/VC 프로토타입 백엔드 (Express)
```

---

## 사전 준비

- **Node.js** v18 이상
- **MySQL** 로컬 서버 실행 중 (포트 3306)
- **MetaMask** 브라우저 확장 설치

---

## 1. 프론트엔드 (Proje)

React + Vite 기반 SPA. 포트 **5173**에서 실행됩니다.

```bash
cd Proje
npm install
npm run dev
```

### 환경 변수 (`Proje/.env`)

```env
VITE_GOOGLE_CLIENT_ID=<Google OAuth Client ID>
VITE_API_URL=http://localhost:4000
VITE_CONTRACT_ADDRESS=<배포된 TicketNFT 컨트랙트 주소>
```

---

## 2. 메인 백엔드 서버 (server)

Express + MySQL 기반 REST API. 포트 **4000**에서 실행됩니다.

```bash
cd server
npm install
node db/init.js   # DB 초기화 (최초 1회만 실행)
npm run dev       # 개발 모드 (nodemon, 파일 변경 시 자동 재시작)
# 또는
npm start         # 프로덕션 모드
```

### 환경 변수 (`server/.env`)

```env
JWT_SECRET=<JWT 서명 키>
DB_PASSWORD=<MySQL root 비밀번호>
PORT=4000

QR_SECRET=<QR 코드 서명 키>
DEBUG_TIME_OFFSET_HOURS=0

# 블록체인 (Hoodi 테스트넷)
MINTER_PRIVATE_KEY=<민터 지갑 프라이빗 키 (0x 포함)>
FRAGMENT_NFT_ADDRESS=<FragmentNFT 컨트랙트 주소>
TICKET_NFT_ADDRESS=<TicketNFT 컨트랙트 주소>
BOX_NFT_ADDRESS=<BoxNFT 컨트랙트 주소>
TICKET_MARKETPLACE_ADDRESS=<TicketMarketplace 컨트랙트 주소>
```

---

## 3. 스마트 컨트랙트 (blockchain)

Hardhat 기반. Hoodi 테스트넷에 배포합니다.

```bash
cd blockchain
npm install
```

### 환경 변수 (`blockchain/.env`)

```env
PRIVATE_KEY=<배포자 지갑 프라이빗 키 (0x 포함)>
```

### 컨트랙트 배포

```bash
# FragmentNFT 배포 (Hoodi 테스트넷)
npx hardhat run scripts/deployFragment.ts --network hoodi
```

---

## 4. DID/VC 프로토타입 백엔드 (did-prototype/backend-node)

DID·VC 인증 프로토타입 API. 포트 **8000**에서 실행됩니다.

```bash
cd did-prototype/backend-node
npm install
npm run dev       # 개발 모드 (nodemon)
# 또는
npm start         # 프로덕션 모드
```

### 환경 변수 (`did-prototype/backend-node/.env`)

```env
PORT=8000
JWT_SECRET=<JWT 서명 키>
```

---

## 전체 로컬 실행 순서

터미널 4개를 열고 아래 순서로 실행합니다.

```
[터미널 1] cd server && npm install && node db/init.js && npm run dev
[터미널 2] cd Proje  && npm install && npm run dev
[터미널 3] cd did-prototype/backend-node && npm install && npm run dev
[터미널 4] (선택) cd blockchain && npm install
```

| 서비스 | URL |
|---|---|
| 프론트엔드 | http://localhost:5173 |
| 메인 API | http://localhost:4000 |
| DID 프로토타입 API | http://localhost:8000 |
