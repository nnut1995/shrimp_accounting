import { authenticate, handle, json } from "@/lib/api/http";
import { ApiError, uuid } from "@/lib/api/validation";
import { LOT_SELECT, summary } from "@/lib/api/lots";
import type { LotWithChildren } from "@/lib/types";
export async function GET(request: Request, context: {params:Promise<{id:string}>}) {
  return handle(async()=>{
    const db=await authenticate(request);
    const id=uuid((await context.params).id);
    const {data,error}=await db.from("lots").select(LOT_SELECT).eq("id",id).maybeSingle();
    if(error) throw error;
    if(!data) throw new ApiError(404,"not_found","Lot not found");
    return json({data:{lot:data,summary:summary(data as LotWithChildren)}});
  });
}
