import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function parseSignature(value: string | null) {
  const out: Record<string,string> = {}
  for (const part of (value || '').split(',')) {
    const [k,v] = part.split('=',2)
    if (k && v) out[k.trim()] = v.trim()
  }
  return out
}
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('')
}
async function fetchPaymentWithRetry(mpToken: string, paymentId: string) {
  const delays = [0, 2000, 4000, 6000]
  let last: any = null
  for (const delay of delays) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${mpToken}` } })
    const data = await response.json()
    if (!response.ok || !data?.id) return { ok:false, data }
    last = data
    if (!['pending','in_process','authorized'].includes(String(data.status))) return { ok:true, data }
  }
  return { ok:true, data:last }
}
async function fetchAuthorizedPayment(mpToken: string, invoiceId: string) {
  const response = await fetch(`https://api.mercadopago.com/authorized_payments/${encodeURIComponent(invoiceId)}`, { headers: { Authorization: `Bearer ${mpToken}` } })
  const data = await response.json()
  return { ok: response.ok && !!data?.id, data }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ message: 'Método não permitido.' }, 405)
  const url = new URL(req.url)
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('data_id')
  const eventType = url.searchParams.get('type') || url.searchParams.get('topic') || ''
  const requestId = req.headers.get('x-request-id') || ''
  const signature = parseSignature(req.headers.get('x-signature'))
  const secret = Deno.env.get('MP_WEBHOOK_SECRET')
  if (!secret || !dataId || !signature.v1 || !signature.ts) return json({ message: 'Webhook inválido.' }, 401)
  const manifestParts = [`id:${dataId}`]
  if (requestId) manifestParts.push(`request-id:${requestId}`)
  manifestParts.push(`ts:${signature.ts}`)
  const expected = await hmacHex(secret, manifestParts.join(';') + ';')
  if (!timingSafeEqual(expected, signature.v1)) return json({ message: 'Assinatura inválida.' }, 401)

  const mpToken = Deno.env.get('MP_ACCESS_TOKEN')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const siteUrl = Deno.env.get('SITE_URL')
  if (!mpToken || !serviceKey || !siteUrl) return json({ message: 'Configuração do servidor incompleta.' }, 500)
  const admin = createClient(supabaseUrl, serviceKey)

  // Assinatura autorizada/cancelada/pausada: sincroniza o contrato recorrente.
  if (eventType === 'subscription_preapproval') {
    const mp = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${mpToken}` } })
    const subscription = await mp.json()
    if (!mp.ok || !subscription.id) return json({ message: 'Assinatura não encontrada no Mercado Pago.' }, 404)
    const { data: purchase } = await admin.from('purchases').select('id,metadata').or(`provider_subscription_id.eq.${subscription.id},metadata->>subscription_id.eq.${subscription.id}`).maybeSingle()
    if (!purchase) return json({ received: true, linked: false })
    const metadata = {
      ...(purchase.metadata || {}),
      subscription_status: subscription.status || null,
      next_payment_date: subscription.next_payment_date || null,
      subscription_last_modified: subscription.last_modified || null
    }
    await admin.from('purchases').update({ next_billing_at: subscription.next_payment_date || null, metadata }).eq('id', purchase.id)
    return json({ received: true, subscription: subscription.id, status: subscription.status })
  }

  // Cada fatura recorrente chega como subscription_authorized_payment.
  if (eventType === 'subscription_authorized_payment') {
    const invoice = await fetchAuthorizedPayment(mpToken, dataId)
    if (!invoice.ok) return json({ message: 'Fatura recorrente não encontrada.' }, 404)
    const inv = invoice.data
    const subscriptionId = String(inv.preapproval_id || '')
    if (!subscriptionId) return json({ message: 'Fatura sem preapproval_id.' }, 422)
    const { data: basePurchase } = await admin.from('purchases').select('id,user_id,course_id,provider_subscription_id,metadata').eq('provider_subscription_id', subscriptionId).maybeSingle()
    if (!basePurchase) return json({ received: true, linked: false })

    const paymentId = String(inv.payment?.id || '')
    const paymentStatus = String(inv.payment?.status || inv.summarized || inv.status || 'pending')
    if (!paymentId) return json({ received: true, invoice: dataId, linked: true })

    const { data: duplicate } = await admin.from('purchases').select('id').eq('provider_payment_id', paymentId).maybeSingle()
    if (duplicate) return json({ received: true, duplicate: true })

    const paid = paymentStatus === 'approved' || paymentStatus === 'accredited'
    const failed = ['rejected','cancelled','refunded','charged_back'].includes(paymentStatus)
    const status = paid ? 'paid' : failed ? 'failed' : 'pending'
    const paidAt = paid ? (inv.payment?.date_approved || new Date().toISOString()) : null
    const { data: renewal, error: renewalError } = await admin.from('purchases').insert({
      user_id: basePurchase.user_id,
      course_id: basePurchase.course_id,
      amount_cents: 590,
      currency: 'BRL',
      status,
      provider: 'mercadopago',
      provider_payment_id: paymentId,
      payment_method: inv.payment?.payment_method_id || null,
      paid_at: paidAt,
      billing_mode: 'recurring',
      provider_subscription_id: subscriptionId,
      metadata: { payment_flow:'subscription_renewal', invoice_id:String(dataId), subscription_id:subscriptionId, mp_status:paymentStatus }
    }).select('id').single()
    if (renewalError) return json({ message: 'Falha ao registrar a renovação.' }, 500)

    if (paid) {
      const { error: accessError } = await admin.rpc('renew_monthly_course_access', { p_user_id: basePurchase.user_id, p_course_id: basePurchase.course_id, p_paid_at: paidAt })
      if (accessError) {
        console.error('subscription access renewal error', accessError)
        return json({ message: 'Renovação paga, mas a extensão do acesso falhou.' }, 500)
      }
    }
    const nextDate = inv.debit_date || null
    await admin.from('purchases').update({ next_billing_at: nextDate, metadata: { ...(basePurchase.metadata || {}), last_recurring_payment_id:paymentId, last_recurring_status:paymentStatus } }).eq('id', basePurchase.id)
    return json({ received:true, renewal_purchase_id:renewal?.id, status })
  }

  // Pagamento inicial de R$1 do Checkout Pro.
  const paymentResult = await fetchPaymentWithRetry(mpToken, dataId)
  if (!paymentResult.ok || !paymentResult.data?.id) return json({ message: 'Pagamento não encontrado no Mercado Pago.' }, 404)
  const payment = paymentResult.data
  const purchaseId = payment.external_reference
  if (!purchaseId) return json({ message: 'Pagamento sem external_reference.' }, 422)
  const { data: purchase, error: purchaseError } = await admin.from('purchases').select('id,user_id,course_id,amount_cents,status,billing_mode,metadata,provider_subscription_id').eq('id', purchaseId).single()
  if (purchaseError || !purchase) return json({ message: 'Compra interna não encontrada.' }, 404)
  const expectedAmount = Number(purchase.amount_cents) / 100
  if (Math.abs(Number(payment.transaction_amount) - expectedAmount) > 0.001) return json({ message: 'Valor do pagamento não confere.' }, 409)
  const previousMetadata = purchase.metadata || {}
  if (String(previousMetadata.last_payment_id || '') === String(payment.id) && String(previousMetadata.mp_status || '') === String(payment.status)) return json({ received:true, duplicate:true })
  const statusMap: Record<string,string> = { approved:'paid', rejected:'failed', cancelled:'cancelled', refunded:'refunded', charged_back:'refunded', in_process:'pending', pending:'pending', authorized:'pending' }
  const newStatus = statusMap[String(payment.status)] || 'pending'
  const patch: Record<string,unknown> = {
    status:newStatus, provider:'mercadopago', provider_payment_id:String(payment.id), payment_method:payment.payment_method_id || null,
    metadata:{ ...previousMetadata, last_payment_id:String(payment.id), mp_status:payment.status, status_detail:payment.status_detail || null, payment_id:payment.id, live_mode:payment.live_mode ?? null }
  }
  if (newStatus === 'paid') patch.paid_at = payment.date_approved || new Date().toISOString()
  const { error:updateError } = await admin.from('purchases').update(patch).eq('id', purchase.id)
  if (updateError) return json({ message:'Falha ao atualizar compra.' },500)
  if (newStatus === 'pending') return json({ message:'Pagamento ainda pendente no Mercado Pago; aguardar nova notificação.' },503)

  if (newStatus === 'paid' && String(purchase.billing_mode || '') === 'monthly') {
    const paidAt = payment.date_approved || new Date().toISOString()
    const { error: accessError } = await admin.rpc('renew_monthly_course_access', { p_user_id:purchase.user_id, p_course_id:purchase.course_id, p_paid_at:paidAt })
    if (accessError) {
      console.error('initial access renewal error', accessError)
      return json({ message:'Pagamento recebido, mas a liberação do acesso falhou.' },500)
    }

    // Após o R$1 inicial, cria uma assinatura pendente de autorização para R$5,90/mês.
    // A primeira cobrança recorrente começa um mês após o pagamento inicial.
    if (!purchase.provider_subscription_id && !previousMetadata.subscription_id) {
      const origin = siteUrl.replace(/\/$/,'')
      const start = new Date(new Date(paidAt).getTime() + 30*24*60*60*1000)
      const payerEmail = String(payment.payer?.email || '')
      if (payerEmail) {
        const subResponse = await fetch('https://api.mercadopago.com/preapproval', {
          method:'POST', headers:{ Authorization:`Bearer ${mpToken}`, 'Content-Type':'application/json' },
          body:JSON.stringify({
            reason:'Nós Passa — renovação mensal', external_reference:String(purchase.id), payer_email:payerEmail,
            auto_recurring:{ frequency:1, frequency_type:'months', start_date:start.toISOString(), transaction_amount:5.90, currency_id:'BRL' },
            back_url:`${origin}/pagamento.html?purchase=${purchase.id}`, status:'pending'
          })
        })
        const sub = await subResponse.json()
        if (subResponse.ok && sub?.id) {
          const metadata = { ...previousMetadata, subscription_id:String(sub.id), subscription_status:sub.status || 'pending', subscription_init_point:sub.init_point || null, first_month_price_cents:100, recurring_price_cents:590, recurring_start_at:start.toISOString() }
          await admin.from('purchases').update({ provider_subscription_id:String(sub.id), next_billing_at:start.toISOString(), metadata }).eq('id',purchase.id)
        } else {
          console.error('subscription creation error', subResponse.status, sub)
        }
      }
    }
  }
  return json({ received:true })
})
