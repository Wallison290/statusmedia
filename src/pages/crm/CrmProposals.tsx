// ── CRM › Propostas ──────────────────────────────────────────────────────────
// Lista das propostas com o status que o cliente gerou pelo link (aberta,
// aceita, recusada). Abre direto no editor por ?abrir=<id> e cria já com o
// lead escolhido por ?novo=<leadId> (links vindos da ficha do lead).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, FileText, Copy, Loader2, MoreVertical, CopyPlus, PenLine, Trash2, Eye, ExternalLink, MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useCrmLeads } from '@/hooks/useCrm'
import { useAuth } from '@/hooks/useAuth'
import { proposalMessage } from '@/components/crm/CrmShareBox'
import { useCrmProposals, useSaveCrmProposal, useDeleteCrmProposal } from '@/hooks/useCrmDocuments'
import { CrmHeader } from '@/components/crm/CrmHeader'
import { CrmProposalEditor } from '@/components/crm/CrmProposalEditor'
import { PROPOSAL_STATUS } from '@/components/crm/crmStatus'
import { fmtShortDate, proposalLink, copyText, todayISO, waLink } from '@/utils/crm'
import type { CrmProposal, CrmProposalStatus } from '@/types'
import { useMoney } from '@/hooks/useHideValues'

type Filter = 'todas' | 'abertas' | CrmProposalStatus

