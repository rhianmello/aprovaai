import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
async function audit(page){
  const html=read(page);
  const context=vm.createContext({
    window:{},
    console:{log(){},warn(){},error(){}},
    fetch:async path=>{
      const file=String(path).split('?')[0].replace(/^\.\//,'');
      if(file!=='ACE/banco-questoes/banco_validado.json')throw new Error('Unexpected bank URL: '+file);
      return {ok:true,json:async()=>JSON.parse(read(file))};
    }
  });
  const sources=[];
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    const src=/\bsrc=["']([^"']+)["']/.exec(match[1])?.[1];
    if(src){
      const file=src.split('?')[0].replace(/^\.\//,'');
      if(file.startsWith('INSPETOR_ELETRICA/')||file==='ace_marica_questoes_extra.js'){
        vm.runInContext(read(file),context,{timeout:5000,filename:file});
        sources.push(file);
      }
    }else if(match[2].includes('window.STUDY_CONFIG=')||match[2].includes('window.INSPETOR_ELETRICA_EXPANSAO_EXTRA_BANK=')){
      vm.runInContext(match[2],context,{timeout:5000,filename:page});
    }
  }
  const config=context.window.STUDY_CONFIG;
  if(typeof config?.bankLoader!=='function')throw new Error('Missing bankLoader: '+page);
  const loaded=await config.bankLoader();
  const bank=[...new Map(loaded.filter(Boolean).map(q=>[q.id||q.enunciado,q])).values()];
  const topics=new Map(),texts=new Map();
  for(const q of bank){
    const key=JSON.stringify([q.disciplina||'Conhecimentos Específicos',q.assunto||'Sem assunto']);
    topics.set(key,(topics.get(key)||0)+1);
    const signature=String(q.enunciado||'').trim().replace(/\s+/g,' ').toLowerCase();
    texts.set(signature,(texts.get(signature)||0)+1);
  }
  const rows=[...topics].map(([key,count])=>{const [subject,topic]=JSON.parse(key);return {subject,topic,count}}).sort((a,b)=>a.count-b.count||a.topic.localeCompare(b.topic,'pt-BR'));
  return {page,kind:'static-source-audit-not-browser',sources,loaded:loaded.length,distinctIds:bank.length,duplicateIds:loaded.length-bank.length,duplicateStatementGroups:[...texts.values()].filter(n=>n>1).length,minTopic:rows.length?Math.min(...rows.map(r=>r.count)):0,topics:rows};
}
for(const page of ['ace_marica_app_fixed.html','inspetor_eletrica.html']){
  const result=await audit(page);
  console.log('STATIC_BANK_AUDIT '+JSON.stringify(result));
  if(result.minTopic<50)throw new Error(page+': tópico com menos de 50 questões válidas');
  if(result.duplicateIds)throw new Error(page+': IDs duplicados no carregador');
}
