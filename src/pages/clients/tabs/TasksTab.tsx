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

import { TabHeader, PrimaryButton, GhostButton, EmptyState, DotLabel, cardStyle, inputStyle } from './tabUi'

// ─── Configs ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<TaskStatus, { label: string; color: string }> = {
  a_fazer:      { label: 'A fazer',      color: '#94A3B8' },
  em_andamento: { label: 'Em andamento', color: '#2563EB' },
  revisao:      { label: 'Revisão',      color: '#F59E0B' },
  concluido:    { label: 'Concluído',    color: '#10B981' },
}

const PRIORITY_CFG: Record<TaskPriority, { label: string; color: string }> = {
  baixa:   { label: 'Baixa',   color: '#94A3B8' },
  media:   { label: 'Média',   color: '#2563EB' },
  alta:    { label: 'Alta',    color: '#F59E0B' },
  urgente: { label: 'Urgente', color: '#EF4444' },
}

const labelCls = 'block text-[10.5px] font-semibold mb-1.5 uppercase tracking-[0.08em] text-[color:var(--sm-text-4)]'
const boxStyle = { background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' } as const

// ─── Status (ponto + texto) com dropdown inline ──────────────────────────────

function StatusPill({ status, onChange }: { status: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CFG[status]
  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="inline-flex items-center gap-1.5 h-6 pl-2 pr-1.5 -ml-2 rounded-md text-[11.5px] font-medium hover:bg-black/5 transition-colors"
        style={{ color: 'var(--sm-text-2)' }}
        title="Mudar status"
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
        {cfg.label}
        <ChevronDown className="w-3 h-3" style={{ color: 'var(--sm-text-4)' }} />
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
              className="absolute left-0 top-full mt-1 z-40 border rounded-xl shadow-lg overflow-hidden p-1 min-w-[160px]"
              style={cardStyle}
              onClick={e => e.stopPropagation()}
            >
              {(Object.entries(STATUS_CFG) as [TaskStatus, typeof STATUS_CFG[TaskStatus]][]).map(([s, c]) => (
                <button
                  key={s}
                  onClick={e => { e.stopPropagation(); onChange(s); setOpen(false) }}
                  className={`w-full text-left px-2.5 h-8 rounded-lg text-[12.5px] hover:bg-black/5 transition-colors flex items-center gap-2 ${s === status ? 'font-semibold' : ''}`}
                  style={{ color: 'var(--sm-text-1)' }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
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
              <label className={labelCls}>Prioridade</label>
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
              <label className={labelCls}>Status</label>
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
              <label className={labelCls}>Horário</label>
              <div className="relative">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-[color:var(--sm-text-4)] z-10" />
                <input
                  type="time"
                  value={form.due_time}
                  onChange={e => set('due_time', e.target.value)}
                  className="w-full h-9 pl-8 pr-3 rounded-lg border text-[13px] focus:outline-none focus:border-[#2563EB]/50 focus:ring-2 focus:ring-[#2563EB]/20 [color-scheme:light_dark]" style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Responsável</label>
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
  const member = members.find(m => m.id === (task as any).assignee_id)
  const overdue = isOverdue(task.due_date) && task.status !== 'concluido'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold leading-snug pr-6 text-[color:var(--sm-text-1)]">
            {task.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1 overflow-y-auto max-h-[60vh] pr-1">
          {/* Prioridade + status + atraso */}
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
            <DotLabel color={pCfg.color}>Prioridade {pCfg.label.toLowerCase()}</DotLabel>
            <StatusPill status={task.status}
              onChange={next => { if (next !== task.status) onStatusChange(task.id, next) }} />
            {overdue && <DotLabel color="#EF4444"><span style={{ color: '#EF4444' }}>Atrasada</span></DotLabel>}
          </div>

          {task.description && (
            <div className="rounded-xl p-3.5 border" style={boxStyle}>
              <p className={labelCls}>Descrição</p>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--sm-text-1)' }}>{task.description}</p>
            </div>
          )}

          <dl className="grid grid-cols-2 rounded-xl border overflow-hidden" style={boxStyle}>
            <div className="p-3">
              <dt className={`${labelCls} flex items-center gap-1`}><CalendarDays className="w-3 h-3" /> Prazo</dt>
              {task.due_date ? (
                <dd>
                  <p className="text-[13px] font-medium" style={{ color: overdue ? '#EF4444' : 'var(--sm-text-1)' }}>
                    {format(new Date(task.due_date + 'T00:00:00'), "d 'de' MMMM yyyy", { locale: ptBR })}
                  </p>
                  {task.due_time && (
                    <p className="text-[12px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--sm-text-3)' }}>
                      <Clock className="w-3 h-3" /> {task.due_time.slice(0, 5)}
                    </p>
                  )}
                </dd>
              ) : (
                <dd className="text-[13px]" style={{ color: 'var(--sm-text-4)' }}>Sem prazo</dd>
              )}
            </div>
            <div className="p-3 border-l" style={{ borderColor: 'var(--sm-border)' }}>
              <dt className={`${labelCls} flex items-center gap-1`}><User className="w-3 h-3" /> Responsável</dt>
              <dd>
                {member ? (
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: member.color }}>
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-[13px] font-medium" style={{ color: 'var(--sm-text-1)' }}>{member.name}</span>
                  </span>
                ) : (
                  <span className="text-[13px]" style={{ color: task.assignee ? 'var(--sm-text-1)' : 'var(--sm-text-4)' }}>
                    {task.assignee || 'Agência'}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {/* Referências e materiais (task_links) */}
          {Array.isArray(task.task_links) && task.task_links.length > 0 && (
            <div>
              <p className={`${labelCls} mb-2`}>Referências e materiais ({task.task_links.length})</p>
              <div className="space-y-2">
                {task.task_links.map((link: TaskLink) => {
                  const rodape = (
                    <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--sm-bg-card)' }}>
                      <span className="text-[11.5px] font-medium truncate flex-1" style={{ color: 'var(--sm-text-2)' }}>{link.label}</span>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="ml-2 flex-shrink-0 hover:opacity-70" style={{ color: 'var(--sm-text-4)' }}>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )
                  if (link.type === 'imagem') {
                    return (
                      <div key={link.id} className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--sm-border)' }}>
                        <img src={link.url} alt={link.label} className="w-full max-h-64 object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        {rodape}
                      </div>
                    )
                  }
                  if (link.type === 'video') {
                    return (
                      <div key={link.id} className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--sm-border)' }}>
                        <video src={link.url} controls className="w-full max-h-64 bg-black" preload="metadata" />
                        {rodape}
                      </div>
                    )
                  }

                  const iconMap: Record<string, LucideIcon> = { link: Link2, arquivo: FileText, pasta: Folder }
                  const Icon = iconMap[link.type] ?? Link2
                  return (
                    <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl border hover:border-[#2563EB]/50 transition-colors group"
                      style={{ borderColor: 'var(--sm-border)' }}>
                      <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-3)' }}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12.5px] font-medium truncate" style={{ color: 'var(--sm-text-1)' }}>{link.label}</span>
                        <span className="block text-[10.5px] truncate" style={{ color: 'var(--sm-text-4)' }}>{link.url}</span>
                      </span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} />
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Entrega do colaborador */}
          {(task.collaborator_note || task.delivery_url) && (
            <div className="relative rounded-xl p-3.5 pl-4 border space-y-1.5 overflow-hidden" style={boxStyle}>
              <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: '#8B5CF6' }} />
              <p className={labelCls}>Entrega do colaborador</p>
              {task.collaborator_note && (
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--sm-text-1)' }}>{task.collaborator_note}</p>
              )}
              {task.delivery_url && (
                <a href={task.delivery_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#2563EB' }}>
                  <ExternalLink className="w-3 h-3" /> Ver entrega enviada
                </a>
              )}
            </div>
          )}

          <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>
            Criada em {format(new Date(task.created_at), "d 'de' MMMM yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>

        <DialogFooter className="gap-2 border-t pt-3 border-[color:var(--sm-border)]">
          <Button variant="outline" size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
            onClick={() => { onClose(); onDelete(task.id) }}>
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

  const abertas    = tasks.filter(t => t.status !== 'concluido').length
  const atrasadas  = tasks.filter(t => t.status !== 'concluido' && isOverdue(t.due_date)).length

  return (
    <section>
      <TabHeader
        title="Tarefas"
        subtitle={tasks.length === 0
          ? 'Nada criado para este cliente ainda.'
          : <>
              {abertas} em aberto · {tasks.length - abertas} concluída{tasks.length - abertas !== 1 ? 's' : ''}
              {atrasadas > 0 && <span style={{ color: '#EF4444' }}> · {atrasadas} atrasada{atrasadas !== 1 ? 's' : ''}</span>}
            </>}
        actions={<>
          <GhostButton onClick={() => setTemplateOpen(true)}>
            <ListChecks className="w-3.5 h-3.5" /> Usar modelo
          </GhostButton>
          <PrimaryButton onClick={handleNew}>
            <Plus className="w-3.5 h-3.5" /> Nova tarefa
          </PrimaryButton>
        </>}
      />

      {tasks.length === 0 ? (
        <EmptyState Icon={CalendarDays} title="Nenhuma tarefa ainda" hint="Crie a primeira tarefa ou aplique um modelo pronto."
          action={<PrimaryButton onClick={handleNew}><Plus className="w-3.5 h-3.5" /> Nova tarefa</PrimaryButton>} />
      ) : (
        // Lista em uma só folha, separada por linhas finas. A barra de 3px à
        // esquerda mostra a prioridade (vermelha quando a tarefa está atrasada).
        <div className="rounded-2xl border overflow-hidden" style={cardStyle}>
          <AnimatePresence initial={false}>
            {tasks.map((task, i) => {
              const pCfg    = PRIORITY_CFG[task.priority]
              const overdue = isOverdue(task.due_date) && task.status !== 'concluido'
              const member  = activeMembers.find(m => m.id === (task as any).assignee_id)
              const isConfirming = deletingId === task.id
              const done = task.status === 'concluido'

              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  onClick={() => !isConfirming && handleView(task)}
                  className={`relative cursor-pointer group hover:bg-black/[0.02] transition-colors ${i > 0 ? 'border-t' : ''}`}
                  style={{ borderColor: 'var(--sm-border)' }}
                >
                  <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
                    style={{ background: overdue ? '#EF4444' : done ? 'var(--sm-border)' : pCfg.color }} />
                  <div className="pl-5 pr-3 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13.5px] font-semibold leading-snug ${done ? 'line-through' : ''}`}
                        style={{ color: done ? 'var(--sm-text-4)' : 'var(--sm-text-1)' }}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-[12px] mt-0.5 leading-relaxed line-clamp-1" style={{ color: 'var(--sm-text-3)' }}>{task.description}</p>
                      )}

                      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-1.5">
                        <div onClick={e => e.stopPropagation()}>
                          <StatusPill status={task.status} onChange={s => handleStatusChange(task, s)} />
                        </div>
                        <span className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>{pCfg.label}</span>
                        {task.due_date && (
                          <span className="inline-flex items-center gap-1 text-[11.5px] tabular-nums"
                            style={{ color: overdue ? '#EF4444' : 'var(--sm-text-3)', fontWeight: overdue ? 600 : 400 }}>
                            <CalendarDays className="w-3 h-3" />
                            {formatDate(task.due_date)}
                            {task.due_time && <> · {task.due_time.slice(0, 5)}</>}
                            {overdue && ' · atrasada'}
                          </span>
                        )}
                        {(task.assignee || member) && (
                          <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--sm-text-3)' }}>
                            {member ? (
                              <>
                                <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
                                  style={{ backgroundColor: member.color }}>
                                  {member.name.charAt(0).toUpperCase()}
                                </span>
                                {member.name}
                              </>
                            ) : (
                              <><User className="w-3 h-3" /> {task.assignee}</>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações (no celular ficam sempre visíveis) */}
                    <div className="flex items-center gap-0.5 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      onClick={e => e.stopPropagation()}>
                      {isConfirming ? (
                        <>
                          <span className="text-[11.5px] mr-1" style={{ color: 'var(--sm-text-3)' }}>Excluir?</span>
                          <button onClick={() => setDeletingId(null)}
                            className="h-7 px-2 rounded-md text-[11.5px] hover:bg-black/5" style={{ color: 'var(--sm-text-2)' }}>Não</button>
                          <button onClick={() => handleDelete(task.id)}
                            className="h-7 px-2 rounded-md text-[11.5px] font-semibold hover:bg-red-500/10" style={{ color: '#EF4444' }}>Sim</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleEdit(task)} title="Editar" aria-label="Editar"
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors" style={{ color: 'var(--sm-text-3)' }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeletingId(task.id)} title="Excluir" aria-label="Excluir"
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-colors" style={{ color: 'var(--sm-text-3)' }}>
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
    </section>
  )
}
