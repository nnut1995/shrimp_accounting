"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function num(v: FormDataEntryValue | null): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

async function findOrCreateByName(
  table: "suppliers" | "expense_categories",
  name: string
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .upsert({ name }, { onConflict: "name" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "บันทึกไม่สำเร็จ");
  return data.id;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createLot(formData: FormData) {
  const supabase = await createClient();
  const buyDate = str(formData.get("buy_date"));
  const supplierName = str(formData.get("supplier"));
  if (!buyDate || !supplierName) throw new Error("กรุณากรอกวันที่และผู้ขาย");
  const supplierId = await findOrCreateByName("suppliers", supplierName);
  const { data, error } = await supabase
    .from("lots")
    .insert({
      buy_date: buyDate,
      supplier_id: supplierId,
      note: str(formData.get("note")),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "สร้างล็อตไม่สำเร็จ");
  revalidatePath("/");
  redirect(`/lots/${data.id}`);
}

export async function updateLot(formData: FormData) {
  const supabase = await createClient();
  const lotId = str(formData.get("lot_id"));
  const buyDate = str(formData.get("buy_date"));
  if (!buyDate) throw new Error("กรุณากรอกวันที่ซื้อ");
  const { error } = await supabase
    .from("lots")
    .update({ buy_date: buyDate, note: str(formData.get("note")) })
    .eq("id", lotId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/lots/${lotId}`);
}

export async function deleteLot(lotId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("lots").delete().eq("id", lotId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  redirect("/");
}

export async function addBuyLine(formData: FormData) {
  const supabase = await createClient();
  const lotId = str(formData.get("lot_id"));
  const { error } = await supabase.from("buy_lines").insert({
    lot_id: lotId,
    container: str(formData.get("container")),
    size_code: str(formData.get("size_code")),
    description: str(formData.get("description")),
    density: str(formData.get("density")),
    weight_kg: num(formData.get("weight_kg")),
    cost_per_kg: num(formData.get("cost_per_kg")),
    note: str(formData.get("note")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/lots/${lotId}`);
}

export async function updateBuyLine(formData: FormData) {
  const supabase = await createClient();
  const lotId = str(formData.get("lot_id"));
  const { error } = await supabase
    .from("buy_lines")
    .update({
      container: str(formData.get("container")),
      size_code: str(formData.get("size_code")),
      description: str(formData.get("description")),
      density: str(formData.get("density")),
      weight_kg: num(formData.get("weight_kg")),
      cost_per_kg: num(formData.get("cost_per_kg")),
      note: str(formData.get("note")),
    })
    .eq("id", str(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath(`/lots/${lotId}`);
}

export async function deleteBuyLine(id: string, lotId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("buy_lines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/lots/${lotId}`);
}

export async function addSellLine(formData: FormData) {
  const supabase = await createClient();
  const lotId = str(formData.get("lot_id"));
  const { error } = await supabase.from("sell_lines").insert({
    lot_id: lotId,
    sell_date: str(formData.get("sell_date")),
    container: str(formData.get("container")),
    size_code: str(formData.get("size_code")),
    description: str(formData.get("description")),
    density: str(formData.get("density")),
    weight_kg: num(formData.get("weight_kg")),
    price_per_kg: num(formData.get("price_per_kg")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/lots/${lotId}`);
}

export async function updateSellLine(formData: FormData) {
  const supabase = await createClient();
  const lotId = str(formData.get("lot_id"));
  const { error } = await supabase
    .from("sell_lines")
    .update({
      sell_date: str(formData.get("sell_date")),
      container: str(formData.get("container")),
      size_code: str(formData.get("size_code")),
      description: str(formData.get("description")),
      density: str(formData.get("density")),
      weight_kg: num(formData.get("weight_kg")),
      price_per_kg: num(formData.get("price_per_kg")),
    })
    .eq("id", str(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath(`/lots/${lotId}`);
}

export async function deleteSellLine(id: string, lotId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sell_lines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/lots/${lotId}`);
}

export async function addExpense(formData: FormData) {
  const supabase = await createClient();
  const lotId = str(formData.get("lot_id"));
  const categoryName = str(formData.get("category"));
  if (!categoryName) throw new Error("กรุณาระบุรายการค่าใช้จ่าย");
  const categoryId = await findOrCreateByName("expense_categories", categoryName);
  const { error } = await supabase.from("expenses").insert({
    lot_id: lotId,
    category_id: categoryId,
    amount: num(formData.get("amount")),
    note: str(formData.get("note")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/lots/${lotId}`);
}

export async function deleteExpense(id: string, lotId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/lots/${lotId}`);
}

export async function addMonthlyExpense(formData: FormData) {
  const supabase = await createClient();
  const year = num(formData.get("year"));
  const month = num(formData.get("month"));
  const categoryName = str(formData.get("category"));
  if (!categoryName) throw new Error("กรุณาระบุรายการค่าใช้จ่าย");
  if (!year || month < 1 || month > 12) throw new Error("เดือน/ปีไม่ถูกต้อง");
  const categoryId = await findOrCreateByName("expense_categories", categoryName);
  const { error } = await supabase.from("monthly_expenses").insert({
    year,
    month,
    category_id: categoryId,
    amount: num(formData.get("amount")),
    note: str(formData.get("note")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/monthly");
}

export async function deleteMonthlyExpense(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("monthly_expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/monthly");
}

export async function addAdjustment(formData: FormData) {
  const supabase = await createClient();
  const lotId = str(formData.get("lot_id"));
  const { error } = await supabase.from("adjustments").insert({
    lot_id: lotId,
    amount: num(formData.get("amount")),
    note: str(formData.get("note")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/lots/${lotId}`);
}

export async function deleteAdjustment(id: string, lotId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("adjustments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/lots/${lotId}`);
}
