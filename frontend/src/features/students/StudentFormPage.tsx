import { type FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useFeeGroups, useSaveStudent, useStudent } from "../../api/hooks";
import type { Student, StudentStatus } from "../../api/types";
import { Page, PageHeader } from "../../components/Layout";
import { Button, Choice, ErrorNote, Field, Loading, TextArea } from "../../components/ui";
import { money, todayIso } from "../../lib/format";

export function StudentFormPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : undefined;
  const { data: existing } = useStudent(id ?? 0);
  if (id && !existing) {
    return (
      <>
        <PageHeader title="Edit student" back />
        <Loading />
      </>
    );
  }
  return <StudentForm key={id ?? "new"} existing={id ? existing : undefined} />;
}

function StudentForm({ existing }: { existing?: Student }) {
  const navigate = useNavigate();
  const { data: groups } = useFeeGroups();
  const save = useSaveStudent(existing?.id);

  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [parentName, setParentName] = useState(existing?.parent_name ?? "");
  const [phone, setPhone] = useState(existing?.parent_phone ?? "");
  const [altPhone, setAltPhone] = useState(existing?.alt_phone ?? "");
  const [groupId, setGroupId] = useState<number | null>(existing?.fee_group_id ?? null);
  const [specialFee, setSpecialFee] = useState(existing?.custom_monthly_fee != null);
  const [customFee, setCustomFee] = useState(existing?.custom_monthly_fee?.toString() ?? "");
  const [joining, setJoining] = useState(existing?.joining_date ?? todayIso());
  const [dob, setDob] = useState(existing?.date_of_birth ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [status, setStatus] = useState<StudentStatus>(existing?.status ?? "active");
  const [leaving, setLeaving] = useState(existing?.leaving_date ?? todayIso());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!groupId) return;
    const saved = await save.mutateAsync({
      full_name: fullName,
      parent_name: parentName || null,
      parent_phone: phone || null,
      alt_phone: altPhone || null,
      fee_group_id: groupId,
      custom_monthly_fee: specialFee && customFee ? Number(customFee) : null,
      joining_date: joining,
      date_of_birth: dob || null,
      notes: notes || null,
      ...(existing ? { status, leaving_date: status === "left" ? leaving : null } : {}),
    });
    navigate(`/students/${saved.id}`, { replace: true });
  }

  return (
    <>
      <PageHeader title={existing ? "Edit student" : "Add student"} back />
      <Page>
        <form onSubmit={(e) => submit(e).catch(() => undefined)} className="space-y-5">
          <Field label="Student name" required autoComplete="off" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Field label="Parent name" autoComplete="off" value={parentName} onChange={(e) => setParentName(e.target.value)} />
          <Field
            label="Parent phone (WhatsApp)"
            type="tel"
            inputMode="tel"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          {groups ? (
            <Choice
              label="Fee group"
              value={groupId}
              onChange={setGroupId}
              options={groups.map((g) => ({ value: g.id, label: g.name, sub: `${money(g.current_amount)} a month` }))}
            />
          ) : (
            <Loading />
          )}

          <div>
            <label className="flex items-center gap-3 min-h-11">
              <input type="checkbox" className="size-5 accent-navy" checked={specialFee} onChange={(e) => setSpecialFee(e.target.checked)} />
              <span className="font-semibold">Different fee for this student</span>
            </label>
            {specialFee && (
              <Field
                label="Monthly fee for this student"
                prefix="₹"
                inputMode="numeric"
                hint="For example a sibling discount. Used instead of the group fee."
                value={customFee}
                onChange={(e) => setCustomFee(e.target.value.replace(/\D/g, ""))}
                className="mt-2"
              />
            )}
          </div>

          <Field
            label="Joining date"
            type="date"
            required
            value={joining}
            onChange={(e) => setJoining(e.target.value)}
            hint="The full monthly fee applies from the joining month."
          />

          {existing && (
            <>
              <Choice
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "active", label: "Active" },
                  { value: "paused", label: "Paused" },
                  { value: "left", label: "Left" },
                ]}
              />
              {status === "paused" && <p className="text-sm text-muted -mt-3">No new monthly fees while paused.</p>}
              {status === "left" && (
                <Field
                  label="Leaving date"
                  type="date"
                  value={leaving}
                  onChange={(e) => setLeaving(e.target.value)}
                  hint="Fees stop after this month. Unpaid fees for later months are removed."
                />
              )}
            </>
          )}

          <details className="rounded-2xl bg-surface shadow-card px-4 py-2">
            <summary className="min-h-10 flex items-center font-semibold cursor-pointer">More details (optional)</summary>
            <div className="space-y-4 py-3">
              <Field label="Other phone" type="tel" inputMode="tel" value={altPhone} onChange={(e) => setAltPhone(e.target.value)} />
              <Field label="Date of birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              <TextArea label="Notes" value={notes} onChange={setNotes} />
            </div>
          </details>

          <ErrorNote error={save.error} />
          <Button type="submit" full busy={save.isPending} disabled={!groupId || !fullName.trim()}>
            {existing ? "Save changes" : "Add student"}
          </Button>
          {!groupId && <p className="text-sm text-muted text-center -mt-3">Choose a fee group to continue.</p>}
        </form>
      </Page>
    </>
  );
}
