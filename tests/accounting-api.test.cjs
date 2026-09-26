/* eslint-disable @typescript-eslint/no-require-imports -- Node test harness loads TypeScript without extra dependencies. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const shared=new Map();
function load(file,mocks={}) {
  file=path.resolve(file);
  if(file.endsWith('/validation.ts') && shared.has(file))return shared.get(file);
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const loaded={exports:{}};
  const req=name=>{
    if(name in mocks)return mocks[name];
    if(name.startsWith('.') || name.startsWith('@/'))return load(name.startsWith('@/')?`src/${name.slice(2)}.ts`:path.resolve(path.dirname(file),`${name}.ts`),mocks);
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`,{filename:file})(req,loaded,loaded.exports);
  if(file.endsWith('/validation.ts'))shared.set(file,loaded.exports);
  return loaded.exports;
}
const {parseLot}=load('src/lib/api/validation.ts');
const {preview}=load('src/lib/api/lots.ts');
const valid=()=>({buy_date:'2026-05-14',supplier:'ระอองฟาร์ม',buy_lines:[{size_code:'1',weight_kg:100,cost_per_kg:150}],sell_lines:[{size_code:'1',sell_date:'2026-05-15',weight_kg:105,price_per_kg:200}],expenses:[{category:'ค่ารถ',amount:500}],adjustments:[{kind:'cost',amount:-100},{kind:'sales',amount:-50}]});
test('preview uses ledger totals, default fees, signed cost/sale adjustments',()=>{
  const s=preview(parseLot(valid()));
  assert.equal(s.costTotal,14900);assert.equal(s.feeTotal,252);
  assert.equal(s.profit,5298);assert.equal(s.headlineDiffKg,5);
});
test('explicit zero fee and baht override',()=>{
  const v=valid();v.sell_lines[0].fee_pct=0;assert.equal(preview(parseLot(v)).feeTotal,0);
  delete v.sell_lines[0].fee_pct;v.sell_lines[0].fee_amount=123.45;assert.equal(preview(parseLot(v)).feeTotal,123.45);
  v.sell_lines[0].fee_pct=1.2;assert.throws(()=>parseLot(v),/not both/);
});
test('invalid or ambiguous accounting data is rejected',()=>{
  for(const d of ['2569-05-14','2026-02-30','2026-13-01','14/5/69'])assert.throws(()=>parseLot({...valid(),buy_date:d}),/valid CE date/);
  for(const n of ['100',-1,NaN,Infinity,1.234,1.000001,10000000000]){
    const v=valid();v.buy_lines[0].weight_kg=n;assert.throws(()=>parseLot(v),/number/);
  }
  assert.throws(()=>parseLot({...valid(),buy_rows:[]}),/unknown field/);
  assert.throws(()=>parseLot({...valid(),buy_lines:Array(501).fill({})}),/500 rows/);
});
test('authentication rejects absent or invalid token without writing',async()=>{
  let calls=0;
  const http=load('src/lib/api/http.ts',{'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async()=>{calls++;return {data:{user:null},error:{}};}}})}});
  const r=await http.handle(()=>http.authenticate(new Request('http://localhost')));
  assert.equal(r.status,401);assert.equal(calls,0);
  const prev=[process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY];
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.test';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test';
  try {const r=await http.handle(()=>http.authenticate(new Request('http://localhost',{headers:{Authorization:'Bearer invalid'}})));assert.equal(r.status,401);assert.equal(calls,1);}
  finally {['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'].forEach((k,i)=>{if(prev[i]===undefined)delete process.env[k];else process.env[k]=prev[i];});}
});
test('body rejects malformed JSON, wrong media type and excessive bytes',async()=>{
  const http=load('src/lib/api/http.ts');
  for(const [body,type,status] of [['{','application/json',400],['{}','text/plain',415],['x'.repeat(1048577),'application/json',413]]){
    const r=await http.handle(()=>http.body(new Request('http://localhost',{method:'POST',body,headers:{'Content-Type':type}})));assert.equal(r.status,status);
  }
});
test('POST returns creation/replay/conflict responses and requires key',async()=>{
  let result={data:{lot_id:'00000000-0000-0000-0000-000000000001',replayed:false},error:null},calls=0;
  const http=load('src/lib/api/http.ts');
  const route=load('src/app/api/v1/lots/route.ts',{'next/cache':{revalidatePath:()=>{}},'@/lib/api/http':{...http,authenticate:async()=>({rpc:async()=>{calls++;return result;}})}});
  const req=(key=true)=>new Request('http://localhost/api/v1/lots',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':'source-1'}:{})},body:JSON.stringify(valid())});
  assert.equal((await route.POST(req(false))).status,422);assert.equal(calls,0);
  assert.equal((await route.POST(req())).status,201);
  result.data.replayed=true;assert.equal((await route.POST(req())).status,200);
  result.error={code:'PT409'};assert.equal((await route.POST(req())).status,409);
});
