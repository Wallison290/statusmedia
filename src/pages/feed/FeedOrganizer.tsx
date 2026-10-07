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

// ─── Estilos comuns ──────────────────────────────────────────────────────────

const IG_RING = 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
const card = { background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' } as const
const field = { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' } as const
const primaryBtn = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60'
const ghostBtn = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[12.5px] font-medium hover:bg-black/5 transition-colors'

function usernameOf(client: Client) {
  return client.instagram
    ? client.instagram.replace(/^@/, '')
    : client.company_name.toLowerCase().replace(/\s+/g, '_')
}

function Avatar({ client, size, ring = false }: { client: Client; size: number; ring?: boolean }) {
  const inner = client.logo_url ? (
    <img src={client.logo_url} alt="" className="w-full h-full rounded-full object-cover" />
  ) : (
    <span className="w-full h-full rounded-full flex items-center justify-center font-bold"
      style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-3)', fontSize: Math.round(size * 0.36) }}>
      {client.company_name.charAt(0).toUpperCase()}
    </span>
  )
  if (!ring) return <span className="block flex-shrink-0" style={{ width: size, height: size }}>{inner}</span>
  return (
    <span className="block rounded-full p-[2px] flex-shrink-0" style={{ width: size, height: size, background: IG_RING }}>
      <span className="block w-full h-full rounded-full p-[2px]" style={{ background: 'var(--sm-bg-card)' }}>{inner}</span>
    </span>
  )
}

function IgStats({ posts }: { posts: number }) {
  return (
    <div className="flex items-center gap-5">
      {[
        { label: 'posts', value: posts },
        { label: 'seguidores', value: '—' },
        { label: 'seguindo', value: '—' },
      ].map(s => (
        <div key={s.label} className="text-center">
          <p className="text-[13.5px] font-bold leading-none tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{s.value}</p>
          <p className="text-[10.5px] mt-1" style={{ color: 'var(--sm-text-3)' }}>{s.label}</p>
        </div>
      ))}
    </div>
  )
}

function BioLink({ link }: { link: string }) {
  return (
    <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold hover:underline" style={{ color: '#2563EB' }}>
      <Link2 className="w-3 h-3" /> {link.replace(/^https?:\/\//, '')}
    </a>
  )
}

// ─── Instagram Profile Header (editor) ────────────────────────────────────────

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

  const saveBio = () => {
    onMetaChange({ bio: bioValue.trim(), link: linkValue.trim() })
    setEditingBio(false)
  }

  return (
    <section className="rounded-2xl border px-5 py-5 md:px-6" style={card}>
      <div className="flex items-start gap-5">
        <Avatar client={client} size={80} ring />

        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-[16px] font-semibold leading-none" style={{ color: 'var(--sm-text-1)' }}>{usernameOf(client)}</h2>
            {!editingBio && (
              <button
                onClick={() => { setEditingBio(true); setBioValue(meta.bio); setLinkValue(meta.link) }}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[12px] font-medium hover:bg-black/5"
                style={{ color: 'var(--sm-text-3)' }}
              >
                <Pencil className="w-3 h-3" /> Editar bio
              </button>
            )}
          </div>

          <IgStats posts={postsCount} />

          {editingBio ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={bioValue}
                onChange={e => setBioValue(e.target.value)}
                placeholder="Escreva a bio do cliente..."
                rows={3}
                className="w-full text-[13px] border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/50 placeholder:text-[color:var(--sm-text-4)]"
                style={field}
              />
              <input
                value={linkValue}
                onChange={e => setLinkValue(e.target.value)}
                placeholder="Link (ex: linktr.ee/cliente)"
                className="w-full h-9 text-[13px] border rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/50 placeholder:text-[color:var(--sm-text-4)]"
                style={field}
              />
              <div className="flex items-center gap-2">
                <button onClick={saveBio} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
                  <Check className="w-3.5 h-3.5" /> Salvar
                </button>
                <button onClick={() => setEditingBio(false)} className={ghostBtn} style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-[12.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{client.company_name}</p>
              {meta.bio ? (
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--sm-text-2)' }}>{meta.bio}</p>
              ) : (
                <button className="text-[13px] text-left hover:underline" style={{ color: 'var(--sm-text-4)' }} onClick={() => setEditingBio(true)}>
                  Sem bio ainda. Clique para escrever.
                </button>
              )}
              {meta.link && <div><BioLink link={meta.link} /></div>}
              {client.niche && (
                <p className="text-[11.5px] pt-1" style={{ color: 'var(--sm-text-4)' }}>{client.niche}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── DnD: Draggable card ──────────────────────────────────────────────────────

function DraggableCard({ post, index, onRemove, isActive }: {
  post: FeedPost; index: number; onRemove: () => void; isActive: boolean
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: post.id, data: { post, index } })
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `cell-${index}` })

  return (
    <div
      ref={el => { setNodeRef(el); dropRef(el) }}
      className={`group relative aspect-square overflow-hidden cursor-grab active:cursor-grabbing transition-all duration-150 select-none
        ${isDragging ? 'opacity-0 scale-95' : ''}
        ${isOver && !isActive ? 'ring-2 ring-[#2563EB] ring-inset scale-[1.03]' : ''}`}
      style={{ touchAction: 'none', background: 'var(--sm-bg-alt)' }}
      {...listeners} {...attributes}
    >
      <img src={post.image_url} alt={post.caption || `Post ${index + 1}`}
        className="w-full h-full object-cover pointer-events-none" draggable={false} />
      {/* Sobre a foto: fundo preto translúcido fixo, legível em qualquer tema */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-1.5">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onRemove() }}
          title="Remover do feed" aria-label="Remover do feed"
          className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-red-500 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <span className="absolute bottom-1 left-1 min-w-[20px] h-5 px-1 rounded-full bg-black/60 flex items-center justify-center text-[9.5px] text-white font-bold tabular-nums">
        {index + 1}
      </span>
    </div>
  )
}

function EmptySlot({ index, onAdd }: { index: number; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${index}` })
  return (
    <button ref={setNodeRef} onClick={onAdd} aria-label="Adicionar post"
      className={`aspect-square flex items-center justify-center transition-all duration-150 ${isOver ? 'scale-[1.03]' : 'hover:bg-black/5'}`}
      style={{
        background: isOver ? 'rgba(37,99,235,0.10)' : 'var(--sm-bg-card)',
        outline: `1.5px dashed ${isOver ? '#2563EB' : 'var(--sm-border)'}`,
        outlineOffset: -6,
      }}>
      <Plus className="w-5 h-5" style={{ color: isOver ? '#2563EB' : 'var(--sm-text-4)' }} />
    </button>
  )
}

// ─── Versão (aba sublinhada com menu) ────────────────────────────────────────

function VersionChip({ version, isActive, onClick, onRename, onDelete, onDuplicate }: {
  version: FeedVersion; isActive: boolean; onClick: () => void
  onRename: (name: string) => void; onDelete: () => void; onDuplicate: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(version.name)
  const [menu,    setMenu]    = useState(false)
  const save = () => { const t = value.trim(); if (t) onRename(t); setEditing(false) }
  const item = 'w-full flex items-center gap-2 px-2.5 h-8 rounded-lg text-[12.5px] hover:bg-black/5'

  return (
    <div className="relative flex-shrink-0">
      <div
        className="flex items-center gap-1 h-10 pl-3 pr-1.5 border-b-2 -mb-px cursor-pointer whitespace-nowrap transition-colors"
        style={{ borderColor: isActive ? '#2563EB' : 'transparent' }}
        onClick={onClick}
      >
        {editing ? (
          <input autoFocus value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            onBlur={save} onClick={e => e.stopPropagation()}
            className="h-7 px-2 rounded-md border outline-none w-28 text-[13px]" style={field} />
        ) : (
          <span className={`text-[13px] ${isActive ? 'font-semibold' : 'font-medium'}`}
            style={{ color: isActive ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>{version.name}</span>
        )}
        <button onClick={e => { e.stopPropagation(); setMenu(m => !m) }} aria-label={`Opções de ${version.name}`}
          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--sm-text-4)' }}>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      <AnimatePresence>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }} transition={{ duration: 0.1 }}
              className="absolute top-full left-0 mt-1 z-20 border rounded-xl shadow-lg p-1 min-w-[150px]" style={card}>
              <button onClick={() => { setEditing(true); setMenu(false); onClick() }} className={item} style={{ color: 'var(--sm-text-1)' }}>
                <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} /> Renomear
              </button>
              <button onClick={() => { onDuplicate(); setMenu(false) }} className={item} style={{ color: 'var(--sm-text-1)' }}>
                <Copy className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} /> Duplicar
              </button>
              <div className="border-t my-1" style={{ borderColor: 'var(--sm-border)' }} />
              <button onClick={() => { onDelete(); setMenu(false) }} className={`${item} hover:bg-red-500/10`} style={{ color: '#EF4444' }}>
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

function PickerEmpty({ Icon, text }: { Icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--sm-border)' }}>
      <Icon className="w-7 h-7 mb-2" style={{ color: 'var(--sm-text-4)' }} />
      <p className="text-[13px]" style={{ color: 'var(--sm-text-3)' }}>{text}</p>
    </div>
  )
}

function PickerTile({ url, title, onPick }: { url: string; title: string; onPick: () => void }) {
  return (
    <button onClick={onPick}
      className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-[#2563EB] transition-all group relative"
      style={{ background: 'var(--sm-bg-alt)' }}>
      <img src={url} alt={title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
      <span onClick={(e) => { e.stopPropagation(); window.open(url, '_blank', 'noopener') }}
        title="Ver em resolução original"
        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all">
        <ZoomIn className="w-3.5 h-3.5" />
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10.5px] text-white font-medium line-clamp-2 text-left">{title}</span>
      </span>
    </button>
  )
}

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

  const TABS = [
    { id: 'arsenal', label: 'Arsenal', icon: Images },
    { id: 'planner', label: 'Do planejamento', icon: LayoutGrid },
    { id: 'upload',  label: 'Upload', icon: Upload },
  ] as const

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] !flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold text-[color:var(--sm-text-1)]">Adicionar post ao feed</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 border-b mb-4" style={{ borderColor: 'var(--sm-border)' }}>
          {TABS.map(t => {
            const ativo = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 h-10 px-3 border-b-2 -mb-px text-[13px] transition-colors"
                style={{ borderColor: ativo ? '#2563EB' : 'transparent', color: ativo ? 'var(--sm-text-1)' : 'var(--sm-text-3)', fontWeight: ativo ? 600 : 500 }}>
                <t.icon className="w-3.5 h-3.5" style={{ color: ativo ? '#2563EB' : 'var(--sm-text-4)' }} /> {t.label}
              </button>
            )
          })}
        </div>
        {tab === 'arsenal' ? (
          <div className="flex-1 overflow-y-auto min-h-0">
            {assets.length === 0 ? (
              <PickerEmpty Icon={Images} text="Nenhuma imagem no arsenal" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {assets.map(asset => (
                  <PickerTile key={asset.id} url={asset.media_url!} title={asset.title} onPick={() => { onSelect(asset); onClose() }} />
                ))}
              </div>
            )}
          </div>
        ) : tab === 'planner' ? (
          <div className="flex-1 overflow-y-auto min-h-0">
            {!clientId ? (
              <PickerEmpty Icon={LayoutGrid} text="Selecione um cliente para ver o planejamento" />
            ) : plannerMedia.length === 0 ? (
              <PickerEmpty Icon={LayoutGrid} text="Nenhuma mídia no planejamento deste cliente" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {plannerMedia.map(m => (
                  <PickerTile key={m.url} url={m.url} title={m.title} onPick={() => { onSelectMedia({ url: m.url, caption: m.caption }); onClose() }} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <button onClick={() => fileRef.current?.click()}
              className="w-full max-w-sm aspect-video border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-[#2563EB] hover:bg-[#2563EB]/5 transition-all"
              style={{ borderColor: 'var(--sm-border)' }}>
              <Upload className="w-7 h-7" style={{ color: 'var(--sm-text-4)' }} />
              <span className="text-center">
                <span className="block text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Clique para selecionar</span>
                <span className="block text-[12px] mt-0.5" style={{ color: 'var(--sm-text-4)' }}>JPG, PNG, WEBP · até 10 MB</span>
              </span>
            </button>
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
    const idx = Math.min(galleryIdx, Math.max(clientsWithFeeds.length - 1, 0))
    const activeClient = clientsWithFeeds[idx]

    const sectionTitle = (n: string, text: string, aside?: React.ReactNode) => (
      <div className="flex items-end justify-between gap-3 mb-2.5">
        <h2 className="flex items-baseline gap-2">
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{n}</span>
          <span className="font-display text-[16px] font-bold" style={{ color: 'var(--sm-text-1)' }}>{text}</span>
        </h2>
        {aside}
      </div>
    )

    return (
      <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
        <div className="max-w-6xl mx-auto p-4 md:p-6">

          {/* Cabeçalho (no celular, ao lado do menu) */}
          <header className="mb-6 max-md:pl-12 max-md:-mt-[3.25rem] flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Conteúdo</p>
              <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>
                Feed do Perfil
              </h1>
              <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
                {clientsWithFeeds.length === 0
                  ? 'Monte a grade do Instagram antes de publicar.'
                  : `${clientsWithFeeds.length} cliente${clientsWithFeeds.length > 1 ? 's' : ''} com feed organizado`}
              </p>
            </div>

            <div className="relative">
              <button onClick={() => setClientMenuOpen(m => !m)} aria-expanded={clientMenuOpen}
                className={`${primaryBtn} h-10 px-4 text-[13px]`} style={{ background: 'var(--sm-primary)' }}>
                <Plus className="w-4 h-4" /> Novo feed
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
                      className="absolute top-full right-0 mt-1.5 z-20 border rounded-xl shadow-2xl p-1.5 w-[240px] max-w-[calc(100vw-2rem)] max-h-72 overflow-y-auto"
                      style={card}
                    >
                      <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-4)' }}>
                        Escolha o cliente
                      </p>
                      {(clients || []).length === 0 ? (
                        <p className="px-2.5 py-2 text-[13px]" style={{ color: 'var(--sm-text-3)' }}>Nenhum cliente cadastrado</p>
                      ) : (
                        (clients || []).map(c => (
                          <button key={c.id} onClick={() => { setClientMenuOpen(false); openEditor(c.id) }}
                            className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] hover:bg-black/5 transition-colors"
                            style={{ color: 'var(--sm-text-1)' }}>
                            <Avatar client={c} size={24} />
                            <span className="truncate">{c.company_name}</span>
                          </button>
                        ))
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </header>

          {clientsWithFeeds.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-16 px-4 text-center" style={{ borderColor: 'var(--sm-border)' }}>
              <LayoutGrid className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--sm-text-4)' }} />
              <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Nenhum feed criado ainda</p>
              <p className="text-[12.5px] mt-1 max-w-xs mx-auto" style={{ color: 'var(--sm-text-3)' }}>
                Clique em “Novo feed” e escolha um cliente para organizar a grade do Instagram.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6 lg:gap-8 items-start">

              {/* Prévia do perfil escolhido (no celular vem primeiro) */}
              {activeClient && (() => {
                const activeVersions = versionsByClient[activeClient.id] ?? []
                const activePosts    = activeVersions[0]?.posts ?? []
                const activeMeta     = feedMeta?.[activeClient.id] ?? { bio: '', link: '' }
                const cells = Array.from({ length: Math.max(9, Math.ceil(activePosts.length / 3) * 3) }, (_, i) => activePosts[i] ?? null)
                return (
                  <motion.div key={activeClient.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="lg:order-2 lg:sticky lg:top-4 w-full max-w-md mx-auto lg:max-w-none rounded-3xl border overflow-hidden"
                    style={{ ...card, boxShadow: '0 18px 40px -24px rgba(15,23,42,0.35)' }}>
                    <div className="px-5 pt-5 pb-4">
                      <div className="flex items-center gap-4">
                        <Avatar client={activeClient} size={72} ring />
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{usernameOf(activeClient)}</p>
                          <div className="mt-2"><IgStats posts={activePosts.length} /></div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <p className="text-[12.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{activeClient.company_name}</p>
                        {activeMeta.bio ? (
                          <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--sm-text-2)' }}>{activeMeta.bio}</p>
                        ) : (
                          <p className="text-[12px] italic" style={{ color: 'var(--sm-text-4)' }}>Sem bio cadastrada. Edite o feed para adicionar.</p>
                        )}
                        {activeMeta.link && <BioLink link={activeMeta.link} />}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-[2px]" style={{ background: 'var(--sm-border)' }}>
                      {cells.map((post, i) => (
                        <div key={i} className="aspect-square" style={{ background: 'var(--sm-bg-alt)' }}>
                          {post && <img src={post.image_url} alt="" className="w-full h-full object-cover" draggable={false} />}
                        </div>
                      ))}
                    </div>

                    <div className="px-4 py-3 flex items-center justify-between gap-3 border-t" style={{ borderColor: 'var(--sm-border)' }}>
                      <span className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
                        {activeVersions[0]?.name ?? 'Versão 1'}
                        {activeVersions.length > 1 && <span style={{ color: 'var(--sm-text-4)' }}> · +{activeVersions.length - 1} versõe{activeVersions.length - 1 > 1 ? 's' : ''}</span>}
                      </span>
                      <button onClick={() => openEditor(activeClient.id)} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
                        <Pencil className="w-3.5 h-3.5" /> Editar feed
                      </button>
                    </div>
                  </motion.div>
                )
              })()}

              {/* Lista de feeds + clientes sem feed */}
              <div className="lg:order-1 space-y-8 min-w-0">
                <section>
                  {sectionTitle('01', 'Feeds organizados',
                    <span className="text-[12px] tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{clientsWithFeeds.length}</span>)}
                  <div className="rounded-2xl border overflow-hidden" style={card}>
                    {clientsWithFeeds.map((c, i) => {
                      const vs = versionsByClient[c.id] ?? []
                      const n  = vs[0]?.posts?.length ?? 0
                      const ativo = i === idx
                      return (
                        <div key={c.id}
                          className={`relative flex items-center gap-3 pl-4 pr-2 py-3 cursor-pointer transition-colors ${i > 0 ? 'border-t' : ''} ${ativo ? '' : 'hover:bg-black/[0.02]'}`}
                          style={{ borderColor: 'var(--sm-border)', background: ativo ? 'rgba(37,99,235,0.06)' : undefined }}
                          onClick={() => setGalleryIdx(i)}
                          aria-current={ativo ? 'true' : undefined}
                        >
                          {ativo && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: '#2563EB' }} />}
                          <span className="text-[11.5px] font-semibold tabular-nums w-5" style={{ color: 'var(--sm-text-4)' }}>{String(i + 1).padStart(2, '0')}</span>
                          <Avatar client={c} size={34} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13.5px] truncate ${ativo ? 'font-semibold' : 'font-medium'}`} style={{ color: 'var(--sm-text-1)' }}>{c.company_name}</p>
                            <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-4)' }}>
                              @{usernameOf(c)} · {n} post{n !== 1 ? 's' : ''} · {vs.length} {vs.length === 1 ? 'versão' : 'versões'}
                            </p>
                          </div>
                          <button onClick={e => { e.stopPropagation(); openEditor(c.id) }}
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12px] font-semibold hover:bg-black/5"
                            style={{ color: '#2563EB' }}>
                            Editar <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </section>

                {clientsWithoutFeeds.length > 0 && (
                  <section>
                    {sectionTitle('02', 'Clientes sem feed',
                      <span className="text-[12px] tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{clientsWithoutFeeds.length}</span>)}
                    <div className="flex flex-wrap gap-2">
                      {clientsWithoutFeeds.map(c => (
                        <button key={c.id} onClick={() => openEditor(c.id)}
                          className="inline-flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border text-[12.5px] font-medium hover:border-[#2563EB]/50 hover:bg-black/[0.02] transition-colors"
                          style={{ ...card, color: 'var(--sm-text-2)' }}>
                          <Avatar client={c} size={24} />
                          {c.company_name}
                          <Plus className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
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
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">

        {/* Barra de topo: voltar + salvar (no celular, ao lado do menu) */}
        <div className="flex items-center justify-between gap-3 max-md:pl-12 max-md:-mt-[3.25rem] max-md:min-h-[44px]">
          <button onClick={handleSaveAndBack}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline" style={{ color: 'var(--sm-text-3)' }}>
            <ArrowLeft className="w-4 h-4" /> Feed do Perfil
          </button>
          <button onClick={handleSaveAndBack} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
            <Save className="w-3.5 h-3.5" /> Salvar e voltar
          </button>
        </div>

        {selectedClient && (
          <>
            <InstagramHeader
              client={selectedClient}
              postsCount={posts.length}
              meta={clientMeta}
              onMetaChange={handleMetaChange}
            />

            {/* Versões como abas sublinhadas */}
            <div className="flex items-end gap-1 border-b overflow-x-auto scrollbar-none" style={{ borderColor: 'var(--sm-border)' }}>
              {versions.map(v => (
                <VersionChip key={v.id} version={v} isActive={v.id === activeVersionId}
                  onClick={() => setActiveVersionId(v.id)}
                  onRename={name => renameVersion(v.id, name)}
                  onDelete={() => deleteVersion(v.id)}
                  onDuplicate={() => duplicateVersion(v.id)} />
              ))}
              <button onClick={createVersion}
                className="flex-shrink-0 inline-flex items-center gap-1 h-10 px-3 text-[12.5px] font-semibold whitespace-nowrap hover:underline"
                style={{ color: '#2563EB' }}>
                <Plus className="w-3.5 h-3.5" /> Nova versão
              </button>
            </div>

            {!activeVersion && (
              <div className="rounded-2xl border border-dashed py-14 px-4 text-center" style={{ borderColor: 'var(--sm-border)' }}>
                <GripVertical className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--sm-text-4)' }} />
                <p className="text-[13px] font-medium" style={{ color: 'var(--sm-text-2)' }}>Crie uma versão para começar</p>
                <button onClick={createVersion} className={`${primaryBtn} mt-3`} style={{ background: 'var(--sm-primary)' }}>
                  <Plus className="w-3.5 h-3.5" /> Criar Versão 1
                </button>
              </div>
            )}

            {activeVersion && (
              <section className="rounded-2xl border overflow-hidden" style={card}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--sm-border)' }}>
                  <div className="min-w-0">
                    <p className="font-display text-[15px] font-bold truncate" style={{ color: 'var(--sm-text-1)' }}>{activeVersion.name}</p>
                    <p className="text-[11.5px] flex items-center gap-1" style={{ color: 'var(--sm-text-4)' }}>
                      <GripVertical className="w-3 h-3" /> {posts.length} post{posts.length !== 1 ? 's' : ''} · arraste para mudar a ordem
                    </p>
                  </div>
                  <button onClick={() => setPickerOpen(true)} disabled={isUploading} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
                    {isUploading
                      ? <><Upload className="w-3.5 h-3.5 animate-pulse" /> Enviando...</>
                      : <><Plus className="w-3.5 h-3.5" /> Adicionar post</>}
                  </button>
                </div>

                <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                  <div className="grid grid-cols-3 gap-[2px] p-[2px]" style={{ background: 'var(--sm-border)' }}>
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
                      <div className="overflow-hidden shadow-2xl ring-2 ring-[#2563EB] opacity-95" style={{ width: 160, height: 160 }}>
                        <img src={activeDragPost.image_url} alt="" className="w-full h-full object-cover" draggable={false} />
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>

                {posts.length === 0 && (
                  <p className="text-center text-[12.5px] py-4" style={{ color: 'var(--sm-text-4)' }}>
                    Feed vazio. Clique num quadrado ou em “Adicionar post”.
                  </p>
                )}
              </section>
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
