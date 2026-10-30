// ── Cadastro / edição de cliente ─────────────────────────────────────────────
// Visual editorial: seções numeradas com o título à esquerda e os campos à
// direita, linhas finas entre elas e a barra de salvar presa no rodapé.
// Ao criar com e-mail, o convite do portal sai na hora; o resultado fica
// acompanhado no perfil do cliente (painel "Acesso ao portal").

import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ImageIcon, Loader2, X } from 'lucide-react'
import { useCreateClient, useUpdateClient, useClient, useClients } from '@/hooks/useClients'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { useSubscription } from '@/hooks/useSubscription'
import { sendPortalInvite } from '@/hooks/usePortalAccess'
import { supabase } from '@/integrations/supabase/client'
import { checkStorageLimit } from '@/utils/storageGate'
import { ApplyTemplateModal } from '@/components/tasks/ApplyTemplateModal'
import { Field, TextInput, SelectInput, PrimaryButton, GhostButton, inputCls, inputStyle, parseMoney, moneyToInput } from '@/pages/financial/finUi'
import type { Client } from '@/types'
import { ServiceBillingPicker, InstallmentChooser, splitInstallments, type ServiceBillingMode } from '@/components/ServiceBillingPicker'
import { fmtBRL } from '@/utils/crm'

// Mapeia o tipo de serviço escolhido no cadastro para a categoria do modelo
const serviceToCategory: Record<string, string | null> = {
  trafego: 'trafego', social: 'social', completo: 'completo', outro: null, '': null,
}

const emptyForm = {
  company_name: '', responsible_name: '', niche: '', instagram: '', whatsapp: '',
  email: '', website: '', main_objective: '', target_audience: '', tone_of_voice: '',
  communication_style: '', differentials: '', services_offered: '', forbidden_words: '',
  observations: '', status: 'ativo' as Client['status'],
  service_type: '',
  entry_date: new Date().toISOString().split('T')[0],
  logo_url: null as string | null,
  responsible_user_id: null as string | null,
  valor_mensal: null as number | null,
  dia_vencimento: null as number | null,
  billing_mode: 'recorrente' as ServiceBillingMode,
  parcelas: null as number | null,
  billing_due_date: null as string | null,
  installments_start: null as string | null,
  financial_status: null as Client['financial_status'],
  last_payment_date: null as string | null,
  manual_status_override: null as boolean | null,
}

// Campos que o CRM pode pré-preencher ao converter um lead em cliente
const prefillableFields = ['company_name', 'responsible_name', 'whatsapp', 'email', 'instagram'] as const

function TextArea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...p} className={`${inputCls} h-auto py-2 leading-relaxed resize-y`} style={inputStyle} />
}

function Section({ n, title, text, children }: { n: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-x-10 gap-y-4 py-7 border-t first:border-t-0 first:pt-2"
      style={{ borderColor: 'var(--sm-border)' }}>
      <div>
        <h2 className="font-display text-[18px] font-bold leading-tight" style={{ color: 'var(--sm-text-1)' }}>{title}</h2>
        <p className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--sm-text-3)' }}>{text}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 content-start">{children}</div>
    </section>
  )
}

