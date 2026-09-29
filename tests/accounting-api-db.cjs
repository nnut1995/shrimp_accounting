/* eslint-disable @typescript-eslint/no-require-imports -- Optional isolated PostgreSQL integration harness. */
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001');
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;`);
    await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));
    // Supabase's default table grants; RLS remains active.
    await db.exec('grant select,insert,update,delete on all tables in schema public to authenticated');
    await db.exec(fs.readFileSync('supabase/migrations/202609250001_accounting_api.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/202609270001_accounting_lot_updates.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/202609290001_lot_brokers.sql','utf8'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';`);
    const payload={buy_date:'2026-05-14',supplier:'Test farm',broker:'นายหน้าทดสอบ',note:'',buy_lines:[{container:'80-3867',size_code:'custom',description:'',density:'',weight_kg:100,cost_per_kg:150,note:''}],sell_lines:[{sell_date:'2026-05-15',container:'80-3867',size_code:'custom',description:'',density:'',weight_kg:105,price_per_kg:200,buyer:'Test buyer',fee_pct:1.2,fee_amount:null}],expenses:[{category:'Transport',amount:500,note:''}],adjustments:[{kind:'cost',amount:-100,note:''}]};
    const call=(key,p=payload)=>db.query('select public.import_accounting_lot($1,$2::jsonb) as result',[key,JSON.stringify(p)]).then(x=>x.rows[0].result);
    const first=await call('source-1');assert.equal(first.replayed,false);
    const repeated=await call('source-1');assert.equal(repeated.replayed,true);assert.equal(first.lot_id,repeated.lot_id);
    await assert.rejects(call('source-1',{...payload,note:'Changed'}),e=>e.code==='PT409');
    const counts=async()=> (await db.query('select (select count(*)::int from lots) lots,(select count(*)::int from buy_lines) buys,(select count(*)::int from accounting_api_requests) receipts,(select count(*)::int from suppliers) suppliers')).rows[0];
    assert.deepEqual(await counts(),{lots:1,buys:1,receipts:1,suppliers:1});
    // Fail after lot, supplier, buy and sell inserts; all must roll back.
    await assert.rejects(call('bad-child',{...payload,supplier:'Should roll back',adjustments:[{kind:'invalid',amount:1,note:''}]}));
    assert.deepEqual(await counts(),{lots:1,buys:1,receipts:1,suppliers:1});
    const snapshot=async()=> (await db.query('select accounting_lot_snapshot($1) as result',[first.lot_id])).rows[0].result;
    const before=await snapshot(); assert.equal(before.payload.sell_lines.length,1); assert.equal(before.payload.broker,'นายหน้าทดสอบ');
    const edited={...before.payload,note:'Edited',sell_lines:[...before.payload.sell_lines,{...payload.sell_lines[0],weight_kg:4}]};
    const update=(key,version,p=edited,id=first.lot_id)=>db.query('select update_accounting_lot($1,$2,$3,$4::jsonb) as result',[id,key,version,JSON.stringify(p)]).then(x=>x.rows[0].result);
    const saved=await update('edit-1',before.version);assert.equal(saved.lot_id,first.lot_id);
    assert.equal((await counts()).lots,1);assert.equal((await snapshot()).payload.sell_lines.length,2);
    for (const field of ['buy_lines','expenses','adjustments','supplier','buy_date']) assert.deepEqual((await snapshot()).payload[field],before.payload[field]);
    assert.equal((await update('edit-1',before.version)).replayed,true);
    await assert.rejects(update('edit-1',before.version,{...edited,note:'different'}),e=>e.code==='PT409');
    await assert.rejects(update('edit-stale',before.version),e=>e.code==='PT412');
    const after=await snapshot();
    await assert.rejects(update('edit-bad',after.version,{...edited,adjustments:[{kind:'invalid',amount:1,note:''}]}));
    assert.deepEqual(await snapshot(),after);assert.equal((await counts()).receipts,2);
    // A direct website child edit invalidates the snapshot as well.
    await db.query('update buy_lines set weight_kg=99 where lot_id=$1',[first.lot_id]);
    await assert.rejects(update('edit-child-conflict',after.version),e=>e.code==='PT412');
    await assert.rejects(update('missing',after.version,edited,'00000000-0000-0000-0000-000000000099'),e=>e.code==='PT404');
    const brokerBefore=await snapshot();
    const legacyPayload={...brokerBefore.payload}; delete legacyPayload.broker;
    await update('legacy-edit',brokerBefore.version,legacyPayload);
    assert.equal((await snapshot()).payload.broker,'นายหน้าทดสอบ');
    const brokerCurrent=await snapshot();
    await db.query('update lots set broker=$1 where id=$2',['ชื่อใหม่',first.lot_id]);
    await assert.rejects(update('broker-conflict',brokerCurrent.version,brokerCurrent.payload),e=>e.code==='PT412');
    const brokerChanged=await snapshot();
    await update('clear-broker',brokerChanged.version,{...brokerChanged.payload,broker:''});
    assert.equal((await snapshot()).payload.broker,'');
    await db.query('delete from lots where id=$1',[first.lot_id]);
    assert.equal((await update('edit-1',before.version)).replayed,true);
    assert.equal((await call('source-1')).lot_id,first.lot_id);
    assert.equal((await counts()).lots,0);
    await db.exec("set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'");
    assert.equal((await counts()).receipts,0);
    await db.exec('reset role; set role anon');
    await assert.rejects(call('anonymous'),e=>e.code==='42501');
    await assert.rejects(update('anonymous',before.version),e=>e.code==='42501');
    await assert.rejects(snapshot(),e=>e.code==='42501');
    console.log('PASS: SQL migrations, create/update, preserved rows, replay, stale/child conflicts, atomic rollback, deleted-lot retry, receipt RLS, anonymous denial');
  } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
