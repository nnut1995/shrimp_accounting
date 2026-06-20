// Shared types for the shrimp size calculator and its saved-sheet history.

export type Field = "size" | "percent" | "count" | "weight";
export type TopField = "count" | "kg" | "size";

export type Row = {
  id: number;
  label: string;
  labelCustom: boolean;
  isBalance: boolean;
  raw: Record<Field, string>; // literal text for pinned fields
  pins: Field[]; // ordered, max 2
  price: string;
};

export type Top = {
  raw: Record<TopField, string>;
  pins: TopField[];
};

// One way to split the (shared) lot into sizes, with its own prices/growth.
export type CalcBreakdown = {
  name: string;
  rows: Omit<Row, "id">[];
  growth: string;
};

// Serialized calculator state stored in calc_sheets.data (jsonb).
// `summary` is a snapshot of key results so the history list can render
// without re-running the solver.
export type CalcSheetData = {
  version: 2;
  top: Top; // shared lot totals
  breakdowns: CalcBreakdown[];
  summary: {
    totalSize: number | null;
    breakdownCount: number;
    bestFinalPrice: number | null; // lowest "ราคาที่ควรซื้อ" across breakdowns
  };
};

// Legacy single-breakdown shape (version 1) — still readable from history and
// migrated into one breakdown on load.
export type LegacyCalcSheetData = {
  version: 1;
  top: Top;
  rows: Omit<Row, "id">[];
  growth: string;
  summary: { totalSize: number | null; avgPrice: number | null; finalPrice: number | null };
};

export type AnyCalcSheetData = CalcSheetData | LegacyCalcSheetData;

export type CalcSheet = {
  id: string;
  title: string;
  data: AnyCalcSheetData;
  created_at: string;
  updated_at: string;
};
