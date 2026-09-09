/* Nós Passa — adaptador de disciplina/assunto do Meu Plano.
 * Lê os mesmos bancos já usados pelos ambientes existentes.
 * Não altera nem duplica o banco de questões.
 */
(function(){
  const ASSETS={
    'ace-marica':{json:'ACE/banco-questoes/banco_validado.json'},
    'transpetro':{json:'TRANSPETRO/banco-questoes/banco_validado.json',scripts:[
      'TRANSPETRO/banco-questoes/transpetro_banco_curado.js',
      'TRANSPETRO/banco-questoes/edital_2026_sap.js',
      'TRANSPETRO/banco-questoes/edital_2026_sistemas_bi.js',
      'TRANSPETRO/banco-questoes/edital_2026_parte3.js'
    ]},
    'inspetor-eletrica':{scripts:[
      'INSPETOR_ELETRICA/banco-questoes/inspetor_eletrica_banco.js',
      'INSPETOR_ELETRICA/banco-questoes/inspetor_eletrica_banco_geral.js',
      'INSPETOR_ELETRICA/inspetor_eletrica_expansao.js'
    ]}
  };

  const GROUPERS={
    ace:q=>'ACE / SUS',
    transpetro:q=>{
      const s=norm([q.disciplina,q.assunto,q.subassunto,q.enunciado].join(' '));
      if(s.includes('portugues'))return'Português';
      if(s.includes('ingles'))return'Inglês';
      if(/sap|erp|\bfi\b|\bmm\b|\bsd\b|\bpm\b|fiori|abap/.test(s))return'SAP';
      if(/etl|warehouse|data mart|olap|data mining|bsc|modelagem dimensional|\bbi\b/.test(s))return'BI';
      if(/pmbok|scrum|kanban|agile|gestao de projeto/.test(s))return'Gestão';
      return'Sistemas';
    },
    'inspetor-eletrica':q=>{
      const s=norm([q.disciplina,q.assunto,q.subassunto,q.enunciado].join(' '));
      if(s.includes('portugues'))return'Português';
      if(s.includes('matematica'))return'Matemática';
      if(s.includes('fisica'))return'Física';
      if(s.includes('qualidade')||s.includes('iso'))return'Qualidade';
      if(s.includes('metrologia')||s.includes('unidade')||s.includes('escala')||s.includes('coordenada'))return'Metrologia';
      if(s.includes('seguranca')||s.includes('higiene'))return'Segurança';
      if(s.includes('eletrotecnica'))return'Eletrotécnica';
      if(s.includes('maquina')||s.includes('dispositivo'))return'Máquinas e dispositivos';
      if(s.includes('medic')||s.includes('megometro')||s.includes('aterramento')||s.includes('isolacao'))return'Medições elétricas';
      if(s.includes('desenho')||s.includes('unifilar')||s.includes('simbologia'))return'Desenho técnico';
      return'Outros';
    }
  };

  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
  function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./'+src+'?v=20260909-1';s.onload=resolve;s.onerror=()=>reject(new Error('Falha ao carregar '+src));document.head.appendChild(s)})}
  async function load(cfg){
    const slug=String(cfg||'');
    const a=ASSETS[slug];
    if(!a) throw new Error('Curso sem adaptador de conteúdo: '+slug);
    if(a.json){
      const r=await fetch('./'+a.json+'?'+Date.now());
      if(!r.ok)throw new Error('Banco de questões indisponível.');
      const j=await r.json();
      if(Array.isArray(j))window.__NP_PLAN_QUESTIONS=(window.__NP_PLAN_QUESTIONS||[]).concat(j);
      else window.__NP_PLAN_QUESTIONS=(window.__NP_PLAN_QUESTIONS||[]).concat(j.questoes||[]);
    }
    for(const src of (a.scripts||[])) await loadScript(src);
    if(slug==='transpetro'){
      window.__NP_PLAN_QUESTIONS=(window.__NP_PLAN_QUESTIONS||[]).concat(window.TRANSPETRO_CURADO||[],window.TRANSPETRO_EDITAL_2026||[],window.TRANSPETRO_SISTEMAS_BI||[],window.TRANSPETRO_PARTE3||[]);
    }
    if(slug==='inspetor-eletrica'){
      window.__NP_PLAN_QUESTIONS=(window.__NP_PLAN_QUESTIONS||[]).concat(window.INSPETOR_ELETRICA_BANK||[],window.INSPETOR_ELETRICA_GERAL_BANK||[],window.INSPETOR_ELETRICA_EXPANSAO_BANK||[]);
    }
    const q=window.__NP_PLAN_QUESTIONS||[],group=GROUPERS[slug]||((x)=>x.disciplina||'Outros'),tree=new Map();
    q.forEach(item=>{
      const subject=String(item.disciplina||'').trim()||group(item);
      const topic=String(item.assunto||item.subassunto||'').trim();
      if(!subject||!topic)return;
      if(!tree.has(subject))tree.set(subject,new Set());
      tree.get(subject).add(topic);
    });
    const subjects=[...tree.keys()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const topics={};subjects.forEach(s=>topics[s]=[...tree.get(s)].sort((a,b)=>a.localeCompare(b,'pt-BR')));
    return {subjects,topics,questionCount:q.length};
  }
  window.NPStudyContent={load};
})();
