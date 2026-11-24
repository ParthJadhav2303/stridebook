import { useState } from "react";
import { Link } from "react-router";
import { useFeeGroups, useStudents } from "../../api/hooks";
import { Page, PageHeader } from "../../components/Layout";
import { Empty, ErrorNote, FilterChips, Loading, StatusChip } from "../../components/ui";
import { money } from "../../lib/format";

export function StudentsPage() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<number | null>(null);
  const [status, setStatus] = useState("active");
  const [pendingOnly, setPendingOnly] = useState<string | null>(null);
  const { data: groups } = useFeeGroups();
  const { data, isLoading, error } = useStudents({ q, fee_group_id: group, status, month_status: pendingOnly });

  return (
    <>
      <PageHeader
        title="Students"
        action={
          <Link to="/students/new" className="min-h-11 px-4 rounded-lg bg-volt text-navy font-semibold grid place-items-center">
            Add
          </Link>
        }
      />
      <Page className="space-y-3">
        <input
          type="search"
          aria-label="Search students"
          placeholder="Search name, parent or phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full min-h-12 px-4 rounded-lg border-2 border-line bg-white text-[1.05rem] outline-none focus:border-navy"
        />
        <FilterChips
          label="This month"
          value={pendingOnly}
          onChange={setPendingOnly}
          options={[
            { value: null, label: "Everyone" },
            { value: "pending", label: "Not paid this month" },
          ]}
        />
        <FilterChips
          label="Group"
          value={group}
          onChange={setGroup}
          options={[{ value: null, label: "All groups" }, ...(groups ?? []).map((g) => ({ value: g.id, label: g.name }))]}
        />
        <FilterChips
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
            { value: "left", label: "Left" },
          ]}
        />

        <ErrorNote error={error} />
        {isLoading && <Loading />}
        {data && (
          <p className="text-sm text-muted pt-1">
            {data.length} {data.length === 1 ? "student" : "students"}
          </p>
        )}
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
          <ul className="bg-white rounded-xl border border-line divide-y divide-line">
            {data.map((s) => (
              <li key={s.id}>
                <Link to={`/students/${s.id}`} className="flex items-center gap-3 px-4 py-3 min-h-16">
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-[1.05rem] truncate">{s.full_name}</span>
                    <span className="block text-sm text-muted truncate">
                      {s.fee_group_name}
                      {s.outstanding_amount > 0 && (
                        <span className="text-unpaid font-semibold">, owes {money(s.outstanding_amount)}</span>
                      )}
                    </span>
                  </span>
                  <StatusChip status={s.month_status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Page>
    </>
  );
}
