import { authenticate, body, handle, json } from "@/lib/api/http";
import { parseLot } from "@/lib/api/validation";
import { preview } from "@/lib/api/lots";
export async function POST(request: Request) {
  return handle(async()=>{
    await authenticate(request);
    const normalized=parseLot(await body(request));
    return json({data:{normalized,summary:preview(normalized)},persisted:false});
  });
}
