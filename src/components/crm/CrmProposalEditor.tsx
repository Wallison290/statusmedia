// ── Editor de proposta ───────────────────────────────────────────────────────
// Monta a proposta (itens, desconto, validade, condições) e envia por link.
// Enviada, o cliente abre em /proposta/<token>, aceita ou recusa, e o card do
// lead anda sozinho. Respondida, vira somente leitura: é a prova do que foi
// aceito (o banco também bloqueia a edição).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Loader2, Send, FileText, ShieldCheck, Undo2, MessageCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { useCrmSettings } from '@/hooks/useCrmSettings'
import { useSaveCrmProposal } from '@/hooks/useCrmDocuments'
import { useAgencyWhatsapp, useSendAgencyWhatsapp } from '@/hooks/useAgencyWhatsapp'
import { PROPOSAL_STATUS } from './crmStatus'
import { CrmShareBox, proposalMessage } from './CrmShareBox'
import { fmtBRL, todayISO, proposalTotals, itemTotal, proposalLink, fmtDateTime, waLink } from '@/utils/crm'
import type { CrmLead, CrmProposal, CrmProposalItem } from '@/types'

interface Props {
  open:      boolean
  onClose:   () => void
  proposal:  CrmProposal | null     // null = nova
  leads:     CrmLead[]
  defaultLeadId?: string | null
}

const EMPTY_ITEM: CrmProposalItem = { description: '', details: '', quantity: 1, unit_price: 0, recurring: true }

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--sm-text-3)' }}>
      {children}
    </label>
  )
}

const selectClass =
  'flex h-9 w-full min-w-0 max-w-full rounded-md border px-3 text-[13px] [color-scheme:dark] focus:outline-none focus:border-[#2563EB]/50'

