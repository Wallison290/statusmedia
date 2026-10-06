import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Pause, Play, FileSignature } from 'lucide-react'
import { useClients } from '@/hooks/useClients'
import { useToast } from '@/components/ui/toast'
import {
  useFinRecurrences, useFinCategories, useFinAccounts, useSaveRecurrence, useSaveEntry,
  useContractsAwaitingBilling, proposalSplit, todayISO, addMonthsISO, fmtBRL, fmtDateBR,
  type FinRecurrence, type FinType, type RecurrenceInput, type SignedContract,
} from '@/hooks/useFinance'
import {
  Card, SectionTitle, EmptyState, Modal, Field, TextInput, SelectInput,
  PrimaryButton, GhostButton, parseMoney, moneyToInput,
} from './finUi'

const INTERVALS: Record<number, string> = { 1: 'Mensal', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' }

export function RecurrencesTab() {
  const { toast } = useToast()
  const { data: recs = [], isLoading } = useFinRecurrences()
  const { data: categories = [] } = useFinCategories()
  const { data: awaiting = [] } = useContractsAwaitingBilling()
  const save = useSaveRecurrence()
  const [editing, setEditing] = useState<FinRecurrence | null>(null)
  const [creating, setCreating] = useState<FinType | null>(null)
  const [billing, setBilling] = useState<SignedContract | null>(null)

  const catName = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories])
  const receitas = recs.filter(r => r.type === 'receita')
  const despesas = recs.filter(r => r.type === 'despesa')
  const monthly = (list: FinRecurrence[]) =>
    list.filter(r => r.is_active).reduce((s, r) => s + r.amount / r.interval_months, 0)

  const toggle = async (r: FinRecurrence) => {
    try {
      await save.mutateAsync({ id: r.id, input: toInput(r, { is_active: !r.is_active }) })
      toast(r.is_active ? 'Recorrência pausada: as próximas parcelas em aberto saíram.' : 'Recorrência retomada.', 'success')
    } catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
  }

  const Row = ({ r }: { r: FinRecurrence }) => {
    const fromClient = r.source === 'cliente'
    return (
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t first:border-t-0" style={{ borderColor: 'var(--sm-border)', opacity: r.is_active ? 1 : 0.55 }}>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{r.description}</p>
          <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-3)' }}>
            {[INTERVALS[r.interval_months], `dia ${r.day_of_month}`, catName.get(r.category_id ?? ''),
              r.end_date ? `até ${fmtDateBR(r.end_date)}` : null, !r.is_active ? 'pausada' : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>
          {r.type === 'despesa' ? '− ' : ''}{fmtBRL(r.amount)}
        </span>
        {fromClient ? (
          <Link to={`/clients/${r.client_id}`} className="text-[12px] font-semibold" style={{ color: '#60A5FA' }} title="A mensalidade é editada no cadastro do cliente">
            Editar no cliente
          </Link>
        ) : (
          <div className="flex items-center gap-0.5">
            <IconBtn title={r.is_active ? 'Pausar' : 'Retomar'} onClick={() => toggle(r)}>
              {r.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </IconBtn>
            <IconBtn title="Editar" onClick={() => setEditing(r)}><Pencil className="w-3.5 h-3.5" /></IconBtn>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {awaiting.length > 0 && (
        <section>
          <SectionTitle n="00" title="Contratos assinados aguardando cobrança" />
          <Card>
            {awaiting.map((c, i) => {
              const { recurring, oneOff } = proposalSplit(c.crm_proposals)
              return (
                <div key={c.id} className={`px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                  <FileSignature className="w-4 h-4 flex-shrink-0" style={{ color: '#60A5FA' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{c.title}</p>
                    <p className="text-[11.5px]" style={{ color: 'var(--sm-text-3)' }}>
                      {c.crm_leads?.company || c.crm_leads?.name || c.signer_name || 'Cliente'} · assinado {fmtDateBR(c.signed_at?.slice(0, 10) ?? null)}
                      {recurring > 0 && <> · {fmtBRL(recurring)}/mês</>}
                      {oneOff > 0 && <> · {fmtBRL(oneOff)} avulso</>}
                    </p>
                  </div>
                  <PrimaryButton onClick={() => setBilling(c)} className="!h-9">Gerar cobrança</PrimaryButton>
                </div>
              )
            })}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle n="01" title="Receitas recorrentes" right={
          <div className="flex items-center gap-3">
            <span className="text-[12px] hidden sm:inline" style={{ color: 'var(--sm-text-3)' }}>≈ {fmtBRL(monthly(receitas))}/mês</span>
            <GhostButton onClick={() => setCreating('receita')} className="!h-9"><Plus className="w-4 h-4" /> Nova</GhostButton>
          </div>
        } />
        <Card>
          {isLoading ? null : receitas.length === 0
            ? <EmptyState title="Nenhuma receita recorrente" text="Mensalidades cadastradas nos clientes aparecem aqui automaticamente." />
            : receitas.map(r => <Row key={r.id} r={r} />)}
        </Card>
      </section>

      <section>
        <SectionTitle n="02" title="Despesas fixas" right={
          <div className="flex items-center gap-3">
            <span className="text-[12px] hidden sm:inline" style={{ color: 'var(--sm-text-3)' }}>≈ {fmtBRL(monthly(despesas))}/mês</span>
            <GhostButton onClick={() => setCreating('despesa')} className="!h-9"><Plus className="w-4 h-4" /> Nova</GhostButton>
          </div>
        } />
        <Card>
          {isLoading ? null : despesas.length === 0
            ? <EmptyState title="Nenhuma despesa fixa" text="Cadastre ferramentas, aluguel, salários e o que mais se repete todo mês." />
            : despesas.map(r => <Row key={r.id} r={r} />)}
        </Card>
        <p className="text-[11.5px] mt-2" style={{ color: 'var(--sm-text-4)' }}>
          O sistema cria as parcelas sozinho até 3 meses à frente. Mudar o valor atualiza as parcelas futuras em aberto; as já pagas não mudam.
        </p>
      </section>

      <RecurrenceModal open={!!creating || !!editing} rec={editing} defaultType={creating ?? 'receita'}
        onClose={() => { setCreating(null); setEditing(null) }} />
      <ContractBillingModal contract={billing} onClose={() => setBilling(null)} />
    </div>
  )
}

function toInput(r: FinRecurrence, patch: Partial<RecurrenceInput> = {}): RecurrenceInput {
  return {
    type: r.type, description: r.description, amount: r.amount, category_id: r.category_id,
    account_id: r.account_id, client_id: r.client_id, counterparty: r.counterparty,
    interval_months: r.interval_months, day_of_month: r.day_of_month, start_date: r.start_date,
    end_date: r.end_date, is_active: r.is_active, contract_id: r.contract_id, ...patch,
  }
}

function IconBtn({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p} aria-label={p.title} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5"
      style={{ color: 'var(--sm-text-3)' }}>{children}</button>
  )
}

// ── Criar / editar recorrência ───────────────────────────────────────────────

function RecurrenceModal({ open, onClose, rec, defaultType }: {
  open: boolean; onClose: () => void; rec: FinRecurrence | null; defaultType: FinType
}) {
  const { toast } = useToast()
  const { data: categories = [] } = useFinCategories()
  const { data: accounts = [] } = useFinAccounts()
  const { data: clients = [] } = useClients()
  const save = useSaveRecurrence()
  const [f, setF] = useState<RecurrenceInput & { amountText: string }>(() => blank(defaultType))

  function blank(t: FinType) {
    return {
      type: t, description: '', amount: 0, amountText: '', category_id: null, account_id: null,
      client_id: null, counterparty: '', interval_months: 1, day_of_month: Number(todayISO().slice(8, 10)),
      start_date: todayISO(), end_date: null, is_active: true,
    }
  }
  useEffect(() => {
    if (!open) return
    setF(rec ? { ...toInput(rec), amountText: moneyToInput(rec.amount) } : blank(defaultType))
  }, [open, rec, defaultType])

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }))
  const cats = categories.filter(c => c.type === f.type && (c.is_active || c.id === f.category_id))

  const submit = async () => {
    const amount = parseMoney(f.amountText)
    if (!f.description.trim()) return toast('Escreva uma descrição.', 'error')
    if (amount <= 0) return toast('Informe o valor.', 'error')
    const { amountText: _a, ...input } = f
    try {
      await save.mutateAsync({ id: rec?.id, input: { ...input, amount } })
      toast(rec ? 'Recorrência atualizada.' : 'Recorrência criada: as parcelas já foram geradas.', 'success')
      onClose()
    } catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
  }

  return (
    <Modal open={open} onClose={onClose}
      title={rec ? 'Editar recorrência' : f.type === 'receita' ? 'Nova receita recorrente' : 'Nova despesa fixa'}
      footer={<>
        <GhostButton onClick={onClose}>Cancelar</GhostButton>
        <PrimaryButton onClick={submit} disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar'}</PrimaryButton>
      </>}>
      <div className="space-y-3.5">
        <Field label="Descrição">
          <TextInput value={f.description} onChange={e => set('description', e.target.value)}
            placeholder={f.type === 'receita' ? 'Ex.: Gestão de tráfego · Cliente X' : 'Ex.: Assinatura do Canva'} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)"><TextInput inputMode="decimal" value={f.amountText} onChange={e => set('amountText', e.target.value)} placeholder="0,00" /></Field>
          <Field label="Repete">
            <SelectInput value={f.interval_months} onChange={e => set('interval_months', Number(e.target.value))}>
              {Object.entries(INTERVALS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectInput>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Dia do vencimento">
            <TextInput type="number" min={1} max={31} value={f.day_of_month} onChange={e => set('day_of_month', Math.min(31, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="Começa em"><TextInput type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} /></Field>
          <Field label="Termina em"><TextInput type="date" value={f.end_date ?? ''} onChange={e => set('end_date', e.target.value || null)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <SelectInput value={f.category_id ?? ''} onChange={e => set('category_id', e.target.value || null)}>
              <option value="">Sem categoria</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Conta">
            <SelectInput value={f.account_id ?? ''} onChange={e => set('account_id', e.target.value || null)}>
              <option value="">Conta padrão</option>
              {accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </SelectInput>
          </Field>
        </div>
        {f.type === 'receita' ? (
          <Field label="Cliente">
            <SelectInput value={f.client_id ?? ''} onChange={e => set('client_id', e.target.value || null)}>
              <option value="">Sem cliente</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </SelectInput>
          </Field>
        ) : (
          <Field label="Fornecedor"><TextInput value={f.counterparty ?? ''} onChange={e => set('counterparty', e.target.value)} placeholder="Ex.: Adobe" /></Field>
        )}
      </div>
    </Modal>
  )
}

// ── Contrato assinado → cobrança ─────────────────────────────────────────────

function ContractBillingModal({ contract, onClose }: { contract: SignedContract | null; onClose: () => void }) {
  const { toast } = useToast()
  const { data: clients = [] } = useClients()
  const { data: categories = [] } = useFinCategories()
  const saveRec = useSaveRecurrence()
  const saveEntry = useSaveEntry()
  const split = proposalSplit(contract?.crm_proposals ?? null)

  const [clientId, setClient]   = useState('')
  const [recText, setRec]       = useState('')
  const [recDay, setRecDay]     = useState(10)
  const [recStart, setRecStart] = useState(todayISO())
  const [oneText, setOne]       = useState('')
  const [oneN, setOneN]         = useState(1)
  const [oneDue, setOneDue]     = useState(todayISO())

  useEffect(() => {
    if (!contract) return
    setClient(contract.crm_leads?.converted_client_id ?? '')
    setRec(moneyToInput(split.recurring))
    setOne(moneyToInput(split.oneOff))
    setRecDay(Number(todayISO().slice(8, 10)))
    setRecStart(addMonthsISO(todayISO(), 1))
    setOneN(1); setOneDue(todayISO())
  }, [contract]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!contract) return null
  const rec = parseMoney(recText), one = parseMoney(oneText)
  const who = contract.crm_leads?.company || contract.crm_leads?.name || contract.signer_name || 'Cliente'
  const cat = (key: string) => categories.find(c => c.system_key === key)?.id ?? null

  const submit = async () => {
    if (rec <= 0 && one <= 0) return toast('Informe o valor recorrente e/ou o avulso.', 'error')
    const clientName = (clients as any[]).find(c => c.id === clientId)?.company_name ?? who
    try {
      if (rec > 0) {
        await saveRec.mutateAsync({ input: {
          type: 'receita', description: `${contract.title} · ${clientName}`, amount: rec,
          category_id: cat('mensalidades'), account_id: null, client_id: clientId || null,
          counterparty: clientId ? null : who, interval_months: 1, day_of_month: recDay,
          start_date: recStart, end_date: null, is_active: true, contract_id: contract.id,
        } })
      }
      if (one > 0) {
        const per = Math.round((one / oneN) * 100) / 100
        await saveEntry.mutateAsync({ input: {
          type: 'receita', description: `${contract.title} · ${clientName}`, amount: per, due_date: oneDue,
          category_id: cat('projetos'), account_id: null, client_id: clientId || null,
          counterparty: clientId ? null : who, notes: null, installments: oneN, contract_id: contract.id,
        } })
      }
      toast('Cobrança gerada a partir do contrato.', 'success')
      onClose()
    } catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
  }

  return (
    <Modal open onClose={onClose} title="Gerar cobrança do contrato" wide
      footer={<>
        <GhostButton onClick={onClose}>Cancelar</GhostButton>
        <PrimaryButton onClick={submit} disabled={saveRec.isPending || saveEntry.isPending}>Gerar cobrança</PrimaryButton>
      </>}>
      <div className="space-y-4">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{contract.title}</p>
          <p className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>{who} · valores vindos da proposta, ajuste se precisar</p>
        </div>
        <Field label="Cliente" hint={!clientId ? 'Sem cliente vinculado, a cobrança fica no nome de quem assinou.' : undefined}>
          <SelectInput value={clientId} onChange={e => setClient(e.target.value)}>
            <option value="">Sem cliente cadastrado ({who})</option>
            {(clients as any[]).map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </SelectInput>
        </Field>
        <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--sm-border)' }}>
          <p className="text-[12.5px] font-semibold" style={{ color: 'var(--sm-text-2)' }}>Mensalidade (itens recorrentes)</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Valor/mês"><TextInput inputMode="decimal" value={recText} onChange={e => setRec(e.target.value)} placeholder="0,00" /></Field>
            <Field label="Dia do vencimento"><TextInput type="number" min={1} max={31} value={recDay} onChange={e => setRecDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))} /></Field>
            <Field label="1ª mensalidade em"><TextInput type="date" value={recStart} onChange={e => setRecStart(e.target.value)} /></Field>
          </div>
        </div>
        <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--sm-border)' }}>
          <p className="text-[12.5px] font-semibold" style={{ color: 'var(--sm-text-2)' }}>Valor avulso (setup, projeto)</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Total"><TextInput inputMode="decimal" value={oneText} onChange={e => setOne(e.target.value)} placeholder="0,00" /></Field>
            <Field label="Parcelas">
              <SelectInput value={oneN} onChange={e => setOneN(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 10, 12].map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}×`}</option>)}
              </SelectInput>
            </Field>
            <Field label="1º vencimento"><TextInput type="date" value={oneDue} onChange={e => setOneDue(e.target.value)} /></Field>
          </div>
          {one > 0 && oneN > 1 && <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>{oneN}× de {fmtBRL(Math.round((one / oneN) * 100) / 100)}</p>}
        </div>
      </div>
    </Modal>
  )
}
