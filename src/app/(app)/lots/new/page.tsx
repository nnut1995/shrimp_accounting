import { createClient } from "@/lib/supabase/server";
import { createLot } from "@/app/actions";
import { todayISO } from "@/lib/dates";

export default async function NewLotPage() {
  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("name")
    .order("name");

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-bold mb-4">สร้างล็อตใหม่</h1>
      <form action={createLot} className="bg-white rounded-xl shadow p-5 space-y-4">
        <div>
          <label className="block text-sm mb-1" htmlFor="buy_date">
            วันที่ซื้อ
          </label>
          <input
            id="buy_date"
            name="buy_date"
            type="date"
            required
            defaultValue={todayISO()}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1" htmlFor="supplier">
            ผู้ขาย (เจ้า)
          </label>
          <input
            id="supplier"
            name="supplier"
            required
            list="supplier-list"
            placeholder="เช่น โกวัฒ"
            className="w-full border rounded-lg px-3 py-2"
          />
          <datalist id="supplier-list">
            {(suppliers ?? []).map((s: { name: string }) => (
              <option key={s.name} value={s.name} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-sm mb-1" htmlFor="note">
            หมายเหตุ
          </label>
          <input
            id="note"
            name="note"
            placeholder="เช่น ขาดค่ารถ"
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700"
        >
          สร้างล็อต
        </button>
      </form>
    </div>
  );
}
