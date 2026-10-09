// ── Aba "Clientes" do Financeiro ──────────────────────────────────────────────
// A mensalidade de cada cliente e a situação (em dia, vence em breve, atrasado,
// cancelado). A página com as abas é FinancePage. Mesmo visual das outras abas
// (finUi): números no topo, lista com barra de situação, janelas padronizadas.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, ExternalLink, ChevronDown, MessageCircle, History, Loader2, RefreshCw, Check, AlertTriangle,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useClients, useUpdateClient } from '@/hooks/useClients'
import { useCreatePayment, useClientPayments } from '@/hooks/usePayments'
import { useSendBillingNow } from '@/hooks/useFinance'
import { usePlanFeature } from '@/components/plan/PlanLocked'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { calcFinancialStatus, financialStatusLabel, getFinancialAuxText } from '@/utils/financial'
import type { Client, FinancialStatus } from '@/types'
import {
  Card, SectionTitle, EmptyState, Modal, Field, TextInput, PrimaryButton, GhostButton,
  KpiTile, TabSkeleton, parseMoney, moneyToInput,
} from './finUi'

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const currentMonthLabel = () => { const n = new Date(); return `${MONTHS_PT[n.getMonth()]} ${n.getFullYear()}` }
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const brl = (n: number, cents = true) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: cents ? 2 : 0 }).format(n)
const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—')

type FilterKey = 'todos' | FinancialStatus
const FILTERS: [FilterKey, string][] = [
  ['todos', 'Todos'], ['ativo', 'Em dia'], ['vence_em_breve', 'Vence em breve'], ['atrasado', 'Atrasados'], ['cancelado', 'Cancelados'],
]
// Situação = barrinha + ponto + texto (nunca só cor)
const STATUS_COLOR: Record<FinancialStatus, string> = {
  ativo: '#22C55E', vence_em_breve: '#F59E0B', atrasado: '#EF4444', cancelado: '#64748B',
}

function StatusLabel({ status }: { status: FinancialStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap" style={{ color: 'var(--sm-text-2)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {financialStatusLabel(status)}
    </span>
  )
}

// ── Menu de situação (automático ou manual) ──────────────────────────────────

