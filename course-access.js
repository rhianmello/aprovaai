/* Nós Passa — proteção dos ambientes pagos por curso/cargo. */
(function(){
const script=document.currentScript,slug=script?.dataset?.course;
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
const IDS={'ace-marica':1,'transpetro':2,'inspetor-eletrica':3};
const id=IDS[slug];
const page=(title,text)=>{document.body.innerHTML='<div style="min-height:100vh;display:grid;place-items:center;background:#0d1014;color:#fff;font-family:Arial;padding:24px;text-align:center"><div style="max-width:620px"><div style="font-size:42px">⚠️</div><h2>'+title+'</h2><p style="color:#a6adb7;line-height:1.6">'+text+'</p><a href="minha-conta.html" style="display:inline-block;margin-top:12px;padding:11px 16px;border-radius:10px;background:#e4c64a;color:#111;font-weight:800;text-decoration:none">Voltar para minha conta</a></div></div>'};
const loading=()=>{document.body.innerHTML='<div id="np-loading" style="min-height:100vh;display:grid;place-items:center;background:#070a0e;color:#fff;font-family:Arial;padding:24px;text-align:center"><div><div style="width:42px;height:42px;border:3px solid #29313b;border-top-color:#e4c64a;border-radius:50%;margin:0 auto 18px;animation:spin .8s linear infinite"></div><h2>Abrindo sua plataforma…</h2><p style="color:#9da8b5">Validando sua conta e preparando o ambiente de estudos.</p></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>'};
const login=()=>{sessionStorage.setItem('ap_target',location.href);location.replace('login.html')};
const timeout=(ms)=>new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms));
const race=(p,ms)=>Promise.race([p,timeout(ms)]);
const getStoredAuth=()=>{try{const keys=Object.keys(localStorage).filter(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));for(const k of keys){const raw=localStorage.getItem(k);if(!raw)continue;const v=JSON.parse(raw);const s=v?.currentSession||v;if(s?.access_token&&s?.user)return s}}catch(e){}return null};
const api=async(path,token,opts={})=>{const r=await race(fetch(U+path,{...opts,headers:{apikey:K,Authorization:'Bearer '+token,'Content-Type':'application/json',...(opts.headers||{})}}),12000);let data=null;try{data=await r.json()}catch(e){}if(!r.ok)throw new Error(data?.message||data?.error_description||('HTTP '+r.status));return data};
const makeLocalSupabase=(auth)=>({createClient:()=>({auth:{getSession:async()=>({data:{session:auth},error:null}),getUser:async()=>({data:{user:auth.user},error:null}),signOut:async()=>{try{Object.keys(localStorage).filter(k=>k.startsWith('sb-')&&k.endsWith('-auth-token')).forEach(k=>localStorage.removeItem(k))}catch(e){}},updateUser:async()=>({data:{user:auth.user},error:null})}})});
if(!id){page('Curso não configurado.','Identificador de curso inválido.');return}loading();
(async()=>{try{
let auth=getStoredAuth();
if(!auth){try{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';s.async=true;document.head.appendChild(s);await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),7000);s.onload=()=>{clearTimeout(t);resolve()};s.onerror=()=>{clearTimeout(t);reject(new Error('falha'))}});if(window.supabase?.createClient){const tmp=window.supabase.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});const r=await race(tmp.auth.getSession(),7000);auth=r.data?.session||null}}catch(e){console.warn('Recuperação de sessão:',e)}}
if(!auth?.access_token||!auth?.user){login();return}
const token=auth.access_token,user=auth.user;
let rows;
try{rows=await api('/rest/v1/user_courses?select=status%2Cexpires_at&user_id=eq.'+encodeURIComponent(user.id)+'&course_id=eq.'+id+'&limit=1',token)}catch(e){page('Serviço temporariamente indisponível.','Não conseguimos consultar sua matrícula agora. Seu acesso não foi alterado e nenhum pagamento será iniciado. Tente novamente em alguns segundos.');return}
const allowed=Array.isArray(rows)&&!!rows[0]&&rows[0].status==='active'&&(!rows[0].expires_at||new Date(rows[0].expires_at)>new Date());
if(!allowed){location.replace('minha-conta.html');return}
try{const key='nos_passa_device_'+user.id;let device=localStorage.getItem(key);if(!device){device=crypto.randomUUID();localStorage.setItem(key,device)}await api('/rest/v1/rpc/register_device',token,{method:'POST',body:JSON.stringify({p_device_id:device,p_device_name:(navigator.platform||'Dispositivo')+' / '+(navigator.userAgent.includes('Mobile')?'Mobile':'Desktop'),p_user_agent:navigator.userAgent})})}catch(e){console.warn('Registro de dispositivo ignorado:',e)}
/* O banco de questões nunca pode impedir o painel de abrir. Se uma fonte de questões travar, o ambiente abre vazio e continua utilizável. */
if(window.STUDY_CONFIG?.bankLoader){const originalBankLoader=window.STUDY_CONFIG.bankLoader;window.STUDY_CONFIG.bankLoader=async()=>{try{return await Promise.race([Promise.resolve(originalBankLoader()),new Promise(resolve=>setTimeout(()=>resolve([]),6000))])}catch(e){console.warn('Banco de questões indisponível:',e);return []}}}
if(!window.supabase?.createClient)window.supabase=makeLocalSupabase(auth);
window.__NP_AUTH_USER=user;
const version='?v=20260908-4';
const brand=document.createElement('script');brand.src='./brand.js'+version;document.body.appendChild(brand);
const dash=document.createElement('script');
let dashboardStarted=false;
const failTimer=setTimeout(()=>{if(!dashboardStarted&&document.getElementById('np-loading'))page('Não foi possível abrir sua plataforma.','O painel de estudos não carregou. Tente novamente.');},10000);
dash.onload=()=>{dashboardStarted=true;clearTimeout(failTimer);};
dash.onerror=()=>{clearTimeout(failTimer);page('Não foi possível abrir a área de estudos.','O arquivo do painel de estudos não carregou. Tente novamente.');};
dash.src='./study-dashboard-clean.js'+version;document.body.appendChild(dash);
}catch(e){console.error('course-access',e);page('Não foi possível abrir sua plataforma.',e.message==='timeout'?'O serviço demorou para responder. Tente novamente.':'Erro: '+(e.message||'não foi possível validar o acesso.'))}})();
})();