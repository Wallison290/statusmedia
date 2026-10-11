import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { FollowupStyle } from '../../supabase/functions/_shared/followup-style'

export interface FollowupComposeResult {
  messages?: Record<string, string>
  message?: string
  warning?: string | null
}

export function useCrmFollowupPreviewLeads(enabled: boolean) {
  const { user, agencyId } = useAuth()
  return useQuery<{ id: string; name: string; followup_offer_id: string | null }[]>({
    queryKey: ['crm_followup_preview_leads', agencyId],
    enabled: enabled && !!user && !!agencyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('crm_leads')
        .select('id, name, followup_offer_id').eq('user_id', agencyId!).is('archived_at', null).order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCrmFollowupCompose() {
  const { agencyId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      action: 'suggest' | 'preview'; offerId: string; style: FollowupStyle; leadId?: string; step?: number;
    }) => {
      const { data, error } = await supabase.functions.invoke('crm-followup-compose', { body: { ...input, agencyId } })
      if (error) {
        let message = 'Não foi possível gerar a mensagem.'
        if (error.context instanceof Response) {
          const result = await error.context.json().catch(() => null)
          if (result?.error) message = result.error
        }
        throw new Error(message)
      }
      if (data?.error) throw new Error(data.error)
      return data as FollowupComposeResult
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['ai_usage'] }),
  })
}
