// ── Hook: uso de armazenamento do usuário ──────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useSubscription } from '@/hooks/useSubscription'
import { PLAN_STORAGE_GB, type PlanId } from '@/config/plans'
import { useAuth } from '@/hooks/useAuth'

export interface StorageUsageData {
  usedBytes: number
  usedGB: number
  limitGB: number
  percent: number
  /** true se ultrapassou 90% do limite */
  nearLimit: boolean
  /** true se está no limite */
  overLimit: boolean
}

export function useStorageUsage() {
  const { user, agencyId } = useAuth()
  const { data: subData } = useSubscription()

  const planId  = (subData?.subscription.plan ?? 'starter') as PlanId
  const limitGB = PLAN_STORAGE_GB[planId] ?? 10

  const query = useQuery<{ usedBytes: number; usedGB: number } | null>({
    queryKey: ['storage_usage', agencyId],
    enabled: !!user,
    staleTime: 60_000, // 1 minuto
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-storage-usage', {})
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Erro ao buscar uso de armazenamento')
      return { usedBytes: data.usedBytes ?? 0, usedGB: data.usedGB ?? 0 }
    },
  })

  const raw = query.data
  const usedGB   = raw?.usedGB  ?? 0
  const usedBytes = raw?.usedBytes ?? 0
  const percent  = Math.min(100, Math.round((usedGB / limitGB) * 100))

  const data: StorageUsageData | null = raw !== undefined && raw !== null
    ? {
        usedBytes,
        usedGB,
        limitGB,
        percent,
        nearLimit: percent >= 90,
        overLimit: usedGB >= limitGB,
      }
    : null

  return { ...query, data }
}
