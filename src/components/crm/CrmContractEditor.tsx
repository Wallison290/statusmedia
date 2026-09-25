// ── Editor de contrato ───────────────────────────────────────────────────────
// Nasce do modelo da agência já preenchido com os dados do lead e da proposta
// aceita. A agência pode assinar antes de enviar; o cliente assina pelo link
// (/contrato/<token>) com nome, CPF/CNPJ, e-mail e rubrica desenhada.
// Assinado, fica travado: o banco guarda o hash do texto como prova.

import { useEffect, useState } from 'react'
import {
  Loader2, Send, Copy, MessageCircle, ExternalLink, PenLine, ShieldCheck, Undo2, Wand2, Ban,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { useCrmSettings } from '@/hooks/useCrmSettings'
import { useSaveCrmContract } from '@/hooks/useCrmDocuments'
import { CRM_DEFAULT_CONTRACT } from '@/data/crmTemplates'
import { CONTRACT_STATUS } from './crmStatus'
import { SignaturePad } from './SignaturePad'
import { fillContract, contractLink, waLink, copyText, fmtDateTime, fmtBRL } from '@/utils/crm'
import type { CrmContract, CrmLead, CrmProposal } from '@/types'

interface Props {
  open:       boolean
  onClose:    () => void
  contract:   CrmContract | null
  leads:      CrmLead[]
  proposals:  CrmProposal[]
  defaultLeadId?:     string | null
  defaultProposalId?: string | null
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--sm-text-3)' }}>
      {children}
    </label>
  )
}

const selectClass =
  'flex h-9 w-full rounded-md border px-3 text-[13px] [color-scheme:dark] focus:outline-none focus:border-[#2563EB]/50'

