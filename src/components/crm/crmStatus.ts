// Rótulo e cor de cada status de proposta e contrato — um lugar só, para a
// lista, a ficha do lead e o editor falarem a mesma língua.

import type { CrmProposalStatus, CrmContractStatus } from '@/types'

export const PROPOSAL_STATUS: Record<CrmProposalStatus, { label: string; color: string }> = {
  rascunho:    { label: 'Rascunho',    color: '#94a3b8' },
  enviada:     { label: 'Enviada',     color: '#4F8EF7' },
  visualizada: { label: 'Visualizada', color: '#8B5CF6' },
  aceita:      { label: 'Aceita',      color: '#22C55E' },
  recusada:    { label: 'Recusada',    color: '#ef4444' },
}

export const CONTRACT_STATUS: Record<CrmContractStatus, { label: string; color: string }> = {
  rascunho:  { label: 'Rascunho',               color: '#94a3b8' },
  enviado:   { label: 'Aguardando assinatura',  color: '#F5A623' },
  assinado:  { label: 'Assinado',               color: '#22C55E' },
  cancelado: { label: 'Cancelado',              color: '#ef4444' },
}
