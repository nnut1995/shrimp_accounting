import { createClient } from "@/lib/supabase/server";

export default async function BrokerInput({ defaultValue = "" }: { defaultValue?: string }) {
  const db = await createClient();
  const names = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("lots").select("broker").order("id").range(offset, offset + 999);
    if (error) throw new Error("โหลดรายชื่อนายหน้าไม่สำเร็จ กรุณาตรวจสอบการอัปเดตฐานข้อมูล");
    for (const row of data ?? []) if (row.broker?.trim()) names.add(row.broker.trim());
    if (!data || data.length < 1000) break;
  }
  return (
    <label className="block text-sm">
      นายหน้า
      <input name="broker" defaultValue={defaultValue} list="broker-list" maxLength={2000}
        placeholder="ชื่อนายหน้า (เว้นว่างได้)" className="block w-full border rounded-lg px-3 py-2 mt-1 bg-white" />
      <datalist id="broker-list">
        {[...names].sort((a, b) => a.localeCompare(b, "th")).map(name => <option key={name} value={name} />)}
      </datalist>
    </label>
  );
}
