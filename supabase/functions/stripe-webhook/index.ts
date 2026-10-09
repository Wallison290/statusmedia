// ── stripe-webhook: processa eventos de pagamento do Stripe ───────────────────
// Requer secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'
import { PRICE_TO_PLAN } from '../_shared/plans.ts'

const STRIPE_SECRET_KEY     = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })

Deno.serve(async (req) => {
  const sig  = req.headers.get('stripe-signature') ?? ''
  const body = await req.text()

  // FIX #1 (CRÍTICO): STRIPE_WEBHOOK_SECRET obrigatório — sem ele, rejeitamos tudo
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET não configurado')
    return new Response('Webhook secret não configurado', { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
  } catch (_sigErr) {
    // Segunda tentativa: tolerância de timestamp = 0 (útil para reenvios do Workbench)
    try {
      event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET, 0)
    } catch (err) {
      // FIX #1: sem fallback — assinatura inválida = rejeitar
      console.error('[stripe-webhook] Assinatura inválida:', err)
      return new Response('Assinatura inválida', { status: 400 })
    }
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  switch (event.type) {
    // ── Checkout concluído → ativa o plano ────────────────────────────────────
    case 'checkout.session.completed': {
      const session    = event.data.object as Stripe.Checkout.Session
      const userId     = session.metadata?.user_id
      const subId      = session.subscription as string
      const customerId = session.customer as string

      if (!userId || !subId) {
        console.error('[webhook] checkout.session.completed sem user_id ou subscription')
        break
      }

      const stripeSub = await stripe.subscriptions.retrieve(subId)
      const priceId   = stripeSub.items.data[0]?.price?.id ?? ''
      // FIX #3: price ID desconhecido = erro explícito, não assume plano
      const plan = PRICE_TO_PLAN[priceId]
      if (!plan) {
        console.error(`[webhook] ERRO: Price ID desconhecido "${priceId}" — adicione ao PRICE_TO_PLAN`)
        return new Response(`Price ID não mapeado: ${priceId}`, { status: 400 })
      }
      const periodEnd = new Date((stripeSub.current_period_end ?? 0) * 1000).toISOString()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('subscriptions').upsert({
        user_id:                userId,
        plan,
        status:                 'active',
        stripe_customer_id:     customerId,
        stripe_subscription_id: subId,
        current_period_end:     periodEnd,
        cancel_at_period_end:   false,
        updated_at:             new Date().toISOString(),
      }, { onConflict: 'user_id' })

      // Inicializa contador de IA (idempotente: ignoreDuplicates evita reset duplo)
      const month = new Date().toISOString().slice(0, 7)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('ai_usage').upsert(
        { user_id: userId, month, requests: 0 },
        { onConflict: 'user_id,month', ignoreDuplicates: true }
      )
      console.log(`[webhook] ${userId} → plano ${plan}`)
      break
    }

    // ── Renovação automática ───────────────────────────────────────────────────
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const subId   = invoice.subscription as string
      if (!subId) break

      const stripeSub = await stripe.subscriptions.retrieve(subId)
      const periodEnd = new Date((stripeSub.current_period_end ?? 0) * 1000).toISOString()
      // FIX #4: também atualiza o campo `plan` na renovação
      const priceId = stripeSub.items.data[0]?.price?.id ?? ''
      const plan    = PRICE_TO_PLAN[priceId]

      const updatePayload: Record<string, unknown> = {
        status:             'active',
        current_period_end: periodEnd,
        updated_at:         new Date().toISOString(),
      }
      if (plan) updatePayload.plan = plan

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('subscriptions')
        .update(updatePayload)
        .eq('stripe_subscription_id', subId)

      // FIX #5: busca user_id via stripe_subscription_id (não customer_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sub } = await (sb as any)
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_subscription_id', subId)
        .maybeSingle()

      if (sub?.user_id) {
        // Reseta contador de IA no início de cada ciclo de cobrança
        const month = new Date().toISOString().slice(0, 7)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from('ai_usage').upsert(
          { user_id: sub.user_id, month, requests: 0, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,month' }
        )
      }
      break
    }

    // ── Pagamento falhou ──────────────────────────────────────────────────────
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subId   = invoice.subscription as string
      if (!subId) break
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('subscriptions')
        .update({ status: 'past_due', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subId)
      break
    }

    // ── Cancelamento definitivo ───────────────────────────────────────────────
    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('subscriptions')
        .update({
          plan:                   'starter',
          status:                 'inactive',
          stripe_subscription_id: null,
          current_period_end:     null,
          cancel_at_period_end:   false,
          canceled_at:            new Date().toISOString(),
          updated_at:             new Date().toISOString(),
        })
        .eq('stripe_subscription_id', stripeSub.id)
      break
    }

    // ── Troca de plano / upgrade / downgrade / cancelamento agendado ──────────
    case 'customer.subscription.updated': {
      const stripeSub = event.data.object as Stripe.Subscription
      const subId     = stripeSub.id
      const priceId   = stripeSub.items.data[0]?.price?.id ?? ''
      // FIX #3 aqui também: se price desconhecido, mantém plano atual (não sobrescreve)
      const plan      = PRICE_TO_PLAN[priceId]
      const periodEnd = new Date((stripeSub.current_period_end ?? 0) * 1000).toISOString()
      const status    = stripeSub.status === 'active'   ? 'active'
                      : stripeSub.status === 'trialing' ? 'trialing'
                      : stripeSub.status === 'past_due' ? 'past_due'
                      : 'inactive'

      const updateData: Record<string, unknown> = {
        status,
        current_period_end:   periodEnd,
        // FIX #7 (B3): salva se o cancelamento foi agendado para o fim do período
        cancel_at_period_end: stripeSub.cancel_at_period_end ?? false,
        updated_at:           new Date().toISOString(),
      }
      if (plan) updateData.plan = plan

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('subscriptions')
        .update(updateData)
        .eq('stripe_subscription_id', subId)
      break
    }
  }

  return new Response('ok', { status: 200 })
})
