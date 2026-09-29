import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { hash } from './core.mjs';
const MAX = 12 * 1024 * 1024;
export function attachmentUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) || !url.pathname.startsWith('/attachments/')) throw new Error('รับเฉพาะรูปที่แนบโดยตรงใน Discord');
  return url;
}
export function imageExtension(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw new Error('รองรับรูป JPG, PNG และ WebP เท่านั้น');
}
export async function downloadImage(attachment, dir) {
  if (attachment.size > MAX) throw new Error('รูปต้องมีขนาดไม่เกิน 12 MB');
  const res = await fetch(attachmentUrl(attachment.url), { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!res.ok || Number(res.headers.get('content-length')) > MAX) throw new Error('ดาวน์โหลดรูปไม่ได้ หรือรูปใหญ่เกิน 12 MB');
  const chunks = []; let length = 0;
  for await (const chunk of res.body) {
    length += chunk.length;
    if (length > MAX) throw new Error('รูปใหญ่เกิน 12 MB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks), ext = imageExtension(bytes), digest = hash(bytes);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${digest}.${ext}`);
  await writeFile(file, bytes, { mode: 0o600 });
  return { path: file, hash: digest };
}
