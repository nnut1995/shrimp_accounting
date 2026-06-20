"use server";

import { createClient } from "@/lib/supabase/server";
import type { CalcSheet, CalcSheetData } from "./types";

const SELECT = "id, title, data, created_at, updated_at";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อนบันทึก");
  return { supabase, user };
}

// History list for the current user. Returns [] for anonymous visitors so the
// public calculator still renders.
export async function listSheets(): Promise<CalcSheet[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("calc_sheets")
    .select(SELECT)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CalcSheet[];
}

export async function saveSheet(
  title: string,
  data: CalcSheetData
): Promise<CalcSheet> {
  const { supabase, user } = await requireUser();
  const { data: row, error } = await supabase
    .from("calc_sheets")
    .insert({ user_id: user.id, title, data })
    .select(SELECT)
    .single();
  if (error || !row) throw new Error(error?.message ?? "บันทึกไม่สำเร็จ");
  return row as CalcSheet;
}

export async function updateSheet(
  id: string,
  title: string,
  data: CalcSheetData
): Promise<CalcSheet> {
  const { supabase } = await requireUser();
  const { data: row, error } = await supabase
    .from("calc_sheets")
    .update({ title, data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error || !row) throw new Error(error?.message ?? "บันทึกไม่สำเร็จ");
  return row as CalcSheet;
}

export async function deleteSheet(id: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("calc_sheets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
