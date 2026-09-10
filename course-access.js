/* Nós Passa — proteção dos ambientes pagos por curso/cargo. */
(function(){
'use strict';
const script=document.currentScript,slug=script?.dataset?.course||new URLSearchParams(location.search).get('course');
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
const page=(title,text)=>{document.body.innerHTML='<div style="min-height:100vh;display:grid;place-items:center;background:#0d1014;color:#fff;font-family:Arial;padding:24px;text-align:center"><div style="max-width:620px"><div style="font-size:42px">⚠️</div><h2>'+title+'</h2><p style="color:#a6adb7;line-height:1.6">'+text+'</p><a href="minha-conta.html" style="display:inline-block;margin-top:12px;padding:11px 16px;border-radius:10px;background:#e4c64a;color:#111;font-weight:800;text-decoration:none">Voltar para minha conta</a></div></div>'};
const loading=()=>{document.body.innerHTML='<div id="np-loading" style="min-height:100vh;display:grid;place-items:center;background:#070a0e;color:#fff;font-family:Arial;padding:24px;text-align:center"><div><div style="width:42px;height:42px;border:3px solid #29313b;border-top-color:#e4c64a;border-radius:50%;margin:0 auto 18px;animation:spin .8s linear infinite"></div><h2>Abrindo sua plataforma…</h2><p style="color:#9da8b5">Validando sua conta e preparando o ambiente de estudos.</p></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>'};
if(!slug){page('Curso não configurado.','Identificador do curso inválido.');return}loading();
(async()=>{try{
 if(!window.supabase?.createClient){const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';s.async=true;document.head.appendChild(s);await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),7000);s.onload=()=>{clearTimeout(t);resolve()};s.onerror=()=>{clearTimeout(t);reject(new Error('falha'))}})}
 const client=window.supabase.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
 const {data:{session}}=await Promise.race([client.auth.getSession(),new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),7000))]);
 if(!session?.user){sessionStorage.setItem('ap_target',location.href);location.replace('login.html');return}
 const {data:course,error:ce}=await client.from('courses').select('id,name,slug,active').eq('slug',slug).maybeSingle();
 if(ce||!course){page('Curso não encontrado.','Esta preparação ainda não está configurada.');return}
 const {data:access,error:ae}=await client.from('user_courses').select('status,expires_at').eq('user_id',session.user.id).eq('course_id',course.id).eq('status','active').maybeSingle();
 if(ae||!access||access.status!=='active'||(access.expires_at&&new Date(access.expires_at)<=new Date())){location.replace('minha-conta.html');return}
 window.__NP_AUTH_USER=session.user;window.__NP_COURSE=course;
 const s=document.createElement('script');s.src='./study-dashboard-stable-v2.js?v=20260910-6';document.body.appendChild(s);s.onerror=()=>page('Não foi possível abrir a área de estudos.','O painel não carregou. Tente atualizar a página novamente.')
}catch(e){console.error('course-access',e);page('Não foi possível abrir sua plataforma.',e.message==='timeout'?'O serviço demorou para responder. Tente novamente.':'Erro ao validar o acesso.')}})();
})();