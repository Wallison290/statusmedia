import { useState, useRef, useEffect } from 'react'
import {
  Plus, NotebookPen, Trash2, Check, X, GripVertical, StickyNote,
  Building2, Tag, Lock,
} from 'lucide-react'
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
// Tipo aparece como ponto colorido + texto (hex inline: igual nos dois temas).

const typeLabels: Record<NoteType, string> = {
  interna:     'Interna',
  ideia:       'Ideia',
  solicitacao: 'Solicitação',
}
const typeColors: Record<NoteType, string> = {
  interna:     '#94A3B8',
  ideia:       '#F59E0B',
  solicitacao: '#2563EB',
}
const CLIENT_COLOR = '#8B5CF6'

const card = { background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' } as const
const eyebrow = 'text-[10.5px] font-semibold uppercase tracking-[0.08em]'
const selectCls = 'h-9 max-w-full text-[12.5px] rounded-xl border px-3 outline-none cursor-pointer hover:border-[#2563EB]/50 transition-colors [color-scheme:light_dark]'
const selectStyle = { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' } as const

function newItem(text = ''): NoteChecklistItem {
  return { id: crypto.randomUUID(), text, done: false }
}

function Dot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap" style={{ color: 'var(--sm-text-2)' }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {children}
    </span>
  )
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

export function NoteCard({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const doneCount = note.checklist.filter(i => i.done).length
  const preview = note.content?.slice(0, 140) || ''
  const fromClient = note.origin === 'client'

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={onOpen}
      className="relative w-full text-left rounded-xl pl-4 pr-3.5 py-3 border transition-colors hover:border-[#2563EB]/50 select-none overflow-hidden"
      style={card}
    >
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: fromClient ? CLIENT_COLOR : typeColors[note.type] }} />

      <h3 className="text-[13.5px] font-semibold leading-snug line-clamp-2" style={{ color: note.title ? 'var(--sm-text-1)' : 'var(--sm-text-4)' }}>
        {note.title || 'Sem título'}
      </h3>

      {preview && (
        <p className="text-[12px] leading-relaxed line-clamp-3 mt-1 whitespace-pre-wrap" style={{ color: 'var(--sm-text-3)' }}>
          {preview}
        </p>
      )}

      {note.checklist.length > 0 && (
        <div className="flex items-center gap-2 mt-2">
          <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--sm-bg-alt)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(doneCount / note.checklist.length) * 100}%`, background: doneCount === note.checklist.length ? '#10B981' : '#2563EB' }} />
          </div>
          <span className="text-[11px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--sm-text-3)' }}>
            {doneCount}/{note.checklist.length}
          </span>
        </div>
      )}

      <div className="flex items-center gap-x-3 gap-y-1 mt-2.5 flex-wrap">
        <Dot color={typeColors[note.type]}>{typeLabels[note.type]}</Dot>
        {fromClient && <Dot color={CLIENT_COLOR}>Do cliente</Dot>}
        {note.client && !fromClient && (
          <span className="inline-flex items-center gap-1 text-[11px] truncate max-w-[60%]" style={{ color: 'var(--sm-text-3)' }}>
            <Building2 className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{note.client.company_name}</span>
          </span>
        )}
        <span className="ml-auto text-[11px]" style={{ color: 'var(--sm-text-4)' }}>
          {formatDistanceToNow(parseISO(note.updated_at), { addSuffix: true, locale: ptBR })}
        </span>
      </div>
    </motion.button>
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
    <div className="space-y-0.5">
      {items.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-2 group/item rounded-lg px-1 py-1 hover:bg-black/[0.03]">
          <GripVertical className="w-3.5 h-3.5 flex-shrink-0 cursor-grab" style={{ color: 'var(--sm-text-4)' }} />
          <button
            type="button"
            role="checkbox"
            aria-checked={item.done}
            onClick={() => toggle(item.id)}
            className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-colors"
            style={item.done ? { background: '#2563EB', border: '1px solid #2563EB' } : { border: '1.5px solid var(--sm-border-alt)' }}
          >
            {item.done && <Check className="w-2.5 h-2.5 text-white" />}
          </button>
          <input
            ref={el => { inputRefs.current[idx] = el }}
            value={item.text}
            onChange={e => updateText(item.id, e.target.value)}
            onKeyDown={e => handleKeyDown(e, idx)}
            placeholder="Item da lista..."
            className={`flex-1 text-[13.5px] bg-transparent outline-none placeholder:text-[color:var(--sm-text-4)] ${item.done ? 'line-through' : ''}`}
            style={{ color: item.done ? 'var(--sm-text-4)' : 'var(--sm-text-1)' }}
          />
          <button
            type="button"
            onClick={() => remove(item.id)}
            aria-label="Remover item"
            className="md:opacity-0 md:group-hover/item:opacity-100 transition-opacity w-6 h-6 rounded flex items-center justify-center hover:bg-black/5"
          >
            <X className="w-3 h-3" style={{ color: 'var(--sm-text-3)' }} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => { onChange([...items, newItem()]); setTimeout(() => inputRefs.current[items.length]?.focus(), 30) }}
        className="flex items-center gap-1.5 text-[12.5px] font-semibold mt-2 px-1 hover:underline"
        style={{ color: '#2563EB' }}
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar item
      </button>
    </div>
  )
}

// ─── Moldura comum dos modais de nota ─────────────────────────────────────────

function NoteShell({ onBackdrop, children }: { onBackdrop: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onBackdrop} />
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        className="relative w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col max-h-[85vh] overflow-hidden"
        style={card}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </div>
  )
}

// ─── NoteModal (editável) ─────────────────────────────────────────────────────

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

  const done = checklist.filter(i => i.done).length

  return (
    <NoteShell onBackdrop={handleSave}>
      {/* Cabeçalho: título grande editável */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>{isNew ? 'Nova nota' : 'Nota'}</p>
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título da nota..."
              className="w-full font-display text-[20px] font-bold bg-transparent outline-none mt-0.5 placeholder:font-normal placeholder:text-[color:var(--sm-text-4)]"
              style={{ color: 'var(--sm-text-1)' }}
            />
          </div>
          <button onClick={handleSave} aria-label="Salvar e fechar" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors flex-shrink-0">
            <X className="w-4 h-4" style={{ color: 'var(--sm-text-3)' }} />
          </button>
        </div>

        {/* Tipo + cliente */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <label className="relative inline-flex items-center">
            <span className="absolute left-2.5 w-1.5 h-1.5 rounded-full pointer-events-none" style={{ background: typeColors[type] }} />
            <select value={type} onChange={e => setType(e.target.value as NoteType)} aria-label="Tipo"
              className={`${selectCls} h-8 pl-6 pr-2`} style={selectStyle}>
              <option value="interna">Interna</option>
              <option value="ideia">Ideia</option>
              <option value="solicitacao">Solicitação</option>
            </select>
          </label>
          <label className="relative inline-flex items-center min-w-0">
            <Building2 className="absolute left-2.5 w-3 h-3 pointer-events-none" style={{ color: 'var(--sm-text-4)' }} />
            <select value={clientId} onChange={e => setClientId(e.target.value)} aria-label="Cliente"
              className={`${selectCls} h-8 pl-7 pr-2 max-w-[220px]`} style={selectStyle}>
              <option value="">Sem cliente</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Abas Texto / Checklist (sublinhadas) */}
      <div className="flex items-end gap-1 px-5 border-b" style={{ borderColor: 'var(--sm-border)' }}>
        {(['texto', 'checklist'] as const).map(t => {
          const ativo = tab === t
          return (
            <button key={t} onClick={() => setTab(t)}
              className="h-9 px-2.5 border-b-2 -mb-px text-[13px] transition-colors inline-flex items-center gap-1.5"
              style={{ borderColor: ativo ? '#2563EB' : 'transparent', color: ativo ? 'var(--sm-text-1)' : 'var(--sm-text-3)', fontWeight: ativo ? 600 : 500 }}>
              {t === 'texto' ? 'Texto' : 'Checklist'}
              {t === 'checklist' && checklist.length > 0 && (
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{done}/{checklist.length}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Corpo */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === 'texto' ? (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Escreva sua nota aqui..."
            rows={10}
            className="w-full text-[13.5px] bg-transparent outline-none resize-none leading-relaxed placeholder:text-[color:var(--sm-text-4)]"
            style={{ color: 'var(--sm-text-1)' }}
          />
        ) : (
          checklist.length === 0 ? (
            <button
              type="button"
              onClick={() => setChecklist([newItem()])}
              className="w-full rounded-xl border border-dashed py-6 flex items-center justify-center gap-2 text-[13px] hover:border-[#2563EB]/50 transition-colors"
              style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}
            >
              <Plus className="w-4 h-4" /> Adicionar primeiro item
            </button>
          ) : (
            <ChecklistEditor items={checklist} onChange={setChecklist} />
          )
        )}
      </div>

      {/* Rodapé */}
      <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t" style={{ borderColor: 'var(--sm-border)' }}>
        {!isNew ? (
          confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>Excluir nota?</span>
              <button onClick={() => setConfirmDelete(false)}
                className="h-8 px-2.5 rounded-lg border text-[12px] hover:bg-black/5" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                Não
              </button>
              <button onClick={handleDelete} disabled={deleteNote.isPending}
                className="h-8 px-2.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: '#EF4444' }}>
                Sim, excluir
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 h-8 px-2 rounded-lg text-[12.5px] hover:bg-red-500/10 hover:text-red-500 transition-colors"
              style={{ color: 'var(--sm-text-3)' }}>
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          )
        ) : <div />}

        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          style={{ background: 'var(--sm-primary)' }}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </NoteShell>
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
    <NoteShell onBackdrop={onClose}>
      <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: 'var(--sm-border)' }}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>{note.client?.company_name ?? 'Cliente'} · enviada pelo cliente</p>
            <h2 className="font-display text-[20px] font-bold leading-snug break-words mt-0.5" style={{ color: 'var(--sm-text-1)' }}>{note.title || 'Sem título'}</h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Dot color={typeColors[note.type]}>{typeLabels[note.type]}</Dot>
              <Dot color={CLIENT_COLOR}>Do cliente</Dot>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors flex-shrink-0">
            <X className="w-4 h-4" style={{ color: 'var(--sm-text-3)' }} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {note.content && (
          <p className="text-[13.5px] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--sm-text-1)' }}>{note.content}</p>
        )}
        {note.checklist.length > 0 && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sm-border)' }}>
            {note.checklist.map((it, i) => (
              <div key={it.id} className={`flex items-center gap-2.5 px-3.5 py-2 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={it.done ? { background: '#10B981', border: '1px solid #10B981' } : { border: '1.5px solid var(--sm-border-alt)' }}>
                  {it.done && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <span className={`text-[13px] ${it.done ? 'line-through' : ''}`} style={{ color: it.done ? 'var(--sm-text-4)' : 'var(--sm-text-1)' }}>{it.text}</span>
              </div>
            ))}
          </div>
        )}
        {!note.content && note.checklist.length === 0 && (
          <p className="text-[13px]" style={{ color: 'var(--sm-text-4)' }}>Sem conteúdo.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t" style={{ borderColor: 'var(--sm-border)' }}>
        <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
          <Lock className="w-3 h-3" /> Somente leitura
        </span>
        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>Excluir?</span>
            <button onClick={() => setConfirmDelete(false)} className="h-8 px-2.5 rounded-lg border text-[12px] hover:bg-black/5" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>Não</button>
            <button onClick={() => onDelete(note.id)} className="h-8 px-2.5 rounded-lg text-[12px] font-semibold text-white" style={{ background: '#EF4444' }}>Sim</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 h-8 px-2 rounded-lg text-[12.5px] hover:bg-red-500/10 hover:text-red-500 transition-colors"
              style={{ color: 'var(--sm-text-3)' }}>
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
            <button onClick={onClose} className="h-9 px-4 rounded-xl border text-[13px] font-semibold hover:bg-black/5"
              style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}>Fechar</button>
          </div>
        )}
      </div>
    </NoteShell>
  )
}

