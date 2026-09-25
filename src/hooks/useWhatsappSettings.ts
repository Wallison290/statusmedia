import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { WhatsappCategory, WhatsappPrefs } from '@/types'

export const WHATSAPP_CATEGORIES: { key: WhatsappCategory; label: string; hint: string }[] = [
  { key: 'aprovacoes',   label: 'Aprovações',      hint: 'Cliente aprovou, reprovou ou comentou' },
  { key: 'tarefas',      label: 'Tarefas e equipe', hint: 'Colaborador concluiu ou atualizou tarefa' },
  { key: 'instagram',    label: 'Instagram',        hint: 'Post agendado publicado ou com falha' },
  { key: 'solicitacoes', label: 'Solicitações',     hint: 'Ideia/solicitação ou formulário do cliente' },
  { key: 'crm',          label: 'CRM',              hint: 'Retornos do dia, lead novo, proposta aceita e contrato assinado' },
]

export const DEFAULT_PREFS: WhatsappPrefs = {
  aprovacoes: true, tarefas: true, instagram: true, solicitacoes: true, crm: true,
}

/**
 * Gerencia o estado do WhatsApp da agência: enviar/confirmar código de
 * verificação (via edge functions) e salvar opt-in + preferências (em profiles).
 */
export function useWhatsappSettings() {
  const { user, profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)

  async function invokeVerify(body: object) {
    const { data, error } = await supabase.functions.invoke('whatsapp-verify', { body })
    if (error) {
      let msg = error.message
      try {
        const ctx = await (error as any).context?.json?.()
        msg = ctx?.error || ctx?.message || msg
      } catch {}
      try {
        if ((data as any)?.error) msg = (data as any).error
      } catch {}
      throw new Error(msg)
    }
    if ((data as any)?.error) throw new Error((data as any).error)
    return data
  }

  async function sendCode(phone: string) {
    setBusy(true)
    try {
      await invokeVerify({ action: 'send', phone })
      return true
    } finally {
      setBusy(false)
    }
  }

  async function confirmCode(code: string) {
    setBusy(true)
    try {
      await invokeVerify({ action: 'confirm', code })
      await refreshProfile?.()
      return true
    } finally {
      setBusy(false)
    }
  }

  /** Liga/desliga o recebimento geral. */
  async function setOptIn(value: boolean) {
    if (!user) return
    setBusy(true)
    try {
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ whatsapp_opt_in: value, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) throw error
      await refreshProfile?.()
    } finally {
      setBusy(false)
    }
  }

  /** Atualiza as preferências por categoria. */
  async function savePrefs(prefs: WhatsappPrefs) {
    if (!user) return
    setBusy(true)
    try {
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ whatsapp_prefs: prefs, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) throw error
      await refreshProfile?.()
    } finally {
      setBusy(false)
    }
  }

  return {
    busy,
    whatsapp:     profile?.whatsapp ?? '',
    optIn:        profile?.whatsapp_opt_in ?? false,
    verified:     profile?.whatsapp_verified ?? false,
    prefs:        (profile?.whatsapp_prefs ?? DEFAULT_PREFS) as WhatsappPrefs,
    sendCode, confirmCode, setOptIn, savePrefs,
  }
}
