// ── Utilitários do CRM ───────────────────────────────────────────────────────
// Funções puras compartilhadas pelo board, ficha do lead, propostas, contratos
// e páginas públicas.

import type { CrmLead, CrmProposal, CrmProposalItem } from '@/types'

export function fmtBRL(n: number, cents = false) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(n)
}

/** Só a data, sem fuso: 'yyyy-mm-dd' comparado como texto evita o off-by-one do UTC. */
export function todayISO(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtShortDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export function fmtLongDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// O projeto compila para ES2020, que ainda não tem String.replaceAll
function replaceAll(text: string, find: string, value: string) {
  return text.split(find).join(value)
}

export function onlyDigits(s: string) {
  return s.replace(/\D/g, '')
}

/** Link wa.me para o número do lead (Brasil), com a mensagem já escrita. */
export function waLink(phone: string, text?: string) {
  let n = onlyDigits(phone)
  if (!n.startsWith('55') || n.length <= 11) n = '55' + n
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/** Mesmas variáveis que o banco preenche nas automações (crm_fill_vars). */
export function fillVars(text: string, lead: Pick<CrmLead, 'name' | 'company'>, agency: string) {
  const first = lead.name.trim().split(/\s+/)[0] ?? ''
  let t = replaceAll(text, '{nome}', lead.name)
  t = replaceAll(t, '{primeiro_nome}', first)
  t = replaceAll(t, '{empresa}', lead.company || lead.name)
  return replaceAll(t, '{agencia}', agency)
}

export function itemTotal(i: CrmProposalItem) {
  return Math.max(Number(i.quantity) || 0, 0) * Math.max(Number(i.unit_price) || 0, 0)
}

/** Espelha o cálculo do banco (crm_proposal_before_write), só para exibir antes de salvar. */
export function proposalTotals(items: CrmProposalItem[], discount: number) {
  const subtotal = items.reduce((s, i) => s + itemTotal(i), 0)
  const d = Math.max(Number(discount) || 0, 0)
  return { subtotal, discount: d, total: Math.max(subtotal - d, 0) }
}

export function publicUrl(path: string) {
  return `${window.location.origin}${path}`
}

export const proposalLink = (p: Pick<CrmProposal, 'public_token'>) => publicUrl(`/proposta/${p.public_token}`)
export const contractLink = (token: string) => publicUrl(`/contrato/${token}`)
export const captureLink  = (token: string) => publicUrl(`/captura/${token}`)

/** Troca as {{variáveis}} do modelo de contrato pelos dados do lead e da proposta. */
export function fillContract(
  template: string,
  ctx: {
    lead?: Pick<CrmLead, 'name' | 'company' | 'email' | 'whatsapp'> | null
    proposal?: Pick<CrmProposal, 'items' | 'total' | 'payment_terms'> | null
    agency: string
  },
) {
  const { lead, proposal, agency } = ctx
  const services = proposal?.items?.length
    ? proposal.items.map(i => {
        const qty = Number(i.quantity) > 1 ? `${i.quantity}x ` : ''
        const price = fmtBRL(itemTotal(i), true) + (i.recurring ? '/mês' : '')
        return `• ${qty}${i.description}${i.details ? ` (${i.details})` : ''}: ${price}`
      }).join('\n')
    : '• [descreva os serviços]'

  const map: Record<string, string> = {
    '{{cliente_nome}}':        lead?.name || '[nome do cliente]',
    '{{cliente_empresa}}':     lead?.company || lead?.name || '[empresa]',
    '{{cliente_email}}':       lead?.email || '[e-mail]',
    '{{cliente_whatsapp}}':    lead?.whatsapp || '[WhatsApp]',
    '{{agencia_nome}}':        agency,
    '{{servicos}}':            services,
    '{{valor_total}}':         proposal ? fmtBRL(Number(proposal.total), true) : '[valor]',
    '{{condicoes_pagamento}}': proposal?.payment_terms || '[condições de pagamento]',
    '{{data_hoje}}':           fmtLongDate(todayISO()),
  }
  return Object.entries(map).reduce((t, [k, v]) => replaceAll(t, k, v), template)
}

/** Validação completa de CPF/CNPJ (dígitos verificadores), antes de mandar ao banco. */
export function isValidCpfCnpj(raw: string) {
  const d = onlyDigits(raw)
  if (/^(\d)\1+$/.test(d)) return false
  if (d.length === 11) {
    const calc = (len: number) => {
      let s = 0
      for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i)
      const r = (s * 10) % 11
      return r === 10 ? 0 : r
    }
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
  }
  if (d.length === 14) {
    const calc = (len: number) => {
      const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      const s = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0)
      const r = s % 11
      return r < 2 ? 0 : 11 - r
    }
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
  }
  return false
}

export function fmtCpfCnpj(raw: string) {
  const d = onlyDigits(raw).slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
