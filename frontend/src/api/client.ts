import type { Tokens } from "./types";

const STORAGE_KEY = "stridebook.session";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// --- session (tokens survive app restarts so coaches stay signed in) ---
let session: Tokens | null = load();
const listeners = new Set<(s: Tokens | null) => void>();

function load(): Tokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export function getSession() {
  return session;
}

export function setSession(next: Tokens | null) {
  session = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: session lasts until the tab closes */
  }
  listeners.forEach((fn) => fn(next));
}

export function onSessionChange(fn: (s: Tokens | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// --- requests ---
function errorMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    const d = detail[0] as { msg: string; loc?: string[] };
    const field = d.loc?.[d.loc.length - 1];
    return field && field !== "body" ? `${field.replace(/_/g, " ")}: ${d.msg.replace(/^Value error, /, "")}` : d.msg;
  }
  if (status >= 500) return "The server had a problem. Try again in a minute.";
  if (status === 0) return "No internet connection. Check your network and try again.";
  return `Request failed (${status}).`;
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const current = session;
  if (!current) return false;
  refreshing ??= fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: current.refresh_token }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      setSession((await r.json()) as Tokens);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (session) headers.Authorization = `Bearer ${session.access_token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, errorMessage(null, 0));
  }

  if (res.status === 401 && retry && session && !path.startsWith("/auth/")) {
    if (await refresh()) return request<T>(method, path, body, false);
    setSession(null);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status));
  return data as T;
}

export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});
export const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
