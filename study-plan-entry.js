/* Integração mínima: adiciona Meu Plano e seu card de desempenho sem alterar o motor do dashboard. */
(function(){
  let dashboardLoaded=false;
  const loadAssets=()=>{
    if(dashboardLoaded)return;
    const C=window.STUDY_CONFIG||{};
    if(!document.querySelector('.app-shell'))return;
    dashboardLoaded=true;
    if(!document.querySelector('link[data-study-plan-css]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href='./study-plan-dashboard.css?v=20260909-1';link.dataset.studyPlanCss='1';document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-study-plan-dashboard]')){
      const s=document.createElement('script');s.src='./study-plan-dashboard.js?v=20260909-1';s.dataset.studyPlanDashboard='1';document.body.appendChild(s);
    }
  };
  const add=()=>{
    const C=window.STUDY_CONFIG||{};
    const nav=document.querySelector('.side-nav');
    if(nav&&!nav.querySelector('[data-study-plan-entry]')){
      const slug=C.courseSlug||C.slug;
      if(slug){
        const a=document.createElement('a');
        a.className='side-btn';a.dataset.studyPlanEntry='1';a.href='./meu-plano.html?course='+encodeURIComponent(slug);a.textContent='📅 Meu Plano';
        const ref=nav.querySelector('[data-s="plan"]');if(ref)ref.insertAdjacentElement('afterend',a);else nav.appendChild(a);
      }
    }
    loadAssets();
  };
  const obs=new MutationObserver(add);obs.observe(document.documentElement,{childList:true,subtree:true});add();
})();
