import { useEffect, useMemo, useState, useCallback } from "react";
import { MapPin, Calendar, CheckCircle, Clock, RotateCcw, X } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { useAppSettings } from "../context/AppSettingsContext";
import { useTicketQR } from "../hooks/useTicketQR";

// ─── 타입 ─────────────────────────────────────────────────

interface NormalizedTicket {
  ticketId:   string;
  matchName:  string;
  stadium:    string;
  matchTime:  string | null;
  seatInfo:   string;
  gate:       string;
  status:     "ACTIVE" | "USED";
  ticketCode: string;
  price:      number | null;
  // UI용 추가 필드
  color:      string;
}

// ─── API 응답 → UI 포맷 변환 ──────────────────────────────

function normalizeApiTicket(t: any): NormalizedTicket {
  const isUsed = t.status === "USED";
  return {
    ticketId:   t.ticketId ?? t.id,
    matchName:  t.matchName ?? t.game_name ?? t.game_id,
    stadium:    t.stadium ?? "",
    matchTime:  t.matchTime ?? null,
    seatInfo:   t.seatInfo ?? `${t.block ?? ""}블록 ${t.row_num ?? ""}열 ${t.seat_number ?? ""}번`,
    gate:       t.gate ?? t.grade ?? "",
    status:     isUsed ? "USED" : "ACTIVE",
    ticketCode: t.ticketCode ?? `#${String(t.ticketId ?? t.id).slice(0, 8).toUpperCase()}`,
    price:      t.price ?? null,
    color:      isUsed ? "#5f7188" : "#1456a0",
  };
}

// ─── 날짜/시간 포맷 ───────────────────────────────────────

function formatMatchDate(matchTime: string | null) {
  if (!matchTime) return "—";
  return matchTime.slice(0, 10);
}

// ─── QR 패널 (훅 사용을 위해 별도 컴포넌트) ──────────────

function TicketQRPanel({
  ticketId,
  walletAddress,
  status,
  color,
}: {
  ticketId:      string;
  walletAddress: string;
  status:        "ACTIVE" | "USED";
  color:         string;
}) {
  const { qrData, formattedCountdown } = useTicketQR(
    ticketId,
    walletAddress,
    status,
  );

  if (status === "USED") {
    return (
      <p className="text-center text-[0.82rem] py-3" style={{ color: "#9ca3af" }}>
        이미 사용된 티켓입니다
      </p>
    );
  }

  if (!qrData) {
    return (
      <p className="text-center text-[0.82rem] py-3" style={{ color: "#9ca3af" }}>
        QR 불러오는 중...
      </p>
    );
  }

  if (!qrData.available) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <Clock className="w-8 h-8" style={{ color, opacity: 0.4 }} />
        <p className="text-[0.82rem] font-semibold" style={{ color }}>현장 입장 QR</p>
        <p className="text-[0.78rem]" style={{ color: "#9ca3af" }}>
          {qrData.message ?? "경기 시작 2시간 전 활성화"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 pt-4"
      style={{ borderTop: `1px dashed ${color}33` }}>
      <div className="rounded-2xl overflow-hidden bg-white p-3 shadow"
        style={{ border: `1px solid ${color}22` }}>
        <QRCodeSVG value={JSON.stringify({ ticketId, qrToken: qrData.qrToken })} size={128} />
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#2dba73" }} />
        <p className="text-[0.82rem] font-bold tabular-nums" style={{ color: "#2dba73" }}>
          {formattedCountdown} 후 자동 갱신
        </p>
      </div>
      <p className="page-stat-label">현장 게이트에서 QR을 제시해 주세요</p>
    </div>
  );
}

// ─── 환불 모달 ────────────────────────────────────────────

interface RefundPreview {
  originalPrice: number;
  refundRate:    number;
  refundAmount:  number;
  refundable:    boolean;
  purchaseType:  string;
}

