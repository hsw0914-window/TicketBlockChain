import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  ExternalLink,
  Gem,
  Image as ImageIcon,
  Layers,
  Package,
  Sparkles,
  Star,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useAppSettings } from "../context/AppSettingsContext";

// ─── API 설정 ────────────────────────────────────────────────
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
      throw new Error("팬 자산 공방 서버 응답을 받지 못했습니다. 백엔드가 실행 중인지 확인해주세요.");
    }

    throw new Error(typeof payload === "string" && payload.trim().length > 0 ? payload : "요청 처리 중 오류가 발생했습니다.");
  }

  if (!isJson) {
    throw new Error("팬 자산 공방 서버가 올바른 JSON 응답을 보내지 않았습니다.");
  }

  return payload as T;
}

// ─── 타입 ─────────────────────────────────────────────────────
type ViewMode = "combine" | "openBox";

type InventoryFragment = {
  id: string;
  family: string;
  resultName: string;
  team: string;
  name: string;
  image: string;
  count: number;
  note: string;
  marketAssetId?: string | null;
  marketAssetName?: string | null;
};

type InventoryCard = {
  id: number;
  team: string;
  name: string;
  image: string;
  note: string;
  nftId: string;
  marketAssetId?: string | null;
  marketAssetName?: string | null;
};

type RewardResult = {
  type: "fragment" | "card" | "goods";
  name: string;
  image: string;
  description: string;
  marketAssetId?: string | null;
  txHash?: string | null;
  onChain?: boolean | "pending";
};

type BoxRewardPreview = {
  name: string;
  image: string;
  type?: string;
};

