import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";

interface SeatInfo {
  row: number;
  seatNumber: number;
  price: number;
  ticketTypeLabel: string;
}

interface OrderInfo {
  walletAddress: string;
  gameId:        string;
  eventName:     string;
  stadium:       string;
  grade:         string;
  block:         string;
  gate:          string;
  seats:         SeatInfo[];
  pointDiscount: number;
  finalTotal:    number;
}

function formatPrice(value: number) {
  return `₩${value.toLocaleString("ko-KR")}`;
}

export function TicketBookingSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const paymentKey = searchParams.get("paymentKey") ?? "";
  const orderId    = searchParams.get("orderId") ?? "";
  const amount     = Number(searchParams.get("amount") ?? "0");

  const [status, setStatus]   = useState<"loading" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    if (!paymentKey || !orderId || !amount) {
      setErrorMsg("결제 정보가 올바르지 않습니다.");
      setStatus("error");
      return;
    }

    const raw = sessionStorage.getItem(`toss_order_${orderId}`);
    if (!raw) {
      setErrorMsg("주문 정보를 찾을 수 없습니다. 결제는 완료됐을 수 있으니 내 입장권을 확인해 주세요.");
      setStatus("error");
      return;
    }

    const info: OrderInfo = JSON.parse(raw);
    setOrderInfo(info);

    const token = localStorage.getItem("auth_token") ?? "";

    // 서버에 결제 승인 + NFT 민팅 요청
    fetch(`${import.meta.env.VITE_API_URL}/api/tickets/toss/confirm`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${token}`,
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount,
        walletAddress: info.walletAddress,
        gameId:        info.gameId,
        stadium:       info.stadium,
        grade:         info.grade,
        block:         info.block,
        seats: info.seats.map((s) => ({
          row:        s.row,
          seatNumber: s.seatNumber,
          price:      s.price,
        })),
        pointDiscount: info.pointDiscount,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          sessionStorage.removeItem(`toss_order_${orderId}`);
          setStatus("done");
        } else {
          setErrorMsg(data.message ?? data.error ?? "결제 승인 처리 중 오류가 발생했습니다.");
          setStatus("error");
        }
      })
      .catch(() => {
        setErrorMsg("서버 통신 오류가 발생했습니다. 내 입장권 페이지에서 결과를 확인해 주세요.");
        setStatus("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="page-shell flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto" style={{ color: "#1456a0" }} />
          <p className="text-[0.95rem] font-medium" style={{ color: "#55657d" }}>
            결제를 확인하고 티켓을 발급하는 중입니다...
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="page-shell flex items-center justify-center min-h-[50vh]">
        <div
          className="rounded-[28px] border p-8 max-w-md w-full text-center"
          style={{ background: "#fff5f5", borderColor: "#fca5a5" }}
        >
          <AlertCircle className="h-10 w-10 mx-auto mb-4" style={{ color: "#ef4444" }} />
          <h2 className="text-[1.1rem] font-bold mb-2" style={{ color: "#14253f" }}>처리 중 오류가 발생했습니다</h2>
          <p className="text-[0.9rem] leading-6 mb-6" style={{ color: "#55657d" }}>{errorMsg}</p>
          <Button className="rounded-2xl bg-[#1456a0] text-white" onClick={() => navigate("/my-tickets")}>
            내 입장권 확인
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell flex items-center justify-center min-h-[50vh]">
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

        {orderInfo && (
          <>
            <div className="mt-5 rounded-[22px] border p-4" style={{ background: "#ffffff", borderColor: "#dde5ec" }}>
              <p className="text-[0.8rem] font-semibold uppercase tracking-[0.2em] mb-3" style={{ color: "#8a9ab0" }}>
                예매 내역
              </p>
              <div className="space-y-3 text-[0.93rem]" style={{ color: "#4f6279" }}>
                {orderInfo.seats.map((s, i) => (
                  <div key={i} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "#162840" }}>
                        {orderInfo.grade} {orderInfo.block}블록 {s.row}열 {s.seatNumber}번
                      </p>
                      <p className="mt-1 text-[0.86rem]">{s.ticketTypeLabel} · 입장 {orderInfo.gate}</p>
                    </div>
                    <div className="text-right font-semibold" style={{ color: "#1456a0" }}>
                      {formatPrice(s.price)}
                    </div>
                  </div>
                ))}
              </div>
              {orderInfo.pointDiscount > 0 && (
                <div className="mt-3 pt-3 border-t flex justify-between text-[0.88rem]" style={{ borderColor: "#e8eff5" }}>
                  <span style={{ color: "#059669" }}>포인트 할인</span>
                  <strong style={{ color: "#059669" }}>-{formatPrice(orderInfo.pointDiscount)}</strong>
                </div>
              )}
              <div className="mt-2 pt-2 border-t flex justify-between font-bold" style={{ borderColor: "#e8eff5" }}>
                <span style={{ color: "#162840" }}>총 결제금액</span>
                <span style={{ color: "#1456a0" }}>{formatPrice(amount)}</span>
              </div>
            </div>

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
          </>
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
  );
}
