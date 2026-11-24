import { useState } from "react";
import { Link, useParams } from "react-router";
import { usePayment, usePublicSettings, useStudent, useVoidPayment } from "../../api/hooks";
import { Page, PageHeader } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { Button, ErrorNote, Loading, Sheet, TextArea } from "../../components/ui";
import { fmtDay, fmtMonth, money, whatsappLink } from "../../lib/format";
import { receiptText } from "./receipt";

export function ReceiptPage() {
  const id = Number(useParams().id);
  const { data: p, error } = usePayment(id);
  const { data: student } = useStudent(p?.student_id ?? 0);
  const { data: club } = usePublicSettings();
  const [confirming, setConfirming] = useState(false);

  const share = p && whatsappLink(student?.parent_phone ?? null, receiptText(p, club?.club_name));

  return (
    <>
      <PageHeader title="Receipt" back subtitle={p?.receipt_no ?? ""} />
      <Page className="-mt-2 space-y-4">
        <ErrorNote error={error} />
        {!p && !error && <Loading />}
        {p && (
          <>
            {p.is_voided && (
              <div role="status" className="rounded-2xl bg-unpaid/10 text-unpaid px-4 py-3">
                <p className="font-semibold">This payment was cancelled.</p>
                {p.void_reason && <p className="text-sm">Reason: {p.void_reason}</p>}
              </div>
            )}

            {/* Ticket-style receipt: perforated edge between the amount and the details. */}
            <article className="relative bg-surface rounded-cut shadow-card overflow-hidden">
              <div className="stadium px-5 pt-5 pb-6 text-white">
                <p className="text-white/70 text-sm">{club?.club_name}</p>
                <p className={`font-display text-[3.2rem] font-bold leading-none mt-1 ${p.is_voided ? "line-through text-white/50" : "text-volt"}`}>
                  {money(p.amount)}
                </p>
                <p className="text-white/80 mt-1">
                  {p.mode === "upi" ? "Paid by UPI" : "Paid in cash"} on {fmtDay(p.paid_on)}
                </p>
              </div>
              <div className="relative h-0 border-t-2 border-dashed border-line mx-5" aria-hidden="true">
                <span className="absolute -left-8 -top-3 size-6 rounded-full bg-paper" />
                <span className="absolute -right-8 -top-3 size-6 rounded-full bg-paper" />
              </div>
              <dl className="px-5 py-5 space-y-3.5">
                <Row label="Student">
                  <Link to={`/students/${p.student_id}`} className="font-semibold text-navy underline underline-offset-4">
                    {p.student_name}
                  </Link>
                </Row>
                <Row label="For">
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {p.months.map((m) => (
                      <span key={m.period} className="rounded-full bg-paper px-2.5 py-0.5 text-sm font-semibold">
                        {fmtMonth(m.period)}
                        {p.months.length > 1 && <span className="text-muted font-normal"> {money(m.amount)}</span>}
                      </span>
                    ))}
                  </span>
                </Row>
                <Row label="Receipt no">{p.receipt_no}</Row>
                <Row label="Received by">{p.received_by_name}</Row>
                {p.note && <Row label="Note">{p.note}</Row>}
              </dl>
            </article>

            {!p.is_voided && share && (
              <a href={share} target="_blank" rel="noreferrer" className="flex min-h-14 items-center justify-center rounded-cut bg-volt text-navy font-semibold text-lg shadow-card">
                Send receipt on WhatsApp
              </a>
            )}
            {p.can_void && (
              <Button variant="danger" full onClick={() => setConfirming(true)}>
                Cancel this payment
              </Button>
            )}
            {!p.is_voided && !p.can_void && (
              <p className="text-sm text-muted text-center">To cancel this payment, ask an admin.</p>
            )}
          </>
        )}
      </Page>
      {p && <CancelSheet open={confirming} onClose={() => setConfirming(false)} paymentId={p.id} amount={p.amount} name={p.student_name} />}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function CancelSheet({ open, onClose, paymentId, amount, name }: { open: boolean; onClose: () => void; paymentId: number; amount: number; name: string }) {
  const [reason, setReason] = useState("");
  const cancel = useVoidPayment();
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="Cancel payment">
      <div className="space-y-5">
        <p>
          {money(amount)} from <span className="font-semibold">{name}</span> will be removed, and those months will show as
          unpaid again. The receipt stays in the records, marked cancelled.
        </p>
        <TextArea label="Reason (helps later)" value={reason} onChange={setReason} />
        <ErrorNote error={cancel.error} />
        <Button
          variant="danger"
          full
          busy={cancel.isPending}
          onClick={() =>
            cancel
              .mutateAsync({ id: paymentId, reason })
              .then(() => {
                toast({ message: `Payment of ${money(amount)} cancelled.` });
                onClose();
              })
              .catch(() => undefined)
          }
        >
          Cancel payment of {money(amount)}
        </Button>
        <Button variant="ghost" full onClick={onClose}>
          Keep it
        </Button>
      </div>
    </Sheet>
  );
}
