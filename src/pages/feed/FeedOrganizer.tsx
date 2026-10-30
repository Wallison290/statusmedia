// ── Feed do Perfil ───────────────────────────────────────────────────────────
// Visual em vidro (como Dashboard, CRM e Clientes): a visão geral mostra os
// feeds como cartões com o mosaico da grade e uma prévia num celular ao lado;
// o editor tem a grade grande para arrastar à esquerda e o perfil (bio, link,
// versão) numa coluna à direita. As versões ficam numa cápsula de abas.

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, Pencil, Check, X, ChevronDown, Upload,
  Images, GripVertical, Copy, Link2,
  ArrowLeft, LayoutGrid, ChevronRight, ZoomIn, Hand, Layers, MousePointerClick,
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
const field = { background: 'var(--sm-field-bg, var(--sm-bg-input))', borderColor: 'var(--sm-field-border, var(--sm-border))', color: 'var(--sm-text-1)' } as const
// Botão principal: classe bg-[#2563EB] vira o gradiente navy do kit (index.css)
const primaryBtn = 'inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full text-[12.5px] font-semibold text-white bg-[#2563EB] transition-opacity hover:opacity-90 disabled:opacity-60'
const ghostBtn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-full border text-[12.5px] font-medium transition-colors hover:bg-[var(--sm-bg-alt)]'

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
      {/* card2: quase opaco dentro do painel de vidro, o anel não vaza */}
      <span className="block w-full h-full rounded-full p-[2px]" style={{ background: 'var(--sm-bg-card2)' }}>{inner}</span>
    </span>
  )
}

