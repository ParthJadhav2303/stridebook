import { useState } from "react";
import { Link } from "react-router";
import { download } from "../../api/client";
import { Page, PageHeader } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { Avatar, Card, SectionTitle } from "../../components/ui";
import { fmtMonth, thisMonth } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";

type Item = { to?: string; onClick?: () => void; label: string; sub: string };

export function MorePage() {
  const { user, isAdmin, logout } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const exportThisMonth = async () => {
    setBusy(true);
    try {
      await download(`/reports/export.xlsx?month=${thisMonth()}`, `stridebook-fees-${thisMonth()}.xlsx`);
    } catch (e) {
      toast({ message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const records: Item[] = [
    { onClick: exportThisMonth, label: busy ? "Preparing Excel…" : "Download Excel", sub: `Fees and payments for ${fmtMonth(thisMonth())}` },
    ...(isAdmin
      ? [
          { to: "/more/import", label: "Import from Excel", sub: "Add past payments from your sheet" },
          { to: "/more/activity", label: "Activity", sub: "Who recorded, changed or cancelled what" },
        ]
      : []),
  ];
  const settings: Item[] = [
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
      <PageHeader title="More">
        <div className="flex items-center gap-3 rounded-2xl bg-white/8 p-3">
          <Avatar name={user?.full_name ?? "?"} tone={0} />
          <div>
            <p className="font-semibold">{user?.full_name}</p>
            <p className="text-sm text-white/65">
              {user?.username}, {user?.role === "admin" ? "admin" : "coach"}
            </p>
          </div>
        </div>
      </PageHeader>
      <Page>
        <SectionTitle>Records</SectionTitle>
        <ItemList items={records} />
        <SectionTitle>Settings</SectionTitle>
        <ItemList items={settings} />
        <button
          type="button"
          onClick={logout}
          className="mt-6 w-full min-h-13 rounded-2xl bg-surface shadow-card font-semibold text-unpaid"
        >
          Sign out
        </button>
      </Page>
    </>
  );
}

function ItemList({ items }: { items: Item[] }) {
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {items.map((i) => {
        const inner = (
          <>
            <span className="flex-1 text-left">
              <span className="block font-semibold">{i.label}</span>
              {i.sub && <span className="block text-sm text-muted">{i.sub}</span>}
            </span>
            <span aria-hidden="true" className="text-2xl text-muted">
              ›
            </span>
          </>
        );
        const cls = "flex w-full items-center px-4 py-3 min-h-16 active:bg-paper";
        return i.to ? (
          <Link key={i.label} to={i.to} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={i.label} type="button" onClick={i.onClick} className={cls}>
            {inner}
          </button>
        );
      })}
    </Card>
  );
}
