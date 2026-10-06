// ── Hook: follow-up automático do CRM ────────────────────────────────────────
// Briefings do que a agência vende (`crm_offers`) e a conversa de WhatsApp de
// cada lead (`crm_messages`, só leitura: quem grava é o servidor).
// A regra do follow-up mora na função crm-followup (migration 080).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { CrmMessage, CrmOffer } from '@/types'

export const FOLLOWUP_STEPS = [1, 3, 7, 14] as const

/** O que cada degrau entrega, igual ao que a função pede para a IA. */
export const FOLLOWUP_STEP_GOAL: Record<number, string> = {
  1:  'Retoma o objetivo do lead com as palavras dele',
  3:  'Um caso de cliente parecido que teve resultado',
  7:  'Uma dica útil que ele aplica mesmo sem comprar',
  14: 'Encerramento leve, com a porta aberta',
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Mesmo reconhecimento pelo nome da função crm-followup
const STEP_NAME: Record<number, RegExp> = {
  1:  /(^|\D)(24\s*h|24\s*horas|0?1\s*dia)(\D|$)/,
  3:  /(^|\D)0?3\s*dias?(\D|$)/,
  7:  /(^|\D)0?7\s*dias?(\D|$)/,
  14: /(^|\D)14\s*dias?(\D|$)/,
}

/** Etapa que o degrau usa quando a agência não escolheu nenhuma. */
export function autoFollowupColumn<T extends { id: string; name: string; stage_type: string }>(step: number, columns: T[]) {
  return columns.find(c => c.stage_type === 'normal' && STEP_NAME[step].test(plain(c.name))) ?? null
}

export function useCrmOffers() {
  const { user, agencyId } = useAuth()
  return useQuery<CrmOffer[]>({
    queryKey: ['crm_offers', agencyId],
    enabled:  !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_offers').select('*').eq('user_id', agencyId!).order('created_at')
      if (error) throw error
      return data ?? []
    },
  })
}

export type CrmOfferInput = Partial<Omit<CrmOffer, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & { name: string }

export function useSaveCrmOffer() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, ...offer }: CrmOfferInput & { id?: string }) => {
      const row = { ...offer, updated_at: new Date().toISOString() }
      // Só um briefing padrão por agência
      if (offer.is_default) {
        await (supabase as any).from('crm_offers').update({ is_default: false }).eq('user_id', agencyId!).neq('id', id ?? '')
      }
      const q = id
        ? (supabase as any).from('crm_offers').update(row).eq('id', id)
        : (supabase as any).from('crm_offers').insert({ ...row, user_id: agencyId! })
      const { data, error } = await q.select().single()
      if (error) throw error
      return data as CrmOffer
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm_offers'] }),
  })
}

export function useDeleteCrmOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('crm_offers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm_offers'] }),
  })
}

/** Follow-ups e respostas desde `since`, para as métricas dos relatórios. */
export function useFollowupMessages(since: string) {
  const { user, agencyId } = useAuth()
  return useQuery<Pick<CrmMessage, 'lead_id' | 'direction' | 'source' | 'followup_step' | 'sent_at'>[]>({
    queryKey: ['crm_followup_messages', agencyId, since],
    enabled:  !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_messages')
        .select('lead_id, direction, source, followup_step, sent_at')
        .eq('user_id', agencyId!)
        .or('source.eq.followup,direction.eq.in')
        .gte('sent_at', since)
        .order('sent_at')
        .limit(5000)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCrmMessages(leadId: string | undefined) {
  return useQuery<CrmMessage[]>({
    queryKey: ['crm_messages', leadId],
    enabled:  !!leadId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_messages')
        .select('id, lead_id, direction, text, source, followup_step, sent_at')
        .eq('lead_id', leadId)
        .order('sent_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).reverse()
    },
    // A resposta do lead chega pelo webhook: confere de tempos em tempos
    refetchInterval: 20_000,
  })
}
