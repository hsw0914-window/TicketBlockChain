# 배포 절차

Oracle Cloud VM + Caddy(HTTPS) + systemd 기준. 라이브 주소는
https://juyoung-basechain.duckdns.org 입니다.

> 시연 환경의 안전 기준(mock 유지 이유, QR 카메라와 HTTPS 관계 등)은
> [ORACLE_DEMO_DEPLOYMENT.md](ORACLE_DEMO_DEPLOYMENT.md)를 함께 보세요.
> 이 문서는 "실제로 어떤 순서로 올리는가"만 다룹니다.

---

## 서버 경로

| 구분 | 경로 |
|---|---|
| 백엔드 | `/home/ubuntu/basechain/server` |
| 프론트 정적 파일 | `/var/www/basechain/dist` |
| systemd 서비스 | `basechain-api` |

> `deploy/oracle-demo/basechain-api.service.example`은 `/opt/basechain` 기준으로 적혀 있습니다.
> 현재 운영 중인 서버는 위 표의 경로를 씁니다. 서비스 파일을 새로 만들 때 경로를 맞추세요.

---

## 0. 배포 전 확인 (로컬)

배포 전에 로컬에서 전부 통과하는지 먼저 봅니다. 여기서 실패하면 서버에 올리지 않습니다.

```bash
cd server     && npm ci && npm test
cd ../blockchain && npm ci && npm test
cd ../Proje      && npm ci && npm run build
```

기대 결과:

```
백엔드   35개 통과 / 0 실패
컨트랙트 18개 통과 / 0 실패
프론트   타입오류 0 · 빌드 성공
```

---

## 1. 환경변수 준비 (최초 1회 / 값이 바뀔 때)

`server/.env`를 서버에서 직접 편집합니다. **`.env`는 절대 커밋하지 않습니다.**

### 반드시 확인할 값

| 변수 | 값 | 안 하면 |
|---|---|---|
| `RESET_DB_ON_START` | `false` | **재시작할 때마다 DB가 통째로 지워집니다** |
| `DEMO_ADMIN_PASSWORD` | 12자 이상 무작위 | 관리자 계정이 안 생겨 공지·검표·정산·추첨을 **아무도 못 씁니다** |
| `ROOT_ADMIN_PASSWORD` | 12자 이상 무작위 | 위와 같음 |
| `FRONTEND_ORIGINS` | `https://juyoung-basechain.duckdns.org` | 브라우저 요청이 CORS로 차단됩니다 |
| `TRUST_PROXY_HOPS` | `1` | 레이트리밋이 모든 요청을 Caddy IP 하나로 묶습니다 |
| `JWT_SECRET` / `QR_SECRET` | 32자 이상 무작위 | 서버가 아예 시작되지 않습니다(필수값) |
| `FABRIC_MODE` / `TOSS_MODE` | `mock` | 실제 결제·체인 연동이 켜집니다 |
| `ENABLE_ONCHAIN_MINTING` | `false` | 실제 온체인 민팅이 발생합니다 |
| `CORS_ALLOW_DEV_ORIGINS` | `false` | 누구나 등록 가능한 ngrok 도메인이 허용됩니다 |

시크릿 생성:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 서명 우회 플래그 — 결정이 필요합니다

`DEMO_ALLOW_MOCK_SIGNATURE`(서버)와 `VITE_DEMO_ALLOW_MOCK_SIGNATURE`(프론트)는
**반드시 같은 값**이어야 합니다. 다르면 프론트는 가짜 서명을 만들고 서버는 거부해서,
MetaMask 없는 사용자에게 "서명을 검증할 수 없습니다" 오류만 보입니다.

| 값 | 결과 |
|---|---|
| `false` (권장) | MetaMask가 있어야 재판매 등록 가능. 서명 검증이 실제로 동작하는 걸 보여줄 수 있음 |
| `true` | MetaMask 없이 시연되지만, "지갑 서명으로 판매자 본인 확인"이라는 보증이 사라짐 |

### 검사

```bash
node deploy/oracle-demo/preflight.js --env server/.env --frontend-env Proje/.env
```

`ok: true`가 아니면 배포하지 않습니다. 위험한 조합(`RESET_DB_ON_START=true`,
약한 관리자 비밀번호, 플래그 불일치)은 `errors`로 잡히고 종료코드 1이 됩니다.

---

## 2. 코드 가져오기

```bash
ssh ubuntu@juyoung-basechain.duckdns.org
cd /home/ubuntu/basechain
git pull origin develop
```

---

## 3. 백엔드 배포

```bash
cd /home/ubuntu/basechain/server
npm ci --omit=dev
sudo systemctl restart basechain-api
```

> `express-rate-limit`이 새로 추가됐습니다. `npm ci`를 건너뛰면 서버가
> `Cannot find module 'express-rate-limit'`로 죽습니다.

### 재시작 직후 로그 확인 (중요)

```bash
sudo journalctl -u basechain-api -n 60 --no-pager
```

**이번 배포에서 처음 실행되는 DB 마이그레이션이 있습니다.** 로그에서 다음을 확인하세요.

| 로그 | 의미 |
|---|---|
| `tickets.status ENUM에 cancelled 추가` | 정상 |
| `tickets 좌석 중복 방지 제약(uq_ticket_active_seat) 추가 완료` | **정상 — 이게 떠야 합니다** |
| `⚠️ 좌석 중복 N건이 이미 존재해 UNIQUE 제약을 걸 수 없습니다` | **조치 필요 (아래 참고)** |
| `기존 DB 유지 모드: 재시작 시 데이터를 보존합니다` | 정상 (`RESET_DB_ON_START=false`) |
| `관리자 비밀번호 환경변수가 없어 계정 생성을 건너뜁니다` | **관리자 기능이 동작하지 않습니다** |

