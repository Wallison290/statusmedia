import { useEffect, useId, useState, type FormEvent } from 'react'
import { Loader2, Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CrmSetupSection } from './CrmSetupSection'
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

const selectClass = 'h-10 w-full min-w-0 rounded-lg border px-3 text-[13px]'
const selectStyle = {
  background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)',
}
const labelClass = 'block text-[13px] font-medium mb-2'

export function CrmFollowupStyleSettings({ value, onDirtyChange }: { value: unknown; onDirtyChange?: (dirty: boolean) => void }) {
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
  const { data: leads = [], isLoading: leadsLoading, isError: leadsError, refetch: reloadLeads } = useCrmFollowupPreviewLeads(showPreview)
  const saved = normalizeFollowupStyle(value)
  const [draft, setDraft] = useState(() => saved)
  const dirty = JSON.stringify(normalizeFollowupStyle(draft)) !== JSON.stringify(saved)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  const defaultOffer = offers.find(offer => offer.is_default) ?? offers[0]
  const selectedOffer = offers.find(offer => offer.id === offerId) ?? defaultOffer
  const selectedSteps = followupStepsForOffer(draft, selectedOffer?.id)
  const previewLeads = leads.filter(lead => lead.followup_offer_id
    ? lead.followup_offer_id === selectedOffer?.id : selectedOffer?.id === defaultOffer?.id)
  const busy = update.isPending || compose.isPending
  const referenceCount = FOLLOWUP_STYLE_STEPS.filter(step => selectedSteps[String(step)].example.trim()).length
  const hasProduct = !!selectedOffer?.product?.trim()

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
    if (!selectedOffer || busy || !hasProduct) return
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
        <CrmSetupSection id="followup-messages" number="02" title="Defina como conversar"
          description="Você escolhe o jeito de escrever e pode criar uma referência para cada contato. A IA adapta o texto à conversa de cada cliente."
          aside={<span className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>{referenceCount} de 4 referências preenchidas</span>}>
        <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr] items-end">
          <div>
            <label htmlFor={`${id}-offer`} className={labelClass}>Serviço das mensagens de referência</label>
            <select id={`${id}-offer`} className={selectClass} style={selectStyle} value={selectedOffer?.id ?? ''} disabled={!offers.length}
              onChange={event => { setOfferId(event.target.value); setSuggestions(null); setPreview(null); setLeadId('') }}>
              {!offers.length && <option value="">Cadastre um serviço na etapa 1</option>}
              {offers.map(offer => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
            </select>
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--sm-text-2)' }}>As referências pertencem ao serviço selecionado. Cada lead usa o serviço definido na ficha dele ou o serviço padrão.</p>
        </div>
        <div className="border-y py-4 space-y-4" style={{ borderColor: 'var(--sm-border)' }}>
        <div className="flex items-center gap-2 flex-wrap"><h4 className="text-[13px] font-semibold">Seu jeito de escrever</h4><span className="text-[11px] rounded px-2 py-0.5" style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)' }}>Vale para todos os serviços</span></div>
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
        <details>
          <summary className="cursor-pointer text-[12px] font-medium">Orientações e palavras a evitar (opcional)</summary>
          <div className="space-y-4 mt-4">
        <div>
          <label htmlFor={`${id}-instructions`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Suas orientações de escrita</label>
          <Textarea id={`${id}-instructions`} rows={3} maxLength={1500} value={draft.instructions} className="text-[12.5px]"
                    placeholder="Ex: Use frases curtas. Vá direto ao assunto, sem cumprimentar em todo contato. Fale dos benefícios práticos e evite parecer um texto de vendas."
                    onChange={event => change('instructions', event.target.value)} />
          <p className="text-[12px] mt-2" style={{ color: 'var(--sm-text-2)' }}>Descreva como você falaria com um cliente. Em branco, o sistema usa o tom escolhido acima.</p>
        </div>
        <div>
          <label htmlFor={`${id}-avoid`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Palavras e abordagens a evitar</label>
          <Textarea id={`${id}-avoid`} rows={2} maxLength={500} value={draft.avoid} className="text-[12.5px]"
                    placeholder="Ex: Não usar 'passando para saber', 'oportunidade imperdível' ou insistir em marcar uma reunião."
                    onChange={event => change('avoid', event.target.value)} />
        </div>
          </div>
        </details>
        </div>

        <div className="space-y-3">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div><h4 className="text-[14px] font-semibold">Uma referência para cada contato</h4><p className="text-[12px] mt-1" style={{ color: 'var(--sm-text-2)' }}>Escreva com suas palavras ou peça sugestões à IA. Preencher é opcional.</p></div>
            <Button type="button" variant="outline" className="h-9" disabled={!hasProduct} onClick={() => generate('suggest')}>
              {compose.isPending && compose.variables?.action === 'suggest' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Sugerir as 4 mensagens
            </Button>
          </div>
          <p className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>Gerar as quatro sugestões usa 1 unidade da cota de mensagens com IA. Elas só entram no rascunho quando você escolhe usar.</p>
          {!hasProduct && <p className="crm-settings-note">Preencha o que você vende na etapa 1 para receber sugestões específicas do serviço.</p>}
        </div>

        {suggestions && <div className="grid gap-3 sm:grid-cols-2" aria-label="Sugestões de mensagens">
          {FOLLOWUP_STYLE_STEPS.map(step => <div key={step} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--sm-border)' }}>
            <h4 className="text-[12px] font-medium" style={{ color: 'var(--sm-text-1)' }}>Sugestão para {step} dia{step > 1 ? 's' : ''}</h4>
            <p className="text-[12px] whitespace-pre-wrap break-words" style={{ color: 'var(--sm-text-2)' }}>{suggestions[String(step)]}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => {
              changeStep(step, 'example', suggestions[String(step)])
              toast('Referência aplicada ao rascunho. Salve o estilo para usar nos envios.', 'success')
            }}>Usar referência de {step} dia{step > 1 ? 's' : ''}</Button>
          </div>)}
        </div>}

        <Tabs defaultValue="1">
          <TabsList aria-label="Contatos da sequência" className="w-full h-auto grid grid-cols-4 p-1 rounded-xl" style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
            {FOLLOWUP_STYLE_STEPS.map(step => <TabsTrigger key={step} value={String(step)} className="px-1 py-2.5 text-[12px] gap-1 data-[state=active]:bg-[var(--sm-bg-input)] data-[state=active]:text-[color:var(--sm-text-1)]">
              {step} dia{step > 1 ? 's' : ''}{selectedSteps[String(step)].example && <Check className="w-3 h-3" aria-label="Referência preenchida" />}
            </TabsTrigger>)}
          </TabsList>
          {FOLLOWUP_STYLE_STEPS.map(step => <TabsContent key={step} value={String(step)} className="rounded-xl border p-4 space-y-4 mt-3" style={{ borderColor: 'var(--sm-border)' }}>
            <h4 className="text-[14px] font-semibold">Contato de {step} dia{step > 1 ? 's' : ''}</h4>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--sm-text-2)' }}>Esse contato pode sair quando o cliente deixa de responder pelo período indicado. Sua referência será adaptada ao histórico dele.</p>
            <div><label htmlFor={`${id}-example-${step}`} className={labelClass}>Mensagem de referência</label>
              <Textarea id={`${id}-example-${step}`} rows={4} maxLength={1000} disabled={!selectedOffer} value={selectedSteps[String(step)].example}
                placeholder="Ex: Posso te explicar como o serviço funciona no seu negócio?" className="text-[13px]" onChange={event => changeStep(step, 'example', event.target.value)} />
              <p className="text-[12px] mt-2" style={{ color: 'var(--sm-text-2)' }}>A IA pode mudar a abertura, os argumentos e a pergunta, mantendo sua intenção. Em branco, ela usa o objetivo padrão e a conversa.</p>
            </div>
            <details><summary className="cursor-pointer text-[12px] font-medium">Alterar o objetivo deste contato (opcional)</summary>
              <div className="mt-3"><label htmlFor={`${id}-goal-${step}`} className={labelClass}>Objetivo deste contato</label>
                <Textarea id={`${id}-goal-${step}`} rows={3} maxLength={700} disabled={!selectedOffer} value={selectedSteps[String(step)].goal} placeholder={FOLLOWUP_DEFAULT_GOALS[step]} className="text-[13px]" onChange={event => changeStep(step, 'goal', event.target.value)} />
                <p className="text-[12px] mt-2" style={{ color: 'var(--sm-text-2)' }}>Em branco, o sistema usa: {FOLLOWUP_DEFAULT_GOALS[step]}</p>
              </div>
            </details>
          </TabsContent>)}
        </Tabs>
        <p className="crm-settings-note">Sempre sem emojis. Antes de cada envio, a IA considera as dúvidas e objeções da conversa e usa apenas informações confirmadas no serviço ou no histórico.</p>
        </div>
        </CrmSetupSection>

        <CrmSetupSection id="followup-preview" number="03" title="Confira uma mensagem na prática"
          description="Escolha um cliente do serviço selecionado e veja como a IA adaptaria sua referência à conversa dele. Essa etapa é opcional.">
        {!showPreview && <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>A prévia não envia WhatsApp nem altera o funil.</p>
          <Button type="button" variant="outline" className="h-9" disabled={!hasProduct} onClick={() => setShowPreview(true)}>Testar com um lead</Button>
        </div>}
        {showPreview && <div className="space-y-4">
          <p className="text-[13px] font-medium">Prévia para {selectedOffer?.name}</p>
          <p className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>Prévia com suas orientações atuais e o histórico do lead. Nenhuma mensagem será enviada. O texto é gerado novamente no envio real.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><label htmlFor={`${id}-lead`} className={labelClass} style={{ color: 'var(--sm-text-2)' }}>Lead deste serviço</label>
              <select id={`${id}-lead`} className={selectClass} style={selectStyle} value={leadId}
                onChange={event => { setLeadId(event.target.value); setPreview(null) }}>
                <option value="">{leadsLoading ? 'Carregando clientes...' : 'Selecione um lead'}</option>
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
          {leadsError && <div role="alert" className="text-[12px] flex items-center gap-2"><span>Não foi possível carregar os leads.</span><Button type="button" size="sm" variant="ghost" onClick={() => reloadLeads()}>Tentar novamente</Button></div>}
          {!leadsLoading && !leadsError && !previewLeads.length && <p className="crm-settings-note">Nenhum lead disponível para este serviço. Cadastre um lead no funil e selecione o serviço na ficha dele. A prévia também precisa de uma conversa registrada.</p>}
          <p className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>Cada prévia usa 1 unidade da cota de mensagens com IA e considera suas alterações atuais, mesmo antes de salvar.</p>
          <Button type="button" className="h-9" variant="outline" disabled={!hasProduct || !previewLeads.some(lead => lead.id === leadId)} onClick={() => generate('preview')}>
            {compose.isPending && compose.variables?.action === 'preview' && <Loader2 className="w-3 h-3 animate-spin" />} Gerar prévia
          </Button>
          {preview && <div aria-live="polite" className="space-y-3">
            <div className="rounded-2xl rounded-tl-sm p-4 max-w-xl" style={{ background: 'var(--crm-accent-soft)', border: '1px solid var(--crm-accent-border)' }}>
              <p className="text-[11px] font-medium mb-2" style={{ color: 'var(--crm-accent)' }}>Prévia da mensagem</p>
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--sm-text-1)' }}>{preview.message}</p>
            </div>
            {preview.warning && <p className="text-[11.5px]" style={{ color: 'var(--sm-text-3)' }}>{preview.warning}</p>}
          </div>}
        </div>}

        </CrmSetupSection>
      </fieldset>

      <div className="rounded-xl border p-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: dirty ? 'var(--crm-accent-border)' : 'var(--sm-border)', background: dirty ? 'var(--crm-accent-soft)' : 'var(--sm-bg-alt)' }}>
        <p className="text-[12px]" role="status" style={{ color: 'var(--sm-text-2)' }}>
          {dirty ? 'Alterações ainda não salvas. Salve para usar nos próximos envios.' : 'Mensagens e estilo salvos. Os próximos envios usam essas orientações.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {dirty && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft(saved); setPreview(null); setSuggestions(null) }}>Descartar alterações</Button>}
          <Button type="submit" size="sm" disabled={!dirty || busy}>
            {update.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Salvar mensagens e estilo
          </Button>
        </div>
      </div>
    </form>
  )
}
