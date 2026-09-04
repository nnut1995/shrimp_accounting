"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatBE } from "@/lib/dates";
import { fmt } from "@/lib/format";
import type { ExpenseMatrix } from "@/lib/summary";

// This table pins วันที่ซื้อ/ผู้ขาย while the category columns scroll, which
// rules out border-collapse: collapsed borders belong to the table grid, not
// the cell, so they scroll out from under a sticky column. border-separate
// with one-sided cell borders draws the same 1px grid but the borders travel
// with the pinned cells.
const th =
  "border-r border-b border-gray-300 px-2 py-1.5 bg-gray-100 text-sm whitespace-nowrap";
const td = "border-r border-b border-gray-300 px-2 py-1.5 text-sm";
const tdR = `${td} text-right whitespace-nowrap`;

export default function ExpenseMatrixTable({
  columns,
  rows,
  totals,
  grandTotal,
}: ExpenseMatrix) {
  const [order, setOrder] = useState(columns);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  // ผู้ขาย pins at whatever วันที่ซื้อ actually measures. A hardcoded offset
  // leaves scrolling content showing through the seam when the column comes
  // out narrower, and overlaps the date when it comes out wider.
  const dateRef = useRef<HTMLTableCellElement>(null);
  const [dateW, setDateW] = useState(0);
  useLayoutEffect(() => {
    const el = dateRef.current;
    if (!el) return;
    const update = () => setDateW(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Insert, not swap: the dragged column takes the target's slot and
  // everything from there rightward shifts along.
  function move(from: string, to: string) {
    if (from === to) return;
    setOrder((cur) => {
      const next = cur.filter((c) => c !== from);
      const i = next.indexOf(to);
      if (i === -1) return cur;
      next.splice(i, 0, from);
      return next;
    });
  }

  function clear() {
    setDragCol(null);
    setOverCol(null);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 border-t border-l border-gray-300 bg-white">
        <thead>
          <tr>
            <th ref={dateRef} className={`${th} sticky left-0 z-[2]`}>
              วันที่ซื้อ
            </th>
            <th className={`${th} sticky z-[2]`} style={{ left: dateW }}>
              ผู้ขาย
            </th>
            {order.map((name) => (
              <th
                key={name}
                draggable
                onDragStart={() => setDragCol(name)}
                // without preventDefault the browser refuses the drop entirely
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverCol(name);
                }}
                onDragLeave={() => setOverCol((c) => (c === name ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragCol) move(dragCol, name);
                  clear();
                }}
                onDragEnd={clear}
                title="ลากเพื่อสลับตำแหน่งคอลัมน์"
                className={`${th} cursor-move select-none ${
                  overCol === name ? "bg-blue-100" : ""
                } ${dragCol === name ? "opacity-50" : ""}`}
              >
                {name}
              </th>
            ))}
            <th className={th}>รวม</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                className={`${td} text-center text-gray-500`}
                colSpan={columns.length + 3}
              >
                ไม่มีล็อตในเดือนนี้
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.lotId} className="group">
              <td
                className={`${td} sticky left-0 z-[1] bg-white group-hover:bg-blue-50`}
              >
                <Link
                  href={`/lots/${r.lotId}`}
                  className="text-blue-700 hover:underline"
                >
                  {formatBE(r.date)}
                </Link>
              </td>
              <td
                className={`${td} sticky z-[1] bg-white group-hover:bg-blue-50 whitespace-nowrap`}
                style={{ left: dateW }}
              >
                {r.supplier}
              </td>
              {order.map((name) => (
                // a missing key gives undefined, which fmt renders blank —
                // "no line recorded", as distinct from a recorded 0.00
                <td key={name} className={`${tdR} group-hover:bg-blue-50`}>
                  {fmt(r.amounts[name])}
                </td>
              ))}
              <td className={`${tdR} font-medium group-hover:bg-blue-50`}>
                {fmt(r.total)}
              </td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="font-semibold">
              <td className={`${td} sticky left-0 z-[1] bg-gray-50`}>รวม</td>
              <td
                className={`${td} sticky z-[1] bg-gray-50`}
                style={{ left: dateW }}
              />
              {order.map((name) => (
                <td key={name} className={`${tdR} bg-gray-50`}>
                  {fmt(totals[name])}
                </td>
              ))}
              <td className={`${tdR} bg-gray-50`}>{fmt(grandTotal)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
