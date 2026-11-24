import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

type Action = { label: string; href?: string; onClick?: () => void };
type ToastData = { id: number; message: string; actions?: Action[]; duration?: number };
const Ctx = createContext<(t: Omit<ToastData, "id">) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const show = useCallback((t: Omit<ToastData, "id">) => setToast({ ...t, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.duration ?? 9000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="fixed inset-x-0 bottom-28 z-50 flex justify-center px-4 pointer-events-none">
        {toast && (
          <div key={toast.id} className="toast-in pointer-events-auto max-w-md w-full bg-night text-white rounded-2xl px-4 py-3.5 shadow-float">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-1 size-2.5 shrink-0 rounded-full bg-volt" />
              <p className="flex-1">{toast.message}</p>
              <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="-mr-1 -mt-1 size-9 text-xl text-white/60">
                ×
              </button>
            </div>
            {toast.actions && toast.actions.length > 0 && (
              <div className="flex gap-2 mt-2.5 pl-5">
                {toast.actions.map((a) =>
                  a.href ? (
                    <a key={a.label} href={a.href} target="_blank" rel="noreferrer" className="min-h-10 px-4 grid place-items-center rounded-full bg-volt text-navy font-semibold">
                      {a.label}
                    </a>
                  ) : (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => {
                        setToast(null);
                        a.onClick?.();
                      }}
                      className="min-h-10 px-4 rounded-full bg-white/12 border border-white/20 font-semibold"
                    >
                      {a.label}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
