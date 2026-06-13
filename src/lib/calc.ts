import type { Adjustment, BuyLine, Expense, SellLine, Size } from "./types";

export const round2 = (n: number) => Math.round(n * 100) / 100;

export type SizeRow = {
  code: string;
  buyKg: number;
  sellKg: number;
  diffKg: number;
  pct: number | null;
  cost: number;
  sales: number;
  gross: number;
};

export type LotSummary = {
  sizeRows: SizeRow[];
  costAdjustment: number;
  salesAdjustment: number;
  total: SizeRow;
  buyKg: number;
  sellKg: number;
  // headline weight gain/loss is all-in: total sell kg vs total buy kg,
  // including bought-but-unsold grades (ฝอย/ผอม)
  headlineDiffKg: number;
  headlineDenomKg: number;
  headlinePct: number | null;
  salesTotal: number;
  netSales: number;
  costTotal: number;
  expenseTotal: number;
  profit: number;
};

export function calcLot(
  sizes: Size[],
  buys: BuyLine[],
  sells: SellLine[],
  adjustments: Adjustment[],
  expenses: Expense[]
): LotSummary {
  const sizeRows: SizeRow[] = [];
  for (const size of sizes) {
    const b = buys.filter((x) => x.size_code === size.code);
    const s = sells.filter((x) => x.size_code === size.code);
    const buyKg = round2(b.reduce((a, x) => a + Number(x.weight_kg), 0));
    const sellKg = round2(s.reduce((a, x) => a + Number(x.weight_kg), 0));
    if (buyKg === 0 && sellKg === 0) continue;
    const cost = round2(
      b.reduce((a, x) => a + Number(x.weight_kg) * Number(x.cost_per_kg), 0)
    );
    const sales = round2(
      s.reduce((a, x) => a + Number(x.weight_kg) * Number(x.price_per_kg), 0)
    );
    const diffKg = round2(sellKg - buyKg);
    sizeRows.push({
      code: size.code,
      buyKg,
      sellKg,
      diffKg,
      pct: buyKg > 0 ? diffKg / buyKg : null,
      cost,
      sales,
      gross: round2(sales - cost),
    });
  }

  const costAdjustment = round2(
    adjustments
      .filter((x) => x.kind === "cost")
      .reduce((a, x) => a + Number(x.amount), 0)
  );
  const salesAdjustment = round2(
    adjustments
      .filter((x) => x.kind === "sales")
      .reduce((a, x) => a + Number(x.amount), 0)
  );
  const buyKg = round2(sizeRows.reduce((a, r) => a + r.buyKg, 0));
  const sellKg = round2(sizeRows.reduce((a, r) => a + r.sellKg, 0));
  const sizeCostTotal = round2(sizeRows.reduce((a, r) => a + r.cost, 0));
  const costTotal = round2(sizeCostTotal + costAdjustment);
  const salesTotal = round2(sizeRows.reduce((a, r) => a + r.sales, 0));
  const expenseTotal = round2(expenses.reduce((a, x) => a + Number(x.amount), 0));

  const netSales = round2(salesTotal + salesAdjustment);
  const totalDiffKg = round2(sellKg - buyKg);
  const headlineDiffKg = totalDiffKg;
  const headlineDenomKg = buyKg;
  const total: SizeRow = {
    code: "รวม",
    buyKg,
    sellKg,
    diffKg: totalDiffKg,
    pct: buyKg > 0 ? totalDiffKg / buyKg : null,
    cost: costTotal,
    sales: netSales,
    gross: round2(netSales - costTotal),
  };

  return {
    sizeRows,
    costAdjustment,
    salesAdjustment,
    total,
    buyKg,
    sellKg,
    headlineDiffKg,
    headlineDenomKg,
    headlinePct: headlineDenomKg > 0 ? headlineDiffKg / headlineDenomKg : null,
    salesTotal,
    netSales,
    costTotal,
    expenseTotal,
    profit: round2(netSales - costTotal - expenseTotal),
  };
}
