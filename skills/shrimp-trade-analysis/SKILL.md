---
name: shrimp-trade-analysis
description: Analyze shrimp trading notebook photos, handwritten buy/sell sheets, or transcribed shrimp purchase and sale data. Use whenever the user shares a shrimp buy/sell notebook, mentions กุ้ง / นิ่ม / เสีย / กุ้งดี / ตู้, asks to check shrimp weight growth and profit by size, match unclear sizes by weight similarity, treat Thai labels such as A/อา as นิ่ม and เสีย as size 4 when appropriate, verify arithmetic, calculate sale totals, expenses, settlement cost, and profit, or explain suspicious shrimp buy/sell calculations. Also use when producing Nat's one-sheet Thai shrimp summary workbook or recording shrimp accounting lots through the project's API.
---

# Shrimp Trade Analysis

## Overview

Analyze shrimp buy/sell notes by turning handwritten entries into normalized rows, recomputing every subtotal, and reporting weight growth by size. Prioritize traceability: show what was read, what was inferred, and which numbers need human recheck.

## Ask When Unsure

If handwriting, a label, a date, a farm name, a price, or how to group a row is genuinely unclear and the choice would change the size summary or any total, pause and ask the user with AskUserQuestion before guessing. Phrase the question with: what you read, the alternatives you considered, and the impact on the numbers (for example, "I read this as 719.5 kg, but it could be 819.5 kg — the second one adds 15,700 to gross sale. Which is right?"). Small read uncertainties that do not change totals can still be flagged in `หมายเหตุ` instead of asking.

## Workflow

1. Inspect the source image or transcript in sections: buy side, sell side, settlement/cost side, and final totals.
2. Transcribe into structured rows before calculating. Keep uncertain values marked with `?` and do not hide ambiguity.
3. Normalize labels:
   - `A`, `อา`, `นิ่ม`, and similar soft-shrimp labels mean `soft` in the JSON data model.
   - **Display rule**: in any visible spreadsheet cell, written label, or summary row, write the soft category as `นิ่ม` (not `soft`). Keep `soft` only as the internal `size`/`match_size` key in the JSON data passed to the calculator script.
   - `เสีย` usually means damaged/loss, but if the user says it matches a sale size, classify it as that size. In Nat's shrimp sheets, `เสีย` can be size `4` when its kg is close to sold size 4 kg.
   - Ranges such as `28-28.5` or `39-40` are size labels, not arithmetic.
4. When a buy size and sell size do not match by label, compare kg similarity before leaving it unmatched:
   - Preserve the written label in `size`, and put the inferred comparison group in `match_size`.
   - Prefer same lot/date/context first; then match the closest remaining buy/sell kg if the difference is plausible.
   - Record the kg difference and percent difference in `notes`.
   - If no close kg match exists, keep the original normalized size and flag it as unmatched or suspicious.
5. Recompute line totals, section totals, gross sales, deductions, expenses, net sale, buy cost, and profit.
6. Compare buy kg vs sell kg by `match_size` when present, otherwise by `size`, and report growth in kg and percent.
7. Report cost of buying each size and sale amount of each size. If total buy cost includes adjustments or handwritten balancing that cannot be assigned to a size, show it as `ปรับยอด/ไม่ระบุไซซ์`.
8. Flag calculation mismatches, crossed-out numbers, inferred values, unmatched rows, and implausible growth.
9. For Nat's sheets, if `นิ่ม`/`A` appears as a weight category but there is no separate buy-cost line for soft shrimp, treat it as included in `กุ้งดี` for buy-cost and discount purposes. Keep `นิ่ม`/`A` visible as its own weight-growth row, but do not make it costless; record the whole-`กุ้งดี` discount or balancing under `ปรับยอด/ไม่ระบุไซซ์`.

## Direct Accounting API

When the user asks to record shrimp transactions in the accounting app, prefer its authenticated JSON API over UI automation. Read [references/accounting-api.md](references/accounting-api.md) first. Analysis alone is not a request to persist transactions. An explicit request to enter the accounts authorizes the corresponding write; do not ask again unless material source data is unclear.

## Data Model

Use this JSON shape when running the calculator script:

```json
{
  "buy_rows": [
    {"lot": "x2-3/253", "size": "1", "match_size": "1", "kg": 6610.88, "buy_price": 195},
    {"lot": "x2-3/253", "size": "soft", "match_size": "3", "kg": 446.75, "buy_price": 98, "notes": "Matched to sold size 3 by closest kg."},
    {"lot": "x1-3/115", "size": "เสีย", "match_size": "4", "kg": 18.67, "label": "เสีย", "buy_price": 78}
  ],
  "sell_rows": [
    {"lot": "x2-3/253", "size": "1", "match_size": "1", "kg": 5406.2, "price": 200, "amount": 1081240},
    {"lot": "x2-3/253", "size": "3", "match_size": "3", "kg": 473.54, "price": 156, "amount": 73873}
  ],
  "buy_costs": [
    {"label": "กุ้งดี", "kg": 10965.35, "price": 195, "amount": 2138243},
    {"label": "เสีย", "kg": 18.67, "price": 78, "amount": 1456.26}
  ],
  "sell_adjustments": [
    {"label": "deduction", "amount": -21625}
  ],
  "expenses": [
    {"label": "ห้องเย็น", "amount": 22000}
  ],
  "written_totals": {
    "net_sale": 2310080,
    "buy_cost": 2145699,
    "expenses": 89050
  }
}
```

Fields:

