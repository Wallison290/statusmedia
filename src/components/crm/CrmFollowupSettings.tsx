// ── Follow-up automático: liga/desliga, dias e briefings do que a agência vende ──
// A regra (degraus nos dias escolhidos pela agência, só quando ela falou por
// último, 8h às 20h de segunda a sábado) roda na função crm-followup. Aqui a
// agência escolhe os dias, escreve o briefing que a IA usa e liga a automação.

import { useId, useState } from 'react'
import { Loader2, Plus, Trash2, CheckCircle2, Clock3, Pause, Pencil, Play, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useCrmSettings, useUpdateCrmSettings } from '@/hooks/useCrmSettings'
import { useAgencyWhatsapp } from '@/hooks/useAgencyWhatsapp'
import {
  useCrmOffers, useSaveCrmOffer, useDeleteCrmOffer, useFollowupDays,
  type CrmOfferInput,
} from '@/hooks/useCrmFollowup'
import { followupDayLabel } from '../../../supabase/functions/_shared/followup-style'
import type { CrmOffer } from '@/types'
import { CrmFollowupStyleSettings } from './CrmFollowupStyleSettings'
import { CrmSetupSection } from './CrmSetupSection'
import { CrmFollowupDaysSettings } from './CrmFollowupDaysSettings'

const FIELDS: { key: keyof CrmOfferInput; label: string; placeholder: string; rows: number }[] = [
  { key: 'product',  label: 'O que você vende',                  rows: 2, placeholder: 'Ex: Site de link na bio: uma página com os botões certos para o cliente agendar, comprar ou chamar no WhatsApp.' },
  { key: 'audience', label: 'Para quem',                         rows: 2, placeholder: 'Ex: Clínicas, salões e profissionais liberais que vendem pelo Instagram.' },
  { key: 'problem',  label: 'Que problema seu cliente enfrenta?', rows: 3, placeholder: 'Ex: O cliente recebe as mesmas perguntas no WhatsApp e perde tempo no atendimento.' },
  { key: 'solution', label: 'Como seu serviço ajuda o negócio?', rows: 3, placeholder: 'Ex: Organiza as informações e facilita pedidos ou agendamentos.' },
  { key: 'price',    label: 'Preço e condições',                 rows: 1, placeholder: 'Ex: R$ 497 à vista ou 3x, entrega em 5 dias.' },
  { key: 'proof',    label: 'Casos e resultados reais',          rows: 3, placeholder: 'Descreva um resultado comprovado que você tem autorização para mencionar. Se não houver, deixe em branco.' },
  { key: 'tips',     label: 'Dicas úteis que você pode dar',     rows: 3, placeholder: 'Ex: Colocar o botão de WhatsApp em primeiro lugar; usar uma chamada com o benefício, não "clique aqui".' },
  { key: 'tone',     label: 'Tom de voz do briefing',            rows: 1, placeholder: 'Ex: Próximo e direto, sem formalidade.' },
]

const EMPTY: CrmOfferInput = { name: '' }

