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
    await db.exec(`set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';`);
    const payload={buy_date:'2026-05-14',supplier:'Test farm',note:'',buy_lines:[{container:'80-3867',size_code:'custom',description:'',density:'',weight_kg:100,cost_per_kg:150,note:''}],sell_lines:[{sell_date:'2026-05-15',container:'80-3867',size_code:'custom',description:'',density:'',weight_kg:105,price_per_kg:200,buyer:'Test buyer',fee_pct:1.2,fee_amount:null}],expenses:[{category:'Transport',amount:500,note:''}],adjustments:[{kind:'cost',amount:-100,note:''}]};
    const call=(key,p=payload)=>db.query('select public.import_accounting_lot($1,$2::jsonb) as result',[key,JSON.stringify(p)]).then(x=>x.rows[0].result);
    const first=await call('source-1');assert.equal(first.replayed,false);
    const repeated=await call('source-1');assert.equal(repeated.replayed,true);assert.equal(first.lot_id,repeated.lot_id);
    await assert.rejects(call('source-1',{...payload,note:'Changed'}),e=>e.code==='PT409');
    const counts=async()=> (await db.query('select (select count(*)::int from lots) lots,(select count(*)::int from buy_lines) buys,(select count(*)::int from accounting_api_requests) receipts,(select count(*)::int from suppliers) suppliers')).rows[0];
    assert.deepEqual(await counts(),{lots:1,buys:1,receipts:1,suppliers:1});
    // Fail after lot, supplier, buy and sell inserts; all must roll back.
    await assert.rejects(call('bad-child',{...payload,supplier:'Should roll back',adjustments:[{kind:'invalid',amount:1,note:''}]}));
    assert.deepEqual(await counts(),{lots:1,buys:1,receipts:1,suppliers:1});
    await db.query('delete from lots where id=$1',[first.lot_id]);
    assert.equal((await call('source-1')).lot_id,first.lot_id);
    assert.equal((await counts()).lots,0);
    await db.exec("set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'");
    assert.equal((await counts()).receipts,0);
    await db.exec('reset role; set role anon');
    await assert.rejects(call('anonymous'),e=>e.code==='42501');
    console.log('PASS: SQL migration, import, replay, conflict, rollback, deleted-lot retry, receipt RLS, anonymous denial');
  } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
