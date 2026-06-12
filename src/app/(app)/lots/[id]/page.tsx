import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcLot } from "@/lib/calc";
import { formatBE } from "@/lib/dates";
import { fmt, fmtPct } from "@/lib/format";
import {
  addAdjustment,
  addBuyLine,
  addExpense,
  addSellLine,
  deleteAdjustment,
  deleteBuyLine,
  deleteExpense,
  deleteLot,
  deleteSellLine,
  updateBuyLine,
  updateLot,
  updateSellLine,
} from "@/app/actions";
import DeleteButton from "@/components/DeleteButton";
import EditableRow from "@/components/EditableRow";
import type { LotWithChildren, Size } from "@/lib/types";

const LOT_SELECT =
  "*, suppliers(name), buy_lines(*), sell_lines(*), adjustments(*), expenses(*, expense_categories(name))";

const th = "border border-gray-300 px-2 py-1.5 bg-gray-100 text-sm whitespace-nowrap";
const td = "border border-gray-300 px-2 py-1.5 text-sm";
const tdR = `${td} text-right`;
const input = "border rounded px-2 py-1.5 text-sm w-full bg-white";

function pctClass(p: number | null) {
  if (p == null) return "";
  return p >= 0 ? "text-green-700" : "text-red-700";
}

export default async function LotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: lot }, { data: sizes }, { data: cats }] = await Promise.all([
    supabase.from("lots").select(LOT_SELECT).eq("id", id).single(),
    supabase.from("sizes").select("*").order("sort_order"),
    supabase.from("expense_categories").select("name").order("name"),
  ]);
  if (!lot) notFound();
  const l = lot as LotWithChildren;
  const sizeList = (sizes ?? []) as Size[];
  const catNames = ((cats ?? []) as { name: string }[]).map((c) => c.name);

  const byCreated = (a: { created_at: string }, b: { created_at: string }) =>
    a.created_at.localeCompare(b.created_at);
  const buys = [...l.buy_lines].sort(byCreated);
  const sells = [...l.sell_lines].sort(
    (a, b) => a.sell_date.localeCompare(b.sell_date) || byCreated(a, b)
  );
  const adjs = [...l.adjustments].sort(byCreated);
  const exps = [...l.expenses].sort(byCreated);

  const s = calcLot(sizeList, buys, sells, adjs, exps);

  const sizeOptions = sizeList.map((sz) => ({ value: sz.code, label: sz.label }));

  const headline: [string, string, string?][] = [
    ["ซื้อ กก.", fmt(s.buyKg)],
    ["ขาย กก.", fmt(s.sellKg)],
    ["น้ำหนักเพิ่ม/ลด กก.", fmt(s.headlineDiffKg), pctClass(s.headlineDiffKg)],
    ["% เพิ่ม/ลด", fmtPct(s.headlinePct), pctClass(s.headlinePct)],
    ["ยอดขายสุทธิ", fmt(s.netSales)],
    ["ต้นทุนซื้อ", fmt(s.costTotal)],
    ["ค่าใช้จ่าย", fmt(s.expenseTotal)],
    ["กำไร/ขาดทุน", fmt(s.profit), s.profit >= 0 ? "text-green-700" : "text-red-700"],
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-bold">
            ล็อต {formatBE(l.buy_date)} — {l.suppliers?.name}
          </h1>
          <form action={updateLot} className="no-print mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="lot_id" value={l.id} />
            <input
              name="buy_date"
              type="date"
              required
              defaultValue={l.buy_date}
              className={`${input} w-40`}
            />
            <input
              name="note"
              defaultValue={l.note}
              placeholder="หมายเหตุ เช่น ขาดค่ารถ"
              className={`${input} w-72`}
            />
            <button className="border rounded px-3 py-1.5 text-sm bg-white hover:bg-gray-100">
              บันทึก
            </button>
          </form>
          {l.note && (
            <p className="hidden print:block text-sm text-gray-600 mt-1">
              * {l.note}
            </p>
          )}
        </div>
        <div className="ml-auto no-print">
          <DeleteButton
            action={deleteLot.bind(null, l.id)}
            confirmText="ลบล็อตนี้ทั้งหมด รวมรายการซื้อ/ขาย/ค่าใช้จ่าย?"
            className="border border-red-300 text-red-600 rounded px-3 py-1.5 text-sm hover:bg-red-50"
          >
            ลบล็อต
          </DeleteButton>
        </div>
      </div>

      {/* headline summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {headline.map(([label, value, cls]) => (
          <div key={label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="text-xs text-gray-500">{label}</div>
            <div className={`text-lg font-semibold ${cls ?? ""}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* per-size table */}
      <section>
        <h2 className="font-bold mb-2">สรุปตามเบอร์</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={th}>รายการ</th>
                <th className={th}>ซื้อ กก.</th>
                <th className={th}>ขาย กก.</th>
                <th className={th}>น้ำหนักเพิ่ม/ลด กก.</th>
                <th className={th}>% เพิ่ม/ลด</th>
                <th className={th}>ต้นทุนซื้อ</th>
                <th className={th}>ยอดขาย</th>
                <th className={th}>กำไรขั้นต้น</th>
              </tr>
            </thead>
            <tbody>
              {s.sizeRows.map((r) => (
                <tr key={r.code}>
                  <td className={td}>{r.code}</td>
                  <td className={tdR}>{fmt(r.buyKg)}</td>
                  <td className={tdR}>{fmt(r.sellKg)}</td>
                  <td className={tdR}>{fmt(r.diffKg)}</td>
                  <td className={`${tdR} ${pctClass(r.pct)}`}>{fmtPct(r.pct)}</td>
                  <td className={tdR}>{fmt(r.cost)}</td>
                  <td className={tdR}>{fmt(r.sales)}</td>
                  <td className={`${tdR} ${r.gross >= 0 ? "" : "text-red-700"}`}>
                    {fmt(r.gross)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className={td}>ปรับยอด/ไม่ระบุเบอร์</td>
                <td className={tdR}></td>
                <td className={tdR}></td>
                <td className={tdR}></td>
                <td className={tdR}></td>
                <td className={tdR}></td>
                <td className={tdR}>{fmt(s.adjustmentTotal)}</td>
                <td className={tdR}>{fmt(s.adjustmentTotal)}</td>
              </tr>
              <tr className="font-semibold bg-gray-50">
                <td className={td}>รวม</td>
                <td className={tdR}>{fmt(s.total.buyKg)}</td>
                <td className={tdR}>{fmt(s.total.sellKg)}</td>
                <td className={tdR}>{fmt(s.total.diffKg)}</td>
                <td className={`${tdR} ${pctClass(s.total.pct)}`}>
                  {fmtPct(s.total.pct)}
                </td>
                <td className={tdR}>{fmt(s.total.cost)}</td>
                <td className={tdR}>{fmt(s.total.sales)}</td>
                <td className={`${tdR} ${s.total.gross >= 0 ? "" : "text-red-700"}`}>
                  {fmt(s.total.gross)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* buy lines */}
      <section>
        <h2 className="font-bold mb-2">รายละเอียดซื้อ</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={th}>ตู้</th>
                <th className={th}>เบอร์</th>
                <th className={th}>รายการ</th>
                <th className={th}>ตัว/กก.</th>
                <th className={th}>ซื้อ กก.</th>
                <th className={th}>ต้นทุน/กก.</th>
                <th className={th}>ต้นทุนซื้อ</th>
                <th className={th}>หมายเหตุ</th>
                <th className={`${th} no-print`}></th>
              </tr>
            </thead>
            <tbody>
              {buys.map((b) => (
                <EditableRow
                  key={b.id}
                  formId={`buy-${b.id}`}
                  action={updateBuyLine}
                  hidden={{ id: b.id, lot_id: l.id }}
                  deleteSlot={<DeleteButton action={deleteBuyLine.bind(null, b.id, l.id)} />}
                  fields={[
                    { name: "container", value: b.container, display: b.container },
                    { name: "size_code", value: b.size_code, display: b.size_code, options: sizeOptions },
                    { name: "description", value: b.description, display: b.description },
                    { name: "density", value: b.density, display: b.density },
                    { name: "weight_kg", value: String(b.weight_kg), display: fmt(Number(b.weight_kg)), right: true, inputMode: "decimal" },
                    { name: "cost_per_kg", value: String(b.cost_per_kg), display: fmt(Number(b.cost_per_kg)), right: true, inputMode: "decimal" },
                    { display: fmt(Number(b.weight_kg) * Number(b.cost_per_kg)), right: true },
                    { name: "note", value: b.note, display: b.note },
                  ]}
                />
              ))}
            </tbody>
          </table>
        </div>
        <form
          action={addBuyLine}
          className="no-print mt-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end bg-white border border-gray-200 rounded-lg p-3"
        >
          <input type="hidden" name="lot_id" value={l.id} />
          <label className="text-xs text-gray-600">
            ตู้
            <input name="container" defaultValue="1" className={input} />
          </label>
          <label className="text-xs text-gray-600">
            เบอร์
            <select name="size_code" required className={input}>
              {sizeList.map((sz) => (
                <option key={sz.code} value={sz.code}>
                  {sz.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            รายการ
            <input name="description" placeholder="เช่น No.0" className={input} />
          </label>
          <label className="text-xs text-gray-600">
            ตัว/กก.
            <input name="density" placeholder="เช่น 87-88" className={input} />
          </label>
          <label className="text-xs text-gray-600">
            ซื้อ กก.
            <input name="weight_kg" required inputMode="decimal" className={input} />
          </label>
          <label className="text-xs text-gray-600">
            ต้นทุน/กก.
            <input name="cost_per_kg" required inputMode="decimal" className={input} />
          </label>
          <label className="text-xs text-gray-600">
            หมายเหตุ
            <input name="note" className={input} />
          </label>
          <button className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700">
            + เพิ่มซื้อ
          </button>
        </form>
      </section>

      {/* sell lines */}
      <section>
        <h2 className="font-bold mb-2">รายละเอียดขาย</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={th}>วันที่ขาย</th>
                <th className={th}>ตู้</th>
                <th className={th}>เบอร์</th>
                <th className={th}>รายการ</th>
                <th className={th}>ตัว/กก.</th>
                <th className={th}>ขาย กก.</th>
                <th className={th}>ราคา</th>
                <th className={th}>ยอดขาย</th>
                <th className={`${th} no-print`}></th>
              </tr>
            </thead>
            <tbody>
              {sells.map((sl) => (
                <EditableRow
                  key={sl.id}
                  formId={`sell-${sl.id}`}
                  action={updateSellLine}
                  hidden={{ id: sl.id, lot_id: l.id }}
                  deleteSlot={<DeleteButton action={deleteSellLine.bind(null, sl.id, l.id)} />}
                  fields={[
                    { name: "sell_date", value: sl.sell_date, display: formatBE(sl.sell_date), type: "date" },
                    { name: "container", value: sl.container, display: sl.container },
                    { name: "size_code", value: sl.size_code, display: sl.size_code, options: sizeOptions },
                    { name: "description", value: sl.description, display: sl.description },
                    { name: "density", value: sl.density, display: sl.density },
                    { name: "weight_kg", value: String(sl.weight_kg), display: fmt(Number(sl.weight_kg)), right: true, inputMode: "decimal" },
                    { name: "price_per_kg", value: String(sl.price_per_kg), display: fmt(Number(sl.price_per_kg)), right: true, inputMode: "decimal" },
                    { display: fmt(Number(sl.weight_kg) * Number(sl.price_per_kg)), right: true },
                  ]}
                />
              ))}
            </tbody>
          </table>
        </div>
        <form
          action={addSellLine}
          className="no-print mt-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end bg-white border border-gray-200 rounded-lg p-3"
        >
          <input type="hidden" name="lot_id" value={l.id} />
          <label className="text-xs text-gray-600">
            วันที่ขาย
            <input name="sell_date" type="date" required defaultValue={l.buy_date} className={input} />
          </label>
          <label className="text-xs text-gray-600">
            ตู้
            <input name="container" defaultValue="1" className={input} />
          </label>
          <label className="text-xs text-gray-600">
            เบอร์
            <select name="size_code" required className={input}>
              {sizeList.map((sz) => (
                <option key={sz.code} value={sz.code}>
                  {sz.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            รายการ
            <input name="description" placeholder="เช่น (ดี)" className={input} />
          </label>
          <label className="text-xs text-gray-600">
            ตัว/กก.
            <input name="density" placeholder="เช่น 75.87" className={input} />
          </label>
          <label className="text-xs text-gray-600">
            ขาย กก.
            <input name="weight_kg" required inputMode="decimal" className={input} />
          </label>
          <label className="text-xs text-gray-600">
            ราคา/กก.
            <input name="price_per_kg" required inputMode="decimal" className={input} />
          </label>
          <button className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700">
            + เพิ่มขาย
          </button>
        </form>
      </section>

      {/* adjustments */}
      <section>
        <h2 className="font-bold mb-2">ปรับยอด/ไม่ระบุเบอร์</h2>
        {adjs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white">
              <thead>
                <tr>
                  <th className={th}>จำนวนเงิน</th>
                  <th className={th}>หมายเหตุ</th>
                  <th className={`${th} no-print`}></th>
                </tr>
              </thead>
              <tbody>
                {adjs.map((a) => (
                  <tr key={a.id}>
                    <td className={tdR}>{fmt(Number(a.amount))}</td>
                    <td className={td}>{a.note}</td>
                    <td className={`${td} no-print text-center`}>
                      <DeleteButton action={deleteAdjustment.bind(null, a.id, l.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form
          action={addAdjustment}
          className="no-print mt-2 flex flex-wrap gap-2 items-end bg-white border border-gray-200 rounded-lg p-3"
        >
          <input type="hidden" name="lot_id" value={l.id} />
          <label className="text-xs text-gray-600">
            จำนวนเงิน (+/-)
            <input name="amount" required inputMode="decimal" className={input} />
          </label>
          <label className="text-xs text-gray-600 flex-1 min-w-40">
            หมายเหตุ
            <input name="note" className={input} />
          </label>
          <button className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700">
            + เพิ่มปรับยอด
          </button>
        </form>
      </section>

      {/* expenses */}
      <section>
        <h2 className="font-bold mb-2">ค่าใช้จ่าย</h2>
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
              {exps.map((e) => (
                <tr key={e.id}>
                  <td className={td}>{e.expense_categories?.name}</td>
                  <td className={tdR}>{fmt(Number(e.amount))}</td>
                  <td className={td}>{e.note}</td>
                  <td className={`${td} no-print text-center`}>
                    <DeleteButton action={deleteExpense.bind(null, e.id, l.id)} />
                  </td>
                </tr>
              ))}
              <tr className="font-semibold bg-gray-50">
                <td className={td}>รวม</td>
                <td className={tdR}>{fmt(s.expenseTotal)}</td>
                <td className={td}></td>
                <td className={`${td} no-print`}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <form
          action={addExpense}
          className="no-print mt-2 flex flex-wrap gap-2 items-end bg-white border border-gray-200 rounded-lg p-3"
        >
          <input type="hidden" name="lot_id" value={l.id} />
          <label className="text-xs text-gray-600">
            รายการ
            <input name="category" required list="category-list" className={input} />
            <datalist id="category-list">
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
            <input name="note" placeholder="เช่น 5,323 กก" className={input} />
          </label>
          <button className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700">
            + เพิ่มค่าใช้จ่าย
          </button>
        </form>
      </section>
    </div>
  );
}
