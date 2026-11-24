import { type FormEvent, useState } from "react";
import { useCreateUser, useUpdateUser, useUsers } from "../../api/hooks";
import type { Role, User } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { Button, Choice, ErrorNote, Field, Loading } from "../../components/ui";
import { useAuth } from "../auth/AuthContext";

export function UsersPage() {
  const { data, error } = useUsers();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader title="Coaches and logins" back="/more" />
      <Page className="space-y-4">
        <ErrorNote error={error} />
        {!data && !error && <Loading />}
        <ul className="space-y-3">{data?.map((u) => <UserCard key={u.id} u={u} />)}</ul>
        {adding ? <AddUser onDone={() => setAdding(false)} /> : <Button full onClick={() => setAdding(true)}>Add a coach</Button>}
      </Page>
    </>
  );
}

function UserCard({ u }: { u: User }) {
  const { user: me } = useAuth();
  const update = useUpdateUser();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");

  async function reset(e: FormEvent) {
    e.preventDefault();
    await update.mutateAsync({ id: u.id, new_password: password });
    toast({ message: `Password for ${u.full_name} changed. Share it with them in person.` });
    setResetting(false);
    setPassword("");
  }

  return (
    <li className={`bg-surface rounded-2xl shadow-card p-4 ${u.is_active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-lg">
            {u.full_name}
            {u.id === me?.id && <span className="text-muted font-normal"> (you)</span>}
          </p>
          <p className="text-muted">
            Username <span className="font-semibold text-ink">{u.username}</span>, {u.role}
            {!u.is_active && ", turned off"}
          </p>
        </div>
      </div>
      {resetting ? (
        <form onSubmit={(e) => reset(e).catch(() => undefined)} className="space-y-3 mt-3">
          <Field label="New password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." />
          <ErrorNote error={update.error} />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setResetting(false)}>
              Cancel
            </Button>
            <Button type="submit" busy={update.isPending}>
              Set password
            </Button>
          </div>
        </form>
      ) : (
        u.id !== me?.id && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button variant="secondary" onClick={() => setResetting(true)}>
              Reset password
            </Button>
            <Button
              variant={u.is_active ? "danger" : "secondary"}
              busy={update.isPending}
              onClick={() => update.mutate({ id: u.id, is_active: !u.is_active })}
            >
              {u.is_active ? "Turn off login" : "Turn on login"}
            </Button>
          </div>
        )
      )}
      {!resetting && <ErrorNote error={update.error} />}
    </li>
  );
}

function AddUser({ onDone }: { onDone: () => void }) {
  const create = useCreateUser();
  const toast = useToast();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("coach");

  async function submit(e: FormEvent) {
    e.preventDefault();
    await create.mutateAsync({ full_name: name, username, password, role });
    toast({ message: `${name} can now sign in as “${username.toLowerCase()}”.` });
    onDone();
  }

  return (
    <form onSubmit={(e) => submit(e).catch(() => undefined)} className="bg-surface rounded-2xl shadow-card p-5 space-y-4">
      <h2 className="font-display text-2xl font-bold text-navy">Add a coach</h2>
      <Field label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
      <Field
        label="Username"
        required
        autoCapitalize="none"
        autoCorrect="off"
        hint="Letters and numbers, no spaces. Used to sign in."
        value={username}
        onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
      />
      <Field label="Password" required minLength={8} autoComplete="new-password" hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} />
      <Choice
        label="Role"
        value={role}
        onChange={setRole}
        options={[
          { value: "coach", label: "Coach", sub: "Students and payments" },
          { value: "admin", label: "Admin", sub: "Also fees and logins" },
        ]}
      />
      <ErrorNote error={create.error} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" busy={create.isPending}>
          Add coach
        </Button>
      </div>
    </form>
  );
}
