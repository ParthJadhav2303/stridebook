import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { download } from "../../api/client";
import { useDues, useFeeGroups } from "../../api/hooks";
import type { DueRow } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { Avatar, Empty, ErrorNote, FilterChips, Loading, MonthPicker, StatusChip, cx } from "../../components/ui";
import { fmtMonth, money, thisMonth, whatsappLink } from "../../lib/format";
import { PaymentSheet } from "../payments/PaymentSheet";

type Tab = "pending" | "paid" | "unpaid" | "partial";

export function DuesPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? thisMonth();
  const tab = (params.get("status") as Tab | null) ?? "pending";
  const [group, setGroup] = useState<number | null>(null);
  const [payFor, setPayFor] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const { data: groups } = useFeeGroups();
  const { data, isLoading, error } = useDues(month, tab, group);

  const set = (next: Record<string, string>) => setParams({ month, status: tab, ...next }, { replace: true });
  const c = data?.counts;
  const pendingTotal = data?.rows.reduce((sum, r) => sum + (r.amount_due - r.amount_paid), 0) ?? 0;

  async function exportExcel() {
    setExporting(true);
    try {
      await download(`/reports/export.xlsx?month=${month}`, `stridebook-fees-${month}.xlsx`);
    } catch (e) {
      toast({ message: (e as Error).message });
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Dues"
        action={
          <button
            type="button"
            onClick={exportExcel}
            disabled={exporting}
            className="min-h-11 px-4 rounded-full bg-white/10 font-semibold disabled:opacity-50"
          >
            {exporting ? "Preparing…" : "Excel"}
          </button>
        }
      >
        <MonthPicker value={month} onChange={(m) => set({ month: m })} dark />
        {c && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat n={c.unpaid} label="Unpaid" />
            <Stat n={c.partial} label="Part paid" />
            <Stat n={c.paid} label="Paid" />
          </div>
        )}
      </PageHeader>
      <Page className="space-y-2.5">
        <FilterChips
          label="Payment status"
          value={tab}
          onChange={(v) => set({ status: v })}
          options={[
            { value: "pending", label: c ? `Not paid (${c.unpaid + c.partial})` : "Not paid" },
            { value: "unpaid", label: "Unpaid" },
            { value: "partial", label: "Part paid" },
            { value: "paid", label: "Paid" },
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
        {data && tab !== "paid" && data.rows.length > 0 && (
          <p className="text-muted pt-1">
            {money(pendingTotal)} still to collect for {fmtMonth(month)}
          </p>
        )}
        {data?.rows.length === 0 &&
          (tab === "paid" ? (
            <Empty title="No payments yet">Nobody has paid for {fmtMonth(month)} so far.</Empty>
          ) : (
            <Empty title="All clear">Every student has paid for {fmtMonth(month)}.</Empty>
          ))}
        {data && data.rows.length > 0 && (
          <ul className="space-y-2.5">
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

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white/8 py-2.5">
      <span className="block font-display text-3xl font-bold leading-none">{n}</span>
      <span className="block text-sm text-white/65 mt-0.5">{label}</span>
    </div>
  );
}

function DueCard({ r, month, onPay }: { r: DueRow; month: string; onPay: () => void }) {
  const open = r.amount_due - r.amount_paid;
  const behind = r.outstanding_months >= 2 && r.status !== "paid";
  const reminder = whatsappLink(
    r.parent_phone,
    `Hello, a gentle reminder that ${r.student_name}'s fees of ${money(r.outstanding_amount || open)} are pending` +
      (r.outstanding_months > 1 ? ` (${r.outstanding_months} months).` : ` for ${fmtMonth(month)}.`) +
      " Thank you!",
  );
  return (
    <li className={cx("bg-surface rounded-2xl shadow-card overflow-hidden", behind && "border-l-[6px] border-unpaid")}>
      <Link to={`/students/${r.student_id}`} className="flex items-center gap-3 px-4 pt-3.5 pb-1">
        <Avatar name={r.student_name} tone={r.fee_group_name.startsWith("Small") ? 1 : 0} />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[1.05rem] truncate">{r.student_name}</span>
          <span className="block text-sm text-muted">
            {r.status === "partial"
              ? `Paid ${money(r.amount_paid)} of ${money(r.amount_due)}`
              : r.status === "paid"
                ? `${money(r.amount_paid)} received`
                : `${money(r.amount_due)} due`}
          </span>
        </span>
        <StatusChip status={r.status} />
      </Link>
      {behind && (
        <p className="px-4 pl-[4.5rem] text-sm font-semibold text-unpaid">
          {r.outstanding_months} months pending, {money(r.outstanding_amount)} in total
        </p>
      )}
      {r.status !== "paid" ? (
        <div className="grid grid-cols-2 gap-2 p-3 pt-2.5">
          <button type="button" onClick={onPay} className="min-h-12 rounded-cut bg-navy text-white font-semibold active:bg-navy-soft">
            Record payment
          </button>
          {reminder ? (
            <a href={reminder} target="_blank" rel="noreferrer" className="min-h-12 rounded-xl bg-paper grid place-items-center font-semibold text-navy">
              Send reminder
            </a>
          ) : (
            <span className="min-h-12 grid place-items-center text-sm text-muted">No phone saved</span>
          )}
        </div>
      ) : (
        <div className="h-3" />
      )}
    </li>
  );
}