export function CrmFollowupSettings() {
  const id = useId()
  const { toast } = useToast()
  const { data: settings } = useCrmSettings()
  const update = useUpdateCrmSettings()
  const { data: wa } = useAgencyWhatsapp()
  const { data: offers = [], isLoading, isError: offersError, refetch: reloadOffers } = useCrmOffers()
  const save = useSaveCrmOffer()
  const remove = useDeleteCrmOffer()

  const [editing, setEditing] = useState<(CrmOfferInput & { id?: string }) | null>(null)
  const [styleDirty, setStyleDirty] = useState(false)
  const savedDays = useFollowupDays()
  // Rascunho dos dias: a etapa 03 já mostra os contatos marcados antes de salvar
  const [draftDays, setDraftDays] = useState<number[] | null>(null)
  const days = draftDays ?? savedDays
  const daysDirty = days.join() !== savedDays.join()
  const sequence = days.map(followupDayLabel)
  const sequenceText = sequence.length > 1 ? `${sequence.slice(0, -1).join(', ')} e ${sequence[sequence.length - 1]}` : sequence[0]

  const enabled = !!settings?.followup_enabled
  const connected = wa?.status === 'connected'
  const defaultOffer = offers.find(offer => offer.is_default) ?? offers[0]
  const hasBriefing = !!defaultOffer?.product?.trim()

  async function toggle(on: boolean) {
    if (on && !hasBriefing) { toast('Cadastre e descreva o serviço padrão antes de ativar.', 'warning'); return }
    try {
      await update.mutateAsync({ followup_enabled: on })
      toast(on ? 'Follow-up automático ligado' : 'Follow-up automático desligado', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar', 'error')
    }
  }

  async function submit() {
    if (!editing) return
    if (!editing.name.trim()) { toast('Dê um nome ao briefing', 'warning'); return }
    if (!editing.product?.trim()) { toast('Descreva o que você vende para a IA entender seu serviço.', 'warning'); document.getElementById(`${id}-product`)?.focus(); return }
    const clean = Object.fromEntries(
      Object.entries(editing).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]),
    ) as CrmOfferInput & { id?: string }
    try {
      // O primeiro briefing já nasce como padrão
      await save.mutateAsync({ ...clean, name: editing.name.trim(), is_default: editing.is_default || !offers.length })
      toast('Briefing salvo', 'success')
      setEditing(null)
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar', 'error')
    }
  }

  function edit(o: CrmOffer) {
    const { user_id: _u, created_at: _c, updated_at: _up, ...rest } = o
    setEditing(rest)
  }

  function goTo(target: string) {
    document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  return (
    <section className="crm-settings-ui space-y-5 min-w-0" aria-label="Configuração do follow-up automático">
      <header className="flex items-start justify-between gap-4 flex-wrap pb-2">
        <div className="max-w-xl">
          <p className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: 'var(--crm-accent)' }}>Conversas que continuam</p>
          <h2 className="font-display text-[26px] sm:text-[30px] font-bold tracking-tight leading-tight">Follow-up automático</h2>
          <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--sm-text-2)' }}>Quando um cliente deixa de responder, o CRM retoma a conversa pelo seu WhatsApp. Configure o serviço e o jeito de falar antes de ativar.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium" style={{ borderColor: enabled && connected && hasBriefing ? 'var(--crm-accent-border)' : 'var(--sm-border)', background: enabled && connected && hasBriefing ? 'var(--crm-accent-soft)' : 'var(--sm-bg-alt)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: enabled && connected && hasBriefing ? 'var(--crm-accent)' : 'var(--sm-text-3)' }} />
          {!enabled ? 'Envios pausados' : !hasBriefing ? 'Aguardando serviço' : !connected ? 'Aguardando WhatsApp' : 'Envios ativados'}
        </span>
      </header>

      <nav aria-label="Etapas da configuração do follow-up" className="flex flex-wrap gap-x-5 gap-y-2 px-4 py-3 rounded-xl border" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-card)' }}>
        {[['01', 'Serviço', 'followup-service'], ['02', 'Dias', 'followup-days'], ['03', 'Mensagens', 'followup-messages'], ['04', 'Prévia', 'followup-preview'], ['05', 'Ativação', 'followup-activation']].map(([number, title, target]) => (
          <button key={target} type="button" className="text-[13px] font-medium flex items-center gap-2 py-1 hover:underline underline-offset-4" onClick={() => goTo(target)}><span className="tabular-nums font-semibold" style={{ color: 'var(--crm-accent)' }}>{number}</span>{title}</button>
        ))}
      </nav>

      <CrmSetupSection id="followup-service" number="01" title="Conte o que você vende"
        description="Cadastre uma descrição do seu serviço, também chamada de briefing. A IA usa essas informações para escrever mensagens que fazem sentido para sua oferta."
        aside={!editing && <Button type="button" variant="outline" className="h-9" onClick={() => setEditing({ ...EMPTY })}><Plus className="w-3.5 h-3.5" /> Adicionar serviço</Button>}>
        <div className="space-y-4">
          {isLoading ? <p className="text-[13px] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando seus serviços...</p> : offersError ? (
            <div role="alert" className="crm-settings-note">Não foi possível carregar seus serviços. <Button type="button" size="sm" variant="ghost" onClick={() => reloadOffers()}>Tentar novamente</Button></div>
          ) : !offers.length && !editing ? (
            <div className="border-2 border-dashed rounded-xl p-5 sm:p-6" style={{ borderColor: 'var(--crm-accent-border)', background: 'var(--crm-accent-soft)' }}>
              <h4 className="text-[15px] font-semibold">Comece pelo seu primeiro serviço</h4>
              <p className="text-[13px] leading-relaxed mt-2 max-w-lg" style={{ color: 'var(--sm-text-2)' }}>Explique o que você entrega, para quem e como ajuda o cliente. Não precisa escrever um texto de vendas.</p>
              <Button type="button" className="mt-4 h-9" onClick={() => setEditing({ ...EMPTY })}><Plus className="w-3.5 h-3.5" /> Cadastrar primeiro serviço</Button>
            </div>
          ) : offers.map(offer => (
            <article key={offer.id} className="crm-panel p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h4 className="text-[14px] font-semibold break-words">{offer.name}</h4>
                  <p className="text-[12px] mt-1 line-clamp-2 leading-relaxed" style={{ color: 'var(--sm-text-2)' }}>{offer.product || 'Complete o que você vende para a IA entender este serviço.'}</p>
                </div>
                {offer.id === defaultOffer?.id && <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: 'var(--crm-accent-ink)', background: 'var(--crm-accent)' }}>Serviço padrão</span>}
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-[11.5px]" style={{ color: 'var(--sm-text-2)' }}>{offer.product?.trim() ? 'Descrição cadastrada' : 'Descrição pendente'}</p>
                <div className="flex gap-1 flex-wrap">
                  {offer.id !== defaultOffer?.id && <Button type="button" size="sm" variant="ghost" disabled={save.isPending || !!editing} onClick={() => save.mutate({ id: offer.id, name: offer.name, is_default: true }, { onError: (error: Error) => toast(error.message, 'error') })}>Usar como padrão</Button>}
                  <Button type="button" size="sm" variant="outline" disabled={save.isPending || !!editing} onClick={() => edit(offer)}><Pencil className="w-3.5 h-3.5" /> Ver e editar</Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Excluir serviço ${offer.name}`} disabled={remove.isPending || !!editing} onClick={() => {
                    if (window.confirm(`Excluir o serviço "${offer.name}"?`)) remove.mutate(offer.id, { onError: (error: Error) => toast(error.message, 'error') })
                  }}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </article>
          ))}

          {editing && <form onSubmit={event => { event.preventDefault(); submit() }} className="rounded-xl border-2 p-4 sm:p-5 space-y-5" style={{ borderColor: 'var(--crm-accent)', background: 'var(--crm-panel)' }}>
            <div><h4 className="font-display text-[17px] font-semibold">{editing.id ? 'Editar descrição do serviço' : 'Cadastrar um serviço'}</h4><p className="text-[12px] mt-1" style={{ color: 'var(--sm-text-2)' }}>Nome e descrição são obrigatórios. Os outros campos ajudam a IA a escrever com mais contexto.</p></div>
            <fieldset disabled={save.isPending} className="space-y-4">
              <legend className="sr-only">Descrição do serviço</legend>
              <div><label htmlFor={`${id}-name`} className="crm-field-label">Nome do serviço <span className="font-normal" style={{ color: 'var(--sm-text-2)' }}>(obrigatório)</span></label>
                <Input id={`${id}-name`} required value={editing.name} placeholder="Ex: Gestão de redes sociais" onChange={event => setEditing({ ...editing, name: event.target.value })} />
                <p className="crm-field-hint">Esse nome aparece na escolha do serviço na ficha do lead.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {FIELDS.slice(0, 4).map(field => <div key={field.key}>
                  <label htmlFor={`${id}-${field.key}`} className="crm-field-label">{field.label}{field.key === 'product' && <span className="font-normal" style={{ color: 'var(--sm-text-2)' }}> (obrigatório)</span>}</label>
                  <Textarea id={`${id}-${field.key}`} required={field.key === 'product'} rows={3} value={(editing[field.key] as string) ?? ''} placeholder={field.placeholder} className="text-[13px]" onChange={event => setEditing({ ...editing, [field.key]: event.target.value })} />
                  <p className="crm-field-hint">{field.key === 'product' ? 'Liste o que está incluído e como você entrega.' : field.key === 'audience' ? 'Descreva o tipo de cliente que costuma comprar de você.' : field.key === 'problem' ? 'Conte o que dificulta o dia a dia desse cliente.' : 'Explique o benefício prático, sem prometer resultados garantidos.'}</p>
                </div>)}
              </div>
              <details className="crm-disclosure" style={{ background: 'var(--sm-bg-card)' }}>
                <summary>Preços, resultados e orientações do serviço (opcional)</summary>
                <div className="crm-disclosure-body grid gap-4 sm:grid-cols-2">
                  {FIELDS.slice(4).map(field => <div key={field.key}>
                    <label htmlFor={`${id}-${field.key}`} className="crm-field-label">{field.label}</label>
                    <Textarea id={`${id}-${field.key}`} rows={field.rows === 1 ? 2 : field.rows} value={(editing[field.key] as string) ?? ''} placeholder={field.placeholder} className="text-[13px]" onChange={event => setEditing({ ...editing, [field.key]: event.target.value })} />
                    <p className="crm-field-hint">{field.key === 'price' ? 'Informe valor, pagamento e prazo. Se depende de orçamento, explique isso.' : field.key === 'proof' ? 'Use apenas casos comprovados. Sem casos reais, deixe em branco.' : field.key === 'tips' ? 'Dicas que ajudam seu cliente mesmo antes de contratar.' : 'Usado quando você escolhe "Usar o tom do briefing" na etapa 03.'}</p>
                  </div>)}
                </div>
              </details>
            </fieldset>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" className="h-9" disabled={save.isPending}>{save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar serviço</Button></div>
          </form>}
          {!!offers.length && <p className="text-[12px] leading-relaxed" style={{ color: 'var(--sm-text-2)' }}>O serviço padrão é usado quando o lead não tem outro serviço selecionado na ficha. Você pode cadastrar mais de uma oferta.</p>}
        </div>
      </CrmSetupSection>

      {settings && <CrmFollowupDaysSettings days={days} saved={savedDays} onChange={setDraftDays} />}

      {settings && <CrmFollowupStyleSettings key={`${settings.user_id}:${JSON.stringify(settings.followup_style ?? null)}`} value={settings.followup_style} days={days} onDirtyChange={setStyleDirty} />}

      <CrmSetupSection id="followup-activation" number="05" title="Revise e ative os envios"
        description={`A sequência tem ${days.length === 1 ? '1 contato' : `${days.length} contatos`}, após ${sequenceText} sem resposta. Você muda os dias na etapa 02 e pode pausar os envios a qualquer momento.`}>
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 border-b pb-5" style={{ borderColor: 'var(--sm-border)' }} aria-label="Sequência de contatos">
            {days.map((day, index) => <div key={day} className="crm-panel px-3 py-2 min-w-[96px]"><p className="text-[11px]" style={{ color: 'var(--sm-text-2)' }}>{index + 1}º contato</p><p className="font-display text-[20px] font-semibold leading-tight mt-0.5">{day}<span className="text-[12px] ml-1 font-normal" style={{ color: 'var(--sm-text-2)' }}>dia{day > 1 ? 's' : ''}</span></p></div>)}
          </div>
          <div className="grid sm:grid-cols-[1.2fr_1fr] gap-5">
            <div className="space-y-3">
              <h4 className="text-[14px] font-semibold">Quando uma mensagem pode sair?</h4>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--sm-text-2)' }}>Você fez o último contato e o cliente ainda não respondeu. Se ele responder, o CRM aguarda sua próxima resposta.</p>
              <p className="text-[12px] flex items-start gap-2 leading-relaxed" style={{ color: 'var(--sm-text-2)' }}><Clock3 className="w-4 h-4 shrink-0 mt-0.5" /> Das 8h às 20h, de segunda a sábado, no horário de Brasília. Um envio por vez, com intervalo de 5 a 15 minutos entre clientes.</p>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--sm-text-2)' }}>Cada envio usa 1 unidade da cota de mensagens com IA. Cada contato da sequência é usado uma vez por lead.</p>
            </div>
            <div className="crm-panel p-4 space-y-3">
              <p className="text-[13px] font-semibold">Antes de ativar</p>
              <p className="text-[12px] flex items-center gap-2"><CheckCircle2 className="w-4 h-4" style={{ color: hasBriefing ? 'var(--crm-accent)' : 'var(--sm-text-3)' }} />{hasBriefing ? 'Serviço padrão descrito' : 'Cadastre e descreva o serviço padrão'}</p>
              <p className="text-[12px] flex items-center gap-2"><Smartphone className="w-4 h-4" style={{ color: connected ? 'var(--crm-accent)' : 'var(--sm-text-3)' }} />{connected ? 'WhatsApp conectado' : 'Conecte o WhatsApp na aba WhatsApp'}</p>
              {(styleDirty || daysDirty || editing) && <p className="text-[12px] leading-relaxed">Salve ou descarte as alterações antes de ativar.</p>}
              <Button type="button" className="h-10 w-full" variant={enabled ? 'outline' : 'default'} disabled={update.isPending || (!enabled && (!hasBriefing || styleDirty || daysDirty || !!editing || isLoading || offersError))} onClick={() => toggle(!enabled)}>
                {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}{enabled ? 'Pausar envios automáticos' : 'Ativar follow-up automático'}
              </Button>
              <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--sm-text-2)' }}>{enabled ? connected ? 'A automação está ligada. Os envios seguem as regras acima.' : 'A automação está ligada, mas nenhum envio sai enquanto o WhatsApp estiver desconectado.' : connected ? 'Ativar permite os próximos envios elegíveis. Não envia uma mensagem imediatamente.' : 'Você pode deixar a automação preparada. Ela só envia quando o WhatsApp estiver conectado.'}</p>
            </div>
          </div>

          <details className="crm-disclosure">
            <summary>Entenda as pausas e o fim da sequência</summary>
            <ul className="crm-disclosure-body text-[12px] leading-relaxed list-disc pl-9 space-y-2" style={{ color: 'var(--sm-text-2)' }}>
              <li>Leads pausados, arquivados ou que pediram para não receber mensagens não entram na sequência.</li>
              <li>Leads em etapas de fechamento ou descarte, ou com contrato assinado, não recebem follow-up.</li>
              <li>Quando o lead volta a conversar e some de novo, a sequência continua pelo próximo contato ainda não utilizado.</li>
              <li>Mudar os dias não recomeça a sequência: cada lead segue para o próximo dia depois do último contato que já recebeu.</li>
              <li>Depois do último contato ({followupDayLabel(days[days.length - 1])}), se o lead continuar na etapa desse contato e sem responder por mais 7 dias, vai para Perdido. Sem uma etapa para o último contato, ele vai para Perdido após esse envio. Essa movimentação depende de haver uma etapa Perdido no funil.</li>
              <li>O CRM precisa ter a conversa registrada para saber quem falou por último.</li>
            </ul>
          </details>
          <div className="crm-panel p-4">
            <label className="flex items-start gap-3 text-[13px] cursor-pointer"><input type="checkbox" className="crm-switch mt-0.5" checked={settings?.meeting_reminder ?? true} disabled={update.isPending} onChange={event => update.mutate({ meeting_reminder: event.target.checked }, { onSuccess: () => toast('Preferência de lembrete salva.', 'success'), onError: (error: Error) => toast(error.message, 'error') })} /><span><span className="font-medium">Lembrar o cliente de uma reunião</span><span className="block text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--sm-text-2)' }}>Envia uma confirmação pelo seu WhatsApp na janela de 24 horas antes da reunião cadastrada na ficha. O lembrete é independente da sequência de follow-up e pode ser enviado mesmo com ela pausada. Essa preferência é salva automaticamente.</span></span></label>
          </div>
        </div>
      </CrmSetupSection>
    </section>
  )
}
