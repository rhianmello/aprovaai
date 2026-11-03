import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm";

// Public publishable key only; user rows are protected by Supabase RLS.
const sb = createClient("https://ztqtcbzjesrkuaijmylm.supabase.co", "sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d", {
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
const $ = id => document.getElementById(id);
const accountView=$("accountView"),authView=$("authView"),recoveryView=$("recoveryView");
const list=$("walletList"),status=$("status");
let currentUser=null,currentWallets=[],recoveryMode=false,requestToken=0;

function notify(message,type="info"){
  status.textContent=message; status.className="status "+type;
}
function errorText(error){
  const raw=(error?.message||String(error||"")).toLowerCase();
  if(raw.includes("invalid login credentials"))return "E-mail ou senha incorretos.";
  if(raw.includes("email not confirmed"))return "Confirme seu e-mail pelo link recebido antes de entrar.";
  if(raw.includes("already registered"))return "Este e-mail já está cadastrado. Use Entrar.";
  if(raw.includes("rate limit")||raw.includes("too many"))return "Muitas tentativas. Tente novamente mais tarde.";
  if(raw.includes("duplicate key")||error?.code==="23505")return "Esse endereço já está cadastrado na sua conta.";
  if(raw.includes("cinco carteiras")||raw.includes("five")||error?.code==="23514")return "Limite de cinco carteiras da versão de testes.";
  if(raw.includes("network")||raw.includes("fetch"))return "Falha de conexão. Verifique a internet e tente novamente.";
  return "Não foi possível concluir esta operação. "+(error?.message||"Tente novamente.");
}
function setBusy(form,busy){
  Array.from(form.querySelectorAll("button, input")).forEach(el=>el.disabled=busy);
}
function view(which){
  authView.hidden=which!=="auth";
  accountView.hidden=which!=="account";
  recoveryView.hidden=which!=="recovery";
}
function mode(which){
  $("loginForm").hidden=which!=="login";
  $("signupForm").hidden=which!=="signup";
  $("forgotForm").hidden=which!=="forgot";
  $("loginTab").classList.toggle("active",which==="login");
  $("signupTab").classList.toggle("active",which==="signup");
  $("loginTab").setAttribute("aria-selected",String(which==="login"));
  $("signupTab").setAttribute("aria-selected",String(which==="signup"));
}
function clearPrivate(){
  currentUser=null;currentWallets=[];list.replaceChildren();
  $("welcome").textContent="";
  $("count").textContent="0 / 5";
}
async function applySession(session){
  if(recoveryMode)return;
  const seq=++requestToken;
  const user=session?.user||null;
  if(!user){
    clearPrivate();view("auth");
    if(!status.dataset.keep)notify("Entre ou crie uma conta para salvar seus endereços.");
    return;
  }
  currentUser=user;
  delete status.dataset.keep;
  $("welcome").textContent=user.email||"Conta autenticada";
  view("account");
  if(!status.dataset.keep)notify("Sua conta está conectada. As carteiras ficam visíveis apenas para você.");
  await loadWallets(seq);
}
async function loadWallets(seq=requestToken){
  if(!currentUser)return;
  const {data,error}=await sb.from("chainwatch_user_wallets")
    .select("id,label,address,created_at").order("created_at",{ascending:false});
  if(seq!==requestToken)return;
  if(error){notify(errorText(error),"error");list.replaceChildren();return;}
  currentWallets=Array.isArray(data)?data:[];
  renderWallets();
}
function short(value){return value.slice(0,16)+"…"+value.slice(-12);}
function renderWallets(){
  list.replaceChildren();
  $("count").textContent=currentWallets.length+" / 5";
  const addBtn=$("walletForm").querySelector('button[type="submit"]');
  addBtn.disabled=currentWallets.length>=5;
  if(!currentWallets.length){
    const p=document.createElement("p");p.className="empty";
    p.textContent="Nenhuma carteira adicionada. Cole seu primeiro endereço público ao lado.";
    list.append(p);return;
  }
  for(const w of currentWallets){
    const item=document.createElement("div");item.className="wallet-item";
    const main=document.createElement("div");main.className="wallet-main";
    const name=document.createElement("strong");name.textContent=w.label||"Carteira BTC";
    const addr=document.createElement("code");addr.textContent=short(w.address);addr.title=w.address;
    const explorer=document.createElement("a");explorer.href="https://mempool.space/address/"+encodeURIComponent(w.address);
    explorer.target="_blank";explorer.rel="noopener noreferrer";explorer.textContent="Ver no explorador ↗";
    main.append(name,addr,explorer);
    const actions=document.createElement("div");actions.className="wallet-actions";
    const copy=document.createElement("button");copy.type="button";copy.className="small-btn";copy.textContent="Copiar";
    copy.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(w.address);notify("Endereço copiado.");}
      catch(e){notify("Não foi possível copiar automaticamente.","error");}
    });
    const edit=document.createElement("button");edit.type="button";edit.className="small-btn";edit.textContent="Renomear";
    edit.addEventListener("click",()=>renameWallet(w));
    const del=document.createElement("button");del.type="button";del.className="small-btn danger";del.textContent="Remover";
    del.addEventListener("click",()=>removeWallet(w));
    actions.append(copy,edit,del);item.append(main,actions);list.append(item);
  }
}
async function renameWallet(w){
  const next=window.prompt("Novo nome para esta carteira:",w.label||"");
  if(next===null)return;
  const label=next.trim();
  if(!label||label.length>48){notify("Use um nome entre 1 e 48 caracteres.","error");return;}
  const {error}=await sb.from("chainwatch_user_wallets").update({label}).eq("id",w.id);
  if(error){notify(errorText(error),"error");return;}
  notify("Nome atualizado.");await loadWallets();
}
async function removeWallet(w){
  if(!window.confirm("Remover "+(w.label||"esta carteira")+" da sua lista?"))return;
  const {error}=await sb.from("chainwatch_user_wallets").delete().eq("id",w.id);
  if(error){notify(errorText(error),"error");return;}
  notify("Carteira removida.");await loadWallets();
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

$("loginTab").addEventListener("click",()=>mode("login"));
$("signupTab").addEventListener("click",()=>mode("signup"));
$("forgotBtn").addEventListener("click",()=>mode("forgot"));
$("backLoginBtn").addEventListener("click",()=>mode("login"));
$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget,values=new FormData(form);
  setBusy(form,true);notify("Autenticando...","info");
  try{
    const {data,error}=await sb.auth.signInWithPassword({
      email:String(values.get("email")||"").trim(),
      password:String(values.get("password")||"")
    });
    if(error)throw error;
    form.reset();
    if(data.session){window.location.assign("./app/");return;}
    await applySession(data.session);
  }catch(err){notify(errorText(err),"error");}
  finally{setBusy(form,false);}
});
$("signupForm").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget,values=new FormData(form);
  const email=String(values.get("email")||"").trim();
  const password=String(values.get("password")||"");
  if(password.length<8||password!==String(values.get("confirmation")||"")){
    notify("As senhas precisam ser iguais e ter pelo menos 8 caracteres.","error");return;
  }
  setBusy(form,true);notify("Criando conta...","info");
  try{
    const {data,error}=await sb.auth.signUp({
      email,password,options:{emailRedirectTo:window.location.origin+"/btc-radar/conta.html"}
    });
    if(error)throw error;
    form.reset();
    if(data.session){window.location.assign("./app/");return;}
    else {
      mode("login");
      status.dataset.keep="1";
      notify("Cadastro recebido! Confira seu e-mail e clique no link de confirmação antes de entrar.");
    }
  }catch(err){notify(errorText(err),"error");}
  finally{setBusy(form,false);}
});
$("forgotForm").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget,values=new FormData(form);
  setBusy(form,true);notify("Solicitando recuperação...","info");
  try{
    const {error}=await sb.auth.resetPasswordForEmail(String(values.get("email")||"").trim(),{
      redirectTo:window.location.origin+"/btc-radar/conta.html"
    });
    if(error)throw error;
    mode("login");notify("Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.");
  }catch(err){notify(errorText(err),"error");}
  finally{setBusy(form,false);}
});
$("recoveryForm").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget,values=new FormData(form);
  const password=String(values.get("password")||"");
  if(password.length<8||password!==String(values.get("confirmation")||"")){
    notify("As senhas precisam ser iguais e ter pelo menos 8 caracteres.","error");return;
  }
  setBusy(form,true);
  try{
    const {error}=await sb.auth.updateUser({password});
    if(error)throw error;
    recoveryMode=false;form.reset();notify("Senha alterada com sucesso.");
    const {data}=await sb.auth.getSession();await applySession(data.session);
  }catch(err){notify(errorText(err),"error");}
  finally{setBusy(form,false);}
});
$("walletForm").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget,values=new FormData(form);
  const label=String(values.get("label")||"").trim();
  if(!currentUser){notify("Entre na conta para salvar sua carteira.","error");return;}
  if(currentWallets.length>=5){notify("Limite de cinco carteiras desta versão de testes.","error");return;}
  if(!label||label.length>48){notify("Escolha um nome de até 48 caracteres.","error");return;}
  setBusy(form,true);notify("Verificando endereço e salvando...","info");
  try{
    const address=await normalizeAddress(String(values.get("address")||""));
    if(!address)throw Error("Endereço Bitcoin inválido. Confira se copiou o endereço público completo.");
    const {error}=await sb.from("chainwatch_user_wallets").insert({address,label});
    if(error)throw error;
    form.reset();notify("Carteira salva com sucesso. Acompanhamento automático ainda não está ativado.");
    await loadWallets();
  }catch(err){notify(errorText(err),"error");}
  finally{setBusy(form,false); if(currentWallets.length>=5)form.querySelector('button[type="submit"]').disabled=true;}
});
$("logoutBtn").addEventListener("click",async()=>{
  $("logoutBtn").disabled=true;
  const {error}=await sb.auth.signOut();
  $("logoutBtn").disabled=false;
  if(error){notify(errorText(error),"error");return;}
  delete status.dataset.keep;
  clearPrivate();mode("login");view("auth");notify("Você saiu da sua conta.");
});
sb.auth.onAuthStateChange((event,session)=>{
  if(event==="PASSWORD_RECOVERY"){
    recoveryMode=true;view("recovery");notify("Digite a nova senha para recuperar seu acesso.");
    return;
  }
  if(event==="SIGNED_OUT"){delete status.dataset.keep;clearPrivate();view("auth");notify("Entre para acessar suas carteiras.");return;}
  if(event==="INITIAL_SESSION"||event==="SIGNED_IN"||event==="TOKEN_REFRESHED"){
    queueMicrotask(()=>{if(!recoveryMode)applySession(session);});
  }
});
try{
  const {data,error}=await sb.auth.getSession();
  if(error)throw error;
  if(!recoveryMode)await applySession(data.session);
}catch(err){view("auth");notify(errorText(err),"error");}
