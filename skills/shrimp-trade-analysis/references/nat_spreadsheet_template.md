# Nat Shrimp Spreadsheet Template

Use this as the default workbook layout for Nat's shrimp notebook photos.

## Workbook Shape

- Create one worksheet named `สรุปทั้งหมด`.
- Put the most important information at the top, then less important raw/detail sections below.
- Use the truck plate or lot value directly as `ตู้` (for example `80-3867`, `70-5350`). Do not add `ลำดับ` or a separate sequence column unless requested.

## Top Layout

Rows 1-13:

1. Title merged across the visible table width: `{date} {farm}`.
2. Main totals table:
   - `รายการ`
   - `จำนวน`
   - `ซื้อ กก.`
   - `ขาย กก.`
   - `น้ำหนักเพิ่ม/ลด กก.`
   - `% เพิ่ม/ลด`
   - `ยอดขายรวม`
   - `หัก/บวกยอดขาย`
   - `ยอดขายสุทธิ`
   - `ต้นทุนซื้อ`
   - `ค่าใช้จ่าย`
   - `กำไร/ขาดทุน`

Rows 16 onward: size summary table:

| รายการ | ซื้อ กก. | ขาย กก. | น้ำหนักเพิ่ม/ลด กก. | % เพิ่ม/ลด | ต้นทุนซื้อ | ยอดขาย | กำไรขั้นต้น | หมายเหตุ |
|---|---:|---:|---:|---:|---:|---:|---:|---|

Rules:

- Group by `match_size` when present, otherwise `size`.
- Write the soft category as `นิ่ม` in every visible cell (size summary label, `ไซซ์เขียน`, `ไซซ์จับคู่`, รายการ). The JSON model can still use `soft` as the key; the spreadsheet SUMIFs should match the displayed `"นิ่ม"` label.
- Include `ปรับยอด/ไม่ระบุไซซ์` when total buy cost does not reconcile to size-level buy costs.
- Add a final `รวม` row.
- In `รวม`, sum numeric columns. For `% เพิ่ม/ลด`, calculate total `น้ำหนักเพิ่ม/ลด กก.` divided by total `ซื้อ กก.`.
- `กำไรขั้นต้น` is `ยอดขาย - ต้นทุนซื้อ`; it does not subtract expenses unless specifically requested.

After the size summary, add a written-total check table:

| ตรวจยอดเขียน | เขียนในสมุด | คำนวณในชีท | ส่วนต่าง |
|---|---:|---:|---:|

Include at least `ยอดขายสุทธิ`, `ต้นทุนซื้อ`, `ค่าใช้จ่าย`, and `กำไร/ขาดทุน`.

## Detail Sections

Place sections below the top summary in this order.

### รายละเอียดซื้อ

Headers:

| ตู้ | ไซซ์เขียน | ไซซ์จับคู่ | รายการ | ซื้อ กก. | ต้นทุน/กก. | ต้นทุนซื้อ | หมายเหตุ |
|---|---|---|---|---:|---:|---:|---|

### ต้นทุนซื้อตามสมุด

Headers:

| รายการ | กก. | ราคา | จำนวนเงินเขียน | คำนวณ | ส่วนต่าง | หมายเหตุ |
|---|---:|---:|---:|---:|---:|---|

### รายละเอียดขาย

Headers:

| ตู้ | ไซซ์เขียน | ไซซ์จับคู่ | รายการ | ขาย กก. | ราคา | จำนวนเงินเขียน | คำนวณ | ส่วนต่าง | หมายเหตุ |
|---|---|---|---|---:|---:|---:|---:|---:|---|

### รายการหัก/บวกยอดขาย (ค่าธรรมเนียม)

These rows are buyer/broker fees deducted from the gross sale. Each row's label should include `ค่าธรรมเนียม` and reference the truck plate + round.

Headers:

| รายการ | จำนวนเงิน |
|---|---:|

If a row is something other than a fee (a refund, a price correction, a written-amount fix), keep its specific label and document the type in a `หมายเหตุ` column or note.

### ค่าใช้จ่าย

Headers:

| รายการ | จำนวนเงิน |
|---|---:|

### หมายเหตุ

Headers:

| หัวข้อ | หมายเหตุ |
|---|---|

Use this section for uncertain handwriting, kg-similarity matches, and calculation mismatches.

## Styling

- Positive values: green fill `#D9EAD3`, dark green text `#27632A`.
- Zero values: yellow fill `#FFF2CC`, brown text `#7A5A00`.
- Negative values: red fill `#F4CCCC`, dark red text `#A61C00`.
- Growth rate:
  - `> 6%`: green.
  - `3%` to `6%`: yellow.
  - `< 3%`: red.
