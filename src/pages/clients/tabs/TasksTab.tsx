import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, CalendarDays, Clock, User, X, AlertCircle, ExternalLink, Link2, FileText, Folder, ListChecks, ChevronDown, type LucideIcon } from 'lucide-react'
import type { TaskLink } from '@/types'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import { ApplyTemplateModal } from '@/components/tasks/ApplyTemplateModal'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { formatDate, isOverdue } from '@/utils/formatters'
import type { Task, TaskStatus, TaskPriority } from '@/types'

// ─── Configs ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  a_fazer:      { label: 'A fazer',      bg: 'bg-[#f0f0f0]',  text: 'text-[#737373]',   dot: 'bg-[#c0c0c0]'   },
  em_andamento: { label: 'Em andamento', bg: 'bg-blue-50',    text: 'text-blue-900',    dot: 'bg-blue-400'    },
  revisao:      { label: 'Revisão',      bg: 'bg-amber-50',   text: 'text-amber-900',   dot: 'bg-amber-400'   },
  concluido:    { label: 'Concluído',    bg: 'bg-emerald-50', text: 'text-emerald-900', dot: 'bg-emerald-400' },
}

const PRIORITY_CFG: Record<TaskPriority, { label: string; bg: string; text: string }> = {
  baixa:   { label: 'Baixa',   bg: 'bg-[#f0f0f0]', text: 'text-[#737373]' },
  media:   { label: 'Média',   bg: 'bg-blue-50',   text: 'text-blue-800'  },
  alta:    { label: 'Alta',    bg: 'bg-amber-50',  text: 'text-amber-800' },
  urgente: { label: 'Urgente', bg: 'bg-red-50',    text: 'text-red-800'   },
}

// ─── Status pill com dropdown inline ─────────────────────────────────────────

