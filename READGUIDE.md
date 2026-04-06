# TicketBlockChain - 프로젝트 가이드

블록체인 기반 티켓 예매 및 NFT 카드 거래 플랫폼입니다.  
MetaMask 지갑 연동을 지원하며, 경기 티켓 예매·NFT 마켓플레이스·카드 컬렉션 기능을 제공합니다.

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | React 19, TypeScript 5.8 |
| 라우팅 | React Router 7 |
| 스타일링 | Tailwind CSS 4, Radix UI |
| 애니메이션 | Motion (Framer Motion 계열) |
| 차트 | Recharts |
| 블록체인 | MetaMask (window.ethereum / EIP-1193) |
| 빌드 도구 | Vite 6 |

---

## 파일 구조

```
TicketBlockChain/
├── README.md                      # 프로젝트 이름만 명시된 기본 README
├── READGUIDE.md                   # 이 파일 - 프로젝트 전체 가이드
└── Proje/                         # 메인 프로젝트 디렉토리
    ├── index.html                 # SPA 루트 HTML (div#root)
    ├── main.tsx                   # React 앱 진입점, StrictMode 적용
    ├── package.json               # 의존성 및 스크립트 정의
    ├── tsconfig.json              # TypeScript 설정
    ├── vite.config.ts             # Vite 빌드 설정
    │
    ├── app/
    │   ├── App.tsx                # 루트 컴포넌트 - Provider 및 Router 설정
    │   ├── routes.tsx             # 전체 페이지 라우트 정의
    │   │
    │   ├── components/
    │   │   ├── Layout.tsx         # 공통 레이아웃 - 네비게이션, 테마 토글, 지갑 연결 버튼
    │   │   ├── LegendaryReveal.tsx # 전설 등급 카드 공개 애니메이션 컴포넌트
    │   │   ├── figma/
    │   │   │   └── ImageWithFallback.tsx  # 이미지 로드 실패 시 폴백 처리
    │   │   └── ui/                # Radix UI 기반 공통 컴포넌트 45개+
    │   │       └── (button, card, tabs, dialog, form, badge 등)
    │   │
    │   ├── pages/
    │   │   ├── Home.tsx           # 메인 홈 - 주요 기능 소개, 이벤트 목록
    │   │   ├── Tickets.tsx        # 경기 목록 - 검색, 필터, 잔여석·상태 표시
    │   │   ├── TicketBooking.tsx  # 티켓 예매 - 본인인증 → 좌석 등급 → 좌석 선택 → 결제
    │   │   ├── MyTickets.tsx      # 내 티켓 - 예매 내역, QR코드, NFT ID 표시
    │   │   ├── Combine.tsx        # 카드 합성 - 조각 수집 후 완성 카드로 합성
    │   │   ├── Market.tsx         # NFT 마켓플레이스 - 선수 카드 거래, 가격 차트
    │   │   ├── Community.tsx      # 커뮤니티 게시판
    │   │   ├── Notice.tsx         # 공지사항
    │   │   ├── Attendance.tsx     # 출석 체크 / 이벤트 참석 관리
    │   │   ├── Collection.tsx     # 내 컬렉션 - 보유 NFT 카드 목록
    │   │   ├── Detail.tsx         # 아이템 상세 페이지
    │   │   ├── MemeInfo.tsx       # 밈/카드 시스템 안내
    │   │   ├── MyPage.tsx         # 마이페이지 - 프로필, 설정
    │   │   ├── Shop.tsx           # 상점 - 아이템 및 이용권 구매
    │   │   ├── Onboarding.tsx     # 첫 방문자 온보딩 (localStorage 플래그 저장)
    │   │   └── NotFound.tsx       # 404 에러 페이지
    │   │
    │   ├── context/
    │   │   └── AppSettingsContext.tsx  # 전역 상태 - 테마(라이트/다크), MetaMask 지갑 연결
    │   │
    │   ├── data/
    │   │   └── ticketing.ts       # 목 데이터 - 경기 이벤트, 좌석 등급, 가격, 예매 로직
    │   │
    │   └── types/
    │       └── ethereum.d.ts      # MetaMask window.ethereum 타입 선언
    │
    ├── styles/
    │   ├── index.css              # 기본 스타일 - 폰트 스택, 기본 색상, 트랜지션
    │   ├── theme.css              # 테마 변수 - 네온 사이버펑크 팔레트, 글래스모피즘
    │   ├── tailwind.css           # Tailwind 지시어 import
    │   └── fonts.css              # 폰트 import (Pretendard, Noto Sans KR)
    │
    └── dist/                      # 빌드 결과물 (npm run build 후 생성)
```

