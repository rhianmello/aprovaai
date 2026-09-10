/* Nós Passa — UX do teste grátis por curso. */
(function(){
'use strict';
function setup(){
  const params=new URLSearchParams(location.search), slug=(params.get('course')||'').trim();
  if(!slug)return;
  const choices=document.getElementById('choices'), sim=document.getElementById('sim');
  if(!choices||!sim)return;
  let box=document.getElementById('selected-course-box');
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const update=()=>{
    const card=choices.querySelector('.choice[data-course="'+CSS.escape(slug)+'"]');
    if(!card)return false;
    const title=card.querySelector('h2')?.textContent?.trim()||slug;
    if(!box){
      box=document.createElement('section');
      box.id='selected-course-box';
      box.style.cssText='margin:20px 0;padding:18px;border:1px solid #40391c;border-radius:16px;background:#111820;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap';
      sim.parentNode.insertBefore(box,sim);
    }
    box.innerHTML='<div><div style="font-size:11px;color:#8be3b7;font-weight:900;text-transform:uppercase">Teste grátis selecionado</div><h2 style="margin:6px 0 4px;font-size:21px">'+esc(title)+'</h2><div style="font-size:12px;color:#aab2bd">Você chegou aqui pelo botão deste curso. O teste começa logo abaixo.</div></div><button id="change-course" class="btn dark" type="button">🔎 Escolher outro curso</button>';
    choices.style.display='none';
    const toolbar=document.querySelector('.toolbar');if(toolbar)toolbar.style.display='none';
    const b=document.getElementById('change-course');
    if(b)b.onclick=()=>{choices.style.display='grid';if(toolbar)toolbar.style.display='flex';box.remove();box=null;};
    return true;
  };
  if(!update()){
    let n=0;const timer=setInterval(()=>{if(update()||++n>80)clearInterval(timer)},250);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
