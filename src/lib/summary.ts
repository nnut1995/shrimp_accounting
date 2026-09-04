import { round2, sellLineSales, type LotSummary } from "./calc";
import type { LotWithChildren } from "./types";

/** A lot paired with its computed summary — the unit every rollup works on. */
export type LotRow = { lot: LotWithChildren; s: LotSummary };

export type Totals = {
  buyKg: number;
  sellKg: number;
  netSales: number;
  costTotal: number;
  expenseTotal: number;
  profit: number;
  headlineDiffKg: number;
  headlineDenomKg: number;
  headlinePct: number | null;
};

export type SupplierAgg = {
  count: number;
  buyKg: number;
  profit: number;
  hd: number;
  hdd: number;
};

export type BuyerAgg = {
  lots: Map<string, { date: string; supplier: string }>;
  sellKg: number;
  sales: number;
  hd: number;
  hdd: number;
};

export type BuyerTotals = {
  sellKg: number;
  sales: number;
  hd: number;
  hdd: number;
};

export function calcTotals(rows: LotRow[]): Totals {
  const sum = (f: (s: LotSummary) => number) =>
    round2(rows.reduce((a, x) => a + f(x.s), 0));
  const headlineDiffKg = sum((s) => s.headlineDiffKg);
  const headlineDenomKg = sum((s) => s.headlineDenomKg);
  return {
    buyKg: sum((s) => s.buyKg),
    sellKg: sum((s) => s.sellKg),
    netSales: sum((s) => s.netSales),
    costTotal: sum((s) => s.costTotal),
    expenseTotal: sum((s) => s.expenseTotal),
    profit: sum((s) => s.profit),
    headlineDiffKg,
    headlineDenomKg,
    headlinePct: headlineDenomKg > 0 ? headlineDiffKg / headlineDenomKg : null,
  };
}

/** Lot expenses grouped by category, plus the auto per-line ค่าธรรมเนียม. */
export function expenseBreakdown(rows: LotRow[]): [string, number][] {
  const expMap = new Map<string, number>();
  for (const x of rows) {
    for (const e of x.lot.expenses) {
      const name = e.expense_categories?.name ?? "อื่นๆ";
      expMap.set(name, round2((expMap.get(name) ?? 0) + Number(e.amount)));
    }
    if (x.s.feeTotal > 0) {
      expMap.set(
        "ค่าธรรมเนียม",
        round2((expMap.get("ค่าธรรมเนียม") ?? 0) + x.s.feeTotal)
      );
    }
  }
  return Array.from(expMap.entries()).sort((a, b) => b[1] - a[1]);
}

export type ExpenseMatrixRow = {
  lotId: string;
  date: string;
  supplier: string;
  /** category name -> baht on this lot; a missing key means no line at all */
  amounts: Record<string, number>;
  total: number;
};

export type ExpenseMatrix = {
  columns: string[];
  rows: ExpenseMatrixRow[];
  /** column sums, keyed like a row's amounts */
  totals: Record<string, number>;
  grandTotal: number;
};

/**
 * Lot expenses pivoted: one row per lot, one column per category that appears
 * this period, biggest first. The auto per-line ค่าธรรมเนียม is folded into
 * that category exactly as expenseBreakdown does, so both tables agree. Every
 * lot gets a row — an all-blank one usually means expenses were never entered.
 */
