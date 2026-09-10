/* Nós Passa — contador anônimo de visitantes. Não coleta IP. */
(function(){
'use strict';
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
function id(){let v=localStorage.getItem('np_visitor_id');if(!v){v=crypto.randomUUID?crypto.randomUUID():'v-'+Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem('np_visitor_id',v)}return v}
async function ping(){try{if(!window.supabase?.createClient)return;const sb=window.supabase.createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});await sb.rpc('track_site_visit',{p_visitor_id:id(),p_path:location.pathname+p(),p_referrer:document.referrer||null,p_user_agent:navigator.userAgent})}catch(e){console.warn('[VisitorTracker]',e)}}
function p(){return location.search||''}
function start(){ping();setInterval(ping,60000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
