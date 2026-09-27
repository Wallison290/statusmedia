import { useState, useRef, useEffect } from 'react'
import {
  Plus, NotebookPen, Trash2, Check, X, GripVertical, StickyNote,
  Filter, Building2, Tag,
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useNotes, useCreateNote, useUpdateNote, useDeleteNote,
  type NotesFilter, type CreateNotePayload, type UpdateNotePayload,
} from '@/hooks/useNotes'
import { useClients } from '@/hooks/useClients'
import { useToast } from '@/components/ui/toast'
import type { Note, NoteChecklistItem, NoteType, NoteOrigin } from '@/types'

// ─── Configs ──────────────────────────────────────────────────────────────────

const typeLabels: Record<NoteType, string> = {
  interna:    'Interna',
  ideia:      'Ideia',
  solicitacao: 'Solicitação',
}
// badge colors são resolvidos em runtime via useTheme dentro do NoteCard
const typeBadgeColorsDark: Record<NoteType, string> = {
  interna:    'bg-[#1e293b] text-[#94a3b8]',
  ideia:      'bg-amber-500/10 text-amber-300',
  solicitacao: 'bg-[#2563EB]/15 text-[#60A5FA]',
}
const typeBadgeColorsLight: Record<NoteType, string> = {
  interna:    'bg-slate-200 text-slate-600',
  ideia:      'bg-amber-100 text-amber-700',
  solicitacao: 'bg-blue-100 text-blue-700',
}
const originLabels: Record<NoteOrigin, string> = {
  agency: 'Agência',
  client: 'Cliente',
}

function newItem(text = ''): NoteChecklistItem {
  return { id: crypto.randomUUID(), text, done: false }
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

export function NoteCard({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const doneCount = note.checklist.filter(i => i.done).length
  const preview = note.content?.slice(0, 100) || ''
  const { isDark } = useTheme()
  const badgeColors = isDark ? typeBadgeColorsDark : typeBadgeColorsLight

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={onOpen}
      className="group rounded-2xl p-4 cursor-pointer transition-all duration-150 select-none border"
      style={{
        background: 'var(--sm-bg-card)',
        borderColor: 'var(--sm-border)',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(37,99,235,0.4)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--sm-bg-alt)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--sm-border)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--sm-bg-card)' }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-[13px] font-semibold leading-snug line-clamp-2 flex-1" style={{ color: 'var(--sm-text-1)' }}>
          {note.title || 'Sem título'}
        </h3>
        <NotebookPen className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 transition-colors" style={{ color: 'var(--sm-text-3)' }} />
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${badgeColors[note.type]}`}>
          {typeLabels[note.type]}
        </span>
        {note.client && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-1" style={{ color: 'var(--sm-text-3)', background: 'var(--sm-bg-alt)' }}>
            <Building2 className="w-2.5 h-2.5" />
            {note.client.company_name}
          </span>
        )}
        {note.origin === 'client' && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-md"
            style={{ background: '#7c3aed', color: '#ffffff' }}
          >
            do cliente
          </span>
        )}
      </div>

      {preview && (
        <p className="text-[12px] leading-relaxed line-clamp-2 mb-2 whitespace-pre-wrap" style={{ color: 'var(--sm-text-3)' }}>
          {preview}
        </p>
      )}

      {note.checklist.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--sm-border)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(doneCount / note.checklist.length) * 100}%`, background: 'linear-gradient(90deg,#2563EB,#1D4ED8)' }}
            />
          </div>
          <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--sm-text-4)' }}>
            {doneCount}/{note.checklist.length}
          </span>
        </div>
      )}

      <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>
        {formatDistanceToNow(parseISO(note.updated_at), { addSuffix: true, locale: ptBR })}
      </p>
    </motion.div>
  )
}

// ─── ChecklistEditor ──────────────────────────────────────────────────────────

