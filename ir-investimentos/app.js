"use strict";
(()=>{
  const URL="https://ztqtcbzjesrkuaijmylm.supabase.co";
  const KEY="sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d";
  const BUCKET="ir-extratos";
  const MONTHS=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const FIELDS=[
    {id:"date",title:"Data da negociação",aliases:["data","data pregao","data negocio","data negociacao","data da operacao","data da negociacao"]},
    {id:"ticker",title:"Código do ativo",aliases:["ticker","ativo","codigo de negociacao","codigo","papel","produto","especificacao do titulo","nome do ativo"]},
    {id:"side",title:"Compra ou venda",aliases:["operacao","tipo operacao","tipo de operacao","c v","compra venda","movimento","natureza"]},
    {id:"qty",title:"Quantidade",aliases:["quantidade","qtd","qtde","quant","qt"]},
    {id:"price",title:"Preço por unidade",aliases:["preco unitario","preco","valor unitario","preco medio","preco do ativo"]},
    {id:"fees",title:"Taxas da nota (opcional)",aliases:["taxas","custos","emolumentos","corretagem","taxa","despesas"]},
    {id:"mode",title:"Modalidade (opcional)",aliases:["modalidade","mercado","operacao day trade","day trade"]}
  ];
  const el=id=>document.getElementById(id);
  const fmt=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
  const qtyFmt=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:8});
  const money=x=>fmt.format(Number.isFinite(+x)?+x:0);
  const num=x=>qtyFmt.format(+x||0);
  const html=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
  let db,user=null,currentYear=new Date().getFullYear(),uploadRows=[],trades=[],openings=[],pending=null,calc=null,toastTimer=null,loading=false;
  function toast(message,error=false){
    const box=el("toast");box.textContent=message;box.classList.toggle("error",error);box.hidden=false;
    if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>{box.hidden=true},7000);
  }
  function errorMessage(e){return e&&e.message?e.message:String(e||"Erro desconhecido")}
  function fatal(message){el("auth-message").textContent=message;toast(message,true)}
  function setUser(account){
    const changed=user?.id!==account?.id;user=account||null;
    el("auth-screen").hidden=!!user;el("app-screen").hidden=!user;
    if(user){el("user-chip").textContent=user.email||"Conta";if(changed)refreshData();}
    else{uploadRows=[];trades=[];openings=[];pending=null;calc=null;el("mapper").hidden=true;}
  }
  async function init(){
    if(!window.supabase?.createClient){fatal("Não foi possível carregar a conexão com o banco. Atualize a página e confira a internet.");return;}
    db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
    const years=el("year-select");
    for(let y=new Date().getFullYear();y>=2015;y--){let o=document.createElement("option");o.value=y;o.textContent=y;years.append(o)}
    years.value=String(currentYear);
    el("report-year").textContent=String(currentYear);
    bindEvents();
    db.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT")setUser(null);
      else if(event==="SIGNED_IN"&&session?.user&&user?.id!==session.user.id)setTimeout(()=>setUser(session.user),0);
    });
    const {data,error}=await db.auth.getUser();
    if(error && error.name!=="AuthSessionMissingError")el("auth-message").textContent=errorMessage(error);
    setUser(data?.user||null);
  }
  function bindEvents(){
    el("auth-form").addEventListener("submit",async e=>{
      e.preventDefault();const email=el("email").value.trim(),password=el("password").value;
      el("login-button").disabled=true;
      try{const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;setUser(data.user);el("auth-message").textContent="";}
      catch(err){el("auth-message").textContent=errorMessage(err);}
      finally{el("login-button").disabled=false}
    });
    el("signup-button").addEventListener("click",async()=>{
      const email=el("email").value.trim(),password=el("password").value;
      if(!email||password.length<6){el("auth-message").textContent="Informe e-mail e senha com pelo menos 6 caracteres.";return}
      el("signup-button").disabled=true;
      try{
        const {data,error}=await db.auth.signUp({email,password});
        if(error)throw error;
        if(data.session && data.user){setUser(data.user);toast("Conta criada. Seus documentos ficam em área privada.");}
        else el("auth-message").textContent="Cadastro recebido. Confirme seu e-mail se o Supabase solicitar, depois entre com sua senha.";
      }catch(err){el("auth-message").textContent=errorMessage(err)}
      finally{el("signup-button").disabled=false}
    });
    el("logout").addEventListener("click",async()=>{const {error}=await db.auth.signOut();if(error)toast(errorMessage(error),true);else setUser(null)});
    document.querySelectorAll("[data-section]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.section)));
    document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
    el("year-select").addEventListener("change",()=>{currentYear=Number(el("year-select").value);renderAll()});
    el("refresh").addEventListener("click",refreshData);
    el("upload-file").addEventListener("change",async e=>{const file=e.target.files?.[0];e.target.value="";if(file)await prepareUpload(file)});
    el("cancel-mapping").addEventListener("click",()=>{pending=null;el("mapper").hidden=true;el("mapping-status").textContent=""});
    el("confirm-import").addEventListener("click",confirmImport);
    el("trade-form").addEventListener("submit",saveTrade);
    el("opening-form").addEventListener("submit",saveOpening);
    el("trade-filter").addEventListener("input",renderTrades);
    el("export-csv").addEventListener("click",exportReport);
    el("print-report").addEventListener("click",()=>window.print());
    el("uploads-body").addEventListener("click",documentAction);
    el("trades-body").addEventListener("click",tradeAction);
    el("openings-body").addEventListener("click",openingAction);
    el("trade-form").elements.trade_date.valueAsDate=new Date();
    const d=new Date(new Date().getFullYear()-1,11,31);
    el("opening-form").elements.as_of.value=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  }
  function go(section){
    document.querySelectorAll("[data-section]").forEach(b=>b.classList.toggle("active",b.dataset.section===section));
    document.querySelectorAll(".app-section").forEach(s=>s.hidden=s.id!=="section-"+section);
    const titles={resumo:"Visão geral",importacao:"Importar extratos",operacoes:"Livro de operações",patrimonio:"Posições e custo",relatorios:"Relatórios"};
    el("page-title").textContent=titles[section]||"IR Ações";
    window.scrollTo({top:0,behavior:"instant"});
  }
  async function readAll(table,sortColumn){
    let rows=[];for(let offset=0;offset<10000;offset+=1000){
      let query=db.from(table).select("*").eq("owner_id",user.id).order(sortColumn,{ascending:true}).range(offset,offset+999);
      const {data,error}=await query;if(error)throw error;rows.push(...data);
      if(data.length<1000)break;
    }return rows;
  }
  async function refreshData(){
    if(!user||loading)return;loading=true;
    try{
      const [u,t,o]=await Promise.all([
        readAll("ir_uploads","created_at"),
        readAll("ir_trades","trade_date"),
        readAll("ir_opening_positions","as_of")
      ]);
      uploadRows=u;trades=t;openings=o;renderAll();
    }catch(err){toast("Falha ao consultar os dados: "+errorMessage(err),true)}
    finally{loading=false}
  }
  function parseNumber(raw){
    if(typeof raw==="number")return raw;
    let s=String(raw??"").trim().replace(/R\$\s*/gi,"").replace(/\s/g,"");
    if(!s)return NaN;
    if(s.includes(",")&&s.includes("."))s=s.lastIndexOf(",")>s.lastIndexOf(".")?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,"");
    else if(s.includes(","))s=s.replace(",",".");
    return Number(s);
  }
  function parseDate(raw){
    if(typeof raw==="number"&&raw>20000&&raw<90000){
      const d=new Date(Date.UTC(1899,11,30)+Math.floor(raw)*86400000);return d.toISOString().slice(0,10);
    }
    let s=String(raw??"").trim();
    let m=s.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
    if(m)s=m[3]+"-"+m[2]+"-"+m[1];
    else if(/^\d{4}-\d{2}-\d{2}/.test(s))s=s.slice(0,10);
    else return null;
    const d=new Date(s+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:null;
  }
  function isStock(ticker){return /^[A-Z]{4}[345678]$/.test(ticker)}
  function parseTicker(raw){
    const m=String(raw??"").toUpperCase().match(/\b([A-Z]{4}\d{1,2})\b/);
    return m?m[1]:String(raw??"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
  }
  function parseSide(raw){
    let s=norm(raw);
    if(["c","compra","comprado","buy","c buy"].includes(s))return "C";
    if(["v","venda","vendido","sell","s sell"].includes(s))return "V";
    if(/^compra\b/.test(s))return "C";
    if(/^venda\b/.test(s))return "V";
    return null;
  }
  function parseMode(raw){
    let s=norm(raw);
    if(s.includes("day trade")||s.includes("daytrade"))return "DAYTRADE";
    if(s&&s!=="comum"&&s!=="normal"&&s!=="swing trade"&&s!=="vista"&&s!=="a vista"&&s!=="mercado a vista"&&s!=="operacao comum")return "OUTROS";
    return "COMUM";
  }
  function guessSeparator(first){
    const candidates=[";",",","\t"];
    return candidates.map(s=>[s,first.split(s).length]).sort((a,b)=>b[1]-a[1])[0][0];
  }
  function csvRows(text){
    text=text.replace(/^\uFEFF/,"");let delimiter=guessSeparator(text.split(/\r?\n/).find(x=>x.trim())||"");
    let result=[],row=[],value="",quoted=false;
    for(let i=0;i<text.length;i++){
      let c=text[i];
      if(quoted){if(c==='"'&&text[i+1]==='"'){value+='"';i++}else if(c==='"')quoted=false;else value+=c}
      else if(c==='"')quoted=true;
      else if(c===delimiter){row.push(value.trim());value=""}
      else if(c==="\r"||c==="\n"){if(c==="\r"&&text[i+1]==="\n")i++;row.push(value.trim());if(row.some(v=>v))result.push(row);row=[];value=""}
      else value+=c;
    }
    row.push(value.trim());if(row.some(v=>v))result.push(row);
    return result;
  }
  async function prepareUpload(file){
    const ext=file.name.split(".").pop()?.toLowerCase();
    if(!["csv","xls","xlsx","pdf"].includes(ext)){toast("Use CSV, Excel ou PDF.",true);return}
    if(file.size>12*1024*1024){toast("Arquivo maior que 12 MB.",true);return}
    if(file.size===0){toast("Arquivo vazio.",true);return}
    el("import-message").textContent="Preparando "+file.name+"…";
    try{
      if(ext==="pdf"){
        const ok=confirm("PDF será arquivado de forma privada, mas NÃO será convertido automaticamente em operações nesta versão. Para cálculos, utilize CSV/Excel ou lance as operações. Continuar?");
        if(!ok){el("import-message").textContent="Upload cancelado.";return}
        await uploadDocument(file,"PDF",[],"arquivado");el("import-message").textContent="PDF guardado para conferência. Para calcular, importe as negociações em planilha.";return;
      }
      let rows;
      if(ext==="csv"){const bytes=await file.arrayBuffer();let s=new TextDecoder("utf-8").decode(bytes);if((s.match(/�/g)||[]).length>2)s=new TextDecoder("windows-1252").decode(bytes);rows=csvRows(s);}
      else{
        if(!window.XLSX)throw new Error("Leitor Excel não carregado. Atualize a página e tente novamente.");
        const wb=window.XLSX.read(await file.arrayBuffer(),{type:"array"});
        rows=window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:"",raw:false,blankrows:false});
      }
      if(rows.length<2)throw new Error("A planilha precisa ter cabeçalhos e operações.");
      const headerScore=r=>FIELDS.slice(0,5).reduce((n,f)=>n+r.some(c=>f.aliases.some(a=>norm(c)===a||norm(c).startsWith(a+" ")))?1:0,0);
      let headerIndex=0,best=0;
      for(let i=0;i<Math.min(15,rows.length);i++){let sc=headerScore(rows[i]);if(sc>best){best=sc;headerIndex=i}}
      const headers=rows[headerIndex].map((x,i)=>String(x||("Coluna "+(i+1))));
      pending={file,rows:rows.slice(headerIndex+1).filter(r=>r.some(c=>String(c).trim())),headers};
      renderMapper();el("import-message").textContent=rows.length+" linhas encontradas. Faça a conferência das colunas.";
    }catch(err){pending=null;el("import-message").textContent=errorMessage(err);toast(errorMessage(err),true)}
  }
  function matchColumn(field,headers){
    const ns=headers.map(norm);
    for(const alias of field.aliases){const idx=ns.findIndex(x=>x===alias);if(idx>=0)return idx}
    for(const alias of field.aliases){const idx=ns.findIndex(x=>x.startsWith(alias+" "));if(idx>=0)return idx}
    return -1;
  }
  function renderMapper(){
    el("mapper").hidden=false;el("mapping-status").textContent="";
    const mappings=FIELDS.map(f=>{
      const options=['<option value="">— Não mapear —</option>'].concat(pending.headers.map((h,i)=>'<option value="'+i+'" '+(matchColumn(f,pending.headers)===i?'selected':'')+'>'+html(h)+'</option>')).join("");
      return '<label>'+html(f.title)+'<select id="map-'+f.id+'">'+options+'</select></label>';
    });el("mapping-fields").innerHTML=mappings.join("");
    const first=pending.headers.slice(0,8);
    el("preview-head").innerHTML="<tr>"+first.map(x=>"<th>"+html(x)+"</th>").join("")+"</tr>";
    el("preview-body").innerHTML=pending.rows.slice(0,5).map(row=>"<tr>"+row.slice(0,8).map(x=>"<td>"+html(x)+"</td>").join("")+"</tr>").join("");
    el("mapper").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function mappedRows(){
    let map={};for(const f of FIELDS){let v=el("map-"+f.id).value;map[f.id]=v===""?-1:Number(v)}
    if(FIELDS.slice(0,5).some(f=>map[f.id]<0))throw new Error("Mapeie data, ativo, operação, quantidade e preço.");
    const ok=[],bad=[];
    pending.rows.forEach((r,i)=>{
      const val=id=>map[id]>=0?r[map[id]]:"";
      let date=parseDate(val("date")),ticker=parseTicker(val("ticker")),side=parseSide(val("side"));
      let qty=parseNumber(val("qty")),price=parseNumber(val("price")),fees=map.fees>=0?parseNumber(val("fees")||0):0;
      if(!date||!/^[A-Z0-9]{4,12}$/.test(ticker)||!side||!(qty>0)||!(price>=0)||!(fees>=0)||!Number.isFinite(fees)||qty>1e9||price>1e12){
        bad.push(i+2);return;
      }
      ok.push({trade_date:date,ticker,side,qty,price,fees:round2(fees),trade_mode:map.mode>=0?parseMode(val("mode")):"COMUM",source_row:i+2});
    });return {ok,bad};
  }
  async function confirmImport(){
    if(!pending)return;
    const button=el("confirm-import");button.disabled=true;
    try{
      const parsed=mappedRows();
      if(!parsed.ok.length)throw new Error("Nenhuma negociação válida encontrada. Verifique o cabeçalho e os campos de compra/venda.");
      const msg=parsed.bad.length
        ?parsed.ok.length+" negociações válidas, "+parsed.bad.length+" linhas sem operação identificável (ex.: "+parsed.bad.slice(0,7).join(", ")+"). Elas NÃO serão calculadas. Importar com alerta de revisão?"
        :"Importar "+parsed.ok.length+" negociações? Confirme que não existem linhas de proventos, transferência ou duplicatas.";
      if(!confirm(msg))return;
      const file=pending.file;
      await uploadDocument(file,file.name.toLowerCase().endsWith(".csv")?"CSV":"EXCEL",parsed.ok,parsed.bad.length?"revisao":"importado");
      pending=null;el("mapper").hidden=true;el("mapping-status").textContent="";
      el("import-message").textContent="Arquivo importado. Confira a lista de operações e os alertas.";
    }catch(err){el("mapping-status").textContent=errorMessage(err);toast(errorMessage(err),true)}
    finally{button.disabled=false}
  }
  async function hashFile(file){
    const data=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
    return Array.from(new Uint8Array(data)).map(v=>v.toString(16).padStart(2,"0")).join("");
  }
  async function uploadDocument(file,kind,rows,state){
    if(!user)throw new Error("Faça login novamente.");
    const sha256=await hashFile(file);
    if(uploadRows.some(u=>u.sha256===sha256))throw new Error("Este mesmo arquivo já foi enviado anteriormente.");
    const shortName=file.name.replace(/[^a-zA-Z0-9_.-]/g,"_").slice(-90);
    const file_path=user.id+"/"+crypto.randomUUID()+"-"+shortName;
    const contentType=kind==="PDF"?"application/pdf":kind==="CSV"?"text/csv":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const put=await db.storage.from(BUCKET).upload(file_path,file,{upsert:false,contentType});
    if(put.error)throw put.error;
    let uploadId=null;
    try{
      const {data,error}=await db.from("ir_uploads").insert({owner_id:user.id,filename:file.name.slice(0,240),file_path,sha256,file_kind:kind,state,row_count:rows.length}).select("id").single();
      if(error)throw error;uploadId=data.id;
      for(let offset=0;offset<rows.length;offset+=300){
        const payload=rows.slice(offset,offset+300).map(r=>({...r,owner_id:user.id,upload_id:uploadId}));
        const result=await db.from("ir_trades").insert(payload);
        if(result.error)throw result.error;
      }
    }catch(err){
      if(uploadId)await db.from("ir_uploads").delete().eq("id",uploadId);
      await db.storage.from(BUCKET).remove([file_path]);
      throw err;
    }
    toast(rows.length?rows.length+" operações importadas.":"Documento arquivado em área privada.");
    await refreshData();go(rows.length?"operacoes":"importacao");
  }
  async function saveTrade(e){
    e.preventDefault();const form=e.currentTarget;const d=Object.fromEntries(new FormData(form));
    const row={owner_id:user.id,trade_date:d.trade_date,ticker:parseTicker(d.ticker),side:d.side,qty:Number(d.qty),price:Number(d.price),fees:round2(Number(d.fees)),trade_mode:d.trade_mode};
    if(!parseDate(row.trade_date)||!/^[A-Z0-9]{4,12}$/.test(row.ticker)||!(row.qty>0)||!(row.price>=0)||!(row.fees>=0)){toast("Confira os campos da operação.",true);return}
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{const {error}=await db.from("ir_trades").insert(row);if(error)throw error;toast("Operação salva.");form.reset();form.elements.trade_date.valueAsDate=new Date();await refreshData();}
    catch(err){toast(errorMessage(err),true)}finally{button.disabled=false}
  }
  async function saveOpening(e){
    e.preventDefault();const form=e.currentTarget;const d=Object.fromEntries(new FormData(form));
    const row={owner_id:user.id,as_of:d.as_of,ticker:parseTicker(d.ticker),qty:Number(d.qty),total_cost:round2(Number(d.total_cost))};
    if(!parseDate(row.as_of)||!/^[A-Z0-9]{4,12}$/.test(row.ticker)||!(row.qty>0)||!(row.total_cost>=0)){toast("Confira os dados do saldo inicial.",true);return}
    try{
      const {error}=await db.from("ir_opening_positions").upsert(row,{onConflict:"owner_id,ticker,as_of"});
      if(error)throw error;toast("Posição histórica salva.");form.reset();await refreshData();
    }catch(err){toast(errorMessage(err),true)}
  }
  async function documentAction(e){
    const button=e.target.closest("button[data-op]");if(!button)return;
    const row=uploadRows.find(x=>x.id===button.dataset.id);if(!row)return;
    if(button.dataset.op==="open"){
      const w=window.open("about:blank","_blank");
      try{
        const {data,error}=await db.storage.from(BUCKET).createSignedUrl(row.file_path,90);
        if(error)throw error;
        if(w){w.opener=null;w.location.href=data.signedUrl}
        else toast("Permita pop-ups para abrir o documento.",true);
      }catch(err){if(w)w.close();toast(errorMessage(err),true)}
    }else if(button.dataset.op==="delete"){
      if(!confirm("Excluir o arquivo '"+row.filename+"' e todas as operações importadas dele? Esta ação não poderá ser desfeita."))return;
      button.disabled=true;
      try{
        const storage=await db.storage.from(BUCKET).remove([row.file_path]);
        if(storage.error)throw storage.error;
        const result=await db.from("ir_uploads").delete().eq("id",row.id);
        if(result.error)throw result.error;
        toast("Documento e lançamentos associados excluídos.");await refreshData();
      }catch(err){toast(errorMessage(err),true);button.disabled=false}
    }
  }
  async function tradeAction(e){
    const b=e.target.closest("button[data-id]");if(!b)return;
    const trade=trades.find(x=>x.id===b.dataset.id);if(!trade||!confirm("Excluir a operação de "+trade.ticker+" em "+trade.trade_date+"?"))return;
    b.disabled=true;
    const {error}=await db.from("ir_trades").delete().eq("id",trade.id);
    if(error){toast(errorMessage(error),true);b.disabled=false}else{toast("Operação removida.");await refreshData()}
  }
  async function openingAction(e){
    const b=e.target.closest("button[data-id]");if(!b)return;
    const row=openings.find(x=>x.id===b.dataset.id);if(!row||!confirm("Excluir saldo inicial de "+row.ticker+"?"))return;
    b.disabled=true;
    const {error}=await db.from("ir_opening_positions").delete().eq("id",row.id);
    if(error){toast(errorMessage(error),true);b.disabled=false}else{toast("Saldo removido.");await refreshData()}
  }
  function compute(){
    const end=String(currentYear)+"-12-31",start=String(currentYear)+"-01-01",issues=[],critical=[];
    let stockTrades=trades.filter(t=>t.trade_date<=end&&t.trade_mode==="COMUM"&&isStock(t.ticker));
    let selected=trades.filter(t=>t.trade_date>=start&&t.trade_date<=end);
    let odd=selected.filter(t=>t.trade_mode!=="COMUM"||!isStock(t.ticker));
    if(odd.length)critical.push(odd.length+" operação(ões) de day trade, ETFs, FIIs, BDRs ou outra modalidade fora do escopo. O IR total do ano não pode ser calculado apenas com esta simulação.");
    const openingMap=new Map();
    for(const o of openings.filter(o=>o.as_of<=end)){
      if(!isStock(o.ticker)){issues.push("Posição "+o.ticker+" exige classificação do ativo.");continue}
      const old=openingMap.get(o.ticker);
      if(!old||o.as_of>old.as_of)openingMap.set(o.ticker,o);
    }
    const possibleDay=new Set();
    const sides=new Map();
    for(const t of stockTrades){const k=t.trade_date+"|"+t.ticker;if(!sides.has(k))sides.set(k,new Set());sides.get(k).add(t.side)}
    for(const [k,s] of sides)if(s.size===2){possibleDay.add(k)}
    if(possibleDay.size){critical.push(possibleDay.size+" combinação(ões) de compra e venda do mesmo ativo no mesmo dia: possível day trade, exige tratamento especial.");}
    const pos=new Map(),months=new Map(),byAsset=new Map();
    for(const [ticker,o] of openingMap){pos.set(ticker,{ticker,qty:Number(o.qty),cost:Number(o.total_cost)});}
    for(const t of stockTrades.sort((a,b)=>a.trade_date.localeCompare(b.trade_date)||a.side.localeCompare(b.side)||a.id.localeCompare(b.id))){
      const baseline=openingMap.get(t.ticker);if(baseline&&t.trade_date<=baseline.as_of)continue;
      const q=Number(t.qty),price=Number(t.price),fee=Number(t.fees),value=q*price,k=t.trade_date.slice(0,7);
      const p=pos.get(t.ticker)||{ticker:t.ticker,qty:0,cost:0};pos.set(t.ticker,p);
      if(t.side==="C"){p.qty+=q;p.cost+=value+fee;}
      else{
        if(p.qty+1e-7<q){
          critical.push("Sem custo histórico suficiente para venda de "+t.ticker+" em "+t.trade_date+" ("+num(q)+" ações).");
          continue;
        }
        const avg=p.qty?p.cost/p.qty:0;
        const gain=value-fee-avg*q;
        p.qty-=q;p.cost-=avg*q;
        if(p.qty<1e-7){p.qty=0;p.cost=0;}
        const m=months.get(k)||{key:k,sales:0,net:0,exempt:0,base:0,tax:0};
        m.sales+=value;m.net+=gain;months.set(k,m);
        if(!byAsset.has(t.ticker))byAsset.set(t.ticker,0);
        byAsset.set(t.ticker,byAsset.get(t.ticker)+gain);
      }
    }
    const duplicateKeys=new Map();
    for(const t of stockTrades){
      const key=[t.trade_date,t.ticker,t.side,t.qty,t.price,t.fees].join("/");
      const prev=duplicateKeys.get(key);if(prev&&prev.upload_id!==t.upload_id)duplicateKeys.set(key,{duplicate:true});
      else if(!prev)duplicateKeys.set(key,t);
    }
    if([...duplicateKeys.values()].some(v=>v.duplicate))critical.push("Há lançamentos idênticos em importações diferentes; confira possíveis duplicidades.");
    if(uploadRows.some(u=>u.state==="revisao"))critical.push("Há arquivos importados com linhas ignoradas. Confira se são operações tributáveis.");
    if(uploadRows.some(u=>u.file_kind==="PDF"&&u.row_count===0))issues.push("PDF arquivado não foi convertido em operações. Confira se ele contém negociações ainda não importadas.");
    if(trades.length>=10000||uploadRows.length>=10000||openings.length>=10000)critical.push("Limite da consulta atingido; o histórico pode estar incompleto.");
    if(!stockTrades.length&&openingMap.size===0)issues.push("Nenhuma operação comum com ações ou posição inicial cadastrada.");
    if(!trades.some(t=>t.trade_date<start)&&!openings.some(o=>o.as_of<start))issues.push("Sem histórico anterior ao ano-base. Compras antigas e prejuízos anteriores podem alterar a apuração.");
    if(!critical.length)issues.push("Antes de usar os valores, conferir IRRF, DARFs, dividendos/JCP, bonificações, grupamentos e prejuízos anteriores.");
    let lossCarry=0;
    for(const key of [...months.keys()].sort()){
      const m=months.get(key);
      if(m.sales<=20000.00001){
        m.exempt=Math.max(0,m.net);
        if(m.net<0)lossCarry+=m.net;
      }else{
        const liquid=m.net+lossCarry;
        if(liquid>0){m.base=liquid;m.tax=round2(liquid*.15);lossCarry=0;}
        else lossCarry=liquid;
      }
    }
    const yearMonths=Array.from({length:12},(_,i)=>months.get(String(currentYear)+"-"+String(i+1).padStart(2,"0"))||{sales:0,net:0,exempt:0,base:0,tax:0});
    const total=yearMonths.reduce((a,m)=>({sales:a.sales+m.sales,net:a.net+m.net,exempt:a.exempt+m.exempt,base:a.base+m.base,tax:a.tax+m.tax}),{sales:0,net:0,exempt:0,base:0,tax:0});
    const positions=[...pos.values()].filter(p=>p.qty>1e-7).sort((a,b)=>a.ticker.localeCompare(b.ticker));
    total.position=positions.reduce((a,p)=>a+p.cost,0);
    return {issues,critical,yearMonths,total,positions,selected,possibleDay,openingMap};
  }
  function renderAll(){
    if(!user)return;el("report-year").textContent=String(currentYear);
    calc=compute();
    const bad=calc.critical.length>0,hasData=trades.length||openings.length;
    el("kpi-patrimonio").textContent=hasData&&!bad?money(calc.total.position):"—";
    el("kpi-vendas").textContent=hasData?money(calc.total.sales):"—";
    el("kpi-resultado").textContent=hasData&&!bad?money(calc.total.base):"—";
    el("kpi-ir").textContent=hasData&&!bad?money(calc.total.tax):"—";
    el("monthly-body").innerHTML=calc.yearMonths.map((m,i)=>"<tr><td>"+MONTHS[i]+"</td><td>"+money(m.sales)+"</td><td class='"+(m.net>=0?"good":"bad")+"'>"+money(m.net)+"</td><td>"+money(m.exempt)+"</td><td>"+(bad?"—":money(m.base))+"</td><td>"+(bad?"—":money(m.tax))+"</td></tr>").join("");
    let alerts=calc.critical.map(x=>'<div class="issue">'+html(x)+'</div>').concat(calc.issues.map(x=>'<div class="issue '+(!bad&&!trades.length?'':"")+'">'+html(x)+'</div>'));
    el("issues").innerHTML=alerts.length?alerts.join(""):'<div class="issue ok">Nenhuma inconsistência estrutural identificada nos registros carregados.</div>';
    el("report-warning").textContent=bad?"APURAÇÃO BLOQUEADA: "+calc.critical.join(" • "):"Estimativa não considera IRRF, DARFs já pagos e outros ajustes. Confirme com o contador antes de declarar ou recolher.";
    renderUploads();renderTrades();renderPositions();renderOpenings();
  }
  function renderUploads(){
    el("uploads-body").innerHTML=uploadRows.slice().reverse().map(u=>
      "<tr><td title='"+html(u.filename)+"'>"+html(u.filename.slice(0,40))+"</td><td>"+new Date(u.created_at).toLocaleDateString("pt-BR")+"</td><td>"+html(u.file_kind)+"</td><td>"+num(u.row_count)+"</td><td>"+html(u.state)+"</td><td><button class='table-action' data-op='open' data-id='"+html(u.id)+"'>Abrir</button><button class='table-action danger' data-op='delete' data-id='"+html(u.id)+"'>Excluir</button></td></tr>"
    ).join("")||'<tr><td colspan="6" class="empty-cell">Nenhum documento enviado.</td></tr>';
  }
  function renderTrades(){
    const q=norm(el("trade-filter").value);
    const filtered=trades.filter(t=>t.trade_date.slice(0,4)===String(currentYear)&&(!q||norm(t.ticker).includes(q))).sort((a,b)=>b.trade_date.localeCompare(a.trade_date));
    el("trade-count").textContent=filtered.length+" operações no ano-base";
    el("trades-body").innerHTML=filtered.map(t=>
      "<tr><td>"+html(t.trade_date.split("-").reverse().join("/"))+"</td><td><strong>"+html(t.ticker)+"</strong></td><td class='"+(t.side==="V"?"bad":"good")+"'>"+(t.side==="V"?"Venda":"Compra")+"</td><td>"+num(t.qty)+"</td><td>"+money(t.price)+"</td><td>"+money(t.fees)+"</td><td>"+(t.trade_mode==="COMUM"&&isStock(t.ticker)?"Comum":'<span class="flag">Revisar</span>')+"</td><td><button class='table-action danger' data-id='"+html(t.id)+"'>Excluir</button></td></tr>"
    ).join("")||'<tr><td colspan="8" class="empty-cell">Sem operações neste ano-base.</td></tr>';
  }
  function renderPositions(){
    el("positions-body").innerHTML=calc.positions.map(p=>
      "<tr><td><strong>"+html(p.ticker)+"</strong></td><td>"+num(p.qty)+"</td><td>"+money(p.cost/p.qty)+"</td><td><strong>"+money(p.cost)+"</strong></td></tr>"
    ).join("")||'<tr><td colspan="4" class="empty-cell">Nenhuma posição apurada.</td></tr>';
  }
  function renderOpenings(){
    el("openings-body").innerHTML=openings.map(o=>
      "<tr><td>"+html(o.as_of.split("-").reverse().join("/"))+"</td><td>"+html(o.ticker)+"</td><td>"+num(o.qty)+"</td><td>"+money(o.total_cost)+"</td><td><button class='table-action danger' data-id='"+html(o.id)+"'>Excluir</button></td></tr>"
    ).join("")||'<tr><td colspan="5" class="empty-cell">Nenhuma posição inicial registrada.</td></tr>';
  }
  function exportReport(){
    if(!calc){toast("Nada a exportar.",true);return}
    const lines=[["Ano-base",String(currentYear)],["Aviso","SIMULAÇÃO - não substitui a declaração nem o cálculo do DARF"],["Situação",calc.critical.length?"INCOMPLETO / BLOQUEADO":"PRELIMINAR"],["Alertas",calc.critical.concat(calc.issues).join(" | ")],[],["Mês","Vendas (R$)","Resultado (R$)","Ganho isento (R$)","Base estimada (R$)","IR bruto (R$)"]];
    calc.yearMonths.forEach((m,i)=>lines.push([MONTHS[i],m.sales.toFixed(2),m.net.toFixed(2),m.exempt.toFixed(2),calc.critical.length?"Não calculado":m.base.toFixed(2),calc.critical.length?"Não calculado":m.tax.toFixed(2)]));
    lines.push([],["Ativo","Quantidade em 31/12","Preço médio (R$)","Custo a declarar (R$)"]);
    calc.positions.forEach(p=>lines.push([p.ticker,p.qty.toString(),(p.cost/p.qty).toFixed(4),p.cost.toFixed(2)]));
    const csv="\uFEFF"+lines.map(r=>r.map(x=>'"'+String(x??"").replace(/"/g,'""')+'"').join(";")).join("\r\n");
    const a=document.createElement("a"),url=window.URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    a.href=url;a.download="apuracao_ir_acoes_"+currentYear+".csv";document.body.append(a);a.click();a.remove();setTimeout(()=>window.URL.revokeObjectURL(url),3000);
  }
  init().catch(e=>fatal("Erro inicial: "+errorMessage(e)));
})();