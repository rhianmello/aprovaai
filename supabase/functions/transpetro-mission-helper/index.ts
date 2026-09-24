import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeAdmin } from "./authorize-admin.mjs";
const BASE="https://qapi.otunac.com/api";
const enc=new TextEncoder();
function out(x:any,s=200){return new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json"}})}
async function sha(s:string){const b=await crypto.subtle.digest("SHA-256",enc.encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
function norm(s:any){return String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim()}
async function get(params:Record<string,string>){
 const key=Deno.env.get("QAPI_KEY"); if(!key) throw new Error("QAPI_KEY ausente");
 const u=new URL(BASE+"/questoes");Object.entries(params).forEach(([k,v])=>v&&u.searchParams.set(k,v));
 const c=new AbortController();const tm=setTimeout(()=>c.abort(),20000);
 try{const r=await fetch(u,{headers:{"Q-Api-Key":key,"Accept":"application/json"},signal:c.signal});
 const d=await r.json();if(!r.ok)throw new Error("QAPI "+r.status);return d;}finally{clearTimeout(tm)}
}
function arr(d:any){return Array.isArray(d?.questoes)?d.questoes:Array.isArray(d?.data)?d.data:[]}
function invalidDependency(q:any,st:string){
 const hasAsset=Boolean(q.imagem||q.image||q.figura||q.texto||q.textCode||q.codigoTexto||q.texto_id);
 return hasAsset || /(figura|imagem|gr[aá]fico|quadro)\s+(abaixo|acima|a seguir)|texto\s+(acima|abaixo|a seguir)/i.test(st);
}
async function normalizeItem(q:any){
 const st=String(q.enunciado??q.statement??"").trim(); const ans=String(q.gabarito??q.answer??"").trim().toUpperCase();
 const alts:any={A:String(q.opcaoA??q.alternativaA??"").trim(),B:String(q.opcaoB??q.alternativaB??"").trim(),C:String(q.opcaoC??q.alternativaC??"").trim(),D:String(q.opcaoD??q.alternativaD??"").trim(),E:String(q.opcaoE??q.alternativaE??"").trim()};
 const errors:string[]=[]; if(!st)errors.push("statement_empty"); if(!["A","B","C","D","E"].includes(ans))errors.push("answer_invalid");
 if(Object.values(alts).some(v=>!v))errors.push("alternatives_incomplete"); if(invalidDependency(q,st))errors.push("external_dependency");
 const ext=String(q._id??q.id??q.codigo??"").trim(); if(!ext)errors.push("external_id_missing");
 const ns=norm(st); const na=Object.fromEntries(Object.entries(alts).map(([k,v])=>[k,norm(v)]));
 const sh=await sha(ns); const fh=await sha(ns+"|"+JSON.stringify(na));
 return {external_id:ext,valid:errors.length===0,errors,warnings:[],question_type:"multipla_escolha",
 normalized_statement_hash:sh,normalized_full_hash:fh,normalized_alternatives:na,
 normalized:{statement:st,alternatives:alts,answer:ans,explanation:String(q.explicacao??q.comentario??"").trim(),
 year:String(q.ano??""),banca:String(q.banca??""),orgao:String(q.orgao??""),cargo:String(q.cargo??""),materia:String(q.materia??""),assunto:String(q.assunto??""),exam:String(q.prova??""),textCode:""},
 raw_payload:q};
}
Deno.serve(async(req)=>{
 try{
  if(req.method!=="POST")return out({ok:false,error:"method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)throw new Error("supabase env");
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const access=await authorizeAdmin(req,sb);
  if("error" in access)return out({ok:false,error:access.error},access.status);
  const b=await req.json().catch(()=>({})); const action=String(b.action??"");
  if(action==="probe"){
    const d=await get({page:"1",size:"1",materia:String(b.materia??""),orgao:String(b.orgao??""),cargo:String(b.cargo??"")});
    return out({ok:true,total:Number(d?.total??0),pages:Number(d?.pages??0),sample:arr(d)[0]??null});
  }
  if(action!=="import")return out({ok:false,error:"action"},400);
  const materia=String(b.materia??"").trim(),orgao=String(b.orgao??"").trim(),cargo=String(b.cargo??"").trim();
  const maxPages=Math.max(1,Math.min(20,Number(b.max_pages)||5)); const pageStart=Math.max(1,Number(b.page_start)||1);
  const summaries:any[]=[]; let totalImported=0,totalReused=0,totalDuplicates=0,totalRejected=0,totalFound=0;
  for(let page=pageStart;page<pageStart+maxPages;page++){
    const d=await get({page:String(page),size:"10",materia,orgao,cargo}); const rows=arr(d); if(!rows.length)break;
    const items=[];for(const r of rows)items.push(await normalizeItem(r)); totalFound+=rows.length;
    const {data,error}=await sb.rpc("import_qapi_controlled_batch",{p_requested_by:access.userId,p_page:page,p_size:10,p_materia:materia,
      p_preparation_slug:"transpetro-mission-2026",p_parser_version:"mission-v1",p_items:items});
    if(error)throw error; const s=data?.summary??{};totalImported+=Number(s.imported??0);totalReused+=Number(s.reused??0);
    totalDuplicates+=Number(s.duplicates??0);totalRejected+=Number(s.rejected??0);summaries.push({page,summary:s});
    if(rows.length<10)break;
  }
  return out({ok:true,materia,orgao,cargo,found:totalFound,imported:totalImported,reused:totalReused,duplicates:totalDuplicates,rejected:totalRejected,pages:summaries});
 }catch(e){return out({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});
