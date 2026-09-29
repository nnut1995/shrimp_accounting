"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BulkBrokerResult = { error: string } | { updated: number };

export async function bulkUpdateBroker(
  ids: string[], broker: string, mode: "assign" | "clear"
): Promise<BulkBrokerResult> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 1000 || ids.some(id =>
    typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return { error: "กรุณาเลือกล็อต 1–1,000 ล็อต" };
  }
  if ((mode !== "assign" && mode !== "clear") || typeof broker !== "string" || broker.length > 2000 || (mode === "assign" && !broker.trim())) {
    return { error: "กรุณากรอกชื่อนายหน้า หรือเลือกนำชื่อนายหน้าออก" };
  }
  const lotIds = [...new Set(ids)];
  let updatedIds: string[];
  try {
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { error: "กรุณาเข้าสู่ระบบใหม่ก่อนบันทึก" };
    // One statement updates only broker; all accounting fields remain untouched.
    const { data, error } = await db.from("lots")
      .update({ broker: mode === "clear" ? "" : broker.trim() })
      .in("id", lotIds).select("id");
    if (error) return { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" };
    updatedIds = (data ?? []).map(row => row.id);
  } catch {
    return { error: "เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบรายการก่อนลองอีกครั้ง" };
  }
  // Do not report a committed write as failed if cache refresh has a problem.
  try {
    revalidatePath("/");
    revalidatePath("/brokers");
    for (const id of updatedIds) revalidatePath(`/lots/${id}`);
  } catch {}
  return { updated: updatedIds.length };
}
