import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Gift,
  Loader2,
  Ticket,
  Trophy,
  Wallet,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useAppSettings } from "../context/AppSettingsContext";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const authHeaders = () => ({
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
  status: "applied" | "won" | "lost" | "used";
  tickets_used: number;
  result_visible: boolean;
  raffle_close_at: string | null;
  home_team: string;
  away_team: string;
  game_date: string;
  game_time: string;
  stadium_name: string;
  booking_open_at: string | null;
};

type Tier = "베이직" | "브론즈" | "실버" | "골드";
const TIER_MAX_TICKETS: Record<Tier, number> = { 베이직: 1, 브론즈: 1, 실버: 2, 골드: 2 };

function fmtDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })
    + " "
    + date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function remainingLabel(value: string | null, nowMs: number) {
  if (!value) return "";
  const diff = Math.max(0, new Date(value).getTime() - nowMs);
  const totalMin = Math.floor(diff / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor(totalMin / 60) % 24;
  const mins = totalMin % 60;
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${mins}분`;
  if (mins > 0) return `${mins}분`;
  return "곧";
}

function raffleState(game: Game, nowMs: number): "before" | "open" | "closed" {
  if (!game.raffle_open_at) return "before";
  const open = new Date(game.raffle_open_at).getTime();
  const close = open + 2 * 60 * 60 * 1000;
  if (nowMs < open) return "before";
  if (nowMs < close) return "open";
  return "closed";
}

export function Raffle() {
  const navigate = useNavigate();
  const { walletAddress, walletConnected } = useAppSettings();
  const [games, setGames] = useState<Game[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [raffleCount, setRaffleCount] = useState(0);
  const [tier, setTier] = useState<Tier>("베이직");
  const [ticketsUsed, setTicketsUsed] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const selected = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? games[0] ?? null,
    [games, selectedGameId],
  );
  const currentEntry = selected ? entries.find((entry) => entry.game_id === selected.id) ?? null : null;
  const maxTickets = TIER_MAX_TICKETS[tier] ?? 1;
  const state = selected ? raffleState(selected, nowMs) : "before";

  async function loadData() {
    setLoading(true);
    try {
      const [gameRes, countRes, entryRes] = await Promise.all([
        fetch(`${API_BASE}/api/tickets/games`).then((res) => res.json()),
        fetch(`${API_BASE}/api/auth/early-access-count`, { headers: authHeaders() }).then((res) => res.json()),
        fetch(`${API_BASE}/api/raffle/my-entries`, { headers: authHeaders() }).then((res) => res.json()),
      ]);
      if (gameRes.success) {
        const rows = (gameRes.data as Game[]).filter((game) => game.status !== "ENDED");
        setGames(rows);
        setSelectedGameId((prev) => prev || rows[0]?.id || "");
      }
      if (countRes.success) {
        setRaffleCount(Number(countRes.count ?? 0));
        setTier((countRes.tier ?? "베이직") as Tier);
      }
      if (entryRes.success) setEntries(entryRes.data ?? []);
    } catch {
      setMessage({ type: "error", text: "응모 정보를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!currentEntry || currentEntry.status !== "applied" || !currentEntry.raffle_close_at) return;
    const delay = Math.max(0, new Date(currentEntry.raffle_close_at).getTime() - Date.now() + 500);
    const id = window.setTimeout(() => {
      void loadData();
    }, delay);
    return () => window.clearTimeout(id);
  }, [currentEntry?.id, currentEntry?.status, currentEntry?.raffle_close_at]);

  async function applyRaffle() {
    if (!selected) return;
    if (!walletConnected || !walletAddress) {
      setMessage({ type: "error", text: "지갑 연결 후 응모할 수 있습니다." });
      return;
    }
    if (raffleCount < ticketsUsed) {
      setMessage({ type: "error", text: "응모권 수량이 부족합니다. 교환소에서 응모권을 교환하세요." });
      return;
    }
    setApplying(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/raffle/apply`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ gameId: selected.id, ticketsUsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "응모 실패");
      setMessage({
        type: "success",
        text: data.raffle_close_at
          ? `응모 완료. 결과는 ${fmtDateTime(data.raffle_close_at)} 이후 공개됩니다.`
          : "응모 완료.",
      });
      await loadData();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "응모 처리 중 오류가 발생했습니다." });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="page-shell max-w-[1120px] space-y-8">
      <button
        type="button"
        onClick={() => navigate("/mypage/membership")}
        className="inline-flex items-center gap-2 text-[0.9rem] font-semibold"
        style={{ color: "#4d5f78" }}
      >
        <ChevronLeft className="h-4 w-4" />
        멤버십으로 돌아가기
      </button>

      <header className="space-y-3">
        <p className="page-eyebrow text-[#1456a0]">Priority Raffle</p>
        <h1 className="page-title" style={{ color: "#14253f" }}>우선 예매 응모</h1>
        <p className="page-subtitle max-w-2xl" style={{ color: "#586981" }}>
          응모권 NFT로 추첨에 참여하고, 당첨되면 일반 예매 전에 지정된 테이블석을 Toss 결제로 예매할 수 있습니다.
        </p>
      </header>

      {loading ? (
        <div className="rounded-[24px] border px-6 py-12 text-center" style={{ background: "#f6f9fb", borderColor: "#d7e0e8" }}>
          <Loader2 className="mx-auto h-8 w-8 animate-spin" style={{ color: "#1456a0" }} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-[28px] border p-6" style={{ background: "#fff", borderColor: "#dce5f2" }}>
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-[1.12rem] font-black" style={{ color: "#14253f" }}>응모 경기 선택</h2>
                <p className="mt-1 text-[0.86rem]" style={{ color: "#7a8aa0" }}>응모 창은 오픈 후 2시간 동안 유지됩니다.</p>
              </div>
              <span className="rounded-full px-3 py-1 text-[0.78rem] font-bold" style={{ background: "#eef4ff", color: "#1456a0" }}>
                {tier} · 최대 {maxTickets}장
              </span>
            </div>

            <div className="grid gap-3">
              {games.map((game) => {
                const active = selected?.id === game.id;
                const gameState = raffleState(game, nowMs);
                const label = gameState === "open" ? "응모 가능" : gameState === "before" ? "오픈 전" : "응모 마감";
                const color = gameState === "open" ? "#10b981" : gameState === "before" ? "#f59e0b" : "#94a3b8";
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => setSelectedGameId(game.id)}
                    className="rounded-[18px] border px-5 py-4 text-left transition"
                    style={{
                      background: active ? "#f0f6ff" : "#f8fafc",
                      borderColor: active ? "#9fc2ff" : "#dce5f2",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black" style={{ color: "#162840" }}>{game.home_team} vs {game.away_team}</p>
                        <p className="mt-1 text-[0.84rem]" style={{ color: "#64758c" }}>
                          {game.game_date} {game.game_time?.slice(0, 5)} · {game.stadium_name}
                        </p>
                        <p className="mt-2 text-[0.78rem]" style={{ color: "#7a8aa0" }}>
                          응모 오픈: {fmtDateTime(game.raffle_open_at)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full px-3 py-1 text-[0.74rem] font-bold" style={{ background: `${color}1a`, color }}>
                        {label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[28px] border p-6" style={{ background: "#f8fafc", borderColor: "#dce5f2" }}>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ background: "#eef4ff", color: "#1456a0" }}>
                  <Ticket className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[0.78rem] font-bold uppercase tracking-[0.18em]" style={{ color: "#8a9ab0" }}>My Raffle</p>
                  <p className="text-[1.2rem] font-black" style={{ color: "#14253f" }}>{raffleCount}장 보유</p>
                </div>
              </div>

              {selected && (
                <div className="mt-5 rounded-[18px] border p-4" style={{ background: "#fff", borderColor: "#e0e7ef" }}>
                  <div className="flex items-center gap-2 text-[0.86rem] font-bold" style={{ color: "#1456a0" }}>
                    <Clock className="h-4 w-4" />
                    {state === "open" ? "응모 진행 중" : state === "before" ? "응모 오픈 대기" : "응모 마감"}
                  </div>
                  <p className="mt-2 text-[0.85rem] leading-6" style={{ color: "#596b82" }}>
                    {state === "open" && `마감까지 ${remainingLabel(currentEntry?.raffle_close_at ?? null, nowMs)} 남았습니다.`}
                    {state === "before" && `${remainingLabel(selected.raffle_open_at, nowMs)} 후 응모가 열립니다.`}
                    {state === "closed" && "응모가 마감되었습니다. 내 응모 내역에서 결과를 확인하세요."}
                  </p>
                </div>
              )}

              {!currentEntry && (
                <>
                  <div className="mt-5">
                    <p className="mb-2 text-[0.82rem] font-bold" style={{ color: "#53677f" }}>사용할 응모권</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2].map((count) => (
                        <button
                          key={count}
                          type="button"
                          disabled={count > maxTickets}
                          onClick={() => setTicketsUsed(count as 1 | 2)}
                          className="rounded-[14px] border py-3 text-[0.9rem] font-black"
                          style={{
                            background: ticketsUsed === count ? "#1456a0" : "#fff",
                            borderColor: ticketsUsed === count ? "#1456a0" : "#dce5f2",
                            color: ticketsUsed === count ? "#fff" : count > maxTickets ? "#b6c2d0" : "#42556d",
                          }}
                        >
                          {count}장
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    className="mt-5 h-12 w-full rounded-[16px] font-black text-white"
                    disabled={applying || state !== "open" || raffleCount < ticketsUsed}
                    style={{ background: state === "open" && raffleCount >= ticketsUsed ? "#1456a0" : "#aebed0" }}
                    onClick={() => void applyRaffle()}
                  >
                    {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
                    응모하기
                  </Button>
                </>
              )}

              {currentEntry && (
                <div className="mt-5 rounded-[18px] border p-4" style={{ background: "#fff", borderColor: "#e0e7ef" }}>
                  <div className="flex items-center gap-2 font-black" style={{ color: currentEntry.status === "won" ? "#10b981" : currentEntry.status === "lost" ? "#ef4444" : "#1456a0" }}>
                    {currentEntry.status === "won" ? <Trophy className="h-5 w-5" /> : <CalendarCheck className="h-5 w-5" />}
                    {currentEntry.status === "won" ? "당첨" : currentEntry.status === "lost" ? "미당첨" : currentEntry.status === "used" ? "사용 완료" : "응모 완료"}
                  </div>
                  <p className="mt-2 text-[0.84rem]" style={{ color: "#66778c" }}>
                    응모권 {currentEntry.tickets_used}장 사용
                  </p>
                  {currentEntry.status === "won" && (
                    <Button
                      className="mt-4 h-11 w-full rounded-[14px] bg-[#10b981] font-black text-white"
                      onClick={() => navigate(`/tickets/${currentEntry.game_id}/booking?mode=priority&entryId=${currentEntry.id}`)}
                    >
                      <Wallet className="mr-2 h-4 w-4" />
                      우선 예매하기
                    </Button>
                  )}
                </div>
              )}

              {message && (
                <div
                  className="mt-4 flex gap-2 rounded-[16px] border px-4 py-3 text-[0.84rem] font-semibold"
                  style={{
                    background: message.type === "success" ? "#ecfdf5" : "#fff1f2",
                    borderColor: message.type === "success" ? "#a7f3d0" : "#fecdd3",
                    color: message.type === "success" ? "#047857" : "#be123c",
                  }}
                >
                  {message.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {message.text}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
