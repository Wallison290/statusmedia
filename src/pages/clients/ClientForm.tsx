import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Save, ArrowLeft, ImageIcon, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateClient, useUpdateClient, useClient, useClients } from '@/hooks/useClients'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { useSubscription } from '@/hooks/useSubscription'
import { supabase } from '@/integrations/supabase/client'
import { checkStorageLimit } from '@/utils/storageGate'
import { ApplyTemplateModal } from '@/components/tasks/ApplyTemplateModal'
import type { Client } from '@/types'

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
  brand_color_primary: null as string | null,
  brand_color_secondary: null as string | null,
  responsible_user_id: null as string | null,
  valor_mensal: null as number | null,
  dia_vencimento: null as number | null,
  financial_status: null as Client['financial_status'],
  last_payment_date: null as string | null,
  manual_status_override: null as boolean | null,
}

// Campos que o CRM pode pré-preencher ao converter um lead em cliente
const prefillableFields = ['company_name', 'responsible_name', 'whatsapp', 'email', 'instagram'] as const

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
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [onboard, setOnboard] = useState<{ clientId: string; category: string | null } | null>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (existingClient) setForm(existingClient as any)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit])

  const set = (field: string, value: string | null) =>
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
      const { error } = await supabase.storage
        .from('client-logos')
        .upload(path, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage
        .from('client-logos')
        .getPublicUrl(path)
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
    // Trava o salvar do começo ao fim, convite incluso. O botão só olhava a
    // gravação do cliente e destravava durante o envio do convite (~2s): um
    // segundo clique ali criava um cadastro repetido.
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

    // ── Gate: limite de clientes por plano ──────────────────────────────────
    if (!isEdit) {
      const maxClients = subData?.plan.maxClients ?? 5
      if (maxClients !== -1 && allClients.length >= maxClients) {
        toast(
          `Limite de ${maxClients} cliente${maxClients === 1 ? '' : 's'} do plano ${subData?.plan.name ?? 'atual'} atingido. Faça upgrade para adicionar mais.`,
          'error'
        )
        return
      }
    }

    try {
      if (isEdit) {
        await updateClient.mutateAsync({ id: id!, ...form })
        toast('Cliente atualizado!', 'success')
      } else {
        const created = await createClient.mutateAsync({ ...form, user_id: agencyId! })

        // Veio de um lead do CRM: fecha o ciclo marcando a conversão, para o
        // card parar de oferecer "converter em cliente".
        if (fromLeadId) {
          try {
            await (supabase as any)
              .from('crm_leads')
              .update({ converted_client_id: created.id })
              .eq('id', fromLeadId)
          } catch { /* a conversão do lead é secundária — o cliente já foi criado */ }
        }

        // Envia convite de acesso ao portal se tiver email e plano com portal
        const hasPortal = subData?.plan.hasClientPortal ?? false
        if (form.email && hasPortal) {
          try {
            const { error: inviteError } = await supabase.functions.invoke('invite-client', {
              body: {
                email: form.email,
                clientId: created.id,
                clientName: form.responsible_name,
                companyName: form.company_name,
                redirectTo: `${window.location.origin}/auth/callback`,
              },
            })
            if (inviteError) throw inviteError
            toast('Cliente cadastrado! Convite enviado para o e-mail.', 'success')
          } catch {
            // Vermelho: em verde, igual ao sucesso, a falha passava despercebida
            toast('Cliente cadastrado, mas o convite do portal NÃO foi enviado. Reenvie pelo perfil do cliente.', 'error')
          }
        } else if (form.email && !hasPortal) {
          toast('Cliente cadastrado! (Portal do cliente disponível nos planos Pro e Agency)', 'success')
        } else {
          toast('Cliente cadastrado!', 'success')
        }

        // Abre a tela de criar tarefas (modelo pré-selecionado pelo tipo de serviço).
        // Ao fechar/pular, navega para o perfil do cliente.
        setOnboard({ clientId: created.id, category: serviceToCategory[form.service_type] ?? null })
        return
      }
      navigate(`/clients/${id}`)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="p-4 md:p-6">
        {/* Voltar */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#e2e8f0] text-[12px] font-medium text-[#6b7280] hover:bg-[#f5f7fb] transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
          {/* Basic info */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Informações Básicas</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Logo upload — ocupa largura total */}
              <div className="col-span-full">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Logo do cliente</label>
                <div className="flex items-center gap-4">
                  {/* Preview */}
                  <div className="w-16 h-16 rounded-xl border border-gray-200 flex-shrink-0 overflow-hidden bg-gray-50 flex items-center justify-center">
                    {form.logo_url ? (
                      <img src={form.logo_url} alt="logo" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-gray-500">
                        {form.company_name ? form.company_name[0].toUpperCase() : '?'}
                      </span>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => logoRef.current?.click()}
                      disabled={isUploadingLogo}
                      className="flex items-center gap-2 h-8 px-3 rounded-md border border-dashed border-gray-300 bg-gray-50 text-gray-600 text-xs hover:border-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      {isUploadingLogo ? 'Enviando...' : form.logo_url ? 'Trocar logo' : 'Selecionar logo'}
                    </button>
                    {form.logo_url && (
                      <button
                        type="button"
                        onClick={() => set('logo_url', null)}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-md text-gray-500 hover:text-red-500 text-xs transition-colors"
                      >
                        <X className="w-3 h-3" /> Remover logo
                      </button>
                    )}
                  </div>

                  <input
                    ref={logoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoSelect}
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-1.5">PNG, JPG, WEBP, SVG · Máx. 5 MB</p>
              </div>

              {/* Cores da marca — usadas na Criação de Imagens da StatusIA */}
              <div className="col-span-full">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Cores da marca</label>
                <div className="flex items-center gap-5">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.brand_color_primary || '#6366f1'}
                      onChange={e => set('brand_color_primary', e.target.value)}
                      className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-500">Cor primária</span>
                      <input
                        type="text"
                        value={form.brand_color_primary || ''}
                        onChange={e => set('brand_color_primary', e.target.value || null)}
                        placeholder="#6366f1"
                        className="w-20 text-xs text-gray-700 border-0 border-b border-gray-200 focus:border-gray-400 outline-none bg-transparent"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.brand_color_secondary || '#8b5cf6'}
                      onChange={e => set('brand_color_secondary', e.target.value)}
                      className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-500">Cor secundária</span>
                      <input
                        type="text"
                        value={form.brand_color_secondary || ''}
                        onChange={e => set('brand_color_secondary', e.target.value || null)}
                        placeholder="#8b5cf6"
                        className="w-20 text-xs text-gray-700 border-0 border-b border-gray-200 focus:border-gray-400 outline-none bg-transparent"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-1.5">Usadas para gerar imagens com IA já na identidade visual do cliente</p>
              </div>

              <Input label="Nome da empresa *" value={form.company_name} onChange={e => set('company_name', e.target.value)} required placeholder="Ex: Studio Fitness" />
              <Input label="Responsável *" value={form.responsible_name} onChange={e => set('responsible_name', e.target.value)} required placeholder="Ex: João Silva" />
              <Input label="Nicho *" value={form.niche} onChange={e => set('niche', e.target.value)} required placeholder="Ex: Academia / Fitness" />
              <Input label="Instagram" value={form.instagram || ''} onChange={e => set('instagram', e.target.value)} placeholder="@perfil" />
              <div>
                <Input label="WhatsApp" value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} placeholder="5511999999999" />
                <p className="mt-1 text-[11px] text-[#64748b]">Formato: 55 + DDD + número · Ex: <span className="font-mono">5511999999999</span></p>
              </div>
              <div>
                <Input label="Email" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="contato@empresa.com" />
                {form.email && !isEdit && (
                  subData?.plan.hasClientPortal
                    ? <p className="text-[11px] text-violet-600 mt-1">✓ Convite de acesso ao portal será enviado automaticamente.</p>
                    : <p className="text-[11px] text-amber-600 mt-1">⚠ Portal do cliente disponível a partir do plano Starter.</p>
                )}
              </div>
              <Input label="Site" value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://empresa.com" />
              <Input label="Data de entrada" type="date" value={form.entry_date} onChange={e => set('entry_date', e.target.value)} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="proposta">Proposta</SelectItem>
                    <SelectItem value="fechado">Fechado</SelectItem>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="pausado">Pausado</SelectItem>
                    <SelectItem value="encerrado">Encerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo de serviço</label>
                <Select value={form.service_type || 'none'} onValueChange={v => set('service_type', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definir</SelectItem>
                    <SelectItem value="trafego">💰 Tráfego Pago</SelectItem>
                    <SelectItem value="social">📱 Social Media</SelectItem>
                    <SelectItem value="completo">🎯 Completo (Social + Tráfego)</SelectItem>
                    <SelectItem value="outro">⚙️ Outro</SelectItem>
                  </SelectContent>
                </Select>
                {!isEdit && <p className="text-[11px] text-violet-600 mt-1">Sugere o modelo de tarefas certo ao salvar.</p>}
              </div>
            </CardContent>
          </Card>

          {/* Strategy */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Estratégia e Posicionamento</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Textarea label="Objetivo principal" value={form.main_objective || ''} onChange={e => set('main_objective', e.target.value)} placeholder="Ex: Aumentar vendas de planos mensais" />
              <Textarea label="Público-alvo" value={form.target_audience || ''} onChange={e => set('target_audience', e.target.value)} placeholder="Ex: Mulheres 25-40 anos, interessadas em saúde" />
              <Input label="Tom de voz" value={form.tone_of_voice || ''} onChange={e => set('tone_of_voice', e.target.value)} placeholder="Ex: Enérgico, motivacional, próximo" />
              <Input label="Estilo de comunicação" value={form.communication_style || ''} onChange={e => set('communication_style', e.target.value)} placeholder="Ex: Informal, com emojis, direto" />
              <Textarea label="Diferenciais" value={form.differentials || ''} onChange={e => set('differentials', e.target.value)} placeholder="Ex: Metodologia exclusiva, professores certificados" />
              <Textarea label="Serviços oferecidos" value={form.services_offered || ''} onChange={e => set('services_offered', e.target.value)} placeholder="Ex: Musculação, Personal, Nutrição" />
              <Textarea label="Palavras proibidas" value={form.forbidden_words || ''} onChange={e => set('forbidden_words', e.target.value)} placeholder="Ex: barato, comum, igual a todos" />
              <Textarea label="Observações" value={form.observations || ''} onChange={e => set('observations', e.target.value)} placeholder="Informações adicionais..." />
            </CardContent>
          </Card>

          {/* Financial */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Financeiro</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Valor mensal (R$)"
                type="number"
                step="0.01"
                min="0"
                value={form.valor_mensal ?? ''}
                onChange={e => setForm(p => ({ ...p, valor_mensal: e.target.value ? Number(e.target.value) : null }))}
                placeholder="Ex: 1500.00"
              />
              <Input
                label="Dia de vencimento"
                type="number"
                min="1"
                max="31"
                value={form.dia_vencimento ?? ''}
                onChange={e => setForm(p => ({ ...p, dia_vencimento: e.target.value ? Number(e.target.value) : null }))}
                placeholder="Ex: 10"
              />
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" variant="premium" disabled={submitting || isUploadingLogo}>
              <Save className="w-4 h-4" /> {submitting ? 'Salvando...' : 'Salvar cliente'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
          </div>
        </form>
      </div>

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
