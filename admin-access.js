/* Exibe controles administrativos somente para administradores autenticados. */
(function(){
'use strict';
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
async function boot(){
  try{
    if(!window.supabase?.createClient)return;
    const sb=window.__NP_PUBLIC_SB||(window.__NP_PUBLIC_SB=window.supabase.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}}));
    const set=async(session)=>{
      let ok=false;
      if(session){const r=await sb.rpc('is_admin');ok=!r.error&&r.data===true}
      document.querySelectorAll('[data-admin-only]').forEach(el=>{el.hidden=!ok;el.style.display=ok?'inline-flex':'none'});
    };
    const s=await sb.auth.getSession();await set(s.data?.session||null);
    sb.auth.onAuthStateChange((_e,session)=>set(session));
  }catch(e){console.warn('[AdminAccess]',e)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();