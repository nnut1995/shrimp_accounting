export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
type Obj = Record<string, unknown>;
function object(value: unknown, path: string, keys: string[]): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  const obj = value as Obj;
  for (const key of Object.keys(obj)) if (!keys.includes(key)) fail(`${path}.${key}`, "unknown field");
  return obj;
}
function fail(path: string, message: string): never { throw new ApiError(422, "validation_error", `${path}: ${message}`); }
function str(v: unknown, path: string, required = false): string {
  if (v === undefined && !required) return "";
  if (typeof v !== "string" || v.length > 2000 || (required && !v.trim())) fail(path, "must be a string, max 2000 characters" );
  return v.trim();
}
export function date(v: unknown, path: string): string {
  const s = str(v, path, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s < "1900-01-01" || s > "2100-12-31" || !Number.isFinite(new Date(s).getTime()) || new Date(s).toISOString().slice(0,10) !== s) fail(path, "must be a valid CE date YYYY-MM-DD (1900–2100)");
  return s;
}
function num(v: unknown, path: string, signed = false, decimals = 2, max = 9999999999.99): number {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > max || (!signed && v < 0) || Math.round(v * 10 ** decimals) / 10 ** decimals !== v) fail(path, `must be a ${signed ? "signed" : "non-negative"} number with at most ${decimals} decimals, max ${max}`);
  return v;
}
function rows<T>(v: unknown, path: string, parse: (row: unknown, path: string) => T): T[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 500) fail(path, "must be an array, max 500 rows");
  return v.map((x,i) => parse(x, `${path}[${i}]`));
}
const common = ["container", "size_code", "description", "density", "weight_kg"];
function line(o: Obj, p: string) {
  return { container: str(o.container, `${p}.container`), size_code: str(o.size_code, `${p}.size_code`, true), description: str(o.description, `${p}.description`), density: str(o.density, `${p}.density`), weight_kg: num(o.weight_kg, `${p}.weight_kg`) };
}
export function parseLot(value: unknown) {
  const o = object(value, "body", ["buy_date", "supplier", "broker", "note", "buy_lines", "sell_lines", "expenses", "adjustments"]);
  return {
    ...(o.broker === undefined ? {} : { broker: str(o.broker, "broker") }),
    buy_date: date(o.buy_date, "buy_date"), supplier: str(o.supplier, "supplier", true), note: str(o.note, "note"),
    buy_lines: rows(o.buy_lines, "buy_lines", (v,p) => {
      const r = object(v,p,[...common,"cost_per_kg","note"]);
      return {...line(r,p), cost_per_kg:num(r.cost_per_kg,`${p}.cost_per_kg`), note:str(r.note,`${p}.note`)};
    }),
    sell_lines: rows(o.sell_lines, "sell_lines", (v,p) => {
      const r = object(v,p,[...common,"sell_date","price_per_kg","buyer","fee_pct","fee_amount"]);
      if (r.fee_pct != null && r.fee_amount != null) fail(p,"specify fee_pct OR fee_amount, not both");
      return {...line(r,p), sell_date:date(r.sell_date,`${p}.sell_date`), price_per_kg:num(r.price_per_kg,`${p}.price_per_kg`), buyer:str(r.buyer,`${p}.buyer`), fee_pct:r.fee_amount != null ? null : r.fee_pct == null ? 1.2 : num(r.fee_pct,`${p}.fee_pct`,false,4,100), fee_amount:r.fee_amount == null ? null : num(r.fee_amount,`${p}.fee_amount`,false,2,999999999999.99)};
    }),
    expenses: rows(o.expenses,"expenses",(v,p) => {
      const r=object(v,p,["category","amount","note"]);
      return {category:str(r.category,`${p}.category`,true),amount:num(r.amount,`${p}.amount`,false,2,999999999999.99),note:str(r.note,`${p}.note`)};
    }),
    adjustments: rows(o.adjustments,"adjustments",(v,p) => {
      const r=object(v,p,["kind","amount","note"]);
      if(r.kind!=="cost" && r.kind!=="sales") fail(`${p}.kind`,"must be cost or sales");
      return {kind:r.kind as "cost" | "sales",amount:num(r.amount,`${p}.amount`,true,2,999999999999.99),note:str(r.note,`${p}.note`)};
    }),
  };
}
export type LotInput = ReturnType<typeof parseLot>;
export function uuid(v: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) fail("id","must be a UUID");
  return v;
}
