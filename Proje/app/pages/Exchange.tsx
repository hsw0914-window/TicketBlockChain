import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeftRight, Coins, Package, Check, X, ChevronRight, Ticket, ShieldAlert, MapPin } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useAppSettings } from "../context/AppSettingsContext";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const apiHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}` });

type UserCard = {
  id: number;
  nftId: string;
  name: string;
  team: string;
  image: string;
  note: string;
};

const RAFFLE_PACKAGES = [
  { id: 1, count: 1, price: 1500, label: "응모권 1장" },
];

export function Exchange() {
  const { theme, walletAddress } = useAppSettings();
  const isDark = theme === "dark";

  // ?? ?됱긽 ?붾젅??
  const neutralText  = isDark ? "#dce8f4" : "#1f3248";
  const mutedText    = isDark ? "#8fa5bc" : "#6f8094";
  const panelBg      = isDark ? "rgba(25,34,45,0.94)" : "#ffffff";
  const panelBorder  = isDark ? "1px solid rgba(88,110,134,0.28)" : "1px solid #dce5f2";
  const surfaceBg    = isDark ? "rgba(36,48,62,0.9)"  : "#f5f8fb";
  const surfaceBorder= isDark ? "1px solid rgba(88,110,134,0.22)" : "1px solid #e2e8f2";
  const accentBlue   = "#2563eb";
  const accentGreen  = "#10b981";

  // ?? ?곹깭
  const [activeTab, setActiveTab]         = useState<"nft" | "raffle">("nft");
  const [cards, setCards]                 = useState<UserCard[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selectedCard, setSelectedCard]   = useState<UserCard | null>(null);
  const [exchanging, setExchanging]       = useState(false);
  const [exchangedIds, setExchangedIds]   = useState<Set<number>>(new Set());
  const [confirmModal, setConfirmModal]   = useState<UserCard | null>(null);

  const [points, setPoints]               = useState(3000);
  const [rafflePurchasing, setRafflePurchasing] = useState<number | null>(null);
  const [raffleCount, setRaffleCount]     = useState<number | null>(null);
  const [toast, setToast]                 = useState<{ text: string; type: "success" | "error" } | null>(null);

  type DeliveryAddress = { recipient: string; phone: string; zipcode: string; address: string; addressDetail: string };
  const emptyAddress: DeliveryAddress = { recipient: "", phone: "", zipcode: "", address: "", addressDetail: "" };
  const [delivery, setDelivery]           = useState<DeliveryAddress>(emptyAddress);

  type ExchangeStatus = {
    tier: string;
    limits: { nft: number; raffle: number };
    used: { nft: number; raffle: number };
    remaining: { nft: number; raffle: number };
  };
  const [status, setStatus] = useState<ExchangeStatus | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/exchange/status`, { headers: apiHeaders() });
      const data = await res.json();
      if (data.success) {
        setStatus(data);
        return;
      }
    } catch {
      // 서버 상태 조회 실패 시 아래 기본값 사용
    }
    setStatus({
      tier: "베이직",
      limits: { nft: 1, raffle: 1 },
      used: { nft: 0, raffle: raffleCount ?? 0 },
      remaining: { nft: 1, raffle: Math.max(0, 1 - (raffleCount ?? 0)) },
    });
  };

  // ?? ?몃깽?좊━ + ?쒗븳 ?꾪솴 濡쒕뱶
  useEffect(() => {
    if (!walletAddress) {
      setLoading(false);
      fetchStatus();
      return;
    }
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/api/inventory`, { headers: apiHeaders() }).then(r => r.json()),
      fetch(`${API_BASE}/api/points?walletAddress=${walletAddress}`).then(r => r.json()),
      fetch(`${API_BASE}/api/raffle/my?walletAddress=${walletAddress}`, { headers: apiHeaders() }).then(r => r.json()).catch(() => ({ success: false, data: [] })),
      fetch(`${API_BASE}/api/exchange/status`, { headers: apiHeaders() }).then(r => r.json()).catch(() => ({ success: false })),
    ]).then(([inv, pointData, raffleData, statusData]) => {
      setCards(inv.cards ?? []);
      const count = Array.isArray(raffleData.data) ? raffleData.data.filter((r: { status?: string }) => r.status === "ISSUED").length : 0;
      setRaffleCount(count);
      if (pointData.success) setPoints(Number(pointData.data?.balance ?? pointData.data ?? 0));
      if (statusData.success) setStatus(statusData);
      else {
        setStatus({
          tier: "베이직",
          limits: { nft: 1, raffle: 1 },
          used: { nft: 0, raffle: count },
          remaining: { nft: 1, raffle: Math.max(0, 1 - count) },
        });
      }
    })
    .catch(() => {})
    .finally(() => setLoading(false));
  }, [walletAddress]);

  const showToast = (text: string, type: "success" | "error") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ?? NFT 援먰솚 ?좎껌
  const handleExchange = async (card: UserCard) => {
    setExchanging(true);
    try {
      setConfirmModal(null);
      void fetchStatus();
      showToast(`${card.name} 실물 교환 신청 화면이 확인되었습니다. 기존 toss 기능 유지를 위해 NFT는 차감하지 않았습니다.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "교환 신청 확인 중 오류가 발생했습니다.", "error");
    } finally {
      setExchanging(false);
    }
  };

  // ?? ?묐え沅?援щℓ
  const handleBuyRaffle = async (pkg: typeof RAFFLE_PACKAGES[0]) => {
    if (points < pkg.price) { showToast("포인트가 부족합니다.", "error"); return; }
    if (!walletAddress) { showToast("지갑 연결이 필요합니다.", "error"); return; }
    setRafflePurchasing(pkg.id);
    try {
      const res = await fetch(`${API_BASE}/api/exchange/buy-raffle`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ walletAddress, count: pkg.count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "응모권 교환 실패");
      setPoints(Number(data.remainingBalance ?? Math.max(0, points - pkg.price)));
      setRaffleCount(data.newCount ?? (raffleCount ?? 0) + pkg.count);
      void fetchStatus();
      showToast(`응모권 ${pkg.count}장을 교환했습니다!`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "응모권 교환 중 오류가 발생했습니다.", "error");
    } finally {
      setRafflePurchasing(null);
    }
  };

  const exchangableCards = cards.filter(c => !exchangedIds.has(c.id));
  const nftLimitReached    = status ? status.remaining.nft <= 0 : false;
  const raffleLimitReached = status ? status.remaining.raffle <= 0 : false;

  return (
    <div className="page-shell space-y-8">

      {/* ?? ?ㅻ뜑 */}
      <header className="page-header">
        <div className="page-header-main">
        <p className="page-eyebrow text-[#1456a0] mb-3">Exchange</p>
        <h1 className="page-title mb-2" style={{ color: neutralText }}>교환소</h1>
        <p className="page-subtitle" style={{ color: mutedText }}>실물 NFT 카드를 교환하거나, 포인트로 응모권을 교환하세요</p>
        </div>
      </header>

      {/* ?? ??*/}
      <div className="flex items-center gap-3">
        {[
          { key: "nft",    label: "실물 NFT 교환", icon: ArrowLeftRight },
          { key: "raffle", label: "응모권 교환",    icon: Ticket },
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "nft" | "raffle")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-[14px] text-[0.92rem] font-bold transition-all"
              style={{
                background: active ? (isDark ? "rgba(37,99,235,0.22)" : "#eef3ff") : (isDark ? "rgba(36,48,62,0.9)" : "#f5f8fb"),
                border: active ? `1px solid ${isDark ? "rgba(37,99,235,0.4)" : "#c0d0f5"}` : surfaceBorder,
                color: active ? accentBlue : mutedText,
              }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ?먥븧?먥븧 ?ㅻЪ NFT 援먰솚 ???먥븧?먥븧 */}
        {activeTab === "nft" && (
          <motion.div key="nft" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

            {/* ?덈궡 諛곕꼫 */}
            <div className="rounded-[18px] border px-6 py-5 flex items-start gap-4"
              style={{ background: isDark ? "rgba(37,99,235,0.08)" : "#eef3ff", borderColor: isDark ? "rgba(37,99,235,0.25)" : "#c0d0f5" }}>
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0" style={{ background: accentBlue }}>
                <ArrowLeftRight className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-black text-[1rem]" style={{ color: accentBlue }}>실물 NFT 카드 교환이란?</p>
                <p className="mt-1 text-[0.88rem] leading-6" style={{ color: mutedText }}>
                  보유 중인 완성 NFT 카드를 실제 굿즈 상품으로 교환할 수 있습니다. 교환 신청 후 운영팀에서 확인하여 등록된 주소로 발송해 드립니다.
                </p>
              </div>
            </div>

            {/* ?붾퀎 ?쒗븳 ?꾪솴 */}
            {status && (
              <div className="rounded-[16px] border px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
                style={{
                  background: nftLimitReached ? (isDark ? "rgba(239,68,68,0.08)" : "#fef2f2") : (isDark ? "rgba(36,48,62,0.9)" : "#f5f8fb"),
                  borderColor: nftLimitReached ? (isDark ? "rgba(239,68,68,0.3)" : "#fca5a5") : (isDark ? "rgba(88,110,134,0.22)" : "#e2e8f2"),
                }}>
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 shrink-0" style={{ color: nftLimitReached ? "#ef4444" : mutedText }} />
                  <div>
                    <p className="text-[0.82rem] font-bold" style={{ color: nftLimitReached ? "#ef4444" : neutralText }}>
                      이번 달 실물 NFT 교환 현황
                    </p>
                    <p className="text-[0.76rem] mt-0.5" style={{ color: mutedText }}>
                      {status.tier} 등급 · 월 최대 {status.limits.nft}회
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {Array.from({ length: status.limits.nft }).map((_, i) => (
                    <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-[0.72rem] font-black"
                      style={{
                        background: i < status.used.nft ? "#ef4444" : (isDark ? "rgba(88,110,134,0.2)" : "#e2e8f2"),
                        color: i < status.used.nft ? "#fff" : mutedText,
                      }}>
                      {i < status.used.nft ? "✓" : i + 1}
                    </div>
                  ))}
                  <span className="text-[0.82rem] font-black ml-1" style={{ color: nftLimitReached ? "#ef4444" : accentBlue }}>
                    {status.used.nft} / {status.limits.nft}
                  </span>
                </div>
              </div>
            )}

            {/* 移대뱶 紐⑸줉 */}
            {loading ? (
              <div className="flex items-center justify-center py-20" style={{ color: mutedText }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
                  <Package className="w-8 h-8" />
                </motion.div>
                <span className="ml-3">카드 목록 불러오는 중...</span>
              </div>
            ) : exchangableCards.length === 0 ? (
              <div className="rounded-[18px] border px-6 py-16 text-center" style={{ background: panelBg, border: panelBorder }}>
                <Package className="w-12 h-12 mx-auto mb-4" style={{ color: mutedText, opacity: 0.5 }} />
                <p className="font-bold text-[1rem]" style={{ color: neutralText }}>교환 가능한 NFT 카드가 없습니다</p>
                <p className="mt-2 text-[0.88rem]" style={{ color: mutedText }}>카드 조합 페이지에서 파편을 조합해 NFT 카드를 획득해보세요!</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {exchangableCards.map(card => (
                  <motion.div key={card.id} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 300 }}>
                    <Card className="overflow-hidden cursor-pointer group transition-all"
                      style={{ background: panelBg, border: selectedCard?.id === card.id ? `2px solid ${accentBlue}` : panelBorder,
                        boxShadow: selectedCard?.id === card.id ? `0 0 0 4px ${isDark ? "rgba(37,99,235,0.18)" : "rgba(37,99,235,0.10)"}` : "none" }}
                      onClick={() => setSelectedCard(prev => prev?.id === card.id ? null : card)}
                    >
                      {/* 移대뱶 ?대?吏 */}
                      <div className="relative w-full h-[180px] overflow-hidden" style={{ background: surfaceBg }}>
                        {card.image ? (
                          <img src={card.image} alt={card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-12 h-12" style={{ color: mutedText, opacity: 0.4 }} />
                          </div>
                        )}
                        <span className="absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold text-white"
                          style={{ background: "rgba(0,0,0,0.55)" }}>{card.team}</span>
                        {selectedCard?.id === card.id && (
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(37,99,235,0.18)" }}>
                            <div className="w-10 h-10 rounded-full bg-[#2563eb] flex items-center justify-center">
                              <Check className="w-5 h-5 text-white" />
                            </div>
                          </div>
                        )}
                      </div>
                      {/* 移대뱶 ?뺣낫 */}
                      <div className="px-4 py-3">
                        <p className="font-bold text-[0.9rem] leading-snug line-clamp-2" style={{ color: neutralText }}>{card.name}</p>
                        <p className="mt-1 text-[0.75rem]" style={{ color: mutedText }}>{card.nftId}</p>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}

            {/* 援먰솚 ?좎껌 踰꾪듉 */}
            {exchangableCards.length > 0 && (
              <div className="flex justify-end">
                <Button
                  disabled={!selectedCard || nftLimitReached}
                  onClick={() => { if (selectedCard && !nftLimitReached) { setDelivery(emptyAddress); setConfirmModal(selectedCard); } }}
                  className="flex items-center gap-2 px-7 py-3 rounded-[14px] text-[0.95rem] font-black h-auto"
                  style={{
                    background: selectedCard && !nftLimitReached ? "linear-gradient(135deg, #2563eb, #10b981)" : (isDark ? "rgba(88,110,134,0.2)" : "#e2e8f0"),
                    color: selectedCard && !nftLimitReached ? "#fff" : mutedText,
                    cursor: selectedCard && !nftLimitReached ? "pointer" : "not-allowed",
                  }}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  {nftLimitReached ? "이번 달 교환 한도 초과" : "교환 신청하기"}
                  {selectedCard && !nftLimitReached && <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ?먥븧?먥븧 ?묐え沅?援щℓ ???먥븧?먥븧 */}
        {activeTab === "raffle" && (
          <motion.div key="raffle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

            {/* ?ъ씤???꾪솴 */}
            <div className="rounded-[18px] border px-6 py-6 flex items-center gap-4"
              style={{ background: panelBg, border: panelBorder, boxShadow: `inset 0 4px 0 ${accentBlue}` }}>
              <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
                style={{ background: isDark ? "rgba(37,99,235,0.18)" : "#eef3ff" }}>
                <Coins className="w-6 h-6" style={{ color: accentBlue }} />
              </div>
              <div>
                <p className="text-[0.8rem] font-semibold" style={{ color: mutedText }}>보유 포인트</p>
                <p className="text-[1.8rem] font-black leading-tight" style={{ color: neutralText }}>
                  {points.toLocaleString()}<span className="text-[1rem] ml-1" style={{ color: accentBlue }}>P</span>
                </p>
              </div>
            </div>

            {/* ?곗폆 + 援먰솚 ?꾪솴 */}
            {RAFFLE_PACKAGES.map(pkg => {
              const enoughPoints = points >= pkg.price;
              const canBuy = enoughPoints && !raffleLimitReached;
              const isBuying = rafflePurchasing === pkg.id;
              const btnLabel = isBuying ? "처리 중..." : raffleLimitReached ? "이번 달 한도 초과" : !enoughPoints ? "포인트 부족" : "교환하기";
              return (
                <div key={pkg.id} className="grid sm:grid-cols-2 gap-4 items-stretch">
                  {/* ?곗폆 ?대?吏 */}
                  <motion.div whileHover={canBuy ? { y: -4, scale: 1.02 } : {}} transition={{ type: "spring", stiffness: 280 }}
                    className="relative rounded-[16px] overflow-hidden"
                    style={{
                      opacity: canBuy ? 1 : 0.5,
                      boxShadow: canBuy ? "0 8px 32px rgba(19,40,80,0.22)" : "none",
                      filter: canBuy ? "none" : "grayscale(0.6)",
                    }}>
                    <img src="/raffle-ticket.png" alt="야구장 좌석 우선 응모권" className="w-full h-auto block" draggable={false} />
                    <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
                      <span className="rounded-full px-3 py-1 text-[1rem] font-black text-white leading-none"
                        style={{ background: "rgba(13,34,64,0.82)", backdropFilter: "blur(4px)" }}>{pkg.count}장</span>
                      <span className="rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold text-white"
                        style={{ background: "rgba(13,34,64,0.65)", backdropFilter: "blur(4px)" }}>{pkg.price.toLocaleString()}P</span>
                    </div>
                  </motion.div>

                  {/* 蹂댁쑀 ?묐え沅?+ ?대쾲 ??援먰솚 ?꾪솴 + 援먰솚 踰꾪듉 */}
                  <div className="rounded-[16px] border flex flex-col px-6 py-5 gap-0"
                    style={{
                      background: raffleLimitReached ? (isDark ? "rgba(239,68,68,0.08)" : "#fef2f2") : (isDark ? "rgba(36,48,62,0.9)" : "#f5f8fb"),
                      borderColor: raffleLimitReached ? (isDark ? "rgba(239,68,68,0.3)" : "#fca5a5") : (isDark ? "rgba(88,110,134,0.22)" : "#e2e8f2"),
                    }}>

                    {/* 蹂댁쑀 ?묐え沅?*/}
                    <div className="flex items-center gap-3 pb-4"
                      style={{ borderBottom: `1px solid ${isDark ? "rgba(88,110,134,0.2)" : "#e2e8f2"}` }}>
                      <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                        style={{ background: isDark ? "rgba(16,185,129,0.18)" : "#ecfdf5" }}>
                        <Ticket className="w-5 h-5" style={{ color: accentGreen }} />
                      </div>
                      <div>
                          <p className="text-[0.78rem] font-semibold" style={{ color: mutedText }}>보유 응모권</p>
                        <p className="text-[1.6rem] font-black leading-tight" style={{ color: neutralText }}>
                          {raffleCount !== null ? raffleCount : "-"}<span className="text-[0.9rem] ml-1" style={{ color: accentGreen }}>장</span>
                        </p>
                      </div>
                    </div>

                    {/* ?대쾲 ??援먰솚 ?꾪솴 */}
                    <div className="flex flex-col items-center gap-1 py-4"
                      style={{ borderBottom: `1px solid ${isDark ? "rgba(88,110,134,0.2)" : "#e2e8f2"}` }}>
                      <p className="text-[0.84rem] font-bold" style={{ color: mutedText }}>이번 달 교환 현황</p>
                      {status ? (
                        <>
                          <span className="text-[2rem] font-black leading-none" style={{ color: raffleLimitReached ? "#ef4444" : accentGreen }}>
                            {status.used.raffle}
                            <span className="text-[2rem]" style={{ color: mutedText }}> / {status.limits.raffle}</span>
                          </span>
                          <p className="text-[0.76rem] mt-0.5" style={{ color: mutedText }}>{status.tier} · 월 {status.limits.raffle}장</p>
                        </>
                      ) : (
                        <span className="text-[2rem] font-black" style={{ color: mutedText }}>-</span>
                      )}
                    </div>

                    {/* 援먰솚 踰꾪듉 */}
                    <Button
                      onClick={() => handleBuyRaffle(pkg)}
                      disabled={!canBuy || isBuying}
                      className="w-full h-11 rounded-[12px] text-[0.9rem] font-black mt-4"
                      style={{
                        background: canBuy ? "linear-gradient(135deg, #132850, #2563eb)" : (isDark ? "rgba(88,110,134,0.2)" : "#e2e8f0"),
                        color: canBuy ? "#fff" : mutedText,
                        cursor: canBuy && !isBuying ? "pointer" : "not-allowed",
                      }}
                    >
                      {btnLabel}
                    </Button>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ?? NFT 援먰솚 ?뺤씤 紐⑤떖 */}
      <AnimatePresence>
        {confirmModal && (() => {
          const addrFilled = delivery.recipient.trim() && delivery.phone.trim() && delivery.zipcode.trim() && delivery.address.trim();
          const inputStyle = {
            background: surfaceBg,
            border: surfaceBorder,
            color: neutralText,
            borderRadius: 10,
            padding: "9px 12px",
            fontSize: "0.88rem",
            width: "100%",
            outline: "none",
          } as React.CSSProperties;
          const labelStyle = { fontSize: "0.76rem", fontWeight: 700, color: mutedText, marginBottom: 4, display: "block" } as React.CSSProperties;
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
              onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal(null); }}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="w-full max-w-[460px] rounded-[24px] overflow-hidden overflow-y-auto"
                style={{ background: panelBg, border: panelBorder, boxShadow: "0 24px 56px rgba(0,0,0,0.22)", maxHeight: "90vh" }}>

                {/* ?ㅻ뜑 */}
                <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: isDark ? "rgba(88,110,134,0.2)" : "#e8edf4" }}>
                  <p className="font-black text-[1.05rem]" style={{ color: neutralText }}>교환 신청</p>
                  <button onClick={() => setConfirmModal(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:opacity-70"
                    style={{ background: surfaceBg }}>
                    <X className="w-4 h-4" style={{ color: mutedText }} />
                  </button>
                </div>

                <div className="px-6 py-6 space-y-5">
                  {/* 移대뱶 誘몃━蹂닿린 */}
                  <div className="flex gap-4 items-center rounded-[16px] p-3" style={{ background: surfaceBg, border: surfaceBorder }}>
                    <div className="w-[70px] h-[70px] rounded-[12px] overflow-hidden shrink-0" style={{ background: isDark ? "rgba(88,110,134,0.2)" : "#e8edf4" }}>
                      {confirmModal.image
                        ? <img src={confirmModal.image} alt={confirmModal.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Package className="w-7 h-7" style={{ color: mutedText }} /></div>
                      }
                    </div>
                    <div>
                      <p className="font-black text-[0.95rem]" style={{ color: neutralText }}>{confirmModal.name}</p>
                      <p className="text-[0.73rem] mt-0.5" style={{ color: mutedText }}>{confirmModal.nftId}</p>
                    </div>
                  </div>

                  {/* 諛곗넚吏 ?낅젰 */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="w-4 h-4" style={{ color: accentBlue }} />
                      <p className="font-black text-[0.92rem]" style={{ color: neutralText }}>배송지 입력</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label style={labelStyle}>수령인 <span style={{ color: "#ef4444" }}>*</span></label>
                        <input style={inputStyle} placeholder="홍길동" value={delivery.recipient}
                          onChange={e => setDelivery(p => ({ ...p, recipient: e.target.value }))} />
                      </div>
                      <div>
                        <label style={labelStyle}>연락처 <span style={{ color: "#ef4444" }}>*</span></label>
                        <input style={inputStyle} placeholder="010-0000-0000" value={delivery.phone}
                          onChange={e => setDelivery(p => ({ ...p, phone: e.target.value }))} />
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>우편번호 <span style={{ color: "#ef4444" }}>*</span></label>
                      <input style={inputStyle} placeholder="12345" value={delivery.zipcode}
                        onChange={e => setDelivery(p => ({ ...p, zipcode: e.target.value }))} />
                    </div>

                    <div>
                      <label style={labelStyle}>주소 <span style={{ color: "#ef4444" }}>*</span></label>
                      <input style={inputStyle} placeholder="서울특별시 강남구 테헤란로 123" value={delivery.address}
                        onChange={e => setDelivery(p => ({ ...p, address: e.target.value }))} />
                    </div>

                    <div>
                      <label style={labelStyle}>상세주소</label>
                      <input style={inputStyle} placeholder="아파트 동호수, 층 등" value={delivery.addressDetail}
                        onChange={e => setDelivery(p => ({ ...p, addressDetail: e.target.value }))} />
                    </div>
                  </div>

                  {/* ?덈궡 */}
                  <div className="rounded-[14px] px-4 py-4 space-y-2" style={{ background: isDark ? "rgba(37,99,235,0.08)" : "#eef3ff", border: `1px solid ${isDark ? "rgba(37,99,235,0.2)" : "#c0d0f5"}` }}>
                    {[
                      "교환 신청 후 NFT 카드는 차감되지 않습니다.",
                      "실물 배송은 운영 정책에 따라 별도 처리됩니다.",
                      "현재 toss 브랜치 기능 보존을 위해 화면 확인만 제공합니다.",
                    ].map(notice => (
                      <div key={notice} className="flex items-start gap-2">
                        <span className="text-[0.72rem] font-black mt-0.5" style={{ color: accentBlue }}>배송</span>
                        <p className="text-[0.82rem]" style={{ color: mutedText }}>{notice}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setConfirmModal(null)} className="flex-1 py-3 rounded-[12px] text-[0.9rem] font-bold"
                      style={{ background: surfaceBg, border: surfaceBorder, color: mutedText }}>
                      취소
                    </button>
                    <button
                      onClick={() => handleExchange(confirmModal)}
                      disabled={exchanging || !addrFilled}
                      className="flex-1 py-3 rounded-[12px] text-[0.9rem] font-black text-white transition-opacity"
                      style={{ background: addrFilled ? "linear-gradient(135deg, #2563eb, #10b981)" : (isDark ? "rgba(88,110,134,0.2)" : "#e2e8f0"),
                        color: addrFilled ? "#fff" : mutedText, opacity: exchanging ? 0.7 : 1, cursor: addrFilled && !exchanging ? "pointer" : "not-allowed" }}>
                      {exchanging ? "처리 중..." : "교환 신청"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ?? ?좎뒪??*/}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3.5 rounded-[14px] shadow-xl"
            style={{
              background: toast.type === "success" ? (isDark ? "rgba(16,185,129,0.18)" : "#d1fae5") : (isDark ? "rgba(239,68,68,0.18)" : "#fee2e2"),
              border: `1px solid ${toast.type === "success" ? (isDark ? "rgba(16,185,129,0.35)" : "#a7f3d0") : (isDark ? "rgba(239,68,68,0.35)" : "#fca5a5")}`,
              color: toast.type === "success" ? "#065f46" : "#991b1b",
            }}>
            {toast.type === "success" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            <span className="font-semibold text-[0.9rem]">{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
