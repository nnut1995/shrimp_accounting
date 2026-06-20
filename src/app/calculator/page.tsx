import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Calculator from "./Calculator";
import { listSheets } from "./actions";

export const metadata: Metadata = {
  title: "โปรแกรมคำนวณไซส์กุ้ง",
  description: "คำนวณไซส์กุ้ง ราคาเฉลี่ย และราคาที่ควรซื้อ",
};

// Public page (no auth) — whitelisted in src/proxy.ts. Saving/history require
// login and are scoped to the user; anonymous visitors just get the calculator.
export default async function CalculatorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sheets = user ? await listSheets() : [];

  return (
    <>
      <header className="no-print bg-white border-b border-gray-200 sticky top-0 z-10">
        <nav className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4 text-sm sm:text-base">
          <span className="font-bold whitespace-nowrap">🦐 คำนวณไซส์กุ้ง</span>
          {user ? (
            <Link href="/" className="ml-auto text-blue-700 hover:underline">
              กลับไปบัญชี
            </Link>
          ) : (
            <Link href="/login" className="ml-auto text-blue-700 hover:underline">
              เข้าสู่ระบบ
            </Link>
          )}
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Calculator isLoggedIn={!!user} initialSheets={sheets} />
      </main>
    </>
  );
}