function StatusMenu({ client }: { client: Client }) {
  const [open, setOpen] = useState(false)
  const update = useUpdateClient()
  const { toast } = useToast()
  const isAuto = !client.manual_status_override

  const choose = async (patch: Partial<Client>, msg: string) => {
    try { await update.mutateAsync({ id: client.id, ...patch } as any); toast(msg, 'success'); setOpen(false) }
    catch (err: any) { toast(err.message, 'error') }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={update.isPending}
        className="h-8 w-[96px] inline-flex items-center justify-center gap-1 rounded-lg text-[12px] hover:bg-black/5 transition-colors"
        style={{ color: 'var(--sm-text-3)' }} title="Alterar situação">
        Situação <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-56 max-w-[90vw] rounded-xl border overflow-hidden shadow-2xl"
            style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
            <button onClick={() => choose({ manual_status_override: false }, 'Situação no automático (segue a data de vencimento).')}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] text-left hover:bg-white/5" style={{ color: 'var(--sm-text-1)' }}>
              <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} />
              <span className="flex-1">Automático<span className="block text-[11px]" style={{ color: 'var(--sm-text-4)' }}>Segue a data de vencimento</span></span>
              {isAuto && <Check className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />}
            </button>
            <div className="h-px" style={{ background: 'var(--sm-border)' }} />
            {(['ativo', 'vence_em_breve', 'atrasado', 'cancelado'] as FinancialStatus[]).map(s => (
              <button key={s} onClick={() => choose({ financial_status: s, manual_status_override: true }, 'Situação atualizada.')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-left hover:bg-white/5" style={{ color: 'var(--sm-text-2)' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[s] }} />
                <span className="flex-1">{financialStatusLabel(s)}</span>
                {client.manual_status_override && client.financial_status === s && <Check className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Registrar pagamento ──────────────────────────────────────────────────────

function RegisterPaymentModal({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { agencyId } = useAuth()
  const create = useCreatePayment()
  const { toast } = useToast()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [ref, setRef] = useState(currentMonthLabel())
  const [notes, setNotes] = useState('')
  const [lastId, setLastId] = useState<string | null>(null)

  // Reinicia ao abrir para outro cliente
  if (client && client.id !== lastId) {
    setLastId(client.id)
    setAmount(moneyToInput(client.valor_mensal ?? 0)); setDate(todayISO()); setRef(currentMonthLabel()); setNotes('')
  }
  if (!client) return null

  const submit = async () => {
    const value = parseMoney(amount)
    if (value <= 0 || !date || !ref.trim()) return toast('Preencha valor, data e mês de referência.', 'error')
    try {
      await create.mutateAsync({ client_id: client.id, user_id: agencyId!, amount: value, payment_date: date, reference_month: ref.trim(), notes: notes.trim() || null })
      toast(`Pagamento de ${client.company_name} registrado.`, 'success')
      setLastId(null); onClose()
    } catch (err: any) { toast(err.message, 'error') }
  }

  return (
    <Modal open onClose={() => { setLastId(null); onClose() }} title="Registrar pagamento" footer={<>
      <GhostButton onClick={() => { setLastId(null); onClose() }}>Cancelar</GhostButton>
      <PrimaryButton onClick={submit} disabled={create.isPending}>
        {create.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Confirmar pagamento'}
      </PrimaryButton>
    </>}>
      <div className="space-y-3.5">
        <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{client.company_name}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)"><TextInput inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></Field>
          <Field label="Data do pagamento"><TextInput type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Mês de referência" hint="Dá baixa na mensalidade deste mês no Financeiro.">
          <TextInput value={ref} onChange={e => setRef(e.target.value)} placeholder="Ex.: Outubro 2026" />
        </Field>
        <Field label="Observação (opcional)"><TextInput value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex.: pagou por Pix" /></Field>
      </div>
    </Modal>
  )
}

// ── Histórico de pagamentos ──────────────────────────────────────────────────

// Próxima mensalidade em aberto do cliente (parcela do Financeiro)
function useNextOpenEntry(clientId: string | null) {
  return useQuery({
    queryKey: ['fin-next-open-entry', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fin_entries')
        .select('id, amount, due_date, competence')
        .eq('client_id', clientId!).eq('type', 'receita').eq('status', 'aberto')
        .order('due_date').limit(1).maybeSingle()
      if (error) throw error
      return data as { id: string; amount: number; due_date: string; competence: string } | null
    },
  })
}

function PaymentHistoryModal({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { data: payments = [], isLoading } = useClientPayments(client?.id ?? null)
  const { data: next } = useNextOpenEntry(client?.id ?? null)
  if (!client) return null
  return (
    <Modal open onClose={onClose} title="Histórico de pagamentos" footer={<GhostButton onClick={onClose}>Fechar</GhostButton>}>
      <p className="text-[13px] font-semibold mb-3" style={{ color: 'var(--sm-text-1)' }}>{client.company_name}</p>
      {next && (
        <div className="mb-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: 'var(--sm-text-4)' }}>Próximo a receber</p>
          <div className="relative rounded-xl border pl-4 pr-3 py-2.5 flex items-center gap-3" style={{ borderColor: 'var(--sm-border)' }}>
            <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r" style={{ background: '#F59E0B' }} />
            <p className="flex-1 text-[13px] font-medium" style={{ color: 'var(--sm-text-1)' }}>
              {MONTHS_PT[Number(next.competence.slice(5, 7)) - 1]} {next.competence.slice(0, 4)}
            </p>
            <div className="text-right">
              <p className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{brl(Number(next.amount))}</p>
              <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>vence {fmtDate(next.due_date)}</p>
            </div>
          </div>
        </div>
      )}
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: 'var(--sm-text-4)' }}>Pagamentos recebidos</p>
      {isLoading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sm-text-4)' }} /></div>
      ) : payments.length === 0 ? (
        <EmptyState title="Nenhum pagamento registrado ainda" />
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sm-border)' }}>
          {payments.map((p, i) => (
            <div key={p.id} className={`relative pl-4 pr-3 py-2.5 flex items-center gap-3 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
              <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r" style={{ background: p.status === 'pago' ? '#22C55E' : '#EF4444' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium" style={{ color: 'var(--sm-text-1)' }}>{p.reference_month}</p>
                {p.notes && <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-4)' }}>{p.notes}</p>}
              </div>
              <div className="text-right">
                <p className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{brl(p.amount)}</p>
                <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>{fmtDate(p.payment_date)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ── Linha do cliente ─────────────────────────────────────────────────────────
// Tabela de colunas FIXAS (md+): a mensalidade fica sempre no mesmo eixo,
// apareça ou não texto extra/botão "Cobrar". As ações têm vagas reservadas:
// botão que não se aplica vira um espaço vazio do mesmo tamanho.
// No celular cada cliente vira um cartão empilhado.

const COLS = 'md:grid md:grid-cols-[minmax(0,1fr)_132px_140px_128px_340px] md:items-center md:gap-x-4'

function ClientTableHeader() {
  return (
    <div className={`hidden ${COLS} pl-5 pr-4 py-2.5 border-b text-[10.5px] font-semibold uppercase tracking-[0.08em]`}
      style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-4)' }}>
      <span>Cliente</span>
      <span className="text-right">Mensalidade</span>
      <span>Situação</span>
      <span className="text-right">Último pagamento</span>
      <span className="text-right pr-1">Ações</span>
    </div>
  )
}

function ClientRow({ client, first, onPay, onHistory }: {
  client: Client; first: boolean; onPay: (c: Client) => void; onHistory: (c: Client) => void
}) {
  const { toast } = useToast()
  const sendNow = useSendBillingNow()
  const status = calcFinancialStatus(client)
  const aux = getFinancialAuxText(client, status)
  // "Cobrar" envia a mensagem da cobrança automática (planos Pro e Agency)
  const { allowed: autoBilling } = usePlanFeature('autoBilling')
  const canCharge = autoBilling && (status === 'atrasado' || status === 'vence_em_breve') && !!client.whatsapp
  const canPay = status !== 'cancelado'

  const charge = async () => {
    try { await sendNow.mutateAsync(client.id); toast(`Cobrança enviada para ${client.company_name}.`, 'success') }
    catch (err: any) { toast(err.message ?? 'Erro ao enviar.', 'error') }
  }

  return (
    <div className={`relative pl-5 pr-3 md:pr-4 py-3 flex flex-col gap-2.5 ${COLS} ${first ? '' : 'border-t'}`}
      style={{ borderColor: 'var(--sm-border)' }}>
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: STATUS_COLOR[status] }} />

      {/* Cliente */}
      <div className="flex items-center gap-3 min-w-0">
        {client.logo_url ? (
          <img src={client.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border" style={{ borderColor: 'var(--sm-border)' }} />
        ) : (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[13px] font-semibold flex-shrink-0"
            style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-3)' }}>{client.company_name[0]?.toUpperCase()}</div>
        )}
        <div className="min-w-0">
          <Link to={`/clients/${client.id}`} className="block text-[14px] font-semibold truncate hover:underline" style={{ color: 'var(--sm-text-1)' }}>
            {client.company_name}
          </Link>
          <p className="text-[11.5px] truncate h-[17px]" style={{ color: status === 'atrasado' ? '#EF4444' : status === 'vence_em_breve' ? '#F59E0B' : 'var(--sm-text-4)' }}>
            {aux ?? ''}
          </p>
        </div>
      </div>

      {/* Mensalidade + situação (no celular, lado a lado) */}
      <div className="flex items-center justify-between md:contents">
        <div className="md:text-right">
          <p className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>
            {client.valor_mensal != null ? brl(client.valor_mensal) : '—'}
          </p>
          <p className="text-[11px] h-[16px]" style={{ color: 'var(--sm-text-4)' }}>
            {client.dia_vencimento != null ? `vence dia ${client.dia_vencimento}` : ''}
          </p>
        </div>
        <div><StatusLabel status={status} /></div>
      </div>

      {/* Último pagamento */}
      <div className="hidden md:block text-right text-[12px] tabular-nums" style={{ color: 'var(--sm-text-3)' }}>
        {client.last_payment_date ? fmtDate(client.last_payment_date) : <span style={{ color: 'var(--sm-text-4)' }}>sem pagamento</span>}
      </div>

      {/* Ações: vagas fixas para não deslocar nada */}
      <div className="flex items-center gap-1 md:justify-end">
        <span className="w-[86px] flex justify-end">
          {canCharge && (
            <button onClick={charge} disabled={sendNow.isPending} title="Enviar cobrança com Pix"
              className="h-8 w-full rounded-lg text-[12px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
              style={{ background: 'rgba(37,211,102,0.12)', color: '#16A34A' }}>
              {sendNow.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />} Cobrar
            </button>
          )}
        </span>
        <span className="w-[90px]">
          {canPay && (
            <button onClick={() => onPay(client)} title="Registrar que o cliente pagou a mensalidade"
              className="h-8 w-full rounded-lg border text-[12px] font-semibold inline-flex items-center justify-center gap-1 hover:bg-black/5"
              style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
              <Check className="w-3.5 h-3.5" /> Dar baixa
            </button>
          )}
        </span>
        <button onClick={() => onHistory(client)} title="Histórico de pagamentos" aria-label="Histórico de pagamentos"
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 flex-shrink-0" style={{ color: 'var(--sm-text-3)' }}>
          <History className="w-3.5 h-3.5" />
        </button>
        <StatusMenu client={client} />
        <Link to={`/clients/${client.id}`} title="Abrir perfil" aria-label="Abrir perfil"
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 flex-shrink-0" style={{ color: 'var(--sm-text-3)' }}>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

// ── Aba ──────────────────────────────────────────────────────────────────────

export function ClientBillingTab() {
  const { data: allClients = [], isLoading } = useClients()
  const [filter, setFilter] = useState<FilterKey>('todos')
  const [search, setSearch] = useState('')
  const [paying, setPaying] = useState<Client | null>(null)
  const [history, setHistory] = useState<Client | null>(null)

  const withStatus = useMemo(() =>
    allClients.filter(c => c.valor_mensal != null || c.dia_vencimento != null)
      .map(c => ({ client: c, status: calcFinancialStatus(c) })),
  [allClients])

  const k = useMemo(() => {
    const now = new Date()
    const sum = (xs: typeof withStatus) => xs.reduce((s, x) => s + (x.client.valor_mensal ?? 0), 0)
    const live = withStatus.filter(x => x.status !== 'cancelado')
    const previstoList = withStatus.filter(x => x.status === 'ativo' || x.status === 'vence_em_breve')
    const overdue = withStatus.filter(x => x.status === 'atrasado')
    const soon = withStatus.filter(x => x.status === 'vence_em_breve')
    const received = withStatus.filter(x => {
      if (!x.client.last_payment_date) return false
      const [y, m] = x.client.last_payment_date.split('-').map(Number)
      return y === now.getFullYear() && m === now.getMonth() + 1
    })
    const mrr = sum(live), previsto = sum(previstoList)
    return {
      mrr, mrrCount: live.length, previsto, received: sum(received), receivedCount: received.length,
      overdue: sum(overdue), overdueCount: overdue.length, soon: sum(soon), soonCount: soon.length,
      ticket: live.length ? mrr / live.length : 0,
    }
  }, [withStatus])

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { todos: withStatus.length, ativo: 0, vence_em_breve: 0, atrasado: 0, cancelado: 0 }
    withStatus.forEach(x => { c[x.status]++ })
    return c
  }, [withStatus])

  const list = withStatus.filter(x =>
    (filter === 'todos' || x.status === filter) &&
    (!search.trim() || x.client.company_name.toLowerCase().includes(search.trim().toLowerCase())))

  if (isLoading) return <TabSkeleton kpis={6} blocks={[380]} />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile label="Recebido no mês" value={brl(k.received, false)} sub={`${k.receivedCount} pagamento(s)`} tone="good" />
        <KpiTile label="MRR" value={brl(k.mrr, false)} sub={`${k.mrrCount} contrato(s) ativo(s)`} />
        <KpiTile label="Previsto" value={brl(k.previsto, false)} sub="em dia + vence em breve" />
        <KpiTile label="Vence em breve" value={k.soonCount ? brl(k.soon, false) : '—'} sub={`${k.soonCount} cliente(s) em até 5 dias`}
          tone={k.soonCount ? 'warn' : undefined} active={filter === 'vence_em_breve'}
          onClick={k.soonCount ? () => setFilter(f => f === 'vence_em_breve' ? 'todos' : 'vence_em_breve') : undefined} />
        <KpiTile label="Em atraso" value={k.overdueCount ? brl(k.overdue, false) : '—'} sub={`${k.overdueCount} cliente(s)`}
          tone={k.overdueCount ? 'bad' : undefined} active={filter === 'atrasado'}
          onClick={k.overdueCount ? () => setFilter(f => f === 'atrasado' ? 'todos' : 'atrasado') : undefined} />
        <KpiTile label="Ticket médio" value={brl(k.ticket, false)} sub="por cliente ativo" />
      </div>

      {k.overdueCount > 0 && k.previsto < k.mrr && (
        <div className="rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3"
          style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.07)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#F59E0B' }} />
          <p className="text-[13px] flex-1 min-w-[200px]" style={{ color: 'var(--sm-text-1)' }}>
            A receita prevista está <strong>{brl(k.mrr - k.previsto, false)}</strong> abaixo do MRR por causa de {k.overdueCount} cliente(s) em atraso.
          </p>
          <button onClick={() => setFilter('atrasado')} className="text-[12.5px] font-semibold" style={{ color: '#F59E0B' }}>Ver quem →</button>
        </div>
      )}

      <section>
        <SectionTitle n="01" title="Mensalidades dos clientes" />
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex gap-1 p-1 rounded-xl overflow-x-auto scrollbar-none max-w-full" style={{ background: 'var(--sm-bg-alt)' }}>
            {FILTERS.map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} className="h-8 px-3 rounded-lg text-[12.5px] font-medium whitespace-nowrap"
                style={filter === key ? { background: 'var(--sm-bg-card)', color: 'var(--sm-text-1)' } : { color: 'var(--sm-text-3)' }}>
                {label} <span className="tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{counts[key]}</span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--sm-text-4)' }} />
            <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente" className="pl-9" />
          </div>
        </div>
        <Card>
          {withStatus.length === 0 ? (
            <EmptyState title="Nenhum cliente com mensalidade" text="Cadastre o valor mensal e o dia de vencimento no perfil do cliente para ele aparecer aqui."
              action={<Link to="/clients" className="text-[13px] font-semibold" style={{ color: '#60A5FA' }}>Ir para Clientes →</Link>} />
          ) : list.length === 0 ? (
            <EmptyState title="Nenhum cliente neste filtro" />
          ) : <>
            <ClientTableHeader />
            {list.map(({ client }, i) => (
              <ClientRow key={client.id} client={client} first={i === 0} onPay={setPaying} onHistory={setHistory} />
            ))}
          </>}
        </Card>
        {list.length > 0 && (
          <p className="text-[11.5px] mt-2" style={{ color: 'var(--sm-text-4)' }}>
            {list.length} cliente(s). "Dar baixa" registra o pagamento na mensalidade do mês no Financeiro; "Cobrar" envia a mensagem com Pix da cobrança automática.
          </p>
        )}
      </section>

      <RegisterPaymentModal client={paying} onClose={() => setPaying(null)} />
      <PaymentHistoryModal client={history} onClose={() => setHistory(null)} />
    </div>
  )
}
