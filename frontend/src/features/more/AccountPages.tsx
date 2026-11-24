import { type FormEvent, useState } from "react";
import { post, setSession } from "../../api/client";
import { useHealth, usePublicSettings, useSaveSettings } from "../../api/hooks";
import type { Tokens } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { Button, ErrorNote, Field, Loading } from "../../components/ui";

export function ClubPage() {
  const { data } = usePublicSettings();
  return (
    <>
      <PageHeader title="Club name" back="/more" />
      <Page>{data ? <ClubForm name={data.club_name} short={data.club_short} /> : <Loading />}</Page>
    </>
  );
}

function ClubForm({ name, short }: { name: string; short: string }) {
  const [clubName, setClubName] = useState(name);
  const [clubShort, setClubShort] = useState(short);
  const save = useSaveSettings();
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault();
    await save.mutateAsync({ club_name: clubName, club_short: clubShort });
    toast({ message: "Club name saved." });
  }
  return (
    <form onSubmit={(e) => submit(e).catch(() => undefined)} className="space-y-5">
      <Field label="Club name" required minLength={2} maxLength={80} value={clubName} onChange={(e) => setClubName(e.target.value)} />
      <Field
        label="Short name"
        required
        maxLength={10}
        hint="A few letters, for small spaces."
        value={clubShort}
        onChange={(e) => setClubShort(e.target.value)}
      />
      <ErrorNote error={save.error} />
      <Button type="submit" full busy={save.isPending}>
        Save club name
      </Button>
    </form>
  );
}

export function PasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await post<Tokens>("/auth/change-password", { current_password: current, new_password: next }));
      toast({ message: "Password changed. Other phones signed in as you are now signed out." });
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Change password" back="/more" />
      <Page>
        <form onSubmit={submit} className="space-y-5">
          <Field label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            hint="At least 8 characters."
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <ErrorNote error={error} />
          <Button type="submit" full busy={busy}>
            Change password
          </Button>
        </form>
      </Page>
    </>
  );
}

export function SystemCheckPage() {
  const { data, error, isLoading } = useHealth();
  const rows = [
    { name: "Server", ok: !error && !!data, text: error ? "Not reachable" : data ? "Responding" : "Checking…" },
    { name: "Database", ok: data?.db === "ok", text: !data ? "—" : data.db === "ok" ? "Connected" : "Can't connect" },
    { name: "App version", ok: null, text: data?.version ?? "—" },
  ];
  return (
    <>
      <PageHeader title="System check" back="/more" />
      <Page>
        {isLoading && <Loading label="Checking…" />}
        <ul className="divide-y divide-line border-y border-line bg-white">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between px-4 py-4">
              <span className="font-semibold">{r.name}</span>
              <span className={r.ok === false ? "text-unpaid font-semibold" : "text-muted"}>{r.text}</span>
            </li>
          ))}
        </ul>
        {error && <ErrorNote error="The app can't reach the server. Check the internet connection, then tell Parth if it still fails." />}
      </Page>
    </>
  );
}
