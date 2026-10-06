// ── Hook: WhatsApp próprio da agência ────────────────────────────────────────
// Conectar por QR code, acompanhar a conexão e enviar mensagem para um lead
// pelo número da agência. Tudo passa pela edge function agency-whatsapp: o
// token da instância nunca chega ao navegador.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'

export interface AgencyWhatsappState {
  ok:            boolean
  status:        'disconnected' | 'connecting' | 'connected'
  hasInstance?:  boolean
  /** Dá para conectar? Falso esconde o recurso da tela. */
  available?:    boolean
  qrcode?:       string | null
  paircode?:     string | null
  phone?:        string | null
  profile_name?: string | null
  error?:        string
}

async function call<T = AgencyWhatsappState>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('agency-whatsapp', { body })
  if (error) {
    // A função devolve { ok:false, error } com status de erro: pega a mensagem dela
    const ctx = await (error as any).context?.json?.().catch(() => null)
    throw new Error(ctx?.error ?? error.message)
  }
  if (data && data.ok === false) throw new Error(data.error ?? 'Falha no WhatsApp')
  return data as T
}

export function useAgencyWhatsapp(opts: { poll?: boolean } = {}) {
  const { user, agencyId } = useAuth()
  return useQuery<AgencyWhatsappState>({
    queryKey: ['agency_whatsapp', agencyId],
    enabled:  !!user,
    queryFn:  () => call({ action: 'status' }),
    // Enquanto espera a leitura do QR, confere a cada 3s (o QR também se renova)
    refetchInterval: q => (opts.poll && q.state.data?.status === 'connecting' ? 3000 : false),
    staleTime: 60_000,
    retry: false,
  })
}

export function useConnectAgencyWhatsapp() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()
  return useMutation({
    mutationFn: () => call({ action: 'connect' }),
    onSuccess: (data) => qc.setQueryData(['agency_whatsapp', agencyId], { ...data, hasInstance: true, available: true }),
  })
}

export function useDisconnectAgencyWhatsapp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => call({ action: 'disconnect' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agency_whatsapp'] }),
  })
}

/** Envia pelo número da agência. O histórico do lead é gravado pela função. */
export function useSendAgencyWhatsapp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (m: { lead_id: string; text: string; label?: string }) =>
      call<{ ok: boolean }>({ action: 'send', ...m }),
    onSuccess: (_d, m) => {
      qc.invalidateQueries({ queryKey: ['crm_activities', m.lead_id] })
      qc.invalidateQueries({ queryKey: ['crm_messages', m.lead_id] })
    },
  })
}

/** Etiquetas do WhatsApp Business da agência (vazio se não for Business). */
export function useAgencyWhatsappLabels(enabled: boolean) {
  const { user, agencyId } = useAuth()
  return useQuery<{ id: string; name: string; color: string | null }[]>({
    queryKey: ['agency_whatsapp_labels', agencyId],
    enabled:  !!user && enabled,
    queryFn:  async () => (await call<{ labels: { id: string; name: string; color: string | null }[] }>({ action: 'labels' })).labels,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
