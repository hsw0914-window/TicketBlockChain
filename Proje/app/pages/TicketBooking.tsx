import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AlertCircle,
  Armchair,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Info,
  LayoutGrid,
  Loader2,
  MapPin,
  Receipt,
  ShieldCheck,
  Ticket,
  Wallet,
} from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../components/ui/button";
import {
  buildEventFromApiGame,
  createStoredTickets,
  getTicketEvent,
  loadStoredTickets,
  saveStoredTickets,
  seatTicketTypes,
  type SeatBlock,
  type SeatGrade,
  type SeatTicketTypeId,
  type StoredTicketRecord,
  type TicketEvent,
} from "../data/ticketing";
import { useAppSettings } from "../context/AppSettingsContext";
import { sendTicketNFT } from "../lib/contract";
import { useBookingAccess, ACCESS_MESSAGES } from "../hooks/useBookingAccess";
import { apiUrl } from "../lib/api";

function formatPrice(value: number) {
  return `₩${value.toLocaleString("ko-KR")}`;
}

function parseSeatKey(seatKey: string) {
  const [row, seatNumber] = seatKey.split("-").map(Number);
  return { row, seatNumber };
}

const steps = [
  { id: 0, label: "구역 선택", icon: LayoutGrid },
  { id: 1, label: "좌석 선택", icon: Armchair },
  { id: 2, label: "가격 확인", icon: Receipt },
] as const;

const mapBlockBadgePositions: Record<string, CSSProperties> = {
  "jamsil-blue": { left: "18%", top: "47%" },
  "jamsil-table": { left: "50%", top: "24%", transform: "translateX(-50%)" },
  "jamsil-red": { right: "18%", top: "47%" },
  "jamsil-outfield": { left: "50%", bottom: "29%", transform: "translateX(-50%)" },
  "sajik-central": { left: "50%", top: "24%", transform: "translateX(-50%)" },
  "sajik-outfield": { left: "50%", bottom: "29%", transform: "translateX(-50%)" },
  "incheon-red": { left: "18%", top: "47%" },
  "incheon-navy": { left: "50%", top: "24%", transform: "translateX(-50%)" },
};

const blockLocatorMeta: Record<
  string,
  { areaLabel: string; guide: string; viewHint: string; orientation: string }
> = {
  "jamsil-blue-116": {
    areaLabel: "1루 응원석 안쪽 상단",
    guide: "홈플레이트 기준 왼쪽 상단에서 응원단과 가까운 쪽입니다.",
    viewHint: "응원 분위기가 가장 빠르게 붙는 대표 블록",
    orientation: "1루 · 내야",
  },
  "jamsil-blue-115": {
    areaLabel: "1루 응원석 중앙",
    guide: "116블록보다 중앙 쪽으로 붙어 있어 시야와 응원 밸런스가 좋습니다.",
    viewHint: "응원과 시야 균형이 좋은 구간",
    orientation: "1루 · 내야",
  },
  "jamsil-blue-114": {
    areaLabel: "1루 응원석 중앙 하단",
    guide: "홈플레이트에 조금 더 가까워 선수 동선이 잘 보이는 편입니다.",
    viewHint: "시야가 상대적으로 안정적인 블록",
    orientation: "1루 · 내야",
  },
  "jamsil-blue-216": {
    areaLabel: "1루 응원석 외곽",
    guide: "1루 응원 구역의 바깥쪽 라인으로, 통로 접근이 빠른 편입니다.",
    viewHint: "출입 동선이 편한 바깥쪽 블록",
    orientation: "1루 · 내야",
  },
  "jamsil-table-t1": {
    areaLabel: "중앙 테이블석 왼쪽",
    guide: "포수 뒤 테이블 존에서 1루 쪽에 가까운 자리입니다.",
    viewHint: "먹거리 이동 동선이 편한 프리미엄 좌석",
    orientation: "중앙 · 테이블",
  },
  "jamsil-table-t2": {
    areaLabel: "중앙 테이블석 오른쪽",
    guide: "포수 뒤 테이블 존에서 3루 쪽에 가까운 자리입니다.",
    viewHint: "포수 뒤 시야가 안정적인 프리미엄 좌석",
    orientation: "중앙 · 테이블",
  },
  "jamsil-red-208": {
    areaLabel: "3루 레드석 안쪽",
    guide: "3루 레드 구역 중에서도 홈플레이트 쪽에 더 가까운 블록입니다.",
    viewHint: "내야 시야를 보기 편한 3루 블록",
    orientation: "3루 · 내야",
  },
  "jamsil-red-209": {
    areaLabel: "3루 레드석 바깥쪽",
    guide: "208블록보다 외야 쪽으로 한 칸 더 나간 위치입니다.",
    viewHint: "출입 동선이 빠른 3루 외곽 블록",
    orientation: "3루 · 내야",
  },
  "jamsil-outfield-401": {
    areaLabel: "외야 그린석 왼쪽",
    guide: "외야석 중 1루 쪽에 가까운 블록으로 홈런볼 구간에 가깝습니다.",
    viewHint: "응원보다 여유 있게 보기 좋은 외야 블록",
    orientation: "외야 · 1루 방향",
  },
  "jamsil-outfield-402": {
    areaLabel: "외야 그린석 오른쪽",
    guide: "외야석 중 3루 쪽에 가까운 블록으로 바람 영향을 조금 더 받는 편입니다.",
    viewHint: "외야 전경이 넓게 보이는 바깥 블록",
    orientation: "외야 · 3루 방향",
  },
};

const blockFlowMeta: Record<string, { startLabel: string; endLabel: string }> = {
  "jamsil-blue": { startLabel: "홈플레이트 쪽", endLabel: "1루 외곽 쪽" },
  "jamsil-table": { startLabel: "1루 방향", endLabel: "3루 방향" },
  "jamsil-red": { startLabel: "홈플레이트 쪽", endLabel: "3루 외곽 쪽" },
  "jamsil-outfield": { startLabel: "1루 쪽 외야", endLabel: "3루 쪽 외야" },
  "sajik-central": { startLabel: "중앙 왼쪽", endLabel: "중앙 오른쪽" },
  "sajik-outfield": { startLabel: "외야 왼쪽", endLabel: "외야 오른쪽" },
  "incheon-red": { startLabel: "내야 안쪽", endLabel: "내야 바깥쪽" },
  "incheon-navy": { startLabel: "중앙 왼쪽", endLabel: "중앙 오른쪽" },
};

