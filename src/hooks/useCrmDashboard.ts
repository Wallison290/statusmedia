// ── Dashboard: andamento do CRM no período ──────────────────────────────────
// Os cards de "01 · O período" alternam entre conteúdo e CRM. Aqui saem os
// números do CRM para o mesmo intervalo escolhido no seletor de período.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'

export interface CrmPeriodStats {
  newLeads:       number   // entraram no funil
  contacted:      number   // leads que receberam mensagem enviada pelo CRM
  followups:      number   // follow-ups automáticos enviados
  replied:        number   // leads que responderam no WhatsApp
  won:            number   // negócios fechados (etapa de ganho)
  wonValue:       number   // bruto
  wonNet:         number   // bruto menos custos/taxas
}

export function useCrmPeriodStats(start: Date, end: Date) {
  const { user, agencyId } = useAuth()
  const from = start.toISOString()
  const to   = end.toISOString()

  return useQuery<CrmPeriodStats>({
    queryKey: ['crm_period_stats', agencyId, from, to],
    enabled:  !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const sb = supabase as any
      const uid = agencyId!
      const [leads, sent, followups, replies, wonCols] = await Promise.all([
        sb.from('crm_leads').select('id', { count: 'exact', head: true })
          .eq('user_id', uid).gte('created_at', from).lte('created_at', to),
        sb.from('crm_messages').select('lead_id')
          .eq('user_id', uid).eq('direction', 'out').eq('source', 'sistema').gte('sent_at', from).lte('sent_at', to),
        sb.from('crm_messages').select('id', { count: 'exact', head: true })
          .eq('user_id', uid).eq('source', 'followup').gte('sent_at', from).lte('sent_at', to),
        sb.from('crm_messages').select('lead_id')
          .eq('user_id', uid).eq('direction', 'in').gte('sent_at', from).lte('sent_at', to),
        sb.from('crm_columns').select('id').eq('user_id', uid).eq('stage_type', 'ganho'),
      ])

      const wonIds = (wonCols.data ?? []).map((c: any) => c.id)
      const won = wonIds.length
        ? await sb.from('crm_leads').select('estimated_value, estimated_cost')
            .eq('user_id', uid).in('column_id', wonIds).gte('closed_at', from).lte('closed_at', to)
        : { data: [] }

      const distinct = (rows: any[] | null) => new Set((rows ?? []).map(r => r.lead_id)).size
      return {
        newLeads:  leads.count ?? 0,
        contacted: distinct(sent.data),
        followups: followups.count ?? 0,
        replied:   distinct(replies.data),
        won:       (won.data ?? []).length,
        wonValue:  (won.data ?? []).reduce((s: number, l: any) => s + Number(l.estimated_value ?? 0), 0),
        wonNet:    (won.data ?? []).reduce((s: number, l: any) => s + Number(l.estimated_value ?? 0) - Number(l.estimated_cost ?? 0), 0),
      }
    },
  })
}
