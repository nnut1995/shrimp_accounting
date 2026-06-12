import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calcLot } from "@/lib/calc";
import { THAI_MONTHS, beYear, formatBE } from "@/lib/dates";
import { fmt } from "@/lib/format";
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
  const [{ data: lots }, { data: sizes }] = await Promise.all([
    supabase
      .from("lots")
      .select(LOT_SELECT)
      .order("buy_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("sizes").select("*").order("sort_order"),
  ]);
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

  const th = "border border-gray-300 px-2 py-1.5 bg-gray-100 text-sm";
  const td = "border border-gray-300 px-2 py-1.5 text-sm";

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

      <form className="no-print flex flex-wrap gap-2 items-end" method="get">
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

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white">
          <thead>
            <tr>
              <th className={th}>วันที่ซื้อ</th>
              <th className={th}>ผู้ขาย</th>
              <th className={`${th} text-right`}>ซื้อ กก.</th>
              <th className={`${th} text-right`}>ขาย กก.</th>
              <th className={`${th} text-right`}>ยอดขายสุทธิ</th>
              <th className={`${th} text-right`}>กำไร/ขาดทุน</th>
              <th className={th}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className={`${td} text-center text-gray-500`} colSpan={7}>
                  ยังไม่มีล็อต — กด &quot;สร้างล็อตใหม่&quot; เพื่อเริ่มต้น
                </td>
              </tr>
            )}
            {rows.map(({ lot, s }) => (
              <tr key={lot.id} className="hover:bg-blue-50">
                <td className={td}>
                  <Link
                    href={`/lots/${lot.id}`}
                    className="text-blue-700 hover:underline font-medium"
                  >
                    {formatBE(lot.buy_date)}
                  </Link>
                </td>
                <td className={td}>{lot.suppliers?.name}</td>
                <td className={`${td} text-right`}>{fmt(s.buyKg)}</td>
                <td className={`${td} text-right`}>{fmt(s.sellKg)}</td>
                <td className={`${td} text-right`}>{fmt(s.netSales)}</td>
                <td
                  className={`${td} text-right font-medium ${
                    s.profit >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {fmt(s.profit)}
                </td>
                <td className={`${td} text-gray-500`}>{lot.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
