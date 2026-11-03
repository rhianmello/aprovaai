import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm";
const BASE="https://ztqtcbzjesrkuaijmylm.supabase.co";
const sb=createClient(BASE,"sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d",{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id),panel=$("meu-radar"),cards=$("personalWallets"),nav=$("accountNavLink");
const fmt=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:8});
const btc=x=>x==null?"—":fmt.format(Number(x)/1e8)+" BTC";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const when=s=>{if(!s)return "Sem data";const d=new Date(s);return Number.isNaN(d.getTime())?"Sem data":new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d)};
const short=s=>s.slice(0,14)+"…"+s.slice(-12);
let accountId=null,token=null,rows=[],generation=0,busy=false,lastFetched=0;
function status(s,error=false){$("personalStatus").textContent=s;$("personalStatus").classList.toggle("error",error)}
function renderTxs(txs){
 if(!txs?.length)return '<div class="personal-wallet-txs"><strong>Transações recentes</strong><small>Sem histórico recente disponível na consulta.</small></div>';
 return '<div class="personal-wallet-txs"><strong>Transações recentes (até 3)</strong>'+txs.slice(0,3).map(tx=>{
 const net=Number(tx.net_sat||0),val=(net>0?"+":net<0?"−":"")+btc(Math.abs(net));
 const label=net>0?"Entrada líquida":net<0?"Saída líquida":"Movimento interno";
 const url=/^[0-9a-f]{64}$/i.test(tx.txid||"")?"https://mempool.space/tx/"+tx.txid:"#";
 return '<div class="personal-tx"><div class="personal-tx-body"><b>'+label+' · '+(tx.confirmed?"Confirmada":"Pendente")+'</b><small>'+esc(when(tx.timestamp))+'</small></div>'+
 '<div class="personal-tx-value '+(net<0?"out":net===0?"same":"")+'">'+esc(val)+' <a href="'+url+'" target="_blank" rel="noopener noreferrer" aria-label="Abrir transação no explorador">↗</a></div></div>'
 }).join("")+'</div>';
}
function render(){
 $("personalCount").textContent=String(rows.length);
 $("personalShortcutCount").textContent=rows.length+" carteira(s) na sua conta";
 const ok=rows.filter(r=>r.state==="ready"&&typeof r.info?.balance_sat==="number");
 $("personalChecked").textContent=ok.length+" / "+rows.length;
 $("personalTotal").textContent=ok.length?btc(ok.reduce((s,r)=>s+Number(r.info.balance_sat),0)):"—";
 $("personalCompleteness").textContent=ok.length===rows.length&&rows.length?"Todos os saldos disponíveis":ok.length?"Total parcial: "+ok.length+"/"+rows.length:"Saldo não verificado";
 if(!rows.length){
 cards.innerHTML='<div class="personal-empty"><h3>Nenhum endereço cadastrado ainda</h3><p>Adicione seu endereço Bitcoin para visualizar os dados públicos dele aqui.</p><a href="./conta.html">Adicionar endereço ↗</a></div>';
 return;
 }
 cards.innerHTML=rows.map(({wallet:w,info:d,state})=>{
 const safeAddress=esc(w.address);
 const link="https://mempool.space/address/"+encodeURIComponent(w.address);
 const good=state==="ready",old=good&&d.stale;
 const pill=good?(old?"Dados anteriores":"Consultado"):state==="error"?"Indisponível":"Consultando";
 const source=good?(d.source?.includes("mempool")?"mempool.space":d.source?.includes("blockstream")?"Blockstream":"—"):"—";
 return '<article class="personal-wallet-card"><div class="personal-wallet-head"><div><h3>'+esc(w.label||"Carteira BTC")+'</h3><code title="'+safeAddress+'">'+esc(short(w.address))+'</code></div>'+
 '<span class="personal-wallet-pill '+(good&&!old?"ok":state==="error"||old?"warn":"")+'">'+pill+'</span></div>'+
 '<div class="personal-wallet-balance"><span>SALDO DO ENDEREÇO</span><strong>'+esc(good?btc(d.balance_sat):"—")+'</strong><small>Última consulta: '+esc(good?when(d.fetched_at):"Sem consulta")+'</small></div>'+
 '<div class="personal-wallet-meta"><div><label>CONFIRMADO</label><b>'+esc(good?btc(d.confirmed_sat):"—")+'</b></div>'+
 '<div><label>VARIAÇÃO PENDENTE</label><b>'+esc(good?btc(d.pending_delta_sat):"—")+'</b></div>'+
 '<div><label>TRANSAÇÕES</label><b>'+esc(good?String(d.tx_count??"—"):"—")+'</b></div>'+
 '<div><label>FONTE</label><b>'+esc(source)+'</b></div></div>'+
 (d?.warning?'<small class="personal-data-warning">'+esc(d.warning)+'</small>':state==="error"?'<small class="personal-data-warning">A consulta não foi concluída. Nenhum saldo foi estimado.</small>':"")+
 (good?renderTxs(d.recent_txs):'<div class="personal-wallet-txs"><strong>Transações recentes</strong><small>Aguardando dados verificáveis.</small></div>')+
 '<div class="personal-wallet-bottom"><span>Sem alertas automáticos nesta etapa</span><a href="'+link+'" target="_blank" rel="noopener noreferrer">Conferir na blockchain ↗</a></div></article>'
 }).join("");
}
function reset(){
 generation++;accountId=null;token=null;rows=[];busy=false;lastFetched=0;
 panel.hidden=true;cards.replaceChildren();$("personalShortcut").hidden=true;
 const hero=$("personalHeroLink");if(hero){hero.href="./conta.html";hero.innerHTML="Salvar minhas carteiras <span>→</span>";}
 nav.innerHTML="Entrar / Criar conta <span>↗</span>";
}
async function inspect(item,gen,accessToken){
 try{
  const url=BASE+"/functions/v1/chainwatch-wallet-info?wallet_id="+encodeURIComponent(item.wallet.id);
  const res=await fetch(url,{headers:{Authorization:"Bearer "+accessToken,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(30000)});
  const data=await res.json();
  if(gen!==generation)return;
  if(!res.ok||!data.ok||data.wallet_id!==item.wallet.id)throw Error(data.error||"Resposta inválida");
  item.state="ready";item.info=data;
 }catch(e){if(gen!==generation)return;item.state="error";item.info=null}
 if(gen===generation)render();
}
async function refresh(){
 if(busy||!accountId||!token)return;
 busy=true;const gen=++generation;
 const button=$("personalRefresh");button.disabled=true;button.textContent="Consultando...";
 status("Carregando suas carteiras cadastradas...");
 try{
  const {data,error}=await sb.from("chainwatch_user_wallets").select("id,label,address,created_at").order("created_at",{ascending:false});
  if(gen!==generation)return;
  if(error)throw error;
  rows=(data||[]).map(wallet=>({wallet,state:"loading",info:null}));render();
  if(!rows.length){status("Sua conta está conectada. Cadastre uma carteira para ver o saldo.");return;}
  status("Consultando saldos e movimentações. Fontes públicas podem demorar.");
  const t=token;
  for(const item of rows){if(gen!==generation)break;await inspect(item,gen,t)}
  if(gen===generation){
   const good=rows.filter(x=>x.state==="ready").length;
   status(good===rows.length?"Saldos consultados. Atualizações manuais usam cache de até 5 minutos.":
    good?"Consulta parcial: "+good+" de "+rows.length+" carteiras.":"Exploradores indisponíveis. Seus endereços continuam salvos.",good!==rows.length);
  }
  lastFetched=Date.now();
 }catch(e){if(gen===generation)status("Falha ao carregar seus endereços. Confira a sessão e tente novamente.",true)}
 finally{if(gen===generation){busy=false;button.disabled=false;button.textContent="↻ Consultar saldos"}}
}
async function setSession(session){
 if(!session?.user?.id||!session.access_token){reset();return;}
 const changed=session.user.id!==accountId;
 accountId=session.user.id;token=session.access_token;
 panel.hidden=false;$("personalShortcut").hidden=false;
 const hero=$("personalHeroLink");if(hero){hero.href="#meu-radar";hero.innerHTML="Meu radar pessoal <span>→</span>";}
 nav.innerHTML="Minha conta <span>↗</span>";
 $("personalGreeting").textContent=(session.user.email||"Conta conectada")+" · Seus endereços cadastrados";
 if(changed||!lastFetched)await refresh();
 if(location.hash==="#meu-radar")panel.scrollIntoView({behavior:"smooth",block:"start"});
}
$("personalRefresh").addEventListener("click",refresh);
$("personalLogout").addEventListener("click",async()=>{
 const button=$("personalLogout");button.disabled=true;
 const {error}=await sb.auth.signOut();
 button.disabled=false;
 if(error)status("Não foi possível sair da conta.",true);else reset();
});
sb.auth.onAuthStateChange((event,session)=>{
 if(event==="SIGNED_OUT"){reset();return}
 if(event==="SIGNED_IN"||event==="INITIAL_SESSION")queueMicrotask(()=>setSession(session));
 if(event==="TOKEN_REFRESHED"&&session?.access_token)token=session.access_token;
});
const initial=await sb.auth.getSession();
if(!initial.error)await setSession(initial.data.session);
window.addEventListener("focus",async()=>{
 if(accountId&&!busy&&Date.now()-lastFetched>5*60*1000){
  const current=await sb.auth.getSession();if(current.data.session)await refresh();
 }
});
