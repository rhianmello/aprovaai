import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm";
const sb=createClient("https://ztqtcbzjesrkuaijmylm.supabase.co","sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d",{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const BASE="https://ztqtcbzjesrkuaijmylm.supabase.co";
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:8});
const btc=v=>v==null?"—":fmt.format(Number(v)/1e8)+" BTC";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const short=s=>s?String(s).slice(0,14)+"…"+String(s).slice(-11):"—";
const date=s=>{const x=new Date(s||"");return Number.isNaN(x.getTime())?"—":new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(x)};
const txURL=s=>/^[a-f0-9]{64}$/i.test(s||"")?"https://mempool.space/tx/"+s:"https://mempool.space/";
const addrURL=a=>"https://mempool.space/address/"+encodeURIComponent(a);
const views={overview:"Visão geral",wallets:"Minhas carteiras",binance:"Radar Binance",history:"Histórico",alerts:"Alertas",plans:"Planos e preços",settings:"Configurações"};
let user=null,wallets=[],cache=new Map(),selected=null,busy=false;
function alertMsg(message,type="info"){const v=$("flash");v.hidden=false;v.className="flash "+type;v.textContent=message;}
function mobile(open){$("sidebar").classList.toggle("open",open);$("mobileCover").hidden=!open;$("menuBtn").setAttribute("aria-expanded",String(open))}
function page(name){
 name=views[name]?name:"overview";
 document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+name));
 document.querySelectorAll(".nav-item[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===name));
 $("crumb").textContent=views[name];mobile(false);
 if(location.hash!=="#"+name)history.pushState(null,"","#"+name);
 if(name==="wallets")drawWallets();if(name==="history")drawHistory();if(name==="binance")loadPublic();
 if(name==="settings")$("settingsEmail").textContent=user?.email||"—";
 window.dispatchEvent(new CustomEvent("chainwatch:view",{detail:{name}}));
 window.scrollTo(0,0);
}
function totals(){
 const ok=wallets.filter(w=>typeof cache.get(w.id)?.balance_sat==="number");
 $("kpiWallets").textContent=wallets.length;$("sideWalletCount").textContent=wallets.length;
 $("kpiChecked").textContent=ok.length+"/"+wallets.length;
 $("kpiBalance").textContent=ok.length?btc(ok.reduce((s,w)=>s+Number(cache.get(w.id).balance_sat),0)):"—";
 $("kpiBalanceDetail").textContent=ok.length===wallets.length&&ok.length?"Saldos consultados":ok.length?"Total parcial ("+ok.length+"/"+wallets.length+")":"Saldo não verificado";
}
function txItems(max=100){
 return wallets.flatMap(w=>(cache.get(w.id)?.recent_txs||[]).slice(0,12).map(t=>({...t,label:w.label||"Carteira BTC"})))
 .sort((a,b)=>(Date.parse(b.timestamp||"")||0)-(Date.parse(a.timestamp||"")||0)).slice(0,max);
}
function signed(v){return (v>0?"+":v<0?"−":"")+btc(Math.abs(v));}
function movement(t){
 const n=Number(t.net_sat||0);return {n,kind:n>0?"Entrada":n<0?"Saída":"Movimentação",color:n>0?"positive":n<0?"negative":"neutral"};
}
function drawOverview(){
 totals();
 $("overviewWallets").innerHTML=wallets.length?wallets.map(w=>
 '<button class="overview-wallet-row" data-open="'+esc(w.id)+'"><span class="coin-icon">₿</span><div><strong>'+esc(w.label)+'</strong><small>'+esc(short(w.address))+'</small></div><b>'+esc(btc(cache.get(w.id)?.balance_sat))+'</b><i>›</i></button>').join("")
 :'<div class="empty-note">Você ainda não cadastrou carteiras. <button class="text-action" data-action="add">Adicionar uma →</button></div>';
 const tx=txItems(5);
 $("overviewEvents").innerHTML=tx.length?tx.map(t=>{
 const m=movement(t);return '<div class="activity-row"><div><strong>'+m.kind+' · '+esc(t.label)+'</strong><small>'+esc(t.confirmed?date(t.timestamp):"Pendente")+'</small></div><b class="'+m.color+'">'+esc(signed(m.n))+'</b></div>';
 }).join(""):'<div class="empty-note">Nenhuma movimentação recente disponível nas consultas.</div>';
}
function drawWallets(){
 $("listCount").textContent=wallets.length+"/5";
 if(!wallets.length){
  $("walletList").innerHTML='<div class="empty-note">Nenhum endereço cadastrado.<button class="text-action" data-action="add">Adicionar agora →</button></div>';
  $("walletDetail").innerHTML='<div class="empty-detail"><span>◈</span><h2>Cadastre sua primeira carteira</h2><p>Adicione um endereço público para consultar dados reais da blockchain.</p></div>';return;
 }
 if(!selected||!wallets.some(w=>w.id===selected))selected=wallets[0].id;
 $("walletList").innerHTML=wallets.map(w=>'<button data-select="'+esc(w.id)+'" class="wallet-list-item'+(w.id===selected?" active":"")+'"><span class="coin-icon">₿</span><div><strong>'+esc(w.label)+'</strong><small>'+esc(short(w.address))+'</small></div><span class="point-arrow">›</span></button>').join("");
 const w=wallets.find(x=>x.id===selected),d=cache.get(w.id);
 const tx=Array.isArray(d?.recent_txs)?d.recent_txs.slice(0,8):[];
 $("walletDetail").innerHTML='<div class="detail-header"><div><div class="kicker">CARTEIRA / BITCOIN</div><h2>'+esc(w.label)+'</h2><code>'+esc(w.address)+'</code></div>'+
 '<div class="detail-actions"><button class="mini-button" data-action="copy">Copiar</button><button class="mini-button" data-action="rename">Renomear</button><button class="mini-button danger" data-action="delete">Remover</button></div></div>'+
 '<div class="detail-main"><div class="detail-label">SALDO DO ENDEREÇO</div><div class="detail-balance">'+esc(btc(d?.balance_sat))+'</div>'+
 '<p class="detail-checked">'+esc(d?.fetched_at?"Consultado em "+date(d.fetched_at)+(d.stale?" · cache desatualizado":""):"Aguardando consulta à blockchain")+'</p>'+
 '<div class="detail-metrics"><div class="detail-metric"><span>CONFIRMADO</span><strong>'+esc(btc(d?.confirmed_sat))+'</strong></div>'+
 '<div class="detail-metric"><span>VARIAÇÃO PENDENTE</span><strong>'+esc(btc(d?.pending_delta_sat))+'</strong></div>'+
 '<div class="detail-metric"><span>TRANSAÇÕES</span><strong>'+esc(d?.tx_count??"—")+'</strong></div></div></div>'+
 '<div class="detail-section"><h3>Transações recentes</h3>'+(
 tx.length?tx.map(t=>{const m=movement(t);return '<div class="tx-inline"><div><strong>'+m.kind+' líquida</strong><small>'+esc(t.confirmed?date(t.timestamp):"Pendente")+'</small></div><div><b class="'+m.color+'">'+esc(signed(m.n))+'</b> <a target="_blank" rel="noopener noreferrer" href="'+txURL(t.txid)+'">↗</a></div></div>'}).join("")
 :'<div class="empty-note">Nenhum histórico recente disponível nesta consulta.</div>')+'</div>'+
 '<div class="detail-foot"><small>Dados on-chain públicos · '+(d?.stale?"Cache desatualizado":d?"Consultado":"Consulta pendente")+'</small><div><button class="mini-button" data-action="refresh-one">↻ Consultar</button> <a href="'+addrURL(w.address)+'" target="_blank" rel="noopener noreferrer">Explorador ↗</a></div></div>';
}
function drawHistory(){
 const items=txItems(50);
 $("historyCount").textContent=items.length+" registros recentes";
 $("historyRows").innerHTML=items.length?items.map(t=>{const m=movement(t);return '<tr><td>'+esc(t.label)+'</td><td class="'+m.color+'">'+esc(signed(m.n))+'</td><td>'+esc(t.confirmed?"Confirmada":"Pendente")+'</td><td>'+esc(date(t.timestamp))+'</td><td><a href="'+txURL(t.txid)+'" target="_blank" rel="noopener noreferrer">Ver transação ↗</a></td></tr>'}).join("")
 :'<tr><td colspan="5">Sem transações consultadas. Abra Minhas carteiras e atualize os dados.</td></tr>';
}
function render(){drawOverview();drawWallets();drawHistory()}
async function getWallets(){
 const {data,error}=await sb.from("chainwatch_user_wallets").select("id,label,address,created_at").order("created_at",{ascending:false});
 if(error)throw error;
 wallets=data||[];if(!wallets.some(w=>w.id===selected))selected=wallets[0]?.id||null;
 render();
}
async function inspect(w){
 try{
 const res=await fetch(BASE+"/functions/v1/chainwatch-wallet-info?address="+encodeURIComponent(w.address),{headers:{Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(30000)});
 const data=await res.json();
 if(!res.ok||!data.ok||data.address!==w.address)throw Error("Dados inválidos");
 cache.set(w.id,data);return true;
 }catch(e){return false}
}
async function reload(){
 if(!user||busy)return;
 busy=true;$("refreshBtn").disabled=true;$("refreshBtn").textContent="Consultando...";
 try{
  await getWallets();
  let errors=0;
  for(const w of wallets){if(!await inspect(w))errors++;render();}
  if(errors)alertMsg("Consulta parcial: "+errors+" de "+wallets.length+" endereços indisponíveis. Nenhum saldo foi estimado.","error");
  else alertMsg(wallets.length?"Saldos e movimentações consultados. O cache evita requisições excessivas.":"Conta pronta. Cadastre sua primeira carteira.","info");
 }catch(e){alertMsg("Não foi possível carregar suas carteiras. Verifique a conexão.","error")}
 finally{busy=false;$("refreshBtn").disabled=false;$("refreshBtn").textContent="↻ Atualizar dados"}
}
async function loadPublic(){
 try{
 const res=await fetch(BASE+"/functions/v1/btc-radar",{cache:"no-store",signal:AbortSignal.timeout(15000)});
 const data=await res.json();if(!res.ok||!data.ok)throw Error("Indisponível");
 const run=data.last_run;
 $("binanceWallets").textContent=data.wallets?.length??19;$("binanceEvents").textContent=data.events?.length??"—";
 $("binanceChecked").textContent=date(run?.finished_at);$("binanceHealth").textContent=run?.errors?"Verificação parcial":"Verificação periódica";
 $("binanceRows").innerHTML=(data.wallets||[]).map(w=>'<tr><td>'+w.wallet_no+'</td><td><code title="'+esc(w.address)+'">'+esc(short(w.address))+'</code></td><td>'+esc(btc(w.balance_sat))+'</td><td>'+esc(date(w.last_checked_at))+'</td><td><a href="'+addrURL(w.address)+'" target="_blank" rel="noopener noreferrer">Abrir ↗</a></td></tr>').join("");
 }catch(e){$("binanceHealth").textContent="Fonte indisponível";$("binanceRows").innerHTML='<tr><td colspan="5">Falha na consulta. <a href="../#radar">Ver radar público ↗</a></td></tr>'}
}
function polymod(values){
  const gen=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
  let chk=1;
  for(const v of values){
    const top=chk>>>25;
    chk=((chk&0x1ffffff)<<5)^v;
    for(let i=0;i<5;i++)if((top>>>i)&1)chk^=gen[i];
  }
  return chk>>>0;
}
function verifyBech32(addr){
  if(addr!==addr.toLowerCase()&&addr!==addr.toUpperCase())return false;
  addr=addr.toLowerCase();
  if(!addr.startsWith("bc1")||addr.length<14||addr.length>90)return false;
  const charset="qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const hrp="bc", payload=addr.slice(3),values=[];
  for(const c of payload){const i=charset.indexOf(c);if(i<0)return false;values.push(i);}
  if(values.length<7)return false;
  const version=values[0];
  const expanded=[...hrp].map(c=>c.charCodeAt(0)>>>5).concat([0],[...hrp].map(c=>c.charCodeAt(0)&31),values);
  const checksum=polymod(expanded);
  if(version>16||(version===0?checksum!==1:checksum!==0x2bc830a3))return false;
  const data=values.slice(1,-6);
  let bits=0,acc=0;const program=[];
  for(const v of data){acc=((acc<<5)|v)&0xffff;bits+=5;while(bits>=8){bits-=8;program.push((acc>>>bits)&255);}}
  if(bits>=5||((acc<<(8-bits))&255)!==0)return false;
  if(program.length<2||program.length>40)return false;
  if(version===0&&![20,32].includes(program.length))return false;
  return true;
}
async function verifyBase58(addr){
  if(!/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr))return false;
  const chars="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number=0n;
  for(const c of addr){const digit=chars.indexOf(c);if(digit<0)return false;number=number*58n+BigInt(digit);}
  let hex=number.toString(16);if(hex.length%2)hex="0"+hex;
  const bytes=hex.match(/.{2}/g)?.map(c=>parseInt(c,16))||[];
  const zeros=addr.match(/^1*/)?.[0].length||0;
  const full=new Uint8Array([...Array(zeros).fill(0),...bytes]);
  if(full.length!==25||![0,5].includes(full[0]))return false;
  const digest1=new Uint8Array(await crypto.subtle.digest("SHA-256",full.slice(0,21)));
  const digest2=new Uint8Array(await crypto.subtle.digest("SHA-256",digest1));
  return full.slice(21).every((b,i)=>b===digest2[i]);
}
async function normalizeAddress(value){
  const input=value.trim();
  if(input.toLowerCase().startsWith("bc1"))return verifyBech32(input)?input.toLowerCase():null;
  return await verifyBase58(input)?input:null;
}


