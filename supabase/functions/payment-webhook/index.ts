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
  if (!mpToken || !serviceKey) return json({ message: 'Configuração do servidor incompleta.' }, 500)

  const admin = createClient(supabaseUrl, serviceKey)

  if (eventType === 'subscription_preapproval') {
    const mp = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${mpToken}` } })
    const subscription = await mp.json()
    if (!mp.ok || !subscription.id) return json({ message: 'Assinatura não encontrada no Mercado Pago.' }, 404)

    const { data: purchase, error } = await admin
      .from('purchases')
      .select('id,metadata')
      .or(`provider_subscription_id.eq.${subscription.id},metadata->>subscription_id.eq.${subscription.id}`)
      .maybeSingle()
    if (error || !purchase) return json({ received: true, linked: false })

    const metadata = {
      ...(purchase.metadata || {}),
      subscription_status: subscription.status || null,
      next_payment_date: subscription.next_payment_date || null,
      subscription_last_modified: subscription.last_modified || null
    }
    await admin.from('purchases').update({
      next_billing_at: subscription.next_payment_date || null,
      metadata
    }).eq('id', purchase.id)

    return json({ received: true, subscription: subscription.id })
  }

  const mp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${mpToken}` } })
  const payment = await mp.json()
  if (!mp.ok || !payment.id) return json({ message: 'Pagamento não encontrado no Mercado Pago.' }, 404)

  const purchaseId = payment.external_reference
  if (!purchaseId) return json({ message: 'Pagamento sem external_reference.' }, 422)

  const { data: purchase, error: purchaseError } = await admin
    .from('purchases')
    .select('id,user_id,course_id,amount_cents,status,billing_mode,metadata,provider_subscription_id')
    .eq('id', purchaseId)
    .single()
  if (purchaseError || !purchase) return json({ message: 'Compra interna não encontrada.' }, 404)

  const expectedAmount = Number(purchase.amount_cents) / 100
  if (Math.abs(Number(payment.transaction_amount) - expectedAmount) > 0.001) return json({ message: 'Valor do pagamento não confere.' }, 409)

  const previousMetadata = purchase.metadata || {}
  if (String(previousMetadata.last_payment_id || '') === String(payment.id)) return json({ received: true, duplicate: true })

  const statusMap: Record<string,string> = { approved:'paid', rejected:'failed', cancelled:'cancelled', refunded:'refunded', charged_back:'refunded', in_process:'pending', pending:'pending', authorized:'pending' }
  const newStatus = statusMap[String(payment.status)] || 'pending'
  const patch: Record<string,unknown> = {
    status: newStatus,
    provider: 'mercadopago',
    provider_payment_id: String(payment.id),
    payment_method: payment.payment_method_id || null,
    metadata: {
      ...previousMetadata,
      last_payment_id: String(payment.id),
      mp_status: payment.status,
      status_detail: payment.status_detail || null,
      payment_id: payment.id,
      live_mode: payment.live_mode ?? null
    }
  }
  if (newStatus === 'paid') patch.paid_at = payment.date_approved || new Date().toISOString()

  const { error: updateError } = await admin.from('purchases').update(patch).eq('id', purchase.id)
  if (updateError) return json({ message: 'Falha ao atualizar compra.' }, 500)

  if (newStatus === 'paid' && String(purchase.billing_mode || '') === 'monthly') {
    const paidAt = payment.date_approved || new Date().toISOString()
    const { error: renewalError } = await admin.rpc('renew_monthly_course_access', {
      p_user_id: purchase.user_id,
      p_course_id: purchase.course_id,
      p_paid_at: paidAt
    })
    if (renewalError) {
      console.error('monthly access renewal error', renewalError)
      return json({ message: 'Pagamento recebido, mas a renovação do acesso falhou.' }, 500)
    }
  }

  return json({ received: true })
})
