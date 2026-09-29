(function(){
'use strict';
const API='https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/football-fixtures';
const box=document.getElementById('match-content'),p=new URLSearchParams(location.search);
const id=Number(p.get('id')),date=p.get('date');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const team=t=>'/team.html?id='+encodeURIComponent(t.id)+'&name='+encodeURIComponent(t.name||'');
function render(f){
 const a=f.teams.home,b=f.teams.away,st=f.status?.short||'',score=f.goals?.home==null?'×':esc(f.goals.home)+' × '+esc(f.goals.away);
 document.title=a.name+' x '+b.name+' — Nós Passa';
 const when=new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(f.date));
 box.innerHTML='<nav><a href="/">Início</a> › '+esc(f.league?.name||'Futebol')+' › '+esc(a.name)+' x '+esc(b.name)+'</nav><section class="match-hero"><p>'+esc(f.league?.country||'')+' · '+esc(f.league?.name||'')+(f.league?.round?' · '+esc(f.league.round):'')+'</p><div class="match-teams"><a href="'+team(a)+'"><img src="'+esc(a.logo||'')+'" alt=""><strong>'+esc(a.name)+'</strong></a><span class="match-score">'+score+'</span><a href="'+team(b)+'"><img src="'+esc(b.logo||'')+'" alt=""><strong>'+esc(b.name)+'</strong></a></div><p class="match-meta">'+esc(when)+' · '+esc(st)+(f.venue?.name?' · '+esc(f.venue.name):'')+'</p></section><section class="match-section"><h2>Explore mais jogos</h2><div class="related"><a href="'+team(a)+'">Jogos e resultados do '+esc(a.name)+'</a><a href="'+team(b)+'">Jogos e resultados do '+esc(b.name)+'</a><a href="/">Todos os jogos de hoje</a></div></section>';
}
async function load(){if(!Number.isSafeInteger(id)||id<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')){box.textContent='Partida inválida.';return}try{const r=await fetch(API+'?date='+encodeURIComponent(date));if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json(),f=(d.fixtures||[]).find(x=>Number(x.id)===id);if(!f){box.textContent='Partida não encontrada nesta data.';return}render(f)}catch(e){box.textContent='Não foi possível carregar esta partida. Tente novamente mais tarde.'}}
load();setInterval(()=>{if(document.visibilityState==='visible')load()},60000);
})();
