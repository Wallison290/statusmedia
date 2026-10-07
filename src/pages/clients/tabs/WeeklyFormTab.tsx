import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList, Link2, Copy, Check, Power, PowerOff,
  ChevronDown, ChevronUp, Calendar, User, Clock,
  Plus, Eye, AlertCircle, Pencil, Trash2, GripVertical,
  ToggleLeft, ToggleRight, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import {
  useWeeklyFormConfig,
  useWeeklyFormResponses,
  useUpsertWeeklyFormConfig,
  useDeleteWeeklyFormResponse,
  submitWeeklyFormResponse,
  resolveQuestions,
  DAY_LABELS,
  DEFAULT_QUESTIONS,
} from '@/hooks/useWeeklyForm'
import type { WeeklyFormResponse, QuestionConfig } from '@/hooks/useWeeklyForm'
import { WeeklyFormFields } from '@/pages/public/WeeklyFormFields'
import { TabHeader, PrimaryButton, GhostButton, EmptyState, DotLabel, Eyebrow, cardStyle, inputStyle } from './tabUi'

// ── Props ─────────────────────────────────────────────────────────────────────

interface WeeklyFormTabProps {
  clientId: string
  clientName: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getThisMonday(): string {
  const d   = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Linha de resposta individual ──────────────────────────────────────────────

function ResponseCard({
  response,
  first,
  onView,
  onDelete,
  deleting,
}: {
  response: WeeklyFormResponse
  first: boolean
  onView: () => void
  onDelete: () => void
  deleting?: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isThisWeek = response.week_reference === getThisMonday()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative flex items-center justify-between gap-3 px-4 py-3 transition-colors group ${first ? '' : 'border-t'} ${confirmDelete ? '' : 'cursor-pointer hover:bg-black/[0.02]'}`}
      style={{ borderColor: 'var(--sm-border)', background: confirmDelete ? 'rgba(239,68,68,0.06)' : undefined }}
      onClick={confirmDelete ? undefined : onView}
    >
      {isThisWeek && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: '#22C55E' }} />}
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold"
          style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)' }}>
          {response.respondent_name?.[0]?.toUpperCase() || '?'}
        </span>
        <div className="min-w-0">
          {confirmDelete ? (
            <p className="text-[12.5px] font-semibold" style={{ color: '#EF4444' }}>Apagar esta resposta?</p>
          ) : (
            <>
              <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{response.respondent_name}</p>
              <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-4)' }}>
                {response.respondent_role ? `${response.respondent_role} · ` : ''}{formatDateTime(response.created_at)}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
        {confirmDelete ? (
          <>
            <button onClick={() => setConfirmDelete(false)} className="h-7 px-2 rounded-md text-[11.5px] hover:bg-black/5" style={{ color: 'var(--sm-text-2)' }}>Cancelar</button>
            <button onClick={onDelete} disabled={deleting}
              className="h-7 px-2.5 rounded-md text-[11.5px] font-semibold text-white disabled:opacity-60" style={{ background: '#EF4444' }}>
              {deleting ? 'Apagando...' : 'Sim, apagar'}
            </button>
          </>
        ) : (
          <>
            {isThisWeek && <DotLabel color="#22C55E">Esta semana</DotLabel>}
            <button onClick={() => setConfirmDelete(true)} title="Apagar resposta" aria-label="Apagar resposta"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-colors md:opacity-0 md:group-hover:opacity-100"
              style={{ color: 'var(--sm-text-3)' }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--sm-text-4)' }} />
          </>
        )}
      </div>
    </motion.div>
  )
}

// ── Modal de visualização de resposta ─────────────────────────────────────────

const RESPONSE_KEYS: { key: keyof WeeklyFormResponse; label: string }[] = [
  { key: 'q_doubts',      label: 'Dúvidas dos clientes' },
  { key: 'q_objections',  label: 'Objeções encontradas' },
  { key: 'q_highlights',  label: 'Temas que merecem destaque' },
  { key: 'q_demands',     label: 'Demandas do setor' },
  { key: 'q_cases',       label: 'Casos e experiências da semana' },
  { key: 'q_trends',      label: 'Tendências percebidas' },
  { key: 'q_faq',         label: 'Perguntas frequentes (FAQ)' },
  { key: 'q_suggestions', label: 'Sugestões de conteúdo' },
  { key: 'q_important',   label: 'Informações importantes' },
]

function ResponseViewModal({
  response,
  onClose,
}: {
  response: WeeklyFormResponse
  onClose: () => void
}) {
  const respostas = RESPONSE_KEYS.filter(({ key }) => response[key])
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold pr-6 text-[color:var(--sm-text-1)]">
            {response.respondent_name}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[12px] -mt-1 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--sm-text-3)' }}>
          {response.respondent_role && <>{response.respondent_role} ·</>}
          <Calendar className="w-3 h-3" /> Semana de {formatDate(response.week_reference)} · enviado em {formatDateTime(response.created_at)}
        </p>

        <dl className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sm-border)' }}>
          {respostas.map(({ key, label }, i) => (
            <div key={key} className={`px-4 py-3 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: 'var(--sm-text-4)' }}>{label}</dt>
              <dd className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--sm-text-1)' }}>{response[key] as string}</dd>
            </div>
          ))}
          {respostas.length === 0 && (
            <p className="px-4 py-6 text-center text-[12.5px]" style={{ color: 'var(--sm-text-4)' }}>Nenhuma pergunta respondida.</p>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  )
}

