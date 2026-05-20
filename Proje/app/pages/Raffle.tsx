import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import {
  ChevronLeft, Clock, CheckCircle2, Gift, Ticket,
  AlertCircle, Sparkles, Trophy, Wallet, Search,
  CalendarCheck, Lock, XCircle, MapPin, ChevronRight,
  Timer,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppSettings } from "../context/AppSettingsContext";

const API = import.meta.env.VITE_API_URL as string;
const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}`,
});

type Game = {
  id: string;
  home_team: string;
  away_team: string;
  game_date: string;
  game_time: string;
  stadium_name: string;
  status: string;
  raffle_open_at: string | null;
  booking_open_at: string | null;
};

type Entry = {
  id: number;
  game_id: string;
  status: "applied" | "won" | "lost";
  tickets_used: number;
  result_visible: boolean;
  raffle_close_at: string | null;
  applied_at: string;
  home_team: string;
  away_team: string;
  game_date: string;
  game_time: string;
  stadium_name: string;
  booking_open_at: string | null;
};

type Tier = "일반" | "브론즈" | "실버" | "골드";
const TIER_MAX_TICKETS: Record<Tier, number> = { 일반: 1, 브론즈: 1, 실버: 2, 골드: 2 };
const TIER_COLOR: Record<Tier, { bg: string; color: string; border: string }> = {
  일반:  { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" },
  브론즈: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  실버:  { bg: "#f8fafc", color: "#475569", border: "#cbd5e1" },
  골드:  { bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
};

type RaffleWindowState = "before" | "open" | "closed";

function getRaffleWindowState(raffleOpenAt: string | null, now: Date): RaffleWindowState {
  if (!raffleOpenAt) return "before";
  const open  = new Date(raffleOpenAt);
  const close = new Date(open.getTime() + 2 * 60 * 60 * 1000);
  if (now < open)  return "before";
  if (now < close) return "open";
  return "closed";
}

function raffleCloseDate(raffleOpenAt: string | null): Date | null {
  if (!raffleOpenAt) return null;
  return new Date(new Date(raffleOpenAt).getTime() + 2 * 60 * 60 * 1000);
}

function fmtTime(date: Date) {
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

function fmtDatetime(date: Date) {
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })
    + " " + date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function remainLabel(target: Date, now: Date): string {
  const diff = Math.max(0, target.getTime() - now.getTime());
  const totalMin = Math.floor(diff / 60000);
  const d = Math.floor(totalMin / 60 / 24);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  if (d > 0) return `${d}일 ${h}시간 후`;
  if (h > 0) return `${h}시간 ${m}분 후`;
  if (m > 0) return `${m}분 후`;
  return "곧";
}

function seatUnlockDate(bookingOpenAt: string | null): Date | null {
  if (!bookingOpenAt) return null;
  return new Date(new Date(bookingOpenAt).getTime() - 2 * 60 * 60 * 1000);
}

const STEPS = [
  { label: "NFT 확인",    desc: "티켓 보유 검증" },
  { label: "응모하기",    desc: "응모권 제출" },
  { label: "결과 대기",   desc: "창 마감 후 공개" },
  { label: "당첨 확인",   desc: "결과 발표" },
];

type Tab = "raffle" | "history";
type GameFilter = "open" | "before" | "closed";


export function Raffle() {
  const navigate = useNavigate();
  const { walletAddress, walletConnected } = useAppSettings();

  const [tab, setTab]               = useState<Tab>("raffle");
  const [games, setGames]           = useState<Game[]>([]);
  const [entries, setEntries]       = useState<Entry[]>([]);
  const [gameFilter, setGameFilter] = useState<GameFilter>("open");
  const [selected, setSelected]     = useState<Game | null>(null);
  const [raffleCount, setRaffleCount] = useState<number | null>(null);
  const [tier, setTier]             = useState<Tier>("일반");
  const [ticketsUsed, setTicketsUsed] = useState<number>(1); // 초기값 1로 변경하여 즉시 응모 가능하게 수정
  const [applying, setApplying]     = useState(false);
  const [msg, setMsg]               = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [now, setNow]               = useState(new Date());
  const maxTickets                  = useMemo(() => TIER_MAX_TICKETS[tier], [tier]);

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "미연결";
  const nftId = walletAddress
    ? `GAME-${walletAddress.slice(-8).toUpperCase()}`
    : "GAME-WAITING";

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const loadData = async () => {
    try {
      const gamesRes = await fetch(`${API}/api/tickets/games`);
      const gamesData = await gamesRes.json();
      if (gamesData.success) {
        setGames(gamesData.data);
        // 필터링된 게임 중 첫 번째 자동 선택 로직은 렌더링 시점에 수행
      }

      const countRes = await fetch(`${API}/api/auth/early-access-count`, { headers: authHeader() });
      const countData = await countRes.json();
      if (countData.success) {
        setRaffleCount(countData.count);
        if (countData.tier) setTier(countData.tier as Tier);
      }

      const entriesRes = await fetch(`${API}/api/auth/raffle/my-entries`, { headers: authHeader() });
      const entriesData = await entriesRes.json();
      if (entriesData.success) setEntries(entriesData.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { void loadData(); }, []);

  // 필터링된 게임 목록
  const filteredGamesList = useMemo(() => {
    return games.filter(g => {
      const ws = getRaffleWindowState(g.raffle_open_at, now);
      return ws === gameFilter;
    });
  }, [games, gameFilter, now]);

  // 필터가 변경될 때 첫 번째 항목 자동 선택
  useEffect(() => {
    if (filteredGamesList.length > 0) {
      // 현재 선택된게 목록에 없으면 첫번째꺼 선택
      const isStillVisible = selected && filteredGamesList.find(g => g.id === selected.id);
      if (!selected || !isStillVisible) {
        setSelected(filteredGamesList[0]);
      }
    }
  }, [gameFilter, filteredGamesList]);

  // 현재 선택된 게임 정보 상세
  const currentEntry   = selected ? entries.find(e => e.game_id === selected.id) ?? null : null;
  const isApplied      = !!currentEntry;
  const windowState    = selected ? getRaffleWindowState(selected.raffle_open_at, now) : null;
  const raffleClose    = selected ? raffleCloseDate(selected.raffle_open_at) : null;
  const resultVisible  = currentEntry ? (currentEntry.result_visible || (raffleClose ? now >= raffleClose : false)) : false;
  const isWon          = resultVisible && currentEntry?.status === "won";
  const isLost         = resultVisible && currentEntry?.status === "lost";
  const bookingOpen    = selected?.booking_open_at ? new Date(selected.booking_open_at) : null;
  const seatUnlock     = seatUnlockDate(selected?.booking_open_at ?? null);
  const isSeatUnlocked = seatUnlock ? now >= seatUnlock : false;
  const currentStep    = !isApplied ? 1 : !resultVisible ? 2 : 3;

  async function handleApply() {
    if (!selected) return;
    if (!walletConnected) { setMsg({ type: "error", text: "지갑을 먼저 연결해주세요." }); return; }
    if (raffleCount === null || raffleCount < ticketsUsed) { setMsg({ type: "error", text: "사용 가능한 응모권이 부족합니다." }); return; }
    setApplying(true);
    setMsg(null);
    try {
      const res = await fetch(`${API}/api/auth/raffle/apply`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ gameId: selected.id, ticketsUsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "응모 실패");
      setMsg({ type: "success", text: "응모가 정상적으로 접수되었습니다!" });
      await loadData();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "응모 중 오류" });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="page-shell max-w-[1080px] space-y-8">

      {/* ── 상단 정보 바 ── */}
      <div className="flex flex-wrap items-center justify-between gap-6 pb-2">
        <div className="flex items-center gap-4">
          <Link to="/mypage/membership" className="h-10 w-10 flex items-center justify-center rounded-full bg-white border border-[#d1dce7] text-[#526183] hover:bg-[#f1f5f9] transition-all">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-[1.8rem] font-black tracking-tight text-[#1f3248]">우선 응모권</h1>
            <p className="text-[0.9rem] text-[#526183]">응모권으로 인기 경기 우선 예매 자격을 획득하세요.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="px-5 py-2.5 rounded-[16px] bg-white border border-[#d1dce7] shadow-sm flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[#eff6ff] flex items-center justify-center">
              <Ticket className="h-4 w-4 text-[#1456a0]" />
            </div>
            <div>
              <p className="text-[0.7rem] font-bold text-[#8a9aac] uppercase leading-none mb-1">보유 응모권</p>
              <p className="text-[1.1rem] font-black text-[#1456a0] leading-none">
                {raffleCount !== null ? `${raffleCount}장` : "—"}
              </p>
            </div>
          </div>
          <div className="px-5 py-2.5 rounded-[16px] bg-white border border-[#d1dce7] shadow-sm flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[#f1f5f9] flex items-center justify-center">
              <Wallet className="h-4 w-4 text-[#526183]" />
            </div>
            <div>
              <p className="text-[0.7rem] font-bold text-[#8a9aac] uppercase leading-none mb-1">지갑 주소</p>
              <p className="text-[1.1rem] font-black text-[#1f3248] leading-none">{shortAddress}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 탭 메뉴 ── */}
      <div className="flex gap-2">
        {[
          { id: "raffle", label: "응모하기", icon: Sparkles },
          { id: "history", label: "응모 내역", icon: Ticket },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all text-[0.95rem]"
            style={{
              background: tab === t.id ? "#1456a0" : "#ffffff",
              color: tab === t.id ? "#ffffff" : "#526183",
              boxShadow: tab === t.id ? "0 8px 20px rgba(20,86,160,0.15)" : "0 4px 10px rgba(0,0,0,0.03)",
              border: tab === t.id ? "1px solid #1456a0" : "1px solid #d1dce7",
            }}
          >
            <t.icon className={`h-4 w-4 ${tab === t.id ? "text-white" : "text-[#526183]"}`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 응모 내역 탭 ─────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-3">
          {entries.length === 0 ? (
            <div className="rounded-[20px] border px-6 py-12 text-center"
              style={{ background: "#f8fafc", borderColor: "#d1dce7" }}>
              <Gift className="h-10 w-10 mx-auto mb-3" style={{ color: "#94a3b8" }} />
              <p className="text-[0.9rem]" style={{ color: "#526183" }}>아직 응모한 경기가 없어요.</p>
            </div>
          ) : entries.map(entry => {
            const closeAt         = entry.raffle_close_at ? new Date(entry.raffle_close_at) : null;
            const entryVisible    = entry.result_visible || (closeAt ? now >= closeAt : false);
            const visibleStatus   = entryVisible ? entry.status : "applied";
            const entryUnlock     = seatUnlockDate(entry.booking_open_at);
            const entryUnlocked   = entryUnlock ? now >= entryUnlock : false;

            return (
              <div key={entry.id} className="rounded-[20px] border px-6 py-5 flex items-center justify-between gap-4"
                style={{
                  background: "#ffffff",
                  borderColor: visibleStatus === "won" ? "#10b981" : "#d1dce7",
                  boxShadow: "0 4px 20px rgba(17,40,73,0.05)",
                }}>
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex-shrink-0 h-11 w-11 rounded-[14px] flex items-center justify-center"
                    style={{
                      background: visibleStatus === "won"
                        ? "linear-gradient(135deg, #10b981, #059669)"
                        : visibleStatus === "lost" ? "#f1f5f9"
                          : "linear-gradient(135deg, #3b82f6, #2563eb)",
                    }}>
                    {visibleStatus === "won"  ? <Trophy      className="h-5 w-5 text-white" />
                      : visibleStatus === "lost" ? <XCircle className="h-5 w-5 text-[#94a3b8]" />
                        : <Timer className="h-5 w-5 text-white" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-[1rem] truncate text-[#1f3248]">
                      {entry.home_team} vs {entry.away_team}
                    </p>
                    <p className="text-[0.8rem] mt-0.5 text-[#526183]">
                      {fmtDate(entry.game_date)} · {entry.game_time} · {entry.stadium_name}
                    </p>
                    <p className="text-[0.75rem] mt-0.5 text-[#8a9aac]">
                      응모권 {entry.tickets_used ?? 1}장 사용
                    </p>
                    {!entryVisible && closeAt && (
                      <p className="text-[0.73rem] mt-1 font-semibold" style={{ color: "#3b82f6" }}>
                        결과 공개 {remainLabel(closeAt, now)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="rounded-full px-3 py-1 text-[0.72rem] font-bold"
                    style={{
                      background: visibleStatus === "won" ? "#ecfdf5" : visibleStatus === "lost" ? "#f8fafc" : "#eff6ff",
                      color: visibleStatus === "won" ? "#059669" : visibleStatus === "lost" ? "#94a3b8" : "#2563eb",
                      border: visibleStatus === "won" ? "1px solid #bbf7d0" : "1px solid #e2eaf2",
                    }}>
                    {visibleStatus === "won"  ? "당첨"
                      : visibleStatus === "lost" ? "미당첨"
                        : "결과 대기"}
                  </span>
                  {visibleStatus === "won" && (
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => entryUnlocked && navigate(`/tickets/${entry.game_id}/booking?mode=priority`)}
                      disabled={!entryUnlocked}
                      className="flex items-center gap-1.5 rounded-[12px] px-4 py-2 text-[0.8rem] font-black transition-all"
                      style={{
                        background: entryUnlocked ? "#1456a0" : "#e2e8f0",
                        color: entryUnlocked ? "#fff" : "#94a3b8",
                        cursor: entryUnlocked ? "pointer" : "not-allowed",
                        boxShadow: entryUnlocked ? "0 4px 12px rgba(16,185,129,0.3)" : "none",
                      }}>
                      {entryUnlocked
                        ? <><CalendarCheck className="h-3.5 w-3.5" /> 좌석 보러가기</>
                        : <><Lock className="h-3.5 w-3.5" /> {entryUnlock ? remainLabel(entryUnlock, now) + " 활성화" : "잠김"}</>}
                    </motion.button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 응모 탭 ──────────────────────────────────── */}
      {tab === "raffle" && (
        <>
          {/* 결과 대기 배너 */}
          {isApplied && !resultVisible && raffleClose && (
            <div className="rounded-[22px] border px-7 py-5 flex items-start gap-4 overflow-hidden relative"
              style={{ background: "#ffffff", borderColor: "#bfdbfe", boxShadow: "0 8px 32px rgba(59,130,246,0.06)" }}>
              <div className="absolute top-[-20px] right-[-20px] h-36 w-36 rounded-full opacity-15"
                style={{ background: "radial-gradient(circle, #818cf8, transparent)" }} />
              <div className="flex-shrink-0 h-12 w-12 rounded-[16px] flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #3b82f6, #4f46e5)" }}>
                <Timer className="h-6 w-6 text-white" />
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <span className="rounded-full px-2.5 py-0.5 text-[0.68rem] font-black" style={{ background: "#3b82f6", color: "#fff" }}>응모 완료</span>
                  <span className="text-[0.78rem]" style={{ color: "#4f46e5" }}>결과 공개 대기 중</span>
                </div>
                <p className="text-[1.05rem] font-black" style={{ color: "#1e3a5f" }}>
                  {selected?.home_team} vs {selected?.away_team}
                </p>
                <p className="text-[0.82rem] mt-0.5" style={{ color: "#6366f1" }}>
                  결과 공개까지 <strong>{remainLabel(raffleClose, now)}</strong>
                  <span className="ml-2 opacity-70">({fmtDatetime(raffleClose)})</span>
                </p>
              </div>
            </div>
          )}

          {/* 당첨 배너 */}
          {isWon && selected && (
            <div className="rounded-[22px] border px-7 py-6 overflow-hidden relative"
              style={{ background: "#ffffff", borderColor: "#6ee7b7", boxShadow: "0 8px 32px rgba(16,185,129,0.12)" }}>
              <div className="absolute top-[-20px] right-[-20px] h-36 w-36 rounded-full opacity-20"
                style={{ background: "radial-gradient(circle, #10b981, transparent)" }} />
              <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 h-14 w-14 rounded-[18px] flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 6px 20px rgba(16,185,129,0.35)" }}>
                    <Trophy className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="rounded-full px-2.5 py-0.5 text-[0.68rem] font-black" style={{ background: "#10b981", color: "#fff" }}>당첨</span>
                      <span className="text-[0.78rem]" style={{ color: "#059669" }}>축하합니다!</span>
                    </div>
                    <h3 className="text-[1.2rem] font-black" style={{ color: "#064e3b" }}>
                      {selected.home_team} vs {selected.away_team}
                    </h3>
                    <p className="text-[0.82rem] mt-0.5" style={{ color: "#047857" }}>
                      {bookingOpen && <>우선 예매 오픈 <strong>{fmtTime(bookingOpen)}</strong> · </>}
                      {seatUnlock && <>좌석 보기 <strong>{fmtTime(seatUnlock)}</strong></>}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => isSeatUnlocked && navigate(`/tickets/${selected.id}/booking?mode=priority`)}
                  disabled={!isSeatUnlocked}
                  className="flex-shrink-0 flex items-center justify-center gap-2 rounded-[16px] px-6 py-3.5 text-[0.9rem] font-black transition-all"
                  style={{
                    background: isSeatUnlocked ? "linear-gradient(135deg, #10b981, #059669)" : "#e2e8f0",
                    color: isSeatUnlocked ? "#fff" : "#94a3b8",
                    cursor: isSeatUnlocked ? "pointer" : "not-allowed",
                    boxShadow: isSeatUnlocked ? "0 4px 18px rgba(16,185,129,0.4)" : "none",
                    minWidth: "180px",
                  }}>
                  {isSeatUnlocked
                    ? <><CalendarCheck className="h-4 w-4" /> 좌석 보러가기</>
                    : <><Lock className="h-4 w-4" />
                        <span className="text-center leading-tight">
                          <span className="block text-[0.7rem] font-semibold" style={{ color: "#94a3b8" }}>
                            {seatUnlock ? remainLabel(seatUnlock, now) + " 활성화" : ""}
                          </span>
                          <span>좌석 보러가기</span>
                        </span>
                      </>}
                </button>
              </div>
            </div>
          )}

          {/* 낙첨 배너 */}
          {isLost && (
            <div className="rounded-[22px] border px-7 py-5 flex items-start gap-4"
              style={{ background: "#ffffff", borderColor: "#e2eaf2" }}>
              <div className="flex-shrink-0 h-12 w-12 rounded-[16px] flex items-center justify-center" style={{ background: "#f1f5f9" }}>
                <XCircle className="h-6 w-6" style={{ color: "#94a3b8" }} />
              </div>
              <div>
                <p className="text-[1rem] font-black" style={{ color: "#4a5568" }}>이번 응모에 당첨되지 않았어요</p>
                <p className="text-[0.85rem] mt-1" style={{ color: "#94a3b8" }}>다음 경기 응모도 도전해보세요!</p>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
            {/* 왼쪽 */}
            <div className="space-y-5">

              {/* 경기 목록 필터 바 */}
              <div className="rounded-[24px] border overflow-hidden bg-white shadow-sm"
                style={{ borderColor: "#d1dce7" }}>
                <div className="px-5 py-3 border-b flex items-center gap-1.5 overflow-x-auto" style={{ borderColor: "#f1f5f9" }}>
                  {[
                    { id: "open",   label: "응모 중",   icon: Timer,  color: "#1456a0" },
                    { id: "before", label: "응모 예정", icon: Clock,  color: "#64748b" },
                    { id: "closed", label: "마감/종료", icon: Lock,   color: "#64748b" },
                  ].map((f) => {
                    const active = gameFilter === f.id;
                    const Icon = f.icon;
                    return (
                      <button key={f.id} onClick={() => setGameFilter(f.id as GameFilter)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-[0.82rem] font-black transition-all whitespace-nowrap"
                        style={{
                          background: active ? "#eff6ff" : "transparent",
                          color: active ? "#1456a0" : "#8a9aac",
                          border: active ? "1px solid #1456a0" : "1px solid transparent",
                        }}>
                        <Icon className="h-3.5 w-3.5" />
                        {f.label}
                      </button>
                    );
                  })}
                </div>

                {/* 필터링된 목록 */}
                <div className="divide-y" style={{ borderColor: "#f1f5f9" }}>
                  {filteredGamesList.length === 0 && (
                    <p className="px-6 py-12 text-center text-[0.85rem] text-[#8a9aac]">해당 조건의 경기가 없습니다.</p>
                  )}
                  {filteredGamesList.map(game => {
                    const isSelected = selected?.id === game.id;
                    const entry      = entries.find(e => e.game_id === game.id);
                    const ws         = getRaffleWindowState(game.raffle_open_at, now);
                    const closeAt    = raffleCloseDate(game.raffle_open_at);
                    const entryVisible = entry
                      ? (entry.result_visible || (closeAt ? now >= closeAt : false))
                      : false;
                    const visibleStatus = entryVisible ? entry?.status : "applied";

                    const wsLabel =
                      ws === "before" ? { text: "응모 예정", color: "#f59e0b", bg: "#fffbeb" }
                      : ws === "open"  ? { text: "응모 중",   color: "#1456a0", bg: "#eff6ff" }
                      : /* closed */    { text: "응모 종료",  color: "#94a3b8", bg: "#f8fafc" };

                    return (
                      <button key={game.id} onClick={() => { setSelected(game); setMsg(null); }}
                        className="w-full px-6 py-4 flex items-center justify-between gap-3 transition-all hover:bg-[#f7faff] text-left"
                        style={{ background: isSelected ? "#eff6ff" : "transparent", borderLeft: isSelected ? "4px solid #1456a0" : "4px solid transparent" }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                            style={{ background: isSelected ? "#1456a0" : "#d1dce7" }} />
                          <div className="min-w-0">
                            <p className={`font-black text-[1rem] truncate ${isSelected ? "text-[#1456a0]" : "text-[#1f3248]"}`}>
                              {game.home_team} <span className="text-[#8a9aac]">vs</span> {game.away_team}
                            </p>
                            <p className="text-[0.75rem] mt-0.5 text-[#526183]">
                              {fmtDate(game.game_date)} · {game.game_time} · {game.stadium_name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full text-[0.7rem] font-bold" style={{ background: wsLabel.bg, color: wsLabel.color }}>
                           {wsLabel.text}
                          </span>
                          <ChevronRight className="h-4 w-4 text-[#d1dce7]" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 선택 경기 상세 카드 */}
              {selected && (
                <div className="rounded-[32px] border overflow-hidden bg-white shadow-2xl transition-all border-[#e2e8f0]"
                  style={{ borderColor: "#d1dce7" }}>
                  <div className="relative flex flex-col items-center justify-center py-16 gap-4 overflow-hidden">
                    {/* 프리미엄 헤더 배경 */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a8a] via-[#1456a0] to-[#1d4ed8]" />
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl" />
                    
                    <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-[28px] bg-white/10 backdrop-blur-md border border-white/20 shadow-xl">
                      <Gift className="h-10 w-10 text-white" />
                    </div>
                    <h2 className="relative z-10 text-[1.8rem] font-black text-white tracking-tight text-center px-6 leading-tight">
                      {selected.home_team} <span className="text-white/40 font-medium">vs</span> {selected.away_team}
                    </h2>
                    <div className="relative z-10 flex items-center gap-2 text-white/90 font-bold bg-black/20 px-4 py-1.5 rounded-full backdrop-blur-sm text-[0.9rem]">
                      <MapPin className="h-4 w-4 text-[#60a5fa]" />
                      {selected.stadium_name}
                    </div>
                  </div>

                  <div className="px-8 py-9 space-y-8">
                    {/* 응모 수량 설정 (세련된 카드 선택형 UI) */}
                    {!isApplied && windowState === "open" && (() => {
                      const maxT = TIER_MAX_TICKETS[tier];
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-[1.1rem] font-black text-[#1f3248]">응모 수량 설정</h3>
                            <span className={`text-[0.75rem] font-bold px-3 py-1 rounded-full ${TIER_COLOR[tier].bg} ${TIER_COLOR[tier].color} border`} style={{ borderColor: TIER_COLOR[tier].border }}>
                              {tier} 등급 최대 {maxT}장 가능
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            {[1, 2].map((num) => {
                              const isAvailable = num <= maxT;
                              const isActive = ticketsUsed === num;
                              return (
                                <motion.button
                                  key={num}
                                  whileHover={isAvailable ? { scale: 1.02, translateY: -2 } : {}}
                                  whileTap={isAvailable ? { scale: 0.98 } : {}}
                                  disabled={!isAvailable}
                                  onClick={() => setTicketsUsed(num)}
                                  className={`relative p-5 rounded-[24px] border-2 transition-all flex flex-col items-center gap-2 ${
                                    !isAvailable ? "opacity-30 grayscale cursor-not-allowed border-dashed bg-gray-50" :
                                    isActive ? "border-[#1456a0] bg-[#eff6ff] shadow-md" : "border-[#f1f5f9] bg-white hover:border-[#d1dce7]"
                                  }`}
                                >
                                  {isActive && isAvailable && (
                                    <div className="absolute top-3 right-3 bg-[#1456a0] text-white rounded-full p-0.5 shadow-lg">
                                      <CheckCircle2 className="h-4 w-4" />
                                    </div>
                                  )}
                                  <div className={`p-3 rounded-2xl ${isActive ? "bg-[#1456a0] text-white shadow-lg shadow-blue-200" : "bg-[#f1f5f9] text-[#8a9aac]"}`}>
                                    <Ticket className="h-6 w-6" />
                                  </div>
                                  <span className={`text-[1.1rem] font-black ${isActive ? "text-[#1456a0]" : "text-[#1f3248]"}`}>
                                    {num}장 응모
                                  </span>
                                  <span className="text-[0.7rem] font-bold text-[#8a9aac]">
                                    {num === 1 ? "기본 확률" : "당첨 확률 UP"}
                                  </span>
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 경기 상세 정보 그리드 */}
                    <div className="grid grid-cols-2 gap-3">
                       {[
                         { icon: Clock, label: "경기 일시", value: `${fmtDate(selected.game_date)} ${selected.game_time}` },
                         { icon: Sparkles, label: "응모 시작", value: selected.raffle_open_at ? fmtDatetime(new Date(selected.raffle_open_at)) : "-" },
                         { icon: Timer, label: "응모 마감", value: raffleClose ? fmtDatetime(raffleClose) : "-" },
                         { icon: CalendarCheck, label: "일반 예매", value: bookingOpen ? fmtDatetime(bookingOpen) : "-" },
                       ].map(info => (
                         <div key={info.label} className="p-4 rounded-2xl bg-[#f8fafc] border border-[#f1f5f9]">
                            <div className="flex items-center gap-2 mb-2 text-[#8a9aac]">
                               <info.icon className="h-3.5 w-3.5" />
                               <span className="text-[0.75rem] font-bold uppercase tracking-wider">{info.label}</span>
                            </div>
                            <p className="text-[0.88rem] font-black text-[#1f3248]">{info.value}</p>
                         </div>
                       ))}
                    </div>

                    {/* NFT 소유권 확인 패스 */}
                    <div className="rounded-2xl border p-5 flex items-center justify-between"
                      style={{ background: "#ffffff", borderColor: walletConnected ? "#10b981" : "#d1dce7" }}>
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#1456a0] to-[#1e7fd0] flex flex-col items-center justify-center text-white font-black leading-none text-[0.6rem]">
                          GAME<br/>PASS
                        </div>
                        <div>
                          <p className="text-[0.95rem] font-black text-[#1f3248]">GAME PASS NFT</p>
                          <p className="text-[0.75rem] font-mono text-[#8a9aac]">{nftId}</p>
                        </div>
                      </div>
                      <div className={`px-4 py-1.5 rounded-full text-[0.8rem] font-bold flex items-center gap-2 ${walletConnected ? "bg-[#ecfdf5] text-[#10b981]" : "bg-[#f1f5f9] text-[#8a9aac]"}`}>
                        {walletConnected ? <CheckCircle2 className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                        {walletConnected ? "보유 확인" : "연결 필요"}
                      </div>
                    </div>

                    {/* 상태 알림창 */}
                    <AnimatePresence>
                      {msg && (
                        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                          className={`p-4 rounded-xl text-[0.9rem] font-bold flex items-center gap-3 border ${msg.type === 'success' ? "bg-[#ecfdf5] text-[#065f46] border-[#10b98144]" : "bg-[#fef2f2] text-[#991b1b] border-[#ef444444]"}`}>
                           {msg.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                           {msg.text}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* 메인 액션 버튼 */}
                    {(() => {
                      const canApply = windowState === "open" && !isApplied && !applying && ticketsUsed > 0;
                      const btnDisabled = !canApply || applying || (ticketsUsed === 0 && !isApplied);
                      
                      const btnText =
                        applying ? "트랜잭션 처리 중..."
                        : isApplied ? (resultVisible
                            ? (isWon ? "좌석 예매하러 가기" : "아쉽게도 선정되지 않았습니다")
                            : "응모 완료 — 결과 대기 중")
                        : windowState === "before" ? "응모 기간이 아닙니다"
                        : windowState === "closed" ? "응모가 마감되었습니다"
                        : `${ticketsUsed}장 사용하여 응모하기`;

                      return (
                        <motion.button whileHover={canApply ? { scale: 1.01, translateY: -2 } : {}} whileTap={{ scale: 0.98 }}
                          onClick={() => { if (canApply) void handleApply(); }}
                          disabled={btnDisabled}
                          className="w-full rounded-[24px] py-5 text-[1.15rem] font-black text-white transition-all shadow-xl hover:shadow-2xl disabled:shadow-none"
                          style={{
                            background: canApply ? "linear-gradient(135deg, #1e3a8a 0%, #1456a0 100%)" : "#e2e8f0",
                            color: canApply ? "#ffffff" : "#8a9aac",
                            cursor: canApply ? "pointer" : "not-allowed",
                          }}>
                          {applying ? (
                            <span className="flex items-center justify-center gap-3">
                              <span className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                              {btnText}
                            </span>
                          ) : btnText}
                        </motion.button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* 오른쪽 사이드바 */}
            <div className="space-y-4">
              {/* 진행 순서 */}
              <div className="rounded-[24px] border px-6 py-6 bg-white shadow-sm"
                style={{ borderColor: "#d1dce7" }}>
                <p className="text-[0.75rem] font-bold uppercase tracking-[0.2em] mb-6 text-[#8a9aac]">
                  진행 절차
                </p>
                <div className="relative">
                  {STEPS.map((step, i) => {
                    const done   = i < currentStep;
                    const active = i === currentStep;
                    const isLast = i === STEPS.length - 1;
                    return (
                      <div key={step.label} className="relative flex gap-4">
                        {!isLast && (
                          <div className="absolute left-[13px] top-[28px] w-0.5 h-[calc(100%-4px)]"
                            style={{ background: done ? "#10b981" : "#f1f5f9" }} />
                        )}
                        <div className="relative z-10 flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[0.7rem] font-black mt-0.5"
                          style={{
                            background: done ? "#10b981" : active ? "#1456a0" : "#f1f5f9",
                            color: done || active ? "#ffffff" : "#94a3b8",
                            boxShadow: active ? "0 4px 12px rgba(20,86,160,0.1)" : "none",
                          }}>
                          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                        </div>
                        <div className={`pb-5 ${isLast ? "pb-0" : ""}`}>
                          <p className="text-[0.9rem] font-bold"
                            style={{ color: done ? "#10b981" : active ? "#1f3248" : "#8a9aac" }}>
                            {step.label}
                          </p>
                          <p className="text-[0.75rem] mt-0.5 text-[#8a9aac]">{step.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isApplied && (
                  <div className="mt-5 flex items-center justify-center gap-2 rounded-[14px] py-3 text-[0.85rem] font-bold"
                    style={{
                      background: isWon ? "#ecfdf5" : "#f1f5f9",
                      color: isWon ? "#10b981" : "#8a9aac",
                      border: isWon ? "1px solid #10b98144" : "1px solid #d1dce744",
                    }}>
                    {isWon     ? <><Trophy       className="h-4 w-4" /> 당첨 확인 완료</>
                      : isLost ? <><XCircle      className="h-4 w-4" /> 미당첨</>
                        : !resultVisible
                                ? <><Timer       className="h-4 w-4" /> 결과 공개 대기 중</>
                                : <><Search      className="h-4 w-4" /> 결과 처리 중...</>}
                  </div>
                )}
              </div>

              {/* 안내 카드 */}
              <div className="rounded-[20px] border px-5 py-5 bg-[#f8fbff]" style={{ borderColor: "#d1dce7" }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-[#1456a0]" />
                  <p className="text-[0.85rem] font-black text-[#1456a0]">이용 안내</p>
                </div>
                <ul className="text-[0.8rem] leading-6 space-y-1.5 text-[#526183]">
                  <li>· 각 경기마다 <strong className="text-[#1456a0]">2시간</strong> 응모 창이 열립니다.</li>
                  <li>· 창 마감 후 전체 응모자를 한꺼번에 추첨합니다.</li>
                  <li>· 2장 응모 시 추첨 pool에 슬롯이 2개 들어가 당첨 확률이 올라갑니다.</li>
                  <li>· 당첨은 1회만 가능합니다.</li>
                  <li>· 당첨 시 예매 오픈 <strong className="text-[#1456a0]">2시간 전</strong>부터 좌석 선택이 가능합니다.</li>
                </ul>
              </div>

              {/* 응모권 없을 때 */}
              {raffleCount !== null && raffleCount === 0 && (
                <div className="rounded-[20px] border px-5 py-5 bg-[#fffbeb]" style={{ borderColor: "#fde68a" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="h-4 w-4" style={{ color: "#f59e0b" }} />
                    <p className="text-[0.85rem] font-black text-[#92400e]">응모권 부족</p>
                  </div>
                  <p className="text-[0.78rem] leading-5" style={{ color: "#b45309" }}>포인트 교환소에서 응모권을 구매하세요.</p>
                  <Link to="/shop"
                    className="mt-3 block text-center rounded-[10px] py-2 text-[0.78rem] font-bold text-white transition-all hover:brightness-110"
                    style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
                    교환소 바로가기
                  </Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
