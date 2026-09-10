/* Nós Passa — Workspace de estudo integrado ao Meu Plano. */
(function(){
'use strict';
/* Singleton: evita duas instâncias quando o navegador reutiliza/cacheia a página. */
if(window.__NP_STUDY_WORKSPACE_INITIALIZED)return;
window.__NP_STUDY_WORKSPACE_INITIALIZED=true;
const qs=new URLSearchParams(location.search),courseSlug=(qs.get('course')||'').trim();
if(courseSlug!=='transpetro')return;
const $=id=>document.getElementById(id);
let currentTopic='';
function injectStyle(){
 if(document.getElementById('npStudyWorkspaceStyle'))return;
 const s=document.createElement('style');s.id='npStudyWorkspaceStyle';s.textContent=`
#npStudyWorkspace{position:fixed;inset:18px;z-index:110;display:none;background:#070a0e;border:1px solid #35404b;border-radius:18px;box-shadow:0 30px 100px #000b;overflow:hidden}
#npStudyWorkspace.open{display:flex;flex-direction:column}
#npStudyWorkspace .ws-head{height:54px;flex:0 0 54px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 14px;background:#111821;border-bottom:1px solid #2a3440}
#npStudyWorkspace .ws-title{font-weight:900;color:#fff;font-size:14px}
#npStudyWorkspace .ws-title small{display:block;color:#8f9aa5;font-size:10px;font-weight:700;margin-top:3px}
#npStudyWorkspace .ws-actions{display:flex;gap:7px;align-items:center}
#npStudyWorkspace .ws-btn{border:1px solid #35404b;background:#1a222c;color:#fff;border-radius:9px;padding:8px 11px;font-weight:800;cursor:pointer}
#npStudyWorkspace .ws-btn.close{background:#e4c64a;color:#111;border-color:#e4c64a}
#npStudyWorkspace iframe{width:100%;height:100%;border:0;background:#070a0e}
body.np-workspace-open{overflow:hidden}
/* Desktop: painel compacto no canto, sem esconder a questão. */
body.np-workspace-open .timer-sheet{z-index:220;right:20px;bottom:20px;width:270px;padding:11px;border-radius:14px}
body.np-workspace-open .timer-sheet .timer-label{font-size:9px}
body.np-workspace-open .timer-sheet .timer-title{font-size:15px;margin-top:3px}
body.np-workspace-open .timer-sheet .timer-topic{font-size:10px}
body.np-workspace-open .timer-sheet .timer-time{font-size:27px;margin:8px 0 3px;letter-spacing:0}
body.np-workspace-open .timer-sheet .timer-planned{font-size:10px}
body.np-workspace-open .timer-sheet .timer-actions{gap:5px;margin-top:7px}
body.np-workspace-open .timer-sheet .timer-actions .btn{padding:7px 8px;font-size:11px}
/* Mobile: transforma o relógio em uma barra fina, em vez de um cartão que cobre as questões. */
@media(max-width:700px){
 #npStudyWorkspace{inset:0;border-radius:0}
 #npStudyWorkspace .ws-head{height:52px;flex-basis:52px;padding:0 9px;gap:6px}
 #npStudyWorkspace .ws-title{font-size:12px}
 #npStudyWorkspace .ws-title small{font-size:9px}
 #npStudyWorkspace .ws-actions{gap:4px}
 #npStudyWorkspace .ws-btn{padding:7px 8px;font-size:10px}
 #npStudyWorkspace #npStudyNewTab{display:none}
 body.np-workspace-open .timer-sheet{left:8px;right:8px;bottom:8px;width:auto;height:58px;padding:7px 8px;border-radius:12px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:7px}
 body.np-workspace-open .timer-sheet .timer-label,body.np-workspace-open .timer-sheet .timer-topic,body.np-workspace-open .timer-sheet .timer-planned{display:none}
 body.np-workspace-open .timer-sheet .timer-title{font-size:11px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 body.np-workspace-open .timer-sheet .timer-time{font-size:20px;margin:0;letter-spacing:0;white-space:nowrap}
 body.np-workspace-open .timer-sheet .timer-actions{display:flex;gap:4px;margin:0}
 body.np-workspace-open .timer-sheet .timer-actions .btn{min-width:48px;padding:7px 6px;font-size:9px;border-radius:8px}
}
`;
 document.head.appendChild(s);
}
function mount(){
 injectStyle();
 if($('npStudyWorkspace'))return;
 const el=document.createElement('section');el.id='npStudyWorkspace';el.innerHTML=`<header class="ws-head"><div class="ws-title">📚 Sessão de estudo<small id="npStudyTopic">Questões da preparação</small></div><div class="ws-actions"><button class="ws-btn" id="npStudyNewTab" type="button">↗ Abrir em nova aba</button><button class="ws-btn close" id="npStudyClose" type="button">Continuar no plano</button></div></header><iframe id="npStudyFrame" title="Questões da preparação" loading="eager"></iframe>`;
 document.body.appendChild(el);
 $('npStudyClose').onclick=close;
 /* Nova aba só é aberta por ação explícita do usuário. Iniciar nunca chama window.open. */
 $('npStudyNewTab').onclick=()=>{const u=buildUrl();if(u)window.open(u,'_blank','noopener,noreferrer')};
}
function buildUrl(){if(!currentTopic)return `questoes-academicas.html?course=transpetro`;return `questoes-academicas.html?course=transpetro&topic=${encodeURIComponent(currentTopic)}`}
function open(topic){
 currentTopic=String(topic||'').trim();
 mount();
 const url=buildUrl();
 $('npStudyTopic').textContent=currentTopic||'Questões da preparação';
 const frame=$('npStudyFrame');
 if(frame.src!==new URL(url,location.href).href)frame.src=url;
 $('npStudyWorkspace').classList.add('open');
 document.body.classList.add('np-workspace-open');
}
function close(){
 $('npStudyWorkspace')?.classList.remove('open');
 document.body.classList.remove('np-workspace-open');
}
async function sbClient(){
 const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
 return supabase.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
}
async function getActivityTopic(id){
 try{const sb=await sbClient();const{data,error}=await sb.from('study_plan_activities').select('topic,subject').eq('id',id).maybeSingle();if(error)throw error;return data||{}}
 catch(e){console.warn('[Workspace] não foi possível carregar a atividade',e);return {}}
}
async function getSessionByActivity(id){
 try{const sb=await sbClient();const{data,error}=await sb.from('study_sessions').select('id,status,plan_activity_id').eq('plan_activity_id',id).in('status',['running','paused']).maybeSingle();if(error)throw error;return data||null}
 catch(e){console.warn('[Workspace] não foi possível validar a sessão',e);return null}
}
function bindStart(){
 if(typeof window.startActivity==='function'&&!window.startActivity.__npWorkspaceWrapped){
  const original=window.startActivity;
  const wrapped=async function(id){const activity=await getActivityTopic(id);const result=await original(id);const started=await getSessionByActivity(id);if(started?.status==='running'&&activity?.topic)open(activity.topic);return result};
  wrapped.__npWorkspaceWrapped=true;window.startActivity=wrapped;
 }
 if(typeof window.resumeSession==='function'&&!window.resumeSession.__npWorkspaceWrapped){
  const original=window.resumeSession;
  const wrapped=async function(id){const activity=await getActivityTopicFromSession(id);const result=await original(id);const started=await getSessionById(id);if(started?.status==='running'&&activity?.topic)open(activity.topic);return result};
  wrapped.__npWorkspaceWrapped=true;window.resumeSession=wrapped;
 }
}
async function getActivityTopicFromSession(sessionId){
 try{const sb=await sbClient();const{data,error}=await sb.from('study_sessions').select('plan_activity_id,study_plan_activities(topic,subject)').eq('id',sessionId).maybeSingle();if(error)throw error;return data?.study_plan_activities||{}}
 catch(e){console.warn('[Workspace] não foi possível localizar o tópico da sessão',e);return {}}
}
async function getSessionById(id){
 try{const sb=await sbClient();const{data,error}=await sb.from('study_sessions').select('id,status').eq('id',id).maybeSingle();if(error)throw error;return data||null}
 catch(e){return null}
}
function init(){mount();bindStart();const observer=new MutationObserver(()=>bindStart());observer.observe(document.body,{childList:true,subtree:true});window.NPStudyWorkspace={open,close}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
