import { useRef, useState } from "react";
import { Link } from "react-router";
import { useFeeGroups, useImportCommit, useImportPreview } from "../../api/hooks";
import type { ImportPreview, ImportRow } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { Button, Card, Choice, ErrorNote, SectionTitle, cx } from "../../components/ui";
import { fmtDay, fmtMonth, money } from "../../lib/format";

/** Three steps: choose file → check the preview (and pick groups for new students) → import. */
export function ImportPage() {
  const preview = useImportPreview();
  const commit = useImportCommit();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <PageHeader title="Import from Excel" back="/more" subtitle="Add past payments from your sheet" />
      <Page className="space-y-4">
        {commit.data ? (
          <Done result={commit.data} />
        ) : preview.data ? (
          <Review
            data={preview.data}
            onRestart={() => {
              preview.reset();
              if (fileRef.current) fileRef.current.value = "";
            }}
            commit={commit}
          />
        ) : (
          <>
            <Card className="p-5 space-y-3">
              <h2 className="font-display text-2xl font-bold text-navy leading-none">What the sheet needs</h2>
              <p>One row per payment, with these column headings in the first row:</p>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-navy text-white">
                      {["Student name", "Month", "Date", "Amount paid"].map((h) => (
                        <th key={h} className="px-2 py-1.5 font-semibold first:rounded-l-lg last:rounded-r-lg">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    <tr>
                      <td className="px-2 py-1.5">Aarav Patil</td>
                      <td className="px-2 py-1.5">Oct 2026</td>
                      <td className="px-2 py-1.5">05/10/2026</td>
                      <td className="px-2 py-1.5">1200</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted">
                An optional <span className="font-semibold">Mode</span> column (Cash, UPI, GPay, PhonePe) is read too. Anything
                else counts as cash. Nothing is saved until you check the preview and confirm.
              </p>
            </Card>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              id="import-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) preview.mutate(f);
              }}
            />
            <label
              htmlFor="import-file"
              className={cx(
                "flex min-h-14 items-center justify-center rounded-cut bg-volt text-navy font-semibold text-lg shadow-card cursor-pointer",
                preview.isPending && "opacity-60 pointer-events-none",
              )}
            >
              {preview.isPending ? "Reading the file…" : "Choose Excel file"}
            </label>
            <ErrorNote error={preview.error} />
          </>
        )}
      </Page>
    </>
  );
}

const STATUS: Record<ImportRow["status"], { label: string; cls: string }> = {
  ok: { label: "Ready", cls: "bg-paid/10 text-paid" },
  new_student: { label: "New student", cls: "bg-navy/8 text-navy" },
  duplicate: { label: "Skipped", cls: "bg-line text-muted" },
  error: { label: "Problem", cls: "bg-unpaid/10 text-unpaid" },
};