#### 좌석 중복 경고가 뜬 경우

운영 DB에 이미 같은 좌석 티켓이 두 장 이상 있다는 뜻입니다(수정 전 코드에서 발생 가능).
서버는 죽지 않고 어떤 좌석인지 로그로 알려줍니다. 해당 좌석을 정리한 뒤 재시작하면
제약이 걸립니다.

```sql
-- 중복 좌석 확인
SELECT game_id, block, row_num, seat_number, COUNT(*) AS cnt, GROUP_CONCAT(id)
  FROM tickets
 WHERE status NOT IN ('refunded','cancelled')
   AND block IS NOT NULL AND row_num IS NOT NULL AND seat_number IS NOT NULL
 GROUP BY game_id, block, row_num, seat_number
HAVING COUNT(*) > 1;
```

어느 쪽을 남길지는 `booked_at`(먼저 예매한 쪽)과 결제 이력을 보고 판단하고,
나머지는 환불 처리하거나 `status = 'cancelled'`로 바꿉니다. **DELETE 하지 마세요** —
결제 이력과 어긋납니다.

---

## 4. 프론트엔드 배포

```bash
cd /home/ubuntu/basechain/Proje
npm ci
npm run build:oracle
sudo rsync -a --delete dist/ /var/www/basechain/dist/
```

> `build:oracle`은 이제 `VITE_DEMO_ALLOW_MOCK_SIGNATURE`를 강제하지 않습니다.
> `Proje/.env` 값이 그대로 반영되므로, 1단계에서 서버 값과 맞춰 두었는지 확인하세요.
> `build`에 타입 검사가 포함돼 있어 타입 오류가 있으면 빌드가 멈춥니다.

---

## 5. 배포 확인

```bash
# API 살아있는지
curl -s https://juyoung-basechain.duckdns.org/api/health

# 경기 목록
curl -s -o /dev/null -w "%{http_code}\n" https://juyoung-basechain.duckdns.org/api/tickets/games

# 없는 경로가 404로 처리되는지
curl -s -o /dev/null -w "%{http_code}\n" https://juyoung-basechain.duckdns.org/api/nope
```

기대: `{"ok":true,...}` / `200` / `404`

### 권한이 실제로 막히는지

```bash
# 인증 없이 공지 삭제 시도 → 401 이어야 함
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  https://juyoung-basechain.duckdns.org/api/notices

# 인증 없이 QR 검표 시도 → 401 이어야 함
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://juyoung-basechain.duckdns.org/api/entry/verify \
  -H 'Content-Type: application/json' -d '{"ticketId":"x","qrToken":"y"}'
```

둘 다 200이 나오면 배포가 반영되지 않은 것입니다.

### 화면 확인

- [ ] 로그인 → 예매 → 좌석 선택 → 결제(mock) → 내 입장권까지 한 번 통과
- [ ] 관리자 계정으로 `/entry-scanner` 접속 → QR 스캔 화면이 뜨는지
- [ ] 일반 계정으로 `/entry-scanner` 접속 → "관리자 전용" 안내가 뜨는지
- [ ] 관리자 계정으로 공지 작성/삭제

---

## 6. 문제가 생겼을 때

### 롤백

```bash
cd /home/ubuntu/basechain
git log --oneline -5          # 되돌릴 커밋 확인
git checkout <이전_커밋>
cd server && npm ci --omit=dev && sudo systemctl restart basechain-api
cd ../Proje && npm ci && npm run build:oracle
sudo rsync -a --delete dist/ /var/www/basechain/dist/
```

> **DB 마이그레이션은 롤백되지 않습니다.** 추가된 `seat_lock` 컬럼과 유니크 제약,
> `password_reset_tokens` 테이블은 남습니다. 이전 코드도 이 스키마에서 동작하지만,
> 좌석 중복이 필요한 상황이라면(있어서는 안 되지만) 제약을 직접 제거해야 합니다.

### 자주 겪는 증상

| 증상 | 원인 | 조치 |
|---|---|---|
| 서버가 즉시 죽음, `Cannot find module 'express-rate-limit'` | `npm ci` 누락 | 3단계 다시 |
| 서버가 즉시 죽음, `필수 환경변수 미설정: JWT_SECRET` | `.env` 누락 | 1단계 확인 |
| 공지 작성·검표가 403 | 관리자 계정 미생성 | `DEMO_ADMIN_PASSWORD` 설정 후 재시작 |
| 브라우저에서 API 호출이 전부 실패 | CORS | `FRONTEND_ORIGINS`에 배포 도메인 추가 |
| 재판매 등록 시 "서명을 검증할 수 없습니다" | 서명 플래그 불일치 | 서버·프론트 값을 맞추고 프론트 재빌드 |
| 로그인 시도가 429 | 레이트 리밋 | 정상 동작. 10분 뒤 풀리거나 `RATE_LIMIT_AUTH_MAX` 조정 |
| 사용자 데이터가 사라짐 | `RESET_DB_ON_START=true` | 즉시 `false`로. 복구는 백업에서만 가능 |

---

## 7. 배포 후 남는 일

- [ ] `MINTER_PRIVATE_KEY` 재발급 — 기존 키는 로컬 `.env`에 평문으로 있었습니다
- [ ] 기존 관리자 계정(`admin@basechain.dev` 등) 비밀번호가 교체됐는지 확인.
      1단계에서 `DEMO_ADMIN_PASSWORD`를 설정하고 재시작하면 자동으로 갱신됩니다
- [ ] mock Fabric은 인메모리라 **재시작 시 티켓·예약·응모 기록이 사라집니다.**
      시연 직전에 재시작했다면 시연 데이터를 다시 준비하세요
      (포인트·멤버십은 `point_events`에서 자동 복구됩니다)
