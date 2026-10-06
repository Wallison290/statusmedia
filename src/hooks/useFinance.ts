// ── Financeiro (Fase 1): lançamentos, contas, categorias, recorrências ───────
// Tabelas da migration 090. Tudo pertence à agência (agencyId) e vale para os
// sócios. "Atrasado" não existe no banco: é aberto + vencimento no passado
// (entryState abaixo).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'

const db = () => supabase as any

export type FinType = 'receita' | 'despesa'
export type EntryStatus = 'aberto' | 'pago' | 'cancelado'
export type EntryState = 'pago' | 'aberto' | 'atrasado' | 'cancelado'

export interface FinAccount {
  id: string; user_id: string; name: string
  kind: 'banco' | 'caixa' | 'carteira' | 'outro'
  initial_balance: number; is_default: boolean; is_active: boolean
  balance: number
}
export interface FinCategory {
  id: string; name: string; type: FinType
  dre_group: 'receita' | 'deducao' | 'custo' | 'despesa'
  color: string; system_key: string | null; is_active: boolean
}
export interface FinEntry {
  id: string; type: FinType; description: string
  amount: number; due_date: string; competence: string
  status: EntryStatus; paid_at: string | null; paid_amount: number | null
  account_id: string | null; category_id: string | null
  client_id: string | null; counterparty: string | null
  recurrence_id: string | null; contract_id: string | null
  installment: number | null; installments: number | null
  notes: string | null; created_by: string | null; updated_by: string | null
  created_at: string; updated_at: string
  clients?: { company_name: string } | null
}
export interface FinRecurrence {
  id: string; type: FinType; description: string; amount: number
  category_id: string | null; account_id: string | null
  client_id: string | null; counterparty: string | null
  interval_months: number; day_of_month: number
  start_date: string; end_date: string | null; is_active: boolean
  source: 'manual' | 'cliente' | 'contrato'; contract_id: string | null
  clients?: { company_name: string } | null
}
export interface FinTransfer {
  id: string; from_account_id: string; to_account_id: string
  amount: number; transfer_date: string; notes: string | null
}
export interface FinAuditEvent {
  id: number; table_name: string; row_id: string
  action: 'criou' | 'alterou' | 'excluiu'
  actor_name: string | null; summary: string | null
  changes: Record<string, any> | null; at: string
}
export interface SignedContract {
  id: string; title: string; signed_at: string | null; signer_name: string | null
  lead_id: string | null; proposal_id: string | null
  crm_leads?: { name: string; company: string | null; converted_client_id: string | null } | null
  crm_proposals?: { items: any[]; discount: number; total: number } | null
}

// ── Utilidades ───────────────────────────────────────────────────────────────

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function monthStartISO(iso: string) { return iso.slice(0, 7) + '-01' }
export function addMonthsISO(iso: string, months: number, day?: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y, m - 1 + months, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  const dd = Math.min(day ?? d, last)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}
export function entryState(e: Pick<FinEntry, 'status' | 'due_date'>): EntryState {
  if (e.status === 'aberto' && e.due_date < todayISO()) return 'atrasado'
  return e.status
}
export function daysBetween(fromISO: string, toISO: string) {
  return Math.round((new Date(toISO + 'T00:00:00').getTime() - new Date(fromISO + 'T00:00:00').getTime()) / 86_400_000)
}
export const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const fmtDateBR = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

// ── Leituras ─────────────────────────────────────────────────────────────────

/** Garante categorias e conta padrão da agência (idempotente). */
export function useFinBootstrap() {
  const { agencyId } = useAuth()
  return useQuery({
    queryKey: ['fin_bootstrap', agencyId],
    enabled: !!agencyId,
    staleTime: Infinity,
    queryFn: async () => {
      const { error } = await db().rpc('fin_bootstrap')
      if (error) throw error
      return true
    },
  })
}

export function useFinAccounts() {
  const { agencyId } = useAuth()
  return useQuery<FinAccount[]>({
    queryKey: ['fin_accounts', agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await db().from('fin_account_balances')
        .select('*').eq('user_id', agencyId).order('is_default', { ascending: false }).order('name')
      if (error) throw error
      return (data ?? []).map((a: any) => ({ ...a, balance: Number(a.balance), initial_balance: Number(a.initial_balance) }))
    },
  })
}

