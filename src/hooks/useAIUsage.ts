// ── Hook: uso das cotas de IA da agência no mês atual ─────────────────────────
// Lê ai_usage (o incremento é feito pelo banco via ai_consume, migration 093).
// Cada recurso de IA tem a sua cota; os limites vêm do plano em vigor.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useSubscription } from '@/hooks/useSubscription'
import { getPlan } from '@/config/plans'

export interface AIQuotaUsage {
  key:     'ai_messages' | 'ai_reports' | 'ai_assistant'
  label:   string
  used:    number
  limit:   number
  percent: number
}

// O mês das cotas é o de Brasília (o mesmo do banco)
const monthBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)

export function useAIUsage(agencyId: string | undefined) {
  const { data: subData } = useSubscription()
  const plan  = getPlan(subData?.subscription.plan)
  const month = monthBR()

  const query = useQuery({
    queryKey: ['ai_usage', agencyId, month],
    enabled: !!agencyId,
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_usage')
        .select('ai_messages, ai_reports, ai_assistant')
        .eq('user_id', agencyId!)
        .eq('month', month)
        .maybeSingle()
      if (error) throw error
      return (data ?? {}) as Partial<Record<AIQuotaUsage['key'], number>>
    },
  })

  const row = query.data ?? {}
  const make = (key: AIQuotaUsage['key'], label: string, limit: number): AIQuotaUsage => {
    const used = row[key] ?? 0
    return { key, label, used, limit, percent: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0 }
  }

  // Só as cotas que o plano inclui
  const quotas = [
    make('ai_messages',  'Mensagens com IA',           plan.aiMessages),
    make('ai_reports',   'Análises de relatório',      plan.aiReports),
    make('ai_assistant', 'Assistente do CRM',          plan.aiAssistant),
  ].filter(q => q.limit > 0)

  return { ...query, quotas }
}
