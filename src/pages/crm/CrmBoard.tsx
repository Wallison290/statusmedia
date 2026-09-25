// ── CRM — funil comercial em kanban ──────────────────────────────────────────
// Colunas personalizáveis (nome, cor, ordem, tipo de etapa) e cards de lead que
// se movem entre elas arrastando. No mobile, o menu "mover para" do card faz o
// mesmo trabalho — arrastar em tela de toque é ruim demais para ser a única via.

import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, MoreVertical, Pencil, Trash2, Check, ChevronLeft, ChevronRight,
  LayoutTemplate, MessageCircle, Building2, CalendarClock, Flame, Loader2, Target,
  GripVertical, Archive, ArchiveRestore, Sparkles, Hourglass,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import {
  useCrmColumns, useCrmLeads, useCreateCrmColumn, useUpdateCrmColumn,
  useDeleteCrmColumn, useReorderCrmColumns, useMoveCrmLead,
} from '@/hooks/useCrm'
import { useArchiveCrmLead } from '@/hooks/useCrmActivities'
import { CrmLeadModal } from '@/components/crm/CrmLeadModal'
import { CrmTemplatePicker } from '@/components/crm/CrmTemplatePicker'
import { CrmHeader } from '@/components/crm/CrmHeader'
import { CrmLostReasonDialog } from '@/components/crm/CrmLostReason'
import { CrmAssistant } from '@/components/crm/CrmAssistant'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtBRL, todayISO, fmtShortDate, onlyDigits } from '@/utils/crm'
import { CRM_COLUMN_COLORS } from '@/data/crmTemplates'
import type { CrmColumn, CrmLead, CrmStageType } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEMP_COLOR: Record<string, string> = {
  frio:   '#4F8EF7',
  morno:  '#F5A623',
  quente: '#ef4444',
}

const STAGE_LABEL: Record<CrmStageType, string> = {
  normal:  'Etapa normal',
  ganho:   'Etapa de ganho',
  perdido: 'Etapa de perda',
}

// A partir de quantos dias na mesma etapa o card ganha o selo de "parado"
const STALE_DAYS = 7

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// ── Card do lead ──────────────────────────────────────────────────────────────

interface LeadCardProps {
  lead:        CrmLead
  columns:     CrmColumn[]
  memberName:  string | null
  onOpen:      () => void
  onMoveTo:    (columnId: string) => void
  onArchive:   () => void
}

