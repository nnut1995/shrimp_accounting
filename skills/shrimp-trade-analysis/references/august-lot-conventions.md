# Nat's lot conventions — August 2569

## Evidence and scope

Read on 2026-09-26: all 19 lot detail pages linked from the production [August 2026 summary](https://shrimp-accounting.vercel.app/monthly?y=2026&m=8), including 104 purchase rows, 112 sale rows, adjustments, expenses and notes. These are saved ledger observations, not verification against original notebooks. Reconcile future entries to their own sources; August prices, rates and exceptions are not defaults for every farm or buyer.

The detail-page totals reconcile to the monthly view:

| Measure | August total |
|---|---:|
| Purchased kg | 99,566.13 |
| Sold kg | 105,094.75 |
| Weight difference | +5,528.62 kg / +5.55% |
| Sale lines before adjustments | ฿14,575,976.98 |
| Sales adjustments | +฿8,958.48 |
| App `netSales` | ฿14,584,935.46 |
| Cost adjustments, included in cost below | +฿66,847.03 |
| Purchase cost including adjustments | ฿13,355,330.44 |
| Lot expenses including sale fees | ฿1,064,224.82 |
| Sale fees, already included above | ฿193,155.82 |
| Lot profit | ฿165,380.20 |
| Separate monthly overhead | ฿51,124.00 |
| Monthly net profit | ฿114,256.20 |

## What a lot contains

- A purchase event identified by its lot ID, buy date, supplier/farm and source context. Repeated supplier names or dates do not make lots duplicates. Farm suffixes such as ฟาร์ม1 / ฟาร์ม2 matter.
- Multiple containers can belong to one lot. August uses container strings `1` and `2`; other sources use truck plates. Preserve either form. [23/8 พี่ลักษ์](https://shrimp-accounting.vercel.app/lots/39cac4c7-5919-4bf0-a890-5fc4725ccec7) has two containers and 13 sale rows. [6/8 เอเจ](https://shrimp-accounting.vercel.app/lots/573713d1-efbf-438a-bac8-d029d8569869) records container 2 as ฝากรถสุนทร.
- A lot can sell over multiple dates, to several buyers, at several prices. [31/8 ซีควีน ฟาร์ม10](https://shrimp-accounting.vercel.app/lots/abb6d8bf-2159-4e96-ba5c-39b9a2a72059) sells on 1/9 but stays in August's purchase-month report. Do not truncate its sales at month end.
- Keep `size_code` (เบอร์ / comparison group), `description` (รายการ / buyer's label or quality), `density` (ไซด์ / count or range), and `container` distinct. `0`, `1`, `2`, `3`, `10`, นิ่ม, เสีย, ผอม, ฝอย and ตัวอย่าง are observed groups. A range such as `83-85 ตัว` is not the grade number or a subtraction.

## Follow physical grouping, not label similarity alone

Read explicit source notes first, then lot/container, grade, density, buyer and date context; use kg similarity as supporting evidence. Match all relevant sale splits, not just the nearest single row. Preserve original labels and explain any analytical regrouping. Existing app totals group by exact `size_code` across the whole lot, not by description or container.

- [1/8 ตั้ม](https://shrimp-accounting.vercel.app/lots/d5caed90-f1d6-4ede-8bef-b805065cdb68): grade 1 buys 4,537.48 kg. Its sales are 178 kg to ตลาด plus TU's 4,579.52 kg good shrimp and 77.78 kg described as นิ่ม, all recorded under grade 1. Total grade-1 sales are 4,835.30 kg. Moving the TU soft split to the separately purchased นิ่ม group would change the intended comparison.
- [23/8 พี่ลักษ์](https://shrimp-accounting.vercel.app/lots/39cac4c7-5919-4bf0-a890-5fc4725ccec7): buyer description `00 แยกจาก0` remains grade 0; TU's 8.20 kg `นิ่ม / ตัดนิ่มวุ้น` remains grade 1. Buyer labels do not dictate purchase comparison groups.
- [3/8 ทรัพย์อนันต์ ฟาร์ม4](https://shrimp-accounting.vercel.app/lots/0cf0465d-45f7-428f-88cc-ed93965bdcc9): 17.59 kg of กุ้งดี / ตัวอย่าง at ฿175 joins the นิ่ม group, alongside 721.71 kg of separately priced soft shrimp at ฿122.50. Preserve both costs. A sample can instead remain a separate group, as on 17/8; do not always fold samples into นิ่ม.
- เสีย is not universally grade 4: August keeps an เสีย group while sale descriptions may be 3, 4 or 6. Keep the source group unless a supported comparison requires regrouping.

### Combined sales explain apparent loss or extreme growth

Report both the saved grade view and the supported combined comparison when they differ. Do not claim that a category with zero separate sales was discarded if a note says ขายรวม. Never invent how many kg of a combined sale belonged to each original grade.

| Lot | Evidence | Combined comparison |
|---|---|---|
| [9/8 พี่ลักษ์](https://shrimp-accounting.vercel.app/lots/253ff2ef-4e9a-432d-9ac2-7b3126de44a9) | นิ่ม purchase note ขายรวมเบอร์ 3; sale นิ่ม+4 / 200 ตัว+นิ่ม | 76.38 + 88.51 = 164.89 kg bought → 167 kg sold; +1.28%, instead of interpreting +118.64% for grade 3 and −100% for นิ่ม independently |
| [18/8 รงค์](https://shrimp-accounting.vercel.app/lots/9d8103df-9dd8-4bbd-99ee-0527c8e54af8) | ฝอย note ขายรวมผอม; sale ผอม+ฝอย | 8.84 + 17.96 = 26.80 kg → 28 kg; +4.48% |
| [24/8 พี่ลักษ์](https://shrimp-accounting.vercel.app/lots/6e8b388b-7404-4398-b028-36a0dfc5120c) | Sale description 3+4 / 150 ตัว+เสีย | 14.65 + 14.33 = 28.98 kg → 30.20 kg; +4.21% |

For calculator JSON, multiple original buy rows can share the supported `match_size` of the combined sale. Keep `size` and row notes intact. Run per lot first: the calculator groups by `match_size`/`size` and does not isolate by the `lot` field. This analytical mapping is not permission to rewrite saved accounting rows.

## Purchase pricing and settlement

- Good shrimp in several numbered grades often share one farm purchase price while sale prices differ sharply. A negative margin on grade 2 or 3 does not by itself indicate a wrong purchase price.
- Soft shrimp may be separately priced or included at the good-shrimp price. Examples: 70% of good price (132 → 92.40 on 5/8), 75% (146 → 109.50 on 23/8), and full good price (137 on 8/8). Discounted เสีย/ผอม prices also vary. Read the actual settlement; never impose one percentage.
- Whole-good-shrimp soft deductions are monetary cost adjustments, not a second subtraction of physical kg. [8/8 รงค์](https://shrimp-accounting.vercel.app/lots/f62bdbef-2992-4f15-a0cf-188dc5986e23) records นิ่ม at ฿137 and a −฿4,970.36 adjustment based on 3,628.28 kg × 1% × ฿137. Preserve the written settled amount and flag any rounding difference rather than silently replacing it.
- When already counted shrimp are repriced, adjust the price difference without adding their weight again. [4/8 กัญญา](https://shrimp-accounting.vercel.app/lots/209894cb-e1f4-43b1-be63-36391d9e48bc): 50 kg × (60 − 136) = −฿3,800; [21/8 โกจี๊ด](https://shrimp-accounting.vercel.app/lots/12495657-fc15-4b53-b7b7-0811073847e7): 20 × (60 − 141) = −฿1,620; [30/8 กัญญา](https://shrimp-accounting.vercel.app/lots/79cb2dd8-01f5-4099-a138-a59c1ddf6374): 60 × (60 − 148) = −฿5,280.
- `ค่าตรวจสาร` commonly appears as +฿6,000 **cost adjustment** in this ledger. Do not also add it as an expense. [2/8 พี่ลักษ์](https://shrimp-accounting.vercel.app/lots/96826522-0794-497e-8e74-573eca1e42ef) separately records +฿6,000 **sales adjustment** for คืนค่าตรวจสาร. A refund is not assumed whenever a test charge exists.
- [17/8 ทรัพย์อนันต์ ฟาร์ม3](https://shrimp-accounting.vercel.app/lots/3caa4bdc-4eb1-4197-9522-987d44851cbe) has +฿2,958.48 on both cost and sales for a mixed-size farm-manager purchase. Both sides affect turnover/cost but cancel in profit; no kg are supplied by the adjustments. Do not invent size allocation or physical rows.
- [6/8 เอเจ](https://shrimp-accounting.vercel.app/lots/573713d1-efbf-438a-bac8-d029d8569869) records −฿10,000 ช่วยค่าใช้จ่าย as a cost reduction. Preserve the recorded economic treatment and do not duplicate it as negative expenses.

## Fees, expenses and profit

Observed sale-fee amounts correspond to several rates: 1.2% on many rows, 1.5% on TU and some market rows, and 2% on the two ชิงฟู่ lots. These are observed arithmetic relationships, not verified universal buyer contracts. Read each row/source; do not apply the bulk 1.2% control to an existing lot or infer all future fees by buyer name. Round percentage fees per row to two decimals before summing. Explicit baht fees override percentages.

`ค่านายหน้า` is separate from sale `ค่าธรรมเนียม`. Many August brokerage notes reference purchase kg × ฿0.75, with settled whole-baht amounts; do not replace the saved amount from a rough rounded note. Some lots explicitly have no brokerage or no supervision fee. Blank expense cells are not proof that a standard amount is owed, and `✅` is an existing note, not independent verification.

Preserve category details (e.g. คุมจับ จิรา versus คุมจับ ละมุน) and notes (e.g. รถ 12 ล้อ under รถ 10 ล้อ). Keep lot costs separate from monthly overhead: August's ฿51,124 covers car rental, salaries, telephone, oil change and additional travel/fuel. Same-named fuel categories can exist at both levels for different costs.

The app's formulas in `src/lib/calc.ts` / `src/lib/summary.ts` are:

- `costTotal` = sum of purchase kg × price, rounded per grade, + cost adjustments.
- `salesTotal` = sum of sale kg × price, rounded per grade; `netSales` = salesTotal + sales adjustments. Despite the label ยอดขายสุทธิ, this is **before sale fees**.
- `expenseTotal` = manual lot expenses + per-sale fees; `profit` = netSales − costTotal − expenseTotal.
- Monthly net profit = sum of lot profits selected by **buy date** − that month's standalone expenses.
- Headline growth = (all sold kg − all bought kg) / all bought kg, including grades with no separate sale. Monthly growth is a ratio of summed kg, not an average of lot percentages. Zero buy weight means an undefined percentage.
- Grade gross margin excludes lot adjustments and expenses. Average prices are amount / kg, not an unweighted mean of row prices.
- Buyer comparison shows sale-line revenue, excluding unallocated sales adjustments. August's ฿8,958.48 gap from `netSales` is exactly the sales adjustments. Buyer growth is allocated within sold grades by sale-weight share and can differ from headline growth when bought grades have no sale rows (August: 5.68% versus 5.55%).

## Unresolved evidence: preserve and flag

- [18/8 รงค์](https://shrimp-accounting.vercel.app/lots/9d8103df-9dd8-4bbd-99ee-0527c8e54af8): `ค่าสารผ่าน` amount is ฿26,970.04, but the note says 2,697.04 kg × (+฿1/kg), which is ฿2,697.04. Difference: ฿24,273.00. The existing amount is roughly a ฿10/kg charge; whether the amount, rate, or basis is wrong needs source confirmation. Do not teach either rate as a rule or alter the ledger from this review.
- [29/8 วิชัย](https://shrimp-accounting.vercel.app/lots/ec2d311a-298a-4da6-9976-afb2f62f48c5): นิ่ม buys 14.90 kg and sells 101.77 kg (+583.02%). TU's 85.77 kg soft row may be a quality split from good shrimp, but the reviewed page does not explicitly establish that mapping. Flag possible regrading; do not assert physical growth or silently move the row.
- Small settlement-note differences also remain: 6/8 เอเจ records +฿21.11 for a note whose displayed kg difference × ฿132 is ฿21.12; its expense note references 6,428.39 kg while purchase rows total 6,428.23 kg. Monetary adjustments do not change the app's kg totals.

## Calculator and API boundaries

The standalone `scripts/shrimp_calc.py` is an analysis helper, not an exact implementation of the app. It rounds row amounts, reads total purchase cost only from `buy_costs`, does not auto-calculate sale fees, and does not consume API `adjustments`. Populate `buy_costs` with the complete nonduplicated purchase settlement (including signed cost adjustments), and include fees once in `expenses` or signed sale adjustments according to the chosen report convention. Explain any net-sale convention difference. Use app API preview for app-exact rounding and totals.

August detail pages display the stored soft code `นิ่ม`; the schema also seeds `นิ่ม/A`. The API accepts free-text codes and does not merge aliases. Inspect the intended ledger/source code; use the same comparison code on corresponding buy/sell rows and preserve intentional split groups. `soft` is the standalone analysis key, not an app code. Do not bulk-rename existing codes during analysis.
