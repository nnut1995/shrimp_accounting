@AGENTS.md

# Shrimp accounting domain

Use [shrimp-trade-analysis](skills/shrimp-trade-analysis/SKILL.md) for notebook interpretation, lot analysis and authorized account entry. Read [August lot conventions](skills/shrimp-trade-analysis/references/august-lot-conventions.md) for evidence and worked examples from all 19 August 2569 lots, reviewed on 2026-09-26. These observations are not fixed prices or universal buyer/farm rules.

- A lot is a purchase event, not one truck or one sale. Preserve supplier/farm, buy date, containers, individual buyers and sale dates. Monthly/yearly lot reports select by **buy date** and include every sale of those lots, even next-month sales (31/8 purchase → 1/9 sales).
- Keep `size_code` (comparison grade), `description` (written sale/quality label), `density` (count/range) and `container` separate. Free-text grades include 0, 10, นิ่ม, เสีย, ผอม, ฝอย and ตัวอย่าง. The same grade can span multiple prices, buyers, dates and containers.
- Explicit ขายรวม / แยกจาก notes outrank nearest-weight guesses. A sale described as นิ่ม can remain in its originating grade; several purchased grades can sell together. Preserve stored rows and distinguish their exact-code summary from a documented combined comparison. Zero separate sales does not automatically mean waste, and extreme grade growth may be regrading.
- Good grades may share one purchase price. นิ่ม can have a separate price or be included in กุ้งดี with a whole-group discount. Use source terms, not a fixed 70%/75% rule. Repricing already-counted kg belongs in a signed cost adjustment, without duplicate kg.
- `calcLot` in `src/lib/calc.ts` is the source for app totals: `netSales` includes sales adjustments but is **before fees**; `expenseTotal` includes manual expenses plus sale fees; profit = netSales − costTotal − expenseTotal. Fees round per sale row; explicit fee amounts override percentages. August contains amounts consistent with 1.2%, 1.5% and 2%; the app's 1.2% default is not every transaction's rate.
- Keep cost adjustments, sales adjustments, lot expenses and monthly overhead separate. Testing charges commonly appear as cost adjustments; reimbursements as sales adjustments. Brokerage (`ค่านายหน้า`) is distinct from sale fees (`ค่าธรรมเนียม`). Deduct each amount once and retain note formulas and named-person expense categories.
- Headline growth uses all buy/sell kg, including grades without separate sales. Aggregate percentages use summed kg, not averages of percentages. Grade gross profit excludes lot-level adjustments/expenses. Buyer revenue excludes unallocated sales adjustments; buyer growth covers sold grades and can differ from headline growth. See `src/lib/summary.ts` and the monthly page for rollup behavior.
- Preserve unresolved source inconsistencies rather than silently correcting them. Example: 18/8 รงค์'s ฿26,970.04 adjustment conflicts with its 2,697.04 kg × ฿1 note (฿24,273 difference). August figures in the reference reflect the saved amount, not an endorsed correction.

## Working with the ledger

Read [the API contract](docs/accounting-api.md) before account entry. Analysis/documentation requests do not authorize changes to saved transactions. Use authenticated read endpoints when available; otherwise a signed-in UI can supply read-only evidence. Never put credentials in docs or payloads. For authorized entry, preview/reconcile first, preserve one idempotency key and verify the saved result. API v1 updates existing lots through PUT with the snapshot version and a new idempotency key for each confirmed edit; preserve unchanged rows and never create duplicates as an editing workaround.

The analysis calculator JSON and app API JSON differ. The helper does not automatically calculate fees or infer total purchase cost from `buy_rows`; see the skill's August reference for conversion limitations. The API accepts exact free-text `size_code` values: August uses `นิ่ม`, while schema seed `นิ่ม/A` also exists. Preserve the intended code and do not split a comparison across aliases accidentally.

Maintain the repository skill in `skills/shrimp-trade-analysis/` and synchronize intentional guidance changes with the installed copy in `~/.codex/skills/shrimp-trade-analysis/`. Keep detailed lot examples in the linked reference. Documentation-only learning must not change app code, accounts, or deployments.
