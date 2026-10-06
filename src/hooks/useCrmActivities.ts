// ── Hook: CRM — histórico, arquivo e tarefas do lead ─────────────────────────
// O histórico é escrito em grande parte pelo próprio banco (mudança de etapa,
// proposta aceita, tarefa concluída...). Daqui só saem os registros manuais:
// nota, ligação, WhatsApp, reunião e e-mail.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { CrmActivity, CrmManualActivityKind, Task } from '@/types'

export function useCrmActivities(leadId: string | null | undefined) {
  return useQuery<CrmActivity[]>({
    queryKey: ['crm_activities', leadId],
    enabled:  !!leadId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_lead_activities')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Movimentações de etapa de todos os leads desde uma data. É o que o relatório
 * usa para calcular quanto tempo, em média, um lead fica em cada etapa.
 */
export function useCrmStageMoves(sinceISO: string) {
  const { user, agencyId } = useAuth()

  return useQuery<CrmActivity[]>({
    queryKey: ['crm_stage_moves', agencyId, sinceISO],
    enabled:  !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_lead_activities')
        .select('*')
        .eq('user_id', agencyId!)
        .in('kind', ['etapa', 'ganho', 'perdido', 'reaberto'])
        .gte('created_at', sinceISO)
        .order('created_at')
        .limit(5000)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useAddCrmActivity() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()

  return useMutation({
    mutationFn: async (a: { lead_id: string; kind: CrmManualActivityKind; content: string; meta?: Record<string, any> }) => {
      const { error } = await (supabase as any)
        .from('crm_lead_activities')
        .insert({ ...a, meta: a.meta ?? {}, user_id: agencyId! })
      if (error) throw error
    },
    onSuccess: (_d, a) => qc.invalidateQueries({ queryKey: ['crm_activities', a.lead_id] }),
  })
}

export function useDeleteCrmActivity() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string; lead_id: string }) => {
      const { error } = await (supabase as any).from('crm_lead_activities').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, a) => qc.invalidateQueries({ queryKey: ['crm_activities', a.lead_id] }),
  })
}

/** Arquiva (some do board, continua no relatório) ou restaura um lead. */
export function useArchiveCrmLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await (supabase as any)
        .from('crm_leads')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['crm_leads'] })
      qc.invalidateQueries({ queryKey: ['crm_activities', id] })
    },
  })
}

/**
 * Cria a tarefa já ligada ao lead. Ela aparece normalmente em Tarefas (e no
 * portal do colaborador, se tiver responsável); o banco registra no histórico.
 */
export function useCreateLeadTask() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()

  return useMutation({
    mutationFn: async (t: {
      lead_id: string; title: string; due_date: string | null
      assignee_id: string | null; assignee: string | null; priority?: Task['priority']
    }) => {
      const { error } = await (supabase as any).from('tasks').insert({
        user_id:     agencyId!,
        crm_lead_id: t.lead_id,
        title:       t.title,
        due_date:    t.due_date,
        assignee_id: t.assignee_id,
        assignee:    t.assignee,
        priority:    t.priority ?? 'media',
        status:      'a_fazer',
      })
      if (error) throw error
    },
    onSuccess: (_d, t) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['team_tasks'] })
      qc.invalidateQueries({ queryKey: ['crm_activities', t.lead_id] })
    },
  })
}

export function useCrmLeadTasks(leadId: string | null | undefined) {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'crm_lead', leadId],
    enabled:  !!leadId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('tasks')
        .select('*')
        .eq('crm_lead_id', leadId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}
