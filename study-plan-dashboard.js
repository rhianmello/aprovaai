/* Nós Passa — card isolado de desempenho do Meu Plano. */
(function(){
'use strict';
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
const C=window.STUDY_CONFIG||{},sb=supabase.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}}),slug=C.courseSlug||C.slug;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=s=>{s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?`${h}h ${String(m).padStart(2,'0')}min`:`${m}min`};
const dayStart=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x},weekStart=d=>{const x=dayStart(d);x.setDate(x.getDate()-x.getDay());return x},iso=d=>d.toISOString();
let cachedHtml='',loading=false;
async function getCourseId(){const r=await fetch('./course-access.js?v=20260909-2',{cache:'no-store'});if(!r.ok)throw Error('course config');const t=await r.text(),m=t.match(/const IDS\s*=\s*\{([^}]+)\}/);if(!m)throw Error('course map');const map={};for(const h of m[1].matchAll(/['"]([^'"]+)['"]\s*:\s*(\d+)/g))map[h[1]]=Number(h[2]);return map[slug]}
function overlap(i,a,b){const st=Math.max(new Date(i.started_at).getTime(),a.getTime());const en=Math.min((i.ended_at?new Date(i.ended_at):new Date(i.last_heartbeat_at||Date.now())).getTime(),b.getTime());return en>st?(en-st)/1000:0}
function restore(){if(!cachedHtml)return false;const host=document.querySelector('#home .dashboard-grid')||document.querySelector('#home');if(!host||document.querySelector('.np-plan-card'))return false;const card=document.createElement('section');card.className='panel np-plan-card';card.innerHTML=cachedHtml;host.appendChild(card);return true}
async function render(){
 if(document.querySelector('.np-plan-card'))return;if(restore())return;if(loading)return;const host=document.querySelector('#home .dashboard-grid')||document.querySelector('#home');if(!host||!window.__NP_AUTH_USER||!slug)return;loading=true;
 try{
  const courseId=await getCourseId();if(!Number.isInteger(courseId))return;const user=window.__NP_AUTH_USER;
  const{data:plan,error:pe}=await sb.from('study_plans').select('id,name').eq('user_id',user.id).eq('course_id',courseId).eq('active',true).maybeSingle();if(pe)throw pe;
  const card=document.createElement('section');card.className='panel np-plan-card';
  if(!plan){card.innerHTML=`<div class="np-plan-head"><div><h2>📚 Meu Plano</h2><div class="panel-sub">Organize sua rotina semanal de estudos.</div></div></div><div class="np-plan-empty"><strong>Você ainda não montou sua rotina.</strong><p>Crie seu plano para transformar o conteúdo do curso em uma rotina de estudo.</p><a class="btn" href="./meu-plano.html?course=${encodeURIComponent(slug)}">Criar meu plano</a></div>`;cachedHtml=card.innerHTML;host.appendChild(card);return}
  const ws=weekStart(new Date()),we=new Date(ws);we.setDate(we.getDate()+7),today=dayStart(new Date()),tom=new Date(today);tom.setDate(tom.getDate()+1);
  const[{data:acts,error:ae},{data:sessions,error:se},{data:intervals,error:ie}]=await Promise.all([
   sb.from('study_plan_activities').select('id,day_of_week,planned_duration,active').eq('user_id',user.id).eq('course_id',courseId).eq('plan_id',plan.id).eq('active',true),
   sb.from('study_sessions').select('id,plan_activity_id,status,started_at').eq('user_id',user.id).eq('course_id',courseId).gte('started_at',iso(ws)).lt('started_at',iso(we)),
   sb.from('study_session_intervals').select('session_id,started_at,ended_at,last_heartbeat_at').eq('user_id',user.id).eq('course_id',courseId).lt('started_at',iso(we)).or(`ended_at.is.null,ended_at.gt.${iso(ws)}`)
  ]);if(ae)throw ae;if(se)throw se;if(ie)throw ie;
  const activities=acts||[],sess=sessions||[],ints=intervals||[];
  const plannedWeek=activities.reduce((n,a)=>n+Number(a.planned_duration||0),0)*60,plannedToday=activities.filter(a=>a.day_of_week===today.getDay()).reduce((n,a)=>n+Number(a.planned_duration||0),0)*60;
  const studiedWeek=ints.reduce((n,i)=>n+overlap(i,ws,we),0),studiedToday=ints.reduce((n,i)=>n+overlap(i,today,tom),0),pct=plannedWeek?Math.min(100,Math.round(studiedWeek/plannedWeek*100)):0;
  const completedWeek=sess.filter(s=>s.status==='completed').length,todaySessions=sess.filter(s=>new Date(s.started_at)>=today&&new Date(s.started_at)<tom&&s.status==='completed').length,plannedSessionsWeek=activities.length,plannedSessionsToday=activities.filter(a=>a.day_of_week===today.getDay()).length;
  const byDay=Array.from({length:7},(_,d)=>{const ds=new Date(ws);ds.setDate(ds.getDate()+d);const de=new Date(ds);de.setDate(de.getDate()+1);return ints.reduce((n,i)=>n+overlap(i,ds,de),0)}),max=Math.max(60,...byDay);
  const message=pct>=100?'🔥 Meta semanal concluída!':pct>=50?'Boa evolução. Você já completou mais da metade da meta.':studiedWeek>0?'Você já começou. Continue construindo sua sequência.':'Vamos começar. Sua próxima sessão está esperando.';
  const days=['DOM','SEG','TER','QUA','QUI','SEX','SAB'];
  card.innerHTML=`<div class="np-plan-head"><div><h2>📚 Meu Plano</h2><div class="np-plan-name">${esc(plan.name)}</div></div><a class="btn secondary" href="./meu-plano.html?course=${encodeURIComponent(slug)}">Continuar plano</a></div><div class="np-plan-kpis"><div><span>Planejado</span><b>${fmt(plannedWeek)}</b><small>esta semana</small></div><div><span>Estudado</span><b>${fmt(studiedWeek)}</b><small>esta semana</small></div><div><span>Progresso</span><b>${pct}%</b><small>${completedWeek}/${plannedSessionsWeek} sessões na semana</small></div></div><div class="np-progress"><div><span>Meta semanal</span><strong>${fmt(studiedWeek)} / ${fmt(plannedWeek)}</strong></div><div class="np-progress-track"><i style="width:${pct}%"></i></div><p>${message}</p></div><div class="np-plan-today"><div><strong>Hoje</strong><span>${todaySessions}/${plannedSessionsToday} sessões · ${fmt(studiedToday)} estudados · ${fmt(Math.max(0,plannedToday-studiedToday))} restantes</span></div><div class="np-day-bars">${byDay.map((v,i)=>`<div class="np-day-bar"><span>${fmt(v)}</span><i><b style="height:${Math.max(3,Math.round(v/max*100))}%"></b></i><small>${days[i]}</small></div>`).join('')}</div></div>`;
  cachedHtml=card.innerHTML;host.appendChild(card);
 }finally{loading=false}
}
function boot(){render().catch(e=>console.error('[Meu Plano Dashboard]',e))}const obs=new MutationObserver(()=>boot());obs.observe(document.body,{childList:true,subtree:true});boot();
})();
