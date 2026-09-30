// ── WhatsApp do lead: escrever e enviar daqui mesmo ─────────────────────────
// A mensagem é escrita no campo da ficha (à mão, a partir de uma mensagem
// pronta ou sugerida pela IA) e enviada para o WhatsApp cadastrado no lead.
// WhatsApp da agência conectado: sai direto pelo número dela, sem abrir nada.
// Sem conexão: abre o WhatsApp da própria agência (wa.me) com o texto pronto.
// Nada sai pelo número da plataforma: ver o cabeçalho da migration 075.
// Todo envio fica registrado no histórico do lead.

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Sparkles, Loader2, Copy, ChevronDown, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { useCrmSettings } from '@/hooks/useCrmSettings'
import { useCrmActivities, useAddCrmActivity } from '@/hooks/useCrmActivities'
import { useAgencyWhatsapp, useSendAgencyWhatsapp } from '@/hooks/useAgencyWhatsapp'
import { streamChat } from '@/lib/aiProxy'
import { CRM_DEFAULT_MESSAGES } from '@/data/crmTemplates'
import { fillVars, waLink, copyText, fmtBRL } from '@/utils/crm'
import type { CrmColumn, CrmLead } from '@/types'

interface Props {
  lead:    CrmLead
  columns: CrmColumn[]
}

