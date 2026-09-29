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
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
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

test('edit snapshot and PUT validate target/version, preserve preconditions and map conflicts',async()=>{
 const http=load('src/lib/api/http.ts'); const id='00000000-0000-0000-0000-000000000001',version='a'.repeat(32);
 let calls=[],result={data:{lot_id:id,replayed:false},error:null};
 const route=load('src/app/api/v1/lots/[id]/route.ts',{'next/cache':{revalidatePath:()=>{}},'@/lib/api/http':{...http,authenticate:async()=>({rpc:async(name,args)=>{calls.push({name,args});return result;}})}});
 const context={params:Promise.resolve({id})};
 const req=(v=version)=>new Request(`http://localhost/api/v1/lots/${id}`,{method:'PUT',headers:{'Content-Type':'application/json','Idempotency-Key':'edit-1','If-Match':v},body:JSON.stringify(valid())});
 assert.equal((await route.PUT(req(''),context)).status,422);assert.equal(calls.length,0);
 assert.equal((await route.PUT(req(),context)).status,200);
 assert.equal(calls[0].name,'update_accounting_lot');assert.equal(calls[0].args.p_version,version);assert.equal(calls[0].args.p_id,id);
 for(const [code,status] of [['PT412',412],['PT409',409],['PT404',404],['PGRST202',503]]) {result={data:null,error:{code}};assert.equal((await route.PUT(req(),context)).status,status);}
 result={data:{payload:valid(),version},error:null};
 const snapshot=await route.GET(new Request(`http://localhost/api/v1/lots/${id}?edit=1`),context);
 assert.equal(snapshot.status,200);assert.equal((await snapshot.json()).data.version,version);
 assert.equal(calls.at(-1).name,'accounting_lot_snapshot');
 result={data:null,error:null};assert.equal((await route.GET(new Request('http://localhost?edit=1'),context)).status,404);
});

test('broker input trims names and preserves omitted field for legacy clients',()=>{
  assert.equal(parseLot({...valid(),broker:'  สมชาย  '}).broker,'สมชาย');
  assert.equal(parseLot({...valid(),broker:'  '}).broker,'');
  assert.equal(Object.hasOwn(parseLot(valid()),'broker'),false);
  for (const broker of [null,123,[], 'x'.repeat(2001)]) assert.throws(()=>parseLot({...valid(),broker}),/broker/);
});

test('broker performance reconciles ledger, uses weighted ratios and includes unassigned/unsold lots',()=>{
  const {brokerComparison}=load('src/lib/brokers.ts');
  const {calcTotals}=load('src/lib/summary.ts');
  const row=(id,broker,buy,sell,expenses=[])=>{
    const input=parseLot({...valid(),broker,buy_lines:[{size_code:'1',weight_kg:buy,cost_per_kg:100}],sell_lines:sell?[{size_code:'1',sell_date:'2026-05-15',weight_kg:sell,price_per_kg:150}]:[],expenses,adjustments:[]});
    return {lot:{id,broker:input.broker,sell_lines:input.sell_lines},s:preview(input)};
  };
  const rows=[row('a',' สมชาย ',100,120,[{category:'ค่านายหน้า',amount:200}]),row('b','สมชาย',900,900),row('c',undefined,50,0),row('d','',0,0)];
  const groups=brokerComparison(rows),person=groups.find(g=>g.name==='สมชาย'),unassigned=groups.find(g=>g.name==='');
  assert.equal(groups.length,2);assert.equal(person.lots.length,2);
  assert.equal(person.headlinePct,0.02);assert.equal(person.buyKg,1000);
  assert.equal(person.expenseTotal,2036);assert.equal(person.profit,50964);
  assert.equal(person.profitPerKg,50.964);assert.equal(person.margin,50964/153000);
  assert.equal(unassigned.unsoldCount,2);assert.equal(unassigned.profit,-5000);
  assert.equal(groups.reduce((n,g)=>n+g.profit,0),calcTotals(rows).profit);
  const empty=brokerComparison([row('e','empty',0,0)])[0];
  assert.equal(empty.profitPerKg,null);assert.equal(empty.margin,null);assert.equal(empty.headlinePct,null);
  assert.deepEqual(brokerComparison([]),[]);
});

test('broker dashboard paginates, filters by purchase date and broker, and renders lot links',async()=>{
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const lots=Array.from({length:501},(_,i)=>({id:`lot-${i}`,buy_date:i===500?'2026-06-01':'2026-05-01',broker:i===500?'สมชาย':'',suppliers:{name:'ฟาร์ม'},buy_lines:[],sell_lines:[],adjustments:[],expenses:[]}));
  const ranges=[];
  const query={select(){return this;},order(){return this;},async range(from,to){ranges.push([from,to]);return {data:lots.slice(from,to+1),error:null};}};
  const Page=load('src/app/(app)/brokers/page.tsx',{
    '@/lib/supabase/server':{createClient:async()=>({from:()=>query})},
    'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
  }).default;
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({m:'6',y:'2026',broker:'สมชาย'})}));
  assert.deepEqual(ranges,[[0,499],[500,999]]);
  assert.match(html,/href="\/lots\/lot-500"/);assert.doesNotMatch(html,/href="\/lots\/lot-0"/);
  assert.match(html,/ยังไม่มีรายการขาย/);assert.match(html,/สมชาย/);
  const empty=renderToStaticMarkup(await Page({searchParams:Promise.resolve({m:'7'})}));
  assert.match(empty,/ไม่พบล็อตในช่วงที่เลือก/);
});

test('bulk broker update validates selection and auth, changes only selected broker fields, and refreshes reports',async()=>{
  const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'];
  let user={id:'user'},failure=null,calls=[];const paths=[];
  const query={update(values){calls.push(['update',values]);return this;},in(column,values){calls.push(['in',column,values]);return this;},async select(){return {data:ids.map(id=>({id})),error:failure};}};
  const {bulkUpdateBroker}=load('src/app/broker-actions.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})},from(table){calls.push(['from',table]);return query;}})},
    'next/cache':{revalidatePath:p=>paths.push(p)},
  });
  for(const args of [[[], 'นาย ก','assign'],[['bad-id'],'นาย ก','assign'],[ids,'  ','assign'],[ids,'name','invalid'],[ids,'x'.repeat(2001),'assign'],[Array(1001).fill(ids[0]),'name','assign']])assert.ok('error' in await bulkUpdateBroker(...args));
  assert.deepEqual(calls,[]);
  user=null;assert.ok('error' in await bulkUpdateBroker(ids,'นาย ก','assign'));assert.deepEqual(calls,[]);
  user={id:'user'};
  assert.deepEqual(await bulkUpdateBroker([...ids,ids[0]],' นาย ก ','assign'),{updated:2});
  assert.deepEqual(calls,[['from','lots'],['update',{broker:'นาย ก'}],['in','id',ids]]);
  assert.deepEqual(paths,['/','/brokers',...ids.map(id=>`/lots/${id}`)]);
  calls=[];await bulkUpdateBroker(ids,'ignored','clear');assert.deepEqual(calls[1],['update',{broker:''}]);
  failure={message:'database error'};paths.length=0;
  assert.ok('error' in await bulkUpdateBroker(ids,'นาย ข','assign'));assert.deepEqual(paths,[]);
});
