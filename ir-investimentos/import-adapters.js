"use strict";
/* Leitores locais: nenhum dado de arquivo é enviado a serviços externos para extração. */
(()=>{
  const normalized=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const ticker=s=>String(s??"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
  const looksLikeAsset=s=>/^[A-Z][A-Z0-9]{3,11}$/.test(ticker(s))&&/\d/.test(ticker(s));
  function parseBR(input){
    if(typeof input==="number")return input;
    let v=String(input??"").replace(/\u00a0/g,"").replace(/R\$\s*/gi,"").replace(/\s/g,"");
    if(!v)return NaN;
    if(v.includes(",")&&v.includes("."))v=v.lastIndexOf(",")>v.lastIndexOf(".")?v.replace(/\./g,"").replace(",","."):v.replace(/,/g,"");
    else if(v.includes(","))v=v.replace(",",".");
    else if(/^\d{1,3}(?:\.\d{3})+$/.test(v))v=v.replace(/\./g,"");
    return Number(v);
  }
  function parseClearLines(pages){
    const entries=new Map(),warn=[];
    let mode=null,date=null,reportedTotal=null,cash=null,proventos=null;
    for(const page of pages){
      const lines=(page.lines||[]).filter(Boolean);
      const body=lines.join(" ");
      const fold=normalized(body);
      if(/fundos imobiliarios/.test(fold))mode="FII";
      else if(/custodia remunerada|proventos|saldo projetado|distribuicao de liquidez/.test(fold))mode=null;
      else if(/(^|\s)acoes(\s|$)/.test(fold) && /(?:qtd|quantidade|ativo)/.test(fold))mode="ACAO";
      const dm=body.match(/Data de refer[eê]ncia\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
      if(dm)date=dm[1].split("/").reverse().join("-");
      for(const line of lines){
        if(/PATRIM[ÔO]NIO TOTAL/i.test(line)){
          const match=line.match(/R\$\s*([\d.]+,\d{2})/i);if(match)reportedTotal=parseBR(match[1]);
        }
        if(/SALDO DISPON[IÍ]VEL/i.test(line)){
          const match=line.match(/R\$\s*([\d.]+,\d{2})/i);if(match)cash=parseBR(match[1]);
        }
        if(/Proventos/i.test(line)&&/R\$/i.test(line)){
          const match=line.match(/R\$\s*([\d.]+,\d{2})/i);if(match)proventos=parseBR(match[1]);
        }
        if(!mode)continue;
        const m=line.match(/(?:^|\s)([A-Z][A-Z0-9]{3,11})(?=\s)/);
        if(!m||!looksLikeAsset(m[1]))continue;
        const code=m[1],rest=line.slice((m.index||0)+m[0].length).trim();
        const currency=[...rest.matchAll(/R\$\s*([\d.]+,\d{2})/gi)].map(a=>parseBR(a[1]));
        if(currency.length<2)continue;
        const beforePrice=rest.split(/R\$/i)[0];
        const count=(beforePrice.match(/\b\d+(?:[.,]\d+)?\b/g)||[]).map(parseBR);
        const qtyIndex=mode==="ACAO"?6:4;
        if(count.length<=qtyIndex)continue;
        const qty=count[qtyIndex],last_price=currency[currency.length-2],market_value=currency[currency.length-1];
        if(!(qty>0)||!(last_price>=0)||!(market_value>=0))continue;
        if(Math.abs(qty*last_price-market_value)>Math.max(.6,market_value*.002)){
          warn.push("Valor inconsistente no relatório para "+code);
          continue;
        }
        if(entries.has(code)){warn.push("Ativo repetido em tabelas de posição: "+code);continue}
        entries.set(code,{ticker:code,asset_class:mode,qty,last_price,market_value,source_page:page.pageNumber});
      }
    }
    const items=[...entries.values()].sort((a,b)=>a.asset_class.localeCompare(b.asset_class)||a.ticker.localeCompare(b.ticker));
    const marketTotal=items.reduce((x,i)=>x+i.market_value,0);
    return {items,reference_date:date,reported_total:reportedTotal,reported_cash:cash,reported_proventos:proventos,market_total:marketTotal,warnings:warn};
  }
  function pdfPageLines(textContent,pageNumber){
    const buckets=[];
    const items=(textContent?.items||[]).filter(o=>o&&o.str?.trim()&&o.transform?.length>=6)
      .map(o=>({x:o.transform[4],y:o.transform[5],text:o.str.trim()}))
      .sort((a,b)=>b.y-a.y||a.x-b.x);
    for(const item of items){
      let bucket=buckets.find(b=>Math.abs(b.y-item.y)<2.4);
      if(!bucket){bucket={y:item.y,items:[]};buckets.push(bucket)}
      bucket.items.push(item);
    }
    return {pageNumber,lines:buckets.sort((a,b)=>b.y-a.y).map(b=>b.items.sort((a,c)=>a.x-c.x).map(x=>x.text).join(" ").replace(/\s+/g," ").trim())};
  }
  async function readClearPDF(file){
    if(!window.pdfjsLib)throw new Error("O leitor de PDF não carregou. Atualize a página.");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const pages=[];
    try{
      for(let i=1;i<=Math.min(pdf.numPages,80);i++){
        const page=await pdf.getPage(i),content=await page.getTextContent();
        pages.push(pdfPageLines(content,i));
      }
    }finally{await pdf.destroy()}
    const result=parseClearLines(pages);
    if(result.items.length<3)throw new Error("Não identifiquei a tabela de posição consolidada neste PDF. Ele será tratado apenas como documento, não como saldo de ações.");
    if(!result.reference_date)throw new Error("Não encontrei a data de referência da carteira. Confirme o PDF da posição consolidada.");
    if(result.warnings.length)throw new Error("Possíveis divergências na leitura do PDF: "+result.warnings.slice(0,4).join("; "));
    return result;
  }
  function detectMycapital(workbook){
    const names=(workbook?.SheetNames||[]).map(normalized);
    return names.includes("vista")&&names.some(s=>s.includes("aluguel"))&&names.some(s=>s.includes("irrf"));
  }
  function parseMycapital(workbook,asOf){
    if(!detectMycapital(workbook))throw new Error("Este não é o template de saldo inicial Mycapital.");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw new Error("Informe uma data-base válida.");
    const rows=[],warnings=[];
    const findSheet=word=>workbook.SheetNames.find(n=>normalized(n).includes(word));
    for(const segment of ["VISTA","ALUGUEL"]){
      const name=findSheet(segment==="VISTA"?"vista":"aluguel");
      if(!name)continue;
      const grid=window.XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:"",raw:true,blankrows:false});
      for(let i=2;i<grid.length;i++){
        const row=grid[i],code=ticker(row[0]);
        if(!looksLikeAsset(code))continue;
        const qty=parseBR(row[1]);
        if(!(qty>0))continue;
        let amount=segment==="VISTA"?parseBR(row[2]):parseBR(row[3]);
        let average=segment==="VISTA"?parseBR(row[3]):parseBR(row[2]);
        // O template recebido contém zeros em 'Valor total' e o texto '18' nas colunas de preço.
        // Não inferir custo a partir do preço isolado. Só aceitar custo total positivo e consistente.
        let total_cost=null,avg_cost=null;
        if(amount>0){
          if(average>0 && Math.abs(amount/qty-average)>Math.max(.05,amount/qty*.01)){
            warnings.push("Preço médio e custo total não conferem em "+code+" ("+segment+")");
          }else{
            total_cost=Math.round(amount*100)/100;
            avg_cost=total_cost/qty;
          }
        }
        rows.push({ticker:code,segment,qty,total_cost,avg_cost,as_of:asOf});
      }
    }
    if(!rows.length)throw new Error("Nenhuma posição encontrada nas abas VISTA e ALUGUEL (BTC).");
    const group=new Map();
    for(const r of rows){
      const x=group.get(r.ticker)||{ticker:r.ticker,qty:0,total_cost:0,cost_complete:true,segments:[]};
      x.qty+=r.qty;
      if(r.total_cost===null)x.cost_complete=false;
      else x.total_cost+=r.total_cost;
      x.segments.push(r.segment);group.set(r.ticker,x);
    }
    const grouped=[...group.values()].sort((a,b)=>a.ticker.localeCompare(b.ticker));
    const complete=grouped.filter(x=>x.cost_complete).length;
    return {rows,grouped,complete,missing:grouped.length-complete,warnings};
  }
  function reconcile(snapshotItems,balances){
    const snap=new Map((snapshotItems||[]).filter(i=>i.qty>0).map(i=>[i.ticker,Number(i.qty)]));
    const sums=new Map();
    for(const b of balances||[])sums.set(b.ticker,(sums.get(b.ticker)||0)+Number(b.qty));
    const keys=new Set([...snap.keys(),...sums.keys()]);
    const differences=[];
    for(const k of keys){
      let expected=snap.get(k)||0,template=sums.get(k)||0;
      if(Math.abs(expected-template)>.0000001)differences.push({ticker:k,position:expected,template});
    }
    return {matched:[...keys].length-differences.length,total:[...keys].length,differences};
  }
  window.IRAdapters={parseBR,parseClearLines,pdfPageLines,readClearPDF,detectMycapital,parseMycapital,reconcile};
})();