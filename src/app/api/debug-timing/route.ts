import { createClient } from "@/lib/supabase/server";

// Read-only timing probe for the signed-in owner: measures each server-side
// step of a page load (login check, database queries) from inside the Vercel
// function. Runs the same SELECTs the pages run; writes nothing.
const LIST_SELECT =
  "id, buy_date, broker, note, suppliers(name), buy_lines(size_code, weight_kg, cost_per_kg), sell_lines(size_code, weight_kg, price_per_kg, fee_pct, fee_amount), adjustments(kind, amount), expenses(amount)";
const LOT_SELECT =
  "*, suppliers(name), buy_lines(*), sell_lines(*), adjustments(*), expenses(*, expense_categories(name))";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const t0 = performance.now();
  const ms = (t: number) => Math.round((performance.now() - t) * 10) / 10;
  const supabase = await createClient();

  let t = performance.now();
  const { data: auth } = await supabase.auth.getClaims();
  const loginCheck = ms(t);
  if (!auth?.claims) return Response.json({ error: "sign in first" }, { status: 401 });

  const timed = async (q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const s = performance.now();
    const r = await q;
    const body = JSON.stringify(r.data ?? null);
    return { ms: ms(s), kb: Math.round(body.length / 102.4) / 10, error: r.error ? String((r.error as { message?: string }).message) : undefined };
  };

  const id = new URL(request.url).searchParams.get("lot");
  const results: Record<string, unknown> = {};
  // Smallest possible query: pure server -> database -> server round trip.
  for (let i = 0; i < 3; i++) results[`tiny_query_${i + 1}`] = await timed(supabase.from("sizes").select("code").limit(1));
  results.lot_list_all = await timed(supabase.from("lots").select(LIST_SELECT).order("buy_date", { ascending: false }));
  results.lot_list_aug_2026 = await timed(
    supabase.from("lots").select(LIST_SELECT).gte("buy_date", "2026-08-01").lte("buy_date", "2026-08-31")
  );
  if (id) {
    results.one_lot = await timed(supabase.from("lots").select(LOT_SELECT).eq("id", id).single());
    t = performance.now();
    await Promise.all([
      supabase.from("lots").select(LOT_SELECT).eq("id", id).single(),
      supabase.from("sizes").select("*").order("sort_order"),
      supabase.from("expense_categories").select("name").order("name"),
      supabase.from("sell_lines").select("buyer").neq("buyer", ""),
      supabase.from("suppliers").select("name").order("name"),
      supabase.from("lots").select("broker"),
    ]);
    results.lot_page_all_queries_in_parallel = { ms: ms(t) };
  }
  results.year_2026_full = await timed(
    supabase.from("lots").select(LOT_SELECT).gte("buy_date", "2026-01-01").lte("buy_date", "2026-12-31")
  );

  return Response.json(
    { region: process.env.VERCEL_REGION ?? "local", login_check_ms: loginCheck, queries: results, total_ms: ms(t0) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
