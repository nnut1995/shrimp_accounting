import http from 'node:http';
import { setupHeaders, validSetupRequest } from './setup-security.mjs';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { DATA, ROOT, GUILD_ID, CHANNEL_ID, atomicJson, readJson } from './core.mjs';
import { accountingClient } from './accounting.mjs';
process.umask(0o077);
const nonce = randomBytes(24).toString('hex');
const existing = await readJson(path.join(DATA, 'config.json'), {});
const env = parseEnv(await readFile(path.join(ROOT, '.env.local'), 'utf8'));
const permissions = (1024n | 2048n | 32768n | 65536n | (1n << 35n) | (1n << 38n)).toString();
function page(body) {
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>เชื่อม Discord กับบัญชีกุ้ง</title><style>body{font:17px system-ui;background:#f1f5f4;color:#16382e;max-width:640px;margin:48px auto;padding:24px}section{background:white;padding:28px;border-radius:18px}label{display:block;margin-top:20px}input{box-sizing:border-box;width:100%;font:inherit;padding:12px;border:1px solid #a5beb4;border-radius:8px;margin-top:8px}button,a.cta{display:inline-block;background:#16694b;color:white;border:0;padding:13px 20px;border-radius:8px;font:inherit;margin-top:24px;text-decoration:none}p{line-height:1.65}small{color:#527266}</style><section>${body}</section></html>`;
}
const form = page(`<h1>เชื่อมผู้ช่วยบัญชีกับ Discord</h1><p>กรอกบน Mac mini เครื่องนี้ ข้อมูลจะเก็บไว้ในเครื่องและไม่ส่งเข้าแชต Codex</p><p>ห้องที่เชื่อม: <b>${CHANNEL_ID}</b></p><form method="post" autocomplete="off"><label>Bot Token จาก Discord Developer Portal<input name="token" type="password" required autocomplete="new-password"></label><label>อีเมลที่ใช้เข้าสู่เว็บบัญชี<input name="email" type="email" required autocomplete="off"></label><label>รหัสผ่านเว็บบัญชี<input name="password" type="password" required autocomplete="new-password"></label><label>Discord User ID ของผู้ใช้งาน (ไม่บังคับ)<input name="users" placeholder="เว้นว่าง = อนุญาตเฉพาะเจ้าของเซิร์ฟเวอร์"></label><small>หลายคนคั่นด้วย comma — เฉพาะคนที่ระบุเท่านั้นที่สั่งบอตได้</small><button>ตรวจสอบและบันทึกการเชื่อมต่อ</button></form><p><small>ก่อนเชื่อม ให้เปิด Message Content Intent ในหน้า Bot ของ Discord Developer Portal</small></p>`);
const server = http.createServer(async (req, res) => {
  const headers = setupHeaders;
  if (!validSetupRequest(req, server.address().port, nonce)) { res.writeHead(403, headers).end('Forbidden'); return; }
  if (req.method === 'GET') { res.writeHead(200, headers).end(form); return; }
  if (req.method !== 'POST') { res.writeHead(405, headers).end(); return; }
  try {
    if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) throw new Error('format');
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 20000) throw new Error('size'); }
    const fields = new URLSearchParams(body);
    const discordToken = fields.get('token')?.trim();
    const accountingEmail = fields.get('email')?.trim();
    const accountingPassword = fields.get('password');
    const allowedUserIds = (fields.get('users') || '').split(',').map(v => v.trim()).filter(Boolean);
    if (!discordToken || !accountingEmail || !accountingPassword || allowedUserIds.some(v => !/^\d{17,20}$/.test(v))) throw new Error('fields');
    const appRes = await fetch('https://discord.com/api/v10/oauth2/applications/@me', { headers: { Authorization: `Bot ${discordToken}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!appRes.ok) { res.writeHead(400, headers).end(page('<h1>Bot Token ใช้ไม่ได้</h1><p>กลับไปคัดลอก Bot Token ใหม่ แล้วกลับมากรอกอีกครั้ง</p>')); return; }
    const application = await appRes.json();
    const config = { ...existing, discordToken, accountingEmail, accountingPassword, allowedUserIds,
      applicationId: application.id, accountingBaseUrl: existing.accountingBaseUrl || 'https://shrimp-accounting.vercel.app',
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      codexBin: existing.codexBin || path.join(process.env.HOME, '.local/bin/codex'), guildId: GUILD_ID, channelId: CHANNEL_ID };
    await accountingClient(config).check();
    await atomicJson(path.join(DATA, 'config.json'), config);
    const invite = `https://discord.com/oauth2/authorize?client_id=${application.id}&scope=bot&permissions=${permissions}&guild_id=${GUILD_ID}&disable_guild_select=true`;
    res.writeHead(200, headers).end(page(`<h1>บันทึกการเชื่อมต่อแล้ว</h1><p>ตรวจ Bot Token และการเข้าสู่ระบบบัญชีสำเร็จ</p><p>ขั้นต่อไปเชิญบอตเข้าเซิร์ฟเวอร์ของคุณ ให้สิทธิ์เฉพาะห้องบัญชี ไม่ต้องให้ Administrator</p><a class="cta" href="${invite}" target="_blank" rel="noreferrer">เชิญบอตเข้า Discord</a><p>เมื่อเชิญสำเร็จ กลับไปบอก Codex เพื่อเปิดใช้งานและทดสอบบอต</p>`));
    console.log('Configuration saved and authenticated; no credentials logged.');
  } catch { res.writeHead(400, headers).end(page('<h1>ยังเชื่อมต่อไม่สำเร็จ</h1><p>ตรวจอีเมลและรหัสผ่านเว็บบัญชี รวมถึงการเชื่อมต่ออินเทอร์เน็ต แล้วกลับมากรอกอีกครั้ง</p>')); }
});
server.listen(0, '127.0.0.1', () => console.log(`Setup page: http://127.0.0.1:${server.address().port}/${nonce}`));
setTimeout(() => server.close(), 60 * 60 * 1000).unref();
