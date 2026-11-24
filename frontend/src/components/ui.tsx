import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import type { DueStatus } from "../api/types";
import { fmtMonth, shiftMonth, thisMonth } from "../lib/format";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- Buttons ----------
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
  full?: boolean;
};

export function Button({ variant = "primary", busy, full, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "min-h-12 px-5 rounded-lg font-semibold text-[1.05rem] inline-flex items-center justify-center gap-2",
        "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-navy text-white active:bg-navy-soft",
        variant === "secondary" && "bg-white text-navy border-2 border-navy/15 active:bg-paper",
        variant === "ghost" && "text-navy active:bg-navy/5",
        variant === "danger" && "bg-white text-unpaid border-2 border-unpaid/30",
        full && "w-full",
        className,
      )}
    >
      {busy ? "Saving…" : children}
    </button>
  );
}

// ---------- Form fields ----------
type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; prefix?: string };

export function Field({ label, hint, prefix, className, ...rest }: FieldProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block font-semibold mb-1.5">
        {label}
      </label>
      <div className="flex items-stretch rounded-lg border-2 border-line bg-white focus-within:border-navy">
        {prefix && <span className="pl-3 flex items-center text-muted text-lg">{prefix}</span>}
        <input
          id={id}
          {...rest}
          className="w-full min-h-12 px-3 bg-transparent text-[1.05rem] outline-none rounded-lg"
        />
      </div>
      {hint && <p className="text-sm text-muted mt-1">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block font-semibold mb-1.5">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full px-3 py-2.5 rounded-lg border-2 border-line bg-white text-[1.05rem] outline-none focus:border-navy"
      />
    </div>
  );
}

/** Big side-by-side choice buttons (Cash / UPI, Big / Small group, …). */
export function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: ReactNode; sub?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="font-semibold mb-1.5">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              type="button"
              key={String(o.value)}
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cx(
                "min-h-14 rounded-lg border-2 px-2 py-2 text-center leading-tight",
                on ? "border-navy bg-navy text-white" : "border-line bg-white text-ink",
              )}
            >
              <span className="block font-semibold text-[1.05rem]">{o.label}</span>
              {o.sub && <span className={cx("block text-sm", on ? "text-white/75" : "text-muted")}>{o.sub}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Small toggle chips for list filters. */
export function FilterChips<T extends string | number | null>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "shrink-0 min-h-10 px-4 rounded-full border text-[0.95rem] font-semibold",
            o.value === value ? "bg-navy text-white border-navy" : "bg-white text-ink border-line",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Status ----------
const STATUS_STYLE: Record<DueStatus, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-paid/10 text-paid border-paid/30" },
  partial: { label: "Part paid", cls: "bg-partial/10 text-partial border-partial/30" },
  unpaid: { label: "Unpaid", cls: "bg-unpaid/10 text-unpaid border-unpaid/30" },
  waived: { label: "Waived", cls: "bg-line text-muted border-line" },
};

export function StatusChip({ status }: { status: DueStatus | null }) {
  if (!status) return <span className="text-sm text-muted">Not charged</span>;
  const s = STATUS_STYLE[status];
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold", s.cls)}>
      {s.label}
    </span>
  );
}

export const statusLabel = (s: DueStatus) => STATUS_STYLE[s].label;

// ---------- Month picker ----------
export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const isCurrent = value >= thisMonth();
  return (
    <div className="flex items-center justify-between bg-white rounded-lg border border-line">
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(value, -1))}
        className="size-12 grid place-items-center text-2xl text-navy"
      >
        ‹
      </button>
      <span className="font-display text-xl font-bold text-navy">{fmtMonth(value)}</span>
      <button
        type="button"
        aria-label="Next month"
        disabled={isCurrent}
        onClick={() => onChange(shiftMonth(value, 1))}
        className="size-12 grid place-items-center text-2xl text-navy disabled:opacity-25"
      >
        ›
      </button>
    </div>
  );
}

// ---------- Feedback ----------
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-unpaid/30 bg-unpaid/5 text-unpaid px-4 py-3">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="text-muted py-8 text-center">{label}</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="font-display text-2xl font-bold text-navy">{title}</p>
      {children && <div className="text-muted mt-1">{children}</div>}
    </div>
  );
}

// ---------- Bottom sheet ----------
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="sheet m-0 mt-auto w-full max-w-lg mx-auto max-h-[92dvh] rounded-t-2xl bg-paper p-0 backdrop:bg-ink/50"
    >
      <div className="sticky top-0 bg-paper z-10 flex items-center justify-between px-5 pt-4 pb-2 border-b border-line">
        <h2 className="font-display text-2xl font-bold text-navy">{title}</h2>
        <button type="button" onClick={onClose} className="min-h-11 px-3 font-semibold text-muted">
          Close
        </button>
      </div>
      <div className="px-5 py-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">{open && children}</div>
    </dialog>
  );
}

export { cx };
