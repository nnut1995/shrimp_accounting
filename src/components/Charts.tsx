"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmt } from "@/lib/format";

export type ChartPoint = { name: string; profit: number };

const tooltipFormatter = (value: unknown): [string, string] => [
  `${fmt(Number(value ?? 0))} บาท`,
  "กำไร/ขาดทุน",
];

export function ProfitPerLotChart({ data }: { data: ChartPoint[] }) {
  if (data.length === 0) return null;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={80} />
          <Tooltip formatter={tooltipFormatter} />
          <ReferenceLine y={0} stroke="#999" />
          <Bar dataKey="profit">
            {data.map((d, i) => (
              <Cell key={i} fill={d.profit >= 0 ? "#16a34a" : "#dc2626"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyTrendChart({ data }: { data: ChartPoint[] }) {
  if (data.length === 0) return null;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={80} />
          <Tooltip formatter={tooltipFormatter} />
          <ReferenceLine y={0} stroke="#999" />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