function ChecklistEditor({
  items,
  onChange,
}: {
  items: NoteChecklistItem[]
  onChange: (items: NoteChecklistItem[]) => void
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  function toggle(id: string) {
    onChange(items.map(i => i.id === id ? { ...i, done: !i.done } : i))
  }
  function updateText(id: string, text: string) {
    onChange(items.map(i => i.id === id ? { ...i, text } : i))
  }
  function remove(id: string) {
    onChange(items.filter(i => i.id !== id))
  }
  function addAfter(index: number) {
    const item = newItem()
    const next = [...items]
    next.splice(index + 1, 0, item)
    onChange(next)
    setTimeout(() => inputRefs.current[index + 1]?.focus(), 30)
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addAfter(index)
    } else if (e.key === 'Backspace' && items[index].text === '' && items.length > 1) {
      e.preventDefault()
      remove(items[index].id)
      setTimeout(() => inputRefs.current[Math.max(0, index - 1)]?.focus(), 30)
    }
  }

  return (
    <div className="space-y-1">
      {items.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-2 group/item">
          <GripVertical className="w-3.5 h-3.5 text-[#475569] flex-shrink-0 cursor-grab" />
          <button
            type="button"
            onClick={() => toggle(item.id)}
            className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
              item.done ? 'bg-[#2563EB] border-[#2563EB]' : 'border-[#475569] hover:border-[#64748b]'
            }`}
          >
            {item.done && <Check className="w-2.5 h-2.5" style={{ color: '#ffffff' }} />}
          </button>
          <input
            ref={el => { inputRefs.current[idx] = el }}
            value={item.text}
            onChange={e => updateText(item.id, e.target.value)}
            onKeyDown={e => handleKeyDown(e, idx)}
            placeholder="Item da lista..."
            className={`flex-1 text-[13px] bg-transparent outline-none placeholder:text-[#475569] ${
              item.done ? 'line-through text-[#64748b]' : 'text-[#E2E8F0]'
            }`}
          />
          <button
            type="button"
            onClick={() => remove(item.id)}
            className="opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 rounded hover:bg-[#1e293b]"
          >
            <X className="w-3 h-3 text-[#94a3b8]" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => { onChange([...items, newItem()]); setTimeout(() => inputRefs.current[items.length]?.focus(), 30) }}
        className="flex items-center gap-1.5 text-[12px] text-[#64748b] hover:text-[#CBD5E1] transition-colors mt-1"
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar item
      </button>
    </div>
  )
}

// ─── NoteModal ────────────────────────────────────────────────────────────────

export function NoteModal({
  note,
  clients,
  defaultClientId,
  onClose,
}: {
  note: Note | null
  clients: { id: string; company_name: string }[]
  defaultClientId?: string | null
  onClose: () => void
}) {
  const isNew = !note
  const [title, setTitle]         = useState(note?.title ?? '')
  const [content, setContent]     = useState(note?.content ?? '')
  const [checklist, setChecklist] = useState<NoteChecklistItem[]>(note?.checklist ?? [])
  const [clientId, setClientId]   = useState<string>(note?.client_id ?? defaultClientId ?? '')
  const [type, setType]           = useState<NoteType>(note?.type ?? 'interna')
  const [tab, setTab]             = useState<'texto' | 'checklist'>(
    note && note.checklist.length > 0 ? 'checklist' : 'texto'
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const { toast } = useToast()
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => titleRef.current?.focus(), 50) }, [])

  const saving = createNote.isPending || updateNote.isPending

  async function handleSave() {
    if (!title.trim() && !content.trim() && checklist.filter(i => i.text.trim()).length === 0) {
      onClose()
      return
    }
    try {
      const payload = {
        title:     title.trim(),
        content:   content.trim() || null,
        checklist: checklist.filter(i => i.text.trim() !== ''),
        client_id: clientId || null,
        type,
      }
      if (isNew) {
        await createNote.mutateAsync(payload as CreateNotePayload)
      } else {
        await updateNote.mutateAsync({ id: note!.id, ...payload } as UpdateNotePayload)
      }
      toast(isNew ? 'Nota criada!' : 'Nota salva!', 'success')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  async function handleDelete() {
    try {
      await deleteNote.mutateAsync(note!.id)
      toast('Nota excluída.', 'success')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={handleSave} />

      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        className="relative w-full max-w-lg bg-[#111827] rounded-2xl shadow-2xl border border-[#1e293b] flex flex-col max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-[#1e293b]">
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título da nota..."
            className="flex-1 text-[16px] font-semibold text-[#F8FAFC] bg-transparent outline-none placeholder:text-[#475569] placeholder:font-normal"
          />
          <button onClick={handleSave} className="p-1.5 rounded-lg hover:bg-[#1e293b] transition-colors">
            <X className="w-4 h-4 text-[#94a3b8]" />
          </button>
        </div>

        {/* Meta row: tipo + cliente */}
        <div className="flex items-center gap-2 px-5 pt-3 pb-1 flex-wrap">
          {/* Tipo */}
          <div className="flex items-center gap-1">
            <Tag className="w-3 h-3 text-[#64748b]" />
            <select
              value={type}
              onChange={e => setType(e.target.value as NoteType)}
              className="text-[12px] text-[#CBD5E1] bg-transparent outline-none border-none cursor-pointer [&>option]:bg-[#182233]"
            >
              <option value="interna">Interna</option>
              <option value="ideia">Ideia</option>
              <option value="solicitacao">Solicitação</option>
            </select>
          </div>

          <span className="text-[#334155]">·</span>

          {/* Cliente */}
          <div className="flex items-center gap-1">
            <Building2 className="w-3 h-3 text-[#64748b]" />
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="text-[12px] text-[#CBD5E1] bg-transparent outline-none border-none cursor-pointer max-w-[180px] truncate [&>option]:bg-[#182233]"
            >
              <option value="">Sem cliente</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 px-5 pt-2">
          {(['texto', 'checklist'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                tab === t ? 'bg-[#1e293b] text-[#F8FAFC]' : 'text-[#64748b] hover:text-[#CBD5E1]'
              }`}
            >
              {t === 'texto' ? 'Texto' : 'Checklist'}
              {t === 'checklist' && checklist.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-[#2563EB] rounded-full px-1.5 py-0.5" style={{ color: '#ffffff' }}>
                  {checklist.filter(i => i.done).length}/{checklist.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'texto' ? (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Escreva sua nota aqui..."
              rows={10}
              className="w-full text-[13px] text-[#E2E8F0] bg-transparent outline-none resize-none placeholder:text-[#475569] leading-relaxed"
            />
          ) : (
            checklist.length === 0 ? (
              <button
                type="button"
                onClick={() => setChecklist([newItem()])}
                className="flex items-center gap-2 text-[13px] text-[#64748b] hover:text-[#CBD5E1] transition-colors"
              >
                <Plus className="w-4 h-4" /> Adicionar primeiro item
              </button>
            ) : (
              <ChecklistEditor items={checklist} onChange={setChecklist} />
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#1e293b]">
          {!isNew ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#94a3b8]">Excluir nota?</span>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[12px] px-2.5 py-1 rounded-lg border border-[#1e293b] text-[#94a3b8] hover:bg-[#1e293b] transition-colors"
                >
                  Não
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteNote.isPending}
                  className="text-[12px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                  style={{ background: '#dc2626', color: '#ffffff' }}
                >
                  Sim, excluir
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-[12px] text-[#64748b] hover:text-[#f87171] transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            )
          ) : (
            <div />
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
            style={{ color: '#ffffff' }}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── NoteViewModal (somente leitura — notas enviadas pelo cliente) ─────────────

function NoteViewModal({
  note, onClose, onDelete,
}: {
  note: Note
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        className="relative w-full max-w-lg bg-[#111827] rounded-2xl shadow-2xl border border-[#1e293b] flex flex-col max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-[#1e293b]">
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-semibold text-[#F8FAFC] leading-snug break-words">{note.title || 'Sem título'}</h2>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: '#2563EB', color: '#ffffff' }}>{typeLabels[note.type]}</span>
              {note.client && (
                <span className="text-[10px] text-[#94a3b8] bg-[#182233] px-1.5 py-0.5 rounded-md flex items-center gap-1">
                  <Building2 className="w-2.5 h-2.5" /> {note.client.company_name}
                </span>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: '#7c3aed', color: '#ffffff' }}>enviada pelo cliente</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#1e293b] transition-colors flex-shrink-0">
            <X className="w-4 h-4 text-[#94a3b8]" />
          </button>
        </div>

        {/* Body (somente leitura) */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {note.content && (
            <p className="text-[13px] text-[#CBD5E1] whitespace-pre-wrap leading-relaxed">{note.content}</p>
          )}
          {note.checklist.length > 0 && (
            <div className="space-y-1.5">
              {note.checklist.map(it => (
                <div key={it.id} className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${it.done ? 'bg-emerald-500 border-emerald-500' : 'border-[#334155]'}`}>
                    {it.done && <Check className="w-2.5 h-2.5" style={{ color: '#fff' }} />}
                  </span>
                  <span className={`text-[13px] ${it.done ? 'line-through text-[#64748b]' : 'text-[#CBD5E1]'}`}>{it.text}</span>
                </div>
              ))}
            </div>
          )}
          {!note.content && note.checklist.length === 0 && (
            <p className="text-[13px] text-[#64748b]">Sem conteúdo.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#1e293b]">
          <span className="text-[11px] text-[#64748b]">🔒 Somente leitura</span>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#94a3b8]">Excluir?</span>
              <button onClick={() => setConfirmDelete(false)} className="text-[12px] px-2.5 py-1 rounded-lg border border-[#1e293b] text-[#94a3b8] hover:bg-[#1e293b]">Não</button>
              <button onClick={() => onDelete(note.id)} className="text-[12px] px-2.5 py-1 rounded-lg" style={{ background: '#dc2626', color: '#ffffff' }}>Sim</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-[12px] text-[#64748b] hover:text-[#f87171] transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
              <button onClick={onClose} className="text-[13px] font-semibold px-4 py-2 rounded-xl bg-[#1e293b] text-[#CBD5E1] hover:bg-[#334155] transition-colors">Fechar</button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ─── NotesColumn ──────────────────────────────────────────────────────────────

function NotesColumn({
  title, Icon, accent, accentLight, count, children,
}: {
  title: string; Icon: React.ElementType; accent: string; accentLight?: string; count: number; children: React.ReactNode
}) {
  const { isDark } = useTheme()
  const iconColor = isDark ? accent : (accentLight ?? accent)
  return (
    <div className="flex flex-col w-[80vw] sm:w-[300px] flex-shrink-0 h-full min-h-0 rounded-2xl border bg-[#0d1424]/50"
      style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
      <div className="flex items-center gap-2 px-3.5 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--sm-border)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${iconColor}22` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
        </div>
        <span className="text-[13px] font-semibold truncate flex-1" style={{ color: 'var(--sm-text-1)' }}>{title}</span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ color: 'var(--sm-text-3)', background: 'var(--sm-bg-card2)' }}>{count}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5">
        {children}
      </div>
    </div>
  )
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

function FilterBar({
  filter,
  clients,
  onChange,
}: {
  filter: NotesFilter
  clients: { id: string; company_name: string }[]
  onChange: (f: NotesFilter) => void
}) {
  const selectCls = "max-w-full text-[12px] text-[#CBD5E1] bg-[#182233] border border-[#1e293b] rounded-xl px-3 py-2 outline-none cursor-pointer hover:border-[#2563EB]/50 transition-colors [&>option]:bg-[#182233] [&>option]:text-[#CBD5E1]"
  return (
    <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
      {/* Funil */}
      <div className="w-9 h-9 rounded-xl bg-[#182233] border border-[#1e293b] flex items-center justify-center flex-shrink-0">
        <Filter className="w-3.5 h-3.5 text-[#94a3b8]" />
      </div>

      {/* Por cliente */}
      <select
        value={filter.client_id ?? ''}
        onChange={e => onChange({ ...filter, client_id: e.target.value || null })}
        className={selectCls}
      >
        <option value="">Todos os clientes</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
      </select>

      {/* Por tipo */}
      <select
        value={filter.type ?? ''}
        onChange={e => onChange({ ...filter, type: (e.target.value as NoteType) || null })}
        className={selectCls}
      >
        <option value="">Todos os tipos</option>
        <option value="interna">Interna</option>
        <option value="ideia">Ideia</option>
        <option value="solicitacao">Solicitação</option>
      </select>

      {/* Por origem */}
      <select
        value={filter.origin ?? ''}
        onChange={e => onChange({ ...filter, origin: (e.target.value as NoteOrigin) || null })}
        className={selectCls}
      >
        <option value="">Qualquer origem</option>
        <option value="agency">Agência</option>
        <option value="client">Cliente</option>
      </select>

      {/* Limpar filtros */}
      {(filter.client_id || filter.type || filter.origin) && (
        <button
          onClick={() => onChange({})}
          className="flex items-center gap-1 text-[12px] text-[#94a3b8] hover:text-[#f87171] transition-colors"
        >
          <X className="w-3 h-3" /> Limpar
        </button>
      )}
    </div>
  )
}

// ─── Notes page ───────────────────────────────────────────────────────────────

export function Notes() {
  const [filter, setFilter] = useState<NotesFilter>({})
  const { data: notes = [], isLoading } = useNotes(filter)
  const { data: allClients = [] } = useClients()
  const [selected, setSelected] = useState<Note | null | 'new'>(null)
  const [viewing, setViewing]   = useState<Note | null>(null)
  const deleteNote = useDeleteNote()
  const { toast } = useToast()

  const open = selected !== null
  const modalNote = selected === 'new' ? null : selected

  const clients = allClients.map(c => ({ id: c.id, company_name: c.company_name }))

  // Notas da agência + uma coluna por cliente (solicitações enviadas pelo cliente)
  const agencyNotes = notes.filter(n => n.origin !== 'client')
  const clientCols = (() => {
    const map = new Map<string, { id: string; name: string; notes: Note[] }>()
    for (const n of notes) {
      if (n.origin !== 'client') continue
      const id = n.client_id ?? 'sem'
      if (!map.has(id)) map.set(id, { id, name: n.client?.company_name ?? 'Sem cliente', notes: [] })
      map.get(id)!.notes.push(n)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  })()

  // Notas do cliente abrem em modo leitura; notas da agência abrem editáveis
  const openNote = (n: Note) => (n.origin === 'client' ? setViewing(n) : setSelected(n))

  async function handleDeleteViewing(id: string) {
    try { await deleteNote.mutateAsync(id); toast('Nota excluída.', 'success'); setViewing(null) }
    catch (e: any) { toast(e.message, 'error') }
  }

  return (
    <div className="h-full flex flex-col bg-[#0B1020]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#1e293b] bg-[#0B1020] gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-[#F8FAFC]">Notas</h1>
          <p className="text-[12px] text-[#64748b] mt-0.5">
            {notes.length} {notes.length === 1 ? 'nota' : 'notas'} · {clientCols.length} {clientCols.length === 1 ? 'cliente' : 'clientes'}
          </p>
        </div>

        {/* min-w-0 + max-w-full: sem isso um select com nome de cliente comprido
            empurra a barra para além da largura do celular */}
        <div className="flex items-center gap-3 flex-wrap min-w-0 max-w-full">
          <FilterBar filter={filter} clients={clients} onChange={setFilter} />
          <button
            onClick={() => setSelected('new')}
            className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors shadow-lg shadow-[#2563EB]/20"
            style={{ color: '#ffffff' }}
          >
            <Plus className="w-4 h-4" style={{ color: '#ffffff' }} />
            Nova nota
          </button>
        </div>
      </div>

      {/* Board de colunas */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex gap-4 h-full">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="w-[80vw] sm:w-[300px] flex-shrink-0 bg-[#182233] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#182233] border border-[#1e293b] flex items-center justify-center">
              <StickyNote className="w-8 h-8 text-[#475569]" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[#F8FAFC] mb-1">
                {(filter.client_id || filter.type || filter.origin) ? 'Nenhuma nota com esses filtros' : 'Nenhuma nota ainda'}
              </p>
              <p className="text-[13px] text-[#64748b]">
                {(filter.client_id || filter.type || filter.origin) ? 'Tente alterar ou limpar os filtros' : 'Crie sua primeira nota em "Nova nota"'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 h-full min-h-0 items-stretch">
            {/* Coluna da Agência */}
            <NotesColumn title="Notas da Agência" Icon={NotebookPen} accent="#60A5FA" accentLight="#1d4ed8" count={agencyNotes.length}>
              <button
                onClick={() => setSelected('new')}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed hover:border-[#2563EB]/50 transition-colors text-[12px] font-medium"
                style={{ borderColor: 'var(--sm-border-alt)', color: 'var(--sm-text-2)' }}
              >
                <Plus className="w-3.5 h-3.5" /> Nova nota
              </button>
              <AnimatePresence>
                {agencyNotes.map(n => <NoteCard key={n.id} note={n} onOpen={() => openNote(n)} />)}
              </AnimatePresence>
              {agencyNotes.length === 0 && (
                <p className="text-[12px] text-[#475569] text-center py-4">Nenhuma nota da agência ainda.</p>
              )}
            </NotesColumn>

            {/* Uma coluna por cliente */}
            {clientCols.map(col => (
              <NotesColumn key={col.id} title={col.name} Icon={Building2} accent="#c084fc" accentLight="#7c3aed" count={col.notes.length}>
                <AnimatePresence>
                  {col.notes.map(n => <NoteCard key={n.id} note={n} onOpen={() => openNote(n)} />)}
                </AnimatePresence>
              </NotesColumn>
            ))}
          </div>
        )}
      </div>

      {/* Modal editável (notas da agência) */}
      <AnimatePresence>
        {open && (
          <NoteModal
            note={modalNote}
            clients={clients}
            defaultClientId={filter.client_id}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>

      {/* Modal somente leitura (notas do cliente) */}
      <AnimatePresence>
        {viewing && (
          <NoteViewModal note={viewing} onClose={() => setViewing(null)} onDelete={handleDeleteViewing} />
        )}
      </AnimatePresence>
    </div>
  )
}
