import { Link } from "react-router";
import { useActivity } from "../../api/hooks";
import type { Activity } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { Card, Empty, ErrorNote, Loading, cx } from "../../components/ui";
import { fmtDay } from "../../lib/format";

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

const DOT: Record<string, string> = {
  "payment.create": "bg-paid",
  "payment.void": "bg-unpaid",
  "import.commit": "bg-volt-deep",
};

function link(a: Activity) {
  if (a.entity === "payment" && a.entity_id) return `/payments/${a.entity_id}`;
  if (a.entity === "student" && a.entity_id) return `/students/${a.entity_id}`;
  if (a.entity === "fee_group") return "/more/fee-groups";
  if (a.entity === "user") return "/more/users";
  return null;
}

export function ActivityPage() {
  const { data, error, isLoading } = useActivity();
  // Group entries by day, newest first.
  const days = new Map<string, Activity[]>();
  data?.forEach((a) => {
    const day = a.created_at.slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), a]);
  });

  return (
    <>
      <PageHeader title="Activity" back="/more" subtitle="The last 100 actions" />
      <Page>
        <ErrorNote error={error} />
        {isLoading && <Loading />}
        {data?.length === 0 && <Empty title="Nothing yet">Recorded payments and changes will appear here.</Empty>}
        {[...days.entries()].map(([day, items]) => (
          <section key={day} className="mb-5">
            <h2 className="font-display text-xl font-bold text-navy mb-2">{fmtDay(day)}</h2>
            <Card className="divide-y divide-line overflow-hidden">
              {items.map((a) => {
                const to = link(a);
                const body = (
                  <>
                    <span className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[a.action] ?? "bg-navy-soft")} aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      <span className="block">{a.summary}</span>
                      <span className="block text-sm text-muted mt-0.5">
                        {a.user_name ?? "System"}, {timeFmt.format(new Date(a.created_at))}
                      </span>
                    </span>
                  </>
                );
                return to ? (
                  <Link key={a.id} to={to} className="flex gap-3 px-4 py-3 active:bg-paper">
                    {body}
                  </Link>
                ) : (
                  <div key={a.id} className="flex gap-3 px-4 py-3">
                    {body}
                  </div>
                );
              })}
            </Card>
          </section>
        ))}
      </Page>
    </>
  );
}
