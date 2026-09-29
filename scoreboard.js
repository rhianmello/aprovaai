(function(){
'use strict';
const FIXTURES='https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/football-fixtures';
const CATALOG='https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/football-catalog';
const lang=(document.documentElement.lang||'pt-BR').toLowerCase();
const tr=lang.startsWith('en')?{
today:'Today',yesterday:'Yesterday',tomorrow:'Tomorrow',all:'All',live:'Live',finished:'Finished',scheduled:'Scheduled',games:'games',
noGames:'No matches found for this date.',noLeague:'No matches from this competition on the selected date.',loading:'Loading matches...',
error:'Could not load matches.',updated:'Updated automatically',local:'Your country',dayComps:'Competitions today',calendar:'Choose date'
}:lang.startsWith('es')?{
today:'Hoy',yesterday:'Ayer',tomorrow:'Mañana',all:'Todos',live:'En vivo',finished:'Finalizados',scheduled:'Programados',games:'partidos',
noGames:'No hay partidos para esta fecha.',noLeague:'No hay partidos de esta competición en la fecha seleccionada.',loading:'Cargando partidos...',
error:'No fue posible cargar los partidos.',updated:'Actualización automática',local:'Tu país',dayComps:'Competiciones de hoy',calendar:'Elegir fecha'
}:{
today:'Hoje',yesterday:'Ontem',tomorrow:'Amanhã',all:'Todos',live:'Ao vivo',finished:'Encerrados',scheduled:'Programados',games:'jogos',
noGames:'Nenhum jogo encontrado nesta data.',noLeague:'Não há jogos desta competição na data selecionada.',loading:'Carregando jogos...',
error:'Não foi possível carregar os jogos.',updated:'Atualização automática',local:'Seu país',dayComps:'Competições do dia',calendar:'Escolher data'
};
const $=id=>document.getElementById(id);
const state={date:localISO(new Date()),filter:'all',leagueId:null,data:null,viewerCountry:null,viewerCountryName:null,localLeagues:[],loading:false,liveMode:false,dailyData:null};
function localISO(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
function addDays(iso,n){const [y,m,d]=iso.split('-').map(Number);const x=new Date(y,m-1,d+n,12,0,0);return localISO(x)}
function parseDate(iso){const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d,12,0,0)}
function relLabel(iso){const today=localISO(new Date());if(iso===today)return tr.today;if(iso===addDays(today,-1))return tr.yesterday;if(iso===addDays(today,1))return tr.tomorrow;return new Intl.DateTimeFormat(lang,{weekday:'short'}).format(parseDate(iso)).replace('.','')}
function dayNum(iso){return new Intl.DateTimeFormat(lang,{day:'2-digit',month:'2-digit'}).format(parseDate(iso))}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function statusType(s){const live=['1H','HT','2H','ET','BT','P','SUSP','INT','LIVE'];const fin=['FT','AET','PEN'];if(live.includes(s))return'live';if(fin.includes(s))return'finished';return'scheduled'}
function displayTime(f){const st=f.status?.short;if(statusType(st)==='live')return '<span class="live-dot"></span>'+esc((f.status?.elapsed??'')+"'");if(statusType(st)==='finished')return esc(st);try{return new Intl.DateTimeFormat(lang,{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(f.date))}catch{return'—'}}
function flagEmoji(code){if(!code||!/^[A-Z]{2}$/.test(code))return'🌍';return String.fromCodePoint(...code.split('').map(c=>127397+c.charCodeAt(0)))}
function localizedCountry(code,fallback){try{return new Intl.DisplayNames([lang],{type:'region'}).of(code)||fallback||code}catch{return fallback||code||'World'}}
function leagueName(l){const id=Number(l?.id||0);if(state.viewerCountry==='BR'){const br={71:'Brasileirão Série A',72:'Brasileirão Série B',75:'Série C',76:'Série D',73:'Copa do Brasil'};if(br[id])return br[id]}return l?.name||'—'}
function teamUrl(t){const prefix=lang.startsWith('en')?'/en/':lang.startsWith('es')?'/es/':'/';return prefix+'team.html?id='+encodeURIComponent(t.id)+'&name='+encodeURIComponent(t.name||'')}
function matchUrl(f){return '/match.html?id='+encodeURIComponent(f.id)+'&date='+encodeURIComponent(String(f.date||'').slice(0,10))}
function renderDates(){const box=$('datebar');let html='<button class="navday" data-shift="-7" aria-label="Previous week">‹</button>';for(let i=-3;i<=10;i++){const d=addDays(state.date,i);html+='<button class="day '+(i===0?'active':'')+'" data-date="'+d+'"><strong>'+esc(relLabel(d))+'</strong><span>'+esc(dayNum(d))+'</span></button>'}html+='<button class="navday" data-shift="7" aria-label="Next week">›</button>';box.innerHTML=html;box.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{state.liveMode=false;state.filter='all';setActiveFilter('all');state.date=b.dataset.date;state.leagueId=null;load()});box.querySelectorAll('[data-shift]').forEach(b=>b.onclick=()=>{state.liveMode=false;state.filter='all';setActiveFilter('all');state.date=addDays(state.date,Number(b.dataset.shift));state.leagueId=null;load()});$('date-picker').value=state.date}
function filteredFixtures(){let a=state.data?.fixtures||[];if(state.filter!=='all')a=a.filter(f=>statusType(f.status?.short)===state.filter);if(state.leagueId)a=a.filter(f=>Number(f.league?.id)===Number(state.leagueId));return a}
function groupsFor(fixtures){const m=new Map();fixtures.forEach(f=>{const k=(f.league?.country||'World')+'|'+(f.league?.id||0)+'|'+(f.league?.name||'Other');if(!m.has(k))m.set(k,{league:f.league,games:[]});m.get(k).games.push(f)});const localName=(state.viewerCountryName||'').toLowerCase();return [...m.values()].sort((a,b)=>{const al=(a.league?.country||'').toLowerCase()===localName?0:1;const bl=(b.league?.country||'').toLowerCase()===localName?0:1;return al-bl||(a.league?.country||'').localeCompare(b.league?.country||'')||(a.league?.name||'').localeCompare(b.league?.name||'')})}
function selectLeague(id,btn){state.leagueId=id==='all'?null:Number(id);document.querySelectorAll('[data-league]').forEach(x=>x.classList.remove('active'));if(btn)btn.classList.add('active');rerenderMainOnly()}
function renderSidebar(dayGroups){const local=$('local-leagues'),day=$('day-leagues');$('country-label').textContent=flagEmoji(state.viewerCountry)+' '+localizedCountry(state.viewerCountry,state.viewerCountryName).toUpperCase();let localHtml='<button class="side-btn '+(!state.leagueId?'active':'')+'" data-league="all"><span>'+tr.all+'</span></button>';localHtml+=state.localLeagues.map(l=>'<button class="side-btn '+(Number(state.leagueId)===Number(l.id)?'active':'')+'" data-league="'+l.id+'"><img src="'+esc(l.logo||'')+'" alt="" loading="lazy"><span>'+esc(leagueName(l))+'</span></button>').join('');local.innerHTML=localHtml;const existing=new Set(state.localLeagues.map(l=>Number(l.id)));const dayOnly=dayGroups.filter(g=>!existing.has(Number(g.league?.id)));day.innerHTML=dayOnly.map(g=>'<button class="side-btn '+(Number(state.leagueId)===Number(g.league?.id)?'active':'')+'" data-league="'+esc(g.league?.id)+'">'+(g.league?.flag?'<img src="'+esc(g.league.flag)+'" alt="" loading="lazy">':'<span class="mini-globe">●</span>')+'<span>'+esc(leagueName(g.league))+'</span><b>'+g.games.length+'</b></button>').join('')||'<div class="side-empty">—</div>';document.querySelectorAll('[data-league]').forEach(btn=>btn.onclick=()=>selectLeague(btn.dataset.league,btn))}
function gameHTML(f){const typ=statusType(f.status?.short),homeWin=f.teams?.home?.winner===true,awayWin=f.teams?.away?.winner===true;const score=(typ==='scheduled'||(f.goals?.home==null&&f.goals?.away==null))?'<span>–</span>':'<span>'+esc(f.goals?.home??0)+'</span><span>'+esc(f.goals?.away??0)+'</span>';return '<div class="game"><div class="time '+(typ==='live'?'live':'')+'">'+displayTime(f)+'</div><div class="teams"><a class="team '+(homeWin?'winner':'')+'" href="'+teamUrl(f.teams.home)+'"><img src="'+esc(f.teams.home.logo)+'" loading="lazy" alt=""><span>'+esc(f.teams.home.name)+'</span></a><a class="team '+(awayWin?'winner':'')+'" href="'+teamUrl(f.teams.away)+'"><img src="'+esc(f.teams.away.logo)+'" loading="lazy" alt=""><span>'+esc(f.teams.away.name)+'</span></a></div><a class="score" href="'+matchUrl(f)+'" aria-label="Detalhes: '+esc(f.teams.home.name)+' x '+esc(f.teams.away.name)+'">'+score+'<small>'+esc(f.status?.short||'')+'</small></a></div>'}
function renderGames(groups){const box=$('games');if(!groups.length){box.innerHTML='<div class="empty">'+(state.leagueId?tr.noLeague:tr.noGames)+'</div>';return}box.innerHTML=groups.map(g=>'<section class="league"><div class="league-head">'+(g.league?.flag?'<img src="'+esc(g.league.flag)+'" alt="">':(g.league?.logo?'<img src="'+esc(g.league.logo)+'" alt="">':''))+'<div><div class="country">'+esc(g.league?.country||'World')+'</div><div class="name">'+esc(leagueName(g.league))+'</div></div><div class="games-count">'+g.games.length+' '+tr.games+'</div></div>'+g.games.map(gameHTML).join('')+'</section>').join('')}
function rerenderMainOnly(){const fs=filteredFixtures(),groups=groupsFor(fs);$('count').textContent=fs.length+' '+tr.games;renderGames(groups)}
function rerender(){renderSidebar(groupsFor(state.data?.fixtures||[]));rerenderMainOnly()}
async function loadLocalLeagues(){if(!state.viewerCountry)return;try{const r=await fetch(CATALOG+'?action=leagues&country='+encodeURIComponent(state.viewerCountry));const d=await r.json();if(r.ok&&!d.error)state.localLeagues=(d.leagues||[]).slice(0,80)}catch(e){console.warn('local leagues',e)}}
function updateStamp(d){const fetched=d?.fetched_at?new Date(d.fetched_at):new Date();let when='';try{when=new Intl.DateTimeFormat(lang,{hour:'2-digit',minute:'2-digit',hour12:false}).format(fetched)}catch{}const live=(d?.fixtures||[]).filter(f=>statusType(f.status?.short)==='live').length;$('source').innerHTML='<b>'+tr.updated+'</b> • '+esc(when)+(live?' • <span class="source-live"><span class="live-dot"></span>'+live+' '+tr.live+'</span>':'')}
function setActiveFilter(filter){
  document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x.dataset.filter===filter));
}
async function loadLive(){
  if(state.loading)return;
  state.loading=true;
  state.liveMode=true;
  state.filter='live';
  state.leagueId=null;
  setActiveFilter('live');
  $('games').innerHTML='<div class="loading"><div class="spinner"></div>'+tr.loading+'</div>';
  $('count').textContent='';
  try{
    const r=await fetch(FIXTURES+'?live=all',{cache:'no-store'});
    const d=await r.json();
    if(!r.ok||d.error)throw new Error(d.error||'HTTP '+r.status);
    state.data=d;
    const groups=groupsFor(d.fixtures||[]);
    renderSidebar(groups);
    $('count').textContent=(d.fixtures||[]).length+' '+tr.games;
    renderGames(groups);
    updateStamp(d);
  }catch(e){
    $('games').innerHTML='<div class="error">'+tr.error+'<br><small>Live feed unavailable.</small></div>';
    console.error(e);
  }finally{state.loading=false}
}
async function load(opts={}){if(state.loading)return;state.loading=true;renderDates();if(!opts.silent)$('games').innerHTML='<div class="loading"><div class="spinner"></div>'+tr.loading+'</div>';$('count').textContent='';try{const r=await fetch(FIXTURES+'?date='+encodeURIComponent(state.date),{cache:'no-store'});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'HTTP '+r.status);const countryChanged=state.viewerCountry!==d.viewer_country;state.data=d;state.dailyData=d;state.liveMode=false;state.viewerCountry=d.viewer_country||state.viewerCountry||'BR';state.viewerCountryName=d.viewer_country_name||state.viewerCountryName||'Brazil';if(countryChanged||!state.localLeagues.length)await loadLocalLeagues();rerender();updateStamp(d)}catch(e){if(!opts.silent)$('games').innerHTML='<div class="error">'+tr.error+'</div>';console.error(e)}finally{state.loading=false}}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{
  const filter=b.dataset.filter;
  if(filter==='live'){loadLive();return}
  state.liveMode=false;
  state.filter=filter;
  setActiveFilter(filter);
  if(state.dailyData)state.data=state.dailyData;
  rerender();
});
$('filter-all').textContent=tr.all;$('filter-live').textContent=tr.live;$('filter-finished').textContent=tr.finished;$('filter-scheduled').textContent=tr.scheduled;$('date-picker').title=tr.calendar;$('date-picker').onchange=e=>{if(e.target.value){state.liveMode=false;state.filter='all';setActiveFilter('all');state.date=e.target.value;state.leagueId=null;load()}};$('today-btn').onclick=()=>{state.liveMode=false;state.filter='all';setActiveFilter('all');state.date=localISO(new Date());state.leagueId=null;load()};
load();setInterval(()=>{if(state.liveMode)loadLive();else if(state.date===localISO(new Date()))load({silent:true})},60000);
})();
