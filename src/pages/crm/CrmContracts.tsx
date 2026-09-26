// ── CRM › Contratos ──────────────────────────────────────────────────────────
// Contratos com assinatura eletrônica pelo link. Aceita ?novo=<leadId>,
// ?proposta=<proposalId> (vindo de "Gerar contrato") e ?abrir=<id>.

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, PenLine, Copy, Loader2, Trash2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useCrmLeads } from '@/hooks/useCrm'
import { useAuth } from '@/hooks/useAuth'
import { contractMessage } from '@/components/crm/CrmShareBox'
import { useCrmContracts, useCrmProposals, useDeleteCrmContract } from '@/hooks/useCrmDocuments'
import { CrmHeader } from '@/components/crm/CrmHeader'
import { CrmContractEditor } from '@/components/crm/CrmContractEditor'
import { CONTRACT_STATUS } from '@/components/crm/crmStatus'
import { fmtShortDate, contractLink, copyText, waLink } from '@/utils/crm'
import type { CrmContract } from '@/types'

export function CrmContracts() {
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const { data: contracts = [], isLoading } = useCrmContracts()
  const { data: proposals = [] } = useCrmProposals()
  const { data: leads = [] } = useCrmLeads()
  const { profile } = useAuth()
  const agency = profile?.agency_name || profile?.full_name || 'nossa agência'
  const del = useDeleteCrmContract()

  const [editing, setEditing] = useState<CrmContract | null>(null)
  const [open, setOpen]       = useState(false)
  const [defaults, setDefaults] = useState<{ lead: string | null; proposal: string | null }>({ lead: null, proposal: null })

  const leadName = useMemo(() => {
    const m = new Map(leads.map(l => [l.id, l.company ? `${l.name} · ${l.company}` : l.name]))
    return (id: string | null) => (id ? m.get(id) ?? null : null)
  }, [leads])

  const editingFresh = editing ? contracts.find(c => c.id === editing.id) ?? editing : null
  const editorLeads  = leads.filter(l => !l.archived_at || l.id === editingFresh?.lead_id)

  useEffect(() => {
    const abrir = params.get('abrir')
    const novo  = params.get('novo')
    const prop  = params.get('proposta')
    if (abrir && contracts.length) {
      const c = contracts.find(x => x.id === abrir)
      if (c) { setEditing(c); setDefaults({ lead: null, proposal: null }); setOpen(true) }
      params.delete('abrir'); setParams(params, { replace: true })
    } else if ((novo || prop) && (!prop || proposals.length)) {
      setEditing(null); setDefaults({ lead: novo, proposal: prop }); setOpen(true)
      params.delete('novo'); params.delete('proposta'); setParams(params, { replace: true })
    }
  }, [params, contracts, proposals, setParams])

  async function remove(c: CrmContract) {
    if (!window.confirm(`Excluir o contrato "${c.title}"?`)) return
    try {
      await del.mutateAsync(c.id)
      toast('Contrato excluído', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao excluir', 'error')
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--sm-bg-page)' }}>
      <CrmHeader
        subtitle="Contratos com assinatura eletrônica"
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setDefaults({ lead: null, proposal: null }); setOpen(true) }}>
            <Plus className="w-3.5 h-3.5" /> Novo contrato
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sm-text-3)' }} /></div>
        ) : contracts.length === 0 ? (
          <div className="py-16 text-center">
            <PenLine className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--sm-text-4)' }} />
            <p className="text-[13px]" style={{ color: 'var(--sm-text-2)' }}>Nenhum contrato ainda.</p>
            <p className="text-[12px] mt-1 max-w-sm mx-auto" style={{ color: 'var(--sm-text-4)' }}>
              O jeito mais rápido: numa proposta aceita, clique em "Gerar contrato". O texto já vem preenchido.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {contracts.map(c => {
              const S = CONTRACT_STATUS[c.status]
              return (
                <li key={c.id} className="rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap"
                    style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
                  <button className="flex-1 min-w-[200px] text-left" onClick={() => { setEditing(c); setOpen(true) }}>
                    <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{c.title}</p>
                    <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-3)' }}>
                      {leadName(c.lead_id) ?? 'Sem lead'}
                      {c.sent_at && ` · enviado ${fmtShortDate(c.sent_at)}`}
                      {c.viewed_at && !c.signed_at && ' · já aberto pelo cliente'}
                      {c.signed_at && ` · assinado ${fmtShortDate(c.signed_at)} por ${c.signer_name}`}
                    </p>
                  </button>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ color: S.color, background: `${S.color}1f` }}>
                    {S.label}
                  </span>
                  {c.status === 'enviado' && (() => {
                    const lead = leads.find(l => l.id === c.lead_id)
                    return lead?.whatsapp ? (
                      <Button size="icon-sm" variant="ghost" title="Enviar no WhatsApp" asChild>
                        <a href={waLink(lead.whatsapp, contractMessage(lead, agency, contractLink(c.public_token)))} target="_blank" rel="noreferrer">
                          <MessageCircle className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />
                        </a>
                      </Button>
                    ) : null
                  })()}
                  {(c.status === 'enviado' || c.status === 'assinado') && (
                    <Button size="icon-sm" variant="ghost" title="Copiar link"
                            onClick={async () => toast((await copyText(contractLink(c.public_token))) ? 'Link copiado' : 'Não consegui copiar', 'success')}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {c.status !== 'assinado' && (
                    <Button size="icon-sm" variant="ghost" title="Excluir" onClick={() => remove(c)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <CrmContractEditor
        open={open}
        onClose={() => setOpen(false)}
        contract={editingFresh}
        leads={editorLeads}
        proposals={proposals}
        defaultLeadId={defaults.lead}
        defaultProposalId={defaults.proposal}
      />
    </div>
  )
}
