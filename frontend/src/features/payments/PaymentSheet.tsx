import { useState } from "react";
import { useLedger, useRecordPayment, useStudent, useStudents } from "../../api/hooks";
import type { PaymentMode, Student } from "../../api/types";
import { useToast } from "../../components/Toast";
import { Button, Choice, ErrorNote, Field, Loading, Sheet, StatusChip, TextArea, cx } from "../../components/ui";
import { fmtDay, fmtMonthList, fmtMonthShort, money, thisMonth, todayIso, whatsappLink } from "../../lib/format";

/** Record a payment. Pass studentId to skip the picker. */
export function PaymentSheet({ open, onClose, studentId }: { open: boolean; onClose: () => void; studentId?: number | null }) {
  const [picked, setPicked] = useState<number | null>(null);
  const id = studentId ?? picked;
  const close = () => {
    setPicked(null);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="Record payment">
      {id ? (
        <PaymentForm key={id} studentId={id} onDone={close} onChangeStudent={studentId ? undefined : () => setPicked(null)} />
      ) : (
        <StudentPicker onPick={setPicked} />
      )}
    </Sheet>
  );
}

function StudentPicker({ onPick }: { onPick: (id: number) => void }) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useStudents({ q, status: "active" });
  return (
    <div className="space-y-3">
      <Field label="Student" placeholder="Type a name or phone" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading && <Loading />}
      <ul className="divide-y divide-line bg-white rounded-lg border border-line max-h-[50dvh] overflow-y-auto">
        {data?.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)} className="w-full text-left px-4 py-3 min-h-14 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{s.full_name}</span>
                <span className="block text-sm text-muted">
                  {s.outstanding_amount > 0 ? `Owes ${money(s.outstanding_amount)}` : "Nothing pending"}
                </span>
              </span>
              <StatusChip status={s.month_status} />
            </button>
          </li>
        ))}
        {data?.length === 0 && <li className="px-4 py-6 text-center text-muted">No active student matches “{q}”.</li>}
      </ul>
    </div>
  );
}

function PaymentForm({ studentId, onDone, onChangeStudent }: { studentId: number; onDone: () => void; onChangeStudent?: () => void }) {
  const { data: student } = useStudent(studentId);
  if (!student) return <Loading />;
  return <PaymentFormLoaded student={student} onDone={onDone} onChangeStudent={onChangeStudent} />;
}

function PaymentFormLoaded({ student, onDone, onChangeStudent }: { student: Student; onDone: () => void; onChangeStudent?: () => void }) {
  const fee = student.monthly_fee ?? 0;
  const owed = student.outstanding_amount;
  const [amount, setAmount] = useState(String(owed > 0 ? owed : fee || ""));
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [note, setNote] = useState("");
  const [pickMonths, setPickMonths] = useState(false);
  const [months, setMonths] = useState<string[]>([]);
  const save = useRecordPayment();
  const toast = useToast();

  const value = Number(amount);
  const valid = value > 0 && mode !== null && (!pickMonths || months.length > 0);

  async function submit() {
    if (!valid || !mode) return;
    const p = await save.mutateAsync({
      student_id: student.id,
      amount: value,
      mode,
      paid_on: paidOn,
      note: note || null,
      months: pickMonths ? months : undefined,
    });
    const covered = fmtMonthList(p.months.map((m) => m.period));
    const receipt =
      `Payment received: ${money(p.amount)} for ${p.student_name}` +
      (covered ? ` (${covered})` : "") +
      ` by ${p.mode === "upi" ? "UPI" : "cash"} on ${fmtDay(p.paid_on)}. Receipt ${p.receipt_no}. Thank you!`;
    const link = whatsappLink(student.parent_phone, receipt);
    toast({
      message: `${money(p.amount)} from ${p.student_name} saved${covered ? ` for ${covered}` : ""}.`,
      action: link ? { label: "Send receipt", href: link } : undefined,
    });
    onDone();
  }

  const quick = [
    fee > 0 && { label: `${money(fee)} (1 month)`, value: fee },
    owed > 0 && owed !== fee && { label: `${money(owed)} (all pending)`, value: owed },
  ].filter(Boolean) as { label: string; value: number }[];

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit().catch(() => undefined);
      }}
    >
      <div className="bg-white rounded-lg border border-line px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-lg truncate">{student.full_name}</p>
          <p className="text-muted">
            {student.fee_group_name}, {money(fee)} a month
          </p>
          <p className={cx("font-semibold", owed > 0 ? "text-unpaid" : "text-paid")}>
            {owed > 0 ? `Owes ${money(owed)} (${student.outstanding_months} ${student.outstanding_months === 1 ? "month" : "months"})` : "Nothing pending"}
          </p>
        </div>
        {onChangeStudent && (
          <button type="button" onClick={onChangeStudent} className="text-navy font-semibold min-h-11 px-2">
            Change
          </button>
        )}
      </div>

      <div>
        <Field label="Amount" prefix="₹" inputMode="numeric" pattern="[0-9]*" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        {quick.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setAmount(String(q.value))}
                className={cx("min-h-10 px-3 rounded-full border text-sm font-semibold", value === q.value ? "bg-navy text-white border-navy" : "bg-white border-line")}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Choice
        label="Paid by"
        value={mode}
        onChange={setMode}
        options={[
          { value: "cash", label: "Cash" },
          { value: "upi", label: "UPI" },
        ]}
      />

      <Field label="Date received" type="date" max={todayIso()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />

      <div>
        <label className="flex items-center gap-3 min-h-11">
          <input type="checkbox" className="size-5" checked={pickMonths} onChange={(e) => setPickMonths(e.target.checked)} />
          <span className="font-semibold">Choose which months this pays for</span>
        </label>
        {pickMonths ? (
          <MonthChooser studentId={student.id} selected={months} onChange={setMonths} />
        ) : (
          <p className="text-sm text-muted">Otherwise it pays the oldest pending months first. Extra money counts as advance for coming months.</p>
        )}
      </div>

      <TextArea label="Note (optional)" value={note} onChange={setNote} />
      <ErrorNote error={save.error} />
      <Button type="submit" full busy={save.isPending} disabled={!valid}>
        {value > 0 ? `Save payment of ${money(value)}` : "Save payment"}
      </Button>
      {!mode && <p className="text-sm text-muted text-center -mt-3">Choose Cash or UPI to save.</p>}
    </form>
  );
}

function MonthChooser({ studentId, selected, onChange }: { studentId: number; selected: string[]; onChange: (m: string[]) => void }) {
  const year = new Date().getFullYear();
  const { data } = useLedger(studentId, year);
  if (!data) return <Loading />;
  const now = thisMonth();
  const options = data.months.filter((m) => {
    const key = m.period.slice(0, 7);
    return m.status === "unpaid" || m.status === "partial" || (key > now && m.status !== "paid");
  });
  const toggle = (key: string) => onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  if (options.length === 0) return <p className="text-sm text-muted">No open months this year.</p>;
  return (
    <div className="grid grid-cols-4 gap-2 mt-2">
      {options.map((m) => {
        const key = m.period.slice(0, 7);
        const on = selected.includes(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(key)}
            className={cx("min-h-12 rounded-lg border-2 font-semibold", on ? "bg-navy text-white border-navy" : "bg-white border-line")}
          >
            {fmtMonthShort(m.period)}
            {key > now && <span className="block text-xs font-normal opacity-75">advance</span>}
          </button>
        );
      })}
    </div>
  );
}
