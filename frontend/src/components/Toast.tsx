import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

type ToastData = { id: number; message: string; action?: { label: string; href: string } };
const Ctx = createContext<(t: Omit<ToastData, "id">) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const show = useCallback((t: Omit<ToastData, "id">) => setToast({ ...t, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none">
        {toast && (
          <div
            key={toast.id}
            className="toast-in pointer-events-auto max-w-md w-full bg-ink text-white rounded-xl px-4 py-3 shadow-lg flex items-center gap-3"
          >
            <p className="flex-1">{toast.message}</p>
            {toast.action && (
              <a href={toast.action.href} target="_blank" rel="noreferrer" className="font-semibold text-volt shrink-0">
                {toast.action.label}
              </a>
            )}
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="text-white/60 px-1 text-xl">
              ×
            </button>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
