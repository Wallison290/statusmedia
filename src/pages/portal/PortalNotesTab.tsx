import { useState, useRef, useEffect } from 'react'
import {
  Plus, NotebookPen, Trash2, Check, X, GripVertical, StickyNote, MessageSquare,
} from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { motion, AnimatePresence } from 'framer-motion'
import {
  usePortalNotes, useCreatePortalNote, useUpdatePortalNote, useDeletePortalNote,
} from '@/hooks/useNotes'
import { useToast } from '@/components/ui/toast'
import type { Note, NoteChecklistItem } from '@/types'
import { PortalEmpty } from '@/components/portal/PortalUI'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newItem(text = ''): NoteChecklistItem {
  return { id: crypto.randomUUID(), text, done: false }
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const doneCount = note.checklist.filter(i => i.done).length
  const preview = note.content?.slice(0, 100) || ''
  const isClientNote = note.origin === 'client'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={onOpen}
      className="group relative bg-white border border-[#E4E7EC] rounded-[20px] p-5 cursor-pointer transition-all duration-300 select-none hover:border-[#0F172A]/30 hover:-translate-y-0.5"
    >
      {isClientNote && <span className="absolute left-0 top-5 bottom-5 w-[3px] rounded-r bg-[#2563EB]" />}

      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#8A94A6]">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: note.type === 'ideia' ? '#EAB308' : note.type === 'solicitacao' ? '#2563EB' : '#94A3B8' }} />
          {note.type === 'ideia' ? 'Ideia' : note.type === 'solicitacao' ? 'Solicitação' : 'Nota'}
          {isClientNote && <span className="text-[#2563EB] normal-case tracking-normal font-medium">· sua</span>}
        </span>
        {isClientNote
          ? <MessageSquare className="w-3.5 h-3.5 text-[#A0A8B5] flex-shrink-0" />
          : <NotebookPen className="w-3.5 h-3.5 text-[#A0A8B5] flex-shrink-0" />
        }
      </div>

      <h3 className="font-display text-[18px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-snug line-clamp-2">
        {note.title || 'Sem título'}
      </h3>

      {preview && (
        <p className="text-[12.5px] text-[#5B6576] leading-relaxed line-clamp-2 mt-2 whitespace-pre-wrap">
          {preview}
        </p>
      )}

      {note.checklist.length > 0 && (
        <div className="flex items-center gap-2 mt-4">
          <div className="h-1 flex-1 rounded-full bg-[#EEF0F3] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(doneCount / note.checklist.length) * 100}%`, background: '#0F172A' }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-[#8A94A6] flex-shrink-0">
            {doneCount}/{note.checklist.length}
          </span>
        </div>
      )}

      <p className="text-[11px] text-[#A0A8B5] mt-4 pt-3 border-t border-[#EEF0F3]">
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
          <GripVertical className="w-3.5 h-3.5 text-[#d0d0d0] flex-shrink-0 cursor-grab" />
          <button
            type="button"
            onClick={() => toggle(item.id)}
            className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
              item.done ? 'bg-[#0f0f0f] border-[#0f0f0f]' : 'border-[#d0d0d0] hover:border-[#a0a0a0]'
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
            className={`flex-1 text-[13px] bg-transparent outline-none placeholder:text-[#c0c0c0] ${
              item.done ? 'line-through text-[#a0a0a0]' : 'text-[#0f0f0f]'
            }`}
          />
          <button
            type="button"
            onClick={() => remove(item.id)}
            className="opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 rounded hover:bg-[#f0f0f0]"
          >
            <X className="w-3 h-3 text-[#a0a0a0]" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => { onChange([...items, newItem()]); setTimeout(() => inputRefs.current[items.length]?.focus(), 30) }}
        className="flex items-center gap-1.5 text-[12px] text-[#a0a0a0] hover:text-[#0f0f0f] transition-colors mt-1"
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar item
      </button>
    </div>
  )
}