// ─── Coluna do quadro ─────────────────────────────────────────────────────────

function NotesColumn({
  n, title, accent, count, children,
}: {
  n: string; title: string; accent: string; count: number; children: React.ReactNode
}) {
  return (
    <section className="flex flex-col w-[82vw] sm:w-[310px] flex-shrink-0 h-full min-h-0 rounded-2xl border"
      style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
      <header className="flex items-baseline gap-2 px-4 pt-3.5 pb-3 border-b flex-shrink-0" style={{ borderColor: 'var(--sm-border)' }}>
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{n}</span>
        <span className="font-display text-[15px] font-bold truncate flex-1" style={{ color: 'var(--sm-text-1)' }}>{title}</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--sm-text-3)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />{count}
        </span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
        {children}
      </div>
    </section>
  )
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

function FilterBar({
  filter,
  clients,
  onChange,
}: {
  filter: NotesFilter
  clients: { id: string; company_name: string }[]
  onChange: (f: NotesFilter) => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
      <select value={filter.client_id ?? ''} aria-label="Cliente"
        onChange={e => onChange({ ...filter, client_id: e.target.value || null })}
        className={selectCls} style={selectStyle}>
        <option value="">Todos os clientes</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
      </select>

      <select value={filter.type ?? ''} aria-label="Tipo"
        onChange={e => onChange({ ...filter, type: (e.target.value as NoteType) || null })}
        className={selectCls} style={selectStyle}>
        <option value="">Todos os tipos</option>
        <option value="interna">Interna</option>
        <option value="ideia">Ideia</option>
        <option value="solicitacao">Solicitação</option>
      </select>

      <select value={filter.origin ?? ''} aria-label="Origem"
        onChange={e => onChange({ ...filter, origin: (e.target.value as NoteOrigin) || null })}
        className={selectCls} style={selectStyle}>
        <option value="">Qualquer origem</option>
        <option value="agency">Agência</option>
        <option value="client">Cliente</option>
      </select>

      {(filter.client_id || filter.type || filter.origin) && (
        <button onClick={() => onChange({})}
          className="inline-flex items-center gap-1 h-9 px-2 rounded-lg text-[12.5px] font-medium hover:bg-black/5"
          style={{ color: 'var(--sm-text-3)' }}>
          <X className="w-3.5 h-3.5" /> Limpar
        </button>
      )}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

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

  const filtrando = !!(filter.client_id || filter.type || filter.origin)
  const doCliente = notes.length - agencyNotes.length

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--sm-bg-page)' }}>
      {/* Cabeçalho (no celular, ao lado do menu) */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 flex-shrink-0">
        <header className="mb-4 max-md:pl-12 max-md:-mt-[3.25rem] flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Operação</p>
            <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>
              Notas
            </h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
              {notes.length} {notes.length === 1 ? 'nota' : 'notas'}
              {doCliente > 0 && <> · <strong style={{ color: 'var(--sm-text-1)' }}>{doCliente}</strong> enviada{doCliente !== 1 ? 's' : ''} por clientes</>}
            </p>
          </div>
          <button onClick={() => setSelected('new')}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ background: 'var(--sm-primary)' }}>
            <Plus className="w-4 h-4" /> Nova nota
          </button>
        </header>
        <div className="pb-4 border-b" style={{ borderColor: 'var(--sm-border)' }}>
          <FilterBar filter={filter} clients={clients} onChange={setFilter} />
        </div>
      </div>

      {/* Quadro de colunas */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-6">
        {isLoading ? (
          <div className="flex gap-4 h-full">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="w-[82vw] sm:w-[310px] flex-shrink-0 rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="rounded-2xl border border-dashed py-14 px-8 text-center max-w-sm" style={{ borderColor: 'var(--sm-border)' }}>
              <StickyNote className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--sm-text-4)' }} />
              <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
                {filtrando ? 'Nenhuma nota com esses filtros' : 'Nenhuma nota ainda'}
              </p>
              <p className="text-[12.5px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
                {filtrando ? 'Tente alterar ou limpar os filtros.' : 'Anote ideias, combinados e pendências da equipe.'}
              </p>
              {!filtrando && (
                <button onClick={() => setSelected('new')}
                  className="mt-4 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12.5px] font-semibold text-white hover:opacity-90"
                  style={{ background: 'var(--sm-primary)' }}>
                  <Plus className="w-3.5 h-3.5" /> Nova nota
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex gap-4 h-full min-h-0 items-stretch">
            <NotesColumn n="01" title="Notas da agência" accent="#2563EB" count={agencyNotes.length}>
              <button
                onClick={() => setSelected('new')}
                className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed hover:border-[#2563EB]/50 transition-colors text-[12.5px] font-medium"
                style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}
              >
                <Plus className="w-3.5 h-3.5" /> Nova nota
              </button>
              <AnimatePresence>
                {agencyNotes.map(n => <NoteCard key={n.id} note={n} onOpen={() => openNote(n)} />)}
              </AnimatePresence>
              {agencyNotes.length === 0 && (
                <p className="text-[12px] text-center py-4" style={{ color: 'var(--sm-text-4)' }}>Nenhuma nota da agência ainda.</p>
              )}
            </NotesColumn>

            {clientCols.map((col, i) => (
              <NotesColumn key={col.id} n={String(i + 2).padStart(2, '0')} title={col.name} accent={CLIENT_COLOR} count={col.notes.length}>
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
