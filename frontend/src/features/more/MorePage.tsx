import { Link } from "react-router";
import { Page, PageHeader } from "../../components/Layout";
import { useAuth } from "../auth/AuthContext";

export function MorePage() {
  const { user, isAdmin, logout } = useAuth();
  const items = [
    { to: "/more/fee-groups", label: "Fee groups", sub: isAdmin ? "See and change monthly fees" : "See monthly fees" },
    ...(isAdmin
      ? [
          { to: "/more/users", label: "Coaches and logins", sub: "Add a coach, reset a password" },
          { to: "/more/club", label: "Club name", sub: "Shown on the app and receipts" },
        ]
      : []),
    { to: "/more/password", label: "Change my password", sub: "" },
    { to: "/more/status", label: "System check", sub: "Is the server working?" },
  ];
  return (
    <>
      <PageHeader title="More" />
      <Page className="space-y-5">
        <p className="text-muted">
          Signed in as <span className="font-semibold text-ink">{user?.full_name}</span> ({user?.role === "admin" ? "admin" : "coach"})
        </p>
        <ul className="bg-white rounded-xl border border-line divide-y divide-line">
          {items.map((i) => (
            <li key={i.to}>
              <Link to={i.to} className="flex items-center px-4 py-3 min-h-16">
                <span className="flex-1">
                  <span className="block font-semibold">{i.label}</span>
                  {i.sub && <span className="block text-sm text-muted">{i.sub}</span>}
                </span>
                <span aria-hidden="true" className="text-2xl text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" onClick={logout} className="w-full min-h-12 rounded-lg border-2 border-line bg-white font-semibold text-unpaid">
          Sign out
        </button>
      </Page>
    </>
  );
}
