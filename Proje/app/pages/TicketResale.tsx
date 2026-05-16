import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Ticket, Plus, X, Loader2, CheckCircle2, AlertCircle, Trash2, ExternalLink, Lock, Wallet, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useAppSettings } from "../context/AppSettingsContext";
import { getDidStatus } from "../api/didApi";
import {
  approveTicketForMarketplace,
  listTicketOnMarketplace,
  buyTicketFromMarketplace,
  cancelTicketListingOnChain,
  krwToWei,
} from "../lib/contract";

const API = "http://localhost:4000/api/ticket-resale";
const HOODI_EXPLORER = "https://hoodi.ethpandaops.io/tx";

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}`,
  };
}

const KBO_TEAMS = ["LG", "두산", "KIA", "삼성", "SSG", "롯데", "NC", "키움", "한화", "KT"];
const MAX_PRICE_RATIO = 1.1;

// ── 타입 ──────────────────────────────────────────────────────

interface Listing {
  id: string;
  sellerName: string;
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  seatSection: string;
  originalPrice: number;
  listedPrice: number;
  listedAt: string;
  nftTokenId: number | null;
  priceWei: string | null;
  isMine: boolean;
}

interface MyListing {
  id: string;
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  seatSection: string;
  originalPrice: number;
  listedPrice: number;
  status: string;
  createdAt: string;
  nftTokenId: number | null;
  priceWei: string | null;
}

interface Trade {
  id: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  seatSection: string;
  listedPrice: number;
  role: "bought" | "sold";
  tradedAt: string | null;
}

interface MyTicket {
  id: string;
  tokenId: number | null;
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  stadiumName: string;
  seatSection: string;
  originalPrice: number;
  status: string;
}

// ─────────────────────────────────────────────────────────────

const neutralText  = "#1c2f4a";
const mutedText    = "#728195";
const lineColor    = "#d6dee7";
const actionBlue   = "#4b6581";
const priceGreen   = "#547b63";
const panelStyle   = { background: "#f8fafc", border: "1px solid #d6dee8", boxShadow: "0 10px 24px rgba(17,40,73,.05)" };
const mutedPanel   = { background: "#eef2f5", border: "1px solid #dde4ec" };
const accentSurface = "#e9eef4";
const accentBorder  = "#c6d2df";

function weiToGwei(priceWei: string | null): string {
  if (!priceWei) return "";
  try {
    const gwei = Number(BigInt(priceWei)) / 1e9;
    return gwei.toLocaleString() + " Gwei";
  } catch { return ""; }
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a href={`${HOODI_EXPLORER}/${hash}`} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[0.72rem] hover:underline"
      style={{ color: actionBlue }}>
      Tx {hash.slice(0, 10)}… <ExternalLink className="w-3 h-3" />
    </a>
  );
}

export function TicketResale() {
  const { isLoggedIn, user } = useAuth();
  const { walletConnected, connectWallet, isConnectingWallet } = useAppSettings();
  const navigate = useNavigate();

  // ── DID 인증 상태 ──────────────────────────────────────────
  const [didVerified, setDidVerified] = useState(false);
  const [didLoading, setDidLoading]   = useState(true);

  useEffect(() => {
    if (!isLoggedIn) { setDidLoading(false); return; }
    getDidStatus()
      .then(s => setDidVerified(s.did_status === "verified"))
      .catch(() => setDidVerified(false))
      .finally(() => setDidLoading(false));
  }, [isLoggedIn]);

  // ── 브라우즈 상태 ──────────────────────────────────────────
  const [listings, setListings]       = useState<Listing[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [sort, setSort]               = useState<"date_asc" | "price_asc" | "price_desc">("date_asc");

  // ── 구매 상태 ──────────────────────────────────────────────
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [buyStep, setBuyStep]   = useState(0); // 0=none 1=confirm 2=metamask 3=done
  const [buyError, setBuyError] = useState("");
  const [buying, setBuying]     = useState(false);
  const [buyTxHash, setBuyTxHash] = useState("");

  // ── 내 거래 상태 ──────────────────────────────────────────
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [history, setHistory]       = useState<Trade[]>([]);
  const [myTab, setMyTab]           = useState<"active" | "history">("active");
  const [cancelling, setCancelling] = useState<string | null>(null);

  // ── 티켓 올리기 모달 ──────────────────────────────────────
  const [showPostModal, setShowPostModal] = useState(false);
  const [myTickets, setMyTickets]         = useState<MyTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<MyTicket | null>(null);
  const [listedPrice, setListedPrice]     = useState("");
  const [posting, setPosting]             = useState(false);
  const [postError, setPostError]         = useState("");
  const [postStep, setPostStep]           = useState<"idle" | "approving" | "listing" | "saving">("idle");

  // ── 조회 ──────────────────────────────────────────────────
  const fetchListings = useCallback(async () => {
    setLoadingList(true);
    try {
      const qs = new URLSearchParams({ sort });
      selectedTeams.forEach(t => qs.append("team", t));
      const res = await fetch(`${API}/listings?${qs}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}` },
      });
      const data = await res.json();
      setListings(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoadingList(false);
  }, [sort, selectedTeams]);

  const fetchMine = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const res  = await fetch(`${API}/my`, { headers: authHeaders() });
      const data = await res.json();
      setMyListings(data.myListings ?? []);
      setHistory(data.history ?? []);
    } catch { /* ignore */ }
  }, [isLoggedIn]);

  useEffect(() => { fetchListings(); }, [fetchListings]);
  useEffect(() => { fetchMine(); }, [fetchMine]);

  const fetchMyTickets = async () => {
    setLoadingTickets(true);
    try {
      const res  = await fetch(`${API}/my-tickets`, { headers: authHeaders() });
      const data = await res.json();
      setMyTickets(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoadingTickets(false);
  };

  // ── 구매 ──────────────────────────────────────────────────
  async function handleBuy() {
    if (!selectedListing) return;
    setBuying(true); setBuyError(""); setBuyTxHash("");

    let txHash: string | null = null;

    // 온체인 거래가 있는 경우 MetaMask 호출
    if (selectedListing.nftTokenId !== null && selectedListing.priceWei) {
      setBuyStep(2); // MetaMask 확인 중
      try {
        const priceWei = BigInt(selectedListing.priceWei);
        txHash = await buyTicketFromMarketplace(selectedListing.nftTokenId, priceWei);
        setBuyTxHash(txHash);
      } catch (err: unknown) {
        const e = err as { code?: number; message?: string };
        const msg = e.code === 4001 ? "MetaMask에서 거래를 취소했습니다." : (e.message ?? "MetaMask 오류");
        setBuyError(msg);
        setBuying(false);
        setBuyStep(1);
        return;
      }
    }

    // 서버 DB 업데이트
    try {
      const res  = await fetch(`${API}/buy/${selectedListing.id}`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ buyTxHash: txHash }),
      });
      const data = await res.json();
      if (!res.ok) { setBuyError(data.error ?? "구매 실패"); setBuying(false); setBuyStep(1); return; }
      setBuyStep(3);
      fetchListings(); fetchMine();
    } catch { setBuyError("네트워크 오류"); setBuyStep(1); }
    setBuying(false);
  }

  // ── 취소 ──────────────────────────────────────────────────
  async function handleCancel(listing: MyListing) {
    setCancelling(listing.id);
    try {
      // 온체인 취소 (NFT가 있는 경우)
      if (listing.nftTokenId !== null) {
        try {
          await cancelTicketListingOnChain(listing.nftTokenId);
        } catch (err: unknown) {
          const e = err as { code?: number; message?: string };
          if (e.code === 4001) { alert("MetaMask에서 취소를 거부했습니다."); setCancelling(null); return; }
          // MetaMask 오류 시에도 DB만 취소하는 것은 위험하므로 중단
          alert("온체인 취소 실패: " + (e.message ?? "오류"));
          setCancelling(null);
          return;
        }
      }
      const res  = await fetch(`${API}/listings/${listing.id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) alert(data.error ?? "취소 실패");
      else { fetchListings(); fetchMine(); }
    } catch { alert("네트워크 오류"); }
    setCancelling(null);
  }

  // ── 등록 ──────────────────────────────────────────────────
  async function handlePost() {
    if (!selectedTicket || !listedPrice) { setPostError("티켓과 가격을 선택해주세요"); return; }
    const price = Number(listedPrice);
    const max   = Math.floor(selectedTicket.originalPrice * MAX_PRICE_RATIO);
    if (price > max) { setPostError(`원가의 110% (${max.toLocaleString()}원)를 초과할 수 없습니다`); return; }
    if (price < 1000) { setPostError("1,000원 이상이어야 합니다"); return; }

    setPosting(true); setPostError("");

    let nftTokenId: number | null = null;
    let priceWei: string | null   = null;
    let listTxHash: string | null = null;

    // 온체인 등록 (NFT tokenId가 있는 경우)
    if (selectedTicket.tokenId !== null) {
      const wei = krwToWei(price);
      nftTokenId = selectedTicket.tokenId;
      priceWei   = wei.toString();

      // Step 1: approve
      setPostStep("approving");
      try {
        await approveTicketForMarketplace(selectedTicket.tokenId);
      } catch (err: unknown) {
        const e = err as { code?: number; message?: string };
        setPostError(e.code === 4001 ? "MetaMask에서 approve를 취소했습니다." : (e.message ?? "approve 오류"));
        setPosting(false); setPostStep("idle"); return;
      }

      // Step 2: listTicket
      setPostStep("listing");
      try {
        listTxHash = await listTicketOnMarketplace(selectedTicket.tokenId, wei);
      } catch (err: unknown) {
        const e = err as { code?: number; message?: string };
        setPostError(e.code === 4001 ? "MetaMask에서 등록을 취소했습니다." : (e.message ?? "listTicket 오류"));
        setPosting(false); setPostStep("idle"); return;
      }
    }

    // Step 3: MetaMask 서명
    let sellerWalletAddress: string | null = null;
    let listingMessage: string | null = null;
    let listingSignature: string | null = null;
    try {
      const { BrowserProvider } = await import("ethers");
      const provider = new BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      sellerWalletAddress = await signer.getAddress();
      listingMessage = `Listing ticket ${selectedTicket.id} for ${price} KRW at ${Date.now()}`;
      listingSignature = await signer.signMessage(listingMessage);
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string };
      setPostError(e.code === 4001 ? "MetaMask 서명을 취소했습니다." : (e.message ?? "서명 오류"));
      setPosting(false); setPostStep("idle"); return;
    }

    // Step 4: 서버 등록
    setPostStep("saving");
    try {
      const res  = await fetch(`${API}/listings`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ ticketId: selectedTicket.id, listedPrice: price, nftTokenId, priceWei, listTxHash, sellerWalletAddress, listingMessage, listingSignature }),
      });
      const data = await res.json();
      if (!res.ok) { setPostError(data.error ?? "등록 실패"); setPosting(false); setPostStep("idle"); return; }
      setShowPostModal(false);
      setSelectedTicket(null); setListedPrice(""); setPostError(""); setPostStep("idle");
      fetchListings(); fetchMine();
    } catch { setPostError("네트워크 오류"); }
    setPosting(false); setPostStep("idle");
  }

  // ── 팀 토글 ───────────────────────────────────────────────
  const toggleTeam = (t: string) =>
    setSelectedTeams(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);



  // ── 등록 진행 메시지 ──────────────────────────────────────
  const postStepLabel =
    postStep === "approving" ? "MetaMask: NFT 승인 중…" :
    postStep === "listing"   ? "MetaMask: 장터 등록 중…" :
    postStep === "saving"    ? "서버 저장 중…" :
    "장터에 올리기";

  // ── 접근 제한 게이트 ─────────────────────────────────────
  const canAccess = isLoggedIn && walletConnected && didVerified;

  if (didLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: mutedText }} />
      </div>
    );
  }

  if (!canAccess) {
    const steps = [
      {
        done: isLoggedIn,
        icon: Lock,
        title: "로그인",
        desc: isLoggedIn ? `${user?.nickname ?? ""}님 로그인됨` : "서비스 이용을 위해 로그인이 필요합니다.",
        action: !isLoggedIn ? { label: "로그인하기", onClick: () => navigate("/login") } : null,
      },
      {
        done: walletConnected,
        icon: Wallet,
        title: "지갑 연결",
        desc: walletConnected ? "MetaMask 지갑 연결됨" : "MetaMask 지갑을 연결해 주세요.",
        action: isLoggedIn && !walletConnected
          ? { label: isConnectingWallet ? "연결 중..." : "MetaMask 연결", onClick: () => connectWallet() }
          : null,
      },
      {
        done: didVerified,
        icon: ShieldCheck,
        title: "DID 인증",
        desc: didVerified ? "DID 인증 완료" : "마이페이지에서 DID 인증을 완료해 주세요.",
        action: isLoggedIn && walletConnected && !didVerified
          ? { label: "마이페이지로 이동", onClick: () => navigate("/mypage") }
          : null,
      },
    ];

    return (
      <div className="w-full flex items-center justify-center" style={{ minHeight: "calc(100vh - 80px)" }}>
        <div className="w-full max-w-md mx-auto px-4 py-12 space-y-6">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: accentSurface, border: `1px solid ${accentBorder}` }}>
              <Ticket className="w-8 h-8" style={{ color: actionBlue }} />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: neutralText }}>티켓 양도 마켓</h1>
            <p className="text-sm" style={{ color: mutedText }}>이용을 위해 아래 단계를 모두 완료해 주세요.</p>
          </div>

          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="rounded-2xl p-4" style={step.done ? { background: "#f0faf4", border: "1px solid #b7ddc6" } : panelStyle}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: step.done ? "#d1f0df" : accentSurface }}>
                    {step.done
                      ? <CheckCircle2 className="w-5 h-5" style={{ color: "#3a7d55" }} />
                      : <step.icon className="w-5 h-5" style={{ color: actionBlue }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold" style={{ color: neutralText }}>{step.title}</span>
                      {step.done && <span className="text-[0.68rem] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#d1f0df", color: "#3a7d55" }}>완료</span>}
                    </div>
                    <p className="text-xs" style={{ color: mutedText }}>{step.desc}</p>
                    {step.action && (
                      <button
                        onClick={step.action.onClick}
                        disabled={isConnectingWallet}
                        className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ background: actionBlue, color: "#fff" }}
                      >
                        {step.action.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── JSX ──────────────────────────────────────────────────
  return (
    <div className="w-full" style={{ minHeight: "100vh" }}>

      {/* ── 헤더 ──────────────────────────────────────────── */}
      <section className="border-b" style={{
        borderColor: lineColor,
        background: "radial-gradient(circle at top left, rgba(83,111,141,.08), transparent 28%), linear-gradient(180deg,#eef2f5 0%,#e9eef2 100%)",
      }}>
        <div className="max-w-[1600px] mx-auto px-6 pt-8 pb-7">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[.22em]"
              style={{ background: "#eef4ff", border: "1px solid #c8d8ef", color: actionBlue }}>
              Ticket Exchange
            </span>
            <span className="rounded-full px-3 py-1 text-[0.72rem] font-semibold"
              style={{ background: "#edf7f1", border: "1px solid #cbe1d3", color: priceGreen }}>
              오픈 마켓 · 원가 110% 상한 · 3% 플랫폼 수수료
            </span>
          </div>
          <h1 style={{ color: neutralText, fontSize: "clamp(2rem,3.6vw,3.3rem)", fontWeight: 800, letterSpacing: "-.05em", lineHeight: 1.02 }}>
            티켓 거래소
          </h1>
          <p className="mt-3 text-[0.98rem] leading-7" style={{ color: mutedText }}>
            팬들이 직접 올린 티켓을 사고 팔 수 있어요. 블록체인 스마트컨트랙트가 거래를 보증하며 3% 수수료가 플랫폼에 자동 분배됩니다.
          </p>
        </div>
      </section>

      {/* ── 본문 ──────────────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="grid xl:grid-cols-[220px_1fr_300px] gap-6">

          {/* ── 왼쪽 필터 ────────────────────────────────── */}
          <aside className="space-y-5">
            <div className="rounded-[18px] p-4" style={panelStyle}>
              <p className="text-[0.72rem] font-bold uppercase tracking-[.16em] mb-3" style={{ color: mutedText }}>팀</p>
              <div className="space-y-2">
                {KBO_TEAMS.map(t => (
                  <label key={t} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={selectedTeams.includes(t)} onChange={() => toggleTeam(t)}
                      className="accent-[#4b6581] w-3.5 h-3.5" />
                    <span className="text-[0.88rem]" style={{ color: selectedTeams.includes(t) ? neutralText : mutedText, fontWeight: selectedTeams.includes(t) ? 600 : 400 }}>{t}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] p-4" style={panelStyle}>
              <p className="text-[0.72rem] font-bold uppercase tracking-[.16em] mb-3" style={{ color: mutedText }}>정렬</p>
              <div className="space-y-2">
                {[["date_asc","경기 날짜순"],["price_asc","낮은 가격순"],["price_desc","높은 가격순"]] .map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="radio" name="sort" value={val} checked={sort === val} onChange={() => setSort(val as typeof sort)}
                      className="accent-[#4b6581] w-3.5 h-3.5" />
                    <span className="text-[0.88rem]" style={{ color: sort === val ? neutralText : mutedText, fontWeight: sort === val ? 600 : 400 }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

          </aside>

          {/* ── 가운데 매물 목록 ──────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[0.88rem] font-semibold" style={{ color: mutedText }}>
                올라온 티켓 <span style={{ color: neutralText }}>{listings.length}건</span>
              </p>
              <button onClick={fetchListings} className="text-[0.8rem] px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ background: accentSurface, border: `1px solid ${accentBorder}`, color: actionBlue }}>
                새로고침
              </button>
            </div>

            {loadingList ? (
              <div className="flex justify-center items-center h-48">
                <Loader2 className="w-7 h-7 animate-spin" style={{ color: mutedText }} />
              </div>
            ) : listings.length === 0 ? (
              <div className="rounded-[20px] flex flex-col items-center justify-center py-20" style={panelStyle}>
                <Ticket className="w-12 h-12 mb-4" style={{ color: "#c8d4df" }} />
                <p className="font-semibold text-[1rem] mb-1" style={{ color: mutedText }}>올라온 티켓이 없어요</p>
                <p className="text-[0.84rem]" style={{ color: "#9aaab8" }}>티켓팜에서 성공했다면 오른쪽 버튼으로 올려보세요.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {listings.map(l => (
                  <div key={l.id}
                    className={`rounded-[18px] p-5 transition-all ${l.isMine ? "" : "cursor-pointer hover:shadow-md"}`}
                    style={{ ...panelStyle, transition: "box-shadow .2s", opacity: l.isMine ? 0.85 : 1 }}
                    onClick={() => { if (l.isMine) return; setSelectedListing(l); setBuyStep(1); setBuyError(""); setBuyTxHash(""); }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[0.72rem] font-bold px-2 py-0.5 rounded-md"
                            style={{ background: accentSurface, color: actionBlue, border: `1px solid ${accentBorder}` }}>
                            {l.gameDate}
                          </span>
                          <span className="text-[0.92rem] font-bold" style={{ color: neutralText }}>
                            {l.homeTeam} vs {l.awayTeam}
                          </span>
                          {l.isMine && (
                            <span className="text-[0.68rem] px-1.5 py-0.5 rounded-md font-bold"
                              style={{ background: "#edf7f1", color: priceGreen, border: "1px solid #cbe1d3" }}>
                              내 매물
                            </span>
                          )}
                          {l.nftTokenId !== null && (
                            <span className="text-[0.68rem] px-1.5 py-0.5 rounded-md font-semibold"
                              style={{ background: "#eef4ff", color: actionBlue, border: "1px solid #c8d8ef" }}>
                              NFT #{l.nftTokenId}
                            </span>
                          )}
                        </div>
                        <p className="text-[0.84rem]" style={{ color: mutedText }}>{l.seatSection}</p>
                        <p className="text-[0.76rem] mt-1" style={{ color: "#9aaab8" }}>
                          {l.sellerName} · {l.listedAt} 등록
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[1.22rem] font-bold" style={{ color: priceGreen }}>
                          {l.listedPrice.toLocaleString()}원
                        </p>
                        {l.priceWei && (
                          <p className="text-[0.68rem]" style={{ color: "#9aaab8" }}>
                            {weiToGwei(l.priceWei)}
                          </p>
                        )}
                        <p className="text-[0.72rem]" style={{ color: mutedText }}>
                          원가 {l.originalPrice.toLocaleString()}원
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 오른쪽 내 거래 ───────────────────────────── */}
          <aside>
            <div className="rounded-[20px] p-5" style={panelStyle}>
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-[0.95rem]" style={{ color: neutralText }}>내 거래</p>
                <button
                  onClick={() => { if (!isLoggedIn) { navigate("/login"); return; } fetchMyTickets(); setShowPostModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.82rem] font-bold transition-opacity hover:opacity-80"
                  style={{ background: actionBlue, color: "#fff", border: "none", cursor: "pointer" }}>
                  <Plus className="w-3.5 h-3.5" />티켓 올리기
                </button>
              </div>

              {/* 서브탭 */}
              <div className="flex gap-1 mb-4">
                {(["active","history"] as const).map(t => (
                  <button key={t} onClick={() => setMyTab(t)}
                    className="flex-1 py-1.5 rounded-lg text-[0.8rem] font-semibold transition-all"
                    style={{
                      background: myTab === t ? actionBlue : accentSurface,
                      color:      myTab === t ? "#fff" : mutedText,
                      border:     `1px solid ${myTab === t ? actionBlue : accentBorder}`,
                      cursor: "pointer",
                    }}>
                    {t === "active" ? "내가 올린 티켓" : "거래 이력"}
                  </button>
                ))}
              </div>

              {myTab === "active" && (
                myListings.length === 0 ? (
                  <p className="text-center text-[0.84rem] py-8" style={{ color: mutedText }}>올린 티켓이 없어요.</p>
                ) : (
                  <div className="space-y-2">
                    {myListings.map(l => (
                      <div key={l.id} className="rounded-[14px] p-3" style={mutedPanel}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-[0.84rem] font-semibold" style={{ color: neutralText }}>
                            {l.homeTeam} vs {l.awayTeam}
                          </p>
                          {l.nftTokenId !== null && (
                            <span className="text-[0.64rem] px-1.5 py-0.5 rounded font-semibold"
                              style={{ background: "#eef4ff", color: actionBlue, border: "1px solid #c8d8ef" }}>
                              NFT #{l.nftTokenId}
                            </span>
                          )}
                        </div>
                        <p className="text-[0.76rem] mb-1.5" style={{ color: mutedText }}>{l.gameDate} · {l.seatSection}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-[0.92rem] font-bold" style={{ color: priceGreen }}>{l.listedPrice.toLocaleString()}원</span>
                          <button onClick={() => handleCancel(l)} disabled={cancelling === l.id}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[0.74rem] font-semibold"
                            style={{ background: "#fce8e8", color: "#b94040", border: "1px solid #f0c4c4", cursor: "pointer" }}>
                            {cancelling === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            취소
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {myTab === "history" && (
                history.length === 0 ? (
                  <p className="text-center text-[0.84rem] py-8" style={{ color: mutedText }}>거래 이력이 없어요.</p>
                ) : (
                  <div className="space-y-2">
                    {history.map(h => (
                      <div key={h.id} className="rounded-[14px] p-3" style={mutedPanel}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[0.84rem] font-semibold" style={{ color: neutralText }}>
                            {h.homeTeam} vs {h.awayTeam}
                          </span>
                          <span className="text-[0.72rem] font-bold px-2 py-0.5 rounded-md"
                            style={{
                              background: h.role === "bought" ? "#edf7f1" : "#fff3e8",
                              color: h.role === "bought" ? priceGreen : "#b86a2e",
                              border: `1px solid ${h.role === "bought" ? "#cbe1d3" : "#f0d4b4"}`,
                            }}>
                            {h.role === "bought" ? "구매" : "판매"}
                          </span>
                        </div>
                        <p className="text-[0.76rem]" style={{ color: mutedText }}>{h.gameDate} · {h.tradedAt ?? "-"}</p>
                        <p className="text-[0.88rem] font-bold mt-1" style={{ color: neutralText }}>{h.listedPrice.toLocaleString()}원</p>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ════════ 구매 모달 ════════ */}
      {selectedListing && buyStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(17,40,73,.45)", backdropFilter: "blur(6px)" }}
          onClick={e => { if (e.target === e.currentTarget && !buying) { setSelectedListing(null); setBuyStep(0); } }}>
          <div className="w-full max-w-sm rounded-[24px] p-6" style={{ background: "#fff", border: "1px solid #d6dee8", boxShadow: "0 24px 64px rgba(17,40,73,.14)" }}>

            {(buyStep === 1 || buyStep === 2) && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[1.05rem] font-bold" style={{ color: neutralText }}>구매 확인</h2>
                  {!buying && (
                    <button onClick={() => { setSelectedListing(null); setBuyStep(0); }} style={{ background: "none", border: "none", cursor: "pointer", color: mutedText }}>
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
                <div className="rounded-[16px] p-4 mb-4 space-y-2.5" style={mutedPanel}>
                  {[
                    ["경기", `${selectedListing.homeTeam} vs ${selectedListing.awayTeam}`],
                    ["날짜", selectedListing.gameDate],
                    ["좌석", selectedListing.seatSection],
                    ["판매자", selectedListing.sellerName],
                    ["원가", `${selectedListing.originalPrice.toLocaleString()}원`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[0.85rem]">
                      <span style={{ color: mutedText }}>{k}</span>
                      <span style={{ color: neutralText, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t" style={{ borderColor: lineColor }}>
                    <div className="flex justify-between text-[0.95rem]">
                      <span style={{ color: mutedText }}>결제 금액</span>
                      <span style={{ color: priceGreen, fontWeight: 700 }}>{selectedListing.listedPrice.toLocaleString()}원</span>
                    </div>
                    {selectedListing.priceWei && (
                      <div className="flex justify-between text-[0.75rem] mt-1">
                        <span style={{ color: "#9aaab8" }}>온체인 가격</span>
                        <span style={{ color: "#9aaab8" }}>{weiToGwei(selectedListing.priceWei)}</span>
                      </div>
                    )}
                    {selectedListing.nftTokenId !== null && (
                      <div className="flex justify-between text-[0.75rem] mt-1">
                        <span style={{ color: "#9aaab8" }}>수수료</span>
                        <span style={{ color: "#9aaab8" }}>3% (스마트컨트랙트)</span>
                      </div>
                    )}
                  </div>
                </div>

                {buyStep === 2 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl text-[0.84rem] mb-3"
                    style={{ background: "#eef4ff", color: actionBlue, border: "1px solid #c8d8ef" }}>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    MetaMask에서 거래를 확인해주세요…
                  </div>
                )}

                {buyError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl text-[0.84rem] mb-3"
                    style={{ background: "#fce8e8", color: "#b94040", border: "1px solid #f0c4c4" }}>
                    <AlertCircle className="w-4 h-4 shrink-0" />{buyError}
                  </div>
                )}
                {!isLoggedIn ? (
                  <button onClick={() => navigate("/login")} className="w-full py-3 rounded-xl font-bold"
                    style={{ background: actionBlue, color: "#fff", border: "none", cursor: "pointer" }}>
                    로그인 후 구매
                  </button>
                ) : (
                  <button onClick={handleBuy} disabled={buying}
                    className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                    style={{ background: actionBlue, color: "#fff", border: "none", cursor: buying ? "not-allowed" : "pointer", opacity: buying ? .7 : 1 }}>
                    {buying && <Loader2 className="w-4 h-4 animate-spin" />}
                    {buying
                      ? (selectedListing.nftTokenId !== null ? "MetaMask 확인 중…" : "처리 중…")
                      : (selectedListing.nftTokenId !== null ? "MetaMask로 구매" : "구매하기")}
                  </button>
                )}
              </>
            )}

            {buyStep === 3 && (
              <>
                <div className="text-center mb-5">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: priceGreen }} />
                  <h2 className="text-[1.1rem] font-bold" style={{ color: neutralText }}>구매 완료!</h2>
                  {buyTxHash && (
                    <div className="mt-2">
                      <TxLink hash={buyTxHash} />
                    </div>
                  )}
                </div>
                <div className="rounded-[16px] p-4 mb-5 space-y-2.5" style={mutedPanel}>
                  {[
                    ["경기", `${selectedListing.homeTeam} vs ${selectedListing.awayTeam}`],
                    ["날짜", selectedListing.gameDate],
                    ["좌석", selectedListing.seatSection],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[0.85rem]">
                      <span style={{ color: mutedText }}>{k}</span>
                      <span style={{ color: neutralText, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t" style={{ borderColor: lineColor }}>
                    <div className="flex justify-between text-[0.95rem]">
                      <span style={{ color: mutedText }}>결제 금액</span>
                      <span style={{ color: priceGreen, fontWeight: 700 }}>{selectedListing.listedPrice.toLocaleString()}원</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setSelectedListing(null); setBuyStep(0); }}
                  className="w-full py-3 rounded-xl font-bold"
                  style={{ background: actionBlue, color: "#fff", border: "none", cursor: "pointer" }}>
                  확인
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════ 티켓 올리기 모달 ════════ */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(17,40,73,.45)", backdropFilter: "blur(6px)" }}
          onClick={e => { if (e.target === e.currentTarget && !posting) setShowPostModal(false); }}>
          <div className="w-full max-w-lg rounded-[24px] p-6" style={{ background: "#fff", border: "1px solid #d6dee8", boxShadow: "0 24px 64px rgba(17,40,73,.14)", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[1.05rem] font-bold" style={{ color: neutralText }}>티켓 올리기</h2>
              {!posting && (
                <button onClick={() => setShowPostModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: mutedText }}>
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {loadingTickets ? (
              <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin" style={{ color: mutedText }} /></div>
            ) : myTickets.length === 0 ? (
              <div className="text-center py-10">
                <Ticket className="w-10 h-10 mx-auto mb-3" style={{ color: "#c8d4df" }} />
                <p className="font-semibold" style={{ color: mutedText }}>양도 가능한 티켓이 없어요</p>
                <p className="text-[0.82rem] mt-1" style={{ color: "#9aaab8" }}>경기 예매 후 이용해주세요</p>
              </div>
            ) : (
              <>
                <p className="text-[0.82rem] mb-3" style={{ color: mutedText }}>양도할 티켓을 선택하세요</p>
                <div className="space-y-2 mb-5 max-h-52 overflow-y-auto pr-1">
                  {myTickets.map(t => (
                    <div key={t.id}
                      onClick={() => { setSelectedTicket(t); setListedPrice(String(t.originalPrice)); }}
                      className="rounded-[14px] p-3.5 cursor-pointer transition-all"
                      style={{
                        ...mutedPanel,
                        border: selectedTicket?.id === t.id ? `2px solid ${actionBlue}` : "1px solid #dde4ec",
                        background: selectedTicket?.id === t.id ? accentSurface : "#eef2f5",
                      }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[0.88rem] font-bold" style={{ color: neutralText }}>
                            {t.homeTeam} vs {t.awayTeam}
                          </p>
                          <p className="text-[0.78rem] mt-0.5" style={{ color: mutedText }}>
                            {t.gameDate} · {t.stadiumName} · {t.seatSection}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[0.84rem] font-bold" style={{ color: priceGreen }}>
                            {t.originalPrice.toLocaleString()}원
                          </p>
                          {t.tokenId !== null ? (
                            <p className="text-[0.68rem]" style={{ color: actionBlue, fontWeight: 600 }}>NFT #{t.tokenId}</p>
                          ) : (
                            <p className="text-[0.68rem]" style={{ color: "#9aaab8" }}>NFT 미발급</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedTicket && (
                  <>
                    <div className="mb-4">
                      <label className="block text-[0.8rem] font-semibold mb-1.5" style={{ color: mutedText }}>
                        판매 희망가
                        <span className="ml-1 font-normal" style={{ color: actionBlue }}>
                          (최대 {Math.floor(selectedTicket.originalPrice * MAX_PRICE_RATIO).toLocaleString()}원)
                        </span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="number" value={listedPrice} onChange={e => setListedPrice(e.target.value)}
                          className="flex-1 rounded-xl px-3 py-2.5 text-[0.9rem]"
                          style={{ border: "1px solid #cbd5e1", background: "#fcfdfe", color: neutralText, outline: "none" }} />
                        <span className="text-[0.88rem]" style={{ color: mutedText }}>원</span>
                      </div>
                      <p className="text-[0.76rem] mt-1" style={{ color: mutedText }}>
                        원가: {selectedTicket.originalPrice.toLocaleString()}원
                      </p>
                    </div>

                    {selectedTicket.tokenId !== null && listedPrice && Number(listedPrice) >= 1000 && (
                      <div className="rounded-[12px] p-3 mb-4 text-[0.78rem] space-y-1"
                        style={{ background: "#f0f4ff", border: "1px solid #c8d8ef", color: actionBlue }}>
                        <p className="font-semibold">온체인 등록 안내</p>
                        <p>MetaMask 서명 2회가 필요합니다:</p>
                        <p>① TicketNFT approve → ② Marketplace listTicket</p>
                        <p style={{ color: "#9aaab8" }}>
                          온체인 가격: {weiToGwei((krwToWei(Number(listedPrice))).toString())}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {postStep !== "idle" && (
                  <div className="flex items-center gap-2 p-3 rounded-xl text-[0.84rem] mb-3"
                    style={{ background: "#eef4ff", color: actionBlue, border: "1px solid #c8d8ef" }}>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    {postStepLabel}
                  </div>
                )}

                {postError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl text-[0.84rem] mb-3"
                    style={{ background: "#fce8e8", color: "#b94040", border: "1px solid #f0c4c4" }}>
                    <AlertCircle className="w-4 h-4 shrink-0" />{postError}
                  </div>
                )}

                <button onClick={handlePost} disabled={!selectedTicket || posting}
                  className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                  style={{ background: selectedTicket ? actionBlue : "#b0bec8", color: "#fff", border: "none", cursor: selectedTicket && !posting ? "pointer" : "not-allowed", opacity: posting ? .7 : 1 }}>
                  {posting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {posting ? postStepLabel : (selectedTicket?.tokenId !== null ? "MetaMask로 장터에 올리기" : "장터에 올리기")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
