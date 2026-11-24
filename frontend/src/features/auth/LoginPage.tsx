import { type FormEvent, useState } from "react";
import { Navigate } from "react-router";
import { usePublicSettings } from "../../api/hooks";
import { BrandMark } from "../../components/Layout";
import { TrackOval } from "../../components/TrackOval";
import { Button, ErrorNote, Field } from "../../components/ui";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { user, login } = useAuth();
  const { data: club } = usePublicSettings();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh stadium flex flex-col">
      <div className="px-6 pt-[max(env(safe-area-inset-top),2.5rem)] max-w-md w-full mx-auto text-white">
        <div className="flex items-center gap-3">
          <BrandMark className="size-12" />
          <div>
            <p className="font-display text-3xl font-bold leading-none">StrideBook</p>
            <p className="text-white/65 text-sm mt-1">{club?.club_name ?? " "}</p>
          </div>
        </div>
        <div className="mt-6 -mx-2 opacity-90">
          <TrackOval percent={72}>
            <p className="font-display text-[1.7rem] font-bold leading-tight">
              Every fee,
              <br />
              every month.
            </p>
          </TrackOval>
        </div>
      </div>

      <form onSubmit={submit} className="mt-auto bg-paper rounded-t-[32px] px-6 pt-7 pb-[max(env(safe-area-inset-bottom),2rem)] w-full max-w-md mx-auto space-y-5">
        <h1 className="font-display text-[2rem] font-bold text-navy leading-none">Sign in</h1>
        <Field
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <div>
          <Field
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="mt-2 flex items-center gap-2 text-muted">
            <input type="checkbox" className="size-5 accent-navy" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            Show password
          </label>
        </div>
        <ErrorNote error={error} />
        <Button type="submit" variant="volt" full busy={busy} className="min-h-14 text-lg">
          Sign in
        </Button>
        <p className="text-sm text-muted text-center">Forgot your password? Ask the admin to reset it.</p>
      </form>
    </div>
  );
}
