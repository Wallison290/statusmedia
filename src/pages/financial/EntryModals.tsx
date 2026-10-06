import { useEffect, useMemo, useState } from 'react'
import { useClients } from '@/hooks/useClients'
import { useToast } from '@/components/ui/toast'
import {
  useFinAccounts, useFinCategories, useSaveEntry, useSettleEntry,
  todayISO, fmtBRL, type FinEntry, type FinType,
} from '@/hooks/useFinance'
import {
  Modal, Field, TextInput, SelectInput, PrimaryButton, GhostButton, parseMoney, moneyToInput,
} from './finUi'

// ── Criar / editar lançamento ────────────────────────────────────────────────

export function EntryModal({ open, onClose, entry, defaultType = 'receita' }: {
  open: boolean; onClose: () => void; entry?: FinEntry | null; defaultType?: FinType
}) {
  const { toast } = useToast()
  const { data: categories = [] } = useFinCategories()
  const { data: accounts = [] } = useFinAccounts()
  const { data: clients = [] } = useClients()
  const save = useSaveEntry()

  const [type, setType]           = useState<FinType>(defaultType)
  const [description, setDesc]    = useState('')
  const [amount, setAmount]       = useState('')
  const [due, setDue]             = useState(todayISO())
  const [categoryId, setCategory] = useState('')
  const [accountId, setAccount]   = useState('')
  const [who, setWho]             = useState<'cliente' | 'outro'>('cliente')
  const [clientId, setClient]     = useState('')
  const [counterparty, setCp]     = useState('')
  const [installments, setInst]   = useState(1)
  const [alreadyPaid, setPaid]    = useState(false)
  const [paidAt, setPaidAt]       = useState(todayISO())
  const [notes, setNotes]         = useState('')

  useEffect(() => {
    if (!open) return
    const t = entry?.type ?? defaultType
    setType(t)
    setDesc(entry?.description ?? '')
    setAmount(moneyToInput(entry?.amount))
    setDue(entry?.due_date ?? todayISO())
    setCategory(entry?.category_id ?? '')
    setAccount(entry?.account_id ?? '')
    setWho(entry ? (entry.client_id ? 'cliente' : 'outro') : (t === 'receita' ? 'cliente' : 'outro'))
    setClient(entry?.client_id ?? '')
    setCp(entry?.counterparty ?? '')
    setInst(1); setPaid(false); setPaidAt(todayISO())
    setNotes(entry?.notes ?? '')
  }, [open, entry, defaultType])

  const cats = useMemo(() => categories.filter(c => c.type === type && (c.is_active || c.id === categoryId)), [categories, type, categoryId])
  const activeAccounts = accounts.filter(a => a.is_active || a.id === accountId)
  const value = parseMoney(amount)
  const isEdit = !!entry
  const isLockedRecurring = !!entry?.recurrence_id

  const submit = async () => {
    if (!description.trim()) return toast('Escreva uma descrição.', 'error')
    if (value <= 0) return toast('Informe um valor maior que zero.', 'error')
    try {
      await save.mutateAsync({
        id: entry?.id,
        input: {
          type, description, amount: value, due_date: due,
          category_id: categoryId || null,
          account_id: accountId || accounts.find(a => a.is_default)?.id || null,
          client_id: who === 'cliente' ? (clientId || null) : null,
          counterparty: who === 'outro' ? counterparty : null,
          notes, installments: isEdit ? 1 : installments,
          paid_at: !isEdit && alreadyPaid ? paidAt : null,
        },
      })
      toast(isEdit ? 'Lançamento atualizado.' : installments > 1 ? `${installments} parcelas criadas.` : 'Lançamento criado.', 'success')
      onClose()
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar.', 'error')
    }
  }

  return (
    <Modal
      open={open} onClose={onClose}
      title={isEdit ? 'Editar lançamento' : type === 'receita' ? 'Nova conta a receber' : 'Nova conta a pagar'}
      footer={<>
        <GhostButton onClick={onClose}>Cancelar</GhostButton>
        <PrimaryButton onClick={submit} disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar'}</PrimaryButton>
      </>}
    >
      <div className="space-y-3.5">
        {!isEdit && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl" style={{ background: 'var(--sm-bg-alt)' }}>
            {(['receita', 'despesa'] as const).map(t => (
              <button key={t} type="button"
                onClick={() => { setType(t); setCategory(''); if (t === 'despesa') setWho('outro') }}
                className="h-9 rounded-lg text-[13px] font-semibold transition-colors"
                style={type === t
                  ? { background: 'var(--sm-bg-card)', color: 'var(--sm-text-1)', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }
                  : { color: 'var(--sm-text-3)' }}>
                {t === 'receita' ? 'A receber' : 'A pagar'}
              </button>
            ))}
          </div>
        )}

        {isLockedRecurring && (
          <p className="text-[12px] rounded-xl px-3 py-2" style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-3)' }}>
            Esta é uma parcela de recorrência. Mudanças aqui valem só para ela; para mudar todas as próximas, edite a recorrência.
          </p>
        )}

        <Field label="Descrição">
          <TextInput value={description} onChange={e => setDesc(e.target.value)}
            placeholder={type === 'receita' ? 'Ex.: Site institucional' : 'Ex.: Assinatura do Canva'} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={installments > 1 ? 'Valor de cada parcela' : 'Valor (R$)'}>
            <TextInput inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
          </Field>
          <Field label={installments > 1 ? 'Vencimento da 1ª' : 'Vencimento'}>
            <TextInput type="date" value={due} onChange={e => setDue(e.target.value)} />
          </Field>
        </div>

        {!isEdit && (
          <Field label="Parcelas" hint={installments > 1 && value > 0 ? `${installments}× de ${fmtBRL(value)} = ${fmtBRL(value * installments)}, uma por mês` : undefined}>
            <SelectInput value={installments} onChange={e => setInst(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map(n => (
                <option key={n} value={n}>{n === 1 ? 'À vista (1 lançamento)' : `${n} parcelas mensais`}</option>
              ))}
            </SelectInput>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <SelectInput value={categoryId} onChange={e => setCategory(e.target.value)}>
              <option value="">Sem categoria</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Conta">
            <SelectInput value={accountId} onChange={e => setAccount(e.target.value)}>
              <option value="">Conta padrão</option>
              {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </SelectInput>
          </Field>
        </div>

        <Field label={type === 'receita' ? 'Quem paga' : 'Para quem'}>
          <div className="flex gap-2 mb-2">
            {(['cliente', 'outro'] as const).map(w => (
              <button key={w} type="button" onClick={() => setWho(w)}
                className="h-8 px-3 rounded-lg border text-[12px] font-medium"
                style={who === w
                  ? { borderColor: '#2563EB', color: 'var(--sm-text-1)', background: 'rgba(37,99,235,0.12)' }
                  : { borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
                {w === 'cliente' ? 'Cliente' : type === 'receita' ? 'Outra pessoa/empresa' : 'Fornecedor'}
              </button>
            ))}
          </div>
          {who === 'cliente' ? (
            <SelectInput value={clientId} onChange={e => setClient(e.target.value)}>
              <option value="">Sem cliente</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </SelectInput>
          ) : (
            <TextInput value={counterparty} onChange={e => setCp(e.target.value)}
              placeholder={type === 'receita' ? 'Nome de quem paga' : 'Ex.: Adobe, freelancer João'} />
          )}
        </Field>

        {!isEdit && (
          <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--sm-border)' }}>
            <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--sm-text-2)' }}>
              <input type="checkbox" checked={alreadyPaid} onChange={e => setPaid(e.target.checked)} />
              {type === 'receita' ? 'Já foi recebido' : 'Já foi pago'}{installments > 1 ? ' (só a 1ª parcela)' : ''}
            </label>
            {alreadyPaid && (
              <div className="mt-2">
                <TextInput type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
              </div>
            )}
          </div>
        )}

        <Field label="Observações (opcional)">
          <TextInput value={notes} onChange={e => setNotes(e.target.value)} placeholder="Nº da nota, combinado com o cliente..." />
        </Field>
      </div>
    </Modal>
  )
}

// ── Dar baixa ────────────────────────────────────────────────────────────────

export function SettleModal({ entry, onClose }: { entry: FinEntry | null; onClose: () => void }) {
  const { toast } = useToast()
  const { data: accounts = [] } = useFinAccounts()
  const settle = useSettleEntry()
  const [paidAt, setPaidAt] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [accountId, setAccount] = useState('')

  useEffect(() => {
    if (!entry) return
    setPaidAt(todayISO())
    setAmount(moneyToInput(entry.amount))
    setAccount(entry.account_id ?? accounts.find(a => a.is_default)?.id ?? '')
  }, [entry]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!entry) return null
  const receita = entry.type === 'receita'
  const value = parseMoney(amount)

  const submit = async () => {
    if (value <= 0) return toast('Informe o valor.', 'error')
    try {
      await settle.mutateAsync({ id: entry.id, paid_at: paidAt, amount: value, account_id: accountId || null })
      toast(receita ? 'Recebimento registrado.' : 'Pagamento registrado.', 'success')
      onClose()
    } catch (err: any) {
      toast(err.message ?? 'Erro ao dar baixa.', 'error')
    }
  }

  return (
    <Modal
      open onClose={onClose}
      title={receita ? 'Registrar recebimento' : 'Registrar pagamento'}
      footer={<>
        <GhostButton onClick={onClose}>Cancelar</GhostButton>
        <PrimaryButton onClick={submit} disabled={settle.isPending}>{settle.isPending ? 'Salvando...' : 'Confirmar'}</PrimaryButton>
      </>}
    >
      <div className="space-y-3.5">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{entry.description}</p>
          <p className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
            {entry.clients?.company_name ?? entry.counterparty ?? ''} · previsto {fmtBRL(entry.amount)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={receita ? 'Recebido em' : 'Pago em'}>
            <TextInput type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
          </Field>
          <Field label="Valor (R$)" hint={value > 0 && value !== entry.amount ? `Diferença de ${fmtBRL(value - entry.amount)} (juros, desconto ou taxa)` : undefined}>
            <TextInput inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          </Field>
        </div>
        <Field label={receita ? 'Entrou na conta' : 'Saiu da conta'}>
          <SelectInput value={accountId} onChange={e => setAccount(e.target.value)}>
            {accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectInput>
        </Field>
      </div>
    </Modal>
  )
}