export function useFinCategories() {
  const { agencyId } = useAuth()
  return useQuery<FinCategory[]>({
    queryKey: ['fin_categories', agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await db().from('fin_categories')
        .select('*').eq('user_id', agencyId).order('type').order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

const ENTRY_SELECT = '*, clients(company_name)'
const num = (e: any): FinEntry => ({
  ...e, amount: Number(e.amount), paid_amount: e.paid_amount == null ? null : Number(e.paid_amount),
})

/** Lançamentos com vencimento OU pagamento dentro do intervalo. */
export function useFinEntries(fromISO: string, toISO: string) {
  const { agencyId } = useAuth()
  return useQuery<FinEntry[]>({
    queryKey: ['fin_entries', agencyId, fromISO, toISO],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await db().from('fin_entries')
        .select(ENTRY_SELECT).eq('user_id', agencyId)
        .or(`and(due_date.gte.${fromISO},due_date.lte.${toISO}),and(paid_at.gte.${fromISO},paid_at.lte.${toISO})`)
        .order('due_date')
      if (error) throw error
      return (data ?? []).map(num)
    },
  })
}

/** Tudo em aberto até a data (inadimplência e fluxo de caixa). */
export function useFinOpenUntil(toISO: string) {
  const { agencyId } = useAuth()
  return useQuery<FinEntry[]>({
    queryKey: ['fin_entries', agencyId, 'open', toISO],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await db().from('fin_entries')
        .select(ENTRY_SELECT).eq('user_id', agencyId).eq('status', 'aberto')
        .lte('due_date', toISO).order('due_date')
      if (error) throw error
      return (data ?? []).map(num)
    },
  })
}

export function useFinRecurrences() {
  const { agencyId } = useAuth()
  return useQuery<FinRecurrence[]>({
    queryKey: ['fin_recurrences', agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await db().from('fin_recurrences')
        .select('*, clients(company_name)').eq('user_id', agencyId)
        .order('is_active', { ascending: false }).order('type').order('description')
      if (error) throw error
      return (data ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) }))
    },
  })
}

export function useFinTransfers() {
  const { agencyId } = useAuth()
  return useQuery<FinTransfer[]>({
    queryKey: ['fin_transfers', agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await db().from('fin_transfers')
        .select('*').eq('user_id', agencyId).order('transfer_date', { ascending: false }).limit(50)
      if (error) throw error
      return (data ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) }))
    },
  })
}

export function useFinAudit(limit = 100) {
  const { agencyId } = useAuth()
  return useQuery<FinAuditEvent[]>({
    queryKey: ['fin_audit', agencyId, limit],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await db().from('fin_audit_log')
        .select('*').eq('user_id', agencyId).order('at', { ascending: false }).limit(limit)
      if (error) throw error
      return data ?? []
    },
  })
}

/** Contratos assinados no CRM que ainda não geraram nada no Financeiro. */
export function useContractsAwaitingBilling() {
  const { agencyId } = useAuth()
  return useQuery<SignedContract[]>({
    queryKey: ['fin_contracts_awaiting', agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const [{ data: contracts, error }, { data: billedE }, { data: billedR }] = await Promise.all([
        db().from('crm_contracts')
          .select('id, title, signed_at, signer_name, lead_id, proposal_id, crm_leads(name, company, converted_client_id), crm_proposals(items, discount, total)')
          .eq('user_id', agencyId).eq('status', 'assinado').order('signed_at', { ascending: false }),
        db().from('fin_entries').select('contract_id').eq('user_id', agencyId).not('contract_id', 'is', null),
        db().from('fin_recurrences').select('contract_id').eq('user_id', agencyId).not('contract_id', 'is', null),
      ])
      if (error) throw error
      const billed = new Set([...(billedE ?? []), ...(billedR ?? [])].map((x: any) => x.contract_id))
      return (contracts ?? []).filter((c: any) => !billed.has(c.id))
    },
  })
}

/** Valores de uma proposta: o que é recorrente (mensal) e o que é avulso. */
export function proposalSplit(p: SignedContract['crm_proposals']) {
  const items = Array.isArray(p?.items) ? p!.items : []
  let recurring = 0, oneOff = 0
  for (const it of items) {
    const v = (Number(it.quantity) || 1) * (Number(it.unit_price) || 0)
    if (it.recurring) recurring += v; else oneOff += v
  }
  // Desconto abate primeiro o avulso
  const discount = Number(p?.discount) || 0
  oneOff = Math.max(0, oneOff - discount)
  return { recurring, oneOff }
}

// ── Escritas ─────────────────────────────────────────────────────────────────

function useInvalidateFinance() {
  const qc = useQueryClient()
  return () => {
    for (const k of ['fin_entries', 'fin_accounts', 'fin_recurrences', 'fin_transfers', 'fin_audit',
                     'fin_contracts_awaiting', 'clients', 'client_payments']) {
      qc.invalidateQueries({ queryKey: [k] })
    }
  }
}

export interface EntryInput {
  type: FinType; description: string; amount: number; due_date: string
  competence?: string; category_id: string | null; account_id: string | null
  client_id: string | null; counterparty: string | null; notes: string | null
  contract_id?: string | null
  /** Parcelar: gera N lançamentos mensais (valor de cada parcela = amount) */
  installments?: number
  /** Já pago no ato (data do pagamento) */
  paid_at?: string | null
}

