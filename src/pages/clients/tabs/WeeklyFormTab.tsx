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

// ── Card de resposta individual ────────────────────────────────────────────────

function ResponseCard({
  response,
  onView,
  onDelete,
  deleting,
}: {
  response: WeeklyFormResponse
  onView: () => void
  onDelete: () => void
  deleting?: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const thisWeek   = getThisMonday()
  const isThisWeek = response.week_reference === thisWeek

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDelete(true)
  }

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete()
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDelete(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
        confirmDelete
          ? 'border-red-200 bg-red-50'
          : 'border-[#e8eaf0] bg-white hover:border-violet-200 hover:bg-violet-50/30 cursor-pointer'
      } group`}
      onClick={confirmDelete ? undefined : onView}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[13px] font-bold ${
          confirmDelete
            ? 'bg-red-400'
            : 'bg-gradient-to-br from-violet-500 to-purple-600'
        }`}>
          {response.respondent_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0">
          {confirmDelete ? (
            <p className="text-[12px] font-semibold text-red-700">
              Apagar este formulário?
            </p>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-[#0f172a] truncate">
                {response.respondent_name}
              </p>
              <p className="text-[11px] text-[#94a3b8] truncate">
                {response.respondent_role} · {formatDateTime(response.created_at)}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {confirmDelete ? (
          <>
            <button
              onClick={handleConfirm}
              disabled={deleting}
              className="px-3 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[11px] font-semibold transition-colors disabled:opacity-60"
            >
              {deleting ? 'Apagando...' : 'Sim, apagar'}
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 rounded-lg border border-[#e2e8f0] text-[11px] text-[#64748b] hover:bg-white transition-colors"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            {isThisWeek && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Esta semana
              </span>
            )}
            <button
              onClick={handleDeleteClick}
              className="p-1.5 rounded-lg text-[#c8d4e4] hover:text-red-400 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
              title="Apagar resposta"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <Eye className="w-4 h-4 text-[#c8d4e4] group-hover:text-violet-500 transition-colors" />
          </>
        )}
      </div>
    </motion.div>
  )
}

// ── Modal de visualização de resposta ─────────────────────────────────────────

const RESPONSE_KEYS: { key: keyof WeeklyFormResponse; label: string; emoji: string }[] = [
  { key: 'q_doubts',      label: 'Dúvidas dos clientes',          emoji: '❓' },
  { key: 'q_objections',  label: 'Objeções encontradas',          emoji: '🛑' },
  { key: 'q_highlights',  label: 'Temas que merecem destaque',    emoji: '🌟' },
  { key: 'q_demands',     label: 'Demandas do setor',             emoji: '📋' },
  { key: 'q_cases',       label: 'Casos e experiências da semana', emoji: '💼' },
  { key: 'q_trends',      label: 'Tendências percebidas',         emoji: '📈' },
  { key: 'q_faq',         label: 'Perguntas Frequentes (FAQ)',    emoji: '🔁' },
  { key: 'q_suggestions', label: 'Sugestões de conteúdo',        emoji: '💡' },
  { key: 'q_important',   label: 'Informações importantes',       emoji: '🔒' },
]

function ResponseViewModal({
  response,
  onClose,
}: {
  response: WeeklyFormResponse
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-violet-600" />
            Formulário — {response.respondent_name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4 p-3 rounded-xl bg-violet-50 border border-violet-100 mb-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-[14px]">
            {response.respondent_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#0f172a]">{response.respondent_name}</p>
            <p className="text-[11px] text-[#64748b]">{response.respondent_role}</p>
            <p className="text-[10px] text-[#94a3b8] mt-0.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Semana de {formatDate(response.week_reference)} · Enviado em {formatDateTime(response.created_at)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {RESPONSE_KEYS.map(({ key, label, emoji }) => {
            const value = response[key] as string | null
            if (!value) return null
            return (
              <div key={key} className="p-3 rounded-xl border border-[#e8eaf0] bg-[#fafbfc]">
                <p className="text-[11px] font-semibold text-[#64748b] mb-1.5 flex items-center gap-1">
                  <span>{emoji}</span> {label}
                </p>
                <p className="text-[13px] text-[#0f172a] leading-relaxed whitespace-pre-wrap">{value}</p>
              </div>
            )
          })}
        </div>
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
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-violet-600" />
            Preencher Formulário Semanal
          </DialogTitle>
        </DialogHeader>
        <WeeklyFormFields fields={fields} onChange={setFields} questions={questions} />
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white"
          >
            {saving ? 'Enviando...' : 'Enviar formulário'}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Editor de pergunta individual ─────────────────────────────────────────────

function QuestionEditor({
  q,
  index,
  total,
  onChange,
}: {
  q: QuestionConfig
  index: number
  total: number
  onChange: (updated: QuestionConfig) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`rounded-xl border transition-colors ${q.enabled ? 'border-[#e2e8f0] bg-white' : 'border-dashed border-[#e2e8f0] bg-[#f8fafc] opacity-60'}`}>
      {/* Header da pergunta */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-[15px]">{q.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[#0f172a] truncate">{q.title}</p>
          <p className="text-[10px] text-[#94a3b8] truncate">{q.question}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Toggle ativo/inativo */}
          <button
            onClick={() => onChange({ ...q, enabled: !q.enabled })}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold transition-colors ${
              q.enabled
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-[#f1f5f9] text-[#94a3b8] hover:bg-[#e2e8f0]'
            }`}
          >
            {q.enabled ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
            {q.enabled ? 'Ativa' : 'Oculta'}
          </button>
          {/* Expandir para editar */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg hover:bg-[#f1f5f9] transition-colors text-[#94a3b8] hover:text-[#374151]"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Campos de edição */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2.5 border-t border-[#f1f5f9] pt-2.5">
              {/* Emoji + Título */}
              <div className="flex gap-2">
                <div className="w-16">
                  <label className="text-[10px] font-medium text-[#94a3b8] block mb-1">Emoji</label>
                  <Input
                    value={q.emoji}
                    onChange={e => onChange({ ...q, emoji: e.target.value })}
                    className="h-8 text-[13px] text-center"
                    maxLength={2}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-[#94a3b8] block mb-1">Título da seção</label>
                  <Input
                    value={q.title}
                    onChange={e => onChange({ ...q, title: e.target.value })}
                    className="h-8 text-[12px]"
                    placeholder="Ex: Dúvidas dos clientes"
                  />
                </div>
              </div>
              {/* Pergunta */}
              <div>
                <label className="text-[10px] font-medium text-[#94a3b8] block mb-1">Texto da pergunta</label>
                <Textarea
                  value={q.question}
                  onChange={e => onChange({ ...q, question: e.target.value })}
                  rows={2}
                  className="text-[12px] resize-none"
                  placeholder="Qual pergunta será exibida para o colaborador?"
                />
              </div>
              {/* Placeholder */}
              <div>
                <label className="text-[10px] font-medium text-[#94a3b8] block mb-1">Placeholder (dica dentro do campo)</label>
                <Input
                  value={q.placeholder}
                  onChange={e => onChange({ ...q, placeholder: e.target.value })}
                  className="h-8 text-[12px]"
                  placeholder="Texto de exemplo que aparece no campo vazio..."
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Header da aba ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold text-[#0f172a] flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-violet-600" />
            Formulário Semanal de Conteúdo
          </h3>
          <p className="text-[12px] text-[#94a3b8] mt-0.5">
            Coleta semanal de insights da equipe de {clientName}
          </p>
        </div>
        {user && (
          <Button
            size="sm"
            onClick={() => {
              if (!config) {
                setEditingQuestions(DEFAULT_QUESTIONS)
                setConfigOpen(true)
              } else {
                setShowFillModal(true)
              }
            }}
            className="gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[12px]"
          >
            <Plus className="w-3.5 h-3.5" />
            {!config ? 'Configurar' : 'Preencher agora'}
          </Button>
        )}
      </div>

      {/* ── Sem config ainda ── */}
      {!config && (
        <div className="flex flex-col items-center justify-center py-12 gap-4 text-center border-2 border-dashed border-[#e2e8f0] rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
            <ClipboardList className="w-7 h-7 text-violet-400" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#0f172a]">Nenhum formulário configurado</p>
            <p className="text-[12px] text-[#94a3b8] mt-0.5">Configure o formulário para gerar o link de preenchimento</p>
          </div>
          <Button
            onClick={() => { setEditingQuestions(DEFAULT_QUESTIONS); setConfigOpen(true) }}
            className="bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[12px]"
          >
            Configurar formulário
          </Button>
        </div>
      )}

      {/* ── Config existente ── */}
      {config && (
        <>
          {/* Status cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={`p-4 rounded-2xl border ${thisWeekOk ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className={`w-4 h-4 ${thisWeekOk ? 'text-green-600' : 'text-amber-500'}`} />
                <span className={`text-[11px] font-semibold ${thisWeekOk ? 'text-green-700' : 'text-amber-700'}`}>Esta semana</span>
              </div>
              <p className={`text-[22px] font-bold ${thisWeekOk ? 'text-green-700' : 'text-amber-600'}`}>{thisWeekCount}</p>
              <p className="text-[11px] text-[#64748b]">{thisWeekOk ? 'resposta(s) recebida(s)' : 'nenhuma resposta ainda'}</p>
            </div>
            <div className="p-4 rounded-2xl border border-[#e2e8f0] bg-white">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList className="w-4 h-4 text-violet-500" />
                <span className="text-[11px] font-semibold text-[#64748b]">Total de respostas</span>
              </div>
              <p className="text-[22px] font-bold text-[#0f172a]">{responses.length}</p>
              <p className="text-[11px] text-[#94a3b8]">desde o início</p>
            </div>
            <div className="p-4 rounded-2xl border border-[#e2e8f0] bg-white">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="text-[11px] font-semibold text-[#64748b]">Frequência</span>
              </div>
              <p className="text-[14px] font-bold text-[#0f172a]">Toda {DAY_LABELS[config.day_of_week]}</p>
              <p className={`text-[11px] mt-0.5 font-medium ${config.is_active ? 'text-green-600' : 'text-red-500'}`}>
                {config.is_active ? '● Ativo' : '○ Inativo'}
              </p>
            </div>
          </div>

          {/* Link público */}
          <div className="p-4 rounded-2xl border border-[#e2e8f0] bg-[#fafbfc] space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-[#0f172a] flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-violet-500" />
                Link público de preenchimento
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleActive}
                  className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                    config.is_active
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
                  }`}
                >
                  {config.is_active
                    ? <><Power className="w-3 h-3" /> Ativo</>
                    : <><PowerOff className="w-3 h-3" /> Inativo</>
                  }
                </button>
                <button
                  onClick={handleOpenConfig}
                  className="text-[11px] text-violet-600 hover:text-violet-700 font-medium flex items-center gap-0.5"
                >
                  Editar
                  {configOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {publicLink && (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white border border-[#e2e8f0] text-[12px] text-[#64748b] font-mono truncate">
                  {publicLink}
                </div>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-medium transition-colors flex-shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            )}

            <p className="text-[11px] text-[#94a3b8]">
              Envie este link para os colaboradores do cliente. Cada um pode preencher quantas vezes quiser, sem precisar de login.
            </p>
          </div>

          {/* ── Painel de configuração expandível ── */}
          <AnimatePresence>
            {configOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-2xl border border-violet-200 bg-violet-50 space-y-5">
                  <p className="text-[13px] font-bold text-violet-800">Editar formulário</p>

                  {/* Dia de preenchimento */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Dia preferido de preenchimento</p>
                    <Select
                      value={String(dayOfWeek ?? config.day_of_week)}
                      onValueChange={v => setDayOfWeek(Number(v))}
                    >
                      <SelectTrigger className="w-44 h-8 text-[12px] bg-white text-[#0f0f0f]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_LABELS.map((label, i) => (
                          <SelectItem key={i} value={String(i)} className="text-[12px]">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Editor de perguntas */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">
                        Perguntas do formulário
                      </p>
                      <span className="text-[10px] text-[#94a3b8]">
                        {enabledCount} ativa{enabledCount !== 1 ? 's' : ''} de {(editingQuestions ?? resolvedQuestions).length}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {(editingQuestions ?? DEFAULT_QUESTIONS).map((q, idx) => (
                        <QuestionEditor
                          key={q.key}
                          q={q}
                          index={idx}
                          total={(editingQuestions ?? DEFAULT_QUESTIONS).length}
                          onChange={updated => handleQuestionChange(idx, updated)}
                        />
                      ))}
                    </div>

                    <p className="text-[10px] text-[#94a3b8]">
                      💡 Clique no ícone de lápis para editar o texto de cada pergunta. Use o toggle para mostrar ou ocultar perguntas no formulário.
                    </p>
                  </div>

                  {/* Botões */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={handleSaveConfig}
                      disabled={upsertConfig.isPending}
                      className="bg-violet-600 hover:bg-violet-700 text-white text-[12px]"
                    >
                      {upsertConfig.isPending ? 'Salvando...' : 'Salvar configuração'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfigOpen(false)} className="text-[12px]">
                      Cancelar
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Lista de respostas ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-[#0f172a] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#94a3b8]" />
                Respostas recebidas
              </p>
              <span className="text-[11px] text-[#94a3b8]">{responses.length} no total</span>
            </div>

            {responsesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 rounded-xl bg-[#f1f5f9] animate-pulse" />
                ))}
              </div>
            ) : responses.length === 0 ? (
              <div className="text-center py-10 text-[#94a3b8]">
                <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-[13px]">Nenhuma resposta ainda</p>
                <p className="text-[11px]">Compartilhe o link para começar a receber</p>
              </div>
            ) : (
              <AnimatePresence>
                <div className="space-y-2">
                  {responses.map(r => (
                    <ResponseCard
                      key={r.id}
                      response={r}
                      onView={() => setViewingResponse(r)}
                      onDelete={() => handleDeleteResponse(r.id)}
                      deleting={deletingId === r.id}
                    />
                  ))}
                </div>
              </AnimatePresence>
            )}
          </div>
        </>
      )}

      {/* ── Modal configuração inicial ── */}
      <Dialog open={configOpen && !config} onOpenChange={v => !v && setConfigOpen(false)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-violet-600" />
              Configurar formulário
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">

            {/* Dia */}
            <div>
              <label className="text-[12px] font-medium text-[#64748b] block mb-1.5">
                Dia preferido de preenchimento
              </label>
              <Select
                value={String(dayOfWeek)}
                onValueChange={v => setDayOfWeek(Number(v))}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_LABELS.map((label, i) => (
                    <SelectItem key={i} value={String(i)} className="text-[13px]">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-[#94a3b8] mt-1">
                Apenas informativo — o link estará sempre disponível.
              </p>
            </div>

            {/* Perguntas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium text-[#64748b]">Perguntas do formulário</label>
                <span className="text-[10px] text-[#94a3b8]">
                  {(editingQuestions ?? DEFAULT_QUESTIONS).filter(q => q.enabled).length} ativas
                </span>
              </div>
              {(editingQuestions ?? DEFAULT_QUESTIONS).map((q, idx) => (
                <QuestionEditor
                  key={q.key}
                  q={q}
                  index={idx}
                  total={(editingQuestions ?? DEFAULT_QUESTIONS).length}
                  onChange={updated => handleQuestionChange(idx, updated)}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <Button
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
                className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white"
              >
                {upsertConfig.isPending ? 'Criando...' : 'Criar formulário'}
              </Button>
              <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal visualizar resposta ── */}
      {viewingResponse && (
        <ResponseViewModal
          response={viewingResponse}
          onClose={() => setViewingResponse(null)}
        />
      )}

      {/* ── Modal preencher internamente ── */}
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
    </div>
  )
}