// ── Modal de preenchimento interno ────────────────────────────────────────────

function FillFormModal({
  configId,
  clientId,
  userId,
  questions,
  onClose,
  onSuccess,
}: {
  configId: string
  clientId: string
  userId: string
  questions: QuestionConfig[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState({
    respondentName: '', respondentRole: '',
    qDoubts: '', qObjections: '', qHighlights: '', qDemands: '',
    qCases: '', qTrends: '', qFaq: '', qSuggestions: '', qImportant: '',
  })

  const handleSubmit = async () => {
    if (!fields.respondentName.trim()) {
      toast('Informe o nome do colaborador', 'error')
      return
    }
    setSaving(true)
    try {
      await submitWeeklyFormResponse({
        configId, clientId,
        respondentName: fields.respondentName,
        respondentRole: fields.respondentRole,
        qDoubts: fields.qDoubts,       qObjections: fields.qObjections,
        qHighlights: fields.qHighlights, qDemands: fields.qDemands,
        qCases: fields.qCases,         qTrends: fields.qTrends,
        qFaq: fields.qFaq,             qSuggestions: fields.qSuggestions,
        qImportant: fields.qImportant,
        isInternal: true, userId,
      })
      toast('Formulário enviado!', 'success')
      onSuccess()
      onClose()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold text-[color:var(--sm-text-1)]">Preencher formulário semanal</DialogTitle>
        </DialogHeader>
        <WeeklyFormFields fields={fields} onChange={setFields} questions={questions} />
        <div className="flex gap-2 pt-2">
          <PrimaryButton onClick={handleSubmit} disabled={saving} className="flex-1 justify-center">
            {saving ? 'Enviando...' : 'Enviar formulário'}
          </PrimaryButton>
          <GhostButton onClick={onClose}>Cancelar</GhostButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Editor de pergunta individual ─────────────────────────────────────────────

function QuestionEditor({
  q,
  first,
  onChange,
}: {
  q: QuestionConfig
  first: boolean
  onChange: (updated: QuestionConfig) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const lbl = 'text-[10.5px] font-semibold uppercase tracking-[0.08em] block mb-1 text-[color:var(--sm-text-4)]'

  return (
    <div className={first ? '' : 'border-t'} style={{ borderColor: 'var(--sm-border)' }}>
      <div className="flex items-center gap-3 px-4 py-2.5" style={{ opacity: q.enabled ? 1 : 0.55 }}>
        <span className="text-[15px] w-5 text-center">{q.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{q.title}</p>
          <p className="text-[11px] truncate" style={{ color: 'var(--sm-text-4)' }}>{q.question}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onChange({ ...q, enabled: !q.enabled })}
            role="switch"
            aria-checked={q.enabled}
            className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11.5px] font-medium hover:bg-black/5 transition-colors"
            style={{ color: 'var(--sm-text-2)' }}
          >
            {q.enabled ? <ToggleRight className="w-4 h-4" style={{ color: '#2563EB' }} /> : <ToggleLeft className="w-4 h-4" style={{ color: 'var(--sm-text-4)' }} />}
            {q.enabled ? 'Ativa' : 'Oculta'}
          </button>
          <button onClick={() => setExpanded(v => !v)} title="Editar pergunta" aria-label="Editar pergunta" aria-expanded={expanded}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors" style={{ color: expanded ? '#2563EB' : 'var(--sm-text-3)' }}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-2.5">
              <div className="flex gap-2">
                <div className="w-16">
                  <label className={lbl}>Emoji</label>
                  <Input value={q.emoji} onChange={e => onChange({ ...q, emoji: e.target.value })} className="h-8 text-[13px] text-center" maxLength={2} />
                </div>
                <div className="flex-1">
                  <label className={lbl}>Título da seção</label>
                  <Input value={q.title} onChange={e => onChange({ ...q, title: e.target.value })} className="h-8 text-[12px]" placeholder="Ex: Dúvidas dos clientes" />
                </div>
              </div>
              <div>
                <label className={lbl}>Texto da pergunta</label>
                <Textarea value={q.question} onChange={e => onChange({ ...q, question: e.target.value })} rows={2} className="text-[12px] resize-none"
                  placeholder="Qual pergunta será exibida para o colaborador?" />
              </div>
              <div>
                <label className={lbl}>Dica dentro do campo</label>
                <Input value={q.placeholder} onChange={e => onChange({ ...q, placeholder: e.target.value })} className="h-8 text-[12px]"
                  placeholder="Texto de exemplo que aparece no campo vazio..." />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function QuestionList({ questions, onChange }: { questions: QuestionConfig[]; onChange: (idx: number, q: QuestionConfig) => void }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={cardStyle}>
      {questions.map((q, idx) => (
        <QuestionEditor key={q.key} q={q} first={idx === 0} onChange={updated => onChange(idx, updated)} />
      ))}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export function WeeklyFormTab({ clientId, clientName }: WeeklyFormTabProps) {
  const { user, agencyId } = useAuth()
  const { toast } = useToast()
  const { data: config, isLoading: configLoading } = useWeeklyFormConfig(clientId)
  const { data: responses = [], isLoading: responsesLoading, refetch } = useWeeklyFormResponses(clientId)
  const upsertConfig  = useUpsertWeeklyFormConfig()
  const deleteResponse = useDeleteWeeklyFormResponse(clientId)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [dayOfWeek, setDayOfWeek]           = useState<number>(1)
  const [isActive, setIsActive]             = useState(true)
  const [copied, setCopied]                 = useState(false)
  const [viewingResponse, setViewingResponse] = useState<WeeklyFormResponse | null>(null)
  const [showFillModal, setShowFillModal]   = useState(false)
  const [configOpen, setConfigOpen]         = useState(false)
  // Editor de perguntas — inicializado quando abre o painel
  const [editingQuestions, setEditingQuestions] = useState<QuestionConfig[] | null>(null)

  // Perguntas resolvidas do config atual
  const resolvedQuestions = resolveQuestions(config)

  const publicToken = config?.public_token ?? null
  const publicLink  = publicToken
    ? `${window.location.origin}/formulario/${publicToken}`
    : null

  const thisMonday    = getThisMonday()
  const thisWeekOk    = responses.some(r => r.week_reference === thisMonday)
  const thisWeekCount = responses.filter(r => r.week_reference === thisMonday).length

  // Abre o painel e carrega as perguntas atuais para edição
  const handleOpenConfig = () => {
    setEditingQuestions(resolveQuestions(config))
    setDayOfWeek(config?.day_of_week ?? 1)
    setConfigOpen(v => !v)
  }

  const handleSaveConfig = async () => {
    try {
      await upsertConfig.mutateAsync({
        clientId,
        dayOfWeek:       config ? (dayOfWeek ?? config.day_of_week) : dayOfWeek,
        isActive:        config ? config.is_active : true,
        existingId:      config?.id,
        customQuestions: editingQuestions,
      })
      toast('Configuração salva!', 'success')
      setConfigOpen(false)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleToggleActive = async () => {
    if (!config) return
    try {
      await upsertConfig.mutateAsync({
        clientId,
        dayOfWeek: config.day_of_week,
        isActive:  !config.is_active,
        existingId: config.id,
      })
      toast(config.is_active ? 'Formulário desativado' : 'Formulário ativado', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleCopyLink = () => {
    if (!publicLink) return
    navigator.clipboard.writeText(publicLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast('Link copiado!', 'success')
  }

  const handleDeleteResponse = async (responseId: string) => {
    setDeletingId(responseId)
    try {
      await deleteResponse.mutateAsync(responseId)
      toast('Resposta apagada.', 'success')
    } catch (e: any) {
      toast(e.message || 'Erro ao apagar.', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleQuestionChange = (idx: number, updated: QuestionConfig) => {
    setEditingQuestions(prev => {
      if (!prev) return prev
      const next = [...prev]
      next[idx] = updated
      return next
    })
  }

  const enabledCount = (editingQuestions ?? resolvedQuestions).filter(q => q.enabled).length


  if (configLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-10 w-64 rounded-xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
        <div className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
        <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
      </div>
    )
  }

  const kpi = (label: string, value: React.ReactNode, hint: React.ReactNode, i: number) => (
    <div className={`px-4 md:px-5 py-4 ${i > 0 ? 'max-sm:border-t sm:border-l' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
      <Eyebrow>{label}</Eyebrow>
      <p className="font-display text-[24px] font-bold leading-tight mt-1 tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
      <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--sm-text-4)' }}>{hint}</p>
    </div>
  )

  const sectionTitle = (n: string, text: string, aside?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 mb-2.5">
      <h3 className="font-display text-[15px] font-bold flex items-baseline gap-2" style={{ color: 'var(--sm-text-1)' }}>
        <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{n}</span>
        {text}
      </h3>
      {aside}
    </div>
  )

  return (
    <section className="space-y-6">
      <TabHeader
        title="Formulário semanal"
        subtitle={`Coleta semanal de ideias e dúvidas com a equipe de ${clientName}.`}
        actions={user && (
          <PrimaryButton onClick={() => {
            if (!config) { setEditingQuestions(DEFAULT_QUESTIONS); setConfigOpen(true) }
            else setShowFillModal(true)
          }}>
            <Plus className="w-3.5 h-3.5" /> {!config ? 'Configurar' : 'Preencher agora'}
          </PrimaryButton>
        )}
      />

      {!config && (
        <EmptyState Icon={ClipboardList} title="Nenhum formulário configurado"
          hint="Configure o formulário para gerar o link que a equipe do cliente vai preencher."
          action={<PrimaryButton onClick={() => { setEditingQuestions(DEFAULT_QUESTIONS); setConfigOpen(true) }}>Configurar formulário</PrimaryButton>} />
      )}

      {config && (
        <>
          {/* Números da semana em uma faixa só */}
          <div className="relative rounded-2xl border grid grid-cols-1 sm:grid-cols-3 overflow-hidden" style={cardStyle}>
            <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r" style={{ background: thisWeekOk ? '#22C55E' : '#F59E0B' }} />
            {kpi('Esta semana', thisWeekCount, thisWeekOk ? 'resposta(s) recebida(s)' : 'nenhuma resposta ainda', 0)}
            {kpi('Total de respostas', responses.length, 'desde o início', 1)}
            {kpi('Frequência', <span className="text-[18px]">Toda {DAY_LABELS[config.day_of_week]}</span>,
              <DotLabel color={config.is_active ? '#22C55E' : '#EF4444'}>{config.is_active ? 'Ativo' : 'Inativo'}</DotLabel>, 2)}
          </div>

          {/* 01 · Link público */}
          <div>
            {sectionTitle('01', 'Link de preenchimento',
              <div className="flex items-center gap-1">
                <button onClick={handleToggleActive} role="switch" aria-checked={config.is_active}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium hover:bg-black/5"
                  style={{ color: 'var(--sm-text-2)' }}>
                  {config.is_active ? <Power className="w-3.5 h-3.5" style={{ color: '#22C55E' }} /> : <PowerOff className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />}
                  {config.is_active ? 'Ativo' : 'Inativo'}
                </button>
                <button onClick={handleOpenConfig} aria-expanded={configOpen}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12px] font-semibold hover:bg-black/5" style={{ color: '#2563EB' }}>
                  Editar perguntas <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ transform: configOpen ? 'rotate(180deg)' : undefined }} />
                </button>
              </div>)}
            <div className="rounded-2xl border p-4 space-y-2.5" style={cardStyle}>
              {publicLink && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 h-9 px-3 flex items-center rounded-lg border text-[12px] font-mono truncate" style={inputStyle}>
                    <Link2 className="w-3.5 h-3.5 mr-2 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} />
                    <span className="truncate" style={{ color: 'var(--sm-text-2)' }}>{publicLink}</span>
                  </div>
                  <PrimaryButton onClick={handleCopyLink} className="flex-shrink-0">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </PrimaryButton>
                </div>
              )}
              <p className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
                Envie este link para os colaboradores do cliente. Cada um pode preencher quantas vezes quiser, sem login.
              </p>
            </div>
          </div>

          {/* Painel de edição das perguntas */}
          <AnimatePresence>
            {configOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border p-4 md:p-5 space-y-5" style={{ ...cardStyle, borderColor: 'rgba(37,99,235,0.35)' }}>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <Eyebrow>Dia preferido de preenchimento</Eyebrow>
                      <Select value={String(dayOfWeek ?? config.day_of_week)} onValueChange={v => setDayOfWeek(Number(v))}>
                        <SelectTrigger className="w-48 h-9 text-[12.5px] mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAY_LABELS.map((label, i) => (
                            <SelectItem key={i} value={String(i)} className="text-[12.5px]">{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <span className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
                      {enabledCount} ativa{enabledCount !== 1 ? 's' : ''} de {(editingQuestions ?? resolvedQuestions).length} perguntas
                    </span>
                  </div>

                  <QuestionList questions={editingQuestions ?? DEFAULT_QUESTIONS} onChange={handleQuestionChange} />
                  <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
                    Use o lápis para mudar o texto de cada pergunta e “Ativa/Oculta” para mostrar ou esconder no formulário.
                  </p>

                  <div className="flex gap-2">
                    <PrimaryButton onClick={handleSaveConfig} disabled={upsertConfig.isPending}>
                      {upsertConfig.isPending ? 'Salvando...' : 'Salvar configuração'}
                    </PrimaryButton>
                    <GhostButton onClick={() => setConfigOpen(false)}>Cancelar</GhostButton>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 02 · Respostas */}
          <div>
            {sectionTitle('02', 'Respostas recebidas',
              <span className="text-[12px] tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{responses.length} no total</span>)}

            {responsesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
                ))}
              </div>
            ) : responses.length === 0 ? (
              <EmptyState Icon={User} title="Nenhuma resposta ainda" hint="Compartilhe o link para começar a receber." />
            ) : (
              <div className="rounded-2xl border overflow-hidden" style={cardStyle}>
                <AnimatePresence initial={false}>
                  {responses.map((r, i) => (
                    <ResponseCard
                      key={r.id}
                      response={r}
                      first={i === 0}
                      onView={() => setViewingResponse(r)}
                      onDelete={() => handleDeleteResponse(r.id)}
                      deleting={deletingId === r.id}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Modal configuração inicial ── */}
      <Dialog open={configOpen && !config} onOpenChange={v => !v && setConfigOpen(false)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold text-[color:var(--sm-text-1)]">Configurar formulário</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Eyebrow>Dia preferido de preenchimento</Eyebrow>
              <Select value={String(dayOfWeek)} onValueChange={v => setDayOfWeek(Number(v))}>
                <SelectTrigger className="h-9 text-[13px] mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAY_LABELS.map((label, i) => (
                    <SelectItem key={i} value={String(i)} className="text-[13px]">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11.5px] mt-1" style={{ color: 'var(--sm-text-4)' }}>Só informativo: o link fica sempre disponível.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Eyebrow>Perguntas do formulário</Eyebrow>
                <span className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
                  {(editingQuestions ?? DEFAULT_QUESTIONS).filter(q => q.enabled).length} ativas
                </span>
              </div>
              <QuestionList questions={editingQuestions ?? DEFAULT_QUESTIONS} onChange={handleQuestionChange} />
            </div>

            <div className="flex gap-2">
              <PrimaryButton
                onClick={async () => {
                  try {
                    await upsertConfig.mutateAsync({
                      clientId,
                      dayOfWeek,
                      isActive: true,
                      customQuestions: editingQuestions,
                    })
                    toast('Formulário criado!', 'success')
                    setConfigOpen(false)
                  } catch (e: any) {
                    toast(e.message, 'error')
                  }
                }}
                disabled={upsertConfig.isPending}
                className="flex-1 justify-center"
              >
                {upsertConfig.isPending ? 'Criando...' : 'Criar formulário'}
              </PrimaryButton>
              <GhostButton onClick={() => setConfigOpen(false)}>Cancelar</GhostButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {viewingResponse && (
        <ResponseViewModal response={viewingResponse} onClose={() => setViewingResponse(null)} />
      )}

      {showFillModal && config && user && (
        <FillFormModal
          configId={config.id}
          clientId={clientId}
          userId={agencyId!}
          questions={resolvedQuestions}
          onClose={() => setShowFillModal(false)}
          onSuccess={() => refetch()}
        />
      )}
    </section>
  )
}
