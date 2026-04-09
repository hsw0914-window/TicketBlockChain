import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Moon,
  Sun,
  Wallet,
  Settings2,
  Ticket,
  ShoppingBag,
  Pencil,
  Check,
  X as CloseX,
  // ✨ 아래 아이콘들이 꼭 있어야 빨간 줄이 안 생깁니다!
  FileText,
  MessageCircle,
  Bookmark,
  Store
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useAppSettings } from "../context/AppSettingsContext";

// 1. 필요한 타입 정의
type Preferences = {
  ticketAlerts: boolean;
  tradeAlerts: boolean;
  commentAlerts: boolean;
  mentionAlerts: boolean;
  requireTradeSignature: boolean;
  suspiciousPriceWarning: boolean;
  hideWalletAddress: boolean;
  allowCommunityMarketLink: boolean;
};

const PREFERENCES_STORAGE_KEY = "base-nine-user-preferences-v1";

const defaultPreferences: Preferences = {
  ticketAlerts: true,
  tradeAlerts: true,
  commentAlerts: true,
  mentionAlerts: true,
  requireTradeSignature: true,
  suspiciousPriceWarning: true,
  hideWalletAddress: true,
  allowCommunityMarketLink: true,
};

// 2. 설정 로드 함수
function loadPreferences() {
  if (typeof window === "undefined") return defaultPreferences;
  const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  if (!stored) return defaultPreferences;
  try {
    return { ...defaultPreferences, ...(JSON.parse(stored) as Partial<Preferences>) };
  } catch {
    return defaultPreferences;
  }
}

