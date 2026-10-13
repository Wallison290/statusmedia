import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Loader2, Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CrmSetupSection } from './CrmSetupSection'
import { useToast } from '@/components/ui/toast'
import { useUpdateCrmSettings } from '@/hooks/useCrmSettings'
import { useCrmOffers } from '@/hooks/useCrmFollowup'
import { useCrmFollowupCompose, useCrmFollowupPreviewLeads } from '@/hooks/useCrmFollowupCompose'
import {
  FOLLOWUP_TONES, FOLLOWUP_LENGTHS, FOLLOWUP_CLOSINGS, normalizeFollowupStyle,
  followupStepsForOffer, followupStep, followupDefaultGoal, followupDayLabel,
  type FollowupStyle, type FollowupStepStyle,
} from '../../../supabase/functions/_shared/followup-style'

const selectClass = 'h-10 w-full min-w-0 rounded-lg border px-3 text-[13px]'

/** Grupo de opções em que só uma vale (tom, tamanho, encerramento). */
function ChoiceGroup<T extends string>({ label, options, value, onChange, columns }: {
  label: string; options: Record<T, string>; value: T; onChange: (value: T) => void; columns: string
}) {
  const id = useId()
  const keys = Object.keys(options) as T[]
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = keys[(index + step + keys.length) % keys.length]
    onChange(next)
    document.getElementById(`${id}-${next}`)?.focus()
  }
  return (
    <div>
      <p id={`${id}-label`} className="crm-field-label">{label}</p>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className={`grid gap-2 ${columns}`}>
        {keys.map((key, index) => <button key={key} id={`${id}-${key}`} type="button" role="radio" aria-checked={value === key}
          tabIndex={value === key ? 0 : -1} className="crm-choice !justify-start text-left" onClick={() => onChange(key)} onKeyDown={event => onKeyDown(event, index)}>
          {value === key && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}{options[key]}
        </button>)}
      </div>
    </div>
  )
}