export function TicketBooking() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const { walletAddress, connectWallet } = useAppSettings();
  const accessStatus = useBookingAccess();

  // 로컬 이벤트 먼저 시도, 없으면 API에서 게임 정보 가져와서 템플릿으로 변환
  const [event, setEvent] = useState<TicketEvent | undefined>(() => getTicketEvent(eventId));
  const [eventLoading, setEventLoading] = useState(!getTicketEvent(eventId));

  useEffect(() => {
    if (getTicketEvent(eventId)) return; // 로컬에 있으면 API 불필요
    fetch(apiUrl(`/api/tickets/games/${eventId}`))
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setEvent(buildEventFromApiGame(data.data));
        }
      })
      .catch((err) => console.error("[TicketBooking] 경기 조회 실패:", err))
      .finally(() => setEventLoading(false));
  }, [eventId]);

  const [currentStep, setCurrentStep] = useState(0);
  const [refundPolicyAgreed, setRefundPolicyAgreed] = useState(false);
  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedSeatKeys, setSelectedSeatKeys] = useState<string[]>([]);
  const [ticketTypesBySeat, setTicketTypesBySeat] = useState<Record<string, SeatTicketTypeId>>({});
  const [storedTickets, setStoredTickets] = useState<StoredTicketRecord[]>(() => loadStoredTickets());
  const [completedTickets, setCompletedTickets] = useState<StoredTicketRecord[]>([]);
  const [serverTakenSeats, setServerTakenSeats] = useState<Set<string>>(new Set());
  const [txHash, setTxHash] = useState<string | null>(null);
  const [mintingStatus, setMintingStatus] = useState<"idle" | "connecting" | "signing" | "mining" | "saving">("idle");
  const [mintingProgress, setMintingProgress] = useState<{
    current: number;
    total: number;
    percent: number;
    label: string;
    detail: string;
  } | null>(null);
  const [confirmingBackground, setConfirmingBackground] = useState<"pending" | "done" | "failed" | null>(null);

  useEffect(() => {
    setStoredTickets(loadStoredTickets());
  }, []);

  // 백엔드에서 예약된 좌석 조회
  useEffect(() => {
    if (!eventId) return;
    fetch(apiUrl(`/api/tickets/seats/${eventId}`))
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setServerTakenSeats(new Set(data.data));
      })
      .catch(() => {});
  }, [eventId]);

  useEffect(() => {
    setTicketTypesBySeat((previous) => {
      const next: Record<string, SeatTicketTypeId> = {};
      selectedSeatKeys.forEach((seatKey) => {
        next[seatKey] = previous[seatKey] ?? "adult";
      });
      return next;
    });
  }, [selectedSeatKeys]);

  const selectedGrade = useMemo(
    () => event?.seatGrades.find((grade) => grade.id === selectedGradeId) ?? null,
    [event, selectedGradeId],
  );

  const selectedBlock = useMemo(
    () => selectedGrade?.blocks.find((block) => block.id === selectedBlockId) ?? null,
    [selectedGrade, selectedBlockId],
  );

  const selectedBlockLocator = useMemo(
    () => (selectedBlock ? blockLocatorMeta[selectedBlock.id] ?? null : null),
    [selectedBlock],
  );

  const takenSeatKeys = useMemo(() => {
    if (!event) return new Set<string>();

    const taken = [
      ...storedTickets
        .filter((ticket) => ticket.eventId === event.id)
        .map((ticket) => `${ticket.blockLabel}:${ticket.row}-${ticket.seatNumber}`),
      ...serverTakenSeats,
    ];

    selectedGrade?.blocks.forEach((block) => {
      block.disabledSeats?.forEach((seatKey) => {
        taken.push(`${block.label}:${seatKey}`);
      });
    });

    return new Set(taken);
  }, [event, storedTickets, selectedGrade, serverTakenSeats]);

  const selectedTickets = useMemo(() => {
    if (!selectedBlock || !selectedGrade) return [];

    return selectedSeatKeys.map((seatKey) => {
      const parsed = parseSeatKey(seatKey);
      const ticketType =
        seatTicketTypes.find((item) => item.id === ticketTypesBySeat[seatKey]) ?? seatTicketTypes[0];

      return {
        key: seatKey,
        row: parsed.row,
        seatNumber: parsed.seatNumber,
        ticketType,
        blockLabel: selectedBlock.label,
        price: Math.round(selectedGrade.price * ticketType.multiplier),
      };
    });
  }, [selectedBlock, selectedGrade, selectedSeatKeys, ticketTypesBySeat]);

  const ticketTotal = selectedTickets.reduce((sum, ticket) => sum + ticket.price, 0);
  const serviceFee = Math.round(ticketTotal * 0.03); // 3% 서비스 이용료
  const finalTotal = ticketTotal + serviceFee;
  const paymentReady = refundPolicyAgreed && selectedTickets.length > 0;

  if (!event) {
    if (eventLoading) {
      return (
        <div className="page-shell">
          <div className="rounded-[28px] border p-8 text-center" style={{ background: "#f4f7fa", borderColor: "#d7e0e8", color: "#304257" }}>
            경기 정보를 불러오는 중...
          </div>
        </div>
      );
    }
    return (
      <div className="page-shell">
        <div
          className="rounded-[28px] border p-8"
          style={{ background: "#f4f7fa", borderColor: "#d7e0e8", color: "#304257" }}
        >
          예매할 경기를 찾지 못했습니다.
        </div>
      </div>
    );
  }

  const updateStep = (nextStep: number) => {
    setCurrentStep(Math.max(0, Math.min(nextStep, steps.length - 1)));
  };

  const handleSelectGrade = (grade: SeatGrade) => {
    setSelectedGradeId(grade.id);
    setSelectedBlockId(grade.blocks[0]?.id ?? null);
    setSelectedSeatKeys([]);
  };

  const handleSelectBlock = (block: SeatBlock) => {
    setSelectedBlockId(block.id);
    setSelectedSeatKeys([]);
  };

  const toggleSeat = (seatKey: string) => {
    if (!selectedBlock) return;

    const compoundKey = `${selectedBlock.label}:${seatKey}`;
    if (takenSeatKeys.has(compoundKey)) return;

    setSelectedSeatKeys((previous) => {
      if (previous.includes(seatKey)) {
        return previous.filter((item) => item !== seatKey);
      }

      if (previous.length >= event.maxTickets) {
        return previous;
      }

      return [...previous, seatKey].sort((left, right) => {
        const leftSeat = parseSeatKey(left);
        const rightSeat = parseSeatKey(right);
        if (leftSeat.row !== rightSeat.row) return leftSeat.row - rightSeat.row;
        return leftSeat.seatNumber - rightSeat.seatNumber;
      });
    });
  };

  const handleCompleteBooking = async () => {
    if (!selectedGrade || !selectedBlock || !paymentReady) return;

    try {
      setTxHash(null);
      setCompletedTickets([]);
      setConfirmingBackground(null);
      setMintingStatus("connecting");
      const totalTickets = selectedTickets.length;
      const updateMintProgress = (
        current: number,
        percent: number,
        label: string,
        detail: string,
      ) => {
        setMintingProgress({
          current,
          total: totalTickets,
          percent: Math.max(0, Math.min(100, Math.round(percent))),
          label,
          detail,
        });
      };

      updateMintProgress(0, 3, "지갑 연결 확인", "MetaMask 계정과 네트워크를 확인하고 있습니다.");

      // 1. 지갑 주소 확보
      let address = walletAddress;
      if (!address) {
        const ok = await connectWallet();
        if (!ok) throw new Error("지갑 연결이 필요합니다.");
      }
      const accounts = window.ethereum
        ? ((await window.ethereum.request({ method: "eth_accounts" })) as string[])
        : [];
      address = accounts[0] ?? address;
      if (!address) throw new Error("지갑 주소를 가져올 수 없습니다.");

      const authToken = localStorage.getItem("auth_token");
      const purchaseIds: string[] = [];

      for (let i = 0; i < selectedTickets.length; i++) {
        const ticket = selectedTickets[i];
        const current = i + 1;
        const basePercent = (i / totalTickets) * 100;
        const unit = 100 / totalTickets;

        setMintingStatus("signing");
        updateMintProgress(
          current,
          basePercent + unit * 0.15,
          "MetaMask 컨펌 대기",
          `${current}/${totalTickets}번째 티켓 거래를 승인해 주세요. 창이 닫히면 다음 티켓 승인으로 넘어갑니다.`,
        );

        const sent = await sendTicketNFT({
          gameId: String(event.id),
          stadium: event.stadium,
          grade: selectedGrade.name,
          blockLabel: selectedBlock.label,
          row: ticket.row,
          seatNumber: ticket.seatNumber,
          priceKrw: ticket.price,
        });
        if (i === 0) setTxHash(sent.txHash);

        setMintingStatus("mining");
        updateMintProgress(
          current,
          basePercent + unit * 0.58,
          "블록체인 기록 중",
          `${current}/${totalTickets}번째 티켓이 Hoodi 네트워크에 기록되는 중입니다. MetaMask 활동 탭에서도 확인할 수 있습니다.`,
        );
        const tokenId = await sent.waitForConfirm();

        setMintingStatus("saving");
        updateMintProgress(
          current,
          basePercent + unit * 0.86,
          "티켓 저장 중",
          `${current}/${totalTickets}번째 티켓의 NFT 거래 해시와 좌석 정보를 서버에 저장하고 있습니다.`,
        );

        const res = await fetch(apiUrl("/api/tickets/purchase"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            walletAddress: address,
            gameId: event.id,
            stadium: event.stadium,
            grade: selectedGrade.name,
            block: selectedBlock.label,
            row: ticket.row,
            seatNumber: ticket.seatNumber,
            price: ticket.price,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || data.error || "티켓 예매 저장에 실패했습니다.");
        }

        const ticketDbId = String(data.data?.id ?? "");
        purchaseIds[i] = ticketDbId;

        if (tokenId != null && ticketDbId) {
          await fetch(apiUrl(`/api/tickets/${ticketDbId}/token`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenId, txHash: sent.txHash }),
          });
        }

        updateMintProgress(
          current,
          basePercent + unit,
          "티켓 저장 완료",
          `${current}/${totalTickets}번째 티켓 처리가 완료되었습니다.`,
        );
      }

      const created = createStoredTickets({
        event,
        grade: selectedGrade,
        block: selectedBlock,
        seats: selectedTickets.map((ticket) => ({
          row: ticket.row,
          seatNumber: ticket.seatNumber,
          ticketTypeId: ticket.ticketType.id,
        })),
      }).map((ticket, index) => ({
        ...ticket,
        id: purchaseIds[index] || ticket.id,
      }));

      const nextStoredTickets = [...storedTickets, ...created];
      saveStoredTickets(nextStoredTickets);
      setStoredTickets(nextStoredTickets);
      setCompletedTickets(created);
      setMintingProgress({
        current: totalTickets,
        total: totalTickets,
        percent: 100,
        label: "예매 완료",
        detail: "모든 티켓이 블록체인과 서버에 저장되었습니다.",
      });
      setServerTakenSeats((previous) => {
        const next = new Set(previous);
        selectedTickets.forEach((ticket) => {
          next.add(`${selectedBlock.label}:${ticket.row}-${ticket.seatNumber}`);
        });
        return next;
      });
      setConfirmingBackground("done");
    } catch (err: unknown) {
      console.error("예매 실패:", err);
      const msg = err instanceof Error ? err.message : "예매 중 오류가 발생했습니다.";
      alert(msg);
      setConfirmingBackground("failed");
    } finally {
      setMintingStatus("idle");
      setMintingProgress(null);
    }
  };

  const seatRows = selectedBlock
    ? Array.from({ length: selectedBlock.rows }, (_, rowIndex) => rowIndex + 1)
    : [];
  const seatColumns = selectedBlock
    ? Array.from({ length: selectedBlock.seatsPerRow }, (_, seatIndex) => seatIndex + 1)
    : [];

  // 접근 권한 체크
  if (accessStatus === "checking") {
    return (
      <div className="page-shell flex items-center justify-center min-h-[40vh]">
        <p className="text-[0.95rem]" style={{ color: "#8a9ab0" }}>인증 상태 확인 중...</p>
      </div>
    );
  }

  if (accessStatus !== "ok") {
    const msg = ACCESS_MESSAGES[accessStatus];
    return (
      <div className="page-shell flex items-center justify-center min-h-[50vh]">
        <div
          className="rounded-[28px] border p-8 max-w-md w-full text-center"
          style={{ background: "#f5f8fb", borderColor: "#d7e0e8", boxShadow: "0 12px 32px rgba(17,40,73,0.07)" }}
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
              onClick={() => navigate(-1)}
              className="rounded-xl px-5 py-2.5 text-[0.9rem] font-semibold border"
              style={{ borderColor: "#d7e0e8", color: "#55657d", background: "#fff" }}
            >
              돌아가기
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
  }

  return (
    <div className="page-shell">
      <div className="page-header gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/tickets")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border"
            style={{ borderColor: "#d3dde6", background: "#f5f7fa", color: "#4d6179" }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="page-eyebrow mb-2 text-[#1456a0]">Ticketing Flow</p>
            <h1 className="page-title mb-2" style={{ color: "#14253f" }}>
              좌석 선택
            </h1>
            <p className="page-subtitle" style={{ color: "#586981" }}>
              {event.stadium} 좌석도, 블록, 좌석번호, 가격 확인까지 한 번에 이어집니다.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_360px]">
        <div className="space-y-6">
          <section
            className="rounded-[30px] border p-6"
            style={{ background: "#eef3f7", borderColor: "#d5dee7", boxShadow: "0 18px 42px rgba(17,40,73,0.06)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.76rem] font-semibold"
                  style={{ borderColor: `${event.statusColor}55`, background: `${event.statusColor}14`, color: event.statusColor }}>
                  <Clock3 className="h-3.5 w-3.5" />
                  {event.status}
                </div>
                <div>
                  <h2 className="text-[1.55rem] font-bold tracking-[-0.04em]" style={{ color: "#122239" }}>
                    {event.name}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-4 text-[0.93rem]" style={{ color: "#5d6f86" }}>
                    <span className="inline-flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-[#1456a0]" />
                      {event.date}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#2dba73]" />
                      {event.venue}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Ticket className="h-4 w-4 text-[#d99d4d]" />
                      최저 {formatPrice(event.price)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border px-5 py-4 text-right"
                style={{ background: "rgba(255,255,255,0.72)", borderColor: "#d6e0e8" }}>
                <p className="text-[0.78rem] font-semibold uppercase tracking-[0.24em]" style={{ color: "#7f90a5" }}>
                  예매 규칙
                </p>
                <p className="mt-2 text-[0.95rem] font-semibold" style={{ color: "#162840" }}>
                  회차당 최대 {event.maxTickets}매
                </p>
                <p className="mt-1 text-[0.86rem]" style={{ color: "#5e7088" }}>
                  공식 재판매 마켓만 연동되고 좌석 선택 후 5분 안에 결제를 완료해야 합니다.
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;
              const active = currentStep === step.id;
              const completed = currentStep > step.id;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (step.id === 0) updateStep(step.id);
                    if (step.id === 1 && selectedGrade && selectedBlock) updateStep(step.id);
                    if (step.id === 2 && selectedSeatKeys.length > 0) updateStep(step.id);
                  }}
                  className="rounded-[22px] border px-4 py-4 text-left transition"
                  style={{
                    background: active ? "#ffffff" : "#eef3f7",
                    borderColor: active ? "#8ab0d6" : completed ? "#9cd3b3" : "#d4dde6",
                    boxShadow: active ? "0 12px 24px rgba(17,40,73,0.08)" : "none",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full"
                      style={{
                        background: completed ? "#def5e8" : active ? "#e9f1fa" : "#f6f8fa",
                        color: completed ? "#2d8b57" : active ? "#1456a0" : "#7d8da1",
                      }}
                    >
                      {completed ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-[0.76rem] font-semibold uppercase tracking-[0.24em]" style={{ color: "#8a9bb0" }}>
                        STEP {step.id + 1}
                      </p>
                      <p className="mt-1 text-[0.96rem] font-semibold" style={{ color: "#162840" }}>
                        {step.label}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {currentStep === 0 && (
            <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
              <div
                className="rounded-[30px] border p-6"
                style={{ background: "#f4f7fa", borderColor: "#d8e0e8" }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[0.78rem] font-semibold uppercase tracking-[0.24em]" style={{ color: "#8a9ab0" }}>
                      Stadium View
                    </p>
                    <h3 className="mt-2 text-[1.15rem] font-bold tracking-[-0.04em]" style={{ color: "#14253f" }}>
                      {event.stadium} 좌석도
                    </h3>
                  </div>
                  <div className="rounded-full border px-3 py-1 text-[0.82rem] font-medium"
                    style={{ borderColor: "#d3dde6", color: "#576a82" }}>
                    좌석 잔여 {event.remaining}석
                  </div>
                </div>

                <div
                  className="relative mt-6 h-[390px] overflow-hidden rounded-[30px] border"
                  style={{ background: "radial-gradient(circle at 50% 40%, #fbfcfd 0%, #edf2f6 72%, #e4ebf1 100%)", borderColor: "#dbe3ea" }}
                >
                  <svg viewBox="0 0 560 390" className="h-full w-full" style={{ padding: "54px 18px 88px" }}>
                    <defs>
                      <linearGradient id="fieldFill" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#83a85d" />
                        <stop offset="100%" stopColor="#5f8442" />
                      </linearGradient>
                    </defs>

                    <g opacity={selectedGradeId === event.seatGrades[1]?.id ? 1 : 0.82}>
                      <path
                        d="M170 88 Q280 24 390 88 L358 138 Q280 102 202 138 Z"
                        fill={event.seatGrades[1] ? `${event.seatGrades[1].color}40` : "#d9e3eb"}
                        stroke={event.seatGrades[1] ? event.seatGrades[1].color : "#d9e3eb"}
                        strokeWidth="2"
                      />
                    </g>

                    <g opacity={selectedGradeId === event.seatGrades[0]?.id ? 1 : 0.82}>
                      <path
                        d="M121 130 Q84 182 95 254 L155 232 Q148 185 176 146 Z"
                        fill={event.seatGrades[0] ? `${event.seatGrades[0].color}40` : "#d7e2e9"}
                        stroke={event.seatGrades[0] ? event.seatGrades[0].color : "#d7e2e9"}
                        strokeWidth="2"
                      />
                    </g>

                    <g opacity={selectedGradeId === event.seatGrades[2]?.id ? 1 : 0.82}>
                      <path
                        d="M439 130 Q476 182 465 254 L405 232 Q412 185 384 146 Z"
                        fill={event.seatGrades[2] ? `${event.seatGrades[2].color}40` : "#d7e2e9"}
                        stroke={event.seatGrades[2] ? event.seatGrades[2].color : "#d7e2e9"}
                        strokeWidth="2"
                      />
                    </g>

                    <g opacity={selectedGradeId === event.seatGrades[3]?.id ? 1 : 0.82}>
                      <path
                        d="M158 246 Q280 304 402 246 L426 288 Q280 336 134 288 Z"
                        fill={event.seatGrades[3] ? `${event.seatGrades[3].color}40` : "#d7e2e9"}
                        stroke={event.seatGrades[3] ? event.seatGrades[3].color : "#d7e2e9"}
                        strokeWidth="2"
                      />
                    </g>

                    <path d="M280 136 L334 190 L280 244 L226 190 Z" fill="url(#fieldFill)" stroke="#f6fbf0" strokeWidth="10" />
                    <path d="M280 158 L310 188 L280 218 L250 188 Z" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
                    <path d="M202 138 Q280 102 358 138" fill="none" stroke="#c7d2dc" strokeWidth="14" strokeLinecap="round" />
                    <path d="M176 146 Q148 185 155 232" fill="none" stroke="#c7d2dc" strokeWidth="14" strokeLinecap="round" />
                    <path d="M384 146 Q412 185 405 232" fill="none" stroke="#c7d2dc" strokeWidth="14" strokeLinecap="round" />
                    <path d="M134 288 Q280 336 426 288" fill="none" stroke="#c7d2dc" strokeWidth="14" strokeLinecap="round" />

                    <text x="280" y="74" textAnchor="middle" fill="#67788f" fontSize="12" fontWeight="700">중앙 테이블석</text>
                    <text x="120" y="184" textAnchor="middle" fill="#67788f" fontSize="12" fontWeight="700">1루 응원</text>
                    <text x="440" y="184" textAnchor="middle" fill="#67788f" fontSize="12" fontWeight="700">3루 레드</text>
                    <text x="280" y="318" textAnchor="middle" fill="#67788f" fontSize="12" fontWeight="700">외야 그린</text>
                    <text x="280" y="197" textAnchor="middle" fill="#f7fbf2" fontSize="14" fontWeight="800">GROUND</text>
                  </svg>

                  <div className="absolute inset-x-0 top-4 px-5">
                    <div className="flex flex-wrap justify-center gap-2">
                      {event.seatGrades.map((grade) => {
                        const active = selectedGradeId === grade.id;

                        return (
                          <button
                            key={grade.id}
                            type="button"
                            onClick={() => handleSelectGrade(grade)}
                            className="rounded-full border px-3 py-1.5 text-[0.76rem] font-semibold transition"
                            style={{
                              background: active ? "#ffffff" : "rgba(255,255,255,0.72)",
                              borderColor: active ? grade.color : "#d4dde6",
                              color: active ? grade.color : "#5c6e85",
                              boxShadow: active ? "0 8px 16px rgba(17,40,73,0.08)" : "none",
                            }}
                          >
                            <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: grade.color }} />
                            {grade.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedGrade && selectedBlock && (
                    <div
                      className="absolute rounded-full border px-3 py-1.5 text-[0.78rem] font-semibold shadow-[0_10px_20px_rgba(17,40,73,0.12)]"
                      style={{
                        ...(mapBlockBadgePositions[selectedGrade.id] ?? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }),
                        background: "#ffffff",
                        borderColor: selectedGrade.color,
                        color: selectedGrade.color,
                      }}
                    >
                      {selectedBlock.label}블록 선택됨
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-5 px-5">
                    <div className="rounded-[20px] border px-4 py-3"
                      style={{ background: "rgba(255,255,255,0.72)", borderColor: "#d5dfe8", backdropFilter: "blur(12px)" }}>
                      <p className="text-[0.76rem] font-semibold uppercase tracking-[0.22em]" style={{ color: "#7e8ea3" }}>
                        선택 안내
                      </p>
                      <p className="mt-2 text-[0.88rem] leading-6" style={{ color: "#5f7188" }}>
                        {selectedGrade && selectedBlock
                          ? `현재 ${selectedGrade.name} ${selectedBlock.label}블록을 보고 있습니다. 다음 단계에서 해당 블록의 열/좌석번호를 선택할 수 있어요.`
                          : "좌석도는 구역 위치를 보여주고, 실제 선택은 아래 구역 버튼 또는 오른쪽 리스트에서 진행합니다."}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedGrade && selectedBlock && (
                  <div
                    className="mt-5 rounded-[24px] border p-5"
                    style={{ background: "#f8fafc", borderColor: "#dbe3ea" }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.76rem] font-semibold uppercase tracking-[0.22em]" style={{ color: "#8a9ab0" }}>
                          Block Locator
                        </p>
                        <h4 className="mt-2 text-[1rem] font-bold" style={{ color: "#182a41" }}>
                          {selectedBlock.label}블록 위치 미리보기
                        </h4>
                        <p className="mt-1 text-[0.86rem]" style={{ color: "#62748b" }}>
                          {selectedBlockLocator?.areaLabel ?? `${selectedGrade.name} 내부 위치`}
                        </p>
                      </div>
                      <div
                        className="rounded-full border px-3 py-1.5 text-[0.76rem] font-semibold"
                        style={{ background: "#ffffff", borderColor: `${selectedGrade.color}55`, color: selectedGrade.color }}
                      >
                        {selectedBlockLocator?.orientation ?? selectedGrade.name}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[20px] border p-4" style={{ background: "#ffffff", borderColor: "#dfe6ed" }}>
                      <div className="flex items-center justify-between text-[0.76rem] font-semibold" style={{ color: "#7a8ca2" }}>
                        <span>{blockFlowMeta[selectedGrade.id]?.startLabel ?? "안쪽"}</span>
                        <span>{blockFlowMeta[selectedGrade.id]?.endLabel ?? "바깥쪽"}</span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {selectedGrade.blocks.map((block, index) => {
                          const active = selectedBlock.id === block.id;

                          return (
                            <div key={block.id} className="flex items-center gap-2">
                              <div
                                className="rounded-[14px] border px-3 py-2 text-[0.82rem] font-semibold"
                                style={{
                                  minWidth: 74,
                                  textAlign: "center",
                                  background: active ? `${selectedGrade.color}14` : "#f4f7fa",
                                  borderColor: active ? selectedGrade.color : "#d8e1ea",
                                  color: active ? selectedGrade.color : "#5f7087",
                                  boxShadow: active ? "0 8px 16px rgba(17,40,73,0.08)" : "none",
                                }}
                              >
                                {block.label}
                              </div>
                              {index < selectedGrade.blocks.length - 1 && (
                                <div className="h-[2px] w-5 rounded-full" style={{ background: "#d3dce5" }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-[18px] border p-4" style={{ background: "#ffffff", borderColor: "#dfe6ed" }}>
                        <p className="text-[0.76rem] font-semibold uppercase tracking-[0.2em]" style={{ color: "#8a9ab0" }}>
                          위치 설명
                        </p>
                        <p className="mt-2 text-[0.86rem] leading-6" style={{ color: "#5f7188" }}>
                          {selectedBlockLocator?.guide ?? "선택한 블록의 위치 설명이 여기에 표시됩니다."}
                        </p>
                      </div>
                      <div className="rounded-[18px] border p-4" style={{ background: "#ffffff", borderColor: "#dfe6ed" }}>
                        <p className="text-[0.76rem] font-semibold uppercase tracking-[0.2em]" style={{ color: "#8a9ab0" }}>
                          관람 포인트
                        </p>
                        <p className="mt-2 text-[0.86rem] leading-6" style={{ color: "#5f7188" }}>
                          {selectedBlockLocator?.viewHint ?? "선택 블록의 시야와 분위기 포인트를 안내합니다."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              <div
                className="rounded-[30px] border p-6"
                style={{ background: "#f7f9fb", borderColor: "#d8e0e8" }}
              >
                <div>
                  <p className="text-[0.78rem] font-semibold uppercase tracking-[0.24em]" style={{ color: "#8a9ab0" }}>
                    Zone Picker
                  </p>
                  <h3 className="mt-2 text-[1.15rem] font-bold tracking-[-0.04em]" style={{ color: "#14253f" }}>
                    구역과 블록을 고르세요
                  </h3>
                </div>

                <div className="mt-5 grid gap-3">
                  {event.seatGrades.map((grade) => {
                    const active = selectedGradeId === grade.id;
                    return (
                      <div
                        key={grade.id}
                        className="rounded-[22px] border px-4 py-4 text-left transition"
                        style={{
                          background: active ? "#ffffff" : "#f1f5f8",
                          borderColor: active ? grade.color : "#dde4eb",
                          boxShadow: active ? "0 12px 24px rgba(17,40,73,0.07)" : "none",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectGrade(grade)}
                          className="w-full text-left"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[0.75rem] font-semibold"
                                style={{ background: `${grade.color}12`, color: grade.color }}>
                                {grade.name}
                              </div>
                              <p className="mt-2 text-[0.92rem] leading-6" style={{ color: "#53667d" }}>
                                {grade.description}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-[1rem] font-bold" style={{ color: "#162840" }}>
                                {formatPrice(grade.price)}
                              </div>
                              <div className="mt-1 text-[0.84rem]" style={{ color: "#7a8ca2" }}>
                                {grade.gate}
                              </div>
                            </div>
                          </div>
                        </button>

                        {active && (
                          <div className="mt-4 rounded-[18px] border p-4"
                            style={{ background: "#f8fafc", borderColor: "#dde5ec" }}>
                            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.2em]" style={{ color: "#8a9ab0" }}>
                              Block
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {grade.blocks.map((block) => (
                                <button
                                  key={block.id}
                                  type="button"
                                  onClick={() => handleSelectBlock(block)}
                                  className="rounded-full border px-3 py-1.5 text-[0.84rem] font-medium transition"
                                  style={{
                                    background: selectedBlockId === block.id ? "#eaf1f8" : "#ffffff",
                                    borderColor: selectedBlockId === block.id ? grade.color : "#d5dde6",
                                    color: "#30465f",
                                  }}
                                >
                                  {block.label}블록
                                </button>
                              ))}
                            </div>
                            <p className="mt-3 text-[0.82rem]" style={{ color: "#657790" }}>
                              블록을 먼저 고르면 다음 단계에서 해당 블록의 열/좌석번호를 바로 선택할 수 있습니다.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {selectedGrade && (
                  <div className="mt-5 rounded-[22px] border p-4"
                    style={{ background: "#ffffff", borderColor: "#dde5ec" }}>
                    <div className="flex items-center gap-2 text-[0.86rem] font-semibold" style={{ color: "#1456a0" }}>
                      <Info className="h-4 w-4" />
                      선택 구역 안내
                    </div>
                    <div className="mt-3 space-y-2 text-[0.9rem]" style={{ color: "#596b82" }}>
                      {selectedGrade.notes?.map((note) => <p key={note}>• {note}</p>)}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-between">
                  <div />
                  <Button
                    className="rounded-2xl px-5 text-white"
                    style={{ background: selectedGrade && selectedBlock ? "#1456a0" : "#97afcc" }}
                    disabled={!selectedGrade || !selectedBlock}
                    onClick={() => updateStep(1)}
                  >
                    좌석번호 보기
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </section>
          )}

          {currentStep === 1 && selectedGrade && selectedBlock && (
            <section
              className="rounded-[30px] border p-6"
              style={{ background: "#f6f9fb", borderColor: "#d8e0e8" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[0.78rem] font-semibold uppercase tracking-[0.24em]" style={{ color: "#8a9ab0" }}>
                    Seat Picker
                  </p>
                  <h3 className="mt-2 text-[1.15rem] font-bold tracking-[-0.04em]" style={{ color: "#14253f" }}>
                    {selectedGrade.name} · {selectedBlock.label}블록 좌석번호 선택
                  </h3>
                  <p className="mt-2 text-[0.93rem]" style={{ color: "#5c6f87" }}>
                    선택 좌석은 최대 {event.maxTickets}매까지 가능하며, 예매 완료 시 좌석번호가 NFT 티켓에 저장됩니다.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-[0.82rem]">
                  <span className="rounded-full border px-3 py-1.5" style={{ background: "#ffffff", borderColor: "#d4dde6", color: "#4f637b" }}>
                    {selectedBlock.gate}
                  </span>
                  {selectedBlock.note && (
                    <span className="rounded-full border px-3 py-1.5" style={{ background: "#fff8ee", borderColor: "#f0d5ab", color: "#a16f27" }}>
                      {selectedBlock.note}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-[0.82rem]" style={{ color: "#64758c" }}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-[#1456a0]" />
                  선택 좌석
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-[#dfe6ec]" />
                  선택 가능
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-[#b7c3cf]" />
                  판매 완료
                </span>
              </div>

              <div className="mt-6 overflow-x-auto rounded-[24px] border bg-white p-4" style={{ borderColor: "#dbe3ea" }}>
                <div className="min-w-[860px]">
                  <div className="mb-4 rounded-[18px] py-3 text-center text-[0.92rem] font-semibold tracking-[0.18em]"
                    style={{ background: "#6f8e45", color: "#f8fbff" }}>
                    GROUND
                  </div>

                  <div className="space-y-2">
                    {seatRows.map((row) => (
                      <div key={row} className="flex items-center gap-2">
                        <div
                          className="flex h-8 w-10 items-center justify-center rounded-lg text-[0.78rem] font-semibold"
                          style={{ background: "#eef3f7", color: "#50657e" }}
                        >
                          {row}
                        </div>
                        <div
                          className="grid gap-1"
                          style={{ gridTemplateColumns: `repeat(${seatColumns.length}, minmax(0, 1fr))`, flex: 1 }}
                        >
                          {seatColumns.map((seatNumber) => {
                            const seatKey = `${row}-${seatNumber}`;
                            const compoundKey = `${selectedBlock.label}:${seatKey}`;
                            const sold = takenSeatKeys.has(compoundKey);
                            const selected = selectedSeatKeys.includes(seatKey);

                            return (
                              <button
                                key={seatKey}
                                type="button"
                                onClick={() => toggleSeat(seatKey)}
                                disabled={sold}
                                className="h-8 rounded-md text-[0.72rem] font-semibold transition"
                                style={{
                                  background: sold ? "#b8c3ce" : selected ? "#1456a0" : "#eef3f7",
                                  color: sold ? "#f7fafc" : selected ? "#ffffff" : "#4e6178",
                                  border: sold ? "1px solid #b8c3ce" : selected ? "1px solid #1456a0" : "1px solid #d7dfe7",
                                  opacity: sold ? 0.9 : 1,
                                }}
                              >
                                {seatNumber}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <Button
                  variant="outline"
                  className="rounded-2xl border-[#d5dde6] bg-white text-[#53667d]"
                  onClick={() => updateStep(0)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  구역 다시 선택
                </Button>
                <Button
                  className="rounded-2xl px-5 text-white"
                  style={{ background: selectedSeatKeys.length > 0 ? "#1456a0" : "#97afcc" }}
                  disabled={selectedSeatKeys.length === 0}
                  onClick={() => updateStep(2)}
                >
                  가격 확인하기
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </section>
          )}

          {currentStep === 2 && selectedGrade && selectedBlock && (
            <section
              className="rounded-[30px] border p-6"
              style={{ background: "#f7f9fb", borderColor: "#d8e0e8" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[0.78rem] font-semibold uppercase tracking-[0.24em]" style={{ color: "#8a9ab0" }}>
                    Price & Confirm
                  </p>
                  <h3 className="mt-2 text-[1.15rem] font-bold tracking-[-0.04em]" style={{ color: "#14253f" }}>
                    가격과 할인 유형을 확인하세요
                  </h3>
                  <p className="mt-2 text-[0.93rem]" style={{ color: "#5d6f86" }}>
                    좌석별로 권종을 고르면 총액과 수수료가 오른쪽 요약에 바로 반영됩니다.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {selectedTickets.map((ticket) => (
                  <div
                    key={ticket.key}
                    className="grid gap-3 rounded-[22px] border p-4 md:grid-cols-[1.1fr_0.9fr_0.6fr]"
                    style={{ background: "#ffffff", borderColor: "#dbe3ea" }}
                  >
                    <div>
                      <p className="text-[0.8rem] font-semibold uppercase tracking-[0.22em]" style={{ color: "#8a9ab0" }}>
                        Seat
                      </p>
                      <p className="mt-2 text-[1rem] font-semibold" style={{ color: "#162840" }}>
                        {selectedGrade.name} {selectedBlock.label}블록 {ticket.row}열 {ticket.seatNumber}번
                      </p>
                      <p className="mt-1 text-[0.88rem]" style={{ color: "#6a7b91" }}>
                        입장 게이트 {selectedBlock.gate}
                      </p>
                    </div>

                    <div>
                      <p className="text-[0.8rem] font-semibold uppercase tracking-[0.22em]" style={{ color: "#8a9ab0" }}>
                        권종 선택
                      </p>
                      <select
                        value={ticketTypesBySeat[ticket.key] ?? "adult"}
                        onChange={(event) =>
                          setTicketTypesBySeat((previous) => ({
                            ...previous,
                            [ticket.key]: event.target.value as SeatTicketTypeId,
                          }))
                        }
                        className="mt-2 w-full rounded-2xl border px-4 py-3 text-[0.92rem] outline-none"
                        style={{ borderColor: "#d5dde6", background: "#f9fbfc", color: "#1b2c44" }}
                      >
                        {seatTicketTypes.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label} · {option.description}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:text-right">
                      <p className="text-[0.8rem] font-semibold uppercase tracking-[0.22em]" style={{ color: "#8a9ab0" }}>
                        금액
                      </p>
                      <p className="mt-2 text-[1rem] font-bold" style={{ color: "#162840" }}>
                        {formatPrice(ticket.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <label className="mt-5 flex items-start gap-3 rounded-[20px] border px-4 py-4"
                style={{ background: "#ffffff", borderColor: "#dbe3ea" }}>
                <input
                  type="checkbox"
                  checked={refundPolicyAgreed}
                  onChange={(event) => setRefundPolicyAgreed(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#cfd8e2]"
                />
                <span className="text-[0.92rem] leading-6" style={{ color: "#42556d" }}>
                  결제 후 티켓 NFT는 즉시 발급되며, 경기 시작 4시간 전까지는 공식 재판매 또는 취소 정책에 따라 처리됩니다.
                </span>
              </label>

              <div className="mt-6 flex justify-between">
                <Button
                  variant="outline"
                  className="rounded-2xl border-[#d5dde6] bg-white text-[#53667d]"
                  onClick={() => updateStep(1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  좌석 다시 보기
                </Button>
                <Button
                  className="rounded-2xl px-5 text-white"
                  style={{ background: paymentReady && mintingStatus === "idle" ? "#1456a0" : "#97afcc" }}
                  disabled={!paymentReady || mintingStatus !== "idle"}
                  onClick={() => void handleCompleteBooking()}
                >
                  {mintingStatus === "connecting" && <><Loader2 className="h-4 w-4 animate-spin" />지갑 연결 중...</>}
                  {mintingStatus === "signing" && mintingProgress && (
                    <><Loader2 className="h-4 w-4 animate-spin" />MetaMask 컨펌 대기 ({mintingProgress.current}/{mintingProgress.total})...</>
                  )}
                  {mintingStatus === "signing" && !mintingProgress && <><Loader2 className="h-4 w-4 animate-spin" />MetaMask 컨펌 대기...</>}
                  {mintingStatus === "mining" && mintingProgress && (
                    <><Loader2 className="h-4 w-4 animate-spin" />블록체인 기록 중 ({mintingProgress.current}/{mintingProgress.total})...</>
                  )}
                  {mintingStatus === "mining" && !mintingProgress && <><Loader2 className="h-4 w-4 animate-spin" />블록체인 기록 중...</>}
                  {mintingStatus === "saving" && mintingProgress && (
                    <><Loader2 className="h-4 w-4 animate-spin" />티켓 저장 중 ({mintingProgress.current}/{mintingProgress.total})...</>
                  )}
                  {mintingStatus === "saving" && !mintingProgress && <><Loader2 className="h-4 w-4 animate-spin" />티켓 저장 중...</>}
                  {mintingStatus === "idle"       && <>예매 완료<CheckCircle2 className="h-4 w-4" /></>}
                </Button>
              </div>

              {/* 진행 바 */}
              {mintingProgress && (
                <div className="mt-4 rounded-2xl border p-4" style={{ background: "#f0f5fb", borderColor: "#d0dcea" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[0.78rem] font-semibold" style={{ color: "#3a5f8a" }}>
                      {mintingProgress.label} {mintingProgress.current > 0 ? `${mintingProgress.current} / ${mintingProgress.total}` : ""}
                    </span>
                    <span className="text-[0.78rem] font-semibold" style={{ color: "#1456a0" }}>
                      {mintingProgress.percent}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "#d0dcea" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${mintingProgress.percent}%`,
                        background: "linear-gradient(90deg, #1456a0, #1e7fd0)",
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[0.72rem]" style={{ color: "#8a9ab0" }}>
                    {mintingProgress.detail}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>

        <aside
          className="h-fit rounded-[30px] border p-6 xl:sticky xl:top-24"
          style={{ background: "#f4f7fa", borderColor: "#d8e0e8", boxShadow: "0 16px 36px rgba(17,40,73,0.05)" }}
        >
          <div>
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.24em]" style={{ color: "#8a9ab0" }}>
              Booking Summary
            </p>
            <h3 className="mt-2 text-[1.15rem] font-bold tracking-[-0.04em]" style={{ color: "#15263d" }}>
              예매 요약
            </h3>
          </div>

          <div className="mt-5 rounded-[22px] border p-4" style={{ background: "#ffffff", borderColor: "#dbe3ea" }}>
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.2em]" style={{ color: "#8a9ab0" }}>
              경기 정보
            </p>
            <div className="mt-3 space-y-2 text-[0.92rem]" style={{ color: "#4c6078" }}>
              <p className="font-semibold" style={{ color: "#162840" }}>{event.name}</p>
              <p>{event.date}</p>
              <p>{event.venue}</p>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border p-4" style={{ background: "#ffffff", borderColor: "#dbe3ea" }}>
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.2em]" style={{ color: "#8a9ab0" }}>
              현재 선택
            </p>
            <div className="mt-3 space-y-2 text-[0.92rem]" style={{ color: "#4f6279" }}>
              <p>
                구역: <strong style={{ color: "#162840" }}>{selectedGrade?.name ?? "선택 전"}</strong>
              </p>
              <p>
                블록: <strong style={{ color: "#162840" }}>{selectedBlock ? `${selectedBlock.label}블록` : "선택 전"}</strong>
              </p>
              <p>
                좌석:
                <strong style={{ color: "#162840" }}>
                  {" "}
                  {selectedTickets.length > 0
                    ? selectedTickets.map((ticket) => `${ticket.row}열 ${ticket.seatNumber}번`).join(", ")
                    : "선택 전"}
                </strong>
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border p-4" style={{ background: "#ffffff", borderColor: "#dbe3ea" }}>
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.2em]" style={{ color: "#8a9ab0" }}>
              결제 금액
            </p>
            <div className="mt-4 space-y-3 text-[0.92rem]" style={{ color: "#53677f" }}>
              <div className="flex items-center justify-between">
                <span>티켓 금액</span>
                <strong style={{ color: "#162840" }}>{formatPrice(ticketTotal)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>예매 수수료</span>
                <strong style={{ color: "#162840" }}>{formatPrice(serviceFee)}</strong>
              </div>
              <div className="border-t pt-3 flex items-center justify-between" style={{ borderColor: "#e3e9ef" }}>
                <span className="font-semibold" style={{ color: "#162840" }}>총 결제금액</span>
                <strong className="text-[1.12rem]" style={{ color: "#1456a0" }}>
                  {formatPrice(finalTotal)}
                </strong>
              </div>
            </div>
          </div>

          {/* 지갑 연결 상태 */}
          <div className="mt-4 rounded-[22px] border p-4" style={{ background: "#ffffff", borderColor: "#dbe3ea" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[0.86rem] font-semibold" style={{ color: "#1456a0" }}>
                <Wallet className="h-4 w-4" />
                지갑
              </div>
              <span className="text-[0.82rem] font-semibold" style={{ color: walletAddress ? "#2dba73" : "#e5824a" }}>
                {walletAddress
                  ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                  : "미연결 — 예매 시 자동 연결"}
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border p-4" style={{ background: "#ffffff", borderColor: "#dbe3ea" }}>
            <div className="flex items-center gap-2 text-[0.86rem] font-semibold" style={{ color: "#1456a0" }}>
              <AlertCircle className="h-4 w-4" />
              예매 팁
            </div>
            <div className="mt-3 space-y-2 text-[0.9rem] leading-6" style={{ color: "#5b6d84" }}>
              <p>• 좌석은 선택 즉시 장바구니처럼 고정되지 않으니 결제를 바로 이어가는 편이 좋습니다.</p>
              <p>• 잠실은 블록별 게이트가 달라 입장 전 게이트를 함께 확인하는 것이 편합니다.</p>
              <p>• 예매 후에는 내 입장권에서 QR과 좌석번호를 다시 확인할 수 있습니다.</p>
            </div>
          </div>
        </aside>
      </div>

      {completedTickets.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,27,39,0.45)] p-4">
          <div
            className="w-full max-w-[560px] rounded-[30px] border p-7"
            style={{ background: "#f8fafc", borderColor: "#d9e1e8", boxShadow: "0 26px 60px rgba(17,40,73,0.18)" }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: "#e2f3ea", color: "#2d8b57" }}>
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[0.8rem] font-semibold uppercase tracking-[0.22em]" style={{ color: "#8a9ab0" }}>
                  Booking Complete
                </p>
                <h3 className="mt-1 text-[1.2rem] font-bold tracking-[-0.04em]" style={{ color: "#162840" }}>
                  예매가 완료되었습니다
                </h3>
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border p-4" style={{ background: "#ffffff", borderColor: "#dde5ec" }}>
              <div className="space-y-3 text-[0.93rem]" style={{ color: "#4f6279" }}>
                {completedTickets.map((ticket) => (
                  <div key={ticket.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "#162840" }}>
                        {ticket.seat}
                      </p>
                      <p className="mt-1 text-[0.86rem]">{ticket.ticketTypeLabel} · {ticket.gate}</p>
                    </div>
                    <div className="text-right font-semibold" style={{ color: "#1456a0" }}>
                      {formatPrice(ticket.price)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 굿즈 박스 지급 안내 */}
            <div
              className="mt-4 rounded-[22px] border p-4"
              style={{ background: "linear-gradient(135deg, #f5eeff, #fce8ff)", borderColor: "#d4aaee" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎁</span>
                <div>
                  <p className="text-[0.88rem] font-bold" style={{ color: "#7700bb" }}>
                    굿즈 박스가 지급되었습니다!
                  </p>
                  <p className="mt-1 text-[0.8rem]" style={{ color: "#9b6dbf" }}>
                    박스를 개봉하면 NFT 굿즈 또는 파편을 획득할 수 있어요.
                  </p>
                </div>
              </div>
            </div>

            {/* 블록체인 확정 상태 */}
            {confirmingBackground === "pending" && (
              <div className="mt-4 flex items-center gap-3 rounded-[16px] border px-4 py-3"
                style={{ background: "#fefbe8", borderColor: "#f0d060", color: "#7a6000" }}>
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span className="text-[0.82rem] font-medium">블록체인 확정 중... (백그라운드 처리)</span>
              </div>
            )}
            {confirmingBackground === "done" && (
              <div className="mt-4 flex items-center gap-3 rounded-[16px] border px-4 py-3"
                style={{ background: "#eaf3f0", borderColor: "#b0d9c8", color: "#1d7a55" }}>
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="text-[0.82rem] font-medium">티켓 저장 완료 — 선택 좌석이 판매 완료로 반영되었습니다</span>
              </div>
            )}
            {confirmingBackground === "failed" && (
              <div className="mt-4 flex items-center gap-3 rounded-[16px] border px-4 py-3"
                style={{ background: "#fef2f2", borderColor: "#fca5a5", color: "#b91c1c" }}>
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="text-[0.82rem] font-medium">블록체인 확정 실패 — 고객센터에 문의해 주세요</span>
              </div>
            )}

            {txHash && (
              <a
                href={`https://explorer.hoodi.ethpandaops.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center gap-2 rounded-[16px] border px-4 py-3 text-[0.82rem] font-medium transition hover:opacity-80"
                style={{ background: "#eaf3f0", borderColor: "#b0d9c8", color: "#1d7a55" }}
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Tx: {txHash}</span>
              </a>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                className="rounded-2xl border-[#d5dde6] bg-white text-[#53667d]"
                onClick={() => navigate("/tickets")}
              >
                경기 목록으로
              </Button>
              <Button
                className="rounded-2xl bg-[#1456a0] text-white"
                onClick={() => navigate("/my-tickets")}
              >
                내 입장권 보기
              </Button>
              <Button
                className="rounded-2xl text-white"
                style={{ background: "linear-gradient(135deg, #7700bb, #ff10f0)" }}
                onClick={() => navigate("/combine")}
              >
                🎁 박스 받기
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
