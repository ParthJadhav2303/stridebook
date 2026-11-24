import type { Payment } from "../../api/types";
import { fmtDay, fmtMonthList, money } from "../../lib/format";

/** Plain-text receipt for WhatsApp. */
export function receiptText(p: Payment, clubName?: string) {
  const covered = fmtMonthList(p.months.map((m) => m.period));
  return [
    clubName ? `${clubName}: fee receipt` : "Fee receipt",
    `Student: ${p.student_name}`,
    `Amount: ${money(p.amount)} (${p.mode === "upi" ? "UPI" : "cash"})`,
    covered && `For: ${covered}`,
    `Date: ${fmtDay(p.paid_on)}`,
    `Receipt no: ${p.receipt_no}`,
    "Thank you!",
  ]
    .filter(Boolean)
    .join("\n");
}