function RefundModal({
  ticket,
  walletAddress,
  onClose,
  onSuccess,
}: {
  ticket:        NormalizedTicket;
  walletAddress: string;
  onClose:       () => void;
  onSuccess:     (ticketId: string) => void;
}) {
  const [preview,    setPreview]    = useState<RefundPreview | null>(null);
  const [reason,     setReason]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL;
  const token  = localStorage.getItem("auth_token");

  useEffect(() => {
    setLoading(true);
    fetch(`${apiUrl}/api/refunds/preview?ticketId=${ticket.ticketId}&walletAddress=${walletAddress}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setPreview(d);
      })
      .catch(() => setError("환불 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async () => {
    if (!preview?.refundable) return;
    setSubmitting(true);
    setError(null);
    try {
      const res  = await fetch(`${apiUrl}/api/refunds`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ ticketId: ticket.ticketId, walletAddress, reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "환불 처리에 실패했습니다."); return; }
      onSuccess(ticket.ticketId);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "#fff", boxShadow: "0 24px 56px rgba(17,40,73,0.18)" }}
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-[1.1rem]" style={{ color: "#14253f" }}>환불 신청</h3>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: "#9ca3af" }} /></button>
        </div>

        {loading && (
          <p className="text-center text-sm py-6" style={{ color: "#6d7d90" }}>환불 정보 조회 중...</p>
        )}

        {!loading && error && (
          <p className="text-center text-sm py-4" style={{ color: "#e53e3e" }}>{error}</p>
        )}

        {!loading && preview && (
          <>
            <div className="rounded-xl p-4 mb-4" style={{ background: "#f5f8fb", border: "1px solid #dbe4ed" }}>
              <div className="flex justify-between text-sm mb-2">
                <span style={{ color: "#6d7d90" }}>티켓 금액</span>
                <span style={{ color: "#14253f" }}>₩{Number(preview.originalPrice).toLocaleString("ko-KR")}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span style={{ color: "#6d7d90" }}>구매 유형</span>
                <span style={{ color: "#14253f" }}>
                  {preview.purchaseType === "TRANSFERRED" ? "양도 구매" : "직접 구매"}
                </span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span style={{ color: "#6d7d90" }}>환불 비율</span>
                <span style={{ color: preview.refundRate === 100 ? "#2dba73" : "#f59e0b" }}>
                  {preview.refundRate}%
                </span>
              </div>
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span style={{ color: "#14253f" }}>환불 예상 금액</span>
                <span style={{ color: "#1456a0" }}>₩{Number(preview.refundAmount).toLocaleString("ko-KR")}</span>
              </div>
            </div>

            {preview.refundRate < 100 && (
              <p className="text-xs mb-3" style={{ color: "#f59e0b" }}>
                * 경기 3일 미만 잔여 시 10% 수수료가 부과됩니다.
              </p>
            )}

            {preview.refundable ? (
              <>
                <textarea
                  className="w-full rounded-xl p-3 text-sm mb-4 resize-none"
                  style={{ border: "1px solid #dbe4ed", background: "#f9fbfc", color: "#14253f", outline: "none" }}
                  placeholder="환불 사유 (선택)"
                  rows={2}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
                {error && <p className="text-xs mb-3" style={{ color: "#e53e3e" }}>{error}</p>}
                <Button
                  className="w-full h-11 font-bold text-white rounded-xl"
                  style={{ background: "linear-gradient(135deg, #e53e3e, #c53030)" }}
                  disabled={submitting}
                  onClick={handleConfirm}
                >
                  {submitting ? "처리 중..." : "환불 확인"}
                </Button>
              </>
            ) : (
              <p className="text-center text-sm py-2" style={{ color: "#e53e3e" }}>
                현재 환불이 불가능한 상태입니다.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── 티켓 카드 ────────────────────────────────────────────

function TicketCard({
  ticket,
  walletAddress,
  index,
  onRefunded,
}: {
  ticket:        NormalizedTicket;
  walletAddress: string;
  index:         number;
  onRefunded:    (ticketId: string) => void;
}) {
  const [open,         setOpen]         = useState(false);
  const [showRefund,   setShowRefund]   = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15 }}
    >
      <div
        className="relative cursor-pointer group"
        style={{ filter: ticket.status === "USED" ? "grayscale(0.6)" : "none" }}
        onClick={() => { if (ticket.status === "ACTIVE") setOpen((o) => !o); }}
      >
        <div className="relative rounded-2xl overflow-hidden"
          style={{
            border: `1px solid ${ticket.color}22`,
            background: "#ffffff",
            backdropFilter: "blur(20px)",
            boxShadow: "0 18px 48px rgba(17,40,73,0.08)",
          }}>

          {/* 홀로그램 스트립 */}
          <div className="h-2 w-full"
            style={{ background: `linear-gradient(90deg, ${ticket.color}, #7ec8ff, #2dba73, ${ticket.color})`, opacity: 0.9 }} />

          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="soft-badge"
                    style={{ background: `${ticket.color}1f`, border: `1px solid ${ticket.color}`, color: ticket.color }}>
                    GAME PASS {ticket.ticketCode}
                  </span>
                </div>
                <h3 className="section-title text-[1.2rem]" style={{ color: "#14253f" }}>
                  {ticket.matchName}
                </h3>
              </div>
              <div className="flex items-center gap-1 text-[0.76rem] font-semibold"
                style={{ color: ticket.status === "ACTIVE" ? "#00ff88" : "#a393d1" }}>
                {ticket.status === "ACTIVE"
                  ? <CheckCircle className="w-4 h-4" />
                  : <Clock className="w-4 h-4" />}
                {ticket.status === "ACTIVE" ? "사용 가능" : "사용 완료"}
              </div>
            </div>

            {/* 구분선 */}
            <div className="relative flex items-center my-4">
              <div className="w-4 h-4 rounded-full absolute -left-6 bg-[#f3f7fb]" />
              <div className="flex-1 border-t border-dashed" style={{ borderColor: `${ticket.color}33` }} />
              <div className="w-4 h-4 rounded-full absolute -right-6 bg-[#f3f7fb]" />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="page-stat-label mb-1">날짜</p>
                <div className="flex items-center gap-1 text-[0.92rem]" style={{ color: "#34465c" }}>
                  <Calendar className="w-3.5 h-3.5" style={{ color: ticket.color }} />
                  {formatMatchDate(ticket.matchTime)}
                </div>
              </div>
              <div>
                <p className="page-stat-label mb-1">구장</p>
                <div className="flex items-center gap-1 text-[0.92rem]" style={{ color: "#34465c" }}>
                  <MapPin className="w-3.5 h-3.5" style={{ color: ticket.color }} />
                  {ticket.stadium || "—"}
                </div>
              </div>
              <div>
                <p className="page-stat-label mb-1">좌석</p>
                <p className="text-[0.92rem]" style={{ color: "#34465c" }}>{ticket.seatInfo}</p>
              </div>
              <div>
                <p className="page-stat-label mb-1">등급</p>
                <p className="text-[0.92rem]" style={{ color: "#34465c" }}>{ticket.gate}</p>
              </div>
              {ticket.price != null && (
                <div>
                  <p className="page-stat-label mb-1">금액</p>
                  <p className="text-[0.92rem] font-bold" style={{ color: ticket.color }}>
                    ₩{Number(ticket.price).toLocaleString("ko-KR")}
                  </p>
                </div>
              )}
            </div>

            {/* QR 패널 */}
            {open && ticket.status === "ACTIVE" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
              >
                <TicketQRPanel
                  ticketId={ticket.ticketId}
                  walletAddress={walletAddress}
                  status={ticket.status}
                  color={ticket.color}
                />
              </motion.div>
            )}

            {ticket.status === "ACTIVE" && (
              <div className="flex gap-2 mt-4">
                <Button
                  className="flex-1 h-11 font-bold text-white rounded-xl"
                  style={{
                    background: `linear-gradient(135deg, ${ticket.color}, #1e7fd0)`,
                    boxShadow: `0 10px 18px ${ticket.color}22`,
                  }}
                  onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
                >
                  {open ? "QR 닫기" : "QR 코드 보기"}
                </Button>
                <Button
                  className="h-11 px-4 font-bold rounded-xl"
                  style={{ background: "#fff5f5", border: "1px solid #feb2b2", color: "#c53030" }}
                  onClick={(e) => { e.stopPropagation(); setShowRefund(true); }}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showRefund && (
        <RefundModal
          ticket={ticket}
          walletAddress={walletAddress}
          onClose={() => setShowRefund(false)}
          onSuccess={(id) => { setShowRefund(false); onRefunded(id); }}
        />
      )}
    </motion.div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────

export function MyTickets() {
  const { walletAddress } = useAppSettings();
  const [ticketView, setTicketView] = useState<"active" | "completed">("active");
  const [apiTickets, setApiTickets] = useState<NormalizedTicket[]>([]);

  const fetchTickets = useCallback(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/my-tickets`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setApiTickets(data.data.map(normalizeApiTicket));
      })
      .catch((err) => console.error("내 티켓 조회 실패:", err));
  }, []);

  // 초기 로드
  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // ACTIVE 티켓이 있을 때 10초마다 폴링 (QR 스캔 후 자동 갱신)
  const hasActive = apiTickets.some((t) => t.status === "ACTIVE");
  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(fetchTickets, 10_000);
    return () => clearInterval(id);
  }, [hasActive, fetchTickets]);

  const handleRefunded = useCallback((ticketId: string) => {
    setApiTickets(prev => prev.filter(t => t.ticketId !== ticketId));
  }, []);

  const visibleTickets = useMemo(
    () => apiTickets.filter((t) =>
      ticketView === "active" ? t.status === "ACTIVE" : t.status === "USED",
    ),
    [ticketView, apiTickets],
  );

  const activeCount    = apiTickets.filter((t) => t.status === "ACTIVE").length;
  const completedCount = apiTickets.filter((t) => t.status === "USED").length;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-eyebrow text-[#1456a0] mb-3">Pass</p>
          <h1 className="page-title mb-3" style={{ color: "#14253f" }}>내 입장권</h1>
          <p className="page-subtitle" style={{ color: "#55657d" }}>보유 중인 경기 NFT 티켓과 QR 입장권을 확인할 수 있어요.</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "active"    as const, label: `사용 가능 (${activeCount})` },
            { key: "completed" as const, label: `사용 완료 (${completedCount})` },
          ].map((item) => {
            const active = ticketView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTicketView(item.key)}
                className="rounded-[14px] px-4 py-2.5 text-sm font-semibold transition-all"
                style={{
                  background:   active ? "#e8eef6" : "#f5f8fb",
                  border:       active ? "1px solid #bfd0e2" : "1px solid #dbe4ed",
                  color:        active ? "#23425f" : "#6d7d90",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="text-[0.84rem]" style={{ color: "#6d7d90" }}>
          {ticketView === "active"
            ? "지금 바로 쓸 수 있는 입장권만 먼저 보여줍니다."
            : "이미 사용한 입장권은 보관함처럼 따로 모아 봅니다."}
        </p>
      </div>

      {/* 빈 상태 */}
      {visibleTickets.length === 0 && (
        <div className="rounded-[24px] px-6 py-10 text-center mb-6"
          style={{ background: "#f8fbfd", border: "1px solid #d8e3ec", boxShadow: "0 12px 28px rgba(17,40,73,0.05)" }}>
          <p className="text-[1rem] font-semibold" style={{ color: "#21354b" }}>
            {ticketView === "active" ? "현재 사용 가능한 입장권이 없어요." : "아직 사용 완료된 입장권이 없어요."}
          </p>
        </div>
      )}

      {/* 티켓 목록 */}
      <div className="grid md:grid-cols-2 gap-6">
        {visibleTickets.map((ticket, i) => (
          <TicketCard
            key={ticket.ticketId}
            ticket={ticket}
            walletAddress={walletAddress ?? ""}
            index={i}
            onRefunded={handleRefunded}
          />
        ))}
      </div>
    </div>
  );
}
