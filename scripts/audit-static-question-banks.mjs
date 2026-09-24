import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const forbidden=[
  'ACE/banco-questoes/banco_validado.json',
  'ace_marica_questoes_extra.js',
  'INSPETOR_ELETRICA/banco-questoes/inspetor_eletrica_banco.js',
  'INSPETOR_ELETRICA/banco-questoes/inspetor_eletrica_banco_geral.js',
  'INSPETOR_ELETRICA/banco-questoes/inspetor_eletrica_banco_expandido.js',
  'INSPETOR_ELETRICA/banco-questoes/inspetor_eletrica_expansao.js',
  'INSPETOR_ELETRICA/inspetor_eletrica_expansao.js',
  'INSPETOR_ELETRICA/banco-questoes/inspetor_eletrica_cobertura_min50.js'
];

const courseAccess=read('course-access.js');
for(const marker of [
  'load_legacy_course_question_bank',
  'load_legacy_question_history',
  'save_legacy_question_attempt',
  'clear_legacy_question_errors'
]){
  if(!courseAccess.includes(marker))throw new Error('Contrato de banco protegido ausente: '+marker);
}
for(const file of forbidden){
  if(existsSync(resolve(root,file)))throw new Error('Banco pago ainda publicado como arquivo estático: '+file);
}
for(const page of ['ace_marica_app_fixed.html','inspetor_eletrica.html']){
  const html=read(page);
  if(!html.includes('course-access.js?v=20260924-6'))throw new Error(page+': runtime protegido não está na versão esperada');
  for(const file of forbidden){
    if(html.includes('src="./'+file)||html.includes("src='./"+file))throw new Error(page+': ainda carrega banco estático '+file);
  }
}
console.log('PROTECTED_BANK_AUDIT '+JSON.stringify({protectedRpc:true,publicBankFiles:0,pages:['ace_marica_app_fixed.html','inspetor_eletrica.html']}));
