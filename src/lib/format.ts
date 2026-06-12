export function fmt(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPct(p: number | null | undefined): string {
  if (p == null) return "";
  return (
    (p * 100).toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%"
  );
}
