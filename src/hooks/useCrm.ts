// ── Hook: CRM (colunas do funil + leads) ─────────────────────────────────────
// Duas queries independentes — colunas mudam raramente, leads mudam o tempo
// todo. Mover um card não deve refazer a query das colunas.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { CrmColumn, CrmLead, CrmStageType } from '@/types'
import type { CrmTemplate } from '@/data/crmTemplates'

// ── Leitura ───────────────────────────────────────────────────────────────────

export function useCrmColumns() {
  const { user } = useAuth()

  return useQuery<CrmColumn[]>({
    queryKey: ['crm_columns', user?.id],
    enabled:  !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_columns')
        .select('*')
        .eq('user_id', user!.id)
        .order('position')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCrmLeads() {
  const { user } = useAuth()

  return useQuery<CrmLead[]>({
    queryKey: ['crm_leads', user?.id],
    enabled:  !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_leads')
        .select('*')
        .eq('user_id', user!.id)
        .order('position')
      if (error) throw error
      return data ?? []
    },
  })
}

// ── Colunas ───────────────────────────────────────────────────────────────────

/**
 * Cria as colunas de um modelo pronto de funil, na ordem em que ele as define.
 * `offset` é quantas colunas já existem — sem ele, aplicar um modelo num board
 * que já tem etapas geraria posições repetidas e ordem embaralhada.
 */
export function useApplyCrmTemplate() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ template, offset = 0 }: { template: CrmTemplate; offset?: number }) => {
      const rows = template.columns.map((c, i) => ({
        user_id:    user!.id,
        name:       c.name,
        color:      c.color,
        stage_type: c.stage_type,
        position:   offset + i,
      }))
      const { data, error } = await (supabase as any).from('crm_columns').insert(rows).select()
      if (error) throw error
      return data as CrmColumn[]
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm_columns'] })
    },
  })
}

export function useCreateCrmColumn() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (col: { name: string; color: string; stage_type?: CrmStageType; position: number }) => {
      const { data, error } = await (supabase as any)
        .from('crm_columns')
        .insert({ ...col, stage_type: col.stage_type ?? 'normal', user_id: user!.id })
        .select()
        .single()
      if (error) throw error
      return data as CrmColumn
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm_columns'] }),
  })
}

export function useUpdateCrmColumn() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CrmColumn> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('crm_columns')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as CrmColumn
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm_columns'] }),
  })
}

/**
 * Exclui a coluna. Se `moveLeadsTo` vier preenchido, os cards são transferidos
 * antes — sem isso o ON DELETE CASCADE do banco levaria os leads junto.
 */
export function useDeleteCrmColumn() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, moveLeadsTo }: { id: string; moveLeadsTo?: string | null }) => {
      if (moveLeadsTo) {
        const { error: moveErr } = await (supabase as any)
          .from('crm_leads')
          .update({ column_id: moveLeadsTo })
          .eq('column_id', id)
        if (moveErr) throw moveErr
      }
      const { error } = await (supabase as any).from('crm_columns').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm_columns'] })
      qc.invalidateQueries({ queryKey: ['crm_leads'] })
    },
  })
}

/** Grava a nova ordem das colunas depois de um arrasto. */
export function useReorderCrmColumns() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (ordered: CrmColumn[]) => {
      await Promise.all(
        ordered.map((c, i) =>
          (supabase as any).from('crm_columns').update({ position: i }).eq('id', c.id),
        ),
      )
    },
    onMutate: async (ordered) => {
      const key = ['crm_columns', user?.id]
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<CrmColumn[]>(key)
      qc.setQueryData<CrmColumn[]>(key, ordered.map((c, i) => ({ ...c, position: i })))
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['crm_columns'] }),
  })
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export type CrmLeadInput = Partial<Omit<CrmLead, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & {
  name:      string
  column_id: string
}

export function useCreateCrmLead() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (lead: CrmLeadInput) => {
      const { data, error } = await (supabase as any)
        .from('crm_leads')
        .insert({ ...lead, user_id: user!.id })
        .select()
        .single()
      if (error) throw error
      return data as CrmLead
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm_leads'] }),
  })
}

export function useUpdateCrmLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CrmLead> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('crm_leads')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as CrmLead
    },
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: ['crm_leads'] })
      qc.invalidateQueries({ queryKey: ['crm_activities', lead.id] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useDeleteCrmLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('crm_leads').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm_leads'] }),
  })
}

/**
 * Move um card de coluna e/ou de posição.
 *
 * A atualização é otimista de propósito: sem isso o card volta para o lugar
 * antigo por uma fração de segundo enquanto a query refaz, e o arrasto parece
 * ter falhado. `leadIds` é a coluna de destino inteira, já na ordem final.
 */
export function useMoveCrmLead() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ leadId, toColumnId, leadIds, lostReason }: {
      leadId: string; toColumnId: string; leadIds: string[]
      /** Só quando o destino é etapa de perda. Vai no mesmo UPDATE que move o
       *  card para o histórico já registrar "Perdido: <motivo>". */
      lostReason?: string | null
    }) => {
      const { error } = await (supabase as any)
        .from('crm_leads')
        .update(lostReason !== undefined ? { column_id: toColumnId, lost_reason: lostReason } : { column_id: toColumnId })
        .eq('id', leadId)
      if (error) throw error

      await Promise.all(
        leadIds.map((id, i) =>
          (supabase as any).from('crm_leads').update({ position: i }).eq('id', id),
        ),
      )
    },
    onMutate: async ({ leadId, toColumnId, leadIds }) => {
      const key = ['crm_leads', user?.id]
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<CrmLead[]>(key)

      qc.setQueryData<CrmLead[]>(key, old =>
        (old ?? []).map(l => {
          const idx = leadIds.indexOf(l.id)
          if (l.id === leadId) return { ...l, column_id: toColumnId, position: idx >= 0 ? idx : l.position }
          if (idx >= 0)        return { ...l, position: idx }
          return l
        }),
      )
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous)
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['crm_leads'] })
      // Mover dispara automações no banco (tarefa criada, temperatura...)
      qc.invalidateQueries({ queryKey: ['crm_activities', vars.leadId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
