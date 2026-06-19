import type { Metadata } from "next";
import Link from "next/link";
import Calculator from "./Calculator";

export const metadata: Metadata = {
  title: "โปรแกรมคำนวณไซส์กุ้ง",
  description: "คำนวณไซส์กุ้ง ราคาเฉลี่ย และราคาที่ควรซื้อ",
};

// Public page (no auth) — whitelisted in src/proxy.ts.
export default function CalculatorPage() {
  return (
    <>
      <header className="no-print bg-white border-b border-gray-200 sticky top-0 z-10">
        <nav className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4 text-sm sm:text-base">
          <span className="font-bold whitespace-nowrap">🦐 คำนวณไซส์กุ้ง</span>
          <Link href="/login" className="ml-auto text-blue-700 hover:underline">
            เข้าสู่ระบบ
          </Link>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Calculator />
      </main>
    </>
  );
}