function LeadCard({ lead, columns, memberName, onOpen, onMoveTo, onArchive }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  const [menuOpen, setMenuOpen] = useState(false)

  const late = lead.next_contact_at != null && lead.next_contact_at < todayISO()
  // Parado só conta no meio do funil: ganho e perdido já terminaram
  const stage = columns.find(c => c.id === lead.column_id)?.stage_type
  const idle  = stage === 'normal' && lead.stage_entered_at ? daysSince(lead.stage_entered_at) : 0

  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: 'none', background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}
      className={`relative rounded-xl border p-3 select-none transition-opacity
        ${isDragging ? 'opacity-30' : 'hover:border-[#2563EB]/40'}`}
    >
      {/* A área de arrasto é só o corpo do card; os botões ficam fora dela para
          o clique não ser engolido pelo sensor de drag. */}
      <div
        {...listeners}
        {...attributes}
        onClick={onOpen}
        className="cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start gap-2 pr-6">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold leading-snug truncate" style={{ color: 'var(--sm-text-1)' }}>
              {lead.name}
            </p>
            {lead.company && (
              <p className="flex items-center gap-1 text-[11px] mt-0.5 truncate" style={{ color: 'var(--sm-text-3)' }}>
                <Building2 className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{lead.company}</span>
              </p>
            )}
          </div>
          {lead.temperature && (
            <Flame className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: TEMP_COLOR[lead.temperature] }} />
          )}
        </div>

        {/* Prévia das observações — o que foi conversado é o que importa na
            hora de bater o olho no funil. */}
        {lead.notes && (
          <p
            className="mt-2 text-[11px] leading-snug line-clamp-2 rounded-md px-2 py-1.5"
            style={{ color: 'var(--sm-text-2)', background: 'var(--sm-bg-alt)' }}
          >
            {lead.notes}
          </p>
        )}

        {/* Rodapé: valor, próximo contato, responsável */}
        {(lead.estimated_value != null || lead.next_contact_at || memberName || lead.source || idle >= STALE_DAYS) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {idle >= STALE_DAYS && (
              <span className="flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-md leading-none"
                    style={{ color: '#F5A623', background: 'rgba(245,166,35,0.12)' }}
                    title={`Na mesma etapa há ${idle} dias`}>
                <Hourglass className="w-2.5 h-2.5" />
                {idle}d
              </span>
            )}
            {lead.estimated_value != null && (
              <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md leading-none"
                    style={{ color: '#22C55E', background: 'rgba(34,197,94,0.12)' }}>
                {fmtBRL(lead.estimated_value)}
              </span>
            )}
            {lead.next_contact_at && (
              <span
                className="flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-md leading-none"
                style={late
                  ? { color: '#f87171', background: 'rgba(239,68,68,0.12)' }
                  : { color: 'var(--sm-text-3)', background: 'var(--sm-bg-alt)' }}
                title={late ? 'Contato atrasado' : 'Próximo contato'}
              >
                <CalendarClock className="w-2.5 h-2.5" />
                {fmtShortDate(lead.next_contact_at)}
              </span>
            )}
            {lead.source && (
              <span className="text-[10.5px] px-1.5 py-0.5 rounded-md leading-none"
                    style={{ color: 'var(--sm-text-3)', background: 'var(--sm-bg-alt)' }}>
                {lead.source}
              </span>
            )}
            {memberName && (
              <span className="text-[10.5px] px-1.5 py-0.5 rounded-md leading-none"
                    style={{ color: '#4F8EF7', background: 'rgba(79,142,247,0.12)' }}>
                {memberName}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Menu do card */}
      <button
        onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
        className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-black/20"
        aria-label="Ações do lead"
      >
        <MoreVertical className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div
            className="absolute right-2 top-8 z-40 w-48 rounded-xl border py-1 shadow-2xl max-h-64 overflow-y-auto"
            style={{ background: 'var(--sm-bg-card2)', borderColor: 'var(--sm-border)' }}
          >
            {lead.whatsapp && (
              <a
                href={`https://wa.me/55${onlyDigits(lead.whatsapp)}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-white/5"
                style={{ color: 'var(--sm-text-2)' }}
              >
                <MessageCircle className="w-3 h-3" /> Abrir WhatsApp
              </a>
            )}
            <button
              onClick={() => { setMenuOpen(false); onOpen() }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-white/5"
              style={{ color: 'var(--sm-text-2)' }}
            >
              <Pencil className="w-3 h-3" /> Abrir ficha
            </button>
            <button
              onClick={() => { setMenuOpen(false); onArchive() }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-white/5"
              style={{ color: 'var(--sm-text-2)' }}
            >
              <Archive className="w-3 h-3" /> Arquivar
            </button>

            <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--sm-text-4)' }}>
              Mover para
            </div>
            {columns.filter(c => c.id !== lead.column_id).map(c => (
              <button
                key={c.id}
                onClick={() => { setMenuOpen(false); onMoveTo(c.id) }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-white/5 text-left"
                style={{ color: 'var(--sm-text-2)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Coluna ────────────────────────────────────────────────────────────────────

interface ColumnProps {
  column:      CrmColumn
  leads:       CrmLead[]
  columns:     CrmColumn[]
  memberOf:    (id: string | null) => string | null
  onAddLead:   () => void
  onOpenLead:  (lead: CrmLead) => void
  onMoveLead:  (lead: CrmLead, columnId: string) => void
  onArchiveLead: (lead: CrmLead) => void
  onRename:    (name: string) => void
  onRecolor:   (color: string) => void
  onStageType: (t: CrmStageType) => void
  onDelete:    () => void
  onShift:     (dir: -1 | 1) => void
  isFirst:     boolean
  isLast:      boolean
}

function Column({
  column, leads, columns, memberOf, onAddLead, onOpenLead, onMoveLead, onArchiveLead,
  onRename, onRecolor, onStageType, onDelete, onShift, isFirst, isLast,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}` })

  // A coluna inteira é solta em `col-<id>`; quem é arrastado é a alça do
  // cabeçalho, com prefixo próprio para o drop distinguir card de coluna.
  const {
    attributes: colAttrs, listeners: colListeners,
    setNodeRef: setHandleRef, isDragging: colDragging,
  } = useDraggable({ id: `colh-${column.id}` })

  const [menuOpen, setMenuOpen]   = useState(false)
  const [editing, setEditing]     = useState(false)
  const [draftName, setDraftName] = useState(column.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.select(), 30) }, [editing])

  const total = leads.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0)

  function commitRename() {
    const name = draftName.trim()
    if (name && name !== column.name) onRename(name)
    else setDraftName(column.name)
    setEditing(false)
  }

  return (
    <div className={`flex flex-col w-[280px] flex-shrink-0 h-full transition-opacity ${colDragging ? 'opacity-40' : ''}`}>
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 px-1 pb-2">
        {/* Alça de arrasto da coluna */}
        <button
          ref={setHandleRef}
          {...colListeners}
          {...colAttrs}
          style={{ touchAction: 'none' }}
          className="w-4 h-5 -ml-1 flex items-center justify-center flex-shrink-0 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 transition-opacity"
          title="Arraste para reordenar a etapa"
          aria-label={`Reordenar a etapa ${column.name}`}
        >
          <GripVertical className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
        </button>

        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: column.color }} />

        {editing ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setDraftName(column.name); setEditing(false) }
            }}
            className="flex-1 min-w-0 h-6 px-1.5 rounded-md text-[12.5px] font-semibold border focus:outline-none"
            style={{ background: 'var(--sm-bg-input)', borderColor: '#2563EB', color: 'var(--sm-text-1)' }}
          />
        ) : (
          <button
            onDoubleClick={() => { setDraftName(column.name); setEditing(true) }}
            className="flex-1 min-w-0 text-left"
            title="Duplo clique para renomear"
          >
            <span className="text-[12.5px] font-semibold truncate block" style={{ color: 'var(--sm-text-1)' }}>
              {column.name}
            </span>
          </button>
        )}

        <span className="text-[11px] px-1.5 rounded-full leading-[18px] flex-shrink-0"
              style={{ color: 'var(--sm-text-3)', background: 'var(--sm-bg-alt)' }}>
          {leads.length}
        </span>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/5"
            aria-label={`Ações da coluna ${column.name}`}
          >
            <MoreVertical className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div
                className="absolute right-0 top-7 z-40 w-56 rounded-xl border py-1.5 shadow-2xl"
                style={{ background: 'var(--sm-bg-card2)', borderColor: 'var(--sm-border)' }}
              >
                <button
                  onClick={() => { setMenuOpen(false); setDraftName(column.name); setEditing(true) }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-white/5"
                  style={{ color: 'var(--sm-text-2)' }}
                >
                  <Pencil className="w-3 h-3" /> Renomear
                </button>

                {/* Cor */}
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--sm-text-4)' }}>Cor</div>
                <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                  {CRM_COLUMN_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => onRecolor(c)}
                      className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ background: c, borderColor: c === column.color ? 'var(--sm-text-1)' : 'transparent' }}
                      aria-label={`Cor ${c}`}
                    />
                  ))}
                </div>

                {/* Tipo de etapa */}
                <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--sm-text-4)' }}>Tipo</div>
                {(['normal', 'ganho', 'perdido'] as CrmStageType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => { onStageType(t); setMenuOpen(false) }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-white/5"
                    style={{ color: 'var(--sm-text-2)' }}
                  >
                    {column.stage_type === t
                      ? <Check className="w-3 h-3" style={{ color: '#22C55E' }} />
                      : <span className="w-3" />}
                    {STAGE_LABEL[t]}
                  </button>
                ))}

                <div className="my-1 h-px" style={{ background: 'var(--sm-border)' }} />

                <button
                  disabled={isFirst}
                  onClick={() => { onShift(-1); setMenuOpen(false) }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-white/5 disabled:opacity-30"
                  style={{ color: 'var(--sm-text-2)' }}
                >
                  <ChevronLeft className="w-3 h-3" /> Mover para a esquerda
                </button>
                <button
                  disabled={isLast}
                  onClick={() => { onShift(1); setMenuOpen(false) }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-white/5 disabled:opacity-30"
                  style={{ color: 'var(--sm-text-2)' }}
                >
                  <ChevronRight className="w-3 h-3" /> Mover para a direita
                </button>

                <div className="my-1 h-px" style={{ background: 'var(--sm-border)' }} />

                <button
                  onClick={() => { setMenuOpen(false); onDelete() }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-red-500/10"
                  style={{ color: '#f87171' }}
                >
                  <Trash2 className="w-3 h-3" /> Excluir coluna
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Barra de cor + total */}
      <div className="px-1 pb-2 flex items-center justify-between">
        <div className="h-[3px] rounded-full flex-1 mr-2" style={{ background: column.color, opacity: 0.5 }} />
        {total > 0 && (
          <span className="text-[10.5px] font-medium" style={{ color: 'var(--sm-text-3)' }}>{fmtBRL(total)}</span>
        )}
      </div>

      {/* Área dos cards — o botão fica fora da parte que rola, para continuar
          alcançável quando a coluna enche. A zona de drop é o bloco inteiro. */}
      <div
        ref={setNodeRef}
        className="flex-1 min-h-0 flex flex-col gap-2 rounded-xl p-2 transition-colors border border-dashed"
        style={{
          background:  isOver ? 'rgba(37,99,235,0.06)' : 'var(--sm-bg-alt)',
          borderColor: isOver ? 'rgba(37,99,235,0.5)'  : 'transparent',
        }}
      >
        <button
          onClick={onAddLead}
          className="flex-shrink-0 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] border border-dashed transition-colors hover:border-[#2563EB]/50"
          style={{ color: 'var(--sm-text-3)', borderColor: 'var(--sm-border)' }}
        >
          <Plus className="w-3 h-3" /> Lead
        </button>

        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
          <AnimatePresence initial={false}>
            {leads.map(lead => (
              <motion.div
                key={lead.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <LeadCard
                  lead={lead}
                  columns={columns}
                  memberName={memberOf(lead.responsible_user_id)}
                  onOpen={() => onOpenLead(lead)}
                  onMoveTo={colId => onMoveLead(lead, colId)}
                  onArchive={() => onArchiveLead(lead)}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {leads.length === 0 && (
            <p className="text-[11px] text-center py-6" style={{ color: 'var(--sm-text-4)' }}>
              Nenhum lead aqui
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export function CrmBoard() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const { data: columns = [], isLoading: loadingCols } = useCrmColumns()
  const { data: leads = [],   isLoading: loadingLeads } = useCrmLeads()
  const { data: members = [] } = useTeamMembers()

  const createColumn  = useCreateCrmColumn()
  const updateColumn  = useUpdateCrmColumn()
  const deleteColumn  = useDeleteCrmColumn()
  const reorderCols   = useReorderCrmColumns()
  const moveLead      = useMoveCrmLead()
  const archiveLead   = useArchiveCrmLead()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch]           = useState('')
  const [filterMember, setFilterMember] = useState('')
  const [dragging, setDragging]       = useState<CrmLead | null>(null)
  const [draggingCol, setDraggingCol] = useState<CrmColumn | null>(null)
  const [modalLead, setModalLead]     = useState<CrmLead | null>(null)
  const [modalColumn, setModalColumn] = useState<string | null>(null)
  const [modalOpen, setModalOpen]     = useState(false)
  const [pickerOpen, setPickerOpen]   = useState(false)
  const [deleting, setDeleting]       = useState<CrmColumn | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string>('')
  const [quick, setQuick]             = useState<'todos' | 'retornos' | 'quentes'>('todos')
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  // Movimento para etapa de perda fica em espera até a pessoa dizer o motivo
  const [pendingLost, setPendingLost] = useState<{ lead: CrmLead; toColumnId: string } | null>(null)

  // Arquivado some do board, mas continua na lista (relatório e restauração)
  const activeLeads   = useMemo(() => leads.filter(l => !l.archived_at), [leads])
  const archivedLeads = useMemo(() => leads.filter(l => l.archived_at), [leads])
  const today = todayISO()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const memberOf = useMemo(() => {
    const map = new Map(members.map(m => [m.id, m.name]))
    return (id: string | null) => (id ? map.get(id) ?? null : null)
  }, [members])

  // Leads filtrados, já agrupados por coluna e ordenados por posição
  const leadsByColumn = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = activeLeads.filter(l => {
      if (filterMember && l.responsible_user_id !== filterMember) return false
      if (quick === 'retornos' && !(l.next_contact_at && l.next_contact_at <= today)) return false
      if (quick === 'quentes' && l.temperature !== 'quente') return false
      if (!term) return true
      return (
        l.name.toLowerCase().includes(term) ||
        (l.company  ?? '').toLowerCase().includes(term) ||
        (l.notes    ?? '').toLowerCase().includes(term) ||
        (l.whatsapp ?? '').toLowerCase().includes(term)
      )
    })
    const map = new Map<string, CrmLead[]>()
    for (const c of columns) map.set(c.id, [])
    for (const l of filtered) map.get(l.column_id)?.push(l)
    // Desempate por data: leads recém-criados nascem todos na posição 0, e sem
    // isso a ordem entre eles ficaria a critério do banco a cada refetch.
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position || b.created_at.localeCompare(a.created_at))
    }
    return map
  }, [activeLeads, columns, search, filterMember, quick, today])

  // Números do topo: valor em aberto e taxa de conversão
  const stats = useMemo(() => {
    const wonIds  = new Set(columns.filter(c => c.stage_type === 'ganho').map(c => c.id))
    const lostIds = new Set(columns.filter(c => c.stage_type === 'perdido').map(c => c.id))
    const open = activeLeads.filter(l => !wonIds.has(l.column_id) && !lostIds.has(l.column_id))
    const won  = activeLeads.filter(l =>  wonIds.has(l.column_id))
    const lost = activeLeads.filter(l =>  lostIds.has(l.column_id))
    const closed = won.length + lost.length
    return {
      openCount:  open.length,
      openValue:  open.reduce((s, l) => s + (l.estimated_value ?? 0), 0),
      wonCount:   won.length,
      wonValue:   won.reduce((s, l) => s + (l.estimated_value ?? 0), 0),
      conversion: closed > 0 ? Math.round((won.length / closed) * 100) : null,
      followups:  open.filter(l => l.next_contact_at && l.next_contact_at <= today).length,
    }
  }, [activeLeads, columns, today])

  // Link da notificação ou do WhatsApp: /crm?lead=<id> abre a ficha direto
  useEffect(() => {
    const id = searchParams.get('lead')
    if (!id || loadingLeads) return
    const target = leads.find(l => l.id === id)
    if (target) {
      setModalLead(target)
      setModalColumn(target.column_id)
      setModalOpen(true)
    }
    searchParams.delete('lead')
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, leads, loadingLeads, setSearchParams])

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  // O board tem dois tipos de arrasto no mesmo DndContext: card de lead
  // (id = uuid do lead) e alça de coluna (id = 'colh-<uuid>'). O prefixo é o
  // que separa os dois no drop.

  function handleDragStart(e: DragStartEvent) {
    const activeId = String(e.active.id)
    if (activeId.startsWith('colh-')) {
      setDraggingCol(columns.find(c => c.id === activeId.slice(5)) ?? null)
    } else {
      setDragging(leads.find(l => l.id === e.active.id) ?? null)
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    const activeId  = String(e.active.id)
    const draggedCol = draggingCol
    setDragging(null)
    setDraggingCol(null)

    const overId = e.over?.id
    if (!overId || typeof overId !== 'string' || !overId.startsWith('col-')) return
    const targetColumnId = overId.slice(4)

    // Reordenação de coluna
    if (activeId.startsWith('colh-')) {
      const from = columns.findIndex(c => c.id === (draggedCol?.id ?? activeId.slice(5)))
      const to   = columns.findIndex(c => c.id === targetColumnId)
      if (from < 0 || to < 0 || from === to) return
      const next = [...columns]
      next.splice(to, 0, next.splice(from, 1)[0])
      reorderCols.mutate(next)
      return
    }

    // Movimentação de lead
    const lead = leads.find(l => l.id === activeId)
    if (!lead || lead.column_id === targetColumnId) return
    applyMove(lead, targetColumnId)
  }

  /** Move o card e reescreve a ordem da coluna de destino num só lugar,
   *  para o arrasto e o menu "mover para" se comportarem igual. */
  function applyMove(lead: CrmLead, toColumnId: string) {
    const target = columns.find(c => c.id === toColumnId)
    if (target?.stage_type === 'perdido') {
      setPendingLost({ lead, toColumnId })
      return
    }
    doMove(lead, toColumnId)
  }

  function doMove(lead: CrmLead, toColumnId: string, lostReason?: string | null) {
    // Usa `leads` cru, não a lista filtrada da tela: com busca ativa, reordenar
    // só o que está visível deixaria os leads escondidos com posição repetida.
    const destination = leads
      .filter(l => l.column_id === toColumnId && l.id !== lead.id)
      .sort((a, b) => a.position - b.position || b.created_at.localeCompare(a.created_at))
    const leadIds = [lead.id, ...destination.map(l => l.id)]   // entra no topo da coluna

    moveLead.mutate(
      { leadId: lead.id, toColumnId, leadIds, lostReason },
      { onError: (err: any) => toast(err.message ?? 'Não consegui mover o lead', 'error') },
    )
  }

  // ── Colunas ─────────────────────────────────────────────────────────────────

  async function handleAddColumn() {
    try {
      await createColumn.mutateAsync({
        name:     'Nova etapa',
        color:    CRM_COLUMN_COLORS[columns.length % CRM_COLUMN_COLORS.length],
        position: columns.length,
      })
    } catch (err: any) {
      toast(err.message ?? 'Erro ao criar a coluna', 'error')
    }
  }

  function shiftColumn(col: CrmColumn, dir: -1 | 1) {
    const idx = columns.findIndex(c => c.id === col.id)
    const target = idx + dir
    if (target < 0 || target >= columns.length) return
    const next = [...columns]
    next.splice(target, 0, next.splice(idx, 1)[0])
    reorderCols.mutate(next)
  }

  async function confirmDeleteColumn() {
    if (!deleting) return
    try {
      await deleteColumn.mutateAsync({ id: deleting.id, moveLeadsTo: deleteTarget || null })
      toast('Coluna excluída', 'success')
      setDeleting(null)
    } catch (err: any) {
      toast(err.message ?? 'Erro ao excluir a coluna', 'error')
    }
  }

  // ── Converter em cliente ────────────────────────────────────────────────────
  // Leva os dados do lead para o cadastro de cliente e marca a conversão. O
  // cadastro em si continua sendo feito na tela de clientes, que já valida tudo.

  function handleConvert(lead: CrmLead) {
    // `from_lead` é o que faz o cadastro gravar converted_client_id de volta
    // no lead depois que o cliente é criado de fato.
    const params = new URLSearchParams({
      from_lead:        lead.id,
      company_name:     lead.company ?? lead.name,
      responsible_name: lead.name,
      ...(lead.whatsapp  ? { whatsapp:  lead.whatsapp  } : {}),
      ...(lead.email     ? { email:     lead.email     } : {}),
      ...(lead.instagram ? { instagram: lead.instagram } : {}),
    })
    setModalOpen(false)
    navigate(`/clients/new?${params.toString()}`)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const loading = loadingCols || loadingLeads
  const empty   = !loading && columns.length === 0

  function openNewLead(columnId: string) {
    setModalLead(null)
    setModalColumn(columnId)
    setModalOpen(true)
  }

  function openLead(lead: CrmLead) {
    setModalLead(lead)
    setModalColumn(lead.column_id)
    setModalOpen(true)
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--sm-bg-page)' }}>
      <CrmHeader
        subtitle={columns.length === 0
          ? 'Funil comercial da agência'
          : `${activeLeads.length} ${activeLeads.length === 1 ? 'lead' : 'leads'} · ${columns.length} ${columns.length === 1 ? 'etapa' : 'etapas'}`}
        actions={columns.length > 0 && (
          <>
            <Button size="sm" variant="outline" onClick={() => setAssistantOpen(true)}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} /> Perguntar à IA
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              <LayoutTemplate className="w-3.5 h-3.5" /> Modelos
            </Button>
            <Button size="sm" onClick={() => openNewLead(columns[0].id)}>
              <Plus className="w-3.5 h-3.5" /> Novo lead
            </Button>
          </>
        )}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sm-text-3)' }} />
        </div>
      ) : empty ? (
        // ── Board vazio: convida a escolher um modelo ──
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
               style={{ background: 'rgba(37,99,235,0.12)' }}>
            <Target className="w-6 h-6" style={{ color: '#4F8EF7' }} />
          </div>
          <h2 className="text-[15px] font-semibold mb-1" style={{ color: 'var(--sm-text-1)' }}>
            Monte seu funil comercial
          </h2>
          <p className="text-[12.5px] max-w-md mb-5" style={{ color: 'var(--sm-text-3)' }}>
            Escolha um processo pronto ou comece do zero. As colunas são suas: dá para
            renomear, mudar a cor e reordenar quando quiser.
          </p>
          <Button onClick={() => setPickerOpen(true)}>
            <LayoutTemplate className="w-3.5 h-3.5" /> Escolher modelo de funil
          </Button>
        </div>
      ) : (
        <>
          {/* Barra de números + filtros */}
          <div className="px-4 sm:px-6 pt-3 pb-2 flex flex-wrap items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11.5px] px-2 py-1 rounded-lg"
                    style={{ background: 'var(--sm-bg-card)', color: 'var(--sm-text-2)' }}>
                <strong style={{ color: 'var(--sm-text-1)' }}>{stats.openCount}</strong> em aberto
                {stats.openValue > 0 && <> · {fmtBRL(stats.openValue)}</>}
              </span>
              <span className="text-[11.5px] px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(34,197,94,0.10)', color: '#22C55E' }}>
                <strong>{stats.wonCount}</strong> ganhos
                {stats.wonValue > 0 && <> · {fmtBRL(stats.wonValue)}</>}
              </span>
              {stats.conversion !== null && (
                <span className="text-[11.5px] px-2 py-1 rounded-lg"
                      style={{ background: 'var(--sm-bg-card)', color: 'var(--sm-text-2)' }}>
                  Conversão <strong style={{ color: 'var(--sm-text-1)' }}>{stats.conversion}%</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              {([
                ['todos',    'Todos'],
                ['retornos', `Retornos de hoje${stats.followups ? ` (${stats.followups})` : ''}`],
                ['quentes',  'Quentes'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setQuick(id)}
                  className="text-[11.5px] px-2 h-7 rounded-lg border transition-colors"
                  style={{
                    borderColor: quick === id ? '#2563EB' : 'var(--sm-border)',
                    background:  quick === id ? 'rgba(37,99,235,0.12)' : 'transparent',
                    color:       quick === id ? '#4F8EF7' : 'var(--sm-text-3)',
                  }}
                >
                  {label}
                </button>
              ))}
              {archivedLeads.length > 0 && (
                <button
                  onClick={() => setArchivedOpen(true)}
                  className="flex items-center gap-1 text-[11.5px] px-2 h-7 rounded-lg transition-colors hover:opacity-100 opacity-70"
                  style={{ color: 'var(--sm-text-3)' }}
                >
                  <Archive className="w-3 h-3" /> Arquivados ({archivedLeads.length})
                </button>
              )}
            </div>

            <div className="flex-1" />

            <div className="w-full sm:w-56">
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar lead, empresa, observação..."
                icon={<Search className="w-3.5 h-3.5" />}
                className="h-8"
              />
            </div>

            {members.filter(m => m.is_active).length > 0 && (
              <select
                value={filterMember}
                onChange={e => setFilterMember(e.target.value)}
                className="h-8 rounded-md border px-2 text-[12px] [color-scheme:dark]"
                style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}
              >
                <option value="">Todos os responsáveis</option>
                {members.filter(m => m.is_active).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}

          </div>

          {/* Board */}
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-4 sm:px-6 pb-5">
              <div className="flex gap-3 h-full min-h-0 items-stretch">
                {columns.map((col, i) => (
                  <Column
                    key={col.id}
                    column={col}
                    columns={columns}
                    leads={leadsByColumn.get(col.id) ?? []}
                    memberOf={memberOf}
                    isFirst={i === 0}
                    isLast={i === columns.length - 1}
                    onAddLead={() => openNewLead(col.id)}
                    onOpenLead={openLead}
                    onMoveLead={applyMove}
                    onArchiveLead={lead => archiveLead.mutate(
                      { id: lead.id, archived: true },
                      {
                        onSuccess: () => toast('Lead arquivado. Ele continua nos relatórios.', 'success'),
                        onError:   (err: any) => toast(err.message ?? 'Erro ao arquivar', 'error'),
                      },
                    )}
                    onRename={name => updateColumn.mutate({ id: col.id, name })}
                    onRecolor={color => updateColumn.mutate({ id: col.id, color })}
                    onStageType={stage_type => updateColumn.mutate({ id: col.id, stage_type })}
                    onShift={dir => shiftColumn(col, dir)}
                    onDelete={() => {
                      setDeleting(col)
                      setDeleteTarget(columns.find(c => c.id !== col.id)?.id ?? '')
                    }}
                  />
                ))}

                {/* Adicionar coluna */}
                <button
                  onClick={handleAddColumn}
                  disabled={createColumn.isPending}
                  className="w-[180px] flex-shrink-0 self-start mt-7 h-11 rounded-xl border border-dashed flex items-center justify-center gap-1.5 text-[12px] transition-colors hover:border-[#2563EB]/50"
                  style={{ color: 'var(--sm-text-3)', borderColor: 'var(--sm-border)' }}
                >
                  {createColumn.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Plus className="w-3.5 h-3.5" />}
                  Nova coluna
                </button>
              </div>
            </div>

            <DragOverlay dropAnimation={null}>
              {dragging && (
                <div
                  className="rounded-xl border p-3 shadow-2xl w-[264px] rotate-2"
                  style={{ background: 'var(--sm-bg-card)', borderColor: '#2563EB' }}
                >
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>
                    {dragging.name}
                  </p>
                  {dragging.company && (
                    <p className="text-[11px] truncate" style={{ color: 'var(--sm-text-3)' }}>{dragging.company}</p>
                  )}
                </div>
              )}

              {draggingCol && (
                <div
                  className="flex items-center gap-2 rounded-xl border px-3 py-2 shadow-2xl w-[240px] rotate-1"
                  style={{ background: 'var(--sm-bg-card)', borderColor: draggingCol.color }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: draggingCol.color }} />
                  <span className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>
                    {draggingCol.name}
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {/* Modal do lead */}
      <CrmLeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        lead={modalLead}
        columns={columns}
        columnId={modalColumn ?? columns[0]?.id ?? ''}
        onConvert={handleConvert}
      />

      {/* Motivo de perda */}
      <CrmLostReasonDialog
        open={!!pendingLost}
        leadName={pendingLost?.lead.name ?? ''}
        onCancel={() => setPendingLost(null)}
        onConfirm={reason => {
          if (pendingLost) doMove(pendingLost.lead, pendingLost.toColumnId, reason)
          setPendingLost(null)
        }}
      />

      {/* Arquivados */}
      <Dialog open={archivedOpen} onOpenChange={setArchivedOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Leads arquivados</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] -mt-2" style={{ color: 'var(--sm-text-3)' }}>
            Fora do funil, mas ainda contam nos relatórios. Restaure para voltar à etapa em que estavam.
          </p>
          <ul className="space-y-1.5">
            {archivedLeads.map(l => (
              <li key={l.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--sm-bg-alt)' }}>
                <button className="min-w-0 flex-1 text-left" onClick={() => { setArchivedOpen(false); openLead(l) }}>
                  <p className="text-[12.5px] truncate" style={{ color: 'var(--sm-text-1)' }}>{l.name}</p>
                  <p className="text-[10.5px]" style={{ color: 'var(--sm-text-4)' }}>
                    {columns.find(c => c.id === l.column_id)?.name ?? 'sem etapa'}
                    {l.company ? ` · ${l.company}` : ''}
                  </p>
                </button>
                <Button size="sm" variant="outline" onClick={() => archiveLead.mutate({ id: l.id, archived: false })}>
                  <ArchiveRestore className="w-3 h-3" /> Restaurar
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Assistente de IA */}
      <CrmAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        leads={activeLeads}
        columns={columns}
        memberOf={memberOf}
      />

      {/* Modelos de funil */}
      <CrmTemplatePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        empty={empty}
        offset={columns.length}
      />

      {/* Confirmação de exclusão de coluna */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
             onClick={() => setDeleting(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border p-5"
            style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--sm-text-1)' }}>
              Excluir "{deleting.name}"
            </h3>

            {/* Conta os arquivados também: eles moram na coluna e iriam junto */}
            {leads.some(l => l.column_id === deleting.id) ? (
              <>
                <p className="text-[12px] mb-3" style={{ color: 'var(--sm-text-3)' }}>
                  Esta coluna tem {leads.filter(l => l.column_id === deleting.id).length} lead(s), contando os arquivados. Para onde eles vão?
                </p>
                <select
                  value={deleteTarget}
                  onChange={e => setDeleteTarget(e.target.value)}
                  className="w-full h-9 rounded-md border px-2 text-[13px] mb-4 [color-scheme:dark]"
                  style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}
                >
                  {columns.filter(c => c.id !== deleting.id).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  <option value="">Excluir os leads junto</option>
                </select>
              </>
            ) : (
              <p className="text-[12px] mb-4" style={{ color: 'var(--sm-text-3)' }}>
                A coluna está vazia. Pode excluir sem perder nada.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={confirmDeleteColumn} disabled={deleteColumn.isPending}>
                {deleteColumn.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
