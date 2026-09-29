"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkUpdateBroker } from "@/app/broker-actions";
import { formatBE } from "@/lib/dates";
import { fmt } from "@/lib/format";

export type LotListRow = {
  id: string; buyDate: string; supplier: string; broker: string; note: string;
  buyKg: number; sellKg: number; netSales: number; profit: number;
};
const th = "border border-gray-300 px-2 py-1.5 bg-gray-100 text-sm";
const td = "border border-gray-300 px-2 py-1.5 text-sm";

export default function LotListTable({ rows, brokerNames, showBulkEdit = false }: { rows: LotListRow[]; brokerNames: string[]; showBulkEdit?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [broker, setBroker] = useState("");
  const [mode, setMode] = useState<"assign" | "clear">("assign");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const allSelected = rows.length > 0 && selected.length === rows.length;

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    startTransition(async () => {
      try {
        const result = await bulkUpdateBroker(selected, broker, mode);
        if ("error" in result) { setError(result.error); return; }
        if (result.updated === 0) { setError("ไม่พบล็อตที่เลือก กรุณาโหลดหน้าใหม่"); router.refresh(); return; }
        const partial = result.updated < selected.length ? " (บางล็อตไม่พบหรือไม่มีสิทธิ์แก้ไข)" : "";
        setMessage(`${mode === "clear" ? "นำชื่อนายหน้าออก" : `ตั้งนายหน้าเป็น ${broker.trim()}`}แล้ว ${result.updated} ล็อต${partial}`);
        setSelected([]);
        router.refresh();
      } catch {
        setError("เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบรายการก่อนลองอีกครั้ง");
      }
    });
  }

  return <div className="space-y-3">
    {showBulkEdit && <form onSubmit={save} className="no-print rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3" aria-label="แก้ไขนายหน้าหลายล็อต">
      <p className="font-medium">แก้ไขนายหน้าหลายล็อต</p>
      <p className="text-sm text-gray-600">เลือกลอตจากตารางด้านล่าง การบันทึกจะแทนที่นายหน้าเดิมเฉพาะล็อตที่เลือก</p>
      <fieldset disabled={pending} className="flex flex-wrap items-end gap-3 disabled:opacity-60">
        <label className="text-sm">การเปลี่ยนแปลง
          <select value={mode} onChange={e => setMode(e.target.value as "assign" | "clear")} className="block mt-1 border rounded-lg px-3 py-2 bg-white">
            <option value="assign">ตั้งชื่อนายหน้า</option><option value="clear">นำชื่อนายหน้าออก</option>
          </select>
        </label>
        {mode === "assign" && <label className="text-sm">นายหน้า
          <input value={broker} onChange={e => setBroker(e.target.value)} required maxLength={2000} list="bulk-broker-names"
            placeholder="พิมพ์หรือเลือกชื่อนายหน้า" className="block mt-1 border rounded-lg px-3 py-2 bg-white" />
          <datalist id="bulk-broker-names">{brokerNames.map(name => <option key={name} value={name} />)}</datalist>
        </label>}
        <button disabled={pending || selected.length === 0 || (mode === "assign" && !broker.trim())}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
          {pending ? "กำลังบันทึก…" : `บันทึก ${selected.length} ล็อตที่เลือก`}
        </button>
        <button type="button" disabled={selected.length === 0} onClick={() => setSelected([])} className="text-sm text-blue-700 py-2 disabled:opacity-50">ยกเลิกการเลือก</button>
      </fieldset>
      <p className="text-sm" aria-live="polite">เลือก {selected.length} จาก {rows.length} ล็อตที่แสดง</p>
      {message && <p role="status" className="text-sm text-green-800">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>}
    <div className="overflow-x-auto">
      <table className="w-full border-collapse bg-white">
        <thead><tr>
          {showBulkEdit && <th className={`${th} no-print`}><input type="checkbox" aria-label="เลือกทุกล็อตที่แสดง" checked={allSelected} disabled={pending || rows.length === 0}
            onChange={e => setSelected(e.target.checked ? rows.map(row => row.id) : [])} /></th>}
          {["วันที่ซื้อ", "ผู้ขาย", "นายหน้า", "น้ำหนักซื้อ", "น้ำหนักขาย", "ยอดขายสุทธิ", "กำไร/ขาดทุน", "หมายเหตุ"].map(label => <th key={label} scope="col" className={th}>{label}</th>)}
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={showBulkEdit ? 9 : 8} className={`${td} text-center text-gray-500`}>ไม่พบล็อตในรายการนี้</td></tr>}
          {rows.map(row => <tr key={row.id} className={showBulkEdit && selected.includes(row.id) ? "bg-blue-50" : "hover:bg-blue-50"}>
            {showBulkEdit && <td className={`${td} no-print text-center`}><input type="checkbox" checked={selected.includes(row.id)} disabled={pending}
              aria-label={`เลือกล็อต ${formatBE(row.buyDate)} ${row.supplier}`}
              onChange={e => setSelected(current => e.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} /></td>}
            <td className={td}><Link href={`/lots/${row.id}`} className="text-blue-700 hover:underline font-medium">{formatBE(row.buyDate)}</Link></td>
            <td className={td}>{row.supplier}</td><td className={td}>{row.broker || "ไม่ระบุ"}</td>
            {[row.buyKg, row.sellKg, row.netSales].map((value, i) => <td key={i} className={`${td} text-right`}>{fmt(value)}</td>)}
            <td className={`${td} text-right font-medium ${row.profit >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(row.profit)}</td>
            <td className={`${td} text-gray-500`}>{row.note}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
