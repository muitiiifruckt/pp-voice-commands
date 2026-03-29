const TOKEN_KEY = "vc_token";

export type Role = "admin" | "operator";

export type User = {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  created_at: string;
};

export type VoiceRecord = {
  id: number;
  user_id: number;
  username: string | null;
  audio_url: string;
  raw_transcript: string;
  parsed_command: string | null;
  parsed_identifier: string | null;
  confirmed_transcript: string | null;
  is_confirmed: boolean;
  operator_confirmed_at: string | null;
  created_at: string;
};

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function authFetch(path: string, init: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    setToken(null);
    throw new Error("Сессия истекла. Войдите снова.");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (j.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res;
}

export async function login(username: string, password: string) {
  const body = new URLSearchParams({ username, password, grant_type: "password" });
  const res = await fetch("/api/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.detail || "Ошибка входа");
  }
  const data = (await res.json()) as { access_token: string };
  setToken(data.access_token);
}

export async function fetchMe(): Promise<User> {
  const res = await authFetch("/api/me");
  return res.json();
}

export async function uploadVoice(blob: Blob, filename: string): Promise<VoiceRecord> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  const res = await authFetch("/api/voice/upload", { method: "POST", body: fd });
  return res.json();
}

export async function listRecords(params: {
  command?: string;
  identifier?: string;
  date_from?: string;
  date_to?: string;
  operator_id?: number;
}): Promise<VoiceRecord[]> {
  const q = new URLSearchParams();
  if (params.command) q.set("command", params.command);
  if (params.identifier) q.set("identifier", params.identifier);
  if (params.date_from) q.set("date_from", params.date_from);
  if (params.date_to) q.set("date_to", params.date_to);
  if (params.operator_id != null) q.set("operator_id", String(params.operator_id));
  const res = await authFetch(`/api/voice/records?${q.toString()}`);
  return res.json();
}

export async function confirmRecord(
  id: number,
  body: { confirmed_transcript: string; parsed_command?: string | null; parsed_identifier?: string | null }
): Promise<VoiceRecord> {
  const res = await authFetch(`/api/voice/records/${id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function listUsers(): Promise<User[]> {
  const res = await authFetch("/api/users");
  return res.json();
}

export async function createUser(body: {
  username: string;
  password: string;
  role: Role;
}): Promise<User> {
  const res = await authFetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function patchUser(
  id: number,
  body: { role?: Role; is_active?: boolean; password?: string }
): Promise<User> {
  const res = await authFetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function fetchAudioObjectUrl(audioUrlPath: string): Promise<string> {
  const res = await authFetch(audioUrlPath);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
