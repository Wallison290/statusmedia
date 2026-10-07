import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Eye, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useClients } from '@/hooks/useClients'
import { useAgencyWhatsapp } from '@/hooks/useAgencyWhatsapp'
import { useToast } from '@/components/ui/toast'
import {
  useBillingSettings, useSaveBillingSettings, useBillingLog, useBillingPreview,
  useToggleClientAutoBilling, type BillingSettings,
} from '@/hooks/useFinance'
import { Card, SectionTitle, Field, TextInput, SelectInput, PrimaryButton, GhostButton, EmptyState, TabSkeleton } from './finUi'

const STAGE_OPTIONS = [-7, -5, -3, -1, 0, 1, 3, 5, 7, 10, 15, 30]
const stageLabel = (s: number) => s < 0 ? `${-s} dia${s === -1 ? '' : 's'} antes` : s === 0 ? 'No dia' : `${s} dia${s === 1 ? '' : 's'} depois`
const KEY_TYPES = { cnpj: 'CNPJ', cpf: 'CPF', email: 'E-mail', telefone: 'Celular', aleatoria: 'Chave aleatória' } as const
const VARS = ['{cliente}', '{empresa}', '{valor}', '{vencimento}', '{dias_atraso}', '{descricao}', '{pix_info}', '{dados_bancarios}', '{nota_fiscal}', '{agencia}']

type Draft = Omit<BillingSettings, 'user_id'>
const EMPTY: Draft = {
  enabled: false, pix_key: '', pix_key_type: 'cnpj', receiver_name: '', receiver_city: '', bank_details: '',
  channel_whatsapp: true, channel_email: false, stages: [-3, 0, 1, 3, 7], send_hour: 9,
  template_before: null, template_due: null, template_after: null,
}

