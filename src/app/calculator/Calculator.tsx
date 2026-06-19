"use client";

import { useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Model
//
// Each row exposes four flexible fields. The user pins any two and the other
// two are derived. `weight` and `percent` are two views of the same axis, so
// they can never both be pinned at once (see ALIAS). The top totals behave the
// same way over {count, kg, size}.
// ---------------------------------------------------------------------------

type Field = "size" | "percent" | "count" | "weight";
const FIELDS: Field[] = ["size", "percent", "count", "weight"];
const ALIAS: Partial<Record<Field, Field>> = { weight: "percent", percent: "weight" };

type TopField = "count" | "kg" | "size";
const TOP_FIELDS: TopField[] = ["count", "kg", "size"];

type Row = {
  id: number;
  label: string;
  labelCustom: boolean;
  isBalance: boolean;
  raw: Record<Field, string>; // literal text for pinned fields
  pins: Field[]; // ordered, max 2
  price: string;
};

type Top = {
  raw: Record<TopField, string>;
  pins: TopField[];
};

type Eff = { size: number | null; percent: number | null; count: number | null; weight: number | null };
type TopEff = { count: number | null; kg: number | null; size: number | null };

const emptyFieldRaw = (): Record<Field, string> => ({ size: "", percent: "", count: "", weight: "" });

function newRow(id: number): Row {
  return { id, label: "", labelCustom: false, isBalance: false, raw: emptyFieldRaw(), pins: [], price: "" };
}

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------

function num(v: string): number | null {
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

// Compact, comma-grouped display (read-only cells).
function fmtNum(n: number, digits = 4): string {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
function dash(n: number | null, digits = 4): string {
  return n === null || !isFinite(n) ? "—" : fmtNum(n, digits);
}

// Plain value for editable inputs (no grouping, trailing zeros trimmed).
function fmtPlain(n: number | null, digits = 4): string {
  if (n === null || !isFinite(n)) return "";
  return Number(n.toFixed(digits)).toString();
}

// ---------------------------------------------------------------------------
// Solvers (pure)
// ---------------------------------------------------------------------------

function solveTop(top: Top): TopEff {
  const e: TopEff = { count: null, kg: null, size: null };
  top.pins.forEach((f) => {
    const v = num(top.raw[f]);
    if (v !== null && isFinite(v)) e[f] = v;
  });
  for (let i = 0; i < 2; i++) {
    if (e.size === null && e.count !== null && e.kg !== null && e.kg > 0) e.size = e.count / e.kg;
    if (e.count === null && e.size !== null && e.kg !== null) e.count = e.size * e.kg;
    if (e.kg === null && e.size !== null && e.size > 0 && e.count !== null) e.kg = e.count / e.size;
  }
  return e;
}

// `kg` lets percent act as an INPUT (percent -> weight); pass null to forbid
// that, which avoids a circular total when the total is derived from the rows.
function solveRow(row: Row, kg: number | null): Eff {
  const e: Eff = { size: null, percent: null, count: null, weight: null };
  row.pins.forEach((f) => {
    const v = num(row.raw[f]);
    if (v === null || !isFinite(v)) return;
    if (f === "percent" && kg === null) return; // percent-as-input needs a real total
    e[f] = v;
  });
  for (let i = 0; i < 3; i++) {
    if (e.weight === null && e.percent !== null && kg) e.weight = (e.percent / 100) * kg;
    if (e.weight === null && e.count !== null && e.size !== null && e.size > 0) e.weight = e.count / e.size;
    if (e.count === null && e.size !== null && e.weight !== null) e.count = e.size * e.weight;
    if (e.size === null && e.count !== null && e.weight !== null && e.weight > 0) e.size = e.count / e.weight;
  }
  return e;
}

type Computed = {
  topEff: TopEff;
  eff: Map<number, Eff>;
  avgPerKg: number;
  hasAnyPriced: boolean;
  finalPrice: number | null;
  remKg: number | null;
  remCount: number | null;
  remPct: number | null;
  remSize: number | null;
  over: boolean;
};

function compute(rows: Row[], top: Top, growthStr: string): Computed {
  const t = solveTop(top);

  // Phase 1: solve each non-balance row physically.
  let sumKg = 0;
  let sumCount = 0;
  const eff = new Map<number, Eff>();
  rows.forEach((row) => {
    if (row.isBalance) return;
    const e = solveRow(row, t.kg);
    eff.set(row.id, e);
    if (e.weight !== null) sumKg += e.weight;
    if (e.count !== null) sumCount += e.count;
  });

  // Balance row absorbs leftover weight & count so the totals stay matched.
  const balanceRow = rows.find((r) => r.isBalance) ?? null;
  let balanceOver = false;
  if (balanceRow) {
    const bw = t.kg !== null ? t.kg - sumKg : null;
    const bc = t.count !== null ? t.count - sumCount : null;
    const bsize = bw !== null && bc !== null && bw > 1e-9 && bc > 1e-9 ? bc / bw : null;
    const bpct = bw !== null && t.kg ? (bw / t.kg) * 100 : null;
    eff.set(balanceRow.id, { size: bsize, percent: bpct, count: bc, weight: bw });
    if (bw !== null) sumKg += bw;
    if (bc !== null) sumCount += bc;
    balanceOver = (bw !== null && bw < -1e-6) || (bc !== null && bc < -1e-6);
  }

  // Effective totals: authoritative top value wins, else fall back to row sums.
  const effKg = t.kg !== null ? t.kg : sumKg > 0 ? sumKg : null;
  const effCount = t.count !== null ? t.count : sumCount > 0 ? sumCount : null;
  const effSize = t.size !== null ? t.size : effCount && effKg ? effCount / effKg : null;
  const topEff: TopEff = { count: effCount, kg: effKg, size: effSize };

  // percent OUTPUT from the effective total + price weighting.
  let avgPerKg = 0;
  let hasAnyPriced = false;
  rows.forEach((row) => {
    const e = eff.get(row.id)!;
    if (e.percent === null && e.weight !== null && effKg) e.percent = (e.weight / effKg) * 100;
    const price = num(row.price);
    if (price !== null && e.percent !== null) {
      avgPerKg += price * (e.percent / 100);
      hasAnyPriced = true;
    }
  });

  const growth = num(growthStr);
  const finalPrice = hasAnyPriced ? avgPerKg * (1 + (growth ?? 0) / 100) : null;

  // Remainder is only meaningful against an authoritative top total.
  const remKg = t.kg !== null ? t.kg - sumKg : null;
  const remCount = t.count !== null ? t.count - sumCount : null;
  const remPct = t.kg !== null && remKg !== null && t.kg ? (remKg / t.kg) * 100 : null;
  const remSize = remKg !== null && remCount !== null && remKg > 1e-9 && remCount > 1e-9 ? remCount / remKg : null;
  const over = (remKg !== null && remKg < -1e-6) || (remCount !== null && remCount < -1e-6) || balanceOver;

  return { topEff, eff, avgPerKg, hasAnyPriced, finalPrice, remKg, remCount, remPct, remSize, over };
}

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

const card = "bg-white border border-gray-200 rounded-xl p-4 sm:p-5";
const fieldLabel = "block text-xs text-gray-500 mb-1";
const baseInput =
  "w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const derivedInput = "bg-gray-100 text-gray-500";
const th = "px-2 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap text-right";
const thL = "px-2 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap text-left";
const td = "px-2 py-2 border-t border-gray-200 align-middle text-right";
const tdL = "px-2 py-2 border-t border-gray-200 align-middle text-left";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Calculator() {
  const idRef = useRef(2);
  const [rows, setRows] = useState<Row[]>(() => [newRow(1), newRow(2)]);
  const [top, setTop] = useState<Top>({ raw: { count: "", kg: "", size: "" }, pins: [] });
  const [growth, setGrowth] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  const c = useMemo(() => compute(rows, top, growth), [rows, top, growth]);

  const labelOf = (row: Row, idx: number) =>
    row.labelCustom && row.label.trim() !== "" ? row.label : String(idx + 1);

  // --- handlers ---------------------------------------------------------------

  function onTopInput(field: TopField, value: string) {
    setTop((prev) => {
      const raw = { ...prev.raw, [field]: value };
      let pins = [...prev.pins];
      const v = num(value);
      if (v === null || v <= 0) {
        pins = pins.filter((f) => f !== field);
      } else if (!pins.includes(field)) {
        pins.push(field);
        if (pins.length > 2) {
          const dropped = pins.shift()!;
          raw[dropped] = "";
        }
      }
      return { raw, pins };
    });
  }

  function onFieldInput(rowId: number, field: Field, value: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const r: Row = { ...row, raw: { ...row.raw }, pins: [...row.pins] };
        // Typing in a balance row means taking manual control of it.
        if (r.isBalance) r.isBalance = false;
        r.raw[field] = value;
        const v = num(value);
        if (v === null) {
          r.pins = r.pins.filter((f) => f !== field);
        } else if (!r.pins.includes(field)) {
          const alias = ALIAS[field];
          if (alias && r.pins.includes(alias)) {
            // weight <-> percent share one axis: replace the alias in place
            r.pins = r.pins.map((f) => (f === alias ? field : f));
            r.raw[alias] = "";
          } else {
            r.pins.push(field);
            if (r.pins.length > 2) {
              const dropped = r.pins.shift()!;
              r.raw[dropped] = "";
            }
          }
        }
        return r;
      })
    );
  }

  function onLabelInput(rowId: number, value: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, label: value, labelCustom: value.trim() !== "" } : row
      )
    );
  }

  function onPriceInput(rowId: number, value: string) {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, price: value } : row)));
  }

  function toggleBalance(rowId: number) {
    setRows((prev) => {
      const wasBalance = prev.find((r) => r.id === rowId)?.isBalance ?? false;
      return prev.map((r) => {
        if (r.id === rowId) {
          if (wasBalance) return { ...r, isBalance: false };
          return { ...r, isBalance: true, pins: [], raw: emptyFieldRaw() };
        }
        return r.isBalance ? { ...r, isBalance: false } : r; // only one balance row
      });
    });
  }

  function addRow() {
    idRef.current += 1;
    setRows((prev) => [...prev, newRow(idRef.current)]);
  }

  function deleteRow(rowId: number) {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }

  // --- render helpers ---------------------------------------------------------

  // Resolve what a flexible field input should show: the user's literal text
  // when pinned, otherwise the (greyed) computed value.
  function fieldView(row: Row, field: Field): { value: string; derived: boolean } {
    if (row.pins.includes(field)) return { value: row.raw[field], derived: false };
    const e = c.eff.get(row.id);
    const v = e ? e[field] : null;
    if (v !== null && isFinite(v)) {
      return { value: field === "count" ? String(Math.round(v)) : fmtPlain(v, 4), derived: true };
    }
    return { value: "", derived: false };
  }

  function topView(field: TopField): { value: string; derived: boolean } {
    if (top.pins.includes(field)) return { value: top.raw[field], derived: false };
    const v = c.topEff[field];
    if (v !== null && isFinite(v)) {
      return { value: field === "count" ? String(Math.round(v)) : fmtPlain(v, 4), derived: true };
    }
    return { value: "", derived: false };
  }

  const topInputProps: Record<TopField, { label: string; step: string; placeholder: string; accent?: boolean }> = {
    count: { label: "จำนวนกุ้งทั้งหมด (ตัว)", step: "1", placeholder: "เช่น 3000" },
    kg: { label: "น้ำหนักรวม (กก.)", step: "0.01", placeholder: "เช่น 100" },
    size: { label: "ไซส์รวม (ตัว/กก.)", step: "0.1", placeholder: "เช่น 30", accent: true },
  };

  const fieldStep: Record<Field, string> = { size: "0.1", percent: "0.1", count: "1", weight: "0.01" };
  const fieldPlaceholder: Record<Field, string> = { size: "เช่น 30", percent: "เช่น 20", count: "เช่น 600", weight: "เช่น 20" };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">โปรแกรมคำนวณไซส์กุ้ง</h1>
        <p className="text-sm text-gray-500 mt-1">กรอกจำนวนกุ้งและน้ำหนักรวม จากนั้นแยกย่อยตามไซส์</p>
      </div>

      {/* Totals */}
      <div className={card}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TOP_FIELDS.map((f) => {
            const v = topView(f);
            const p = topInputProps[f];
            return (
              <div key={f}>
                <label className={fieldLabel} htmlFor={`top-${f}`}>
                  {p.label}
                </label>
                <input
                  id={`top-${f}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={p.step}
                  placeholder={p.placeholder}
                  value={v.value}
                  onChange={(e) => onTopInput(f, e.target.value)}
                  className={`${baseInput} ${v.derived ? derivedInput : ""} ${
                    p.accent && !v.derived ? "border-blue-500 text-blue-700 font-semibold" : ""
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Size breakdown */}
      <div className={card}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${thL} w-20`}>เบอร์</th>
                <th className={th}>ไซส์ (ตัว/กก.)</th>
                <th className={th}>% ของน้ำหนัก</th>
                <th className={th}>จำนวน (ตัว)</th>
                <th className={th}>น้ำหนัก (กก.)</th>
                <th className="px-2 py-2 w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className={row.isBalance ? "bg-blue-50" : undefined}>
                  <td className={tdL}>
                    <input
                      type="text"
                      value={labelOf(row, idx)}
                      onChange={(e) => onLabelInput(row.id, e.target.value)}
                      placeholder="เช่น 1"
                      className={`${baseInput} min-w-16`}
                    />
                  </td>
                  {FIELDS.map((f) => {
                    const v = fieldView(row, f);
                    return (
                      <td key={f} className={td}>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={fieldStep[f]}
                          placeholder={fieldPlaceholder[f]}
                          value={v.value}
                          onChange={(e) => onFieldInput(row.id, f, e.target.value)}
                          className={`${baseInput} min-w-20 text-right ${v.derived ? derivedInput : ""} ${
                            f === "size" && !v.derived ? "font-bold" : ""
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 border-t border-gray-200 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleBalance(row.id)}
                      title="เติมส่วนที่เหลือให้พอดียอดรวม"
                      className={`px-1.5 rounded text-lg ${
                        row.isBalance ? "text-blue-700 bg-blue-100" : "text-gray-400 hover:text-blue-700 hover:bg-blue-50"
                      }`}
                    >
                      ⚖
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRow(row.id)}
                      title="ลบ"
                      className="px-1.5 rounded text-lg text-gray-400 hover:text-red-700 hover:bg-red-50"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={c.over ? "bg-red-50 text-red-700 font-semibold" : "bg-gray-50 font-semibold"}>
                <td className={tdL}>ส่วนที่เหลือ</td>
                <td className={td}>{dash(c.remSize)}</td>
                <td className={td}>{c.remPct === null ? "—" : `${fmtNum(c.remPct)}%`}</td>
                <td className={td}>{dash(c.remCount, 0)}</td>
                <td className={td}>{dash(c.remKg)}</td>
                <td className="border-t border-gray-200" />
              </tr>
            </tfoot>
          </table>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-3 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
        >
          + เพิ่มไซส์
        </button>
        <p className={`text-xs mt-2 ${c.over ? "text-red-600" : "text-gray-500"}`}>
          {c.over
            ? "คำเตือน: ค่าที่ระบุเกินยอดรวม"
            : "หมายเหตุ: กรอกค่าใดก็ได้ 2 ช่องในแต่ละแถว ระบบจะคำนวณอีก 2 ช่องที่เหลือให้อัตโนมัติ"}
        </p>
      </div>

      {/* Price */}
      <div className={card}>
        <h2 className="text-base font-bold mb-3">ราคา</h2>
        {rows.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-3">ยังไม่มีรายการ เพิ่มไซส์ในส่วนด้านบนก่อน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${thL} w-20`}>เบอร์</th>
                  <th className={th}>ไซส์ (ตัว/กก.)</th>
                  <th className={th}>% ของน้ำหนัก</th>
                  <th className={th}>ราคา/กก. (฿)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const e = c.eff.get(row.id);
                  return (
                    <tr key={row.id}>
                      <td className={tdL}>{labelOf(row, idx)}</td>
                      <td className={`${td} font-semibold`}>{dash(e?.size ?? null)}</td>
                      <td className={`${td} font-semibold`}>{e?.percent != null ? `${fmtNum(e.percent)}%` : "—"}</td>
                      <td className={td}>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          placeholder="เช่น 200"
                          value={row.price}
                          onChange={(ev) => onPriceInput(row.id, ev.target.value)}
                          className={`${baseInput} min-w-24 text-right`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mt-4 pt-4 border-t border-gray-200">
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-center">
            <div className="text-xl font-semibold text-blue-700">{c.hasAnyPriced ? fmtNum(c.avgPerKg) : "—"}</div>
            <div className="text-xs text-gray-500">ราคาเฉลี่ย (฿/กก.)</div>
          </div>
          <div>
            <label className={fieldLabel} htmlFor="growth">
              % น้ำหนักเพิ่ม (เติบโต)
            </label>
            <input
              id="growth"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              placeholder="เช่น 10"
              value={growth}
              onChange={(e) => setGrowth(e.target.value)}
              className={baseInput}
            />
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-center">
            <div className="text-xl font-semibold text-blue-700">
              {c.hasAnyPriced ? fmtNum(c.finalPrice!) : "—"}
            </div>
            <div className="text-xs text-gray-500">ราคาที่ควรซื้อก่อนหักค่าใช้จ่าย (฿/กก.)</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSummary(true)}
          className="mt-4 w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-semibold hover:bg-gray-800"
        >
          ดูสรุป
        </button>
      </div>

      {showSummary && <SummaryModal rows={rows} c={c} growth={growth} labelOf={labelOf} onClose={() => setShowSummary(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary modal
// ---------------------------------------------------------------------------

function SummaryModal({
  rows,
  c,
  growth,
  labelOf,
  onClose,
}: {
  rows: Row[];
  c: Computed;
  growth: string;
  labelOf: (row: Row, idx: number) => string;
  onClose: () => void;
}) {
  const g = num(growth);
  const sumRow = "flex justify-between items-baseline gap-3 py-2 border-b border-gray-200 last:border-b-0 text-sm";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-lg font-bold">สรุปการคำนวณ</h2>
          <button type="button" onClick={onClose} title="ปิด" className="text-2xl text-gray-400 hover:text-gray-700 leading-none">
            ×
          </button>
        </div>
        <div className="p-5 space-y-5">
          {/* Totals */}
          <div>
            <div className="text-xs text-gray-500 tracking-wide font-semibold mb-1.5">ข้อมูลรวม</div>
            <div className={sumRow}>
              <span className="text-gray-500">น้ำหนักรวม</span>
              <span className="font-semibold">{c.topEff.kg !== null ? `${fmtNum(c.topEff.kg)} กก.` : "—"}</span>
            </div>
            <div className={sumRow}>
              <span className="text-gray-500">จำนวนทั้งหมด</span>
              <span className="font-semibold">{c.topEff.count !== null ? `${fmtNum(c.topEff.count, 0)} ตัว` : "—"}</span>
            </div>
            <div className={sumRow}>
              <span className="text-gray-500">ไซส์รวม</span>
              <span className="font-semibold">{c.topEff.size !== null ? `${fmtNum(c.topEff.size)} ตัว/กก.` : "—"}</span>
            </div>
          </div>

          {/* Rows */}
          <div>
            <div className="text-xs text-gray-500 tracking-wide font-semibold mb-1.5">รายการแยกตามไซส์</div>
            {rows.length === 0 ? (
              <div className="text-gray-500 text-sm py-2">ยังไม่มีรายการ</div>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={thL}>เบอร์</th>
                    <th className={th}>ไซส์</th>
                    <th className={th}>%</th>
                    <th className={th}>ราคา/กก.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const e = c.eff.get(row.id);
                    const price = num(row.price);
                    return (
                      <tr key={row.id}>
                        <td className={`${tdL} font-semibold`}>{labelOf(row, idx)}</td>
                        <td className={`${td} font-semibold`}>{dash(e?.size ?? null)}</td>
                        <td className={`${td} font-semibold`}>{e?.percent != null ? `${fmtNum(e.percent)}%` : "—"}</td>
                        <td className={`${td} font-semibold`}>{price !== null ? fmtNum(price) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Price */}
          <div>
            <div className="text-xs text-gray-500 tracking-wide font-semibold mb-1.5">ราคา</div>
            <div className={sumRow}>
              <span className="text-gray-500">ราคาเฉลี่ย (ก่อนเติบโต)</span>
              <span className="font-semibold">{c.hasAnyPriced ? `${fmtNum(c.avgPerKg)} ฿/กก.` : "—"}</span>
            </div>
            <div className={sumRow}>
              <span className="text-gray-500">% น้ำหนักเพิ่ม</span>
              <span className="font-semibold">{g !== null ? `${fmtNum(g)}%` : "0%"}</span>
            </div>
            <div className="flex justify-between items-baseline gap-3 pt-3 mt-1.5 border-t-2 border-blue-600 text-sm">
              <span className="text-gray-500">ราคาที่ควรซื้อก่อนหักค่าใช้จ่าย</span>
              <span className="text-blue-700 font-semibold text-lg">
                {c.hasAnyPriced ? `${fmtNum(c.finalPrice!)} ฿/กก.` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
