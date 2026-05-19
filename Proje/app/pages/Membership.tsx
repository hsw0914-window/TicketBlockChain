import { Award, Check, ChevronLeft, Clock3, CreditCard, Lock, Star, Ticket } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { FaBaseballBall, FaTrophy } from "react-icons/fa";
import { GiBaseballBat, GiBaseballGlove } from "react-icons/gi";

type Tier = {
  name: string;
  point: number;
  condition: string;
  earnRate: string;
  coupon: string;
  mainBenefits: string[];
  color: string;
  bg: string;
  current?: boolean;
  complete?: boolean;
  locked?: boolean;
};

const tiers: Tier[] = [
  { name: "일반", point: 0, condition: "가입 회원", earnRate: "0.5%", coupon: "0장", mainBenefits: ["기본 예매", "기본 포인트 적립"], color: "#6b7280", bg: "#e5e7eb", complete: true },
  { name: "브론즈", point: 3, condition: "시즌 입장 3회 이상", earnRate: "0.7%", coupon: "0장", mainBenefits: ["소액 포인트 보상", "실물 NFT 카드 시즌 1장"], color: "#b45309", bg: "#ffedd5", complete: true },
  { name: "실버", point: 6, condition: "시즌 입장 6회 이상", earnRate: "1.0%", coupon: "1장", mainBenefits: ["인기 경기 우선 응모 가능", "실물 NFT 카드 시즌 2장"], color: "#64748b", bg: "#e2e8f0", current: true },
  { name: "골드", point: 10, condition: "시즌 입장 10회 이상", earnRate: "1.5%", coupon: "3장", mainBenefits: ["우선 응모권 확대", "경기당 최대 2장 투입 가능", "실물 NFT 카드 시즌 3장"], color: "#d97706", bg: "#fef3c7", locked: true },
];


const TIER_BENEFITS: Record<string, { icon: React.ElementType; title: string; desc: string }[]> = {
  일반: [
    { icon: Ticket, title: "기본 예매", desc: "일반 티켓 예매 가능" },
    { icon: Award, title: "포인트 0.5% 적립", desc: "결제 금액 기준" },
  ],
  브론즈: [
    { icon: CreditCard, title: "실물 NFT 카드 시즌 1장", desc: "시즌별 한정 디자인" },
    { icon: Award, title: "포인트 0.7% 적립", desc: "결제 금액 기준" },
  ],
  실버: [
    { icon: Ticket, title: "월 1장 응모권 지급", desc: "티어업 시 자동 발급" },
    { icon: Check, title: "인기 경기 우선 응모", desc: "오픈 30분 전 선예매" },
    { icon: CreditCard, title: "실물 NFT 카드 시즌 2장", desc: "시즌별 한정 디자인" },
    { icon: Award, title: "포인트 1.0% 적립", desc: "결제 금액 기준" },
  ],
  골드: [
    { icon: Ticket, title: "월 3장 응모권 지급", desc: "티어업 시 자동 발급" },
    { icon: Check, title: "우선 응모권 확대", desc: "경기당 최대 2장 투입 가능" },
    { icon: CreditCard, title: "실물 NFT 카드 시즌 3장", desc: "시즌별 한정 디자인" },
    { icon: Award, title: "포인트 1.5% 적립", desc: "결제 금액 기준" },
  ],
};

const tierIconStyles: Record<string, { color: string; filter: string }> = {
  일반: { color: "#6b7280", filter: "drop-shadow(0 1px 1px rgba(55,65,81,0.24))" },
  브론즈: { color: "#b45309", filter: "drop-shadow(0 1px 1px rgba(124,45,18,0.24))" },
  실버: { color: "#64748b", filter: "drop-shadow(0 1px 1px rgba(51,65,85,0.24))" },
  골드: { color: "#d97706", filter: "drop-shadow(0 1px 1px rgba(146,64,14,0.24))" },
};

