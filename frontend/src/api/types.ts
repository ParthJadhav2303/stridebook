export type Role = "admin" | "coach";
export type DueStatus = "unpaid" | "partial" | "paid" | "waived";
export type StudentStatus = "active" | "paused" | "left";
export type PaymentMode = "cash" | "upi";

export type User = { id: number; username: string; full_name: string; role: Role; is_active: boolean };
export type Tokens = { access_token: string; refresh_token: string; user: User };

export type Health = { status: "ok" | "degraded"; db: string; version: string };
export type PublicSettings = { app_name: string; club_name: string; club_short: string };

export type FeeGroup = {
  id: number;
  name: string;
  current_amount: number | null;
  rates: { monthly_amount: number; effective_from: string }[];
};

export type Student = {
  id: number;
  full_name: string;
  parent_name: string | null;
  parent_phone: string | null;
  alt_phone: string | null;
  date_of_birth: string | null;
  fee_group_id: number;
  fee_group_name: string;
  custom_monthly_fee: number | null;
  monthly_fee: number | null;
  joining_date: string;
  leaving_date: string | null;
  status: StudentStatus;
  notes: string | null;
  month_status: DueStatus | null;
  month_due: number | null;
  month_paid: number | null;
  outstanding_amount: number;
  outstanding_months: number;
};

export type StudentInput = {
  full_name: string;
  parent_name?: string | null;
  parent_phone?: string | null;
  alt_phone?: string | null;
  date_of_birth?: string | null;
  fee_group_id: number;
  custom_monthly_fee?: number | null;
  notes?: string | null;
  joining_date?: string | null;
  status?: StudentStatus;
  leaving_date?: string | null;
};

export type LedgerMonth = {
  period: string;
  amount_due: number | null;
  amount_paid: number | null;
  status: DueStatus | null;
};

export type Payment = {
  id: number;
  receipt_no: string;
  student_id: number;
  student_name: string;
  amount: number;
  mode: PaymentMode;
  paid_on: string;
  note: string | null;
  received_by_name: string;
  created_at: string;
  months: { period: string; amount: number }[];
  is_voided: boolean;
  void_reason: string | null;
  voided_at: string | null;
  can_void: boolean;
};

export type Activity = {
  id: number;
  action: string;
  entity: string;
  entity_id: number | null;
  summary: string;
  user_name: string | null;
  created_at: string;
};

export type ImportRow = {
  row: number;
  student_name: string;
  month: string | null;
  paid_on: string | null;
  amount: number | null;
  mode: PaymentMode;
  student_id: number | null;
  status: "ok" | "new_student" | "duplicate" | "error";
  message: string | null;
};

export type ImportPreview = {
  filename: string;
  rows: ImportRow[];
  new_students: { name: string; first_month: string; rows: number; total: number }[];
  ok_rows: number;
  error_rows: number;
  duplicate_rows: number;
  total_amount: number;
};

export type PaymentInput = {
  student_id: number;
  amount: number;
  mode: PaymentMode;
  paid_on?: string;
  note?: string | null;
  months?: string[];
};

export type DueRow = {
  due_id: number;
  student_id: number;
  student_name: string;
  parent_phone: string | null;
  fee_group_name: string;
  period: string;
  amount_due: number;
  amount_paid: number;
  status: DueStatus;
  outstanding_amount: number;
  outstanding_months: number;
};

export type DuesSummary = { month: string; counts: Record<DueStatus, number>; rows: DueRow[] };

export type Dashboard = {
  month: string;
  expected: number;
  received_for_month: number;
  pending_for_month: number;
  students_paid: number;
  students_partial: number;
  students_unpaid: number;
  collected_in_month: number;
  collected_cash: number;
  collected_upi: number;
  total_outstanding: number;
  students_with_dues: number;
  active_students: number;
  recent_payments: Payment[];
};
