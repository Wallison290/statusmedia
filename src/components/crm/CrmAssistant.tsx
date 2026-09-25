// ── Assistente de IA do funil ────────────────────────────────────────────────
// Conversa sobre o CRM com os dados reais do board: "quem priorizar hoje?",
// "quais leads estão parados?". A foto do funil vai como instrução de sistema
// a cada pergunta, então a resposta usa sempre o estado atual.
// Cada pergunta consome 1 crédito de IA do plano (mesmo chat do StatusIA).

import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { streamChat } from '@/lib/aiProxy'
import { fmtBRL, todayISO } from '@/utils/crm'
import type { CrmColumn, CrmLead } from '@/types'

interface Props {
  open:     boolean
  onClose:  () => void
  leads:    CrmLead[]
  columns:  CrmColumn[]
  memberOf: (id: string | null) => string | null
}

type Msg = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Quem eu devo priorizar hoje?',
  'Quais leads estão parados há muito tempo?',
  'Me dá um resumo do funil.',
  'Onde estou perdendo mais leads?',
]

// Limite de leads na foto: o suficiente para qualquer agência pequena/média
// sem estourar o contexto do modelo.
const MAX_LEADS = 150

function snapshot(leads: CrmLead[], columns: CrmColumn[], memberOf: Props['memberOf']) {
  const today = todayISO()
  const colName = new Map(columns.map(c => [c.id, c]))
  const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

  const stages = columns.map(c => {
    const ls = leads.filter(l => l.column_id === c.id)
    const value = ls.reduce((s, l) => s + (l.estimated_value ?? 0), 0)
    return `- ${c.name} (${c.stage_type}): ${ls.length} lead(s)${value ? `, ${fmtBRL(value)}` : ''}`
  }).join('\n')

  const rows = leads.slice(0, MAX_LEADS).map(l => {
    const c = colName.get(l.column_id)
    const parts = [
      l.name + (l.company ? ` (${l.company})` : ''),
      `etapa: ${c?.name ?? '?'}`,
      `há ${days(l.stage_entered_at ?? l.created_at)}d na etapa`,
      l.temperature ? `temperatura: ${l.temperature}` : null,
      l.estimated_value != null ? `valor: ${fmtBRL(l.estimated_value)}` : null,
      l.next_contact_at ? `próximo contato: ${l.next_contact_at}${l.next_contact_at < today ? ' (ATRASADO)' : ''}` : 'sem próximo contato',
      l.source ? `origem: ${l.source}` : null,
      memberOf(l.responsible_user_id) ? `responsável: ${memberOf(l.responsible_user_id)}` : null,
      l.lost_reason ? `motivo da perda: ${l.lost_reason}` : null,
      l.notes ? `obs: ${l.notes.slice(0, 160)}` : null,
    ].filter(Boolean)
    return `- ${parts.join(' | ')}`
  }).join('\n')

  return `Hoje é ${today}.\n\nETAPAS DO FUNIL:\n${stages}\n\nLEADS:\n${rows || '- nenhum lead'}` +
    (leads.length > MAX_LEADS ? `\n(+${leads.length - MAX_LEADS} leads não listados)` : '')
}

export function CrmAssistant({ open, onClose, leads, columns, memberOf }: Props) {
  const { toast } = useToast()
  const { profile } = useAuth()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput]       = useState('')
  const [busy, setBusy]         = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    const history: Msg[] = [...messages, { role: 'user', content: q }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)

    const agency = profile?.agency_name || profile?.full_name || 'a agência'
    const system =
      `Você é o assistente comercial de ${agency}, uma agência de marketing digital. ` +
      'Responda em português do Brasil, de forma curta, prática e direta, usando SOMENTE os dados do funil abaixo. ' +
      'Cite os leads pelo nome. Se o dado não estiver aqui, diga que não sabe; nunca invente números. ' +
      'Quando fizer sentido, termine com uma sugestão de ação concreta. Não use tabelas.\n\n' +
      snapshot(leads, columns, memberOf)

    try {
      await streamChat(history, system, false, chunk => {
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, content: last.content + chunk }
          return next
        })
      })
    } catch (err: any) {
      setMessages(history)
      toast(err.message ?? 'A IA não respondeu agora', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="w-[95vw] max-w-2xl h-[80vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: '#a78bfa' }} /> Assistente do funil
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-4">
              <p className="text-[12.5px] max-w-sm" style={{ color: 'var(--sm-text-3)' }}>
                Pergunte sobre seus {leads.length} leads. A IA enxerga as etapas, valores, datas de retorno e há quanto tempo cada um está parado.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="text-[12px] px-3 h-8 rounded-full border transition-colors hover:border-[#8B5CF6]/60"
                    style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-line"
                  style={m.role === 'user'
                    ? { background: '#2563EB', color: '#fff' }
                    : { background: 'var(--sm-bg-alt)', color: 'var(--sm-text-1)' }}
                >
                  {m.content || <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={e => { e.preventDefault(); ask(input) }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ex: quais leads quentes estão sem retorno marcado?"
            className="flex-1 h-9 rounded-md border px-3 text-[13px] focus:outline-none focus:border-[#2563EB]/50"
            style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
