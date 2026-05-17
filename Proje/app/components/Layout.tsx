import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { useEffect, useRef, useState } from "react";
import { Ticket, Layers, ShoppingBag, Bell, Wallet, ChevronDown, Menu, X, Trophy, MessagesSquare, LogOut, User, Tag, ScanLine, Gift, Star, Settings2 } from "lucide-react";
import { LuLogIn } from "react-icons/lu";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const { theme, walletConnected, walletAddress, connectWallet, disconnectWallet, isConnectingWallet } = useAppSettings();
  const { isLoggedIn, user, logout } = useAuth();


  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const nickname = user?.nickname ?? localStorage.getItem("nickname") ?? "사용자";
  const avatarChar = nickname.charAt(0);
  const walletLabel = walletConnected && walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "지갑 인증";

  const shellBackground =
    theme === "dark"
      ? "linear-gradient(180deg, #0f1720 0%, #121d27 40%, #17242e 100%)"
      : "linear-gradient(180deg, #eef2f4 0%, #e9eef1 38%, #e4eaed 100%)";
  const gridColor = theme === "dark" ? "rgba(126, 156, 184, 0.06)" : "rgba(57, 84, 114, 0.035)";
  const headerBackground = theme === "dark"
    ? scrolled ? "rgba(16,24,33,0.94)" : "rgba(20,30,40,0.86)"
    : scrolled ? "rgba(245,248,250,0.94)" : "rgba(239,243,246,0.84)";
  const headerBorder = theme === "dark"
    ? "1px solid rgba(123,144,166,0.16)"
    : scrolled ? "1px solid rgba(70,97,124,0.16)" : "1px solid rgba(70,97,124,0.09)";
  const headerShadow = scrolled
    ? theme === "dark"
      ? "0 8px 24px rgba(0, 0, 0, 0.24)"
      : "0 8px 24px rgba(17, 40, 73, 0.05)"
    : "none";
  const panelBackground = theme === "dark" ? "rgba(28, 40, 53, 0.92)" : "rgba(244,247,249,0.78)";
  const activeBackground = theme === "dark" ? "rgba(86,112,139,0.22)" : "rgba(90,116,146,0.12)";
  const activeColor = theme === "dark" ? "#dce7f0" : "#46617f";
  const textColor = theme === "dark" ? "#b8c7d6" : "#5f7085";
  const titleGradient = theme === "dark" ? "linear-gradient(90deg, #d9e6f2, #93b1cb)" : "linear-gradient(90deg, #45617f, #6b8878)";
  const dropdownBg = theme === "dark" ? "rgba(22,32,43,0.98)" : "#f8fafc";
  const dropdownBorder = theme === "dark" ? "rgba(90,116,146,0.22)" : "#d0d8e2";

  const navItems = [
    { path: "/tickets",          label: "경기 예매",    icon: Ticket,       adminOnly: false },
    { path: "/my-tickets",       label: "내 입장권",    icon: Ticket,       adminOnly: false },
    { path: "/ticket-resale",    label: "티켓 양도",    icon: Tag,          adminOnly: false },
    { path: "/point-exchange",   label: "포인트 교환",  icon: Gift,         adminOnly: false },
    { path: "/raffle-status",    label: "응모권 NFT",   icon: Star,         adminOnly: false },
    { path: "/priority-booking", label: "우선 예매",    icon: Ticket,       adminOnly: false },
    { path: "/admin-draw",       label: "추첨 관리",    icon: Settings2,    adminOnly: true  },
    { path: "/entry-scan",       label: "입장 스캔",    icon: ScanLine,     adminOnly: false },
    { path: "/combine",          label: "카드 조합",    icon: Layers,       adminOnly: false },
    { path: "/market",           label: "팬 자산 장터", icon: ShoppingBag,  adminOnly: false },
    { path: "/community",        label: "커뮤니티",     icon: MessagesSquare, adminOnly: false },
    { path: "/notice",           label: "공지사항",     icon: Bell,         adminOnly: false },
  ].filter(item => !item.adminOnly || isLoggedIn);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const isHome = location.pathname === "/";

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden" style={{ background: shellBackground }}>
      {/* Field pattern */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
        backgroundSize: "56px 56px",
        zIndex: 0
      }} />

      <div className="fixed inset-x-0 top-0 h-[320px] pointer-events-none" style={{ background: theme === "dark" ? "linear-gradient(180deg, rgba(82, 112, 140, 0.14) 0%, transparent 100%)" : "linear-gradient(180deg, rgba(58, 91, 126, 0.08) 0%, transparent 100%)", zIndex: 0 }} />
      <div className="fixed -top-16 right-0 w-[460px] h-[460px] rounded-full pointer-events-none" style={{ background: theme === "dark" ? "radial-gradient(circle, rgba(92, 128, 111, 0.16) 0%, transparent 72%)" : "radial-gradient(circle, rgba(112, 156, 138, 0.09) 0%, transparent 72%)", zIndex: 0 }} />
      <div className="fixed bottom-0 left-0 w-[360px] h-[360px] rounded-full pointer-events-none" style={{ background: theme === "dark" ? "radial-gradient(circle, rgba(84, 109, 136, 0.14) 0%, transparent 70%)" : "radial-gradient(circle, rgba(67, 92, 118, 0.08) 0%, transparent 70%)", zIndex: 0 }} />

      {/* ─── HEADER ─── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: headerBackground,
          backdropFilter: "blur(24px)",
          borderBottom: headerBorder,
          boxShadow: headerShadow,
        }}
      >
        <div className="max-w-[1440px] mx-auto px-5 md:px-6 h-[72px] flex items-center justify-between gap-4">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 shrink-0 group">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #4c6787, #6d89a3, #74a38a)", boxShadow: "0 8px 16px rgba(62, 88, 117, 0.18)" }}>
              <Trophy className="w-5 h-5 text-white relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20" />
            </div>
            <div className="leading-tight">
              <p className="retro-title text-[0.9rem] font-bold tracking-[0.08em]"
                style={{ display: "inline-block", background: titleGradient, backgroundSize: "100% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                BASE CHAIN
              </p>
              <p className="text-[0.66rem] tracking-[0.16em] uppercase" style={{ color: theme === "dark" ? "#8fa1b3" : "#778396" }}>Baseball Ticketing</p>
            </div>
          </Link>

          {/* Center Nav */}
          <nav className="hidden lg:flex items-center gap-1.5">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="relative px-4 py-2.5 rounded-xl text-[0.92rem] font-semibold transition-all duration-200 group"
                  style={{
                    color: active ? (theme === "dark" ? "#e2edf6" : "#223750") : textColor,
                    background: active ? activeBackground : panelBackground,
                    border: active ? "1px solid rgba(90,116,146,0.18)" : "1px solid transparent",
                  }}
                >
                  <span className="relative z-10 transition-colors duration-200"
                    style={{ color: active ? activeColor : undefined }}>
                    {item.label}
                  </span>
                  <span className="absolute bottom-1 left-4 right-4 h-[1px] rounded-full transition-all duration-300 opacity-0 group-hover:opacity-100"
                    style={{ background: "linear-gradient(90deg, #4a6480, #729180)" }} />
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3 shrink-0">
            {isLoggedIn ? (
              <>
                {/* 로그인 상태: 지갑 버튼 */}
                <button
                  onClick={async () => {
                    if (walletConnected) { navigate("/mypage"); return; }
                    const connected = await connectWallet();
                    if (!connected) navigate("/mypage");
                  }}
                  className="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-xl text-[0.88rem] font-semibold transition-all duration-200 hover:scale-105"
                  style={{
                    background: walletConnected
                      ? theme === "dark" ? "rgba(108, 144, 116, 0.16)" : "rgba(108,144,116,0.10)"
                      : theme === "dark" ? "rgba(90,116,146,0.18)" : "rgba(90,116,146,0.08)",
                    border: walletConnected ? "1px solid rgba(108,144,116,0.22)" : "1px solid rgba(90,116,146,0.16)",
                    color: walletConnected ? "#6c9074" : "#49647f",
                    boxShadow: theme === "dark" ? "0 6px 14px rgba(0,0,0,0.18)" : "0 6px 14px rgba(41,61,85,0.05)",
                  }}
                >
                  <Wallet className="w-4 h-4" />
                  <span>{isConnectingWallet ? "연결 중..." : walletLabel}</span>
                </button>

                {/* 로그인 상태: 프로필 드롭다운 */}
                <div className="relative" ref={profileMenuRef}>
                  <button onClick={() => setProfileMenuOpen(!profileMenuOpen)} className="flex items-center gap-2 group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white relative overflow-hidden"
                      style={{ background: "linear-gradient(135deg, #4f6786, #7aa08d)", boxShadow: "0 8px 16px rgba(62,88,117,0.14)" }}>
                      <span className="relative z-10">{avatarChar}</span>
                      <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20" />
                    </div>
                    <ChevronDown
                      className="w-3.5 h-3.5 hidden md:block transition-transform duration-200"
                      style={{ color: theme === "dark" ? "#90a1b4" : "#7084a0", transform: profileMenuOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    />
                  </button>

                  {profileMenuOpen && (
                    <div className="absolute right-0 top-12 w-52 rounded-[16px] border shadow-xl z-50 py-2 overflow-hidden"
                      style={{ background: dropdownBg, borderColor: dropdownBorder, boxShadow: "0 12px 32px rgba(17,40,73,0.12)" }}>
                      <div className="px-4 py-3 border-b" style={{ borderColor: dropdownBorder }}>
                        <p className="text-[0.82rem] font-bold" style={{ color: theme === "dark" ? "#d9e6f2" : "#1f3248" }}>{user?.nickname}</p>
                        <p className="text-[0.74rem] mt-0.5 truncate" style={{ color: theme === "dark" ? "#7a8fa3" : "#8a9aac" }}>{user?.email}</p>
                      </div>
                      <button
                        onClick={() => { navigate("/mypage"); setProfileMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[0.85rem] font-medium transition-colors hover:opacity-80"
                        style={{ color: theme === "dark" ? "#b8c7d6" : "#44556c" }}
                      >
                        <User className="w-4 h-4" />마이페이지
                      </button>
                      <button
                        onClick={() => { logout(); disconnectWallet(); setProfileMenuOpen(false); navigate("/"); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[0.85rem] font-medium transition-colors hover:opacity-80"
                        style={{ color: "#8f5d3b" }}
                      >
                        <LogOut className="w-4 h-4" />로그아웃
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* 비로그인 상태: 로그인 버튼만 표시 */
              <button
                onClick={() => navigate("/login")}
                className="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-xl text-[0.88rem] font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: theme === "dark" ? "rgba(90,116,146,0.18)" : "rgba(90,116,146,0.08)",
                  border: "1px solid rgba(90,116,146,0.16)",
                  color: theme === "dark" ? "#b8c7d6" : "#49647f",
                  boxShadow: theme === "dark" ? "0 6px 14px rgba(0,0,0,0.18)" : "0 6px 14px rgba(41,61,85,0.05)",
                }}
              >
                <LuLogIn className="w-4 h-4" />
                <span>로그인</span>
              </button>
            )}

            {/* Mobile menu toggle */}
            <button onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2.5 rounded-xl"
              style={{ border: "1px solid rgba(90,116,146,0.14)", background: theme === "dark" ? "rgba(28,40,53,0.92)" : "rgba(245,248,250,0.9)", color: textColor }}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="lg:hidden border-t px-4 py-4 space-y-1"
            style={{ borderColor: "rgba(90,116,146,0.12)", background: theme === "dark" ? "rgba(18,28,38,0.98)" : "rgba(242,246,248,0.98)" }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium"
                  style={{
                    background: active ? activeBackground : "transparent",
                    color: active ? activeColor : textColor,
                    border: active ? "1px solid rgba(90,116,146,0.18)" : "1px solid transparent",
                  }}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
            {/* 모바일 로그인/로그아웃 */}
            {isLoggedIn ? (
              <>
                <button
                  onClick={() => { setMobileOpen(false); navigate("/mypage"); }}
                  className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium"
                  style={{ background: panelBackground, color: textColor, border: "1px solid rgba(90,116,146,0.16)" }}
                >
                  <User className="w-4 h-4" />
                  마이페이지 ({nickname})
                </button>
                <button
                  onClick={() => { setMobileOpen(false); logout(); disconnectWallet(); navigate("/"); }}
                  className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium"
                  style={{ background: panelBackground, color: "#8f5d3b", border: "1px solid rgba(90,116,146,0.16)" }}
                >
                  <LogOut className="w-4 h-4" />
                  로그아웃
                </button>
              </>
            ) : (
              <button
                onClick={() => { setMobileOpen(false); navigate("/login"); }}
                className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium"
                style={{ background: panelBackground, color: textColor, border: "1px solid rgba(90,116,146,0.16)" }}
              >
                <LuLogIn className="w-4 h-4" />
                로그인
              </button>
            )}
          </div>
        )}
      </header>

      {/* ─── MAIN ─── */}
      <main className="flex-1" style={{ paddingTop: isHome ? 0 : "72px" }}>
        <Outlet />
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="relative z-10"
        style={{ background: theme === "dark" ? "rgba(18,28,38,0.94)" : "rgba(241,245,247,0.92)", borderTop: "1px solid rgba(70,97,124,0.12)", backdropFilter: "blur(20px)" }}>
        <div className="max-w-[1440px] mx-auto px-5 md:px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #4d6787, #739280)" }}>
                <Trophy className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="retro-title text-[0.88rem] font-bold tracking-[0.08em]"
                  style={{ display: "inline-block", background: "linear-gradient(90deg, #46617f, #739280)", backgroundSize: "100% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  BASE CHAIN
                </p>
                <p className="text-[0.68rem] tracking-[0.14em] uppercase" style={{ color: theme === "dark" ? "#8fa1b3" : "#7084a0" }}>Baseball Ticketing Platform</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.78rem]" style={{ color: theme === "dark" ? "#8fa1b3" : "#7084a0" }}>
              <a href="#" className="hover:text-[#1456a0] transition-colors">이용약관</a>
              <a href="#" className="hover:text-[#1456a0] transition-colors">개인정보처리방침</a>
              <a href="#" className="hover:text-[#1456a0] transition-colors">고객센터</a>
              <a href="#" className="hover:text-[#1456a0] transition-colors">공지사항</a>
            </div>
            <p className="text-[0.78rem]" style={{ color: theme === "dark" ? "#8fa1b3" : "#7084a0" }}>
              © 2026 <span style={{ color: "#1456a0" }}>BASE CHAIN</span>. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