---

## 주요 기능 설명

### 티켓 예매 시스템
- 잠실·사직·인천 등 실제 구장 기반 경기 일정 제공
- 4단계 예매 흐름: 본인인증 → 좌석 등급 선택 → 좌석 선택 → 결제 확인
- 성인 / 청소년 / 회원 / 어린이 요금 차등 적용
- 예매 완료 시 NFT 티켓 ID(`#GAME-XXXX`) 발급
- QR코드 기반 입장권 제공

### NFT 마켓플레이스
- 선수 카드 조각 수집 → 합성 시스템 (가챠 방식)
- 실시간 가격 차트 및 거래 내역 조회
- 판매자별 평판 점수 및 리스팅 기능

### 블록체인 연동
- MetaMask 지갑 연결 / 해제 (EIP-1193)
- 계정 변경 및 체인 변경 이벤트 자동 감지
- 지갑 주소와 체인 ID를 localStorage에 저장

> **참고:** 현재는 스마트 컨트랙트 미배포 상태로, 블록체인 관련 데이터는 프론트엔드 목 데이터로 동작합니다.

---

## 실행 방법

### 사전 요구사항

- Node.js 18 이상
- npm 9 이상
- (선택) MetaMask 브라우저 확장 프로그램

### 개발 서버 실행

```bash
# 1. 프로젝트 디렉토리로 이동
cd TicketBlockChain/Proje

# 2. 의존성 설치
npm install

# 3. 개발 서버 시작
npm run dev
```

브라우저에서 [http://127.0.0.1:5173](http://127.0.0.1:5173) 접속

### 프로덕션 빌드

```bash
# 빌드 (결과물: Proje/dist/)
npm run build

# 빌드 결과물 로컬 미리보기
npm run preview
```

### 첫 실행 시 주의사항

1. 처음 접속 시 `/onboarding` 페이지로 이동합니다.
2. 온보딩을 완료해야 메인 화면으로 진입할 수 있습니다.
3. MetaMask가 설치된 경우 우측 상단 지갑 연결 버튼으로 지갑을 연동할 수 있습니다.

---

## 페이지 라우트 목록

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/` | Home | 메인 홈 |
| `/tickets` | Tickets | 경기 목록 |
| `/tickets/:id/booking` | TicketBooking | 티켓 예매 |
| `/my-tickets` | MyTickets | 내 티켓 |
| `/combine` | Combine | 카드 합성 |
| `/market` | Market | NFT 마켓 |
| `/community` | Community | 커뮤니티 |
| `/notice` | Notice | 공지사항 |
| `/attendance` | Attendance | 출석 체크 |
| `/collection` | Collection | 내 컬렉션 |
| `/shop` | Shop | 상점 |
| `/mypage` | MyPage | 마이페이지 |
| `/onboarding` | Onboarding | 온보딩 |
| `*` | NotFound | 404 |

---

## 개발 관련 참고사항

- **상태 관리**: React Context API (`AppSettingsContext`) 사용, 별도 상태 관리 라이브러리 없음
- **데이터 영속성**: 지갑 정보, 테마, 예매 내역 모두 `localStorage`에 저장
- **목 데이터**: `app/data/ticketing.ts`에 경기·좌석 데이터 하드코딩
- **다크모드**: CSS 변수 기반 네온 사이버펑크 테마, 라이트/다크 토글 지원
- **언어**: 한국어 UI
