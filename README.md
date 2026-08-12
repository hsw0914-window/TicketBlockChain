# BASE CHAIN — 블록체인 NFT 야구 티켓팅 플랫폼

야구 경기 예매부터 NFT 입장권 발급, QR 검표, 티켓 재판매, 포인트·멤버십, 응모·교환까지를
하나의 흐름으로 연결한 티켓팅 플랫폼입니다.

암표와 부정 양도를 막으려면 "이 티켓이 지금 누구 것인가"가 흔들리지 않아야 합니다.
그래서 이 프로젝트는 화면 기능보다 **상태 흐름**(사용자가 보는 티켓 상태 / DB 예매 상태 /
NFT 발급 상태 / 재판매 상태)을 먼저 맞추는 데 무게를 뒀습니다.

- 라이브 데모: https://juyoung-basechain.duckdns.org
- 라이선스: [MIT](LICENSE)

---

## 목차

- [핵심 기능](#핵심-기능)
- [기술 스택](#기술-스택)
- [아키텍처](#아키텍처)
- [빠른 시작](#빠른-시작)
- [환경변수](#환경변수)
- [테스트](#테스트)
- [설계에서 신경 쓴 부분](#설계에서-신경-쓴-부분)
- [현재 한계](#현재-한계)
- [디렉터리 구조](#디렉터리-구조)
- [팀](#팀)

---

## 핵심 기능

| 기능 | 설명 |
|---|---|
| 경기 예매 | 구장·좌석 등급·블록 단위 좌석 선택, 권종별(일반/청소년/멤버십/키즈) 요금 |
| 결제 | Toss Payments 연동 (기본값은 mock 모드) |
| NFT 입장권 | 예매 확정 시 ERC-721 티켓 발급, 좌석·경기 정보를 온체인 메타데이터로 보관 |
| QR 검표 | 10초마다 회전하는 HMAC 기반 1회용 QR, 경기 시작 N시간 전부터 활성화 |
| 티켓 재판매 | MetaMask 서명으로 판매자 본인 확인 후 등록, 정가 초과 방지 |
| 포인트·멤버십 | 입장 실적 기반 티어(베이직/브론즈/실버/골드), 티어별 혜택 지급 |
| 우선 예매 응모 | 응모권 NFT로 추첨, 당첨자에게 지정 좌석 우선 예매권 부여 |
| 조각·카드 교환 | NFT 조각 합성, 실물 굿즈 교환 신청 |

## 기술 스택

**프론트엔드** React 19 · TypeScript 5.8 · Vite 6 · Tailwind CSS 4 · React Router 7 · ethers.js 6

**백엔드** Node.js · Express 4 · MySQL/MariaDB (mysql2) · JWT · bcrypt

**블록체인** Solidity 0.8.28 · Hardhat · OpenZeppelin · Hyperledger Fabric (체인코드 Go)

**인프라** Oracle Cloud · Caddy (HTTPS 리버스 프록시) · systemd

## 아키텍처

```
┌─────────────┐   HTTPS    ┌──────────────┐
│  브라우저    │ ─────────► │    Caddy     │
│ (React SPA) │            │  정적 서빙    │
└─────────────┘            └──────┬───────┘
                             /api │ 프록시
                                  ▼
                        ┌──────────────────┐
                        │  Express API     │
                        │  (Node.js)       │
                        └───┬─────┬────┬───┘
                            │     │    │
              ┌─────────────┘     │    └──────────────┐
              ▼                   ▼                   ▼
      ┌───────────────┐  ┌────────────────┐  ┌────────────────┐
      │ MySQL/MariaDB │  │ Hyperledger    │  │ Ethereum       │
      │ 예매·좌석·티켓 │  │ Fabric         │  │ (TicketNFT 등) │
      │ 포인트 이벤트  │  │ 포인트·멤버십   │  │ ERC-721/1155   │
      └───────────────┘  └────────────────┘  └────────────────┘
                          (기본값: mock)      (기본값: 비활성)
```

**좌석 점유의 단일 기준은 MySQL입니다.** 블록체인은 발급 증명과 이력 기록을 담당하고,
"이 좌석이 팔렸는가"는 DB 제약으로 확정합니다. 온체인 확인을 기다리는 동안 좌석이
떠 있으면 이중 예매가 생기기 때문입니다.

## 빠른 시작

**요구사항** Node.js 20+ · MySQL 8 또는 MariaDB 10.6+

```bash
git clone https://github.com/hsw0914-window/TicketBlockChain.git
cd TicketBlockChain
```

**1. 백엔드**

```bash
cd server
npm install
cp .env.example .env      # 값을 채운 뒤 실행
npm start                 # http://localhost:4000
```

첫 실행 시 데이터베이스와 테이블, 시드 데이터가 자동 생성됩니다.

**2. 프론트엔드**

```bash
cd Proje
npm install
cp .env.example .env
npm run dev               # http://localhost:5173
```

**3. 스마트 컨트랙트 (선택)**

```bash
cd blockchain
npm install
npm test                  # 컨트랙트 테스트
npm run compile
```

## 환경변수

`server/.env` — 전체 목록은 [`server/.env.example`](server/.env.example) 참고

| 변수 | 필수 | 설명 |
|---|:---:|---|
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` | ✔ | 데이터베이스 접속 정보 |
| `JWT_SECRET` | ✔ | 로그인 토큰 서명 키. 없으면 서버가 시작되지 않습니다 |
| `QR_SECRET` | ✔ | QR 토큰 HMAC 키. 없으면 서버가 시작되지 않습니다 |
| `RESET_DB_ON_START` | | `true`면 시작 시 DB를 초기화합니다. **운영에서는 반드시 `false`** |
| `TOSS_MODE` | | `mock`(기본) / `real` |
| `FABRIC_MODE` | | `mock`(기본) / `real` |
| `ENABLE_ONCHAIN_MINTING` | | `true`일 때만 실제 온체인 민팅을 시도합니다 (기본 비활성) |
| `DEMO_ADMIN_PASSWORD` `ROOT_ADMIN_PASSWORD` | | 관리자 계정 비밀번호. **설정하지 않으면 관리자 계정을 만들지 않습니다** |
| `FRONTEND_ORIGINS` | | CORS 허용 출처(쉼표 구분) |
| `RATE_LIMIT_AUTH_MAX` | | 인증 API 요청 한도 (기본 10분당 20회) |

> `.env`는 절대 커밋하지 마세요. `.gitignore`에 등록되어 있습니다.

## 테스트

```bash
cd server && npm test        # 백엔드 78개
cd blockchain && npm test    # 컨트랙트 18개
cd Proje && npm run typecheck
```

**백엔드 78개**

| 파일 | 개수 | 확인하는 것 |
|---|---:|---|
| `moduleLoad` | 38 | 모든 서버 모듈이 실제로 로드되는지 (파일 하나당 1개) |
| `onchainPayment` | 13 | 온체인 결제의 수신자·금액·확정·재사용 검증 |
| `seatPricing` | 10 | 좌석 가격 조작 차단, 프론트·서버 가격표 일치 |
| `seatConcurrency` | 5 | 좌석 동시 예매, 부분 실패 롤백 |
| `tossMockGuard` | 5 | 실결제 모드에서 mock 우회가 막히는지 |
| `raffleFairness` | 4 | 추첨 셔플의 분포 균등성 |
| `combineConcurrency` | 3 | 조각 합성 시 카드 복제 차단 |

**컨트랙트 18개** — 민팅 권한, 좌석 중복, 재입장 방지, 양도

동시성 테스트는 실제 DB에 병렬 요청을 밀어넣어 **같은 좌석에 10명이 동시에 몰려도
한 장만 발권되는지** 확인합니다. DB에 연결할 수 없으면 실패가 아니라 건너뜁니다.

> `moduleLoad`가 38개인 것은 서버 모듈 하나당 테스트 1개를 자동으로 만들기 때문입니다.
> 기능을 검증하는 테스트는 40개입니다.

## 설계에서 신경 쓴 부분

**좌석 이중 예매 방지 (2중 방어)**
애플리케이션에서 `SELECT ... FOR UPDATE`로 동시 요청을 직렬화하고, 그것이 뚫려도
DB의 유니크 제약이 INSERT를 거부합니다. 검사와 INSERT 사이의 틈은 코드만으로는 없앨 수
없기 때문에 마지막 판단은 DB에 맡겼습니다.
환불·취소된 티켓은 좌석 잠금 키가 `NULL`이 되어 자동으로 다시 판매됩니다.
→ [`server/services/ticketService.js`](server/services/ticketService.js)

**결제 금액은 서버가 계산**
클라이언트가 보낸 좌석 가격은 검증용으로만 쓰고, 실제 승인 금액은 서버 가격표에서
다시 계산합니다. 프론트와 서버 가격표가 어긋나면 테스트가 실패합니다.
→ [`server/config/seatPricing.js`](server/config/seatPricing.js)

**좌석 확보 → 결제 순서**
결제를 먼저 하면 "돈은 빠져나갔는데 좌석은 남이 가져간" 상태가 생깁니다.
좌석을 트랜잭션으로 확보한 뒤 결제를 승인하고, 이후 어느 단계에서 실패하든
결제 취소와 좌석 반환을 함께 수행합니다.

**QR 위조 방지**
QR은 `HMAC-SHA256(ticketId:슬롯)`이며 기본 10초마다 값이 바뀝니다.
캡처한 QR을 돌려써도 다음 슬롯에서는 통하지 않습니다.

## 현재 한계

정직하게 적어 둡니다.

- **Hyperledger Fabric은 기본값이 mock입니다.** 인메모리 구현이라 서버를 재시작하면
  Fabric 측 기록(티켓 등록·예약·응모)은 사라집니다. 포인트와 멤버십은 DB의
  `point_events`에서 다시 계산되어 복구됩니다.
- **온체인 민팅은 기본 비활성**입니다(`ENABLE_ONCHAIN_MINTING=false`).
  컨트랙트는 작성·테스트되어 있으나 상시 연동은 가스비 문제로 켜 두지 않았습니다.
- **Toss Payments는 mock 모드**가 기본이며 실제 결제는 발생하지 않습니다.
- 비밀번호 재설정은 토큰 발급까지 구현되어 있고 **메일 발송 연동이 남아 있습니다**
  (현재는 서버 로그로 토큰을 확인).
- 부하 테스트와 전문 보안 감사는 수행하지 않았습니다.
- 로그인 토큰을 `localStorage`에 보관합니다. httpOnly 쿠키로 옮기려면 CSRF 대응이 함께
  필요해 이번 범위에서는 다루지 않았고, 대신 저장형 XSS 경로(업로드 확장자)를 막았습니다.

### 시연용 서명 우회 플래그

`VITE_DEMO_ALLOW_MOCK_SIGNATURE`(프론트)와 `DEMO_ALLOW_MOCK_SIGNATURE`(서버)는
MetaMask 없이도 재판매 등록이 되도록 서명 검증을 건너뛰는 스위치입니다.
**두 값은 반드시 같아야 합니다** — 한쪽만 켜면 프론트는 가짜 서명을 만들고 서버는 거부해서
"서명을 검증할 수 없습니다" 오류만 남습니다.

기본값은 양쪽 모두 `false`입니다. 켜면 "지갑 서명으로 판매자 본인을 확인한다"는 보증이
사라지므로, 검증 과정을 보여줘야 하는 자리에서는 끄고 MetaMask로 시연하는 것을 권합니다.

## 디렉터리 구조

```
.
├── Proje/          프론트엔드 (React + Vite + TypeScript)
│   ├── app/pages/      화면별 페이지
│   ├── app/data/       구장·좌석 등급 정의 (가격의 프론트 원본)
│   └── app/lib/        지갑·컨트랙트 연동
├── server/         백엔드 API (Express + MySQL)
│   ├── routes/         API 엔드포인트
│   ├── services/       비즈니스 로직
│   ├── config/         좌석 가격표 등 서버 기준값
│   ├── db/             스키마·마이그레이션·시드
│   ├── mock/           Fabric mock 구현
│   └── tests/          백엔드 테스트
├── blockchain/     스마트 컨트랙트 (Hardhat + Solidity)
│   ├── contracts/      TicketNFT, TicketMarketplace, BoxNFT, FragmentNFT
│   └── test/           컨트랙트 테스트
├── fabric/         Hyperledger Fabric 네트워크·체인코드
├── deploy/         Oracle Cloud 배포 설정 예시
└── docs/           배포 가이드
```

## 팀

| 이름 | 담당 |
|---|---|
| 한승우 | 메인 페이지, 커뮤니티, 프로젝트 총괄 |
| 박주영 | 예매·결제 흐름, 백엔드 API 통합, Oracle 배포·운영 |

개발 기간: 2026.03 ~ 2026.05 (이후 보안·안정성 보완)