// ─── NoteModal ────────────────────────────────────────────────────────────────

function NoteModal({ note, onClose }: { note: Note | null; onClose: () => void }) {
  const isNew = !note
  const isClientNote = note?.origin === 'client'
  const canEdit = isNew || isClientNote

  const [title, setTitle]         = useState(note?.title ?? '')
  const [content, setContent]     = useState(note?.content ?? '')
  const [checklist, setChecklist] = useState<NoteChecklistItem[]>(note?.checklist ?? [])
  const [tab, setTab]             = useState<'texto' | 'checklist'>(
    note && note.checklist.length > 0 ? 'checklist' : 'texto'
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  const createNote = useCreatePortalNote()
  const updateNote = useUpdatePortalNote()
  const deleteNote = useDeletePortalNote()
  const { toast } = useToast()
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (canEdit) setTimeout(() => titleRef.current?.focus(), 50)
  }, [canEdit])

  const saving = createNote.isPending || updateNote.isPending

  async function handleSave() {
    if (!canEdit) { onClose(); return }
    if (!title.trim() && !content.trim() && checklist.filter(i => i.text.trim()).length === 0) {
      onClose()
      return
    }
    try {
      const payload = {
        title:     title.trim(),
        content:   content.trim() || null,
        checklist: checklist.filter(i => i.text.trim() !== ''),
      }
      if (isNew) {
        await createNote.mutateAsync(payload)
      } else {
        await updateNote.mutateAsync({ id: note!.id, ...payload })
      }
      toast(isNew ? 'Nota enviada!' : 'Nota salva!', 'success')
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
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#e8e8e8] flex flex-col max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-[#f0f0f0]">
          {canEdit ? (
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título da nota..."
              className="flex-1 text-[16px] font-semibold text-[#0f0f0f] bg-transparent outline-none placeholder:text-[#c0c0c0] placeholder:font-normal"
            />
          ) : (
            <h2 className="flex-1 text-[16px] font-semibold text-[#0f0f0f]">
              {note?.title || 'Sem título'}
            </h2>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#f0f0f0] transition-colors">
            <X className="w-4 h-4 text-[#737373]" />
          </button>
        </div>

        {/* Origin label */}
        {!isNew && !isClientNote && (
          <div className="px-5 pt-2">
            <span className="text-[11px] text-[#a0a0a0] italic">Nota da agência — somente leitura</span>
          </div>
        )}

        {/* Tabs */}
        {canEdit && (
          <div className="flex items-center gap-0.5 px-5 pt-3">
            {(['texto', 'checklist'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  tab === t ? 'bg-[#f0f0f0] text-[#0f0f0f]' : 'text-[#a0a0a0] hover:text-[#0f0f0f]'
                }`}
              >
                {t === 'texto' ? 'Texto' : 'Checklist'}
                {t === 'checklist' && checklist.length > 0 && (
                  <span className="ml-1.5 text-[10px] bg-[#0f0f0f] rounded-full px-1.5 py-0.5" style={{ color: '#ffffff' }}>
                    {checklist.filter(i => i.done).length}/{checklist.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {canEdit ? (
            tab === 'texto' ? (
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Escreva sua nota ou solicitação aqui..."
                rows={10}
                className="w-full text-[13px] text-[#0f0f0f] bg-transparent outline-none resize-none placeholder:text-[#c0c0c0] leading-relaxed"
              />
            ) : (
              checklist.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setChecklist([newItem()])}
                  className="flex items-center gap-2 text-[13px] text-[#a0a0a0] hover:text-[#0f0f0f] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Adicionar primeiro item
                </button>
              ) : (
                <ChecklistEditor items={checklist} onChange={setChecklist} />
              )
            )
          ) : (
            // Read-only view for agency notes
            <div className="space-y-3">
              {note?.content && (
                <p className="text-[13px] text-[#0f0f0f] leading-relaxed whitespace-pre-wrap">{note.content}</p>
              )}
              {note?.checklist && note.checklist.length > 0 && (
                <div className="space-y-1.5">
                  {note.checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                        item.done ? 'bg-[#0f0f0f] border-[#0f0f0f]' : 'border-[#d0d0d0]'
                      }`}>
                        {item.done && <Check className="w-2.5 h-2.5" style={{ color: '#ffffff' }} />}
                      </div>
                      <span className={`text-[13px] ${item.done ? 'line-through text-[#a0a0a0]' : 'text-[#0f0f0f]'}`}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-[#f0f0f0]">
            {!isNew ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#737373]">Excluir nota?</span>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[12px] px-2.5 py-1 rounded-lg border border-[#e0e0e0] text-[#737373] hover:bg-[#f8f8f8] transition-colors"
                  >
                    Não
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleteNote.isPending}
                    className="text-[12px] px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-800 hover:bg-red-100 transition-colors"
                  >
                    Sim, excluir
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-[12px] text-[#a0a0a0] hover:text-red-400 transition-colors"
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
              className="flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-xl bg-[#0f0f0f] hover:bg-[#1a1a1a] transition-colors disabled:opacity-50"
              style={{ color: '#ffffff' }}
            >
              {saving ? 'Enviando...' : isNew ? 'Enviar nota' : 'Salvar'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ─── PortalNotesTab ───────────────────────────────────────────────────────────

export function PortalNotesTab() {
  const { data: notes = [], isLoading } = usePortalNotes()
  const [selected, setSelected] = useState<Note | null | 'new'>(null)

  const open = selected !== null
  const modalNote = selected === 'new' ? null : selected

  const agencyNotes = notes.filter(n => n.origin === 'agency')
  const clientNotes = notes.filter(n => n.origin === 'client')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-7">
        <p className="text-[13px] text-[#5B6576]">
          {notes.length > 0
            ? <><span className="font-semibold text-[#0F172A] tabular-nums">{notes.length}</span> {notes.length === 1 ? 'nota' : 'notas'} no mural</>
            : 'O mural ainda está vazio'}
        </p>
        <button
          onClick={() => setSelected('new')}
          className="group flex items-center gap-2.5 h-11 pl-5 pr-1.5 rounded-full text-[13px] font-semibold transition-all hover:gap-3.5"
          style={{ background: '#0F172A', color: '#ffffff' }}
        >
          Nova nota
          <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center transition-transform duration-300 group-hover:rotate-90">
            <Plus className="w-4 h-4" style={{ color: '#ffffff' }} />
          </span>
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#E4E7EC] rounded-[20px] h-40 animate-pulse" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <PortalEmpty title="Nenhuma nota ainda" text="Envie uma solicitação ou uma ideia para a agência pelo botão Nova nota." />
      ) : (
        <div className="space-y-10">
          {/* Notas da agência */}
          {agencyNotes.length > 0 && (
            <div>
              <h3 className="flex items-baseline gap-3 mb-4 pb-2.5 border-b border-[#E4E7EC]">
                <span className="font-display text-[20px] font-semibold tracking-[-0.02em] text-[#0F172A]">Da agência</span>
                <span className="text-[11px] tabular-nums text-[#A0A8B5]">{agencyNotes.length}</span>
              </h3>
              <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {agencyNotes.map(note => (
                    <NoteCard key={note.id} note={note} onOpen={() => setSelected(note)} />
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          )}

          {/* Suas notas */}
          {clientNotes.length > 0 && (
            <div>
              <h3 className="flex items-baseline gap-3 mb-4 pb-2.5 border-b border-[#E4E7EC]">
                <span className="font-display text-[20px] font-semibold tracking-[-0.02em] text-[#0F172A]">Suas notas</span>
                <span className="text-[11px] tabular-nums text-[#A0A8B5]">{clientNotes.length}</span>
              </h3>
              <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {clientNotes.map(note => (
                    <NoteCard key={note.id} note={note} onOpen={() => setSelected(note)} />
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <NoteModal note={modalNote} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