export function MyPage() {
  const {
    theme,
    setTheme,
    walletAddress,
    walletChainId,
    walletConnected,
    walletProviderName,
    isConnectingWallet,
    connectWallet,
    disconnectWallet,
  } = useAppSettings();

  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [dbUser, setDbUser] = useState<any>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [tempNickname, setTempNickname] = useState("");

  // 데이터 로딩 로직
  useEffect(() => {
    if (walletConnected && walletAddress) {
      const addr = walletAddress.toLowerCase();
      fetch(`http://localhost:3000/api/users/${addr}`)
        .then((res) => res.json())
        .then((data) => {
          setDbUser(data);
          if (data.preferences) {
            const parsed = typeof data.preferences === 'string' 
              ? JSON.parse(data.preferences) 
              : data.preferences;
            setPreferences(parsed);
          }
        })
        .catch((err) => console.error("백엔드 유저 로드 실패:", err));
    } else {
      setDbUser(null);
    }
  }, [walletConnected, walletAddress]);

  const handleUpdateNickname = async () => {
    if (!tempNickname.trim() || !walletAddress) return;
    try {
      const response = await fetch(`http://localhost:3000/api/users/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          walletAddress: walletAddress.toLowerCase(), 
          nickname: tempNickname, 
          preferences 
        })
      });
      if (response.ok) {
        setDbUser((prev: any) => ({ ...prev, nickname: tempNickname }));
        setIsEditingNickname(false);
      }
    } catch (err) {
      console.error("닉네임 수정 실패:", err);
    }
  };

  const nickname = dbUser?.nickname || "사용자";
  const memberId = useMemo(() => {
    const seed = nickname.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0).toString().padStart(6, "0");
    return `BN-${seed.slice(0, 6)}`;
  }, [nickname]);

  const visibleWalletAddress = walletAddress
    ? preferences.hideWalletAddress 
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` 
      : walletAddress
    : "연결된 지갑 없음";

  const networkLabel = useMemo(() => {
    if (walletChainId === "0x1") return "Ethereum Mainnet";
    if (walletChainId === "0x89") return "Polygon";
    if (walletChainId === "0xaa36a7") return "Sepolia";
    return walletChainId ? `Chain ${walletChainId}` : "네트워크 확인 전";
  }, [walletChainId]);

  return (
    <div className="page-shell space-y-8">
      {/* 1. 상단 타이틀 */}
      <div className="page-header">
        <div>
          <p className="page-eyebrow mb-2" style={{ color: "#526183" }}>My Page</p>
          <h1 className="page-title mb-2" style={{ color: "#1f3248" }}>내 프로필 설정</h1>
        </div>
      </div>

      {/* 2. 유저 정보 요약 */}
      <section className="rounded-[24px] border px-6 py-6" style={{ background: "#f8fafc", borderColor: "#d6dfe8", boxShadow: "0 10px 24px rgba(17, 40, 73, 0.05)" }}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[18px] text-xl font-bold text-white" style={{ background: "linear-gradient(135deg, #546d88, #71907e)" }}>
              {nickname.charAt(0)}
            </div>
            <div>
              {isEditingNickname ? (
                <div className="flex items-center gap-2">
                  <input 
                    className="border-b-2 border-[#546d88] bg-transparent text-[1.3rem] font-bold outline-none w-40"
                    value={tempNickname}
                    onChange={(e) => setTempNickname(e.target.value)}
                    autoFocus
                  />
                  <button onClick={handleUpdateNickname} className="text-green-600"><Check size={20} /></button>
                  <button onClick={() => setIsEditingNickname(false)} className="text-red-400"><CloseX size={20} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setIsEditingNickname(true); setTempNickname(nickname); }}>
                  <p className="text-[1.3rem] font-bold" style={{ color: "#1f3248" }}>{nickname}</p>
                  <Pencil size={16} className="text-gray-400 opacity-0 group-hover:opacity-100" />
                </div>
              )}
              <div className="mt-2 flex gap-2 text-[0.8rem]" style={{ color: "#6d7d90" }}>
                <span className="rounded-full border px-2.5 py-1" style={{ background: "#eef2f6", borderColor: "#d0d8e2" }}>ID: {memberId}</span>
                <span className="rounded-full border px-2.5 py-1" style={{ background: "#eef2f6", borderColor: "#d0d8e2" }}>자산: {dbUser?.assets || 0} ETH</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 하단 활동 내역 & 지갑 연결 */}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* 왼쪽: 내 활동 내역 (중앙 정렬 + 파스텔 + 반토막 크기) */}
        <section className="rounded-[24px] border px-6 py-6 flex flex-col" style={{ background: "#f8fafc", borderColor: "#d6dfe8", boxShadow: "0 10px 24px rgba(17, 40, 73, 0.05)" }}>
          <div className="mb-6 flex items-center gap-3">
            <Settings2 className="h-5 w-5" style={{ color: "#526183" }} />
            <h2 className="section-title text-[1.15rem]" style={{ color: "#1f3248" }}>내 활동 내역</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
            {[
              { icon: FileText, label: "내 글", count: "0", bg: "#eff6ff", text: "#3b82f6", border: "#dbeafe" },
              { icon: MessageCircle, label: "내 댓글", count: "0", bg: "#f0fdf4", text: "#22c55e", border: "#dcfce7" },
              { icon: Bookmark, label: "북마크", count: "0", bg: "#fefce8", text: "#ca8a04", border: "#fef9c3" },
              { icon: Store, label: "매물", count: "0", bg: "#faf5ff", text: "#a855f7", border: "#f3e8ff" },
            ].map((item) => (
              <button 
                key={item.label} 
                className="rounded-[24px] border h-[140px] transition-all hover:brightness-95 group flex flex-col items-center justify-center gap-2"
                style={{ background: item.bg, borderColor: item.border }}
              >
                {/* 아이콘 크기 확대 및 중앙 정렬 */}
                <item.icon className="h-10 w-10 transition-transform group-hover:scale-110" style={{ color: item.text }} />
                
                <div className="text-center">
                  {/* 글씨 크기 확대 및 중앙 정렬 */}
                  <p className="text-[1rem] font-bold" style={{ color: item.text, opacity: 0.9 }}>{item.label}</p>
                  <p className="text-[1.8rem] font-black" style={{ color: item.text }}>{item.count}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* 오른쪽: 지갑 연결 */}
        <aside className="flex flex-col">
          <section className="rounded-[24px] border px-6 py-6 h-full flex flex-col justify-between" style={{ background: "#f8fafc", borderColor: "#d6dfe8", boxShadow: "0 10px 24px rgba(17, 40, 73, 0.05)" }}>
            <div>
              <div className="mb-5 flex items-center gap-3">
                <Wallet className="h-5 w-5" style={{ color: "#526183" }} />
                <h2 className="section-title text-[1.15rem]" style={{ color: "#1f3248" }}>지갑 연결</h2>
              </div>
              
              <div className="rounded-[18px] border px-4 py-4 mb-4" style={{ background: "#eef2f6", borderColor: "#d3dbe4" }}>
                <p className="text-[0.76rem] font-semibold text-[#6d7d90]">현재 상태</p>
                <p className="mt-2 text-[0.98rem] font-bold text-[#1f3248] truncate">{walletProviderName || "연결 안 됨"}</p>
                <div className="mt-3 space-y-2 text-[0.84rem] text-[#6d7d90]">
                  <div className="flex items-center justify-between gap-3">
                    <span>주소</span>
                    <span className="text-[#22364b] font-mono">{visibleWalletAddress}</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Button className="w-full h-11 rounded-[14px] font-semibold text-white bg-[#526183]" onClick={() => void connectWallet()} disabled={isConnectingWallet}>
                <Wallet className="mr-2 h-4 w-4" />
                {isConnectingWallet ? "연결 중..." : walletConnected ? "연결 확인됨" : "메타마스크 연결"}
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}