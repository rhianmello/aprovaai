/* Nós Passa — camada visual do ADM */
(function(){
'use strict';
if(!/admin-v3\.html$/i.test(location.pathname))return;

function esc(v){return String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[m]))}

function injectCss(){
 if(document.getElementById('np-modern-admin-css'))return;
 const s=document.createElement('style');s.id='np-modern-admin-css';s.textContent=`
:root{--adm-bg:#080c11;--adm-panel:#0e141b;--adm-panel2:#111922;--adm-line:#24303c;--adm-text:#f4f7fa;--adm-muted:#8c99a6;--adm-gold:#e4c64a;--adm-blue:#4ea8ff;--adm-green:#55d6a0;--adm-red:#ff8585}
html,body{min-height:100%;background:var(--adm-bg)!important}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;color:var(--adm-text)!important}
#app.wrap{max-width:none!important;width:100%;min-height:100vh;margin:0!important;padding:0 28px 40px 268px!important;background:linear-gradient(135deg,#080c11 0%,#0b1016 55%,#101820 100%)}
#np-admin-sidebar{position:fixed;z-index:50;left:0;top:0;bottom:0;width:240px;padding:18px 12px;background:#0a0f15;border-right:1px solid var(--adm-line);display:flex;flex-direction:column;box-shadow:8px 0 30px rgba(0,0,0,.22)}
.np-side-brand{display:flex;align-items:center;gap:10px;padding:8px 10px 20px;font-weight:950;font-size:20px}.np-side-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(145deg,#f1d65b,#b99b27);color:#101318;font-weight:950}.np-side-brand b{color:var(--adm-gold)}.np-side-label{font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:#596572;padding:0 10px 7px;font-weight:900}
.np-side-menu{display:grid;gap:4px}.np-side-btn{width:100%;border:0;background:transparent;color:#aab5bf;text-align:left;border-radius:9px;padding:10px 11px;display:flex;align-items:center;gap:10px;font-weight:750;font-size:12px;cursor:pointer;transition:.15s}.np-side-btn:hover{background:#131b24;color:#fff}.np-side-btn.active{background:#25200d;color:#f2d86b;box-shadow:inset 3px 0 0 var(--adm-gold)}.np-side-icon{width:18px;text-align:center;font-size:14px}.np-side-bottom{margin-top:auto;border-top:1px solid var(--adm-line);padding-top:12px}.np-side-exit{color:#ff9c9c!important}.np-side-status{margin:0 6px 12px;padding:10px;border:1px solid #203b2f;background:#0d1b15;border-radius:9px;color:#7fe1b4;font-size:10px;font-weight:800}
#app>.top{min-height:72px;margin:0;padding:0;border-bottom:1px solid var(--adm-line)}#app>.top .brand{display:none}#app>.top>div{margin-left:auto}#app>.top #email{font-size:11px}
#app>.hero{margin-top:24px!important;padding:0!important;background:none!important;border:0!important;border-radius:0!important}#app>.hero h1{font-size:27px;letter-spacing:-.5px}#app>.hero .muted{font-size:12px;max-width:700px}
#np-site-agora{margin-top:20px!important;background:var(--adm-panel)!important;border:1px solid var(--adm-line)!important;border-radius:14px!important;padding:18px!important;box-shadow:0 15px 40px rgba(0,0,0,.16)}#np-site-agora .np-head{margin-bottom:16px!important}#np-site-agora h2{font-size:16px!important}#np-site-agora .np-grid{gap:9px!important}#np-site-agora .np-card{background:#0b1117!important;border:1px solid var(--adm-line)!important}#np-site-agora .np-value{font-size:23px!important}#np-site-agora .np-table{margin-top:10px!important}
#app>.stats{margin-top:16px!important;gap:10px!important}#app>.stats .stat{background:var(--adm-panel)!important;border-color:var(--adm-line)!important;border-radius:12px!important;padding:14px!important}#app>.stats .stat strong{font-size:23px!important}
#app>.nav{display:none!important}#admin-import-questions-link{margin:16px 0!important;background:var(--adm-panel)!important;border-color:var(--adm-line)!important}
#app>.section{margin-top:16px;background:var(--adm-panel)!important;border-color:var(--adm-line)!important;border-radius:14px!important;padding:18px!important;box-shadow:0 12px 35px rgba(0,0,0,.12)}#app>.section h2{font-size:17px;margin:0}.toolbar{margin-bottom:14px!important}.search,.field input,.field select{background:#0a1016!important;border-color:var(--adm-line)!important;color:#fff!important}.btn{border-radius:8px!important}.section table th{background:#0b1117}.section table td,.section table th{border-bottom-color:var(--adm-line)!important}
#np-admin-titlebar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:24px}.np-admin-kicker{font-size:10px;color:var(--adm-blue);font-weight:900;text-transform:uppercase;letter-spacing:1.3px}.np-admin-clock{font-size:11px;color:var(--adm-muted)}
.np-quick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}.np-quick{background:#0b1117;border:1px solid var(--adm-line);border-radius:11px;padding:12px}.np-quick strong{display:block;font-size:13px}.np-quick span{display:block;margin-top:3px;color:var(--adm-muted);font-size:10px}
@media(max-width:900px){#app.wrap{padding:0 15px 30px 15px!important}#np-admin-sidebar{position:fixed;width:72px;padding:14px 8px}#app.wrap{padding-left:88px!important}.np-side-brand{justify-content:center;padding-bottom:16px}.np-side-brand span:not(.np-side-logo){display:none}.np-side-label,.np-side-status,.np-side-btn span:not(.np-side-icon){display:none}.np-side-btn{justify-content:center}.np-quick-grid{grid-template-columns:1fr}.np-admin-clock{display:none}}
@media(max-width:620px){#np-admin-sidebar{width:58px}.np-side-logo{width:32px;height:32px}.np-side-btn{padding:9px 4px}#app.wrap{padding-left:70px!important;padding-right:10px!important}.stats{grid-template-columns:1fr 1fr!important}}
`;
 document.head.appendChild(s);
}

