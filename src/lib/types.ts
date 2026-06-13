export type Size = {
  code: string;
  label: string;
  sort_order: number;
};

export type Supplier = {
  id: string;
  name: string;
};

export type BuyLine = {
  id: string;
  lot_id: string;
  container: string;
  size_code: string;
  description: string;
  density: string;
  weight_kg: number;
  cost_per_kg: number;
  note: string;
  created_at: string;
};

export type SellLine = {
  id: string;
  lot_id: string;
  sell_date: string;
  container: string;
  size_code: string;
  description: string;
  density: string;
  weight_kg: number;
  price_per_kg: number;
  created_at: string;
};

export type AdjustmentKind = "cost" | "sales";

export type Adjustment = {
  id: string;
  lot_id: string;
  amount: number;
  kind: AdjustmentKind;
  note: string;
  created_at: string;
};

export type Expense = {
  id: string;
  lot_id: string;
  category_id: string;
  amount: number;
  note: string;
  created_at: string;
  expense_categories: { name: string } | null;
};

export type MonthlyExpense = {
  id: string;
  year: number;
  month: number;
  category_id: string;
  amount: number;
  note: string;
  created_at: string;
  expense_categories: { name: string } | null;
};

export type LotWithChildren = {
  id: string;
  buy_date: string;
  supplier_id: string;
  note: string;
  created_at: string;
  suppliers: { name: string } | null;
  buy_lines: BuyLine[];
  sell_lines: SellLine[];
  adjustments: Adjustment[];
  expenses: Expense[];
};
