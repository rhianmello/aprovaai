/* Nós Passa — proteção + configuração dinâmica dos ambientes pagos por curso/cargo. */
(function(){
'use strict';
const script=document.currentScript,slug=script?.dataset?.course||new URLSearchParams(location.search).get('course');
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
const page=(title,text)=>{document.body.innerHTML='<div style="min-height:100vh;display:grid;place-items:center;background:#0d1014;color:#fff;font-family:Arial;padding:24px;text-align:center"><div style="max-width:620px"><div style="font-size:42px">⚠️</div><h2>'+title+'</h2><p style="color:#a6adb7;line-height:1.6">'+text+'</p><a href="minha-conta.html" style="display:inline-block;margin-top:12px;padding:11px 16px;border-radius:10px;background:#e4c64a;color:#111;font-weight:800;text-decoration:none">Voltar para minha conta</a></div></div>'};
const loading=()=>{document.body.innerHTML='<div id="np-loading" style="min-height:100vh;display:grid;place-items:center;background:#070a0e;color:#fff;font-family:Arial;padding:24px;text-align:center"><div><div style="width:42px;height:42px;border:3px solid #29313b;border-top-color:#e4c64a;border-radius:50%;margin:0 auto 18px;animation:spin .8s linear infinite"></div><h2>Abrindo sua plataforma…</h2><p style="color:#9da8b5">Validando sua conta e preparando o ambiente de estudos.</p></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>'};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function makePlan(items,editionCode){
 const by={};(items||[]).forEach(x=>{const s=x.academic_subjects?.name||'Conhecimentos Específicos';(by[s]??=[]).push(x)});
 const subjects=Object.keys(by),days=['SEG','TER','QUA','QUI','SEX','SAB'];
 const examSize=editionCode==='03'?60:(editionCode==='01'?50:70);
 const plan=[{day:'DOM',title:`Simulado completo — ${examSize} questões`,q:examSize,simulado:true,topics:[`Simulado no formato do edital (${examSize} questões)`,'Revisão dos erros','Diagnóstico por disciplina']}];
 days.forEach((day,i)=>{const names=subjects.filter((_,j)=>j%days.length===i),fallback=subjects.length?[subjects[i%subjects.length]]:[],use=names.length?names:fallback,topics=[];use.forEach(s=>(by[s]||[]).slice(0,8).forEach(x=>topics.push(x.title)));plan.push({day,title:use.length?use.join(' + '):'Estudo dirigido',q:0,keywords:use,topics:topics.length?topics:['Conteúdo do edital']})});
 return plan;
}
async function configureDashboard(client,course){
 const {data:links,error:le}=await client.from('course_preparations').select('preparation_id,preparations(id,name,slug,edition_id,academic_positions(name,code),academic_editions(code,banca,level,quadro,official_name))').eq('course_id',course.id).eq('active',true);
 if(le)throw le;const prep=(links||[])[0]?.preparations;if(!prep)throw new Error('Preparação acadêmica não vinculada ao curso.');
 const {data:items,error:ie}=await client.from('academic_content_items').select('id,title,subject_id,topic_id,academic_subjects(name)').eq('preparation_id',prep.id).eq('active',true).order('sort_order');if(ie)throw ie;
 const subjectName=x=>x?.academic_subjects?.name||'Conhecimentos Específicos';
 const bankLoader=async()=>{const [qa,qac,q]=await Promise.all([client.from('question_applicability').select('id,question_id').eq('preparation_id',prep.id).eq('active',true),client.from('question_applicability_content').select('applicability_id,content_item_id').eq('preparation_id',prep.id),client.from('questions').select('id,statement,alternatives,answer,explanation,source_reference,year,is_original').eq('active',true)]);if(qa.error||qac.error||q.error)throw qa.error||qac.error||q.error;const qmap=new Map((q.data||[]).map(x=>[x.id,x])),cmap=new Map((items||[]).map(x=>[x.id,x])),linksBy=new Map();(qac.data||[]).forEach(x=>{if(!linksBy.has(x.applicability_id))linksBy.set(x.applicability_id,[]);linksBy.get(x.applicability_id).push(x.content_item_id)});return(qa.data||[]).map(a=>{const q=qmap.get(a.question_id);if(!q)return null;const cs=(linksBy.get(a.id)||[]).map(id=>cmap.get(id)).filter(Boolean),c=cs[0],alts=Array.isArray(q.alternatives)?q.alternatives:Object.entries(q.alternatives||{}).map(([letra,texto])=>({letra,texto}));return{id:q.id,enunciado:q.statement,alternativas:Object.fromEntries(alts.map(a=>[a.letra,a.texto])),gabarito:q.answer,explicacao:q.explanation||'',disciplina:subjectName(c),assunto:c?.title||'Questões do edital',subassunto:'',fonte:q.source_reference||''}}).filter(Boolean)};
 const pos=prep.academic_positions?.name||course.name.replace(/^Transpetro 2026 — /,''),edition=prep.academic_editions||{},qLabel=edition.code?`Edital ${edition.code}/2026`:'';
 const examSize=edition.code==='03'?60:(edition.code==='01'?50:70);
 window.STUDY_CONFIG={slug:course.slug,courseSlug:course.slug,title:pos,shortTitle:`Transpetro 2026 • ${pos}`,badge:`TRANSPETRO 2026 • ${pos.toUpperCase()}`,subtitle:`${qLabel} • ${edition.banca||'Fundação Cesgranrio'}`,backUrl:'minha-conta.html',videoQuery:`Transpetro 2026 ${pos} Cesgranrio`,historyKey:`aprovaai_${course.slug}_history_v1`,description:`Preparação específica para ${pos}, baseada no edital do processo seletivo público da Transpetro 2026.`,bankLoader,group:q=>{const s=norm([q.disciplina,q.assunto,q.subassunto,q.enunciado].join(' '));if(s.includes('portugues'))return'Português';if(s.includes('ingles'))return'Inglês';return q.disciplina||'Específicos'},plan:makePlan(items,edition.code),presets:[{label:`🎯 Simulado completo — ${examSize}`,groups:[],n:examSize,simulado:true}]};
}
if(!slug){page('Curso não configurado.','Identificador do curso inválido.');return}loading();
(async()=>{try{
 if(!window.supabase?.createClient){const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';s.async=true;document.head.appendChild(s);await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),7000);s.onload=()=>{clearTimeout(t);resolve()};s.onerror=()=>{clearTimeout(t);reject(new Error('falha'))}})}
 const client=window.supabase.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
 const {data:{session}}=await Promise.race([client.auth.getSession(),new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),7000))]);
 if(!session?.user){sessionStorage.setItem('ap_target',location.href);location.replace('login.html');return}
 const{data:course,error:ce}=await client.from('courses').select('id,name,slug,active').eq('slug',slug).maybeSingle();
 if(ce||!course){page('Curso não encontrado.','Esta preparação ainda não está configurada.');return}
 const{data:access,error:ae}=await client.from('user_courses').select('status,expires_at').eq('user_id',session.user.id).eq('course_id',course.id).eq('status','active').maybeSingle();
 if(ae||!access||access.status!=='active'||(access.expires_at&&new Date(access.expires_at)<=new Date())){location.replace('minha-conta.html');return}
 try{
   await configureDashboard(client,course);
 }catch(configError){
   const legacy=window.STUDY_CONFIG&&window.STUDY_CONFIG.courseSlug===course.slug&&typeof window.STUDY_CONFIG.bankLoader==='function';
   if(!legacy)throw configError;
   console.warn('[course-access] usando configuração legada para',course.slug,configError);
 }
 window.__NP_AUTH_USER=session.user;window.__NP_COURSE=course;
 const s=document.createElement('script');s.src='./study-dashboard-stable-v2.js?v=20260910-8';document.body.appendChild(s);s.onerror=()=>page('Não foi possível abrir a área de estudos.','O painel não carregou. Tente atualizar a página novamente.')
}catch(e){console.error('course-access',e);page('Não foi possível abrir sua plataforma.',e.message==='timeout'?'O serviço demorou para responder.':(e.message||'Erro ao validar o acesso.'))}})();
})();