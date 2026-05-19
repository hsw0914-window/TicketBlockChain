import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ChevronLeft, Clock, CheckCircle2, Gift, Ticket,
  AlertCircle, Sparkles, Trophy, Wallet, Search,
  CalendarCheck, Lock, XCircle, MapPin, ChevronRight,
  Timer,
} from "lucide-react";
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

export function Raffle() {
  const navigate = useNavigate();
  const { walletAddress, walletConnected } = useAppSettings();

  const [tab, setTab]               = useState<Tab>("raffle");
  const [games, setGames]           = useState<Game[]>([]);
  const [entries, setEntries]       = useState<Entry[]>([]);
  const [selected, setSelected]     = useState<Game | null>(null);
  const [raffleCount, setRaffleCount] = useState<number | null>(null);
  const [tier, setTier]             = useState<Tier>("일반");
  const [ticketsUsed, setTicketsUsed] = useState<1 | 2>(1);
  const [applying, setApplying]     = useState(false);
  const [msg, setMsg]               = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [now, setNow]               = useState(new Date());

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "미연결";
  const nftId = walletAddress
    ? `GAME-${walletAddress.slice(-8).toUpperCase()}`
    : "GAME---------";

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function loadData() {
    fetch(`${API}/api/tickets/games`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const available = (d.data as Game[]).filter(g => g.status !== "ENDED");
          setGames(available);
          if (available.length > 0 && !selected) setSelected(available[0]);
        }
      })
      .catch(() => {});

    fetch(`${API}/api/auth/early-access-count`, { headers: authHeader() })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setRaffleCount(d.count);
          if (d.tier) setTier(d.tier as Tier);
        }
      })
      .catch(() => {});

    fetch(`${API}/api/auth/raffle/my-entries`, { headers: authHeader() })
      .then(r => r.json())
      .then(d => { if (d.success) setEntries(d.data); })
      .catch(() => {});
  }

  useEffect(() => { void loadData(); }, []);

  // 결과 미공개 항목이 있으면 자동 재조회 (창 마감 시점에 맞춰)
  useEffect(() => {
    const pending = entries.filter(e => !e.result_visible && e.raffle_close_at);
    if (pending.length === 0) return;
    const nextClose = pending
      .map(e => new Date(e.raffle_close_at!).getTime())
      .reduce((a, b) => Math.min(a, b));
    const delay = nextClose - now.getTime() + 1500;
    if (delay <= 0) { void loadData(); return; }
    const t = setTimeout(() => void loadData(), delay);
    return () => clearTimeout(t);
  }, [entries]);

  const currentEntry   = selected ? entries.find(e => e.game_id === selected.id) ?? null : null;
  const isApplied      = !!currentEntry;
  const windowState    = selected ? getRaffleWindowState(selected.raffle_open_at, now) : null;
  const raffleClose    = selected ? raffleCloseDate(selected.raffle_open_at) : null;

  // 결과 공개 여부: 서버 플래그 OR 클라이언트 시간 체크
  const resultVisible  = currentEntry
    ? (currentEntry.result_visible || (raffleClose ? now >= raffleClose : false))
    : false;
  const isWon  = resultVisible && currentEntry?.status === "won";
  const isLost = resultVisible && currentEntry?.status === "lost";

  const bookingOpen    = selected?.booking_open_at ? new Date(selected.booking_open_at) : null;
  const seatUnlock     = seatUnlockDate(selected?.booking_open_at ?? null);
  const isSeatUnlocked = seatUnlock ? now >= seatUnlock : false;

  const currentStep = !isApplied ? 1 : !resultVisible ? 2 : 3;

  async function handleApply() {
    if (!selected) return;
    if (!walletConnected) { setMsg({ type: "error", text: "지갑을 먼저 연결해주세요." }); return; }
    if (!raffleCount || raffleCount <= 0) { setMsg({ type: "error", text: "응모권이 없습니다. 교환소에서 구매하세요." }); return; }
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
      const closeAt = data.raffle_close_at ? new Date(data.raffle_close_at) : null;
      setMsg({
        type: "success",
        text: closeAt
          ? `응모 완료! 결과는 ${fmtDatetime(closeAt)}에 공개됩니다.`
          : "응모 완료! 창 마감 후 결과가 공개됩니다.",
      });
      await loadData();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "응모 중 오류" });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="page-shell max-w-[1080px] space-y-7">

      {/* 뒤로가기 */}
      <Link to="/mypage/membership"
        className="inline-flex items-center gap-1.5 text-[0.85rem] font-semibold transition-opacity hover:opacity-70"
        style={{ color: "#5a6f8a" }}>
        <ChevronLeft className="h-4 w-4" />
        멤버십으로 돌아가기
      </Link>

      {/* 내부 헤더 */}
      <div className="rounded-[22px] border px-6 py-4 flex items-center justify-between"
        style={{ background: "linear-gradient(135deg, #1a2d4a 0%, #1e3a5f 100%)", borderColor: "#243958", boxShadow: "0 8px 32px rgba(20,45,74,0.18)" }}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-[8px] flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-[1rem] font-black tracking-tight text-white">ChainEvent</span>
          </div>
          <div className="flex gap-1">
            {([["raffle", "응모"], ["history", "응모 내역"]] as [Tab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-1.5 rounded-full text-[0.8rem] font-semibold transition-all"
                style={{
                  background: tab === t ? "rgba(255,255,255,0.15)" : "transparent",
                  color: tab === t ? "#fff" : "rgba(255,255,255,0.5)",
                  border: tab === t ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full px-3.5 py-1.5"
          style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <div className="h-2 w-2 rounded-full" style={{ background: walletConnected ? "#34d399" : "#94a3b8" }} />
          <span className="text-[0.78rem] font-bold text-white">{shortAddress}</span>
        </div>
      </div>

      {/* 페이지 타이틀 */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="page-eyebrow text-[#1456a0] mb-3">Raffle</p>
          <h1 className="page-title mb-2" style={{ color: "#14253f" }}>응모권</h1>
          <p className="page-subtitle" style={{ color: "#55657d" }}>경기를 선택하고 응모 창이 열리면 응모권으로 우선 예매 자격을 획득하세요.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full px-4 py-2 text-[0.8rem] font-semibold"
          style={{
            background: raffleCount && raffleCount > 0 ? "#ecfdf5" : "#f8fafc",
            border: `1px solid ${raffleCount && raffleCount > 0 ? "#a7f3d0" : "#e2eaf2"}`,
            color: raffleCount && raffleCount > 0 ? "#065f46" : "#8a9aac",
          }}>
          <Ticket className="h-3.5 w-3.5" />
          보유 응모권 {raffleCount !== null ? `${raffleCount}장` : "…"}
        </div>
      </div>

      {/* ── 응모 내역 탭 ─────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-3">
          {entries.length === 0 ? (
            <div className="rounded-[20px] border px-6 py-12 text-center"
              style={{ background: "#fff", borderColor: "#e2eaf2" }}>
              <Gift className="h-10 w-10 mx-auto mb-3" style={{ color: "#cbd5e1" }} />
              <p className="text-[0.9rem]" style={{ color: "#94a3b8" }}>아직 응모한 경기가 없어요.</p>
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
                  background: visibleStatus === "won" ? "linear-gradient(135deg, #f0fdf4, #f7faff)" : "#fff",
                  borderColor: visibleStatus === "won" ? "#bbf7d0" : "#e2eaf2",
                  boxShadow: "0 4px 16px rgba(17,40,73,0.05)",
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
                      : visibleStatus === "lost" ? <XCircle className="h-5 w-5" style={{ color: "#94a3b8" }} />
                        : <Timer className="h-5 w-5 text-white" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-[0.95rem] truncate" style={{ color: "#1a2d4a" }}>
                      {entry.home_team} vs {entry.away_team}
                    </p>
                    <p className="text-[0.78rem] mt-0.5" style={{ color: "#8a9aac" }}>
                      {fmtDate(entry.game_date)} · {entry.game_time} · {entry.stadium_name}
                    </p>
                    <p className="text-[0.72rem] mt-0.5" style={{ color: "#b0bcc9" }}>
                      응모권 {entry.tickets_used ?? 1}장 사용
                    </p>
                    {!entryVisible && closeAt && (
                      <p className="text-[0.73rem] mt-1 font-semibold" style={{ color: "#3b82f6" }}>
                        결과 공개 {remainLabel(closeAt, now)} ({fmtDatetime(closeAt)})
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="rounded-full px-3 py-1 text-[0.72rem] font-bold"
                    style={{
                      background: visibleStatus === "won"   ? "#dcfce7"
                        : visibleStatus === "lost" ? "#f1f5f9" : "#eff6ff",
                      color: visibleStatus === "won"   ? "#15803d"
                        : visibleStatus === "lost" ? "#94a3b8" : "#2563eb",
                    }}>
                    {visibleStatus === "won"  ? "당첨"
                      : visibleStatus === "lost" ? "미당첨"
                        : "결과 대기"}
                  </span>
                  {visibleStatus === "won" && (
                    <button
                      onClick={() => entryUnlocked && navigate(`/tickets/${entry.game_id}/booking`)}
                      disabled={!entryUnlocked}
                      className="flex items-center gap-1.5 rounded-[12px] px-4 py-2 text-[0.8rem] font-black transition-all"
                      style={{
                        background: entryUnlocked ? "linear-gradient(135deg, #10b981, #059669)" : "#e2e8f0",
                        color: entryUnlocked ? "#fff" : "#94a3b8",
                        cursor: entryUnlocked ? "pointer" : "not-allowed",
                        boxShadow: entryUnlocked ? "0 4px 12px rgba(16,185,129,0.3)" : "none",
                      }}>
                      {entryUnlocked
                        ? <><CalendarCheck className="h-3.5 w-3.5" /> 좌석 보러가기</>
                        : <><Lock className="h-3.5 w-3.5" /> {entryUnlock ? remainLabel(entryUnlock, now) + " 활성화" : "잠김"}</>}
                    </button>
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
              style={{ background: "linear-gradient(135deg, #eff6ff, #f5f3ff)", borderColor: "#bfdbfe", boxShadow: "0 8px 32px rgba(59,130,246,0.10)" }}>
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
              style={{ background: "linear-gradient(135deg, #f0fdf4, #ecfdf5, #d1fae5)", borderColor: "#6ee7b7", boxShadow: "0 8px 32px rgba(16,185,129,0.15)" }}>
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
                  onClick={() => isSeatUnlocked && navigate(`/tickets/${selected.id}/booking`)}
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
              style={{ background: "#f8fafc", borderColor: "#e2eaf2" }}>
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

              {/* 경기 선택 */}
              <div className="rounded-[20px] border overflow-hidden"
                style={{ background: "#fff", borderColor: "#e2eaf2", boxShadow: "0 4px 20px rgba(17,40,73,0.06)" }}>
                <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: "#f0f4fa" }}>
                  <Gift className="h-4 w-4" style={{ color: "#3b82f6" }} />
                  <p className="text-[0.82rem] font-bold" style={{ color: "#4a5568" }}>응모할 경기 선택</p>
                </div>
                <div className="divide-y" style={{ borderColor: "#f0f4fa" }}>
                  {games.length === 0 && (
                    <p className="px-6 py-8 text-center text-[0.85rem]" style={{ color: "#94a3b8" }}>응모 가능한 경기가 없습니다.</p>
                  )}
                  {games.map(game => {
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
                      : ws === "open"  ? { text: "응모 중",   color: "#2563eb", bg: "#eff6ff" }
                      : /* closed */    { text: "응모 종료",  color: "#94a3b8", bg: "#f8fafc" };

                    return (
                      <button key={game.id} onClick={() => { setSelected(game); setMsg(null); }}
                        className="w-full px-6 py-4 flex items-center justify-between gap-3 transition-all hover:bg-[#f7faff] text-left"
                        style={{ background: isSelected ? "#f0f6ff" : undefined }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                            style={{ background: isSelected ? "#2563eb" : "#e2eaf2" }} />
                          <div className="min-w-0">
                            <p className="font-black text-[0.9rem] truncate" style={{ color: isSelected ? "#1d4ed8" : "#1a2d4a" }}>
                              {game.home_team} <span style={{ color: "#94a3b8" }}>vs</span> {game.away_team}
                            </p>
                            <p className="text-[0.74rem] mt-0.5" style={{ color: "#8a9aac" }}>
                              {fmtDate(game.game_date)} · {game.game_time} · {game.stadium_name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* 응모 창 상태 */}
                          <span className="rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold"
                            style={{ background: wsLabel.bg, color: wsLabel.color }}>
                            {wsLabel.text}
                          </span>
                          {/* 응모 결과 */}
                          {entry && (
                            <span className="rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold"
                              style={{
                                background: visibleStatus === "won" ? "#dcfce7" : visibleStatus === "lost" ? "#f1f5f9" : "#f5f3ff",
                                color: visibleStatus === "won" ? "#15803d" : visibleStatus === "lost" ? "#94a3b8" : "#6d28d9",
                              }}>
                              {visibleStatus === "won" ? "당첨" : visibleStatus === "lost" ? "미당첨" : "대기"}
                            </span>
                          )}
                          <ChevronRight className="h-4 w-4" style={{ color: "#c8d5e0" }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 선택 경기 상세 카드 */}
              {selected && (
                <div className="rounded-[20px] border overflow-hidden"
                  style={{ background: "#fff", borderColor: "#e2eaf2", boxShadow: "0 4px 20px rgba(17,40,73,0.06)" }}>
                  <div className="relative flex flex-col items-center justify-center py-12 gap-3 overflow-hidden"
                    style={{ background: "linear-gradient(145deg, #dbeafe 0%, #ede9fe 50%, #d1fae5 100%)" }}>
                    <div className="absolute top-[-40px] right-[-40px] h-48 w-48 rounded-full opacity-25"
                      style={{ background: "radial-gradient(circle, #818cf8, transparent)" }} />
                    <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-[22px]"
                      style={{ background: "linear-gradient(145deg, #fff, #f0f4ff)", boxShadow: "0 10px 32px rgba(59,130,246,0.18)" }}>
                      <Gift className="h-10 w-10" style={{ color: "#3b82f6" }} />
                    </div>
                    <p className="relative z-10 text-[1.05rem] font-black" style={{ color: "#1e3a5f" }}>
                      {selected.home_team} <span style={{ color: "#64748b" }}>vs</span> {selected.away_team}
                    </p>
                    <div className="relative z-10 flex items-center gap-2 text-[0.78rem]" style={{ color: "#64748b" }}>
                      <MapPin className="h-3.5 w-3.5" />
                      {selected.stadium_name}
                    </div>
                  </div>

                  <div className="px-7 py-6">
                    {/* 배지 */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.72rem] font-bold"
                        style={{ background: "#eef4ff", color: "#2563eb", border: "1px solid #c8d8ef" }}>
                        <Sparkles className="h-3 w-3" />
                        우선 예매 응모
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.72rem] font-bold"
                        style={{
                          background: isWon ? "#ecfdf5" : resultVisible && isLost ? "#f1f5f9"
                            : isApplied && !resultVisible ? "#f5f3ff" : isApplied ? "#eff6ff" : "#f8fafc",
                          color: isWon ? "#059669" : resultVisible && isLost ? "#94a3b8"
                            : isApplied && !resultVisible ? "#6d28d9" : isApplied ? "#2563eb" : "#94a3b8",
                          border: `1px solid ${isWon ? "#a7f3d0" : resultVisible && isLost ? "#e2eaf2"
                            : isApplied && !resultVisible ? "#ddd6fe" : isApplied ? "#bfdbfe" : "#e2eaf2"}`,
                        }}>
                        {isWon          ? <><Trophy       className="h-3 w-3" /> 당첨</>
                          : isLost      ? <><XCircle      className="h-3 w-3" /> 미당첨</>
                            : isApplied && !resultVisible
                                        ? <><Timer        className="h-3 w-3" /> 결과 대기</>
                              : isApplied ? <><CheckCircle2 className="h-3 w-3" /> 응모 완료</>
                                : <><Clock className="h-3 w-3" /> 응모 전</>}
                      </span>
                    </div>

                    {/* 경기 + 응모 정보 */}
                    <div className="rounded-[14px] border px-4 py-3.5 mb-4 space-y-2.5 text-[0.83rem]"
                      style={{ background: "#f8fafc", borderColor: "#e8eef6" }}>
                      {[
                        { icon: Clock, label: "경기 시간",
                          value: `${fmtDate(selected.game_date)} ${selected.game_time}` },
                        { icon: MapPin, label: "경기장",
                          value: selected.stadium_name },
                        { icon: Timer, label: "응모 창 오픈",
                          value: selected.raffle_open_at
                            ? fmtDatetime(new Date(selected.raffle_open_at))
                            : "-" },
                        { icon: Timer, label: "응모 마감 / 결과 공개",
                          value: raffleClose ? fmtDatetime(raffleClose) : "-" },
                        { icon: CalendarCheck, label: "우선 예매 오픈",
                          value: bookingOpen ? fmtDatetime(bookingOpen) : "-" },
                      ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5" style={{ color: "#7a8da4" }}>
                            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                            {label}
                          </span>
                          <span className="font-semibold text-right" style={{ color: "#1a2d4a" }}>{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* 응모 창 남은 시간 표시 */}
                    {windowState === "before" && selected.raffle_open_at && (
                      <div className="rounded-[12px] px-4 py-3 mb-4 flex items-center gap-2 text-[0.82rem] font-semibold"
                        style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309" }}>
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        응모 창이 {remainLabel(new Date(selected.raffle_open_at), now)} 열립니다
                      </div>
                    )}
                    {windowState === "open" && raffleClose && !isApplied && (
                      <div className="rounded-[12px] px-4 py-3 mb-4 flex items-center gap-2 text-[0.82rem] font-semibold"
                        style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8" }}>
                        <Timer className="h-4 w-4 flex-shrink-0" />
                        응모 창 마감까지 {remainLabel(raffleClose, now)}
                      </div>
                    )}
                    {windowState === "open" && raffleClose && isApplied && !resultVisible && (
                      <div className="rounded-[12px] px-4 py-3 mb-4 flex items-center gap-2 text-[0.82rem] font-semibold"
                        style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", color: "#5b21b6" }}>
                        <Timer className="h-4 w-4 flex-shrink-0" />
                        결과 공개까지 {remainLabel(raffleClose, now)}
                      </div>
                    )}
                    {windowState === "closed" && !isApplied && (
                      <div className="rounded-[12px] px-4 py-3 mb-4 flex items-center gap-2 text-[0.82rem] font-semibold"
                        style={{ background: "#f8fafc", border: "1px solid #e2eaf2", color: "#94a3b8" }}>
                        <XCircle className="h-4 w-4 flex-shrink-0" />
                        이 경기의 응모가 마감되었습니다
                      </div>
                    )}

                    {/* 티어 & 응모권 수량 선택 */}
                    {!isApplied && windowState === "open" && (() => {
                      const maxT = TIER_MAX_TICKETS[tier];
                      const tc   = TIER_COLOR[tier];
                      return (
                        <div className="rounded-[14px] border px-4 py-4 mb-4"
                          style={{ background: "#f8fafc", borderColor: "#e8eef6" }}>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[0.8rem] font-bold" style={{ color: "#4a5568" }}>응모권 사용 수량</span>
                            <span className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold"
                              style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
                              {tier} · 최대 {maxT}장
                            </span>
                          </div>
                          <div className="flex gap-2">
                            {([1, 2] as const).map(n => {
                              const disabled = n > maxT || (raffleCount ?? 0) < n;
                              const active   = ticketsUsed === n && !disabled;
                              return (
                                <button key={n}
                                  disabled={disabled}
                                  onClick={() => !disabled && setTicketsUsed(n)}
                                  className="flex-1 rounded-[12px] py-3 text-[0.85rem] font-black transition-all border"
                                  style={{
                                    background: active ? "linear-gradient(135deg, #2563eb, #4f46e5)" : disabled ? "#f1f5f9" : "#fff",
                                    color: active ? "#fff" : disabled ? "#c4cdd9" : "#1a2d4a",
                                    borderColor: active ? "transparent" : disabled ? "#e8eef6" : "#d1dbe8",
                                    cursor: disabled ? "not-allowed" : "pointer",
                                    boxShadow: active ? "0 4px 14px rgba(37,99,235,0.3)" : "none",
                                  }}>
                                  <span className="block text-[1.1rem]">{n}장</span>
                                  <span className="block text-[0.7rem] mt-0.5 font-semibold"
                                    style={{ color: active ? "rgba(255,255,255,0.8)" : disabled ? "#c4cdd9" : "#8a9aac" }}>
                                    {n === 2 ? "슬롯 2개 · 확률 상승" : "슬롯 1개"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {maxT === 1 && (
                            <p className="text-[0.73rem] mt-2.5" style={{ color: "#94a3b8" }}>
                              실버·골드 등급부터 2장 응모 가능합니다.
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* NFT 보유 확인 */}
                    <div className="rounded-[16px] border px-4 py-3.5 flex items-center justify-between mb-4"
                      style={{
                        background: walletConnected ? "linear-gradient(135deg, #f0fdf4, #f7faff)" : "#f8fafc",
                        borderColor: walletConnected ? "#bbf7d0" : "#e2eaf2",
                      }}>
                      <div className="flex items-center gap-3">
                        <div className="rounded-[12px] flex items-center justify-center h-11 w-11 text-[0.52rem] font-black text-white leading-tight text-center"
                          style={{ background: walletConnected ? "linear-gradient(145deg, #3b82f6, #1d4ed8)" : "#cbd5e1" }}>
                          GAME<br />PASS
                        </div>
                        <div>
                          <p className="text-[0.88rem] font-black" style={{ color: "#1a2d4a" }}>GAME PASS</p>
                          <p className="text-[0.72rem] font-mono" style={{ color: "#8a9aac" }}>{nftId}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.74rem] font-bold"
                        style={{ background: walletConnected ? "#dcfce7" : "#f1f5f9", color: walletConnected ? "#16a34a" : "#94a3b8" }}>
                        {walletConnected
                          ? <><CheckCircle2 className="h-3.5 w-3.5" /> 보유 확인</>
                          : <><Wallet className="h-3.5 w-3.5" /> 미연결</>}
                      </div>
                    </div>

                    {/* 메시지 */}
                    {msg && (
                      <div className="mb-5 flex items-start gap-3 rounded-[14px] px-4 py-3.5 text-[0.83rem] font-semibold"
                        style={{
                          background: msg.type === "success" ? "#d1fae5" : "#fee2e2",
                          color: msg.type === "success" ? "#065f46" : "#991b1b",
                          border: `1px solid ${msg.type === "success" ? "#a7f3d0" : "#fecaca"}`,
                        }}>
                        {msg.type === "success"
                          ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          : <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
                        {msg.text}
                      </div>
                    )}

                    {/* 버튼 */}
                    {(() => {
                      const canApply = windowState === "open" && !isApplied && !applying;
                      const btnDisabled = !canApply || applying;
                      const btnText =
                        applying ? null
                        : isApplied ? (resultVisible
                            ? (isWon ? "당첨 — 좌석 보러가기" : "미당첨")
                            : "응모 완료 — 결과 대기 중")
                        : windowState === "before" ? "응모 예정"
                        : windowState === "closed" ? "응모 종료"
                        : `응모권 ${ticketsUsed}장 사용하여 응모하기`;

                      return (
                        <button
                          onClick={() => { if (canApply) void handleApply(); }}
                          disabled={btnDisabled}
                          className="w-full rounded-[14px] py-3.5 text-[0.9rem] font-black text-white transition-all"
                          style={{
                            background: canApply
                              ? "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)"
                              : "#94a3b8",
                            cursor: canApply ? "pointer" : "not-allowed",
                            boxShadow: canApply ? "0 4px 16px rgba(37,99,235,0.35)" : "none",
                          }}>
                          {applying ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                              처리 중...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              {isApplied && resultVisible && isWon
                                ? <><CalendarCheck className="h-4 w-4" /> {btnText}</>
                                : isApplied && !resultVisible
                                  ? <><Timer className="h-4 w-4" /> {btnText}</>
                                  : <><Ticket className="h-4 w-4" /> {btnText}</>}
                            </span>
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* 오른쪽 사이드바 */}
            <div className="space-y-4">
              {/* 진행 순서 */}
              <div className="rounded-[22px] border px-6 py-6"
                style={{ background: "#fff", borderColor: "#e2eaf2", boxShadow: "0 8px 32px rgba(17,40,73,0.07)" }}>
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] mb-5" style={{ color: "#94a3b8" }}>
                  진행 순서
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
                            style={{ background: done ? "#a7f3d0" : "#e9eef6" }} />
                        )}
                        <div className="relative z-10 flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[0.7rem] font-black mt-0.5"
                          style={{
                            background: done ? "linear-gradient(135deg, #10b981, #059669)" : active ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "#e9eef6",
                            color: done || active ? "#fff" : "#94a3b8",
                            boxShadow: active ? "0 0 0 3px rgba(59,130,246,0.2)" : "none",
                          }}>
                          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                        </div>
                        <div className={`pb-5 ${isLast ? "pb-0" : ""}`}>
                          <p className="text-[0.88rem]"
                            style={{ color: done ? "#059669" : active ? "#1a2d4a" : "#94a3b8", fontWeight: active ? 800 : done ? 700 : 500 }}>
                            {step.label}
                          </p>
                          <p className="text-[0.74rem] mt-0.5" style={{ color: "#b0bcc9" }}>{step.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isApplied && (
                  <div className="mt-5 flex items-center justify-center gap-2 rounded-[14px] py-3 text-[0.85rem] font-bold"
                    style={{
                      background: isWon ? "#ecfdf5" : isLost ? "#f8fafc" : !resultVisible ? "#f5f3ff" : "#eff6ff",
                      color: isWon ? "#059669" : isLost ? "#94a3b8" : !resultVisible ? "#6d28d9" : "#2563eb",
                      border: `1px solid ${isWon ? "#a7f3d0" : isLost ? "#e2eaf2" : !resultVisible ? "#ddd6fe" : "#bfdbfe"}`,
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
              <div className="rounded-[18px] border px-5 py-4" style={{ background: "#f5f8ff", borderColor: "#d8e3ef" }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4" style={{ color: "#3b82f6" }} />
                  <p className="text-[0.78rem] font-bold" style={{ color: "#2c4a6e" }}>안내</p>
                </div>
                <ul className="text-[0.77rem] leading-6 space-y-1" style={{ color: "#6d8aaa" }}>
                  <li>· 각 경기마다 <strong style={{ color: "#2c4a6e" }}>2시간</strong> 응모 창이 열립니다.</li>
                  <li>· 창 마감 후 전체 응모자를 한꺼번에 추첨합니다.</li>
                  <li>· 2장 응모 시 추첨 pool에 슬롯이 2개 들어가 당첨 확률이 올라갑니다.</li>
                  <li>· 당첨은 1회만 가능합니다.</li>
                  <li>· 당첨 시 예매 오픈 <strong style={{ color: "#2c4a6e" }}>2시간 전</strong>부터 좌석 선택이 가능합니다.</li>
                </ul>
              </div>

              {/* 응모권 없을 때 */}
              {raffleCount !== null && raffleCount === 0 && (
                <div className="rounded-[18px] border px-5 py-4" style={{ background: "#fff7ed", borderColor: "#fed7aa" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="h-4 w-4" style={{ color: "#f59e0b" }} />
                    <p className="text-[0.78rem] font-bold" style={{ color: "#92400e" }}>응모권 부족</p>
                  </div>
                  <p className="text-[0.78rem] leading-5" style={{ color: "#b45309" }}>교환소에서 포인트로 응모권을 구매하세요.</p>
                  <Link to="/exchange"
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