- `size` should preserve the normalized written label: `"1"`, `"2"`, `"3"`, `"4"`, `"soft"`, or another literal size when needed.
- `match_size` is optional. Use it when the row should be grouped under a different size for growth/cost comparison because the kg is a closer match than the written label. Never silently overwrite `size`.
- `buy_price` on `buy_rows` is optional but preferred for per-size buy-cost summaries.
- `amount` is optional. If present with `kg` and `price`, check it against `kg * price`.
- `sell_adjustments` should contain sale deductions as negative amounts and additions as positive amounts.
- `expenses` are non-shrimp costs subtracted from profit.
- `written_totals` is optional. Use it to compare exact recomputation against rounded or handwritten summary totals.
- Use `notes` on any row for crossed-out values or low confidence handwriting.

## Calculator

Use `scripts/shrimp_calc.py` after transcription:

```bash
python3 /path/to/shrimp-trade-analysis/scripts/shrimp_calc.py data.json
```

The script prints:

- per-size buy kg, sell kg, growth kg, and growth percent
- per-size buy cost and sale amount when buy/sell rows contain enough price or amount detail
- buy line amount checks
- sell line amount checks
- total buy weight, total sell weight, gross sale, sale adjustments, expenses, net result, and profit when enough data is present

## Reporting

Keep the final answer compact and practical:

- Start with the growth table by matched size (`match_size` when present, otherwise `size`).
- Then list total buy weight, total sell weight, total growth, sale total, cost total, expenses, and profit.
- End with mismatches and values to recheck.
- Use Thai labels where helpful, especially `นิ่ม` and `เสีย`.
- If handwriting is uncertain, say "I read this as..." and show the effect on totals.

## Spreadsheet Formatting

When creating or editing Nat's shrimp summary workbook, keep the Thai worksheet format simple and apply these color rules:

- Use the canonical one-sheet upload template in `references/nat_spreadsheet_template.md` for Nat's workbooks.
- Adjustment lines in the `รายการหัก/บวกยอดขาย` section are typically `ค่าธรรมเนียม` (broker/buyer fees) deducted from the gross sale. Label each row to include `ค่าธรรมเนียม` (for example `(ดี) 82-3253 ค่าธรรมเนียม รอบ 15/5/69 ล็อตใหญ่`) and rename the section header to `รายการหัก/บวกยอดขาย (ค่าธรรมเนียม)`. If a row is clearly something other than a fee (a refund, a price correction, or a written-amount adjustment), keep its specific label and note the type in `หมายเหตุ`.
- Display `soft` as `นิ่ม` everywhere visible: detail rows, size summary labels, headers, and notes. The JSON `size`/`match_size` keys remain `soft` internally; the SUMIF in the size summary should match against the displayed label `"นิ่ม"`.
- Name output files using date plus farm name. If the notebook date/farm is `14/5/69 ระอองฟาร์ม`, save as `14-5-69 ระอองฟาร์ม.xlsx` because `/` cannot be used in normal file names.
- Also save the final `.xlsx` under the user's Desktop by date folder: `~/Desktop/shrimp_summary/DD-MM-YY/`. Use leading zeros in the folder date, e.g. `14/5/69` -> `~/Desktop/shrimp_summary/14-05-69/14-5-69 ระอองฟาร์ม.xlsx`.
- Use Thai headers where possible: `รายการ`, `ซื้อ กก.`, `ขาย กก.`, `น้ำหนักเพิ่ม/ลด กก.`, `% เพิ่ม/ลด`, `จำนวนเงิน`, `หมายเหตุ`.
- Build as a single worksheet named `สรุปทั้งหมด` unless the user explicitly asks for multiple tabs. Put the important summary at the top and raw/detail sections lower down for easy upload to other sheet apps.
- Preserve both written size and inferred matched size in detail sheets with headers such as `ไซซ์เขียน` and `ไซซ์จับคู่`.
- In the summary by size, include `ต้นทุนซื้อ`, `ยอดขาย`, and `กำไรขั้นต้น` beside weight growth, and add a `รวม` row that sums each numeric column. For `% เพิ่ม/ลด`, calculate total growth divided by total buy kg.
- If a row is matched by kg similarity rather than by label, write the reasoning in `หมายเหตุ`; for example `นิ่ม 281.39 kg matched to sold size 3 306.60 kg (+25.21 kg, +8.96%)`.
- Put notes directly in the relevant row's `หมายเหตุ` column whenever possible. Avoid creating a bottom `หมายเหตุ` section unless the user explicitly asks for a separate notes block or the note applies to the whole workbook.
- If `นิ่ม`/`A` is included in `กุ้งดี` rather than priced separately, write that in the row-level `หมายเหตุ` column and include its buy cost with the `กุ้งดี` price/discount logic.
- If size-level buy cost does not reconcile to the written total because of handwritten adjustments or balancing lines, add `ปรับยอด/ไม่ระบุไซซ์` instead of hiding the difference.
- Treat truck plate / lot identifiers such as `80-3867` or `70-5350` as `ตู้`. Do not add a separate sequence or `ลำดับ` column unless the user asks for it.
- Profit/loss and weight gain/loss:
  - Positive numbers: green fill `#D9EAD3`, dark green text `#27632A`.
  - Zero: yellow fill `#FFF2CC`, brown text `#7A5A00`.
  - Negative numbers: red fill `#F4CCCC`, dark red text `#A61C00`.
- Growth rate `% เพิ่ม/ลด`:
  - More than `6%`: green.
  - `3%` to `6%`: yellow.
  - Less than `3%`: red.
- Apply the growth-rate rule to percentage values as decimals in Excel, e.g. `0.06` for `6%`.
- Prefer conditional formatting for formula-driven profit/loss, weight gain/loss, amount differences, and growth-rate cells so the colors update correctly after the workbook recalculates.

## Reference

For a Thai shrimp vocabulary cheat sheet and reporting conventions, read `references/shrimp_terms.md` when labels are unclear.
For Nat's workbook layout, read `references/nat_spreadsheet_template.md` before building the `.xlsx`.
