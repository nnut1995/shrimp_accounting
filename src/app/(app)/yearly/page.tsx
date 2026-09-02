import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calcLot, round2 } from "@/lib/calc";
import { calcTotals, summarize, type LotRow } from "@/lib/summary";
import { THAI_MONTHS, beYear, formatBE } from "@/lib/dates";
import { fmt, fmtPct } from "@/lib/format";
import { MonthlyTrendChart, ProfitPerLotChart } from "@/components/Charts";
import type { LotWithChildren, MonthlyExpense, Size } from "@/lib/types";

const LOT_SELECT =
  "*, suppliers(name), buy_lines(*), sell_lines(*), adjustments(*), expenses(*, expense_categories(name))";

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const th = "border border-gray-300 px-2 py-1.5 bg-gray-100 text-sm whitespace-nowrap";
const td = "border border-gray-300 px-2 py-1.5 text-sm";
const tdR = `${td} text-right`;

/** Read-only yearly summary. No forms, no mutations — links out only. */
export default async function YearlyPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const y = parseInt(sp.y ?? "") || now.getFullYear();

  const supabase = await createClient();
  const [{ data: lots }, { data: sizes }, { data: monthlyExps }] =
    await Promise.all([
      supabase
        .from("lots")
        .select(LOT_SELECT)
        .gte("buy_date", `${y}-01-01`)
        .lte("buy_date", `${y}-12-31`)
        .order("buy_date"),
      supabase.from("sizes").select("*").order("sort_order"),
      supabase
        .from("monthly_expenses")
        .select("*, expense_categories(name)")
        .eq("year", y)
        .order("created_at"),
    ]);
  const yearLots = (lots ?? []) as LotWithChildren[];
  const sizeList = (sizes ?? []) as Size[];
  const yearMonthlyExps = (monthlyExps ?? []) as MonthlyExpense[];

  const yearRows: LotRow[] = yearLots.map((l) => ({
    lot: l,
    s: calcLot(sizeList, l.buy_lines, l.sell_lines, l.adjustments, l.expenses),
  }));

  const { totals, expRows, supRows, buyerRows, buyerTotals } =
    summarize(yearRows);

  // standalone monthly expenses across the whole year
  const monthlyExpenseTotal = round2(
    yearMonthlyExps.reduce((a, e) => a + Number(e.amount), 0)
  );
  const netProfit = round2(totals.profit - monthlyExpenseTotal);

  const monthOf = (iso: string) => Number(iso.slice(5, 7));
  const monthExpTotal = (m: number) =>
    round2(
      yearMonthlyExps
        .filter((e) => e.month === m)
        .reduce((a, e) => a + Number(e.amount), 0)
    );

  // lot table: one <tbody> per month that has lots
  const monthBlocks = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((m) => {
      const rows = yearRows.filter((x) => monthOf(x.lot.buy_date) === m);
      const mt = calcTotals(rows);
      const exp = monthExpTotal(m);
      return { m, rows, t: mt, exp, net: round2(mt.profit - exp) };
    })
    .filter((b) => b.rows.length > 0);

  // standalone expenses grouped by month (months that have any)
  const expenseBlocks = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((m) => ({
      m,
      items: yearMonthlyExps.filter((e) => e.month === m),
      total: monthExpTotal(m),
    }))
    .filter((b) => b.items.length > 0);

  // charts
  const lotChart = yearRows.map((x) => ({
    name: `${formatBE(x.lot.buy_date)} ${x.lot.suppliers?.name ?? ""}`,
    profit: x.s.profit,
  }));
  const trendChart = THAI_MONTHS_SHORT.map((name, i) => ({
    name,
    profit: round2(
      yearRows
        .filter((x) => monthOf(x.lot.buy_date) === i + 1)
        .reduce((a, x) => a + x.s.profit, 0) - monthExpTotal(i + 1)
    ),
  }));

  const headline: [string, string, string?][] = [
    ["จำนวนล็อต", String(yearRows.length)],
    ["น้ำหนัก", fmt(totals.buyKg)],
    ["น้ำหนัก", fmt(totals.sellKg)],
    ["% เพิ่ม/ลด", fmtPct(totals.headlinePct)],
    ["ยอดขายสุทธิ", fmt(totals.netSales)],
    ["ต้นทุนซื้อ", fmt(totals.costTotal)],
    ["ค่าใช้จ่าย", fmt(totals.expenseTotal)],
    [
      "กำไร/ขาดทุน",
      fmt(totals.profit),
      totals.profit >= 0 ? "text-green-700" : "text-red-700",
    ],
    ["ค่าใช้จ่ายประจำเดือน", fmt(monthlyExpenseTotal)],
    [
      "กำไรสุทธิ",
      fmt(netProfit),
      netProfit >= 0 ? "text-green-700" : "text-red-700",
    ],
  ];

  const pctCls = (p: number | null) =>
    p == null ? "" : p >= 0 ? "text-green-700" : "text-red-700";
  const moneyCls = (n: number) => (n >= 0 ? "text-green-700" : "text-red-700");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">สรุปประจำปี {beYear(y)}</h1>
        <form className="no-print ml-auto flex gap-2 items-center" method="get">
          <select
            name="y"
            defaultValue={y}
            className="border rounded px-2 py-1.5 text-sm bg-white"
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() + 1 - i).map(
              (yy) => (
                <option key={yy} value={yy}>
                  {beYear(yy)}
                </option>
              )
            )}
          </select>
          <button className="border rounded px-3 py-1.5 text-sm bg-white hover:bg-gray-100">
            แสดง
          </button>
        </form>
      </div>

      {/* year totals */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {headline.map(([label, value, cls], i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"
          >
            <div className="text-xs text-gray-500">{label}</div>
            <div className={`text-lg font-semibold ${cls ?? ""}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* lot table, grouped by month */}
      <section>
        <h2 className="font-bold mb-2">ล็อตในปีนี้</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={th}>วันที่ซื้อ</th>
                <th className={th}>ผู้ขาย</th>
                <th className={th}>น้ำหนัก</th>
                <th className={th}>น้ำหนัก</th>
                <th className={th}>% เพิ่ม/ลด</th>
                <th className={th}>ยอดขายสุทธิ</th>
                <th className={th}>ต้นทุนซื้อ</th>
                <th className={th}>ค่าใช้จ่าย</th>
                <th className={th}>กำไร/ขาดทุน</th>
              </tr>
            </thead>
            {monthBlocks.length === 0 && (
              <tbody>
                <tr>
                  <td className={`${td} text-center text-gray-500`} colSpan={9}>
                    ไม่มีล็อตในปีนี้
                  </td>
                </tr>
              </tbody>
            )}
            {monthBlocks.map((b) => (
              <tbody key={b.m}>
                <tr className="bg-gray-100">
                  <td className={`${td} font-bold`} colSpan={9}>
                    <Link
                      href={`/monthly?y=${y}&m=${b.m}`}
                      className="text-blue-700 hover:underline"
                    >
                      {THAI_MONTHS[b.m - 1]} {beYear(y)}
                    </Link>
                  </td>
                </tr>
                {b.rows.map(({ lot, s }) => (
                  <tr key={lot.id} className="hover:bg-blue-50">
                    <td className={td}>
                      <Link
                        href={`/lots/${lot.id}`}
                        className="text-blue-700 hover:underline"
                      >
                        {formatBE(lot.buy_date)}
                      </Link>
                    </td>
                    <td className={td}>{lot.suppliers?.name}</td>
                    <td className={tdR}>{fmt(s.buyKg)}</td>
                    <td className={tdR}>{fmt(s.sellKg)}</td>
                    <td className={`${tdR} ${pctCls(s.headlinePct)}`}>
                      {fmtPct(s.headlinePct)}
                    </td>
                    <td className={tdR}>{fmt(s.netSales)}</td>
                    <td className={tdR}>{fmt(s.costTotal)}</td>
                    <td className={tdR}>{fmt(s.expenseTotal)}</td>
                    <td className={`${tdR} font-medium ${moneyCls(s.profit)}`}>
                      {fmt(s.profit)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold bg-gray-50">
                  <td className={td} colSpan={2}>
                    รวม {THAI_MONTHS[b.m - 1]}
                  </td>
                  <td className={tdR}>{fmt(b.t.buyKg)}</td>
                  <td className={tdR}>{fmt(b.t.sellKg)}</td>
                  <td className={`${tdR} ${pctCls(b.t.headlinePct)}`}>
                    {fmtPct(b.t.headlinePct)}
                  </td>
                  <td className={tdR}>{fmt(b.t.netSales)}</td>
                  <td className={tdR}>{fmt(b.t.costTotal)}</td>
                  <td className={tdR}>{fmt(b.t.expenseTotal)}</td>
                  <td className={`${tdR} ${moneyCls(b.t.profit)}`}>
                    {fmt(b.t.profit)}
                  </td>
                </tr>
                <tr className="bg-gray-50">
                  <td className={td} colSpan={8}>
                    ค่าใช้จ่ายประจำเดือน
                  </td>
                  <td className={tdR}>{fmt(b.exp)}</td>
                </tr>
                <tr className="font-semibold bg-gray-50">
                  <td className={td} colSpan={8}>
                    กำไรสุทธิ {THAI_MONTHS[b.m - 1]}
                  </td>
                  <td className={`${tdR} ${moneyCls(b.net)}`}>{fmt(b.net)}</td>
                </tr>
              </tbody>
            ))}
            {monthBlocks.length > 0 && (
              <tbody>
                <tr className="font-bold bg-gray-200">
                  <td className={td} colSpan={2}>
                    รวมทั้งปี
                  </td>
                  <td className={tdR}>{fmt(totals.buyKg)}</td>
                  <td className={tdR}>{fmt(totals.sellKg)}</td>
                  <td className={`${tdR} ${pctCls(totals.headlinePct)}`}>
                    {fmtPct(totals.headlinePct)}
                  </td>
                  <td className={tdR}>{fmt(totals.netSales)}</td>
                  <td className={tdR}>{fmt(totals.costTotal)}</td>
                  <td className={tdR}>{fmt(totals.expenseTotal)}</td>
                  <td className={`${tdR} ${moneyCls(totals.profit)}`}>
                    {fmt(totals.profit)}
                  </td>
                </tr>
                <tr className="bg-gray-200">
                  <td className={td} colSpan={8}>
                    ค่าใช้จ่ายประจำเดือน (รวมทั้งปี)
                  </td>
                  <td className={tdR}>{fmt(monthlyExpenseTotal)}</td>
                </tr>
                <tr className="font-bold bg-gray-200">
                  <td className={td} colSpan={8}>
                    กำไรสุทธิทั้งปี
                  </td>
                  <td className={`${tdR} ${moneyCls(netProfit)}`}>
                    {fmt(netProfit)}
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </section>

      {/* standalone monthly expenses, grouped by month (read-only) */}
      <section>
        <h2 className="font-bold mb-2">
          ค่าใช้จ่ายประจำเดือน (ไม่ผูกกับล็อต)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={th}>รายการ</th>
                <th className={th}>จำนวนเงิน</th>
                <th className={th}>หมายเหตุ</th>
              </tr>
            </thead>
            {expenseBlocks.length === 0 && (
              <tbody>
                <tr>
                  <td className={`${td} text-center text-gray-500`} colSpan={3}>
                    ไม่มีค่าใช้จ่ายประจำเดือน
                  </td>
                </tr>
              </tbody>
            )}
            {expenseBlocks.map((b) => (
              <tbody key={b.m}>
                <tr className="bg-gray-100">
                  <td className={`${td} font-bold`} colSpan={3}>
                    {THAI_MONTHS[b.m - 1]} {beYear(y)}
                  </td>
                </tr>
                {b.items.map((e) => (
                  <tr key={e.id}>
                    <td className={td}>{e.expense_categories?.name}</td>
                    <td className={tdR}>{fmt(Number(e.amount))}</td>
                    <td className={td}>{e.note}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-gray-50">
                  <td className={td}>รวม {THAI_MONTHS[b.m - 1]}</td>
                  <td className={tdR}>{fmt(b.total)}</td>
                  <td className={td}></td>
                </tr>
              </tbody>
            ))}
            {expenseBlocks.length > 0 && (
              <tbody>
                <tr className="font-bold bg-gray-200">
                  <td className={td}>รวมทั้งปี</td>
                  <td className={tdR}>{fmt(monthlyExpenseTotal)}</td>
                  <td className={td}></td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* expense breakdown */}
        <section>
          <h2 className="font-bold mb-2">ค่าใช้จ่ายแยกตามรายการ</h2>
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={th}>รายการ</th>
                <th className={th}>จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {expRows.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-gray-500`} colSpan={2}>
                    ไม่มีค่าใช้จ่าย
                  </td>
                </tr>
              )}
              {expRows.map(([name, amount]) => (
                <tr key={name}>
                  <td className={td}>{name}</td>
                  <td className={tdR}>{fmt(amount)}</td>
                </tr>
              ))}
              {expRows.length > 0 && (
                <tr className="font-semibold bg-gray-50">
                  <td className={td}>รวม</td>
                  <td className={tdR}>{fmt(totals.expenseTotal)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* supplier comparison */}
        <section>
          <h2 className="font-bold mb-2">เปรียบเทียบตามผู้ขาย</h2>
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={th}>ผู้ขาย</th>
                <th className={th}>ล็อต</th>
                <th className={th}>น้ำหนัก</th>
                <th className={th}>% เพิ่ม/ลด</th>
                <th className={th}>กำไร/ขาดทุน</th>
              </tr>
            </thead>
            <tbody>
              {supRows.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-gray-500`} colSpan={5}>
                    ไม่มีข้อมูล
                  </td>
                </tr>
              )}
              {supRows.map(([name, v]) => (
                <tr key={name}>
                  <td className={td}>{name}</td>
                  <td className={tdR}>{v.count}</td>
                  <td className={tdR}>{fmt(v.buyKg)}</td>
                  <td className={tdR}>
                    {fmtPct(v.hdd > 0 ? v.hd / v.hdd : null)}
                  </td>
                  <td className={`${tdR} font-medium ${moneyCls(v.profit)}`}>
                    {fmt(v.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* buyer comparison */}
      <section>
        <h2 className="font-bold mb-2">เปรียบเทียบตามผู้ซื้อ</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={th}>ผู้ซื้อ</th>
                <th className={th}>ล็อต</th>
                <th className={th}>น้ำหนัก</th>
                <th className={th}>% เพิ่ม/ลด</th>
                <th className={th}>ยอดขาย</th>
              </tr>
            </thead>
            <tbody>
              {buyerRows.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-gray-500`} colSpan={5}>
                    ไม่มีข้อมูล
                  </td>
                </tr>
              )}
              {buyerRows.map(([name, v]) => {
                const pct = v.hdd > 0 ? v.hd / v.hdd : null;
                return (
                  <tr key={name}>
                    <td className={td}>{name}</td>
                    <td className={tdR}>
                      <details className="relative">
                        <summary className="cursor-pointer list-none text-blue-700 hover:underline">
                          {v.lots.size}
                        </summary>
                        <div className="absolute right-0 z-10 mt-1 max-h-64 min-w-max overflow-y-auto rounded border border-gray-300 bg-white p-2 text-left shadow-md space-y-1">
                          {[...v.lots.entries()]
                            .sort((a, b) => a[1].date.localeCompare(b[1].date))
                            .map(([id, l]) => (
                              <Link
                                key={id}
                                href={`/lots/${id}`}
                                className="block whitespace-nowrap text-blue-700 hover:underline"
                              >
                                {formatBE(l.date)} {l.supplier}
                              </Link>
                            ))}
                        </div>
                      </details>
                    </td>
                    <td className={tdR}>{fmt(v.sellKg)}</td>
                    <td className={`${tdR} ${pctCls(pct)}`}>{fmtPct(pct)}</td>
                    <td className={tdR}>{fmt(v.sales)}</td>
                  </tr>
                );
              })}
              {buyerRows.length > 0 && (
                <tr className="font-semibold bg-gray-50">
                  <td className={td}>รวม</td>
                  <td className={tdR}></td>
                  <td className={tdR}>{fmt(buyerTotals.sellKg)}</td>
                  <td
                    className={`${tdR} ${pctCls(
                      buyerTotals.hdd > 0 ? buyerTotals.hd / buyerTotals.hdd : null
                    )}`}
                  >
                    {fmtPct(
                      buyerTotals.hdd > 0 ? buyerTotals.hd / buyerTotals.hdd : null
                    )}
                  </td>
                  <td className={tdR}>{fmt(buyerTotals.sales)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* charts */}
      <section className="no-print">
        <h2 className="font-bold mb-2">
          กำไร/ขาดทุน รายล็อต (ปี {beYear(y)})
        </h2>
        {lotChart.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <ProfitPerLotChart
              data={lotChart}
              minWidth={Math.max(600, lotChart.length * 28)}
            />
          </div>
        ) : (
          <p className="text-gray-500 text-sm">ไม่มีข้อมูล</p>
        )}
      </section>

      <section className="no-print">
        <h2 className="font-bold mb-2">
          แนวโน้มกำไรสุทธิรายเดือน ปี {beYear(y)} (หักค่าใช้จ่ายประจำเดือนแล้ว)
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <MonthlyTrendChart data={trendChart} />
        </div>
      </section>
    </div>
  );
}