function StatusPill({ status, onChange }: { status: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CFG[status]
  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${cfg.bg} ${cfg.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        {cfg.label}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); setOpen(false) }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 top-full mt-1 z-40 bg-white border border-[#e2e8f0] rounded-xl shadow-lg overflow-hidden py-1 min-w-[150px]"
              onClick={e => e.stopPropagation()}
            >
              {(Object.entries(STATUS_CFG) as [TaskStatus, typeof STATUS_CFG[TaskStatus]][]).map(([s, c]) => (
                <button
                  key={s}
                  onClick={e => { e.stopPropagation(); onChange(s); setOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#f5f7fb] transition-colors flex items-center gap-2 ${s === status ? 'font-semibold' : ''}`}
                >
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  {c.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Formulário de tarefa ─────────────────────────────────────────────────────

const blankForm = {
  title:       '',
  description: '',
  due_date:    '',
  due_time:    '',
  priority:    'media'  as TaskPriority,
  status:      'a_fazer' as TaskStatus,
  assignee:    '',
  assignee_id: null as string | null,
}

type TaskForm = typeof blankForm

function TaskDialog({
  open, onClose, editingTask, clientId, members, onCreate, onUpdate,
}: {
  open:        boolean
  onClose:     () => void
  editingTask: Task | null
  clientId:    string
  members:     { id: string; name: string; color: string }[]
  onCreate:    (form: TaskForm) => Promise<void>
  onUpdate:    (id: string, form: TaskForm) => Promise<void>
}) {
  const [form, setForm] = useState<TaskForm>(blankForm)
  const [saving, setSaving] = useState(false)
  const isEdit = !!editingTask

  const set = (k: keyof TaskForm, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (editingTask) {
      setForm({
        title:       editingTask.title,
        description: editingTask.description || '',
        due_date:    editingTask.due_date    || '',
        due_time:    editingTask.due_time    || '',
        priority:    editingTask.priority,
        status:      editingTask.status,
        assignee:    editingTask.assignee    || '',
        assignee_id: (editingTask as any).assignee_id || null,
      })
    } else {
      setForm(blankForm)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingTask?.id])

  const handleClose = () => { onClose(); setForm(blankForm) }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      if (isEdit && editingTask) await onUpdate(editingTask.id, form)
      else await onCreate(form)
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          <Input
            label="Título *"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Descrição da tarefa..."
          />

          <Textarea
            label="Descrição"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={2}
            placeholder="Detalhes opcionais..."
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">Prioridade</label>
              <Select value={form.priority} onValueChange={v => set('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">Status</label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_fazer">A fazer</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="revisao">Revisão</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Data" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            <div>
              <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">Horário</label>
              <div className="relative">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748b] pointer-events-none z-10" />
                <input
                  type="time"
                  value={form.due_time}
                  onChange={e => set('due_time', e.target.value)}
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-[#1e293b] bg-[#182233] text-[13px] text-[#E2E8F0] focus:outline-none focus:border-[#2563EB]/50 focus:ring-2 focus:ring-[#2563EB]/20 [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">Responsável</label>
            <Select
              value={form.assignee_id || '__none__'}
              onValueChange={v => {
                if (v === '__none__') { set('assignee_id', null); set('assignee', '') }
                else { const m = members.find(m => m.id === v); set('assignee_id', v); set('assignee', m?.name || '') }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Agência" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Agência</SelectItem>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                      {m.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving || !form.title.trim()}>
            {saving ? (isEdit ? 'Salvando...' : 'Criando...') : (isEdit ? 'Salvar alterações' : 'Criar tarefa')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Modal de visualização da tarefa ─────────────────────────────────────────

function TaskViewModal({
  task, members, open, onClose, onEdit, onDelete, onStatusChange,
}: {
  task:    Task | null
  members: { id: string; name: string; color: string }[]
  open:    boolean
  onClose: () => void
  onEdit:  (t: Task) => void
  onDelete:(id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
}) {
  if (!task) return null

  const pCfg   = PRIORITY_CFG[task.priority]
  const sCfg   = STATUS_CFG[task.status]
  const member = members.find(m => m.id === (task as any).assignee_id)
  const overdue = isOverdue(task.due_date) && task.status !== 'concluido'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <DialogTitle className="text-[16px] font-semibold text-[#0f0f0f] leading-snug">
              {task.title}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-1 overflow-y-auto max-h-[60vh] pr-1">
          {/* Badges: prioridade + status */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${pCfg.bg} ${pCfg.text}`}>
              {task.priority === 'urgente' && <AlertCircle className="w-3 h-3" />}
              {pCfg.label}
            </span>
            <div className="relative inline-flex items-center">
              <select
                value={task.status}
                onChange={e => { const next = e.target.value as TaskStatus; if (next !== task.status) onStatusChange(task.id, next) }}
                title="Mudar status"
                className={`appearance-none cursor-pointer rounded-full border border-black/10 pl-2.5 pr-7 py-1 text-[11px] font-medium outline-none transition-colors ${sCfg.bg} ${sCfg.text}`}
              >
                {(Object.entries(STATUS_CFG) as [TaskStatus, typeof STATUS_CFG[TaskStatus]][]).map(([s, c]) => (
                  <option key={s} value={s} className="bg-[#0d0f14] text-[#F8FAFC]">{c.label}</option>
                ))}
              </select>
              <ChevronDown className={`w-3 h-3 absolute right-1.5 pointer-events-none ${sCfg.text}`} />
            </div>
            {overdue && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
                ⚠ Atrasada
              </span>
            )}
          </div>

          {/* Descrição */}
          {task.description && (
            <div className="bg-[#f8fafc] rounded-xl p-3.5 border border-[#e8e8e8]">
              <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-1.5">Descrição</p>
              <p className="text-[13px] text-[#374151] leading-relaxed whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Grid de detalhes */}
          <div className="grid grid-cols-2 gap-3">
            {/* Data e hora */}
            <div className="bg-[#f8fafc] rounded-xl p-3 border border-[#e8e8e8]">
              <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Prazo
              </p>
              {task.due_date ? (
                <>
                  <p className={`text-[13px] font-medium ${overdue ? 'text-red-600' : 'text-[#0f0f0f]'}`}>
                    {format(new Date(task.due_date + 'T00:00:00'), "d 'de' MMMM yyyy", { locale: ptBR })}
                  </p>
                  {task.due_time && (
                    <p className="text-[12px] text-[#64748b] mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {task.due_time.slice(0, 5)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-[#94a3b8]">Sem prazo</p>
              )}
            </div>

            {/* Responsável */}
            <div className="bg-[#f8fafc] rounded-xl p-3 border border-[#e8e8e8]">
              <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <User className="w-3 h-3" /> Responsável
              </p>
              {member ? (
                <div className="flex items-center gap-2">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-[13px] font-medium text-[#0f0f0f]">{member.name}</span>
                </div>
              ) : task.assignee ? (
                <p className="text-[13px] text-[#374151]">{task.assignee}</p>
              ) : (
                <p className="text-[13px] text-[#94a3b8]">Agência</p>
              )}
            </div>
          </div>

          {/* Referências e materiais (task_links) */}
          {Array.isArray(task.task_links) && task.task_links.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">
                Referências e materiais ({task.task_links.length})
              </p>
              <div className="space-y-2">
                {task.task_links.map((link: TaskLink) => {
                  if (link.type === 'imagem') {
                    return (
                      <div key={link.id} className="rounded-xl overflow-hidden border border-[#e2e8f0]">
                        <img
                          src={link.url}
                          alt={link.label}
                          className="w-full max-h-64 object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <div className="flex items-center justify-between px-3 py-2 bg-white">
                          <span className="text-[11px] font-medium text-[#334155] truncate flex-1">{link.label}</span>
                          <a href={link.url} target="_blank" rel="noopener noreferrer"
                            className="text-[#94a3b8] hover:text-[#0f0f0f] ml-2 flex-shrink-0">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    )
                  }

                  if (link.type === 'video') {
                    return (
                      <div key={link.id} className="rounded-xl overflow-hidden border border-[#e2e8f0]">
                        <video
                          src={link.url}
                          controls
                          className="w-full max-h-64 bg-black"
                          preload="metadata"
                        />
                        <div className="flex items-center justify-between px-3 py-2 bg-white">
                          <span className="text-[11px] font-medium text-[#334155] truncate flex-1">{link.label}</span>
                          <a href={link.url} target="_blank" rel="noopener noreferrer"
                            className="text-[#94a3b8] hover:text-[#0f0f0f] ml-2 flex-shrink-0">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    )
                  }

                  const iconMap: Record<string, LucideIcon> = {
                    link:    Link2,
                    arquivo: FileText,
                    pasta:   Folder,
                  }
                  const Icon = iconMap[link.type] ?? Link2
                  const colorMap: Record<string, string> = {
                    link:    'text-blue-800 bg-blue-50',
                    arquivo: 'text-amber-800 bg-amber-50',
                    pasta:   'text-emerald-800 bg-emerald-50',
                  }
                  const colorCls = colorMap[link.type] ?? 'text-blue-800 bg-blue-50'

                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl border border-[#e2e8f0] hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorCls}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-[#334155] truncate group-hover:text-blue-700">{link.label}</p>
                        <p className="text-[10px] text-[#94a3b8] truncate">{link.url}</p>
                      </div>
                      <ExternalLink className="w-3 h-3 text-[#c0c0c0] group-hover:text-blue-400 flex-shrink-0" />
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Entrega do colaborador */}
          {(task.collaborator_note || task.delivery_url) && (
            <div className="bg-violet-50 rounded-xl p-3.5 border border-violet-100 space-y-1.5">
              <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider">Entrega do colaborador</p>
              {task.collaborator_note && (
                <p className="text-[12px] text-violet-800 leading-relaxed">📝 {task.collaborator_note}</p>
              )}
              {task.delivery_url && (
                <a
                  href={task.delivery_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-violet-600 hover:text-violet-800 font-medium"
                >
                  <ExternalLink className="w-3 h-3" /> Ver entrega enviada
                </a>
              )}
            </div>
          )}

          {/* Data de criação */}
          <p className="text-[11px] text-[#94a3b8]">
            Criada em {format(new Date(task.created_at), "d 'de' MMMM yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>

        <DialogFooter className="gap-2 border-t border-[#f1f5f9] pt-3">
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
            onClick={() => { onClose(); onDelete(task.id) }}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          <Button size="sm" onClick={() => { onClose(); onEdit(task) }}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── TasksTab ─────────────────────────────────────────────────────────────────

export function TasksTab({ clientId }: { clientId: string }) {
  const { user, agencyId }                         = useAuth()
  const { data: tasks = [] }             = useTasks(clientId)
  const { data: allMembers = [] }        = useTeamMembers()
  const activeMembers                    = allMembers.filter(m => m.is_active)
  const createTask                       = useCreateTask()
  const updateTask                       = useUpdateTask()
  const deleteTask                       = useDeleteTask()
  const { toast }                        = useToast()

  const [dialogOpen, setDialogOpen]     = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [editingTask, setEditingTask]   = useState<Task | null>(null)
  const [viewingTask, setViewingTask]   = useState<Task | null>(null)
  const [deletingId, setDeletingId]     = useState<string | null>(null)

  const handleEdit = (task: Task) => { setEditingTask(task); setDialogOpen(true) }
  const handleNew  = () => { setEditingTask(null); setDialogOpen(true) }
  const handleView = (task: Task) => { setViewingTask(task) }

  const handleDelete = async (taskId: string) => {
    try {
      await deleteTask.mutateAsync(taskId)
      toast('Tarefa excluída.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleCreate = async (form: TaskForm) => {
    if (!form.title.trim() || !user) return
    try {
      await (createTask.mutateAsync as any)({
        user_id:     agencyId!,
        title:       form.title.trim(),
        description: form.description || null,
        due_date:    form.due_date    || null,
        due_time:    form.due_time    || null,
        priority:    form.priority,
        status:      form.status,
        assignee:    form.assignee    || null,
        assignee_id: form.assignee_id || null,
        client_id:   clientId,
      })
      toast('Tarefa criada!', 'success')
    } catch (err: any) { toast(err.message, 'error'); throw err }
  }

  const handleUpdate = async (taskId: string, form: TaskForm) => {
    try {
      await updateTask.mutateAsync({
        id:          taskId,
        title:       form.title.trim(),
        description: form.description || null,
        due_date:    form.due_date    || null,
        due_time:    form.due_time    || null,
        priority:    form.priority,
        status:      form.status,
        assignee:    form.assignee    || null,
        ...(form.assignee_id !== undefined && { assignee_id: form.assignee_id } as any),
        client_id:   clientId,
      })
      toast('Tarefa atualizada!', 'success')
    } catch (err: any) { toast(err.message, 'error'); throw err }
  }

  const handleStatusChange = async (task: Task, status: TaskStatus) => {
    try {
      await updateTask.mutateAsync({ id: task.id, status })
    } catch (err: any) { toast(err.message, 'error') }
  }

  return (
    <div className="space-y-3">
      {/* Header da aba */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[#94a3b8]">
          {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTemplateOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium border border-[#1e293b] bg-[#111827] text-[#CBD5E1] hover:border-[#334155] transition-colors"
          >
            <ListChecks className="w-3.5 h-3.5" /> Usar modelo
          </button>
          <button
            onClick={handleNew}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova tarefa
          </button>
        </div>
      </div>

      {/* Lista */}
      <AnimatePresence>
        {tasks.map((task, i) => {
          const pCfg    = PRIORITY_CFG[task.priority]
          const overdue = isOverdue(task.due_date) && task.status !== 'concluido'
          const member  = activeMembers.find(m => m.id === (task as any).assignee_id)
          const isConfirming = deletingId === task.id

          return (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
              transition={{ delay: i * 0.03, duration: 0.18 }}
              onClick={() => !isConfirming && handleView(task)}
              className={`bg-white rounded-xl border transition-all hover:shadow-md cursor-pointer group ${
                overdue ? 'border-red-200 border-l-[3px] border-l-red-400' : 'border-[#e8e8e8]'
              }`}
            >
              <div className="p-3.5 flex items-start gap-3">
                {/* Conteúdo principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className={`text-[13px] font-medium leading-snug ${task.status === 'concluido' ? 'line-through text-[#9ca3af]' : 'text-[#0f0f0f]'}`}>
                      {task.title}
                    </p>
                    {/* Badge prioridade */}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pCfg.bg} ${pCfg.text}`}>
                      {pCfg.label}
                    </span>
                  </div>

                  {task.description && (
                    <p className="text-[11px] text-[#9ca3af] mb-2 leading-relaxed line-clamp-2">{task.description}</p>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Status — stop propagation para não abrir modal de view */}
                    <div onClick={e => e.stopPropagation()}>
                      <StatusPill
                        status={task.status}
                        onChange={s => handleStatusChange(task, s)}
                      />
                    </div>

                    {/* Data */}
                    {task.due_date && (
                      <span className={`inline-flex items-center gap-1 text-[11px] ${overdue ? 'text-red-500 font-medium' : 'text-[#94a3b8]'}`}>
                        <CalendarDays className="w-3 h-3" />
                        {formatDate(task.due_date)}
                        {task.due_time && <span className="ml-0.5">· {task.due_time.slice(0, 5)}</span>}
                        {overdue && <span className="text-[10px]">(atrasada)</span>}
                      </span>
                    )}

                    {/* Responsável */}
                    {(task.assignee || member) && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#94a3b8]">
                        {member ? (
                          <>
                            <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
                              style={{ backgroundColor: member.color }}>
                              {member.name.charAt(0).toUpperCase()}
                            </span>
                            {member.name}
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3" />
                            {task.assignee}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div
                  className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => e.stopPropagation()}
                >
                  {isConfirming ? (
                    <>
                      <span className="text-[11px] text-[#9ca3af] mr-1">Excluir?</span>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="px-2 py-1 rounded-lg text-[11px] text-[#64748b] hover:bg-[#f1f5f9] transition-colors"
                      >
                        Não
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="px-2 py-1 rounded-lg text-[11px] text-red-600 hover:bg-red-50 font-medium transition-colors"
                      >
                        Sim
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(task)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-[#0f0f0f] hover:bg-[#f1f5f9] transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingId(task.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="text-center py-12 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#f1f5f9] flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-[#94a3b8]" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-[#374151]">Nenhuma tarefa ainda</p>
            <p className="text-[12px] text-[#9ca3af] mt-0.5">Crie a primeira tarefa para este cliente</p>
          </div>
          <button
            onClick={handleNew}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova tarefa
          </button>
        </div>
      )}

      {/* Modal de visualização */}
      <TaskViewModal
        task={viewingTask}
        members={activeMembers}
        open={!!viewingTask}
        onClose={() => setViewingTask(null)}
        onStatusChange={(id, s) => {
          const t = tasks.find(x => x.id === id)
          if (t) handleStatusChange(t, s)
          setViewingTask(prev => (prev && prev.id === id ? { ...prev, status: s } : prev))
        }}
        onEdit={task => { setViewingTask(null); handleEdit(task) }}
        onDelete={taskId => { setViewingTask(null); setDeletingId(taskId) }}
      />

      {/* Dialog criar / editar */}
      <TaskDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingTask(null) }}
        editingTask={editingTask}
        clientId={clientId}
        members={activeMembers}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
      />

      {/* Aplicar modelo de tarefas */}
      <ApplyTemplateModal
        clientId={clientId}
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
      />
    </div>
  )
}
