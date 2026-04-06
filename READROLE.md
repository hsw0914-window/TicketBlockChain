# TicketBlockChain - 역할 분담표

각 팀원은 담당 기능의 **프론트엔드 + 백엔드**를 함께 개발합니다.  
백엔드 파일은 현재 미구현 상태이며, 각자 담당 영역에 맞게 새로 생성해야 합니다.

---

## 담당자별 파일 목록

---

### 한승우 — 메인페이지 + 커뮤니티

#### 프론트엔드 (기존 파일)
| 파일 경로 | 설명 |
|-----------|------|
| `Proje/app/pages/Home.tsx` | 메인 홈 - 주요 기능 소개, 이벤트 목록 |
| `Proje/app/pages/Community.tsx` | 커뮤니티 게시판 - 게시글 목록, 작성, 댓글 |
| `Proje/app/components/Layout.tsx` | 공통 네비게이션 레이아웃 (전체 팀 공유) |

#### 백엔드 (신규 생성 필요)
| 파일 경로 | 설명 |
|-----------|------|
| `backend/routes/home.js` | 홈 화면용 주요 이벤트·배너 데이터 API |
| `backend/routes/community.js` | 게시글 CRUD, 댓글 API |
| `backend/models/Post.js` | 게시글 데이터 모델 |
| `backend/models/Comment.js` | 댓글 데이터 모델 |

---

### 박주영 — 조합 + 장터

#### 프론트엔드 (기존 파일)
| 파일 경로 | 설명 |
|-----------|------|
| `Proje/app/pages/Combine.tsx` | 카드 조합 - 조각 수집 및 합성 시스템 |
| `Proje/app/pages/Market.tsx` | NFT 장터 - 카드 거래, 가격 차트, 판매 리스팅 |
| `Proje/app/pages/Collection.tsx` | 내 컬렉션 - 보유 NFT 카드 목록 |
| `Proje/app/pages/MemeInfo.tsx` | 밈/카드 시스템 안내 |
| `Proje/app/pages/Detail.tsx` | 아이템 상세 페이지 |
| `Proje/app/components/LegendaryReveal.tsx` | 전설 등급 카드 공개 애니메이션 |

#### 백엔드 (신규 생성 필요)
| 파일 경로 | 설명 |
|-----------|------|
| `backend/routes/market.js` | 카드 거래 목록 조회, 구매·판매 등록 API |
| `backend/routes/combine.js` | 카드 조각 합성 로직, 개봉(가챠) API |
| `backend/models/Card.js` | NFT 카드 데이터 모델 |
| `backend/models/Listing.js` | 마켓 판매 등록 모델 |

---

### 김상윤 — 예매 + 입장권

#### 프론트엔드 (기존 파일)
| 파일 경로 | 설명 |
|-----------|------|
| `Proje/app/pages/Tickets.tsx` | 경기 목록 - 검색, 필터, 잔여석 표시 |
| `Proje/app/pages/TicketBooking.tsx` | 티켓 예매 4단계 흐름 (인증→등급→좌석→결제) |
| `Proje/app/pages/MyTickets.tsx` | 내 티켓 - 예매 내역, QR코드, NFT ID |
| `Proje/app/pages/Attendance.tsx` | 출석 체크 / 이벤트 참석 관리 |
| `Proje/app/data/ticketing.ts` | 경기·좌석·가격 목 데이터 및 예매 로직 |
| `Proje/app/types/ethereum.d.ts` | MetaMask window.ethereum 타입 선언 |

#### 백엔드 (신규 생성 필요)
| 파일 경로 | 설명 |
|-----------|------|
| `backend/routes/tickets.js` | 경기 목록 조회, 잔여석 조회 API |
| `backend/routes/booking.js` | 예매 생성·취소, 좌석 점유 처리 API |
| `backend/routes/attendance.js` | QR 입장 검증, 출석 체크 API |
| `backend/models/Event.js` | 경기 이벤트 데이터 모델 |
| `backend/models/Ticket.js` | 예매 티켓 데이터 모델 (NFT ID 포함) |
| `backend/models/Seat.js` | 좌석 상태 관리 모델 |

---

### 박재현 — 마이페이지 + 공지사항

#### 프론트엔드 (기존 파일)
| 파일 경로 | 설명 |
|-----------|------|
| `Proje/app/pages/MyPage.tsx` | 마이페이지 - 프로필, 보유 자산, 설정 |
| `Proje/app/pages/Notice.tsx` | 공지사항 목록 및 상세 |
| `Proje/app/pages/Onboarding.tsx` | 첫 방문자 온보딩 화면 |
| `Proje/app/pages/Shop.tsx` | 상점 - 이용권·아이템 구매 |
| `Proje/app/context/AppSettingsContext.tsx` | 전역 상태 - 테마, MetaMask 지갑 연결 관리 |

#### 백엔드 (신규 생성 필요)
| 파일 경로 | 설명 |
|-----------|------|
| `backend/routes/auth.js` | 지갑 기반 로그인·인증, 세션 관리 API |
| `backend/routes/user.js` | 유저 프로필 조회·수정 API |
| `backend/routes/notice.js` | 공지사항 CRUD API |
| `backend/routes/shop.js` | 상점 아이템 조회, 구매 처리 API |
| `backend/models/User.js` | 유저 데이터 모델 (지갑 주소 기반) |
| `backend/models/Notice.js` | 공지사항 데이터 모델 |

---

## 전체 팀 공통 파일

아래 파일은 특정 담당자 없이 **전체 팀이 함께 관리**합니다.

| 파일 경로 | 설명 |
|-----------|------|
| `Proje/app/App.tsx` | 루트 컴포넌트, Provider 설정 |
| `Proje/app/routes.tsx` | 전체 라우트 정의 |
| `Proje/app/components/ui/` | Radix UI 공통 컴포넌트 (버튼, 카드, 탭 등) |
| `Proje/styles/` | 전체 테마 및 CSS 변수 |
| `Proje/package.json` | 의존성 관리 |
| `Proje/vite.config.ts` | 빌드 설정 |
| `backend/index.js` | 백엔드 서버 진입점 (신규 생성) |
| `backend/db.js` | DB 연결 설정 (신규 생성) |

---

## 요약

| 담당자 | 담당 기능 | 주요 페이지 |
|--------|-----------|------------|
| 한승우 | 메인페이지 + 커뮤니티 | `Home.tsx`, `Community.tsx` |
| 박주영 | 조합 + 장터 | `Combine.tsx`, `Market.tsx`, `Collection.tsx` |
| 김상윤 | 예매 + 입장권 | `Tickets.tsx`, `TicketBooking.tsx`, `MyTickets.tsx` |
| 박재현 | 마이페이지 + 공지사항 | `MyPage.tsx`, `Notice.tsx`, `Onboarding.tsx` |
