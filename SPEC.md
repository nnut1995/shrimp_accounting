# Shrimp Accounting — ระบบบัญชีซื้อ-ขายกุ้ง

Replaces the Google Sheets workflow. Decisions below were agreed in the design interview on 2026-06-12.

## Users & Access
- 2–5 trusted users (owner + family/partner), all with identical full permissions.
- Email + password login via Supabase Auth. No roles/permissions system.
- Sign-ups disabled publicly; accounts created by invite only.

## Hosting & Stack
- **Frontend/app:** Next.js (App Router, TypeScript), deployed on Vercel free tier.
- **Database + auth:** Supabase free tier (Postgres + Supabase Auth).
- Fully responsive: data entry must work equally well on phone and desktop
  (numeric keypads for weights/prices, spreadsheet-like tables on desktop).
- **Language:** Thai UI throughout. Dates displayed in Buddhist Era (พ.ศ.), e.g. 15/5/69.
  Stored internally as ISO dates (CE).

## Domain Model

### Lot (ล็อต)
- One lot = **one purchase event**: one supplier, one buy date. May include multiple ตู้ (containers).
- Sales of a lot can span **multiple days** (each sell line has its own date and ตู้).
- A lot belongs to the **month of its buy date** for all monthly reporting,
  even if sales spill into the next month.
- Fields: buy date (BE display), supplier, free-text note (e.g. "ขาดค่ารถ"). No status workflow.

### Sizes (เบอร์)
- Global fixed list: `0, 1, 2, 3, 4, นิ่ม/A, ฝอย, ผอม, เสีย, ตัวอย่าง`.
- A lot's per-size table shows **only sizes with activity** in that lot.

### Buy lines (รายละเอียดซื้อ)
- Fields: ตู้ (free text), size, description (e.g. "No.0"), **ตัว/กก.** (dedicated optional
  field, supports range like "87-88"), ซื้อ กก., ต้นทุน/กก. → ต้นทุนซื้อ (computed), note.

### Sell lines (รายละเอียดขาย)
- Fields: sell date, ตู้ (free text), size, description (e.g. "(ดี)"), **ตัว/กก.** (optional),
  ขาย กก., ราคา/กก. → ยอดขาย (computed).

### Adjustments (ปรับยอด)
- Money-only entries: amount (฿, can be negative) + note. No kg.
  Included in lot sales total / profit, shown as ปรับยอด/ไม่ระบุเบอร์ row.

### Expenses (ค่าใช้จ่าย)
- Per-lot line items: category + amount + optional note (e.g. "5,323 กก").
- **Preset category list + custom:** dropdown of usual categories
  (ค่าธรรมเนียม, ค่ารถ, ค่าตอง, ค่าซีล, ซื้อน้ำแข็งเพิ่ม, ค่าทำมือ/ผัด, …) with ability to
  type a new one; new ones become available next time. Keeps names consistent for
  monthly expense breakdown.

### Suppliers
- Reusable supplier list (autocomplete + add-new on the fly), like expense categories.

## Calculation Rules (verified against sheet)

Per size *s* within a lot:
- น้ำหนักเพิ่ม/ลด = ขาย กก. − ซื้อ กก.
- % เพิ่ม/ลด = น้ำหนักเพิ่ม/ลด ÷ ซื้อ กก.
- กำไรขั้นต้น = ยอดขาย − ต้นทุนซื้อ

Lot headline summary:
- ซื้อ กก. = Σ all buy kg (all sizes)
- ขาย กก. = Σ all sell kg (the sheet's stray "219.00" was an error — ignore)
- **Headline น้ำหนักเพิ่ม/ลด and % are all-in**: Σ all sell kg − Σ all buy kg
  (every size, including bought-but-unsold grades like ฝอย/ผอม), % over Σ all buy kg.
  Matches the per-size table's รวม row.
  (Changed 2026-06-12; previously the headline excluded unsold grades.)
- ยอดขายสุทธิ = Σ sell ยอดขาย + Σ adjustments
- ต้นทุนซื้อ = Σ buy cost (all sizes incl. ฝอย/ผอม)
- ค่าใช้จ่าย = Σ expense lines
- กำไร/ขาดทุน = ยอดขายสุทธิ − ต้นทุนซื้อ − ค่าใช้จ่าย

All money math in the DB uses exact decimal types (no floating point).

## Pages

1. **Login**
2. **Lot list** — recent lots with key figures, filter by month/supplier.
3. **Lot detail** — replicates the sheet layout:
   headline summary → per-size table (active sizes + ปรับยอด + รวม) →
   รายละเอียดซื้อ → รายละเอียดขาย → ค่าใช้จ่าย. Inline entry/edit.
4. **Monthly summary** — for a chosen month (พ.ศ.):
   - lot table (date, supplier, buy/sell kg, profit) + month totals row
   - standalone monthly expenses: add/delete inline, total shown in headline cards
     together with net profit (lot profit − monthly expenses)
   - expense breakdown by category (lot expenses)
   - per-supplier comparison (profit, weight gain/loss %)
   - charts: profit per lot, monthly net profit trend across the year
5. Lot detail and monthly summary have **print-friendly layouts** (print/PDF via browser).

## Out of Scope (agreed)
- No historical import — start fresh; Google Sheets kept as read-only archive.
- No roles/permissions, no lot status workflow, no Excel/CSV export (for now).
