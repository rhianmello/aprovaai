/* Nós Passa — UX do teste grátis por edital/cargo. */
(function(){
'use strict';
function referrerCourse(){
  try{
    const p=new URL(document.referrer).pathname.toLowerCase();
    if(p.endsWith('/ace-marica-landing.html'))return'ace-marica';
    if(p.endsWith('/transpetro-landing.html')||p.endsWith('/transpetro-landing-v2.html'))return'transpetro';
    if(p.endsWith('/inspetor-eletrica-landing.html'))return'inspetor-eletrica';
  }catch(e){}
  return'';
}
const EDITAL_TRANS='Transpetro 2026';
const EDITAL_ACE='ACE Maricá';
function editalOf(c){
  if(!c)return'';
  const s=String(c.slug||'');
  if(s==='ace-marica')return EDITAL_ACE;
  if(s==='transpetro'||s==='inspetor-eletrica'||s.startsWith('transpetro-2026-'))return EDITAL_TRANS;
  return'';
}
function isRJOnly(c){return !!c&&String(c.slug||'')==='ace-marica';}
function cargoLabel(c){
  if(!c)return'';
  if(c.slug==='transpetro')return'Análise de Sistemas — SAP';
  return String(c.name||'').replace(/^Transpetro 2026\s*[—-]\s*/,'');
}
function getCourses(){
  try{return (typeof courses!=='undefined'&&Array.isArray(courses))?courses:[];}catch(e){return[];}
}
function setup(){
  const style=document.createElement('style');style.textContent='@media(max-width:600px){.actions{display:flex!important}}';document.head.appendChild(style);
  const state=document.getElementById('state'),edital=document.getElementById('edital'),cargo=document.getElementById('cargo'),sim=document.getElementById('sim'),status=document.getElementById('status');
  if(!state||!edital||!cargo||!sim)return;
  let lastSignature='';
  function availableCourses(){
    const uf=state.value,all=getCourses();
    return all.filter(c=>{
      const e=editalOf(c);
      if(!e)return false;
      if(uf==='RJ')return true;
      return e===EDITAL_TRANS&&!isRJOnly(c);
    });
  }
  function rebuildEditais(preserve){
    const uf=state.value,list=availableCourses(),allowed=[];
    if(list.some(c=>editalOf(c)===EDITAL_TRANS))allowed.push(EDITAL_TRANS);
    if(uf==='RJ'&&list.some(c=>editalOf(c)===EDITAL_ACE))allowed.push(EDITAL_ACE);
    const old=preserve!==undefined?preserve:edital.value;
    edital.innerHTML='<option value="">Escolha o edital</option>'+allowed.map(e=>'<option value="'+e+'">'+e+'</option>').join('');
    edital.value=allowed.includes(old)?old:'';
    rebuildCargos();
  }
  function rebuildCargos(preserve){
    const selectedEdital=edital.value,old=preserve!==undefined?preserve:cargo.value;
    const list=availableCourses().filter(c=>editalOf(c)===selectedEdital);
    cargo.innerHTML='<option value="">Escolha o cargo</option>'+list.map(c=>'<option value="'+String(c.slug||'').replace(/"/g,'&quot;')+'">'+cargoLabel(c).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))+'</option>').join('');
    cargo.value=list.some(c=>c.slug===old)?old:'';
    updateStatus();
  }
  function updateStatus(){
    if(!status)return;
    if(state.value==='RJ'&&!edital.value)status.textContent='Rio de Janeiro: escolha o edital (Transpetro 2026 ou ACE Maricá).';
    else if(!edital.value)status.textContent='Escolha o edital para ver os cargos.';
    else if(!cargo.value)status.textContent='Agora escolha o cargo.';
    else status.textContent='Cargo selecionado. O teste está logo abaixo.';
  }
  function openTest(){
    const slug=cargo.value;if(!slug)return;
    if(typeof window.start==='function')window.start(slug);
    setTimeout(()=>sim.scrollIntoView({behavior:'smooth',block:'start'}),120);
  }
  function bind(){
    const all=getCourses();if(!all.length)return false;
    const sig=all.map(c=>c.slug).join('|');
    if(lastSignature!==sig){lastSignature=sig;rebuildEditais();}
    state.onchange=function(){rebuildEditais('');};
    edital.onchange=function(){rebuildCargos('');};
    cargo.onchange=function(){updateStatus();openTest();};
    const params=new URLSearchParams(location.search),requested=(params.get('course')||'').trim()||referrerCourse();
    if(requested&&all.some(c=>c.slug===requested)){
      const c=all.find(x=>x.slug===requested),e=editalOf(c);
      if(e){
        if(isRJOnly(c))state.value='RJ';
        rebuildEditais(e);cargo.value=c.slug;updateStatus();openTest();
      }
    }
    return true;
  }
  let tries=0;const timer=setInterval(()=>{if(bind()||++tries>100)clearInterval(timer)},200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
