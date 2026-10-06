// ── Hook: CRM — configurações da agência ─────────────────────────────────────
// Metas, lembrete diário, formulário de captura, mensagens prontas e modelo de
// contrato. Uma linha por agência em `crm_settings`.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { CrmSettings } from '@/types'

/**
 * A linha nasce na primeira leitura. Assim a tela nunca lida com "ainda não
 * existe", e o link do formulário de captura já vem com o token pronto.
 */
export function useCrmSettings() {
  const { user, agencyId } = useAuth()

  return useQuery<CrmSettings>({
    queryKey: ['crm_settings', agencyId],
    enabled:  !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_settings')
        .select('*')
        .eq('user_id', agencyId!)
        .maybeSingle()
      if (error) throw error
      if (data) return data

      // upsert e não insert: duas abas abertas ao mesmo tempo não podem brigar
      const { data: created, error: insErr } = await (supabase as any)
        .from('crm_settings')
        .upsert({ user_id: agencyId! }, { onConflict: 'user_id' })
        .select()
        .single()
      if (insErr) throw insErr
      return created
    },
  })
}

export type CrmSettingsInput = Partial<Omit<CrmSettings, 'user_id' | 'capture_token' | 'created_at' | 'updated_at'>>

export function useUpdateCrmSettings() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()

  return useMutation({
    mutationFn: async (updates: CrmSettingsInput) => {
      const { data, error } = await (supabase as any)
        .from('crm_settings')
        .update(updates)
        .eq('user_id', agencyId!)
        .select()
        .single()
      if (error) throw error
      return data as CrmSettings
    },
    onSuccess: (data) => qc.setQueryData(['crm_settings', agencyId], data),
  })
}
