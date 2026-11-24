import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useDues, useFeeGroups } from "../../api/hooks";
import type { DueRow } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { Empty, ErrorNote, FilterChips, Loading, MonthPicker, StatusChip } from "../../components/ui";
import { fmtMonth, money, thisMonth, whatsappLink } from "../../lib/format";
import { PaymentSheet } from "../payments/PaymentSheet";

type Tab = "pending" | "paid" | "unpaid" | "partial";

export function DuesPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? thisMonth();
  const tab = (params.get("status") as Tab | null) ?? "pending";
  const [group, setGroup] = useState<number | null>(null);
  const [payFor, setPayFor] = useState<number | null>(null);
  const { data: groups } = useFeeGroups();
  const { data, isLoading, error } = useDues(month, tab, group);

  const set = (next: Record<string, string>) => setParams({ month, status: tab, ...next }, { replace: true });
  const c = data?.counts;

  return (
    <>
      <PageHeader title="Dues" />
      <Page className="space-y-3">
        <MonthPicker value={month} onChange={(m) => set({ month: m })} />
        <FilterChips
          label="Payment status"
          value={tab}
          onChange={(v) => set({ status: v })}
          options={[
            { value: "pending", label: c ? `Not paid (${c.unpaid + c.partial})` : "Not paid" },
            { value: "unpaid", label: c ? `Unpaid (${c.unpaid})` : "Unpaid" },
            { value: "partial", label: c ? `Part paid (${c.partial})` : "Part paid" },
            { value: "paid", label: c ? `Paid (${c.paid})` : "Paid" },
          ]}
        />
        <FilterChips
          label="Group"
          value={group}
          onChange={setGroup}
          options={[{ value: null, label: "All groups" }, ...(groups ?? []).map((g) => ({ value: g.id, label: g.name }))]}
        />

        <ErrorNote error={error} />
        {isLoading && <Loading />}
        {data?.rows.length === 0 &&
          (tab === "paid" ? (
            <Empty title="No payments yet">Nobody has paid for {fmtMonth(month)} so far.</Empty>
          ) : (
            <Empty title="All clear">Every student has paid for {fmtMonth(month)}.</Empty>
          ))}
        {data && data.rows.length > 0 && (
          <ul className="space-y-2">
            {data.rows.map((r) => (
              <DueCard key={r.due_id} r={r} month={month} onPay={() => setPayFor(r.student_id)} />
            ))}
          </ul>
        )}
      </Page>
      <PaymentSheet open={payFor !== null} onClose={() => setPayFor(null)} studentId={payFor} />
    </>
  );
}

function DueCard({ r, month, onPay }: { r: DueRow; month: string; onPay: () => void }) {
  const open = r.amount_due - r.amount_paid;
  const behind = r.outstanding_months >= 2;
  const reminder = whatsappLink(
    r.parent_phone,
    `Hello, a gentle reminder that ${r.student_name}'s fees of ${money(r.outstanding_amount || open)} are pending` +
      (r.outstanding_months > 1 ? ` (${r.outstanding_months} months).` : ` for ${fmtMonth(month)}.`) +
      " Thank you!",
  );
  return (
    <li className={`bg-white rounded-xl border ${behind && r.status !== "paid" ? "border-unpaid/40" : "border-line"}`}>
      <Link to={`/students/${r.student_id}`} className="flex items-start gap-3 px-4 pt-3">
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[1.05rem] truncate">{r.student_name}</span>
          <span className="block text-sm text-muted">
            {r.status === "partial"
              ? `Paid ${money(r.amount_paid)} of ${money(r.amount_due)}`
              : r.status === "paid"
                ? `${money(r.amount_paid)} received`
                : `${money(r.amount_due)} due`}
          </span>
          {behind && r.status !== "paid" && (
            <span className="block text-sm font-semibold text-unpaid">
              {r.outstanding_months} months pending, {money(r.outstanding_amount)} in total
            </span>
          )}
        </span>
        <StatusChip status={r.status} />
      </Link>
      {r.status !== "paid" ? (
        <div className="grid grid-cols-2 gap-2 p-3">
          <button type="button" onClick={onPay} className="min-h-11 rounded-lg bg-navy text-white font-semibold">
            Record payment
          </button>
          {reminder ? (
            <a href={reminder} target="_blank" rel="noreferrer" className="min-h-11 rounded-lg border-2 border-line grid place-items-center font-semibold text-navy">
              Send reminder
            </a>
          ) : (
            <span className="min-h-11 grid place-items-center text-sm text-muted">No phone saved</span>
          )}
        </div>
      ) : (
        <div className="h-3" />
      )}
    </li>
  );
}