export function CrmWhatsappActions({ lead, columns }: Props) {
  const { toast } = useToast()
  const { profile } = useAuth()
  const { data: settings } = useCrmSettings()
  const { data: activities = [] } = useCrmActivities(lead.id)
  const addActivity = useAddCrmActivity()
  const { data: wa } = useAgencyWhatsapp()
  const sendDirect = useSendAgencyWhatsapp()
  const connected = wa?.status === 'connected'

  const [menuOpen, setMenuOpen] = useState(false)
  const [draft, setDraft]       = useState('')
  // De onde veio o texto do campo: vai junto no histórico ("Boas-vindas: ...")
  const [label, setLabel]       = useState('Mensagem')
  const [aiBusy, setAiBusy]     = useState(false)
  // Trava síncrona: o isPending só chega no próximo render, e um toque duplo
  // (ou Ctrl+Enter junto com o clique) disparava o envio duas vezes
  const sendingRef = useRef(false)

  // Outro lead aberto: o rascunho do anterior não pode ir para ele
  useEffect(() => { setDraft(''); setLabel('Mensagem') }, [lead.id])

  const agency    = profile?.agency_name || profile?.full_name || 'nossa agência'
  const templates = settings?.message_templates?.length ? settings.message_templates : CRM_DEFAULT_MESSAGES
  const firstName = lead.name.trim().split(/\s+/)[0] ?? ''

  function fill(text: string, from: string) {
    setDraft(text)
    setLabel(from)
    setMenuOpen(false)
  }

  function send() {
    const text = draft.trim()
    if (!lead.whatsapp || !text || sendingRef.current) return
    if (connected) {
      sendingRef.current = true
      sendDirect.mutate({ lead_id: lead.id, text, label }, {
        onSuccess: () => { toast(`Mensagem enviada para ${firstName}`, 'success'); setDraft(''); setLabel('Mensagem') },
        onError:   (e: any) => toast(e.message, 'error'),
        onSettled: () => { sendingRef.current = false },
      })
      return
    }
    window.open(waLink(lead.whatsapp, text), '_blank', 'noopener')
    addActivity.mutate({ lead_id: lead.id, kind: 'whatsapp', content: `${label}: "${text}"` })
    setDraft('')
    setLabel('Mensagem')
  }

  async function suggest() {
    setAiBusy(true)
    setDraft('')
    setLabel('Mensagem sugerida pela IA')
    const stage = columns.find(c => c.id === lead.column_id)?.name ?? 'sem etapa'
    const history = activities.slice(0, 15).reverse()
      .map(a => `- ${new Date(a.created_at).toLocaleDateString('pt-BR')} [${a.kind}] ${a.content ?? ''}`)
      .join('\n')

    const system =
      `Você é um vendedor experiente de uma agência de marketing digital chamada "${agency}". ` +
      'Escreva UMA mensagem curta de WhatsApp (máximo 4 frases) para o lead abaixo, em português do Brasil, ' +
      'com tom humano, cordial e direto, sem parecer robô, sem emojis em excesso (no máximo 1) e sem markdown. ' +
      'O objetivo é avançar o lead para a próxima etapa do funil. Use o histórico para não repetir o que já foi dito. ' +
      'Responda somente com o texto da mensagem, sem aspas e sem explicações.'

    const user =
      `Lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''}\n` +
      `Etapa atual: ${stage}\n` +
      `Temperatura: ${lead.temperature ?? 'não informada'}\n` +
      (lead.estimated_value != null ? `Valor estimado: ${fmtBRL(lead.estimated_value)}\n` : '') +
      (lead.source ? `Origem: ${lead.source}\n` : '') +
      (lead.notes ? `Observações: ${lead.notes}\n` : '') +
      `\nHistórico (mais antigo primeiro):\n${history || '- nenhum registro'}`

    try {
      const full = await streamChat([{ role: 'user', content: user }], system, false, chunk => {
        setDraft(prev => prev + chunk)
      })
      setDraft(full.trim())
    } catch (err: any) {
      setDraft('')
      setLabel('Mensagem')
      toast(err.message ?? 'A IA não respondeu agora', 'error')
    } finally {
      setAiBusy(false)
    }
  }

  const sending = sendDirect.isPending

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Button size="sm" variant="outline" disabled={!lead.whatsapp} onClick={() => setMenuOpen(v => !v)}
                  title={lead.whatsapp ? undefined : 'Cadastre o WhatsApp do lead'}>
            <MessageCircle className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />
            Mensagens prontas
            <ChevronDown className="w-3 h-3" />
          </Button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 top-8 z-40 w-72 max-w-[calc(100vw-3rem)] rounded-xl border py-1 shadow-2xl"
                   style={{ background: 'var(--sm-bg-card2)', borderColor: 'var(--sm-border)' }}>
                <button
                  onClick={() => { window.open(waLink(lead.whatsapp!), '_blank', 'noopener'); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 text-[12px] hover:bg-white/5"
                  style={{ color: 'var(--sm-text-2)' }}
                >
                  Abrir conversa no WhatsApp
                </button>
                <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--sm-text-4)' }}>
                  Usar no campo de mensagem
                </div>
                {templates.map(t => (
                  <button
                    key={t.title}
                    onClick={() => fill(fillVars(t.text, lead, agency), t.title)}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/5"
                  >
                    <span className="block text-[12px] font-medium" style={{ color: 'var(--sm-text-1)' }}>{t.title}</span>
                    <span className="block text-[11px] line-clamp-2" style={{ color: 'var(--sm-text-3)' }}>
                      {fillVars(t.text, lead, agency)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <Button size="sm" variant="outline" onClick={suggest} disabled={aiBusy}>
          {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />}
          Sugerir mensagem
        </Button>
      </div>

      {lead.whatsapp ? (
        <div className="rounded-xl border p-2.5 space-y-2" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-input)' }}>
          <Textarea
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }}
            placeholder={`Escreva uma mensagem para ${firstName}...`}
            className="text-[12.5px]"
            disabled={aiBusy}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] min-w-0" style={{ color: 'var(--sm-text-4)' }}>
              {connected
                ? `Vai direto para ${lead.whatsapp} pelo seu WhatsApp`
                : 'Abre o seu WhatsApp com o texto pronto. Conecte em CRM → Configurações para enviar direto daqui.'}
            </span>
            <div className="flex items-center gap-1.5 ml-auto">
              {draft.trim() && (
                <Button size="sm" variant="ghost" title="Copiar"
                        onClick={async () => toast((await copyText(draft)) ? 'Mensagem copiada' : 'Não consegui copiar', 'success')}>
                  <Copy className="w-3 h-3" />
                </Button>
              )}
              <Button size="sm" variant="success" disabled={!draft.trim() || aiBusy || sending} onClick={send}>
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Enviar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
          Cadastre o WhatsApp do lead e salve para enviar mensagens daqui.
        </p>
      )}
    </div>
  )
}
