import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm";
const out=document.getElementById("chainwatchOnlineCount");
const container=document.getElementById("chainwatchOnlineCounter");
if(out && container){
 const client=createClient("https://ztqtcbzjesrkuaijmylm.supabase.co","sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d",{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
   realtime:{params:{eventsPerSecond:1}}
 });
 const visitorId=crypto.randomUUID();
 const channel=client.channel("chainwatch-public-online-v1",{
   config:{presence:{key:visitorId},private:false}
 });
 const update=()=>{
   const state=channel.presenceState();
   const count=Object.keys(state).length;
   if(!Number.isFinite(count))return;
   out.textContent=String(count);
   container.classList.remove("offline");
   container.title="Sessões com conexão ativa no ChainWatch. É uma estimativa, pois várias abas podem contar separadamente.";
 };
 const unavailable=()=>{
   out.textContent="—";
   container.classList.add("offline");
   container.title="Contador temporariamente desconectado. Não há número verificado.";
 };
 channel.on("presence",{event:"sync"},update);
 channel.subscribe(async status=>{
   if(status==="SUBSCRIBED"){
     try{await channel.track({page:"ChainWatch",connected_at:new Date().toISOString()});}
     catch(e){unavailable();}
   } else if(["CLOSED","CHANNEL_ERROR","TIMED_OUT"].includes(status)) unavailable();
 });
 window.addEventListener("pagehide",()=>{
   channel.untrack().catch(()=>{});
   client.removeChannel(channel);
 },{once:true});
}
