import { useState } from "react";
import { Link } from "react-router";
import { useFeeGroups, useStudents } from "../../api/hooks";
import { Page, PageHeader } from "../../components/Layout";
import { Avatar, Card, Empty, ErrorNote, FilterChips, Loading, StatusChip } from "../../components/ui";
import { money } from "../../lib/format";

export function StudentsPage() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<number | null>(null);
  const [view, setView] = useState<"all" | "pending" | "paused" | "left">("all");
  const status = view === "paused" || view === "left" ? view : "active";
  const pendingOnly = view === "pending" ? "pending" : null;
  const { data: groups } = useFeeGroups();
  const { data, isLoading, error } = useStudents({ q, fee_group_id: group, status, month_status: pendingOnly });

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={data ? `${data.length} ${status === "active" ? "active" : status} ${data.length === 1 ? "student" : "students"}` : null}
        action={
          <Link to="/students/new" className="min-h-11 px-4 rounded-cut bg-volt text-navy font-semibold grid place-items-center">
            Add student
          </Link>
        }
      >
        <div className="relative">
          <svg viewBox="0 0 24 24" className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-white/60" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            aria-label="Search students"
            placeholder="Search name, parent or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full min-h-13 pl-12 pr-4 rounded-2xl bg-white/10 text-white placeholder:text-white/55 text-[1.05rem] outline-none focus:bg-white/15 focus:ring-2 focus:ring-volt/60"
          />
        </div>
      </PageHeader>
      <Page className="space-y-2.5">
        <FilterChips
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "Everyone" },
            { value: "pending", label: "Not paid this month" },
            { value: "paused", label: "Paused" },
            { value: "left", label: "Left" },
          ]}
        />
        <FilterChips
          label="Group"
          value={group}
          onChange={setGroup}
          options={[{ value: null, label: "All groups" }, ...(groups ?? []).map((g) => ({ value: g.id, label: g.name }))]}
        />

        <ErrorNote error={error} />
        {isLoading && <Loading />}
        {data?.length === 0 &&
          (q || group || pendingOnly || status !== "active" ? (
            <Empty title="No students match">Try a different search or filter.</Empty>
          ) : (
            <Empty title="No students yet">
              <Link to="/students/new" className="text-navy font-semibold underline">
                Add the first student
              </Link>
            </Empty>
          ))}
        {data && data.length > 0 && (
          <Card className="divide-y divide-line overflow-hidden !mt-3">
            {data.map((s) => (
              <Link key={s.id} to={`/students/${s.id}`} className="flex items-center gap-3 px-4 py-3 min-h-17 active:bg-paper">
                <Avatar name={s.full_name} tone={s.fee_group_id - 1} />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[1.05rem] truncate">{s.full_name}</span>
                  <span className="block text-sm truncate">
                    {s.outstanding_amount > 0 ? (
                      <span className="text-unpaid font-semibold">Owes {money(s.outstanding_amount)}</span>
                    ) : (
                      <span className="text-muted">{s.fee_group_name}</span>
                    )}
                  </span>
                </span>
                <StatusChip status={s.month_status} />
              </Link>
            ))}
          </Card>
        )}
      </Page>
    </>
  );
}
