/* Nós Passa — acabamento da lista de tópicos/questões. */
(function(){
  function polish(root){
    if(!root) return;
    root.querySelectorAll('.list-row').forEach(row=>{
      const count=row.querySelector('.muted');
      if(count){
        const n=parseInt((count.textContent||'').match(/\d+/)?.[0]||'0',10);
        count.textContent=`${n} ${n===1?'questão':'questões'}`;
      }
    });
  }
  function start(){
    polish(document.getElementById('topicList'));
    const obs=new MutationObserver(()=>polish(document.getElementById('topicList')));
    obs.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
