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

  const supabaseUrl=Deno.env.get('SUPABASE_URL')!
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const mpToken=Deno.env.get('MP_ACCESS_TOKEN')
  const siteUrl=Deno.env.get('SITE_URL')

  if(!serviceKey||!mpToken||!siteUrl)return json({message:'Configuração do servidor incompleta.'},500)

  let body:{course_id?:number|string;nome?:string;telefone?:string;email?:string;password?:string}
  try{body=await req.json()}catch{return json({message:'JSON inválido.'},400)}

  const courseId=Number(body.course_id)
  const nome=String(body.nome||'').trim()
  const telefone=String(body.telefone||'').trim()
  const email=String(body.email||'').trim().toLowerCase()
  const password=String(body.password||'')
  const phoneDigits=telefone.replace(/\D/g,'')

  if(!Number.isInteger(courseId)||courseId<1)return json({message:'Preparação inválida.'},400)
  if(nome.length<2)return json({message:'Informe seu nome completo.'},400)
  if(phoneDigits.length<10)return json({message:'Informe um WhatsApp/celular válido.'},400)
  if(!email.includes('@')||email.length<5)return json({message:'Informe um e-mail válido.'},400)
  if(password.length<6)return json({message:'A senha precisa ter pelo menos 6 caracteres.'},400)

  const admin=createClient(supabaseUrl,serviceKey)
  const{data:course,error:courseError}=await admin.from('courses').select('id,name,description,price_cents,active').eq('id',courseId).single()
  if(courseError||!course||!course.active)return json({message:'Curso indisponível.'},400)
  if(Number(course.price_cents||0)!==100)return json({message:'Este curso não está configurado para o pagamento mensal de R$ 1,00.'},409)

  // O createUser já valida se o e-mail existe. A API atual do Supabase JS não possui getUserByEmail.
  const{data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:nome,nome,telefone}})
  if(createError||!created.user){
    const raw=(createError?.message||'').toLowerCase()
    const msg=raw.includes('already')||raw.includes('registered')||raw.includes('exists')
      ?'Este e-mail já possui cadastro. Clique em “Já tenho cadastro” e entre na sua conta para continuar.'
      :(createError?.message||'Não foi possível criar sua conta.')
    return json({message:msg},409)
  }

  const userId=created.user.id
  const{error:profileError}=await admin.from('profiles').upsert({id:userId,nome,email,telefone,role:'student',active:true},{onConflict:'id'})
  if(profileError)return json({message:'Conta criada, mas não conseguimos preparar seu cadastro. Tente novamente.'},500)

  const{data:purchase,error:purchaseError}=await admin.from('purchases').insert({user_id:userId,course_id:course.id,amount_cents:100,currency:'BRL',status:'pending',provider:'mercadopago',billing_mode:'monthly',metadata:{payment_flow:'checkout_pro_monthly_public'}}).select('id').single()
  if(purchaseError||!purchase)return json({message:'Não foi possível criar o pedido de pagamento.'},500)

  const origin=siteUrl.replace(/\/$/,'')
  const phoneArea=phoneDigits.slice(0,-9)||phoneDigits.slice(0,2)
  const phoneNumber=phoneDigits.slice(-9)
  const payload={
    items:[{id:String(course.id),title:`Nós Passa — ${course.name}`,description:'Acesso por 1 mês',quantity:1,currency_id:'BRL',unit_price:1}],
    payer:{name:nome,email,phone:{area_code:phoneArea,number:phoneNumber}},
    external_reference:String(purchase.id),
    notification_url:`${supabaseUrl}/functions/v1/payment-webhook`,
    back_urls:{success:`${origin}/pagamento.html?purchase=${purchase.id}`,pending:`${origin}/pagamento.html?purchase=${purchase.id}`,failure:`${origin}/checkout-popular.html?course=${course.id}`},
    auto_return:'approved',
    payment_methods:{installments:1}
  }

  const mp=await fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${mpToken}`,'Content-Type':'application/json'},body:JSON.stringify(payload)})
  const mpData=await mp.json()
  if(!mp.ok||!mpData.id||!mpData.init_point){console.error('Mercado Pago preference error',mp.status,mpData);return json({message:'Sua conta foi criada, mas o Mercado Pago não conseguiu iniciar o checkout. Entre na conta e tente novamente.'},502)}

  const{error:updateError}=await admin.from('purchases').update({metadata:{payment_flow:'checkout_pro_monthly_public',preference_id:String(mpData.id),billing_mode:'monthly'}}).eq('id',purchase.id)
  if(updateError)return json({message:'O checkout foi criado, mas não conseguimos finalizar o vínculo do pagamento.'},500)

  return json({ok:true,user_id:userId,purchase_id:purchase.id,init_point:mpData.init_point,preference_id:mpData.id})
})
