import { useState } from "react";
import { Link } from "react-router";
import { useDashboard } from "../../api/hooks";
import type { Payment } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { TrackOval } from "../../components/TrackOval";
import { Avatar, Button, Card, ErrorNote, Loading, MonthPicker, SectionTitle, cx } from "../../components/ui";
import { fmtDay, fmtMonth, fmtMonthList, money, thisMonth } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { PaymentSheet } from "../payments/PaymentSheet";

export function HomePage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [paying, setPaying] = useState(false);
  const { data: d, isLoading, error } = useDashboard(month);

  const share = d && d.expected > 0 ? Math.round((d.received_for_month / d.expected) * 100) : 0;
  const cashShare = d && d.collected_in_month > 0 ? Math.round((d.collected_cash / d.collected_in_month) * 100) : 0;

  return (
    <>
      <PageHeader title={`Hi, ${user?.full_name.split(" ")[0] ?? ""}`}>
        <MonthPicker value={month} onChange={setMonth} dark />
        <div className="mt-3 -mx-1">
          <TrackOval percent={share}>
            {d ? (
              <div>
                <p className="text-white/70 text-sm font-semibold">Fees in for {fmtMonth(month).split(" ")[0]}</p>
                <p className="font-display font-bold text-volt text-[2.9rem] leading-[0.95] mt-0.5">{money(d.received_for_month)}</p>
                <p className="text-white/75 text-sm mt-1">
                  of {money(d.expected)}, {share}%
                </p>
              </div>
            ) : (
              <span className="text-white/60">{isLoading ? "Loading…" : ""}</span>
            )}
          </TrackOval>
        </div>
        <Button variant="volt" full className="mt-3 min-h-14 text-lg" onClick={() => setPaying(true)}>
          Record payment
        </Button>
      </PageHeader>

      <Page>
        <ErrorNote error={error} />
        {isLoading && !d && <Loading />}
        {d && (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <CountTile to={`/dues?month=${month}&status=paid`} n={d.students_paid} label="Paid" tone="paid" />
              <CountTile to={`/dues?month=${month}&status=partial`} n={d.students_partial} label="Part paid" tone="partial" />
              <CountTile to={`/dues?month=${month}&status=unpaid`} n={d.students_unpaid} label="Unpaid" tone="unpaid" />
            </div>

            <Card className="mt-3 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold text-muted">Received in {fmtMonth(month)}</h2>
                <p className="font-display text-[1.9rem] font-bold text-navy leading-none">{money(d.collected_in_month)}</p>
              </div>
              <div className="mt-4 h-2.5 rounded-full bg-paper overflow-hidden flex" aria-hidden="true">
                <span className="h-full bg-navy" style={{ width: `${cashShare}%` }} />
                <span className="h-full bg-volt-deep" style={{ width: `${d.collected_in_month > 0 ? 100 - cashShare : 0}%` }} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-navy" aria-hidden="true" />
                  <dt className="text-muted">Cash</dt>
                  <dd className="ml-auto font-semibold">{money(d.collected_cash)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-volt-deep" aria-hidden="true" />
                  <dt className="text-muted">UPI</dt>
                  <dd className="ml-auto font-semibold">{money(d.collected_upi)}</dd>
                </div>
              </dl>
            </Card>

            {d.total_outstanding > 0 && (
              <Link to="/dues?status=pending" className="mt-3 flex items-center gap-4 rounded-cut bg-surface shadow-card p-5 border-l-[6px] border-unpaid">
                <div className="flex-1">
                  <p className="font-semibold text-unpaid">Pending across all months</p>
                  <p className="font-display text-[2rem] font-bold text-ink leading-none mt-1">{money(d.total_outstanding)}</p>
                  <p className="text-muted mt-1">
                    {d.students_with_dues} of {d.active_students} students owe fees
                  </p>
                </div>
                <span className="size-11 grid place-items-center rounded-full bg-paper text-2xl text-navy" aria-hidden="true">
                  ›
                </span>
              </Link>
            )}

            <SectionTitle>Recent payments</SectionTitle>
            {d.recent_payments.length === 0 ? (
              <Card className="px-4 py-8 text-center text-muted">No payments recorded in {fmtMonth(month)} yet.</Card>
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {d.recent_payments.map((p) => (
                  <PaymentRow key={p.id} p={p} />
                ))}
              </Card>
            )}
          </>
        )}
      </Page>
      <PaymentSheet open={paying} onClose={() => setPaying(false)} />
    </>
  );
}

export function PaymentRow({ p, showName = true }: { p: Payment; showName?: boolean }) {
  return (
    <Link to={`/payments/${p.id}`} className="flex items-center gap-3 px-4 py-3 min-h-17 active:bg-paper">
      {showName && <Avatar name={p.student_name} tone={p.student_id} />}
      <span className="flex-1 min-w-0">
        <span className="block font-semibold truncate">{showName ? p.student_name : fmtDay(p.paid_on)}</span>
        <span className="block text-sm text-muted truncate">
          {showName && `${fmtDay(p.paid_on)}, `}
          {p.mode === "upi" ? "UPI" : "Cash"}
          {p.months.length > 0 && ` for ${fmtMonthList(p.months.map((m) => m.period))}`}
        </span>
      </span>
      <span className={cx("font-display text-xl font-bold", p.is_voided ? "text-muted line-through" : "text-navy")}>{money(p.amount)}</span>
    </Link>
  );
}

const TONE = {
  paid: "text-paid before:bg-paid",
  partial: "text-partial before:bg-partial",
  unpaid: "text-unpaid before:bg-unpaid",
};

function CountTile({ to, n, label, tone }: { to: string; n: number; label: string; tone: keyof typeof TONE }) {
  return (
    <Link
      to={to}
      className={cx(
        "relative overflow-hidden rounded-2xl bg-surface shadow-card px-3 pt-4 pb-3 text-center",
        "before:absolute before:inset-x-0 before:top-0 before:h-1.5",
        TONE[tone],
      )}
    >
      <span className="block font-display text-[2.4rem] font-bold leading-none">{n}</span>
      <span className="block text-sm font-semibold text-muted mt-1">{label}</span>
    </Link>
  );
}
