import { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CHANNEL_ID, GUILD_ID, DATA, atomicJson, readJson, processLock, authorized, bindLot, lotLinkCommand, invalidateDraft, checkConfirmation, commitDraft, renderReview, reviewFile, safeText } from './core.mjs';
import { accountingClient } from './accounting.mjs';
import { analyze } from './codex.mjs';
import { downloadImage } from './images.mjs';

process.umask(0o077);
const config = await readJson(path.join(DATA, 'config.json'), null);
if (!config?.discordToken) { console.error('Run npm run discord:setup first.'); process.exit(1); }
const unlock = await processLock(DATA);
const stateFile = path.join(DATA, 'state.json');
const state = await readJson(stateFile, { version: 1, jobs: {}, seen: [] });
if (state.version !== 1) throw new Error('Unsupported state version.');
const persist = () => atomicJson(stateFile, state);
const api = accountingClient(config);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], allowedMentions: { parse: [], repliedUser: false } });
let allowed = new Set(config.allowedUserIds ?? []), ready = false, queued = 0, tail = Promise.resolve(), stopping = false;
const help = 'ส่งรูปสมุด JPG/PNG/WebP พร้อมวันที่และชื่อฟาร์มในห้องนี้ บอตจะเปิดหัวข้อแยกต่อหนึ่งล็อต\nตอบหรือส่งรูปเพิ่มในหัวข้อเดิมเพื่อแก้ไข แล้วตรวจร่างและกด “ยืนยันบันทึก”\nพิมพ์ “สถานะ” ในหัวข้อเพื่อดูสถานะ หรือ “ลองใหม่” หากงานสะดุด\nหัวข้อเดิมผูกกับล็อตเดิมตลอด แก้ไขหรือเพิ่มยอดขายหลังบันทึกได้ โดยตรวจร่างและยืนยันทุกครั้ง\nล็อตที่มีอยู่แล้ว: ส่ง “ผูกล็อต <ลิงก์ล็อตหรือ UUID>”';
function cleaned(text) {
  let out = safeText(text);
  for (const secret of [config.discordToken, config.accountingPassword, config.supabaseKey]) if (secret?.length >= 4) out = out.split(secret).join('[ปิดบัง]');
  return out;
}
async function say(channel, text) {
  const content = cleaned(text);
  for (let i = 0; i < content.length; i += 1800) await channel.send({ content: content.slice(i, i + 1800), allowedMentions: { parse: [] } });
}
function enqueue(fn) {
  queued++;
  tail = tail.then(fn).catch(() => console.error('Discord job failed; no raw payload or credentials logged.')).finally(() => { queued--; });
  return tail;
}
function buttons(job) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`save:${job.id}:${job.revision}`).setLabel(job.status === 'submitting' ? 'ตรวจผล / ลองบันทึกซ้ำอย่างปลอดภัย' : 'ยืนยันบันทึก').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cancel:${job.id}:${job.revision}`).setLabel('ยกเลิกร่าง').setStyle(ButtonStyle.Secondary).setDisabled(job.status === 'submitting'),
  )];
}
async function showReview(channel, job) {
  const review = await channel.send({ content: cleaned(renderReview(job)),
    files: [new AttachmentBuilder(Buffer.from(reviewFile(job), 'utf8'), { name: `draft-${job.revision}.txt` })], components: buttons(job), allowedMentions: { parse: [] } });
  job.reviewMessageId = review.id; await persist();
}
async function runAnalysis(channel, job) {
  job.status = 'analyzing'; await persist();
  await say(channel, 'กำลังอ่านและตรวจรายการกับ Codex บน Mac mini ครับ');
  const typing = setInterval(() => channel.sendTyping().catch(() => {}), 8000);
  try {
    const result = await analyze(job, config);
    job.history.push({ role: 'assistant', text: result.message });
    await say(channel, result.message || 'อ่านรายการแล้วครับ');
    if (!result.lot) { job.status = 'awaiting_input'; await persist(); return; }
    const preview = await api.preview(result.lot);
    job.draft = preview.normalized; job.summary = preview.summary;
    const duplicates = job.lotId ? [] : await api.findDuplicates(job.draft);
    if (duplicates.length) {
      job.status = 'blocked_duplicate'; await persist();
      await say(channel, `พบล็อตผู้ขายเดียวกันในวันที่ ${job.draft.buy_date} จึงยังไม่เปิดปุ่มบันทึก เพื่อป้องกันล็อตซ้ำ\nตรวจล็อตเดิมที่ ${config.accountingBaseUrl}/lots/${duplicates[0].id}\nหากต้องการแก้ล็อตเดิม ส่ง “ผูกล็อต ${duplicates[0].id}” ในหัวข้อนี้ หรือแก้วันที่/ชื่อหากอ่านผิด`); return;
    }
    job.status = 'ready'; await persist();
    await showReview(channel, job);
  } catch (e) {
    job.status = 'failed'; job.reviewMessageId = null; await persist();
    await say(channel, `ยังไม่ได้บันทึกครับ: ${e.message}\nพิมพ์ข้อมูลเพิ่มเติม หรือ “ลองใหม่” ในหัวข้อนี้`);
  } finally { clearInterval(typing); }
}
async function handleMessage(message) {
  if (state.seen.includes(message.id)) return;
  const text = message.content.trim();
  let job = Object.values(state.jobs).find(j => j.threadId === message.channelId);
  if (job && job.ownerId !== message.author.id) return;
  if (text === 'ช่วยเหลือ' || text === 'help') { await say(message.channel, help); return; }
  if (text === 'สถานะ') {
    await say(message.channel, job ? `สถานะ: ${job.status}${job.lotId ? `\n${config.accountingBaseUrl}/lots/${job.lotId}` : ''}` : 'พร้อมรับรูปและข้อความครับ');
    if (job && ['ready', 'submitting'].includes(job.status)) await showReview(message.channel, job);
    return;
  }
  if (job && ['cancelled', 'submitting'].includes(job.status)) {
    await say(message.channel, job.status === 'submitting' ? 'มีคำขอบันทึกที่ยังไม่ทราบผล พิมพ์ “สถานะ” แล้วใช้ปุ่มตรวจผลของร่างเดิม ห้ามสร้างใหม่ซ้ำ' : 'รายการนี้ปิดแล้ว หากเป็นล็อตใหม่ให้ส่งในห้องหลัก หากแก้ล็อตเดิมให้ใช้หัวข้อเดิมของล็อต'); return;
  }
  const linkId = lotLinkCommand(text);
  if (linkId) {
    if (job?.status === 'submitting') return;
    // Validate access and uniqueness before creating a Discord thread or changing state.
    const snapshot = await api.editSnapshot(linkId);
    const candidate = job ?? { id: randomUUID(), ownerId: message.author.id, revision: 0, images: [], history: [], createdAt: new Date().toISOString() };
    try { bindLot(candidate, linkId, state.jobs); } catch (e) { await say(message.channel, e.message); return; }
    if (!job) {
      if (message.channelId !== CHANNEL_ID) { await say(message.channel, 'เริ่มผูกล็อตในห้องหลักครับ'); return; }
      const thread = await message.startThread({ name: `ล็อต ${snapshot.payload.buy_date} · ${snapshot.payload.supplier}`.slice(0, 100), autoArchiveDuration: 1440 });
      candidate.threadId = thread.id; state.jobs[candidate.id] = candidate;
    }
    invalidateDraft(candidate);
    candidate.baseLot = snapshot.payload; candidate.baseVersion = snapshot.version;
    candidate.previousDraft = snapshot.payload; candidate.editHistoryStart = candidate.history.length;
    candidate.editImageStart = candidate.images.length;
    candidate.status = 'awaiting_input'; await persist();
    await say(await client.channels.fetch(candidate.threadId), `ผูกหัวข้อนี้กับล็อต ${linkId} แล้ว พิมพ์สิ่งที่ต้องการแก้ไขหรือเพิ่มยอดขายได้ครับ\n${config.accountingBaseUrl}/lots/${linkId}`);
    return;
  }
  if (!text && !message.attachments.size) return;
  const freshCycle = job && ['saved', 'conflict'].includes(job.status);
  const activeImages = freshCycle ? 0 : job?.images.slice(job.editImageStart ?? 0).length ?? 0;
  if (message.attachments.size + activeImages > 10) { await say(message.channel, 'หนึ่งร่างรับได้ไม่เกิน 10 รูปครับ'); return; }
  if (text.length > 12000 || (!freshCycle && (job?.history.slice(job.editHistoryStart ?? 0).length ?? 0) > 60)) { await say(message.channel, 'ข้อมูลร่างนี้ยาวเกินไป กรุณาสรุปให้สั้นลง หรือยกเลิกร่างแล้วเริ่มแก้ไขในหัวข้อเดิม'); return; }
  const images = [];
  try {
    for (const attachment of message.attachments.values()) {
      const image = await downloadImage(attachment, path.join(DATA, 'images'));
      const duplicate = Object.values(state.jobs).find(j => j.id !== job?.id && j.status !== 'cancelled' && j.images.some(i => i.hash === image.hash));
      if (duplicate) { await say(message.channel, `รูปนี้เคยส่งแล้ว กรุณาทำต่อใน https://discord.com/channels/${GUILD_ID}/${duplicate.threadId}`); return; }
      images.push(image);
    }
  } catch (e) { await say(message.channel, e.message); return; }
  if (!job) {
    if (message.channelId !== CHANNEL_ID) { await say(message.channel, 'เริ่มล็อตใหม่โดยส่งรูปหรือข้อความในห้องหลักครับ'); return; }
    const thread = await message.startThread({ name: `บัญชี ${new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })} · ${message.id.slice(-6)}`, autoArchiveDuration: 1440 });
    job = { id: randomUUID(), ownerId: message.author.id, threadId: thread.id, revision: 0, status: 'new', images: [], history: [], createdAt: new Date().toISOString() };
    state.jobs[job.id] = job;
  }
  if (job.lotId && (['saved', 'conflict'].includes(job.status) || !job.baseVersion)) {
    const snapshot = await api.editSnapshot(job.lotId);
    job.baseLot = snapshot.payload; job.baseVersion = snapshot.version;
    job.previousDraft = snapshot.payload;
    job.editHistoryStart = job.history.length;
    job.editImageStart = job.images.length;
  } else {
    job.previousDraft = job.draft ?? job.previousDraft ?? null;
  }
  invalidateDraft(job);
  for (const image of images) if (!job.images.slice(job.editImageStart ?? 0).some(i => i.hash === image.hash)) job.images.push(image);
  job.history.push({ role: 'user', text: text || 'อ่านรูปที่แนบ', addedImages: images.length });
  state.seen.push(message.id); state.seen = state.seen.slice(-10000);
  await persist();
  const channel = await client.channels.fetch(job.threadId);
  await runAnalysis(channel, job);
}
client.on(Events.MessageCreate, message => {
  if (!ready || stopping || !authorized({ guildId: message.guildId, channelId: message.channelId, parentId: message.channel.parentId, userId: message.author.id, bot: message.author.bot }, allowed)) return;
  if (queued >= 20) { say(message.channel, 'คิวเต็ม กรุณารอสักครู่แล้วส่งใหม่').catch(() => {}); return; }
  enqueue(async () => { try { await handleMessage(message); } catch { await say(message.channel, 'รับงานไม่สำเร็จ ตรวจสิทธิ์บอตและการเชื่อมต่อ แล้วส่งข้อความใหม่ครับ'); } });
});
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  if (!ready || stopping || !authorized({ guildId: interaction.guildId, channelId: interaction.channelId, parentId: interaction.channel?.parentId, userId: interaction.user.id, bot: interaction.user.bot }, allowed)) {
    await interaction.reply({ content: 'ไม่มีสิทธิ์ใช้งานรายการนี้', flags: 64 }).catch(() => {}); return;
  }
  await interaction.deferReply({ flags: 64 }).catch(() => {});
  enqueue(async () => {
    const [action, id, revisionText] = interaction.customId.split(':');
    const job = state.jobs[id];
    try {
      if (!['save', 'cancel'].includes(action) || job?.threadId !== interaction.channelId) throw new Error('ปุ่มไม่ถูกต้อง');
      checkConfirmation(job, interaction.user.id, Number(revisionText), interaction.message.id);
      if (action === 'cancel') {
        if (job.status === 'submitting') throw new Error('คำขอบันทึกถูกส่งแล้ว ต้องตรวจผลก่อน');
        job.status = job.lotId ? 'saved' : 'cancelled';
        job.draft = null; job.reviewMessageId = null; await persist();
        await interaction.message.edit({ components: [] });
        await interaction.editReply('ยกเลิกร่างแล้ว ไม่มีการบันทึก'); return;
      }
      const result = await commitDraft(job, api, persist);
      await interaction.message.edit({ components: [] }).catch(() => {});
      let verified = false;
      try { const detail = await api.detail(result.lot_id); verified = detail.lot.id === result.lot_id; } catch { /* saved receipt remains authoritative */ }
      await interaction.editReply('บันทึกสำเร็จแล้ว');
      await say(interaction.channel, `บันทึกแล้ว${verified ? ' และเปิดตรวจรายการได้แล้ว' : ' (ยังตรวจอ่านกลับไม่ได้)'}\n${config.accountingBaseUrl}/lots/${result.lot_id}`);
    } catch (e) {
      await interaction.editReply(cleaned(`${e.message}${job?.status === 'submitting' ? '\nยังไม่ทราบผลแน่นอน กดปุ่มเดิมอีกครั้งได้ ระบบจะใช้รหัสเดิมเพื่อไม่ลงซ้ำ' : ''}`)).catch(() => {});
    }
  });
});
client.once(Events.ClientReady, async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!allowed.size) allowed = new Set([guild.ownerId]);
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (channel?.guildId !== GUILD_ID || !channel.isTextBased() || channel.isThread()) throw new Error('Configured channel is not a server text channel.');
    const permissions = channel.permissionsFor(client.user);
    for (const p of [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]) if (!permissions?.has(p)) throw new Error(`Bot is missing channel permission: ${Object.entries(PermissionFlagsBits).find(([, value]) => value === p)?.[0] ?? p.toString()}`);
    await api.check();
    for (const job of Object.values(state.jobs)) {
      if (!job.lotId && job.result?.lot_id) job.lotId = job.result.lot_id;
      if (['analyzing', 'queued'].includes(job.status)) { job.status = 'failed'; job.reviewMessageId = null; }
    }
    await persist();
    ready = true;
    console.log(`Ready: Discord channel ${CHANNEL_ID}; ${allowed.size} authorized user(s).`);
    // One initial installation announcement; reconnects/restarts do not spam the channel.
    if (!state.announced) { await say(channel, `ผู้ช่วยบัญชีบน Mac mini พร้อมแล้วครับ\n${help}`); state.announced = true; await persist(); }
  } catch (e) { console.error(`Startup check failed: ${cleaned(e.message)}`); await shutdown(1); }
});
client.on(Events.Error, () => console.error('Discord connection error. Check bot setup and connectivity.'));
async function shutdown(code = 0) {
  if (stopping) return; stopping = true;
  client.destroy();
  // Let any in-flight accounting request finish and persist its receipt before exiting.
  const deadline = setTimeout(() => process.exit(code), 40000); deadline.unref();
  await tail; await unlock(); clearTimeout(deadline); process.exit(code);
}
process.on('SIGINT', () => shutdown()); process.on('SIGTERM', () => shutdown());
try { await client.login(config.discordToken); }
catch { console.error('Discord login failed. Check token and Message Content Intent.'); await unlock(); process.exit(1); }
