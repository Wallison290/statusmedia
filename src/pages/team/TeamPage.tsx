import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserPlus, X, Check, Loader2, Copy, ExternalLink,
  Pencil, Trash2, AlertCircle, Phone, Mail,
  Users, ClipboardList, ChevronDown, Plus,
  Calendar, Flag, Building2,
  Link as LinkIcon, Image, Film, FileText as FileIcon, Folder,
  Search, Filter, ShieldCheck,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { PartnersPanel } from './PartnersPanel'
import { useClients } from '@/hooks/useClients'
import { supabase } from '@/integrations/supabase/client'
import { useSubscription } from '@/hooks/useSubscription'
import { useUpdateTask, useDeleteTask as useDeleteTaskHook } from '@/hooks/useTasks'
import {
  useTeamMembers, useTeamTasks,
  useCreateTeamMember, useUpdateTeamMember, useDeleteTeamMember,
  useCreateAndDelegateTask, useDelegateTask,
  type TeamMember, type TeamTask, type TaskLink,
} from '@/hooks/useTeamMembers'

// ── Cores disponíveis para membros ────────────────────────────────────────────
const COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#d97706',
  '#dc2626', '#db2777', '#0891b2', '#65a30d',
]

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  a_fazer:      { label: 'A fazer',       color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
  em_andamento: { label: 'Em andamento',  color: '#fbbf24', bg: 'rgba(245,158,11,0.15)' },
  revisao:      { label: 'Em revisão',    color: '#60a5fa', bg: 'rgba(37,99,235,0.18)' },
  concluido:    { label: 'Concluído',     color: '#34d399', bg: 'rgba(16,185,129,0.15)' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  baixa:   { label: 'Baixa',   color: '#94a3b8' },
  media:   { label: 'Normal',  color: '#f59e0b' },
  alta:    { label: 'Alta',    color: '#f97316' },
  urgente: { label: 'Urgente', color: '#ef4444' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPortalUrl(token: string) {
  return `${window.location.origin}/colaborador/${token}`
}

function buildWhatsAppMessage(name: string, portalUrl: string) {
  // Emojis via percent-decode — bypass total de encoding de arquivo
  // wave=👋 check=✅ clip=📎 memo=📝 out=📤
  const decode = (pct: string) => decodeURIComponent(pct)
  const wave  = decode('%F0%9F%91%8B') // 👋
  const check = decode('%E2%9C%85')    // ✅
  const clip  = decode('%F0%9F%93%8E') // 📎
  const memo  = decode('%F0%9F%93%9D') // 📝
  const out   = decode('%F0%9F%93%A4') // 📤
  const nl    = '\n'

  return (
    'Olá, ' + name + '! ' + wave + ' Aqui está o link do seu portal de demandas: ' + portalUrl + nl +
    nl +
    'Por lá você consegue:' + nl +
    check + ' Ver todas as suas tarefas e prazos' + nl +
    clip  + ' Acessar os arquivos e referências que enviamos' + nl +
    memo  + ' Deixar observações sobre cada demanda' + nl +
    out   + ' Enviar o link de entrega quando finalizar' + nl +
    nl +
    'Qualquer dúvida é só me chamar aqui!'
  )
}

// Evita o bug de fuso horário: 'YYYY-MM-DD' interpretado como UTC converte
// para o dia anterior em UTC-3. Parseando a string diretamente resolvemos.
function formatDate(date: string | null) {
  if (!date) return '—'
  const d = date.split('T')[0] // garante só a parte da data
  const [, mm, dd] = d.split('-')
  return `${dd}/${mm}`
}

function isOverdue(date: string | null, status: string) {
  if (!date || status === 'concluido') return false
  // Comparação como string YYYY-MM-DD é segura e sem fuso
  const today = new Date()
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return date.split('T')[0] < ymd
}

// ── Helpers de link ───────────────────────────────────────────────────────────

function nanoid() {
  return Math.random().toString(36).slice(2, 10)
}

// Detecta tipo de link pelo MIME type do arquivo
function mimeToLinkType(mime: string): TaskLink['type'] {
  if (mime.startsWith('image/')) return 'imagem'
  if (mime.startsWith('video/')) return 'video'
  return 'arquivo'
}

// ── Editor de links reutilizável ──────────────────────────────────────────────

// Configuração de cada tipo: ícone, rótulo, accept do input e se é upload
const LINK_TYPE_CONFIG: {
  value:  TaskLink['type']
  label:  string
  Icon:   React.FC<{ className?: string }>
  upload: boolean
  accept?: string
  color:  string
}[] = [
  { value: 'link',    label: 'Link',    Icon: LinkIcon, upload: false, color: 'text-violet-600' },
  { value: 'imagem',  label: 'Imagem',  Icon: Image,    upload: true,  accept: 'image/*',         color: 'text-sky-600'    },
  { value: 'video',   label: 'Vídeo',   Icon: Film,     upload: true,  accept: 'video/*',         color: 'text-pink-600'   },
  { value: 'arquivo', label: 'Arquivo', Icon: FileIcon, upload: true,  accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv', color: 'text-amber-600' },
  { value: 'pasta',   label: 'Pasta',   Icon: Folder,   upload: true,  accept: '*',               color: 'text-emerald-600'},
]

function LinksEditor({
  links,
  onChange,
  compact = false,
}: {
  links: TaskLink[]
  onChange: (links: TaskLink[]) => void
  compact?: boolean
}) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // null = fechado | 'picker' = selecionando tipo | TaskLink['type'] = form aberto
  const [step, setStep] = useState<null | 'picker' | TaskLink['type']>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl,   setNewUrl]   = useState('')
  const [uploading, setUploading] = useState(false)

  const selectedTypeCfg = step && step !== 'picker'
    ? LINK_TYPE_CONFIG.find(t => t.value === step) ?? null
    : null

  const reset = () => {
    setStep(null); setNewLabel(''); setNewUrl('')
  }

  // Confirmação de link externo
  const confirmLink = () => {
    if (!newUrl.trim()) return
    onChange([...links, {
      id:    nanoid(),
      label: newLabel.trim() || newUrl.trim(),
      url:   newUrl.trim(),
      type:  step as TaskLink['type'],
    }])
    reset()
  }

  // Upload de arquivo
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop() ?? 'bin'
      const path = `${Date.now()}-${nanoid()}.${ext}`

      const { data, error } = await supabase.storage
        .from('task-files')
        .upload(path, file, { upsert: false })

      if (error) throw new Error(error.message)

      const { data: urlData } = supabase.storage
        .from('task-files')
        .getPublicUrl(data.path)

      const type = step && step !== 'picker'
        ? (step as TaskLink['type'])
        : mimeToLinkType(file.type)

      onChange([...links, {
        id:    nanoid(),
        label: newLabel.trim() || file.name,
        url:   urlData.publicUrl,
        type,
      }])
      toast('Arquivo enviado!', 'success')
      reset()
    } catch (err: any) {
      toast(err.message ?? 'Erro ao enviar arquivo', 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeLink = (id: string) => onChange(links.filter(l => l.id !== id))

  const inputCls = compact
    ? 'h-7 px-2 text-[11px] rounded-md border border-[#1e293b] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#2563EB]/40 w-full'
    : 'h-9 px-3 text-[13px] rounded-lg border border-[#1e293b] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 w-full'

  return (
    <div className={compact ? 'space-y-1.5' : 'border border-[#1e293b] rounded-xl p-3 space-y-2'}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <label className={`font-semibold text-[#475569] flex items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          <LinkIcon className={compact ? 'w-3 h-3 text-[#a78bfa]' : 'w-3.5 h-3.5 text-[#a78bfa]'} />
          Links e referências
          {links.length > 0 && (
            <span className="bg-violet-100 text-[#a78bfa] text-[10px] px-1.5 py-0.5 rounded-full">{links.length}</span>
          )}
        </label>
        {step === null && (
          <button
            type="button"
            onClick={() => setStep('picker')}
            className="flex items-center gap-0.5 text-[11px] text-violet-600 hover:text-[#a78bfa] font-medium"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        )}
      </div>

      {/* PASSO 1 — Picker de tipo */}
      {step === 'picker' && (
        <div className="bg-slate-50 rounded-lg border border-[#1e293b] p-2.5 space-y-1.5">
          <p className={`font-medium text-[#475569] ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
            O que você quer adicionar?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {LINK_TYPE_CONFIG.map(({ value, label, Icon, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => setStep(value)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#1e293b] bg-[#182233] hover:border-[#2563EB]/50 hover:bg-[#1e293b] transition-colors ${compact ? 'text-[10px]' : 'text-[11px]'} font-medium text-[#CBD5E1]`}
              >
                <Icon className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${color}`} />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-[10px] text-[#94a3b8] hover:text-[#64748b]"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* PASSO 2 — Form de acordo com o tipo */}
      {selectedTypeCfg && (() => {
        const TypeIcon = selectedTypeCfg.Icon
        return (
          <div className="bg-[#8b5cf6]/10 rounded-lg border border-[#8b5cf6]/20 p-2.5 space-y-2">
            {/* Título do tipo selecionado */}
            <div className="flex items-center justify-between">
              <span className={`flex items-center gap-1.5 font-semibold text-[#CBD5E1] ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                <TypeIcon className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${selectedTypeCfg.color}`} />
                {selectedTypeCfg.label}
              </span>
              <button type="button" onClick={reset} className="text-[#94a3b8] hover:text-[#64748b]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Campo de rótulo (comum a todos) */}
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder={selectedTypeCfg.upload ? 'Rótulo (opcional)' : 'Rótulo (ex: Briefing)'}
              className={inputCls}
            />

            {/* Link → campo de URL */}
            {!selectedTypeCfg.upload && (
              <div className="flex gap-2">
                <input
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmLink()}
                  placeholder="https://..."
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={confirmLink}
                  className={`px-3 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 flex-shrink-0 ${compact ? 'text-[11px]' : 'text-[12px]'}`}
                >
                  OK
                </button>
              </div>
            )}

            {/* Upload → área de clique */}
            {selectedTypeCfg.upload && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-[#334155] rounded-lg py-4 bg-[#182233] hover:border-[#2563EB]/50 hover:bg-[#1e293b] transition-colors disabled:opacity-60"
                >
                  {uploading
                    ? <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                    : <TypeIcon className={`w-5 h-5 ${selectedTypeCfg.color}`} />
                  }
                  <span className={`font-medium text-[#475569] ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                    {uploading ? 'Enviando...' : `Clique para selecionar ${selectedTypeCfg.label.toLowerCase()}`}
                  </span>
                  {!uploading && (
                    <span className="text-[10px] text-[#94a3b8]">Máximo 50 MB</span>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={selectedTypeCfg.accept}
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </>
            )}
          </div>
        )
      })()}

      {/* Placeholder vazio */}
      {links.length === 0 && step === null && (
        <p className={`text-[#94a3b8] text-center py-1.5 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          Adicione links, imagens, vídeos ou arquivos
        </p>
      )}

      {/* Lista de links/arquivos */}
      {links.length > 0 && (
        <div className="space-y-1">
          {links.map(link => {
            const cfg = LINK_TYPE_CONFIG.find(t => t.value === link.type)
            const Icon = cfg?.Icon ?? LinkIcon
            return (
              <div key={link.id}
                className="flex items-center gap-2 bg-[#182233] rounded-lg border border-[#1e293b] px-2.5 py-2 group">
                <Icon className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${cfg?.color ?? 'text-[#a78bfa]'} flex-shrink-0`} />
                <a href={link.url} target="_blank" rel="noopener noreferrer"
                  className={`flex-1 min-w-0 text-[#F8FAFC] hover:text-[#a78bfa] truncate font-medium ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
                  {link.label}
                </a>
                <button onClick={() => removeLink(link.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#c0c0c0] hover:text-red-400">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Formulário de edição de tarefa (inline no modal do membro) ───────────────

function TaskEditPanel({
  task,
  clients,
  onSave,
  onCancel,
}: {
  task: TeamTask
  clients: { id: string; company_name: string }[]
  onSave: (updates: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}) {
  const [title,    setTitle]   = useState(task.title)
  const [desc,     setDesc]    = useState(task.description ?? '')
  const [dueDate,  setDueDate] = useState(task.due_date ?? '')
  const [priority, setPri]     = useState(task.priority)
  const [status,   setStatus]  = useState(task.status)
  const [clientId, setClient]  = useState<string>(task.client_id ?? '__none__')
  const [saving,   setSaving]  = useState(false)

  // Links / referências
  const [links, setLinks] = useState<TaskLink[]>(() =>
    Array.isArray(task.task_links) ? task.task_links : []
  )

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title:       title.trim(),
        description: desc || null,
        due_date:    dueDate || null,
        priority,
        status,
        client_id:   clientId === '__none__' ? null : clientId,
        task_links:  links,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-[#182233] rounded-xl p-3 mt-2 space-y-3 border border-[#1e293b]">
      {/* Título */}
      <div>
        <label className="text-[10px] font-medium text-[#64748b] block mb-1">Título</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full h-8 px-2.5 rounded-lg border border-[#1e293b] text-[12px] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
        />
      </div>

      {/* Descrição */}
      <div>
        <label className="text-[10px] font-medium text-[#64748b] block mb-1">Descrição</label>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={2}
          className="w-full px-2.5 py-1.5 rounded-lg border border-[#1e293b] text-[12px] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-[#64748b] block mb-1">Prazo</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="w-full h-8 px-2 rounded-lg border border-[#1e293b] text-[12px] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-[#64748b] block mb-1">Prioridade</label>
          <select value={priority} onChange={e => setPri(e.target.value)}
            className="w-full h-8 px-2 rounded-lg border border-[#1e293b] text-[12px] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40">
            <option value="baixa">Baixa</option>
            <option value="media">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-[#64748b] block mb-1">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full h-8 px-2 rounded-lg border border-[#1e293b] text-[12px] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40">
            <option value="a_fazer">A fazer</option>
            <option value="em_andamento">Em andamento</option>
            <option value="revisao">Em revisão</option>
            <option value="concluido">Concluído</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-[#64748b] block mb-1">Cliente</label>
          <select value={clientId} onChange={e => setClient(e.target.value)}
            className="w-full h-8 px-2 rounded-lg border border-[#1e293b] text-[12px] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40">
            <option value="__none__">Interno</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        </div>
      </div>

      {/* Links / referências */}
      <LinksEditor links={links} onChange={setLinks} compact />

      {/* Entrega do colaborador (read-only) */}
      {(task.collaborator_note || task.delivery_url) && (
        <div className="bg-[#8b5cf6]/10 rounded-lg p-2 space-y-1">
          <p className="text-[10px] font-semibold text-[#a78bfa] mb-1">Entrega do colaborador</p>
          {task.collaborator_note && (
            <p className="text-[11px] text-[#a78bfa]">📝 {task.collaborator_note}</p>
          )}
          {task.delivery_url && (
            <a href={task.delivery_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-[#a78bfa] underline hover:text-violet-900">
              <ExternalLink className="w-3 h-3" /> Ver entrega
            </a>
          )}
        </div>
      )}

      {/* Botões */}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving || !title.trim()}
          className="flex-1 h-8 rounded-lg bg-violet-600 text-white text-[12px] font-semibold hover:bg-violet-700 disabled:opacity-60 flex items-center justify-center gap-1.5">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Salvar
        </button>
        <button onClick={onCancel}
          className="flex-1 h-8 rounded-lg border border-[#1e293b] text-[12px] text-[#64748b] hover:bg-[#f1f5f9]">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Modal de visualização de tarefa ──────────────────────────────────────────

function TaskViewModal({
  task,
  clients,
  onClose,
  onEdit,
}: {
  task: TeamTask
  clients: { id: string; company_name: string }[]
  onClose: () => void
  onEdit: () => void
}) {
  const st  = STATUS_CONFIG[task.status]    ?? STATUS_CONFIG.a_fazer
  const pri = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.media
  const overdue = isOverdue(task.due_date, task.status)
  const links   = Array.isArray(task.task_links) ? task.task_links : []

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.18 }}
        className="bg-[#111827] border border-[#1e293b] w-full max-w-lg rounded-2xl shadow-2xl max-h-[88vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 sticky top-0 bg-[#111827] border-b border-[#1e293b] z-10">
          <div className="flex-1 min-w-0">
            <h2 className={`text-[15px] font-bold leading-snug ${
              task.status === 'concluido' ? 'line-through text-[#94a3b8]' : 'text-[#F8FAFC]'
            }`}>{task.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: st.color, backgroundColor: st.bg }}>
                {st.label}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: pri.color, backgroundColor: `${pri.color}18` }}>
                {pri.label}
              </span>
              {task.clients && (
                <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: '#2563EB', color: '#ffffff' }}>
                  <Building2 className="w-2.5 h-2.5" /> {task.clients.company_name}
                </span>
              )}
              {task.due_date && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  overdue ? 'text-red-400 bg-red-500/10 font-semibold' : 'text-[#94a3b8] bg-[#1e293b]'
                }`}>
                  <Calendar className="w-2.5 h-2.5" />
                  {overdue && 'Atrasado · '}{formatDate(task.due_date)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={onEdit}
              title="Editar"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1e293b] text-[11px] text-[#94a3b8] hover:text-[color:var(--sm-text-1)] hover:bg-[#1e293b] transition-colors font-medium"
            >
              <Pencil className="w-3 h-3" /> Editar
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-[#1e293b] flex items-center justify-center">
              <X className="w-4 h-4 text-[#94a3b8]" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Descrição */}
          {task.description && (
            <div className="bg-[#182233] border border-[#1e293b] rounded-xl p-3.5">
              <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">Descrição</p>
              <p className="text-[13px] text-[#CBD5E1] leading-relaxed whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Links e referências com prévia */}
          {links.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
                Referências e materiais ({links.length})
              </p>
              <div className="space-y-2">
                {links.map(link => {
                  // Prévia de imagem
                  if (link.type === 'imagem') {
                    return (
                      <div key={link.id} className="rounded-xl overflow-hidden border border-[#1e293b]">
                        <img
                          src={link.url}
                          alt={link.label}
                          className="w-full max-h-64 object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <div className="flex items-center justify-between px-3 py-2 bg-[#182233]">
                          <span className="text-[11px] font-medium text-[#CBD5E1] truncate flex-1">{link.label}</span>
                          <a href={link.url} target="_blank" rel="noopener noreferrer"
                            className="text-[#94a3b8] hover:text-[#a78bfa] ml-2 flex-shrink-0">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    )
                  }

                  // Prévia de vídeo
                  if (link.type === 'video') {
                    return (
                      <div key={link.id} className="rounded-xl overflow-hidden border border-[#1e293b]">
                        <video
                          src={link.url}
                          controls
                          className="w-full max-h-64 bg-black"
                          preload="metadata"
                        />
                        <div className="flex items-center justify-between px-3 py-2 bg-[#182233]">
                          <span className="text-[11px] font-medium text-[#CBD5E1] truncate flex-1">{link.label}</span>
                          <a href={link.url} target="_blank" rel="noopener noreferrer"
                            className="text-[#94a3b8] hover:text-[#a78bfa] ml-2 flex-shrink-0">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    )
                  }

                  // Outros tipos — card de link
                  const iconMap: Record<string, React.FC<{ className?: string }>> = {
                    link:    LinkIcon,
                    arquivo: FileIcon,
                    pasta:   Folder,
                  }
                  const Icon = iconMap[link.type] ?? LinkIcon
                  const bgMap: Record<string, string> = {
                    link:    '#7c3aed',
                    arquivo: '#b45309',
                    pasta:   '#059669',
                  }
                  const iconBg = bgMap[link.type] ?? '#7c3aed'

                  return (
                    <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl border border-[#1e293b] hover:border-[#2563EB]/50 hover:bg-[#1e293b] transition-all group">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-[#CBD5E1] truncate group-hover:text-[#a78bfa]">{link.label}</p>
                        <p className="text-[10px] text-[#94a3b8] truncate">{link.url}</p>
                      </div>
                      <ExternalLink className="w-3 h-3 text-[#c0c0c0] group-hover:text-violet-400 flex-shrink-0" />
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Entrega do colaborador */}
          {(task.collaborator_note || task.delivery_url) && (
            <div className="bg-[#8b5cf6]/10 rounded-xl p-3.5 border border-[#8b5cf6]/20 space-y-1.5">
              <p className="text-[10px] font-semibold text-[#a78bfa] uppercase tracking-wider">Entrega do colaborador</p>
              {task.collaborator_note && (
                <p className="text-[12px] text-[#a78bfa] leading-relaxed">📝 {task.collaborator_note}</p>
              )}
              {task.delivery_url && (
                <a href={task.delivery_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-violet-400 hover:text-[#a78bfa] font-medium">
                  <ExternalLink className="w-3 h-3" /> Ver entrega enviada
                </a>
              )}
            </div>
          )}

          {/* Sem conteúdo extra */}
          {!task.description && links.length === 0 && !task.collaborator_note && !task.delivery_url && (
            <p className="text-[12px] text-[#94a3b8] text-center py-4">Nenhum detalhe adicional cadastrado.</p>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ── Modal de detalhe do membro ────────────────────────────────────────────────

function MemberDetailModal({
  member,
  allTasks,
  clients,
  onClose,
  onNewTask,
}: {
  member: TeamMember
  allTasks: TeamTask[]
  clients: { id: string; company_name: string }[]
  onClose: () => void
  onNewTask: () => void
}) {
  const { toast } = useToast()
  const updateTask = useUpdateTask()
  const deleteTaskMutation = useDeleteTaskHook()
  const [expandedId,   setExpanded]    = useState<string | null>(null)
  const [deletingId,   setDeletingId]  = useState<string | null>(null)
  const [viewingTask,  setViewingTask] = useState<TeamTask | null>(null)

  // Estado local para atualização otimista (mostra mudanças imediatamente sem esperar refetch)
  const [localTasks, setLocalTasks] = useState<TeamTask[]>(
    () => allTasks.filter(t => t.assignee_id === member.id)
  )

  // Sincroniza quando o React Query recarrega os dados (ex: nova tarefa criada externamente)
  useEffect(() => {
    setLocalTasks(allTasks.filter(t => t.assignee_id === member.id))
  }, [allTasks, member.id])

  const initial = member.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  // Ordena: não concluídas primeiro, depois por prazo
  const sorted = [...localTasks].sort((a, b) => {
    if (a.status === 'concluido' && b.status !== 'concluido') return 1
    if (a.status !== 'concluido' && b.status === 'concluido') return -1
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date.localeCompare(b.due_date)
  })

  const handleSaveTask = async (taskId: string, updates: Record<string, unknown>) => {
    try {
      await (updateTask.mutateAsync as any)({ id: taskId, ...updates })
      // Atualização otimista: aplica mudanças localmente antes do refetch
      setLocalTasks(prev => prev.map(t =>
        t.id === taskId
          ? {
              ...t,
              ...(updates as Partial<TeamTask>),
              // Atualiza o objeto clients se client_id mudou
              clients: updates.client_id
                ? (clients.find(c => c.id === updates.client_id)
                    ? { id: updates.client_id as string, company_name: clients.find(c => c.id === updates.client_id)!.company_name }
                    : null)
                : updates.client_id === null ? null : t.clients,
            }
          : t
      ))
      toast('Tarefa atualizada!', 'success')
      setExpanded(null)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTaskMutation.mutateAsync(taskId)
      // Atualização otimista: remove localmente imediatamente
      setLocalTasks(prev => prev.filter(t => t.id !== taskId))
      toast('Demanda removida.', 'success')
      setDeletingId(null)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const pending   = localTasks.filter(t => t.status !== 'concluido').length
  const concluded = localTasks.filter(t => t.status === 'concluido').length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        transition={{ duration: 0.2 }}
        className="bg-[#111827] border-l border-[#1e293b] h-full w-full max-w-md flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header do membro */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e293b] flex-shrink-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0"
            style={{ backgroundColor: member.color }}
          >
            {member.avatar_url
              ? <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
              : initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-[#F8FAFC] truncate">{member.name}</p>
            <p className="text-[11px]" style={{ color: 'var(--sm-text-3)' }}>{member.role || 'Sem cargo'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { onClose(); onNewTask() }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700 transition-colors"
            >
              <Plus className="w-3 h-3" /> Demanda
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full hover:bg-[#f1f5f9] flex items-center justify-center"
            >
              <X className="w-4 h-4 text-[#94a3b8]" />
            </button>
          </div>
        </div>

        {/* Contato */}
        {(member.whatsapp || member.email) && (
          <div className="px-5 py-2 border-b border-[#f8fafc] flex gap-4 flex-shrink-0">
            {member.whatsapp && (
              <a href={`https://wa.me/${member.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-[#64748b] hover:text-green-600 transition-colors">
                <Phone className="w-3 h-3" /> {member.whatsapp}
              </a>
            )}
            {member.email && (
              <a href={`mailto:${member.email}`}
                className="flex items-center gap-1.5 text-[11px] text-[#64748b] hover:text-blue-600 transition-colors">
                <Mail className="w-3 h-3" /> {member.email}
              </a>
            )}
          </div>
        )}

        {/* Resumo de tarefas */}
        <div className="px-5 py-2.5 border-b border-[#f8fafc] flex gap-4 flex-shrink-0">
          <span className="text-[11px] text-[#94a3b8]">
            <strong className="text-[#F8FAFC]">{localTasks.length}</strong> total
          </span>
          <span className="text-[11px] text-amber-600">
            <strong>{pending}</strong> pendente{pending !== 1 ? 's' : ''}
          </span>
          <span className="text-[11px] text-emerald-600">
            <strong>{concluded}</strong> concluída{concluded !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Lista de tarefas */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <ClipboardList className="w-9 h-9 text-[#cbd5e1]" />
              <p className="text-[13px] text-[#94a3b8] font-medium">Nenhuma demanda atribuída</p>
              <button
                onClick={() => { onClose(); onNewTask() }}
                className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[12px] font-medium hover:bg-violet-700"
              >
                Criar primeira demanda
              </button>
            </div>
          ) : (
            sorted.map(task => {
              const st  = STATUS_CONFIG[task.status]   ?? STATUS_CONFIG.a_fazer
              const pri = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.media
              const overdue = isOverdue(task.due_date, task.status)
              const isExpanded = expandedId === task.id
              const isDeleting = deletingId === task.id

              return (
                <div
                  key={task.id}
                  className={`rounded-xl border transition-all ${
                    task.status === 'concluido'
                      ? 'border-[#e2e8f0] bg-[#fafafa] opacity-70'
                      : 'border-[#1e293b] bg-[#182233] hover:border-[#2563EB]/50'
                  }`}
                >
                  {/* Linha principal da tarefa — clicável para visualizar */}
                  <div
                    className="p-3 cursor-pointer"
                    onClick={() => setViewingTask(task)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12.5px] font-semibold leading-snug ${
                          task.status === 'concluido' ? 'line-through text-[#94a3b8]' : 'text-[#F8FAFC]'
                        }`}>
                          {task.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {/* Status */}
                          <span
                            className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ color: st.color, backgroundColor: st.bg }}
                          >
                            {st.label}
                          </span>
                          {/* Prioridade */}
                          <span
                            className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ color: pri.color, backgroundColor: `${pri.color}18` }}
                          >
                            {pri.label}
                          </span>
                          {/* Cliente */}
                          {task.clients && (
                            <span className="text-[10px] text-blue-500 truncate max-w-[100px]">
                              {task.clients.company_name}
                            </span>
                          )}
                          {/* Prazo */}
                          {task.due_date && (
                            <span className={`text-[10px] ${overdue ? 'text-red-500 font-medium' : 'text-[#94a3b8]'}`}>
                              {overdue ? '⚠️ ' : '📅 '}{formatDate(task.due_date)}
                            </span>
                          )}
                          {/* Indica que tem links */}
                          {Array.isArray(task.task_links) && task.task_links.length > 0 && (
                            <span className="text-[9.5px] text-[#a78bfa] bg-[#8b5cf6]/10 px-1.5 py-0.5 rounded-full font-medium">
                              {task.task_links.length} anexo{task.task_links.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botões ação — stopPropagation para não abrir o modal de visualização */}
                      <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setExpanded(isExpanded ? null : task.id)}
                          title="Editar"
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                            isExpanded ? 'bg-violet-100 text-violet-600' : 'text-[#c0c0c0] hover:bg-[#f1f5f9] hover:text-[#F8FAFC]'
                          }`}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setDeletingId(task.id)}
                          title="Remover"
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-[#d0d0d0] hover:bg-red-50 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Confirmação inline de exclusão */}
                    {isDeleting && (
                      <div className="mt-2 flex items-center gap-2 bg-red-50 rounded-lg px-2.5 py-2">
                        <AlertCircle className="w-3.5 h-3.5 text-red-700 flex-shrink-0" />
                        <span className="text-[11px] text-red-800 flex-1">Remover esta demanda?</span>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="text-[11px] font-semibold text-red-600 hover:text-red-800 px-1"
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="text-[11px] text-[#64748b] hover:text-[#F8FAFC] px-1"
                        >
                          Não
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Formulário de edição */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden px-3 pb-3"
                      >
                        <TaskEditPanel
                          task={task}
                          clients={clients}
                          onSave={updates => handleSaveTask(task.id, updates)}
                          onCancel={() => setExpanded(null)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })
          )}
        </div>
      </motion.div>

      {/* Modal de visualização de tarefa */}
      <AnimatePresence>
        {viewingTask && (
          <TaskViewModal
            task={viewingTask}
            clients={clients}
            onClose={() => setViewingTask(null)}
            onEdit={() => {
              setExpanded(viewingTask.id)
              setViewingTask(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Modal de Membro ───────────────────────────────────────────────────────────

function MemberModal({
  member, onClose,
}: {
  member?: TeamMember
  onClose: () => void
}) {
  const { toast } = useToast()
  const createMember = useCreateTeamMember()
  const updateMember = useUpdateTeamMember()

  const [name,     setName]     = useState(member?.name     ?? '')
  const [role,     setRole]     = useState(member?.role     ?? '')
  const [whatsapp, setWA]       = useState(member?.whatsapp ?? '')
  const [email,    setEmail]    = useState(member?.email    ?? '')
  const [color,    setColor]    = useState(member?.color    ?? COLORS[0])

  const isEdit  = !!member
  const loading = createMember.isPending || updateMember.isPending

  const handleSave = async () => {
    if (!name.trim()) { toast('Nome obrigatório', 'error'); return }
    try {
      if (isEdit) {
        await updateMember.mutateAsync({ id: member!.id, name, role: role || null, whatsapp: whatsapp || null, email: email || null, color })
        toast('Membro atualizado!', 'success')
      } else {
        await createMember.mutateAsync({ name, role: role || null, whatsapp: whatsapp || null, email: email || null, color })
        toast('Membro adicionado!', 'success')
      }
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[#F8FAFC]">
            {isEdit ? 'Editar membro' : 'Novo membro'}
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-[#f1f5f9] flex items-center justify-center">
            <X className="w-4 h-4 text-[#94a3b8]" />
          </button>
        </div>

        {/* Cor */}
        <div>
          <label className="text-[11px] font-medium text-[#64748b] block mb-2">Cor de identificação</label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-all"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `3px solid ${c}` : '3px solid transparent',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
        </div>

        {/* Campos */}
        <div className="space-y-3">
          {[
            { label: 'Nome *', value: name, set: setName, placeholder: 'Ex: Bia Santos' },
            { label: 'Cargo / Função', value: role, set: setRole, placeholder: 'Ex: Social Media' },
            { label: 'WhatsApp', value: whatsapp, set: setWA, placeholder: '55 87 99999-9999' },
            { label: 'E-mail', value: email, set: setEmail, placeholder: 'bia@email.com' },
          ].map(({ label, value, set, placeholder }) => (
            <div key={label}>
              <label className="text-[11px] font-medium text-[#64748b] block mb-1">{label}</label>
              <input
                value={value}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                className="w-full h-9 px-3 rounded-lg border border-[#1e293b] bg-[#182233] text-[13px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-transparent"
              />
            </div>
          ))}
        </div>

        {/* Botões */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 h-9 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isEdit ? 'Salvar' : 'Adicionar'}
          </button>
          <button onClick={onClose} className="flex-1 h-9 rounded-lg border border-[#1e293b] text-[13px] text-[#475569] hover:bg-[#f8fafc]">
            Cancelar
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Modal: Nova Demanda ───────────────────────────────────────────────────────

const PRIORITY_OPTIONS = [
  { value: 'baixa',   label: 'Baixa'   },
  { value: 'media',   label: 'Normal'  },
  { value: 'alta',    label: 'Alta'    },
  { value: 'urgente', label: 'Urgente' },
]
const STATUS_OPTIONS_FORM = [
  { value: 'a_fazer',      label: 'A fazer'      },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'revisao',      label: 'Em revisão'   },
  { value: 'concluido',    label: 'Concluído'    },
]

function NewTaskModal({
  member,
  clients,
  onClose,
}: {
  member: TeamMember
  clients: { id: string; company_name: string }[]
  onClose: () => void
}) {
  const { toast } = useToast()
  const createAndDelegate = useCreateAndDelegateTask()

  const [title,       setTitle]      = useState('')
  const [description, setDesc]       = useState('')
  const [dueDate,     setDueDate]    = useState('')
  const [dueTime,     setDueTime]    = useState('')
  const [priority,    setPriority]   = useState('media')
  const [status,      setStatus]     = useState('a_fazer')
  const [clientId,    setClientId]   = useState<string | null>(null)

  // Links / referências
  const [links, setLinks] = useState<TaskLink[]>([])

  const saving = createAndDelegate.isPending

  const handleSubmit = async () => {
    if (!title.trim()) { toast('Título obrigatório', 'error'); return }
    try {
      await createAndDelegate.mutateAsync({
        title:       title.trim(),
        description: description || null,
        due_date:    dueDate || null,
        due_time:    dueTime || null,
        priority,
        status,
        client_id:   clientId,
        assignee_id: member.id,
        assignee:    member.name,
        task_links:  links,
      })
      toast('Demanda criada e delegada!', 'success')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const initial = member.name[0].toUpperCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
              style={{ backgroundColor: member.color }}
            >
              {member.avatar_url
                ? <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
                : initial}
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-[#F8FAFC]">Nova demanda</h2>
              <p className="text-[11px] text-[#94a3b8]">Para {member.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-[#f1f5f9] flex items-center justify-center">
            <X className="w-4 h-4 text-[#94a3b8]" />
          </button>
        </div>

        {/* Título */}
        <div>
          <label className="text-[11px] font-medium text-[#64748b] block mb-1">Título *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Descreva a demanda..."
            autoFocus
            className="w-full h-9 px-3 rounded-lg border border-[#1e293b] bg-[#182233] text-[13px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-transparent"
          />
        </div>

        {/* Descrição */}
        <div>
          <label className="text-[11px] font-medium text-[#64748b] block mb-1">Descrição</label>
          <textarea
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder="Detalhes, referências, observações..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-[#1e293b] bg-[#182233] text-[13px] text-[#E2E8F0] placeholder:text-[#64748b] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-transparent"
          />
        </div>

        {/* Data + Horário */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-[#64748b] block mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Prazo
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#1e293b] bg-[#182233] text-[13px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#64748b] block mb-1">Horário</label>
            <input
              type="time"
              value={dueTime}
              onChange={e => setDueTime(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#1e293b] bg-[#182233] text-[13px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-transparent"
            />
          </div>
        </div>

        {/* Prioridade + Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-[#64748b] block mb-1 flex items-center gap-1">
              <Flag className="w-3 h-3" /> Prioridade
            </label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-[#1e293b] text-[13px] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
            >
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#64748b] block mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-[#1e293b] text-[13px] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
            >
              {STATUS_OPTIONS_FORM.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Cliente */}
        <div>
          <label className="text-[11px] font-medium text-[#64748b] block mb-1 flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Cliente (opcional)
          </label>
          <select
            value={clientId || '__none__'}
            onChange={e => setClientId(e.target.value === '__none__' ? null : e.target.value)}
            className="w-full h-9 px-2 rounded-lg border border-[#1e293b] text-[13px] bg-[#182233] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
          >
            <option value="__none__">Interno (sem cliente)</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        </div>

        {/* Links e referências */}
        <LinksEditor links={links} onChange={setLinks} />

        {/* Botões */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            className="flex-1 h-9 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Criar demanda
          </button>
          <button onClick={onClose} className="flex-1 h-9 rounded-lg border border-[#1e293b] text-[13px] text-[#475569] hover:bg-[#f8fafc]">
            Cancelar
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Card de Membro ────────────────────────────────────────────────────────────

function MemberCard({
  member, taskCount, onEdit, onDelete, onNewTask, onOpenDetail,
}: {
  member: TeamMember
  taskCount: number
  onEdit: () => void
  onDelete: () => void
  onNewTask: () => void
  onOpenDetail: () => void
}) {
  const { toast } = useToast()
  const initial = member.name[0].toUpperCase()
  const [waSending, setWaSending] = useState(false)

  const handleSendWhatsApp = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (waSending) return
    setWaSending(true)
    try {
      const portalUrl = getPortalUrl(member.portal_token)
      const text = buildWhatsAppMessage(member.name, portalUrl)
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: { number: member.whatsapp, text },
      })
      if (error) throw error
      if (data?.ok === false) throw new Error(data.error ?? 'Erro ao enviar.')
      toast(`Mensagem enviada para ${member.name}! ✅`, 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao enviar mensagem.', 'error')
    } finally {
      setWaSending(false)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(getPortalUrl(member.portal_token))
    toast('Link copiado!', 'success')
  }

  const WaIcon = () => (
    <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )

  return (
    <>
      <div
        className="rounded-2xl border border-[#1e293b] bg-[#111827] p-4 flex flex-col gap-3 transition-all cursor-pointer hover:border-[#2563EB]/50 overflow-hidden min-w-0"
        onClick={onOpenDetail}
      >
        {/* Avatar + info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0"
            style={{ backgroundColor: member.color }}
          >
            {member.avatar_url
              ? <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
              : initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#F8FAFC] truncate">{member.name}</p>
            <span className="inline-block mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full truncate max-w-full" style={{ color: 'var(--sm-text-2)', background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}>{member.role || 'Sem cargo'}</span>
          </div>
          <span
            className="text-[11px] font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
            style={{ backgroundColor: member.color }}
          >
            {taskCount}
          </span>
        </div>

        {/* Contatos */}
        <div className="flex flex-col gap-1 min-w-0">
          {member.whatsapp && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#94a3b8] min-w-0">
              <Phone className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{member.whatsapp}</span>
            </div>
          )}
          {member.email && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#94a3b8] min-w-0">
              <Mail className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{member.email}</span>
            </div>
          )}
        </div>

        {/* Ações — duas linhas para não estourar */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-[#1e293b]" onClick={e => e.stopPropagation()}>
          {/* Linha 1: ações primárias */}
          <div className="flex gap-1.5">
            <button
              onClick={onNewTask}
              title="Nova demanda"
              className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-[11px] text-[#a78bfa] bg-[#8b5cf6]/15 hover:bg-[#8b5cf6]/25 transition-colors font-medium min-w-0"
            >
              <Plus className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">Demanda</span>
            </button>

            {member.whatsapp && (
              <button
                onClick={handleSendWhatsApp}
                disabled={waSending}
                title="Enviar portal via WhatsApp"
                className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-[11px] text-[#4ade80] bg-[#22C55E]/15 hover:bg-[#22C55E]/25 transition-colors font-medium min-w-0 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {waSending
                  ? <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                  : <WaIcon />}
                <span className="truncate">{waSending ? 'Enviando...' : 'WhatsApp'}</span>
              </button>
            )}
          </div>

          {/* Linha 2: ações secundárias (só ícones) */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={copyLink}
              title="Copiar link do portal"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[#94a3b8] hover:bg-[#1e293b] hover:text-[color:var(--sm-text-1)] transition-colors"
            >
              <Copy className="w-3 h-3 flex-shrink-0" />
              <span className="text-[10px]">Portal</span>
            </button>
            <a
              href={getPortalUrl(member.portal_token)}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir portal"
              className="flex items-center p-1.5 rounded-lg text-[#94a3b8] hover:bg-[#1e293b] hover:text-[color:var(--sm-text-1)] transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={onEdit}
              title="Editar membro"
              className="flex items-center p-1.5 rounded-lg text-[#94a3b8] hover:bg-[#1e293b] hover:text-[color:var(--sm-text-1)] transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={onDelete}
              title="Remover membro"
              className="flex items-center p-1.5 rounded-lg text-[#f87171] hover:bg-[#ef4444]/10 transition-colors ml-auto"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

    </>
  )
}

// ── Card de Tarefa ────────────────────────────────────────────────────────────

function TaskCard({
  task,
  member,
  onEdit,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  task: TeamTask
  member?: TeamMember
  onEdit?: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  isDragging?: boolean
}) {
  const [open, setOpen] = useState(false)
  const st  = STATUS_CONFIG[task.status]   ?? STATUS_CONFIG.a_fazer
  const pri = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.media
  const overdue = isOverdue(task.due_date, task.status)

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-[#182233] rounded-xl border p-3 space-y-2 transition-all select-none ${
        onDragStart ? 'cursor-grab active:cursor-grabbing' : ''
      } ${
        isDragging
          ? 'border-[#2563EB] shadow-lg opacity-40 scale-95'
          : 'border-[#1e293b] hover:border-[#334155]'
      }`}
    >
      {/* Título + prioridade + editar */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-[#F8FAFC] leading-snug line-clamp-2">{task.title}</p>
          {task.clients && (
            <p className="text-[10.5px] text-[#94a3b8] mt-0.5 truncate">🏢 {task.clients.company_name}</p>
          )}
          {!task.clients && (
            <p className="text-[10.5px] text-[#94a3b8] mt-0.5">📌 Interno</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span
            className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ color: pri.color, backgroundColor: `${pri.color}26` }}
          >
            {pri.label}
          </span>
          {onEdit && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onEdit() }}
              title="Editar demanda"
              className="w-5 h-5 rounded flex items-center justify-center text-[#64748b] hover:text-[#a78bfa] hover:bg-[#8b5cf6]/15 transition-colors"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Status + prazo */}
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: st.color, backgroundColor: st.bg }}
        >
          {st.label}
        </span>
        {task.due_date && (
          <span className={`text-[10px] font-medium ml-auto ${overdue ? 'text-red-500' : 'text-[#94a3b8]'}`}>
            {overdue ? '⚠️ ' : '📅 '}{formatDate(task.due_date)}
          </span>
        )}
      </div>

      {/* Nota do colaborador */}
      {(task.collaborator_note || task.delivery_url) && (
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-[10.5px] text-violet-600 hover:text-[#a78bfa] w-full"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          Ver entrega do colaborador
        </button>
      )}
      {open && (
        <div className="bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 rounded-lg p-2 space-y-1 text-[11px]">
          {task.collaborator_note && (
            <p className="text-[#c4b5fd]">📝 {task.collaborator_note}</p>
          )}
          {task.delivery_url && (
            <a
              href={task.delivery_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[#a78bfa] underline hover:text-[#c4b5fd]"
            >
              <ExternalLink className="w-3 h-3" /> Ver entrega
            </a>
          )}
        </div>
      )}

      {/* Membro responsável (mostrado no board por status) */}
      {member && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-[#1e293b]">
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: member.color }}
          >
            {member.name[0].toUpperCase()}
          </div>
          <span className="text-[10px] text-[#94a3b8] truncate">{member.name}</span>
        </div>
      )}
    </div>
  )
}

// ── Modal de edição de tarefa no board ───────────────────────────────────────

function BoardTaskEditModal({
  task,
  clients,
  onClose,
  onSaved,
}: {
  task: TeamTask
  clients: { id: string; company_name: string }[]
  onClose: () => void
  onSaved: (updates: Record<string, unknown>) => Promise<void>
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-bold text-[#F8FAFC]">Editar demanda</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-[#f1f5f9] flex items-center justify-center"
          >
            <X className="w-4 h-4 text-[#94a3b8]" />
          </button>
        </div>
        <TaskEditPanel
          task={task}
          clients={clients}
          onSave={onSaved}
          onCancel={onClose}
        />
      </motion.div>
    </div>
  )
}

// ── Board ─────────────────────────────────────────────────────────────────────

type BoardView = 'responsavel' | 'status'

function Board({ tasks, members, clients, filteredMemberId }: {
  tasks: TeamTask[]
  members: TeamMember[]
  clients: { id: string; company_name: string }[]
  filteredMemberId: string | null
}) {
  const { toast } = useToast()
  const [view, setView] = useState<BoardView>('responsavel')
  const [dragTaskId,       setDragTaskId]       = useState<string | null>(null)
  const [dragOverMemberId, setDragOverMemberId] = useState<string | null>(null)
  const [editingTask,      setEditingTask]      = useState<TeamTask | null>(null)
  const delegateTask = useDelegateTask()
  const updateTask   = useUpdateTask()

  const filteredTasks = filteredMemberId
    ? tasks.filter(t => t.assignee_id === filteredMemberId)
    : tasks

  const memberMap = useMemo(() =>
    Object.fromEntries(members.map(m => [m.id, m])), [members])

  // ── Drag-and-drop: mudar responsável ─────────────────────────────────────
  const handleDrop = async (targetMemberId: string) => {
    if (!dragTaskId) return
    const task   = tasks.find(t => t.id === dragTaskId)
    const target = members.find(m => m.id === targetMemberId)
    if (!task || task.assignee_id === targetMemberId) {
      setDragTaskId(null); setDragOverMemberId(null); return
    }
    try {
      // Passa assignee_id (FK) + assignee (nome em texto) — ambos os campos
      // precisam ser atualizados para a aba Tarefas refletir o novo responsável
      await delegateTask.mutateAsync({
        task_id:     dragTaskId,
        assignee_id: targetMemberId,
        assignee:    target?.name ?? null,
      })
      toast(`Demanda transferida para ${target?.name ?? 'membro'}`, 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setDragTaskId(null); setDragOverMemberId(null)
    }
  }

  // ── Edição a partir do board ──────────────────────────────────────────────
  const handleSaveEdit = async (updates: Record<string, unknown>) => {
    if (!editingTask) return
    await (updateTask.mutateAsync as any)({ id: editingTask.id, ...updates })
    toast('Tarefa atualizada!', 'success')
    setEditingTask(null)
  }

  // ── View por responsável ──────────────────────────────────────────────────
  if (view === 'responsavel') {
    const visibleMembers = filteredMemberId
      ? members.filter(m => m.id === filteredMemberId)
      : members

    return (
      <div>
        <ViewTabs view={view} onChange={setView} />
        <div className="flex gap-4 overflow-x-auto pb-4">
          {visibleMembers.map(member => {
            const memberTasks = filteredTasks.filter(t => t.assignee_id === member.id)
            const isDragOver  = dragOverMemberId === member.id && !!dragTaskId

            return (
              <div
                key={member.id}
                className="flex-shrink-0 w-72"
                onDragOver={e => { e.preventDefault(); setDragOverMemberId(member.id) }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverMemberId(null)
                  }
                }}
                onDrop={() => handleDrop(member.id)}
              >
                {/* Cabeçalho da coluna */}
                <div className={`flex items-center gap-2 mb-3 px-2 py-1.5 rounded-xl transition-colors ${
                  isDragOver ? 'bg-[#2563EB]/10 ring-2 ring-[#2563EB]/30' : ''
                }`}>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[#F8FAFC] truncate">{member.name}</p>
                    {member.role && (
                      <p className="text-[10px] truncate" style={{ color: 'var(--sm-text-3)' }}>{member.role}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-[#94a3b8] flex-shrink-0">
                    {memberTasks.length} tarefa{memberTasks.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Zona de drop */}
                <div className={`space-y-2 min-h-[80px] rounded-xl p-1 transition-colors ${
                  isDragOver ? 'bg-[#2563EB]/5' : ''
                }`}>
                  {memberTasks.length === 0 ? (
                    <p className={`text-[11px] text-center py-8 border-2 border-dashed rounded-xl transition-colors ${
                      isDragOver
                        ? 'border-[#2563EB]/50 text-[#60A5FA] bg-[#182233]'
                        : 'border-[#1e293b] text-[#64748b]'
                    }`}>
                      {isDragOver ? '↓ Soltar aqui' : 'Sem tarefas'}
                    </p>
                  ) : (
                    memberTasks.map(t => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        onEdit={() => setEditingTask(t)}
                        onDragStart={e => {
                          e.dataTransfer.effectAllowed = 'move'
                          setDragTaskId(t.id)
                        }}
                        onDragEnd={() => {
                          setDragTaskId(null)
                          setDragOverMemberId(null)
                        }}
                        isDragging={dragTaskId === t.id}
                      />
                    ))
                  )}
                  {/* Drop target quando a coluna já tem tarefas */}
                  {isDragOver && memberTasks.length > 0 && (
                    <div className="h-1.5 rounded-full bg-[#2563EB] mx-1 animate-pulse" />
                  )}
                </div>
              </div>
            )
          })}
          {visibleMembers.length === 0 && (
            <p className="text-[13px] text-[#94a3b8]">Nenhum membro encontrado</p>
          )}
        </div>

        <AnimatePresence>
          {editingTask && (
            <BoardTaskEditModal
              task={editingTask}
              clients={clients}
              onClose={() => setEditingTask(null)}
              onSaved={handleSaveEdit}
            />
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ── View por status ───────────────────────────────────────────────────────
  const statuses = ['a_fazer', 'em_andamento', 'revisao', 'concluido']
  return (
    <div>
      <ViewTabs view={view} onChange={setView} />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {statuses.map(status => {
          const st      = STATUS_CONFIG[status]
          const stTasks = filteredTasks.filter(t => t.status === status)
          return (
            <div key={status} className="flex-shrink-0 w-64">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }} />
                <span className="text-[12px] font-semibold text-[#F8FAFC]">{st.label}</span>
                <span className="ml-auto text-[10px] text-[#94a3b8]">{stTasks.length}</span>
              </div>
              <div className="space-y-2">
                {stTasks.length === 0
                  ? <p className="text-[11px] text-[#64748b] text-center py-6 border border-dashed border-[#1e293b] rounded-xl">Vazio</p>
                  : stTasks.map(t => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        member={memberMap[t.assignee_id ?? '']}
                        onEdit={() => setEditingTask(t)}
                      />
                    ))}
              </div>
            </div>
          )
        })}
      </div>

      <AnimatePresence>
        {editingTask && (
          <BoardTaskEditModal
            task={editingTask}
            clients={clients}
            onClose={() => setEditingTask(null)}
            onSaved={handleSaveEdit}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ViewTabs({ view, onChange }: { view: BoardView; onChange: (v: BoardView) => void }) {
  return (
    <div className="flex gap-1 bg-[#182233] border border-[#1e293b] p-1 rounded-xl w-fit mb-4">
      {([['responsavel', 'Por responsável'], ['status', 'Por status']] as const).map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
            view === v ? 'bg-[#1e293b] text-[color:var(--sm-text-1)] border border-[#334155]' : 'text-[#94a3b8] hover:text-[color:var(--sm-text-1)]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Carga de trabalho ─────────────────────────────────────────────────────────
// Escala absoluta 0–10:  0-3 = Tranquilo | 4-6 = Atenção | 7+ = Sobrecarregado

function getWorkloadLevel(count: number): { color: string; bg: string; label: string } {
  if (count <= 3) return { color: '#10b981', bg: '#d1fae5', label: 'Tranquilo'      }
  if (count <= 6) return { color: '#f59e0b', bg: '#fef3c7', label: 'Atenção'        }
  return             { color: '#ef4444', bg: '#fee2e2', label: 'Sobrecarregado'  }
}

function WorkloadBar({ member, count }: { member: TeamMember; count: number }) {
  // Barra baseada em escala fixa de 10 tarefas (máximo visual)
  const pct   = Math.min(Math.round((count / 10) * 100), 100)
  const level = getWorkloadLevel(count)

  return (
    <div className="flex items-center gap-3">
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
        style={{ backgroundColor: member.color }}
      >
        {member.name[0].toUpperCase()}
      </div>

      {/* Nome */}
      <span className="text-[12px] font-medium text-[#F8FAFC] w-32 truncate flex-shrink-0">{member.name}</span>

      {/* Barra */}
      <div className="flex-1 h-2.5 rounded-full bg-[#1e293b] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: level.color }}
        />
      </div>

      {/* Contagem */}
      <span className="text-[11px] text-[#64748b] w-14 text-right flex-shrink-0">
        {count} tarefa{count !== 1 ? 's' : ''}
      </span>

      {/* Badge de nível */}
      <span
        className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 w-28 text-center"
        style={{ color: level.color, backgroundColor: level.bg }}
      >
        {level.label}
      </span>
    </div>
  )
}

// ── Confirmação de exclusão ───────────────────────────────────────────────────

function DeleteConfirm({ name, onConfirm, onCancel }: {
  name: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#F8FAFC]">Remover membro?</p>
            <p className="text-[12px] text-[#64748b] mt-1">
              <strong>{name}</strong> será removido da equipe. As tarefas delegadas continuarão existindo, mas sem responsável.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 h-9 rounded-lg bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600">
            Remover
          </button>
          <button onClick={onCancel} className="flex-1 h-9 rounded-lg border border-[#1e293b] text-[13px] text-[#475569] hover:bg-[#f8fafc]">
            Cancelar
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

type ActiveTab = 'membros' | 'board' | 'carga' | 'socios'

export function TeamPage() {
  const { toast } = useToast()
  const { data: members = [], isLoading: loadingMembers } = useTeamMembers()
  const { data: tasks   = [], isLoading: loadingTasks   } = useTeamTasks()
  const { data: clients = [] } = useClients()
  const deleteMember = useDeleteTeamMember()
  const { data: subData } = useSubscription()

  const maxTeamMembers  = subData?.plan.maxTeamMembers ?? 1
  // Dono e sócios (kind owner/partner) são responsáveis automáticos criados
  // pelo banco (migration 089): não contam no limite nem viram cartão aqui.
  const activeMembers   = members.filter(m => m.is_active && m.kind === 'collaborator').length
  const teamLimitReached = maxTeamMembers !== -1 && activeMembers >= maxTeamMembers

  const [tab,              setTab]         = useState<ActiveTab>('membros')
  const [showModal,        setShowModal]   = useState(false)
  const [editingMember,    setEditing]     = useState<TeamMember | undefined>()
  const [deletingMember,   setDeleting]    = useState<TeamMember | undefined>()
  const [filteredMemberId, setFiltered]    = useState<string | null>(null)
  const [newTaskMember,    setNewTaskMember] = useState<TeamMember | undefined>()
  const [detailMember,     setDetailMember] = useState<TeamMember | undefined>()

  const activeMembersWithCount = useMemo(() =>
    members
      .filter(m => m.is_active)
      .map(m => ({
        member: m,
        count:  tasks.filter(t => t.assignee_id === m.id).length,
      })),
    [members, tasks]
  )

  const maxCount = Math.max(...activeMembersWithCount.map(m => m.count), 1)

  const handleDelete = async () => {
    if (!deletingMember) return
    try {
      await deleteMember.mutateAsync(deletingMember.id)
      toast(`${deletingMember.name} removido da equipe`, 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setDeleting(undefined)
    }
  }

  const openEdit = (m: TeamMember) => { setEditing(m); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditing(undefined) }

  const [memberSearch, setMemberSearch] = useState('')
  const visibleMembers = activeMembersWithCount.filter(({ member }) =>
    member.kind === 'collaborator' &&
    member.name.toLowerCase().includes(memberSearch.trim().toLowerCase())
  )

  return (
    <div className="min-h-full bg-[#0B1020]">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

        {/* Tabs + Novo membro */}
        <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-[#182233] p-1 rounded-xl w-fit max-w-full overflow-x-auto border border-[#1e293b]">
          {/* short: rótulo do celular, para as três abas caberem na largura */}
          {([
            ['membros', Users,         'Membros',           'Membros'],
            ['board',   ClipboardList, 'Board de tarefas',  'Board'],
            ['carga',   AlertCircle,   'Carga de trabalho', 'Carga'],
            ['socios',  ShieldCheck,   'Sócios',            'Sócios'],
          ] as const).map(([t, Icon, label, short]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all ${
                tab === t ? 'bg-[#1e293b] text-[color:var(--sm-text-1)] border border-[#334155]' : 'text-[#94a3b8] hover:text-[color:var(--sm-text-1)] border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${tab === t ? 'text-[#60A5FA]' : ''}`} />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

          {tab !== 'socios' && <button
            onClick={() => {
              if (teamLimitReached) {
                toast(`Limite do plano atingido (${maxTeamMembers} membro${maxTeamMembers === 1 ? '' : 's'}). Faça upgrade para adicionar mais.`, 'error')
                return
              }
              setEditing(undefined); setShowModal(true)
            }}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-colors flex-shrink-0 ml-auto ${
              teamLimitReached
                ? 'bg-[#182233] text-[#475569] cursor-not-allowed border border-[#1e293b]'
                : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-lg shadow-[#2563EB]/20'
            }`}
            title={teamLimitReached ? `Limite de ${maxTeamMembers} membro(s) do plano atingido` : undefined}
          >
            <UserPlus className="w-4 h-4" /> Novo membro
            {teamLimitReached && <span className="text-[10px] ml-1 opacity-70">({activeMembers}/{maxTeamMembers})</span>}
          </button>}
        </div>

        {/* ── Tab: Membros ── */}
        {tab === 'membros' && (
          <div className="space-y-5">
            {/* Busca + filtro */}
            <div className="flex items-center justify-end gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8] pointer-events-none" />
                <input
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Buscar membro..."
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#1e293b] bg-[#182233] text-[12px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:border-[#2563EB]/50"
                />
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#182233] border border-[#1e293b] flex items-center justify-center flex-shrink-0">
                <Filter className="w-3.5 h-3.5 text-[#94a3b8]" />
              </div>
            </div>

            {loadingMembers ? (
              <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#94a3b8]" /></div>
            ) : activeMembersWithCount.every(({ member }) => member.kind !== 'collaborator') ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Users className="w-10 h-10 text-[#CBD5E1]" />
                <p className="text-[14px] font-medium text-[#94a3b8]">Nenhum membro ainda</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-[13px] font-semibold hover:bg-[#1D4ED8] shadow-lg shadow-[#2563EB]/20"
                >
                  Adicionar primeiro membro
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 min-w-0">
                {visibleMembers.map(({ member, count }) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    taskCount={count}
                    onEdit={() => openEdit(member)}
                    onDelete={() => setDeleting(member)}
                    onNewTask={() => setNewTaskMember(member)}
                    onOpenDetail={() => setDetailMember(member)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Board ── */}
        {tab === 'board' && (
          <div>
            {/* Filtro por membro */}
            {activeMembersWithCount.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-4">
                <button
                  onClick={() => setFiltered(null)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                    !filteredMemberId ? 'bg-[#2563EB] text-white' : 'bg-[#182233] text-[#94a3b8] border border-[#1e293b] hover:border-[#334155]'
                  }`}
                >
                  Todos
                </button>
                {activeMembersWithCount.map(({ member }) => (
                  <button
                    key={member.id}
                    onClick={() => setFiltered(f => f === member.id ? null : member.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                      filteredMemberId === member.id
                        ? 'text-white'
                        : 'bg-[#182233] text-[#94a3b8] border border-[#1e293b] hover:border-[#334155]'
                    }`}
                    style={filteredMemberId === member.id ? { backgroundColor: member.color } : undefined}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: member.color }}
                    />
                    {member.name}
                  </button>
                ))}
              </div>
            )}

            {loadingTasks ? (
              <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#94a3b8]" /></div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <ClipboardList className="w-10 h-10 text-[#CBD5E1]" />
                <p className="text-[14px] font-medium text-[#94a3b8]">Nenhuma tarefa delegada</p>
                <p className="text-[12px] text-[#64748b]">Atribua um responsável nas tarefas para elas aparecerem aqui</p>
              </div>
            ) : (
              <Board
                tasks={tasks}
                members={members.filter(m => m.is_active)}
                clients={clients}
                filteredMemberId={filteredMemberId}
              />
            )}
          </div>
        )}

        {/* ── Tab: Sócios ── */}
        {tab === 'socios' && <PartnersPanel />}

        {/* ── Tab: Carga ── */}
        {tab === 'carga' && (
          <div className="bg-[#111827] rounded-2xl border border-[#1e293b] p-6">
            <h3 className="text-[14px] font-bold text-[#F8FAFC] mb-4">Carga de trabalho da equipe</h3>
            {activeMembersWithCount.length === 0 ? (
              <p className="text-[13px] text-[#64748b] text-center py-8">Nenhum membro cadastrado</p>
            ) : (
              <div className="space-y-4">
                {activeMembersWithCount
                  .sort((a, b) => b.count - a.count)
                  .map(({ member, count }) => (
                    <WorkloadBar key={member.id} member={member} count={count} />
                  ))}
                <div className="pt-4 border-t border-[#1e293b] flex gap-6 text-[11px] text-[#94a3b8]">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Tranquilo</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />Atenção</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />Sobrecarregado</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modais */}
      <AnimatePresence>
        {showModal && <MemberModal member={editingMember} onClose={closeModal} />}
        {deletingMember && (
          <DeleteConfirm
            name={deletingMember.name}
            onConfirm={handleDelete}
            onCancel={() => setDeleting(undefined)}
          />
        )}
        {newTaskMember && (
          <NewTaskModal
            member={newTaskMember}
            clients={clients}
            onClose={() => setNewTaskMember(undefined)}
          />
        )}
        {detailMember && (
          <MemberDetailModal
            member={detailMember}
            allTasks={tasks}
            clients={clients}
            onClose={() => setDetailMember(undefined)}
            onNewTask={() => { setDetailMember(undefined); setNewTaskMember(detailMember) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