export function CrmProposals() {
  const money = useMoney()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const { data: proposals = [], isLoading } = useCrmProposals()
  const { data: leads = [] } = useCrmLeads()
  const { profile } = useAuth()
  const agency = profile?.agency_name || profile?.full_name || 'nossa agência'
  const save = useSaveCrmProposal()
  const del  = useDeleteCrmProposal()

  const [filter, setFilter]   = useState<Filter>('todas')
  const [editing, setEditing] = useState<CrmProposal | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [newLeadId, setNewLeadId]   = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)

  const leadName = useMemo(() => {
    const m = new Map(leads.map(l => [l.id, l.company ? `${l.name} · ${l.company}` : l.name]))
    return (id: string | null) => (id ? m.get(id) ?? null : null)
  }, [leads])

  // O editor oferece leads ativos; o da proposta aberta entra mesmo se arquivado
  const editorLeads = useMemo(
    () => leads.filter(l => !l.archived_at || l.id === editing?.lead_id),
    [leads, editing],
  )

  useEffect(() => {
    const abrir = params.get('abrir')
    const novo  = params.get('novo')
    if (abrir && proposals.length) {
      const p = proposals.find(x => x.id === abrir)
      if (p) { setEditing(p); setNewLeadId(null); setEditorOpen(true) }
      params.delete('abrir'); setParams(params, { replace: true })
    } else if (novo) {
      setEditing(null); setNewLeadId(novo); setEditorOpen(true)
      params.delete('novo'); setParams(params, { replace: true })
    }
  }, [params, proposals, setParams])

  // Versão atual da lista: `editing` guarda a foto do clique, que fica velha
  // depois que o próprio editor salva (status novo, data de envio...)
  const editingFresh = editing ? proposals.find(p => p.id === editing.id) ?? editing : null

  const today = todayISO()
  const isOpen =(p: CrmProposal) => p.status === 'enviada' || p.status === 'visualizada'

  const list = proposals.filter(p =>
    filter === 'todas' ? true : filter === 'abertas' ? isOpen(p) : p.status === filter)

  const stats = useMemo(() => {
    const open     = proposals.filter(isOpen)
    const answered = proposals.filter(p => p.status === 'aceita' || p.status === 'recusada')
    const accepted = proposals.filter(p => p.status === 'aceita')
    return {
      openCount:  open.length,
      openValue:  open.reduce((s, p) => s + Number(p.total), 0),
      acceptedValue: accepted.reduce((s, p) => s + Number(p.total), 0),
      rate: answered.length ? Math.round((accepted.length / answered.length) * 100) : null,
    }
  }, [proposals])

  async function duplicate(p: CrmProposal) {
    setMenu(null)
    try {
      const copy = await save.mutateAsync({
        lead_id: p.lead_id, title: `${p.title} (cópia)`, intro: p.intro, items: p.items,
        discount: p.discount, valid_until: todayISO(7), payment_terms: p.payment_terms,
        internal_notes: p.internal_notes, status: 'rascunho',
      })
      setEditing(copy); setNewLeadId(null); setEditorOpen(true)
    } catch (err: any) {
      toast(err.message ?? 'Não consegui duplicar', 'error')
    }
  }

  async function remove(p: CrmProposal) {
    setMenu(null)
    if (!window.confirm(`Excluir a proposta "${p.title}"? O link deixa de funcionar.`)) return
    try {
      await del.mutateAsync(p.id)
      toast('Proposta excluída', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao excluir', 'error')
    }
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'rascunho', label: 'Rascunhos' },
    { id: 'abertas', label: 'Aguardando resposta' },
    { id: 'aceita', label: 'Aceitas' },
    { id: 'recusada', label: 'Recusadas' },
  ]

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--sm-bg-page)' }}>
      <CrmHeader
        subtitle="Propostas com aceite pelo link"
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setNewLeadId(null); setEditorOpen(true) }}>
            <Plus className="w-3.5 h-3.5" /> Nova proposta
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Números */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Aguardando resposta', value: `${stats.openCount}`, sub: stats.openValue ? money(stats.openValue) : 'nenhum valor na mesa' },
            { label: 'Total aceito',        value: money(stats.acceptedValue), sub: 'soma das propostas aceitas' },
            { label: 'Taxa de aceite',      value: stats.rate === null ? 'sem dados' : `${stats.rate}%`, sub: 'das propostas já respondidas' },
          ].map(k => (
            <div key={k.label} className="rounded-xl border px-4 py-3" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
              <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--sm-text-3)' }}>{k.label}</p>
              <p className="text-[22px] font-bold mt-0.5" style={{ color: 'var(--sm-text-1)' }}>{k.value}</p>
              <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>{k.sub}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="text-[12px] px-2.5 h-7 rounded-lg border transition-colors"
              style={{
                borderColor: filter === f.id ? '#2563EB' : 'var(--sm-border)',
                background:  filter === f.id ? 'rgba(37,99,235,0.12)' : 'transparent',
                color:       filter === f.id ? '#4F8EF7' : 'var(--sm-text-3)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sm-text-3)' }} /></div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--sm-text-4)' }} />
            <p className="text-[13px]" style={{ color: 'var(--sm-text-2)' }}>
              {proposals.length === 0 ? 'Nenhuma proposta ainda.' : 'Nenhuma proposta neste filtro.'}
            </p>
            {proposals.length === 0 && (
              <p className="text-[12px] mt-1 max-w-sm mx-auto" style={{ color: 'var(--sm-text-4)' }}>
                Monte a proposta aqui e mande o link. O cliente aceita pelo celular e o card do lead vai sozinho para "ganho".
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map(p => {
              const S = PROPOSAL_STATUS[p.status]
              const expired = isOpen(p) && p.valid_until != null && p.valid_until < today
              return (
                <li key={p.id} className="relative rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap"
                    style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
                  <button className="flex-1 min-w-[200px] text-left" onClick={() => { setEditing(p); setNewLeadId(null); setEditorOpen(true) }}>
                    <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{p.title}</p>
                    <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-3)' }}>
                      {leadName(p.lead_id) ?? 'Sem lead'}
                      {p.sent_at && ` · enviada ${fmtShortDate(p.sent_at)}`}
                      {p.view_count > 0 && ` · aberta ${p.view_count}x`}
                      {p.responded_at && ` · respondida ${fmtShortDate(p.responded_at)}`}
                    </p>
                  </button>

                  <span className="text-[14px] font-bold" style={{ color: 'var(--sm-text-1)' }}>{money(Number(p.total))}</span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ color: expired ? '#f87171' : S.color, background: `${expired ? '#ef4444' : S.color}1f` }}>
                    {expired ? 'Vencida' : S.label}
                  </span>

                  <div className="flex items-center gap-1">
                    {isOpen(p) && (() => {
                      const lead = leads.find(l => l.id === p.lead_id)
                      return lead?.whatsapp ? (
                        <Button size="icon-sm" variant="ghost" title="Enviar no WhatsApp" asChild>
                          <a href={waLink(lead.whatsapp, proposalMessage(lead, agency, proposalLink(p)))} target="_blank" rel="noreferrer">
                            <MessageCircle className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />
                          </a>
                        </Button>
                      ) : null
                    })()}
                    {p.status !== 'rascunho' && (
                      <Button size="icon-sm" variant="ghost" title="Copiar link"
                              onClick={async () => toast((await copyText(proposalLink(p))) ? 'Link copiado' : 'Não consegui copiar', 'success')}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="icon-sm" variant="ghost" onClick={() => setMenu(menu === p.id ? null : p.id)} aria-label="Mais ações">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {menu === p.id && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
                      <div className="absolute right-3 top-12 z-40 w-52 rounded-xl border py-1 shadow-2xl"
                           style={{ background: 'var(--sm-bg-card2)', borderColor: 'var(--sm-border)' }}>
                        {[
                          { icon: Eye, label: 'Abrir', on: () => { setMenu(null); setEditing(p); setNewLeadId(null); setEditorOpen(true) } },
                          ...(p.status !== 'rascunho' ? [{ icon: ExternalLink, label: 'Ver como o cliente', on: () => { setMenu(null); window.open(proposalLink(p), '_blank', 'noopener') } }] : []),
                          { icon: CopyPlus, label: 'Duplicar', on: () => duplicate(p) },
                          ...(p.status === 'aceita' ? [{ icon: PenLine, label: 'Gerar contrato', on: () => navigate(`/crm/contratos?proposta=${p.id}`) }] : []),
                          // Aceita é prova do acordo: não sai pela tela
                          ...(p.status !== 'aceita' ? [{ icon: Trash2, label: 'Excluir', on: () => remove(p), danger: true }] : []),
                        ].map(a => (
                          <button key={a.label} onClick={a.on}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-white/5"
                                  style={{ color: (a as any).danger ? '#f87171' : 'var(--sm-text-2)' }}>
                            <a.icon className="w-3 h-3" /> {a.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <CrmProposalEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        proposal={editingFresh}
        leads={editorLeads}
        defaultLeadId={newLeadId}
      />
    </div>
  )
}
