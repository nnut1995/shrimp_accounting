import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, open, unlink } from 'node:fs/promises';
import path from 'node:path';

export const GUILD_ID = '1499980328671117442';
export const CHANNEL_ID = '1553341707008090122';
export const ROOT = path.resolve(import.meta.dirname, '../..');
export const DATA = path.join(ROOT, '.discord-bot');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const money = n => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const safeText = value => String(value).replace(/@/g, '＠');
export function authorized({ guildId, channelId, parentId, userId, bot }, allowed) {
  return !bot && guildId === GUILD_ID && (channelId === CHANNEL_ID || parentId === CHANNEL_ID) && allowed.has(userId);
}
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temp, file);
}
export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
export async function processLock(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'bot.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, 'wx', 0o600);
      await handle.writeFile(String(process.pid)); await handle.close();
      return async () => { await unlink(file).catch(() => {}); };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(await readFile(file, 'utf8'));
      if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid bot lock; inspect bot.lock before restarting.');
      try { process.kill(pid, 0); }
      catch (error) { if (error.code === 'ESRCH') { await unlink(file); continue; } throw error; }
      throw new Error('Another bot process is already running.');
    }
  }
  throw new Error('Could not acquire bot lock.');
}
export function parseAnswer(text) {
  const value = JSON.parse(text);
  if (typeof value.message !== 'string' || typeof value.ready !== 'boolean' || typeof value.lot_json !== 'string') throw new Error('Invalid Codex response.');
  if (value.message.length > 14000 || value.lot_json.length > 500000) throw new Error('Response too large.');
  if (!value.ready) return { message: value.message, lot: null };
  const lot = JSON.parse(value.lot_json);
  if (!lot || typeof lot !== 'object' || Array.isArray(lot)) throw new Error('Invalid lot.');
  if (!lot.buy_lines?.length && !lot.sell_lines?.length) throw new Error('Empty lot.');
  // Never accept the API's implicit 1.2% fee when the source did not specify it.
  for (const row of lot.sell_lines ?? []) {
    if (row.fee_pct == null && row.fee_amount == null) throw new Error('ต้องระบุค่าธรรมเนียมขายให้ชัดเจนทุกแถว');
  }
  return { message: value.message, lot };
}
export function invalidateDraft(job) {
  if (job.status === 'submitting') throw new Error('รายการนี้ส่งบันทึกแล้ว แก้ร่างไม่ได้');
  job.revision += 1; job.draft = null; job.summary = null; job.reviewMessageId = null;
  job.status = 'queued';
}
export function checkConfirmation(job, userId, revision, messageId) {
  if (!job || job.ownerId !== userId) throw new Error('เฉพาะเจ้าของรายการเท่านั้นที่ยืนยันได้');
  if (job.revision !== revision || job.reviewMessageId !== messageId) throw new Error('ร่างนี้ถูกแก้แล้ว กรุณาใช้ปุ่มใต้ร่างล่าสุด');
  if (!['ready', 'submitting'].includes(job.status) || !job.draft) throw new Error('รายการนี้ยังยืนยันไม่ได้ หรือบันทึก/ยกเลิกไปแล้ว');
}
export async function commitDraft(job, api, persist) {
  if (!['ready', 'submitting'].includes(job.status) || !job.draft) throw new Error('No confirmable draft.');
  if (job.status === 'ready') {
    const duplicates = job.lotId ? [] : await api.findDuplicates(job.draft);
    if (duplicates.length) throw new Error('พบล็อตผู้ขายเดียวกันในวันเดียวกัน กรุณาผูกล็อตเดิมด้วย “ผูกล็อต <ลิงก์ล็อต>” เพื่อแก้ไข ไม่สร้างซ้ำ');
    // Write-ahead state freezes the exact payload and idempotency key, including across restarts.
    job.status = 'submitting';
    job.idempotencyKey = `discord:${job.id}:${job.revision}`;
    job.writeTarget = job.lotId ? { lotId: job.lotId, version: job.baseVersion } : null;
    job.payloadHash = hash(JSON.stringify(job.draft));
    job.targetHash = hash(JSON.stringify(job.writeTarget));
    await persist();
  }
  if (hash(JSON.stringify(job.draft)) !== job.payloadHash) throw new Error('Frozen payload was changed.');
  if (job.targetHash && hash(JSON.stringify(job.writeTarget)) !== job.targetHash) throw new Error('Frozen target was changed.');
  let result;
  try {
    result = job.writeTarget
      ? await api.update(job.writeTarget.lotId, job.draft, job.idempotencyKey, job.writeTarget.version)
      : await api.create(job.draft, job.idempotencyKey);
  } catch (error) {
    // A known stale-version rejection is atomic: safe to start a new review.
    // Network errors and unknown outcomes must keep the frozen request.
    if (error.status === 412 && error.code === 'lot_changed') {
      job.status = 'conflict'; job.reviewMessageId = null; await persist();
    }
    throw error;
  }
  job.status = 'saved'; job.result = result; job.lotId = result.lot_id;
  job.editHistoryStart = job.history?.length ?? 0;
  job.editImageStart = job.images?.length ?? 0;
  await persist();
  return result;
}
export function renderReview(job) {
  const p = job.draft, s = job.summary;
  return safeText(`${job.lotId ? `แก้ไขล็อตเดิม ${job.lotId}` : 'สร้างล็อตใหม่'}\nร่างฉบับ ${job.revision} — ${p.buy_date} | ${p.supplier}\nซื้อ ${money(s.buyKg)} กก. • ขาย ${money(s.sellKg)} กก.\nต้นทุน ${money(s.costTotal)} บาท\nยอดขาย (ก่อนหักค่าธรรมเนียม) ${money(s.netSales)} บาท\nค่าใช้จ่ายรวมค่าธรรมเนียม ${money(s.expenseTotal)} บาท\nกำไร ${money(s.profit)} บาท\n\nตรวจรายการทุกแถวในไฟล์แนบก่อนกดยืนยัน\nต้องการแก้ไข: พิมพ์รายละเอียดในหัวข้อนี้ แล้วรอร่างฉบับใหม่`);
}
export function reviewFile(job) {
  const p = job.draft;
  const out = [`ร่างฉบับ ${job.revision}`, `วันที่ซื้อ: ${p.buy_date}`, `ผู้ขาย: ${p.supplier}`, `หมายเหตุ: ${p.note}`, '', 'ซื้อ'];
  for (const r of p.buy_lines) out.push(`ตู้ ${r.container} | ไซซ์ ${r.size_code} | ${r.description} | ขนาด ${r.density} | ${r.weight_kg} กก. × ${r.cost_per_kg} บาท | ${r.note}`);
  out.push('', 'ขาย');
  for (const r of p.sell_lines) out.push(`${r.sell_date} | ผู้ซื้อ ${r.buyer} | ตู้ ${r.container} | ไซซ์ ${r.size_code} | ${r.description} | ขนาด ${r.density} | ${r.weight_kg} กก. × ${r.price_per_kg} บาท | ค่าธรรมเนียม ${r.fee_amount != null ? `${r.fee_amount} บาท` : `${r.fee_pct}%`}`);
  out.push('', 'ค่าใช้จ่าย');
  for (const r of p.expenses) out.push(`${r.category}: ${r.amount} บาท | ${r.note}`);
  out.push('', 'ปรับยอด');
  for (const r of p.adjustments) out.push(`${r.kind === 'cost' ? 'ต้นทุน' : 'ยอดขาย'}: ${r.amount} บาท | ${r.note}`);
  out.push('', renderReview(job));
  return out.join('\n');
}

// A binding is durable and cannot be moved to another lot by conversation/model output.
export function bindLot(job, lotId, jobs) {
  if (job.lotId && job.lotId !== lotId) throw new Error('หนึ่งหัวข้อใช้ได้กับล็อตเดียว กรุณาเปิดหัวข้อใหม่');
  const other = Object.values(jobs).find(j => j.id !== job.id && (j.lotId ?? j.result?.lot_id) === lotId);
  if (other) throw new Error(`ล็อตนี้มีหัวข้อแล้ว: https://discord.com/channels/${GUILD_ID}/${other.threadId}`);
  job.lotId = lotId;
}
export function lotLinkCommand(text) {
  const match = /^(?:link|ผูกล็อต)\s+(?:https?:\/\/[^\s]+\/lots\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i.exec(text);
  return match?.[1].toLowerCase() ?? null;
}
