// ── Hook: assinatura do usuário atual ─────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { getPlan, type Plan, type PlanId } from '@/config/plans'
// PlanId agora é 'starter' | 'pro' | 'agency'
import { useAuth } from '@/hooks/useAuth'
import { localCacheOptions, writeLocalCache } from '@/lib/localQueryCache'

export interface Subscription {
  plan: PlanId
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  trial_ends_at: string | null
  canceled_at: string | null
  cancel_at_period_end: boolean
  paid_until: string | null
  billing_exempt: boolean
}

/** Situação calculada no banco (subscription_access_info, migration 113). */
export type AccessState = 'cortesia' | 'teste' | 'em_dia' | 'vence_em_breve' | 'carencia' | 'bloqueado' | 'inativo'

export interface BillingAccess {
  state: AccessState
  paidUntil: string | null
  graceUntil: string | null
  /** Dias até o vencimento (vence_em_breve) */
  daysToDue: number | null
  /** Dias de carência que restam (carencia) */
  graceDaysLeft: number | null
  reminderDays: number
  graceDays: number
}

export interface SubscriptionData {
  subscription: Subscription
  plan: Plan
  isActive: boolean
  isTrialing: boolean
  trialDaysLeft: number | null
  isPro: boolean
  isAgency: boolean
  cancelAtPeriodEnd: boolean
  access: BillingAccess
}

const daysUntil = (iso: string | null) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : null

export function useSubscription() {
  const { user, agencyId } = useAuth()

  return useQuery<SubscriptionData | null>({
    queryKey: ['subscription', agencyId],
    enabled: !!user,
    staleTime: 60_000,
    // Abre com a última assinatura conhecida e confirma por trás
    ...localCacheOptions<SubscriptionData>(agencyId ? `subscription:${agencyId}` : null),
    queryFn: async () => {
      if (!user) return null

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('subscriptions')
        .select('plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, trial_ends_at, canceled_at, cancel_at_period_end, paid_until, billing_exempt')
        .eq('user_id', agencyId!)
        .maybeSingle()

      if (error) throw error

      // Se não existe ainda (usuário antigo antes da migration), assume inativo
      const sub: Subscription = data ?? {
        plan: 'starter',
        status: 'inactive',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        current_period_end: null,
        trial_ends_at: null,
        canceled_at: null,
        cancel_at_period_end: false,
        paid_until: null,
        billing_exempt: false,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: info } = await (supabase as any).rpc('subscription_access_info', { p_agency: agencyId })

      const planId = sub.plan as PlanId
      const plan   = getPlan(planId)

      // Trial ativo: status='trialing' E ainda dentro do prazo
      const isTrialing = sub.status === 'trialing'
        && !!sub.trial_ends_at
        && new Date(sub.trial_ends_at) > new Date()

      // Com a regra do banco: vencimento + carência. Sem resposta, cai na regra antiga.
      const isActive = info ? info.has_access === true : (sub.status === 'active' || isTrialing)
      const access: BillingAccess = {
        state:         (info?.state ?? (isActive ? 'em_dia' : 'inativo')) as AccessState,
        paidUntil:     info?.paid_until ?? sub.paid_until,
        graceUntil:    info?.grace_until ?? null,
        daysToDue:     info?.state === 'vence_em_breve' ? daysUntil(info.paid_until) : null,
        graceDaysLeft: info?.state === 'carencia' ? daysUntil(info.grace_until) : null,
        reminderDays:  info?.reminder_days ?? 5,
        graceDays:     info?.grace_days ?? 5,
      }

      // Dias restantes do trial
      const trialDaysLeft = isTrialing && sub.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86_400_000))
        : null

      const result: SubscriptionData = {
        subscription: sub,
        plan,
        isActive,
        isTrialing,
        trialDaysLeft,
        isPro:             planId === 'pro',
        isAgency:          planId === 'agency',
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        access,
      }
      writeLocalCache(`subscription:${agencyId}`, result)
      return result
    },
  })
}
