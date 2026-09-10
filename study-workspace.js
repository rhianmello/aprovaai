/* Nós Passa — Workspace de estudo integrado ao Meu Plano. */
(function(){
'use strict';
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
body.np-workspace-open .timer-sheet{z-index:220;right:28px;bottom:28px;width:280px;padding:12px;border-radius:14px}
body.np-workspace-open .timer-sheet .timer-label{font-size:9px}
body.np-workspace-open .timer-sheet .timer-title{font-size:15px;margin-top:4px}
body.np-workspace-open .timer-sheet .timer-topic{font-size:10px}
body.np-workspace-open .timer-sheet .timer-time{font-size:28px;margin:9px 0 4px;letter-spacing:0}
body.np-workspace-open .timer-sheet .timer-planned{font-size:10px}
body.np-workspace-open .timer-sheet .timer-actions{gap:5px;margin-top:8px}
body.np-workspace-open .timer-sheet .timer-actions .btn{padding:7px 8px;font-size:11px}
@media(max-width:700px){#npStudyWorkspace{inset:7px;border-radius:12px}body.np-workspace-open .timer-sheet{right:14px;bottom:14px;width:245px}}
`;
 document.head.appendChild(s);
}
function mount(){
 injectStyle();
 if($('npStudyWorkspace'))return;
 const el=document.createElement('section');el.id='npStudyWorkspace';el.innerHTML=`<header class="ws-head"><div class="ws-title">📚 Sessão de estudo<small id="npStudyTopic">Questões da preparação</small></div><div class="ws-actions"><button class="ws-btn" id="npStudyNewTab" type="button">↗ Abrir em nova aba</button><button class="ws-btn close" id="npStudyClose" type="button">Continuar no plano</button></div></header><iframe id="npStudyFrame" title="Questões da preparação" loading="eager"></iframe>`;
 document.body.appendChild(el);
 $('npStudyClose').onclick=close;
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
async function getActivityTopic(id){
 try{
  const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
  const sb=supabase.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
  const{data,error}=await sb.from('study_plan_activities').select('topic,subject').eq('id',id).maybeSingle();
  if(error)throw error;
  return data||{};
 }catch(e){console.warn('[Workspace] não foi possível carregar a atividade',e);return {}}
}
function bindStart(){
 if(typeof window.startActivity!=='function'||window.startActivity.__npWorkspaceWrapped)return;
 const original=window.startActivity;
 const wrapped=async function(id){
  const activity=await getActivityTopic(id);
  const result=await original(id);
  if(activity?.topic)open(activity.topic);
  return result;
 };
 wrapped.__npWorkspaceWrapped=true;
 window.startActivity=wrapped;
}
function init(){mount();bindStart();
 const timerObserver=new MutationObserver(()=>bindStart());
 timerObserver.observe(document.body,{childList:true,subtree:true});
 window.NPStudyWorkspace={open,close};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
