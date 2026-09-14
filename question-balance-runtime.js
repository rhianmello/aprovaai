(function(){
  'use strict';
  const originalSlice=Array.prototype.slice;
  const letters=['A','B','C','D','E'];
  const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  const cloneAndMoveCorrect=(q,target)=>{
    const alts=q && q.alternativas;
    const original=q && q.gabarito;
    if(!alts || !original || !alts[original] || !letters.includes(target)) return q;
    const keys=letters.filter(k=>Object.prototype.hasOwnProperty.call(alts,k));
    if(keys.length<2 || original===target) return q;
    const texts={};
    keys.forEach(k=>texts[k]=alts[k]);
    const others=keys.filter(k=>k!==original);
    const out={...q,alternativas:{...alts},gabarito:target};
    out.alternativas[target]=texts[original];
    const dest=shuffle(keys.filter(k=>k!==target));
    const source=shuffle(others);
    for(let i=0;i<source.length;i++) out.alternativas[dest[i]]=texts[source[i]];
    return out;
  };
  function balanced(input,n){
    const arr=originalSlice.call(input,0);
    if(!n || n<5 || arr.length<5) return originalSlice.call(input,0,n);
    const target=Math.min(n,arr.length);
    const by={A:[],B:[],C:[],D:[],E:[]};
    arr.forEach(q=>{if(q && letters.includes(String(q.gabarito||'').toUpperCase())) by[String(q.gabarito).toUpperCase()].push(q)});
    const chosen=[];
    const base=Math.floor(target/5),rem=target%5;
    const quotas={};letters.forEach((l,i)=>quotas[l]=base+(i<rem?1:0));
    const used=new Set();
    for(const l of letters){
      const pool=shuffle(by[l]);
      for(let i=0;i<quotas[l] && pool[i];i++){chosen.push(cloneAndMoveCorrect(pool[i],l));used.add(pool[i].id||pool[i].enunciado)}
    }
    if(chosen.length<target){
      for(const q of shuffle(arr)){if(chosen.length>=target)break;const id=q.id||q.enunciado;if(used.has(id))continue;chosen.push(cloneAndMoveCorrect(q,letters[chosen.length%5]));used.add(id)}
    }
    return shuffle(chosen);
  }
  Array.prototype.slice=function(start,end){
    const n=typeof end==='number' && start===0 ? end : null;
    if(n!==null && n>=5 && this.length>=5 && this[0] && typeof this[0]==='object' && this[0].gabarito && this[0].alternativas){
      return balanced(this,n);
    }
    return originalSlice.apply(this,arguments);
  };
})();
