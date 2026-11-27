import { FilterButton, FilterForm } from "@/components/SubmitButton";
import Link from "@/components/FastLink";
import { createClient } from "@/lib/supabase/server";
import { calcLot } from "@/lib/calc";
import { THAI_MONTHS, beYear } from "@/lib/dates";
import LotListTable from "@/components/LotListTable";
import type { LotWithChildren } from "@/lib/types";

// Only the columns the list and calcLot's totals need. Loading every column of
// every buy/sell line (descriptions, notes, timestamps…) for the whole ledger
// made this page slower as more lots were added.
const LIST_SELECT =
  "id, buy_date, broker, note, suppliers(name), buy_lines(size_code, weight_kg, cost_per_kg), sell_lines(size_code, weight_kg, price_per_kg, fee_pct, fee_amount), adjustments(kind, amount), expenses(amount)";

const pad2 = (n: number) => String(n).padStart(2, "0");

export default async function LotListPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; y?: string; supplier?: string }>;
}) {
  const sp = await searchParams;
  const m = parseInt(sp.m ?? "") || 0;
  const y = parseInt(sp.y ?? "") || 0;
  const supplierFilter = sp.supplier ?? "";

  const supabase = await createClient();
  // Filter in the database so only the selected lots (and their lines) are
  // downloaded; a tiny separate query feeds the year/supplier/broker pickers.
  let lotsQuery = supabase
    .from("lots")
    .select(
      supplierFilter
        ? LIST_SELECT.replace("suppliers(name)", "suppliers!inner(name)")
        : LIST_SELECT
    );
  if (y && m) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    lotsQuery = lotsQuery
      .gte("buy_date", `${y}-${pad2(m)}-01`)
      .lte("buy_date", `${y}-${pad2(m)}-${pad2(last)}`);
  } else if (y) {
    lotsQuery = lotsQuery.gte("buy_date", `${y}-01-01`).lte("buy_date", `${y}-12-31`);
  }
  if (supplierFilter) lotsQuery = lotsQuery.eq("suppliers.name", supplierFilter);

  const [{ data: lots, error: lotsError }, { data: options, error: optionsError }] =
    await Promise.all([
      lotsQuery
        .order("buy_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("lots").select("buy_date, broker, suppliers(name)"),
    ]);
  if (lotsError || optionsError) throw new Error("โหลดรายการล็อตไม่สำเร็จ กรุณาลองใหม่");
  const all = (options ?? []) as unknown as Pick<LotWithChildren, "buy_date" | "broker" | "suppliers">[];

  const years = Array.from(
    new Set(all.map((l) => Number(l.buy_date.slice(0, 4))))
  ).sort((a, b) => b - a);
  const suppliers = Array.from(
    new Set(all.map((l) => l.suppliers?.name ?? ""))
  )
    .filter(Boolean)
    .sort();

  // Month without a year can't be a single date range; filter that case here.
  const filtered = ((lots ?? []) as unknown as LotWithChildren[]).filter(
    (l) => !m || Number(l.buy_date.slice(5, 7)) === m
  );

  // Sizes only affect the order of per-grade rows, not the totals shown here.
  const rows = filtered.map((l) => ({
    lot: l,
    s: calcLot([], l.buy_lines, l.sell_lines, l.adjustments, l.expenses),
  }));

  const brokerNames = [...new Set(all.map(l => l.broker?.trim() || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">รายการล็อต</h1>
        <Link
          href="/lots/new"
          className="no-print ml-auto bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
        >
          + สร้างล็อตใหม่
        </Link>
      </div>

      <FilterForm key={`${m}:${y}:${supplierFilter}`} className="no-print flex flex-wrap gap-2 items-end">
        <label className="text-sm">
          เดือน
          <select name="m" defaultValue={m || ""} className="block border rounded px-2 py-1.5 mt-1 bg-white">
            <option value="">ทั้งหมด</option>
            {THAI_MONTHS.map((name, i) => (
              <option key={i} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          ปี (พ.ศ.)
          <select name="y" defaultValue={y || ""} className="block border rounded px-2 py-1.5 mt-1 bg-white">
            <option value="">ทั้งหมด</option>
            {years.map((yy) => (
              <option key={yy} value={yy}>
                {beYear(yy)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          ผู้ขาย
          <select
            name="supplier"
            defaultValue={supplierFilter}
            className="block border rounded px-2 py-1.5 mt-1 bg-white"
          >
            <option value="">ทั้งหมด</option>
            {suppliers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <FilterButton className="border rounded px-3 py-1.5 text-sm bg-white hover:bg-gray-100">
          กรอง
        </FilterButton>
      </FilterForm>

      <LotListTable
        key={`${m}:${y}:${supplierFilter}:${rows.map(({ lot }) => lot.id).join(",")}`}
        brokerNames={brokerNames}
        rows={rows.map(({ lot, s }) => ({
          id: lot.id, buyDate: lot.buy_date, supplier: lot.suppliers?.name ?? "",
          broker: lot.broker ?? "", note: lot.note, buyKg: s.buyKg,
          sellKg: s.sellKg, netSales: s.netSales, profit: s.profit,
        }))}
      />
    </div>
  );
}
