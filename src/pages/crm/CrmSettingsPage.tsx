// ── CRM › Configurações ──────────────────────────────────────────────────────
// Tudo que é "do jeito desta agência": formulário de captura, lembrete diário,
// mensagens prontas de WhatsApp, padrões da proposta e modelo de contrato.

import { useEffect, useState } from 'react'
import { Loader2, Copy, ExternalLink, Plus, Trash2, Magnet, Bell, MessageCircle, FileText, PenLine, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useCrmColumns } from '@/hooks/useCrm'
import { useCrmSettings, useUpdateCrmSettings, type CrmSettingsInput } from '@/hooks/useCrmSettings'
import { CrmHeader } from '@/components/crm/CrmHeader'
import { CrmWhatsappConnect } from '@/components/crm/CrmWhatsappConnect'
import { CrmBrandSettings } from '@/components/crm/CrmBrandSettings'
import { CrmFollowupSettings } from '@/components/crm/CrmFollowupSettings'
import { CrmWhatsappLabelSetting } from '@/components/crm/CrmWhatsappLabelSetting'
import { CrmCustomFieldsSetting } from '@/components/crm/CrmCustomFieldsSetting'
import { CRM_DEFAULT_MESSAGES, CRM_DEFAULT_CONTRACT, CRM_CONTRACT_VARIABLES } from '@/data/crmTemplates'
import { captureLink, copyText } from '@/utils/crm'
import { supabaseUrl } from '@/integrations/supabase/client'
import type { CrmMessageTemplate } from '@/types'

const selectClass =
  'flex h-9 w-full min-w-0 max-w-full rounded-md border px-3 text-[13px] [color-scheme:dark] focus:outline-none focus:border-[#2563EB]/50'

function Section({ icon: Icon, title, hint, children }: { icon: React.ElementType; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4 sm:p-5 space-y-3" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <div>
        <h2 className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
          <Icon className="w-4 h-4" style={{ color: '#4F8EF7' }} /> {title}
        </h2>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>{hint}</p>
      </div>
      {children}
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--sm-text-3)' }}>{children}</label>
}

