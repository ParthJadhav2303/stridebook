export type Health = { status: "ok" | "degraded"; db: string; version: string };
export type PublicSettings = { app_name: string; club_name: string; club_short: string };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok && !body) throw new Error(`Request failed (${res.status})`);
  return body as T;
}

export const api = {
  health: () => getJson<Health>("/health"),
  publicSettings: () => getJson<PublicSettings>("/settings/public"),
};
