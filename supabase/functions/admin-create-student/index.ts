import { createClient } from 'npm:@supabase/supabase-js@2'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return json({message:'Método não permitido.'},405)

  const auth=req.headers.get('Authorization')
  if(!auth?.startsWith('Bearer '))return json({message:'Não autenticado.'},401)

  const supabaseUrl=Deno.env.get('SUPABASE_URL')!
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!serviceKey)return json({message:'Configuração do servidor incompleta.'},500)

  const admin=createClient(supabaseUrl,serviceKey)
  const token=auth.replace('Bearer ','')
  const{data:userData,error:userError}=await admin.auth.getUser(token)
  if(userError||!userData.user)return json({message:'Sessão inválida.'},401)

  const{data:profile}=await admin.from('profiles').select('role,active').eq('id',userData.user.id).single()
  if(profile?.role!=='admin'||profile?.active!==true)return json({message:'Acesso administrativo negado.'},403)

  let body:{email?:string;password?:string;nome?:string;telefone?:string}
  try{body=await req.json()}catch{return json({message:'JSON inválido.'},400)}

  const email=String(body.email||'').trim().toLowerCase()
  const password=String(body.password||'')
  const nome=String(body.nome||'').trim()
  const telefone=String(body.telefone||'').trim()

  if(!email||!email.includes('@'))return json({message:'Informe um e-mail válido.'},400)
  if(password.length<6)return json({message:'A senha precisa ter pelo menos 6 caracteres.'},400)
  if(nome.length<2)return json({message:'Informe o nome do aluno.'},400)

  const{data:created,error:createError}=await admin.auth.admin.createUser({
    email,
    password,
    email_confirm:true,
    user_metadata:{full_name:nome,nome,telefone}
  })

  if(createError){
    const msg=createError.message.toLowerCase().includes('already')?'Este e-mail já está cadastrado.':createError.message
    return json({message:msg},409)
  }

  if(created.user){
    await admin.from('profiles').upsert({
      id:created.user.id,
      nome,
      email,
      telefone,
      role:'student',
      active:true
    },{onConflict:'id'})
  }

  return json({ok:true,user_id:created.user?.id,email})
})
