// ── Hook: assinatura do usuário atual ─────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { getPlan, PLAN_AI_LIMITS, type Plan, type PlanId } from '@/config/plans'
// PlanId agora é 'starter' | 'pro' | 'agency'
import { useAuth } from '@/hooks/useAuth'

export interface Subscription {
  plan: PlanId
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  trial_ends_at: string | null
  canceled_at: string | null
  cancel_at_period_end: boolean
}

export interface SubscriptionData {
  subscription: Subscription
  plan: Plan
  isActive: boolean
  isTrialing: boolean
  trialDaysLeft: number | null
  isPro: boolean
  isAgency: boolean
  aiLimit: number
  cancelAtPeriodEnd: boolean
}

export function useSubscription() {
  const { user, agencyId } = useAuth()

  return useQuery<SubscriptionData | null>({
    queryKey: ['subscription', agencyId],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      if (!user) return null

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('subscriptions')
        .select('plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, trial_ends_at, canceled_at, cancel_at_period_end')
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
      }

      const planId = sub.plan as PlanId
      const plan   = getPlan(planId)

      // Trial ativo: status='trialing' E ainda dentro do prazo
      const isTrialing = sub.status === 'trialing'
        && !!sub.trial_ends_at
        && new Date(sub.trial_ends_at) > new Date()

      const isActive = sub.status === 'active' || isTrialing

      // Dias restantes do trial
      const trialDaysLeft = isTrialing && sub.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86_400_000))
        : null

      return {
        subscription: sub,
        plan,
        isActive,
        isTrialing,
        trialDaysLeft,
        isPro:             planId === 'pro',
        isAgency:          planId === 'agency',
        aiLimit:           PLAN_AI_LIMITS[planId] ?? 50,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      }
    },
  })
}
