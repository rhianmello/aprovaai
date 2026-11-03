"use strict";
const API="https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/btc-radar";
const TEN_SECONDS=10;
const $=id=>document.getElementById(id);
let wallets=[],events=[],timeToRefresh=TEN_SECONDS,loaded=false,checkFinished=false;
let notificationsAllowed=false,fetching=false;
const seenKey="chainwatch_seen_txids_v1";
const pt=new Intl.NumberFormat("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:8});
const short=a=>a?String(a).slice(0,10)+"…"+String(a).slice(-9):"—";
const safe=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const formatSat=v=>v==null?"—":pt.format(Number(v)/1e8)+" BTC";
const validBtc=s=>/^bc1q[ac-hj-np-z02-9]{38,90}$/i.test(s||"");
const validTx=s=>/^[a-f0-9]{64}$/i.test(s||"");
const when=s=>s?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"medium",timeZone:"America/Sao_Paulo"}).format(new Date(s)):"—";
function notice(message,error=false){$("notice").textContent=message;$("notice").classList.toggle("error",error)}
function badge(text,type){return '<span class="tag '+type+'">'+safe(text)+"</span>"}
function renderWallets(){
 const query=$("walletSearch").value.trim().toLowerCase();
 const filtered=wallets.filter(w=>w.address.toLowerCase().includes(query)||String(w.wallet_no)===query);
 const body=$("walletRows");
 if(!filtered.length){body.innerHTML='<tr><td colspan="6" class="loading">'+(wallets.length?"Nenhum endereço corresponde à busca.":"Endereços indisponíveis.")+"</td></tr>";return;}
 body.innerHTML=filtered.map(w=>{
  const spent=Number(w.confirmed_spent_sat||0)+Number(w.mempool_spent_sat||0);
  const state=!w.last_checked_at?badge("Aguardando","pending"):w.last_error?badge("API limitada (429)","pending"):spent>0?badge("Com saída","bad"):badge("Sem saída","ok");
  return '<tr><td>'+w.wallet_no+'</td><td><span class="address" title="'+safe(w.address)+'">'+safe(short(w.address))+
  '</span><button class="copy-btn" type="button" data-copy="'+safe(w.address)+'" title="Copiar endereço" aria-label="Copiar carteira '+w.wallet_no+'">⧉</button></td>'+
  '<td class="value-btc">'+pt.format(Number(w.original_btc))+' BTC</td><td class="value-btc">'+formatSat(w.balance_sat)+'</td>'+
  '<td>'+state+'</td><td><a class="table-link" target="_blank" rel="noopener noreferrer" href="https://mempool.space/address/'+encodeURIComponent(w.address)+'">Ver transações ↗</a></td></tr>';
 }).join("");
}
function renderEvents(){
 const rows=$("eventRows");
 if(!checkFinished&&events.length===0){rows.innerHTML='<div class="empty-state">Primeira checagem ainda não concluída.</div>';return;}
 if(events.length===0){rows.innerHTML='<div class="empty-state"><strong>Nenhuma saída registrada até a última consulta.</strong><p>Este resultado não garante ausência de transações fora das verificações disponíveis.</p></div>';return;}
 rows.innerHTML=events.map(e=>{
  const date=e.confirmed?when(e.block_time):"Aguardando confirmação";
  const outputs=Array.isArray(e.outputs)?e.outputs:[];
  const dest=outputs.filter(v=>v.address!==e.address).slice(0,4).map(v=>short(v.address)).join(" · ")||"Sem destinos legíveis";
  const txlink=validTx(e.txid)?"https://mempool.space/tx/"+e.txid:"#";
  const status=e.confirmed?badge("Confirmada","ok"):badge("Na mempool","pending");
  return '<div class="event"><div><strong class="event-value">↗ '+formatSat(e.amount_sat)+' movimentados</strong> '+status+
    '<small>Origem: '+safe(short(e.address))+' · '+safe(date)+'</small>'+
    '<small>Saídas listadas (podem incluir troco): '+safe(dest)+'</small>'+
    '<small>TXID: '+safe(e.txid)+'</small></div><a href="'+txlink+'" target="_blank" rel="noopener noreferrer">Ver prova ↗</a></div>';
 }).join("");
}
function updateUI(data){
 wallets=Array.isArray(data.wallets)?data.wallets:[];
 events=Array.isArray(data.events)?data.events:[];
 const run=data.last_run||null;
 checkFinished=!!(run&&run.finished_at&&run.checked>0);
 $("walletCount").textContent=String(wallets.length||19);
 $("eventCount").textContent=checkFinished?(events.length>=50?"50+":String(events.length)):"—";
 $("eventsTabCount").textContent=checkFinished?(events.length>=50?"50+":String(events.length)):"—";
 $("lastCheck").textContent=run&&run.finished_at?when(run.finished_at):"Aguardando";
 $("checkDetail").textContent=run&&run.finished_at?run.checked+"/19 carteiras consultadas · "+(run.errors||0)+" falhas":"Monitor inicializando";
 $("terminalStatus").textContent=run&&run.finished_at?"Última execução: "+when(run.finished_at):"Sem verificação concluída";
 const delaySeconds=run&&run.finished_at?Math.floor((Date.now()-new Date(run.finished_at).getTime())/1000):Infinity;
 const delayed=delaySeconds>180;
 $("syncChip").classList.toggle("warn",!checkFinished||run.errors>0||delayed);
 $("syncText").textContent=!run?"Aguardando primeira varredura":!run.finished_at?"Processando":run.errors>0?"Verificação parcial":delayed?"Dados atrasados":"Dados consultados";
 if(!run||!run.finished_at)notice("A varredura está inicializando. Os saldos e estados só aparecem depois de uma consulta concluída.");
 else if(run.errors)notice("Verificação parcial: "+run.checked+" de 19 carteiras consultadas. "+run.errors+" falha(s). Não é possível garantir ausência de saídas.",true);
 else if(delayed)notice("Última consulta concluída há "+delaySeconds+" segundos. O sistema pode estar aguardando resposta dos exploradores. Não interprete este painel como um estado em tempo real.",true);
 else notice("Última execução concluída em "+when(run.finished_at)+". Dados da blockchain podem sofrer atraso ou reorganização.");
 renderWallets();renderEvents();
 updateSeen(events,checkFinished);
}
function updateSeen(latest,ready){
 if(!ready)return;
 const ids=latest.map(e=>e.address+":"+e.txid);
 const oldRaw=localStorage.getItem(seenKey);
 let old=[];
 try{if(oldRaw)old=JSON.parse(oldRaw)}catch(_){}
 if(oldRaw&&notificationsAllowed&&typeof Notification!=="undefined"&&Notification.permission==="granted"){
  const fresh=latest.filter(e=>!old.includes(e.address+":"+e.txid));
  for(const e of fresh.slice(0,4)){
   const n=new Notification("ChainWatch · Nova saída de BTC",{
     body:formatSat(e.amount_sat)+" · "+short(e.address)+" · "+(e.confirmed?"Confirmada":"Pendente"),
     tag:"btc-"+e.txid});
   n.onclick=()=>{window.focus();$("tabEvents").click();};
  }
 }
 localStorage.setItem(seenKey,JSON.stringify([...new Set([...ids,...old])].slice(0,250)));
}
async function refresh(){
 if(fetching)return;
 fetching=true;$("refreshBtn").disabled=true;
 try{
   const response=await fetch(API+"?ts="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(18000)});
   if(!response.ok)throw Error("HTTP "+response.status);
   const data=await response.json();
   if(!data.ok||!Array.isArray(data.wallets))throw Error("Sem dados válidos");
   updateUI(data);
   loaded=true;
 }catch(error){
   $("syncChip").classList.add("warn");
   $("syncText").textContent="Conexão indisponível";
   notice("Não foi possível consultar o servidor agora. Não interprete os dados anteriores como estado atual. "+String(error.message||error),true);
   if(!loaded){$("lastCheck").textContent="Indisponível";$("checkDetail").textContent="Sem informação validada";}
 }finally{
   fetching=false;$("refreshBtn").disabled=false;timeToRefresh=TEN_SECONDS;showCountdown();
 }
}
function showCountdown(){const mm=String(Math.floor(timeToRefresh/60)).padStart(2,"0"),ss=String(timeToRefresh%60).padStart(2,"0");$("countdown").textContent=mm+":"+ss;}
function tab(which){
 const eventView=which==="events";
 $("walletsPanel").hidden=eventView;$("eventsPanel").hidden=!eventView;
 $("tabWallets").classList.toggle("active",!eventView);$("tabEvents").classList.toggle("active",eventView);
 $("tabWallets").setAttribute("aria-selected",String(!eventView));$("tabEvents").setAttribute("aria-selected",String(eventView));
 $("walletSearch").hidden=eventView;
}
$("tabWallets").addEventListener("click",()=>tab("wallets"));
$("tabEvents").addEventListener("click",()=>tab("events"));
$("walletSearch").addEventListener("input",renderWallets);
$("refreshBtn").addEventListener("click",refresh);
$("walletRows").addEventListener("click",async(e)=>{
 const b=e.target.closest("[data-copy]");if(!b)return;
 try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent="✓";setTimeout(()=>b.textContent="⧉",1400)}
 catch(_){notice("Não foi possível copiar automaticamente. Selecione o endereço no explorador.",true)}
});
$("notifyBtn").addEventListener("click",async()=>{
 if(!("Notification" in window)){notice("Seu navegador não oferece notificações nesta página.",true);return;}
 const permission=await Notification.requestPermission();
 notificationsAllowed=permission==="granted";
 $("notifyBtn").textContent=notificationsAllowed?"Alertas locais ativados ✓":"Permissão não concedida";
 if(notificationsAllowed)notice("Alertas do navegador ativados enquanto esta aba permanecer aberta.");
});
setInterval(()=>{if(timeToRefresh>0)timeToRefresh--;else refresh();showCountdown();},1000);
showCountdown();refresh();
$("waitlistForm").addEventListener("submit",async function(ev){
 ev.preventDefault();
 const form=ev.currentTarget,submit=form.querySelector("button[type=submit]");
 const status=$("waitlistStatus");
 const values=new FormData(form);
 status.textContent="Registrando interesse...";status.classList.remove("error");
 submit.disabled=true;
 try{
   const response=await fetch("https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/btc-radar-waitlist",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      email:String(values.get("email")||"").trim(),plan:String(values.get("plan")||"pro"),
      consent:values.get("consent")==="on",company:String(values.get("company")||"")
    }),signal:AbortSignal.timeout(15000)
   });
   const result=await response.json();
   if(!response.ok||!result.ok)throw Error(result.error||"Erro no envio.");
   status.textContent="Recebemos seu interesse. O envio de e-mails começará quando o serviço for lançado.";
   form.reset();
 }catch(err){status.textContent="Não foi possível registrar: "+String(err.message||err);status.classList.add("error")}
 finally{submit.disabled=false}
});
