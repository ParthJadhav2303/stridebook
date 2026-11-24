import { useState } from "react";
import { Link } from "react-router";
import { useDashboard } from "../../api/hooks";
import { Page, PageHeader } from "../../components/Layout";
import { Button, ErrorNote, Loading, MonthPicker } from "../../components/ui";
import { fmtDay, fmtMonth, fmtMonthList, money, thisMonth } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { PaymentSheet } from "../payments/PaymentSheet";

export function HomePage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [paying, setPaying] = useState(false);
  const { data: d, isLoading, error } = useDashboard(month);

  const share = d && d.expected > 0 ? Math.min(100, Math.round((d.received_for_month / d.expected) * 100)) : 0;
  const total = d ? d.students_paid + d.students_partial + d.students_unpaid : 0;

  return (
    <>
      <PageHeader title={`Hi, ${user?.full_name.split(" ")[0] ?? ""}`} />
      <Page className="space-y-5">
        <MonthPicker value={month} onChange={setMonth} />
        <ErrorNote error={error} />
        {isLoading && <Loading />}

        {d && (
          <>
            <section aria-labelledby="fees-h" className="bg-white rounded-xl border border-line p-5">
              <h2 id="fees-h" className="text-muted font-semibold">
                Fees for {fmtMonth(month)}
              </h2>
              <p className="mt-1 font-display font-bold text-navy leading-none">
                <span className="text-5xl">{money(d.received_for_month)}</span>
                <span className="text-2xl text-muted"> of {money(d.expected)}</span>
              </p>

              {/* Progress drawn as a running lane: volt fill on a navy track. */}
              <div
                className="mt-4 h-3 rounded-full bg-navy/10 overflow-hidden"
                role="progressbar"
                aria-valuenow={share}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Share of this month's fees received"
              >
                <div className="h-full rounded-full bg-volt border-r-4 border-navy" style={{ width: `${share}%` }} />
              </div>
              <p className="mt-2 text-muted">
                {d.pending_for_month > 0 ? `${money(d.pending_for_month)} still to come` : total > 0 ? "Everyone has paid" : "No fees due"}
              </p>

              <div className="grid grid-cols-3 gap-2 mt-4">
                <CountLink to={`/dues?month=${month}&status=paid`} n={d.students_paid} label="Paid" tone="text-paid" />
                <CountLink to={`/dues?month=${month}&status=partial`} n={d.students_partial} label="Part paid" tone="text-partial" />
                <CountLink to={`/dues?month=${month}&status=unpaid`} n={d.students_unpaid} label="Unpaid" tone="text-unpaid" />
              </div>
            </section>

            <Button full onClick={() => setPaying(true)} className="min-h-14 text-lg">
              Record payment
            </Button>

            <section aria-labelledby="in-h" className="bg-white rounded-xl border border-line p-5">
              <h2 id="in-h" className="text-muted font-semibold">
                Money received in {fmtMonth(month)}
              </h2>
              <p className="font-display text-3xl font-bold text-navy mt-1">{money(d.collected_in_month)}</p>
              <dl className="grid grid-cols-2 gap-3 mt-3">
                <div className="rounded-lg bg-paper px-3 py-2">
                  <dt className="text-sm text-muted">Cash</dt>
                  <dd className="font-semibold text-lg">{money(d.collected_cash)}</dd>
                </div>
                <div className="rounded-lg bg-paper px-3 py-2">
                  <dt className="text-sm text-muted">UPI</dt>
                  <dd className="font-semibold text-lg">{money(d.collected_upi)}</dd>
                </div>
              </dl>
            </section>

            {d.total_outstanding > 0 && (
              <Link to="/dues?status=pending" className="block rounded-xl border-2 border-unpaid/25 bg-unpaid/5 p-5">
                <p className="font-semibold text-unpaid">Pending across all months</p>
                <p className="font-display text-3xl font-bold text-ink mt-1">{money(d.total_outstanding)}</p>
                <p className="text-muted">
                  {d.students_with_dues} of {d.active_students} students owe fees. Tap to see who.
                </p>
              </Link>
            )}

            <section aria-labelledby="recent-h">
              <h2 id="recent-h" className="font-display text-2xl font-bold text-navy mb-2">
                Recent payments
              </h2>
              {d.recent_payments.length === 0 ? (
                <p className="text-muted bg-white rounded-xl border border-line px-4 py-6 text-center">
                  No payments recorded in {fmtMonth(month)} yet.
                </p>
              ) : (
                <ul className="bg-white rounded-xl border border-line divide-y divide-line">
                  {d.recent_payments.map((p) => (
                    <li key={p.id}>
                      <Link to={`/students/${p.student_id}`} className="flex items-center gap-3 px-4 py-3 min-h-16">
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold truncate">{p.student_name}</span>
                          <span className="block text-sm text-muted truncate">
                            {fmtDay(p.paid_on)}, {p.mode === "upi" ? "UPI" : "cash"}
                            {p.months.length > 0 && `, for ${fmtMonthList(p.months.map((m) => m.period))}`}
                          </span>
                        </span>
                        <span className="font-semibold">{money(p.amount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </Page>
      <PaymentSheet open={paying} onClose={() => setPaying(false)} />
    </>
  );
}

function CountLink({ to, n, label, tone }: { to: string; n: number; label: string; tone: string }) {
  return (
    <Link to={to} className="rounded-lg bg-paper px-3 py-3 text-center">
      <span className={`block font-display text-3xl font-bold ${tone}`}>{n}</span>
      <span className="block text-sm font-semibold text-muted">{label}</span>
    </Link>
  );
}