export function CrmContractEditor({ open, onClose, contract, leads, proposals, defaultLeadId, defaultProposalId }: Props) {
  const { toast } = useToast()
  const { profile } = useAuth()
  const { data: settings } = useCrmSettings()
  const save = useSaveCrmContract()

  const agency = profile?.agency_name || profile?.full_name || 'Agência'

  const [current, setCurrent]       = useState<CrmContract | null>(contract)
  const [leadId, setLeadId]         = useState('')
  const [proposalId, setProposalId] = useState('')
  const [title, setTitle]           = useState('')
  const [content, setContent]       = useState('')
  const [signerName, setSignerName] = useState('')
  const [signature, setSignature]   = useState<string | null>(null)
  const [resign, setResign]         = useState(false)
  const [shareOpen, setShareOpen]   = useState(false)

  function build(lid: string, pid: string) {
    const lead = leads.find(l => l.id === lid) ?? null
    const proposal = proposals.find(p => p.id === pid) ?? null
    return fillContract(settings?.contract_template || CRM_DEFAULT_CONTRACT, { lead, proposal, agency })
  }

  useEffect(() => {
    if (!open) return
    setCurrent(contract)
    setShareOpen(false)
    setResign(false)
    const prop = proposals.find(p => p.id === (contract?.proposal_id ?? defaultProposalId))
    const lid  = contract?.lead_id ?? defaultLeadId ?? prop?.lead_id ?? ''
    const pid  = contract?.proposal_id ?? prop?.id ?? ''
    const lead = leads.find(l => l.id === lid)
    setLeadId(lid)
    setProposalId(pid)
    setTitle(contract?.title ?? `Contrato de prestação de serviços${lead ? ` · ${lead.company || lead.name}` : ''}`)
    setContent(contract?.content ?? build(lid, pid))
    setSignerName(contract?.agency_signer_name ?? profile?.full_name ?? '')
    setSignature(contract?.agency_signature ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract?.id, defaultLeadId, defaultProposalId])

  const status = current?.status ?? 'rascunho'
  const signed = status === 'assinado'
  const canEditText = status === 'rascunho'
  const lead = leads.find(l => l.id === leadId) ?? null
  const leadProposals = proposals.filter(p => !leadId || p.lead_id === leadId)

  async function persist(next?: CrmContract['status']) {
    if (!title.trim()) { toast('Dê um título ao contrato', 'warning'); return null }
    if (!content.trim()) { toast('O contrato está sem texto', 'warning'); return null }
    try {
      const saved = await save.mutateAsync({
        id:                 current?.id,
        lead_id:            leadId || null,
        proposal_id:        proposalId || null,
        title:              title.trim(),
        // Com o contrato já enviado o texto é travado pelo banco: nem manda
        ...(canEditText ? { content } : {}),
        agency_signer_name: signature ? signerName.trim() || null : null,
        agency_signature:   signature,
        ...(next ? { status: next } : {}),
      })
      setCurrent(saved)
      return saved
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar o contrato', 'error')
      return null
    }
  }

  async function handleSend() {
    if (!signature && !window.confirm('Enviar sem a assinatura da agência? O cliente vai assinar sozinho.')) return
    const saved = await persist(status === 'rascunho' ? 'enviado' : undefined)
    if (saved) { setShareOpen(true); toast('Contrato pronto para assinatura', 'success') }
  }

  const link = current ? contractLink(current.public_token) : ''
  const waText = lead
    ? `Olá, ${lead.name.split(' ')[0]}! Segue o contrato da ${agency} para assinatura: ${link}\n\nÉ só abrir, conferir e assinar pelo celular mesmo.`
    : ''

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <PenLine className="w-4 h-4" style={{ color: '#14b8a6' }} />
            {current ? 'Contrato' : 'Novo contrato'}
            {current && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ color: CONTRACT_STATUS[status].color, background: `${CONTRACT_STATUS[status].color}1f` }}>
                {CONTRACT_STATUS[status].label}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {signed && current && (
          <div className="rounded-xl border p-3 text-[12.5px] space-y-1" style={{ borderColor: 'rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.06)' }}>
            <p style={{ color: 'var(--sm-text-1)' }}>
              <strong>Assinado</strong> por {current.signer_name} ({current.signer_email})
              {current.signed_at && ` em ${fmtDateTime(current.signed_at)}`}
            </p>
            <p className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--sm-text-4)' }}>
              <ShieldCheck className="w-3 h-3" />
              Registro do texto assinado: {current.content_hash?.slice(0, 16)}…
              {current.sign_meta?.ip ? ` · IP ${current.sign_meta.ip}` : ''}
            </p>
            <Button size="sm" variant="outline" className="mt-1" onClick={() => window.open(link, '_blank', 'noopener')}>
              <ExternalLink className="w-3 h-3" /> Ver documento assinado (dá para salvar em PDF)
            </Button>
          </div>
        )}

        {shareOpen && current && status === 'enviado' && (
          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'rgba(37,99,235,0.35)', background: 'rgba(37,99,235,0.06)' }}>
            <p className="text-[12.5px] font-medium" style={{ color: 'var(--sm-text-1)' }}>
              Envie o link. Você recebe um aviso assim que o cliente assinar.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Input readOnly value={link} className="h-8 text-[12px] flex-1 min-w-[220px]" onFocus={e => e.target.select()} />
              <Button size="sm" variant="outline" onClick={async () => toast((await copyText(link)) ? 'Link copiado' : 'Não consegui copiar', 'success')}>
                <Copy className="w-3 h-3" /> Copiar
              </Button>
              {lead?.whatsapp && (
                <Button size="sm" variant="success" onClick={() => window.open(waLink(lead.whatsapp!, waText), '_blank', 'noopener')}>
                  <MessageCircle className="w-3 h-3" /> Enviar no WhatsApp
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => window.open(link, '_blank', 'noopener')}>
                <ExternalLink className="w-3 h-3" /> Ver como o cliente
              </Button>
            </div>
          </div>
        )}

        <fieldset disabled={signed || status === 'cancelado'} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Lead</Label>
              <select
                value={leadId}
                onChange={e => { setLeadId(e.target.value); setProposalId('') }}
                disabled={!canEditText}
                className={selectClass}
                style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
              >
                <option value="">Sem lead vinculado</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.name}{l.company ? ` (${l.company})` : ''}</option>)}
              </select>
            </div>
            <div>
              <Label>Proposta de origem</Label>
              <select
                value={proposalId}
                onChange={e => setProposalId(e.target.value)}
                disabled={!canEditText}
                className={selectClass}
                style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
              >
                <option value="">Nenhuma</option>
                {leadProposals.map(p => (
                  <option key={p.id} value={p.id}>{p.title} · {fmtBRL(Number(p.total))}{p.status === 'aceita' ? ' ✓' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Título</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Texto do contrato</Label>
              {canEditText && (
                <button
                  type="button"
                  onClick={() => {
                    if (content.trim() && !window.confirm('Substituir o texto atual pelo modelo preenchido?')) return
                    setContent(build(leadId, proposalId))
                  }}
                  className="flex items-center gap-1 text-[11.5px]" style={{ color: '#4F8EF7' }}
                >
                  <Wand2 className="w-3 h-3" /> Preencher com o modelo
                </button>
              )}
            </div>
            <Textarea
              rows={16}
              value={content}
              onChange={e => setContent(e.target.value)}
              readOnly={!canEditText}
              className="text-[12.5px] leading-relaxed font-mono"
            />
            {!canEditText && !signed && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--sm-text-4)' }}>
                O texto trava depois de enviado. Para mudar, volte o contrato para rascunho.
              </p>
            )}
          </div>

          {/* Assinatura da agência */}
          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
            <p className="text-[12.5px] font-medium" style={{ color: 'var(--sm-text-1)' }}>Assinatura da agência (opcional)</p>
            {signature && !resign ? (
              <div className="flex items-end gap-3 flex-wrap">
                <img src={signature} alt="Assinatura da agência" className="h-16 rounded-md bg-white px-2" />
                <div className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
                  {signerName}
                  {current?.agency_signed_at && <><br />{fmtDateTime(current.agency_signed_at)}</>}
                </div>
                {!signed && (
                  <Button size="sm" variant="ghost" onClick={() => { setSignature(null); setResign(true) }}>Refazer</Button>
                )}
              </div>
            ) : (
              <>
                <Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Nome de quem assina pela agência" className="h-8 text-[12.5px]" />
                <SignaturePad onChange={setSignature} height={120} />
              </>
            )}
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          <div className="flex items-center gap-1">
            {current && status === 'enviado' && (
              <Button size="sm" variant="ghost" disabled={save.isPending} onClick={async () => {
                if (await persist('rascunho')) toast('Contrato voltou para rascunho. O link fica fora do ar até enviar de novo.', 'success')
              }}>
                <Undo2 className="w-3.5 h-3.5" /> Voltar para rascunho
              </Button>
            )}
            {current && (status === 'rascunho' || status === 'enviado') && (
              <Button size="sm" variant="ghost" disabled={save.isPending} onClick={async () => {
                if (!window.confirm('Cancelar este contrato? O link deixa de funcionar.')) return
                if (await persist('cancelado')) toast('Contrato cancelado', 'success')
              }}>
                <Ban className="w-3.5 h-3.5" /> Cancelar contrato
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            {!signed && status !== 'cancelado' && (
              <>
                <Button variant="secondary" disabled={save.isPending} onClick={async () => { if (await persist()) toast('Contrato salvo', 'success') }}>
                  {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar
                </Button>
                <Button onClick={handleSend} disabled={save.isPending}>
                  <Send className="w-3.5 h-3.5" />
                  {status === 'enviado' ? 'Salvar e compartilhar' : 'Enviar para assinatura'}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