function IgStats({ posts, compact = false }: { posts: number; compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? 'gap-4' : 'gap-6'}`}>
      {[
        { label: 'posts', value: posts },
        { label: 'seguidores', value: '—' },
        { label: 'seguindo', value: '—' },
      ].map(s => (
        <div key={s.label} className="text-center">
          <p className={`${compact ? 'text-[13px]' : 'text-[15px]'} font-bold leading-none tabular-nums`} style={{ color: 'var(--sm-text-1)' }}>{s.value}</p>
          <p className="text-[10.5px] mt-1" style={{ color: 'var(--sm-text-3)' }}>{s.label}</p>
        </div>
      ))}
    </div>
  )
}

function BioLink({ link }: { link: string }) {
  return (
    <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold hover:underline" style={{ color: 'var(--sm-brand-media, #2563EB)' }}>
      <Link2 className="w-3 h-3" /> {link.replace(/^https?:\/\//, '')}
    </a>
  )
}

function SectionHead({ n, title, aside }: { n: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <h2 className="flex items-baseline gap-2">
        <span className="font-display text-[17px] font-bold tracking-[-0.01em]" style={{ color: 'var(--sm-text-1)' }}>{title}</span>
      </h2>
      {aside}
    </div>
  )
}

// ─── Mosaico 3×3 (cartão da visão geral) ─────────────────────────────────────

function Mosaic({ posts }: { posts: FeedPost[] }) {
  const cells = Array.from({ length: 9 }, (_, i) => posts[i] ?? null)
  return (
    <div className="grid grid-cols-3 gap-[2px] rounded-2xl overflow-hidden" style={{ background: 'var(--sm-border)' }}>
      {cells.map((p, i) => (
        <div key={i} className="aspect-square" style={{ background: 'var(--sm-bg-alt)' }}>
          {p && <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-cover" draggable={false} />}
        </div>
      ))}
    </div>
  )
}

// ─── Prévia no celular ───────────────────────────────────────────────────────

function PhonePreview({ client, meta, posts, footer }: {
  client: Client; meta: FeedClientMeta; posts: FeedPost[]; footer?: React.ReactNode
}) {
  const cells = Array.from({ length: Math.max(9, Math.ceil(posts.length / 3) * 3) }, (_, i) => posts[i] ?? null)
  return (
    <div className="rounded-[40px] p-2.5 border"
      style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)', boxShadow: '0 30px 60px -30px rgba(5,8,22,0.55), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
      <div className="rounded-[32px] overflow-hidden border" style={{ background: 'var(--sm-bg-card2)', borderColor: 'var(--sm-border)' }}>
        {/* "Ilha" do celular */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="w-20 h-5 rounded-full" style={{ background: 'rgba(5,8,22,0.85)' }} />
        </div>
        <div className="px-4 pt-2 pb-3">
          <p className="text-center text-[12.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{usernameOf(client)}</p>
          <div className="flex items-center gap-4 mt-3">
            <Avatar client={client} size={64} ring />
            <div className="flex-1 min-w-0 flex justify-center"><IgStats posts={posts.length} compact /></div>
          </div>
          <div className="mt-3 space-y-0.5">
            <p className="text-[12px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{client.company_name}</p>
            {meta.bio ? (
              <p className="text-[12px] leading-relaxed whitespace-pre-wrap line-clamp-4" style={{ color: 'var(--sm-text-2)' }}>{meta.bio}</p>
            ) : (
              <p className="text-[11.5px] italic" style={{ color: 'var(--sm-text-4)' }}>Sem bio ainda.</p>
            )}
            {meta.link && <BioLink link={meta.link} />}
          </div>
        </div>
        <div className="flex border-t" style={{ borderColor: 'var(--sm-border)' }}>
          <span className="flex-1 flex justify-center py-2 border-b-2" style={{ borderColor: 'var(--sm-text-1)' }}>
            <LayoutGrid className="w-4 h-4" style={{ color: 'var(--sm-text-1)' }} />
          </span>
        </div>
        <div className="grid grid-cols-3 gap-[1.5px] max-h-[420px] overflow-y-auto scrollbar-none" style={{ background: 'var(--sm-border)' }}>
          {cells.map((post, i) => (
            <div key={i} className="aspect-square" style={{ background: 'var(--sm-bg-alt)' }}>
              {post && <img src={post.image_url} alt="" loading="lazy" className="w-full h-full object-cover" draggable={false} />}
            </div>
          ))}
        </div>
      </div>
      {footer && <div className="px-2 pt-3 pb-1.5">{footer}</div>}
    </div>
  )
}

// ─── Perfil (editor): bio e link ─────────────────────────────────────────────

function ProfileCard({
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
    <section className="sm-glass-tile rounded-[24px] p-5">
      <div className="flex items-center gap-4">
        <Avatar client={client} size={72} ring />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{usernameOf(client)}</p>
          <div className="mt-2"><IgStats posts={postsCount} compact /></div>
        </div>
      </div>

      {editingBio ? (
        <div className="space-y-2 mt-4">
          <textarea
            autoFocus
            value={bioValue}
            onChange={e => setBioValue(e.target.value)}
            placeholder="Escreva a bio do cliente..."
            rows={4}
            className="w-full text-[13px] border rounded-2xl px-3.5 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/50 placeholder:text-[color:var(--sm-text-4)]"
            style={field}
          />
          <input
            value={linkValue}
            onChange={e => setLinkValue(e.target.value)}
            placeholder="Link (ex: linktr.ee/cliente)"
            className="w-full h-10 text-[13px] border rounded-full px-4 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/50 placeholder:text-[color:var(--sm-text-4)]"
            style={field}
          />
          <div className="flex items-center gap-2 pt-1">
            <button onClick={saveBio} className={primaryBtn}>
              <Check className="w-3.5 h-3.5" /> Salvar bio
            </button>
            <button onClick={() => setEditingBio(false)} className={ghostBtn} style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-1">
          <p className="text-[12.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{client.company_name}</p>
          {meta.bio ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--sm-text-2)' }}>{meta.bio}</p>
          ) : (
            <p className="text-[12.5px]" style={{ color: 'var(--sm-text-4)' }}>Sem bio ainda.</p>
          )}
          {meta.link && <div><BioLink link={meta.link} /></div>}
          {client.niche && (
            <p className="text-[11.5px] pt-1" style={{ color: 'var(--sm-text-4)' }}>{client.niche}</p>
          )}
          <button
            onClick={() => { setEditingBio(true); setBioValue(meta.bio); setLinkValue(meta.link) }}
            className={`${ghostBtn} w-full mt-3`}
            style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}
          >
            <Pencil className="w-3.5 h-3.5" /> {meta.bio ? 'Editar bio e link' : 'Escrever bio'}
          </button>
        </div>
      )}
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
        ${isOver && !isActive ? 'ring-2 ring-[#2563EB] ring-inset scale-[1.03] z-10' : ''}`}
      style={{ touchAction: 'none', background: 'var(--sm-bg-alt)' }}
      {...listeners} {...attributes}
    >
      <img src={post.image_url} alt={post.caption || `Post ${index + 1}`}
        className="w-full h-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-[1.03]" draggable={false} />
      {/* Sobre a foto: preto translúcido fixo, legível em qualquer tema */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-1.5">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onRemove() }}
          title="Remover do feed" aria-label="Remover do feed"
          className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-red-500 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <span className="absolute bottom-1.5 left-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-[10px] text-white font-bold tabular-nums">
        {index + 1}
      </span>
    </div>
  )
}

