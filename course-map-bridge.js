/* Bridge legado: o Meu Plano V2 ainda lê o mapa IDS do course-access.js. Aqui o mapa é gerado em tempo real a partir do catálogo Supabase. */
(function(){
'use strict';
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
const originalFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
 const url=typeof input==='string'?input:(input?.url||'');
 if(url.includes('/course-access.js')){
  try{
   const client=window.supabase.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
   const {data,error}=await client.from('courses').select('id,slug').eq('active',true);
   if(!error){
    const base=await originalFetch(input,init);const text=await base.text();
    const ids={};(data||[]).forEach(c=>{ids[c.slug]=Number(c.id)});
    const prefix='const IDS='+JSON.stringify(ids)+';\n';
    return new Response(prefix+text,{status:base.status,statusText:base.statusText,headers:base.headers});
   }
  }catch(e){console.warn('[CourseMapBridge]',e)}
 }
 return originalFetch(input,init);
};
})();