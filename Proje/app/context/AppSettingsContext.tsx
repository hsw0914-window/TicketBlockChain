import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ThemeMode = "light" | "dark";

type AppSettingsContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  walletAddress: string | null;       // MetaMask 연결 주소
  walletChainId: string | null;
  walletConnected: boolean;           // MetaMask 실제 연결 여부
  effectiveWallet: string | null;     // API 호출용: MetaMask 주소 또는 DB 등록 주소
  walletProviderName: string;
  walletError: string | null;
  isConnectingWallet: boolean;
  connectWallet: () => Promise<boolean>;
  disconnectWallet: () => void;
};

const THEME_STORAGE_KEY = "base-chain-theme";
const WALLET_STORAGE_KEY = "base-chain-wallet";
const WALLET_PAUSED_KEY = "base-chain-wallet-paused";

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === "dark" ? "dark" : "light";
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [dbWalletAddress, setDbWalletAddress] = useState<string | null>(null);

  const applyWalletState = useCallback((address: string | null, chainId: string | null) => {
    setWalletAddress(address);
    setWalletChainId(chainId);

    if (typeof window !== "undefined") {
      if (address) {
        localStorage.setItem(
          WALLET_STORAGE_KEY,
          JSON.stringify({
            address,
            chainId,
          }),
        );
      } else {
        localStorage.removeItem(WALLET_STORAGE_KEY);
      }
    }
  }, []);

  const syncWalletFromProvider = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    if (localStorage.getItem(WALLET_PAUSED_KEY)) return;

    try {
      const [accounts, chainId] = await Promise.all([
        window.ethereum.request({ method: "eth_accounts" }) as Promise<string[]>,
        window.ethereum.request({ method: "eth_chainId" }) as Promise<string>,
      ]);

      if (accounts.length > 0) {
        applyWalletState(accounts[0], chainId);
      }
    } catch {
      // keep stored state fallback only
    }
  }, [applyWalletState]);

  // MetaMask 미연결 + 로그인 상태일 때 DB 등록 지갑을 자동 로드
  useEffect(() => {
    if (walletAddress) { setDbWalletAddress(null); return; }
    const token = localStorage.getItem("auth_token");
    if (!token) { setDbWalletAddress(null); return; }
    const apiBase = import.meta.env.VITE_API_URL as string ?? "http://localhost:4000";
    fetch(`${apiBase}/api/auth/wallet`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setDbWalletAddress((data as { walletAddress?: string } | null)?.walletAddress ?? null);
      })
      .catch(() => setDbWalletAddress(null));
  }, [walletAddress]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedWallet = localStorage.getItem(WALLET_STORAGE_KEY);
    if (storedWallet) {
      try {
        const parsed = JSON.parse(storedWallet) as { address?: string; chainId?: string | null };
        if (parsed.address) {
          setWalletAddress(parsed.address);
          setWalletChainId(parsed.chainId ?? null);
        }
      } catch {
        localStorage.removeItem(WALLET_STORAGE_KEY);
      }
    }

    void syncWalletFromProvider();
  }, [syncWalletFromProvider]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum?.on || !window.ethereum?.removeListener) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const walletAccounts = Array.isArray(accounts) ? (accounts as string[]) : [];
      if (walletAccounts.length === 0) {
        applyWalletState(null, null);
        return;
      }
      applyWalletState(walletAccounts[0], walletChainId);
    };

    const handleChainChanged = (chainId: unknown) => {
      setWalletChainId(typeof chainId === "string" ? chainId : null);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [applyWalletState, walletChainId]);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
  }, []);

  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setWalletError("메타마스크가 설치되어 있지 않아요. 확장 프로그램을 먼저 설치해 주세요.");
      return false;
    }

    setIsConnectingWallet(true);
    setWalletError(null);

    try {
      const [accounts, chainId] = await Promise.all([
        window.ethereum.request({ method: "eth_requestAccounts" }) as Promise<string[]>,
        window.ethereum.request({ method: "eth_chainId" }) as Promise<string>,
      ]);

      if (!accounts.length) {
        setWalletError("지갑 계정을 찾지 못했어요.");
        return false;
      }

      // 로그인된 상태라면 DID 등록 지갑과 일치하는지 확인
      const token = localStorage.getItem("auth_token");
      if (token) {
        try {
          const walletRes = await fetch("http://localhost:4000/api/auth/wallet", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (walletRes.ok) {
            const { walletAddress: registeredWallet } = await walletRes.json() as { walletAddress: string | null };
            if (registeredWallet && accounts[0].toLowerCase() !== registeredWallet.toLowerCase()) {
              setWalletError(
                `이 계정에 등록된 지갑(${registeredWallet.slice(0, 6)}...${registeredWallet.slice(-4)})과 다른 지갑입니다. 등록된 지갑으로 다시 선택해 주세요.`
              );
              return false;
            }
          }
        } catch {
          // 서버 오류 시 검증 생략 (연결은 허용)
        }
      }

      localStorage.removeItem(WALLET_PAUSED_KEY);
      applyWalletState(accounts[0], chainId);
      return true;
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "메타마스크 연결이 취소되었거나 실패했어요.";
      setWalletError(message);
      return false;
    } finally {
      setIsConnectingWallet(false);
    }
  }, [applyWalletState]);

  const disconnectWallet = useCallback(() => {
    setWalletError(null);
    localStorage.setItem(WALLET_PAUSED_KEY, "1");
    applyWalletState(null, null);
    // MetaMask 사이트 권한 해제 → 다음 연결 시 계정 선택 팝업 강제 표시
    if (window.ethereum) {
      (window.ethereum as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> })
        .request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] })
        .catch(() => { /* 구버전 MetaMask 무시 */ });
    }
  }, [applyWalletState]);

  const effectiveWallet = walletAddress ?? dbWalletAddress;

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      theme,
      setTheme,
      walletAddress,
      walletChainId,
      walletConnected: Boolean(walletAddress),
      effectiveWallet,
      walletProviderName: effectiveWallet
        ? walletAddress
          ? `MetaMask · ${shortAddress(walletAddress)}`
          : `지갑 · ${shortAddress(effectiveWallet)}`
        : "MetaMask 연결 안 됨",
      walletError,
      isConnectingWallet,
      connectWallet,
      disconnectWallet,
    }),
    [
      theme,
      setTheme,
      walletAddress,
      walletChainId,
      effectiveWallet,
      walletError,
      isConnectingWallet,
      connectWallet,
      disconnectWallet,
    ],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error("useAppSettings must be used inside AppSettingsProvider");
  }
  return context;
}