export function CrmProposalEditor({ open, onClose, proposal, leads, defaultLeadId }: Props) {
  const { toast } = useToast()
  const { profile } = useAuth()
  const { data: settings } = useCrmSettings()
  const save = useSaveCrmProposal()
  const { data: wa } = useAgencyWhatsapp()
  const sendWa = useSendAgencyWhatsapp()
  const topRef = useRef<HTMLDivElement>(null)

  const [current, setCurrent] = useState<CrmProposal | null>(proposal)
  const [leadId, setLeadId]   = useState<string>('')
  const [title, setTitle]     = useState('')
  const [intro, setIntro]     = useState('')
  const [items, setItems]     = useState<CrmProposalItem[]>([EMPTY_ITEM])
  const [discount, setDiscount] = useState(0)
  const [validUntil, setValidUntil] = useState('')
  const [terms, setTerms]     = useState('')
  const [notes, setNotes]     = useState('')
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const d = settings?.proposal_defaults ?? {}
    setCurrent(proposal)
    setShareOpen(false)
    setLeadId(proposal?.lead_id ?? defaultLeadId ?? '')
    const lead = leads.find(l => l.id === (proposal?.lead_id ?? defaultLeadId))
    setTitle(proposal?.title ?? (lead ? `Proposta para ${lead.company || lead.name}` : ''))
    setIntro(proposal?.intro ?? d.intro ?? '')
    setItems(proposal?.items?.length ? proposal.items : [{ ...EMPTY_ITEM }])
    setDiscount(Number(proposal?.discount ?? 0))
    setValidUntil(proposal?.valid_until ?? todayISO(d.valid_days ?? 7))
    setTerms(proposal?.payment_terms ?? d.payment_terms ?? '')
    setNotes(proposal?.internal_notes ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proposal?.id, defaultLeadId])

  const locked = current?.status === 'aceita' || current?.status === 'recusada'
  const totals = useMemo(() => proposalTotals(items, discount), [items, discount])
  const lead   = leads.find(l => l.id === leadId) ?? null
  const agency = profile?.agency_name || profile?.full_name || 'nossa agência'

  function setItem(i: number, patch: Partial<CrmProposalItem>) {
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  async function persist(status?: CrmProposal['status']) {
    if (!title.trim()) { toast('Dê um título à proposta', 'warning'); return null }
    const clean = items
      .filter(i => i.description.trim())
      .map(i => ({
        description: i.description.trim(),
        details:     i.details?.trim() || undefined,
        quantity:    Math.max(Number(i.quantity) || 1, 0),
        unit_price:  Math.max(Number(i.unit_price) || 0, 0),
        recurring:   !!i.recurring,
      }))
    if (clean.length === 0) { toast('Adicione ao menos um item', 'warning'); return null }

    try {
      const saved = await save.mutateAsync({
        id:             current?.id,
        lead_id:        leadId || null,
        title:          title.trim(),
        intro:          intro.trim() || null,
        items:          clean,
        discount:       Number(discount) || 0,
        valid_until:    validUntil || null,
        payment_terms:  terms.trim() || null,
        internal_notes: notes.trim() || null,
        ...(status ? { status } : {}),
      })
      setCurrent(saved)
      return saved
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar a proposta', 'error')
      return null
    }
  }

  async function handleSaveDraft() {
    const saved = await persist()
    if (saved) toast('Proposta salva', 'success')
  }

  // O botão de baixo envia de verdade: com o WhatsApp da agência conectado,
  // sai direto para o cliente e fecha. Sem conexão, abre a conversa com a
  // mensagem pronta. Sem WhatsApp no lead, sobe até as opções de envio.
  const canSendDirect = wa?.status === 'connected' && !!lead?.whatsapp

  async function handleSend() {
    const nextStatus = !current || current.status === 'rascunho' ? 'enviada' : undefined
    const saved = await persist(nextStatus)
    if (!saved) return
    const text = proposalMessage(lead, agency, proposalLink(saved))

    if (canSendDirect && lead) {
      try {
        await sendWa.mutateAsync({ lead_id: lead.id, text, label: 'Proposta enviada' })
        toast(`Proposta enviada para ${lead.name.split(' ')[0]} no WhatsApp`, 'success')
        onClose()
        return
      } catch (err: any) {
        toast(err.message ?? 'Não consegui enviar pelo WhatsApp', 'error')
      }
    } else if (lead?.whatsapp) {
      window.open(waLink(lead.whatsapp, text), '_blank', 'noopener')
    } else {
      toast('Proposta salva. O lead está sem WhatsApp: copie o link no topo.', 'warning')
    }
    setShareOpen(true)
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  async function handleBackToDraft() {
    if (!current) return
    const saved = await persist('rascunho')
    if (saved) toast('Proposta voltou para rascunho. O link fica fora do ar até enviar de novo.', 'success')
  }

  const link = current ? proposalLink(current) : ''

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <FileText className="w-4 h-4" style={{ color: '#8B5CF6' }} />
            {current ? 'Proposta' : 'Nova proposta'}
            {current && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ color: PROPOSAL_STATUS[current.status].color, background: `${PROPOSAL_STATUS[current.status].color}1f` }}>
                {PROPOSAL_STATUS[current.status].label}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div ref={topRef} className="-mt-4" />

        {/* Resposta do cliente */}
        {locked && current && (
          <div className="rounded-xl border p-3 text-[12.5px] space-y-1"
               style={{ borderColor: `${PROPOSAL_STATUS[current.status].color}55`, background: `${PROPOSAL_STATUS[current.status].color}10` }}>
            <p style={{ color: 'var(--sm-text-1)' }}>
              <strong>{current.status === 'aceita' ? 'Aceita' : 'Recusada'}</strong> por {current.responder_name ?? 'cliente'}
              {current.responded_at && ` em ${fmtDateTime(current.responded_at)}`}
            </p>
            {current.reject_reason && <p style={{ color: 'var(--sm-text-2)' }}>Motivo: {current.reject_reason}</p>}
            {current.content_hash && (
              <p className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--sm-text-4)' }}>
                <ShieldCheck className="w-3 h-3" />
                Registro do conteúdo aceito: {current.content_hash.slice(0, 16)}…
                {current.response_meta?.ip ? ` · IP ${current.response_meta.ip}` : ''}
              </p>
            )}
            <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>
              Proposta respondida não pode mais ser alterada. Para uma nova versão, use "Duplicar" na lista.
            </p>
          </div>
        )}

        {/* Compartilhar: sempre à mão enquanto a proposta espera resposta,
            não só logo depois de enviar */}
        {current && (current.status === 'enviada' || current.status === 'visualizada') && (
          <CrmShareBox
            link={link}
            lead={lead}
            message={proposalMessage(lead, agency, link)}
            label="Proposta enviada"
            hint={shareOpen
              ? 'Proposta pronta! Agora envie para o cliente. Você recebe um aviso quando ele abrir e quando responder.'
              : current.status === 'visualizada'
                ? `O cliente já abriu a proposta ${current.view_count}x. Precisa mandar de novo?`
                : 'Proposta enviada, aguardando o cliente abrir.'}
          />
        )}

        <fieldset disabled={locked} className="space-y-4 disabled:opacity-80">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Lead</Label>
              <select
                value={leadId}
                onChange={e => setLeadId(e.target.value)}
                className={selectClass}
                style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
              >
                <option value="">Sem lead vinculado</option>
                {leads.map(l => (
                  <option key={l.id} value={l.id}>{l.name}{l.company ? ` (${l.company})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Título</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Gestão de redes sociais" />
            </div>
          </div>

          <div>
            <Label>Apresentação (o cliente lê primeiro)</Label>
            <Textarea rows={3} value={intro} onChange={e => setIntro(e.target.value)}
                      placeholder="Contexto, objetivo e o que a agência vai entregar..." />
          </div>

          {/* Itens */}
          <div>
            <Label>Itens</Label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="rounded-xl border p-2.5 space-y-2" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
                  <div className="flex gap-2">
                    <Input value={it.description} onChange={e => setItem(i, { description: e.target.value })}
                           placeholder="Serviço (ex: Gestão de Instagram)" className="flex-1" />
                    <button type="button" onClick={() => setItems(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)}
                            className="w-9 flex items-center justify-center rounded-md hover:bg-red-500/10" aria-label="Remover item">
                      <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
                    </button>
                  </div>
                  <Input value={it.details ?? ''} onChange={e => setItem(i, { details: e.target.value })}
                         placeholder="Detalhes (ex: 12 posts + 8 stories por mês)" className="h-8 text-[12.5px]" />
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px]" style={{ color: 'var(--sm-text-3)' }}>Qtd</span>
                      <Input type="number" min={1} value={it.quantity || ''} placeholder="1" onChange={e => setItem(i, { quantity: Number(e.target.value) })}
                             className="h-8 w-[70px] text-[12.5px]" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px]" style={{ color: 'var(--sm-text-3)' }}>Valor unit.</span>
                      <Input type="number" min={0} step="0.01" value={it.unit_price || ''} placeholder="0,00" onChange={e => setItem(i, { unit_price: Number(e.target.value) })}
                             className="h-8 w-[120px] text-[12.5px]" />
                    </div>
                    <label className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: 'var(--sm-text-2)' }}>
                      <input type="checkbox" checked={!!it.recurring} onChange={e => setItem(i, { recurring: e.target.checked })} />
                      Mensal
                    </label>
                    <span className="ml-auto text-[12.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
                      {fmtBRL(itemTotal(it), true)}{it.recurring ? '/mês' : ''}
                    </span>
                  </div>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM }])}>
                <Plus className="w-3 h-3" /> Adicionar item
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Desconto (R$)</Label>
              <Input type="number" min={0} step="0.01" value={discount || ''} placeholder="0,00" onChange={e => setDiscount(Number(e.target.value))} />
            </div>
            <div>
              <Label>Válida até</Label>
              <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
            </div>
            <div className="rounded-xl px-3 py-2 flex flex-col justify-center" style={{ background: 'rgba(34,197,94,0.08)' }}>
              <span className="text-[11px]" style={{ color: 'var(--sm-text-3)' }}>
                Subtotal {fmtBRL(totals.subtotal, true)}{totals.discount ? ` · desconto ${fmtBRL(totals.discount, true)}` : ''}
              </span>
              <span className="text-[18px] font-bold" style={{ color: '#22C55E' }}>{fmtBRL(totals.total, true)}</span>
            </div>
          </div>

          <div>
            <Label>Condições de pagamento</Label>
            <Input value={terms} onChange={e => setTerms(e.target.value)} placeholder="Ex: Mensal, todo dia 10, via PIX" />
          </div>

          <div>
            <Label>Anotações internas (o cliente não vê)</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Margem, negociação, o que ficou combinado..." />
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          <div>
            {current && (current.status === 'enviada' || current.status === 'visualizada') && (
              <Button size="sm" variant="ghost" onClick={handleBackToDraft} disabled={save.isPending}>
                <Undo2 className="w-3.5 h-3.5" /> Voltar para rascunho
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            {!locked && (
              <>
                <Button variant="secondary" onClick={handleSaveDraft} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar
                </Button>
                <Button onClick={handleSend} disabled={save.isPending || sendWa.isPending} variant={lead?.whatsapp ? 'success' : 'default'}>
                  {sendWa.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : lead?.whatsapp ? <MessageCircle className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                  {lead?.whatsapp
                    ? (current && current.status !== 'rascunho' ? 'Reenviar no WhatsApp' : 'Enviar no WhatsApp do cliente')
                    : (current && current.status !== 'rascunho' ? 'Salvar e compartilhar' : 'Enviar ao cliente')}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
