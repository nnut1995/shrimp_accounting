import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <header className="no-print bg-white border-b border-gray-200 sticky top-0 z-10">
        <nav className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 text-sm sm:text-base">
          <Link href="/" className="font-bold whitespace-nowrap">
            🦐 บัญชีกุ้ง
          </Link>
          <Link href="/" className="text-blue-700 hover:underline">
            รายการล็อต
          </Link>
          <Link href="/monthly" className="text-blue-700 hover:underline">
            สรุปรายเดือน
          </Link>
          <form action={signOut} className="ml-auto">
            <button className="text-gray-500 hover:text-gray-800">
              ออกจากระบบ
            </button>
          </form>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </>
  );
}
