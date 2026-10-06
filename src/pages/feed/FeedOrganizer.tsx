import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, Pencil, Check, X, ChevronDown, Upload,
  Images, GripVertical, Instagram, Copy, Link2,
  Save, ArrowLeft, LayoutGrid, ChevronLeft, ChevronRight, ZoomIn,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useClients } from '@/hooks/useClients'
import { useContentAssets } from '@/hooks/useContentAssets'
import { usePlanner } from '@/hooks/usePlanner'
import {
  useFeeds, useFeedMeta, useCreateFeedVersion, useUpdateFeedVersion,
  useDeleteFeedVersion, useUpsertFeedMeta,
} from '@/hooks/useFeeds'
import type { FeedPost, FeedVersion, FeedClientMeta } from '@/hooks/useFeeds'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/integrations/supabase/client'
import { uploadArquivo } from '@/lib/uploadArquivo'
import { checkStorageLimit } from '@/utils/storageGate'
import { isImageUrl, isImageMedia } from '@/utils/media'
import type { ContentAsset, Client } from '@/types'

// ─── arrayMove (local) ────────────────────────────────────────────────────────

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}

// ─── Mini Feed Preview (gallery card) ────────────────────────────────────────

function MiniFeedPreview({ posts }: { posts: FeedPost[] }) {
  const cells = Array.from({ length: 9 }, (_, i) => posts[i] ?? null)

  return (
    <div className="grid grid-cols-3 gap-[1.5px] bg-[#1e293b] rounded-lg overflow-hidden">
      {cells.map((post, i) => (
        <div key={i} className="aspect-square bg-[#101A2B]">
          {post ? (
            <img src={post.image_url} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full bg-[#0B1020]" />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Gallery card (one per client with feed) ──────────────────────────────────

function FeedGalleryCard({
  client, versions, onEdit,
}: {
  client: Client
  versions: FeedVersion[]
  onEdit: () => void
}) {
  const activeVersion = versions[0] ?? null
  const posts = activeVersion?.posts ?? []
  const initial = client.company_name.charAt(0).toUpperCase()

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#182233] rounded-2xl border border-[#1e293b] shadow-sm overflow-hidden hover:border-[#2f3b52] transition-all duration-200"
    >
      {/* Client header */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <div className="w-8 h-8 rounded-full p-[1.5px] flex-shrink-0"
          style={{ background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}>
          <div className="w-full h-full rounded-full bg-[#182233] p-[1.5px]">
            {client.logo_url ? (
              <img src={client.logo_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <div className="w-full h-full rounded-full bg-[#101A2B] flex items-center justify-center">
                <span className="text-[11px] font-bold text-[#94a3b8]">{initial}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[#F8FAFC] truncate">{client.company_name}</p>
          <p className="text-[10px] text-[#64748b] truncate">
            {versions.length} {versions.length === 1 ? 'versão' : 'versões'} · {posts.length} posts
          </p>
        </div>
      </div>

      {/* Mini grid preview */}
      <div className="px-3 pb-2">
        <MiniFeedPreview posts={posts} />
      </div>

      {/* Version chips */}
      <div className="px-3 pb-2 flex gap-1 flex-wrap">
        {versions.slice(0, 3).map((v, i) => (
          <span key={v.id} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            i === 0 ? '' : 'text-[#94a3b8] bg-[#101A2B]'
          }`} style={i === 0 ? { background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' } : undefined}>
            {v.name}
          </span>
        ))}
        {versions.length > 3 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full text-[#64748b] bg-[#101A2B]">
            +{versions.length - 3}
          </span>
        )}
      </div>

      {/* Edit button */}
      <div className="border-t border-[#1e293b] px-3 py-2">
        <button
          onClick={onEdit}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-[#1D4ED8]"
          style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}
        >
          <Pencil className="w-3 h-3" /> Editar feed
        </button>
      </div>
    </motion.div>
  )
}

// ─── Instagram Profile Header ─────────────────────────────────────────────────

function InstagramHeader({
  client, postsCount, meta, onMetaChange,
}: {
  client: Client
  postsCount: number
  meta: FeedClientMeta
  onMetaChange: (m: FeedClientMeta) => void
}) {
  const [editingBio, setEditingBio] = useState(false)
  const [bioValue,   setBioValue]   = useState(meta.bio)
  const [linkValue,  setLinkValue]  = useState(meta.link)
  const initial = client.company_name.charAt(0).toUpperCase()

  const saveBio = () => {
    onMetaChange({ bio: bioValue.trim(), link: linkValue.trim() })
    setEditingBio(false)
  }

  return (
    <div className="bg-[#182233] rounded-2xl border border-[#1e293b] shadow-sm px-6 py-5">
      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-20 h-20 rounded-full p-[2px]"
            style={{ background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}>
            <div className="w-full h-full rounded-full bg-[#182233] p-[2px]">
              {client.logo_url ? (
                <img src={client.logo_url} alt={client.company_name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <div className="w-full h-full rounded-full bg-[#101A2B] flex items-center justify-center">
                  <span className="text-2xl font-bold text-[#94a3b8]">{initial}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-[15px] font-semibold text-[#F8FAFC] leading-none">
              {client.instagram
                ? client.instagram.replace(/^@/, '')
                : client.company_name.toLowerCase().replace(/\s+/g, '_')}
            </h2>
            {!editingBio && (
              <button
                onClick={() => { setEditingBio(true); setBioValue(meta.bio); setLinkValue(meta.link) }}
                className="flex items-center gap-1 text-[11px] text-[#94a3b8] hover:text-[#F8FAFC] transition-colors"
              >
                <Pencil className="w-3 h-3" /> Editar bio
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6">
            {[
              { label: 'posts',     value: postsCount },
              { label: 'seguidores', value: '—' },
              { label: 'seguindo',  value: '—' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-[13px] font-semibold text-[#F8FAFC]">{s.value}</p>
                <p className="text-[11px] text-[#94a3b8]">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Bio */}
          {editingBio ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={bioValue}
                onChange={e => setBioValue(e.target.value)}
                placeholder="Escreva a bio do cliente..."
                rows={3}
                className="w-full text-sm text-[#F8FAFC] border border-[#1e293b] rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] placeholder:text-[#64748b] bg-[#101A2B]"
              />
              <input
                value={linkValue}
                onChange={e => setLinkValue(e.target.value)}
                placeholder="Link (ex: linktr.ee/cliente)"
                className="w-full text-sm text-[#F8FAFC] border border-[#1e293b] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] placeholder:text-[#64748b] bg-[#101A2B]"
              />
              <div className="flex items-center gap-2">
                <button onClick={saveBio}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium hover:bg-[#1D4ED8] transition-colors"
                  style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}>
                  <Check className="w-3.5 h-3.5" /> Salvar
                </button>
                <button onClick={() => setEditingBio(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#94a3b8] border border-[#1e293b] hover:bg-[#101A2B] transition-colors">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {meta.bio ? (
                <p className="text-sm text-[#F8FAFC] leading-relaxed whitespace-pre-wrap">{meta.bio}</p>
              ) : (
                <p className="text-sm text-[#64748b] cursor-pointer hover:text-[#94a3b8] transition-colors"
                  onClick={() => setEditingBio(true)}>
                  Clique em "Editar bio" para adicionar uma descrição...
                </p>
              )}
              {meta.link && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Link2 className="w-3 h-3 text-[#60A5FA]" />
                  <a href={meta.link.startsWith('http') ? meta.link : `https://${meta.link}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[12px] text-[#60A5FA] font-medium hover:underline">
                    {meta.link.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {client.niche && (
        <div className="mt-3 pt-3 border-t border-[#1e293b]">
          <span className="inline-flex items-center gap-1 text-[11px] text-[#94a3b8] bg-[#101A2B] px-2.5 py-1 rounded-full">
            <Instagram className="w-3 h-3 text-pink-500" /> {client.niche}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── DnD: Draggable card ──────────────────────────────────────────────────────

function DraggableCard({ post, index, onRemove, isActive }: {
  post: FeedPost; index: number; onRemove: () => void; isActive: boolean
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: post.id, data: { post, index } })
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `cell-${index}` })
  const [hover, setHover] = useState(false)

  return (
    <div
      ref={el => { setNodeRef(el); dropRef(el) }}
      className={`relative aspect-square rounded-[2px] overflow-hidden cursor-grab active:cursor-grabbing transition-all duration-150 select-none
        ${isDragging ? 'opacity-0 scale-95' : ''}
        ${isOver && !isActive ? 'ring-2 ring-blue-400 ring-inset scale-[1.03]' : ''}`}
      style={{ touchAction: 'none' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...listeners} {...attributes}
    >
      <img src={post.image_url} alt={post.caption || `Post ${index + 1}`}
        className="w-full h-full object-cover pointer-events-none" draggable={false} />
      <AnimatePresence>
        {hover && !isDragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/40 flex items-start justify-end p-1.5">
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onRemove() }}
              className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-red-500/80 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute bottom-1 left-1 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
        <span className="text-[9px] text-white font-bold">{index + 1}</span>
      </div>
    </div>
  )
}

function EmptySlot({ index, onAdd }: { index: number; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${index}` })
  return (
    <div ref={setNodeRef} onClick={onAdd}
      className={`aspect-square rounded-[2px] border-2 border-dashed flex items-center justify-center cursor-pointer transition-all duration-150
        ${isOver ? 'border-[#2563EB] bg-[#2563EB]/10 scale-[1.03]' : 'border-[#1e293b] hover:border-[#2f3b52] hover:bg-[#101A2B]'}`}>
      <Plus className={`w-5 h-5 ${isOver ? 'text-[#60A5FA]' : 'text-[#475569]'}`} />
    </div>
  )
}

// ─── Version chip ─────────────────────────────────────────────────────────────

function VersionChip({ version, isActive, onClick, onRename, onDelete, onDuplicate }: {
  version: FeedVersion; isActive: boolean; onClick: () => void
  onRename: (name: string) => void; onDelete: () => void; onDuplicate: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(version.name)
  const [menu,    setMenu]    = useState(false)
  const save = () => { const t = value.trim(); if (t) onRename(t); setEditing(false) }

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-all whitespace-nowrap
          ${isActive ? 'shadow-sm' : 'bg-[#101A2B] text-[#94a3b8] hover:bg-[#1e293b]'}`}
        style={isActive ? { background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' } : undefined}
        onClick={onClick}
      >
        {editing ? (
          <input autoFocus value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            onBlur={save} onClick={e => e.stopPropagation()}
            className="bg-transparent outline-none w-20 text-[12px]" style={{ color: '#ffffff' }} />
        ) : <span>{version.name}</span>}
        <button onClick={e => { e.stopPropagation(); setMenu(m => !m) }}
          className={`rounded-full p-0.5 ${isActive ? 'hover:bg-white/20' : 'hover:bg-[#1e293b]'}`}>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      <AnimatePresence>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }} transition={{ duration: 0.1 }}
              className="absolute top-full left-0 mt-1 z-20 bg-[#101A2B] border border-[#1e293b] rounded-xl shadow-lg py-1 min-w-[140px]">
              <button onClick={() => { setEditing(true); setMenu(false); onClick() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#F8FAFC] hover:bg-[#182233]">
                <Pencil className="w-3.5 h-3.5 text-[#94a3b8]" /> Renomear
              </button>
              <button onClick={() => { onDuplicate(); setMenu(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#F8FAFC] hover:bg-[#182233]">
                <Copy className="w-3.5 h-3.5 text-[#94a3b8]" /> Duplicar
              </button>
              <div className="border-t border-[#1e293b] my-1" />
              <button onClick={() => { onDelete(); setMenu(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Asset picker dialog ──────────────────────────────────────────────────────

function AssetPickerDialog({ open, onClose, clientId, onSelect, onUpload, onSelectMedia }: {
  open: boolean; onClose: () => void; clientId: string | null
  onSelect: (asset: ContentAsset) => void; onUpload: (file: File) => void
  onSelectMedia: (media: { url: string; caption?: string }) => void
}) {
  const { data: allAssets } = useContentAssets()
  const { data: plannerItems } = usePlanner(clientId || undefined)
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'arsenal' | 'planner' | 'upload'>('arsenal')

  const assets = (allAssets || []).filter(a => {
    const isImage = a.media_url && (
      ['post', 'carousel', 'story', 'reels'].includes(a.content_type) ||
      isImageUrl(a.media_url)
    )
    if (!isImage) return false
    if (clientId) return a.client_id === clientId
    return true
  })

  // Imagens já existentes no planejamento desse cliente (deduplicadas por file_url)
  // (apenas imagens — o grid do feed renderiza <img>, vídeo não tem preview)
  const plannerMedia = useMemo(() => {
    const seen = new Set<string>()
    const out: { url: string; caption?: string; title: string }[] = []
    for (const item of plannerItems || []) {
      for (const att of (item as any).attachments || []) {
        const url: string | undefined = att.file_url
        const type: string = att.file_type || ''
        const isImage = isImageMedia(type, url)
        if (!url || !isImage || seen.has(url)) continue
        seen.add(url)
        out.push({ url, caption: (item as any).title || att.file_name, title: (item as any).title || att.file_name || '' })
      }
    }
    return out
  }, [plannerItems])

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] !flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle>Adicionar post ao feed</DialogTitle></DialogHeader>
        <div className="flex gap-1 p-1 bg-[#101A2B] rounded-xl mb-4">
          {[{ id: 'arsenal', label: 'Arsenal', icon: Images }, { id: 'planner', label: 'Do planejamento', icon: LayoutGrid }, { id: 'upload', label: 'Upload', icon: Upload }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as 'arsenal' | 'planner' | 'upload')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium transition-all
                ${tab === t.id ? 'bg-[#2563EB] text-white shadow-sm' : 'text-[#94a3b8] hover:text-[#F8FAFC]'}`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
        {tab === 'arsenal' ? (
          <div className="flex-1 overflow-y-auto min-h-0">
            {assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#64748b]">
                <Images className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">Nenhuma imagem no arsenal</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {assets.map(asset => (
                  <button key={asset.id} onClick={() => { onSelect(asset); onClose() }}
                    className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-[#2563EB] transition-all hover:scale-[1.02] group relative">
                    <img src={asset.media_url!} alt={asset.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    <span onClick={(e) => { e.stopPropagation(); window.open(asset.media_url!, '_blank', 'noopener') }}
                      title="Ver em resolução original"
                      className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all">
                      <ZoomIn className="w-3.5 h-3.5" />
                    </span>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-white font-medium line-clamp-2">{asset.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : tab === 'planner' ? (
          <div className="flex-1 overflow-y-auto min-h-0">
            {!clientId ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#64748b]">
                <LayoutGrid className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">Selecione um cliente para ver o planejamento</p>
              </div>
            ) : plannerMedia.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#64748b]">
                <LayoutGrid className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">Nenhuma mídia no planejamento deste cliente</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {plannerMedia.map(m => (
                  <button key={m.url} onClick={() => { onSelectMedia({ url: m.url, caption: m.caption }); onClose() }}
                    className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-[#2563EB] transition-all hover:scale-[1.02] group relative bg-[#101A2B]">
                    <img src={m.url} alt={m.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    <span onClick={(e) => { e.stopPropagation(); window.open(m.url, '_blank', 'noopener') }}
                      title="Ver em resolução original"
                      className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all">
                      <ZoomIn className="w-3.5 h-3.5" />
                    </span>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-white font-medium line-clamp-2">{m.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <div onClick={() => fileRef.current?.click()}
              className="w-full max-w-sm aspect-video border-2 border-dashed border-[#1e293b] rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#2563EB] hover:bg-[#2563EB]/10 transition-all">
              <Upload className="w-8 h-8 text-[#475569]" />
              <div className="text-center">
                <p className="text-sm text-[#94a3b8] font-medium">Clique para selecionar</p>
                <p className="text-xs text-[#64748b] mt-0.5">JPG, PNG, WEBP — máx. 10 MB</p>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); onClose() } }} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type AppView = 'gallery' | 'editor'

export function FeedOrganizer() {
  const { user, agencyId }  = useAuth()
  const { toast } = useToast()
  const { data: clients } = useClients()
  const { data: allVersions } = useFeeds()
  const { data: feedMeta }    = useFeedMeta()

  const createVersionMut = useCreateFeedVersion()
  const updateVersionMut = useUpdateFeedVersion()
  const deleteVersionMut = useDeleteFeedVersion()
  const upsertMetaMut    = useUpsertFeedMeta()

  // ── View state ─────────────────────────────────────────────────────────────
  const [view,             setView]            = useState<AppView>('gallery')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [galleryIdx,       setGalleryIdx]      = useState(0)

  // ── Editor state ───────────────────────────────────────────────────────────
  const [clientMenuOpen,  setClientMenuOpen]  = useState(false)
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [activeDragId,    setActiveDragId]    = useState<string | null>(null)
  const [pickerOpen,      setPickerOpen]      = useState(false)
  const [isUploading,     setIsUploading]     = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // ── Derived from server data ────────────────────────────────────────────────

  const versionsByClient = useMemo(() => {
    const map: Record<string, FeedVersion[]> = {}
    for (const v of allVersions ?? []) (map[v.client_id] ??= []).push(v)
    return map
  }, [allVersions])

  const versions = selectedClientId ? (versionsByClient[selectedClientId] ?? []) : []
  const clientMeta: FeedClientMeta =
    (selectedClientId && feedMeta?.[selectedClientId]) || { bio: '', link: '' }

  // Keep the active version valid as server data changes (create / delete / load).
  useEffect(() => {
    if (view !== 'editor') return
    if (versions.length === 0) {
      if (activeVersionId !== null) setActiveVersionId(null)
      return
    }
    if (!activeVersionId || !versions.some(v => v.id === activeVersionId)) {
      setActiveVersionId(versions[0].id)
    }
  }, [view, versions, activeVersionId])

  // ── Load / open client feed ────────────────────────────────────────────────

  const openEditor = useCallback((clientId: string) => {
    setActiveVersionId(versionsByClient[clientId]?.[0]?.id ?? null)
    setSelectedClientId(clientId)
    setView('editor')
  }, [versionsByClient])

  const handleSaveAndBack = () => {
    toast('Feed salvo com sucesso!', 'success')
    setView('gallery')
  }

  // ── Meta ───────────────────────────────────────────────────────────────────

  const handleMetaChange = (meta: FeedClientMeta) => {
    if (!selectedClientId) return
    upsertMetaMut.mutate({ client_id: selectedClientId, ...meta })
  }

  // ── Versions ───────────────────────────────────────────────────────────────

  const createVersion = () => {
    if (!selectedClientId) return
    createVersionMut.mutate(
      { client_id: selectedClientId, name: `Versão ${versions.length + 1}`, posts: [] },
      {
        onSuccess: v => setActiveVersionId(v.id),
        onError: e => toast((e as Error).message || 'Erro ao criar versão.', 'error'),
      },
    )
  }

  const renameVersion = (id: string, name: string) =>
    updateVersionMut.mutate({ id, name })

  const deleteVersion = (id: string) => {
    if (activeVersionId === id) {
      const remaining = versions.filter(v => v.id !== id)
      setActiveVersionId(remaining[0]?.id ?? null)
    }
    deleteVersionMut.mutate(id, {
      onError: e => toast((e as Error).message || 'Erro ao excluir versão.', 'error'),
    })
  }

  const duplicateVersion = (id: string) => {
    const src = versions.find(v => v.id === id)
    if (!src || !selectedClientId) return
    createVersionMut.mutate(
      { client_id: selectedClientId, name: `${src.name} (cópia)`, posts: src.posts },
      {
        onSuccess: v => setActiveVersionId(v.id),
        onError: e => toast((e as Error).message || 'Erro ao duplicar versão.', 'error'),
      },
    )
  }

  // ── Posts ──────────────────────────────────────────────────────────────────

  const activeVersion = versions.find(v => v.id === activeVersionId) ?? null
  const posts = activeVersion?.posts ?? []

  const updatePosts = (newPosts: FeedPost[]) => {
    if (!activeVersionId) return
    updateVersionMut.mutate({ id: activeVersionId, posts: newPosts })
  }

  const addPostFromAsset = (asset: ContentAsset) => {
    if (!asset.media_url) return
    updatePosts([...posts, { id: crypto.randomUUID(), image_url: asset.media_url, caption: asset.title, asset_id: asset.id }])
  }

  // Reaproveita mídia que já existe no planejamento (sem re-upload)
  const addPostFromMedia = ({ url, caption }: { url: string; caption?: string }) => {
    if (!url) return
    updatePosts([...posts, { id: crypto.randomUUID(), image_url: url, caption }])
  }

  const addPostFromUpload = async (file: File) => {
    if (!user) return
    setIsUploading(true)
    try {
      const { allowed, message } = await checkStorageLimit(file.size)
      if (!allowed) { toast(message ?? 'Limite de armazenamento atingido.', 'error'); setIsUploading(false); return }
      const ext  = file.name.split('.').pop() || 'jpg'
      const path = `${agencyId!}/feed/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { url } = await uploadArquivo('content-assets', path, file)
      updatePosts([...posts, { id: crypto.randomUUID(), image_url: url }])
      toast('Imagem adicionada!', 'success')
    } catch (err: unknown) {
      toast((err as Error).message || 'Erro no upload.', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const removePost = (id: string) => updatePosts(posts.filter(p => p.id !== id))

  // ── DnD ───────────────────────────────────────────────────────────────────

  const handleDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id))
  const handleDragEnd   = (e: DragEndEvent) => {
    const { active, over } = e
    setActiveDragId(null)
    if (!over) return
    const from = posts.findIndex(p => p.id === active.id)
    const to   = parseInt(String(over.id).replace('cell-', ''), 10)
    if (from === -1 || isNaN(to) || from === to) return
    updatePosts(arrayMove(posts, from, Math.min(to, posts.length - 1)))
  }

  const gridCells      = Array.from({ length: posts.length + 3 }, (_, i) => ({ index: i, post: posts[i] ?? null }))
  const activeDragPost = activeDragId ? posts.find(p => p.id === activeDragId) : null
  const selectedClient = clients?.find(c => c.id === selectedClientId)

  // ── Gallery: clients that have feeds ──────────────────────────────────────

  const clientsWithFeeds = (clients || []).filter(c => (versionsByClient[c.id]?.length ?? 0) > 0)
  const clientsWithoutFeeds = (clients || []).filter(c => (versionsByClient[c.id]?.length ?? 0) === 0)

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY VIEW
  // ══════════════════════════════════════════════════════════════════════════

  if (view === 'gallery') {
    return (
      <div className="min-h-full bg-[#0B1020]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* Top bar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-[#F8FAFC]">Feeds criados</h2>
              <p className="text-xs text-[#64748b] mt-0.5">
                {clientsWithFeeds.length === 0
                  ? 'Nenhum feed criado ainda'
                  : `${clientsWithFeeds.length} cliente${clientsWithFeeds.length > 1 ? 's' : ''} com feed organizado`}
              </p>
            </div>

            {/* New feed dropdown */}
            <div className="relative">
              <button
                onClick={() => setClientMenuOpen(m => !m)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors hover:bg-[#1D4ED8]"
                style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}
              >
                <Plus className="w-3.5 h-3.5" /> Novo feed
              </button>

              <AnimatePresence>
                {clientMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setClientMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-full right-0 mt-1 z-20 bg-[#101A2B] border border-[#1e293b] rounded-xl shadow-lg py-1 min-w-[220px] max-h-64 overflow-y-auto"
                    >
                      <p className="px-3 py-1.5 text-[10px] text-[#64748b] uppercase tracking-wide font-medium">
                        Selecionar cliente
                      </p>
                      {(clients || []).length === 0 ? (
                        <p className="px-3 py-2 text-sm text-[#64748b]">Nenhum cliente cadastrado</p>
                      ) : (
                        (clients || []).map(c => (
                          <button key={c.id} onClick={() => { setClientMenuOpen(false); openEditor(c.id) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#F8FAFC] hover:bg-[#182233] transition-colors">
                            {c.logo_url ? (
                              <img src={c.logo_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-[#1e293b] flex items-center justify-center text-[10px] font-bold text-[#94a3b8] flex-shrink-0">
                                {c.company_name.charAt(0)}
                              </div>
                            )}
                            <span className="truncate">{c.company_name}</span>
                          </button>
                        ))
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Clients WITH feeds — prévia central com setas */}
          {clientsWithFeeds.length > 0 && (() => {
            const idx = Math.min(galleryIdx, clientsWithFeeds.length - 1)
            const activeClient   = clientsWithFeeds[idx]
            const activeVersions = versionsByClient[activeClient.id] ?? []
            const activePosts    = activeVersions[0]?.posts ?? []
            const activeMeta     = feedMeta?.[activeClient.id] ?? { bio: '', link: '' }
            const initial        = activeClient.company_name.charAt(0).toUpperCase()
            const username       = activeClient.instagram
              ? activeClient.instagram.replace(/^@/, '')
              : activeClient.company_name.toLowerCase().replace(/\s+/g, '_')
            const go = (d: 1 | -1) => setGalleryIdx(i => {
              const n = Math.min(galleryIdx, clientsWithFeeds.length - 1)
              return (n + d + clientsWithFeeds.length) % clientsWithFeeds.length
            })
            const cells = Array.from({ length: Math.max(9, Math.ceil(activePosts.length / 3) * 3) }, (_, i) => activePosts[i] ?? null)

            return (
              <div className="flex items-center justify-center gap-3 sm:gap-5">
                {/* Seta esquerda */}
                {clientsWithFeeds.length > 1 && (
                  <button
                    onClick={() => go(-1)}
                    aria-label="Feed anterior"
                    className="flex-shrink-0 w-10 h-10 rounded-full bg-[#182233] border border-[#1e293b] flex items-center justify-center text-[#94a3b8] hover:text-white hover:border-[#2563EB]/50 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}

                {/* Prévia central (estilo perfil do Instagram) */}
                <div className="w-full max-w-md bg-[#111827] rounded-3xl border border-[#1e293b] overflow-hidden shadow-xl">
                  {/* Header do perfil */}
                  <div className="px-5 pt-5 pb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-[72px] h-[72px] rounded-full p-[2px] flex-shrink-0"
                        style={{ background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}>
                        <div className="w-full h-full rounded-full bg-[#111827] p-[2px]">
                          {activeClient.logo_url ? (
                            <img src={activeClient.logo_url} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <div className="w-full h-full rounded-full bg-[#0B1020] flex items-center justify-center text-xl font-bold text-[#94a3b8]">{initial}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-[#F8FAFC] truncate">{username}</p>
                        <div className="flex items-center gap-5 mt-1.5">
                          <div className="text-center">
                            <p className="text-[13px] font-bold text-[#F8FAFC] leading-none">{activePosts.length}</p>
                            <p className="text-[10px] text-[#94a3b8] mt-0.5">posts</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[13px] font-bold text-[#F8FAFC] leading-none">—</p>
                            <p className="text-[10px] text-[#94a3b8] mt-0.5">seguidores</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[13px] font-bold text-[#F8FAFC] leading-none">—</p>
                            <p className="text-[10px] text-[#94a3b8] mt-0.5">seguindo</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bio */}
                    <div className="mt-3 space-y-1">
                      <p className="text-[12px] font-semibold text-[#F8FAFC]">{activeClient.company_name}</p>
                      {activeMeta.bio ? (
                        <p className="text-[12.5px] text-[#CBD5E1] leading-relaxed whitespace-pre-wrap">{activeMeta.bio}</p>
                      ) : (
                        <p className="text-[12px] text-[#64748b] italic">Sem bio cadastrada — edite o feed para adicionar.</p>
                      )}
                      {activeMeta.link && (
                        <a href={activeMeta.link.startsWith('http') ? activeMeta.link : `https://${activeMeta.link}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[12px] text-[#60A5FA] font-medium hover:underline">
                          <Link2 className="w-3 h-3" /> {activeMeta.link.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Grade do feed (maior) */}
                  <div className="grid grid-cols-3 gap-[2px] bg-[#1e293b]">
                    {cells.map((post, i) => (
                      <div key={i} className="aspect-square bg-[#0B1020]">
                        {post && <img src={post.image_url} alt="" className="w-full h-full object-cover" draggable={false} />}
                      </div>
                    ))}
                  </div>

                  {/* Rodapé: versões + editar */}
                  <div className="px-4 py-3.5 flex items-center justify-between gap-3 border-t border-[#1e293b]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#64748b]">
                        {activeVersions.length} {activeVersions.length === 1 ? 'versão' : 'versões'}
                      </span>
                      <span className="text-[10px] text-[#94a3b8] bg-[#182233] border border-[#1e293b] px-2 py-0.5 rounded-full">Versão 1</span>
                    </div>
                    <button
                      onClick={() => openEditor(activeClient.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold transition-colors hover:bg-[#1D4ED8]"
                      style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar feed
                    </button>
                  </div>
                </div>

                {/* Seta direita */}
                {clientsWithFeeds.length > 1 && (
                  <button
                    onClick={() => go(1)}
                    aria-label="Próximo feed"
                    className="flex-shrink-0 w-10 h-10 rounded-full bg-[#182233] border border-[#1e293b] flex items-center justify-center text-[#94a3b8] hover:text-white hover:border-[#2563EB]/50 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            )
          })()}

          {/* Indicadores do carrossel */}
          {clientsWithFeeds.length > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              {clientsWithFeeds.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => setGalleryIdx(i)}
                  aria-label={`Ir para ${c.company_name}`}
                  className={`rounded-full transition-all ${
                    Math.min(galleryIdx, clientsWithFeeds.length - 1) === i ? 'w-5 h-1.5 bg-[#29457a]' : 'w-1.5 h-1.5 bg-[#1e293b] hover:bg-[#334155]'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {clientsWithFeeds.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-[#64748b]">
              <div className="w-20 h-20 rounded-full mb-5 flex items-center justify-center"
                style={{ background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}>
                <LayoutGrid className="w-9 h-9 text-white" />
              </div>
              <p className="text-base font-semibold text-[#CBD5E1]">Nenhum feed criado ainda</p>
              <p className="text-sm mt-1 text-center max-w-xs text-[#64748b]">
                Clique em "Novo feed" e selecione um cliente para começar a organizar o feed do Instagram.
              </p>
            </div>
          )}

          {/* Clients without feeds (suggestion row) */}
          {clientsWithoutFeeds.length > 0 && clientsWithFeeds.length > 0 && (
            <div>
              <p className="text-[11px] text-[#64748b] uppercase tracking-wide font-medium mb-3">
                Clientes sem feed
              </p>
              <div className="flex flex-wrap gap-2">
                {clientsWithoutFeeds.map(c => (
                  <button key={c.id} onClick={() => openEditor(c.id)}
                    className="flex items-center gap-2 px-3 py-2 bg-[#182233] border border-[#1e293b] rounded-xl text-[12px] text-[#94a3b8] hover:border-[#2563EB] hover:text-[#F8FAFC] transition-colors shadow-sm">
                    {c.logo_url ? (
                      <img src={c.logo_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[#1e293b] flex items-center justify-center text-[9px] font-bold text-[#94a3b8]">
                        {c.company_name.charAt(0)}
                      </div>
                    )}
                    {c.company_name}
                    <Plus className="w-3 h-3" />
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EDITOR VIEW
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-full bg-[#0B1020]">
      {/* Editor top bar */}
      <div className="flex items-center justify-between h-14 px-4 sm:px-6 bg-[#182233] border-b border-[#1e293b] flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={handleSaveAndBack}
            className="flex items-center gap-1.5 text-[#94a3b8] hover:text-[#F8FAFC] transition-colors text-[13px]">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-[#1e293b]" />
          <div className="flex items-center gap-2">
            {selectedClient?.logo_url ? (
              <img src={selectedClient.logo_url} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#101A2B] flex items-center justify-center text-[10px] font-bold text-[#94a3b8]">
                {selectedClient?.company_name.charAt(0)}
              </div>
            )}
            <span className="text-sm font-semibold text-[#F8FAFC]">{selectedClient?.company_name}</span>
            {activeVersion && (
              <span className="text-[11px] text-[#94a3b8] bg-[#101A2B] px-2 py-0.5 rounded-full">
                {activeVersion.name}
              </span>
            )}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSaveAndBack}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors hover:bg-[#1D4ED8]"
          style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}
        >
          <Save className="w-3.5 h-3.5" />
          Salvar e voltar
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {selectedClient && (
          <>
            {/* Instagram header */}
            <InstagramHeader
              client={selectedClient}
              postsCount={posts.length}
              meta={clientMeta}
              onMetaChange={handleMetaChange}
            />

            {/* Version chips */}
            <div className="bg-[#182233] rounded-2xl border border-[#1e293b] shadow-sm p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-[#64748b] uppercase tracking-wide font-medium mr-1">Versões</span>
                {versions.length === 0 && <span className="text-sm text-[#64748b]">Nenhuma versão criada</span>}
                {versions.map(v => (
                  <VersionChip key={v.id} version={v} isActive={v.id === activeVersionId}
                    onClick={() => setActiveVersionId(v.id)}
                    onRename={name => renameVersion(v.id, name)}
                    onDelete={() => deleteVersion(v.id)}
                    onDuplicate={() => duplicateVersion(v.id)} />
                ))}
                <button onClick={createVersion}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium text-[#94a3b8] border border-dashed border-[#1e293b] hover:border-[#2563EB] hover:text-[#F8FAFC] transition-colors">
                  <Plus className="w-3 h-3" /> Nova versão
                </button>
              </div>
            </div>

            {/* No version */}
            {!activeVersion && (
              <div className="flex flex-col items-center justify-center py-16">
                <GripVertical className="w-10 h-10 mb-3 text-[#475569]" />
                <p className="text-sm font-medium text-[#94a3b8]">Crie uma versão para começar</p>
                <button onClick={createVersion}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium hover:bg-[#1D4ED8] transition-colors"
                  style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}>
                  <Plus className="w-3.5 h-3.5" /> Criar Versão 1
                </button>
              </div>
            )}

            {/* Grid */}
            {activeVersion && (
              <div className="bg-[#182233] rounded-2xl border border-[#1e293b] shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
                  <div className="flex items-center gap-2">
                    <Instagram className="w-4 h-4 text-pink-500" />
                    <span className="text-sm font-semibold text-[#F8FAFC]">{activeVersion.name}</span>
                    <span className="text-xs text-[#94a3b8] bg-[#101A2B] px-2 py-0.5 rounded-full">
                      3 colunas · {posts.length} posts
                    </span>
                  </div>
                  <button onClick={() => setPickerOpen(true)} disabled={isUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-medium disabled:opacity-60 hover:bg-[#1D4ED8] transition-colors"
                    style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}>
                    {isUploading
                      ? <><Upload className="w-3.5 h-3.5 animate-pulse" /> Enviando...</>
                      : <><Plus className="w-3.5 h-3.5" /> Adicionar post</>}
                  </button>
                </div>

                <div className="px-4 py-2 bg-[#101A2B] border-b border-[#1e293b]">
                  <p className="text-[11px] text-[#64748b] flex items-center gap-1.5">
                    <GripVertical className="w-3 h-3" />
                    Arraste os posts para reorganizar a ordem do feed
                  </p>
                </div>

                <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                  <div className="grid grid-cols-3 gap-[2px] p-[2px] bg-[#1e293b]">
                    {gridCells.map(({ index, post }) =>
                      post ? (
                        <DraggableCard key={post.id} post={post} index={index}
                          onRemove={() => removePost(post.id)} isActive={activeDragId === post.id} />
                      ) : (
                        <EmptySlot key={`empty-${index}`} index={index} onAdd={() => setPickerOpen(true)} />
                      )
                    )}
                  </div>
                  <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                    {activeDragPost ? (
                      <div className="rounded-[2px] overflow-hidden shadow-2xl ring-2 ring-blue-400 opacity-95"
                        style={{ width: 160, height: 160 }}>
                        <img src={activeDragPost.image_url} alt="" className="w-full h-full object-cover" draggable={false} />
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>

                {posts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Images className="w-10 h-10 mb-3 text-[#475569]" />
                    <p className="text-sm font-medium text-[#94a3b8]">Feed vazio</p>
                    <button onClick={() => setPickerOpen(true)}
                      className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium hover:bg-[#1D4ED8] transition-colors"
                      style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}>
                      <Plus className="w-3.5 h-3.5" /> Adicionar primeiro post
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <AssetPickerDialog
        open={pickerOpen} onClose={() => setPickerOpen(false)}
        clientId={selectedClientId} onSelect={addPostFromAsset} onUpload={addPostFromUpload}
        onSelectMedia={addPostFromMedia}
      />
    </div>
  )
}