function EmptySlot({ index, onAdd }: { index: number; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${index}` })
  return (
    <button ref={setNodeRef} onClick={onAdd} aria-label="Adicionar post"
      className={`group aspect-square flex flex-col items-center justify-center gap-1 transition-all duration-150 ${isOver ? 'scale-[1.03]' : ''}`}
      style={{
        background: isOver ? 'rgba(37,99,235,0.10)' : 'var(--sm-bg-card)',
        outline: `1.5px dashed ${isOver ? '#2563EB' : 'var(--sm-border)'}`,
        outlineOffset: -8,
      }}>
      <span className="w-8 h-8 rounded-full flex items-center justify-center transition-colors group-hover:bg-[rgba(37,99,235,0.12)]">
        <Plus className="w-4 h-4" style={{ color: isOver ? '#2563EB' : 'var(--sm-text-4)' }} />
      </span>
    </button>
  )
}

// ─── Versão (segmento da cápsula, com menu) ─────────────────────────────────

function VersionChip({ version, isActive, onClick, onRename, onDelete, onDuplicate }: {
  version: FeedVersion; isActive: boolean; onClick: () => void
  onRename: (name: string) => void; onDelete: () => void; onDuplicate: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(version.name)
  const [menu,    setMenu]    = useState(false)
  const save = () => { const t = value.trim(); if (t) onRename(t); setEditing(false) }
  const item = 'w-full flex items-center gap-2 px-2.5 h-9 rounded-xl text-[12.5px] transition-colors hover:bg-[var(--sm-bg-alt)]'

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`sm-glass-segment ${isActive ? 'is-active' : ''} flex items-center gap-0.5 h-8 pl-3.5 pr-1 rounded-full cursor-pointer whitespace-nowrap transition-colors`}
        onClick={onClick}
      >
        {editing ? (
          <input autoFocus value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            onBlur={save} onClick={e => e.stopPropagation()}
            className="h-6 px-2 rounded-full border outline-none w-28 text-[12.5px]" style={field} />
        ) : (
          <span className={`text-[12.5px] ${isActive ? 'font-semibold' : 'font-medium'}`}
            style={{ color: isActive ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>{version.name}</span>
        )}
        <button onClick={e => { e.stopPropagation(); setMenu(m => !m) }} aria-label={`Opções de ${version.name}`}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[var(--sm-bg-alt)]" style={{ color: 'var(--sm-text-4)' }}>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      <AnimatePresence>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <motion.div initial={{ opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }} transition={{ duration: 0.14 }}
              className="sm-glass-pop absolute top-full left-0 mt-1.5 z-20 rounded-2xl shadow-2xl p-1.5 min-w-[160px]">
              <button onClick={() => { setEditing(true); setMenu(false); onClick() }} className={item} style={{ color: 'var(--sm-text-1)' }}>
                <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} /> Renomear
              </button>
              <button onClick={() => { onDuplicate(); setMenu(false) }} className={item} style={{ color: 'var(--sm-text-1)' }}>
                <Copy className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} /> Duplicar
              </button>
              <div className="border-t my-1" style={{ borderColor: 'var(--sm-border)' }} />
              <button onClick={() => { onDelete(); setMenu(false) }} className={`${item} hover:!bg-red-500/10`} style={{ color: '#EF4444' }}>
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
    <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed" style={{ borderColor: 'var(--sm-border)' }}>
      <Icon className="w-7 h-7 mb-2" style={{ color: 'var(--sm-text-4)' }} />
      <p className="text-[13px]" style={{ color: 'var(--sm-text-3)' }}>{text}</p>
    </div>
  )
}

function PickerTile({ url, title, onPick }: { url: string; title: string; onPick: () => void }) {
  return (
    <button onClick={onPick}
      className="aspect-square rounded-2xl overflow-hidden border-2 border-transparent hover:border-[#2563EB] transition-all group relative"
      style={{ background: 'var(--sm-bg-alt)' }}>
      <img src={url} alt={title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
      <span onClick={(e) => { e.stopPropagation(); window.open(url, '_blank', 'noopener') }}
        title="Ver em resolução original"
        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all">
        <ZoomIn className="w-3.5 h-3.5" />
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
    { id: 'upload',  label: 'Enviar imagem', icon: Upload },
  ] as const

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent glass className="w-[95vw] max-w-[95vw] sm:max-w-3xl max-h-[85vh] !flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-display text-[19px] font-bold text-[color:var(--sm-text-1)]">Adicionar post ao feed</DialogTitle>
        </DialogHeader>
        {/* Abas em cápsula, como no resto do sistema */}
        <div className="grid grid-cols-3 gap-0.5 p-1 rounded-full border mb-1" style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
          {TABS.map(t => {
            const ativo = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`sm-glass-segment ${ativo ? 'is-active font-semibold' : 'font-medium hover:text-[var(--sm-text-1)]'} flex items-center justify-center gap-1.5 h-9 px-2 rounded-full text-[12.5px] min-w-0 transition-colors`}
                style={{ color: ativo ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>
                <t.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ativo ? '#2563EB' : undefined }} />
                <span className="truncate">{t.label}</span>
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
              className="w-full max-w-sm aspect-video border-2 border-dashed rounded-[24px] flex flex-col items-center justify-center gap-3 hover:border-[#2563EB] hover:bg-[#2563EB]/5 transition-all"
              style={{ borderColor: 'var(--sm-border)' }}>
              <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.12)' }}>
                <Upload className="w-5 h-5" style={{ color: '#2563EB' }} />
              </span>
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

  const header = (subtitle: string) => (
    <header className="mb-7 max-md:pl-12 max-md:-mt-[3.25rem] flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Conteúdo</p>
        <h1 className="font-display text-[30px] md:text-[38px] font-bold leading-[1.02] tracking-[-0.03em]" style={{ color: 'var(--sm-text-1)' }}>
          Feed do Perfil
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: 'var(--sm-text-3)' }}>{subtitle}</p>
      </div>

      <div className="relative">
        <button onClick={() => setClientMenuOpen(m => !m)} aria-expanded={clientMenuOpen}
          className={`${primaryBtn} h-10 px-5 text-[13px]`}>
          <Plus className="w-4 h-4" /> Novo feed
        </button>

        <AnimatePresence>
          {clientMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setClientMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="sm-glass-pop absolute top-full right-0 mt-2 z-20 rounded-[20px] shadow-2xl p-1.5 w-[260px] max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto origin-top-right"
              >
                <p className="px-2.5 pt-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--sm-text-4)' }}>
                  Escolha o cliente
                </p>
                {(clients || []).length === 0 ? (
                  <p className="px-2.5 py-2 text-[13px]" style={{ color: 'var(--sm-text-3)' }}>Nenhum cliente cadastrado</p>
                ) : (
                  (clients || []).map(c => (
                    <button key={c.id} onClick={() => { setClientMenuOpen(false); openEditor(c.id) }}
                      className="w-full flex items-center gap-2.5 px-2.5 h-10 rounded-xl text-[13px] transition-colors hover:bg-[var(--sm-bg-alt)]"
                      style={{ color: 'var(--sm-text-1)' }}>
                      <Avatar client={c} size={26} />
                      <span className="truncate flex-1 text-left">{c.company_name}</span>
                      {(versionsByClient[c.id]?.length ?? 0) > 0 && (
                        <span className="text-[10.5px]" style={{ color: 'var(--sm-text-4)' }}>com feed</span>
                      )}
                    </button>
                  ))
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </header>
  )

  if (view === 'gallery') {
    const idx = Math.min(galleryIdx, Math.max(clientsWithFeeds.length - 1, 0))
    const activeClient = clientsWithFeeds[idx]

    return (
      <div className="min-h-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-7 pb-12">
          {header(clientsWithFeeds.length === 0
            ? 'Monte a grade do Instagram antes de publicar.'
            : `${clientsWithFeeds.length} cliente${clientsWithFeeds.length > 1 ? 's' : ''} com feed organizado`)}

          {clientsWithFeeds.length === 0 ? (
            <div className="sm-glass-tile rounded-[28px] py-16 px-6 text-center">
              <div className="w-48 mx-auto mb-5 opacity-70"><Mosaic posts={[]} /></div>
              <p className="font-display text-[18px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Nenhum feed criado ainda</p>
              <p className="text-[13px] mt-1.5 max-w-sm mx-auto" style={{ color: 'var(--sm-text-3)' }}>
                Escolha um cliente e monte a grade do Instagram: arraste, troque a ordem e compare versões antes de publicar.
              </p>
              {clientsWithoutFeeds.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mt-6">
                  {clientsWithoutFeeds.slice(0, 8).map(c => (
                    <button key={c.id} onClick={() => openEditor(c.id)}
                      className="inline-flex items-center gap-2 h-9 pl-1.5 pr-3.5 rounded-full border text-[12.5px] font-medium transition-colors hover:border-[#2563EB]/50"
                      style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                      <Avatar client={c} size={24} /> {c.company_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 lg:gap-8 items-start">

              {/* Prévia no celular (no celular vem primeiro) */}
              {activeClient && (() => {
                const activeVersions = versionsByClient[activeClient.id] ?? []
                const activePosts    = activeVersions[0]?.posts ?? []
                const activeMeta     = feedMeta?.[activeClient.id] ?? { bio: '', link: '' }
                return (
                  <motion.div key={activeClient.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="lg:order-2 lg:sticky lg:top-4 w-full max-w-[360px] mx-auto">
                    <PhonePreview client={activeClient} meta={activeMeta} posts={activePosts}
                      footer={
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12px] min-w-0 truncate" style={{ color: 'var(--sm-text-3)' }}>
                            {activeVersions[0]?.name ?? 'Versão 1'}
                            {activeVersions.length > 1 && <span style={{ color: 'var(--sm-text-4)' }}> · +{activeVersions.length - 1}</span>}
                          </span>
                          <button onClick={() => openEditor(activeClient.id)} className={primaryBtn}>
                            <Pencil className="w-3.5 h-3.5" /> Editar feed
                          </button>
                        </div>
                      } />
                  </motion.div>
                )
              })()}

              {/* Feeds organizados + clientes sem feed */}
              <div className="lg:order-1 space-y-10 min-w-0">
                <section>
                  <SectionHead n="01" title="Feeds organizados" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    {clientsWithFeeds.map((c, i) => {
                      const vs = versionsByClient[c.id] ?? []
                      const n  = vs[0]?.posts?.length ?? 0
                      const ativo = i === idx
                      return (
                        <div key={c.id}
                          role="button" tabIndex={0}
                          onClick={() => setGalleryIdx(i)}
                          onDoubleClick={() => openEditor(c.id)}
                          onKeyDown={e => { if (e.key === 'Enter') setGalleryIdx(i) }}
                          aria-current={ativo ? 'true' : undefined}
                          className={`sm-glass-tile group rounded-[24px] p-2.5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${ativo ? '!border-[#2563EB]/70' : ''}`}
                          style={ativo ? { boxShadow: '0 0 0 1px rgba(37,99,235,0.55), 0 18px 40px -24px rgba(37,99,235,0.6)' } : undefined}
                        >
                          <Mosaic posts={vs[0]?.posts ?? []} />
                          <div className="flex items-center gap-2.5 mt-2.5 px-1 pb-0.5">
                            <Avatar client={c} size={30} ring={ativo} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{c.company_name}</p>
                              <p className="text-[11px] truncate" style={{ color: 'var(--sm-text-4)' }}>
                                {n} post{n !== 1 ? 's' : ''} · {vs.length} {vs.length === 1 ? 'versão' : 'versões'}
                              </p>
                            </div>
                            <button onClick={e => { e.stopPropagation(); openEditor(c.id) }}
                              title="Editar feed" aria-label={`Editar feed de ${c.company_name}`}
                              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-[var(--sm-bg-alt)]"
                              style={{ color: ativo ? '#2563EB' : 'var(--sm-text-3)' }}>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>

                {clientsWithoutFeeds.length > 0 && (
                  <section>
                    <SectionHead n="02" title="Clientes sem feed" />
                    <div className="flex flex-wrap gap-2">
                      {clientsWithoutFeeds.map(c => (
                        <button key={c.id} onClick={() => openEditor(c.id)}
                          className="group inline-flex items-center gap-2 h-10 pl-1.5 pr-3.5 rounded-full border text-[12.5px] font-medium transition-colors hover:border-[#2563EB]/50"
                          style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                          <Avatar client={c} size={28} />
                          {c.company_name}
                          <span className="w-5 h-5 rounded-full flex items-center justify-center transition-colors group-hover:bg-[rgba(37,99,235,0.14)]">
                            <Plus className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
                          </span>
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
    <div className="min-h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-7 pb-12">

        {/* Topo: voltar + título + salvar (no celular, ao lado do menu) */}
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-6 max-md:pl-12 max-md:-mt-[3.25rem]">
          <div className="min-w-0">
            <button onClick={handleSaveAndBack}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium hover:underline" style={{ color: 'var(--sm-text-3)' }}>
              <ArrowLeft className="w-3.5 h-3.5" /> Feed do Perfil
            </button>
            <h1 className="font-display text-[26px] md:text-[32px] font-bold leading-[1.05] tracking-[-0.025em] mt-1 truncate" style={{ color: 'var(--sm-text-1)' }}>
              {selectedClient?.company_name ?? 'Feed'}
            </h1>
          </div>
          <button onClick={handleSaveAndBack} className={`${primaryBtn} h-10 px-5 text-[13px]`}>
            <Check className="w-4 h-4" /> Concluir
          </button>
        </div>

        {selectedClient && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 lg:gap-8 items-start">

            {/* Coluna do perfil (no celular, em cima) */}
            <aside className="lg:order-2 lg:sticky lg:top-4 space-y-4 min-w-0">
              <ProfileCard
                client={selectedClient}
                postsCount={posts.length}
                meta={clientMeta}
                onMetaChange={handleMetaChange}
              />
              <div className="sm-glass-tile rounded-[24px] p-5 max-lg:hidden">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: 'var(--sm-text-4)' }}>Como usar</p>
                <ul className="space-y-3">
                  {[
                    { Icon: Hand,              text: 'Arraste uma foto para outro quadrado para mudar a ordem.' },
                    { Icon: MousePointerClick, text: 'Clique num quadrado vazio para adicionar um post.' },
                    { Icon: Layers,            text: 'Crie versões para comparar grades diferentes com o cliente.' },
                  ].map(({ Icon, text }) => (
                    <li key={text} className="flex items-start gap-3">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(37,99,235,0.12)' }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: '#2563EB' }} />
                      </span>
                      <span className="text-[12.5px] leading-relaxed pt-0.5" style={{ color: 'var(--sm-text-2)' }}>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>

            {/* Grade */}
            <div className="lg:order-1 min-w-0 space-y-4">
              {/* Versões numa cápsula + nova versão + adicionar post */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5 p-1 rounded-full border max-w-full overflow-x-auto scrollbar-none"
                  style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
                  {versions.map(v => (
                    <VersionChip key={v.id} version={v} isActive={v.id === activeVersionId}
                      onClick={() => setActiveVersionId(v.id)}
                      onRename={name => renameVersion(v.id, name)}
                      onDelete={() => deleteVersion(v.id)}
                      onDuplicate={() => duplicateVersion(v.id)} />
                  ))}
                  <button onClick={createVersion}
                    className="flex-shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors hover:bg-[var(--sm-bg-card)]"
                    style={{ color: 'var(--sm-text-2)' }}>
                    <Plus className="w-3.5 h-3.5" style={{ color: '#2563EB' }} /> Nova versão
                  </button>
                </div>
                {activeVersion && (
                  <button onClick={() => setPickerOpen(true)} disabled={isUploading} className={`${primaryBtn} ml-auto`}>
                    {isUploading
                      ? <><Upload className="w-3.5 h-3.5 animate-pulse" /> Enviando...</>
                      : <><Plus className="w-3.5 h-3.5" /> Adicionar post</>}
                  </button>
                )}
              </div>

              {!activeVersion && (
                <div className="sm-glass-tile rounded-[28px] py-14 px-4 text-center">
                  <div className="w-40 mx-auto mb-5 opacity-70"><Mosaic posts={[]} /></div>
                  <p className="font-display text-[17px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Crie uma versão para começar</p>
                  <p className="text-[12.5px] mt-1" style={{ color: 'var(--sm-text-3)' }}>Cada versão é uma grade diferente para o mesmo perfil.</p>
                  <button onClick={createVersion} className={`${primaryBtn} mt-4`}>
                    <Plus className="w-3.5 h-3.5" /> Criar Versão 1
                  </button>
                </div>
              )}

              {activeVersion && (
                <section className="sm-glass-tile rounded-[28px] overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="font-display text-[16px] font-bold truncate" style={{ color: 'var(--sm-text-1)' }}>{activeVersion.name}</p>
                      <p className="text-[11.5px] flex items-center gap-1" style={{ color: 'var(--sm-text-4)' }}>
                        <GripVertical className="w-3 h-3" /> {posts.length} post{posts.length !== 1 ? 's' : ''} · arraste para mudar a ordem
                      </p>
                    </div>
                  </div>

                  <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <div className="grid grid-cols-3 gap-[3px] p-[3px]" style={{ background: 'var(--sm-border)' }}>
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
                        <div className="overflow-hidden rounded-xl shadow-2xl ring-2 ring-[#2563EB] opacity-95 rotate-2" style={{ width: 160, height: 160 }}>
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
            </div>
          </div>
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
