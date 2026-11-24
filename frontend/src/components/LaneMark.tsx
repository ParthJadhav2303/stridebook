/** Three track lanes curving into a forward arrow: run, jump, throw. */
export function LaneMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" fill="none" strokeLinecap="round">
      <path d="M6 52 C 22 52, 34 40, 40 24" stroke="var(--color-volt)" strokeWidth="5" />
      <path d="M14 58 C 32 58, 46 44, 52 24" stroke="currentColor" strokeWidth="5" />
      <path d="M4 42 C 16 42, 24 34, 28 24" stroke="var(--color-brick)" strokeWidth="5" />
      <path d="M30 14 L 46 8 L 50 24" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
    </svg>
  );
}