export function CrmFollowupStyleSettings({ value, days, onDirtyChange }: { value: unknown; days: number[]; onDirtyChange?: (dirty: boolean) => void }) {
  const id = useId()
  const { toast } = useToast()
  const update = useUpdateCrmSettings()
  const { data: offers = [] } = useCrmOffers()
  const compose = useCrmFollowupCompose()
  const [offerId, setOfferId] = useState('')
  const [contact, setContact] = useState(days[0])
  const [suggestions, setSuggestions] = useState<Record<string, string> | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [leadId, setLeadId] = useState('')
  const [previewStep, setPreviewStep] = useState(days[0])
  const [preview, setPreview] = useState<{ message: string; warning?: string | null } | null>(null)
  const { data: leads = [], isLoading: leadsLoading, isError: leadsError, refetch: reloadLeads } = useCrmFollowupPreviewLeads(showPreview)
  const saved = normalizeFollowupStyle(value)
  const [draft, setDraft] = useState(() => saved)
  const dirty = JSON.stringify(normalizeFollowupStyle(draft)) !== JSON.stringify(saved)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  // Os dias mudaram na etapa 02: contato aberto e prévia voltam para um dia que existe
  const activeContact = days.includes(contact) ? contact : days[0]
  const activePreviewStep = days.includes(previewStep) ? previewStep : days[0]
  const defaultOffer = offers.find(offer => offer.is_default) ?? offers[0]
  const selectedOffer = offers.find(offer => offer.id === offerId) ?? defaultOffer
  const selectedSteps = followupStepsForOffer(draft, selectedOffer?.id)
  const previewLeads = leads.filter(lead => lead.followup_offer_id
    ? lead.followup_offer_id === selectedOffer?.id : selectedOffer?.id === defaultOffer?.id)
  const busy = update.isPending || compose.isPending
  const referenceCount = days.filter(day => followupStep(selectedSteps, day).example.trim()).length
  const hasProduct = !!selectedOffer?.product?.trim()
  const contactIndex = days.indexOf(activeContact)
  const current = followupStep(selectedSteps, activeContact)

  function change<K extends keyof FollowupStyle>(field: K, next: FollowupStyle[K]) {
    setPreview(null)
    setDraft(state => ({ ...state, [field]: next }))
  }

  function changeStep(step: number, field: keyof FollowupStepStyle, next: string) {
    setPreview(null)
    if (!selectedOffer) return
    setDraft(state => {
      const steps = followupStepsForOffer(state, selectedOffer.id)
      return { ...state, offerSteps: { ...state.offerSteps, [selectedOffer.id]: {
        ...steps, [String(step)]: { ...followupStep(steps, step), [field]: next },
      } } }
    })
  }

  function onContactKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = days[(index + step + days.length) % days.length]
    setContact(next)
    document.getElementById(`${id}-contact-${next}`)?.focus()
  }

  async function generate(action: 'suggest' | 'preview') {
    if (!selectedOffer || busy || !hasProduct) return
    setPreview(null)
    if (action === 'suggest') setSuggestions(null)
    try {
      const result = await compose.mutateAsync({ action, offerId: selectedOffer.id,
        style: normalizeFollowupStyle(draft), leadId, step: activePreviewStep, days })
      if (action === 'suggest') {
        if (!result.messages) throw new Error('A IA não retornou sugestões. Tente novamente.')
        setSuggestions(result.messages)
      } else {
        if (!result.message) throw new Error('A IA não retornou uma prévia. Tente novamente.')
        setPreview({ message: result.message, warning: result.warning })
      }
    } catch (error) { toast(error instanceof Error ? error.message : 'Erro ao gerar mensagem.', 'error') }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dirty || busy) return
    try {
      await update.mutateAsync({ followup_style: normalizeFollowupStyle(draft) })
      toast('Mensagens e estilo salvos. Os próximos follow-ups usam essas orientações.', 'success')
    } catch (error: unknown) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Erro ao salvar o estilo'
      toast(message, 'error')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 min-w-0">
      <fieldset disabled={busy} className="space-y-5 min-w-0">
        <legend className="sr-only">Preferências de escrita do follow-up</legend>
        <CrmSetupSection id="followup-messages" number="03" title="Defina como conversar"
          description="Primeiro o jeito de escrever, que vale para tudo. Depois, se quiser, o objetivo e um exemplo de mensagem para cada contato. A IA adapta o texto à conversa de cada cliente.">
        <div className="space-y-6">
          <div className="crm-panel p-4 sm:p-5 space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-[15px] font-semibold">Seu jeito de escrever</h4>
              <span className="text-[11px] rounded-full px-2.5 py-0.5 font-medium" style={{ background: 'var(--crm-accent-soft)', color: 'var(--crm-accent)' }}>Vale para todos os serviços</span>
            </div>
            <ChoiceGroup label="Tom de voz" options={FOLLOWUP_TONES} value={draft.tone} onChange={next => change('tone', next)} columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
            <div className="grid gap-5 lg:grid-cols-2">
              <ChoiceGroup label="Tamanho da mensagem" options={FOLLOWUP_LENGTHS} value={draft.length} onChange={next => change('length', next)} columns="grid-cols-1 sm:grid-cols-2" />
              <ChoiceGroup label="Como terminar a mensagem" options={FOLLOWUP_CLOSINGS} value={draft.closing} onChange={next => change('closing', next)} columns="grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3" />
            </div>
            <details className="crm-disclosure" style={{ background: 'var(--sm-bg-card)' }}>
              <summary>Orientações e palavras a evitar (opcional)</summary>
              <div className="crm-disclosure-body space-y-4">
                <div>
                  <label htmlFor={`${id}-instructions`} className="crm-field-label">Suas orientações de escrita</label>
                  <Textarea id={`${id}-instructions`} rows={3} maxLength={1500} value={draft.instructions} className="text-[13px]"
                    placeholder="Ex: Use frases curtas. Vá direto ao assunto, sem cumprimentar em todo contato. Fale dos benefícios práticos e evite parecer um texto de vendas."
                    onChange={event => change('instructions', event.target.value)} />
                  <p className="crm-field-hint">Descreva como você falaria com um cliente. Em branco, vale o tom escolhido acima.</p>
                </div>
                <div>
                  <label htmlFor={`${id}-avoid`} className="crm-field-label">Palavras e abordagens a evitar</label>
                  <Textarea id={`${id}-avoid`} rows={2} maxLength={500} value={draft.avoid} className="text-[13px]"
                    placeholder="Ex: Não usar 'passando para saber', 'oportunidade imperdível' ou insistir em marcar uma reunião."
                    onChange={event => change('avoid', event.target.value)} />
                </div>
              </div>
            </details>
          </div>

          <div className="space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h4 className="text-[15px] font-semibold">Mensagem de cada contato</h4>
                <p className="text-[12px] mt-1 leading-relaxed max-w-xl" style={{ color: 'var(--sm-text-2)' }}>Opcional. Em branco, a IA usa o objetivo padrão e a conversa com o cliente. {referenceCount} de {days.length} exemplos preenchidos.</p>
              </div>
              <Button type="button" variant="outline" className="h-10" disabled={!hasProduct} onClick={() => generate('suggest')}>
                {compose.isPending && compose.variables?.action === 'suggest' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Sugerir exemplos com IA
              </Button>
            </div>

            {offers.length > 1 && <div className="max-w-md">
              <label htmlFor={`${id}-offer`} className="crm-field-label">Serviço</label>
              <select id={`${id}-offer`} className={selectClass} value={selectedOffer?.id ?? ''}
                onChange={event => { setOfferId(event.target.value); setSuggestions(null); setPreview(null); setLeadId('') }}>
                {offers.map(offer => <option key={offer.id} value={offer.id}>{offer.name}{offer.id === defaultOffer?.id ? ' (padrão)' : ''}</option>)}
              </select>
              <p className="crm-field-hint">Cada serviço tem os próprios exemplos. O lead usa o serviço escolhido na ficha dele ou o padrão.</p>
            </div>}
            {!hasProduct && <p className="crm-settings-note">Preencha o que você vende na etapa 01 para receber sugestões da IA específicas do serviço.</p>}

            {suggestions && <div className="crm-panel p-4 space-y-3" aria-label="Sugestões de mensagens">
              <p className="text-[13px] font-semibold">Sugestões da IA</p>
              <p className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>Escolha as que quer usar. Elas entram como exemplo do contato e só valem depois de salvar.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {days.filter(day => suggestions[String(day)]).map(day => <div key={day} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-card)' }}>
                  <h5 className="text-[12px] font-semibold">{days.indexOf(day) + 1}º contato · {followupDayLabel(day)}</h5>
                  <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--sm-text-2)' }}>{suggestions[String(day)]}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    changeStep(day, 'example', suggestions[String(day)])
                    setContact(day)
                    toast('Exemplo aplicado. Salve para usar nos envios.', 'success')
                  }}>Usar esta</Button>
                </div>)}
              </div>
            </div>}

            <div>
              <p id={`${id}-contacts-label`} className="crm-field-label">Escolha o contato</p>
              <div role="tablist" aria-labelledby={`${id}-contacts-label`} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {days.map((day, index) => {
                  const filled = !!followupStep(selectedSteps, day).example || !!followupStep(selectedSteps, day).goal
                  return <button key={day} id={`${id}-contact-${day}`} type="button" role="tab" aria-selected={day === activeContact}
                    aria-controls={`${id}-contact-panel`} tabIndex={day === activeContact ? 0 : -1} className="crm-choice flex-col !gap-0 !py-2"
                    onClick={() => setContact(day)} onKeyDown={event => onContactKey(event, index)}>
                    <span className="flex items-center gap-1.5">{index + 1}º contato{filled && <Check className="w-3.5 h-3.5" aria-label="personalizado" />}</span>
                    <span className="crm-choice-sub">{followupDayLabel(day)}</span>
                  </button>
                })}
              </div>
            </div>

            <div id={`${id}-contact-panel`} role="tabpanel" aria-labelledby={`${id}-contact-${activeContact}`} className="crm-panel p-4 sm:p-5 space-y-5">
              <div>
                <h5 className="text-[14px] font-semibold">{contactIndex + 1}º contato, após {followupDayLabel(activeContact)} sem resposta</h5>
                <p className="text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--sm-text-2)' }}>Defina primeiro o objetivo. O exemplo mostra como você escreveria esse contato.</p>
              </div>
              <div>
                <label htmlFor={`${id}-goal`} className="crm-field-label"><span className="tabular-nums" style={{ color: 'var(--crm-accent)' }}>1.</span> Objetivo deste contato</label>
                <Textarea id={`${id}-goal`} rows={2} maxLength={700} disabled={!selectedOffer} value={current.goal}
                  placeholder={followupDefaultGoal(activeContact, days)} className="text-[13px]" onChange={event => changeStep(activeContact, 'goal', event.target.value)} />
                <p className="crm-field-hint">Em branco, vale o objetivo padrão que aparece no campo.</p>
              </div>
              <div>
                <label htmlFor={`${id}-example`} className="crm-field-label"><span className="tabular-nums" style={{ color: 'var(--crm-accent)' }}>2.</span> Mensagem de referência</label>
                <Textarea id={`${id}-example`} rows={4} maxLength={1000} disabled={!selectedOffer} value={current.example}
                  placeholder="Ex: Posso te explicar como o serviço funciona no seu negócio?" className="text-[13px]" onChange={event => changeStep(activeContact, 'example', event.target.value)} />
                <p className="crm-field-hint">A IA pode mudar a abertura, os argumentos e a pergunta, mantendo sua intenção.</p>
              </div>
              {!selectedOffer && <p className="crm-settings-note">Cadastre um serviço na etapa 01 para escrever os exemplos.</p>}
            </div>
            <p className="crm-settings-note">Sempre sem emojis. Antes de cada envio, a IA considera as dúvidas e objeções da conversa e usa apenas informações confirmadas no serviço ou no histórico.</p>
          </div>

          <div className="crm-save-bar" data-dirty={dirty}>
            <p className="text-[12px]" role="status" style={{ color: 'var(--sm-text-2)' }}>
              {dirty ? 'Alterações ainda não salvas. Salve para usar nos próximos envios.' : 'Mensagens e estilo salvos.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {dirty && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft(saved); setPreview(null); setSuggestions(null) }}>Descartar</Button>}
              <Button type="submit" size="sm" className="h-9" disabled={!dirty || busy}>
                {update.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Salvar mensagens e estilo
              </Button>
            </div>
          </div>
        </div>
        </CrmSetupSection>

        <CrmSetupSection id="followup-preview" number="04" title="Confira uma mensagem na prática"
          description="Escolha um cliente e veja como a IA adaptaria sua orientação à conversa dele. Opcional: não envia nada pelo WhatsApp e não mexe no funil.">
        {!showPreview && <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>Cada prévia usa 1 unidade da cota de mensagens com IA.</p>
          <Button type="button" variant="outline" className="h-10" disabled={!hasProduct} onClick={() => setShowPreview(true)}>Testar com um lead</Button>
        </div>}
        {showPreview && <div className="space-y-4">
          <p className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>Prévia de <strong style={{ color: 'var(--sm-text-1)' }}>{selectedOffer?.name}</strong> com suas alterações atuais, mesmo antes de salvar. No envio real o texto é gerado de novo.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor={`${id}-lead`} className="crm-field-label">Lead deste serviço</label>
              <select id={`${id}-lead`} className={selectClass} value={leadId}
                onChange={event => { setLeadId(event.target.value); setPreview(null) }}>
                <option value="">{leadsLoading ? 'Carregando clientes...' : 'Selecione um lead'}</option>
                {previewLeads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
              </select>
            </div>
            <div><label htmlFor={`${id}-preview-step`} className="crm-field-label">Contato</label>
              <select id={`${id}-preview-step`} className={selectClass} value={activePreviewStep}
                onChange={event => { setPreviewStep(Number(event.target.value)); setPreview(null) }}>
                {days.map((day, index) => <option key={day} value={day}>{index + 1}º contato · {followupDayLabel(day)}</option>)}
              </select>
            </div>
          </div>
          {leadsError && <div role="alert" className="text-[12px] flex items-center gap-2"><span>Não foi possível carregar os leads.</span><Button type="button" size="sm" variant="ghost" onClick={() => reloadLeads()}>Tentar novamente</Button></div>}
          {!leadsLoading && !leadsError && !previewLeads.length && <p className="crm-settings-note">Nenhum lead disponível para este serviço. Cadastre um lead no funil e selecione o serviço na ficha dele. A prévia também precisa de uma conversa registrada.</p>}
          <Button type="button" className="h-10" disabled={!hasProduct || !previewLeads.some(lead => lead.id === leadId)} onClick={() => generate('preview')}>
            {compose.isPending && compose.variables?.action === 'preview' && <Loader2 className="w-3 h-3 animate-spin" />} Gerar prévia
          </Button>
          {preview && <div aria-live="polite" className="space-y-3">
            <div className="rounded-2xl rounded-tl-sm p-4 max-w-xl" style={{ background: 'var(--crm-accent-soft)', border: '1px solid var(--crm-accent-border)' }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--crm-accent)' }}>Prévia da mensagem</p>
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--sm-text-1)' }}>{preview.message}</p>
            </div>
            {preview.warning && <p className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>{preview.warning}</p>}
          </div>}
        </div>}
        </CrmSetupSection>
      </fieldset>
    </form>
  )
}