function TierIcon({ tier }: { tier: Tier }) {
  const iconStyle = tierIconStyles[tier.name] ?? { color: tier.color, filter: "none" };

  if (tier.name === "일반") {
    return <FaBaseballBall className="h-7 w-7 drop-shadow-sm" style={iconStyle} />;
  }

  if (tier.name === "브론즈") {
    return (
      <div className="relative h-8 w-8">
        <GiBaseballBat className="absolute left-0 top-0 h-8 w-8 -rotate-[32deg]" style={iconStyle} />
        <FaBaseballBall className="absolute bottom-0 right-0 h-4 w-4 drop-shadow-sm" style={iconStyle} />
      </div>
    );
  }

  if (tier.name === "골드") {
    return <FaTrophy className="h-7 w-7" style={iconStyle} />;
  }

  return <GiBaseballGlove className="h-8 w-8" style={iconStyle} />;
}

function TierBenefitPopover({ tier }: { tier: Tier }) {
  const status = tier.current ? "현재 등급" : tier.complete ? "달성 완료" : "미달성";
  const statusColor = tier.current ? "#93c5fd" : tier.complete ? "#5ee6b1" : "#cbd5e1";

  return (
    <div className="membership-tier-popover">
      <div className="flex items-center gap-3">
        <span className="h-3.5 w-3.5 rounded-full" style={{ background: tier.color }} />
        <p className="text-[1.15rem] font-black text-white">{tier.name} 등급</p>
      </div>

      <div className="my-4 h-px bg-white/15" />

      <div className="space-y-3 text-[0.92rem]">
        <div className="flex items-center justify-between gap-8">
          <span className="text-[#94a3b8]">달성 조건</span>
          <span className="font-black text-white">{tier.condition}</span>
        </div>
        <div className="flex items-center justify-between gap-8">
          <span className="text-[#94a3b8]">포인트 적립</span>
          <span className="font-black text-white">{tier.earnRate}</span>
        </div>
        <div className="flex items-center justify-between gap-8">
          <span className="text-[#94a3b8]">월 응모권</span>
          <span className="font-black text-white">{tier.coupon}</span>
        </div>
        <div className="flex items-start justify-between gap-8">
          <span className="shrink-0 text-[#94a3b8]">주요 혜택</span>
          <div className="max-w-[13rem] space-y-1 text-right">
            {tier.mainBenefits.map((benefit) => (
              <p key={benefit} className="font-black leading-6 text-white">{benefit}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="my-4 h-px bg-white/15" />

      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor }} />
        <span className="text-[0.92rem] font-black" style={{ color: statusColor }}>{status}</span>
      </div>
    </div>
  );
}

function MembershipBadge({ tier }: { tier: Tier }) {
  const isSilver = tier.name === "실버";
  return (
    <div
      className="group relative flex flex-col items-center gap-3 outline-none"
      tabIndex={0}
      aria-label={`${tier.name} 등급 혜택 보기`}
    >
      <TierBenefitPopover tier={tier} />
      <div className={`relative px-2 pt-2 ${tier.current ? "membership-current-tier" : ""}`}>
        {isSilver && <div className="absolute -inset-5 rounded-full" style={{ background: "radial-gradient(circle, rgba(45,212,191,0.24), transparent 68%)" }} />}
        {tier.current && <div className="membership-current-orbit" />}
        <div
          className="relative z-10 flex h-16 w-16 items-center justify-center"
          style={{
            clipPath: "polygon(50% 3%, 92% 25%, 92% 75%, 50% 97%, 8% 75%, 8% 25%)",
            background: isSilver
              ? "linear-gradient(145deg, #2f6df6, #0f3f91)"
              : tier.name === "골드"
                ? "linear-gradient(145deg, #f59e0b, #b45309)"
                : tier.name === "브론즈"
                  ? "linear-gradient(145deg, #c76c11, #87400a)"
                  : "linear-gradient(145deg, #9ca3af, #4b5563)",
            boxShadow: isSilver ? "0 20px 40px rgba(47,109,246,0.18)" : "0 14px 30px rgba(28,45,74,0.13)",
            opacity: tier.locked ? 0.68 : 1,
          }}
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full border-2"
            style={{
              background: tier.name === "일반"
                ? "linear-gradient(145deg, #ffffff, #e5e7eb)"
                : tier.name === "브론즈"
                  ? "linear-gradient(145deg, #ffc36a, #c46f1f)"
                  : tier.name === "골드"
                    ? "linear-gradient(145deg, #fff7d6, #facc15)"
                    : "linear-gradient(145deg, #f8fafc, #cbd5e1)",
              borderColor: "#f8fafc",
              color: tier.color,
            }}
          >
            <TierIcon tier={tier} />
          </div>
        </div>
        {tier.locked && (
          <div className="absolute right-0 top-0 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#8b95a7] shadow-sm">
            <Lock className="h-3.5 w-3.5 text-white" />
          </div>
        )}
        {tier.complete && (
          <div className="absolute right-0 top-0 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#10b981] shadow-sm">
            <Check className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>
      <div className="text-center">
        <p className="text-[0.82rem] font-bold" style={{ color: isSilver ? "#2563eb" : "#71809a" }}>{tier.point}</p>
        <p className="mt-1 text-[0.86rem] font-bold" style={{ color: isSilver ? "#2563eb" : "#56657d" }}>{tier.name}</p>
      </div>
    </div>
  );
}

const TIER_ORDER_LIST = ['일반', '브론즈', '실버', '골드'];
const TIER_REQUIREMENTS: Record<string, number> = { '일반': 0, '브론즈': 3, '실버': 6, '골드': 10 };

type MembershipInfo = {
  currentTier: string;
  season_count: number;
  nextTier: string | null;
  nextTierCount: number | null;
  canTierUp: boolean;
};

export function Membership() {
  const navigate = useNavigate();
  const [earlyAccessCount, setEarlyAccessCount] = useState<number | null>(null);
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [tierUpLoading, setTierUpLoading] = useState(false);
  const [tierUpMsg, setTierUpMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = () => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/auth/membership`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => { if (d.success) setMembership(d); }).catch(() => {});
    fetch(`${import.meta.env.VITE_API_URL}/api/auth/early-access-count`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => { if (d.success) setEarlyAccessCount(d.count); }).catch(() => {});
  };

  useEffect(() => { fetchData(); }, []);

  async function handleTierUp() {
    setTierUpLoading(true);
    setTierUpMsg(null);
    try {
      if (!window.ethereum) throw new Error("MetaMask가 설치되어 있지 않습니다.");
      const eth = window.ethereum as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
      const accounts = await eth.request({ method: "eth_accounts" }) as string[];
      if (!accounts?.length) throw new Error("MetaMask를 먼저 연결해주세요.");
      const walletAddress = accounts[0];

      // MetaMask 서명 요청
      const message = `BASE CHAIN 티어업 요청\n다음 등급: ${membership?.nextTier}\n지갑: ${walletAddress}\n시각: ${Date.now()}`;
      const signature = await eth.request({
        method: "personal_sign",
        params: [message, walletAddress],
      }) as string;

      const token = localStorage.getItem("auth_token") ?? "";
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/tier-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ walletAddress, signature, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "티어업 실패");
      let successText = data.message;
      if (data.awardedCards?.length > 0) {
        const cardNames = data.awardedCards.map((c: { name: string }) => c.name).join(', ');
        successText += ` (${cardNames})`;
      }
      setTierUpMsg({ type: 'success', text: successText });
      fetchData();
    } catch (err) {
      setTierUpMsg({ type: 'error', text: err instanceof Error ? err.message : "티어업 중 오류가 발생했습니다." });
    } finally {
      setTierUpLoading(false);
    }
  }

  const currentTier = membership?.currentTier ?? '일반';
  const seasonCount = membership?.season_count ?? 0;
  const currentTierIdx = TIER_ORDER_LIST.indexOf(currentTier);
  const currentTierMin = TIER_REQUIREMENTS[currentTier] ?? 0;
  const nextTierCount = membership?.nextTierCount ?? null;
  const progressPct = membership?.nextTier && nextTierCount
    ? Math.min(100, Math.round(((seasonCount - currentTierMin) / (nextTierCount - currentTierMin)) * 100))
    : 100;

  const dynamicTiers = tiers.map((t, i) => ({
    ...t,
    current: t.name === currentTier,
    complete: i < currentTierIdx,
    locked: i > currentTierIdx,
  }));

  const stats = [
    { icon: Clock3, label: "시즌 입장 횟수", value: String(seasonCount), unit: "회" },
    { icon: Star, label: "누적 포인트", value: "1,240", unit: "P" },
    { icon: Ticket, label: "이번달 응모권", value: earlyAccessCount !== null ? String(earlyAccessCount) : "-", unit: "장" },
  ];

  return (
    <div className="page-shell max-w-[1040px] space-y-8">
      <Link to="/mypage" className="inline-flex items-center gap-2 text-[0.9rem] font-semibold" style={{ color: "#4d5f78" }}>
        <ChevronLeft className="h-4 w-4" />
        마이페이지로 돌아가기
      </Link>

      <header className="space-y-3">
        <p className="text-[0.86rem] font-extrabold uppercase tracking-[0.22em]" style={{ color: "#2563eb" }}>Membership</p>
        <h1 className="text-[2.35rem] font-black leading-tight tracking-[-0.04em]" style={{ color: "#1f3248" }}>멤버십</h1>
        <p className="text-[0.98rem]" style={{ color: "#8a98b0" }}>시즌 입장 기록에 따라 자동으로 등급이 갱신됩니다</p>
      </header>

      <section className="flex items-center gap-4">
        <span className="h-2 w-2 rounded-full bg-[#2563eb]" />
        <p className="text-[0.86rem] font-extrabold uppercase tracking-[0.22em]" style={{ color: "#4c5d78" }}>Membership Detail</p>
        <div className="h-px flex-1 bg-[#dbe4f0]" />
      </section>

      <section
        className="rounded-[24px] border px-9 py-9"
        style={{
          background: "#ffffff",
          borderColor: "#dce5f2",
          boxShadow: "inset 0 4px 0 #2563eb, inset -5px 0 0 #2dd4bf, 0 22px 46px rgba(31,50,72,0.06)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h2 className="text-[1.4rem] font-black" style={{ color: "#1f3248" }}>나의 등급 현황</h2>
            <p className="mt-2 text-[0.9rem]" style={{ color: "#98a5ba" }}>시즌 입장 기록을 기반으로 다음 등급까지의 진행도를 안내합니다.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[0.78rem] font-extrabold" style={{ background: "#eaf1ff", borderColor: "#c9d8ff", color: "#2563eb" }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#2563eb]" />
            {currentTier} · {currentTier.toUpperCase()}
          </span>
        </div>

        <div className="my-8 border-t border-dashed border-[#d7e0ee]" />

        <div className="rounded-[20px] border px-10 py-9" style={{ background: "linear-gradient(135deg, #f4f8ff 0%, #eefcf6 100%)", borderColor: "#d8e3ef" }}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[0.78rem] font-extrabold uppercase tracking-[0.2em]" style={{ color: "#2563eb" }}>My Points</p>
              <p className="mt-2 text-[2.6rem] font-black leading-none" style={{ color: "#20355b" }}>{seasonCount}<span className="ml-1 text-[0.95rem] font-bold">회 입장</span></p>
            </div>
            <div className="text-right text-[0.9rem] font-semibold" style={{ color: "#61708a" }}>
              {membership?.nextTier ? (
                <>
                  <p>다음 등급 <span className="font-black" style={{ color: "#1f3248" }}>{membership.nextTier}</span>까지</p>
                  <p className="mt-1"><span className="font-black" style={{ color: "#10b981" }}>{Math.max(0, (membership.nextTierCount ?? 0) - seasonCount)}회</span> 입장 남음</p>
                </>
              ) : (
                <p className="font-black" style={{ color: "#10b981" }}>최고 등급 달성!</p>
              )}
            </div>
          </div>

          <div className="mt-12">
            <div className="h-3 overflow-hidden rounded-full bg-[#dbe4f0]">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #2f6df6, #14b8a6)" }} />
            </div>
            <div className="mt-8 grid grid-cols-4 gap-4">
              {dynamicTiers.map((tier) => <MembershipBadge key={tier.name} tier={tier} />)}
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {stats.map((item) => {
            const Icon = item.icon;
            const isRaffle = item.label === "이번달 응모권";
            const hasTicket = isRaffle && earlyAccessCount !== null && earlyAccessCount > 0;
            return (
              <div key={item.label} className="rounded-[16px] border px-5 py-5 flex flex-col justify-between" style={{ borderColor: "#dce5f2", background: "#fff" }}>
                <div>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color: "#2563eb" }} />
                    <p className="text-[0.82rem]" style={{ color: "#8391a9" }}>{item.label}</p>
                  </div>
                  <p className="mt-3 text-[1.55rem] font-black" style={{ color: "#20355b" }}>{item.value}<span className="ml-1 text-[0.85rem] font-bold" style={{ color: "#7c8aa1" }}>{item.unit}</span></p>
                </div>
                {isRaffle && (
                  <button
                    disabled={!hasTicket}
                    onClick={() => navigate("/mypage/raffle")}
                    className="mt-4 w-full rounded-[10px] py-2 text-[0.82rem] font-black transition-all"
                    style={{
                      background: hasTicket ? "linear-gradient(135deg, #2563eb, #10b981)" : "#e2e8f0",
                      color: hasTicket ? "#fff" : "#94a3b8",
                      cursor: hasTicket ? "pointer" : "not-allowed",
                    }}
                  >
                    응모권으로 추첨하기
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 티어업 버튼 */}
        {membership && (
          <div className="mt-6 rounded-[18px] border px-6 py-5" style={{
            borderColor: !membership.nextTier ? "#f59e0b44" : membership.canTierUp ? "#a7d7c0" : "#dce5f2",
            background: !membership.nextTier ? "#fffbeb" : membership.canTierUp ? "#f0faf4" : "#f8fafc",
          }}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-black text-[1rem]" style={{ color: !membership.nextTier ? "#92400e" : membership.canTierUp ? "#1a5c3e" : "#4a5568" }}>
                  {!membership.nextTier
                    ? "최고 등급 달성!"
                    : membership.canTierUp
                      ? `${membership.nextTier} 티어업 가능!`
                      : `${membership.nextTier} 티어까지 ${Math.max(0, (membership.nextTierCount ?? 0) - seasonCount)}회 남았습니다`}
                </p>
                <p className="mt-1 text-[0.82rem]" style={{ color: !membership.nextTier ? "#b45309" : membership.canTierUp ? "#3a7a5a" : "#8a9aac" }}>
                  {!membership.nextTier
                    ? "골드 등급의 모든 혜택을 누리고 있습니다"
                    : membership.canTierUp
                      ? membership.nextTier === '브론즈' ? '실물 NFT 카드 1장이 지급됩니다'
                          : membership.nextTier === '실버' ? '실물 NFT 카드 2장 + 응모권 1장이 지급됩니다'
                          : membership.nextTier === '골드' ? '실물 NFT 카드 3장 + 응모권 3장이 지급됩니다'
                          : '등급이 상승합니다'
                      : `조건: 시즌 입장 ${membership.nextTierCount}회`}
                </p>
              </div>
              <button
                onClick={handleTierUp}
                disabled={!membership.nextTier || !membership.canTierUp || tierUpLoading}
                className="rounded-[12px] px-6 py-3 text-[0.9rem] font-black transition-all"
                style={{
                  background: membership.nextTier && membership.canTierUp ? "linear-gradient(135deg, #10b981, #2563eb)" : "#e2e8f0",
                  color: membership.nextTier && membership.canTierUp ? "#fff" : "#94a3b8",
                  cursor: membership.nextTier && membership.canTierUp && !tierUpLoading ? "pointer" : "not-allowed",
                  opacity: tierUpLoading ? 0.7 : 1,
                }}
              >
                {tierUpLoading ? "처리 중..." : "티어업"}
              </button>
            </div>
            {tierUpMsg && (
              <div
                className="mt-4 rounded-[10px] px-4 py-3 text-[0.83rem] font-semibold"
                style={{
                  background: tierUpMsg.type === 'success' ? "#d1fae5" : "#fee2e2",
                  color: tierUpMsg.type === 'success' ? "#065f46" : "#991b1b",
                }}
              >
                {tierUpMsg.text}
              </div>
            )}
          </div>
        )}

        <section className="mt-8">
          <div className="mb-5 flex items-center gap-4">
            <span className="h-2 w-2 rounded-full bg-[#10b981]" />
            <p className="text-[0.86rem] font-extrabold uppercase tracking-[0.22em]" style={{ color: "#4c5d78" }}>Tier Overview</p>
            <div className="h-px flex-1 bg-[#dbe4f0]" />
          </div>
          <div className="overflow-hidden rounded-[16px] border" style={{ borderColor: "#dce5f2" }}>
            <div className="grid grid-cols-[1fr_1.8fr_0.8fr_0.8fr_2.3fr] bg-[#f5f7fb] px-6 py-4 text-[0.78rem] font-bold" style={{ color: "#8a98b0" }}>
              <span>등급</span><span>조건</span><span>적립률</span><span>월 응모권</span><span>주요 혜택</span>
            </div>
            {dynamicTiers.map((tier) => (
              <div
                key={tier.name}
                className="grid grid-cols-[1fr_1.8fr_0.8fr_0.8fr_2.3fr] items-center gap-3 border-t px-6 py-5 text-[0.9rem]"
                style={{
                  borderColor: "#dce5f2",
                  background: tier.current ? "linear-gradient(90deg, #eef4ff 0%, #f7fbff 100%)" : "#fff",
                  boxShadow: tier.current ? "inset 4px 0 0 #2563eb, inset 7px 0 0 #2dd4bf" : "none",
                  color: "#465773",
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[0.76rem] font-extrabold" style={{ background: tier.bg, color: tier.color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: tier.color }} />
                    {tier.name}
                  </span>
                  {tier.current && <span className="rounded-full px-3 py-1 text-[0.68rem] font-black text-white" style={{ background: "linear-gradient(90deg, #2563eb, #14b8a6)" }}>YOU</span>}
                </span>
                <span>{tier.condition}</span>
                <span className="font-black" style={{ color: "#20355b" }}>{tier.earnRate}</span>
                <span className="font-black" style={{ color: tier.current || tier.name === "골드" ? "#20355b" : "#8795ad" }}>{tier.coupon}</span>
                <span className="space-y-1 leading-6" style={{ color: "#465773" }}>
                  {tier.mainBenefits.map((benefit) => (
                    <span key={benefit} className="block">{benefit}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-5 flex items-center gap-4">
            <span className="h-2 w-2 rounded-full bg-[#2563eb]" />
            <p className="text-[0.86rem] font-extrabold uppercase tracking-[0.22em]" style={{ color: "#4c5d78" }}>My {currentTier} Benefits</p>
            <div className="h-px flex-1 bg-[#dbe4f0]" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(TIER_BENEFITS[currentTier] ?? TIER_BENEFITS['일반']).map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div key={benefit.title} className="flex items-center gap-5 rounded-[16px] border px-6 py-5" style={{ borderColor: "#dce5f2", background: "#fff" }}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-[12px]" style={{ background: "#edf7fb" }}>
                    <Icon className="h-5 w-5" style={{ color: "#2563eb" }} />
                  </div>
                  <div>
                    <p className="font-black" style={{ color: "#223657" }}>{benefit.title}</p>
                    <p className="mt-1 text-[0.82rem]" style={{ color: "#8a98b0" }}>{benefit.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <p className="mt-8 text-center text-[0.84rem]" style={{ color: "#9aa7ba" }}>등급은 매 시즌 종료 시 자동 갱신되며, 입장 기록은 온체인에 영구 기록됩니다.</p>
      </section>
    </div>
  );
}
