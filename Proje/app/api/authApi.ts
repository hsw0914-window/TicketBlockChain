const BASE = 'http://localhost:4000/api';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

function authHeader(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

export type AuthUser = {
  user_id: string;
  nickname: string;
  email: string;
  profile_image?: string | null;
};

type AuthResponse = {
  token: string;
  user: AuthUser;
};

export async function register(
  email: string,
  password: string,
  nickname: string
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, nickname }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? '회원가입 실패');
  return data as AuthResponse;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? '로그인 실패');
  return data as AuthResponse;
}

export async function getMe(): Promise<AuthUser> {
  const res = await fetch(`${BASE}/auth/me`, { headers: authHeader() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? '인증 실패');
  return data as AuthUser;
}

export async function googleLogin(access_token: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? '구글 로그인 실패');
  return data as AuthResponse;
}
