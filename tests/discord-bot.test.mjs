import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { authorized, GUILD_ID, CHANNEL_ID, parseAnswer, checkConfirmation, invalidateDraft, commitDraft, hash, atomicJson, readJson, processLock, reviewFile } from '../scripts/discord-bot/core.mjs';
import { attachmentUrl, imageExtension } from '../scripts/discord-bot/images.mjs';
import { codexArgs, codexEnvironment } from '../scripts/discord-bot/codex.mjs';
const lot = { buy_date:'2026-09-26',supplier:'ทดสอบ',note:'',buy_lines:[{container:'A',size_code:'1',description:'กุ้งดี',density:'50',weight_kg:10,cost_per_kg:100,note:''}],sell_lines:[{container:'A',size_code:'1',description:'กุ้งดี',density:'50',sell_date:'2026-09-26',buyer:'ผู้ซื้อ',weight_kg:11,price_per_kg:150,fee_pct:0,fee_amount:null}],expenses:[],adjustments:[] };
const job = () => ({id:'job1',ownerId:'owner',revision:2,reviewMessageId:'review',status:'ready',draft:structuredClone(lot)});
test('the schema passed to Codex permits ready drafts for linked existing lots', async () => {
 const args = codexArgs([]);
 const schema = JSON.parse(await readFile(args[args.indexOf('--output-schema') + 1], 'utf8'));
 assert.match(schema.properties.ready.description, /create or edit/i);
 assert.match(schema.properties.ready.description, /linked/i);
 assert.doesNotMatch(schema.properties.ready.description, /only.*new accounting lot/i);
 assert.match(schema.properties.lot_json.description, /complete updated lot/i);
});
test('later sales in a ready response update the linked lot and preserve existing purchases and expenses', async () => {
 const baseline = structuredClone(lot);
 baseline.expenses = [{category:'other',amount:100,note:'เดิม'}];
 const updated = structuredClone(baseline);
 for (const [date, size, kg, price] of [
  ['2026-09-26','soft',157,170], ['2026-09-26','2',118,130],
  ['2026-09-26','0',2125,205], ['2026-09-26','0',450,200], ['2026-09-27','1',3700,200],
 ]) updated.sell_lines.push({container:'70-4476',size_code:size,sell_date:date,buyer:'',weight_kg:kg,price_per_kg:price,fee_pct:1.2,fee_amount:null});
 const parsed = parseAnswer(JSON.stringify({message:'ร่างแก้ไขล็อตเดิม',ready:true,lot_json:JSON.stringify(updated)}));
 const id = '7aee90bb-3a57-44e3-afd8-594afabd393d';
 const j = {...job(),lotId:id,baseVersion:'v1',draft:parsed.lot};
 let writes = 0;
 await commitDraft(j, {
  create:async()=>assert.fail('must not create a replacement lot'),
  update:async(target,payload)=>{
   writes++; assert.equal(target,id);
   assert.deepEqual(payload.buy_lines,baseline.buy_lines);
   assert.deepEqual(payload.expenses,baseline.expenses);
   assert.deepEqual(payload.sell_lines,updated.sell_lines);
   return {lot_id:target};
  },
 },async()=>{});
 assert.equal(writes,1);
});
test('only authorized humans in the selected guild/channel or its threads', () => {
 const base = {guildId:GUILD_ID,channelId:CHANNEL_ID,userId:'owner',bot:false}, allowed = new Set(['owner']);
 assert.equal(authorized(base,allowed),true);
 assert.equal(authorized({...base,channelId:'thread',parentId:CHANNEL_ID},allowed),true);
 for(const change of [{guildId:'other'},{channelId:'other'},{userId:'stranger'},{bot:true}]) assert.equal(authorized({...base,...change},allowed),false);
});
test('unclear input creates no draft; explicit sale fees required', () => {
 assert.equal(parseAnswer(JSON.stringify({message:'ถาม',ready:false,lot_json:''})).lot,null);
 assert.deepEqual(parseAnswer(JSON.stringify({message:'ร่าง',ready:true,lot_json:JSON.stringify(lot)})).lot,lot);
 const missing=structuredClone(lot); delete missing.sell_lines[0].fee_pct;
 assert.throws(()=>parseAnswer(JSON.stringify({message:'ร่าง',ready:true,lot_json:JSON.stringify(missing)})));
});
test('stale revisions, different users, wrong messages and completed jobs cannot confirm', () => {
 const j=job(); checkConfirmation(j,'owner',2,'review');
 for(const args of [['other',2,'review'],['owner',1,'review'],['owner',2,'old']]) assert.throws(()=>checkConfirmation(j,...args));
 invalidateDraft(j); assert.equal(j.draft,null); assert.equal(j.revision,3);
 assert.throws(()=>checkConfirmation(j,'owner',2,'review'));
 j.status='submitting'; assert.throws(()=>invalidateDraft(j));
});
test('duplicate existing lot blocks create', async () => {
 let writes=0; const j=job();
 await assert.rejects(commitDraft(j,{findDuplicates:async()=>[{}],create:async()=>{writes++;}},async()=>{}));
 assert.equal(writes,0); assert.equal(j.status,'ready');
});
test('write is journalled before request; timeout and restart retry exact key/payload', async () => {
 let disk, calls=[]; const j=job();
 const persist=async()=>{disk=structuredClone(j);};
 const api={findDuplicates:async()=>[],create:async(p,k)=>{assert.equal(disk.status,'submitting'); calls.push({p:structuredClone(p),k}); throw new Error('timeout after commit');}};
 await assert.rejects(commitDraft(j,api,persist));
 assert.equal(j.status,'submitting');
 const restarted=structuredClone(disk);
 const result=await commitDraft(restarted,{findDuplicates:async()=>{throw new Error('must not block idempotent retry');},create:async(p,k)=>{calls.push({p,k});return {lot_id:'saved',replayed:true};}},async()=>{});
 assert.deepEqual(calls[0],calls[1]); assert.equal(result.lot_id,'saved'); assert.equal(restarted.status,'saved');
 await assert.rejects(commitDraft(restarted,api,async()=>{}));
});
test('frozen payload cannot be changed after a write is attempted',async()=>{
 const j=job();j.status='submitting';j.idempotencyKey='fixed';j.payloadHash=hash(JSON.stringify(j.draft));j.draft.supplier='changed';
 await assert.rejects(commitDraft(j,{create:async()=>assert.fail('must not write')},async()=>{}));
});
test('private atomic state and singleton process lock',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'discord-test-'));
 try { const file=path.join(dir,'state.json');await atomicJson(file,{ok:true});assert.deepEqual(await readJson(file),{ok:true});assert.equal((await stat(file)).mode & 0o777,0o600);
 const release=await processLock(dir);await assert.rejects(processLock(dir));await release();const again=await processLock(dir);await again(); }finally{await rm(dir,{recursive:true,force:true});}
});
test('attachment URLs reject SSRF and extensions come from actual bytes',()=>{
 assert.equal(attachmentUrl('https://cdn.discordapp.com/attachments/1/2/x.jpg').hostname,'cdn.discordapp.com');
 for(const url of ['http://cdn.discordapp.com/attachments/x','https://evil.example/attachments/x','https://127.0.0.1/attachments/x','https://cdn.discordapp.com/not-attachment']) assert.throws(()=>attachmentUrl(url));
 assert.equal(imageExtension(Buffer.from([255,216,255,0])),'jpg');assert.throws(()=>imageExtension(Buffer.from('<script>not an image')));
});
test('Codex receives no shell interpolation or inherited service secrets',()=>{
 const args=codexArgs(['/tmp/image with spaces.jpg']);assert(args.includes('read-only'));assert(args.includes('--ignore-user-config'));assert(args.includes('shell_tool'));assert.equal(args.at(-1),'-');
 process.env.DISCORD_BOT_TEST_SECRET='secret';assert.equal(codexEnvironment().DISCORD_BOT_TEST_SECRET,undefined);delete process.env.DISCORD_BOT_TEST_SECRET;
});
test('review file includes every input field that affects accounting',()=>{
 const j=job();j.summary={buyKg:10,sellKg:11,costTotal:1000,netSales:1650,expenseTotal:0,profit:650};
 const text=reviewFile(j);for(const part of ['2026-09-26','ทดสอบ','ผู้ซื้อ','10 กก. × 100','11 กก. × 150','ค่าธรรมเนียม 0%','650.00'])assert(text.includes(part));
});

