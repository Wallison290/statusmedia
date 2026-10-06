import { useEffect, useState } from 'react'
import { Plus, Pencil, ArrowRight } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import {
  useFinAccounts, useFinCategories, useFinTransfers, useSaveAccount, useSaveCategory, useCreateTransfer,
  todayISO, fmtBRL, fmtDateBR, type FinAccount, type FinCategory, type FinType,
} from '@/hooks/useFinance'
import {
  Card, SectionTitle, Modal, Field, TextInput, SelectInput, PrimaryButton, GhostButton, parseMoney,
} from './finUi'

const KINDS: Record<FinAccount['kind'], string> = { banco: 'Conta bancária', caixa: 'Caixa (dinheiro)', carteira: 'Carteira digital', outro: 'Outra' }
const DRE: Record<FinCategory['dre_group'], string> = {
  receita: 'Receita', deducao: 'Imposto sobre a receita', custo: 'Custo do serviço', despesa: 'Despesa operacional',
}
const SWATCHES = ['#2563EB', '#0EA5E9', '#14B8A6', '#22C55E', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#A855F7', '#6366F1', '#64748B']

export function SettingsTab() {
  const { data: accounts = [] } = useFinAccounts()
  const { data: categories = [] } = useFinCategories()
  const { data: transfers = [] } = useFinTransfers()
  const [acc, setAcc] = useState<FinAccount | 'new' | null>(null)
  const [cat, setCat] = useState<FinCategory | FinType | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const accName = new Map(accounts.map(a => [a.id, a.name]))

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle n="01" title="Contas" right={
          <div className="flex gap-2">
            {accounts.filter(a => a.is_active).length > 1 && <GhostButton className="!h-9" onClick={() => setTransferOpen(true)}>Transferir</GhostButton>}
            <GhostButton className="!h-9" onClick={() => setAcc('new')}><Plus className="w-4 h-4" /> Nova conta</GhostButton>
          </div>
        } />
        <Card>
          {accounts.map((a, i) => (
            <div key={a.id} className={`px-4 py-3 flex items-center gap-3 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)', opacity: a.is_active ? 1 : 0.5 }}>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
                  {a.name}{a.is_default && <span className="text-[11px] font-medium ml-2" style={{ color: 'var(--sm-text-4)' }}>padrão</span>}
                  {!a.is_active && <span className="text-[11px] font-medium ml-2" style={{ color: 'var(--sm-text-4)' }}>desativada</span>}
                </p>
                <p className="text-[11.5px]" style={{ color: 'var(--sm-text-3)' }}>{KINDS[a.kind]} · saldo inicial {fmtBRL(a.initial_balance)}</p>
              </div>
              <span className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(a.balance)}</span>
              <button onClick={() => setAcc(a)} aria-label="Editar conta" title="Editar" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--sm-text-3)' }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </Card>
        <p className="text-[11.5px] mt-2" style={{ color: 'var(--sm-text-4)' }}>
          Informe o saldo inicial de cada conta (quanto tinha antes de começar a lançar aqui) para o saldo bater com o banco.
        </p>
        {transfers.length > 0 && (
          <div className="mt-3">
            <p className="text-[12px] font-semibold mb-1.5" style={{ color: 'var(--sm-text-3)' }}>Últimas transferências</p>
            <Card>
              {transfers.slice(0, 5).map((t, i) => (
                <div key={t.id} className={`px-4 py-2.5 flex items-center gap-2 text-[12.5px] ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                  <span className="tabular-nums w-20" style={{ color: 'var(--sm-text-3)' }}>{fmtDateBR(t.transfer_date)}</span>
                  <span className="truncate">{accName.get(t.from_account_id)}</span>
                  <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} />
                  <span className="truncate flex-1">{accName.get(t.to_account_id)}</span>
                  <span className="font-semibold tabular-nums">{fmtBRL(t.amount)}</span>
                </div>
              ))}
            </Card>
          </div>
        )}
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        {(['receita', 'despesa'] as const).map((type, idx) => (
          <div key={type}>
            <SectionTitle n={`0${idx + 2}`} title={type === 'receita' ? 'Categorias de receita' : 'Categorias de despesa'} right={
              <GhostButton className="!h-9" onClick={() => setCat(type)}><Plus className="w-4 h-4" /> Nova</GhostButton>
            } />
            <Card>
              {categories.filter(c => c.type === type).map((c, i) => (
                <div key={c.id} className={`px-4 py-2.5 flex items-center gap-3 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)', opacity: c.is_active ? 1 : 0.5 }}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] truncate" style={{ color: 'var(--sm-text-1)' }}>{c.name}</p>
                    <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>{DRE[c.dre_group]}{!c.is_active ? ' · desativada' : ''}</p>
                  </div>
                  <button onClick={() => setCat(c)} aria-label="Editar categoria" title="Editar" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--sm-text-3)' }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </Card>
          </div>
        ))}
      </section>

      <AccountModal value={acc} onClose={() => setAcc(null)} />
      <CategoryModal value={cat} onClose={() => setCat(null)} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} accounts={accounts.filter(a => a.is_active)} />
    </div>
  )
}

function AccountModal({ value, onClose }: { value: FinAccount | 'new' | null; onClose: () => void }) {
  const { toast } = useToast()
  const save = useSaveAccount()
  const acc = value && value !== 'new' ? value : null
  const [name, setName] = useState('')
  const [kind, setKind] = useState<FinAccount['kind']>('banco')
  const [initial, setInitial] = useState('')
  const [active, setActive] = useState(true)
  useEffect(() => {
    if (!value) return
    setName(acc?.name ?? ''); setKind(acc?.kind ?? 'banco')
    setInitial(acc ? acc.initial_balance.toFixed(2).replace('.', ',') : ''); setActive(acc?.is_active ?? true)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!value) return null
  const submit = async () => {
    if (!name.trim()) return toast('Dê um nome para a conta.', 'error')
    try {
      await save.mutateAsync({ id: acc?.id, name, kind, initial_balance: parseMoney(initial.replace(/^-/, '')) * (initial.trim().startsWith('-') ? -1 : 1), is_active: active })
      toast('Conta salva.', 'success'); onClose()
    } catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
  }
  return (
    <Modal open onClose={onClose} title={acc ? 'Editar conta' : 'Nova conta'} footer={<>
      <GhostButton onClick={onClose}>Cancelar</GhostButton>
      <PrimaryButton onClick={submit} disabled={save.isPending}>Salvar</PrimaryButton>
    </>}>
      <div className="space-y-3.5">
        <Field label="Nome"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Nubank PJ" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <SelectInput value={kind} onChange={e => setKind(e.target.value as any)}>
              {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </SelectInput>
          </Field>
          <Field label="Saldo inicial (R$)"><TextInput inputMode="decimal" value={initial} onChange={e => setInitial(e.target.value)} placeholder="0,00" /></Field>
        </div>
        {acc && !acc.is_default && (
          <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--sm-text-2)' }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Conta ativa
          </label>
        )}
      </div>
    </Modal>
  )
}

function CategoryModal({ value, onClose }: { value: FinCategory | FinType | null; onClose: () => void }) {
  const { toast } = useToast()
  const save = useSaveCategory()
  const cat = value && typeof value === 'object' ? value : null
  const type: FinType = cat?.type ?? (value as FinType) ?? 'despesa'
  const [name, setName] = useState('')
  const [group, setGroup] = useState<FinCategory['dre_group']>('despesa')
  const [color, setColor] = useState(SWATCHES[0])
  const [active, setActive] = useState(true)
  useEffect(() => {
    if (!value) return
    setName(cat?.name ?? ''); setGroup(cat?.dre_group ?? (type === 'receita' ? 'receita' : 'despesa'))
    setColor(cat?.color ?? SWATCHES[0]); setActive(cat?.is_active ?? true)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!value) return null
  const submit = async () => {
    if (!name.trim()) return toast('Dê um nome para a categoria.', 'error')
    try {
      await save.mutateAsync({ id: cat?.id, name, type, dre_group: type === 'receita' ? 'receita' : group, color, is_active: active })
      toast('Categoria salva.', 'success'); onClose()
    } catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
  }
  return (
    <Modal open onClose={onClose} title={cat ? 'Editar categoria' : type === 'receita' ? 'Nova categoria de receita' : 'Nova categoria de despesa'} footer={<>
      <GhostButton onClick={onClose}>Cancelar</GhostButton>
      <PrimaryButton onClick={submit} disabled={save.isPending}>Salvar</PrimaryButton>
    </>}>
      <div className="space-y-3.5">
        <Field label="Nome"><TextInput value={name} onChange={e => setName(e.target.value)} /></Field>
        {type === 'despesa' && (
          <Field label="Entra no resultado como" hint="Define a linha da categoria no DRE (resultado do mês).">
            <SelectInput value={group} onChange={e => setGroup(e.target.value as any)}>
              <option value="deducao">{DRE.deducao}</option>
              <option value="custo">{DRE.custo}</option>
              <option value="despesa">{DRE.despesa}</option>
            </SelectInput>
          </Field>
        )}
        <Field label="Cor">
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map(s => (
              <button key={s} type="button" onClick={() => setColor(s)} aria-label={`Cor ${s}`}
                className="w-7 h-7 rounded-full" style={{ background: s, outline: color === s ? '2px solid var(--sm-text-1)' : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        </Field>
        {cat && (
          <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--sm-text-2)' }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Categoria ativa (desativada some das opções, mas continua nos lançamentos antigos)
          </label>
        )}
      </div>
    </Modal>
  )
}

function TransferModal({ open, onClose, accounts }: { open: boolean; onClose: () => void; accounts: FinAccount[] }) {
  const { toast } = useToast()
  const create = useCreateTransfer()
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [amount, setAmount] = useState(''); const [date, setDate] = useState(todayISO())
  useEffect(() => {
    if (!open) return
    setFrom(accounts[0]?.id ?? ''); setTo(accounts[1]?.id ?? ''); setAmount(''); setDate(todayISO())
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  const submit = async () => {
    const v = parseMoney(amount)
    if (!from || !to || from === to) return toast('Escolha duas contas diferentes.', 'error')
    if (v <= 0) return toast('Informe o valor.', 'error')
    try { await create.mutateAsync({ from_account_id: from, to_account_id: to, amount: v, transfer_date: date, notes: null }); toast('Transferência registrada.', 'success'); onClose() }
    catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
  }
  return (
    <Modal open onClose={onClose} title="Transferir entre contas" footer={<>
      <GhostButton onClick={onClose}>Cancelar</GhostButton>
      <PrimaryButton onClick={submit} disabled={create.isPending}>Transferir</PrimaryButton>
    </>}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="De"><SelectInput value={from} onChange={e => setFrom(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectInput></Field>
          <Field label="Para"><SelectInput value={to} onChange={e => setTo(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectInput></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)"><TextInput inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></Field>
          <Field label="Data"><TextInput type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  )
}

