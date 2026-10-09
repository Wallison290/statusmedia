import { useState, useEffect, useRef } from 'react'
import {
  Check, Upload, Trash2, FileText, ImageIcon, Video, File,
  User, ChevronDown, ExternalLink, ArrowRight,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { useUpdateClient } from '@/hooks/useClients'
import { useToast } from '@/components/ui/toast'
import {
  useChecklist, useToggleChecklist, useEnsureChecklist, useUpdateClientStatus,
  useClientDocuments, useAddDocument, useDeleteDocument,
  useClientBriefing, useUpsertBriefing,
  useTeamMembers,
} from '@/hooks/useOnboarding'
import { supabase } from '@/integrations/supabase/client'
import { formatDate } from '@/utils/formatters'
import { CLIENT_STATUS } from '@/utils/clientBanner'
import { PrimaryButton, GhostButton, cardStyle, inputStyle } from './tabUi'
import type { Client, ClientStatus, BriefingData } from '@/types'

// ─── Config de status ─────────────────────────────────────────────────────────

// 'fechado' é gatilho de transição — não aparece como opção navegável
const CLIENT_STATUSES: ClientStatus[] = ['lead', 'proposta', 'onboarding', 'ativo', 'pausado', 'encerrado']

// ─── Peças de layout ─────────────────────────────────────────────────────────

function Secao({ n, title, aside, children }: { n: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border p-4 md:p-5" style={cardStyle}>
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h3 className="font-display text-[15px] font-bold flex items-baseline gap-2" style={{ color: 'var(--sm-text-1)' }}>
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{n}</span>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

// ─── Ícone de tipo de arquivo ─────────────────────────────────────────────────

function DocTypeIcon({ type }: { type: string }) {
  if (type.startsWith('image/')) return <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#2563EB' }} />
  if (type.startsWith('video/')) return <Video className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8B5CF6' }} />
  if (type === 'application/pdf') return <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#EF4444' }} />
  return <File className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} />
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ─── Seção: Status ────────────────────────────────────────────────────────────

function StatusSection({ client }: { client: Client }) {
  const updateStatus = useUpdateClientStatus()
  const { toast } = useToast()

  const handleChange = async (status: ClientStatus) => {
    if (status === client.status) return
    try {
      await updateStatus.mutateAsync({ id: client.id, status })
      toast('Status atualizado.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleFechado = async () => {
    try {
      await updateStatus.mutateAsync({ id: client.id, status: 'fechado' })
      toast('Negócio fechado! Checklist de onboarding criado automaticamente.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleFinalizar = async () => {
    try {
      await updateStatus.mutateAsync({ id: client.id, status: 'ativo' })
      toast('Onboarding finalizado! Cliente agora está Ativo.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <Secao n="01" title="Status do cliente">
      {/* Etapas: ponto colorido + nome; a atual fica marcada. */}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status do cliente">
        {CLIENT_STATUSES.map(s => {
          const cfg = CLIENT_STATUS[s]
          const isActive = client.status === s
          return (
            <button
              key={s}
              role="radio"
              aria-checked={isActive}
              onClick={() => handleChange(s)}
              disabled={updateStatus.isPending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[12.5px] transition-colors hover:bg-black/5 disabled:opacity-60"
              style={isActive
                ? { borderColor: cfg.color, color: 'var(--sm-text-1)', fontWeight: 600, boxShadow: `inset 0 0 0 1px ${cfg.color}` }
                : { borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
              {cfg.label}
            </button>
          )
        })}
      </div>

      {client.status !== 'onboarding' && client.status !== 'ativo' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--sm-border)' }}>
          <GhostButton onClick={handleFechado} disabled={updateStatus.isPending}>
            Negócio fechado <ArrowRight className="w-3.5 h-3.5" /> Iniciar onboarding
          </GhostButton>
          <p className="text-[12px]" style={{ color: 'var(--sm-text-4)' }}>Cria o checklist e começa o processo.</p>
        </div>
      )}

      {client.status === 'onboarding' && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--sm-border)' }}>
          <PrimaryButton onClick={handleFinalizar} disabled={updateStatus.isPending} className="w-full justify-center">
            <Check className="w-3.5 h-3.5" /> Finalizar onboarding e marcar como Ativo
          </PrimaryButton>
        </div>
      )}
    </Secao>
  )
}

// ─── Seção: Checklist ─────────────────────────────────────────────────────────

function ChecklistSection({ clientId }: { clientId: string }) {
  const { data: items = [], isFetched } = useChecklist(clientId)
  const toggle = useToggleChecklist()
  const ensure = useEnsureChecklist()
  const seededRef = useRef(false)

  // Se o cliente está em onboarding mas nunca semeou o checklist, cria os itens padrão
  useEffect(() => {
    if (isFetched && items.length === 0 && !seededRef.current && !ensure.isPending) {
      seededRef.current = true
      ensure.mutate(clientId)
    }
  }, [isFetched, items.length, clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const completed = items.filter(i => i.completed).length
  const total = items.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <Secao n="02" title="Checklist de onboarding"
      aside={<span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-3)' }}>{completed}/{total}</span>}>
      <div className="w-full h-1 rounded-full overflow-hidden mb-3" style={{ background: 'var(--sm-bg-alt)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: '#22C55E' }} />
      </div>

      <div className="-mx-2">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => toggle.mutate({ id: item.id, completed: !item.completed, clientId })}
            className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-black/5 transition-colors text-left"
          >
            <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
              style={item.completed
                ? { background: '#22C55E', border: '1px solid #22C55E' }
                : { border: '1.5px solid var(--sm-field-border)' }}>
              {item.completed && <Check className="w-2.5 h-2.5 text-white" />}
            </span>
            <span className={`text-[13px] ${item.completed ? 'line-through' : ''}`}
              style={{ color: item.completed ? 'var(--sm-text-4)' : 'var(--sm-text-1)' }}>
              {item.title}
            </span>
          </button>
        ))}
      </div>
    </Secao>
  )
}

// ─── Seção: Responsável ───────────────────────────────────────────────────────

function ResponsibleSection({ client }: { client: Client }) {
  const { data: members = [] } = useTeamMembers()
  const updateClient = useUpdateClient()
  const { toast } = useToast()

  const handleChange = async (userId: string) => {
    const value = userId === '__none__' ? null : userId
    try {
      await updateClient.mutateAsync({ id: client.id, responsible_user_id: value })
      toast('Responsável atualizado.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const current = members.find(m => m.id === client.responsible_user_id)

  return (
    <Secao n="03" title="Responsável interno">
      <Select value={client.responsible_user_id ?? '__none__'} onValueChange={handleChange}>
        <SelectTrigger>
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
            <SelectValue placeholder="Sem responsável">
              {current ? (current.full_name || current.email) : 'Sem responsável'}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Sem responsável</SelectItem>
          {members.map(m => (
            <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Secao>
  )
}

// ─── Seção: Documentos ────────────────────────────────────────────────────────

function DocumentsSection({ clientId }: { clientId: string }) {
  const { user, agencyId } = useAuth()
  const { data: docs = [] } = useClientDocuments(clientId)
  const addDoc = useAddDocument()
  const deleteDoc = useDeleteDocument()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `${agencyId!}/${clientId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('client-documents').upload(path, file)
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('client-documents').getPublicUrl(path)
      await addDoc.mutateAsync({
        client_id: clientId,
        user_id: agencyId!,
        name: file.name,
        file_url: publicUrl,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
      })
      toast('Documento adicionado.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (id: string, fileUrl: string) => {
    try {
      await deleteDoc.mutateAsync({ id, clientId, fileUrl })
      toast('Documento removido.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setConfirmingId(null)
    }
  }

  return (
    <Secao n="04" title="Documentos"
      aside={<>
        <GhostButton onClick={() => fileRef.current?.click()} disabled={uploading} className="h-8">
          <Upload className={`w-3.5 h-3.5 ${uploading ? 'animate-pulse' : ''}`} /> {uploading ? 'Enviando...' : 'Adicionar'}
        </GhostButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
          className="hidden"
          onChange={handleUpload}
        />
      </>}>
      {docs.length === 0 ? (
        <p className="text-[12.5px] py-5 text-center rounded-xl border border-dashed" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-4)' }}>
          Nenhum documento ainda. Envie logos, manuais, fotos…
        </p>
      ) : (
        <div className="-mx-4 md:-mx-5 border-t" style={{ borderColor: 'var(--sm-border)' }}>
          {docs.map((doc, i) => {
            const isImg = doc.file_type.startsWith('image/')
            return (
              <div key={doc.id} className={`flex items-center gap-3 px-4 md:px-5 py-2.5 group ${i > 0 ? 'border-t' : ''}`}
                style={{ borderColor: 'var(--sm-border)' }}>
                {isImg ? (
                  <img src={doc.file_url} alt="" className="w-8 h-8 rounded-md object-cover flex-shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sm-bg-alt)' }}>
                    <DocTypeIcon type={doc.file_type} />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium truncate" style={{ color: 'var(--sm-text-1)' }}>{doc.name}</p>
                  <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>{formatDate(doc.created_at)}{doc.file_size ? ` · ${formatSize(doc.file_size)}` : ''}</p>
                </div>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" title="Abrir" aria-label="Abrir"
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 flex-shrink-0" style={{ color: 'var(--sm-text-3)' }}>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                {confirmingId === doc.id ? (
                  <span className="flex items-center gap-1">
                    <button onClick={() => setConfirmingId(null)} className="text-[11.5px] px-2 h-7 rounded-md hover:bg-black/5" style={{ color: 'var(--sm-text-2)' }}>Não</button>
                    <button onClick={() => handleDelete(doc.id, doc.file_url)} className="text-[11.5px] font-semibold px-2 h-7 rounded-md hover:bg-red-500/10" style={{ color: '#EF4444' }}>Sim</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmingId(doc.id)} title="Excluir" aria-label="Excluir"
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--sm-text-3)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Secao>
  )
}

// ─── Seção: Briefing ──────────────────────────────────────────────────────────

type BriefingBlock = {
  key: string
  title: string
  fields: Array<
    | { key: keyof BriefingData; label: string; type: 'textarea'; placeholder?: string }
    | { key: keyof BriefingData; label: string; type: 'input'; placeholder?: string }
    | { key: keyof BriefingData; label: string; type: 'toggle' }
    | { key: keyof BriefingData; label: string; type: 'checkbox' }
  >
}

const BRIEFING_BLOCKS: BriefingBlock[] = [
  {
    key: 'empresa',
    title: 'Empresa',
    fields: [
      { key: 'como_nasceu',           label: 'Como nasceu a empresa?',            type: 'textarea', placeholder: 'História de origem...' },
      { key: 'servicos_mais_vende',   label: 'Serviços / produtos que mais vende', type: 'textarea', placeholder: 'Liste os principais...' },
      { key: 'servicos_quer_vender',  label: 'O que quer vender mais?',           type: 'textarea', placeholder: 'Foco de crescimento...' },
      { key: 'diferencial_empresa',   label: 'Principal diferencial',             type: 'textarea', placeholder: 'O que te torna único...' },
      { key: 'concorrentes',          label: 'Principais concorrentes',           type: 'textarea', placeholder: 'Nomes ou perfis...' },
      { key: 'regiao_atendida',       label: 'Região atendida',                   type: 'input',    placeholder: 'Ex: São Paulo, online, nacional...' },
    ],
  },
  {
    key: 'publico',
    title: 'Público',
    fields: [
      { key: 'quem_compra_hoje',  label: 'Quem compra hoje?',               type: 'textarea', placeholder: 'Perfil atual de clientes...' },
      { key: 'quem_quer_atrair', label: 'Quem quer atrair?',               type: 'textarea', placeholder: 'Perfil desejado...' },
      { key: 'maior_dor',        label: 'Maior dor do cliente final',      type: 'textarea', placeholder: 'Principal problema que resolve...' },
      { key: 'gatilho_decisao',  label: 'Gatilho de decisão de compra',    type: 'textarea', placeholder: 'O que faz o cliente comprar...' },
    ],
  },
  {
    key: 'marketing',
    title: 'Marketing',
    fields: [
      { key: 'rodou_trafego_pago',    label: 'Já rodou tráfego pago?',  type: 'toggle' },
      { key: 'teve_agencia',          label: 'Já teve agência?',         type: 'toggle' },
      { key: 'o_que_funcionou',       label: 'O que funcionou',          type: 'textarea', placeholder: 'Estratégias que deram resultado...' },
      { key: 'o_que_nao_funcionou',   label: 'O que não funcionou',      type: 'textarea', placeholder: 'O que evitar...' },
    ],
  },
  {
    key: 'objetivos',
    title: 'Objetivos',
    fields: [
      { key: 'obj_mais_leads',              label: 'Mais leads',                  type: 'checkbox' },
      { key: 'obj_mais_vendas',             label: 'Mais vendas',                 type: 'checkbox' },
      { key: 'obj_autoridade',              label: 'Gerar autoridade',            type: 'checkbox' },
      { key: 'obj_crescimento_instagram',   label: 'Crescimento no Instagram',    type: 'checkbox' },
      { key: 'obj_posicionamento_premium',  label: 'Posicionamento premium',      type: 'checkbox' },
    ],
  },
]

function BriefingSection({ clientId }: { clientId: string }) {
  const { data: briefing } = useClientBriefing(clientId)
  const upsert = useUpsertBriefing()
  const { toast } = useToast()
  const [form, setForm] = useState<BriefingData>({})
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({
    empresa: true, publico: true, marketing: true, objetivos: true,
  })

  useEffect(() => {
    if (briefing?.data) setForm(briefing.data)
  }, [briefing])

  const setField = (key: keyof BriefingData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({ clientId, data: form })
      toast('Briefing salvo!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const toggleBlock = (key: string) => {
    setOpenBlocks(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const simNao = (ativo: boolean, cor: string) => (ativo
    ? { borderColor: cor, color: 'var(--sm-text-1)', fontWeight: 600, boxShadow: `inset 0 0 0 1px ${cor}` }
    : { borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' })

  return (
    <section>
      <div className="flex items-end justify-between gap-3 mb-3">
        <h3 className="font-display text-[15px] font-bold flex items-baseline gap-2" style={{ color: 'var(--sm-text-1)' }}>
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>05</span>
          Briefing completo
        </h3>
        <PrimaryButton onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? 'Salvando...' : 'Salvar briefing'}
        </PrimaryButton>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={cardStyle}>
        {BRIEFING_BLOCKS.map((block, bi) => (
          <div key={block.key} className={bi > 0 ? 'border-t' : ''} style={{ borderColor: 'var(--sm-border)' }}>
            <button
              type="button"
              onClick={() => toggleBlock(block.key)}
              aria-expanded={!!openBlocks[block.key]}
              className="w-full flex items-center justify-between px-4 md:px-5 py-3.5 hover:bg-black/[0.02] transition-colors"
            >
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-3)' }}>{block.title}</span>
              <ChevronDown className="w-4 h-4 transition-transform" style={{ color: 'var(--sm-text-4)', transform: openBlocks[block.key] ? 'rotate(180deg)' : undefined }} />
            </button>

            {openBlocks[block.key] && (
              <div className="px-4 md:px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                {block.fields.map(field => {
                  if (field.type === 'textarea') {
                    return (
                      <Textarea
                        key={field.key as string}
                        label={field.label}
                        value={(form[field.key] as string) || ''}
                        onChange={e => setField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={3}
                      />
                    )
                  }

                  if (field.type === 'input') {
                    return (
                      <div key={field.key as string}>
                        <label className="block text-[12px] mb-1.5" style={{ color: 'var(--sm-text-3)' }}>{field.label}</label>
                        <input
                          type="text"
                          value={(form[field.key] as string) || ''}
                          onChange={e => setField(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="flex h-9 w-full rounded-lg border px-3 text-[13px] placeholder:text-[color:var(--sm-text-4)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/50 transition-colors"
                          style={inputStyle}
                        />
                      </div>
                    )
                  }

                  if (field.type === 'toggle') {
                    const val = form[field.key] as boolean | undefined
                    return (
                      <div key={field.key as string} className="flex items-center justify-between gap-3">
                        <label className="text-[13px]" style={{ color: 'var(--sm-text-1)' }}>{field.label}</label>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setField(field.key, true)}
                            className="h-7 px-3 rounded-lg border text-[12px] transition-colors hover:bg-black/5" style={simNao(val === true, '#22C55E')}>Sim</button>
                          <button type="button" onClick={() => setField(field.key, false)}
                            className="h-7 px-3 rounded-lg border text-[12px] transition-colors hover:bg-black/5" style={simNao(val === false, '#EF4444')}>Não</button>
                        </div>
                      </div>
                    )
                  }

                  if (field.type === 'checkbox') {
                    const val = form[field.key] as boolean | undefined
                    return (
                      <button
                        key={field.key as string}
                        type="button"
                        role="checkbox"
                        aria-checked={!!val}
                        onClick={() => setField(field.key, !val)}
                        className="flex items-center gap-2.5 w-full text-left rounded-lg px-1 py-1 hover:bg-black/5 transition-colors"
                      >
                        <span
                          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                          style={val ? { background: '#2563EB', border: '1px solid #2563EB' } : { border: '1.5px solid var(--sm-field-border)' }}
                        >
                          {val && <Check className="w-2.5 h-2.5 text-white" />}
                        </span>
                        <span className="text-[13px]" style={{ color: val ? 'var(--sm-text-1)' : 'var(--sm-text-2)' }}>{field.label}</span>
                      </button>
                    )
                  }

                  return null
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function OnboardingTab({ client }: { client: Client }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-[17px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Onboarding</h2>
        <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>Etapa do cliente, checklist de entrada, documentos e briefing.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <StatusSection client={client} />
          <ResponsibleSection client={client} />
        </div>
        <div className="space-y-4">
          {client.status === 'onboarding' ? (
            <ChecklistSection clientId={client.id} />
          ) : (
            <Secao n="02" title="Checklist de onboarding">
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--sm-text-3)' }}>
                O checklist aparece quando o cliente está em <strong style={{ color: 'var(--sm-text-1)' }}>Onboarding</strong>.
                {' '}Use <strong style={{ color: 'var(--sm-text-1)' }}>Negócio fechado → Iniciar onboarding</strong> no status para começar.
              </p>
            </Secao>
          )}
          <DocumentsSection clientId={client.id} />
        </div>
      </div>

      <BriefingSection clientId={client.id} />
    </div>
  )
}
