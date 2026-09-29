import { revalidatePath } from "next/cache";
import { authenticate, body, handle, json } from "@/lib/api/http";
import { ApiError, date, parseLot } from "@/lib/api/validation";
import { preview } from "@/lib/api/lots";
export async function POST(request: Request) {
  return handle(async()=>{
    const db=await authenticate(request);
    const key=request.headers.get("idempotency-key") ?? "";
    if(!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new ApiError(422,"validation_error","Idempotency-Key required: 1–128 ASCII letters, digits, dot, underscore, colon or hyphen");
    const payload=parseLot(await body(request));
    const {data,error}=await db.rpc("import_accounting_lot",{p_key:key,p_payload:payload});
    if(error) {
      if(error.code==="PT409") throw new ApiError(409,"idempotency_conflict","Key already used with a different payload");
      if(error.code==="PGRST202") throw new ApiError(503,"migration_required","Apply the accounting API migration first");
      throw error;
    }
    // A cache failure must not turn a committed write into an apparent failure.
    try { for(const path of ["/","/brokers","/monthly","/yearly",`/lots/${data.lot_id}`]) revalidatePath(path); } catch {}
    return json({data:{...data,summary:preview(payload),url:`/lots/${data.lot_id}`}},data.replayed?200:201);
  });
}
export async function GET(request: Request) {
  return handle(async()=>{
    const db=await authenticate(request);
    const params=new URL(request.url).searchParams;
    for(const key of params.keys()) if(!["from","to","limit","offset"].includes(key)) throw new ApiError(422,"validation_error",`Unknown query parameter: ${key}`);
    const integer=(name:string,fallback:number,max:number)=>{
      const raw=params.get(name)??String(fallback);
      if(!/^\d+$/.test(raw) || Number(raw)>max) throw new ApiError(422,"validation_error",`Invalid ${name}`);
      return Number(raw);
    };
    const limit=integer("limit",50,100),offset=integer("offset",0,1000000);
    if(limit<1) throw new ApiError(422,"validation_error","limit must be positive");
    const from=params.has("from")?date(params.get("from"),"from"):null;
    const to=params.has("to")?date(params.get("to"),"to"):null;
    if(from && to && from>to) throw new ApiError(422,"validation_error","from must be <= to");
    let query=db.from("lots").select("id,buy_date,broker,note,created_at,suppliers(name)",{count:"exact"}).order("buy_date",{ascending:false}).order("id").range(offset,offset+limit-1);
    if(from) query=query.gte("buy_date",from);
    if(to) query=query.lte("buy_date",to);
    const {data,error,count}=await query;
    if(error) throw error;
    return json({data,pagination:{limit,offset,total:count}});
  });
}
