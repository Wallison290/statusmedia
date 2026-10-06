// ── create-checkout: gera sessão de pagamento no Stripe ───────────────────────
// Requer secrets: STRIPE_SECRET_KEY configurado via supabase secrets set

import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'
import { agencyIdFor } from '../_shared/agency.ts'

const STRIPE_SECRET_KEY  = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL             = Deno.env.get('APP_URL') ?? 'https://statusmedia.com.br'

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function getUser(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user } } = await sb.auth.getUser(auth.replace('Bearer ', ''))
  return user
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const user = await getUser(req)
  if (!user) return json({ error: 'Não autenticado' }, 401)
  // Sócio age como o dono da agência (migration 088)
  const agencyId = await agencyIdFor(user.id)

  const { priceId } = await req.json()
  if (!priceId || priceId.startsWith('CONFIGURE_')) {
    return json({ error: 'Plano não disponível. Configure o STRIPE_PRICE_ID.' }, 400)
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Busca ou cria customer no Stripe
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (sb as any)
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', agencyId)
    .maybeSingle()

  let customerId: string = sub?.stripe_customer_id ?? ''

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: agencyId },
    })
    customerId = customer.id

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any)
      .from('subscriptions')
      .upsert({ user_id: agencyId, stripe_customer_id: customerId }, { onConflict: 'user_id' })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/planos?success=1`,
    cancel_url:  `${APP_URL}/planos?canceled=1`,
    metadata: { user_id: agencyId },
  })

  return json({ url: session.url })
})
