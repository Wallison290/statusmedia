// ── create-portal: abre portal de gestão da assinatura no Stripe ──────────────

import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'
import { agencyIdFor } from '../_shared/agency.ts'

const STRIPE_SECRET_KEY   = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL              = Deno.env.get('APP_URL') ?? 'https://statusmedia.com.br'

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  if (!user) {
    return new Response(JSON.stringify({ error: 'Não autenticado' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  // Sócio age como o dono da agência (migration 088)
  const agencyId = await agencyIdFor(user.id)

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (sb as any)
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', agencyId)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    // Sem customer live — sinaliza frontend para ir ao checkout
    return new Response(JSON.stringify({ needsCheckout: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer:   sub.stripe_customer_id,
    return_url: `${APP_URL}/assinatura`,
  })

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
