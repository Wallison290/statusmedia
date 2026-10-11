import { useId, useState, type FormEvent } from 'react'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useUpdateCrmSettings } from '@/hooks/useCrmSettings'
import { useCrmOffers } from '@/hooks/useCrmFollowup'
import { useCrmFollowupCompose, useCrmFollowupPreviewLeads } from '@/hooks/useCrmFollowupCompose'
import {
  FOLLOWUP_STYLE_STEPS, FOLLOWUP_DEFAULT_GOALS, FOLLOWUP_TONES,
  FOLLOWUP_LENGTHS, FOLLOWUP_CLOSINGS, normalizeFollowupStyle,
  followupStepsForOffer,
  type FollowupStyle, type FollowupStepStyle,
} from '../../../supabase/functions/_shared/followup-style'

const selectClass = 'h-9 w-full min-w-0 rounded-md border px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/45'
const selectStyle = {
  background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)',
}
const labelClass = 'block text-[12px] font-medium mb-1.5'

export function CrmFollowupStyleSettings({ value }: { value: unknown }) {
  const id = useId()
  const { toast } = useToast()
  const update = useUpdateCrmSettings()
  const { data: offers = [] } = useCrmOffers()
  const compose = useCrmFollowupCompose()
  const [offerId, setOfferId] = useState('')
  const [suggestions, setSuggestions] = useState<Record<string, string> | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [leadId, setLeadId] = useState('')
  const [previewStep, setPreviewStep] = useState(1)
  const [preview, setPreview] = useState<{ message: string; warning?: string | null } | null>(null)
  const { data: leads = [], isError: leadsError } = useCrmFollowupPreviewLeads(showPreview)
  const saved = normalizeFollowupStyle(value)
  const [draft, setDraft] = useState(() => saved)
  const dirty = JSON.stringify(normalizeFollowupStyle(draft)) !== JSON.stringify(saved)
  const defaultOffer = offers.find(offer => offer.is_default) ?? offers[0]
  const selectedOffer = offers.find(offer => offer.id === offerId) ?? defaultOffer
  const selectedSteps = followupStepsForOffer(draft, selectedOffer?.id)
  const previewLeads = leads.filter(lead => lead.followup_offer_id
    ? lead.followup_offer_id === selectedOffer?.id : selectedOffer?.id === defaultOffer?.id)
  const busy = update.isPending || compose.isPending

  function resetPreview() { setPreview(null) }

  function change<K extends keyof FollowupStyle>(field: K, next: FollowupStyle[K]) {
    resetPreview()
    setDraft(current => ({ ...current, [field]: next }))
  }

  function changeStep(step: number, field: keyof FollowupStepStyle, next: string) {
    resetPreview()
    if (!selectedOffer) return
    const currentSteps = followupStepsForOffer(draft, selectedOffer.id)
    setDraft(current => ({ ...current, offerSteps: {
      ...current.offerSteps, [selectedOffer.id]: {
        ...currentSteps, [String(step)]: { ...currentSteps[String(step)], [field]: next },
      },
    } }))
  }

  async function generate(action: 'suggest' | 'preview') {
    if (!selectedOffer || busy) return
    setPreview(null)
    if (action === 'suggest') setSuggestions(null)
    try {
      const result = await compose.mutateAsync({ action, offerId: selectedOffer.id,
        style: normalizeFollowupStyle(draft), leadId, step: previewStep })
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
    if (!dirty || update.isPending) return
    try {
      await update.mutateAsync({ followup_style: normalizeFollowupStyle(draft) })
      toast('Estilo salvo. Será usado nos próximos follow-ups.', 'success')
    } catch (error: unknown) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Erro ao salvar o estilo'
      toast(message, 'error')
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border p-3 sm:p-4 space-y-3" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
      <div>
        <h3 className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> Estilo das mensagens
        </h3>
        <p className="text-[12px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
          Você define como escrever. A IA adapta essas orientações ao briefing do serviço e à conversa de cada lead.
          O estilo vale para todos os serviços. As mensagens de referência ficam vinculadas ao serviço escolhido.
        </p>
        <p className="text-[11.5px] mt-1 font-medium" style={{ color: '#4F8EF7' }}>
          Sempre sem emojis ou carinhas.
        </p>
      </div>

      <fieldset disabled={busy} className="space-y-3 min-w-0">
        <legend className="sr-only">Preferências de escrita do follow-up</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${id}-tone`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Tom de voz</label>
            <select id={`${id}-tone`} className={selectClass} style={selectStyle} value={draft.tone}
                    onChange={event => change('tone', event.target.value as FollowupStyle['tone'])}>
              {Object.entries(FOLLOWUP_TONES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-length`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Tamanho</label>
            <select id={`${id}-length`} className={selectClass} style={selectStyle} value={draft.length}
                    onChange={event => change('length', event.target.value as FollowupStyle['length'])}>
              {Object.entries(FOLLOWUP_LENGTHS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-closing`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Como encerrar</label>
            <select id={`${id}-closing`} className={selectClass} style={selectStyle} value={draft.closing}
                    onChange={event => change('closing', event.target.value as FollowupStyle['closing'])}>
              {Object.entries(FOLLOWUP_CLOSINGS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-instructions`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Suas orientações de escrita</label>
          <Textarea id={`${id}-instructions`} rows={3} maxLength={1500} value={draft.instructions} className="text-[12.5px]"
                    placeholder="Ex: Use frases curtas. Vá direto ao assunto, sem cumprimentar em todo contato. Fale dos benefícios práticos e evite parecer um texto de vendas."
                    onChange={event => change('instructions', event.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-avoid`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Palavras e abordagens a evitar</label>
          <Textarea id={`${id}-avoid`} rows={2} maxLength={500} value={draft.avoid} className="text-[12.5px]"
                    placeholder="Ex: Não usar 'passando para saber', 'oportunidade imperdível' ou insistir em marcar uma reunião."
                    onChange={event => change('avoid', event.target.value)} />
        </div>

        <div>
          <label htmlFor={`${id}-offer`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Serviço das mensagens de referência</label>
          <select id={`${id}-offer`} className={selectClass} style={selectStyle} value={selectedOffer?.id ?? ''}
            onChange={event => { setOfferId(event.target.value); setSuggestions(null); setPreview(null); setLeadId('') }}>
            {!offers.length && <option value="">Cadastre um briefing abaixo</option>}
            {offers.map(offer => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
          </select>
          <p className="text-[11.5px] mt-2" style={{ color: 'var(--sm-text-3)' }}>
            Antes de cada envio, a IA lê o histórico disponível, identifica dúvidas e objeções e adapta sua referência ao momento do lead, preservando sua intenção. Ajusta abertura, argumentos e encerramento sem inventar informações.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button type="button" size="sm" variant="outline" disabled={!selectedOffer} onClick={() => generate('suggest')}>
              {compose.isPending && compose.variables?.action === 'suggest' && <Loader2 className="w-3 h-3 animate-spin" />} Sugerir mensagens para este serviço
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={!selectedOffer} onClick={() => setShowPreview(current => !current)}>Testar com um lead</Button>
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'var(--sm-text-4)' }}>Cada geração de sugestões ou prévia usa 1 mensagem com IA da sua cota. Você revisa antes de aplicar.</p>
        </div>

        {suggestions && <div className="grid gap-2 sm:grid-cols-2" aria-label="Sugestões de mensagens">
          {FOLLOWUP_STYLE_STEPS.map(step => <div key={step} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--sm-border)' }}>
            <h4 className="text-[12px] font-medium" style={{ color: 'var(--sm-text-1)' }}>Sugestão para {step} dia{step > 1 ? 's' : ''}</h4>
            <p className="text-[12px] whitespace-pre-wrap break-words" style={{ color: 'var(--sm-text-2)' }}>{suggestions[String(step)]}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => {
              changeStep(step, 'example', suggestions[String(step)])
              toast('Referência aplicada ao rascunho. Salve o estilo para usar nos envios.', 'success')
            }}>Usar referência de {step} dia{step > 1 ? 's' : ''}</Button>
          </div>)}
        </div>}

        {showPreview && <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--sm-border)' }}>
          <p className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>Prévia com suas orientações atuais e o histórico do lead. Nenhuma mensagem será enviada. O texto é gerado novamente no envio real.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><label htmlFor={`${id}-lead`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Lead deste serviço</label>
              <select id={`${id}-lead`} className={selectClass} style={selectStyle} value={leadId}
                onChange={event => { setLeadId(event.target.value); setPreview(null) }}>
                <option value="">Selecione um lead</option>
                {previewLeads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
              </select>
            </div>
            <div><label htmlFor={`${id}-preview-step`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Contato da prévia</label>
              <select id={`${id}-preview-step`} className={selectClass} style={selectStyle} value={previewStep}
                onChange={event => { setPreviewStep(Number(event.target.value)); setPreview(null) }}>
                {FOLLOWUP_STYLE_STEPS.map(step => <option key={step} value={step}>{step} dia{step > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          </div>
          {leadsError && <p role="alert" className="text-[12px] text-red-400">Não foi possível carregar os leads. Reabra a prévia para tentar novamente.</p>}
          <Button type="button" size="sm" variant="outline" disabled={!leadId || !previewLeads.some(lead => lead.id === leadId)} onClick={() => generate('preview')}>
            {compose.isPending && compose.variables?.action === 'preview' && <Loader2 className="w-3 h-3 animate-spin" />} Gerar prévia
          </Button>
          {preview && <div aria-live="polite" className="space-y-2">
            <p className="text-[12.5px] whitespace-pre-wrap break-words" style={{ color: 'var(--sm-text-1)' }}>{preview.message}</p>
            {preview.warning && <p className="text-[11.5px]" style={{ color: 'var(--sm-text-3)' }}>{preview.warning}</p>}
          </div>}
        </div>}

        <details open className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--sm-border)' }}>
          <summary className="cursor-pointer text-[12.5px] font-medium" style={{ color: 'var(--sm-text-2)' }}>
            Personalizar a abordagem de cada contato
          </summary>
          <p className="text-[11.5px] mt-2" style={{ color: 'var(--sm-text-3)' }}>
            Deixe em branco para usar o objetivo padrão. Sua mensagem é o norte, não um roteiro fixo. A IA pode reformular o texto de acordo com cada conversa, usando apenas informações reais.
          </p>
          <div className="grid gap-3 mt-3 sm:grid-cols-2">
            {FOLLOWUP_STYLE_STEPS.map(step => (
              <div key={step} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-card)' }}>
                <h4 className="text-[12.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Contato de {step} dia{step > 1 ? 's' : ''}</h4>
                <div>
                  <label htmlFor={`${id}-goal-${step}`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Objetivo deste contato</label>
                  <Textarea id={`${id}-goal-${step}`} rows={3} maxLength={700} disabled={!selectedOffer} value={selectedSteps[String(step)].goal}
                            placeholder={FOLLOWUP_DEFAULT_GOALS[step]} className="text-[12px]"
                            onChange={event => changeStep(step, 'goal', event.target.value)} />
                </div>
                <div>
                  <label htmlFor={`${id}-example-${step}`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Mensagem de referência</label>
                  <Textarea id={`${id}-example-${step}`} rows={3} maxLength={1000} disabled={!selectedOffer} value={selectedSteps[String(step)].example}
                            placeholder="Escreva um exemplo com o jeito que você gostaria de falar neste contato." className="text-[12px]"
                            onChange={event => changeStep(step, 'example', event.target.value)} />
                </div>
              </div>
            ))}
          </div>
        </details>
      </fieldset>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11.5px]" role="status" style={{ color: 'var(--sm-text-4)' }}>
          {dirty ? 'Há alterações de estilo para salvar.' : 'Os próximos envios usam o estilo salvo.'}
        </p>
        <div className="flex gap-2">
          {dirty && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft(saved); setPreview(null); setSuggestions(null) }}>Descartar alterações</Button>}
          <Button type="submit" size="sm" disabled={!dirty || busy}>
            {update.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Salvar estilo
          </Button>
        </div>
      </div>
    </form>
  )
}
