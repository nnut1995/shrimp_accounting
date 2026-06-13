import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addMonthlyExpense, deleteMonthlyExpense } from "@/app/actions";
import { calcLot, round2 } from "@/lib/calc";
import { THAI_MONTHS, beYear, formatBE, monthLabelBE } from "@/lib/dates";
import { fmt, fmtPct } from "@/lib/format";
import { MonthlyTrendChart, ProfitPerLotChart } from "@/components/Charts";
import DeleteButton from "@/components/DeleteButton";
import {
  EXPENSE_CATEGORIES,
  type LotWithChildren,
  type MonthlyExpense,
  type Size,
} from "@/lib/types";

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
const input = "border rounded px-2 py-1.5 text-sm w-full bg-white";

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const y = parseInt(sp.y ?? "") || now.getFullYear();
  const m = parseInt(sp.m ?? "") || now.getMonth() + 1;

  const supabase = await createClient();
  const [{ data: lots }, { data: sizes }, { data: monthlyExps }, { data: cats }] =
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
      supabase.from("expense_categories").select("name").order("name"),
    ]);
  const yearLots = (lots ?? []) as LotWithChildren[];
  const sizeList = (sizes ?? []) as Size[];
  const yearMonthlyExps = (monthlyExps ?? []) as MonthlyExpense[];
  const catNames = [
    ...new Set([...EXPENSE_CATEGORIES, ...(cats ?? []).map((c) => c.name)]),
  ];

  const yearRows = yearLots.map((l) => ({
    lot: l,
    s: calcLot(sizeList, l.buy_lines, l.sell_lines, l.adjustments, l.expenses),
  }));
  const monthRows = yearRows.filter(
    (x) => Number(x.lot.buy_date.slice(5, 7)) === m
  );

  const sum = (f: (s: (typeof yearRows)[number]["s"]) => number) =>
    round2(monthRows.reduce((a, x) => a + f(x.s), 0));
  const totals = {
    buyKg: sum((s) => s.buyKg),
    sellKg: sum((s) => s.sellKg),
    netSales: sum((s) => s.netSales),
    costTotal: sum((s) => s.costTotal),
    expenseTotal: sum((s) => s.expenseTotal),
    profit: sum((s) => s.profit),
    headlineDiffKg: sum((s) => s.headlineDiffKg),
    headlineDenomKg: sum((s) => s.headlineDenomKg),
  };
  const totalHeadlinePct =
    totals.headlineDenomKg > 0
      ? totals.headlineDiffKg / totals.headlineDenomKg
      : null;

  // standalone monthly expenses (not tied to a lot)
  const monthExps = yearMonthlyExps.filter((e) => e.month === m);
  const monthlyExpenseTotal = round2(
    monthExps.reduce((a, e) => a + Number(e.amount), 0)
  );
  const netProfit = round2(totals.profit - monthlyExpenseTotal);

  // expense breakdown by category
  const expMap = new Map<string, number>();
  for (const x of monthRows) {
    for (const e of x.lot.expenses) {
      const name = e.expense_categories?.name ?? "อื่นๆ";
      expMap.set(name, round2((expMap.get(name) ?? 0) + Number(e.amount)));
    }
  }
  const expRows = Array.from(expMap.entries()).sort((a, b) => b[1] - a[1]);

  // supplier comparison
  const supMap = new Map<
    string,
    { count: number; buyKg: number; profit: number; hd: number; hdd: number }
  >();
  for (const x of monthRows) {
    const name = x.lot.suppliers?.name ?? "ไม่ระบุ";
    const cur = supMap.get(name) ?? { count: 0, buyKg: 0, profit: 0, hd: 0, hdd: 0 };
    cur.count += 1;
    cur.buyKg = round2(cur.buyKg + x.s.buyKg);
    cur.profit = round2(cur.profit + x.s.profit);
    cur.hd = round2(cur.hd + x.s.headlineDiffKg);
    cur.hdd = round2(cur.hdd + x.s.headlineDenomKg);
    supMap.set(name, cur);
  }
  const supRows = Array.from(supMap.entries()).sort(
    (a, b) => b[1].profit - a[1].profit
  );

  // charts
  const lotChart = monthRows.map((x) => ({
    name: `${formatBE(x.lot.buy_date)} ${x.lot.suppliers?.name ?? ""}`,
    profit: x.s.profit,
  }));
  const trendChart = THAI_MONTHS_SHORT.map((name, i) => ({
    name,
    profit: round2(
      yearRows
        .filter((x) => Number(x.lot.buy_date.slice(5, 7)) === i + 1)
        .reduce((a, x) => a + x.s.profit, 0) -
        yearMonthlyExps
          .filter((e) => e.month === i + 1)
          .reduce((a, e) => a + Number(e.amount), 0)
    ),
  }));

  const headline: [string, string, string?][] = [
    ["จำนวนล็อต", String(monthRows.length)],
    ["ซื้อ กก.", fmt(totals.buyKg)],
    ["ขาย กก.", fmt(totals.sellKg)],
    ["% เพิ่ม/ลด", fmtPct(totalHeadlinePct)],
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">สรุปประจำเดือน {monthLabelBE(y, m)}</h1>
        <form className="no-print ml-auto flex gap-2 items-center" method="get">
          <select name="m" defaultValue={m} className="border rounded px-2 py-1.5 text-sm bg-white">
            {THAI_MONTHS.map((name, i) => (
              <option key={i} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <select name="y" defaultValue={y} className="border rounded px-2 py-1.5 text-sm bg-white">
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

      {/* month totals */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {headline.map(([label, value, cls]) => (
          <div key={label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="text-xs text-gray-500">{label}</div>
            <div className={`text-lg font-semibold ${cls ?? ""}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* lot table */}
      <section>
        <h2 className="font-bold mb-2">ล็อตในเดือนนี้</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={th}>วันที่ซื้อ</th>
                <th className={th}>ผู้ขาย</th>
                <th className={th}>ซื้อ กก.</th>
                <th className={th}>ขาย กก.</th>
                <th className={th}>ยอดขายสุทธิ</th>
                <th className={th}>ต้นทุนซื้อ</th>
                <th className={th}>ค่าใช้จ่าย</th>
                <th className={th}>กำไร/ขาดทุน</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-gray-500`} colSpan={8}>
                    ไม่มีล็อตในเดือนนี้
                  </td>
                </tr>
              )}
              {monthRows.map(({ lot, s }) => (
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
                  <td className={tdR}>{fmt(s.netSales)}</td>
                  <td className={tdR}>{fmt(s.costTotal)}</td>
                  <td className={tdR}>{fmt(s.expenseTotal)}</td>
                  <td
                    className={`${tdR} font-medium ${
                      s.profit >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {fmt(s.profit)}
                  </td>
                </tr>
              ))}
              {monthRows.length > 0 && (
                <tr className="font-semibold bg-gray-50">
                  <td className={td} colSpan={2}>
                    รวม
                  </td>
                  <td className={tdR}>{fmt(totals.buyKg)}</td>
                  <td className={tdR}>{fmt(totals.sellKg)}</td>
                  <td className={tdR}>{fmt(totals.netSales)}</td>
                  <td className={tdR}>{fmt(totals.costTotal)}</td>
                  <td className={tdR}>{fmt(totals.expenseTotal)}</td>
                  <td
                    className={`${tdR} ${
                      totals.profit >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {fmt(totals.profit)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* standalone monthly expenses */}
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
                <th className={`${th} no-print`}></th>
              </tr>
            </thead>
            <tbody>
              {monthExps.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-gray-500`} colSpan={4}>
                    ไม่มีค่าใช้จ่ายประจำเดือน
                  </td>
                </tr>
              )}
              {monthExps.map((e) => (
                <tr key={e.id}>
                  <td className={td}>{e.expense_categories?.name}</td>
                  <td className={tdR}>{fmt(Number(e.amount))}</td>
                  <td className={td}>{e.note}</td>
                  <td className={`${td} no-print text-center`}>
                    <DeleteButton action={deleteMonthlyExpense.bind(null, e.id)} />
                  </td>
                </tr>
              ))}
              {monthExps.length > 0 && (
                <tr className="font-semibold bg-gray-50">
                  <td className={td}>รวม</td>
                  <td className={tdR}>{fmt(monthlyExpenseTotal)}</td>
                  <td className={td}></td>
                  <td className={`${td} no-print`}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          action={addMonthlyExpense}
          className="no-print mt-2 flex flex-wrap gap-2 items-end bg-white border border-gray-200 rounded-lg p-3"
        >
          <input type="hidden" name="year" value={y} />
          <input type="hidden" name="month" value={m} />
          <label className="text-xs text-gray-600">
            รายการ
            <input name="category" required list="monthly-category-list" className={input} />
            <datalist id="monthly-category-list">
              {catNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label className="text-xs text-gray-600">
            จำนวนเงิน
            <input name="amount" required inputMode="decimal" className={input} />
          </label>
          <label className="text-xs text-gray-600 flex-1 min-w-40">
            หมายเหตุ
            <input name="note" placeholder="เช่น ค่าเช่า, เงินเดือน" className={input} />
          </label>
          <button className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700">
            + เพิ่มค่าใช้จ่าย
          </button>
        </form>
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
                <th className={th}>ซื้อ กก.</th>
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
                  <td
                    className={`${tdR} font-medium ${
                      v.profit >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {fmt(v.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* charts */}
      <section className="no-print">
        <h2 className="font-bold mb-2">กำไร/ขาดทุน รายล็อต ({monthLabelBE(y, m)})</h2>
        {lotChart.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <ProfitPerLotChart data={lotChart} />
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
