import { useState } from "react";
import { Link, useParams } from "react-router";
import { useLedger, usePayments, useStudent } from "../../api/hooks";
import type { LedgerMonth, Student } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { Button, ErrorNote, Loading, cx, statusLabel } from "../../components/ui";
import { fmtDay, fmtMonth, fmtMonthList, fmtMonthShort, money, thisMonth, whatsappLink } from "../../lib/format";
import { PaymentSheet } from "../payments/PaymentSheet";

export function StudentProfilePage() {
  const id = Number(useParams().id);
  const { data: s, error } = useStudent(id);
  const [paying, setPaying] = useState(false);

  return (
    <>
      <PageHeader
        title={s?.full_name ?? "Student"}
        back="/students"
        action={
          s && (
            <Link to={`/students/${id}/edit`} className="min-h-11 px-3 grid place-items-center font-semibold text-white/90">
              Edit
            </Link>
          )
        }
      />
      <Page className="space-y-5">
        <ErrorNote error={error} />
        {!s && !error && <Loading />}
        {s && (
          <>
            <Summary s={s} onPay={() => setPaying(true)} />
            <YearGrid studentId={id} />
            <History studentId={id} />
          </>
        )}
      </Page>
      <PaymentSheet open={paying} onClose={() => setPaying(false)} studentId={id} />
    </>
  );
}

function Summary({ s, onPay }: { s: Student; onPay: () => void }) {
  const reminder =
    s.outstanding_amount > 0
      ? whatsappLink(
          s.parent_phone,
          `Hello${s.parent_name ? ` ${s.parent_name}` : ""}, a gentle reminder that ${s.full_name}'s fees of ${money(s.outstanding_amount)} ` +
            `are pending (${s.outstanding_months} ${s.outstanding_months === 1 ? "month" : "months"}). Thank you!`,
        )
      : null;

  return (
    <section className="bg-white rounded-xl border border-line p-5 space-y-4">
      {s.status !== "active" && (
        <p className="rounded-lg bg-line/60 px-3 py-2 font-semibold text-muted">
          {s.status === "left" ? `Left on ${s.leaving_date ? fmtDay(s.leaving_date) : "—"}` : "Paused: no new monthly fees"}
        </p>
      )}
      <div>
        <p className={cx("font-display text-4xl font-bold leading-none", s.outstanding_amount > 0 ? "text-unpaid" : "text-paid")}>
          {s.outstanding_amount > 0 ? money(s.outstanding_amount) : "All paid"}
        </p>
        <p className="text-muted mt-1">
          {s.outstanding_amount > 0
            ? `pending for ${s.outstanding_months} ${s.outstanding_months === 1 ? "month" : "months"}`
            : `up to ${fmtMonth(thisMonth())}`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Info label="Group" value={s.fee_group_name} />
        <Info label="Monthly fee" value={`${money(s.monthly_fee)}${s.custom_monthly_fee != null ? " (special)" : ""}`} />
        <Info label="Parent" value={s.parent_name ?? "—"} />
        <Info label="Joined" value={fmtDay(s.joining_date)} />
      </dl>

      {s.parent_phone && (
        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:${s.parent_phone}`} className="min-h-12 rounded-lg border-2 border-line grid place-items-center font-semibold text-navy">
            Call parent
          </a>
          {reminder ? (
            <a href={reminder} target="_blank" rel="noreferrer" className="min-h-12 rounded-lg border-2 border-line grid place-items-center font-semibold text-navy">
              Send reminder
            </a>
          ) : (
            <a
              href={whatsappLink(s.parent_phone, "") ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="min-h-12 rounded-lg border-2 border-line grid place-items-center font-semibold text-navy"
            >
              WhatsApp
            </a>
          )}
        </div>
      )}
      <Button full onClick={onPay} className="min-h-14 text-lg">
        Record payment
      </Button>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

const TILE: Record<string, string> = {
  paid: "bg-paid text-white border-paid",
  partial: "bg-partial/10 text-partial border-partial",
  unpaid: "bg-white text-unpaid border-unpaid",
  waived: "bg-line text-muted border-line",
};

function YearGrid({ studentId }: { studentId: number }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useLedger(studentId, year);
  return (
    <section aria-labelledby="year-h">
      <div className="flex items-center justify-between mb-2">
        <h2 id="year-h" className="font-display text-2xl font-bold text-navy">
          Fees in {year}
        </h2>
        <div className="flex">
          <button type="button" aria-label="Previous year" onClick={() => setYear(year - 1)} className="size-11 text-2xl text-navy">
            ‹
          </button>
          <button
            type="button"
            aria-label="Next year"
            disabled={year >= new Date().getFullYear() + 1}
            onClick={() => setYear(year + 1)}
            className="size-11 text-2xl text-navy disabled:opacity-25"
          >
            ›
          </button>
        </div>
      </div>
      {!data ? (
        <Loading />
      ) : (
        <ol className="grid grid-cols-4 gap-2">
          {data.months.map((m) => (
            <MonthTile key={m.period} m={m} />
          ))}
        </ol>
      )}
    </section>
  );
}

function MonthTile({ m }: { m: LedgerMonth }) {
  const label = m.status ? statusLabel(m.status) : "";
  const detail =
    m.status === "partial" ? `${money(m.amount_paid)} of ${money(m.amount_due)}` : m.status ? money(m.amount_due) : "";
  return (
    <li
      className={cx(
        "rounded-lg border-2 px-2 py-2 min-h-18 text-center",
        m.status ? TILE[m.status] : "border-dashed border-line text-muted/60",
      )}
      aria-label={`${fmtMonth(m.period)}: ${m.status ? `${label}, ${detail}` : "not charged"}`}
    >
      <span className="block font-display text-lg font-bold leading-tight">{fmtMonthShort(m.period)}</span>
      <span className="block text-xs font-semibold">{label}</span>
      {m.status === "partial" && <span className="block text-[0.7rem] leading-tight">{detail}</span>}
    </li>
  );
}

function History({ studentId }: { studentId: number }) {
  const { data, error } = usePayments({ student_id: studentId, limit: 50 });
  return (
    <section aria-labelledby="hist-h">
      <h2 id="hist-h" className="font-display text-2xl font-bold text-navy mb-2">
        Payments
      </h2>
      <ErrorNote error={error} />
      {data?.length === 0 && <p className="text-muted bg-white rounded-xl border border-line px-4 py-6 text-center">No payments recorded yet.</p>}
      {data && data.length > 0 && (
        <ul className="bg-white rounded-xl border border-line divide-y divide-line">
          {data.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{money(p.amount)}</span>
                <span className="text-muted">{fmtDay(p.paid_on)}</span>
              </div>
              <p className="text-sm text-muted">
                {p.mode === "upi" ? "UPI" : "Cash"}, for {fmtMonthList(p.months.map((m) => m.period))}. Received by {p.received_by_name}.
              </p>
              <p className="text-xs text-muted mt-0.5">Receipt {p.receipt_no}</p>
              {p.note && <p className="text-sm mt-1">{p.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
