import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LOT_SELECT } from "@/lib/api/lots";
import { calcLot } from "@/lib/calc";
import { brokerComparison } from "@/lib/brokers";
import { calcTotals } from "@/lib/summary";
import { THAI_MONTHS, beYear, formatBE } from "@/lib/dates";
import { fmt, fmtPct } from "@/lib/format";
import type { LotWithChildren } from "@/lib/types";

const cell = "border border-gray-200 px-3 py-2 text-sm whitespace-nowrap";
const control = "block border rounded-lg px-3 py-2 mt-1 bg-white";
const profitColor = (n: number) => n >= 0 ? "text-green-700" : "text-red-700";

export default async function BrokersPage({ searchParams }: {
  searchParams: Promise<{ m?: string; y?: string; broker?: string }>;
}) {
  const sp = await searchParams;
  const m = Number(sp.m) || 0;
  const y = Number(sp.y) || 0;
  const db = await createClient();
  const all: LotWithChildren[] = [];
  // Page through the ledger so Supabase's default row cap cannot hide lots.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("lots").select(LOT_SELECT)
      .order("buy_date", { ascending: false }).order("id").range(offset, offset + 499);
    if (error) throw new Error("โหลดผลงานนายหน้าไม่สำเร็จ กรุณาลองใหม่");
    all.push(...(data ?? []) as LotWithChildren[]);
    if (!data || data.length < 500) break;
  }
  const years = [...new Set(all.map(l => Number(l.buy_date.slice(0, 4))))].sort((a, b) => b - a);
  const names = [...new Set(all.map(l => l.broker?.trim() || ""))].sort((a, b) => a.localeCompare(b, "th"));
  const rows = all.filter(l => (!m || Number(l.buy_date.slice(5, 7)) === m)
    && (!y || Number(l.buy_date.slice(0, 4)) === y)
    && (sp.broker === undefined || (l.broker?.trim() || "") === sp.broker))
    .map(lot => ({ lot, s: calcLot([], lot.buy_lines, lot.sell_lines, lot.adjustments, lot.expenses) }));
  const groups = brokerComparison(rows);
  const totals = calcTotals(rows);
  const unsold = rows.filter(r => r.lot.sell_lines.length === 0).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">ผลงานนายหน้า</h1>
        <p className="mt-1 text-sm text-gray-600">เปรียบเทียบตามวันที่ซื้อของล็อต • เรียงตามกำไรสูงสุด</p>
      </div>
      <form key={`${m}:${y}:${sp.broker ?? "all"}`} method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-sm">เดือน<select name="m" defaultValue={m || ""} className={control}>
          <option value="">ทั้งหมด</option>{THAI_MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select></label>
        <label className="text-sm">ปี (พ.ศ.)<select name="y" defaultValue={y || ""} className={control}>
          <option value="">ทั้งหมด</option>{years.map(year => <option key={year} value={year}>{beYear(year)}</option>)}
        </select></label>
        {sp.broker !== undefined && <input type="hidden" name="broker" value={sp.broker} />}
        <button className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm">แสดงผล</button>
        <Link href="/brokers" className="text-blue-700 text-sm py-2 hover:underline">ล้างตัวกรอง</Link>
      </form>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`/brokers?m=${m}&y=${y}`} className="border rounded-full px-3 py-1 hover:bg-blue-50">นายหน้าทั้งหมด</Link>
        {names.map(name => <Link key={name} href={`/brokers?${new URLSearchParams({ m: String(m), y: String(y), broker: name })}`}
          className={`border rounded-full px-3 py-1 ${sp.broker === name ? "bg-blue-100 border-blue-400" : "hover:bg-blue-50"}`}>{name || "ไม่ระบุ"}</Link>)}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[["จำนวนล็อต", String(rows.length)], ["น้ำหนักซื้อ (กก.)", fmt(totals.buyKg)], ["ยอดขายสุทธิ (บาท)", fmt(totals.netSales)], ["กำไร/ขาดทุน (บาท)", fmt(totals.profit)]].map(([label, value]) => (
          <div key={label} className="bg-white border rounded-xl p-4"><p className="text-sm text-gray-600">{label}</p><p className="text-xl font-semibold mt-2">{value}</p></div>
        ))}
      </div>
      <p className="text-sm text-gray-600">กำไรหักต้นทุนและค่าใช้จ่ายของล็อตแล้ว (รวมค่านายหน้าที่บันทึกเป็นค่าใช้จ่าย) ไม่รวมค่าใช้จ่ายรายเดือน • กำไร/กก. ใช้น้ำหนักซื้อ • % น้ำหนักเพิ่ม/ลดถ่วงน้ำหนักตามสูตรของล็อต</p>
      {unsold > 0 && <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">มี {unsold} ล็อตที่ยังไม่มีรายการขาย รวมอยู่ในยอดนี้แล้ว กำไรจะเปลี่ยนเมื่อบันทึกการขายครบ</p>}
      {groups.length === 0 ? <p className="bg-white border rounded-xl p-8 text-center text-gray-500">ไม่พบล็อตในช่วงที่เลือก</p> : <>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <caption className="text-left font-semibold mb-2">เปรียบเทียบนายหน้า</caption>
            <thead className="bg-gray-100"><tr>{["นายหน้า", "ล็อต", "ซื้อ (กก.)", "ขาย (กก.)", "ยอดขายสุทธิ", "ต้นทุนซื้อ", "ค่าใช้จ่าย", "กำไร/ขาดทุน", "กำไร/กก.", "อัตรากำไร", "% น้ำหนักเพิ่ม/ลด"].map(h => <th key={h} scope="col" className={cell}>{h}</th>)}</tr></thead>
            <tbody>{groups.map(g => <tr key={g.name}>
              <th scope="row" className={`${cell} text-left`}>{g.name || "ไม่ระบุ"}</th>
              <td className={`${cell} text-right`}>{g.lots.length}</td>
              {[g.buyKg, g.sellKg, g.netSales, g.costTotal, g.expenseTotal].map((v, i) => <td key={i} className={`${cell} text-right`}>{fmt(v)}</td>)}
              <td className={`${cell} text-right font-semibold ${profitColor(g.profit)}`}>{fmt(g.profit)}</td>
              <td className={`${cell} text-right`}>{g.profitPerKg === null ? "—" : fmt(g.profitPerKg)}</td>
              <td className={`${cell} text-right`}>{fmtPct(g.margin) || "—"}</td>
              <td className={`${cell} text-right`}>{fmtPct(g.headlinePct) || "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <section className="space-y-3">
          <h2 className="font-semibold">ล็อตของแต่ละนายหน้า</h2>
          {groups.map(g => <details key={g.name} className="border rounded-xl bg-white p-4" open={sp.broker !== undefined}>
            <summary className="cursor-pointer font-medium">{g.name || "ไม่ระบุ"} · {g.lots.length} ล็อต · กำไร {fmt(g.profit)} บาท</summary>
            <ul className="mt-3 divide-y">{g.lots.map(({ lot, s }) => <li key={lot.id} className="py-2 flex flex-wrap justify-between gap-2 text-sm">
              <Link href={`/lots/${lot.id}`} className="text-blue-700 hover:underline">{formatBE(lot.buy_date)} — {lot.suppliers?.name} {lot.sell_lines.length === 0 ? "(ยังไม่มีรายการขาย)" : ""}</Link>
              <span className={profitColor(s.profit)}>{fmt(s.profit)} บาท</span>
            </li>)}</ul>
          </details>)}
        </section>
      </>}
    </div>
  );
}
