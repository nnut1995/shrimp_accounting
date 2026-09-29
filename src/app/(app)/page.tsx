import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calcLot } from "@/lib/calc";
import { THAI_MONTHS, beYear } from "@/lib/dates";
import LotListTable from "@/components/LotListTable";
import type { LotWithChildren, Size } from "@/lib/types";

const LOT_SELECT =
  "*, suppliers(name), buy_lines(*), sell_lines(*), adjustments(*), expenses(*, expense_categories(name))";

export default async function LotListPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; y?: string; supplier?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: lots, error: lotsError }, { data: sizes, error: sizesError }] = await Promise.all([
    supabase
      .from("lots")
      .select(LOT_SELECT)
      .order("buy_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("sizes").select("*").order("sort_order"),
  ]);
  if (lotsError || sizesError) throw new Error("โหลดรายการล็อตไม่สำเร็จ กรุณาลองใหม่");
  const all = (lots ?? []) as LotWithChildren[];
  const sizeList = (sizes ?? []) as Size[];

  const m = parseInt(sp.m ?? "") || 0;
  const y = parseInt(sp.y ?? "") || 0;
  const supplierFilter = sp.supplier ?? "";

  const years = Array.from(
    new Set(all.map((l) => Number(l.buy_date.slice(0, 4))))
  ).sort((a, b) => b - a);
  const suppliers = Array.from(
    new Set(all.map((l) => l.suppliers?.name ?? ""))
  )
    .filter(Boolean)
    .sort();

  const filtered = all.filter((l) => {
    if (y && Number(l.buy_date.slice(0, 4)) !== y) return false;
    if (m && Number(l.buy_date.slice(5, 7)) !== m) return false;
    if (supplierFilter && (l.suppliers?.name ?? "") !== supplierFilter)
      return false;
    return true;
  });

  const rows = filtered.map((l) => ({
    lot: l,
    s: calcLot(sizeList, l.buy_lines, l.sell_lines, l.adjustments, l.expenses),
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

      <form key={`${m}:${y}:${supplierFilter}`} className="no-print flex flex-wrap gap-2 items-end" method="get">
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
        <button className="border rounded px-3 py-1.5 text-sm bg-white hover:bg-gray-100">
          กรอง
        </button>
      </form>

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
