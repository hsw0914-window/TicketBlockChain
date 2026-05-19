import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Ticket, Coins, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router";

const API = import.meta.env.VITE_API_URL;

function authHeader() {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function getStatusLabel(status: string) {
  switch (status) {
    case "ISSUED":  return { label: "보유중",   color: "#2dba73", bg: "#edf7f1" };
    case "ENTERED": return { label: "응모중",   color: "#f59e0b", bg: "#fffbeb" };
    case "WINNER":  return { label: "당첨",     color: "#1456a0", bg: "#eef4ff" };
    case "LOST":    return { label: "미당첨",   color: "#9ca3af", bg: "#f3f4f6" };
    case "USED":    return { label: "사용완료", color: "#6b7280", bg: "#f9fafb" };
    default:        return { label: status,     color: "#6b7280", bg: "#f9fafb" };
  }
}

interface RaffleNft {
  id: string;
  status: string;
  issued_at: string;
  home_team?: string;
  away_team?: string;
  game_date?: string;
}

export function Exchange() {
  const navigate = useNavigate();
  const { walletAddress, walletConnected } = useAppSettings();
  const { isLoggedIn } = useAuth();

  const [points, setPoints] = useState<number | null>(null);
  const [raffles, setRaffles] = useState<RaffleNft[]>([]);
  const [loading, setLoading] = useState(true);
  const [exchanging, setExchanging] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  function showToast(type: "ok" | "err", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  async function fetchData() {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const [ptRes, rfRes] = await Promise.all([
        fetch(`${API}/api/points?walletAddress=${walletAddress}`),
        fetch(`${API}/api/raffle/my?walletAddress=${walletAddress}`, { headers: authHeader() }),
      ]);
      const ptData = await ptRes.json();
      const rfData = await rfRes.json();
      if (ptData.success) setPoints(Number(ptData.data?.balance ?? ptData.data ?? 0));
      if (rfData.success) setRaffles(rfData.data ?? []);
    } catch (e) {
      console.error("데이터 조회 실패:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [walletAddress]);

  async function handleExchange() {
    if (!walletAddress) return;
    setExchanging(true);
    try {
      const res = await fetch(`${API}/api/points/exchange`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ walletAddress, itemType: "RAFFLE_NFT" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "교환 실패");
      showToast("ok", `응모권 1장 발급 완료! 잔여 포인트: ${Number(data.data?.remainingBalance ?? 0).toLocaleString("ko-KR")}P`);
      fetchData();
    } catch (e: any) {
      showToast("err", e.message ?? "교환 중 오류가 발생했습니다.");
    } finally {
      setExchanging(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="page-shell flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <Ticket className="w-12 h-12" style={{ color: "#1456a0" }} />
        <p className="text-[1rem] font-semibold" style={{ color: "#14253f" }}>로그인이 필요합니다</p>
        <button
          onClick={() => navigate("/login")}
          className="px-6 py-2.5 rounded-xl text-white font-semibold text-[0.9rem]"
          style={{ background: "linear-gradient(135deg, #1456a0, #1e7fd0)" }}
        >
          로그인하러 가기
        </button>
      </div>
    );
  }

  if (!walletConnected) {
    return (
      <div className="page-shell flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <Coins className="w-12 h-12" style={{ color: "#1456a0" }} />
        <p className="text-[1rem] font-semibold" style={{ color: "#14253f" }}>지갑 연결이 필요합니다</p>
        <button
          onClick={() => navigate("/mypage")}
          className="px-6 py-2.5 rounded-xl text-white font-semibold text-[0.9rem]"
          style={{ background: "linear-gradient(135deg, #1456a0, #1e7fd0)" }}
        >
          마이페이지 가기
        </button>
      </div>
    );
  }

  const issuedCount = raffles.filter((r) => r.status === "ISSUED").length;

  return (
    <div className="page-shell">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl"
          style={{
            background: toast.type === "ok" ? "#edf7f1" : "#fef2f2",
            border: `1px solid ${toast.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
            color: toast.type === "ok" ? "#166534" : "#991b1b",
          }}
        >
          {toast.type === "ok"
            ? <CheckCircle2 className="w-5 h-5 shrink-0" />
            : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="text-[0.9rem] font-semibold">{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <p className="page-eyebrow text-[#1456a0] mb-3">Exchange</p>
          <h1 className="page-title mb-3" style={{ color: "#14253f" }}>교환소</h1>
          <p className="page-subtitle max-w-2xl" style={{ color: "#55657d" }}>
            포인트로 응모권을 교환하고 추첨 이벤트에 참여하세요
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl border p-5" style={{ background: "#fff", borderColor: "rgba(20,86,160,0.10)", boxShadow: "0 8px 24px rgba(17,40,73,0.05)" }}>
          <p className="page-stat-label mb-1.5">보유 포인트</p>
          <p className="page-value" style={{ color: "#1456a0" }}>
            {loading ? "—" : `${(points ?? 0).toLocaleString("ko-KR")}P`}
          </p>
        </div>
        <div className="rounded-2xl border p-5" style={{ background: "#fff", borderColor: "rgba(20,86,160,0.10)", boxShadow: "0 8px 24px rgba(17,40,73,0.05)" }}>
          <p className="page-stat-label mb-1.5">보유 응모권</p>
          <p className="page-value" style={{ color: "#2dba73" }}>
            {loading ? "—" : `${issuedCount}장`}
          </p>
        </div>
      </div>

      {/* Exchange Card */}
      <div className="mb-10 rounded-[24px] border overflow-hidden" style={{ background: "#fff", borderColor: "rgba(20,86,160,0.10)", boxShadow: "0 18px 40px rgba(17,40,73,0.07)" }}>
        <div className="flex flex-col sm:flex-row items-center gap-6 p-7">
          <div className="w-32 h-32 rounded-2xl overflow-hidden flex-shrink-0 border" style={{ borderColor: "rgba(20,86,160,0.08)" }}>
            <img src="/raffle-ticket.png" alt="응모권" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-[1.15rem] font-bold mb-1.5" style={{ color: "#14253f" }}>응모권 1장</h2>
            <p className="text-[0.9rem] leading-6 mb-4" style={{ color: "#55657d" }}>
              응모권으로 경기 추첨 이벤트에 참여할 수 있습니다.<br />
              당첨 시 우선 예매 혜택이 제공됩니다.
            </p>
            <button
              onClick={handleExchange}
              disabled={exchanging}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white text-[0.92rem] disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #1456a0, #1e7fd0)", boxShadow: "0 8px 18px rgba(20,86,160,0.22)" }}
            >
              {exchanging
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> 교환 중...</>
                : <><Ticket className="w-4 h-4" /> 포인트로 교환하기</>}
            </button>
          </div>
        </div>
      </div>

      {/* Raffle List */}
      <h2 className="text-[1.05rem] font-bold mb-4" style={{ color: "#14253f" }}>내 응모권 목록</h2>

      {loading ? (
        <div className="py-16 text-center" style={{ color: "#7b8ca4" }}>불러오는 중...</div>
      ) : raffles.length === 0 ? (
        <div className="py-16 rounded-[20px] border text-center" style={{ background: "#f6f9fb", borderColor: "#d7e0e8", color: "#7b8ca4" }}>
          보유한 응모권이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {raffles.map((r, i) => {
            const s = getStatusLabel(r.status);
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between rounded-2xl border px-5 py-4"
                style={{ background: "#fff", borderColor: "rgba(20,86,160,0.09)", boxShadow: "0 4px 14px rgba(17,40,73,0.04)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#eef4ff" }}>
                    <Ticket className="w-5 h-5" style={{ color: "#1456a0" }} />
                  </div>
                  <div>
                    <p className="font-semibold text-[0.92rem]" style={{ color: "#14253f" }}>
                      응모권 NFT
                    </p>
                    {r.home_team && r.away_team ? (
                      <p className="text-[0.8rem]" style={{ color: "#7b8ca4" }}>
                        {r.home_team} vs {r.away_team}
                        {r.game_date && ` · ${r.game_date}`}
                      </p>
                    ) : (
                      <p className="text-[0.8rem]" style={{ color: "#7b8ca4" }}>
                        {new Date(r.issued_at).toLocaleDateString("ko-KR")} 발급
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className="px-3 py-1 rounded-full text-[0.76rem] font-bold"
                  style={{ background: s.bg, color: s.color }}
                >
                  {s.label}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
