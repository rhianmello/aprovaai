/* Nós Passa — analytics anônimo + estado de sessão + SITE AGORA. Não armazena IP. */
(function(){
'use strict';
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
let clientPromise=null,adminMode=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function visitorId(){let v=localStorage.getItem('np_visitor_id');if(!v){v=crypto.randomUUID?crypto.randomUUID():'v-'+Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem('np_visitor_id',v)}return v}
function query(){return location.search||''}
async function loadSupabase(){
 if(window.supabase?.createClient)return window.supabase;
 if(!clientPromise){clientPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=()=>resolve(window.supabase);s.onerror=()=>reject(new Error('Supabase indisponível'));document.head.appendChild(s)})}
 return clientPromise;
}
async function getClient(){const api=await loadSupabase();return api.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,lock:async(_name,_acquireTimeout,fn)=>await fn()}})}
async function session(){try{const sb=await getClient();const r=await sb.auth.getSession();return r.data?.session||null}catch(e){return null}}
function normalizeLoginLinks(){
 if(/login\.html$/i.test(location.pathname))return;
 const links=[...document.querySelectorAll('a[href*="login.html"],button')];
 links.forEach(el=>{
  const text=(el.textContent||'').trim().toLowerCase();
  if(el.tagName==='A'&&el.getAttribute('href')?.includes('login.html')){el.textContent='Minha conta';el.setAttribute('href','minha-conta.html');return}
  if(el.tagName==='BUTTON'&&text==='entrar'&&el.type!=='submit'){el.textContent='Minha conta';el.onclick=()=>location.assign('minha-conta.html')}
 })
}
async function refreshAuthUI(){const s=await session();if(s)normalizeLoginLinks();return s}
function injectPricing(){
 if(!/concursos\.html$/i.test(location.pathname)||document.getElementById('np-pricing'))return;
 const hero=document.querySelector('.hero');if(!hero)return;
 if(!document.getElementById('np-pricing-css')){const s=document.createElement('style');s.id='np-pricing-css';s.textContent=`#np-pricing{border-top:1px solid #33404c;border-bottom:1px solid #33404c;background:linear-gradient(180deg,#080d13,#0c1219);padding:24px 0 28px}#np-pricing .np-price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:stretch}.np-price-card{position:relative;display:flex;flex-direction:column;min-height:245px;padding:22px;border:1px solid #2b3743;border-radius:16px;background:linear-gradient(145deg,#111a23,#0b1016);box-shadow:0 10px 30px rgba(0,0,0,.18)}.np-price-card h3{margin:0 0 8px;font-size:13px;color:#dce3e9;text-transform:uppercase;letter-spacing:1px}.np-price-card .np-price-title{font-size:23px;font-weight:950;margin:0 0 8px}.np-price-card .np-price-title b{color:#e4c64a}.np-price-card p{color:#929eaa;font-size:11px;line-height:1.5;margin:0 0 12px}.np-price-card ul{list-style:none;padding:0;margin:0 0 16px;color:#b7c0c8;font-size:10px;line-height:1.9}.np-price-card li:before{content:'✓';color:#53d5a0;font-weight:900;margin-right:7px}.np-price-card .np-price-foot{margin-top:auto;display:flex;align-items:end;justify-content:space-between;gap:10px}.np-price-value strong{display:block;font-size:25px}.np-price-value span{font-size:9px;color:#7d8995}.np-price-btn{display:inline-flex;align-items:center;justify-content:center;border-radius:10px;padding:10px 13px;background:#e4c64a;color:#111;text-decoration:none;font-size:10px;font-weight:950}.np-price-btn.dark{background:#131a22;color:#fff;border:1px solid #303a46}.np-price-card.featured{border-color:#62c3ed;box-shadow:0 0 0 1px rgba(98,195,237,.12),0 12px 35px rgba(0,0,0,.25)}.np-price-card.featured:before{content:'★ MAIS ESCOLHIDO';position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:#168cf5;color:#fff;border-radius:999px;padding:6px 12px;font-size:9px;font-weight:950;white-space:nowrap}.np-price-card.pro .np-price-value strong{color:#53d5a0}.np-price-note{text-align:center;color:#687581;font-size:9px;margin-top:16px}.np-price-note b{color:#aeb7c0}@media(max-width:900px){#np-pricing .np-price-grid{grid-template-columns:1fr}.np-price-card{min-height:0}}@media(max-width:620px){#np-pricing{padding:22px 0}.np-price-card{padding:18px}}`;document.head.appendChild(s)}
 const section=document.createElement('section');section.id='np-pricing';section.innerHTML=`<div class="wrap"><div class="np-price-grid"><article class="np-price-card"><h3>Plano gratuito</h3><div class="np-price-title">Comece <b>agora</b></div><p>Acesso gratuito para conhecer a plataforma e começar sua preparação.</p><ul><li>Questões diárias limitadas</li><li>1 simulado por semana</li><li>Acesso a algumas bancas</li><li>Desempenho básico</li><li>Plano de estudos básico</li></ul><div class="np-price-foot"><div class="np-price-value"><strong>R$ 0</strong><span>para sempre</span></div><a class="np-price-btn dark" href="login.html?cadastro=1&return=concursos.html">Criar conta</a></div></article><article class="np-price-card featured"><h3>Plano teste</h3><div class="np-price-title">7 dias por <b>R$1</b></div><p>Acesso praticamente completo para você testar tudo antes de decidir.</p><ul><li>Acesso completo à plataforma</li><li>Simulados ilimitados</li><li>Todas as bancas e concursos</li><li>Estatísticas e análise de desempenho</li><li>Ranking completo</li><li>Plano de estudos personalizado</li></ul><div class="np-price-foot"><div class="np-price-value"><strong>R$ 1,00</strong><span>por 7 dias</span></div><a class="np-price-btn" href="login.html?cadastro=1&return=concursos.html">Quero testar por R$1</a></div></article><article class="np-price-card pro"><h3>Plano PRO</h3><div class="np-price-title">Continue <b>evoluindo</b></div><p>Depois do teste, mantenha seu acesso completo e siga firme na preparação.</p><ul><li>Tudo do plano de teste</li><li>Simulados ilimitados</li><li>Estatísticas avançadas</li><li>Plano de estudos inteligente</li><li>IA para explicar questões</li><li>Suporte prioritário</li></ul><div class="np-price-foot"><div class="np-price-value"><strong>R$ 5,90</strong><span>por mês</span></div><a class="np-price-btn" href="login.html?cadastro=1&return=concursos.html">Assinar PRO</a></div></article></div><div class="np-price-note"><b>Teste por apenas R$1.</b> Depois dos 7 dias, o plano PRO será apresentado para você. • Pagamento seguro</div></div>`;
 hero.after(section);
}
async function ping(){
 try{
  if(adminMode)return;
  const sb=await getClient();
  await sb.rpc('track_site_visit',{p_visitor_id:visitorId(),p_path:location.pathname+query(),p_referrer:document.referrer||null,p_user_agent:navigator.userAgent});
 }catch(e){console.warn('[VisitorTracker]',e)}
}
function injectStyles(){if(document.getElementById('np-site-agora-css'))return;const s=document.createElement('style');s.id='np-site-agora-css';s.textContent=`#np-site-agora{margin-top:14px;background:#11161c;border:1px solid #2a3440;border-radius:16px;padding:18px}#np-site-agora .np-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}#np-site-agora h2{margin:0;font-size:20px}#np-site-agora .np-live{font-size:11px;font-weight:900;color:#8be3b7;background:#173126;border:1px solid #2b6049;border-radius:99px;padding:5px 9px}#np-site-agora .np-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}#np-site-agora .np-card{background:#0d1319;border:1px solid #2a3440;border-radius:12px;padding:13px}#np-site-agora .np-label{font-size:11px;color:#99a4b0;text-transform:uppercase;font-weight:800}#np-site-agora .np-value{font-size:25px;font-weight:900;margin-top:5px}#np-site-agora .np-sub{font-size:11px;color:#7f8994;margin-top:3px}#np-site-agora .np-table{margin-top:14px;overflow:auto}#np-site-agora table{width:100%;border-collapse:collapse}#np-site-agora th,#np-site-agora td{text-align:left;padding:9px;border-bottom:1px solid #2a3440;white-space:nowrap}#np-site-agora th{font-size:10px;color:#99a4b0;text-transform:uppercase}#np-site-agora .np-refresh{font-size:11px;color:#7f8994}#np-site-agora .np-origin{max-width:260px;overflow:hidden;text-overflow:ellipsis}#np-site-agora .np-country{font-weight:800}@media(max-width:900px){#np-site-agora .np-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){#np-site-agora .np-grid{grid-template-columns:1fr}}`;document.head.appendChild(s)}
function sourceLabel(ref){if(!ref)return'Direto';try{const h=new URL(ref).hostname.replace(/^www\./,'');if(/google\./i.test(h))return'Google';if(/bing\./i.test(h))return'Bing';if(/instagram\.com|facebook\.com|tiktok\.com|youtube\.com/i.test(h))return h.split('.')[0];if(/nospassa\.com\.br|rhianmello\.github\.io/i.test(h))return'Interno';return h}catch(e){return String(ref).slice(0,60)}}
function deviceLabel(ua){const x=String(ua||'');return /iphone|ipad|android|mobile/i.test(x)?'Celular':'Desktop'}
function countryLabel(c){const map={BR:'Brasil',US:'EUA',PT:'Portugal',AR:'Argentina',CL:'Chile',MX:'México',CO:'Colômbia',ES:'Espanha',GB:'Reino Unido',DE:'Alemanha',FR:'França',IT:'Itália',IN:'Índia',JP:'Japão',CA:'Canadá'};return map[String(c||'').toUpperCase()]||c||'—'}
function injectAdminBlock(){
 if(document.getElementById('np-site-agora'))return;
 const app=document.getElementById('app');if(!app)return;
 injectStyles();const box=document.createElement('section');box.id='np-site-agora';box.innerHTML=`<div class="np-head"><div><h2>🌐 SITE AGORA</h2><div class="np-refresh">Resumo de visitantes reais e origem das entradas</div></div><span class="np-live">● AO VIVO</span></div><div class="np-grid"><div class="np-card"><div class="np-label">Online agora</div><div id="np-online" class="np-value">—</div><div class="np-sub">atividade nos últimos 5 min</div></div><div class="np-card"><div class="np-label">Visitantes hoje</div><div id="np-today" class="np-value">—</div><div class="np-sub">pessoas únicas</div></div><div class="np-card"><div class="np-label">Últimos 7 dias</div><div id="np-7d" class="np-value">—</div><div class="np-sub">pessoas únicas</div></div><div class="np-card"><div class="np-label">Total</div><div id="np-total" class="np-value">—</div><div class="np-sub">visitantes únicos</div></div></div><div class="np-table" id="np-recent"><div class="np-refresh">Carregando visitantes…</div></div>`;
 const stats=app.querySelector('.stats');if(stats)app.insertBefore(box,stats);else app.prepend(box);
}
async function loadAdminAnalytics(){
 try{
  const sb=await getClient();const r=await sb.rpc('admin_site_analytics');if(r.error)throw r.error;const a=Array.isArray(r.data)?r.data[0]:r.data||{};
  [['np-online',a.online_now],['np-today',a.visitors_today],['np-7d',a.visitors_7d],['np-total',a.total_visitors]].forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=Number(v||0).toLocaleString('pt-BR')});
  const q=await sb.rpc('admin_recent_visitors',{p_limit:10});if(q.error)throw q.error;const rows=q.data||[];const el=document.getElementById('np-recent');
  el.innerHTML=rows.length?`<table><thead><tr><th>Última atividade</th><th>Local</th><th>Página</th><th>Origem</th><th>Dispositivo</th></tr></thead><tbody>${rows.map(v=>`<tr><td>${esc(v.last_seen?new Date(v.last_seen).toLocaleString('pt-BR'):'—')}</td><td class="np-country">${esc(countryLabel(v.country_code))}</td><td>${esc(v.last_path||'—')}</td><td class="np-origin" title="${esc(v.last_referrer||'Direto')}">${esc(sourceLabel(v.last_referrer))}</td><td>${esc(deviceLabel(v.user_agent))}</td></tr>`).join('')}</tbody></table>`:'<div class="np-refresh">Nenhum visitante registrado ainda.</div>';
 }catch(e){const el=document.getElementById('np-recent');if(el)el.innerHTML=`<div class="np-refresh">Não foi possível carregar os dados: ${esc(e.message||'erro')}</div>`}
}
function enhancePayments(){
 if(!/admin-v3\.html$/i.test(location.pathname))return;
 const section=document.getElementById('payments');if(!section||document.getElementById('np-payment-cleanup'))return;
 const notice=section.querySelector('.notice');const bar=document.createElement('div');bar.id='np-payment-cleanup';bar.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;padding:10px 12px;border:1px solid #2a3440;border-radius:10px;background:#0d1319;color:#99a4b0;font-size:12px';bar.innerHTML='<span><strong style="color:#fff">Visão limpa:</strong> pagos e pendências recentes ficam visíveis. Histórico antigo fica oculto.</span><label style="display:flex;align-items:center;gap:7px;cursor:pointer"><input id="np-show-payment-history" type="checkbox"> Mostrar histórico</label>';if(notice)notice.after(bar);else section.insertBefore(bar,section.querySelector('#paymentTable'));
 const old=window.renderPayments;
 if(typeof old!=='function')return;
 window.renderPayments=function(){
  const q=(document.getElementById('paymentSearch')?.value||'').toLowerCase();const show=document.getElementById('np-show-payment-history')?.checked;const cutoff=Date.now()-48*60*60*1000;
  const rows=(payments||[]).filter(x=>{const u=(users||[]).find(a=>a.id===x.user_id);const match=[u?.nome,u?.email,u?.telefone,x.provider,x.status].some(v=>String(v||'').toLowerCase().includes(q));if(!match)return false;if(show)return true;const t=new Date(x.created_at||x.paid_at||0).getTime();return x.status==='paid'||x.status==='active'||(x.status==='pending'&&t>=cutoff)});
  const table=document.getElementById('paymentTable');if(!table)return;const money=v=>(Number(v||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const badge=s=>s==='paid'?'<span class="badge">Pago</span>':s==='pending'?'<span class="badge warn">Pendente</span>':s==='active'?'<span class="badge">Ativo</span>':`<span class="badge off">${esc(s||'—')}</span>`;
  table.innerHTML=rows.length?`<table><thead><tr><th>Cliente</th><th>Curso</th><th>Valor</th><th>Status</th><th>Gateway</th><th>Data</th></tr></thead><tbody>${rows.map(x=>{const u=(users||[]).find(a=>a.id===x.user_id),c=(courses||[]).find(a=>String(a.id)===String(x.course_id));return `<tr><td><strong>${esc(u?.nome||'Sem nome')}</strong><br><span class="muted">${esc(u?.email||'—')}</span></td><td>${esc(c?.name||x.course_id)}</td><td>${money(x.amount_cents)}</td><td>${badge(x.status)}</td><td>${esc(x.provider||'—')}</td><td>${esc(new Date(x.paid_at||x.created_at).toLocaleString('pt-BR'))}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">Nenhum pagamento nesta visão. Ative “Mostrar histórico” para ver tentativas antigas.</div>';
 };
 const check=document.getElementById('np-show-payment-history');if(check)check.onchange=()=>window.renderPayments();
 setTimeout(()=>{try{window.renderPayments()}catch(e){}},250);
}
async function setupAdmin(){
 if(!/admin-v3\.html$/i.test(location.pathname))return;
 const s=await session();if(!s)return;
 try{const sb=await getClient();const r=await sb.rpc('is_admin');if(r.error||r.data!==true)return;adminMode=true;injectAdminBlock();await loadAdminAnalytics();enhancePayments();setInterval(loadAdminAnalytics,30000);setTimeout(enhancePayments,1000)}catch(e){console.warn('[SiteAgora]',e)}
}
async function start(){
 injectPricing();
 const s=await refreshAuthUI();
 await setupAdmin();
 if(!adminMode)ping();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
