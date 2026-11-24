import { type FormEvent, useState } from "react";
import { useFeeGroups, useSetRate } from "../../api/hooks";
import type { FeeGroup } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { Button, ErrorNote, Field, Loading } from "../../components/ui";
import { fmtMonth, money, shiftMonth, thisMonth } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";

export function FeeGroupsPage() {
  const { data, error } = useFeeGroups();
  const { isAdmin } = useAuth();
  return (
    <>
      <PageHeader title="Fee groups" back="/more" />
      <Page className="space-y-4">
        <ErrorNote error={error} />
        {!data && !error && <Loading />}
        {data?.map((g) => <GroupCard key={g.id} g={g} canEdit={isAdmin} />)}
        {isAdmin && (
          <p className="text-sm text-muted">
            A new amount applies from the month you choose. Months already charged before that keep their old amount, and
            months that already have a payment are never changed.
          </p>
        )}
      </Page>
    </>
  );
}

function GroupCard({ g, canEdit }: { g: FeeGroup; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState(shiftMonth(thisMonth(), 1));
  const setRate = useSetRate();
  const toast = useToast();
  const upcoming = g.rates.filter((r) => r.effective_from.slice(0, 7) > thisMonth());

  async function submit(e: FormEvent) {
    e.preventDefault();
    await setRate.mutateAsync({ groupId: g.id, monthly_amount: Number(amount), effective_from: from });
    toast({ message: `${g.name} fee set to ${money(Number(amount))} from ${fmtMonth(from)}.` });
    setEditing(false);
    setAmount("");
  }

  return (
    <section className="bg-surface rounded-2xl shadow-card p-5">
      <h2 className="font-display text-2xl font-bold text-navy">{g.name}</h2>
      <p className="font-display text-4xl font-bold mt-1">
        {money(g.current_amount)}
        <span className="text-lg text-muted font-sans font-normal"> a month</span>
      </p>
      {upcoming.map((r) => (
        <p key={r.effective_from} className="text-partial font-semibold mt-1">
          Changes to {money(r.monthly_amount)} from {fmtMonth(r.effective_from)}
        </p>
      ))}
      {g.rates.length > 1 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted min-h-10 flex items-center">Fee history</summary>
          <ul className="space-y-1 pb-2">
            {g.rates.map((r) => (
              <li key={r.effective_from}>
                {money(r.monthly_amount)} from {fmtMonth(r.effective_from)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {canEdit &&
        (editing ? (
          <form onSubmit={(e) => submit(e).catch(() => undefined)} className="space-y-4 mt-4 pt-4 border-t border-line">
            <Field label="New monthly fee" prefix="₹" inputMode="numeric" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
            <Field label="Starting from month" type="month" required value={from} onChange={(e) => setFrom(e.target.value)} />
            <ErrorNote error={setRate.error} />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" busy={setRate.isPending} disabled={!amount}>
                Save fee
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" full className="mt-4" onClick={() => setEditing(true)}>
            Change fee
          </Button>
        ))}
    </section>
  );
}
