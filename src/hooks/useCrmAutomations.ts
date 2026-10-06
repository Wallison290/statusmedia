// ── Hook: CRM — automações ───────────────────────────────────────────────────
// Quem executa é o banco (crm_run_automations, migration 075). A tela só monta
// a regra e mostra quantas vezes rodou e o último erro.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { CrmAutomation } from '@/types'

export function useCrmAutomations() {
  const { user, agencyId } = useAuth()

  return useQuery<CrmAutomation[]>({
    queryKey: ['crm_automations', agencyId],
    enabled:  !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_automations')
        .select('*')
        .eq('user_id', agencyId!)
        .order('created_at')
      if (error) throw error
      return data ?? []
    },
  })
}

export type CrmAutomationInput = Pick<CrmAutomation,
  'name' | 'is_active' | 'trigger_type' | 'trigger_column_id' | 'trigger_days' | 'action_type' | 'action_params'>

export function useSaveCrmAutomation() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()

  return useMutation({
    mutationFn: async ({ id, ...a }: Partial<CrmAutomationInput> & { id?: string }) => {
      const q = id
        ? (supabase as any).from('crm_automations').update(a).eq('id', id)
        : (supabase as any).from('crm_automations').insert({ ...a, user_id: agencyId! })
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm_automations'] }),
  })
}

export function useDeleteCrmAutomation() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('crm_automations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm_automations'] }),
  })
}
