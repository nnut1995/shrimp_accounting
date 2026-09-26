import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./validation";
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export async function handle(work: () => Promise<Response>) {
  try { return await work(); } catch (e) {
    if (e instanceof ApiError) return json({error:{code:e.code,message:e.message}},e.status);
    return json({error:{code:"internal_error",message:"Request failed. Retry writes only with the same Idempotency-Key and payload."}},500);
  }
}
export async function authenticate(request: Request) {
  const token = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) throw new ApiError(401,"unauthorized","Supabase user access token required");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiError(503,"not_configured","Supabase is not configured");
  const client = createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data,error} = await client.auth.getUser(token);
  if(error || !data.user) throw new ApiError(401,"unauthorized","Invalid or expired user access token");
  return client;
}
export async function body(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError(415,"unsupported_media_type","Use application/json");
  const reader=request.body?.getReader();
  if(!reader) throw new ApiError(400,"invalid_json","JSON body required");
  const chunks: Uint8Array[]=[]; let size=0;
  while(true) {
    const {done,value}=await reader.read(); if(done) break;
    size+=value.byteLength;
    if(size>1048576) { await reader.cancel(); throw new ApiError(413,"body_too_large","Body limit is 1 MiB"); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400,"invalid_json","Malformed JSON"); }
}
