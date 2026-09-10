/* Nós Passa — integração acadêmica do Meu Plano (Transpetro 2026 SAP).
 * Mantém o motor legado e acrescenta Disciplina → Item do edital → Subtópico,
 * persistindo preparation_id/content_item_id nas atividades.
 */
(function(){
'use strict';
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
const sb=supabase.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
const slug=(new URLSearchParams(location.search).get('course')||'').trim();
if(slug!=='transpetro')return;
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
let user=null,courseId=2,preparation=null,items=[],bySubject=new Map(),byItem=new Map(),pending=null,ready=false;
async function init(){
  const session=(await sb.auth.getSession()).data.session;if(!session?.user)return;user=session.user;
  const p=await sb.from('preparations').select('id,name,slug').eq('slug','transpetro-2026-analise-de-sistemas-sap').maybeSingle();
  if(p.error)throw p.error;if(!p.data)return;preparation=p.data;
  const r=await sb.from('academic_content_items').select('id,title,subject_id,topic_id,subtopic_id,academic_subjects(name),academic_subtopics(id,name)').eq('preparation_id',preparation.id).eq('active',true).order('sort_order');
  if(r.error)throw r.error;items=r.data||[];
  items.forEach(x=>{const s=x.academic_subjects?.name||'';if(!bySubject.has(s))bySubject.set(s,[]);bySubject.get(s).push(x);byItem.set(x.id,x)});
  await ensurePlanPreparation();ready=true;mount();
}
async function ensurePlanPreparation(){
  const r=await sb.from('study_plans').select('id,preparation_id').eq('user_id',user.id).eq('course_id',courseId).eq('active',true).order('created_at',{ascending:false}).limit(1);
  if(r.error)throw r.error;const p=r.data?.[0];if(p&&p.preparation_id!==preparation.id){const u=await sb.from('study_plans').update({preparation_id:preparation.id}).eq('id',p.id).eq('user_id',user.id).eq('course_id',courseId);if(u.error)console.warn('[Meu Plano Acadêmico] preparação do plano não atualizada',u.error)}}
function subjectSelect(){return $('activitySubject')}
function topicSelect(){return $('activityTopic')}
function ensureSubtopic(){
  if($('activitySubtopic'))return $('activitySubtopic');
  const topic=topicSelect();if(!topic)return null;
  const wrap=topic.closest('.field');if(!wrap)return null;
  const f=document.createElement('div');f.className='field';f.innerHTML='<label for="activitySubtopic">Subtópico</label><select id="activitySubtopic" required><option value="">Selecione o subtópico</option></select><small class="academic-help">Nível detalhado usado pelo Meu Plano e pelas questões.</small>';
  wrap.parentNode.insertBefore(f,wrap.nextSibling);return $('activitySubtopic');
}
function fillSubjects(){const s=subjectSelect();if(!s)return;const names=[...bySubject.keys()];s.innerHTML='<option value="">Selecione a disciplina</option>'+names.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}
function fillItems(subject,keep){const t=topicSelect();if(!t)return;const arr=bySubject.get(subject)||[];t.innerHTML='<option value="">Selecione o item do edital</option>'+arr.map(x=>`<option value="${esc(x.title)}">${esc(x.title)}</option>`).join('');if(keep)t.value=keep;fillSubtopics(t.value)}
function fillSubtopics(title,keep){const s=ensureSubtopic();if(!s)return;const arr=items.filter(x=>x.title===title);const names=[...new Set(arr.flatMap(x=>(x.academic_subtopics||[]).map(y=>y.name).filter(Boolean)))];s.innerHTML='<option value="">Selecione o subtópico</option>'+names.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');if(keep)s.value=keep}
function selectedItem(){const subject=subjectSelect()?.value||'',title=topicSelect()?.value||'',sub= $('activitySubtopic')?.value||'';const candidates=(bySubject.get(subject)||[]).filter(x=>x.title===title);return candidates.find(x=>(x.academic_subtopics||[]).some(y=>y.name===sub))||candidates[0]||null}
function capture(){const item=selectedItem();pending={item,subject:subjectSelect()?.value||'',topic:topicSelect()?.value||'',day:Number($('activityDay')?.value||0),time:$('activityTime')?.value||''}}
async function persistPending(){if(!pending||!user||!preparation)return;const p=pending;pending=null;await new Promise(r=>setTimeout(r,700));const q=await sb.from('study_plan_activities').select('id,preparation_id,content_item_id,created_at').eq('user_id',user.id).eq('course_id',courseId).eq('plan_id',(window.__NP_ACADEMIC_PLAN_ID||'')).eq('day_of_week',p.day).eq('start_time',p.time).eq('topic',p.topic).order('created_at',{ascending:false}).limit(1);if(q.error||!q.data?.[0]){console.warn('[Meu Plano Acadêmico] atividade não localizada',q.error||'sem atividade');return}const u=await sb.from('study_plan_activities').update({preparation_id:preparation.id,content_item_id:p.item?.id||null}).eq('id',q.data[0].id).eq('user_id',user.id).eq('course_id',courseId);if(u.error)console.warn('[Meu Plano Acadêmico] vínculo não salvo',u.error)}
function decorate(){
 const list=$('activityList');if(!list)return;const articles=[...list.querySelectorAll('.activity')];articles.forEach(a=>{const topic=a.querySelector('.activity-topic')?.textContent?.trim();const subject=a.querySelector('.activity-title')?.textContent?.trim();if(!topic||!subject)return;const match=(bySubject.get(subject)||[]).find(x=>x.title===topic);const sub=(match?.academic_subtopics||[])[0]?.name;if(sub&&!a.querySelector('.academic-subtopic')){const d=document.createElement('div');d.className='academic-subtopic';d.textContent='↳ '+sub;a.querySelector('.activity-main')?.appendChild(d)}})}
function mount(){
 const form=$('activityForm');if(!form||!subjectSelect()||!topicSelect())return;
 if(!form.dataset.academicBound){
   form.dataset.academicBound='1';
   fillSubjects();
   subjectSelect().addEventListener('change',()=>fillItems(subjectSelect().value));
   topicSelect().addEventListener('change',()=>fillSubtopics(topicSelect().value));
   form.addEventListener('submit',()=>capture(),true);
   form.addEventListener('submit',()=>persistPending());
 }
 const planName=$('planName')?.textContent||'';if(planName&&preparation){
   sb.from('study_plans').select('id,preparation_id').eq('user_id',user.id).eq('course_id',courseId).eq('active',true).maybeSingle().then(r=>{if(r.data)window.__NP_ACADEMIC_PLAN_ID=r.data.id})
 }
 decorate();
}
const obs=new MutationObserver(()=>{if(ready)mount()});obs.observe(document.body,{childList:true,subtree:true});
init().catch(e=>console.error('[Meu Plano Acadêmico]',e));
window.NPAcademicPlan={get preparation(){return preparation},get items(){return items},get selectedItem(){return selectedItem()}};
})();