function modal(open){
 $("walletModal").hidden=!open;
 if(open){if(wallets.length>=5){$("walletModal").hidden=true;alertMsg("Limite de 5 carteiras do plano gratuito.","error");return} $("walletForm").reset();$("walletLabel").focus()}
}
async function saveWallet(e){
 e.preventDefault();
 const label=$("walletLabel").value.trim();
 if(!label||label.length>48){alertMsg("Nome inválido.","error");return}
 const btn=$("walletSave");btn.disabled=true;btn.textContent="Salvando...";
 try{
  const address=await normalizeAddress($("walletAddress").value);
  if(!address){alertMsg("Endereço público BTC inválido.","error");return}
  const {error}=await sb.from("chainwatch_user_wallets").insert({address,label});
  if(error)throw error;
  modal(false);await getWallets();selected=wallets.find(w=>w.address===address)?.id||selected;page("wallets");render();
  await reload();
 }catch(e){alertMsg(e.code==="23505"?"Esse endereço já está cadastrado.":"Não foi possível salvar. Confira o endereço e o limite gratuito.","error")}
 finally{btn.disabled=false;btn.textContent="Salvar carteira"}
}
async function renameWallet(){
 const w=wallets.find(w=>w.id===selected);if(!w)return;
 const label=window.prompt("Novo nome da carteira:",w.label)?.trim();
 if(label===undefined)return;
 if(!label||label.length>48){alertMsg("Use um nome de até 48 caracteres.","error");return}
 const {error}=await sb.from("chainwatch_user_wallets").update({label}).eq("id",w.id);
 if(error){alertMsg("Não foi possível renomear.","error");return}
 await getWallets();alertMsg("Nome da carteira atualizado.");
}
async function deleteWallet(){
 const w=wallets.find(w=>w.id===selected);if(!w)return;
 if(!window.confirm("Remover "+w.label+" do seu cadastro?"))return;
 const {error}=await sb.from("chainwatch_user_wallets").delete().eq("id",w.id);
 if(error){alertMsg("Não foi possível remover.","error");return}
 cache.delete(w.id);selected=null;await getWallets();alertMsg("Carteira removida.");
}
async function action(name){
 const w=wallets.find(x=>x.id===selected);
 if(name==="add")modal(true);
 if(name==="copy"&&w)try{await navigator.clipboard.writeText(w.address);alertMsg("Endereço copiado.")}catch(e){alertMsg("Falha ao copiar.","error")}
 if(name==="rename")await renameWallet();
 if(name==="delete")await deleteWallet();
 if(name==="refresh-one"&&w){const ok=await inspect(w);render();alertMsg(ok?"Consulta concluída.":"Explorador temporariamente indisponível.",ok?"info":"error")}
}
function events(){
 document.addEventListener("click",e=>{
  const g=e.target.closest("[data-view],[data-go]");
  if(g){e.preventDefault();page(g.dataset.view||g.dataset.go);return}
  const w=e.target.closest("[data-open],[data-select]");
  if(w){selected=w.dataset.open||w.dataset.select;page("wallets");return}
  const a=e.target.closest("[data-action]");if(a){action(a.dataset.action);return}
  if(e.target.closest("[data-close-modal]"))modal(false);
 });
 $("addWalletBtn").addEventListener("click",()=>modal(true));
 $("modalClose").addEventListener("click",()=>modal(false));
 $("walletForm").addEventListener("submit",saveWallet);
 $("menuBtn").addEventListener("click",()=>mobile(!$("sidebar").classList.contains("open")));
 $("mobileCover").addEventListener("click",()=>mobile(false));
 $("refreshBtn").addEventListener("click",reload);
 $("binanceReload").addEventListener("click",loadPublic);
 $("logoutBtn").addEventListener("click",async()=>{
   const {error}=await sb.auth.signOut();
   if(!error)location.replace("../conta.html");
   else alertMsg("Erro ao sair da conta.","error");
 });
 window.addEventListener("keydown",e=>{if(e.key==="Escape"){modal(false);mobile(false)}});
 window.addEventListener("popstate",()=>page(location.hash.slice(1)||"overview"));
}
sb.auth.onAuthStateChange((event,session)=>{
 if(event==="SIGNED_OUT"){user=null;location.replace("../conta.html")}
 if(event==="TOKEN_REFRESHED"&&session?.user)user=session.user;
});
events();
const {data,error}=await sb.auth.getSession();
if(error||!data?.session?.user){location.replace("../conta.html?next=app");}
else{
 user=data.session.user;
 $("welcomeText").textContent="Conta "+(user.email||"conectada")+" · Acompanhe seus endereços BTC.";
 $("userAvatar").title=user.email||"Sua conta";
 $("settingsEmail").textContent=user.email||"—";
 page(location.hash.slice(1)||"overview");
 await reload();
}

export {sb};
