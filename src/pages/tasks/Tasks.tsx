import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, ChevronLeft, ChevronRight, Trash2,
  User, CalendarDays, Clock, Pencil,
  ExternalLink, Link2, FileText, Folder, CheckCircle2,
  MoreHorizontal, LayoutGrid, List, Calendar,
  AlignLeft, ClipboardList, ArrowUpDown, CalendarOff, ChevronDown,
} from 'lucide-react'
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, addWeeks, subWeeks, isToday,
  getDaysInMonth, getDay, addMonths, subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { TemplatesManagerModal } from '@/components/tasks/TemplatesManagerModal'
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks'
import { useClients } from '@/hooks/useClients'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { isOverdue } from '@/utils/formatters'
import type { Task, TaskStatus, TaskPriority } from '@/types'

// ─── Configs ──────────────────────────────────────────────────────────────────
// Cores em hex (inline): funcionam igual no tema claro e no escuro. O status e a
// prioridade aparecem como ponto + texto; a prioridade também vira a barra de
// 3px à esquerda dos cartões.

const STATUS_CFG: Record<TaskStatus, { label: string; color: string }> = {
  a_fazer:      { label: 'A fazer',      color: '#94A3B8' },
  em_andamento: { label: 'Em andamento', color: '#2563EB' },
  revisao:      { label: 'Revisão',      color: '#F59E0B' },
  concluido:    { label: 'Concluído',    color: '#10B981' },
}

const PRIORITY_CFG: Record<TaskPriority, { label: string; color: string }> = {
  baixa:   { label: 'Baixa',   color: '#94A3B8' },
  media:   { label: 'Média',   color: '#2563EB' },
  alta:    { label: 'Alta',    color: '#F97316' },
  urgente: { label: 'Urgente', color: '#EF4444' },
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 }

const OVERDUE = '#EF4444'
const card = { background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' } as const
const primaryBtn = 'inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap'
const ghostBtn = 'inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border text-[13px] font-medium hover:bg-black/5 transition-colors whitespace-nowrap'
const ghostStyle = { borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' } as const
const iconBtn = 'w-9 h-9 flex items-center justify-center hover:bg-black/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed'
const eyebrow = 'text-[10.5px] font-semibold uppercase tracking-[0.08em]'

function Dot({ color, children, strong }: { color: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] whitespace-nowrap ${strong ? 'font-semibold' : 'font-medium'}`}
      style={{ color: strong ? color : 'var(--sm-text-2)' }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {children}
    </span>
  )
}

// ─── Status (ponto + texto) com menu ───────────────────────────────────────────

function StatusPill({ status, onChange, up = true }: { status: TaskStatus; onChange: (s: TaskStatus) => void; up?: boolean }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CFG[status]
  return (
    <div className="relative flex-shrink-0">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }} title="Mudar status"
        className="inline-flex items-center gap-1.5 h-7 pl-2 pr-1.5 -ml-2 rounded-lg text-[11.5px] font-medium hover:bg-black/5 transition-colors"
        style={{ color: 'var(--sm-text-2)' }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
        {cfg.label}
        <ChevronDown className="w-3 h-3" style={{ color: 'var(--sm-text-4)' }} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setOpen(false) }} />
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              className={`absolute ${up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} left-0 z-20 w-44 border rounded-xl shadow-xl overflow-hidden p-1`}
              style={card}>
              {(Object.entries(STATUS_CFG) as [TaskStatus, typeof STATUS_CFG[TaskStatus]][]).map(([s, c]) => (
                <button key={s} onClick={e => { e.stopPropagation(); onChange(s); setOpen(false) }}
                  className={`w-full flex items-center gap-2 px-2.5 h-8 rounded-lg text-[12.5px] hover:bg-black/5 text-left ${s === status ? 'font-semibold' : ''}`}
                  style={{ color: 'var(--sm-text-1)' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
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

// ─── Avatar ────────────────────────────────────────────────────────────────────

function AvatarCircle({ name, sm }: { name: string; sm?: boolean }) {
  const palette  = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#6366F1', '#06B6D4', '#F97316']
  const hash     = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span className={`${sm ? 'w-[18px] h-[18px] text-[8px]' : 'w-6 h-6 text-[10px]'} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ background: palette[hash % palette.length] }}>
      {initials}
    </span>
  )
}

// ─── Menu "mais" ───────────────────────────────────────────────────────────────

function MoreMenu({ onEdit, onDelete, up = true }: { onEdit: () => void; onDelete: () => void; up?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex-shrink-0">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }} aria-label="Mais ações"
        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors" style={{ color: 'var(--sm-text-3)' }}>
        <MoreHorizontal className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setOpen(false) }} />
            <motion.div initial={{ opacity: 0, y: 4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }} transition={{ duration: 0.1 }}
              className={`absolute right-0 ${up ? 'bottom-full mb-1' : 'top-full mt-1'} z-20 w-36 rounded-xl border shadow-xl overflow-hidden p-1`}
              style={card}>
              <button onClick={e => { e.stopPropagation(); onEdit(); setOpen(false) }}
                className="w-full flex items-center gap-2 px-2.5 h-8 rounded-lg text-[12.5px] hover:bg-black/5" style={{ color: 'var(--sm-text-1)' }}>
                <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} /> Editar
              </button>
              <button onClick={e => { e.stopPropagation(); onDelete(); setOpen(false) }}
                className="w-full flex items-center gap-2 px-2.5 h-8 rounded-lg text-[12.5px] hover:bg-red-500/10" style={{ color: '#EF4444' }}>
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Cartão de tarefa (visão semanal) ─────────────────────────────────────────

function TaskCard({
  task, onStatusChange, onDelete, onEdit, onView, dragging, onDragStart, onDragEnd,
}: {
  task: Task; onStatusChange: (id: string, s: TaskStatus) => void
  onDelete: (id: string) => void; onEdit: (task: Task) => void; onView: (task: Task) => void
  dragging: boolean; onDragStart: (id: string) => void; onDragEnd: () => void
}) {
  const dragStarted    = useRef(false)
  const overdueAndOpen = task.due_date ? isOverdue(task.due_date) && task.status !== 'concluido' : false
  const clientName     = (task.client as any)?.company_name
  const priCfg         = PRIORITY_CFG[task.priority]
  const done           = task.status === 'concluido'

  return (
    <div draggable
      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
        dragStarted.current = true; e.dataTransfer.setData('taskId', task.id); onDragStart(task.id)
      }}
      onDragEnd={() => { setTimeout(() => { dragStarted.current = false }, 50); onDragEnd() }}
      onClick={() => { if (!dragStarted.current) onView(task) }}
      className={['relative w-full min-w-0 rounded-xl border pl-4 pr-3 py-3 overflow-hidden',
        'cursor-pointer hover:border-[#2563EB]/50 transition-all duration-150 select-none',
        dragging ? 'opacity-40 scale-95' : ''].join(' ')}
      style={card}>
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
        style={{ background: overdueAndOpen ? OVERDUE : done ? 'var(--sm-border)' : priCfg.color }} />

      {(task.due_time || overdueAndOpen) && (
        <p className="flex items-center gap-1 text-[11.5px] font-medium mb-1 tabular-nums"
          style={{ color: overdueAndOpen ? OVERDUE : 'var(--sm-text-3)' }}>
          <Clock className="w-3 h-3" />
          {task.due_time ? task.due_time.slice(0, 5) : ''}
          {overdueAndOpen && <span>{task.due_time ? ' · ' : ''}Atrasada</span>}
        </p>
      )}
      <p className={`text-[13.5px] font-semibold leading-snug line-clamp-2 ${done ? 'line-through' : ''}`}
        style={{ color: done ? 'var(--sm-text-4)' : 'var(--sm-text-1)' }}>{task.title}</p>
      <p className="text-[11.5px] mt-1 truncate" style={{ color: 'var(--sm-text-4)' }}>
        {priCfg.label}{clientName && <> · <span style={{ color: 'var(--sm-text-3)' }}>{clientName}</span></>}
      </p>

      <div className="flex items-center justify-between gap-2 mt-2.5">
        <div onClick={e => e.stopPropagation()} className="min-w-0">
          <StatusPill status={task.status} onChange={s => onStatusChange(task.id, s)} />
        </div>
        <div className="flex items-center gap-1 min-w-0">
          {task.assignee
            ? <span title={task.assignee}><AvatarCircle name={task.assignee} /></span>
            : <span className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>Agência</span>}
          <div onClick={e => e.stopPropagation()}>
            <MoreMenu onEdit={() => onEdit(task)} onDelete={() => onDelete(task.id)} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Coluna do dia ────────────────────────────────────────────────────────────

