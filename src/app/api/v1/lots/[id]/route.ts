import { revalidatePath } from "next/cache";
import { authenticate, body, handle, json } from "@/lib/api/http";
import { ApiError, parseLot, uuid } from "@/lib/api/validation";
import { LOT_SELECT, preview, summary } from "@/lib/api/lots";
import type { LotWithChildren } from "@/lib/types";
export async function GET(request: Request, context: {params:Promise<{id:string}>}) {
  return handle(async()=>{
    const db=await authenticate(request);
    const id=uuid((await context.params).id);
    if (new URL(request.url).searchParams.get("edit") === "1") {
      const {data,error}=await db.rpc("accounting_lot_snapshot",{p_id:id});
      if(error?.code === "PGRST202") throw new ApiError(503,"migration_required","Apply the lot updates migration first");
      if(error) throw error;
      if(!data) throw new ApiError(404,"not_found","Lot not found");
      return json({data});
    }
    const {data,error}=await db.from("lots").select(LOT_SELECT).eq("id",id).maybeSingle();
    if(error) throw error;
    if(!data) throw new ApiError(404,"not_found","Lot not found");
    return json({data:{lot:data,summary:summary(data as LotWithChildren)}});
  });
}

// Full replacement of the reviewed lot, guarded by its snapshot version.
export async function PUT(request: Request, context: {params:Promise<{id:string}>}) {
  return handle(async()=>{
    const db=await authenticate(request);
    const id=uuid((await context.params).id);
    const key=request.headers.get("idempotency-key") ?? "";
    const version=request.headers.get("if-match") ?? "";
    if(!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new ApiError(422,"validation_error","Valid Idempotency-Key required");
    if(!/^[a-f0-9]{32}$/.test(version)) throw new ApiError(422,"validation_error","If-Match must contain the version from GET ?edit=1");
    const payload=parseLot(await body(request));
    const {data,error}=await db.rpc("update_accounting_lot",{p_id:id,p_key:key,p_version:version,p_payload:payload});
    if(error) {
      if(error.code==="PT409") throw new ApiError(409,"idempotency_conflict","Key already used for a different write");
      if(error.code==="PT412") throw new ApiError(412,"lot_changed","Lot changed; read the latest lot and review again");
      if(error.code==="PT404") throw new ApiError(404,"not_found","Lot not found");
      if(error.code==="PGRST202") throw new ApiError(503,"migration_required","Apply the lot updates migration first");
      throw error;
    }
    try { for(const path of ["/","/brokers","/monthly","/yearly",`/lots/${id}`]) revalidatePath(path); } catch {}
    return json({data:{...data,summary:preview(payload),url:`/lots/${id}`}});
  });
}
