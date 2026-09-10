/* Bridge legado: o Meu Plano V2 ainda lê o mapa IDS do course-access.js. */
(function(){
'use strict';
const originalFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
 const url=typeof input==='string'?input:(input?.url||'');
 if(url.includes('/course-access.js')){
  try{
   const map=await originalFetch('./data/course-map.json',{cache:'no-store'}).then(r=>r.json());
   const base=await originalFetch(input,init);const text=await base.text();
   return new Response('const IDS='+JSON.stringify(map)+';\n'+text,{status:base.status,statusText:base.statusText,headers:base.headers});
  }catch(e){console.warn('[CourseMapBridge]',e)}
 }
 return originalFetch(input,init);
};
})();
