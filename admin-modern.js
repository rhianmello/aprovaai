/* Nós Passa — camada visual do ADM */
(function(){
'use strict';
if(!/admin-v3\.html$/i.test(location.pathname))return;

function injectCss(){
 if(document.getElementById('np-modern-admin-css'))return;
 const s=document.createElement('style');
 s.id='np-modern-admin-css';
 s.textContent=`
:root{--adm-bg:#080c11;--adm-panel:#0e141b;--adm-line:#24303c;--adm-text:#f4f7fa;--adm-muted:#8c99a6;--adm-gold:#e4c64a;--adm-blue:#4ea8ff}
html,body{min-height:100%;background:var(--adm-bg)!important}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;color:var(--adm-text)!important}
#app.wrap{max-width:none!important;width:100%;min-height:100vh;margin:0!important;padding:0 28px 40px 268px!important;background:linear-gradient(135deg,#080c11 0%,#0b1016 55%,#101820 100%)}
#np-admin-sidebar{position:fixed;z-index:50;left:0;top:0;bottom:0;width:240px;padding:18px 12px;background:#0a0f15;border-right:1px solid var(--adm-line);display:flex;flex-direction:column;box-shadow:8px 0 30px rgba(0,0,0,.22)}
.np-side-brand{display:flex;align-items:center;gap:10px;padding:8px 10px 20px;color:#fff;text-decoration:none;font-weight:950;font-size:20px}
.np-side-brand:hover{color:#fff;text-decoration:none}
.np-side-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(145deg,#f1d65b,#b99b27);color:#101318;font-weight:950;flex:none}
.np-side-brand b{color:var(--adm-gold)}
.np-side-label{font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:#596572;padding:0 10px 7px;font-weight:900}
.np-side-menu{display:grid;gap:4px}
.np-side-btn{width:100%;border:0;background:transparent;color:#aab5bf;text-align:left;border-radius:9px;padding:10px 11px;display:flex;align-items:center;gap:10px;font-weight:750;font-size:12px;cursor:pointer;transition:.15s}
.np-side-btn:hover{background:#131b24;color:#fff}
.np-side-btn.active{background:#25200d;color:#f2d86b;box-shadow:inset 3px 0 0 var(--adm-gold)}
.np-side-icon{width:18px;text-align:center;font-size:14px}
.np-side-bottom{margin-top:auto;border-top:1px solid var(--adm-line);padding-top:12px}
.np-side-exit{color:#ff9c9c!important}
.np-side-status{margin:0 6px 12px;padding:10px;border:1px solid #203b2f;background:#0d1b15;border-radius:9px;color:#7fe1b4;font-size:10px;font-weight:800}
#app>.top{min-height:72px;margin:0;padding:0;border-bottom:1px solid var(--adm-line)}
#app>.top .brand{display:none}
#app>.top>div{margin-left:auto}
#app>.top #email{font-size:11px}
#app>.hero{margin-top:24px!important;padding:0!important;background:none!important;border:0!important;border-radius:0!important}
#app>.hero h1{font-size:27px;letter-spacing:-.5px}
#app>.hero .muted{font-size:12px;max-width:700px}
#app>.stats{margin-top:16px!important;gap:10px!important}
#app>.stats .stat{background:var(--adm-panel)!important;border-color:var(--adm-line)!important;border-radius:12px!important;padding:14px!important}
#app>.stats .stat strong{font-size:23px!important}
#app>.nav{display:none!important}
#admin-import-questions-link{margin:16px 0!important;background:var(--adm-panel)!important;border-color:var(--adm-line)!important}
#app>.section{margin-top:16px;background:var(--adm-panel)!important;border-color:var(--adm-line)!important;border-radius:14px!important;padding:18px!important;box-shadow:0 12px 35px rgba(0,0,0,.12)}
#app>.section h2{font-size:17px;margin:0}
.toolbar{margin-bottom:14px!important}
.search,.field input,.field select{background:#0a1016!important;border-color:var(--adm-line)!important;color:#fff!important}
.btn{border-radius:8px!important}
.section table th{background:#0b1117}
.section table td,.section table th{border-bottom-color:var(--adm-line)!important}
@media(max-width:900px){
 #app.wrap{padding:0 15px 30px 88px!important}
 #np-admin-sidebar{width:72px;padding:14px 8px}
 .np-side-brand{justify-content:center;padding-bottom:16px}
 .np-side-brand span:not(.np-side-logo){display:none}
 .np-side-label,.np-side-status,.np-side-btn span:not(.np-side-icon){display:none}
 .np-side-btn{justify-content:center}
}
@media(max-width:620px){
 #np-admin-sidebar{width:58px}
 .np-side-logo{width:32px;height:32px}
 .np-side-btn{padding:9px 4px}
 #app.wrap{padding-left:70px!important;padding-right:10px!important}
 .stats{grid-template-columns:1fr 1fr!important}
}
`;
 document.head.appendChild(s);
}

function setActive(name){
 document.querySelectorAll('.np-side-btn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
}

function showTab(name){
 document.querySelectorAll('.section.tab').forEach(section=>section.classList.add('hidden'));
 const analytics=document.getElementById('np-analytics');
 if(name==='analytics'){
   if(window.NP_ADMIN_ANALYTICS?.show)window.NP_ADMIN_ANALYTICS.show();
   else if(analytics)analytics.classList.remove('hidden');
 }else if(analytics){
   analytics.classList.add('hidden');
 }
 if(name!=='overview'&&name!=='analytics'){
   const target=document.getElementById(name);
   if(target)target.classList.remove('hidden');
 }
 setActive(name);
 window.scrollTo({top:0,behavior:'smooth'});
}

function buildSidebar(){
 if(document.getElementById('np-admin-sidebar'))return;
 const side=document.createElement('aside');
 side.id='np-admin-sidebar';
 side.innerHTML=`
  <a class="np-side-brand" href="index.html" aria-label="Ir para a página inicial">
   <span class="np-side-logo">NP</span><span>Nós <b>Passa</b></span>
  </a>
  <div class="np-side-label">Painel</div>
  <div class="np-side-menu">
   <button class="np-side-btn active" data-tab="overview"><span class="np-side-icon">⌂</span><span>Visão geral</span></button>
   <button class="np-side-btn" data-tab="analytics"><span class="np-side-icon">◔</span><span>Visitas</span></button>
   <button class="np-side-btn" data-tab="payments"><span class="np-side-icon">▣</span><span>Pagamentos</span></button>
   <button class="np-side-btn" data-tab="students"><span class="np-side-icon">♙</span><span>Alunos</span></button>
   <button class="np-side-btn" data-tab="courses"><span class="np-side-icon">▤</span><span>Cursos</span></button>
   <button class="np-side-btn" data-tab="enroll"><span class="np-side-icon">◈</span><span>Matrículas</span></button>
   <button class="np-side-btn" data-tab="sessions"><span class="np-side-icon">▣</span><span>Dispositivos</span></button>
  </div>
  <div class="np-side-label" style="margin-top:18px">Ferramentas</div>
  <div class="np-side-menu">
   <button class="np-side-btn" data-tab="questions"><span class="np-side-icon">✎</span><span>Banco de questões</span></button>
  </div>
  <div class="np-side-bottom">
   <div class="np-side-status">● Sistema operacional</div>
   <button class="np-side-btn np-side-exit" id="np-side-logout"><span class="np-side-icon">↪</span><span>Sair</span></button>
  </div>`;
 document.body.appendChild(side);
 side.querySelectorAll('.np-side-btn[data-tab]').forEach(button=>button.addEventListener('click',()=>{
   const tab=button.dataset.tab;
   if(tab==='questions'){
     const link=document.querySelector('#admin-import-questions-link a');
     if(link)location.href=link.href;
     return;
   }
   showTab(tab);
 }));
 const out=side.querySelector('#np-side-logout');
 if(out)out.addEventListener('click',()=>{if(typeof window.logout==='function')window.logout()});
}

function loadAnalyticsModule(){
 if(document.querySelector('script[data-np-admin-analytics]'))return;
 const s=document.createElement('script');
 s.src='admin-analytics.js?v=20260910-1';
 s.dataset.npAdminAnalytics='1';
 document.head.appendChild(s);
}

function protectStudentToggle(){
 setTimeout(()=>{
  if(typeof window.toggleStudent!=='function')return;
  window.toggleStudent=async function(id,active){
   if(!confirm(active?'Desbloquear este aluno?':'Bloquear este aluno?'))return;
   const client=window.__NP_ADMIN_SB;
   if(!client)return alert('Sessão administrativa indisponível. Atualize a página e tente novamente.');
   const {error}=await client.rpc('admin_set_profile_status',{p_user_id:id,p_active:active});
   if(error)return alert(error.message||'Não foi possível alterar o status do aluno.');
   if(!active){
    const r=await client.from('user_courses').update({status:'blocked'}).eq('user_id',id);
    if(r.error)return alert('Aluno bloqueado, mas não foi possível bloquear as matrículas: '+r.error.message);
   }
   if(typeof window.load==='function')await window.load();else location.reload();
  };
 },0);
}

function init(){
 injectCss();
 buildSidebar();
 showTab('overview');
 loadAnalyticsModule();
 protectStudentToggle();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();