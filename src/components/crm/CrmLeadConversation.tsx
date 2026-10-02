// ── Ficha do lead: conversa de WhatsApp e estado do follow-up ────────────────
// A conversa vem de `crm_messages` (gravada pelo webhook e pelos envios do
// sistema). O quadro de follow-up mostra os degraus já usados e o próximo, e
// deixa pausar a automação ou trocar o briefing só para este lead.

import { useEffect, useRef } from 'react'
import { Loader2, Pause, Play, Bot } from 'lucide-react'
import { useCrmSettings } from '@/hooks/useCrmSettings'
import { useUpdateCrmLead } from '@/hooks/useCrm'
import { useToast } from '@/components/ui/toast'
import { useCrmMessages, useCrmOffers, FOLLOWUP_STEPS } from '@/hooks/useCrmFollowup'
import type { CrmLead } from '@/types'

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function CrmLeadConversation({ leadId }: { leadId: string }) {
  const { data: messages = [], isLoading } = useCrmMessages(leadId)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages.length])

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin mx-auto mt-6" style={{ color: 'var(--sm-text-3)' }} />
  if (!messages.length) {
    return (
      <p className="text-[12px] text-center mt-6 px-4" style={{ color: 'var(--sm-text-4)' }}>
        Nenhuma mensagem gravada ainda. As conversas com este lead pelo seu WhatsApp conectado aparecem aqui a partir de agora.
      </p>
    )
  }

  return (
    <div className="max-h-[420px] overflow-y-auto space-y-1.5 pr-1">
      {messages.map(m => {
        const mine = m.direction === 'out'
        return (
          <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%] rounded-xl px-2.5 py-1.5 text-[12.5px] whitespace-pre-wrap break-words"
                 style={{
                   background: mine ? 'rgba(34,197,94,0.12)' : 'var(--sm-bg-alt)',
                   color: 'var(--sm-text-1)',
                   border: m.source === 'followup' ? '1px dashed rgba(37,99,235,0.5)' : '1px solid transparent',
                 }}>
              {m.text}
              <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px]" style={{ color: 'var(--sm-text-4)' }}>
                {m.source === 'followup' && <><Bot className="w-2.5 h-2.5" /> follow-up {m.followup_step}d ·</>}
                {m.source === 'sistema' && 'pelo CRM ·'}
                {fmt(m.sent_at)}
              </div>
            </div>
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}

export function CrmLeadFollowup({ lead }: { lead: CrmLead }) {
  const { toast } = useToast()
  const { data: settings } = useCrmSettings()
  const { data: offers = [] } = useCrmOffers()
  const updateLead = useUpdateCrmLead()

  // Pediu para parar: aviso fixo, com a opção de desfazer se foi engano
  if (lead.opted_out_at) {
    return (
      <div className="rounded-xl border px-2.5 py-2 text-[12px] space-y-1" style={{ borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.06)' }}>
        <p style={{ color: '#f87171' }}>
          Pediu para não receber mais mensagens em {new Date(lead.opted_out_at).toLocaleDateString('pt-BR')}. O follow-up automático está desligado para este lead.
        </p>
        <button type="button" className="text-[11.5px] underline" style={{ color: 'var(--sm-text-3)' }}
                onClick={() => {
                  if (!window.confirm('Foi engano? O follow-up automático volta a valer para este lead.')) return
                  updateLead.mutate({ id: lead.id, opted_out_at: null, followup_paused: false }, {
                    onSuccess: () => toast('Follow-up liberado de novo', 'success'),
                    onError:   (e: any) => toast(e.message, 'error'),
                  })
                }}>
          Foi engano, liberar de novo
        </button>
      </div>
    )
  }

  if (!settings?.followup_enabled || !lead.whatsapp) return null

  const done = lead.followup_done ?? []
  const next = FOLLOWUP_STEPS.find(d => !done.includes(d))
  const paused = !!lead.followup_paused

  function patch(u: Partial<CrmLead>, ok: string) {
    updateLead.mutate({ id: lead.id, ...u }, {
      onSuccess: () => toast(ok, 'success'),
      onError:   (e: any) => toast(e.message, 'error'),
    })
  }

  return (
    <div className="rounded-xl border px-2.5 py-2 space-y-1.5" style={{ borderColor: 'var(--sm-border)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--sm-text-3)' }}>Follow-up automático</span>
        <button type="button" disabled={updateLead.isPending}
                onClick={() => patch({ followup_paused: !paused }, paused ? 'Follow-up retomado para este lead' : 'Follow-up pausado para este lead')}
                className="flex items-center gap-1 text-[11.5px] underline" style={{ color: 'var(--sm-text-3)' }}>
          {paused ? <><Play className="w-3 h-3" /> Retomar</> : <><Pause className="w-3 h-3" /> Pausar</>}
        </button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {FOLLOWUP_STEPS.map(d => {
          const used = done.includes(d)
          const isNext = d === next && !paused
          return (
            <span key={d} className="text-[11px] px-1.5 py-0.5 rounded-md border"
                  style={{
                    borderColor: isNext ? '#2563EB' : 'var(--sm-border)',
                    color: used ? 'var(--sm-text-4)' : isNext ? '#4F8EF7' : 'var(--sm-text-3)',
                    textDecoration: used ? 'line-through' : undefined,
                  }}>
              {d}d
            </span>
          )
        })}
        <span className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
          {paused ? 'pausado' : next ? `próximo: ${next} dia${next > 1 ? 's' : ''} sem resposta` : 'cadência concluída'}
        </span>
      </div>
      {offers.length > 1 && (
        <select
          className="h-7 w-full rounded-md border px-2 text-[12px] [color-scheme:dark]"
          style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
          value={lead.followup_offer_id ?? ''}
          onChange={e => patch({ followup_offer_id: e.target.value || null }, 'Briefing do lead atualizado')}
        >
          <option value="">Briefing padrão</option>
          {offers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
    </div>
  )
}