export function expenseMatrix(rows: LotRow[]): ExpenseMatrix {
  const colTotals = new Map<string, number>();
  const matrixRows: ExpenseMatrixRow[] = rows.map((x) => {
    const amounts: Record<string, number> = {};
    const add = (name: string, amount: number) => {
      amounts[name] = round2((amounts[name] ?? 0) + amount);
      colTotals.set(name, round2((colTotals.get(name) ?? 0) + amount));
    };
    for (const e of x.lot.expenses) {
      add(e.expense_categories?.name ?? "อื่นๆ", Number(e.amount));
    }
    if (x.s.feeTotal > 0) add("ค่าธรรมเนียม", x.s.feeTotal);
    return {
      lotId: x.lot.id,
      date: x.lot.buy_date,
      supplier: x.lot.suppliers?.name ?? "",
      amounts,
      // the lot table's ค่าใช้จ่าย column, so a row ties back to it exactly
      total: x.s.expenseTotal,
    };
  });
  const columns = Array.from(colTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  return {
    columns,
    rows: matrixRows,
    totals: Object.fromEntries(colTotals),
    grandTotal: round2(matrixRows.reduce((a, r) => a + r.total, 0)),
  };
}

export function supplierComparison(rows: LotRow[]): [string, SupplierAgg][] {
  const supMap = new Map<string, SupplierAgg>();
  for (const x of rows) {
    const name = x.lot.suppliers?.name ?? "ไม่ระบุ";
    const cur = supMap.get(name) ?? {
      count: 0,
      buyKg: 0,
      profit: 0,
      hd: 0,
      hdd: 0,
    };
    cur.count += 1;
    cur.buyKg = round2(cur.buyKg + x.s.buyKg);
    cur.profit = round2(cur.profit + x.s.profit);
    cur.hd = round2(cur.hd + x.s.headlineDiffKg);
    cur.hdd = round2(cur.hdd + x.s.headlineDenomKg);
    supMap.set(name, cur);
  }
  return Array.from(supMap.entries()).sort((a, b) => b[1].profit - a[1].profit);
}

/**
 * Buyer comparison (per sell line — who bought the shrimp).
 * Growth is attributed per size: each sell line takes its share of that
 * size's diff/buy kg within the lot, so a buyer who took all of เบอร์ 2
 * sees เบอร์ 2's growth, not the lot-wide blend.
 */
export function buyerComparison(rows: LotRow[]): {
  rows: [string, BuyerAgg][];
  totals: BuyerTotals;
} {
  const buyerMap = new Map<string, BuyerAgg>();
  for (const x of rows) {
    for (const sl of x.lot.sell_lines) {
      const name = sl.buyer?.trim() || "ไม่ระบุ";
      const cur =
        buyerMap.get(name) ??
        { lots: new Map(), sellKg: 0, sales: 0, hd: 0, hdd: 0 };
      cur.lots.set(x.lot.id, {
        date: x.lot.buy_date,
        supplier: x.lot.suppliers?.name ?? "",
      });
      cur.sellKg = round2(cur.sellKg + Number(sl.weight_kg));
      cur.sales = round2(cur.sales + sellLineSales(sl));
      const sizeRow = x.s.sizeRows.find((r) => r.code === sl.size_code);
      if (sizeRow && sizeRow.sellKg > 0) {
        const share = Number(sl.weight_kg) / sizeRow.sellKg;
        cur.hd += share * sizeRow.diffKg;
        cur.hdd += share * sizeRow.buyKg;
      }
      buyerMap.set(name, cur);
    }
  }
  const buyerRows = Array.from(buyerMap.entries()).sort(
    (a, b) => b[1].sales - a[1].sales
  );
  return {
    rows: buyerRows,
    totals: {
      sellKg: round2(buyerRows.reduce((a, [, v]) => a + v.sellKg, 0)),
      sales: round2(buyerRows.reduce((a, [, v]) => a + v.sales, 0)),
      hd: buyerRows.reduce((a, [, v]) => a + v.hd, 0),
      hdd: buyerRows.reduce((a, [, v]) => a + v.hdd, 0),
    },
  };
}

/** Everything the monthly/yearly summary pages need from a set of lots. */
export function summarize(rows: LotRow[]) {
  const buyers = buyerComparison(rows);
  return {
    totals: calcTotals(rows),
    expRows: expenseBreakdown(rows),
    expMatrix: expenseMatrix(rows),
    supRows: supplierComparison(rows),
    buyerRows: buyers.rows,
    buyerTotals: buyers.totals,
  };
}