test('saved thread edits same lot; every confirmed revision has its own key', async()=>{
 const j=job(); const keys=[];
 await commitDraft(j,{findDuplicates:async()=>[],create:async(_,key)=>{keys.push(key);return {lot_id:'lot1'};}},async()=>{});
 assert.equal(j.lotId,'lot1');
 const oldRevision=j.revision;
 invalidateDraft(j); j.draft=structuredClone(lot); j.draft.note='Correction';j.baseVersion='version1';j.status='ready';j.reviewMessageId='new';
 assert.throws(()=>checkConfirmation(j,'owner',oldRevision,'review'));
 await commitDraft(j,{findDuplicates:async()=>assert.fail('linked lot must not create'),create:async()=>assert.fail('must edit'),update:async(id,p,key,version)=>{assert.equal(id,'lot1');assert.equal(version,'version1');assert.equal(p.note,'Correction');keys.push(key);return {lot_id:id};}},async()=>{});
 assert.notEqual(keys[0],keys[1]);assert.equal(j.lotId,'lot1');assert.equal(j.status,'saved');
});
test('update timeout/restart freezes lot, version, payload and key; conflict unlocks review',async()=>{
 const j={...job(),lotId:'lot1',baseVersion:'v1'};let disk, first;
 await assert.rejects(commitDraft(j,{update:async(...args)=>{first=args;throw Error('timeout');}},async()=>{disk=structuredClone(j);}));
 const restored=structuredClone(disk);
 await commitDraft(restored,{update:async(...args)=>{assert.deepEqual(args,first);return {lot_id:'lot1',replayed:true};}},async()=>{});
 const changed=structuredClone(disk);changed.writeTarget.lotId='lot2';
 await assert.rejects(commitDraft(changed,{update:async()=>assert.fail()},async()=>{}),/target/);
 await assert.rejects(commitDraft(j,{update:async()=>{throw Object.assign(Error('changed'),{status:412,code:'lot_changed'});}},async()=>{}));
 assert.equal(j.status,'conflict');assert.equal(j.reviewMessageId,null);invalidateDraft(j);
});
test('binding is immutable and unique, including legacy saved jobs',async()=>{
 const {bindLot,lotLinkCommand}=await import('../scripts/discord-bot/core.mjs');
 const id='00000000-0000-0000-0000-000000000001',j={id:'j'};
 assert.equal(lotLinkCommand(`ผูกล็อต https://shrimp-accounting.vercel.app/lots/${id}`),id);
 assert.equal(lotLinkCommand(`link ${id}`),id);assert.equal(lotLinkCommand('edit anything'),null);
 bindLot(j,id,{j});assert.equal(j.lotId,id);
 assert.throws(()=>bindLot(j,'another',{j}));
 assert.throws(()=>bindLot({id:'new'},id,{legacy:{id:'old',result:{lot_id:id},threadId:'old-thread'}}),/old-thread/);
});
