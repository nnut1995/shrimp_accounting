export const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/** "2026-05-15" -> "15/5/69" (Buddhist Era, 2-digit year) */
export function formatBE(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${String((y + 543) % 100).padStart(2, "0")}`;
}

export function beYear(ceYear: number): number {
  return ceYear + 543;
}

/** (2026, 5) -> "พฤษภาคม 2569" */
export function monthLabelBE(ceYear: number, month: number): string {
  return `${THAI_MONTHS[month - 1]} ${beYear(ceYear)}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
