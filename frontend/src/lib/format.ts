const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (n: number | null | undefined) => (n == null ? "—" : rupee.format(n));

const monthLong = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const monthShort = new Intl.DateTimeFormat("en-IN", { month: "short" });
const monthShortYear = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** "2026-11" or "2026-11-01" → Date (local, first of month) */
export const toDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d || 1);
};

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const isoDate = (d: Date) => `${monthKey(d)}-${String(d.getDate()).padStart(2, "0")}`;
export const todayIso = () => isoDate(new Date());
export const thisMonth = () => monthKey(new Date());
export const shiftMonth = (key: string, by: number) => {
  const d = toDate(key);
  return monthKey(new Date(d.getFullYear(), d.getMonth() + by, 1));
};

export const fmtMonth = (s: string) => monthLong.format(toDate(s));
export const fmtMonthShort = (s: string) => monthShort.format(toDate(s));
export const fmtMonthShortYear = (s: string) => monthShortYear.format(toDate(s));
export const fmtDay = (s: string) => dayFmt.format(toDate(s));

/** "Oct, Nov 2026" style list of months a payment covered */
export const fmtMonthList = (periods: string[]) => {
  if (periods.length === 0) return "";
  const years = new Set(periods.map((p) => p.slice(0, 4)));
  if (years.size === 1) return `${periods.map(fmtMonthShort).join(", ")} ${[...years][0]}`;
  return periods.map(fmtMonthShortYear).join(", ");
};

/** WhatsApp link. Indian 10-digit numbers get the 91 country code. */
export const whatsappLink = (phone: string | null, text: string) => {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};
