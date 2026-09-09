/* Nós Passa — proteção dos ambientes pagos por curso/cargo. */
(function(){
const script=document.currentScript,slug=script?.dataset?.course;
const U='https://ztqtcbzjesrkuaijmylm.supabase.co',K='sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d';
const IDS={'ace-marica':1,'transpetro':2,'inspetor-eletrica':3};
const CDNS=['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js','https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js'];
const load=()=>new Promise(async(resolve,reject)=>{
  if(window.supabase?.createClient){resolve(window.supabase);return}
  let lastError=null;
  for(const src of CDNs){
    try{
      await new Promise((ok,bad)=>{
        const s=document.createElement('script');s.src=src;s.async=true;
        let done=false;
        const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(timer);s.removeEventListener('load',onload);s.removeEventListener('error',onerror);fn(v)};
        const onload=()=>window.supabase?.createClient?finish(ok):finish(bad,new Error('Biblioteca carregada sem cliente Supabase'));
        const onerror=()=>finish(bad,new Error('Falha ao carregar '+src));
        const timer=setTimeout(()=>finish(bad,new Error('timeout')),8000);
        s.addEventListener('load',onload);s.addEventListener('error',onerror);document.head.appendChild(s);
      });
      if(window.supabase?.createClient){resolve(window.supabase);return}
    }catch(e){lastError=e}
  }
  reject(lastError||new Error('Não foi possível carregar o Supabase'));
});
const withTimeout=(promise,ms=7000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))]);
const page=(title,text)=>{document.body.innerHTML='<div style="min-height:100vh;display:grid;place-items:center;background:#0d1014;color:#fff;font-family:Arial;padding:24px;text-align:center"><div style="max-width:560px"><div style="font-size:42px">⚠️</div><h2>'+title+'</h2><p style="color:#a6adb7;line-height:1.55">'+text+'</p><a href="concursos.html" style="display:inline-block;margin-top:12px;padding:11px 16px;border-radius:10px;background:#e4c64a;color:#111;font-weight:800;text-decoration:none">Voltar aos concursos</a></div></div>'};
const loading=()=>{document.body.innerHTML='<div style="min-height:100vh;display:grid;place-items:center;background:#070a0e;color:#fff;font-family:Arial;padding:24px;text-align:center"><div><div style="width:42px;height:42px;border:3px solid #29313b;border-top-color:#e4c64a;border-radius:50%;margin:0 auto 18px;animation:spin .8s linear infinite"></div><h2>Abrindo sua plataforma…</h2><p style="color:#9da8b5">Validando sua conta e preparando o ambiente de estudos.</p></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>'};
const login=()=>{sessionStorage.setItem('ap_target',location.href);location.replace('login.html')};
const checkout=()=>location.replace('checkout-popular.html?course='+encodeURIComponent(slug||''));
const id=IDS[slug];if(!id){page('Curso não configurado.','Identificador de curso inválido.');return}loading();
(async()=>{try{
const sup=await load(),sb=sup.createClient(U,K,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
/* O dashboard legado usa window.supabase; garantimos que a biblioteca global esteja disponível. */
window.supabase=sup;
const sessionResult=await withTimeout(sb.auth.getSession(),5000);const user=sessionResult.data?.session?.user;
if(sessionResult.error||!user){login();return}
let allowed=false;let enrollmentError=null;
try{const f=await withTimeout(sb.from('user_courses').select('status,expires_at').eq('user_id',user.id).eq('course_id',id).maybeSingle(),6000);if(f.error)enrollmentError=f.error;else allowed=!!f.data&&f.data.status==='active'&&(!f.data.expires_at||new Date(f.data.expires_at)>new Date())}catch(e){enrollmentError=e}
if(!allowed&&enrollmentError){try{const a=await withTimeout(sb.rpc('has_course_access',{p_course_id:id}),5000);if(!a.error)allowed=a.data===true}catch(e){}}
if(!allowed){checkout();return}
try{const key='nos_passa_device_'+user.id;let device=localStorage.getItem(key);if(!device){device=crypto.randomUUID();localStorage.setItem(key,device)}const d=await withTimeout(sb.rpc('register_device',{p_device_id:device,p_device_name:(navigator.platform||'Dispositivo')+' / '+(navigator.userAgent.includes('Mobile')?'Mobile':'Desktop'),p_user_agent:navigator.userAgent}),3500);if(!d.error&&d.data!==true){page('Limite de dispositivos atingido.','Sua conta já possui 2 dispositivos ativos. Revogue um deles no painel administrativo para entrar neste aparelho.');return}}catch(e){console.warn('Registro de dispositivo ignorado:',e)}
const brand=document.createElement('script');brand.src='./brand.js';document.body.appendChild(brand);const dash=document.createElement('script');dash.src='./study-dashboard-clean.js';dash.onload=()=>{const r=document.createElement('script');r.src='./retention.js';document.body.appendChild(r)};dash.onerror=()=>page('Não foi possível abrir a área de estudos.','O acesso foi validado, mas o painel de estudos não carregou. Atualize a página e tente novamente.');document.body.appendChild(dash);
}catch(e){console.error(e);page('Não foi possível abrir sua plataforma.',e.message==='timeout'?'O serviço demorou para responder. Atualize a página e tente novamente.':'Erro: '+(e.message||'não foi possível validar o acesso.'))}})();})();