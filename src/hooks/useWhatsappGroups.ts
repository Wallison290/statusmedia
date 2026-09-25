import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { WhatsappCategory, WhatsappPrefs } from '@/types'

export interface WhatsappGroup {
  id:         string
  user_id:    string
  group_jid:  string
  group_name: string
  categories: WhatsappPrefs
  is_active:  boolean
  created_at: string
  updated_at: string
}

export interface EvolutionGroup {
  jid:  string
  name: string
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useWhatsappGroups() {
  const { user } = useAuth()
  return useQuery<WhatsappGroup[]>({
    queryKey: ['whatsapp_groups', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('whatsapp_groups')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_active', true)
        .order('group_name', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

/** Resolve um link/código de convite de grupo WhatsApp via Evolution API. */
export function useResolveGroupInvite() {
  return useMutation<EvolutionGroup, Error, string>({
    mutationFn: async (inviteCode: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await supabase.functions.invoke('whatsapp-fetch-groups', {
        body: { invite_code: inviteCode },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
      const d = res.data as any
      if (!d?.ok) throw new Error(d?.error ?? res.error?.message ?? 'Erro desconhecido')
      return d.group as EvolutionGroup
    },
  })
}

/** Lista todos os grupos que o bot (UazAPI) participa. */
export function useFetchGroupsList() {
  return useMutation<EvolutionGroup[], Error>({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await supabase.functions.invoke('whatsapp-fetch-groups', {
        body: { list: true },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
      const d = res.data as any
      console.log('[whatsapp-fetch-groups] list response:', JSON.stringify(d))
      if (!d?.ok) throw new Error(d?.error ?? res.error?.message ?? 'Erro desconhecido')
      return d.groups as EvolutionGroup[]
    },
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useAddWhatsappGroup() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { group_jid: string; group_name: string; categories: WhatsappPrefs }) => {
      // Upsert: se o grupo já existe para este user, atualiza nome/categorias
      const { error } = await (supabase as any)
        .from('whatsapp_groups')
        .upsert(
          { ...payload, user_id: user!.id, is_active: true, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,group_jid' },
        )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp_groups'] }),
  })
}

export function useUpdateWhatsappGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, categories }: { id: string; categories: WhatsappPrefs }) => {
      const { error } = await (supabase as any)
        .from('whatsapp_groups')
        .update({ categories, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp_groups'] }),
  })
}

export function useDeleteWhatsappGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('whatsapp_groups')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp_groups'] }),
  })
}

export const WHATSAPP_CATEGORIES: { key: WhatsappCategory; label: string; hint: string }[] = [
  { key: 'aprovacoes',   label: 'Aprovações',       hint: 'Cliente aprovou, reprovou ou comentou' },
  { key: 'tarefas',      label: 'Tarefas e equipe',  hint: 'Colaborador concluiu ou atualizou tarefa' },
  { key: 'instagram',    label: 'Instagram',         hint: 'Post publicado ou com falha' },
  { key: 'solicitacoes', label: 'Solicitações',      hint: 'Ideia, solicitação ou formulário do cliente' },
  { key: 'crm',          label: 'CRM',               hint: 'Retornos do dia, lead novo, proposta aceita e contrato assinado' },
]
