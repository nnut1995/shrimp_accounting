# Shrimp Terms

Use these mappings for Nat's shrimp buy/sell notebook analysis.

## Labels

- `นิ่ม`: soft shrimp. Normalize a standalone analysis category as `soft`; a soft-quality split from another grade can retain that grade's comparison group.
- `A` or `อา`: same as `นิ่ม` when used as a size/category line.
- `เสีย`: damaged shrimp; preserve `เสีย` as its category unless evidence supports a different comparison group. It can still be sold, separately or combined. Do not automatically map it to grade 4 from kg similarity alone.
- `กุ้งดี`: good shrimp, usually regular sellable shrimp.
- `ขายไป`: sold amount.
- `กุ้งเสีย`: damaged shrimp amount.
- `ค่า...`: cost/expense.
- `เบอร์`: comparison grade (`size_code` in the app), distinct from buyer descriptions and density/count ranges in `ไซด์`.
- `ขายรวม`: sold together; compare the supported combined buy weights with the combined sale without inventing a per-grade split.
- `แยกจาก`: split from a source grade; preserve the relationship even if the buyer's label differs.
- `ตัวอย่าง`: sample; can be separate or included in another group's sale, depending on source notes.
- `ตู้`: source container identifier, including ordinal strings `1` / `2` or truck plates; multiple containers may belong to one lot.

## Weight Growth

Calculate weight growth as:

```text
growth kg = sell kg - buy kg
growth % = growth kg / buy kg * 100
```

If buy kg is zero and sell kg is positive, show percent as `n/a` and flag it as a classification issue to recheck.

## Arithmetic Checks

- Line amount: `kg * price`.
- Net sale section: gross line amounts plus additions minus deductions.
- Profit: `net sale total - buy cost total - expenses`.
- Preserve crossed-out values in notes, but do not include them in final totals unless the user says they are active.

## Display Rules

- `soft` is the internal key in the JSON data model. Display it as `นิ่ม` in any human-visible spreadsheet cell, summary row, or report.
- `ค่าธรรมเนียม`: sale fee. The app counts per-sale fees in expenses while `netSales` remains before fees. A workbook can show fees as sale deductions, but never deduct them twice. Sale adjustments can also be reimbursements or other changes; use the actual note.
- `ค่านายหน้า`: brokerage, separate from sale fees; some August lots reference purchase kg × ฿0.75, while others explicitly have no brokerage. Do not invent missing charges.

Read [August lot conventions](august-lot-conventions.md) for supported grouping examples, variable pricing/fees and unresolved source discrepancies.

## Ask When Unsure

If a handwritten value affects size mapping or any total, ask the user before guessing. Show them what you read, the alternatives, and the dollar/kg impact.