function Review({
  data,
  onRestart,
  commit,
}: {
  data: ImportPreview;
  onRestart: () => void;
  commit: ReturnType<typeof useImportCommit>;
}) {
  const { data: groups } = useFeeGroups();
  const [groupFor, setGroupFor] = useState<Record<string, number>>({});
  const [show, setShow] = useState<"all" | "problems">(data.error_rows > 0 ? "problems" : "all");
  const good = data.rows.filter((r) => r.status === "ok" || r.status === "new_student");
  const missingGroups = data.new_students.filter((n) => !groupFor[n.name]);
  const rows = show === "problems" ? data.rows.filter((r) => r.status === "error" || r.status === "duplicate") : data.rows;

  const confirm = () =>
    commit.mutate({
      filename: data.filename,
      rows: good.map((r) => ({
        student_name: r.student_name,
        month: r.month!,
        paid_on: r.paid_on!,
        amount: r.amount!,
        mode: r.mode,
      })),
      new_students: data.new_students.map((n) => ({ name: n.name, fee_group_id: groupFor[n.name] })),
    });

  return (
    <>
      <div className="stadium rounded-cut p-5 text-white">
        <p className="text-white/70 text-sm truncate">{data.filename}</p>
        <p className="font-display text-[2.6rem] font-bold text-volt leading-none mt-1">{money(data.total_amount)}</p>
        <p className="text-white/80 mt-1">
          {data.ok_rows} payments ready to import
          {data.new_students.length > 0 && `, ${data.new_students.length} new ${data.new_students.length === 1 ? "student" : "students"}`}
        </p>
        {(data.error_rows > 0 || data.duplicate_rows > 0) && (
          <p className="text-white/80 mt-0.5">
            {data.error_rows > 0 && `${data.error_rows} with problems (left out)`}
            {data.error_rows > 0 && data.duplicate_rows > 0 && ", "}
            {data.duplicate_rows > 0 && `${data.duplicate_rows} already recorded (skipped)`}
          </p>
        )}
      </div>

      {data.new_students.length > 0 && (
        <>
          <SectionTitle>New students</SectionTitle>
          <p className="text-muted -mt-1 mb-2">
            These names aren't in the app yet. Choose each one's fee group. They join in the first month they paid for.
          </p>
          <div className="space-y-3">
            {data.new_students.map((n) => (
              <Card key={n.name} className="p-4 space-y-3">
                <div>
                  <p className="font-semibold text-lg">{n.name}</p>
                  <p className="text-sm text-muted">
                    From {fmtMonth(n.first_month)}, {n.rows} {n.rows === 1 ? "payment" : "payments"}, {money(n.total)}
                  </p>
                </div>
                {groups && (
                  <Choice
                    label="Fee group"
                    value={groupFor[n.name] ?? null}
                    onChange={(v) => setGroupFor({ ...groupFor, [n.name]: v })}
                    options={groups.map((g) => ({ value: g.id, label: g.name, sub: money(g.current_amount) }))}
                  />
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <SectionTitle
        action={
          (data.error_rows > 0 || data.duplicate_rows > 0) && (
            <button type="button" onClick={() => setShow(show === "all" ? "problems" : "all")} className="font-semibold text-navy underline underline-offset-4">
              {show === "all" ? "Show problems only" : "Show all rows"}
            </button>
          )
        }
      >
        Rows
      </SectionTitle>
      <Card className="divide-y divide-line overflow-hidden">
        {rows.map((r) => (
          <div key={r.row} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{r.student_name || "(no name)"}</p>
                <p className="text-sm text-muted">
                  Row {r.row}
                  {r.month && `, for ${fmtMonth(r.month)}`}
                  {r.paid_on && `, paid ${fmtDay(r.paid_on)}`}
                  {r.amount != null && `, ${r.mode === "upi" ? "UPI" : "cash"}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                {r.amount != null && <p className="font-display text-xl font-bold">{money(r.amount)}</p>}
                <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold", STATUS[r.status].cls)}>
                  {STATUS[r.status].label}
                </span>
              </div>
            </div>
            {r.message && <p className={cx("text-sm mt-1", r.status === "error" ? "text-unpaid" : "text-muted")}>{r.message}</p>}
          </div>
        ))}
      </Card>

      <ErrorNote error={commit.error} />
      <div className="sticky bottom-24 -mx-5 px-5 py-3 space-y-2 bg-paper/95 backdrop-blur">
        <Button variant="volt" full className="min-h-14 text-lg" busy={commit.isPending} disabled={good.length === 0 || missingGroups.length > 0} onClick={confirm}>
          Import {good.length} {good.length === 1 ? "payment" : "payments"}
        </Button>
        {missingGroups.length > 0 && (
          <p className="text-sm text-center text-muted bg-paper rounded-lg py-1">Choose a fee group for every new student first.</p>
        )}
        <Button variant="secondary" full onClick={onRestart}>
          Choose a different file
        </Button>
      </div>
    </>
  );
}

function Done({ result }: { result: { payments_created: number; students_created: number; total_amount: number } }) {
  return (
    <div className="stadium rounded-cut p-6 text-white space-y-3">
      <p className="font-display text-[2.4rem] font-bold leading-none text-volt">Imported</p>
      <p className="text-lg">
        {result.payments_created} payments ({money(result.total_amount)})
        {result.students_created > 0 && ` and ${result.students_created} new students`} are now in StrideBook.
      </p>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Link to="/students" className="min-h-12 rounded-2xl bg-white/10 grid place-items-center font-semibold">
          See students
        </Link>
        <Link to="/more/activity" className="min-h-12 rounded-2xl bg-white/10 grid place-items-center font-semibold">
          See activity
        </Link>
      </div>
    </div>
  );
}
