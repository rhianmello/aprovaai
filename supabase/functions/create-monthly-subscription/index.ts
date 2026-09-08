import { createClient } from 'npm:@supabase/supabase-js@2'

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
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
  if(!secretKey||!mpToken||!siteUrl)return json({message:'Configuração do servidor incompleta.'},500)

  const admin=createClient(supabaseUrl,secretKey)
  const{data:userData,error:userError}=await admin.auth.getUser(token)
  if(userError||!userData.user)return json({message:'Sessão inválida.'},401)

  let body:{purchase_id?:string}
  try{body=await req.json()}catch{return json({message:'JSON inválido.'},400)}
  if(!body.purchase_id)return json({message:'purchase_id é obrigatório.'},400)

  const{data:purchase,error:purchaseError}=await admin.from('purchases').select('id,user_id,course_id,amount_cents,currency,status,provider,provider_subscription_id,billing_mode,metadata').eq('id',body.purchase_id).eq('user_id',userData.user.id).single()
  if(purchaseError||!purchase)return json({message:'Compra não encontrada.'},404)
  if(purchase.status!=='pending')return json({message:'Esta assinatura não está pendente.'},409)
  if(purchase.provider_subscription_id)return json({message:'Esta compra já possui uma assinatura.',init_point:purchase.metadata?.init_point||null},409)

  const{data:course,error:courseError}=await admin.from('courses').select('id,name,description,active').eq('id',purchase.course_id).single()
  if(courseError||!course||!course.active)return json({message:'Curso indisponível.'},400)

  if(Number(purchase.amount_cents)!==100)return json({message:'A compra não está configurada para R$ 1,00 por mês. Execute a migração mensal no Supabase.'},409)

  const origin=siteUrl.replace(/\/$/,'')
  const payload={
    reason:`Nós Passa — ${course.name}`,
    external_reference:String(purchase.id),
    payer_email:userData.user.email,
    auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:1,currency_id:'BRL'},
    back_url:`${origin}/pagamento.html?purchase=${purchase.id}`,
    status:'pending'
  }

  const mp=await fetch('https://api.mercadopago.com/preapproval',{method:'POST',headers:{Authorization:`Bearer ${mpToken}`,'Content-Type':'application/json'},body:JSON.stringify(payload)})
  const mpData=await mp.json()
  if(!mp.ok||!mpData.id||!mpData.init_point){console.error('Mercado Pago subscription error',mp.status,mpData);return json({message:'Mercado Pago não conseguiu criar a assinatura mensal.'},502)}

  const metadata={...(purchase.metadata||{}),billing_mode:'monthly',subscription_id:String(mpData.id),init_point:mpData.init_point,next_payment_date:mpData.next_payment_date||null}
  const{error:updateError}=await admin.from('purchases').update({provider:'mercadopago',billing_mode:'monthly',provider_subscription_id:String(mpData.id),next_billing_at:mpData.next_payment_date||null,metadata}).eq('id',purchase.id)
  if(updateError)return json({message:'A assinatura foi criada, mas não conseguimos salvar o vínculo no sistema. Não tente pagar novamente; contate o suporte.'},500)

  return json({init_point:mpData.init_point,subscription_id:mpData.id,next_payment_date:mpData.next_payment_date||null,billing:'R$ 1,00 por mês'})
})
