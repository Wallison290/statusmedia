// ── Acesso ao portal do cliente: situação, linha do tempo e convite ──────────
// Banco: migration 095 (client_portal_status / client_portal_status_all /
// client_portal_events). Convite: Edge Function invite-client.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export type PortalState = 'sem_email' | 'nao_convidado' | 'aguardando_senha' | 'ativo' | 'conta_externa'

export interface PortalStatus {
  client_id:        string
  state:            PortalState
  email?:           string
  email_differs?:   boolean
  invited_at?:      string | null
  password_set_at?: string | null
  last_sign_in_at?: string | null
}

export interface PortalEvent {
  id:         number
  kind:       'convite_enviado' | 'convite_reenviado' | 'convite_falhou' | 'senha_criada' | 'primeiro_acesso'
  email:      string | null
  detail:     string | null
  actor_name: string | null
  at:         string
}

export const PORTAL_STATE: Record<PortalState, { label: string; color: string; hint: string }> = {
  sem_email:        { label: 'Sem e-mail',           color: '#94A3B8', hint: 'Cadastre o e-mail do cliente para enviar o convite.' },
  nao_convidado:    { label: 'Convite não enviado',  color: '#F59E0B', hint: 'O cliente ainda não recebeu o convite do portal.' },
  aguardando_senha: { label: 'Aguardando senha',     color: '#3B82F6', hint: 'Convite enviado. Falta o cliente abrir o e-mail e criar a senha.' },
  ativo:            { label: 'Acesso ativo',         color: '#22C55E', hint: 'O cliente criou a senha e já pode entrar no portal.' },
  conta_externa:    { label: 'E-mail em uso',        color: '#EF4444', hint: 'Esse e-mail já é login de outra conta. Cadastre outro e-mail para o cliente.' },
}

export const PORTAL_EVENT_LABEL: Record<PortalEvent['kind'], string> = {
  convite_enviado:   'Convite enviado',
  convite_reenviado: 'Convite reenviado',
  convite_falhou:    'Convite não enviado',
  senha_criada:      'Senha criada pelo cliente',
  primeiro_acesso:   'Primeiro acesso ao portal',
}

export function usePortalStatus(clientId: string | undefined) {
  return useQuery({
    queryKey: ['portal-status', clientId],
    enabled: !!clientId,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('client_portal_status', { p_client: clientId })
      if (error) throw error
      return data as PortalStatus | null
    },
  })
}

/** Situação de todos os clientes da agência, por id (lista de clientes). */
export function usePortalStatusAll() {
  return useQuery({
    queryKey: ['portal-status-all'],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('client_portal_status_all')
      if (error) throw error
      const map: Record<string, PortalStatus> = {}
      for (const s of (data ?? []) as PortalStatus[]) if (s) map[s.client_id] = s
      return map
    },
  })
}

export function usePortalEvents(clientId: string | undefined) {
  return useQuery({
    queryKey: ['portal-events', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('client_portal_events')
        .select('id, kind, email, detail, actor_name, at').eq('client_id', clientId).order('at', { ascending: false }).limit(30)
      if (error) throw error
      return (data ?? []) as PortalEvent[]
    },
  })
}

/** Envia (ou reenvia) o convite. Devolve a mensagem para mostrar ao usuário. */
export async function sendPortalInvite(clientId: string, resend = false): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('invite-client', { body: { clientId, resend } })
  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await (error as any).context?.json?.().catch(() => null)
    return { ok: false, message: body?.error ?? 'O convite não foi enviado.' }
  }
  if (data?.error) return { ok: false, message: data.error }
  if (data?.message) return { ok: true, message: data.message }
  return { ok: true, message: data?.resent ? 'Convite reenviado.' : 'Convite enviado para o e-mail do cliente.' }
}

export function useSendPortalInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clientId, resend }: { clientId: string; resend?: boolean }) => sendPortalInvite(clientId, resend),
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['portal-status', v.clientId] })
      qc.invalidateQueries({ queryKey: ['portal-events', v.clientId] })
      qc.invalidateQueries({ queryKey: ['portal-status-all'] })
    },
  })
}
