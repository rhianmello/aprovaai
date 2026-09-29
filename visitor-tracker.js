/* Nós Passa — rastreamento anônimo de tráfego */
(function(){
'use strict';
const U='https://ztqtcbzjesrkuaijmylm.supabase.co';
const K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
function visitorId(){let v=localStorage.getItem('np_visitor_id');if(!v){v=crypto.randomUUID?crypto.randomUUID():'v-'+Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem('np_visitor_id',v)}return v}
async function run(){try{
 if(!window.supabase?.createClient){await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
 const sb=window.supabase.createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 await sb.rpc('track_site_visit',{p_visitor_id:visitorId(),p_path:location.pathname+(location.search||''),p_referrer:document.referrer||null,p_user_agent:navigator.userAgent});
}catch(e){console.warn('[Nós Passa analytics]',e)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();