function clickTab(name){const b=document.querySelector('.nav button[data-tab="'+name+'"]');if(b)b.click();setActive(name)}
function setActive(name){document.querySelectorAll('.np-side-btn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name))}
function buildSidebar(){
 if(document.getElementById('np-admin-sidebar'))return;
 const side=document.createElement('aside');side.id='np-admin-sidebar';side.innerHTML=`
  <div class="np-side-brand"><span class="np-side-logo">NP</span><span>Nós <b>Passa</b></span></div>
  <div class="np-side-label">Painel</div>
  <div class="np-side-menu">
   <button class="np-side-btn active" data-tab="overview"><span class="np-side-icon">⌂</span><span>Visão geral</span></button>
   <button class="np-side-btn" data-tab="payments"><span class="np-side-icon">▣</span><span>Pagamentos</span></button>
   <button class="np-side-btn" data-tab="students"><span class="np-side-icon">♙</span><span>Alunos</span></button>
   <button class="np-side-btn" data-tab="courses"><span class="np-side-icon">▤</span><span>Cursos</span></button>
   <button class="np-side-btn" data-tab="enroll"><span class="np-side-icon">◈</span><span>Matrículas</span></button>
   <button class="np-side-btn" data-tab="sessions"><span class="np-side-icon">▣</span><span>Dispositivos</span></button>
  </div>
  <div class="np-side-label" style="margin-top:18px">Ferramentas</div>
  <div class="np-side-menu"><button class="np-side-btn" data-tab="questions"><span class="np-side-icon">✎</span><span>Banco de questões</span></button></div>
  <div class="np-side-bottom"><div class="np-side-status">● Sistema operacional</div><button class="np-side-btn np-side-exit" id="np-side-logout"><span class="np-side-icon">↪</span><span>Sair</span></button></div>`;
 document.body.appendChild(side);
 side.querySelectorAll('.np-side-btn[data-tab]').forEach(b=>b.addEventListener('click',()=>{
   const tab=b.dataset.tab;
   if(tab==='overview'){window.scrollTo({top:0,behavior:'smooth'});document.querySelectorAll('.section.tab').forEach(x=>x.classList.add('hidden'));setActive('overview');return}
   if(tab==='questions'){const a=document.querySelector('#admin-import-questions-link a');if(a)location.href=a.href;return}
   clickTab(tab);
 }));
 const out=side.querySelector('#np-side-logout');if(out)out.addEventListener('click',()=>{if(typeof window.logout==='function')window.logout()});
}
function enhanceHeader(){
 if(document.getElementById('np-admin-titlebar'))return;
 const hero=document.querySelector('#app>.hero');if(!hero)return;
 const bar=document.createElement('div');bar.id='np-admin-titlebar';bar.innerHTML='<div><div class="np-admin-kicker">Administration / Overview</div></div><div class="np-admin-clock" id="np-admin-clock"></div>';
 hero.before(bar);
 const clock=bar.querySelector('#np-admin-clock');const tick=()=>{const d=new Date();clock.textContent=d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'})+' · '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});};tick();setInterval(tick,30000);
}
function improveSiteAgora(){
 const box=document.getElementById('np-site-agora');if(!box)return;
 const h=box.querySelector('h2');if(h)h.textContent='Visão geral do site';
 const sub=box.querySelector('.np-refresh');if(sub)sub.textContent='Visitantes e origem das entradas em tempo real';
}
function improvePayments(){
 const s=document.getElementById('payments');if(!s)return;
 const notice=s.querySelector('.notice');if(notice)notice.style.display='none';
 const bar=document.getElementById('np-payment-cleanup');if(bar)bar.style.marginTop='0';
}
function watch(){
 injectCss();buildSidebar();enhanceHeader();improveSiteAgora();improvePayments();
 const mo=new MutationObserver(()=>{improveSiteAgora();improvePayments()});mo.observe(document.body,{childList:true,subtree:true});
 setTimeout(()=>mo.disconnect(),120000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();

// Security bridge: profile status changes must use the protected admin RPC.
setTimeout(()=>{
  if(typeof window.toggleStudent!=='function') return;
  const originalToggleStudent=window.toggleStudent;
  window.toggleStudent=async function(id,active){
    if(!confirm(active?'Desbloquear este aluno?':'Bloquear este aluno?')) return;
    const client=window.__NP_ADMIN_SB;
    if(!client){return alert('Sessão administrativa indisponível. Atualize a página e tente novamente.');}
    const {error}=await client.rpc('admin_set_profile_status',{p_user_id:id,p_active:active});
    if(error){return alert(error.message||'Não foi possível alterar o status do aluno.');}
    if(!active){
      const r=await client.from('user_courses').update({status:'blocked'}).eq('user_id',id);
      if(r.error)return alert('Aluno bloqueado, mas não foi possível bloquear as matrículas: '+r.error.message);
    }
    if(typeof window.load==='function') await window.load();
    else location.reload();
  };
},0);
})();