export function ClientForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromLeadId = searchParams.get('from_lead')
  const { user, agencyId } = useAuth()
  const { toast } = useToast()
  const { data: existingClient } = useClient(id || '')
  const { data: allClients = [] } = useClients()
  const { data: subData } = useSubscription()
  const createClient = useCreateClient()
  const updateClient = useUpdateClient()
  const [form, setForm] = useState(emptyForm)
  const [money, setMoney] = useState('')
  const [totalMoney, setTotalMoney] = useState('')     // único / parcelado
  const [entradaMoney, setEntradaMoney] = useState('') // parcelado
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [onboard, setOnboard] = useState<{ clientId: string; category: string | null } | null>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (existingClient) {
      setForm({ ...(existingClient as any), billing_mode: existingClient.billing_mode ?? 'recorrente' })
      setMoney(moneyToInput(existingClient.valor_mensal))
      setTotalMoney(moneyToInput(existingClient.valor_total ?? null))
      setEntradaMoney(moneyToInput(existingClient.entrada ?? null))
    }
  }, [existingClient])

  // Lead convertido no CRM chega com os dados na URL — roda uma vez, só no
  // cadastro novo, para não sobrescrever o que já estava sendo digitado.
  useEffect(() => {
    if (isEdit) return
    const seeded: Record<string, string> = {}
    for (const field of prefillableFields) {
      const value = searchParams.get(field)
      if (value) seeded[field] = value
    }
    if (Object.keys(seeded).length > 0) setForm(prev => ({ ...prev, ...seeded }))
    const mode = searchParams.get('billing_mode') as ServiceBillingMode | null
    const valor = searchParams.get('valor')
    if (mode && ['unico', 'recorrente', 'parcelado'].includes(mode)) {
      const parcelas = Number(searchParams.get('parcelas')) || null
      const dia = Number(searchParams.get('dia_vencimento')) || null
      setForm(prev => ({
        ...prev,
        billing_mode: mode,
        parcelas: mode === 'parcelado' ? parcelas : prev.parcelas,
        dia_vencimento: mode === 'recorrente' && dia ? dia : prev.dia_vencimento,
      }))
      if (valor) (mode === 'recorrente' ? setMoney : setTotalMoney)(moneyToInput(Number(valor)))
      const entrada = searchParams.get('entrada')
      if (mode === 'parcelado' && entrada) setEntradaMoney(moneyToInput(Number(entrada)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit])

  const set = (field: string, value: string | number | null) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setIsUploadingLogo(true)
    try {
      const { allowed, message } = await checkStorageLimit(file.size)
      if (!allowed) { toast(message ?? 'Limite de armazenamento atingido.', 'error'); return }
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${agencyId!}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('client-logos').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('client-logos').getPublicUrl(path)
      set('logo_url', publicUrl)
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setIsUploadingLogo(false)
      e.target.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    // Trava o salvar do começo ao fim, convite incluso: um segundo clique
    // durante o envio do convite criava um cadastro repetido.
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      await doSubmit()
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const doSubmit = async () => {
    if (!user) return
    // Só os campos da forma escolhida vão preenchidos; os outros zeram (o banco
    // gera a cobrança certa: mensalidade, lançamento único ou entrada + parcelas)
    const mode = form.billing_mode ?? 'recorrente'
    const total = totalMoney.trim() ? parseMoney(totalMoney) : null
    const { plan_entry_id: _planEntry, ...rest } = form as typeof form & { plan_entry_id?: string | null }
    const payload = {
      ...rest,
      billing_mode:       mode,
      valor_mensal:       mode === 'recorrente' && money.trim() ? parseMoney(money) : null,
      dia_vencimento:     mode === 'recorrente' ? form.dia_vencimento : null,
      valor_total:        mode === 'recorrente' ? null : total,
      entrada:            mode === 'parcelado' && entradaMoney.trim() ? parseMoney(entradaMoney) : null,
      parcelas:           mode === 'parcelado' ? form.parcelas : null,
      billing_due_date:   mode === 'recorrente' ? null : (form.billing_due_date || null),
      installments_start: mode === 'parcelado' ? (form.installments_start || null) : null,
    }
    if (mode === 'parcelado' && total && payload.entrada && payload.entrada >= total) {
      toast('A entrada precisa ser menor que o valor total.', 'error')
      return
    }

    // ── Gate: limite de clientes por plano (o banco também confere) ─────────
    if (!isEdit) {
      const maxClients = subData?.plan.maxClients ?? 5
      if (maxClients !== -1 && allClients.length >= maxClients) {
        toast(`Limite de ${maxClients} clientes do plano ${subData?.plan.name ?? 'atual'} atingido. Faça upgrade para adicionar mais.`, 'error')
        return
      }
    }

    try {
      if (isEdit) {
        await updateClient.mutateAsync({ id: id!, ...payload })
        toast('Cliente atualizado.', 'success')
        navigate(`/clients/${id}`)
        return
      }

      const created = await createClient.mutateAsync({ ...payload, user_id: agencyId! })

      // Veio de um lead do CRM: fecha o ciclo marcando a conversão
      if (fromLeadId) {
        try {
          await (supabase as any).from('crm_leads').update({ converted_client_id: created.id }).eq('id', fromLeadId)
        } catch { /* secundário: o cliente já foi criado */ }
      }

      // Convite do portal: o resultado fica no perfil do cliente
      if (form.email && subData?.plan.hasClientPortal) {
        const r = await sendPortalInvite(created.id)
        toast(r.ok
          ? 'Cliente cadastrado e convite do portal enviado. Acompanhe no perfil do cliente.'
          : `Cliente cadastrado, mas o convite NÃO foi enviado: ${r.message}`, r.ok ? 'success' : 'error')
      } else {
        toast('Cliente cadastrado.', 'success')
      }

      // Oferece criar as primeiras tarefas (modelo pelo tipo de serviço);
      // ao fechar ou pular, vai para o perfil do cliente.
      setOnboard({ clientId: created.id, category: serviceToCategory[form.service_type] ?? null })
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <form onSubmit={handleSubmit} className="p-4 md:p-6 max-w-6xl mx-auto">

        {/* ── Cabeçalho (no celular, ao lado do menu) ── */}
        <header className="mb-4 max-md:pl-12 max-md:-mt-[3.25rem]">
          <Link to={isEdit ? `/clients/${id}` : '/clients'} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline mb-2"
            style={{ color: 'var(--sm-text-3)' }}>
            <ArrowLeft className="w-4 h-4" /> {isEdit ? 'Voltar ao cliente' : 'Clientes'}
          </Link>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Clientes</p>
          <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>
            {isEdit ? (form.company_name || 'Editar cliente') : 'Novo cliente'}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
            {isEdit ? 'Dados do cadastro, estratégia e mensalidade.' : 'Cadastre o cliente; com e-mail, o convite do portal sai ao salvar.'}
          </p>
        </header>

        <div className="rounded-2xl border px-5 md:px-7" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>

          {/* 01 · Identidade */}
          <Section n="01" title="Identidade" text="Como o cliente aparece no sistema e no portal.">
            <div className="md:col-span-2 flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl border flex-shrink-0 overflow-hidden flex items-center justify-center"
                style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
                {form.logo_url
                  ? <img src={form.logo_url} alt="" className="w-full h-full object-cover" />
                  : <span className="font-display text-[20px] font-bold" style={{ color: 'var(--sm-text-3)' }}>
                      {form.company_name ? form.company_name.slice(0, 2).toUpperCase() : '?'}
                    </span>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => logoRef.current?.click()} disabled={isUploadingLogo}
                    className="h-9 px-3 rounded-xl border text-[12.5px] font-medium inline-flex items-center gap-1.5 hover:bg-black/5 disabled:opacity-50"
                    style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                    {isUploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    {isUploadingLogo ? 'Enviando…' : form.logo_url ? 'Trocar logo' : 'Enviar logo'}
                  </button>
                  {form.logo_url && (
                    <button type="button" onClick={() => set('logo_url', null)}
                      className="h-9 px-2.5 rounded-xl text-[12.5px] inline-flex items-center gap-1 hover:text-[#EF4444]"
                      style={{ color: 'var(--sm-text-3)' }}>
                      <X className="w-3.5 h-3.5" /> Remover
                    </button>
                  )}
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--sm-text-4)' }}>PNG, JPG ou WEBP, até 5 MB</p>
              </div>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
            </div>

            <Field label="Nome da empresa *">
              <TextInput value={form.company_name} onChange={e => set('company_name', e.target.value)} required placeholder="Ex.: Studio Fitness" />
            </Field>
            <Field label="Responsável *">
              <TextInput value={form.responsible_name} onChange={e => set('responsible_name', e.target.value)} required placeholder="Ex.: João Silva" />
            </Field>
            <Field label="Nicho *">
              <TextInput value={form.niche} onChange={e => set('niche', e.target.value)} required placeholder="Ex.: Academia / fitness" />
            </Field>
            <Field label="Data de entrada">
              <TextInput type="date" value={form.entry_date} onChange={e => set('entry_date', e.target.value)} />
            </Field>
            <Field label="Status">
              <SelectInput value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="lead">Lead</option>
                <option value="proposta">Proposta</option>
                <option value="fechado">Fechado</option>
                <option value="onboarding">Onboarding</option>
                <option value="ativo">Ativo</option>
                <option value="pausado">Pausado</option>
                <option value="encerrado">Encerrado</option>
              </SelectInput>
            </Field>
            <Field label="Tipo de serviço" hint={!isEdit ? 'Sugere o modelo de tarefas certo ao salvar.' : undefined}>
              <SelectInput value={form.service_type || ''} onChange={e => set('service_type', e.target.value)}>
                <option value="">Não definir</option>
                <option value="trafego">Tráfego pago</option>
                <option value="social">Social media</option>
                <option value="completo">Completo (social + tráfego)</option>
                <option value="outro">Outro</option>
              </SelectInput>
            </Field>
          </Section>

          {/* 02 · Contato e portal */}
          <Section n="02" title="Contato e portal" text="O e-mail é o login do cliente no portal de aprovação.">
            <Field label="E-mail" className="md:col-span-2"
              hint={form.email && !isEdit
                ? (subData?.plan.hasClientPortal
                    ? 'Ao salvar, o convite do portal vai para este e-mail. Você acompanha no perfil do cliente se ele criou a senha e quando entrou.'
                    : 'O portal do cliente não está no seu plano.')
                : isEdit ? 'Trocou o e-mail? Reenvie o convite pelo perfil do cliente.' : 'Sem e-mail, o cliente não recebe acesso ao portal.'}>
              <TextInput type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="contato@empresa.com" />
            </Field>
            <Field label="WhatsApp" hint="55 + DDD + número. Ex.: 5511999999999">
              <TextInput value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} placeholder="5511999999999" inputMode="tel" />
            </Field>
            <Field label="Instagram">
              <TextInput value={form.instagram || ''} onChange={e => set('instagram', e.target.value)} placeholder="@perfil" />
            </Field>
            <Field label="Site" className="md:col-span-2">
              <TextInput value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://empresa.com" />
            </Field>
          </Section>

          {/* 03 · Estratégia */}
          <Section n="03" title="Estratégia" text="Base para o planejamento de conteúdo e para quem entra na equipe.">
            <Field label="Objetivo principal"><TextArea value={form.main_objective || ''} onChange={e => set('main_objective', e.target.value)} placeholder="Ex.: aumentar vendas de planos mensais" /></Field>
            <Field label="Público-alvo"><TextArea value={form.target_audience || ''} onChange={e => set('target_audience', e.target.value)} placeholder="Ex.: mulheres de 25 a 40 anos, interessadas em saúde" /></Field>
            <Field label="Tom de voz"><TextInput value={form.tone_of_voice || ''} onChange={e => set('tone_of_voice', e.target.value)} placeholder="Ex.: enérgico, motivacional, próximo" /></Field>
            <Field label="Estilo de comunicação"><TextInput value={form.communication_style || ''} onChange={e => set('communication_style', e.target.value)} placeholder="Ex.: informal, direto" /></Field>
            <Field label="Diferenciais"><TextArea value={form.differentials || ''} onChange={e => set('differentials', e.target.value)} placeholder="Ex.: metodologia exclusiva" /></Field>
            <Field label="Serviços oferecidos"><TextArea value={form.services_offered || ''} onChange={e => set('services_offered', e.target.value)} placeholder="Ex.: musculação, personal, nutrição" /></Field>
            <Field label="Palavras proibidas"><TextArea value={form.forbidden_words || ''} onChange={e => set('forbidden_words', e.target.value)} placeholder="Ex.: barato, comum" /></Field>
            <Field label="Observações"><TextArea value={form.observations || ''} onChange={e => set('observations', e.target.value)} placeholder="Informações adicionais" /></Field>
          </Section>

          {/* 04 · Cobrança */}
          <Section n="04" title="Cobrança" text="Como o serviço é pago. Gera as cobranças do cliente no Financeiro automaticamente.">
            <ServiceBillingPicker className="md:col-span-2" value={form.billing_mode ?? 'recorrente'} onChange={m => set('billing_mode', m)} />

            {(form.billing_mode ?? 'recorrente') === 'recorrente' && <>
              <Field label="Valor mensal (R$)">
                <TextInput inputMode="decimal" value={money} onChange={e => setMoney(e.target.value)} placeholder="Ex.: 1.500,00" />
              </Field>
              <Field label="Dia de vencimento">
                <TextInput type="number" min={1} max={31} value={form.dia_vencimento ?? ''}
                  onChange={e => set('dia_vencimento', e.target.value ? Number(e.target.value) : null)} placeholder="Ex.: 10" />
              </Field>
            </>}

            {form.billing_mode === 'unico' && <>
              <Field label="Valor do serviço (R$)">
                <TextInput inputMode="decimal" value={totalMoney} onChange={e => setTotalMoney(e.target.value)} placeholder="Ex.: 3.000,00" />
              </Field>
              <Field label="Data do pagamento" hint="Vira uma conta a receber no Financeiro.">
                <TextInput type="date" value={form.billing_due_date ?? ''} onChange={e => set('billing_due_date', e.target.value || null)} />
              </Field>
            </>}

            {form.billing_mode === 'parcelado' && <>
              <Field label="Valor total (R$)">
                <TextInput inputMode="decimal" value={totalMoney} onChange={e => setTotalMoney(e.target.value)} placeholder="Ex.: 10.000,00" />
              </Field>
              <Field label="Entrada (R$)" hint="Deixe em branco se não tiver entrada.">
                <TextInput inputMode="decimal" value={entradaMoney} onChange={e => setEntradaMoney(e.target.value)} placeholder="Ex.: 3.000,00" />
              </Field>
              {/* A lista já mostra quanto fica cada parcela */}
              <div className="md:col-span-2">
                <span className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--sm-text-3)' }}>
                  {entradaMoney.trim() ? 'Restante dividido em' : 'Dividido em'}
                </span>
                <InstallmentChooser
                  total={totalMoney.trim() ? parseMoney(totalMoney) : 0}
                  entrada={entradaMoney.trim() ? parseMoney(entradaMoney) : 0}
                  value={form.parcelas ?? null}
                  onChange={n => set('parcelas', n)}
                  format={v => fmtBRL(v, true)} />
              </div>
              <Field label="Data da entrada">
                <TextInput type="date" value={form.billing_due_date ?? ''} onChange={e => set('billing_due_date', e.target.value || null)} />
              </Field>
              <Field label="Vencimento da 1ª parcela" hint="As outras vencem no mesmo dia dos meses seguintes.">
                <TextInput type="date" value={form.installments_start ?? ''} onChange={e => set('installments_start', e.target.value || null)} />
              </Field>
              {(() => {
                const split = splitInstallments(totalMoney.trim() ? parseMoney(totalMoney) : 0,
                  entradaMoney.trim() ? parseMoney(entradaMoney) : 0, form.parcelas ?? 0)
                if (!split || !form.parcelas) return null
                return (
                  <p className="md:col-span-2 text-[12.5px] rounded-xl border px-3.5 py-2.5"
                    style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)' }}>
                    {split.entrada > 0 && <>Entrada de <strong style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(split.entrada, true)}</strong> + </>}
                    <strong style={{ color: 'var(--sm-text-1)' }}>{split.parcelas}x de {fmtBRL(split.parcela, true)}</strong>
                  </p>
                )
              })()}
            </>}
          </Section>
        </div>

        {/* ── Barra de salvar: gruda no rodapé enquanto a página rola ── */}
        <div className="sticky bottom-0 z-20 -mx-4 md:-mx-6 mt-4 px-4 md:px-6 py-3 border-t backdrop-blur flex items-center justify-end gap-2"
          style={{ background: 'color-mix(in srgb, var(--sm-bg-card2) 92%, transparent)', borderColor: 'var(--sm-border)' }}>
          <GhostButton type="button" onClick={() => navigate(-1)}>Cancelar</GhostButton>
          <PrimaryButton type="submit" disabled={submitting || isUploadingLogo}>
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Cadastrar cliente'}
          </PrimaryButton>
        </div>
      </form>

      {/* Após criar: oferece criar as primeiras tarefas a partir de um modelo */}
      {onboard && (
        <ApplyTemplateModal
          clientId={onboard.clientId}
          initialCategory={onboard.category}
          open
          onClose={() => { const cid = onboard.clientId; setOnboard(null); navigate(`/clients/${cid}`) }}
        />
      )}
    </div>
  )
}
