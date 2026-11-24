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

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- Buttons ----------
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "volt" | "secondary" | "ghost" | "danger";
  busy?: boolean;
  full?: boolean;
};

export function Button({ variant = "primary", busy, full, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "min-h-13 px-5 font-semibold text-[1.05rem] inline-flex items-center justify-center gap-2",
        "transition-[transform,background-color] active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100",
        variant === "primary" && "rounded-cut bg-navy text-white active:bg-navy-soft",
        variant === "volt" && "rounded-cut bg-volt text-navy shadow-card active:bg-volt-deep",
        variant === "secondary" && "rounded-xl bg-surface text-navy border border-line shadow-card",
        variant === "ghost" && "rounded-xl text-navy active:bg-navy/5",
        variant === "danger" && "rounded-xl bg-surface text-unpaid border border-unpaid/30",
        full && "w-full",
        className,
      )}
    >
      {busy ? "Saving…" : children}
    </button>
  );
}

// ---------- Surfaces ----------
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("bg-surface rounded-2xl shadow-card", className)}>{children}</section>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between mt-7 mb-2.5">
      <h2 className="font-display text-[1.6rem] font-bold text-navy leading-none">{children}</h2>
      {action}
    </div>
  );
}

const AVATAR_TONES = ["bg-navy text-volt", "bg-brick text-white", "bg-navy-soft text-white"];

export function Avatar({ name, tone = 0, size = "md" }: { name: string; tone?: number; size?: "md" | "lg" }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cx(
        "shrink-0 grid place-items-center rounded-full font-display font-bold",
        size === "lg" ? "size-16 text-2xl" : "size-11 text-lg",
        AVATAR_TONES[tone % AVATAR_TONES.length],
      )}
    >
      {initials}
    </span>
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
      <div className="flex items-stretch rounded-xl border border-line bg-surface shadow-card focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/10">
        {prefix && <span className="pl-4 flex items-center text-muted text-xl font-display">{prefix}</span>}
        <input id={id} {...rest} className="w-full min-h-13 px-4 bg-transparent text-[1.05rem] outline-none rounded-xl" />
      </div>
      {hint && <p className="text-sm text-muted mt-1.5">{hint}</p>}
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
        className="w-full px-4 py-3 rounded-xl border border-line bg-surface shadow-card text-[1.05rem] outline-none focus:border-navy"
      />
    </div>
  );
}

/** Segmented control for 2–3 options (Cash / UPI, Big / Small group, …). */
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
      <div
        className="grid gap-1.5 p-1.5 rounded-2xl bg-navy/[0.06]"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              type="button"
              key={String(o.value)}
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cx(
                "min-h-14 rounded-xl px-2 py-2 text-center leading-tight transition-colors",
                on ? "bg-navy text-white shadow-card" : "text-ink active:bg-white/60",
              )}
            >
              <span className="block font-semibold text-[1.05rem]">{o.label}</span>
              {o.sub && <span className={cx("block text-sm", on ? "text-volt" : "text-muted")}>{o.sub}</span>}
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
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "shrink-0 min-h-10 px-4 rounded-full text-[0.95rem] font-semibold transition-colors",
            o.value === value ? "bg-navy text-white" : "bg-surface text-ink shadow-card",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Status ----------
const STATUS_STYLE: Record<DueStatus, { label: string; cls: string; dot: string }> = {
  paid: { label: "Paid", cls: "bg-paid/10 text-paid", dot: "bg-paid" },
  partial: { label: "Part paid", cls: "bg-partial/10 text-partial", dot: "bg-partial" },
  unpaid: { label: "Unpaid", cls: "bg-unpaid/10 text-unpaid", dot: "bg-unpaid" },
  waived: { label: "Waived", cls: "bg-line text-muted", dot: "bg-muted" },
};

export function StatusChip({ status }: { status: DueStatus | null }) {
  if (!status) return <span className="text-sm text-muted">Not charged</span>;
  const s = STATUS_STYLE[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap", s.cls)}>
      <span className={cx("size-2 rounded-full", s.dot)} aria-hidden="true" />
      {s.label}
    </span>
  );
}

export const statusLabel = (s: DueStatus) => STATUS_STYLE[s].label;

// ---------- Month picker ----------
export function MonthPicker({ value, onChange, dark }: { value: string; onChange: (m: string) => void; dark?: boolean }) {
  const isCurrent = value >= thisMonth();
  const btn = cx(
    "size-11 grid place-items-center rounded-full text-2xl leading-none disabled:opacity-25",
    dark ? "bg-white/10 text-white" : "bg-surface text-navy shadow-card",
  );
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" aria-label="Previous month" onClick={() => onChange(shiftMonth(value, -1))} className={btn}>
        ‹
      </button>
      <span className={cx("font-display text-2xl font-bold", dark ? "text-white" : "text-navy")}>{fmtMonth(value)}</span>
      <button type="button" aria-label="Next month" disabled={isCurrent} onClick={() => onChange(shiftMonth(value, 1))} className={btn}>
        ›
      </button>
    </div>
  );
}

// ---------- Feedback ----------
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl border border-unpaid/25 bg-unpaid/5 text-unpaid px-4 py-3">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="py-10 grid place-items-center gap-3 text-muted" role="status">
      <span className="size-8 rounded-full border-[3px] border-line border-t-navy animate-spin motion-reduce:animate-none" />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-10 px-6 bg-surface rounded-2xl shadow-card">
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
      className="sheet m-0 mt-auto w-full max-w-lg mx-auto max-h-[92dvh] rounded-t-[28px] bg-paper p-0"
    >
      <div className="sticky top-0 bg-paper/95 backdrop-blur z-10 px-5 pt-2.5 pb-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[1.75rem] font-bold text-navy leading-none">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="size-11 grid place-items-center rounded-full bg-surface shadow-card text-xl text-muted">
            ×
          </button>
        </div>
      </div>
      <div className="px-5 pt-1 pb-[max(env(safe-area-inset-bottom),1.5rem)]">{open && children}</div>
    </dialog>
  );
}
