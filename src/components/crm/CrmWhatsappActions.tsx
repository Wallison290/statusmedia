// ── WhatsApp do lead: mensagens prontas e sugestão da IA ─────────────────────
// Tudo abre o WhatsApp da própria agência (wa.me) com o texto já escrito.
// Nada sai pelo número da plataforma: ver o cabeçalho da migration 075.
// Abrir uma mensagem registra no histórico que o contato foi feito.

import { useState } from 'react'
import { MessageCircle, Sparkles, Loader2, Copy, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { useCrmSettings } from '@/hooks/useCrmSettings'
import { useCrmActivities, useAddCrmActivity } from '@/hooks/useCrmActivities'
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

  const [menuOpen, setMenuOpen] = useState(false)
  const [aiText, setAiText]     = useState<string | null>(null)
  const [aiBusy, setAiBusy]     = useState(false)

  const agency    = profile?.agency_name || profile?.full_name || 'nossa agência'
  const templates = settings?.message_templates?.length ? settings.message_templates : CRM_DEFAULT_MESSAGES

  function send(text: string, label: string) {
    if (!lead.whatsapp) return
    window.open(waLink(lead.whatsapp, text), '_blank', 'noopener')
    addActivity.mutate({ lead_id: lead.id, kind: 'whatsapp', content: `${label}: "${text}"` })
    setMenuOpen(false)
  }

  async function suggest() {
    setAiBusy(true)
    setAiText('')
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
        setAiText(prev => (prev ?? '') + chunk)
      })
      setAiText(full.trim())
    } catch (err: any) {
      setAiText(null)
      toast(err.message ?? 'A IA não respondeu agora', 'error')
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Button size="sm" variant="outline" disabled={!lead.whatsapp} onClick={() => setMenuOpen(v => !v)}
                  title={lead.whatsapp ? undefined : 'Cadastre o WhatsApp do lead'}>
            <MessageCircle className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />
            WhatsApp
            <ChevronDown className="w-3 h-3" />
          </Button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 top-8 z-40 w-72 rounded-xl border py-1 shadow-2xl"
                   style={{ background: 'var(--sm-bg-card2)', borderColor: 'var(--sm-border)' }}>
                <button
                  onClick={() => { window.open(waLink(lead.whatsapp!), '_blank', 'noopener'); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 text-[12px] hover:bg-white/5"
                  style={{ color: 'var(--sm-text-2)' }}
                >
                  Abrir conversa em branco
                </button>
                <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--sm-text-4)' }}>
                  Mensagens prontas
                </div>
                {templates.map(t => (
                  <button
                    key={t.title}
                    onClick={() => send(fillVars(t.text, lead, agency), t.title)}
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

      {aiText !== null && (
        <div className="rounded-xl border p-2.5 space-y-2" style={{ borderColor: 'rgba(139,92,246,0.35)', background: 'rgba(139,92,246,0.06)' }}>
          <Textarea rows={4} value={aiText} onChange={e => setAiText(e.target.value)} className="text-[12.5px]" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAiText(null)}>Descartar</Button>
            <Button size="sm" variant="outline" disabled={!aiText}
                    onClick={async () => toast((await copyText(aiText)) ? 'Mensagem copiada' : 'Não consegui copiar', 'success')}>
              <Copy className="w-3 h-3" /> Copiar
            </Button>
            {lead.whatsapp && (
              <Button size="sm" variant="success" disabled={!aiText || aiBusy}
                      onClick={() => { send(aiText, 'Mensagem sugerida pela IA'); setAiText(null) }}>
                <MessageCircle className="w-3 h-3" /> Enviar no WhatsApp
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