function DayColumn({
  day, tasks, draggingId, onDrop, onDragStart, onDragEnd,
  onStatusChange, onDelete, onEdit, onView, onAddTask,
}: {
  day: Date; tasks: Task[]; draggingId: string | null
  onDrop: (taskId: string, day: Date) => void; onDragStart: (id: string) => void; onDragEnd: () => void
  onStatusChange: (id: string, s: TaskStatus) => void; onDelete: (id: string) => void
  onEdit: (task: Task) => void; onView: (task: Task) => void; onAddTask: (day: Date) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const today    = isToday(day)
  const fullLabel = format(day, 'EEEE', { locale: ptBR })
  const dayName  = fullLabel.charAt(0).toUpperCase() + fullLabel.slice(1).split('-')[0]

  return (
    <div
      className="w-full min-w-0 self-start flex flex-col rounded-2xl border p-2.5 transition-colors min-h-[440px]"
      style={isDragOver
        ? { background: 'rgba(37,99,235,0.05)', borderColor: 'rgba(37,99,235,0.5)' }
        : { background: 'var(--sm-bg-alt)', borderColor: today ? 'rgba(37,99,235,0.45)' : 'var(--sm-border)' }}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false) }}
      onDrop={e => { e.preventDefault(); setIsDragOver(false); const id = e.dataTransfer.getData('taskId'); if (id) onDrop(id, day) }}
    >
      {/* Cabeçalho do dia: número grande + dia da semana */}
      <div className="flex items-end justify-between gap-1 px-1.5 pt-1 pb-3 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-display text-[26px] font-bold leading-none tabular-nums" style={{ color: today ? '#2563EB' : 'var(--sm-text-1)' }}>
            {format(day, 'd')}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold truncate leading-tight" style={{ color: 'var(--sm-text-1)' }}>{dayName}</span>
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: today ? '#2563EB' : 'var(--sm-text-4)' }}>
              {today ? 'Hoje' : format(day, 'MMM', { locale: ptBR }).replace('.', '')}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {tasks.length > 0 && (
            <span className="text-[12px] font-semibold tabular-nums px-1.5" style={{ color: 'var(--sm-text-3)' }}>{tasks.length}</span>
          )}
          <button onClick={() => onAddTask(day)} aria-label={`Nova tarefa em ${format(day, 'dd/MM')}`}
            className="w-8 h-8 rounded-lg flex items-center justify-center border hover:bg-black/5 transition-colors"
            style={{ ...card, color: 'var(--sm-text-2)' }}
            title={`Nova tarefa — ${format(day, 'dd/MM')}`}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col space-y-2">
        <AnimatePresence>
          {tasks.map(task => (
            <motion.div key={task.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.14 }}>
              <TaskCard task={task} dragging={draggingId === task.id} onStatusChange={onStatusChange} onDelete={onDelete} onEdit={onEdit} onView={onView} onDragStart={onDragStart} onDragEnd={onDragEnd} />
            </motion.div>
          ))}
        </AnimatePresence>

        {tasks.length === 0 && !isDragOver && (
          <button onClick={() => onAddTask(day)}
            className="w-full flex-1 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors hover:border-[#2563EB]/50 hover:bg-black/[0.02]"
            style={{ borderColor: 'var(--sm-border)' }}>
            <Plus className="w-4 h-4" style={{ color: 'var(--sm-text-4)' }} />
            <span className="text-[12px]" style={{ color: 'var(--sm-text-4)' }}>Adicionar tarefa</span>
          </button>
        )}

        {isDragOver && (
          <div className="h-16 rounded-xl border-2 border-dashed flex items-center justify-center" style={{ borderColor: 'rgba(37,99,235,0.5)' }}>
            <p className="text-[12px] font-semibold" style={{ color: '#2563EB' }}>Soltar aqui</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Visão semanal (kanban) ───────────────────────────────────────────────────

function WeeklyView({ tasks, days, weekDays, draggingId, onDrop, onDragStart, onDragEnd, onStatusChange, onDelete, onEdit, onView, onAddTask }: {
  tasks: Task[]; days: Date[]; weekDays: Date[]; draggingId: string | null
  onDrop: (id: string, day: Date) => void; onDragStart: (id: string) => void; onDragEnd: () => void
  onStatusChange: (id: string, s: TaskStatus) => void; onDelete: (id: string) => void
  onEdit: (t: Task) => void; onView: (t: Task) => void; onAddTask: (d: Date) => void
}) {
  const tasksByDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd')
    return tasks.filter(t => t.due_date?.startsWith(dayStr))
      .sort((a, b) => {
        if (!a.due_time && !b.due_time) return 0
        if (!a.due_time) return 1
        if (!b.due_time) return -1
        return a.due_time.localeCompare(b.due_time)
      })
  }

  const thisWeekTotal = weekDays.reduce((acc, d) => acc + tasksByDay(d).length, 0)

  const columnProps = (day: Date) => ({
    day, tasks: tasksByDay(day), draggingId,
    onDrop, onDragStart, onDragEnd, onStatusChange, onDelete, onEdit, onView, onAddTask,
  })

  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      {thisWeekTotal === 0 && tasks.length > 0 && (
        <div className="relative mx-4 md:mx-6 mb-3 pl-4 pr-3 py-2.5 rounded-xl border text-[12.5px] flex-shrink-0 overflow-hidden"
          style={{ ...card, color: 'var(--sm-text-2)' }}>
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: '#F59E0B' }} />
          Nenhuma tarefa nesta semana. Você tem <strong style={{ color: 'var(--sm-text-1)' }}>{tasks.length}</strong> tarefa{tasks.length !== 1 ? 's' : ''} em outras semanas: use as setas de semana ou a aba <strong style={{ color: 'var(--sm-text-1)' }}>Lista</strong>.
        </div>
      )}

      {/* Desktop: janela de 4 dias */}
      <div className="hidden lg:block overflow-y-auto overflow-x-hidden flex-1 min-h-0 px-4 md:px-6">
        <div className="grid gap-3 items-start pb-4" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map(day => (
            <DayColumn key={day.toISOString()} {...columnProps(day)} />
          ))}
        </div>
      </div>

      {/* Celular: rolagem horizontal pelos 7 dias (snap) */}
      <div className="lg:hidden flex-1 min-h-0 flex gap-3 px-4 pb-4 overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden">
        {weekDays.map(day => (
          <div key={day.toISOString()} className="min-w-[86vw] max-w-[86vw] flex-shrink-0 snap-center h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
            <DayColumn {...columnProps(day)} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Linha do tempo ───────────────────────────────────────────────────────────

function TimelineView({ tasks, days, onView }: {
  tasks: Task[]; days: Date[]
  onView: (t: Task) => void; onEdit: (t: Task) => void; onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void; onAddTask: (d: Date) => void
}) {
  const sorted = [...tasks].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    const dc = a.due_date.localeCompare(b.due_date)
    if (dc !== 0) return dc
    if (!a.due_time && !b.due_time) return 0
    if (!a.due_time) return 1
    if (!b.due_time) return -1
    return a.due_time.localeCompare(b.due_time)
  })

  const weekStart = days[0]
  const weekEnd   = days[6]
  const border = { borderColor: 'var(--sm-border)' }

  return (
    <div className="flex-1 overflow-auto px-4 md:px-6 pb-4">
      <div className="rounded-2xl border overflow-hidden min-w-[560px]" style={card}>
        <div className="flex sticky top-0 z-10 border-b" style={{ ...border, background: 'var(--sm-bg-alt)' }}>
          <div className="w-44 lg:w-72 flex-shrink-0 px-4 py-2.5">
            <span className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>Tarefa</span>
          </div>
          {days.map((day, di) => (
            <div key={di} className="flex-1 min-w-[56px] sm:min-w-[44px] text-center py-2 border-l"
              style={{ ...border, background: isToday(day) ? 'rgba(37,99,235,0.08)' : undefined }}>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: isToday(day) ? '#2563EB' : 'var(--sm-text-4)' }}>
                {format(day, 'EEE', { locale: ptBR }).replace('.', '')}
              </p>
              <p className="font-display text-[16px] font-bold tabular-nums" style={{ color: isToday(day) ? '#2563EB' : 'var(--sm-text-1)' }}>
                {format(day, 'd')}
              </p>
            </div>
          ))}
        </div>

        {sorted.map((task, i) => {
          const priCfg  = PRIORITY_CFG[task.priority]
          const overdue = isOverdue(task.due_date) && task.status !== 'concluido'
          const sCfg    = STATUS_CFG[task.status]
          const clientName = (task.client as any)?.company_name
          const dueDayIdx = task.due_date ? days.findIndex(d => format(d, 'yyyy-MM-dd') === task.due_date) : -1
          const beforeWeek = task.due_date ? task.due_date < format(weekStart, 'yyyy-MM-dd') : false
          const afterWeek  = task.due_date ? task.due_date > format(weekEnd, 'yyyy-MM-dd') : false
          const outsideWeek = beforeWeek || afterWeek
          const markColor = task.status === 'concluido' ? '#10B981' : overdue ? OVERDUE : priCfg.color

          return (
            <div key={task.id} className={`flex items-stretch hover:bg-black/[0.02] transition-colors min-h-[56px] ${i > 0 ? 'border-t' : ''}`} style={border}>
              <div className="w-44 lg:w-72 flex-shrink-0 px-4 py-2 cursor-pointer flex flex-col justify-center min-w-0" onClick={() => onView(task)}>
                <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{task.title}</p>
                <div className="flex items-center gap-x-3 gap-y-0.5 mt-0.5 flex-wrap">
                  <Dot color={sCfg.color}>{sCfg.label}</Dot>
                  {overdue
                    ? <Dot color={OVERDUE} strong>Atrasada</Dot>
                    : <span className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>{priCfg.label}</span>}
                  {clientName && <span className="text-[11px] truncate" style={{ color: 'var(--sm-text-4)' }}>{clientName}</span>}
                </div>
              </div>

              {days.map((day, di) => (
                <div key={di} className="flex-1 min-w-[56px] sm:min-w-[44px] border-l px-1 py-2 flex items-center justify-center"
                  style={{ ...border, background: isToday(day) ? 'rgba(37,99,235,0.04)' : undefined }}>
                  {dueDayIdx === di && (
                    <motion.button initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className="w-full h-7 rounded-lg px-1.5 cursor-pointer text-white flex items-center justify-center"
                      style={{ background: markColor }}
                      onClick={() => onView(task)} aria-label={`Abrir ${task.title}`}>
                      {task.status === 'concluido'
                        ? <CheckCircle2 className="w-3.5 h-3.5" />
                        : task.due_time
                          ? <span className="text-[11px] font-semibold truncate tabular-nums">{task.due_time.slice(0, 5)}</span>
                          : <Clock className="w-3.5 h-3.5 opacity-90" />}
                    </motion.button>
                  )}
                  {outsideWeek && di === (beforeWeek ? 0 : 6) && (
                    <span className="text-[10px]" style={{ color: 'var(--sm-text-4)' }} title={beforeWeek ? 'Antes desta semana' : 'Depois desta semana'}>
                      {beforeWeek ? '◀' : '▶'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )
        })}

        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="w-7 h-7 mb-2" style={{ color: 'var(--sm-text-4)' }} />
            <p className="text-[13px]" style={{ color: 'var(--sm-text-3)' }}>Nenhuma tarefa encontrada</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal: tarefas do dia ────────────────────────────────────────────────────

function DayTasksModal({
  date, tasks, open, onClose, onView, onEdit, onDelete, onStatusChange, onAddTask,
}: {
  date: Date | null; tasks: Task[]; open: boolean; onClose: () => void
  onView: (t: Task) => void; onEdit: (t: Task) => void; onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void; onAddTask: (d: Date) => void
}) {
  if (!date) return null

  const rawLabel  = format(date, "EEEE, d 'de' MMMM", { locale: ptBR })
  const dateLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)

  const sorted = [...tasks].sort((a, b) => {
    if (!a.due_time && !b.due_time) return a.title.localeCompare(b.title)
    if (!a.due_time) return 1
    if (!b.due_time) return -1
    return a.due_time.localeCompare(b.due_time)
  })

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[19px] font-bold text-[color:var(--sm-text-1)]">{dateLabel}</DialogTitle>
          <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
            {sorted.length} tarefa{sorted.length !== 1 ? 's' : ''} neste dia
          </p>
        </DialogHeader>

        <div className="mt-1 max-h-[52vh] overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--sm-border)' }}>
          {sorted.map((task, i) => {
            const pc      = PRIORITY_CFG[task.priority]
            const overdue = isOverdue(task.due_date) && task.status !== 'concluido'
            const clientName = (task.client as any)?.company_name

            return (
              <div key={task.id} className={`relative group flex items-start gap-2 pl-4 pr-2 py-3 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: overdue ? OVERDUE : pc.color }} />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { onClose(); onView(task) }}>
                  <p className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--sm-text-1)' }}>{task.title}</p>
                  <p className="text-[11.5px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--sm-text-4)' }}>
                    {task.due_time && <span className="tabular-nums">{task.due_time.slice(0, 5)}</span>}
                    <span>{pc.label}</span>
                    {clientName && <span>· {clientName}</span>}
                    {task.assignee && <span>· {task.assignee}</span>}
                    {overdue && <span className="font-semibold" style={{ color: OVERDUE }}>· Atrasada</span>}
                  </p>
                  <div onClick={e => e.stopPropagation()} className="mt-1.5">
                    <StatusPill status={task.status} onChange={s => onStatusChange(task.id, s)} up={false} />
                  </div>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0" style={{ color: 'var(--sm-text-3)' }}>
                  <button onClick={() => { onClose(); onEdit(task) }} title="Editar" aria-label="Editar"
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onDelete(task.id)} title="Excluir" aria-label="Excluir"
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}

          {sorted.length === 0 && (
            <div className="flex flex-col items-center py-8">
              <ClipboardList className="w-6 h-6 mb-2" style={{ color: 'var(--sm-text-4)' }} />
              <p className="text-[13px]" style={{ color: 'var(--sm-text-3)' }}>Nenhuma tarefa neste dia</p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-1 gap-2 flex-row">
          <button onClick={onClose} className={`${ghostBtn} h-9 flex-shrink-0`} style={ghostStyle}>Fechar</button>
          <button onClick={() => { onClose(); onAddTask(date) }} className={`${primaryBtn} h-9 flex-1 justify-center`} style={{ background: 'var(--sm-primary)' }}>
            <Plus className="w-3.5 h-3.5" /> Nova tarefa neste dia
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Calendário mensal ────────────────────────────────────────────────────────

function MonthView({ tasks, onView, onEdit, onDelete, onStatusChange, onAddTask }: {
  tasks: Task[]
  onView: (t: Task) => void
  onEdit: (t: Task) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  onAddTask: (d: Date) => void
}) {
  const [monthBase, setMonthBase]   = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [dayModalOpen, setDayModalOpen] = useState(false)

  const firstDay  = new Date(monthBase.getFullYear(), monthBase.getMonth(), 1)
  const totalDays = getDaysInMonth(monthBase)
  const startDow  = getDay(firstDay)
  const offset    = startDow === 0 ? 6 : startDow - 1

  const days: (Date | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= totalDays; d++)
    days.push(new Date(monthBase.getFullYear(), monthBase.getMonth(), d))
  while (days.length % 7 !== 0) days.push(null)

  const monthLabel = format(monthBase, 'MMMM yyyy', { locale: ptBR })

  const tasksByDate = (date: Date) =>
    tasks.filter(t => t.due_date === format(date, 'yyyy-MM-dd'))

  const handleDayClick = (date: Date) => {
    const dayTasks = tasksByDate(date)
    if (dayTasks.length > 0) { setSelectedDay(date); setDayModalOpen(true) }
    else onAddTask(date)
  }

  const selectedDayTasks = selectedDay ? tasksByDate(selectedDay) : []

  return (
    <>
      <div className="flex-1 overflow-auto px-4 md:px-6 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-[20px] font-bold capitalize" style={{ color: 'var(--sm-text-1)' }}>{monthLabel}</h2>
          <div className="flex items-center rounded-xl border overflow-hidden" style={card}>
            <button onClick={() => setMonthBase(m => subMonths(m, 1))} aria-label="Mês anterior" className={iconBtn} style={{ color: 'var(--sm-text-2)' }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setMonthBase(new Date())} className="h-9 px-3 text-[12.5px] font-semibold border-x hover:bg-black/5"
              style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
              Hoje
            </button>
            <button onClick={() => setMonthBase(m => addMonths(m, 1))} aria-label="Próximo mês" className={iconBtn} style={{ color: 'var(--sm-text-2)' }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Grade do mês: folha única com linhas finas (seg → dom) */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-border)' }}>
          <div className="grid grid-cols-7 gap-px">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
              <div key={d} className={`text-center py-2 ${eyebrow}`} style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-4)' }}>{d}</div>
            ))}
            {days.map((date, i) => {
              if (!date) return <div key={i} className="min-h-[96px] md:min-h-[112px]" style={{ background: 'var(--sm-bg-alt)' }} />
              const dayTasks = tasksByDate(date)
              const today    = isToday(date)
              return (
                <button key={i} onClick={() => handleDayClick(date)}
                  className="min-h-[96px] md:min-h-[112px] p-1.5 md:p-2 text-left align-top transition-colors hover:bg-black/[0.02] flex flex-col"
                  style={{ background: 'var(--sm-bg-card)' }}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold mb-1 tabular-nums ${today ? 'text-white' : ''}`}
                    style={today ? { background: 'var(--sm-primary)' } : { color: 'var(--sm-text-2)' }}>
                    {format(date, 'd')}
                  </span>
                  <span className="space-y-0.5 overflow-hidden w-full block">
                    {dayTasks.slice(0, 3).map(task => {
                      const overdue = isOverdue(task.due_date) && task.status !== 'concluido'
                      const done = task.status === 'concluido'
                      return (
                        <span key={task.id} className="flex items-center gap-1 text-[10.5px] font-medium px-1 py-0.5 rounded truncate"
                          style={{ background: 'var(--sm-bg-alt)', color: done ? 'var(--sm-text-4)' : 'var(--sm-text-1)' }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: done ? '#10B981' : overdue ? OVERDUE : PRIORITY_CFG[task.priority].color }} />
                          <span className={`truncate ${done ? 'line-through' : ''}`}>{task.title}</span>
                        </span>
                      )
                    })}
                    {dayTasks.length > 3 && (
                      <span className="block text-[10px] font-medium pl-1" style={{ color: 'var(--sm-text-4)' }}>+{dayTasks.length - 3} mais</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <DayTasksModal
        date={selectedDay}
        tasks={selectedDayTasks}
        open={dayModalOpen}
        onClose={() => setDayModalOpen(false)}
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
        onStatusChange={onStatusChange}
        onAddTask={onAddTask}
      />
    </>
  )
}

// ─── Lista ────────────────────────────────────────────────────────────────────

type SortKey = 'due_date' | 'priority' | 'status' | 'title'

// Colunas fixas da tabela: tudo alinhado na vertical.
const LIST_COLS = 'md:grid md:grid-cols-[minmax(0,1fr)_120px_96px_140px_150px_130px_36px] md:items-center md:gap-x-4'

function ListView({ tasks, onView, onEdit, onDelete, onStatusChange }: {
  tasks: Task[]; onView: (t: Task) => void; onEdit: (t: Task) => void
  onDelete: (id: string) => void; onStatusChange: (id: string, s: TaskStatus) => void
  onNewTask: () => void
}) {
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all')
  const [sortKey, setSortKey]           = useState<SortKey>('due_date')
  const [sortAsc, setSortAsc]           = useState(true)

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(a => !a)
    else { setSortKey(k); setSortAsc(true) }
  }

  const filtered = tasks.filter(t => filterStatus === 'all' || t.status === filterStatus)
  const sorted   = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'due_date') {
      if (!a.due_date && !b.due_date) cmp = 0
      else if (!a.due_date) cmp = 1
      else if (!b.due_date) cmp = -1
      else cmp = a.due_date.localeCompare(b.due_date)
    } else if (sortKey === 'priority') {
      cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    } else if (sortKey === 'status') {
      cmp = a.status.localeCompare(b.status)
    } else if (sortKey === 'title') {
      cmp = a.title.localeCompare(b.title)
    }
    return sortAsc ? cmp : -cmp
  })

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => handleSort(k)} className={`flex items-center gap-1 ${eyebrow} hover:opacity-80 transition-opacity`}
      style={{ color: sortKey === k ? 'var(--sm-text-1)' : 'var(--sm-text-4)' }}>
      {label}
      {sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : <ArrowUpDown className="w-3 h-3 opacity-50" />}
    </button>
  )

  const contagem = (s: TaskStatus | 'all') => s === 'all' ? tasks.length : tasks.filter(t => t.status === s).length

  return (
    <div className="flex-1 overflow-hidden flex flex-col px-4 md:px-6">
      {/* Filtro de status: abas finas com contagem */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {(['all', 'a_fazer', 'em_andamento', 'revisao', 'concluido'] as const).map(s => {
          const ativo = filterStatus === s
          return (
            <button key={s} onClick={() => setFilterStatus(s)} aria-pressed={ativo}
              className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] whitespace-nowrap transition-colors hover:bg-black/5"
              style={ativo
                ? { background: 'var(--sm-bg-card)', color: 'var(--sm-text-1)', fontWeight: 600, boxShadow: 'inset 0 0 0 1px var(--sm-border)' }
                : { color: 'var(--sm-text-3)', fontWeight: 500 }}>
              {s !== 'all' && <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_CFG[s].color }} />}
              {s === 'all' ? 'Todas' : STATUS_CFG[s].label}
              <span className="tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{contagem(s)}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto rounded-2xl border mb-4" style={card}>
        <div className={`max-md:hidden sticky top-0 z-10 px-4 py-2.5 border-b ${LIST_COLS}`}
          style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
          <SortBtn k="title" label="Tarefa" />
          <SortBtn k="due_date" label="Prazo" />
          <SortBtn k="priority" label="Prioridade" />
          <SortBtn k="status" label="Status" />
          <span className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>Cliente</span>
          <span className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>Responsável</span>
          <span />
        </div>

        {sorted.map((task, i) => {
          const priCfg     = PRIORITY_CFG[task.priority]
          const overdue    = isOverdue(task.due_date) && task.status !== 'concluido'
          const clientName = (task.client as any)?.company_name
          const done       = task.status === 'concluido'
          return (
            <div key={task.id} onClick={() => onView(task)}
              className={`relative cursor-pointer px-4 py-3 hover:bg-black/[0.02] transition-colors ${LIST_COLS} ${i > 0 ? 'border-t' : ''}`}
              style={{ borderColor: 'var(--sm-border)' }}>
              <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
                style={{ background: overdue ? OVERDUE : done ? 'transparent' : priCfg.color }} />

              <div className="min-w-0 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className={`text-[13.5px] font-semibold truncate ${done ? 'line-through' : ''}`}
                    style={{ color: done ? 'var(--sm-text-4)' : 'var(--sm-text-1)' }}>{task.title}</p>
                  {task.description && <p className="text-[11.5px] truncate mt-0.5" style={{ color: 'var(--sm-text-4)' }}>{task.description}</p>}
                </div>
                <div className="md:hidden flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <MoreMenu onEdit={() => onEdit(task)} onDelete={() => onDelete(task.id)} up={false} />
                </div>
              </div>

              {/* No celular estes campos viram uma linha só embaixo do título */}
              <div className="max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:mt-1.5 md:contents">
                <span className="text-[12px] tabular-nums whitespace-nowrap" style={{ color: overdue ? OVERDUE : 'var(--sm-text-2)', fontWeight: overdue ? 600 : 400 }}>
                  {task.due_date
                    ? <>{format(new Date(task.due_date + 'T00:00:00'), "d MMM yyyy", { locale: ptBR })}{task.due_time && <span style={{ color: 'var(--sm-text-4)' }}> · {task.due_time.slice(0, 5)}</span>}</>
                    : <span style={{ color: 'var(--sm-text-4)' }}>—</span>}
                </span>
                <span><Dot color={priCfg.color}>{priCfg.label}</Dot></span>
                <span onClick={e => e.stopPropagation()}>
                  <StatusPill status={task.status} onChange={s => onStatusChange(task.id, s)} up={i > 2} />
                </span>
                <span className="text-[12px] truncate" style={{ color: clientName ? 'var(--sm-text-2)' : 'var(--sm-text-4)' }}>{clientName || (<span className="max-md:hidden">—</span>)}</span>
                <span className="flex items-center gap-2 min-w-0">
                  {task.assignee
                    ? <><AvatarCircle name={task.assignee} sm /><span className="text-[12px] truncate" style={{ color: 'var(--sm-text-2)' }}>{task.assignee}</span></>
                    : <span className="text-[12px] max-md:hidden" style={{ color: 'var(--sm-text-4)' }}>—</span>}
                </span>
              </div>
              <span className="max-md:hidden justify-self-end" onClick={e => e.stopPropagation()}>
                <MoreMenu onEdit={() => onEdit(task)} onDelete={() => onDelete(task.id)} up={i > 2} />
              </span>
            </div>
          )
        })}

        {sorted.length === 0 && (
          <p className="text-center py-16 text-[13px]" style={{ color: 'var(--sm-text-3)' }}>
            {tasks.length === 0 ? 'Nenhuma tarefa criada ainda.' : 'Nenhuma tarefa com esse filtro.'}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Modal: ver tarefa ─────────────────────────────────────────────────────────

function TaskViewModal({ task, members, open, onClose, onEdit, onDelete, onStatusChange }: {
  task: Task | null; members: { id: string; name: string; color: string }[]
  open: boolean; onClose: () => void; onEdit: (t: Task) => void; onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
}) {
  if (!task) return null
  const pCfg    = PRIORITY_CFG[task.priority]
  const member  = members.find(m => m.id === (task as any).assignee_id)
  const overdue = isOverdue(task.due_date) && task.status !== 'concluido'
  const clientName = (task.client as any)?.company_name
  const links: { id: string; label: string; url: string; type: string }[] =
    Array.isArray((task as any).task_links) ? (task as any).task_links : []
  const box = { background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }
  const lbl = `${eyebrow} mb-1.5 flex items-center gap-1`

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="pr-6">
            {clientName && <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] mb-1" style={{ color: 'var(--sm-text-4)' }}>{clientName}</p>}
            <DialogTitle className="font-display text-[19px] font-bold leading-snug text-[color:var(--sm-text-1)]">{task.title}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-4 mt-1 overflow-y-auto max-h-[60vh] pr-1">
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
            <Dot color={pCfg.color}>Prioridade {pCfg.label.toLowerCase()}</Dot>
            <StatusPill status={task.status} up={false}
              onChange={next => { if (next !== task.status) onStatusChange(task.id, next) }} />
            {overdue && <Dot color={OVERDUE} strong>Atrasada</Dot>}
          </div>

          {task.description && (
            <div className="rounded-xl p-3.5 border" style={box}>
              <p className={lbl} style={{ color: 'var(--sm-text-4)' }}>Descrição</p>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--sm-text-1)' }}>{task.description}</p>
            </div>
          )}

          <dl className="grid grid-cols-2 rounded-xl border overflow-hidden" style={box}>
            <div className="p-3">
              <dt className={lbl} style={{ color: 'var(--sm-text-4)' }}><CalendarDays className="w-3 h-3" /> Prazo</dt>
              {task.due_date ? (
                <dd>
                  <p className="text-[13px] font-medium" style={{ color: overdue ? OVERDUE : 'var(--sm-text-1)' }}>
                    {format(new Date(task.due_date + 'T00:00:00'), "d 'de' MMMM yyyy", { locale: ptBR })}
                  </p>
                  {task.due_time && <p className="text-[12px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--sm-text-3)' }}><Clock className="w-3 h-3" /> {task.due_time.slice(0, 5)}</p>}
                </dd>
              ) : <dd className="text-[13px]" style={{ color: 'var(--sm-text-4)' }}>Sem prazo</dd>}
            </div>
            <div className="p-3 border-l" style={{ borderColor: 'var(--sm-border)' }}>
              <dt className={lbl} style={{ color: 'var(--sm-text-4)' }}><User className="w-3 h-3" /> Responsável</dt>
              <dd>
                {member ? (
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: member.color }}>{member.name.charAt(0).toUpperCase()}</span>
                    <span className="text-[13px] font-medium" style={{ color: 'var(--sm-text-1)' }}>{member.name}</span>
                  </span>
                ) : <span className="text-[13px]" style={{ color: task.assignee ? 'var(--sm-text-1)' : 'var(--sm-text-4)' }}>{task.assignee || 'Agência'}</span>}
              </dd>
            </div>
          </dl>

          {links.length > 0 && (
            <div>
              <p className={`${eyebrow} mb-2`} style={{ color: 'var(--sm-text-4)' }}>Referências ({links.length})</p>
              <div className="space-y-2">
                {links.map(link => {
                  if (link.type === 'imagem') return (
                    <div key={link.id} className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--sm-border)' }}>
                      <img src={link.url} alt={link.label} className="w-full max-h-48 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--sm-bg-card)' }}>
                        <span className="text-[11.5px] font-medium truncate flex-1" style={{ color: 'var(--sm-text-2)' }}>{link.label}</span>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="ml-2 hover:opacity-70" style={{ color: 'var(--sm-text-4)' }}><ExternalLink className="w-3 h-3" /></a>
                      </div>
                    </div>
                  )
                  const iconMap: Record<string, typeof Link2> = { link: Link2, arquivo: FileText, pasta: Folder }
                  const Icon = iconMap[link.type] ?? Link2
                  return (
                    <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl border hover:border-[#2563EB]/50 transition-colors"
                      style={{ borderColor: 'var(--sm-border)' }}>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-3)' }}><Icon className="w-4 h-4" /></span>
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

          {((task as any).collaborator_note || (task as any).delivery_url) && (
            <div className="relative rounded-xl p-3.5 pl-4 border space-y-1.5 overflow-hidden" style={box}>
              <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: '#8B5CF6' }} />
              <p className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>Entrega do colaborador</p>
              {(task as any).collaborator_note && <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--sm-text-1)' }}>{(task as any).collaborator_note}</p>}
              {(task as any).delivery_url && (
                <a href={(task as any).delivery_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#2563EB' }}>
                  <ExternalLink className="w-3 h-3" /> Ver entrega enviada
                </a>
              )}
            </div>
          )}
          <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>Criada em {format(new Date(task.created_at), "d 'de' MMMM yyyy 'às' HH:mm", { locale: ptBR })}</p>
        </div>
        <DialogFooter className="gap-2 border-t pt-3 border-[color:var(--sm-border)]">
          <Button variant="outline" size="sm" className="text-red-600 border-red-500/40 hover:bg-red-500/10 hover:border-red-500/60"
            onClick={() => { onClose(); onDelete(task.id) }}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          <Button size="sm" onClick={() => { onClose(); onEdit(task) }}><Pencil className="w-3.5 h-3.5 mr-1" /> Editar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Modal: criar / editar tarefa ─────────────────────────────────────────────

const blankForm = {
  title: '', description: '', due_date: '', due_time: '',
  priority: 'media' as TaskPriority, status: 'a_fazer' as TaskStatus,
  assignee: '', assignee_id: null as string | null, client_id: null as string | null,
}
type TaskForm = typeof blankForm

function TaskDialog({ open, onClose, prefillDate, clients, members, editingTask, onCreate, onUpdate }: {
  open: boolean; onClose: () => void; prefillDate: string
  clients: { id: string; company_name: string }[]; members: { id: string; name: string; color: string }[]
  editingTask: Task | null; onCreate: (f: TaskForm) => Promise<void>; onUpdate: (id: string, f: TaskForm) => Promise<void>
}) {
  const [form, setForm] = useState<TaskForm>(blankForm)
  const [saving, setSaving] = useState(false)
  const isEdit = !!editingTask
  const set = (k: keyof TaskForm, v: unknown) => setForm(p => ({ ...p, [k]: v }))
  const lbl = `block ${eyebrow} mb-1.5 text-[color:var(--sm-text-4)]`

  useEffect(() => {
    if (!open) return
    if (editingTask) {
      setForm({
        title: editingTask.title, description: editingTask.description || '',
        due_date: editingTask.due_date || '', due_time: editingTask.due_time || '',
        priority: editingTask.priority, status: editingTask.status,
        assignee: editingTask.assignee || '', assignee_id: (editingTask as any).assignee_id || null,
        client_id: editingTask.client_id,
      })
    } else { setForm({ ...blankForm, due_date: prefillDate }) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingTask?.id])

  const handleClose = () => { onClose(); setForm(blankForm) }
  const handleSubmit = async () => {
    setSaving(true)
    try {
      if (isEdit && editingTask) await onUpdate(editingTask.id, form)
      else await onCreate(form)
      setForm(blankForm); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-[19px] font-bold">{isEdit ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-1">
          <Input label="Título *" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Descrição da tarefa..." />
          <Textarea label="Descrição" value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Detalhes opcionais..." />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Prioridade</label>
              <Select value={form.priority} onValueChange={v => set('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem><SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem><SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lbl}>Status</label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_fazer">A fazer</SelectItem><SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="revisao">Revisão</SelectItem><SelectItem value="concluido">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            <div>
              <label className={lbl}>Horário</label>
              <div className="relative">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none z-10" style={{ color: 'var(--sm-text-4)' }} />
                <input type="time" value={form.due_time} onChange={e => set('due_time', e.target.value)}
                  className="w-full h-9 pl-8 pr-3 rounded-lg border text-[13px] focus:outline-none focus:border-[#2563EB]/50 focus:ring-2 focus:ring-[#2563EB]/20 tabular-nums [color-scheme:light_dark]"
                  style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Responsável</label>
              <Select value={form.assignee_id || '__none__'} onValueChange={v => {
                if (v === '__none__') { set('assignee_id', null); set('assignee', '') }
                else { const m = members.find(m => m.id === v); set('assignee_id', v); set('assignee', m?.name || '') }
              }}>
                <SelectTrigger><SelectValue placeholder="Agência" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Agência</SelectItem>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />{m.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lbl}>Cliente (opcional)</label>
              <Select value={form.client_id || '__none__'} onValueChange={v => set('client_id', v === '__none__' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Sem cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem cliente</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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

// ─── Main page ────────────────────────────────────────────────────────────────

type ViewTab = 'semanal' | 'timeline' | 'calendario' | 'lista'

export function Tasks() {
  const { user, agencyId } = useAuth()
  const { data: tasks = [] } = useTasks()
  const { data: clients = [] } = useClients()
  const { data: allMembers = [] } = useTeamMembers()
  const activeMembers = allMembers.filter(m => m.is_active)
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const { toast } = useToast()

  const [weekBase, setWeekBase]   = useState(() => new Date())
  const weekStart = startOfWeek(weekBase, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(weekBase,   { weekStartsOn: 1 })
  const days      = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // Janela deslizante de 4 dias dentro da semana (0 = seg–qui, 1 = ter–sex, 2 = qua–sáb, 3 = qui–dom)
  const DAY_WINDOW_SIZE = 4
  const [dayWindow, setDayWindow] = useState(0)
  const maxDayWindow = Math.max(0, days.length - DAY_WINDOW_SIZE)
  const visibleDays  = days.slice(dayWindow, dayWindow + DAY_WINDOW_SIZE)
  // Ao trocar de semana, volta a janela para o início (seg–sex)
  useEffect(() => { setDayWindow(0) }, [weekBase])

  const [activeTab, setActiveTab]     = useState<ViewTab>('calendario')
  const [draggingId, setDraggingId]   = useState<string | null>(null)
  const [noDateOpen, setNoDateOpen]   = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [dialogOpen, setDialogOpen]   = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [prefillDate, setPrefillDate] = useState('')
  const [viewingTask, setViewingTask] = useState<Task | null>(null)

  const weekLabel = (() => {
    const startDay = format(weekStart, 'd', { locale: ptBR })
    const endFull  = format(weekEnd, "d 'de' MMMM', 'yyyy", { locale: ptBR })
    return `${startDay} – ${endFull.charAt(0).toUpperCase() + endFull.slice(1)}`
  })()

  const totalCount   = tasks.length
  const doneCount    = tasks.filter(t => t.status === 'concluido').length
  const overdueCount = tasks.filter(t => isOverdue(t.due_date) && t.status !== 'concluido').length
  const progressPct  = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  const tasksWithoutDate = tasks.filter(t => !t.due_date)

  const handleDropOnDay = async (taskId: string, day: Date) => {
    const task    = tasks.find(t => t.id === taskId)
    const dateStr = format(day, 'yyyy-MM-dd')
    if (!task || task.due_date?.startsWith(dateStr)) return
    try { await updateTask.mutateAsync({ id: taskId, due_date: dateStr }) }
    catch (err: any) { toast(err.message, 'error') }
  }

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    setViewingTask(prev => (prev && prev.id === taskId ? { ...prev, status } : prev))
    try { await updateTask.mutateAsync({ id: taskId, status }) }
    catch (err: any) { toast(err.message, 'error') }
  }

  const handleDelete = async (taskId: string) => {
    try { await deleteTask.mutateAsync(taskId); toast('Tarefa removida.', 'success') }
    catch (err: any) { toast(err.message, 'error') }
  }

  const handleAddTask  = (day: Date) => { setEditingTask(null); setPrefillDate(format(day, 'yyyy-MM-dd')); setDialogOpen(true) }
  const handleNewTask  = () => { setEditingTask(null); setPrefillDate(''); setDialogOpen(true) }
  const handleEditTask = (task: Task) => { setEditingTask(task); setDialogOpen(true) }

  const handleCreate = async (form: TaskForm) => {
    if (!form.title.trim() || !user) return
    try {
      await (createTask.mutateAsync as any)({
        user_id: agencyId!, title: form.title.trim(), description: form.description || null,
        due_date: form.due_date || null, due_time: form.due_time || null,
        priority: form.priority, status: form.status, assignee: form.assignee || null,
        assignee_id: form.assignee_id || null, client_id: form.client_id || null,
      })
      toast('Tarefa criada!', 'success')
    } catch (err: any) { toast(err.message, 'error'); throw err }
  }

  const handleUpdate = async (taskId: string, form: TaskForm) => {
    try {
      await updateTask.mutateAsync({
        id: taskId, title: form.title.trim(), description: form.description || null,
        due_date: form.due_date || null, due_time: form.due_time || null,
        priority: form.priority, status: form.status, assignee: form.assignee || null,
        ...(form.assignee_id !== undefined && { assignee_id: form.assignee_id } as any),
        client_id: form.client_id || null,
      })
      toast('Tarefa atualizada!', 'success')
    } catch (err: any) { toast(err.message, 'error'); throw err }
  }

  // short: rótulo do celular, para as quatro abas caberem sem rolar de lado
  const TABS: { id: ViewTab; label: string; short: string; Icon: React.ElementType }[] = [
    { id: 'semanal',    label: 'Visão semanal',  short: 'Semana', Icon: LayoutGrid },
    { id: 'timeline',   label: 'Linha do tempo', short: 'Linha',  Icon: AlignLeft  },
    { id: 'calendario', label: 'Calendário',     short: 'Mês',    Icon: Calendar   },
    { id: 'lista',      label: 'Lista',          short: 'Lista',  Icon: List       },
  ]

  const showNoDate = (activeTab === 'semanal' || activeTab === 'timeline') && tasksWithoutDate.length > 0

  const kpis = [
    { label: 'Total', value: String(totalCount), hint: 'tarefas' },
    { label: 'Concluídas', value: String(doneCount), hint: `${progressPct}% do total`, bar: progressPct },
    { label: 'Atrasadas', value: String(overdueCount), hint: overdueCount > 0 ? 'precisam de atenção' : 'tudo em dia', alert: overdueCount > 0 },
    { label: 'Sem data', value: String(tasksWithoutDate.length), hint: 'sem prazo definido' },
  ]

  return (
    <div className="flex flex-col h-full overflow-x-hidden" style={{ background: 'var(--sm-bg-page)' }}>

      {/* ── Cabeçalho (no celular, ao lado do menu) ───────────────────────── */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 flex-shrink-0">
        <header className="mb-5 max-md:pl-12 max-md:-mt-[3.25rem] flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Operação</p>
            <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>
              Tarefas
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTemplatesOpen(true)} className={ghostBtn} style={ghostStyle}>
              <ClipboardList className="w-4 h-4" /> Modelos
            </button>
            <button onClick={handleNewTask} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
              <Plus className="w-4 h-4" /> Nova tarefa
            </button>
          </div>
        </header>

        {/* ── Números em uma faixa com divisórias ── */}
        <div className="rounded-2xl border grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden mb-5"
          style={{ background: 'var(--sm-border)', borderColor: 'var(--sm-border)' }}>
          {kpis.map(k => (
            <div key={k.label} className="relative px-4 md:px-5 py-3.5" style={{ background: 'var(--sm-bg-card)' }}>
              {k.alert && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: OVERDUE }} />}
              <p className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>{k.label}</p>
              <p className="font-display text-[26px] font-bold leading-tight tabular-nums mt-0.5"
                style={{ color: k.alert ? OVERDUE : 'var(--sm-text-1)' }}>{k.value}</p>
              {k.bar != null ? (
                <div className="h-1 rounded-full overflow-hidden mt-1.5" style={{ background: 'var(--sm-bg-alt)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${k.bar}%`, background: '#10B981' }} />
                </div>
              ) : (
                <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>{k.hint}</p>
              )}
            </div>
          ))}
        </div>

        {/* ── Abas de visão + navegação da semana ── */}
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b mb-4" style={{ borderColor: 'var(--sm-border)' }}>
          <div className="flex items-center overflow-x-auto [&::-webkit-scrollbar]:hidden -mb-px">
            {TABS.map(({ id, label, short, Icon }) => {
              const ativo = activeTab === id
              return (
                <button key={id} onClick={() => setActiveTab(id)} aria-current={ativo ? 'page' : undefined}
                  className="flex flex-shrink-0 whitespace-nowrap items-center gap-1.5 px-3 h-10 text-[13px] transition-colors border-b-2"
                  style={{ borderColor: ativo ? '#2563EB' : 'transparent', color: ativo ? 'var(--sm-text-1)' : 'var(--sm-text-3)', fontWeight: ativo ? 600 : 500 }}>
                  <Icon className="hidden sm:block w-4 h-4" style={{ color: ativo ? '#2563EB' : 'var(--sm-text-4)' }} />
                  <span className="sm:hidden">{short}</span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 pb-2 flex-wrap">
            {(activeTab === 'semanal' || activeTab === 'timeline') && (
              <div className="flex items-center rounded-xl border overflow-hidden" style={card}>
                <button onClick={() => setWeekBase(d => subWeeks(d, 1))} aria-label="Semana anterior" className={iconBtn} style={{ color: 'var(--sm-text-2)' }}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 h-9 flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap border-x"
                  style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}>
                  <CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} /> {weekLabel}
                </span>
                <button onClick={() => setWeekBase(d => addWeeks(d, 1))} aria-label="Próxima semana" className={iconBtn} style={{ color: 'var(--sm-text-2)' }}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            {(activeTab === 'semanal' || activeTab === 'timeline') && (
              <button onClick={() => setWeekBase(new Date())} className={`${ghostBtn} h-9 text-[12.5px]`} style={ghostStyle}>Hoje</button>
            )}

            {/* Janela de dias (só na visão semanal, no computador) */}
            {activeTab === 'semanal' && (
              <div className="hidden lg:flex items-center rounded-xl border overflow-hidden" style={card}>
                <button onClick={() => setDayWindow(w => Math.max(0, w - 1))} disabled={dayWindow === 0}
                  title="Dias anteriores" aria-label="Dias anteriores" className={iconBtn} style={{ color: 'var(--sm-text-2)' }}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="h-9 px-2 flex items-center text-[11.5px] border-x tabular-nums" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
                  {format(visibleDays[0], 'EEE', { locale: ptBR }).replace('.', '')}–{format(visibleDays[visibleDays.length - 1], 'EEE', { locale: ptBR }).replace('.', '')}
                </span>
                <button onClick={() => setDayWindow(w => Math.min(maxDayWindow, w + 1))} disabled={dayWindow === maxDayWindow}
                  title="Próximos dias" aria-label="Próximos dias" className={iconBtn} style={{ color: 'var(--sm-text-2)' }}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Tarefas sem data */}
            {showNoDate && (
              <div className="relative">
                <button onClick={() => setNoDateOpen(o => !o)} aria-expanded={noDateOpen} className={`${ghostBtn} h-9 text-[12.5px]`} style={ghostStyle}>
                  <CalendarOff className="w-3.5 h-3.5" /> Sem data
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{tasksWithoutDate.length}</span>
                </button>
                {noDateOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setNoDateOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-40 w-72 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto border rounded-xl shadow-2xl p-1.5" style={card}>
                      <p className={`${eyebrow} px-2 pt-1 pb-1.5`} style={{ color: 'var(--sm-text-4)' }}>Tarefas sem data</p>
                      {tasksWithoutDate.map(task => {
                        const priCfg = PRIORITY_CFG[task.priority]
                        return (
                          <div key={task.id} onClick={() => { setViewingTask(task); setNoDateOpen(false) }}
                            className="flex items-center gap-2 pl-2.5 pr-1 py-1.5 rounded-lg cursor-pointer hover:bg-black/5 transition-colors">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: priCfg.color }} title={priCfg.label} />
                            <span className="text-[12.5px] font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--sm-text-1)' }}>{task.title}</span>
                            <div onClick={e => e.stopPropagation()}>
                              <MoreMenu up={false} onEdit={() => { handleEditTask(task); setNoDateOpen(false) }} onDelete={() => handleDelete(task.id)} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">

        {activeTab === 'semanal' && (
          <WeeklyView tasks={tasks} days={visibleDays} weekDays={days} draggingId={draggingId}
            onDrop={handleDropOnDay} onDragStart={setDraggingId} onDragEnd={() => setDraggingId(null)}
            onStatusChange={handleStatusChange} onDelete={handleDelete}
            onEdit={handleEditTask} onView={setViewingTask} onAddTask={handleAddTask} />
        )}

        {activeTab === 'timeline' && (
          <TimelineView tasks={tasks} days={days}
            onView={setViewingTask} onEdit={handleEditTask} onDelete={handleDelete}
            onStatusChange={handleStatusChange} onAddTask={handleAddTask} />
        )}

        {activeTab === 'calendario' && (
          <MonthView tasks={tasks} onView={setViewingTask} onEdit={handleEditTask}
            onDelete={handleDelete} onStatusChange={handleStatusChange} onAddTask={handleAddTask} />
        )}

        {activeTab === 'lista' && (
          <ListView tasks={tasks} onView={setViewingTask} onEdit={handleEditTask}
            onDelete={handleDelete} onStatusChange={handleStatusChange} onNewTask={handleNewTask} />
        )}
      </div>

      {/* ── Modais ─────────────────────────────────────────────────────── */}
      <TaskDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditingTask(null) }}
        prefillDate={prefillDate} clients={clients} members={activeMembers}
        editingTask={editingTask} onCreate={handleCreate} onUpdate={handleUpdate} />

      <TaskViewModal task={viewingTask} members={activeMembers} open={!!viewingTask}
        onClose={() => setViewingTask(null)}
        onStatusChange={handleStatusChange}
        onEdit={task => { setViewingTask(null); handleEditTask(task) }}
        onDelete={id => { setViewingTask(null); handleDelete(id) }} />

      <TemplatesManagerModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
    </div>
  )
}
