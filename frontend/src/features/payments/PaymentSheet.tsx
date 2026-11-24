import { useState } from "react";
import { useLedger, useRecordPayment, useStudent, useStudents, useVoidPayment } from "../../api/hooks";
import type { Payment, PaymentMode, Student } from "../../api/types";
import { useToast } from "../../components/Toast";
import { Avatar, Button, Choice, ErrorNote, Field, Loading, Sheet, StatusChip, TextArea, cx } from "../../components/ui";
import { fmtMonthList, fmtMonthShort, money, thisMonth, todayIso, whatsappLink } from "../../lib/format";
import { receiptText } from "./receipt";

/** Record a payment. Pass studentId to skip the picker. */
export function PaymentSheet({ open, onClose, studentId }: { open: boolean; onClose: () => void; studentId?: number | null }) {
  const [picked, setPicked] = useState<number | null>(null);
  const toast = useToast();
  const undo = useVoidPayment(); // lives here so Undo still works after the sheet closes
  const id = studentId ?? picked;

  const close = () => {
    setPicked(null);
    onClose();
  };

  function saved(p: Payment, parentPhone: string | null) {
    const covered = fmtMonthList(p.months.map((m) => m.period));
    const receipt = whatsappLink(parentPhone, receiptText(p));
    toast({
      message: `${money(p.amount)} from ${p.student_name} saved${covered ? ` for ${covered}` : ""}.`,
      duration: 12000,
      actions: [
        ...(receipt ? [{ label: "Send receipt", href: receipt }] : []),
        {
          label: "Undo",
          onClick: () =>
            undo
              .mutateAsync({ id: p.id, reason: "Undone right after saving" })
              .then(() => toast({ message: `Payment of ${money(p.amount)} undone.` }))
              .catch((e: Error) => toast({ message: e.message })),
        },
      ],
    });
    close();
  }

  return (
    <Sheet open={open} onClose={close} title="Record payment">
      {id ? (
        <PaymentForm key={id} studentId={id} onSaved={saved} onChangeStudent={studentId ? undefined : () => setPicked(null)} />
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
      <Field label="Who paid?" placeholder="Type a name or phone" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading && <Loading />}
      <ul className="bg-surface rounded-2xl shadow-card divide-y divide-line max-h-[52dvh] overflow-y-auto">
        {data?.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)} className="w-full text-left px-4 py-3 min-h-16 flex items-center gap-3 active:bg-paper">
              <Avatar name={s.full_name} tone={s.fee_group_id - 1} />
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

function PaymentForm({
  studentId,
  onSaved,
  onChangeStudent,
}: {
  studentId: number;
  onSaved: (p: Payment, phone: string | null) => void;
  onChangeStudent?: () => void;
}) {
  const { data: student, isFetchedAfterMount } = useStudent(studentId);
  // Wait for fresh numbers: the amount is pre-filled from what the student owes right now.
  if (!student || !isFetchedAfterMount) return <Loading />;
  return <PaymentFormLoaded student={student} onSaved={onSaved} onChangeStudent={onChangeStudent} />;
}

function PaymentFormLoaded({
  student,
  onSaved,
  onChangeStudent,
}: {
  student: Student;
  onSaved: (p: Payment, phone: string | null) => void;
  onChangeStudent?: () => void;
}) {
  const fee = student.monthly_fee ?? 0;
  const owed = student.outstanding_amount;
  const [amount, setAmount] = useState(String(owed > 0 ? owed : fee || ""));
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [note, setNote] = useState("");
  const [pickMonths, setPickMonths] = useState(false);
  const [months, setMonths] = useState<string[]>([]);
  const save = useRecordPayment();

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
    onSaved(p, student.parent_phone);
  }

  const quick = [
    fee > 0 && { label: `${money(fee)} (1 month)`, value: fee },
    fee > 0 && { label: `${money(fee * 3)} (3 months)`, value: fee * 3 },
    owed > 0 && owed !== fee && owed !== fee * 3 && { label: `${money(owed)} (all pending)`, value: owed },
  ].filter(Boolean) as { label: string; value: number }[];

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit().catch(() => undefined);
      }}
    >
      <div className="stadium rounded-cut px-4 py-4 flex items-center gap-3 text-white">
        <Avatar name={student.full_name} tone={student.fee_group_id - 1} />
        <div className="flex-1 min-w-0">
          <p className="font-display text-2xl font-bold leading-none truncate">{student.full_name}</p>
          <p className="text-white/70 text-sm mt-1">
            {student.fee_group_name}, {money(fee)} a month
          </p>
          <p className={cx("font-semibold mt-0.5", owed > 0 ? "text-volt" : "text-white/80")}>
            {owed > 0
              ? `Owes ${money(owed)} for ${student.outstanding_months} ${student.outstanding_months === 1 ? "month" : "months"}`
              : "Nothing pending"}
          </p>
        </div>
        {onChangeStudent && (
          <button type="button" onClick={onChangeStudent} className="min-h-11 px-3 rounded-full bg-white/10 font-semibold">
            Change
          </button>
        )}
      </div>

      <div>
        <Field label="Amount" prefix="₹" inputMode="numeric" pattern="[0-9]*" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        {quick.length > 0 && (
          <div className="flex gap-2 mt-2.5 flex-wrap">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setAmount(String(q.value))}
                className={cx(
                  "min-h-10 px-3.5 rounded-full text-sm font-semibold transition-colors",
                  value === q.value ? "bg-navy text-white" : "bg-surface shadow-card",
                )}
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
          <input type="checkbox" className="size-5 accent-navy" checked={pickMonths} onChange={(e) => setPickMonths(e.target.checked)} />
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
      <Button type="submit" variant="volt" full busy={save.isPending} disabled={!valid} className="min-h-14 text-lg">
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
            className={cx("min-h-13 rounded-xl font-semibold transition-colors", on ? "bg-navy text-white" : "bg-surface shadow-card")}
          >
            {fmtMonthShort(m.period)}
            {key > now && <span className="block text-xs font-normal opacity-75">advance</span>}
          </button>
        );
      })}
    </div>
  );
}
