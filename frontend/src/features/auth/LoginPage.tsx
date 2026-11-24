import { type FormEvent, useState } from "react";
import { Navigate } from "react-router";
import { usePublicSettings } from "../../api/hooks";
import { LaneMark } from "../../components/LaneMark";
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
    <div className="min-h-dvh flex flex-col">
      <div className="bg-navy text-white px-6 pt-[max(env(safe-area-inset-top),3rem)] pb-10 lane-stripes">
        <LaneMark className="size-16 text-white" />
        <h1 className="font-display text-5xl font-bold mt-5 leading-none">StrideBook</h1>
        <p className="text-white/75 mt-2 text-lg">{club?.club_name ?? " "}</p>
      </div>

      <form onSubmit={submit} className="flex-1 px-6 py-8 max-w-md w-full mx-auto space-y-5">
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
            <input type="checkbox" className="size-5" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            Show password
          </label>
        </div>
        <ErrorNote error={error} />
        <Button type="submit" full busy={busy}>
          Sign in
        </Button>
        <p className="text-sm text-muted text-center">Forgot your password? Ask the admin to reset it.</p>
      </form>
    </div>
  );
}