export function CrmSettingsPage() {
  const { toast } = useToast()
  const { data: settings, isLoading } = useCrmSettings()
  const { data: columns = [] } = useCrmColumns()
  const update = useUpdateCrmSettings()

  const [capture, setCapture] = useState({ title: '', description: '', thanks: '' })
  const [templates, setTemplates] = useState<CrmMessageTemplate[]>([])
  const [contract, setContract] = useState('')
  const [defaults, setDefaults] = useState({ valid_days: 7, payment_terms: '', intro: '' })

  useEffect(() => {
    if (!settings) return
    setCapture({
      title:       settings.capture_title ?? '',
      description: settings.capture_description ?? '',
      thanks:      settings.capture_thanks ?? '',
    })
    setTemplates(settings.message_templates?.length ? settings.message_templates : CRM_DEFAULT_MESSAGES)
    setContract(settings.contract_template ?? CRM_DEFAULT_CONTRACT)
    setDefaults({
      valid_days:    settings.proposal_defaults?.valid_days ?? 7,
      payment_terms: settings.proposal_defaults?.payment_terms ?? '',
      intro:         settings.proposal_defaults?.intro ?? '',
    })
  }, [settings?.user_id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(u: CrmSettingsInput, ok = 'Salvo') {
    try {
      await update.mutateAsync(u)
      toast(ok, 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar', 'error')
    }
  }

  if (isLoading || !settings) {
    return (
      <div className="h-full flex flex-col" style={{ background: 'var(--sm-bg-page)' }}>
        <CrmHeader />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sm-text-3)' }} /></div>
      </div>
    )
  }

  const link = captureLink(settings.capture_token)
  const webhookUrl = `${supabaseUrl}/functions/v1/crm-lead-webhook?token=${settings.capture_token}`
  const embed = `<iframe src="${link}?origem=site" style="width:100%;max-width:560px;height:720px;border:0" title="Fale com a gente"></iframe>`

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--sm-bg-page)' }}>
      <CrmHeader subtitle="Formulário, lembretes, mensagens e modelos" />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 max-w-4xl">
        <CrmWhatsappConnect />

        <CrmWhatsappLabelSetting />

        <CrmFollowupSettings />

        <CrmBrandSettings />

        <CrmCustomFieldsSetting />

        {/* Captura */}
        <Section icon={Magnet} title="Formulário de captura"
                 hint="Um link para a bio do Instagram, o site ou um anúncio. Quem preenche entra direto no funil, sem duplicar quem já é lead, e você é avisado na hora.">
          <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--sm-text-1)' }}>
            <input type="checkbox" checked={settings.capture_enabled}
                   onChange={e => patch({ capture_enabled: e.target.checked }, e.target.checked ? 'Formulário no ar' : 'Formulário fora do ar')} />
            Formulário ativo
          </label>

          {settings.capture_enabled && (
            <>
              <div className="flex gap-2 flex-wrap">
                <Input readOnly value={link} className="h-8 text-[12px] flex-1 min-w-[240px]" onFocus={e => e.target.select()} />
                <Button size="sm" variant="outline" onClick={async () => toast((await copyText(link)) ? 'Link copiado' : 'Não consegui copiar', 'success')}>
                  <Copy className="w-3 h-3" /> Copiar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => window.open(link, '_blank', 'noopener')}>
                  <ExternalLink className="w-3 h-3" /> Abrir
                </Button>
              </div>
              <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
                Dica: um link por canal mostra de onde vem cada lead. Ex: <code>{link}?origem=instagram</code> na bio e <code>?origem=anuncio</code> no tráfego pago. A origem aparece no card e no relatório.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Etapa onde o lead entra</Label>
                  <select className={selectClass}
                          style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
                          value={settings.capture_column_id ?? ''}
                          onChange={e => patch({ capture_column_id: e.target.value || null })}>
                    <option value="">Primeira etapa do funil</option>
                    {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Título</Label>
                  <Input value={capture.title} placeholder="Fale com a gente" onChange={e => setCapture({ ...capture, title: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Texto de apresentação</Label>
                <Textarea rows={2} value={capture.description} placeholder="Conte em uma frase o que a agência faz e por que vale deixar o contato."
                          onChange={e => setCapture({ ...capture, description: e.target.value })} />
              </div>
              <div>
                <Label>Mensagem depois do envio</Label>
                <Input value={capture.thanks} placeholder="Recebemos seu contato! Em breve falamos com você."
                       onChange={e => setCapture({ ...capture, thanks: e.target.value })} />
              </div>
              <div className="flex justify-end">
                <Button size="sm" disabled={update.isPending} onClick={() => patch({
                  capture_title: capture.title.trim() || null,
                  capture_description: capture.description.trim() || null,
                  capture_thanks: capture.thanks.trim() || null,
                })}>Salvar formulário</Button>
              </div>

              <details className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
                <summary className="cursor-pointer">Receber leads de anúncios do Meta, n8n, Make ou Zapier</summary>
                <p className="mt-2 mb-1">
                  Configure a ferramenta para enviar cada lead (POST, em JSON ou formulário) para este endereço. Campos reconhecidos:
                  nome, whatsapp/telefone, email, empresa, origem e mensagem, inclusive no formato do Lead Ads do Meta.
                  Mesmo número não vira card duplicado.
                </p>
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="h-8 text-[11px] font-mono flex-1 min-w-0" onFocus={e => e.target.select()} />
                  <Button size="sm" variant="outline" onClick={async () => toast((await copyText(webhookUrl)) ? 'Endereço copiado' : 'Não consegui copiar', 'success')}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </details>

              <details className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
                <summary className="cursor-pointer">Colocar o formulário dentro do seu site</summary>
                <p className="mt-2 mb-1">Cole este código na página do site:</p>
                <div className="flex gap-2">
                  <Textarea readOnly rows={3} value={embed} className="text-[11px] font-mono" onFocus={e => e.target.select()} />
                  <Button size="sm" variant="outline" onClick={async () => toast((await copyText(embed)) ? 'Código copiado' : 'Não consegui copiar', 'success')}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </details>
            </>
          )}
        </Section>

        {/* Lembrete */}
        <Section icon={Bell} title="Lembrete diário"
                 hint="Todo dia às 8h você recebe no sininho e no seu WhatsApp a lista de leads com retorno marcado para hoje ou atrasado.">
          <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--sm-text-1)' }}>
            <input type="checkbox" checked={settings.daily_digest}
                   onChange={e => patch({ daily_digest: e.target.checked }, e.target.checked ? 'Lembrete ligado' : 'Lembrete desligado')} />
            Receber o lembrete dos retornos do dia
          </label>
          <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
            Para chegar no WhatsApp, o seu número precisa estar verificado em Meu Perfil, com a categoria "CRM" ligada.
          </p>
        </Section>

        {/* Mensagens prontas */}
        <Section icon={MessageCircle} title="Mensagens prontas de WhatsApp"
                 hint="Aparecem no botão WhatsApp da ficha do lead, já com o nome dele. Use {nome}, {primeiro_nome}, {empresa} e {agencia}.">
          <div className="space-y-2">
            {templates.map((t, i) => (
              <div key={i} className="rounded-xl border p-2.5 space-y-2" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
                <div className="flex gap-2">
                  <Input value={t.title} placeholder="Nome da mensagem" className="h-8 text-[12.5px]"
                         onChange={e => setTemplates(ts => ts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <Button size="icon-sm" variant="ghost" aria-label="Remover" onClick={() => setTemplates(ts => ts.filter((_, j) => j !== i))}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Textarea rows={2} value={t.text} className="text-[12.5px]"
                          onChange={e => setTemplates(ts => ts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              </div>
            ))}
          </div>
          <div className="flex justify-between gap-2 flex-wrap">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setTemplates(ts => [...ts, { title: '', text: '' }])}>
                <Plus className="w-3 h-3" /> Adicionar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTemplates(CRM_DEFAULT_MESSAGES)}>Restaurar padrão</Button>
            </div>
            <Button size="sm" disabled={update.isPending} onClick={() => patch({
              message_templates: templates.filter(t => t.title.trim() && t.text.trim()),
            }, 'Mensagens salvas')}>Salvar mensagens</Button>
          </div>
        </Section>

        {/* Padrões da proposta */}
        <Section icon={FileText} title="Padrões da proposta" hint="Já vêm preenchidos em toda proposta nova.">
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <div>
              <Label>Validade (dias)</Label>
              <Input type="number" min={1} value={defaults.valid_days} onChange={e => setDefaults({ ...defaults, valid_days: Number(e.target.value) || 7 })} />
            </div>
            <div>
              <Label>Condições de pagamento</Label>
              <Input value={defaults.payment_terms} placeholder="Ex: Mensal, todo dia 10, via PIX"
                     onChange={e => setDefaults({ ...defaults, payment_terms: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Apresentação padrão</Label>
            <Textarea rows={3} value={defaults.intro} placeholder="Texto de abertura que o cliente lê antes dos itens..."
                      onChange={e => setDefaults({ ...defaults, intro: e.target.value })} />
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={update.isPending} onClick={() => patch({
              proposal_defaults: {
                valid_days: defaults.valid_days,
                payment_terms: defaults.payment_terms.trim() || undefined,
                intro: defaults.intro.trim() || undefined,
              },
            })}>Salvar padrões</Button>
          </div>
        </Section>

        {/* Contrato */}
        <Section icon={PenLine} title="Modelo de contrato"
                 hint="Base de todo contrato novo. As variáveis são trocadas pelos dados do lead e da proposta. Revise o texto com um advogado antes do primeiro uso: o modelo padrão é genérico.">
          <div className="flex flex-wrap gap-1.5">
            {CRM_CONTRACT_VARIABLES.map(v => (
              <button key={v.key} type="button" title={v.label}
                      onClick={async () => toast((await copyText(v.key)) ? `${v.key} copiado` : 'Não consegui copiar', 'success')}
                      className="text-[11px] font-mono px-1.5 py-0.5 rounded-md border"
                      style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                {v.key}
              </button>
            ))}
          </div>
          <Textarea rows={18} value={contract} onChange={e => setContract(e.target.value)} className="text-[12.5px] font-mono leading-relaxed" />
          <div className="flex justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => {
              if (window.confirm('Voltar ao modelo padrão? O texto atual será descartado.')) setContract(CRM_DEFAULT_CONTRACT)
            }}>Restaurar padrão</Button>
            <Button size="sm" disabled={update.isPending} onClick={() => patch({ contract_template: contract.trim() || null }, 'Modelo salvo')}>
              Salvar modelo
            </Button>
          </div>
        </Section>

        {/* Assistente no WhatsApp */}
        <Section icon={Smartphone} title="Perguntar pelo WhatsApp"
                 hint="Do seu número pessoal (o verificado na página WhatsApp), mande para o WhatsApp da agência uma mensagem começando com CRM, e a IA responde com os dados do seu funil.">
          <ul className="text-[12.5px] space-y-1" style={{ color: 'var(--sm-text-2)' }}>
            <li>• <em>CRM quem eu preciso chamar hoje?</em></li>
            <li>• <em>CRM quanto tenho em proposta aberta?</em></li>
            <li>• <em>CRM como está a Clínica Vida?</em></li>
          </ul>
          <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
            Só responde ao seu número pessoal verificado; clientes e leads que escreverem "CRM" não recebem nada. Precisa do WhatsApp da agência conectado. Recurso do plano Agency: cada pergunta usa a cota mensal do assistente.
          </p>
        </Section>
      </div>
    </div>
  )
}
