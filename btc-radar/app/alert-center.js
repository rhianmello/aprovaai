import {sb} from "./dashboard.js?v=2";
const $=id=>document.getElementById(id);
const BASE="https://ztqtcbzjesrkuaijmylm.supabase.co";
const MAX_BTC=21000000;
const txt=(s)=>String(s??"");
const safe=s=>txt(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let config={email_ready:false,telegram_ready:false,telegram_bot_username:null};
let prefs=null,wallets=[],busy=false,lastLoaded=0,scanInfo=new Map();
const localDate=t=>{
 const d=new Date(t||"");
 return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}).format(d);
};
function status(message,error=false){
 const el=$("alertStatusNote");el.textContent=message;el.classList.toggle("error",error);
}
function badge(){
 const ready=config.email_ready||config.telegram_ready;
 $("alertPhaseBadge").textContent=ready?"PREPARADO PARA ATIVAR":"AGUARDANDO PROVEDORES";
 $("alertPhaseBadge").classList.toggle("amber",!ready);
 $("alertEnabledLabel").textContent=prefs?.enabled?"Ativado":"Desativado";
 $("alertWatchCount").textContent=wallets.filter(w=>w.monitor_enabled).length+" selecionadas";
}
async function loadProvider(){
 try{
  const res=await fetch(BASE+"/functions/v1/chainwatch-telegram-webhook",{cache:"no-store",signal:AbortSignal.timeout(12000)});
  const json=await res.json();
  if(!res.ok||!json.ok)throw Error("Resposta inválida");
  config=json;
 }catch(e){config={email_ready:false,telegram_ready:false,telegram_bot_username:null};}
}
async function loadPrefs(){
 let {data,error}=await sb.from("chainwatch_alert_settings")
  .select("user_id,enabled,email_enabled,telegram_enabled,telegram_chat_id,telegram_linked_at,min_outbound_sat").maybeSingle();
 if(error)throw error;
 if(!data){
  const created=await sb.from("chainwatch_alert_settings")
   .insert({enabled:false,email_enabled:false,telegram_enabled:false,min_outbound_sat:0})
   .select("user_id,enabled,email_enabled,telegram_enabled,telegram_chat_id,telegram_linked_at,min_outbound_sat").single();
  if(created.error)throw created.error;
  data=created.data;
 }
 prefs=data;
}
async function loadWallets(){
 const {data,error}=await sb.from("chainwatch_user_wallets")
 .select("id,label,address,monitor_enabled,monitoring_started_at,created_at")
 .order("created_at",{ascending:false});
 if(error)throw error;
 wallets=data||[];
}
async function loadScanInfo(){
 const {data,error}=await sb.rpc("chainwatch_my_scan_status");
 if(error){scanInfo=new Map();return;}
 scanInfo=new Map((data||[]).map(r=>[r.wallet_id,r]));
}
function renderSettings(){
 const ready=config.email_ready||config.telegram_ready;
 $("alertGlobalToggle").checked=!!prefs?.enabled;
 $("alertGlobalToggle").disabled=!ready&&!prefs?.enabled;
 $("alertEmailToggle").checked=!!prefs?.email_enabled;
 $("alertEmailToggle").disabled=!config.email_ready&&!prefs?.email_enabled;
 $("alertEmailStatus").textContent=config.email_ready?
   "Canal configurado. Avisos enviados ao e-mail confirmado do cadastro.":
   "Aguardando integração de envio (Resend).";
 const linked=!!prefs?.telegram_chat_id;
 $("alertTelegramToggle").checked=!!prefs?.telegram_enabled;
 $("alertTelegramToggle").disabled=!config.telegram_ready&&!prefs?.telegram_enabled||!linked&&!prefs?.telegram_enabled;
 $("alertTelegramStatus").textContent=linked?
  "Conta Telegram vinculada. "+(config.telegram_ready?"Canal disponível.":"Envio suspenso até configurar o bot."):
  config.telegram_ready?"Conecte seu Telegram para ativar avisos.":config.telegram_setup_pending?"O bot foi configurado, mas o webhook Telegram ainda não está ativo.":"Aguardando configuração do bot Telegram.";
 $("telegramConnectBtn").disabled=!config.telegram_ready||linked;
 $("telegramConnectBtn").textContent=linked?"Telegram vinculado ✓":"Vincular Telegram ↗";
 $("telegramDisconnectBtn").hidden=!linked;
 $("alertMinBtc").value=(Number(prefs?.min_outbound_sat||0)/1e8).toFixed(8).replace(/0+$/,"").replace(/\.$/,"")||"0";
 if(!ready)status("Monitoramento preparado, mas os canais de envio ainda não foram configurados. Nenhum e-mail ou Telegram será enviado até conectarmos os provedores.",true);
 else if(!prefs?.enabled)status("Os canais estão disponíveis. Escolha suas carteiras e salve suas preferências para ativar o acompanhamento.");
 else status("Monitoramento ativado. O primeiro rastreamento é usado como referência; só novas saídas detectadas gerarão alertas.");
 badge();
}
function renderWalletList(){
 const el=$("alertWalletList");
 if(!wallets.length){
  el.innerHTML='<div class="empty-note">Nenhuma carteira cadastrada. <a href="#wallets" data-go="wallets">Adicionar endereço →</a></div>';
  return;
 }
 el.innerHTML="";
 for(const w of wallets){
  const line=document.createElement("label");line.className="alert-wallet-item";
  const input=document.createElement("input");input.type="checkbox";input.checked=!!w.monitor_enabled;
  input.setAttribute("aria-label","Monitorar "+w.label);
  const content=document.createElement("span");content.className="alert-wallet-description";
  const name=document.createElement("strong");name.textContent=w.label||"Carteira BTC";
  const addr=document.createElement("small");addr.textContent=w.address.slice(0,17)+"…"+w.address.slice(-12);
  const state=document.createElement("em");
  state.textContent=w.monitor_enabled?"Selecionada":"Desativada";
  const scan=document.createElement("small");
  const info=scanInfo.get(w.id);
  scan.textContent=!w.monitor_enabled?"Monitoramento desligado":
   !prefs?.enabled?"Aguardando ativação global":
   !config.email_ready&&!config.telegram_ready?"Aguardando configuração dos canais":
   info?.last_error?"Última varredura com falha":
   info?.last_checked_at?"Última varredura: "+localDate(info.last_checked_at):
   "Aguardando primeira varredura";
  content.append(name,addr,scan);line.append(input,content,state);
  input.addEventListener("change",async()=>{
   const desired=input.checked;
   input.disabled=true;
   const {error}=await sb.from("chainwatch_user_wallets").update({monitor_enabled:desired}).eq("id",w.id);
   input.disabled=false;
   if(error){input.checked=!desired;status("Não foi possível atualizar esta carteira. Tente novamente.",true);return;}
   w.monitor_enabled=desired;state.textContent=desired?"Selecionada":"Desativada";badge();
   status(desired?"Carteira selecionada. O monitoramento só funciona quando os canais e a opção global estiverem ativos.":"Monitoramento desativado para esta carteira.");
  });
  el.append(line);
 }
}
function renderDeliveries(data){
 const tbody=$("alertDeliveryRows");
 if(!data?.length){
  tbody.innerHTML='<tr><td colspan="6">Nenhuma notificação registrada. As transações antigas não geram alertas ao iniciar.</td></tr>';return;
 }
 tbody.innerHTML=data.map(row=>{
  const p=row.payload||{},btc=Number(p.amount_sat||0)/1e8;
  const kind={queued:"Na fila",sending:"Processando",sent:"Aceito pelo provedor",failed:"Falhou"}[row.state]||row.state;
  const href=/^[0-9a-f]{64}$/.test(row.txid)?"https://mempool.space/tx/"+row.txid:"https://mempool.space/";
  return '<tr><td>'+safe(p.label||"Carteira BTC")+'</td>'+
   '<td>'+safe(btc.toFixed(8))+' BTC</td><td>'+safe(row.channel==="email"?"E-mail":"Telegram")+'</td>'+
   '<td>'+safe(kind)+'</td><td>'+safe(localDate(row.sent_at||row.created_at))+'</td>'+
   '<td><a href="'+href+'" target="_blank" rel="noopener noreferrer">Ver transação ↗</a></td></tr>';
 }).join("");
}
async function loadDeliveries(){
 const {data,error}=await sb.from("chainwatch_alert_deliveries")
 .select("channel,txid,payload,state,created_at,sent_at,last_error")
 .order("created_at",{ascending:false}).limit(30);
 if(error){$("alertDeliveryRows").innerHTML='<tr><td colspan="6">Não foi possível carregar o histórico.</td></tr>';return}
 renderDeliveries(data);
}
async function loadAll(force=false){
 if(busy||(!force&&Date.now()-lastLoaded<25000))return;
 busy=true;
 try{
  const {data}=await sb.auth.getSession();
  if(!data?.session?.user)return;
  await Promise.all([loadProvider(),loadPrefs(),loadWallets(),loadScanInfo()]);
  renderSettings();renderWalletList();await loadDeliveries();
  lastLoaded=Date.now();
 }catch(e){status("Falha ao carregar as preferências. Confira a sessão e tente novamente.",true);}
 finally{busy=false;}
}
async function saveSettings(){
 if(!prefs)return status("Preferências indisponíveis.",true);
 const enabled=$("alertGlobalToggle").checked;
 const email=$("alertEmailToggle").checked;
 const telegram=$("alertTelegramToggle").checked;
 if(enabled&&(!config.email_ready&&!config.telegram_ready)){
  return status("Ativação indisponível: ainda faltam configurar os provedores de notificação.",true);
 }
 if(enabled&&!wallets.some(w=>w.monitor_enabled))return status("Selecione pelo menos uma carteira para receber alertas.",true);
 if(enabled&&!(email&&config.email_ready||telegram&&config.telegram_ready&&prefs.telegram_chat_id)){
  return status("Ative ao menos um canal disponível antes de ligar o monitoramento.",true);
 }
 const value=Number($("alertMinBtc").value);
 if(!Number.isFinite(value)||value<0||value>MAX_BTC)
  return status("Informe um limite de BTC válido.",true);
 const sat=Math.round(value*1e8);
 const button=$("alertSaveBtn");button.disabled=true;button.textContent="Salvando...";
 try{
  const {data,error}=await sb.from("chainwatch_alert_settings")
  .update({enabled,email_enabled:email,telegram_enabled:telegram,min_outbound_sat:sat})
  .eq("user_id",prefs.user_id)
  .select("user_id,enabled,email_enabled,telegram_enabled,telegram_chat_id,telegram_linked_at,min_outbound_sat").single();
  if(error)throw error;
  prefs=data;
  renderSettings();
  status(enabled?"Preferências salvas. Você receberá alertas apenas para novas saídas encontradas, após o primeiro rastreamento.":"Preferências salvas. Alertas globais desativados.");
 }catch(e){status("Não foi possível salvar as configurações. Tente novamente.",true)}
 finally{button.disabled=false;button.textContent="Salvar preferências"}
}
async function connectTelegram(){
 if(!config.telegram_ready||!config.telegram_bot_username)return;
 const popup=window.open("about:blank","_blank");
 const button=$("telegramConnectBtn");button.disabled=true;button.textContent="Gerando vínculo...";
 try{
  const {data,error}=await sb.rpc("chainwatch_issue_telegram_code");
  if(error||!/^[0-9a-f]{32}$/.test(data||""))throw Error("Código inválido");
  const url="https://t.me/"+config.telegram_bot_username+"?start=cw_"+data;
  if(popup)popup.location.href=url;
  else{
   const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer";
   a.textContent="Clique aqui para abrir o bot no Telegram ↗";
   const slot=$("alertTelegramStatus");slot.replaceChildren(a);
  }
  status("Abra o bot, pressione Iniciar e depois volte ao ChainWatch. Atualize a página de alertas para confirmar o vínculo.");
 }catch(e){if(popup)popup.close();status("Não foi possível gerar o vínculo Telegram.",true)}
 finally{button.disabled=false;button.textContent="Vincular Telegram ↗";}
}
async function disconnectTelegram(){
 if(!window.confirm("Desvincular seu Telegram e desativar os avisos nesse canal?"))return;
 const {error}=await sb.rpc("chainwatch_disconnect_telegram");
 if(error)return status("Não foi possível desvincular o Telegram.",true);
 lastLoaded=0;await loadAll(true);status("Telegram desvinculado.");
}
$("alertSaveBtn").addEventListener("click",saveSettings);
$("telegramConnectBtn").addEventListener("click",connectTelegram);
$("telegramDisconnectBtn").addEventListener("click",disconnectTelegram);
$("alertReloadBtn").addEventListener("click",async()=>{await loadAll(true);status("Histórico de notificações atualizado.");});
window.addEventListener("chainwatch:view",e=>{if(e.detail?.name==="alerts")loadAll(true);});
if(location.hash==="#alerts")loadAll(true);
