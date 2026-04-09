import { Link } from "react-router";
import { useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  Ticket, ShoppingBag, Sparkles,
  ArrowRight, MapPin, Calendar, Tag, ChevronRight,
  QrCode, Clock, BadgeCheck,
} from "lucide-react";

// ─── DATA ────────────────────────────────────────────────────────────────────

const heroEvent = {
  name: "2026 서울 개막 시리즈",
  subtitle: "구단별 입장권, 선수 카드 NFT, 공식 재판매를 한곳에서 관리하는 야구 팬 플랫폼",
  date: "2026.04.20 (월) 18:30",
  venue: "잠실야구장, 서울",
  openDate: "2026.04.10 오전 11:00 선예매 오픈",
  price: "from ₩29,000",
};

const eventCards = [
  {
    id: 1,
    name: "서울 개막 시리즈 · 두산 vs LG",
    date: "2026.04.20 (월)",
    venue: "잠실야구장",
    price: "29,000원~",
    status: "예매중",
    statusColor: "#2dba73",
    image: "https://images.unsplash.com/photo-1471295253337-3ceaaedca402?w=600&q=80",
    tag: "FEATURED",
  },
  {
    id: 2,
    name: "부산 주말 3연전 · 롯데 vs KIA",
    date: "2026.04.24 (금)",
    venue: "사직야구장",
    price: "24,000원~",
    status: "오픈예정",
    statusColor: "#ff9d3b",
    image: "https://images.unsplash.com/photo-1508344928928-7165b67de128?w=600&q=80",
    tag: "HOT",
  },
  {
    id: 3,
    name: "문학 나이트 게임 · SSG vs 한화",
    date: "2026.04.18 (토)",
    venue: "인천 SSG랜더스필드",
    price: "22,000원~",
    status: "매진임박",
    statusColor: "#1456a0",
    image: "https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?w=600&q=80",
    tag: "D-3",
  },
  {
    id: 4,
    name: "수원 주말 시리즈 · KT vs 삼성",
    date: "2026.04.27 (월)",
    venue: "수원 KT위즈파크",
    price: "21,000원~",
    status: "예매중",
    statusColor: "#2dba73",
    image: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&q=80",
    tag: "NEW",
  },
];


const ticketList = [
  {
    id: 1,
    name: "서울 개막 시리즈 · 두산 vs LG",
    artist: "개막전 스페셜 배지 드롭 포함",
    date: "2026.04.20 (월) 18:30",
    venue: "잠실야구장, 서울",
    price: "29,000원~",
    remaining: 142,
    status: "예매중",
    statusColor: "#2dba73",
    image: "https://images.unsplash.com/photo-1471295253337-3ceaaedca402?w=200&q=80",
  },
  {
    id: 2,
    name: "부산 주말 3연전 · 롯데 vs KIA",
    artist: "사직 응원석 선예매 오픈",
    date: "2026.04.24 (금) 18:30",
    venue: "사직야구장, 부산",
    price: "24,000원~",
    remaining: 0,
    status: "오픈예정",
    statusColor: "#ff9d3b",
    image: "https://images.unsplash.com/photo-1508344928928-7165b67de128?w=200&q=80",
  },
  {
    id: 3,
    name: "문학 나이트 게임 · SSG vs 한화",
    artist: "나이트 응원전 전용 한정 카드 드롭",
    date: "2026.04.18 (토) 18:00",
    venue: "인천 SSG랜더스필드, 인천",
    price: "22,000원~",
    remaining: 21,
    status: "매진임박",
    statusColor: "#1456a0",
    image: "https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?w=200&q=80",
  },
  {
    id: 4,
    name: "수원 주말 시리즈 · KT vs 삼성",
    artist: "가족석, 테이블석 동시 오픈",
    date: "2026.04.27 (월) 18:30",
    venue: "수원 KT위즈파크, 수원",
    price: "21,000원~",
    remaining: 380,
    status: "예매중",
    statusColor: "#2dba73",
    image: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&q=80",
  },
  {
    id: 5,
    name: "대구 홈 매치 · 삼성 vs NC",
    artist: "야간 경기 포토존 NFT 포함",
    date: "2026.05.02 (토) 17:00",
    venue: "대구 삼성라이온즈파크, 대구",
    price: "20,000원~",
    remaining: 200,
    status: "예매중",
    statusColor: "#2dba73",
    image: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=200&q=80",
  },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 32 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

function NeonBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className="text-xs px-2.5 py-1 rounded-full font-bold tracking-wide"
      style={{ background: `${color}22`, border: `1px solid ${color}`, color }}>
      {label}
    </span>
  );
}

