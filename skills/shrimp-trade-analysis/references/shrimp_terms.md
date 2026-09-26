# Shrimp Terms

Use these mappings for Nat's shrimp buy/sell notebook analysis.

## Labels

- `นิ่ม`: soft shrimp. Normalize as `soft`.
- `A` or `อา`: same as `นิ่ม` when used as a size/category line.
- `เสีย`: damaged/loss shrimp. Keep as `loss` unless the user says it corresponds to a size. If the kg is close to sold size 4, classify it as size `4` and keep `label: "เสีย"` for traceability.
- `กุ้งดี`: good shrimp, usually regular sellable shrimp.
- `ขายไป`: sold amount.
- `กุ้งเสีย`: damaged shrimp amount.
- `ค่า...`: cost/expense.

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
- `ค่าธรรมเนียม`: broker/buyer fees deducted from the gross sale. Sale-side adjustment lines (`หัก/บวกยอดขาย`) are usually fees unless the user states otherwise.

## Ask When Unsure

If a handwritten value affects size mapping or any total, ask the user before guessing. Show them what you read, the alternatives, and the dollar/kg impact.