export function BillingTab() {
  const { toast } = useToast()
  const { data: saved, isLoading } = useBillingSettings()
  const save = useSaveBillingSettings()
  const preview = useBillingPreview()
  const { data: wa } = useAgencyWhatsapp()
  const { data: clients = [] } = useClients()
  const toggleClient = useToggleClientAutoBilling()
  const { data: log = [] } = useBillingLog()

  const [d, setD] = useState<Draft>(EMPTY)
  const [defaults, setDefaults] = useState<{ before: string; due: string; after: string } | null>(null)
  const [tplTab, setTplTab] = useState<'before' | 'due' | 'after'>('before')
  const [shown, setShown] = useState<{ text: string; pix: string | null } | null>(null)

  useEffect(() => { if (saved) { const { user_id: _u, ...rest } = saved as any; setD({ ...EMPTY, ...rest }) } }, [saved])
  // Textos padrão vêm da própria função (fonte única)
  useEffect(() => {
    preview.mutateAsync({}).then(r => setDefaults(r.defaults)).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(p => ({ ...p, [k]: v }))
  const tplKey = tplTab === 'before' ? 'template_before' : tplTab === 'due' ? 'template_due' : 'template_after'
  const tplValue = (d[tplKey] ?? defaults?.[tplTab] ?? '') as string

  const missing = useMemo(() => {
    const m: string[] = []
    if (!d.pix_key && !d.bank_details) m.push('Informe a chave Pix ou os dados bancários para o cliente saber onde pagar.')
    if (d.channel_whatsapp && wa?.status !== 'connected') m.push('O WhatsApp da agência não está conectado: os lembretes por WhatsApp não vão sair.')
    if (!d.channel_whatsapp && !d.channel_email) m.push('Escolha pelo menos um canal (WhatsApp ou e-mail).')
    return m
  }, [d, wa])

  const withClients = (clients as any[]).filter(c => c.valor_mensal || c.status === 'ativo')
  const noContact = withClients.filter(c => c.auto_billing !== false && (d.channel_whatsapp ? !c.whatsapp : true) && (d.channel_email ? !c.email : true))

  const submit = async (enabled = d.enabled) => {
    if (enabled && !d.pix_key && !d.bank_details) return toast('Informe a chave Pix ou os dados bancários antes de ligar.', 'error')
    try {
      await save.mutateAsync({ ...d, enabled, stages: [...d.stages].sort((a, b) => a - b) })
      setD(p => ({ ...p, enabled }))
      toast(enabled !== saved?.enabled ? (enabled ? 'Cobrança automática ligada.' : 'Cobrança automática desligada.') : 'Configuração salva.', 'success')
    } catch (err: any) { toast(err.message ?? 'Erro ao salvar.', 'error') }
  }

  const showPreview = async () => {
    try {
      const r = await preview.mutateAsync({ draft: { ...d, [tplKey]: tplValue } })
      setShown({ text: r.text, pix: r.pix })
    } catch (err: any) { toast(err.message ?? 'Erro na pré-visualização.', 'error') }
  }

  if (isLoading) return <TabSkeleton kpis={0} blocks={[120, 260, 200]} />

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 01 · Liga/desliga */}
      <Card className="p-5 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[220px]">
          <p className="font-display text-[17px] font-bold" style={{ color: 'var(--sm-text-1)' }}>
            Cobrança automática {d.enabled ? 'ligada' : 'desligada'}
          </p>
          <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
            Os lembretes saem sozinhos antes, no dia e depois do vencimento. O cliente paga direto na conta da agência,
            e as cobranças daquela parcela param quando você a marca como paga.
          </p>
        </div>
        <button onClick={() => submit(!d.enabled)} disabled={save.isPending}
          className="h-10 px-5 rounded-xl text-[13px] font-semibold disabled:opacity-50"
          style={d.enabled
            ? { border: '1px solid var(--sm-border)', color: 'var(--sm-text-2)' }
            : { background: 'var(--sm-primary)', color: '#fff' }}>
          {d.enabled ? 'Desligar' : 'Ligar cobrança automática'}
        </button>
        {missing.length > 0 && (
          <div className="basis-full space-y-1">
            {missing.map(m => (
              <p key={m} className="text-[12.5px] flex items-start gap-1.5" style={{ color: '#F59E0B' }}>
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {m}
                {m.includes('WhatsApp da agência') && <Link to="/whatsapp" className="underline ml-1">Conectar</Link>}
              </p>
            ))}
          </div>
        )}
      </Card>

      {/* 02 · Onde pagar */}
      <section>
        <SectionTitle n="01" title="Onde o cliente paga" />
        <Card className="p-5 space-y-3.5">
          <div className="grid sm:grid-cols-[160px_1fr] gap-3">
            <Field label="Tipo de chave Pix">
              <SelectInput value={d.pix_key_type ?? 'cnpj'} onChange={e => set('pix_key_type', e.target.value as any)}>
                {Object.entries(KEY_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </SelectInput>
            </Field>
            <Field label="Chave Pix da conta da agência" hint="O Pix Copia e Cola com o valor exato é montado a partir desta chave. O dinheiro cai direto na conta dona dela.">
              <TextInput value={d.pix_key ?? ''} onChange={e => set('pix_key', e.target.value)} placeholder="Ex.: 12.345.678/0001-90" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-[1fr_200px] gap-3">
            <Field label="Nome do favorecido" hint="Como aparece no banco (até 25 letras).">
              <TextInput value={d.receiver_name ?? ''} onChange={e => set('receiver_name', e.target.value)} placeholder="Razão social ou nome" maxLength={40} />
            </Field>
            <Field label="Cidade">
              <TextInput value={d.receiver_city ?? ''} onChange={e => set('receiver_city', e.target.value)} placeholder="Ex.: Petrolina" maxLength={30} />
            </Field>
          </div>
          <Field label="Dados para transferência (opcional)" hint="Vai no texto da mensagem para quem prefere TED/transferência.">
            <TextInput value={d.bank_details ?? ''} onChange={e => set('bank_details', e.target.value)}
              placeholder="Itaú · Ag. 1234 · CC 56789-0 · Agência X Ltda · CNPJ 12.345.678/0001-90" />
          </Field>
        </Card>
      </section>

      {/* 03 · Quando */}
      <section>
        <SectionTitle n="02" title="Quando cobrar" />
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {STAGE_OPTIONS.map(s => {
              const on = d.stages.includes(s)
              return (
                <button key={s} type="button"
                  onClick={() => set('stages', on ? d.stages.filter(x => x !== s) : [...d.stages, s])}
                  className="h-9 px-3 rounded-xl border text-[12.5px] font-medium"
                  aria-pressed={on}
                  style={on
                    ? { borderColor: '#2563EB', background: 'rgba(37,99,235,0.14)', color: 'var(--sm-text-1)' }
                    : { borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
                  {on && '✓ '}{stageLabel(s)}
                </button>
              )
            })}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Horário de envio (Brasília)">
              <SelectInput value={d.send_hour} onChange={e => set('send_hour', Number(e.target.value))}>
                {Array.from({ length: 16 }, (_, i) => i + 6).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </SelectInput>
            </Field>
            <div>
              <span className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--sm-text-3)' }}>Canais</span>
              <div className="flex gap-4 h-10 items-center">
                <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--sm-text-2)' }}>
                  <input type="checkbox" checked={d.channel_whatsapp} onChange={e => set('channel_whatsapp', e.target.checked)} /> WhatsApp da agência
                </label>
                <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--sm-text-2)' }}>
                  <input type="checkbox" checked={d.channel_email} onChange={e => set('channel_email', e.target.checked)} /> E-mail
                </label>
              </div>
            </div>
          </div>
          <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
            Se o cliente tiver mais de uma parcela em aberto, ele recebe uma mensagem só, com o total.
            Cada lembrete sai uma vez por parcela.
          </p>
        </Card>
      </section>

      {/* 04 · Mensagens */}
      <section>
        <SectionTitle n="03" title="Mensagens" right={
          <GhostButton className="!h-9" onClick={showPreview} disabled={preview.isPending}><Eye className="w-4 h-4" /> Ver como fica</GhostButton>
        } />
        <Card className="p-5 space-y-3">
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--sm-bg-alt)' }}>
            {([['before', 'Antes do vencimento'], ['due', 'No dia'], ['after', 'Em atraso']] as const).map(([k, l]) => (
              <button key={k} onClick={() => { setTplTab(k); setShown(null) }} className="h-8 px-3 rounded-lg text-[12.5px] font-medium"
                style={tplTab === k ? { background: 'var(--sm-bg-card)', color: 'var(--sm-text-1)' } : { color: 'var(--sm-text-3)' }}>{l}</button>
            ))}
          </div>
          <textarea value={tplValue} onChange={e => set(tplKey, e.target.value)} rows={12}
            className="w-full rounded-xl border p-3 text-[13px] leading-relaxed outline-none focus:border-[#2563EB]/60 font-mono"
            style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }} />
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
            Variáveis: {VARS.map(v => <code key={v} className="px-1.5 py-0.5 rounded" style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)' }}>{v}</code>)}
          </div>
          <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
            Linha com variável vazia some sozinha (ex.: sem dados bancários, a linha deles não aparece). O Pix Copia e Cola vai numa
            segunda mensagem, sozinho, para o cliente copiar fácil. Use *texto* para negrito no WhatsApp.
            {d[tplKey] && defaults && (
              <button onClick={() => set(tplKey, null)} className="ml-2 underline">Voltar ao texto padrão</button>
            )}
          </p>
          {shown && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--sm-bg-alt)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sm-text-4)' }}>Prévia (exemplo)</p>
              <div className="max-w-[420px] rounded-xl rounded-tl-sm px-3 py-2 text-[13px] whitespace-pre-wrap" style={{ background: 'var(--sm-bg-card)', color: 'var(--sm-text-1)' }}>
                {shown.text}
              </div>
              {shown.pix && (
                <div className="max-w-[420px] rounded-xl rounded-tl-sm px-3 py-2 text-[11.5px] font-mono break-all" style={{ background: 'var(--sm-bg-card)', color: 'var(--sm-text-2)' }}>
                  {shown.pix}
                  <button onClick={() => { navigator.clipboard?.writeText(shown.pix!); toast('Código copiado. Cole no app do banco para testar.', 'success') }}
                    className="mt-1.5 flex items-center gap-1 text-[11.5px] font-sans font-semibold" style={{ color: '#60A5FA' }}>
                    <Copy className="w-3 h-3" /> Copiar para testar no app do banco
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>
      </section>

      <div className="flex justify-end">
        <PrimaryButton onClick={() => submit()} disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar configuração'}</PrimaryButton>
      </div>

      {/* 05 · Clientes */}
      <section>
        <SectionTitle n="04" title="Clientes" />
        {noContact.length > 0 && (
          <p className="text-[12.5px] mb-2 flex items-start gap-1.5" style={{ color: '#F59E0B' }}>
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {noContact.length} cliente(s) sem {d.channel_whatsapp ? 'WhatsApp' : 'e-mail'} cadastrado não vão receber lembrete.
          </p>
        )}
        <Card>
          {withClients.length === 0 ? <EmptyState title="Nenhum cliente ativo" /> : withClients.map((c, i) => {
            const on = c.auto_billing !== false
            const contact = [d.channel_whatsapp ? (c.whatsapp ? 'WhatsApp ok' : 'sem WhatsApp') : null, d.channel_email ? (c.email ? 'e-mail ok' : 'sem e-mail') : null].filter(Boolean).join(' · ')
            return (
              <div key={c.id} className={`px-4 py-2.5 flex items-center gap-3 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] truncate" style={{ color: 'var(--sm-text-1)' }}>{c.company_name}</p>
                  <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>{contact}</p>
                </div>
                <label className="flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: 'var(--sm-text-2)' }}>
                  <input type="checkbox" checked={on} onChange={e => toggleClient.mutate({ id: c.id, value: e.target.checked })} />
                  Cobrar automaticamente
                </label>
              </div>
            )
          })}
        </Card>
      </section>

      {/* 06 · Envios */}
      <section>
        <SectionTitle n="05" title="Últimos envios" />
        <Card>
          {log.length === 0 ? <EmptyState title="Nenhum lembrete enviado ainda" /> : log.map((l, i) => (
            <div key={l.id} className={`px-4 py-2.5 flex items-center gap-3 text-[12.5px] ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
              {l.status === 'enviado'
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#22C55E' }} aria-label="Enviado" />
                : <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} aria-label="Falhou" />}
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ color: 'var(--sm-text-1)' }}>
                  {l.clients?.company_name ?? 'Cliente'} · {l.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'} · {l.manual ? 'cobrança manual' : stageLabel(l.stage)}
                </p>
                {l.status !== 'enviado' && l.error && <p className="truncate text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>{l.error}</p>}
              </div>
              <span className="whitespace-nowrap" style={{ color: 'var(--sm-text-4)' }}>
                {new Date(l.sent_at).toLocaleDateString('pt-BR')} {new Date(l.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  )
}
