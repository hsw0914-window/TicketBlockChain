import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { motion } from "motion/react";
import {
  ArrowRight,
  Package,
  Search,
  ShoppingCart,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useAppSettings } from "../context/AppSettingsContext";
import { loadTossPayments, ANONYMOUS } from "@tosspayments/tosspayments-sdk";
import { signListingMessage } from "../lib/contract";

// ─── API 설정 ─────────────────────────────────────────────────
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

const API_HEADERS = (_walletAddress?: string | null) => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${localStorage.getItem("auth_token") ?? ""}`,
});

async function parseApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    if (isJson && payload && typeof payload === "object" && "error" in payload) {
      throw new Error(String((payload as { error?: string }).error ?? "요청 처리 중 오류가 발생했습니다."));
    }
    if (typeof payload === "string" && payload.includes("<!DOCTYPE")) {
      throw new Error("장터 서버 응답을 받지 못했습니다. 백엔드가 실행 중인지 확인해주세요.");
    }
    throw new Error(typeof payload === "string" && payload.trim().length > 0 ? payload : "요청 처리 중 오류가 발생했습니다.");
  }

  if (!isJson) {
    throw new Error("장터 서버가 올바른 JSON 응답을 보내지 않았습니다.");
  }

  return payload as T;
}

type ListingSort = "price_asc" | "latest" | "quantity";

type MarketListing = {
  id: string;
  sellerName: string;
  sellerHandle: string;
  quantity: number;
  price: number;
  postedAt: string;
};

type FragmentMarket = {
  id: string;
  idol: string;
  fragmentName: string;
  resultName?: string | null;
  color: string;
  accent: string;
  imageUrl: string | null;
  owned: number;
  floorPrice: number;
  lastPrice: number;
  changeRate: number;
  volume24h: number;
  demandScore: number;
  listedCount: number;
  description: string;
  chart: { time: string; price: number }[];
  trades: {
    time: string;
    type: "상승 체결" | "하락 체결" | "신규 등록";
    price: number;
    volume: number;
    buyer: string;
  }[];
  listings: MarketListing[];
  myListings: MarketListing[];
};

type SaleHistoryItem = {
  id: number;
  fragmentId: string;
  idol: string;
  fragmentName: string;
  buyerWalletAddress: string | null;
  sellerWalletAddress: string | null;
  tokenId: string | null;
  txHash: string | null;
  price: number;
  quantity: number;
  platformFee: number;
  settlementAmount: number;
  tradedAt: string;
};

const filterOptions = ["전체", "보유 중"];
const KBO_TEAMS = ["LG", "두산", "KIA", "삼성", "SSG", "롯데", "NC", "키움", "한화", "KT"];

function getMarketViewerHandle() {
  return localStorage.getItem("nickname") ?? "unknown";
}

function formatPrice(price: number) {
  return `${price.toLocaleString()}원`;
}

function getFragmentResultName(fragment: Pick<FragmentMarket, "fragmentName" | "resultName">) {
  return fragment.resultName ?? fragment.fragmentName.replace(/\s*파편$/, "");
}

function parsePostedAtScore(postedAt: string) {
  if (postedAt.includes("방금")) return 0;
  const minuteMatch = postedAt.match(/(\d+)분/);
  if (minuteMatch) return Number(minuteMatch[1]);
  const hourMatch = postedAt.match(/(\d+)시간/);
  if (hourMatch) return Number(hourMatch[1]) * 60;
  return 999;
}

function isFreshListing(postedAt: string) {
  return parsePostedAtScore(postedAt) <= 2;
}

function shortWallet(address: string | null | undefined) {
  if (!address) return "알 수 없음";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Market() {
  const [searchParams] = useSearchParams();
  const viewerHandle = getMarketViewerHandle();
  const { walletAddress } = useAppSettings();

  const [marketState, setMarketState] = useState<FragmentMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"market" | "sell">("market");
  const [marketViewMode, setMarketViewMode] = useState<"browse" | "detail">("browse");
  const [activeFilter, setActiveFilter] = useState("전체");
  const [query, setQuery] = useState("");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [listingSort, setListingSort] = useState<ListingSort>("price_asc");
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState(0);
  const [sellQuantity, setSellQuantity] = useState(2);
  const [listedTarget, setListedTarget] = useState<string | null>(null);
  const [purchaseReceipt, setPurchaseReceipt] = useState<{ fragmentId: string; sellerName: string; price: number } | null>(null);
  const [soldOutNotice, setSoldOutNotice] = useState<{ fragmentId: string; sellerName: string; price: number } | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [salesHistory, setSalesHistory] = useState<SaleHistoryItem[]>([]);

  const [showBuyModal, setShowBuyModal]           = useState(false);
  const [tossBuyWidgets, setTossBuyWidgets]       = useState<any>(null);
  const [tossBuyWidgetReady, setTossBuyWidgetReady] = useState(false);
  const [tossBuyError, setTossBuyError]           = useState("");
  const tossBuyListingRef = useRef<MarketListing | null>(null);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/market/fragments"), { headers: API_HEADERS(walletAddress) });
      const data = await parseApiResponse<FragmentMarket[]>(res);
      setMarketState(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
        setSellPrice(data[0].floorPrice + 1200);
      }
      setApiError(null);
    } catch {
      setApiError("장터 데이터를 불러오지 못했습니다.");
    }
  }, [selectedId, walletAddress]);

  const fetchSalesHistory = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/market/sales"), { headers: API_HEADERS(walletAddress) });
      const data = await parseApiResponse<SaleHistoryItem[]>(res);
      setSalesHistory(data);
    } catch {
      setSalesHistory([]);
    }
  }, [walletAddress]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchMarket(), fetchSalesHistory()]).finally(() => setLoading(false));
  }, [fetchMarket, fetchSalesHistory]);

  const EMPTY_FRAGMENT: FragmentMarket = {
    id: "", idol: "", fragmentName: "", color: "#888", accent: "#888",
    imageUrl: null, owned: 0, floorPrice: 0, lastPrice: 0, changeRate: 0, volume24h: 0,
    demandScore: 0, listedCount: 0, description: "", chart: [], trades: [], listings: [], myListings: [],
  };

  const selectedFragment = marketState.find((f) => f.id === selectedId) ?? marketState[0] ?? EMPTY_FRAGMENT;
  const selectedFragmentListings = useMemo(() => [...(selectedFragment.listings ?? [])], [selectedFragment]);
  const selectedFragmentResultName = getFragmentResultName(selectedFragment);

  useEffect(() => {
    const requestedFragmentId = searchParams.get("fragment");
    if (!requestedFragmentId) return;
    const requestedFragment = marketState.find((f) => f.id === requestedFragmentId);
    if (!requestedFragment) return;
    setSelectedId(requestedFragment.id);
    setActiveTab(searchParams.get("action") === "sell" ? "sell" : "market");
    setMarketViewMode("detail");
    setActiveFilter("전체");
    setQuery("");
    setSellPrice(requestedFragment.floorPrice + 1200);
    setSellQuantity(Math.min(2, Math.max(requestedFragment.owned, 1)));
  }, [marketState, searchParams]);

  useEffect(() => {
    if (activeTab === "sell") return;
    if (searchParams.get("fragment")) return;
    setMarketViewMode("browse");
  }, [activeTab, searchParams]);

  useEffect(() => {
    const requestedFragmentId = searchParams.get("fragment");
    const requestedSellerHandle = searchParams.get("sellerHandle");
    const requestedPrice = Number(searchParams.get("price"));
    const defaultListingId =
      selectedFragmentListings.find((l) => l.sellerHandle !== viewerHandle)?.id ??
      selectedFragmentListings[0]?.id ?? null;

    if (requestedFragmentId === selectedFragment.id) {
      const matchedListing = selectedFragmentListings.find(
        (l) =>
          (!requestedSellerHandle || l.sellerHandle === requestedSellerHandle) &&
          (!Number.isFinite(requestedPrice) || requestedPrice <= 0 || l.price === requestedPrice),
      );
      setSelectedListingId(matchedListing?.id ?? defaultListingId);
      return;
    }
    setSelectedListingId(defaultListingId);
  }, [searchParams, selectedFragment.id, selectedFragmentListings, viewerHandle]);

  const getOwnedCount = (fragment: FragmentMarket) => Math.max(fragment.owned, 0);

  const filteredFragments = useMemo(() => {
    return marketState.filter((fragment) => {
      const matchesQuery =
        query.trim().length === 0 ||
        fragment.idol.toLowerCase().includes(query.toLowerCase()) ||
        fragment.fragmentName.toLowerCase().includes(query.toLowerCase()) ||
        getFragmentResultName(fragment).toLowerCase().includes(query.toLowerCase()) ||
        fragment.description.toLowerCase().includes(query.toLowerCase());
      const matchesFilter = activeFilter === "전체" || (activeFilter === "보유 중" && getOwnedCount(fragment) > 0);
      const matchesTeam = selectedTeams.length === 0 || selectedTeams.includes(fragment.idol);
      return matchesQuery && matchesFilter && matchesTeam;
    });
  }, [activeFilter, marketState, query, selectedTeams]);

  const ownedFragments = useMemo(() => marketState.filter((f) => getOwnedCount(f) > 0), [marketState]);
  const sellableFragments = useMemo(() => filteredFragments.filter((f) => getOwnedCount(f) > 0), [filteredFragments]);

  const resetCategoryFilters = () => { setSelectedTeams([]); setActiveFilter("전체"); setQuery(""); };
  const toggleTeam = (team: string) => setSelectedTeams((prev) => prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]);

  const registrationFee = 300;
  const saleFee = Math.round(sellPrice * sellQuantity * 0.05);
  const expectedSettlement = sellPrice * sellQuantity - registrationFee - saleFee;

  const visibleFragmentListings = useMemo(() => {
    return [...selectedFragmentListings].sort((left, right) => {
      if (listingSort === "latest") return parsePostedAtScore(left.postedAt) - parsePostedAtScore(right.postedAt);
      if (listingSort === "quantity") return right.quantity - left.quantity || left.price - right.price;
      return left.price - right.price;
    });
  }, [listingSort, selectedFragmentListings]);

  const openMarketDetail = (fragment: FragmentMarket) => {
    setSelectedId(fragment.id);
    setSellPrice(fragment.floorPrice + 1200);
    setSellQuantity(Math.min(2, Math.max(getOwnedCount(fragment), 1)));
    setMarketViewMode("detail");
  };

  const selectedListing =
    visibleFragmentListings.find((l) => l.id === selectedListingId) ??
    visibleFragmentListings.find((l) => l.sellerHandle !== viewerHandle) ??
    visibleFragmentListings[0] ?? null;
  const quickBuyListings = visibleFragmentListings.slice(0, 3);

  useEffect(() => {
    const defaultListingId =
      visibleFragmentListings.find((l) => l.sellerHandle !== viewerHandle)?.id ??
      visibleFragmentListings[0]?.id ?? null;
    if (!selectedListingId && defaultListingId) { setSelectedListingId(defaultListingId); return; }
    if (selectedListingId && !visibleFragmentListings.some((l) => l.id === selectedListingId)) setSelectedListingId(defaultListingId);
  }, [selectedListingId, viewerHandle, visibleFragmentListings]);

  useEffect(() => {
    if (!showBuyModal || !tossBuyListingRef.current) return;
    setTossBuyWidgetReady(false);
    setTossBuyWidgets(null);
    setTossBuyError("");
    let cancelled = false;
    (async () => {
      try {
        const tossPayments = await loadTossPayments(import.meta.env.VITE_TOSS_CLIENT_KEY as string);
        const widgets = tossPayments.widgets({ customerKey: ANONYMOUS });
        await widgets.setAmount({ value: tossBuyListingRef.current!.price, currency: "KRW" });
        await widgets.renderPaymentMethods({ selector: "#toss-market-payment-widget", variantKey: "DEFAULT" });
        await widgets.renderAgreement({ selector: "#toss-market-agreement-widget", variantKey: "AGREEMENT" });
        if (!cancelled) { setTossBuyWidgets(widgets); setTossBuyWidgetReady(true); }
      } catch {
        if (!cancelled) setTossBuyError("결제 위젯 초기화에 실패했습니다.");
      }
    })();
    return () => { cancelled = true; };
  }, [showBuyModal]);

  const handleOpenBuyModal = () => {
    if (!selectedListing || selectedListing.sellerHandle === viewerHandle) return;
    tossBuyListingRef.current = selectedListing;
    setShowBuyModal(true);
  };

  const handleTossBuy = async () => {
    if (!tossBuyWidgets || !tossBuyListingRef.current) return;
    setIsPurchasing(true);
    const listing = tossBuyListingRef.current;
    const orderId = `fr-${crypto.randomUUID()}`;
    sessionStorage.setItem(`toss_fragment_${orderId}`, JSON.stringify({
      listingId:    listing.id,
      fragmentName: selectedFragment.fragmentName,
      sellerName:   listing.sellerName,
      price:        listing.price,
    }));
    try {
      await tossBuyWidgets.requestPayment({
        orderId,
        orderName: `${selectedFragment.fragmentName} 파편 구매`,
        successUrl: `${window.location.origin}/market/fragment/buy/success`,
        failUrl:    `${window.location.origin}/market`,
      });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code !== "USER_CANCEL") setTossBuyError(e.message ?? "결제 오류가 발생했습니다.");
      setIsPurchasing(false);
    }
  };

  const handleCreateListing = async () => {
    const sellableCount = Math.max(Math.min(sellQuantity, getOwnedCount(selectedFragment)), 0);
    if (sellableCount <= 0) return;
    if (!walletAddress) {
      alert("MetaMask 지갑을 연결해주세요.");
      return;
    }
    let listingMessage: string;
    let listingSignature: string;
    try {
      listingMessage = `Listing fragment ${selectedFragment.id} quantity ${sellableCount} price ${sellPrice} KRW at ${Date.now()}`;
      listingSignature = await signListingMessage(listingMessage, walletAddress);
    } catch (err) {
      alert(err instanceof Error ? err.message : "MetaMask 서명에 실패했습니다.");
      return;
    }
    try {
      const res = await fetch(apiUrl("/api/market/listings"), {
        method: "POST",
        headers: API_HEADERS(walletAddress),
        body: JSON.stringify({ fragmentId: selectedFragment.id, price: sellPrice, quantity: sellableCount, listingMessage, listingSignature }),
      });
      const data = await parseApiResponse<{ updatedFragment?: FragmentMarket; listingId?: string }>(res);
      if (data.updatedFragment) {
        setMarketState((prev) => prev.map((f) => f.id === data.updatedFragment!.id ? data.updatedFragment! : f));
        setSellPrice(data.updatedFragment.floorPrice);
        const remainingOwned = Math.max(data.updatedFragment.owned ?? 0, 0);
        setSellQuantity(remainingOwned > 0 ? Math.min(remainingOwned, 2) : 1);
      }
      if (data.listingId) setSelectedListingId(data.listingId);
      setListedTarget(selectedFragment.id);
      fetchSalesHistory();
      // 등록 후 파편 장터 탭 + 상세 뷰로 자동 전환
      setActiveTab("market");
      setMarketViewMode("detail");
    } catch (err) {
      alert(err instanceof Error ? err.message : "판매 등록 중 오류가 발생했습니다.");
    }
  };

  const applySuggestedSellPrice = (mode: "floor" | "undercut" | "last") => {
    if (mode === "floor") { setSellPrice(selectedFragment.floorPrice); return; }
    if (mode === "undercut") { setSellPrice(Math.max(selectedFragment.floorPrice - 100, 1000)); return; }
    setSellPrice(selectedFragment.lastPrice);
  };

  const handleCancelListing = async (listingId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/market/listings/${listingId}`), { method: "DELETE", headers: API_HEADERS(walletAddress) });
      const data = await parseApiResponse<{ updatedFragment?: FragmentMarket }>(res);
      if (data.updatedFragment) setMarketState((prev) => prev.map((f) => f.id === data.updatedFragment!.id ? data.updatedFragment! : f));
      setSelectedListingId((current) => (current === listingId ? null : current));
      fetchSalesHistory();
    } catch (err) {
      alert(err instanceof Error ? err.message : "매물 취소 중 오류가 발생했습니다.");
    }
  };

  const handleAdjustListingPrice = async (listingId: string, delta: number) => {
    const listing = selectedFragment.myListings.find((l) => l.id === listingId);
    if (!listing) return;
    const newPrice = Math.max(listing.price + delta, 1000);
    try {
      const res = await fetch(apiUrl(`/api/market/listings/${listingId}`), {
        method: "PATCH",
        headers: API_HEADERS(walletAddress),
        body: JSON.stringify({ price: newPrice }),
      });
      const data = await parseApiResponse<{ updatedFragment?: FragmentMarket }>(res);
      if (data.updatedFragment) setMarketState((prev) => prev.map((f) => f.id === data.updatedFragment!.id ? data.updatedFragment! : f));
      fetchSalesHistory();
    } catch (err) {
      alert(err instanceof Error ? err.message : "가격 수정 중 오류가 발생했습니다.");
    }
  };

  const selectedViewerListings = useMemo(() => [...(selectedFragment.myListings ?? [])].sort((a, b) => a.price - b.price), [selectedFragment.myListings]);
  const totalViewerListingCount = useMemo(() => marketState.reduce((sum, f) => sum + (f.myListings?.length ?? 0), 0), [marketState]);
  const totalViewerListingQuantity = useMemo(() => marketState.reduce((sum, f) => sum + (f.myListings ?? []).reduce((q, l) => q + l.quantity, 0), 0), [marketState]);
  const selectedListingVsFloor = selectedListing ? selectedListing.price - selectedFragment.floorPrice : null;
  const totalSalesSettlement = useMemo(() => salesHistory.reduce((sum, s) => sum + Number(s.settlementAmount ?? 0), 0), [salesHistory]);
  const totalSalesCount = useMemo(() => salesHistory.reduce((sum, s) => sum + Number(s.quantity ?? 0), 0), [salesHistory]);
  const recentSales = useMemo(() => salesHistory.slice(0, 3), [salesHistory]);

  const panelStyle = { background: "#f8fafc", border: "1px solid #d6dee8", boxShadow: "0 10px 24px rgba(17, 40, 73, 0.05)" };
  const mutedPanelStyle = { background: "#eef2f5", border: "1px solid #dde4ec" };
  const inputStyle = { border: "1px solid #cbd5e1", background: "#fcfdfe", color: "#1f2f47" };
  const neutralText = "#1c2f4a";
  const mutedText = "#728195";
  const lineColor = "#d6dee7";
  const actionBlue = "#4b6581";
  const priceGreen = "#547b63";
  const subtleSurface = "#f2f5f8";
  const accentSurface = "#e9eef4";
  const accentBorder = "#c6d2df";
  const showSelectedFragmentSummary = activeTab === "market" && marketViewMode === "detail";

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full mx-auto" />
          <p style={{ color: "#728195" }}>장터 데이터 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (apiError || marketState.length === 0) {
    return (
      <div className="w-full flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <p style={{ color: "#d45555" }}>{apiError ?? "장터 데이터가 없습니다."}</p>
          <Button onClick={() => { setLoading(true); fetchMarket().finally(() => setLoading(false)); }} style={{ background: "#446f9f", color: "#fff" }}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <section className="border-b" style={{ borderColor: lineColor, background: "radial-gradient(circle at top left, rgba(83,111,141,0.08), transparent 28%), linear-gradient(180deg, #eef2f5 0%, #e9eef2 100%)" }}>
        <div className="page-strip-wide pt-8 pb-7">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="grid xl:grid-cols-[minmax(0,1.1fr)_360px] gap-6 items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="page-eyebrow" style={{ color: "#1456a0" }}>Fragment Market</span>
                <span className="rounded-full px-3 py-1 text-[0.72rem] font-semibold" style={{ background: "#edf7f1", border: "1px solid #cbe1d3", color: priceGreen }}>판매자별 등록가 비교</span>
              </div>
              <h1 className="page-title mb-2" style={{ color: neutralText }}>파편 장터</h1>
              <p className="page-subtitle max-w-3xl" style={{ color: mutedText }}>굿즈 파편 매물을 확인하고, 조합에 필요한 파편을 사고팔 수 있어요.</p>
              {showSelectedFragmentSummary ? (
                <div className="grid sm:grid-cols-4 gap-3 mt-6">
                  {[
                    { label: "선택 파편", value: selectedFragment.fragmentName, tone: neutralText },
                    { label: "현재 최저가", value: formatPrice(selectedFragment.floorPrice), tone: priceGreen },
                    { label: "판매자 수", value: `${selectedFragmentListings.length}명`, tone: actionBlue },
                    { label: "내 보유 수량", value: `${getOwnedCount(selectedFragment)}개`, tone: neutralText },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[18px] px-4 py-4" style={mutedPanelStyle}>
                      <p className="market-stat-label mb-2" style={{ color: mutedText }}>{item.label}</p>
                      <p className="text-[1.02rem] font-bold tracking-[-0.03em] truncate" style={{ color: item.tone }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-6 text-[0.95rem] leading-7" style={{ color: mutedText }}>파편을 선택하면 보유 수량과 판매 매물을 바로 확인할 수 있어요.</p>
              )}
            </div>

            {showSelectedFragmentSummary ? (
              <div className="rounded-[24px] p-5" style={panelStyle}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="market-eyebrow mb-2" style={{ color: mutedText }}>선택된 파편</p>
                    <h2 className="text-[1.45rem] font-bold tracking-[-0.04em]" style={{ color: neutralText }}>{selectedFragment.fragmentName}</h2>
                    <p className="mt-2 text-[0.92rem]" style={{ color: mutedText }}>{selectedFragment.description}</p>
                    <p className="mt-2 text-[0.82rem] font-semibold" style={{ color: actionBlue }}>조합 결과 · {selectedFragmentResultName}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-5">
                  {[
                    { label: "최근 체결가", value: formatPrice(selectedFragment.lastPrice) },
                    { label: "현재 판매자 수", value: `${selectedFragmentListings.length}명` },
                    { label: "내 보유 수량", value: `${getOwnedCount(selectedFragment)}개` },
                    { label: "구매 안내", value: "가장 낮은 가격 매물을 고르면 바로 구매할 수 있어요." },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[18px] px-4 py-4" style={mutedPanelStyle}>
                      <p className="market-stat-label mb-1.5" style={{ color: mutedText }}>{item.label}</p>
                      <p className="text-[1.12rem] font-bold" style={{ color: neutralText }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </motion.div>

          <div className="flex flex-wrap gap-3 mt-6">
            {[{ key: "market", label: "파편 장터", icon: ShoppingCart }, { key: "sell", label: "내 파편 판매", icon: Package }].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => { const nextTab = tab.key as "market" | "sell"; setActiveTab(nextTab); if (nextTab === "market") { fetchMarket(); if (!searchParams.get("fragment")) setMarketViewMode("browse"); } }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[14px] text-sm font-semibold transition-all"
                  style={{ background: active ? accentSurface : "#f9fbfc", border: active ? `1px solid ${accentBorder}` : `1px solid ${lineColor}`, color: active ? actionBlue : mutedText }}>
                  <Icon className="w-4 h-4" />{tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="page-strip-wide py-8">
        {activeTab === "market" ? (
          marketViewMode === "browse" ? (
            <div className="flex gap-6 items-start">
              <aside className="w-[220px] shrink-0 sticky top-6 space-y-4">
                <div className="rounded-[18px] p-4" style={panelStyle}>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: mutedText }} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="파편 검색" className="w-full rounded-[12px] pl-8 pr-3 py-2.5 text-[0.82rem] outline-none" style={inputStyle} />
                  </div>
                </div>

                <div className="rounded-[18px] p-4" style={panelStyle}>
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: mutedText }}>보기 방식</p>
                  {filterOptions.map((filter) => (
                    <label key={filter} className="flex items-center gap-2.5 cursor-pointer py-1.5">
                      <input type="radio" name="filter" checked={activeFilter === filter} onChange={() => setActiveFilter(filter)} className="accent-[#4b6581] w-4 h-4" />
                      <span className="text-[0.84rem] font-medium" style={{ color: activeFilter === filter ? neutralText : mutedText }}>{filter}</span>
                    </label>
                  ))}
                </div>

                <div className="rounded-[18px] p-4" style={panelStyle}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em]" style={{ color: mutedText }}>구단</p>
                    {selectedTeams.length > 0 && <button onClick={() => setSelectedTeams([])} className="text-[0.68rem] font-semibold" style={{ color: actionBlue }}>초기화</button>}
                  </div>
                  <div className="space-y-0.5">
                    {KBO_TEAMS.map((team) => (
                      <label key={team} className="flex items-center gap-2.5 cursor-pointer py-1.5 rounded-[10px] px-2 transition-colors hover:bg-[#eef2f5]">
                        <input type="checkbox" checked={selectedTeams.includes(team)} onChange={() => setSelectedTeams((prev) => prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team])} className="accent-[#4b6581] w-4 h-4 rounded" />
                        <span className="text-[0.84rem] font-medium" style={{ color: selectedTeams.includes(team) ? neutralText : mutedText }}>{team}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {selectedTeams.length > 0 && (
                  <div className="rounded-[16px] px-4 py-3" style={{ background: accentSurface, border: `1px solid ${accentBorder}` }}>
                    <p className="text-[0.72rem] font-semibold mb-2" style={{ color: actionBlue }}>적용된 필터</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTeams.map((t) => <button key={t} onClick={() => setSelectedTeams((prev) => prev.filter((x) => x !== t))} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold" style={{ background: "#fff", border: `1px solid ${accentBorder}`, color: actionBlue }}>{t} ×</button>)}
                    </div>
                    <button onClick={resetCategoryFilters} className="mt-2 text-[0.68rem] font-semibold" style={{ color: mutedText }}>전체 초기화</button>
                  </div>
                )}

                <div className="rounded-[18px] p-4" style={panelStyle}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em]" style={{ color: mutedText }}>내 파편</p>
                    <span className="text-[0.68rem] font-semibold" style={{ color: mutedText }}>{ownedFragments.length}종</span>
                  </div>
                  <div className="space-y-2">
                    {ownedFragments.length > 0 ? ownedFragments.slice(0, 3).map((fragment) => (
                      <button key={fragment.id} onClick={() => openMarketDetail(fragment)} className="w-full rounded-[12px] px-3 py-3 text-left" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                        <p className="text-[0.78rem] font-semibold truncate" style={{ color: neutralText }}>{fragment.fragmentName}</p>
                        <p className="mt-1 text-[0.7rem]" style={{ color: mutedText }}>보유 {getOwnedCount(fragment)}개 · {getFragmentResultName(fragment)}</p>
                      </button>
                    )) : <p className="text-[0.76rem] leading-6" style={{ color: mutedText }}>아직 가진 파편이 없어요. 필요한 조합 재료를 먼저 골라보세요.</p>}
                  </div>
                </div>
              </aside>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[0.84rem] font-semibold" style={{ color: mutedText }}>조합 재료 파편 <span style={{ color: neutralText }}>{filteredFragments.length}종</span>{selectedTeams.length > 0 && " (필터 적용 중)"}</p>
                  <div className="flex items-center gap-2"><SlidersHorizontal className="w-3.5 h-3.5" style={{ color: mutedText }} /><span className="text-[0.78rem]" style={{ color: mutedText }}>최저가순</span></div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredFragments.map((fragment, index) => (
                    <motion.button key={fragment.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} onClick={() => openMarketDetail(fragment)}
                      className="text-left rounded-[22px] overflow-hidden transition-all hover:-translate-y-1 hover:shadow-md" style={panelStyle}>
                      <div className="w-full h-[280px] overflow-hidden relative" style={{ background: fragment.imageUrl ? "transparent" : `linear-gradient(135deg, ${fragment.color}22, ${fragment.color}08)` }}>
                        {fragment.imageUrl ? (
                          <img src={fragment.imageUrl} alt={fragment.fragmentName} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="rounded-full w-16 h-16 flex items-center justify-center text-[1.6rem] font-black" style={{ background: `${fragment.color}28`, color: fragment.color }}>{fragment.idol.slice(0, 1)}</div>
                          </div>
                        )}
                        <span className="absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[0.62rem] font-bold" style={{ background: `${fragment.color}dd`, color: "#fff" }}>{fragment.idol}</span>
                        {fragment.listings.length > 0 && <span className="absolute top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[0.62rem] font-bold" style={{ background: "rgba(255,255,255,0.92)", border: "1px solid #cbe1d3", color: priceGreen }}>{fragment.listings.length}명</span>}
                      </div>
                      <div className="px-3 py-2.5">
                        <h3 className="text-[0.82rem] font-bold leading-snug line-clamp-1" style={{ color: neutralText }}>{fragment.fragmentName}</h3>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <p className="text-[0.92rem] font-bold" style={{ color: priceGreen }}>{formatPrice(fragment.floorPrice)}</p>
                          <span className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-[0.68rem] font-semibold" style={{ background: accentSurface, border: `1px solid ${accentBorder}`, color: actionBlue }}>구매 <ArrowRight className="w-2.5 h-2.5" /></span>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>

                {filteredFragments.length === 0 && (
                  <div className="rounded-[22px] px-5 py-16 text-center" style={panelStyle}>
                    <p className="text-[0.92rem] font-semibold mb-2" style={{ color: neutralText }}>{activeFilter === "보유 중" ? "보유한 파편이 없습니다" : "검색 결과가 없습니다"}</p>
                    <p className="text-[0.82rem]" style={{ color: mutedText }}>{activeFilter === "보유 중" ? "장터에서 파편을 구매하거나 카드 조합 페이지에서 박스를 개봉해보세요." : "필터를 조정하거나 다른 검색어를 입력해보세요."}</p>
                    <button onClick={() => { setSelectedTeams([]); setActiveFilter("전체"); setQuery(""); }} className="mt-4 rounded-[12px] px-4 py-2 text-[0.8rem] font-semibold" style={{ background: accentSurface, border: `1px solid ${accentBorder}`, color: actionBlue }}>필터 초기화</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid xl:grid-cols-[280px_minmax(0,1fr)_340px] gap-5 items-start">
              <motion.aside initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} className="space-y-4">
                <div className="rounded-[22px] p-4" style={panelStyle}>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div><p className="market-eyebrow" style={{ color: mutedText }}>브라우즈</p><p className="mt-1 text-[0.92rem] font-semibold" style={{ color: neutralText }}>파편 탐색</p></div>
                    <SlidersHorizontal className="w-4 h-4" style={{ color: mutedText }} />
                  </div>
                  <div className="relative mb-4">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: mutedText }} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="구단명 또는 자산명 검색" className="w-full rounded-[14px] pl-10 pr-4 py-3 text-[0.92rem] outline-none" style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {filterOptions.map((filter) => (
                      <button key={filter} onClick={() => setActiveFilter(filter)} className="rounded-[12px] px-3 py-2.5 text-[0.78rem] font-semibold transition-all" style={{ background: activeFilter === filter ? accentSurface : subtleSurface, border: activeFilter === filter ? `1px solid ${accentBorder}` : `1px solid ${lineColor}`, color: activeFilter === filter ? neutralText : mutedText }}>{filter}</button>
                    ))}
                  </div>
                  <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${lineColor}` }}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-[0.72rem] font-semibold" style={{ color: mutedText }}>카테고리</p>
                      {(selectedTeams.length > 0 || query.trim()) && <button onClick={resetCategoryFilters} className="text-[0.68rem] font-semibold" style={{ color: actionBlue }}>초기화</button>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {KBO_TEAMS.map((team) => <button key={team} onClick={() => toggleTeam(team)} className="rounded-full px-2.5 py-1 text-[0.68rem] font-semibold" style={{ background: selectedTeams.includes(team) ? accentSurface : subtleSurface, border: selectedTeams.includes(team) ? `1px solid ${accentBorder}` : `1px solid ${lineColor}`, color: selectedTeams.includes(team) ? actionBlue : mutedText }}>{team}</button>)}
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] overflow-hidden" style={panelStyle}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: lineColor }}>
                    <p className="text-[0.92rem] font-semibold" style={{ color: neutralText }}>파편 목록</p>
                    <p className="mt-0.5 text-[0.72rem]" style={{ color: mutedText }}>구매할 파편을 선택하세요</p>
                  </div>
                  <div className="max-h-[720px] overflow-auto">
                    {filteredFragments.map((fragment, index) => {
                      const selected = fragment.id === selectedId;
                      return (
                        <motion.button key={fragment.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
                          onClick={() => { setSelectedId(fragment.id); setSellPrice(fragment.floorPrice + 1200); setSellQuantity(Math.min(2, Math.max(getOwnedCount(fragment), 1))); }}
                          className="w-full px-4 py-4 text-left border-b last:border-b-0 transition-colors" style={{ borderColor: lineColor, background: selected ? accentSurface : "transparent" }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-bold" style={{ background: `${fragment.color}18`, border: `1px solid ${fragment.color}33`, color: fragment.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: fragment.color }} />{fragment.idol}</span>
                                <span className="text-[0.72rem]" style={{ color: mutedText }}>보유 {getOwnedCount(fragment)}개</span>
                              </div>
                              <p className="text-[0.94rem] font-semibold leading-6" style={{ color: neutralText }}>{fragment.fragmentName}</p>
                              <p className="mt-1 text-[0.76rem]" style={{ color: mutedText }}>최저가 {formatPrice(fragment.floorPrice)} · 조합 결과 {getFragmentResultName(fragment)}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[0.9rem] font-bold" style={{ color: priceGreen }}>{formatPrice(fragment.floorPrice)}</div>
                              <p className="mt-2 text-[0.72rem]" style={{ color: mutedText }}>판매자 {fragment.listings.length}명</p>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </motion.aside>

              <motion.main initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }} className="space-y-5">
                <div className="rounded-[18px] px-4 py-3 flex items-center gap-3 overflow-x-auto" style={{ background: panelStyle.background, border: panelStyle.border }}>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-black" style={{ background: priceGreen, color: "#fff" }}>✓</div>
                    <div><p className="text-[0.64rem] font-semibold" style={{ color: priceGreen }}>STEP 1</p><p className="text-[0.78rem] font-bold" style={{ color: neutralText }}><span className="inline-block rounded-full px-1.5 py-0.5 mr-1 text-[0.6rem] font-bold" style={{ background: `${selectedFragment.color}18`, color: selectedFragment.color }}>{selectedFragment.idol}</span>{selectedFragment.fragmentName}</p></div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: mutedText }} />
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-black" style={selectedListing ? { background: priceGreen, color: "#fff" } : { background: accentSurface, border: `2px solid ${actionBlue}`, color: actionBlue }}>{selectedListing ? "✓" : "2"}</div>
                    <div><p className="text-[0.64rem] font-semibold" style={{ color: selectedListing ? priceGreen : actionBlue }}>STEP 2</p><p className="text-[0.78rem] font-bold" style={{ color: neutralText }}>{selectedListing ? <span style={{ color: priceGreen }}>{formatPrice(selectedListing.price)} 선택됨</span> : <span style={{ color: actionBlue }}>아래 매물 클릭 ↓</span>}</p></div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: mutedText }} />
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-black" style={selectedListing ? { background: accentSurface, border: `2px solid ${actionBlue}`, color: actionBlue } : { background: subtleSurface, border: `1px solid ${lineColor}`, color: mutedText }}>3</div>
                    <div><p className="text-[0.64rem] font-semibold" style={{ color: selectedListing ? actionBlue : mutedText }}>STEP 3</p><p className="text-[0.78rem] font-bold" style={{ color: selectedListing ? neutralText : mutedText }}>{selectedListing ? "오른쪽에서 구매 →" : "구매하기"}</p></div>
                  </div>
                </div>

                <div className="rounded-[22px] px-5 py-4" style={panelStyle}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button onClick={() => setMarketViewMode("browse")} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                        <ArrowRight className="w-3.5 h-3.5 rotate-180" style={{ color: mutedText }} />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded-full px-2 py-0.5 text-[0.66rem] font-bold" style={{ background: `${selectedFragment.color}18`, color: selectedFragment.color, border: `1px solid ${selectedFragment.color}30` }}>{selectedFragment.idol}</span>
                        </div>
                        <h2 className="mt-1 text-[1.3rem] font-bold tracking-[-0.03em] truncate" style={{ color: neutralText }}>{selectedFragment.fragmentName}</h2>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-[0.8rem]">
                      <div className="text-center"><p className="text-[0.62rem]" style={{ color: mutedText }}>최저가</p><p className="font-bold" style={{ color: priceGreen }}>{formatPrice(selectedFragment.floorPrice)}</p></div>
                      <div className="text-center"><p className="text-[0.62rem]" style={{ color: mutedText }}>판매자</p><p className="font-semibold" style={{ color: neutralText }}>{selectedFragmentListings.length}명</p></div>
                      <div className="text-center"><p className="text-[0.62rem]" style={{ color: mutedText }}>내 보유</p><p className="font-semibold" style={{ color: neutralText }}>{getOwnedCount(selectedFragment)}개</p></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${lineColor}` }}>
                    <span className="text-[0.68rem] shrink-0" style={{ color: mutedText }}>정렬</span>
                    {[{ key: "price_asc", label: "최저가순" }, { key: "latest", label: "최신순" }, { key: "quantity", label: "수량순" }].map((option) => (
                      <button key={option.key} onClick={() => setListingSort(option.key as ListingSort)} className="rounded-[10px] px-2.5 py-1.5 text-[0.7rem] font-semibold" style={{ background: listingSort === option.key ? accentSurface : "transparent", border: listingSort === option.key ? `1px solid ${accentBorder}` : `1px solid transparent`, color: listingSort === option.key ? actionBlue : mutedText }}>{option.label}</button>
                    ))}
                  </div>
                  {soldOutNotice?.fragmentId === selectedFragment.id && (
                    <div className="mt-3 rounded-[14px] px-4 py-3" style={{ background: "rgba(239,143,154,0.10)", border: "1px solid rgba(239,143,154,0.20)" }}>
                      <p className="text-[0.74rem] font-semibold" style={{ color: "#ef8f9a" }}>방금 판매 완료 — {soldOutNotice.sellerName} 님의 {formatPrice(soldOutNotice.price)} 매물</p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-[22px] p-5" style={panelStyle}>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div><h3 className="text-[1.02rem] font-semibold" style={{ color: neutralText }}>추천 매물</h3><p className="mt-1 text-[0.8rem]" style={{ color: mutedText }}>클릭하면 오른쪽 구매창에 반영돼요</p></div>
                    </div>
                    <div className="rounded-[16px] px-4 py-4 mb-4" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                      <p className="text-[0.76rem] font-semibold" style={{ color: mutedText }}>이 파편은 어디에 쓰이나요?</p>
                      <p className="mt-1 text-[0.9rem] font-semibold" style={{ color: neutralText }}>{selectedFragmentResultName} 조합 재료</p>
                      <p className="mt-2 text-[0.78rem] leading-6" style={{ color: mutedText }}>필요한 수량만 먼저 구매한 뒤 카드 조합 페이지에서 바로 합치면 됩니다.</p>
                    </div>
                    <div className="grid lg:grid-cols-3 gap-3">
                      {quickBuyListings.length > 0 ? quickBuyListings.map((listing, index) => {
                        const active = selectedListing?.id === listing.id;
                        const isLowest = index === 0;
                        return (
                          <button key={listing.id} onClick={() => setSelectedListingId(listing.id)} className="rounded-[18px] p-4 text-left relative transition-all" style={{ background: active ? accentSurface : subtleSurface, border: active ? `2px solid ${actionBlue}` : `1px solid ${lineColor}`, boxShadow: active ? `0 0 0 3px ${accentBorder}` : "none" }}>
                            {isLowest && <span className="absolute top-3 right-3 rounded-full px-2 py-0.5 text-[0.6rem] font-black" style={{ background: priceGreen, color: "#fff" }}>최저가</span>}
                            {active && <span className="absolute top-3 left-3 w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem] font-black" style={{ background: actionBlue, color: "#fff" }}>✓</span>}
                            <div className="mt-1"><p className="text-[0.82rem] font-semibold" style={{ color: active ? actionBlue : neutralText }}>{listing.sellerName}</p><p className="mt-0.5 text-[0.7rem]" style={{ color: mutedText }}>@{listing.sellerHandle}</p></div>
                            <p className="mt-3 text-[1.15rem] font-black" style={{ color: priceGreen }}>{formatPrice(listing.price)}</p>
                            <div className="flex items-center gap-3 mt-2 text-[0.72rem]" style={{ color: mutedText }}>
                              <span>수량 {listing.quantity}개</span>
                              {isFreshListing(listing.postedAt) && <span className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold" style={{ background: accentSurface, color: actionBlue }}>방금</span>}
                            </div>
                            <div className="mt-3 w-full rounded-[10px] py-2 text-center text-[0.74rem] font-semibold" style={{ background: active ? actionBlue : "rgba(255,255,255,0.7)", border: active ? "none" : `1px solid ${lineColor}`, color: active ? "#fff" : mutedText }}>{active ? "✓ 선택됨" : "이 매물 선택"}</div>
                          </button>
                        );
                      }) : (
                        <div className="lg:col-span-3 rounded-[16px] px-4 py-8 text-center" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                          <p className="text-[0.88rem] font-semibold" style={{ color: neutralText }}>등록된 매물이 없어요</p>
                          <p className="mt-1 text-[0.78rem]" style={{ color: mutedText }}>다른 자산을 선택하거나 나중에 다시 확인해보세요.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] overflow-hidden" style={panelStyle}>
                    <div className="grid grid-cols-[minmax(0,1.45fr)_120px_72px_90px_96px] gap-3 px-5 py-3 text-[0.7rem] font-bold uppercase tracking-[0.14em]" style={{ color: mutedText, background: "#eef2f5", borderBottom: `1px solid ${lineColor}` }}>
                      <span>판매자</span><span className="text-right">제시가</span><span className="text-right">수량</span><span className="text-right">등록</span><span className="text-right">선택</span>
                    </div>
                    <div className="divide-y" style={{ borderColor: lineColor }}>
                      {visibleFragmentListings.length > 0 ? visibleFragmentListings.map((listing) => {
                        const active = selectedListing?.id === listing.id;
                        return (
                          <button key={listing.id} onClick={() => setSelectedListingId(listing.id)} className="grid w-full grid-cols-[minmax(0,1.45fr)_120px_72px_90px_96px] gap-3 px-5 py-4 text-left transition-all" style={{ background: active ? accentSurface : "transparent" }}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2"><span className="truncate text-[0.92rem] font-semibold" style={{ color: neutralText }}>{listing.sellerName}</span></div>
                              <p className="mt-1 text-[0.76rem]" style={{ color: mutedText }}>@{listing.sellerHandle}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {isFreshListing(listing.postedAt) && <span className="rounded-full px-2 py-0.5 text-[0.62rem] font-bold" style={{ background: accentSurface, border: `1px solid ${accentBorder}`, color: actionBlue }}>방금 등록</span>}
                                {listing.quantity === 1 && <span className="rounded-full px-2 py-0.5 text-[0.62rem] font-bold" style={{ background: "rgba(239,143,154,0.12)", border: "1px solid rgba(239,143,154,0.22)", color: "#ef8f9a" }}>1개 남음</span>}
                              </div>
                            </div>
                            <p className="text-right text-[0.95rem] font-bold" style={{ color: priceGreen }}>{formatPrice(listing.price)}</p>
                            <p className="text-right text-[0.85rem] font-semibold" style={{ color: neutralText }}>{listing.quantity}개</p>
                            <p className="text-right text-[0.76rem]" style={{ color: mutedText }}>{listing.postedAt}</p>
                            <div className="flex justify-end"><span className="inline-flex items-center rounded-[10px] px-3 py-2 text-[0.72rem] font-semibold" style={{ background: active ? actionBlue : subtleSurface, border: active ? "none" : `1px solid ${lineColor}`, color: active ? "#fff" : mutedText }}>{active ? "✓ 선택됨" : "선택하기"}</span></div>
                          </button>
                        );
                      }) : (
                        <div className="px-5 py-10 text-center">
                          <p className="text-[0.92rem] font-semibold" style={{ color: neutralText }}>등록된 매물이 없어요</p>
                          <p className="mt-2 text-[0.8rem]" style={{ color: mutedText }}>다른 자산을 선택하거나 나중에 다시 확인해보세요.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.main>

              <motion.aside initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.08 }} className="space-y-4">
                <div className="rounded-[22px] p-5 sticky top-4" style={panelStyle}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-[1rem] font-black shrink-0" style={{ background: `${selectedFragment.color}20`, color: selectedFragment.color }}>{selectedFragment.idol.slice(0, 1)}</div>
                    <div className="min-w-0">
                      <p className="text-[0.72rem] font-semibold truncate" style={{ color: selectedFragment.color }}>{selectedFragment.idol}</p>
                      <p className="text-[0.92rem] font-bold truncate" style={{ color: neutralText }}>{selectedFragment.fragmentName}</p>
                    </div>
                    <div className="ml-auto rounded-full px-2.5 py-1 text-[0.68rem] font-bold shrink-0" style={selectedListing ? { background: "rgba(147,213,138,0.12)", border: "1px solid rgba(147,213,138,0.22)", color: priceGreen } : { background: subtleSurface, border: `1px solid ${lineColor}`, color: mutedText }}>{selectedListing ? "선택됨" : "미선택"}</div>
                  </div>

                  {selectedListing ? (
                    <div className="rounded-[16px] px-4 py-4 mb-4" style={{ background: accentSurface, border: `1px solid ${accentBorder}` }}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div><p className="text-[0.72rem]" style={{ color: mutedText }}>판매자</p><p className="text-[0.88rem] font-semibold" style={{ color: neutralText }}>{selectedListing.sellerName}<span className="ml-1 text-[0.72rem] font-normal" style={{ color: mutedText }}>@{selectedListing.sellerHandle}</span></p></div>
                        <div className="text-right"><p className="text-[0.72rem]" style={{ color: mutedText }}>등록</p><p className="text-[0.76rem]" style={{ color: mutedText }}>{selectedListing.postedAt}</p></div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[0.78rem]">
                        <div className="rounded-[10px] px-2 py-2 text-center" style={{ background: "rgba(255,255,255,0.7)", border: `1px solid ${accentBorder}` }}><p style={{ color: mutedText }}>가격</p><p className="font-bold" style={{ color: priceGreen }}>{formatPrice(selectedListing.price)}</p></div>
                        <div className="rounded-[10px] px-2 py-2 text-center" style={{ background: "rgba(255,255,255,0.7)", border: `1px solid ${accentBorder}` }}><p style={{ color: mutedText }}>수량</p><p className="font-semibold" style={{ color: neutralText }}>{selectedListing.quantity}개</p></div>
                        <div className="rounded-[10px] px-2 py-2 text-center" style={{ background: "rgba(255,255,255,0.7)", border: `1px solid ${accentBorder}` }}><p style={{ color: mutedText }}>최저가 대비</p><p className="font-semibold" style={{ color: selectedListingVsFloor && selectedListingVsFloor > 0 ? "#ef8f9a" : priceGreen }}>{selectedListingVsFloor === 0 ? "최저가" : selectedListingVsFloor === null ? "-" : `${selectedListingVsFloor > 0 ? "+" : ""}${formatPrice(selectedListingVsFloor)}`}</p></div>
                      </div>
                      {selectedListing.sellerHandle === viewerHandle && (
                        <div className="mt-3 rounded-[12px] px-3 py-3 text-[0.74rem] font-semibold" style={{ background: "rgba(239,143,154,0.10)", border: "1px solid rgba(239,143,154,0.22)", color: "#b85a68" }}>이 매물은 내가 등록한 매물이라 구매할 수 없어요. 다른 판매자의 매물을 선택해주세요.</div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-[16px] px-4 py-5 mb-4 text-center" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                      <p className="text-[0.82rem]" style={{ color: mutedText }}>위에서 매물을 선택하면<br/>여기에 구매 정보가 표시돼요</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mb-4 text-[0.78rem]">
                    <div className="rounded-[12px] px-3 py-2.5" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p style={{ color: mutedText }}>최저가</p><p className="font-semibold" style={{ color: priceGreen }}>{formatPrice(selectedFragment.floorPrice)}</p></div>
                    <div className="rounded-[12px] px-3 py-2.5" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p style={{ color: mutedText }}>최근 체결</p><p className="font-semibold" style={{ color: neutralText }}>{formatPrice(selectedFragment.lastPrice)}</p></div>
                    <div className="rounded-[12px] px-3 py-2.5" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p style={{ color: mutedText }}>판매자 수</p><p className="font-semibold" style={{ color: neutralText }}>{selectedFragmentListings.length}명</p></div>
                    <div className="rounded-[12px] px-3 py-2.5" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p style={{ color: mutedText }}>내 보유</p><p className="font-semibold" style={{ color: neutralText }}>{getOwnedCount(selectedFragment)}개 → {selectedListing ? getOwnedCount(selectedFragment) + 1 : getOwnedCount(selectedFragment)}개</p></div>
                  </div>

                  <div className="rounded-[14px] px-4 py-4 mb-4" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                    <p className="text-[0.74rem] font-semibold" style={{ color: mutedText }}>조합 연결</p>
                    <p className="mt-1 text-[0.88rem] font-semibold" style={{ color: neutralText }}>이 파편은 {selectedFragmentResultName} 조합에 사용돼요.</p>
                    <p className="mt-2 text-[0.76rem] leading-6" style={{ color: mutedText }}>지금 사는 건 완성 카드가 아니라 조합에 필요한 재료 파편입니다. 구매 후 카드 조합으로 이동하면 바로 완성 카드 제작을 이어갈 수 있습니다.</p>
                  </div>

                  <Button className="w-full h-12 text-sm font-bold disabled:opacity-50" style={{ background: isPurchasing ? "#888" : selectedListing && selectedListing.sellerHandle !== viewerHandle ? priceGreen : "#c8d6cc", color: "#102015" }}
                    onClick={handleOpenBuyModal} disabled={isPurchasing || !selectedListing || selectedListing.sellerHandle === viewerHandle}>
                    {isPurchasing ? (
                      <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />구매 처리 중...</span>
                    ) : (
                      <><ShoppingCart className="w-4 h-4 mr-1" />{selectedListing ? selectedListing.sellerHandle === viewerHandle ? "내 매물은 구매할 수 없어요" : `${formatPrice(selectedListing.price)}에 구매하기` : "매물을 선택해주세요"}</>
                    )}
                  </Button>

                  {purchaseReceipt?.fragmentId === selectedFragment.id && (
                    <div className="rounded-[16px] px-4 py-4 mt-3" style={{ background: "rgba(147,213,138,0.10)", border: "1px solid rgba(147,213,138,0.20)" }}>
                      <p className="text-[0.8rem] font-bold" style={{ color: priceGreen }}>✓ 구매 완료</p>
                      <p className="mt-2 text-[0.82rem] leading-6" style={{ color: neutralText }}>{purchaseReceipt.sellerName} 님 매물을 {formatPrice(purchaseReceipt.price)}에 구매했어요.</p>
                      <Button asChild className="mt-3 h-10 px-4 text-sm font-semibold w-full" style={{ background: "#f3f6f8", color: neutralText, border: `1px solid ${lineColor}` }}>
                        <Link to="/combine">파편 조합 보러가기<ArrowRight className="w-4 h-4" /></Link>
                      </Button>
                    </div>
                  )}
                </div>
              </motion.aside>
            </div>
          )
        ) : (
          <div className="grid xl:grid-cols-[280px_minmax(0,1fr)_340px] gap-5 items-start">
            <div className="space-y-4">
              <div className="rounded-[22px] p-4" style={panelStyle}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div><p className="market-eyebrow" style={{ color: mutedText }}>카테고리</p><p className="mt-1 text-[0.92rem] font-semibold" style={{ color: neutralText }}>원하는 파편만 보기</p></div>
                  {(selectedTeams.length > 0 || query.trim()) && <button onClick={resetCategoryFilters} className="text-[0.68rem] font-semibold" style={{ color: actionBlue }}>초기화</button>}
                </div>
                <div className="relative mb-3">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: mutedText }} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="파편 검색" className="w-full rounded-[12px] pl-8 pr-3 py-2.5 text-[0.82rem] outline-none" style={inputStyle} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {KBO_TEAMS.map((team) => <button key={team} onClick={() => toggleTeam(team)} className="rounded-full px-2.5 py-1 text-[0.68rem] font-semibold" style={{ background: selectedTeams.includes(team) ? accentSurface : subtleSurface, border: selectedTeams.includes(team) ? `1px solid ${accentBorder}` : `1px solid ${lineColor}`, color: selectedTeams.includes(team) ? actionBlue : mutedText }}>{team}</button>)}
                </div>
              </div>

              <div className="rounded-[22px] p-4" style={panelStyle}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div><p className="market-eyebrow" style={{ color: mutedText }}>내 파편</p><p className="mt-1 text-[0.92rem] font-semibold" style={{ color: neutralText }}>지금 가지고 있는 파편</p></div>
                  <div className="text-[0.76rem]" style={{ color: mutedText }}>{ownedFragments.length}종</div>
                </div>
                <div className="space-y-2">
                  {ownedFragments.length > 0 ? ownedFragments.slice(0, 4).map((fragment) => (
                    <button key={fragment.id} onClick={() => { setSelectedId(fragment.id); setSellPrice(fragment.floorPrice); setSellQuantity(Math.min(1, Math.max(getOwnedCount(fragment), 1))); }}
                      className="w-full rounded-[14px] px-3 py-3 text-left" style={{ background: fragment.id === selectedId ? accentSurface : subtleSurface, border: fragment.id === selectedId ? `1px solid ${accentBorder}` : `1px solid ${lineColor}` }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0"><p className="text-[0.82rem] font-semibold truncate" style={{ color: neutralText }}>{fragment.fragmentName}</p><p className="mt-1 text-[0.72rem]" style={{ color: mutedText }}>{fragment.idol} · 최저가 {formatPrice(fragment.floorPrice)}</p></div>
                        <div className="text-right"><p className="text-[0.7rem]" style={{ color: mutedText }}>보유</p><p className="text-[0.9rem] font-semibold" style={{ color: neutralText }}>{getOwnedCount(fragment)}개</p></div>
                      </div>
                    </button>
                  )) : <div className="rounded-[14px] px-4 py-4 text-[0.8rem] leading-6" style={{ background: subtleSurface, border: `1px solid ${lineColor}`, color: mutedText }}>아직 가진 파편이 없어요. 파편 장터에서 먼저 구매하거나 카드 조합 페이지에서 박스를 열어보세요.</div>}
                </div>
              </div>

              <div className="rounded-[22px] p-4" style={panelStyle}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div><p className="market-eyebrow" style={{ color: mutedText }}>인벤토리</p><p className="mt-1 text-[0.92rem] font-semibold" style={{ color: neutralText }}>판매할 파편 선택</p></div>
                  <div className="text-[0.76rem]" style={{ color: mutedText }}>총 보유 {ownedFragments.reduce((sum, item) => sum + getOwnedCount(item), 0)}개</div>
                </div>
                <div className="space-y-2">
                  {sellableFragments.length > 0 ? sellableFragments.map((fragment, index) => {
                    const selected = fragment.id === selectedId;
                    return (
                      <motion.button key={fragment.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
                        onClick={() => { setSelectedId(fragment.id); setSellPrice(fragment.floorPrice); setSellQuantity(Math.min(1, Math.max(getOwnedCount(fragment), 1))); }}
                        className="w-full rounded-[16px] px-4 py-4 text-left" style={{ background: selected ? accentSurface : subtleSurface, border: selected ? `1px solid ${accentBorder}` : `1px solid ${lineColor}` }}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-2"><span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-bold" style={{ background: `${fragment.color}18`, border: `1px solid ${fragment.color}33`, color: fragment.color }}>{fragment.idol}</span><span className="text-[0.72rem]" style={{ color: mutedText }}>최저가 {formatPrice(fragment.floorPrice)}</span></div>
                            <p className="text-[0.92rem] font-semibold" style={{ color: neutralText }}>{fragment.fragmentName}</p>
                          </div>
                          <div className="text-right"><p className="text-[0.72rem]" style={{ color: mutedText }}>판매 가능</p><p className="mt-1 text-[0.95rem] font-semibold" style={{ color: neutralText }}>{getOwnedCount(fragment)}개</p></div>
                        </div>
                      </motion.button>
                    );
                  }) : <div className="rounded-[14px] px-4 py-4 text-[0.8rem] leading-6" style={{ background: subtleSurface, border: `1px solid ${lineColor}`, color: mutedText }}>현재 필터 기준으로 판매 가능한 파편이 없어요. 필터를 풀거나 파편을 먼저 확보해보세요.</div>}
                </div>
              </div>

              <div className="rounded-[22px] p-4" style={panelStyle}>
                <p className="market-eyebrow" style={{ color: mutedText }}>내 판매 현황</p>
                <p className="mt-1 text-[0.92rem] font-semibold" style={{ color: neutralText }}>등록 중인 매물 요약</p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="rounded-[14px] px-3 py-3" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p className="text-[0.7rem]" style={{ color: mutedText }}>전체 매물</p><p className="mt-1 text-[0.95rem] font-semibold" style={{ color: neutralText }}>{totalViewerListingCount}건</p></div>
                  <div className="rounded-[14px] px-3 py-3" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p className="text-[0.7rem]" style={{ color: mutedText }}>등록 수량</p><p className="mt-1 text-[0.95rem] font-semibold" style={{ color: neutralText }}>{totalViewerListingQuantity}개</p></div>
                </div>
              </div>

              <div className="rounded-[22px] p-4" style={panelStyle}>
                <p className="market-eyebrow" style={{ color: mutedText }}>내 정산 현황</p>
                <p className="mt-1 text-[0.92rem] font-semibold" style={{ color: neutralText }}>판매 후 들어온 금액</p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="rounded-[14px] px-3 py-3" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p className="text-[0.7rem]" style={{ color: mutedText }}>총 정산액</p><p className="mt-1 text-[0.95rem] font-semibold" style={{ color: priceGreen }}>{formatPrice(totalSalesSettlement)}</p></div>
                  <div className="rounded-[14px] px-3 py-3" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p className="text-[0.7rem]" style={{ color: mutedText }}>판매 완료 수량</p><p className="mt-1 text-[0.95rem] font-semibold" style={{ color: neutralText }}>{totalSalesCount}개</p></div>
                </div>
                <div className="mt-3 space-y-2">
                  {recentSales.length > 0 ? recentSales.map((sale) => (
                    <div key={sale.id} className="rounded-[12px] px-3 py-3" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                      <div className="flex items-center justify-between gap-2"><p className="text-[0.8rem] font-semibold truncate" style={{ color: neutralText }}>{sale.fragmentName}</p><span className="text-[0.78rem] font-semibold" style={{ color: priceGreen }}>+{formatPrice(sale.settlementAmount)}</span></div>
                      <p className="mt-1 text-[0.72rem] leading-5" style={{ color: mutedText }}>{sale.tradedAt} · {sale.quantity}개 판매 · 수수료 {formatPrice(sale.platformFee)}</p>
                      <p className="mt-1 text-[0.7rem]" style={{ color: actionBlue }}>구매자 {shortWallet(sale.buyerWalletAddress)}</p>
                    </div>
                  )) : <div className="rounded-[14px] px-4 py-4 text-[0.8rem] leading-6" style={{ background: subtleSurface, border: `1px solid ${lineColor}`, color: mutedText }}>아직 판매 완료된 파편이 없어요. 판매가 체결되면 여기서 실제로 들어온 정산액을 바로 확인할 수 있습니다.</div>}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[22px] p-5" style={panelStyle}>
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div>
                    <p className="market-eyebrow" style={{ color: mutedText }}>판매 등록</p>
                    <h2 className="mt-1 text-[1.4rem] font-bold tracking-[-0.04em]" style={{ color: neutralText }}>{selectedFragment.fragmentName} 올리기</h2>
                    <p className="mt-2 text-[0.9rem] leading-6" style={{ color: mutedText }}>내가 가진 조합 재료 파편 중에서 필요한 것만 골라 가격과 수량을 입력하면 바로 등록돼요.</p>
                  </div>
                  <div className="rounded-[16px] px-4 py-3 min-w-[220px]" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                    <div className="grid grid-cols-2 gap-y-2 text-[0.82rem]">
                      <span style={{ color: mutedText }}>시장 최저가</span><span className="text-right font-semibold" style={{ color: priceGreen }}>{formatPrice(selectedFragment.floorPrice)}</span>
                      <span style={{ color: mutedText }}>최근 체결가</span><span className="text-right font-semibold" style={{ color: neutralText }}>{formatPrice(selectedFragment.lastPrice)}</span>
                      <span style={{ color: mutedText }}>보유 수량</span><span className="text-right font-semibold" style={{ color: neutralText }}>{getOwnedCount(selectedFragment)}개</span>
                    </div>
                  </div>
                </div>

                {getOwnedCount(selectedFragment) === 0 && (
                  <div className="rounded-[16px] px-4 py-5 mt-5 text-center" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                    <p className="text-[0.9rem] font-semibold mb-1" style={{ color: neutralText }}>보유한 파편이 없습니다</p>
                    <p className="text-[0.82rem]" style={{ color: mutedText }}>장터에서 구매하거나 카드 조합 페이지에서 박스를 개봉해 파편을 먼저 획득하세요.</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      <button onClick={() => { setActiveTab("market"); setMarketViewMode("browse"); }} className="rounded-[12px] px-4 py-2 text-[0.8rem] font-semibold" style={{ background: accentSurface, border: `1px solid ${accentBorder}`, color: actionBlue }}>파편 장터로 이동</button>
                      <Link to="/combine" className="rounded-[12px] px-4 py-2 text-[0.8rem] font-semibold" style={{ background: "#fff", border: `1px solid ${lineColor}`, color: mutedText }}>카드 조합으로 이동</Link>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4 mt-5" style={{ opacity: getOwnedCount(selectedFragment) === 0 ? 0.4 : 1, pointerEvents: getOwnedCount(selectedFragment) === 0 ? "none" : "auto" }}>
                  <label className="block"><span className="mb-2 block text-[0.8rem]" style={{ color: mutedText }}>판매 단가</span><input type="number" min={1000} step={100} value={sellPrice} onChange={(e) => setSellPrice(Number(e.target.value))} className="w-full rounded-[14px] px-4 py-3 text-[0.94rem] outline-none" style={inputStyle} /></label>
                  <label className="block"><span className="mb-2 block text-[0.8rem]" style={{ color: mutedText }}>등록 수량</span><input type="number" min={1} max={Math.max(getOwnedCount(selectedFragment), 1)} value={sellQuantity} onChange={(e) => setSellQuantity(Math.min(Math.max(Number(e.target.value), 1), Math.max(getOwnedCount(selectedFragment), 1)))} className="w-full rounded-[14px] px-4 py-3 text-[0.94rem] outline-none" style={inputStyle} /></label>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {[{ label: "최저가 맞추기", mode: "floor" as const }, { label: "최저가보다 100원 낮게", mode: "undercut" as const }, { label: "최근 체결가 적용", mode: "last" as const }].map((item) => (
                    <button key={item.label} onClick={() => applySuggestedSellPrice(item.mode)} className="rounded-[12px] px-3 py-2 text-[0.76rem] font-semibold" style={{ background: subtleSurface, border: `1px solid ${lineColor}`, color: mutedText }}>{item.label}</button>
                  ))}
                </div>

                <div className="grid sm:grid-cols-3 gap-3 mt-5">
                  <div className="rounded-[14px] px-4 py-4" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p className="text-[0.72rem]" style={{ color: mutedText }}>등록비</p><p className="mt-1 text-[1rem] font-semibold" style={{ color: neutralText }}>{formatPrice(registrationFee)}</p></div>
                  <div className="rounded-[14px] px-4 py-4" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p className="text-[0.72rem]" style={{ color: mutedText }}>판매 수수료</p><p className="mt-1 text-[1rem] font-semibold" style={{ color: neutralText }}>{formatPrice(saleFee)}</p></div>
                  <div className="rounded-[14px] px-4 py-4" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}><p className="text-[0.72rem]" style={{ color: mutedText }}>예상 정산액</p><p className="mt-1 text-[1rem] font-semibold" style={{ color: priceGreen }}>{formatPrice(expectedSettlement)}</p></div>
                </div>

                <div className="rounded-[16px] px-4 py-4 mt-5" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                  <p className="text-[0.78rem] font-semibold" style={{ color: neutralText }}>등록 미리보기</p>
                  <p className="mt-2 text-[0.84rem] leading-6" style={{ color: mutedText }}>{selectedFragment.fragmentName} {sellQuantity}개를 개당 {formatPrice(sellPrice)}에 등록합니다. 현재 최저가 대비 {sellPrice - selectedFragment.floorPrice === 0 ? "같은 가격" : `${sellPrice > selectedFragment.floorPrice ? "+" : ""}${formatPrice(sellPrice - selectedFragment.floorPrice)}`}이고, 체결 후 예상 정산액은 {formatPrice(expectedSettlement)}입니다.</p>
                  <p className="mt-2 text-[0.76rem] leading-6" style={{ color: actionBlue }}>등록 후에도 이 화면에 그대로 남아서 내 매물을 바로 확인하고 수정할 수 있어요.</p>
                </div>

                <Button className="w-full h-12 text-sm font-bold mt-5" style={{ background: actionBlue, color: "#0b1220" }} onClick={handleCreateListing}>
                  <Package className="w-4 h-4 mr-1" />파편 등록하기
                </Button>

                {listedTarget === selectedFragment.id && (
                  <div className="rounded-[16px] px-4 py-4 mt-4" style={{ background: accentSurface, border: `1px solid ${accentBorder}` }}>
                    <p className="text-[0.8rem] font-bold" style={{ color: actionBlue }}>등록 완료</p>
                    <p className="mt-2 text-[0.84rem] leading-6" style={{ color: neutralText }}>{selectedFragment.fragmentName} {sellQuantity}개를 판매 등록했어요. 지금은 판매 탭에 그대로 머물러서 아래 내 매물 관리에서 바로 확인하고 수정할 수 있습니다.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[22px] p-5" style={panelStyle}>
                <div className="flex items-center justify-between gap-4">
                  <div><p className="market-eyebrow" style={{ color: mutedText }}>내 매물 관리</p><h3 className="mt-1 text-[1.05rem] font-semibold" style={{ color: neutralText }}>{selectedFragment.idol} 판매 중인 매물</h3></div>
                  <div className="text-[0.76rem]" style={{ color: mutedText }}>{selectedViewerListings.length}건</div>
                </div>
                <div className="space-y-2 mt-4">
                  {selectedViewerListings.length > 0 ? selectedViewerListings.map((listing) => (
                    <div key={listing.id} className="rounded-[14px] px-4 py-4" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-[0.84rem] font-semibold" style={{ color: neutralText }}>{formatPrice(listing.price)} · {listing.quantity}개</p><p className="mt-1 text-[0.74rem]" style={{ color: mutedText }}>{listing.postedAt} · 최저가 대비 {listing.price - selectedFragment.floorPrice === 0 ? "동일" : `${listing.price > selectedFragment.floorPrice ? "+" : ""}${formatPrice(listing.price - selectedFragment.floorPrice)}`}</p></div>
                        <span className="rounded-full px-2 py-0.5 text-[0.62rem] font-bold" style={{ background: accentSurface, border: `1px solid ${accentBorder}`, color: actionBlue }}>내 매물</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {[-500, -100, 100, 500].map((delta) => <button key={delta} onClick={() => handleAdjustListingPrice(listing.id, delta)} className="rounded-[10px] px-3 py-2 text-[0.74rem] font-semibold" style={{ background: subtleSurface, border: `1px solid ${lineColor}`, color: mutedText }}>{delta > 0 ? `+${delta}` : delta}</button>)}
                        <button onClick={() => handleCancelListing(listing.id)} className="rounded-[10px] px-3 py-2 text-[0.74rem] font-semibold" style={{ background: "rgba(239,143,154,0.10)", border: "1px solid rgba(239,143,154,0.20)", color: "#ef8f9a" }}>판매 취소</button>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[14px] px-4 py-5 text-center" style={{ background: subtleSurface, border: `1px solid ${lineColor}` }}>
                      <p className="text-[0.84rem] font-semibold" style={{ color: neutralText }}>등록된 매물 없음</p>
                      <p className="mt-1 text-[0.76rem]" style={{ color: mutedText }}>왼쪽에서 가격을 입력하고 등록해보세요</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ════════ 파편 구매 모달 (Toss) ════════ */}
      {showBuyModal && tossBuyListingRef.current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(17,40,73,.45)", backdropFilter: "blur(6px)" }}
          onClick={e => { if (e.target === e.currentTarget && !isPurchasing) { setShowBuyModal(false); setTossBuyError(""); } }}>
          <div className="w-full max-w-sm rounded-[24px] p-6 overflow-y-auto"
            style={{ background: "#fff", border: "1px solid #d6dee8", boxShadow: "0 24px 64px rgba(17,40,73,.14)", maxHeight: "90vh" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[1.05rem] font-bold" style={{ color: "#1c2f4a" }}>파편 구매</h2>
              {!isPurchasing && (
                <button onClick={() => { setShowBuyModal(false); setTossBuyError(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#728195" }}>
                  ✕
                </button>
              )}
            </div>

            <div className="rounded-[16px] p-4 mb-4 space-y-2" style={{ background: "#eef2f5", border: "1px solid #dde4ec" }}>
              {[
                ["파편", selectedFragment.fragmentName],
                ["판매자", tossBuyListingRef.current.sellerName],
                ["수량", "1개"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-[0.85rem]">
                  <span style={{ color: "#728195" }}>{k}</span>
                  <span style={{ color: "#1c2f4a", fontWeight: 500 }}>{v}</span>
                </div>
              ))}
              <div className="pt-2 border-t" style={{ borderColor: "#d6dee7" }}>
                <div className="flex justify-between text-[0.95rem]">
                  <span style={{ color: "#728195" }}>결제 금액</span>
                  <span style={{ color: "#547b63", fontWeight: 700 }}>{tossBuyListingRef.current.price.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-[0.75rem] mt-1">
                  <span style={{ color: "#9aaab8" }}>플랫폼 수수료</span>
                  <span style={{ color: "#9aaab8" }}>9%</span>
                </div>
              </div>
            </div>

            <div id="toss-market-payment-widget" className="mb-3" />
            <div id="toss-market-agreement-widget" className="mb-3" />

            {!tossBuyWidgetReady && !tossBuyError && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-[0.84rem] mb-3"
                style={{ background: "#eef4ff", color: "#4b6581", border: "1px solid #c8d8ef" }}>
                <span className="w-4 h-4 border-2 border-[#4b6581] border-t-transparent rounded-full animate-spin shrink-0" />
                결제 위젯을 불러오는 중...
              </div>
            )}

            {tossBuyError && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-[0.84rem] mb-3"
                style={{ background: "#fce8e8", color: "#b94040", border: "1px solid #f0c4c4" }}>
                ⚠ {tossBuyError}
              </div>
            )}

            <button onClick={handleTossBuy} disabled={isPurchasing || !tossBuyWidgetReady}
              className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-[0.9rem]"
              style={{
                background: isPurchasing || !tossBuyWidgetReady ? "#b0bec8" : "#547b63",
                color: "#fff", border: "none",
                cursor: isPurchasing || !tossBuyWidgetReady ? "not-allowed" : "pointer",
              }}>
              {isPurchasing && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isPurchasing ? "결제 처리 중…" : "토스페이로 결제"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
