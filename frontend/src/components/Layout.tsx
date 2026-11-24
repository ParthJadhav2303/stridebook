import type { ReactNode } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router";
import { usePublicSettings } from "../api/hooks";
import { useAuth } from "../features/auth/AuthContext";
import { LaneMark } from "./LaneMark";
import { cx } from "./ui";

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const TABS = [
  { to: "/", label: "Home", icon: icon("M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z") },
  { to: "/students", label: "Students", icon: icon("M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8") },
  { to: "/dues", label: "Dues", icon: icon("M4 4h16v16H4zM8 9h8M8 13h8M8 17h5") },
  { to: "/more", label: "More", icon: icon("M4 6h16M4 12h16M4 18h16") },
];

export function Layout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="min-h-dvh pb-32">
      <Outlet />
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pointer-events-none">
        <ul className="pointer-events-auto max-w-lg mx-auto grid grid-cols-4 gap-1 p-1.5 rounded-[26px] bg-night/95 backdrop-blur shadow-float">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.to === "/"}
                className={({ isActive }) =>
                  cx(
                    "flex flex-col items-center gap-0.5 py-2 min-h-15 rounded-[20px] text-[0.8rem] font-semibold transition-colors",
                    isActive ? "bg-white/10 text-white" : "text-white/55",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? "text-volt" : ""}>{t.icon}</span>
                    {t.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cx("grid place-items-center rounded-xl bg-white/8 ring-1 ring-white/15", className)}>
      <LaneMark className="size-[70%] text-white" />
    </span>
  );
}

/** Night-stadium header. Inner pages get a back button; children render inside the dark band. */
export function PageHeader({
  title,
  back,
  action,
  subtitle,
  children,
}: {
  title: string;
  back?: boolean | string;
  action?: ReactNode;
  subtitle?: string | null;
  children?: ReactNode;
}) {
  const { data: club } = usePublicSettings();
  const navigate = useNavigate();
  return (
    <header className="stadium text-white px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-6 rounded-b-[32px]">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 min-h-12">
          {back ? (
            <button
              type="button"
              onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
              aria-label="Back"
              className="-ml-1 size-11 grid place-items-center rounded-full bg-white/10 text-2xl leading-none"
            >
              ‹
            </button>
          ) : (
            <BrandMark className="size-11 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[2rem] font-bold leading-none truncate">{title}</h1>
            <p className="text-white/65 text-sm mt-1 truncate">{subtitle === undefined ? club?.club_name : subtitle}</p>
          </div>
          {action}
        </div>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx("max-w-lg mx-auto px-5 py-5", className)}>{children}</main>;
}
