import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Search, Check, Pencil, Undo2, Trash2, Repeat } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import {
  useFinEntries, useFinCategories, useFinAccounts, useReopenEntry, useDeleteEntry,
  entryState, fmtBRL, fmtDateBR, addMonthsISO, todayISO, monthStartISO,
  type FinEntry, type FinType, type EntryState,
} from '@/hooks/useFinance'
import { Card, StatePill, Amount, EmptyState, PrimaryButton, GhostButton, TextInput, SelectInput } from './finUi'
import { EntryModal, SettleModal } from './EntryModals'

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function EntriesTab() {
  const { toast } = useToast()
  const [month, setMonth] = useState(monthStartISO(todayISO()))
  const monthEnd = addMonthsISO(month, 1).slice(0, 8) + '01'
  const lastDay = new Date(new Date(monthEnd + 'T00:00:00').getTime() - 86_400_000)
  const toISO = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`

  const { data: entries = [], isLoading } = useFinEntries(month, toISO)
  const { data: categories = [] } = useFinCategories()
  const { data: accounts = [] } = useFinAccounts()
  const reopen = useReopenEntry()
  const del = useDeleteEntry()

  const [typeF, setTypeF]   = useState<'todos' | FinType>('todos')
  const [stateF, setStateF] = useState<'todos' | EntryState>('todos')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<FinEntry | null>(null)
  const [creating, setCreating] = useState<FinType | null>(null)
  const [settling, setSettling] = useState<FinEntry | null>(null)

  const catOf = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const accOf = useMemo(() => new Map(accounts.map(a => [a.id, a.name])), [accounts])

  // Entra no mês quem vence nele (pagos fora do mês aparecem no mês do pagamento)
  const inMonth = entries.filter(e => (e.due_date >= month && e.due_date <= toISO) || (e.paid_at && e.paid_at >= month && e.paid_at <= toISO))
  const list = inMonth.filter(e => {
    if (typeF !== 'todos' && e.type !== typeF) return false
    const st = entryState(e)
    if (stateF === 'todos' ? st === 'cancelado' : st !== stateF) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const hay = `${e.description} ${e.clients?.company_name ?? ''} ${e.counterparty ?? ''} ${catOf.get(e.category_id ?? '')?.name ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const totals = useMemo(() => {
    const t = { recPrev: 0, recOk: 0, payPrev: 0, payOk: 0 }
    for (const e of inMonth) {
      if (e.status === 'cancelado') continue
      const dueIn = e.due_date >= month && e.due_date <= toISO
      const paidIn = e.status === 'pago' && e.paid_at! >= month && e.paid_at! <= toISO
      if (e.type === 'receita') { if (dueIn) t.recPrev += e.amount; if (paidIn) t.recOk += e.paid_amount ?? e.amount }
      else { if (dueIn) t.payPrev += e.amount; if (paidIn) t.payOk += e.paid_amount ?? e.amount }
    }
    return t
  }, [inMonth, month, toISO])

  const [y, m] = month.split('-').map(Number)

  const doReopen = async (e: FinEntry) => {
    try { await reopen.mutateAsync(e.id); toast('Baixa desfeita.', 'success') }
    catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
  }
  const doDelete = async (e: FinEntry) => {
    const msg = e.recurrence_id
      ? 'Cancelar esta parcela? As próximas da recorrência continuam.'
      : 'Excluir este lançamento?'
    if (!window.confirm(msg)) return
    try { await del.mutateAsync(e); toast(e.recurrence_id ? 'Parcela cancelada.' : 'Lançamento excluído.', 'success') }
    catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
  }

  return (
    <div className="space-y-4">
      {/* Mês + ações */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(addMonthsISO(month, -1, 1))} aria-label="Mês anterior"
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:bg-white/5"
            style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}><ChevronLeft className="w-4 h-4" /></button>
          <span className="font-display text-[16px] font-bold min-w-[150px] text-center" style={{ color: 'var(--sm-text-1)' }}>
            {MONTHS[m - 1]} {y}
          </span>
          <button onClick={() => setMonth(addMonthsISO(month, 1, 1))} aria-label="Próximo mês"
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:bg-white/5"
            style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex-1" />
        <GhostButton onClick={() => setCreating('despesa')}><Plus className="w-4 h-4" /> A pagar</GhostButton>
        <PrimaryButton onClick={() => setCreating('receita')}><Plus className="w-4 h-4" /> A receber</PrimaryButton>
      </div>

      {/* Totais do mês */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['A receber no mês', totals.recPrev],
          ['Recebido no mês', totals.recOk],
          ['A pagar no mês', totals.payPrev],
          ['Pago no mês', totals.payOk],
        ].map(([label, v]) => (
          <Card key={label as string} className="px-4 py-3">
            <p className="text-[11.5px]" style={{ color: 'var(--sm-text-3)' }}>{label}</p>
            <p className="text-[18px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(v as number)}</p>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--sm-bg-alt)' }}>
          {([['todos', 'Tudo'], ['receita', 'A receber'], ['despesa', 'A pagar']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setTypeF(v)} className="h-8 px-3 rounded-lg text-[12.5px] font-medium"
              style={typeF === v ? { background: 'var(--sm-bg-card)', color: 'var(--sm-text-1)' } : { color: 'var(--sm-text-3)' }}>{l}</button>
          ))}
        </div>
        <SelectInput value={stateF} onChange={e => setStateF(e.target.value as any)} className="!w-auto !h-10">
          <option value="todos">Todas as situações</option>
          <option value="aberto">Em aberto</option>
          <option value="atrasado">Atrasados</option>
          <option value="pago">Pagos / recebidos</option>
          <option value="cancelado">Cancelados</option>
        </SelectInput>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--sm-text-4)' }} />
          <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar descrição, cliente, categoria..." className="pl-9" />
        </div>
      </div>

      <Card>
        {isLoading ? (
          <p className="py-12 text-center text-[13px]" style={{ color: 'var(--sm-text-3)' }}>Carregando...</p>
        ) : list.length === 0 ? (
          <EmptyState title="Nada por aqui" text="Nenhum lançamento neste mês com esses filtros." />
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--sm-border)' }}>
            {list.map(e => {
              const st = entryState(e)
              const cat = catOf.get(e.category_id ?? '')
              const who = e.clients?.company_name ?? e.counterparty
              return (
                <div key={e.id} className="px-4 py-3 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-1.5" style={{ borderColor: 'var(--sm-border)' }}>
                  <div className="w-[3px] self-stretch rounded-full hidden md:block" style={{ background: cat?.color ?? 'var(--sm-border)' }} />
                  <div className="min-w-0 flex-1 basis-full md:basis-auto">
                    <p className="text-[13.5px] font-semibold truncate flex items-center gap-1.5" style={{ color: 'var(--sm-text-1)' }}>
                      {e.recurrence_id && <Repeat className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} aria-label="Recorrente" />}
                      {e.description}
                    </p>
                    <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-3)' }}>
                      {[who, cat?.name, accOf.get(e.account_id ?? ''), e.fin_invoices ? `NF nº ${e.fin_invoices.number}` : null].filter(Boolean).join(' · ') || 'Sem categoria'}
                    </p>
                  </div>
                  <div className="text-[12px] w-[92px]" style={{ color: 'var(--sm-text-3)' }}>
                    {st === 'pago' ? <>pago {fmtDateBR(e.paid_at)}</> : <>vence {fmtDateBR(e.due_date)}</>}
                  </div>
                  <div className="w-[96px]"><StatePill state={st} type={e.type} /></div>
                  <Amount value={st === 'pago' ? (e.paid_amount ?? e.amount) : e.amount} type={e.type} className="text-[14px] w-[120px] text-right" />
                  <div className="flex items-center gap-0.5 ml-auto">
                    {(st === 'aberto' || st === 'atrasado') && (
                      <button onClick={() => setSettling(e)} title={e.type === 'receita' ? 'Registrar recebimento' : 'Registrar pagamento'}
                        className="h-8 px-2.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1"
                        style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
                        <Check className="w-3.5 h-3.5" /> Baixa
                      </button>
                    )}
                    {st === 'pago' && (
                      <IconBtn title="Desfazer baixa" onClick={() => doReopen(e)}><Undo2 className="w-3.5 h-3.5" /></IconBtn>
                    )}
                    {st !== 'cancelado' && <IconBtn title="Editar" onClick={() => setEditing(e)}><Pencil className="w-3.5 h-3.5" /></IconBtn>}
                    {st !== 'cancelado' && <IconBtn title={e.recurrence_id ? 'Cancelar parcela' : 'Excluir'} onClick={() => doDelete(e)}><Trash2 className="w-3.5 h-3.5" /></IconBtn>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <EntryModal open={!!creating || !!editing} entry={editing} defaultType={creating ?? 'receita'}
        onClose={() => { setCreating(null); setEditing(null) }} />
      <SettleModal entry={settling} onClose={() => setSettling(null)} />
    </div>
  )
}

function IconBtn({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p} aria-label={p.title} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
      style={{ color: 'var(--sm-text-3)' }}>
      {children}
    </button>
  )
}
