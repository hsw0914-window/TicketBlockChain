import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Trophy, Eye, EyeOff, ChevronLeft } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { apiUrl } from "../lib/api";

type View = "login" | "findId" | "findPassword";

export function Login() {
  const navigate = useNavigate();
  const { login, googleLogin } = useAuth();

  const [view, setView] = useState<View>("login");

  // 로그인
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // 아이디 찾기
  const [findIdNickname, setFindIdNickname] = useState("");
  const [findIdResult, setFindIdResult] = useState<string | null>(null);
  const [findIdError, setFindIdError] = useState<string | null>(null);
  const [isFindIdLoading, setIsFindIdLoading] = useState(false);

  // 비밀번호 찾기
  const [findPwEmail, setFindPwEmail] = useState("");
  const [findPwResult, setFindPwResult] = useState<string | null>(null);
  const [findPwError, setFindPwError] = useState<string | null>(null);
  const [isFindPwLoading, setIsFindPwLoading] = useState(false);

  function goToView(v: View) {
    setView(v);
    setFindIdNickname(""); setFindIdResult(null); setFindIdError(null);
    setFindPwEmail(""); setFindPwResult(null); setFindPwError(null);
    setError(null);
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFindId() {
    if (!findIdNickname.trim()) { setFindIdError("닉네임을 입력해주세요."); return; }
    setIsFindIdLoading(true); setFindIdError(null); setFindIdResult(null);
    try {
      const res = await fetch(apiUrl("/api/auth/find-id"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: findIdNickname }),
      });
      const data = await res.json();
      if (!res.ok) { setFindIdError(data.error); return; }
      setFindIdResult(data.maskedEmail);
    } catch {
      setFindIdError("서버 오류가 발생했습니다.");
    } finally {
      setIsFindIdLoading(false);
    }
  }

  async function handleFindPassword() {
    if (!findPwEmail.trim()) { setFindPwError("이메일을 입력해주세요."); return; }
    setIsFindPwLoading(true); setFindPwError(null); setFindPwResult(null);
    try {
      const res = await fetch(apiUrl("/api/auth/find-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: findPwEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setFindPwError(data.error); return; }
      setFindPwResult(data.tempPassword);
    } catch {
      setFindPwError("서버 오류가 발생했습니다.");
    } finally {
      setIsFindPwLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(180deg, #eef2f4 0%, #e4eaed 100%)" }}
    >
      <div className="w-full max-w-[500px]">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #4c6787, #6d89a3, #74a38a)" }}
          >
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <span
            className="text-[1.2rem] font-bold tracking-[0.08em]"
            style={{ background: "linear-gradient(90deg, #45617f, #6b8878)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            BASE CHAIN
          </span>
        </Link>

        {/* Card */}
        <div
          className="rounded-[28px] border px-10 py-10"
          style={{ background: "#f8fafc", borderColor: "#d6dfe8", boxShadow: "0 10px 32px rgba(17,40,73,0.07)" }}
        >

          {/* ─── 로그인 뷰 ─── */}
          {view === "login" && (
            <>
              <h1 className="text-[1.7rem] font-bold mb-1.5" style={{ color: "#1f3248" }}>로그인</h1>
              <p className="text-[0.92rem] mb-7" style={{ color: "#6d7d90" }}>
                계정이 없으신가요?{" "}
                <Link to="/register" className="font-semibold" style={{ color: "#526183" }}>
                  회원가입
                </Link>
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[0.88rem] font-semibold mb-2" style={{ color: "#44556c" }}>이메일</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    required
                    className="w-full h-12 rounded-[14px] border px-4 text-[0.95rem] outline-none transition-all"
                    style={{ background: "#f0f4f7", borderColor: "#d0d8e2", color: "#1f3248" }}
                  />
                </div>

                <div>
                  <label className="block text-[0.88rem] font-semibold mb-2" style={{ color: "#44556c" }}>비밀번호</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="비밀번호 입력"
                      required
                      className="w-full h-12 rounded-[14px] border px-4 pr-12 text-[0.95rem] outline-none transition-all"
                      style={{ background: "#f0f4f7", borderColor: "#d0d8e2", color: "#1f3248" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                      style={{ color: "#8a9aac" }}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-[12px] border px-4 py-3 text-[0.88rem]"
                    style={{ background: "#f8efe9", borderColor: "#ead5c7", color: "#8f5d3b" }}>
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-[14px] font-semibold text-[1rem] text-white mt-1"
                  style={{ background: "#526183" }}
                >
                  {isLoading ? "로그인 중..." : "로그인"}
                </Button>
              </form>

              {/* 구글 로그인 */}
              <div className="mt-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px" style={{ background: "#d6dfe8" }} />
                  <span className="text-[0.82rem]" style={{ color: "#8a9aac" }}>또는</span>
                  <div className="flex-1 h-px" style={{ background: "#d6dfe8" }} />
                </div>
                <div className="flex justify-center">
                  <GoogleLogin
                    text="signin_with"
                    shape="pill"
                    theme="outline"
                    size="large"
                    width="360"
                    onSuccess={async (credentialResponse) => {
                      if (!credentialResponse.credential) {
                        setError("구글 자격 증명을 받지 못했습니다.");
                        return;
                      }

                      setError(null);
                      setIsGoogleLoading(true);
                      try {
                        await googleLogin(credentialResponse.credential);
                        navigate("/", { replace: true });
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "구글 로그인 실패");
                      } finally {
                        setIsGoogleLoading(false);
                      }
                    }}
                    onError={() => setError("구글 로그인이 취소되었거나 실패했습니다.")}
                  />
                </div>
              </div>

              {/* 아이디/비밀번호 찾기 링크 */}
              <div className="mt-5 flex items-center justify-center gap-4 text-[0.88rem]" style={{ color: "#8a9aac" }}>
                <button
                  type="button"
                  onClick={() => goToView("findId")}
                  className="hover:underline transition-colors hover:text-[#526183]"
                >
                  아이디 찾기
                </button>
                <span className="text-[#d0d8e2]">|</span>
                <button
                  type="button"
                  onClick={() => goToView("findPassword")}
                  className="hover:underline transition-colors hover:text-[#526183]"
                >
                  비밀번호 찾기
                </button>
              </div>
            </>
          )}

          {/* ─── 아이디 찾기 뷰 ─── */}
          {view === "findId" && (
            <>
              <button
                onClick={() => goToView("login")}
                className="flex items-center gap-1.5 mb-6 text-[0.88rem] font-medium transition-colors hover:opacity-70"
                style={{ color: "#526183" }}
              >
                <ChevronLeft className="w-4 h-4" />
                로그인으로 돌아가기
              </button>

              <h1 className="text-[1.7rem] font-bold mb-1.5" style={{ color: "#1f3248" }}>아이디 찾기</h1>
              <p className="text-[0.92rem] mb-7" style={{ color: "#6d7d90" }}>
                가입 시 사용한 닉네임을 입력하면 등록된 이메일을 알려드립니다.
              </p>

              <div className="space-y-5">
                <div>
                  <label className="block text-[0.88rem] font-semibold mb-2" style={{ color: "#44556c" }}>닉네임</label>
                  <input
                    type="text"
                    value={findIdNickname}
                    onChange={(e) => setFindIdNickname(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFindId()}
                    placeholder="가입 시 사용한 닉네임"
                    className="w-full h-12 rounded-[14px] border px-4 text-[0.95rem] outline-none"
                    style={{ background: "#f0f4f7", borderColor: "#d0d8e2", color: "#1f3248" }}
                  />
                </div>

                {findIdError && (
                  <div className="rounded-[12px] border px-4 py-3 text-[0.88rem]"
                    style={{ background: "#f8efe9", borderColor: "#ead5c7", color: "#8f5d3b" }}>
                    {findIdError}
                  </div>
                )}

                {findIdResult && (
                  <div className="rounded-[14px] border px-5 py-4 space-y-1"
                    style={{ background: "#edf7f1", borderColor: "#c7dfd0" }}>
                    <p className="text-[0.82rem] font-semibold" style={{ color: "#28764d" }}>등록된 이메일</p>
                    <p className="text-[1.1rem] font-bold tracking-wide" style={{ color: "#1f4a30" }}>{findIdResult}</p>
                  </div>
                )}

                <Button
                  type="button"
                  onClick={handleFindId}
                  disabled={isFindIdLoading}
                  className="w-full h-12 rounded-[14px] font-semibold text-[1rem] text-white"
                  style={{ background: "#526183" }}
                >
                  {isFindIdLoading ? "조회 중..." : "아이디 찾기"}
                </Button>
              </div>
            </>
          )}

          {/* ─── 비밀번호 찾기 뷰 ─── */}
          {view === "findPassword" && (
            <>
              <button
                onClick={() => goToView("login")}
                className="flex items-center gap-1.5 mb-6 text-[0.88rem] font-medium transition-colors hover:opacity-70"
                style={{ color: "#526183" }}
              >
                <ChevronLeft className="w-4 h-4" />
                로그인으로 돌아가기
              </button>

              <h1 className="text-[1.7rem] font-bold mb-1.5" style={{ color: "#1f3248" }}>비밀번호 찾기</h1>
              <p className="text-[0.92rem] mb-7" style={{ color: "#6d7d90" }}>
                가입 시 사용한 이메일을 입력하면 임시 비밀번호를 발급해드립니다.
              </p>

              <div className="space-y-5">
                <div>
                  <label className="block text-[0.88rem] font-semibold mb-2" style={{ color: "#44556c" }}>이메일</label>
                  <input
                    type="email"
                    value={findPwEmail}
                    onChange={(e) => setFindPwEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFindPassword()}
                    placeholder="가입 시 사용한 이메일"
                    className="w-full h-12 rounded-[14px] border px-4 text-[0.95rem] outline-none"
                    style={{ background: "#f0f4f7", borderColor: "#d0d8e2", color: "#1f3248" }}
                  />
                </div>

                {findPwError && (
                  <div className="rounded-[12px] border px-4 py-3 text-[0.88rem]"
                    style={{ background: "#f8efe9", borderColor: "#ead5c7", color: "#8f5d3b" }}>
                    {findPwError}
                  </div>
                )}

                {findPwResult && (
                  <div className="rounded-[14px] border px-5 py-4 space-y-1"
                    style={{ background: "#edf7f1", borderColor: "#c7dfd0" }}>
                    <p className="text-[0.82rem] font-semibold" style={{ color: "#28764d" }}>임시 비밀번호</p>
                    <p className="text-[1.3rem] font-bold tracking-widest font-mono" style={{ color: "#1f4a30" }}>{findPwResult}</p>
                    <p className="text-[0.78rem] mt-1" style={{ color: "#5a8c6e" }}>이 비밀번호로 로그인 후 변경해주세요.</p>
                  </div>
                )}

                <Button
                  type="button"
                  onClick={handleFindPassword}
                  disabled={isFindPwLoading}
                  className="w-full h-12 rounded-[14px] font-semibold text-[1rem] text-white"
                  style={{ background: "#526183" }}
                >
                  {isFindPwLoading ? "발급 중..." : "임시 비밀번호 발급"}
                </Button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
