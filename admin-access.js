/* Controles administrativos + exclusão do navegador ADM do analytics. */
(function(){
'use strict';
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function boot(){
  try{
    if(!window.supabase?.createClient)return;
    const sb=window.__NP_PUBLIC_SB||(window.__NP_PUBLIC_SB=window.supabase.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}}));
    const set=async(session)=>{
      let ok=false;
      if(session){const r=await sb.rpc('is_admin');ok=!r.error&&r.data===true}
      document.querySelectorAll('[data-admin-only]').forEach(el=>{el.hidden=!ok;el.style.display=ok?'inline-flex':'none'});
      if(ok){
        const id=localStorage.getItem('np_visitor_id');
        if(id&&UUID.test(id)){try{await sb.rpc('exclude_my_admin_browser',{p_visitor_id:id})}catch(e){}}
      }
    };
    const s=await sb.auth.getSession();await set(s.data?.session||null);
    sb.auth.onAuthStateChange((_e,session)=>set(session));
  }catch(e){console.warn('[AdminAccess]',e)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();