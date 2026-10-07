import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, FileText, Loader2, Paperclip, Search, Settings2, X } from 'lucide-react'
import { useClients } from '@/hooks/useClients'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { uploadArquivo } from '@/lib/uploadArquivo'
import { lookupCnpj, lookupCep, formatDocument, formatCep, onlyDigits } from '@/lib/fiscalLookup'
import {
  useFiscalSettings, useSaveFiscalSettings, useInvoices, useEntriesToInvoice, useSaveInvoice,
  useCancelInvoice, useSkipInvoice, useSaveClientFiscal, EMISSOR_NACIONAL_URL,
  fmtBRL, fmtDateBR, todayISO, type FiscalSettings, type FinEntry, type ClientFiscal,
} from '@/hooks/useFinance'
import { Card, SectionTitle, EmptyState, Skeleton, Modal, Field, TextInput, SelectInput, PrimaryButton, GhostButton, parseMoney, moneyToInput } from './finUi'

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`
const REGIMES = { mei: 'MEI', simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real', outro: 'Outro' } as const
const DEFAULT_DESC = '{descricao} · competência {mes}'

interface Group { key: string; clientId: string; name: string; competence: string; entries: FinEntry[]; total: number }

export function InvoicesTab() {
  const { toast } = useToast()
  const { data: fiscal, isLoading: loadingFiscal } = useFiscalSettings()
  const { data: toInvoice = [], isLoading } = useEntriesToInvoice()
  const { data: invoices = [] } = useInvoices()
  const skip = useSkipInvoice()
  const cancel = useCancelInvoice()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [issuing, setIssuing] = useState<Group | null>(null)
  const [search, setSearch] = useState('')

  const groups = useMemo(() => {
    const map = new Map<string, Group>()
    for (const e of toInvoice) {
      const key = `${e.client_id}|${e.competence}`
      const g = map.get(key) ?? { key, clientId: e.client_id!, name: e.clients?.company_name ?? 'Cliente', competence: e.competence, entries: [], total: 0 }
      g.entries.push(e); g.total += e.amount
      map.set(key, g)
    }
    return [...map.values()].sort((a, b) => b.competence.localeCompare(a.competence) || a.name.localeCompare(b.name))
  }, [toInvoice])

  const emitted = invoices.filter(i => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return `${i.number} ${i.clients?.company_name ?? ''} ${i.description ?? ''}`.toLowerCase().includes(q)
  })

  const needsSetup = !loadingFiscal && !fiscal?.cnpj

  return (
    <div className="space-y-6">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <FileText className="w-5 h-5 flex-shrink-0" style={{ color: '#60A5FA' }} />
        <p className="text-[12.5px] flex-1 min-w-[220px]" style={{ color: 'var(--sm-text-2)' }}>
          A nota é emitida pela agência no {fiscal?.issuing_portal === 'prefeitura' ? 'portal da prefeitura' : 'Emissor Nacional'}: o StatusMedia
          deixa tudo pronto para copiar e guarda a nota ligada à cobrança. Nota emitida não significa que o cliente pagou.
        </p>
        <GhostButton className="!h-9" onClick={() => setSettingsOpen(true)}><Settings2 className="w-4 h-4" /> Dados fiscais da agência</GhostButton>
      </Card>

      {needsSetup && (
        <button onClick={() => setSettingsOpen(true)} className="w-full text-left rounded-2xl border px-4 py-3 text-[13px]"
          style={{ borderColor: 'rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.08)', color: 'var(--sm-text-1)' }}>
          <strong>Comece pelos dados fiscais da agência</strong> (CNPJ, regime, código do serviço). Leva 2 minutos e é feito uma vez só →
        </button>
      )}

      <section>
        <SectionTitle n="01" title="Notas a emitir" right={
          <span className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>{groups.length} nota(s) · {fmtBRL(groups.reduce((s, g) => s + g.total, 0))}</span>
        } />
        <Card>
          {isLoading ? <div className="p-3 space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
            : groups.length === 0 ? <EmptyState title="Tudo em dia" text="Todo recebimento de cliente até este mês já tem nota (ou foi marcado como sem nota)." />
            : groups.map((g, i) => (
              <div key={g.key} className={`px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{g.name}</p>
                  <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-3)' }}>
                    {monthName(g.competence)} · {g.entries.map(e => e.description).join(' + ')}
                  </p>
                </div>
                <span className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(g.total)}</span>
                <button onClick={async () => {
                  if (!window.confirm('Marcar como "não precisa de nota"? (ex.: reembolso de mídia). Dá para desfazer pelos lançamentos.')) return
                  try { await skip.mutateAsync({ ids: g.entries.map(e => e.id), skip: true }); toast('Marcado como sem nota.', 'success') }
                  catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
                }} className="text-[12px] font-medium px-2" style={{ color: 'var(--sm-text-3)' }}>Não precisa</button>
                <PrimaryButton className="!h-9" onClick={() => setIssuing(g)}>Emitir nota</PrimaryButton>
              </div>
            ))}
        </Card>
      </section>

      <section>
        <SectionTitle n="02" title="Notas emitidas" right={
          <div className="relative w-56 max-w-[50vw]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--sm-text-4)' }} />
            <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Número ou cliente" className="!h-9 pl-9" />
          </div>
        } />
        <Card>
          {emitted.length === 0 ? <EmptyState title="Nenhuma nota registrada ainda" /> : emitted.map((inv, i) => (
            <div key={inv.id} className={`px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${i ? 'border-t' : ''}`}
              style={{ borderColor: 'var(--sm-border)', opacity: inv.status === 'cancelada' ? 0.55 : 1 }}>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>
                  NF nº {inv.number} · {inv.clients?.company_name ?? 'Cliente'}
                  {inv.status === 'cancelada' && <span className="text-[11px] font-medium ml-2" style={{ color: '#EF4444' }}>cancelada</span>}
                </p>
                <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-3)' }}>
                  emitida {fmtDateBR(inv.issue_date)} · competência {monthName(inv.competence)}{inv.description ? ` · ${inv.description}` : ''}
                </p>
              </div>
              <span className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(inv.amount)}</span>
              {inv.pdf_url && <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold" style={{ color: '#60A5FA' }}>PDF</a>}
              {inv.xml_url && <a href={inv.xml_url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold" style={{ color: '#60A5FA' }}>XML</a>}
              {inv.status === 'emitida' && (
                <button title="Registrar cancelamento" aria-label="Registrar cancelamento" onClick={async () => {
                  if (!window.confirm(`Registrar que a nota nº ${inv.number} foi cancelada? Cancele também no portal onde ela foi emitida. As parcelas voltam para "a emitir".`)) return
                  try { await cancel.mutateAsync(inv.id); toast('Cancelamento registrado.', 'success') }
                  catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
                }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--sm-text-3)' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </Card>
      </section>

      <FiscalSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <IssueModal group={issuing} fiscal={fiscal ?? null} onClose={() => setIssuing(null)} onOpenSettings={() => setSettingsOpen(true)} />
    </div>
  )
}

// ── Dados fiscais da agência ─────────────────────────────────────────────────

function FiscalSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const { data: saved } = useFiscalSettings()
  const save = useSaveFiscalSettings()
  const [f, setF] = useState<Omit<FiscalSettings, 'user_id'>>({
    cnpj: '', legal_name: '', municipal_reg: '', tax_regime: 'simples', city: '', state: '',
    issuing_portal: 'nacional', portal_url: '', service_code: '', service_description: DEFAULT_DESC, iss_rate: null,
  })
  const [issText, setIss] = useState('')
  const [looking, setLooking] = useState(false)
  useEffect(() => {
    if (!open || !saved) return
    const { user_id: _u, ...rest } = saved
    setF({ ...rest, service_description: rest.service_description || DEFAULT_DESC })
    setIss(saved.iss_rate != null ? String(saved.iss_rate).replace('.', ',') : '')
  }, [open, saved])
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }))

  const fillFromCnpj = async () => {
    setLooking(true)
    const d = await lookupCnpj(f.cnpj ?? '')
    setLooking(false)
    if (!d) return toast('Não encontrei esse CNPJ. Preencha à mão.', 'error')
    setF(p => ({ ...p, legal_name: d.legal_name, city: d.city, state: d.state }))
  }

  const submit = async () => {
    if (onlyDigits(f.cnpj).length !== 14) return toast('Informe o CNPJ da agência.', 'error')
    try {
      await save.mutateAsync({ ...f, cnpj: onlyDigits(f.cnpj), iss_rate: issText.trim() ? parseMoney(issText) : null })
      toast('Dados fiscais salvos.', 'success'); onClose()
    } catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
  }

  return (
    <Modal open={open} onClose={onClose} title="Dados fiscais da agência" wide footer={<>
      <GhostButton onClick={onClose}>Cancelar</GhostButton>
      <PrimaryButton onClick={submit} disabled={save.isPending}>Salvar</PrimaryButton>
    </>}>
      <div className="space-y-3.5">
        <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
          <Field label="CNPJ da agência">
            <TextInput value={formatDocument(f.cnpj)} onChange={e => set('cnpj', e.target.value)} onBlur={() => !f.legal_name && fillFromCnpj()} placeholder="00.000.000/0000-00" />
          </Field>
          <GhostButton onClick={fillFromCnpj} disabled={looking}>{looking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar dados'}</GhostButton>
        </div>
        <Field label="Razão social"><TextInput value={f.legal_name ?? ''} onChange={e => set('legal_name', e.target.value)} /></Field>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Inscrição municipal" className="col-span-2"><TextInput value={f.municipal_reg ?? ''} onChange={e => set('municipal_reg', e.target.value)} /></Field>
          <Field label="Cidade"><TextInput value={f.city ?? ''} onChange={e => set('city', e.target.value)} /></Field>
          <Field label="UF"><TextInput value={f.state ?? ''} onChange={e => set('state', e.target.value.toUpperCase().slice(0, 2))} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Regime tributário">
            <SelectInput value={f.tax_regime ?? 'simples'} onChange={e => set('tax_regime', e.target.value as any)}>
              {Object.entries(REGIMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </SelectInput>
          </Field>
          <Field label="Onde a agência emite a nota">
            <SelectInput value={f.issuing_portal} onChange={e => set('issuing_portal', e.target.value as any)}>
              <option value="nacional">Emissor Nacional (gov.br)</option>
              <option value="prefeitura">Portal da prefeitura</option>
            </SelectInput>
          </Field>
        </div>
        {f.issuing_portal === 'prefeitura' && (
          <Field label="Link do portal da prefeitura"><TextInput value={f.portal_url ?? ''} onChange={e => set('portal_url', e.target.value)} placeholder="https://..." /></Field>
        )}
        <div className="grid sm:grid-cols-[1fr_140px] gap-3">
          <Field label="Código do serviço" hint="O código de tributação que a contabilidade usa nas notas da agência.">
            <TextInput value={f.service_code ?? ''} onChange={e => set('service_code', e.target.value)} placeholder="Ex.: 17.06" />
          </Field>
          <Field label="Alíquota ISS (%)" hint={f.tax_regime === 'mei' || f.tax_regime === 'simples' ? 'No MEI/Simples o ISS já vai na guia (DAS).' : undefined}>
            <TextInput inputMode="decimal" value={issText} onChange={e => setIss(e.target.value)} placeholder="Ex.: 2" />
          </Field>
        </div>
        <Field label="Descrição padrão do serviço" hint="Variáveis: {descricao} (o que foi cobrado), {mes} (competência), {cliente}.">
          <TextInput value={f.service_description ?? ''} onChange={e => set('service_description', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

// ── Emitir nota (guiado) ─────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const { toast } = useToast()
  return (
    <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--sm-border)' }}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>{label}</p>
        <p className="text-[13px] break-words" style={{ color: value ? 'var(--sm-text-1)' : '#F59E0B' }}>{value || 'não informado'}</p>
      </div>
      {value && (
        <button onClick={() => { navigator.clipboard?.writeText(value); toast(`${label} copiado.`, 'success') }}
          aria-label={`Copiar ${label}`} title="Copiar" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 flex-shrink-0"
          style={{ color: '#60A5FA' }}><Copy className="w-3.5 h-3.5" /></button>
      )}
    </div>
  )
}

const EMPTY_FISCAL: ClientFiscal = {
  fiscal_document: '', fiscal_name: '', fiscal_email: '', municipal_reg: '', address_zip: '', address_street: '',
  address_number: '', address_complement: '', address_district: '', address_city: '', address_state: '',
}

function IssueModal({ group, fiscal, onClose, onOpenSettings }: {
  group: Group | null; fiscal: FiscalSettings | null; onClose: () => void; onOpenSettings: () => void
}) {
  const { toast } = useToast()
  const { agencyId } = useAuth()
  const { data: clients = [] } = useClients()
  const saveClient = useSaveClientFiscal()
  const saveInvoice = useSaveInvoice()
  const [step, setStep] = useState<1 | 2>(1)
  const [cf, setCf] = useState<ClientFiscal>(EMPTY_FISCAL)
  const [editingClient, setEditingClient] = useState(false)
  const [looking, setLooking] = useState(false)
  const [number, setNumber] = useState(''); const [issueDate, setIssueDate] = useState(todayISO())
  const [accessKey, setAccessKey] = useState(''); const [amountText, setAmount] = useState('')
  const [pdf, setPdf] = useState<File | null>(null); const [xml, setXml] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const client = (clients as any[]).find(c => c.id === group?.clientId)
  useEffect(() => {
    if (!group) return
    setStep(1); setNumber(''); setIssueDate(todayISO()); setAccessKey(''); setPdf(null); setXml(null)
    setAmount(moneyToInput(group.total))
    const c = (clients as any[]).find(x => x.id === group.clientId)
    const next: ClientFiscal = { ...EMPTY_FISCAL }
    for (const k of Object.keys(EMPTY_FISCAL) as (keyof ClientFiscal)[]) next[k] = c?.[k] ?? ''
    if (!next.fiscal_email) next.fiscal_email = c?.email ?? ''
    setCf(next)
    setEditingClient(!onlyDigits(next.fiscal_document) || !next.fiscal_name)
  }, [group]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!group) return null
  const setC = (k: keyof ClientFiscal, v: string) => setCf(p => ({ ...p, [k]: v }))
  const isCnpj = onlyDigits(cf.fiscal_document).length === 14
  const description = (fiscal?.service_description || DEFAULT_DESC)
    .replace('{descricao}', group.entries.map(e => e.description.replace(/\s*·\s*.+$/, '').replace(/\s*\(\d+\/\d+\)$/, '')).filter((v, i, a) => a.indexOf(v) === i).join(' + '))
    .replace('{mes}', monthName(group.competence))
    .replace('{cliente}', cf.fiscal_name || group.name)
  const address = [cf.address_street, cf.address_number, cf.address_complement, cf.address_district,
    cf.address_city && `${cf.address_city}/${cf.address_state}`, cf.address_zip && `CEP ${formatCep(cf.address_zip)}`].filter(Boolean).join(', ')
  const portal = fiscal?.issuing_portal === 'prefeitura' && fiscal.portal_url ? fiscal.portal_url : EMISSOR_NACIONAL_URL

  const fillCnpj = async () => {
    if (!isCnpj) return
    setLooking(true)
    const d = await lookupCnpj(cf.fiscal_document ?? '')
    setLooking(false)
    if (!d) return toast('Não encontrei esse CNPJ. Preencha à mão.', 'error')
    setCf(p => ({ ...p, fiscal_name: d.legal_name, fiscal_email: p.fiscal_email || d.email || '', address_zip: d.zip, address_street: d.street,
      address_number: d.number, address_complement: d.complement, address_district: d.district, address_city: d.city, address_state: d.state }))
  }
  const fillCep = async () => {
    const d = await lookupCep(cf.address_zip ?? '')
    if (d) setCf(p => ({ ...p, address_street: d.street || p.address_street, address_district: d.district || p.address_district, address_city: d.city, address_state: d.state }))
  }
  const saveClientData = async () => {
    try {
      await saveClient.mutateAsync({ id: group.clientId, data: { ...cf, fiscal_document: onlyDigits(cf.fiscal_document) || null, address_zip: onlyDigits(cf.address_zip) || null } })
      setEditingClient(false); toast('Dados do cliente salvos para as próximas notas.', 'success')
    } catch (err: any) { toast(err.message ?? 'Erro.', 'error') }
  }

  const register = async () => {
    if (!number.trim()) return toast('Informe o número da nota.', 'error')
    const amount = parseMoney(amountText)
    if (amount <= 0) return toast('Informe o valor da nota.', 'error')
    setSaving(true)
    try {
      const up = async (file: File | null, kind: string) => file
        ? (await uploadArquivo('client-documents', `${agencyId}/notas/${crypto.randomUUID()}-${kind}-${file.name.replace(/[^\w.\-]/g, '_')}`, file)).url
        : null
      const [pdfUrl, xmlUrl] = await Promise.all([up(pdf, 'pdf'), up(xml, 'xml')])
      await saveInvoice.mutateAsync({
        client_id: group.clientId, number: number.trim(), issue_date: issueDate, competence: group.competence,
        amount, description, access_key: accessKey.trim() || null, pdf_url: pdfUrl, xml_url: xmlUrl, notes: null,
        entry_ids: group.entries.map(e => e.id),
      })
      toast(`Nota nº ${number.trim()} registrada.`, 'success'); onClose()
    } catch (err: any) {
      toast(err.message ?? 'Erro ao registrar.', 'error')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} wide title={`Emitir nota · ${group.name}`} footer={step === 1 ? <>
      <GhostButton onClick={onClose}>Fechar</GhostButton>
      <PrimaryButton onClick={() => setStep(2)} disabled={editingClient}>Já emiti, registrar a nota →</PrimaryButton>
    </> : <>
      <GhostButton onClick={() => setStep(1)}>← Voltar</GhostButton>
      <PrimaryButton onClick={register} disabled={saving}>{saving ? 'Registrando...' : 'Registrar nota'}</PrimaryButton>
    </>}>
      {step === 1 ? (
        <div className="space-y-4">
          {!fiscal?.cnpj && (
            <button onClick={onOpenSettings} className="w-full text-left text-[12.5px] rounded-xl px-3 py-2"
              style={{ background: 'rgba(245,158,11,0.10)', color: '#F59E0B' }}>
              Os dados fiscais da agência ainda não foram preenchidos. Clique para preencher.
            </button>
          )}

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--sm-text-4)' }}>1 · Tomador (o cliente)</p>
            {editingClient ? (
              <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: 'var(--sm-border)' }}>
                <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
                  <Field label="CNPJ ou CPF do cliente">
                    <TextInput value={formatDocument(cf.fiscal_document)} onChange={e => setC('fiscal_document', e.target.value)} onBlur={() => isCnpj && !cf.fiscal_name && fillCnpj()} />
                  </Field>
                  {isCnpj && <GhostButton onClick={fillCnpj} disabled={looking}>{looking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar pelo CNPJ'}</GhostButton>}
                </div>
                <Field label={isCnpj ? 'Razão social' : 'Nome completo'}><TextInput value={cf.fiscal_name ?? ''} onChange={e => setC('fiscal_name', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="E-mail para a nota"><TextInput value={cf.fiscal_email ?? ''} onChange={e => setC('fiscal_email', e.target.value)} /></Field>
                  <Field label="CEP"><TextInput value={formatCep(cf.address_zip)} onChange={e => setC('address_zip', e.target.value)} onBlur={fillCep} /></Field>
                </div>
                <div className="grid grid-cols-[1fr_90px] gap-3">
                  <Field label="Endereço"><TextInput value={cf.address_street ?? ''} onChange={e => setC('address_street', e.target.value)} /></Field>
                  <Field label="Número"><TextInput value={cf.address_number ?? ''} onChange={e => setC('address_number', e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_70px] gap-3">
                  <Field label="Complemento"><TextInput value={cf.address_complement ?? ''} onChange={e => setC('address_complement', e.target.value)} /></Field>
                  <Field label="Bairro"><TextInput value={cf.address_district ?? ''} onChange={e => setC('address_district', e.target.value)} /></Field>
                  <Field label="Cidade"><TextInput value={cf.address_city ?? ''} onChange={e => setC('address_city', e.target.value)} /></Field>
                  <Field label="UF"><TextInput value={cf.address_state ?? ''} onChange={e => setC('address_state', e.target.value.toUpperCase().slice(0, 2))} /></Field>
                </div>
                <div className="flex justify-end"><PrimaryButton className="!h-9" onClick={saveClientData} disabled={saveClient.isPending}>Salvar dados do cliente</PrimaryButton></div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                <CopyField label={isCnpj ? 'CNPJ' : 'CPF'} value={formatDocument(cf.fiscal_document)} />
                <CopyField label={isCnpj ? 'Razão social' : 'Nome'} value={cf.fiscal_name ?? ''} />
                <CopyField label="E-mail" value={cf.fiscal_email ?? ''} />
                <CopyField label="Endereço" value={address} />
                <button onClick={() => setEditingClient(true)} className="text-[12px] font-semibold text-left" style={{ color: '#60A5FA' }}>Editar dados do cliente</button>
              </div>
            )}
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--sm-text-4)' }}>2 · Serviço</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <CopyField label="Código do serviço" value={fiscal?.service_code ?? ''} />
              <CopyField label="Valor" value={group.total.toFixed(2).replace('.', ',')} />
              <div className="sm:col-span-2"><CopyField label="Descrição" value={description} /></div>
              <CopyField label="Competência" value={monthName(group.competence)} />
              {fiscal?.iss_rate != null && <CopyField label={`ISS estimado (${String(fiscal.iss_rate).replace('.', ',')}%)`} value={(group.total * fiscal.iss_rate / 100).toFixed(2).replace('.', ',')} />}
            </div>
          </div>

          <a href={portal} target="_blank" rel="noopener noreferrer"
            className="w-full h-11 rounded-xl text-white text-[13.5px] font-semibold flex items-center justify-center gap-2"
            style={{ background: '#2563EB' }}>
            <ExternalLink className="w-4 h-4" /> Abrir o {fiscal?.issuing_portal === 'prefeitura' ? 'portal da prefeitura' : 'Emissor Nacional'} em outra aba
          </a>
          <p className="text-[11.5px] text-center" style={{ color: 'var(--sm-text-4)' }}>
            Emita lá com os dados acima e volte aqui para registrar o número e anexar o PDF.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Número da nota"><TextInput value={number} onChange={e => setNumber(e.target.value)} placeholder="Ex.: 123" autoFocus /></Field>
            <Field label="Data de emissão"><TextInput type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor da nota (R$)"><TextInput inputMode="decimal" value={amountText} onChange={e => setAmount(e.target.value)} /></Field>
            <Field label="Chave de acesso / código de verificação (opcional)"><TextInput value={accessKey} onChange={e => setAccessKey(e.target.value)} /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <FilePick label="PDF da nota" accept="application/pdf,image/*" file={pdf} onChange={setPdf} />
            <FilePick label="XML da nota (opcional)" accept=".xml,text/xml,application/xml" file={xml} onChange={setXml} />
          </div>
          <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
            A nota fica ligada às cobranças deste mês, aparece no portal do cliente e o link do PDF vai junto nos lembretes de pagamento.
          </p>
        </div>
      )}
    </Modal>
  )
}

function FilePick({ label, accept, file, onChange }: { label: string; accept: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <Field label={label}>
      <label className="h-10 rounded-xl border border-dashed px-3 flex items-center gap-2 cursor-pointer text-[12.5px] truncate"
        style={{ borderColor: 'var(--sm-border)', color: file ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>
        <Paperclip className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{file ? file.name : 'Escolher arquivo'}</span>
        <input type="file" accept={accept} className="hidden" onChange={e => onChange(e.target.files?.[0] ?? null)} />
      </label>
    </Field>
  )
}
