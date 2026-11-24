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
    <div className="min-h-dvh pb-24">
      <Outlet />
      <nav
        aria-label="Main"
        className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="max-w-lg mx-auto grid grid-cols-4">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.to === "/"}
                className={({ isActive }) =>
                  cx(
                    "flex flex-col items-center gap-0.5 pt-2 pb-2 min-h-16 text-sm font-semibold relative",
                    isActive ? "text-navy" : "text-muted",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute top-0 inset-x-6 h-1 rounded-b bg-volt" />}
                    {t.icon}
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

/** Navy page header. The home screen shows the club; inner pages show a back button. */
export function PageHeader({ title, back, action }: { title: string; back?: boolean | string; action?: ReactNode }) {
  const { data: club } = usePublicSettings();
  const navigate = useNavigate();
  return (
    <header className="bg-navy text-white px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-4 lane-stripes">
      <div className="max-w-lg mx-auto flex items-center gap-3 min-h-12">
        {back ? (
          <button
            type="button"
            onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
            aria-label="Back"
            className="-ml-2 size-11 grid place-items-center text-3xl leading-none"
          >
            ‹
          </button>
        ) : (
          <LaneMark className="size-9 text-white shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[1.75rem] font-bold leading-none truncate">{title}</h1>
          {!back && <p className="text-white/70 text-sm mt-1 truncate">{club?.club_name}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx("max-w-lg mx-auto px-5 py-5", className)}>{children}</main>;
}