// ─── NFT TICKET CARD ─────────────────────────────────────────────────────────

function NftTicketCard() {
  return (
    <motion.div
      initial={{ opacity: 0, rotateY: -15, x: 60 }}
      animate={{ opacity: 1, rotateY: 0, x: 0 }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
      style={{ perspective: "1000px" }}
      className="relative w-full max-w-sm mx-auto"
    >
      {/* Glow behind card */}
      <div className="absolute inset-0 rounded-3xl blur-3xl -z-10"
        style={{ background: "linear-gradient(135deg, rgba(20,86,160,0.28), rgba(45,186,115,0.22))" }} />

      {/* Card body */}
      <div className="relative rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(10,31,56,0.96) 0%, rgba(7,21,39,0.98) 100%)",
          border: "1px solid rgba(45,186,115,0.34)",
          boxShadow: "0 0 40px rgba(20,86,160,0.18), 0 0 80px rgba(45,186,115,0.08), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}>

        {/* Holographic top strip */}
        <div className="h-1.5 w-full"
          style={{ background: "linear-gradient(90deg, #1456a0, #2dba73, #7ec8ff, #1456a0)", backgroundSize: "200% 100%", animation: "shimmer 3s linear infinite" }} />

        {/* Card content */}
        <div className="p-6">
          {/* Header row */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] tracking-[0.3em] text-[#a393d1] uppercase mb-1">NFT · TICKET</p>
              <p className="text-xs font-bold" style={{ color: "#7ec8ff", textShadow: "0 0 8px rgba(126,200,255,0.7)" }}>
                #PASS-2026-042
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #1456a0, #2dba73)", boxShadow: "0 0 16px rgba(20,86,160,0.4)" }}>
              <Ticket className="w-5 h-5 text-white" />
            </div>
          </div>

          {/* Event name */}
          <div className="mb-5">
            <h3 className="text-xl font-bold text-white mb-1 leading-tight">SEOUL SERIES</h3>
            <p className="text-sm" style={{ color: "#7ec8ff", textShadow: "0 0 6px rgba(126,200,255,0.6)" }}>SEOUL SERIES</p>
          </div>

          {/* Holographic divider */}
          <div className="relative flex items-center mb-5">
            <div className="w-5 h-5 rounded-full -ml-8" style={{ background: "rgba(7,21,39,1)", border: "1px solid rgba(126,200,255,0.26)" }} />
            <div className="flex-1 mx-1 border-t-2 border-dashed" style={{ borderColor: "rgba(126,200,255,0.25)" }} />
            <div className="w-5 h-5 rounded-full -mr-8" style={{ background: "rgba(7,21,39,1)", border: "1px solid rgba(126,200,255,0.26)" }} />
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { label: "DATE", value: "2026.04.20" },
              { label: "TIME", value: "18:30 KST" },
              { label: "VENUE", value: "잠실야구장" },
              { label: "SEAT", value: "1루 R 12열" },
            ].map(item => (
              <div key={item.label}>
                <p className="text-[9px] tracking-widest text-[#a393d1] uppercase mb-0.5">{item.label}</p>
                <p className="text-sm text-white font-medium">{item.value}</p>
              </div>
            ))}
          </div>

          {/* QR section */}
          <div className="flex items-center gap-4 p-3 rounded-2xl"
            style={{ background: "rgba(20,86,160,0.10)", border: "1px solid rgba(126,200,255,0.22)" }}>
            <div className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.05)" }}>
              <QrCode className="w-10 h-10" style={{ color: "#7ec8ff", filter: "drop-shadow(0 0 6px rgba(126,200,255,0.8))" }} />
            </div>
            <div>
              <p className="text-xs text-[#a393d1] mb-0.5">현장 입장</p>
              <p className="text-xs text-white">경기 시작 2시간 전 활성화</p>
              <div className="flex items-center gap-1 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2dba73] animate-pulse" />
                <p className="text-[10px] text-[#2dba73]">VALID</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom holographic accent */}
        <div className="h-1 w-full opacity-60"
          style={{ background: "linear-gradient(90deg, transparent, #1456a0, #2dba73, transparent)" }} />
      </div>
    </motion.div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function Home() {
  const [hoveredEvent, setHoveredEvent] = useState<number | null>(null);

  return (
    <div className="w-full">
      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 · HERO BANNER
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1471295253337-3ceaaedca402?w=1920&q=80"
            alt="baseball stadium"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(5,0,16,0.97) 40%, rgba(5,0,16,0.75) 70%, rgba(5,0,16,0.5) 100%)" }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(5,0,16,0.9) 0%, transparent 50%)" }} />
        </div>

        {/* Scan line effect */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.04]"
          style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,1) 2px, rgba(255,255,255,1) 4px)" }} />

        {/* Content */}
        <div className="relative z-10 w-full max-w-[1600px] mx-auto px-6 pt-[70px]">
          <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[calc(100vh-70px)] py-16">

            {/* Left: Event info */}
            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="soft-badge"
                    style={{ background: "rgba(20,86,160,0.18)", border: "1px solid rgba(126,200,255,0.38)", color: "#7ec8ff" }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#7ec8ff] animate-pulse" />
                    LIVE SERIES
                  </div>
                  <div className="soft-badge"
                    style={{ background: "rgba(45,186,115,0.12)", border: "1px solid rgba(45,186,115,0.4)", color: "#2dba73" }}>
                    <BadgeCheck className="w-3 h-3" />
                    공식 재판매 제한
                  </div>
                </div>

                <h1 className="mb-5" style={{ fontSize: "clamp(2.6rem, 5vw, 4.4rem)", fontWeight: 800, lineHeight: 1.02, letterSpacing: "-0.05em" }}>
                  <span className="block text-white">야구 팬을 위한</span>
                  <span className="block mt-2" style={{
                    background: "linear-gradient(90deg, #7ec8ff, #ffffff, #9fe1bf)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>BASE NINE</span>
                </h1>

                <p className="page-body max-w-xl">
                  {heroEvent.subtitle}
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="space-y-3"
              >
                {/* Event highlight */}
                <div className="p-5 rounded-2xl"
                  style={{ background: "rgba(20,86,160,0.10)", border: "1px solid rgba(126,200,255,0.18)", backdropFilter: "blur(10px)" }}>
                  <p className="page-eyebrow text-[#c6d5ea] mb-3">다음 주요 경기</p>
                  <h2 className="section-title text-[1.65rem] text-white mb-3">{heroEvent.name}</h2>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[0.95rem] text-[#c8b9f0]">
                      <Calendar className="w-4 h-4 text-[#7ec8ff] shrink-0" />
                      {heroEvent.date}
                    </div>
                    <div className="flex items-center gap-2 text-[0.95rem] text-[#c8b9f0]">
                      <MapPin className="w-4 h-4 text-[#2dba73] shrink-0" />
                      {heroEvent.venue}
                    </div>
                    <div className="flex items-center gap-2 text-[0.95rem] text-[#c8b9f0]">
                      <Tag className="w-4 h-4 text-[#ffce67] shrink-0" />
                      {heroEvent.price} &nbsp;·&nbsp;
                      <span className="text-[#ffce67]">{heroEvent.openDate}</span>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.35 }}
                className="flex flex-wrap gap-3"
              >
                <Link to="/tickets">
                  <button className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105 hover:brightness-110"
                    style={{ background: "linear-gradient(135deg, #1456a0, #1e7fd0)", boxShadow: "0 0 24px rgba(20,86,160,0.35), 0 0 48px rgba(20,86,160,0.12)" }}>
                    <Ticket className="w-4 h-4" />
                    경기 예매하기
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
                <Link to="/my-tickets">
                  <button className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-105"
                    style={{ background: "rgba(45,186,115,0.10)", border: "1px solid rgba(45,186,115,0.36)", color: "#8ff1bb", boxShadow: "0 0 16px rgba(45,186,115,0.12)" }}>
                    <QrCode className="w-4 h-4" />
                    내 입장권 보기
                  </button>
                </Link>
              </motion.div>

              {/* Stats row */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="flex gap-6 pt-2"
              >
                {[
                  { value: "18,240+", label: "발급된 입장권 NFT", color: "#7ec8ff" },
                  { value: "92", label: "등록된 경기", color: "#ffffff" },
                  { value: "0건", label: "비공식 거래 신고", color: "#9fe1bf" },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-[1.35rem] font-bold tracking-[-0.04em]" style={{ color: s.color, textShadow: `0 0 10px ${s.color}40` }}>{s.value}</p>
                    <p className="page-stat-label mt-1">{s.label}</p>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right: NFT Ticket Card */}
            <div className="flex justify-center lg:justify-end">
              <NftTicketCard />
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 z-10"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(5,0,16,1))" }} />
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2 · AVAILABLE EVENTS
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative py-24">
        <div className="max-w-[1600px] mx-auto px-6">
          <FadeIn className="mb-12">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-0.5" style={{ background: "linear-gradient(90deg, #ff10f0, transparent)" }} />
                  <span className="page-eyebrow text-[#1456a0]">Games</span>
                </div>
                <h2 className="section-title text-white">예매 가능한 경기</h2>
                <p className="page-muted mt-2">좌석 선택부터 공식 재판매 제한까지 한 화면에서 관리할 수 있어요.</p>
              </div>
              <Link to="/tickets">
                <button className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105"
                  style={{ background: "rgba(20,86,160,0.14)", border: "1px solid rgba(126,200,255,0.32)", color: "#7ec8ff" }}>
                  전체 보기 <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {eventCards.map((ev, i) => (
              <FadeIn key={ev.id} delay={i * 0.1}>
                <div
                  className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300"
                  style={{
                    border: hoveredEvent === ev.id ? `1px solid ${ev.statusColor}66` : "1px solid rgba(255,16,240,0.15)",
                    background: "rgba(15,8,35,0.8)",
                    boxShadow: hoveredEvent === ev.id ? `0 0 30px ${ev.statusColor}22` : "none",
                  }}
                  onMouseEnter={() => setHoveredEvent(ev.id)}
                  onMouseLeave={() => setHoveredEvent(null)}
                >
                  {/* Thumbnail */}
                  <div className="relative h-52 overflow-hidden">
                    <img src={ev.image} alt={ev.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(5,0,16,0.9) 0%, rgba(5,0,16,0.2) 60%, transparent 100%)" }} />

                    {/* Tag badge */}
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold"
                      style={{ background: "rgba(5,0,16,0.7)", border: `1px solid ${ev.statusColor}`, color: ev.statusColor, backdropFilter: "blur(8px)" }}>
                      {ev.tag}
                    </div>

                    {/* Status badge */}
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold"
                      style={{ background: `${ev.statusColor}22`, border: `1px solid ${ev.statusColor}`, color: ev.statusColor, backdropFilter: "blur(8px)" }}>
                      {ev.status}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="text-white text-sm font-bold mb-2 truncate">{ev.name}</h3>
                    <div className="space-y-1.5 mb-4">
                      <div className="flex items-center gap-2 text-xs text-[#a393d1]">
                        <Calendar className="w-3.5 h-3.5 text-[#00d9ff]" />{ev.date}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#a393d1]">
                        <MapPin className="w-3.5 h-3.5 text-[#ff10f0]" />{ev.venue}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Tag className="w-3.5 h-3.5 text-[#00ff88]" />
                        <span className="text-[#00ff88] font-bold">{ev.price}</span>
                      </div>
                    </div>
                    <Link to="/tickets">
                      <button className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all duration-200"
                        style={{
                          background: hoveredEvent === ev.id
                            ? `linear-gradient(135deg, #ff10f0, #bd00e8)`
                            : "rgba(255,16,240,0.1)",
                          border: "1px solid rgba(255,16,240,0.3)",
                          boxShadow: hoveredEvent === ev.id ? "0 0 16px rgba(255,16,240,0.4)" : "none",
                        }}>
                        {ev.status === "오픈예정" ? "알림 신청" : "예매하기"}
                      </button>
                    </Link>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5 · TICKET BOOKING LIST
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative py-24">
        {/* Section bg accent */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(180deg, transparent, rgba(255,16,240,0.03) 50%, transparent)" }} />

        <div className="max-w-[1600px] mx-auto px-6">
          <FadeIn className="mb-10">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-0.5" style={{ background: "linear-gradient(90deg, #ffaa00, transparent)" }} />
                  <span className="page-eyebrow text-[#ffce67]">Season Games</span>
                </div>
                <h2 className="section-title text-white mb-1">전체 경기 일정</h2>
                <p className="page-muted mt-2">진행 중인 홈경기와 원정전, 좌석 오픈 일정을 빠르게 확인할 수 있어요.</p>
              </div>
              <Link to="/tickets">
                <button className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105"
                  style={{ background: "rgba(255,170,0,0.08)", border: "1px solid rgba(255,170,0,0.3)", color: "#ffaa00" }}>
                  전체 보기 <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            </div>
          </FadeIn>

          {/* List */}
          <div className="space-y-3">
            {ticketList.map((ev, i) => (
              <FadeIn key={ev.id} delay={i * 0.07}>
                <div className="group relative rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer"
                  style={{ background: "rgba(15,8,35,0.7)", border: "1px solid rgba(255,16,240,0.12)", backdropFilter: "blur(12px)" }}
                  onMouseEnter={e => { e.currentTarget.style.border = `1px solid ${ev.statusColor}33`; e.currentTarget.style.boxShadow = `0 0 20px ${ev.statusColor}12`; }}
                  onMouseLeave={e => { e.currentTarget.style.border = "1px solid rgba(255,16,240,0.12)"; e.currentTarget.style.boxShadow = "none"; }}>

                  {/* Left accent line */}
                  <div className="absolute left-0 top-0 bottom-0 w-0.5"
                    style={{ background: `linear-gradient(180deg, transparent, ${ev.statusColor}, transparent)` }} />

                  <div className="flex items-center gap-5 p-5">
                    {/* Poster */}
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
                      <img src={ev.image} alt={ev.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0" style={{ background: "rgba(5,0,16,0.2)" }} />
                    </div>

                    {/* Event info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white text-sm font-bold truncate">{ev.name}</h3>
                        <NeonBadge label={ev.status} color={ev.statusColor} />
                      </div>
                      <p className="text-xs text-[#a393d1] mb-2">{ev.artist}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-[#a393d1]">
                          <Calendar className="w-3.5 h-3.5 text-[#00d9ff]" />{ev.date}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[#a393d1]">
                          <MapPin className="w-3.5 h-3.5 text-[#ff10f0]" />{ev.venue}
                        </div>
                      </div>
                    </div>

                    {/* Price & button */}
                    <div className="shrink-0 text-right flex flex-col items-end gap-2">
                      <div>
                        <p className="text-xs text-[#a393d1]">티켓 가격</p>
                        <p className="text-sm font-bold" style={{ color: "#00ff88" }}>{ev.price}</p>
                      </div>
                      {ev.remaining > 0 ? (
                        <div className="flex items-center gap-1 text-[10px]"
                          style={{ color: ev.remaining < 50 ? "#ff10f0" : "#a393d1" }}>
                          <Clock className="w-3 h-3" />
                          {ev.remaining < 50 ? `${ev.remaining}석 남음` : `${ev.remaining}석 이상`}
                        </div>
                      ) : (
                        <div className="text-[10px] text-[#a393d1]">예매 대기</div>
                      )}
                      <Link to="/tickets">
                        <button className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all duration-200 hover:scale-105"
                          style={{
                            background: ev.status === "오픈예정"
                              ? "rgba(255,170,0,0.15)"
                              : "linear-gradient(135deg, #ff10f0, #bd00e8)",
                            border: ev.status === "오픈예정" ? "1px solid rgba(255,170,0,0.4)" : "none",
                            color: ev.status === "오픈예정" ? "#ffaa00" : "white",
                            boxShadow: ev.status !== "오픈예정" ? "0 0 12px rgba(255,16,240,0.4)" : "none",
                          }}>
                          {ev.status === "오픈예정" ? "알림 신청" : "예매하기"}
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* View all */}
          <FadeIn delay={0.3} className="text-center mt-8">
            <Link to="/tickets">
              <button className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
                style={{ background: "linear-gradient(135deg, rgba(255,16,240,0.2), rgba(0,217,255,0.2))", border: "1px solid rgba(255,16,240,0.3)", backdropFilter: "blur(8px)" }}>
                <Ticket className="w-4 h-4 text-[#7ec8ff]" />
                전체 경기 보기
                <ChevronRight className="w-4 h-4" />
              </button>
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1508344928928-7165b67de128?w=1920&q=80" alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(8,24,44,0.92), rgba(13,39,67,0.88))" }} />
        </div>
        <div className="relative z-10 max-w-[1600px] mx-auto px-6 text-center">
          <FadeIn>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
              style={{ background: "rgba(45,186,115,0.16)", border: "1px solid rgba(45,186,115,0.34)", color: "#9fe1bf" }}>
              <Sparkles className="w-3 h-3" />
              야구 팬을 위한 공식 블록체인 티켓팅
            </div>
            <h2 className="text-white mb-4" style={{ fontSize: "clamp(1.9rem, 4vw, 3rem)", fontWeight: 800, lineHeight: 1.14, letterSpacing: "-0.05em" }}>
              지금 바로 시작하세요
            </h2>
            <p className="page-subtitle mb-8 max-w-xl mx-auto">
              블록체인 입장권으로 경기를 예매하고, 선수 카드와 직관 굿즈를 수집하고, 공식 장터에서 안전하게 거래하세요.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link to="/tickets">
                <button className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold text-white hover:scale-105 transition-all"
                  style={{ background: "linear-gradient(135deg, #ff10f0, #bd00e8)", boxShadow: "0 0 28px rgba(255,16,240,0.5)" }}>
                  <Ticket className="w-4 h-4" />
                  지금 경기 보기
                </button>
              </Link>
              <Link to="/market">
                <button className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold hover:scale-105 transition-all"
                  style={{ background: "rgba(126,200,255,0.10)", border: "1px solid rgba(126,200,255,0.34)", color: "#b9e5ff" }}>
                  <ShoppingBag className="w-4 h-4" />
                  장터 둘러보기
                </button>
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
