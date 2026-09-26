// ── Propostas e contratos do lead ────────────────────────────────────────────
// Visão rápida dentro da ficha. Criar e editar acontece nas abas próprias; aqui
// o botão leva para lá com o lead já escolhido.

import { useNavigate } from 'react-router-dom'
import { FileText, PenLine, Plus, ExternalLink, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCrmProposals, useCrmContracts } from '@/hooks/useCrmDocuments'
import { useCrmLeads } from '@/hooks/useCrm'
import { useAuth } from '@/hooks/useAuth'
import { proposalMessage, contractMessage } from './CrmShareBox'
import { PROPOSAL_STATUS, CONTRACT_STATUS } from './crmStatus'
import { fmtBRL, proposalLink, contractLink, waLink } from '@/utils/crm'

export function CrmLeadDocs({ leadId, onNavigate }: { leadId: string; onNavigate: () => void }) {
  const navigate = useNavigate()
  const { data: proposals = [] } = useCrmProposals()
  const { data: contracts = [] } = useCrmContracts()
  const { data: leads = [] } = useCrmLeads()
  const { profile } = useAuth()
  const agency = profile?.agency_name || profile?.full_name || 'nossa agência'
  const lead = leads.find(l => l.id === leadId) ?? null

  const props = proposals.filter(p => p.lead_id === leadId)
  const conts = contracts.filter(c => c.lead_id === leadId)

  function go(path: string) {
    onNavigate()
    navigate(path)
  }

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sm-text-3)' }}>Propostas</h4>
          <Button size="sm" variant="outline" onClick={() => go(`/crm/propostas?novo=${leadId}`)}>
            <Plus className="w-3 h-3" /> Nova proposta
          </Button>
        </div>
        {props.length === 0 ? (
          <p className="text-[11.5px] py-2" style={{ color: 'var(--sm-text-4)' }}>Nenhuma proposta ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {props.map(p => {
              const S = PROPOSAL_STATUS[p.status]
              return (
                <li key={p.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: 'var(--sm-bg-alt)' }}>
                  <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: S.color }} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => go(`/crm/propostas?abrir=${p.id}`)}>
                    <p className="text-[12.5px] truncate" style={{ color: 'var(--sm-text-1)' }}>{p.title}</p>
                    <p className="text-[10.5px]" style={{ color: 'var(--sm-text-4)' }}>
                      {fmtBRL(Number(p.total))} · <span style={{ color: S.color }}>{S.label}</span>
                      {p.view_count > 0 && ` · aberta ${p.view_count}x`}
                    </p>
                  </button>
                  {lead?.whatsapp && (p.status === 'enviada' || p.status === 'visualizada') && (
                    <a href={waLink(lead.whatsapp, proposalMessage(lead, agency, proposalLink(p)))} target="_blank" rel="noreferrer"
                       aria-label="Enviar no WhatsApp" title="Enviar no WhatsApp">
                      <MessageCircle className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />
                    </a>
                  )}
                  {p.status !== 'rascunho' && (
                    <a href={proposalLink(p)} target="_blank" rel="noreferrer" aria-label="Abrir link da proposta">
                      <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sm-text-3)' }}>Contratos</h4>
          <Button size="sm" variant="outline" onClick={() => go(`/crm/contratos?novo=${leadId}`)}>
            <Plus className="w-3 h-3" /> Novo contrato
          </Button>
        </div>
        {conts.length === 0 ? (
          <p className="text-[11.5px] py-2" style={{ color: 'var(--sm-text-4)' }}>Nenhum contrato ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {conts.map(c => {
              const S = CONTRACT_STATUS[c.status]
              return (
                <li key={c.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: 'var(--sm-bg-alt)' }}>
                  <PenLine className="w-3.5 h-3.5 flex-shrink-0" style={{ color: S.color }} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => go(`/crm/contratos?abrir=${c.id}`)}>
                    <p className="text-[12.5px] truncate" style={{ color: 'var(--sm-text-1)' }}>{c.title}</p>
                    <p className="text-[10.5px]" style={{ color: S.color }}>{S.label}</p>
                  </button>
                  {lead?.whatsapp && c.status === 'enviado' && (
                    <a href={waLink(lead.whatsapp, contractMessage(lead, agency, contractLink(c.public_token)))} target="_blank" rel="noreferrer"
                       aria-label="Enviar no WhatsApp" title="Enviar no WhatsApp">
                      <MessageCircle className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />
                    </a>
                  )}
                  {c.status !== 'rascunho' && c.status !== 'cancelado' && (
                    <a href={contractLink(c.public_token)} target="_blank" rel="noreferrer" aria-label="Abrir link do contrato">
                      <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
