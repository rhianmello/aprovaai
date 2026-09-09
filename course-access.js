/* Nós Passa — proteção dos ambientes pagos por curso/cargo. */
(function(){
const script=document.currentScript,slug=script?.dataset?.course;
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
const IDS={'ace-marica':1,'transpetro':2,'inspetor-eletrica':3};
const id=IDS[slug];
const page=(title,text)=>{document.body.innerHTML='<div style="min-height:100vh;display:grid;place-items:center;background:#0d1014;color:#fff;font-family:Arial;padding:24px;text-align:center"><div style="max-width:620px"><div style="font-size:42px">⚠️</div><h2>'+title+'</h2><p style="color:#a6adb7;line-height:1.6">'+text+'</p><a href="concursos.html" style="display:inline-block;margin-top:12px;padding:11px 16px;border-radius:10px;background:#e4c64a;color:#111;font-weight:800;text-decoration:none">Voltar aos concursos</a></div></div>'};
const loading=()=>{document.body.innerHTML='<div id="np-loading" style="min-height:100vh;display:grid;place-items:center;background:#070a0e;color:#fff;font-family:Arial;padding:24px;text-align:center"><div><div style="width:42px;height:42px;border:3px solid #29313b;border-top-color:#e4c64a;border-radius:50%;margin:0 auto 18px;animation:spin .8s linear infinite"></div><h2>Abrindo sua plataforma…</h2><p style="color:#9da8b5">Validando sua conta e preparando o ambiente de estudos.</p></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>'};
const login=()=>{sessionStorage.setItem('ap_target',location.href);location.replace('login.html')};
const timeout=(ms)=>new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms));
const race=(p,ms)=>Promise.race([p,timeout(ms)]);
const getStoredAuth=()=>{try{const keys=Object.keys(localStorage).filter(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));for(const k of keys){const raw=localStorage.getItem(k);if(!raw)continue;const v=JSON.parse(raw);const s=v?.currentSession||v;if(s?.access_token&&s?.user)return s}}catch(e){}return null};
const api=async(path,token,opts={})=>{const r=await race(fetch(U+path,{...opts,headers:{apikey:K,Authorization:'Bearer '+token,'Content-Type':'application/json',...(opts.headers||{})}}),12000);let data=null;try{data=await r.json()}catch(e){}if(!r.ok)throw new Error(data?.message||data?.error_description||('HTTP '+r.status));return data};
const loadSupabase=()=>new Promise((resolve,reject)=>{if(window.supabase?.createClient)return resolve(window.supabase);let i=0,last=null;const next=()=>{if(i>=2)return reject(last||new Error('Biblioteca Supabase não carregou'));const src=['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js','https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js'][i++];const s=document.createElement('script');let done=false;const t=setTimeout(()=>{if(done)return;done=true;last=new Error('timeout ao carregar biblioteca');s.remove();next()},10000);s.onload=()=>{if(done)return;done=true;clearTimeout(t);if(window.supabase?.createClient)resolve(window.supabase);else{last=new Error('Biblioteca carregada sem createClient');next()}};s.onerror=()=>{if(done)return;done=true;clearTimeout(t);last=new Error('Falha ao carregar biblioteca');next()};document.head.appendChild(s)};next()});
if(!id){page('Curso não configurado.','Identificador de curso inválido.');return}loading();
(async()=>{try{
let auth=getStoredAuth();
if(!auth){try{const sup=await loadSupabase(),tmp=sup.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});window.supabase=sup;const r=await race(tmp.auth.getSession(),10000);auth=r.data?.session||null}catch(e){console.warn('Fallback de sessão:',e)}}
if(!auth?.access_token||!auth?.user){login();return}
const token=auth.access_token,user=auth.user;
let rows;
try{rows=await api('/rest/v1/user_courses?select=status%2Cexpires_at&user_id=eq.'+encodeURIComponent(user.id)+'&course_id=eq.'+id+'&limit=1',token)}catch(e){page('Serviço temporariamente indisponível.','Não conseguimos consultar sua matrícula agora. Seu acesso não foi alterado e nenhum pagamento será iniciado. Tente novamente em alguns segundos.');return}
let allowed=Array.isArray(rows)&&!!rows[0]&&rows[0].status==='active'&&(!rows[0].expires_at||new Date(rows[0].expires_at)>new Date());
if(!allowed&&!Array.isArray(rows)){try{const rpc=await api('/rest/v1/rpc/has_course_access',token,{method:'POST',body:JSON.stringify({p_course_id:id})});allowed=rpc===true}catch(e){}}
if(!allowed){location.replace('checkout-popular.html?course='+encodeURIComponent(slug));return}
try{const key='nos_passa_device_'+user.id;let device=localStorage.getItem(key);if(!device){device=crypto.randomUUID();localStorage.setItem(key,device)}await api('/rest/v1/rpc/register_device',token,{method:'POST',body:JSON.stringify({p_device_id:device,p_device_name:(navigator.platform||'Dispositivo')+' / '+(navigator.userAgent.includes('Mobile')?'Mobile':'Desktop'),p_user_agent:navigator.userAgent})})}catch(e){console.warn('Registro de dispositivo ignorado:',e)}
try{const sup=await loadSupabase();window.supabase=sup}catch(e){console.warn('Supabase JS indisponível; usando cliente local mínimo:',e);window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user}},error:null}),signOut:async()=>{try{Object.keys(localStorage).filter(k=>k.startsWith('sb-')&&k.endsWith('-auth-token')).forEach(k=>localStorage.removeItem(k))}catch(x){}},updateUser:async()=>({data:null,error:null})}})}}
window.__NP_AUTH_USER=user;
const version='?v=20260908-2';
const brand=document.createElement('script');brand.src='./brand.js'+version;document.body.appendChild(brand);
const dash=document.createElement('script');
let dashboardStarted=false;
const failTimer=setTimeout(()=>{if(!dashboardStarted&&document.getElementById('np-loading'))page('Não foi possível abrir sua plataforma.','O ambiente de estudos não carregou. Atualize a página e tente novamente.');},15000);
dash.onload=()=>{dashboardStarted=true;clearTimeout(failTimer);};
dash.onerror=()=>{clearTimeout(failTimer);page('Não foi possível abrir a área de estudos.','O painel de estudos não carregou. Atualize a página e tente novamente.');};
dash.src='./study-dashboard-clean.js'+version;document.body.appendChild(dash);
}catch(e){console.error('course-access',e);page('Não foi possível abrir sua plataforma.',e.message==='timeout'?'O serviço demorou para responder. Tente novamente.':'Erro: '+(e.message||'não foi possível validar o acesso.'))}})();
})();