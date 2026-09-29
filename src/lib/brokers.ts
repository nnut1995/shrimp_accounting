import { calcTotals, type LotRow } from "./summary";

export function brokerComparison(rows: LotRow[]) {
  const groups = new Map<string, LotRow[]>();
  for (const row of rows) {
    const name = row.lot.broker?.trim() || "";
    const group = groups.get(name) ?? [];
    group.push(row);
    groups.set(name, group);
  }
  return [...groups].map(([name, lots]) => {
    const totals = calcTotals(lots);
    return {
      name, lots, ...totals,
      profitPerKg: totals.buyKg > 0 ? totals.profit / totals.buyKg : null,
      margin: totals.netSales > 0 ? totals.profit / totals.netSales : null,
      unsoldCount: lots.filter(({ lot }) => lot.sell_lines.length === 0).length,
    };
  }).sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name, "th"));
}
