import { useState } from "react";
import { Link, useParams } from "react-router";
import { useLedger, usePayments, useStudent } from "../../api/hooks";
import type { LedgerMonth, Student } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { Avatar, Button, Card, ErrorNote, Loading, SectionTitle, cx, statusLabel } from "../../components/ui";
import { fmtDay, fmtMonth, fmtMonthShort, money, thisMonth, whatsappLink } from "../../lib/format";
import { PaymentRow } from "../home/HomePage";
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
        subtitle={s ? `${s.fee_group_name}, ${money(s.monthly_fee)} a month${s.custom_monthly_fee != null ? " (special fee)" : ""}` : ""}
        action={
          s && (
            <Link to={`/students/${id}/edit`} className="min-h-11 px-4 rounded-full bg-white/10 grid place-items-center font-semibold">
              Edit
            </Link>
          )
        }
      >
        {s && <Hero s={s} onPay={() => setPaying(true)} />}
      </PageHeader>
      <Page>
        <ErrorNote error={error} />
        {!s && !error && <Loading />}
        {s && (
          <>
            <Details s={s} />
            <YearGrid studentId={id} />
            <History studentId={id} />
          </>
        )}
      </Page>
      <PaymentSheet open={paying} onClose={() => setPaying(false)} studentId={id} />
    </>
  );
}

function Hero({ s, onPay }: { s: Student; onPay: () => void }) {
  const reminder =
    s.outstanding_amount > 0
      ? whatsappLink(
          s.parent_phone,
          `Hello${s.parent_name ? ` ${s.parent_name}` : ""}, a gentle reminder that ${s.full_name}'s fees of ${money(s.outstanding_amount)} ` +
            `are pending (${s.outstanding_months} ${s.outstanding_months === 1 ? "month" : "months"}). Thank you!`,
        )
      : whatsappLink(s.parent_phone, "");
  const pill = "min-h-12 rounded-2xl bg-white/10 grid place-items-center font-semibold";
  return (
    <div>
      {s.status !== "active" && (
        <p className="mb-3 inline-block rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
          {s.status === "left" ? `Left on ${s.leaving_date ? fmtDay(s.leaving_date) : "—"}` : "Paused: no new monthly fees"}
        </p>
      )}
      <div className="flex items-end gap-4">
        <Avatar name={s.full_name} tone={s.fee_group_id - 1} size="lg" />
        <div>
          <p className={cx("font-display text-[2.8rem] font-bold leading-[0.9]", s.outstanding_amount > 0 ? "text-volt" : "text-white")}>
            {s.outstanding_amount > 0 ? money(s.outstanding_amount) : "All paid"}
          </p>
          <p className="text-white/75 mt-1">
            {s.outstanding_amount > 0
              ? `pending for ${s.outstanding_months} ${s.outstanding_months === 1 ? "month" : "months"}`
              : `up to ${fmtMonth(thisMonth())}`}
          </p>
        </div>
      </div>
      {s.parent_phone && (
        <div className="grid grid-cols-2 gap-2 mt-4">
          <a href={`tel:${s.parent_phone}`} className={pill}>
            Call parent
          </a>
          <a href={reminder ?? "#"} target="_blank" rel="noreferrer" className={pill}>
            {s.outstanding_amount > 0 ? "Send reminder" : "WhatsApp"}
          </a>
        </div>
      )}
      <Button variant="volt" full onClick={onPay} className="mt-2 min-h-14 text-lg">
        Record payment
      </Button>
    </div>
  );
}

function Details({ s }: { s: Student }) {
  const items = [
    ["Parent", s.parent_name ?? "—"],
    ["Phone", s.parent_phone ?? "—"],
    ["Joined", fmtDay(s.joining_date)],
    ["Group", s.fee_group_name],
  ];
  return (
    <Card className="p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="font-semibold truncate">{value}</dd>
          </div>
        ))}
      </dl>
      {s.notes && <p className="mt-3 pt-3 border-t border-line text-muted">{s.notes}</p>}
    </Card>
  );
}

const TILE: Record<string, string> = {
  paid: "bg-paid text-white",
  partial: "bg-partial/12 text-partial ring-2 ring-inset ring-partial/50",
  unpaid: "bg-surface text-unpaid ring-2 ring-inset ring-unpaid/45",
  waived: "bg-line text-muted",
};

function YearGrid({ studentId }: { studentId: number }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useLedger(studentId, year);
  const btn = "size-11 grid place-items-center rounded-full bg-surface shadow-card text-2xl text-navy disabled:opacity-25";
  return (
    <section aria-labelledby="year-h">
      <div className="flex items-end justify-between mt-7 mb-2.5">
        <h2 id="year-h" className="font-display text-[1.6rem] font-bold text-navy leading-none">
          Fees in {year}
        </h2>
        <div className="flex gap-2">
          <button type="button" aria-label="Previous year" onClick={() => setYear(year - 1)} className={btn}>
            ‹
          </button>
          <button type="button" aria-label="Next year" disabled={year >= new Date().getFullYear() + 1} onClick={() => setYear(year + 1)} className={btn}>
            ›
          </button>
        </div>
      </div>
      {!data ? (
        <Loading />
      ) : (
        <ol className="grid grid-cols-4 gap-2">
          {data.months.map((m) => (
            <MonthTile key={m.period} m={m} current={m.period.slice(0, 7) === thisMonth()} />
          ))}
        </ol>
      )}
    </section>
  );
}

function MonthTile({ m, current }: { m: LedgerMonth; current: boolean }) {
  const label = m.status ? statusLabel(m.status) : "";
  const detail = m.status === "partial" ? `${money(m.amount_paid)} of ${money(m.amount_due)}` : m.status ? money(m.amount_due) : "";
  return (
    <li
      className={cx(
        "relative rounded-xl px-2 py-2.5 min-h-19 text-center",
        m.status ? TILE[m.status] : "border-2 border-dashed border-line text-muted/60",
        current && "outline-3 outline-offset-2 outline-volt-deep",
      )}
      aria-label={`${fmtMonth(m.period)}: ${m.status ? `${label}, ${detail}` : "not charged"}${current ? " (this month)" : ""}`}
    >
      <span className="block font-display text-xl font-bold leading-tight">{fmtMonthShort(m.period)}</span>
      <span className="block text-xs font-semibold">{label}</span>
      {m.status === "partial" && <span className="block text-[0.7rem] leading-tight">{detail}</span>}
    </li>
  );
}

function History({ studentId }: { studentId: number }) {
  const { data, error } = usePayments({ student_id: studentId, limit: 50 });
  return (
    <section>
      <SectionTitle>Payments</SectionTitle>
      <ErrorNote error={error} />
      {data?.length === 0 && <Card className="px-4 py-8 text-center text-muted">No payments recorded yet.</Card>}
      {data && data.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {data.map((p) => (
            <PaymentRow key={p.id} p={p} showName={false} />
          ))}
        </Card>
      )}
    </section>
  );
}
