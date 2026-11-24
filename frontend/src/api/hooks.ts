import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, post, upload } from "./client";
import type {
  Activity,
  Dashboard,
  DuesSummary,
  FeeGroup,
  Health,
  ImportPreview,
  LedgerMonth,
  Payment,
  PaymentInput,
  PublicSettings,
  Student,
  StudentInput,
  User,
} from "./types";

const qs = (params: Record<string, string | number | null | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};

// Anything that changes money or students invalidates these.
const MONEY_KEYS = [["dashboard"], ["students"], ["student"], ["ledger"], ["dues"], ["payments"]];

function useInvalidateMoney() {
  const qc = useQueryClient();
  return () => MONEY_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
}

export const usePublicSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => get<PublicSettings>("/settings/public"), staleTime: 300_000 });

export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: () => get<Health>("/health"), retry: 0 });

export const useFeeGroups = () =>
  useQuery({ queryKey: ["fee-groups"], queryFn: () => get<FeeGroup[]>("/fee-groups"), staleTime: 300_000 });

export const useDashboard = (month: string) =>
  useQuery({ queryKey: ["dashboard", month], queryFn: () => get<Dashboard>(`/reports/dashboard${qs({ month })}`) });

export type StudentFilters = {
  q?: string;
  fee_group_id?: number | null;
  status?: string;
  month_status?: string | null;
};

export const useStudents = (f: StudentFilters) =>
  useQuery({
    queryKey: ["students", f],
    queryFn: () => get<Student[]>(`/students${qs(f)}`),
    placeholderData: (prev) => prev,
  });

export const useStudent = (id: number) =>
  useQuery({ queryKey: ["student", id], queryFn: () => get<Student>(`/students/${id}`), enabled: id > 0 });

export const useLedger = (id: number, year: number) =>
  useQuery({
    queryKey: ["ledger", id, year],
    queryFn: () => get<{ year: number; months: LedgerMonth[] }>(`/students/${id}/ledger?year=${year}`),
  });

export const usePayments = (params: { student_id?: number; month?: string; limit?: number }) =>
  useQuery({ queryKey: ["payments", params], queryFn: () => get<Payment[]>(`/payments${qs(params)}`) });

export const useDues = (month: string, status: string | null, fee_group_id: number | null) =>
  useQuery({
    queryKey: ["dues", month, status, fee_group_id],
    queryFn: () => get<DuesSummary>(`/dues${qs({ month, status, fee_group_id })}`),
    placeholderData: (prev) => prev,
  });

export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: () => get<User[]>("/users") });

// --- mutations ---
export function useSaveStudent(id?: number) {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (body: StudentInput) => (id ? patch<Student>(`/students/${id}`, body) : post<Student>("/students", body)),
    onSuccess: invalidate,
  });
}

export function useRecordPayment() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (body: PaymentInput) => post<Payment>("/payments", body), onSuccess: invalidate });
}

export function useSetRate() {
  const qc = useQueryClient();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (v: { groupId: number; monthly_amount: number; effective_from: string }) =>
      post<FeeGroup>(`/fee-groups/${v.groupId}/rates`, {
        monthly_amount: v.monthly_amount,
        effective_from: v.effective_from,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-groups"] });
      invalidate();
    },
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PublicSettings>) => patch<PublicSettings>("/settings", body),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; full_name: string; role: string; password: string }) =>
      post<User>("/users", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; is_active?: boolean; role?: string; new_password?: string }) =>
      patch<User>(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export const usePayment = (id: number) =>
  useQuery({ queryKey: ["payments", "one", id], queryFn: () => get<Payment>(`/payments/${id}`), enabled: id > 0 });

export function useVoidPayment() {
  const invalidate = useInvalidateMoney();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => post<Payment>(`/payments/${id}/void`, { reason: reason ?? "" }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export const useActivity = () =>
  useQuery({ queryKey: ["activity"], queryFn: () => get<Activity[]>("/activity?limit=100") });

export function useImportPreview() {
  return useMutation({ mutationFn: (file: File) => upload<ImportPreview>("/import/preview", file) });
}

export function useImportCommit() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (body: {
      filename: string;
      rows: { student_name: string; month: string; paid_on: string; amount: number; mode: string }[];
      new_students: { name: string; fee_group_id: number }[];
    }) => post<{ payments_created: number; students_created: number; total_amount: number }>("/import/commit", body),
    onSuccess: invalidate,
  });
}