export function useSaveEntry() {
  const { agencyId } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: EntryInput }) => {
      const base = {
        type: input.type, description: input.description.trim(), amount: input.amount,
        category_id: input.category_id, account_id: input.account_id,
        client_id: input.client_id, counterparty: input.counterparty?.trim() || null,
        notes: input.notes?.trim() || null, contract_id: input.contract_id ?? null,
      }
      if (id) {
        const { error } = await db().from('fin_entries').update({
          ...base, due_date: input.due_date,
          competence: input.competence ?? monthStartISO(input.due_date),
          updated_at: new Date().toISOString(),
        }).eq('id', id)
        if (error) throw error
        return
      }
      const n = Math.max(1, Math.min(60, input.installments ?? 1))
      const day = Number(input.due_date.slice(8, 10))
      const rows = Array.from({ length: n }, (_, i) => {
        const due = i === 0 ? input.due_date : addMonthsISO(input.due_date, i, day)
        return {
          ...base, user_id: agencyId, due_date: due, competence: monthStartISO(due),
          description: n > 1 ? `${base.description} (${i + 1}/${n})` : base.description,
          installment: n > 1 ? i + 1 : null, installments: n > 1 ? n : null,
        }
      })
      const { data, error } = await db().from('fin_entries').insert(rows).select('id')
      if (error) throw error
      if (input.paid_at && data?.[0]) {
        const { error: e2 } = await db().rpc('fin_settle', {
          p_entry: data[0].id, p_paid_at: input.paid_at, p_amount: input.amount,
          p_account: input.account_id, p_notes: null,
        })
        if (e2) throw e2
      }
    },
    onSuccess: invalidate,
  })
}

export function useDeleteEntry() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async (entry: FinEntry) => {
      // Lançamento de cliente já pago: estorna antes, para limpar o histórico
      if (entry.status === 'pago') {
        const { error } = await db().rpc('fin_reopen', { p_entry: entry.id })
        if (error) throw error
      }
      // Parcela de recorrência é cancelada (não apagada), senão a rotina diária a recria
      const q = entry.recurrence_id
        ? db().from('fin_entries').update({ status: 'cancelado' }).eq('id', entry.id)
        : db().from('fin_entries').delete().eq('id', entry.id)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSettleEntry() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async (p: { id: string; paid_at: string; amount: number; account_id: string | null; notes?: string }) => {
      const { error } = await db().rpc('fin_settle', {
        p_entry: p.id, p_paid_at: p.paid_at, p_amount: p.amount,
        p_account: p.account_id, p_notes: p.notes ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useReopenEntry() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().rpc('fin_reopen', { p_entry: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export interface RecurrenceInput {
  type: FinType; description: string; amount: number
  category_id: string | null; account_id: string | null
  client_id: string | null; counterparty: string | null
  interval_months: number; day_of_month: number
  start_date: string; end_date: string | null; is_active: boolean
  contract_id?: string | null
}

export function useSaveRecurrence() {
  const { agencyId } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: RecurrenceInput }) => {
      const row = {
        ...input, description: input.description.trim(),
        counterparty: input.counterparty?.trim() || null,
        source: input.contract_id ? 'contrato' : 'manual',
      }
      const { error } = id
        ? await db().from('fin_recurrences').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id)
        : await db().from('fin_recurrences').insert({ ...row, user_id: agencyId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSaveAccount() {
  const { agencyId } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async ({ id, name, kind, initial_balance, is_active }:
      { id?: string; name: string; kind: FinAccount['kind']; initial_balance: number; is_active?: boolean }) => {
      const row = { name: name.trim(), kind, initial_balance, is_active: is_active ?? true }
      const { error } = id
        ? await db().from('fin_accounts').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id)
        : await db().from('fin_accounts').insert({ ...row, user_id: agencyId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSaveCategory() {
  const { agencyId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...c }: { id?: string; name: string; type: FinType; dre_group: FinCategory['dre_group']; color: string; is_active?: boolean }) => {
      const row = { ...c, name: c.name.trim() }
      const { error } = id
        ? await db().from('fin_categories').update(row).eq('id', id)
        : await db().from('fin_categories').insert({ ...row, user_id: agencyId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin_categories'] })
      qc.invalidateQueries({ queryKey: ['fin_audit'] })
    },
  })
}

export function useCreateTransfer() {
  const { agencyId } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async (t: { from_account_id: string; to_account_id: string; amount: number; transfer_date: string; notes: string | null }) => {
      const { error } = await db().from('fin_transfers').insert({ ...t, user_id: agencyId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
