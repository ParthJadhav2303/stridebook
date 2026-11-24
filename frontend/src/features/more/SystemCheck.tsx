import { useEffect, useState } from "react";
import { api, type Health, type PublicSettings } from "../api/client";
import { LaneMark } from "../components/LaneMark";

type Check = { name: string; state: "checking" | "ok" | "fail"; detail: string };

export function App() {
  const [club, setClub] = useState<PublicSettings | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.publicSettings().then(setClub).catch(() => undefined);
    api
      .health()
      .then(setHealth)
      .catch(() => setError("The app can't reach the server. Check that the api container is running."));
  }, []);

  const checks: Check[] = [
    {
      name: "Server",
      state: error ? "fail" : health ? "ok" : "checking",
      detail: error ?? (health ? "Responding" : "Checking…"),
    },
    {
      name: "Database",
      state: error ? "fail" : !health ? "checking" : health.db === "ok" ? "ok" : "fail",
      detail: error ? "Not checked" : !health ? "Checking…" : health.db === "ok" ? "Connected" : "Can't connect",
    },
    { name: "Version", state: health ? "ok" : "checking", detail: health?.version ?? "—" },
  ];

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="bg-navy text-white px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-6">
        <div className="flex items-center gap-3">
          <LaneMark className="size-11 text-white shrink-0" />
          <div>
            <p className="font-display text-2xl font-bold leading-none tracking-wide">StrideBook</p>
            <p className="text-white/70 text-sm mt-1">{club?.club_name ?? "Loading club…"}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 py-6 max-w-lg w-full mx-auto">
        <h1 className="font-display text-3xl font-bold text-navy">System check</h1>
        <p className="text-muted mt-1">
          Fee tracking arrives in the next update. This page confirms the app is set up correctly.
        </p>

        <ul className="mt-6 divide-y divide-line border-y border-line bg-white">
          {checks.map((c) => (
            <li key={c.name} className="flex items-center justify-between px-4 py-4">
              <span className="font-semibold">{c.name}</span>
              <span className="flex items-center gap-2 text-right">
                <span
                  aria-hidden="true"
                  className={
                    "size-2.5 rounded-full " +
                    (c.state === "ok" ? "bg-paid" : c.state === "fail" ? "bg-unpaid" : "bg-line")
                  }
                />
                <span className={c.state === "fail" ? "text-unpaid" : "text-muted"}>{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
