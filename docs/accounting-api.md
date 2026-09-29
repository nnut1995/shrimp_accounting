# Accounting API v1 — AI ลงบัญชีโดยตรง

สถานะ: รัน migration บน Supabase โปรเจกต์ `blfvcioyhtxfhvpcvoyt` (`shrimp_accounting`) แล้วเมื่อ 2026-09-25 ผ่าน SQL Editor. ฐานอื่นยังต้องรัน migration ด้านล่างก่อนใช้งาน. Production base URL: `https://shrimp-accounting.vercel.app`. การ push เข้า `main` จะเริ่ม production deployment ผ่าน Vercel Git integration; ตรวจสถานะ READY ก่อนใช้งานรุ่นใหม่.

## Setup และสิทธิ์

1. ใช้ฐานข้อมูลตาม `supabase/schema.sql` (ฐานข้อมูลเดิมต้องมี buyer, fee_pct, fee_amount และ adjustment.kind ตาม schema ด้วย)
2. รัน `supabase/migrations/202609250001_accounting_api.sql` หนึ่งครั้งใน Supabase SQL Editor หรือ migration tooling ของผู้ดูแล
3. ตั้ง `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ตามแอปเดิม แล้ว build/deploy รุ่นนี้
4. ส่ง `Authorization: Bearer <Supabase user access_token>` ทุก endpoint ไม่มี cookie fallback ไม่มี API key พิเศษ ไม่ใช้ service-role key

AI ใช้ access token ของบัญชีที่ได้รับอนุญาตเท่านั้น ขอ session ผ่าน Supabase Auth ด้วยบัญชีเดิมได้โดยไม่ใช้ UI (`supabase.auth.signInWithPassword({email,password})`; เมื่อหมดอายุใช้ refresh token ผ่าน `refreshSession`). เก็บ credentials/token ใน secret store หรือ environment อย่าเขียนลง spec, payload หรือ log. ไม่สร้างบัญชีเพิ่มเพื่อ API.

RLS เหมือนเว็บ: ผู้ใช้ authenticated ทุกคนเข้าถึง **บัญชีส่วนกลางร่วมกัน** ไม่ใช่แยกล็อตรายผู้ใช้ ส่วนใบรับการส่งซ้ำแยกตาม user ID. Proxy ไม่ redirect `/api/v1/*` ไปหน้า login; route ตรวจ token และตอบ JSON. Response ใช้ `Cache-Control: no-store`.

## Endpoints

| Method | Path | ผลลัพธ์ |
|---|---|---|
| GET | `/api/v1/lots?from=2026-05-01&to=2026-05-31&limit=50&offset=0` | ค้นล็อตตามวันที่ซื้อ รวมชื่อผู้ขาย พร้อม `pagination: {limit,offset,total}` |
| GET | `/api/v1/lots/{uuid}` | `{data:{lot,summary}}` รวมรายการลูกทั้งหมดและยอดคำนวณ |
| GET | `/api/v1/lots/{uuid}?edit=1` | `{data:{payload,version}}` ข้อมูลล่าสุดที่พร้อมแก้ไข พร้อม version จาก snapshot เดียวกัน |
| PUT | `/api/v1/lots/{uuid}` | แทนที่ข้อมูลล็อตเดิมทั้งหมด โดยคง lot ID เดิม |
| POST | `/api/v1/lots/preview` | `{data:{normalized,summary},persisted:false}` ตรวจและคำนวณ ไม่เขียนฐานข้อมูล |
| POST | `/api/v1/lots` | สร้างล็อตพร้อมซื้อ ขาย ค่าใช้จ่าย ปรับยอด ใน transaction เดียว |

GET list ใช้ from/to แบบ inclusive (ไม่บังคับ), limit 1–100 default 50, offset 0–1,000,000 default 0; เรียงวันที่ซื้อล่าสุดแล้ว id. รายการ list เป็นข้อมูลหัวล็อต; ใช้ GET detail เพื่ออ่านยอดและแถวทั้งหมด.

v1 รองรับสร้าง อ่าน และแก้ไขล็อตเดิม (หลังรัน migration `202609270001_accounting_lot_updates.sql`). ไม่รองรับลบล็อต ค่าใช้จ่ายรายเดือน หรือ calculator sheets. ห้ามสร้างล็อตใหม่แทนการแก้ล็อตเดิม.

## Request body (preview และ create ใช้เหมือนกัน)

`Content-Type: application/json`, ไม่เกิน 1 MiB. ไม่รับ field ที่ไม่รู้จัก. แต่ละ array ไม่เกิน 500 แถว; ไม่ส่ง array หมายถึง `[]`. สร้างหัวล็อตเปล่าได้เหมือนเว็บ.

```json
{
  "buy_date": "2026-05-14",
  "supplier": "ระอองฟาร์ม",
  "note": "อ้างอิงสมุด 14/5/69 หน้า 1",
  "buy_lines": [
    {"container":"80-3867","size_code":"1","description":"กุ้งดี","density":"87-88","weight_kg":100,"cost_per_kg":150,"note":""}
  ],
  "sell_lines": [
    {"sell_date":"2026-05-15","container":"80-3867","size_code":"1","description":"กุ้งดี","density":"","weight_kg":105,"price_per_kg":200,"buyer":"ผู้ซื้อ ก","fee_pct":1.2}
  ],
  "expenses": [{"category":"ค่ารถ","amount":500,"note":""}],
  "adjustments": [{"kind":"cost","amount":-100,"note":"ส่วนลดซื้อ"},{"kind":"sales","amount":-50,"note":"ปรับยอดขาย"}]
}
```

- ต้องมี buy_date และ supplier (ชื่อไม่ว่าง). วันใช้ ค.ศ. `YYYY-MM-DD` ที่มีอยู่จริง ระหว่าง 1900–2100; 14/5/69 หมายถึง 2026-05-14 เมื่อบริบทเป็น พ.ศ. 2569
- Text ต้องเป็น string ไม่เกิน 2,000 ตัวอักษร ตัดช่องว่างหัวท้าย; text ไม่บังคับ default `""`; ไม่รับ null สำหรับ text
- buy_lines: บังคับ size_code, weight_kg, cost_per_kg
- sell_lines: บังคับ size_code, sell_date, weight_kg, price_per_kg; buyer เป็นข้อความไม่บังคับ
- น้ำหนัก/ราคาต้องเป็น JSON number ไม่ติด comma ไม่ติดหน่วย ไม่ติดลบ ไม่เกิน 9,999,999,999.99 และทศนิยมไม่เกิน 2 ตำแหน่ง
- ค่าธรรมเนียมขาย: เลือก fee_pct (0–100, ทศนิยม ≤4) หรือ fee_amount (บาท ทศนิยม ≤2). ห้ามส่งค่าที่ไม่ใช่ null ทั้งสองพร้อมกัน. ไม่ระบุหรือ null ทั้งสอง = 1.2%; ไม่คิดค่าธรรมเนียมให้ส่ง fee_pct: 0
- expenses บังคับ category ไม่ว่าง และ amount ≥0; adjustments บังคับ kind เป็น cost/sales และ amount มีเครื่องหมายได้; จำนวนเงิน expense/adjustment/fee_amount ไม่เกิน 999,999,999,999.99 ทศนิยม ≤2
- สร้าง supplier/category/size ใหม่อัตโนมัติเมื่อไม่มี. size_code เป็น free text และรวมยอดตามข้อความที่ตรงกันเท่านั้น. ข้อมูลเดือนสิงหาคมใช้ `นิ่ม` ขณะที่ schema seed มี `นิ่ม/A`; ตรวจรหัสตามล็อต/ต้นฉบับและใช้ให้ตรงกัน อย่าสร้างความต่างจาก alias โดยไม่ตั้งใจ ไม่ส่ง `soft` ของ analysis JSON โดยตรง. รายการขายที่อธิบายว่านิ่มอาจเป็นส่วนที่แยกจากเบอร์เดิม ให้คงกลุ่มตามหลักฐาน

## คำนวณและตรวจซ้ำ

API ใช้ `src/lib/calc.ts` เหมือน UI: ต้นทุน = ซื้อ กก. × ต้นทุน/กก. + cost adjustments; netSales = ขาย กก. × ราคา/กก. + sales adjustments; expenseTotal รวมค่าใช้จ่ายและค่าธรรมเนียมขาย; profit = netSales − costTotal − expenseTotal. ค่าธรรมเนียมปัดสองตำแหน่งรายแถวตามเว็บ. เปอร์เซ็นต์น้ำหนักเป็นอัตราส่วน เช่น 0.05 = 5%. เก็บความหมายของ netSales ตามเว็บ (ยังไม่หักค่าธรรมเนียม).

ตัวอย่างนี้ได้ costTotal=14900, netSales=20950, feeTotal=252, expenseTotal=752, profit=5298. AI ต้องตรวจ preview กับต้นฉบับก่อนสร้างจริง. ถ้าสมุดลงค่าธรรมเนียมรวมไว้แล้ว เลือกบันทึกเป็น fee_amount หรือค่าใช้จ่าย/ปรับยอดพร้อมตั้ง fee_pct:0 เพื่อไม่หักซ้ำ. ราคาเฉลี่ยที่ต้องใช้เกินสองตำแหน่งให้ใช้ราคา 2 ตำแหน่งและ adjustment ที่อธิบายยอดส่วนต่าง ห้ามปัดเงียบ ๆ.

## Atomicity และ Idempotency

POST create ต้องมี `Idempotency-Key` ยาว 1–128 ตัวอักษร ใช้ A–Z/a–z/0–9/`.`/`_`/`:`/`-`. กำหนด key หนึ่งตัวต่อเอกสาร/ล็อต และเก็บไว้เพื่อ retry.

- ครั้งแรก 201: `{data:{lot_id,replayed:false,summary,url}}`
- ส่ง key + normalized payload เดิมด้วย user เดิมอีกครั้ง 200: `replayed:true`, lot_id เดิม ไม่มีการเขียนซ้ำ
- key เดิม payload เปลี่ยน: 409; field order ไม่สำคัญ แต่ลำดับ array สำคัญ
- timeout/500: ใช้ key และ payload เดิม ห้ามสร้าง key ใหม่แก้ปัญหา. token ใหม่ของ user เดิมใช้ key เดิมได้
- ใช้ transaction และ advisory lock ใน PostgreSQL; ถ้ามีแถวผิดพลาดจะ rollback ทั้งล็อต รวมข้อมูลอ้างอิงและ receipt
- key ไม่ใช่ระบบตรวจเอกสารซ้ำทั้งหมด: key ใหม่หรือคนละ user อาจสร้างซ้ำได้ จึงค้นล็อตวันที่เดียวกันก่อน
- receipt เก็บแม้ล็อตถูกลบ; retry คืน ID เดิมโดยไม่สร้างล็อตใหม่. summary ของ create/replay อ้างอิง payload ตอนสร้าง; GET detail คือสถานะล่าสุดซึ่งอาจถูกแก้ผ่าน UI แล้ว

## Error envelope

`{"error":{"code":"validation_error","message":"buy_lines[0].weight_kg: ..."}}`

| HTTP | code | การจัดการ |
|---|---|---|
| 400 | invalid_json | แก้ JSON |
| 401 | unauthorized | token ไม่มี/ไม่ถูกต้อง/หมดอายุ |
| 404 | not_found | ไม่พบล็อต |
| 409 | idempotency_conflict | ตรวจรายการเดิม อย่า retry ด้วย key ใหม่อัตโนมัติ |
| 413 | body_too_large | เกิน 1 MiB |
| 415 | unsupported_media_type | ส่ง application/json |
| 422 | validation_error | แก้ field ที่ระบุ |
| 503 | not_configured / migration_required | ตั้ง environment หรือรัน migration |
| 500 | internal_error | ไม่เปิดเผยข้อมูลภายใน; หากเป็น write ให้ retry key เดิมเท่านั้น |

## ตัวอย่างเรียกโดยไม่ใช้ UI

ตั้ง `ACCOUNTING_BASE_URL` เป็น URL ของ instance ที่ต้องการ และ `ACCOUNTING_ACCESS_TOKEN` ใน environment. บันทึก body ตัวอย่างลง `lot.json` (ไม่เก็บ token ในไฟล์).

```bash
curl --fail-with-body "$ACCOUNTING_BASE_URL/api/v1/lots/preview" \
  -H "Authorization: Bearer $ACCOUNTING_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' --data-binary @lot.json

curl --fail-with-body "$ACCOUNTING_BASE_URL/api/v1/lots" \
  -H "Authorization: Bearer $ACCOUNTING_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: notebook-2026-05-14-raong-page-1' --data-binary @lot.json
```

จากนั้น GET `/api/v1/lots/{lot_id}` ตรวจข้อมูลจริงและรายงาน URL ที่ response คืนมา. ไม่ต้องใช้ browser automation.

## Verification

`npm run test:api` ตรวจ validation, สูตร/ค่าธรรมเนียม, auth, body limits และ create/replay/error mapping ด้วย mock database. `npx tsc --noEmit` ตรวจ type. ก่อน production ต้องทดสอบ migration บนฐานทดสอบ: import, parallel retry, payload conflict, และบังคับ child insert ล้มเหลวเพื่อยืนยันไม่มี partial lot/receipt เหลือ. ชุดทดสอบใน repo ไม่ได้แทน PostgreSQL integration test.

Integration harness: `tests/accounting-api-db.cjs` ใช้ PGlite (PostgreSQL ใน memory) โดยไม่ต่อฐานจริง. ติดตั้ง `@electric-sql/pglite` ในโฟลเดอร์ชั่วคราว แล้วรัน `PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite node tests/accounting-api-db.cjs`. ตรวจ migration, import/replay/conflict, rollback ทั้งล็อต, receipt RLS, anonymous denial และ retry หลังลบล็อต. PGlite ใช้ connection เดียว จึงยังต้องตรวจ concurrent requests บน Supabase staging ก่อน production.

## Production migration verification — 2026-09-25

Applied `202609250001_accounting_api.sql` to project `blfvcioyhtxfhvpcvoyt` through Supabase SQL Editor. Verified receipt RLS enabled, function uses SECURITY INVOKER, authenticated execute allowed and anonymous execute denied. Tested import with all child row types, identical-key replay and changed-payload conflict under the authenticated role inside a transaction, then rolled back all test writes. Existing lot count before/after: 79/79; receipt count after test: 0. This verifies database behavior; an authenticated HTTP end-to-end test and concurrent-request test are not included in this check.

## Editing a saved lot

Apply `supabase/migrations/202609270001_accounting_lot_updates.sql` after the original API migration, then deploy the API and restart the Discord bot. Applied to production project `blfvcioyhtxfhvpcvoyt` on 2026-09-27. The updated API is deployed at the existing production URL.

1. GET `/api/v1/lots/{id}?edit=1` for a consistent `{payload,version}` snapshot.
2. Preserve unchanged rows and modify the complete payload. Preview and obtain confirmation.
3. PUT `/api/v1/lots/{id}` with the complete payload, `If-Match: <version>` and a fresh `Idempotency-Key` for this confirmed edit.
4. Retry an uncertain result with the exact same ID, version, payload and key. An existing receipt is checked before the version, so a committed retry succeeds even after subsequent edits.

PUT returns 200 with `{data:{lot_id,replayed,summary,url}}`. A changed lot returns 412 `lot_changed`, with no write: reload and review again. Missing lots return 404. Reusing a key for a different operation, target, version or payload returns 409. The update transaction retains the lot ID, replaces all children, and writes a receipt atomically. Omitted arrays are empty, so callers must send the complete reviewed lot. Child row IDs are regenerated. Brief table write locks serialize the comparison and update against the website's direct table writes; current RLS remains enforced with SECURITY INVOKER.

## Production lot-edit rollout — 2026-09-27

Applied `202609270001_accounting_lot_updates.sql` through the signed-in Supabase SQL Editor (success). Deployed the API-only change from base revision `125909b02cc2e3a5ce0d1f4638c6b0242f3b99e4` plus the updated lot detail route to Vercel deployment `dpl_DuHU9u4FMuW8a3pEooaaasUuEWvV` (READY), aliased to `https://shrimp-accounting.vercel.app`. Local source changes remain uncommitted.

Using the bot's existing accounting login, verified authenticated edit snapshot and preview, then PUT with a deliberately stale version returned 412 `lot_changed`. The sampled lot's version and total lot count (81) were unchanged. No production test lot was created or updated. Full successful update/replay/rollback behavior was tested in the isolated PostgreSQL harness.

Restarted the existing `shrimp-discord-bot` process; its readiness log confirmed Discord connection and accounting access at 14:25:54 Asia/Bangkok. Both previously saved jobs restored their existing thread-to-lot links. No test messages were posted to Discord.
