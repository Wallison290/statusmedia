import { useState } from 'react'
import { Plus, Lightbulb } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotes } from '@/hooks/useNotes'
import { NoteCard, NoteModal } from '@/pages/notes/Notes'
import type { Note } from '@/types'

export function RequestsIdeasTab({
  clientId,
  clientName,
}: {
  clientId: string
  clientName: string
}) {
  const { data: notes = [], isLoading } = useNotes({ client_id: clientId })
  const [selected, setSelected] = useState<Note | null | 'new'>(null)

  const open = selected !== null
  const modalNote = selected === 'new' ? null : selected
  const clients = [{ id: clientId, company_name: clientName }]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-[17px] font-bold text-[color:var(--sm-text-1)]">Solicitações e Ideias</h3>
          <p className="text-[12px] text-[color:var(--sm-text-4)] mt-0.5">
            {notes.length} {notes.length === 1 ? 'item' : 'itens'} · solicitações e ideias deste cliente
          </p>
        </div>
        <button
          onClick={() => setSelected('new')}
          className="flex items-center gap-2 text-[13px] font-medium px-4 py-2.5 rounded-xl bg-[#2563EB] hover:opacity-90 transition-opacity"
          style={{ color: '#ffffff' }}
        >
          <Plus className="w-4 h-4" style={{ color: '#ffffff' }} />
          Nova nota
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[color:var(--sm-bg-card)] rounded-2xl h-36 animate-pulse" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[color:var(--sm-bg-card)] border border-[color:var(--sm-border)] shadow-sm flex items-center justify-center">
            <Lightbulb className="w-7 h-7 text-[color:var(--sm-text-4)]" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[color:var(--sm-text-1)] mb-1">Nenhuma solicitação ou ideia ainda</p>
            <p className="text-[13px] text-[color:var(--sm-text-4)]">
              As solicitações e ideias enviadas pelo cliente aparecerão aqui.
            </p>
          </div>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence>
            {notes.map(note => (
              <NoteCard key={note.id} note={note} onOpen={() => setSelected(note)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <NoteModal
            note={modalNote}
            clients={clients}
            defaultClientId={clientId}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
