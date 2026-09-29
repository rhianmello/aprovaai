(function(){
'use strict';
const CATALOG='https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/football-catalog';
const lang=(document.documentElement.lang||'pt-BR').toLowerCase();
const tr=lang.startsWith('en')?{title:'Search team',ph:'Type a team name',empty:'No teams found.',loading:'Searching...'}:lang.startsWith('es')?{title:'Buscar equipo',ph:'Escribe el nombre del equipo',empty:'No se encontraron equipos.',loading:'Buscando...'}:{title:'Buscar time',ph:'Digite o nome do time',empty:'Nenhum time encontrado.',loading:'Buscando...'};
const $=id=>document.getElementById(id),btn=$('global-search-btn'),modal=$('team-search-modal'),input=$('team-search-input'),results=$('team-search-results'),close=$('team-search-close');
if(!btn||!modal||!input||!results)return;
const prefix=lang.startsWith('en')?'/en/':lang.startsWith('es')?'/es/':'/';
$('team-search-title').textContent=tr.title;input.placeholder=tr.ph;
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function open(){modal.classList.add('open');document.body.classList.add('modal-open');setTimeout(()=>input.focus(),50)}
function shut(){modal.classList.remove('open');document.body.classList.remove('modal-open')}
btn.onclick=open;if(close)close.onclick=shut;modal.addEventListener('click',e=>{if(e.target===modal)shut()});document.addEventListener('keydown',e=>{if(e.key==='Escape')shut()});
let timer=0,seq=0;
input.addEventListener('input',()=>{clearTimeout(timer);const q=input.value.trim();if(q.length<3){results.innerHTML='';return}results.innerHTML='<div class="search-state">'+tr.loading+'</div>';const my=++seq;timer=setTimeout(async()=>{try{const r=await fetch(CATALOG+'?action=team-search&q='+encodeURIComponent(q));const d=await r.json();if(my!==seq)return;const teams=d.teams||[];results.innerHTML=teams.length?teams.map(t=>'<a class="search-result" href="'+prefix+'team.html?'+new URLSearchParams({name:String(t.name||''),...(t.id?{id:String(t.id)}:{})}).toString()+'"><img src="'+esc(t.logo||'')+'" alt=""><div><strong>'+esc(t.name)+'</strong><span>'+esc(t.country||'')+(t.founded?' • '+esc(t.founded):'')+'</span></div><b>›</b></a>').join(''):'<div class="search-state">'+tr.empty+'</div>'}catch(e){results.innerHTML='<div class="search-state">'+tr.empty+'</div>'}},350)});
})();