function getSelectedCount(selectedFragments: string[], fragmentId: string) {
  return selectedFragments.filter((selectedId) => selectedId === fragmentId).length;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────
export function Combine() {
  const navigate = useNavigate();
  const { theme, walletAddress } = useAppSettings();
  const isDark = theme === "dark";

  // ── 데이터 상태
  const [fragmentInventory, setFragmentInventory] = useState<InventoryFragment[]>([]);
  const [cardInventory, setCardInventory] = useState<InventoryCard[]>([]);
  const [seasonBoxCount, setSeasonBoxCount] = useState(0);
  const [boxRewardsPreview, setBoxRewardsPreview] = useState<BoxRewardPreview[]>([]);
  const [allBoxRewards, setAllBoxRewards] = useState<BoxRewardPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI 상태
  const [selectedFragments, setSelectedFragments] = useState<string[]>([]);
  const [combining, setCombining] = useState(false);
  const [result, setResult] = useState<RewardResult | null>(null);
  const [activeTab, setActiveTab] = useState("fragments");
  const [viewMode, setViewMode] = useState<ViewMode>("combine");
  const [opening, setOpening] = useState(false);
  const [openResult, setOpenResult] = useState<RewardResult | null>(null);

  // ── 인벤토리 로드 ─────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch(apiUrl("/api/inventory"), { headers: API_HEADERS(walletAddress) })
      .then((res) => parseApiResponse<{
        fragments: InventoryFragment[];
        cards: InventoryCard[];
        seasonBoxCount: number;
      }>(res))
      .then((data) => {
        setFragmentInventory(data.fragments ?? []);
        setCardInventory(data.cards ?? []);
        setSeasonBoxCount(data.seasonBoxCount ?? 0);
        setError(null);
      })
      .catch(() => setError("인벤토리를 불러오는데 실패했습니다."))
      .finally(() => setLoading(false));
  }, [walletAddress]);

  // ── 박스 보상 목록 로드 ────────────────────────────────────
  useEffect(() => {
    fetch(apiUrl("/api/box/rewards"))
      .then((res) => res.json())
      .then((data: { success?: boolean; data?: BoxRewardPreview[] }) => {
        if (data.success && Array.isArray(data.data)) {
          setAllBoxRewards(data.data);
          setBoxRewardsPreview(data.data);
        }
      })
      .catch(() => {});
  }, []);

  // ── 테마
  const shellTone = isDark
    ? {
        panel: { background: "rgba(25, 34, 45, 0.94)", border: "1px solid rgba(88, 110, 134, 0.28)", boxShadow: "0 16px 32px rgba(0, 0, 0, 0.22)" },
        panelStrong: { background: "rgba(21, 29, 39, 0.98)", border: "1px solid rgba(88, 110, 134, 0.3)", boxShadow: "0 18px 36px rgba(0, 0, 0, 0.26)" },
        panelSoft: { background: "rgba(36, 48, 62, 0.95)", border: "1px solid rgba(92, 116, 142, 0.32)" },
        surface: { background: "rgba(30, 41, 53, 0.95)", border: "1px solid rgba(88, 110, 134, 0.24)" },
        selected: { background: "rgba(48, 66, 86, 0.95)", border: "1px solid rgba(124, 158, 196, 0.46)", boxShadow: "0 0 0 1px rgba(124, 158, 196, 0.22) inset" },
        text: "#eef4fb",
        muted: "#9fb0c2",
        accent: "#8eb6e6",
        accentStrong: "#457bc0",
        accentSoft: "#243445",
        success: "#7dcf99",
        badgeText: "#dce7f3",
        dashed: "#6e8197",
      }
    : {
        panel: { background: "#f8fafc", border: "1px solid #d7e0e9", boxShadow: "0 12px 28px rgba(17, 40, 73, 0.06)" },
        panelStrong: { background: "#f4f7fa", border: "1px solid #d1dce7", boxShadow: "0 14px 30px rgba(17, 40, 73, 0.08)" },
        panelSoft: { background: "#eef2f6", border: "1px solid #d7e0e9" },
        surface: { background: "#f7f9fb", border: "1px solid #dde5ee" },
        selected: { background: "#eaf0f7", border: "1px solid #bed0e3", boxShadow: "0 0 0 1px rgba(85, 114, 146, 0.08) inset" },
        text: "#22364a",
        muted: "#6f8094",
        accent: "#5f82ab",
        accentStrong: "#446f9f",
        accentSoft: "#e5edf6",
        success: "#5b9a70",
        badgeText: "#ffffff",
        dashed: "#b2bfd0",
      };

  const totalFragments = useMemo(
    () => fragmentInventory.reduce((sum, fragment) => sum + fragment.count, 0),
    [fragmentInventory],
  );
  const sortedFragments = useMemo(
    () =>
      [...fragmentInventory].sort((left, right) => {
        if (right.count !== left.count) return right.count - left.count;
        if (left.team !== right.team) return left.team.localeCompare(right.team, "ko");
        return left.name.localeCompare(right.name, "ko");
      }),
    [fragmentInventory],
  );

  const selectedFragmentObjects = selectedFragments
    .map((id) => fragmentInventory.find((f) => f.id === id))
    .filter((f): f is InventoryFragment => Boolean(f));

  const canCombine =
    selectedFragmentObjects.length === 2 &&
    selectedFragmentObjects[0]?.id === selectedFragmentObjects[1]?.id;
  const canOpen = seasonBoxCount > 0;

  const expectedCombineResult = useMemo(() => {
    if (!canCombine) return null;
    const [first] = selectedFragmentObjects;
    return {
      type: "card" as const,
      name: first.resultName,
      image: first.image,
      description: `같은 파편을 조합하여 ${first.resultName} 원본 굿즈 카드를 완성할 수 있어요.`,
    };
  }, [canCombine, selectedFragmentObjects]);

  const handleSelectFragment = (id: string) => {
    const selectedCount = getSelectedCount(selectedFragments, id);
    const fragment = fragmentInventory.find((item) => item.id === id);
    if (!fragment) return;

    if (selectedCount > 0 && selectedFragments.length < 2 && fragment.count > selectedCount) {
      setSelectedFragments((current) => [...current, id]);
      return;
    }

    if (selectedCount > 0) {
      setSelectedFragments((current) => {
        const next = [...current];
        const lastIndex = next.lastIndexOf(id);
        if (lastIndex >= 0) next.splice(lastIndex, 1);
        return next;
      });
      return;
    }
    if (selectedFragments.length >= 2) return;
    if (fragment.count <= selectedCount) return;
    setSelectedFragments((cur) => [...cur, id]);
  };

  // ─── 파편 완성 API 호출 ────────────────────────────────────────
  const handleCombine = async () => {
    if (!canCombine) return;
    setCombining(true);
    try {
      // 애니메이션(1.6s)과 API 호출을 병렬 실행 → 둘 다 끝나면 결과 표시
      const [, data] = await Promise.all([
        new Promise<void>(resolve => setTimeout(resolve, 1600)),
        fetch(apiUrl("/api/combine"), {
          method: "POST",
          headers: API_HEADERS(walletAddress),
          body: JSON.stringify({ fragmentIds: selectedFragments }),
        }).then(res => parseApiResponse<{
          updatedInventory: { fragments: InventoryFragment[]; cards: InventoryCard[] };
          result: RewardResult & { burnTxHash?: string | null; cardTxHash?: string | null; onChain?: boolean | "pending" };
        }>(res)),
      ]);

      setFragmentInventory(data.updatedInventory.fragments);
      setCardInventory(data.updatedInventory.cards);
      setResult({
        ...data.result,
        txHash: data.result.cardTxHash ?? data.result.burnTxHash ?? null,
        onChain: data.result.onChain,
      });
      setSelectedFragments([]);
      setActiveTab("nfts");
    } catch (err) {
      alert(err instanceof Error ? err.message : "완성 처리 중 오류가 발생했습니다.");
    } finally {
      setCombining(false);
    }
  };

  // ─── 박스 열기 API 호출 ──────────────────────────────────
  const handleOpenBox = async () => {
    if (!canOpen) return;
    setOpening(true);
    try {
      // 애니메이션(1.6s)과 API 호출을 병렬 실행 → 둘 다 끝나면 결과 표시
      const [, data] = await Promise.all([
        new Promise<void>(resolve => setTimeout(resolve, 1600)),
        fetch(apiUrl("/api/box/open"), {
          method: "POST",
          headers: API_HEADERS(walletAddress),
        }).then(res => parseApiResponse<{
          remainingBoxCount: number;
          updatedInventory: { fragments: InventoryFragment[]; cards: InventoryCard[] };
          reward: RewardResult & { txHash?: string | null; onChain?: boolean | "pending" };
        }>(res)),
      ]);

      setSeasonBoxCount(data.remainingBoxCount);
      setFragmentInventory(data.updatedInventory.fragments);
      setCardInventory(data.updatedInventory.cards);
      setOpenResult({
        ...data.reward,
        txHash: data.reward.txHash ?? null,
        onChain: data.reward.onChain,
      });
      if (data.reward.type === "fragment") setActiveTab("fragments");
      else setActiveTab("nfts");
    } catch (err) {
      alert(err instanceof Error ? err.message : "박스 열기 중 오류가 발생했습니다.");
    } finally {
      setOpening(false);
    }
  };

  const handleCloseResult = () => setResult(null);
  const handleCloseOpenResult = () => {
    setOpenResult(null);
    setViewMode("combine");
  };

  // ─── 로딩 / 에러 ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
            <Sparkles className="w-10 h-10 mx-auto" style={{ color: shellTone.accent }} />
          </motion.div>
          <p style={{ color: shellTone.muted }}>인벤토리 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <p style={{ color: "#d45555" }}>{error}</p>
          <Button onClick={() => window.location.reload()} style={{ background: shellTone.accentStrong, color: "#fff" }}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell" style={{ width: "min(1480px, calc(100% - 3rem))" }}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="page-eyebrow mb-3" style={{ color: shellTone.accentStrong }}>
            COMBINE
          </p>
          <h1 className="page-title mb-2" style={{ color: shellTone.text }}>
            카드 조합
          </h1>
          <p className="page-subtitle" style={{ color: shellTone.muted }}>
            박스에서 얻은 파편을 조합하여 굿즈 카드를 얻을 수 있어요.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {[
            { key: "openBox" as const, label: "박스 개봉", icon: Package },
            { key: "combine" as const, label: "파편 조합", icon: Layers },
          ].map((item) => {
            const Icon = item.icon;
            const active = viewMode === item.key;
            return (
              <Button
                key={item.key}
                onClick={() => setViewMode(item.key)}
                className="rounded-[14px] px-5 py-2.5 font-semibold"
                style={active ? { ...shellTone.selected, color: shellTone.accent } : { ...shellTone.surface, color: shellTone.muted }}
              >
                <Icon className="w-5 h-5 mr-2" />
                {item.label}
              </Button>
            );
          })}
        </div>
      </header>

      <div className="relative space-y-6 lg:space-y-0 lg:pl-[414px]">
        <div
          className="space-y-4 lg:space-y-0 lg:gap-4 lg:absolute lg:left-0 lg:top-0 lg:bottom-0 lg:w-[390px] lg:flex lg:flex-col lg:min-h-0 lg:overflow-hidden"
        >
          <Card className="p-4 lg:shrink-0" style={shellTone.panelStrong}>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={shellTone.surface}>
                  <Package className="w-5 h-5" style={{ color: "#d39a49" }} />
                </div>
                <div>
                  <p className="text-xs" style={{ color: shellTone.muted }}>박스</p>
                  <p className="text-lg font-bold" style={{ color: "#d39a49" }}>{seasonBoxCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={shellTone.surface}>
                  <Gem className="w-5 h-5" style={{ color: shellTone.accent }} />
                </div>
                <div>
                  <p className="text-xs" style={{ color: shellTone.muted }}>파편</p>
                  <p className="text-lg font-bold" style={{ color: shellTone.accent }}>{totalFragments}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden lg:flex-1 lg:min-h-0" style={shellTone.panelStrong}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full gap-0 lg:flex lg:flex-col lg:min-h-0">
              <TabsList className="grid w-full grid-cols-2 border-b lg:shrink-0" style={{ background: isDark ? "#22303d" : "#edf1f5", borderColor: isDark ? "#334657" : "#d4dbe4" }}>
                <TabsTrigger value="fragments" className="data-[state=active]:bg-transparent">
                  <Gem className="w-4 h-4 mr-2" />
                  파편
                </TabsTrigger>
                <TabsTrigger value="nfts" className="data-[state=active]:bg-transparent">
                  <ImageIcon className="w-4 h-4 mr-2" />
                  완성 카드
                </TabsTrigger>
              </TabsList>

              <TabsContent value="fragments" className="mt-0 p-4 max-h-[620px] overflow-y-scroll lg:max-h-none lg:flex-1 lg:basis-0 lg:min-h-0">
                <div className="space-y-2">
                  {sortedFragments.map((fragment) => {
                    const selectedCount = getSelectedCount(selectedFragments, fragment.id);
                    const isSelected = selectedCount > 0;
                    const canSelect =
                      viewMode === "combine" &&
                      selectedFragments.length < 2 &&
                      fragment.count > selectedCount;
                    return (
                      <motion.div key={fragment.id} whileHover={canSelect ? { x: 3 } : {}} whileTap={canSelect ? { scale: 0.985 } : {}}>
                        <Card
                          onClick={() => (viewMode === "combine" && (canSelect || isSelected) ? handleSelectFragment(fragment.id) : undefined)}
                          className="p-3 transition-all relative overflow-hidden"
                          style={
                            isSelected
                              ? { ...shellTone.selected, cursor: "pointer" }
                              : canSelect
                                ? { ...shellTone.surface, cursor: "pointer" }
                                : { ...shellTone.surface, opacity: 0.56, cursor: "not-allowed" }
                          }
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="w-14 h-14 rounded-lg flex items-center justify-center relative overflow-hidden" style={shellTone.panelSoft}>
                                {fragment.image ? (
                                  <img src={fragment.image} alt={fragment.name} className="w-full h-full object-cover rounded-lg" />
                                ) : (
                                  <span className="text-2xl">🃏</span>
                                )}
                              </div>
                              <div
                                className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ background: shellTone.accentStrong }}
                              >
                                {fragment.count}
                              </div>
                              {isSelected && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="absolute -top-1 -left-1 min-w-6 h-6 rounded-full px-1 flex items-center justify-center text-[0.68rem] font-bold"
                                  style={{ background: shellTone.success, color: "#ffffff" }}
                                >
                                  {selectedCount}
                                </motion.div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[0.64rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: shellTone.accentSoft, border: shellTone.surface.border, color: shellTone.accent }}>
                                  {fragment.team}
                                </span>
                              </div>
                              <h4 className="text-sm truncate mb-1" style={{ color: shellTone.text }}>{fragment.name}</h4>
                              <p className="text-xs leading-5" style={{ color: shellTone.muted }}>{fragment.note}</p>
                              <p className="mt-1 text-[0.7rem] font-semibold" style={{ color: shellTone.accent }}>
                                완성 결과 · {fragment.resultName}
                              </p>
                              {fragment.marketAssetId && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/market?fragment=${fragment.marketAssetId}`); }}
                                  className="mt-2 text-[0.72rem] font-semibold text-left"
                                  style={{ color: shellTone.accent }}
                                >
                                  {fragment.count > 0 ? "시세 보기 →" : "장터에서 바로 사기 →"}
                                </button>
                              )}
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="nfts" className="mt-0 p-4 max-h-[620px] overflow-y-scroll lg:max-h-none lg:flex-1 lg:basis-0 lg:min-h-0">
                <div className="space-y-2">
                  {cardInventory.map((card) => (
                    <Card key={card.id} className="p-3" style={shellTone.surface}>
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-lg flex items-center justify-center relative overflow-hidden" style={shellTone.panelSoft}>
                          {card.image ? (
                            <img src={card.image} alt={card.name} className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <span className="text-2xl">🃏</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[0.64rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: shellTone.accentSoft, border: shellTone.surface.border, color: shellTone.accent }}>
                              {card.team}
                            </span>
                          </div>
                          <h4 className="text-sm truncate mb-1" style={{ color: shellTone.text }}>{card.name}</h4>
                          <p className="text-xs leading-5" style={{ color: shellTone.muted }}>{card.note}</p>
                          {card.marketAssetId && (
                            <button
                              onClick={() => navigate(`/market?fragment=${card.marketAssetId}`)}
                              className="mt-2 text-[0.7rem] font-semibold"
                              style={{ color: shellTone.accent }}
                            >
                              이 카드 시세 보러가기
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                  {cardInventory.length === 0 && (
                    <p className="text-sm text-center py-8" style={{ color: shellTone.muted }}>아직 완성 카드가 없습니다</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="space-y-6">
          {viewMode === "openBox" ? (
            <>
              <Card className="p-6 relative overflow-hidden" style={shellTone.panel}>
                <div className="absolute inset-0" style={{ background: isDark ? "linear-gradient(90deg, rgba(67, 108, 158, 0.14), rgba(58, 80, 106, 0.04))" : "linear-gradient(90deg, rgba(85,109,136,0.08), rgba(124,141,161,0.03))" }}></div>
                <div className="flex items-start gap-4 relative z-10">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={shellTone.panelSoft}>
                    <Sparkles className="w-6 h-6" style={{ color: shellTone.success }} />
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold" style={{ color: shellTone.text }}>랜덤 박스 안내</h3>
                    <ul className="space-y-1 text-sm" style={{ color: shellTone.muted }}>
                      <li>• 랜덤 박스를 열면 굿즈 카드 조합에 필요한 파편을 획득할 수 있습니다.</li>
                      <li>• 획득한 파편은 왼쪽 인벤토리에 자동으로 추가됩니다.</li>
                      <li>• 같은 파편 2개를 모으면 파편 조합에서 원본 굿즈 카드를 만들 수 있습니다.</li>
                    </ul>
                  </div>
                </div>
              </Card>

              <Card className="p-8 relative overflow-hidden lg:min-h-[724px]" style={shellTone.panelStrong}>
                <div className="relative z-10 grid xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
                  <div className="space-y-5">
                    <div>
                      <h2 className="section-title" style={{ color: shellTone.text }}>박스 개봉</h2>
                      <p className="mt-2 text-sm leading-6" style={{ color: shellTone.muted }}>
                        어떤 파편이 나올지 모르는 박스를 열고, 필요한 파편을 모아 원본 굿즈 카드로 조합해보세요.
                      </p>
                    </div>
                    <div className="rounded-[22px] p-5 flex items-center gap-5" style={shellTone.surface}>
                      <div className="w-24 h-24 rounded-[20px] flex items-center justify-center" style={shellTone.panelSoft}>
                        <Package className="w-12 h-12" style={{ color: "#d39a49" }} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.68rem] px-2.5 py-1 rounded-full font-semibold" style={{ background: shellTone.accentSoft, color: shellTone.accent, border: shellTone.surface.border }}>랜덤 박스</span>
                          <span className="text-[0.68rem] px-2.5 py-1 rounded-full font-semibold" style={{ background: "#d39a49", color: "#ffffff" }}>보유 {seasonBoxCount}개</span>
                        </div>
                        <p className="text-lg font-bold" style={{ color: shellTone.text }}>랜덤 박스</p>
                        <p className="text-sm leading-6" style={{ color: shellTone.muted }}>별도 선택 없이 바로 열리며, 개봉 결과는 왼쪽 인벤토리에 자동 반영됩니다.</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[20px] p-5" style={shellTone.surface}>
                    <p className="text-sm font-semibold mb-3" style={{ color: shellTone.text }}>나올 수 있는 보상</p>
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                      {(allBoxRewards.length > 0 ? allBoxRewards : boxRewardsPreview).map((reward, index) => (
                        <div key={index} className="flex items-center gap-3 rounded-[16px] px-3 py-3" style={shellTone.panelSoft}>
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={shellTone.surface}>
                            {reward.image ? (
                              <img src={reward.image} alt={reward.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl">🃏</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate" style={{ color: shellTone.text }}>{reward.name}</p>
                            {reward.type && (
                              <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-medium mt-0.5 inline-block" style={{ background: reward.type === 'goods' ? '#d39a49' : shellTone.accentSoft, color: reward.type === 'goods' ? '#ffffff' : shellTone.accent }}>
                                {reward.type === 'goods' ? '원본 NFT' : '파편'}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {allBoxRewards.length === 0 && boxRewardsPreview.length === 0 && (
                        <p className="text-sm text-center py-8" style={{ color: shellTone.muted }}>보상 목록을 불러오는 중이에요.</p>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleOpenBox}
                  disabled={!canOpen || opening}
                  size="lg"
                  className="mt-6 w-full font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: shellTone.accentStrong, color: "#ffffff" }}
                >
                  <Package className="w-5 h-5 mr-2" />
                  {opening ? "박스 여는 중..." : "랜덤 박스 열기"}
                </Button>
              </Card>
            </>
          ) : (
            <>
              <Card className="p-6 relative overflow-hidden" style={shellTone.panel}>
                <div className="absolute inset-0" style={{ background: isDark ? "linear-gradient(90deg, rgba(67, 108, 158, 0.14), rgba(58, 80, 106, 0.04))" : "linear-gradient(90deg, rgba(85,109,136,0.08), rgba(124,141,161,0.03))" }}></div>
                <div className="flex items-start gap-4 relative z-10">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={shellTone.panelSoft}>
                    <Sparkles className="w-6 h-6" style={{ color: shellTone.success }} />
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold" style={{ color: shellTone.text }}>조합 시스템 안내</h3>
                    <ul className="space-y-1 text-sm" style={{ color: shellTone.muted }}>
                      <li>• 같은 종류의 파편 2개를 조합해야 원본 굿즈 1개를 만들 수 있습니다.</li>
                      <li>• 부족한 파편은 상자 개봉이나 장터에서 구매 후 획득할 수 있습니다.</li>
                      <li>• 완성된 원본 굿즈 카드는 실물 굿즈 교환에 사용할 수 있습니다.</li>
                    </ul>
                  </div>
                </div>
              </Card>

              <Card className="p-8 relative overflow-hidden" style={shellTone.panelStrong}>
                <div className="relative z-10 space-y-8">
                  <div>
                    <div>
                      <h2 className="section-title" style={{ color: shellTone.text }}>조합 미리보기</h2>
                      <p className="mt-2 text-sm leading-6" style={{ color: shellTone.muted }}>
                        현재 선택한 파편이 오른쪽 결과 카드로 어떻게 이어지는지 바로 확인할 수 있어요.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4 lg:gap-6">
                      {[0, 1].map((index) => {
                        const fragment = selectedFragmentObjects[index];
                        return (
                          <div key={index} className="min-w-0">
                            <div
                              className="aspect-square rounded-[22px] flex items-center justify-center relative overflow-hidden"
                              style={fragment ? shellTone.panelSoft : { ...shellTone.surface, border: `2px dashed ${shellTone.dashed}` }}
                            >
                              {fragment ? (
                                <>
                                  {fragment.image ? (
                                    <img src={fragment.image} alt={fragment.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-5xl">🃏</span>
                                  )}
                                </>
                              ) : (
                                <PlusPlaceholder />
                              )}
                            </div>
                            <p className="text-xs text-center mt-3 leading-5" style={{ color: fragment ? shellTone.text : shellTone.muted }}>
                              {fragment ? fragment.name : "파편을 선택하세요"}
                            </p>
                          </div>
                        );
                      })}

                    <div className="flex justify-center pt-[calc(50%-1.75rem)]">
                      <div className="p-3 rounded-full shrink-0" style={shellTone.surface}>
                        <ArrowRight className="w-8 h-8" style={{ color: shellTone.accent }} />
                      </div>
                    </div>

                    <div className="min-w-0 space-y-4">
                      <div
                        className={`aspect-square rounded-[22px] flex items-center justify-center relative overflow-hidden ${canCombine ? "animate-pulse" : ""}`}
                        style={canCombine ? shellTone.panelSoft : { ...shellTone.surface, border: `2px dashed ${shellTone.dashed}` }}
                      >
                        {canCombine && expectedCombineResult ? (
                          <>
                            {expectedCombineResult.image ? (
                              <img src={expectedCombineResult.image} alt={expectedCombineResult.name} className="relative z-10 w-full h-full object-cover" />
                            ) : (
                              <span className="relative z-10 text-6xl">🃏</span>
                            )}
                          </>
                        ) : (
                          <Sparkles className="w-16 h-16" style={{ color: shellTone.muted }} />
                        )}
                      </div>

                      {expectedCombineResult ? (
                        <div className="rounded-[18px] px-4 py-4" style={shellTone.surface}>
                          <div className="flex items-center gap-2 mb-2">
                            <Star className="w-4 h-4" style={{ color: shellTone.success }} />
                            <p className="text-sm font-semibold" style={{ color: shellTone.text }}>{expectedCombineResult.name}</p>
                          </div>
                          <p className="text-xs leading-5" style={{ color: shellTone.muted }}>{expectedCombineResult.description}</p>
                        </div>
                      ) : (
                        <p className="text-sm leading-6" style={{ color: shellTone.muted }}>
                          같은 파편을 조합하여 원본<br />
                          굿즈 카드를 완성하세요.
                        </p>
                      )}
                    </div>
                  </div>

                  {!canCombine && (
                    <div className="rounded-[18px] px-4 py-4" style={shellTone.surface}>
                      <p className="text-[0.82rem] font-semibold" style={{ color: shellTone.text }}>
                        같은 파편 2개를 아직 고르지 않았어요
                      </p>
                      <p className="mt-2 text-[0.78rem] leading-6" style={{ color: shellTone.muted }}>
                        파편이 1개뿐이라면 상자 개봉을 시도하거나 장터에서 같은 파편을 구매하여 같은 파편을 획득 후, 완성할 수 있습니다.
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={handleCombine}
                    disabled={!canCombine || combining}
                    size="lg"
                    className="w-full font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: shellTone.accentStrong, color: "#ffffff" }}
                  >
                    <Layers className="w-5 h-5 mr-2" />
                    {combining ? "완성 중..." : "원본 굿즈 카드 만들기"}
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {combining && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center">
            <div className="relative">
              {selectedFragmentObjects.map((fragment, index) => {
                const angle = index === 0 ? 210 : 330;
                const radius = 95;
                const radian = (angle * Math.PI) / 180;
                return (
                  <motion.div key={`${fragment.id}-${index}`} className="absolute" initial={{ x: Math.cos(radian) * radius, y: Math.sin(radian) * radius, scale: 1 }} animate={{ x: 0, y: 0, scale: 0.1, rotate: 240 }} transition={{ duration: 1.6, ease: "easeInOut" }}>
                    {fragment.image
                      ? <img src={fragment.image} alt={fragment.name} className="w-16 h-16 rounded-xl object-cover" />
                      : <span className="text-6xl">🃏</span>
                    }
                  </motion.div>
                );
              })}
              <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, 160, 320] }} transition={{ duration: 1.6, repeat: Infinity }}>
                <Sparkles className="w-24 h-24" style={{ color: "#e1b86e" }} />
              </motion.div>
            </div>
          </motion.div>
        )}

        {opening && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center">
            <div className="relative">
              <motion.div animate={{ rotateY: [0, 360], scale: [1, 1.18, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
                <div className="text-9xl">📦</div>
              </motion.div>
              <motion.div className="absolute inset-0 flex items-center justify-center" animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }}>
                <Sparkles className="w-24 h-24" style={{ color: "#e1b86e" }} />
              </motion.div>
            </div>
          </motion.div>
        )}

        {result && !combining && (
          <ResultModal title="완성 완료" result={result} shellTone={shellTone} onClose={handleCloseResult} onOpenMarket={(assetId) => navigate(`/market?fragment=${assetId}`)} />
        )}

        {openResult && !opening && (
          <ResultModal title={openResult.type === "goods" ? "원본 굿즈 NFT 획득!" : openResult.type === "card" ? "완성 카드 획득" : "파편 획득"} result={openResult} shellTone={shellTone} onClose={handleCloseOpenResult} onOpenMarket={(assetId) => navigate(`/market?fragment=${assetId}`)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function PlusPlaceholder() {
  return <span className="text-[2.6rem] font-light leading-none opacity-70">+</span>;
}

function ResultModal({
  title,
  result,
  shellTone,
  onClose,
  onOpenMarket,
}: {
  title: string;
  result: RewardResult;
  shellTone: {
    panelStrong: { background: string; border: string; boxShadow: string };
    panelSoft: { background: string; border: string };
    text: string;
    muted: string;
    accentStrong: string;
  };
  onClose: () => void;
  onOpenMarket: (assetId: string) => void;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.84, y: 18 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", duration: 0.55 }} onClick={(event) => event.stopPropagation()}>
        <Card className="p-8 max-w-md relative overflow-hidden" style={shellTone.panelStrong}>
          <div className="relative z-10 text-center">
            <Sparkles className="w-12 h-12 mx-auto mb-4" style={{ color: "#e1b86e" }} />
            <h2 className="section-title mb-4" style={{ color: shellTone.text }}>{title}</h2>
            <div className="w-44 h-44 mx-auto mb-6 rounded-[22px] flex items-center justify-center overflow-hidden" style={shellTone.panelSoft}>
              {result.image
                ? <img src={result.image} alt={result.name} className="w-full h-full object-cover" />
                : <span className="text-8xl">🃏</span>
              }
            </div>
            <h3 className="mb-4 text-xl font-bold tracking-[-0.03em]" style={{ color: shellTone.text }}>{result.name}</h3>
            <p className="text-sm leading-6 mb-6" style={{ color: shellTone.muted }}>{result.description}</p>
            {result.txHash && (
              <a
                href={`https://explorer.hoodi.ethpandaops.io/tx/${result.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[0.72rem] mb-4 px-3 py-2 rounded-lg truncate"
                style={{ background: shellTone.panelSoft.background, color: shellTone.muted, border: shellTone.panelSoft.border }}
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Tx: {result.txHash}</span>
                {result.onChain === "pending" && <span className="shrink-0 text-yellow-400">(처리 중)</span>}
              </a>
            )}
            <div className="space-y-3">
              {result.marketAssetId && (
                <Button onClick={() => onOpenMarket(result.marketAssetId!)} className="w-full font-bold" style={{ background: shellTone.panelSoft.background, color: shellTone.text, border: shellTone.panelSoft.border }}>
                  관련 장터 보러가기
                </Button>
              )}
              <Button onClick={onClose} className="w-full font-bold" style={{ background: shellTone.accentStrong, color: "#ffffff" }}>
                확인
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
