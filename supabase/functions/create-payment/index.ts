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

  const token=auth.replace('Bearer ','')
  const supabaseUrl=Deno.env.get('SUPABASE_URL')!
  const secretKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const mpToken=Deno.env.get('MP_ACCESS_TOKEN')
  const siteUrl=Deno.env.get('SITE_URL')

  if(!secretKey||!mpToken||!siteUrl)
    return json({message:'Configuração do servidor incompleta.'},500)

  const admin=createClient(supabaseUrl,secretKey)
  const{data:userData,error:userError}=await admin.auth.getUser(token)
  if(userError||!userData.user)return json({message:'Sessão inválida.'},401)

  let body:{purchase_id?:string}
  try{body=await req.json()}catch{return json({message:'JSON inválido.'},400)}
  if(!body.purchase_id)return json({message:'purchase_id é obrigatório.'},400)

  const{data:purchase,error:purchaseError}=await admin
    .from('purchases')
    .select('id,user_id,course_id,amount_cents,currency,status,provider,provider_payment_id,billing_mode,metadata')
    .eq('id',body.purchase_id)
    .eq('user_id',userData.user.id)
    .single()

  if(purchaseError||!purchase)return json({message:'Compra não encontrada.'},404)
  if(purchase.status!=='pending')return json({message:'Esta compra não está pendente.'},409)
  if(purchase.provider_payment_id)return json({message:'Esta compra já possui pagamento.'},409)

  const{data:course,error:courseError}=await admin
    .from('courses')
    .select('id,name,description,price_cents,active')
    .eq('id',purchase.course_id)
    .single()

  if(courseError||!course||!course.active)
    return json({message:'Curso indisponível.'},400)

  const amountCents=Number(course.price_cents||100)
  if(amountCents!==Number(purchase.amount_cents))
    return json({message:'Valor da compra não confere com o curso.'},409)

  if(Number(purchase.amount_cents)!==100||String(purchase.billing_mode||'')!=='monthly')
    return json({message:'Esta função está configurada para a cobrança mensal de R$ 1,00.'},409)

  const origin=siteUrl.replace(/\/$/,'')

  const payload={
    items:[{
      id:String(course.id),
      title:`Nós Passa — ${course.name}`,
      description:'Acesso por 1 mês',
      quantity:1,
      currency_id:'BRL',
      unit_price:1
    }],
    external_reference:String(purchase.id),
    notification_url:`${supabaseUrl}/functions/v1/payment-webhook`,
    back_urls:{
      success:`${origin}/pagamento.html?purchase=${purchase.id}`,
      pending:`${origin}/pagamento.html?purchase=${purchase.id}`,
      failure:`${origin}/checkout-popular.html?course=${course.id}`
    },
    auto_return:'approved',
    payment_methods:{installments:1}
  }

  const mp=await fetch(
    'https://api.mercadopago.com/checkout/preferences',
    {
      method:'POST',
      headers:{
        Authorization:`Bearer ${mpToken}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(payload)
    }
  )

  const mpData=await mp.json()

  if(!mp.ok||!mpData.id||!mpData.init_point){
    console.error('Mercado Pago preference error',mp.status,mpData)
    return json({message:'Mercado Pago não conseguiu criar o checkout.'},502)
  }

  const metadata={
    ...(purchase.metadata||{}),
    billing_mode:'monthly',
    preference_id:String(mpData.id),
    payment_flow:'checkout_pro_monthly'
  }

  const{error:updateError}=await admin
    .from('purchases')
    .update({
      provider:'mercadopago',
      metadata
    })
    .eq('id',purchase.id)

  if(updateError)
    return json({message:'O checkout foi criado, mas não conseguimos salvar o vínculo no sistema.'},500)

  return json({
    init_point:mpData.init_point,
    preference_id:mpData.id,
    billing:'R$ 1,00 por mês'
  })
})
