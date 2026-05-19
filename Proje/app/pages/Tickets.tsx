import { useEffect, useMemo, useState } from "react";
import { Search, MapPin, Calendar, Tag, Ticket, ShieldCheck, Clock } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useBookingAccess, ACCESS_MESSAGES, type AccessStatus } from "../hooks/useBookingAccess";

function formatBookingOpen(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })
    + " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function remainingToOpen(dateStr: string): string {
  const diff = Math.max(0, new Date(dateStr).getTime() - Date.now());
  const totalMin = Math.floor(diff / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}일 ${h % 24}시간 후 오픈`;
  if (h > 0) return `${h}시간 ${m}분 후 오픈`;
  if (m > 0) return `${m}분 후 오픈`;
  return "곧 오픈";
}

export function Tickets() {
  const [events, setEvents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [blockedStatus, setBlockedStatus] = useState<AccessStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const navigate = useNavigate();
  const accessStatus = useBookingAccess();

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/tickets/games`)
      .then((res) => res.json())
      .then((data) => { if (data.success) setEvents(data.data); })
      .catch((err) => console.error("경기 목록 조회 실패:", err));
  }, []);

  // 1분마다 now 갱신 → UPCOMING 카운트다운 실시간 업데이트
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const filteredEvents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return events;
    return events.filter((event) =>
      [event.home_team, event.away_team, event.stadium_name, event.location].some(
        (v) => v?.toLowerCase().includes(keyword),
      ),
    );
  }, [search, events]);

  function getStatusColor(status: string) {
    switch (status) {
      case "OPEN":     return "#2dba73";
      case "ALMOST":   return "#f59e0b";
      case "SOLDOUT":  return "#ef4444";
      case "UPCOMING": return "#ff9d3b";
      case "ENDED":    return "#9ca3af";
      default:         return "#1456a0";
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case "OPEN":     return "예매중";
      case "ALMOST":   return "매진 임박";
      case "SOLDOUT":  return "매진";
      case "UPCOMING": return "오픈 예정";
      case "ENDED":    return "경기 종료";
      default:         return status;
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-eyebrow text-[#1456a0] mb-3">Schedule</p>
          <h1 className="page-title mb-3" style={{ color: "#14253f" }}>
            경기 예매
          </h1>
          <p className="page-subtitle max-w-2xl" style={{ color: "#55657d" }}>
            블록체인 입장권과 공식 재판매 제한이 적용된 야구 경기 예매 보드
          </p>
        </div>
      </div>

      <div className="relative mb-8 max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#7c8da6]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="경기명, 구단, 구장 검색..."
          className="w-full pl-12 pr-4 py-3.5 rounded-2xl text-[0.96rem] bg-white border border-[rgba(20,86,160,0.12)] text-[#17283f] placeholder-[#8c9bb0] focus:outline-none focus:border-[#1456a0] shadow-[0_12px_30px_rgba(17,40,73,0.05)]"
        />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEvents.map((ev, i) => {
          const statusColor = getStatusColor(ev.status);
          const statusLabel = getStatusLabel(ev.status);
          const isSoldOut  = ev.status === "SOLDOUT";
          const isEnded    = ev.status === "ENDED";
          const isUpcoming = ev.status === "UPCOMING";
          const opensWithin24h = isUpcoming && ev.booking_open_at
            && (new Date(ev.booking_open_at).getTime() - now) < 24 * 60 * 60 * 1000;

          return (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="overflow-hidden group cursor-pointer transition-all duration-300 rounded-[24px] border border-[rgba(20,86,160,0.10)] bg-white shadow-[0_18px_40px_rgba(17,40,73,0.06)] hover:border-[#1456a0]/30">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className="rounded-full px-3 py-1 text-[0.76rem] font-semibold border"
                      style={{
                        background: `${statusColor}1f`,
                        borderColor: `${statusColor}66`,
                        color: statusColor,
                      }}
                    >
                      {statusLabel}
                    </span>
                    {ev.day_of_week && (
                      <span className="text-[0.82rem] font-semibold" style={{ color: "#7a8ca2" }}>
                        {ev.day_of_week}요일
                      </span>
                    )}
                  </div>

                  <h3 className="section-title text-[1.2rem] mb-4" style={{ color: "#14253f" }}>
                    {ev.home_team} vs {ev.away_team}
                  </h3>

                  <div className="space-y-2.5 mb-5">
                    <div className="flex items-center gap-2 text-[0.92rem] text-[#55657d]">
                      <Calendar className="w-4 h-4 text-[#1456a0] shrink-0" />
                      {String(ev.game_date).slice(0, 10)} {ev.game_time?.slice(0, 5)}
                    </div>
                    <div className="flex items-center gap-2 text-[0.92rem] text-[#55657d]">
                      <MapPin className="w-4 h-4 text-[#2dba73] shrink-0" />
                      {ev.stadium_name ?? ev.location}
                    </div>
                    {ev.base_price != null && (
                      <div className="flex items-center gap-2 text-[0.92rem]">
                        <Tag className="w-4 h-4 text-[#ff9d3b] shrink-0" />
                        <span className="font-bold text-[#1456a0] text-[1rem] tracking-[-0.03em]">
                          ₩{Number(ev.base_price).toLocaleString("ko-KR")} ~
                        </span>
                      </div>
                    )}
                    {/* 예매 오픈 일시 안내 */}
                    {isUpcoming && ev.booking_open_at && (
                      <div className="flex items-center gap-2 text-[0.82rem] rounded-[10px] px-3 py-2 mt-1"
                        style={{
                          background: opensWithin24h ? "#fff7ed" : "#f0f6ff",
                          color: opensWithin24h ? "#b45309" : "#2563eb",
                          border: `1px solid ${opensWithin24h ? "#fed7aa" : "#bfdbfe"}`,
                        }}>
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          <span className="font-bold">{remainingToOpen(ev.booking_open_at)}</span>
                          <span className="ml-1.5 opacity-70">({formatBookingOpen(ev.booking_open_at)})</span>
                        </span>
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full h-11 rounded-xl font-bold"
                    disabled={isSoldOut || isEnded}
                    style={{
                      background: isSoldOut || isEnded
                        ? "#9ca3af"
                        : isUpcoming
                          ? "#e2e8f0"
                          : "linear-gradient(135deg, #1456a0, #1e7fd0)",
                      color: isUpcoming ? "#64748b" : "#fff",
                      boxShadow: !isSoldOut && !isEnded && !isUpcoming
                        ? "0 10px 20px rgba(20,86,160,0.20)"
                        : "none",
                    }}
                    onClick={() => {
                      if (isUpcoming) return;
                      if (!isSoldOut && !isEnded) {
                        if (accessStatus !== "ok" && accessStatus !== "checking") {
                          setBlockedStatus(accessStatus);
                        } else {
                          navigate(`/tickets/${ev.id}/booking`);
                        }
                      }
                    }}
                  >
                    <Ticket className="w-4 h-4 mr-2" />
                    {isSoldOut ? "매진" : isEnded ? "경기 종료" : isUpcoming ? "오픈 예정" : "좌석 보러가기"}
                  </Button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {filteredEvents.length === 0 && (
        <div
          className="mt-8 rounded-[24px] border px-6 py-10 text-center"
          style={{ background: "#f6f9fb", borderColor: "#d7e0e8", color: "#586a82" }}
        >
          검색한 조건에 맞는 경기가 없습니다.
        </div>
      )}

      {/* 접근 제한 모달 */}
      {blockedStatus && blockedStatus !== "checking" && blockedStatus !== "ok" && (() => {
        const msg = ACCESS_MESSAGES[blockedStatus];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(4px)" }}
            onClick={() => setBlockedStatus(null)}
          >
            <div
              className="rounded-[28px] border p-8 max-w-md w-full mx-4 text-center"
              style={{ background: "#fff", borderColor: "#d7e0e8", boxShadow: "0 20px 48px rgba(17,40,73,0.18)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: "#e8eef6" }}
              >
                <ShieldCheck className="w-7 h-7" style={{ color: "#1456a0" }} />
              </div>
              <h2 className="text-[1.15rem] font-bold mb-2" style={{ color: "#14253f" }}>{msg.title}</h2>
              <p className="text-[0.92rem] leading-7 mb-6" style={{ color: "#55657d" }}>{msg.desc}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setBlockedStatus(null)}
                  className="rounded-xl px-5 py-2.5 text-[0.9rem] font-semibold border"
                  style={{ borderColor: "#d7e0e8", color: "#55657d", background: "#fff" }}
                >
                  닫기
                </button>
                <button
                  onClick={() => navigate(msg.href)}
                  className="rounded-xl px-5 py-2.5 text-[0.9rem] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #1456a0, #1e7fd0)" }}
                >
                  {msg.action}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
