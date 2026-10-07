import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Copy, Trash2, BookOpen, Save,
  Lightbulb, Zap, Target, FileText, ImageIcon,
  Video, File as FileIcon, Link2, FolderOpen,
  Building2, Loader2, X, Pencil, Eye, Upload,
  ExternalLink, Tag, Users, LayoutGrid,
} from 'lucide-react'
import { isImageUrl, isVideoUrl, extLabel } from '@/utils/media'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useLibrary, useCreateLibraryItem, useDeleteLibraryItem } from '@/hooks/useLibrary'
import {
  useContentAssets,
  useCreateContentAsset,
  useUpdateContentAsset,
  useDeleteContentAsset,
} from '@/hooks/useContentAssets'
import {
  useAllClientMaterials,
  useAddMaterial,
  useUpdateMaterial,
  useDeleteMaterial,
} from '@/hooks/useClientMaterials'
import { useClients } from '@/hooks/useClients'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { copyToClipboard, contentTypeLabels } from '@/utils/formatters'
import { supabase } from '@/integrations/supabase/client'
import { uploadArquivo } from '@/lib/uploadArquivo'
import { checkStorageLimit } from '@/utils/storageGate'
import type { LibraryCategory, ContentType, ContentAsset, Client, ClientMaterialWithClient, MaterialType } from '@/types'

// ─── Snippet categories ───────────────────────────────────────────────────────

const snippetCategories: { value: LibraryCategory; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'ideia',    label: 'Ideias',     icon: Lightbulb, color: 'text-yellow-500' },
  { value: 'gancho',   label: 'Ganchos',    icon: Zap,       color: 'text-blue-500'   },
  { value: 'cta',      label: 'CTAs',       icon: Target,    color: 'text-emerald-500' },
  { value: 'template', label: 'Templates',  icon: FileText,  color: 'text-purple-500' },
]

// ─── Content type icon ────────────────────────────────────────────────────────

const typeIcons: Record<string, React.ElementType> = {
  post: FileText, carrossel: FileText, reels: Video,
  story: ImageIcon, educativo: BookOpen, venda: Target,
  autoridade: Lightbulb, engajamento: Zap,
}

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = typeIcons[type] ?? FileIcon
  return <Icon className={className} />
}

// ─── Media helpers ────────────────────────────────────────────────────────────

/** Card thumbnail: plays video silently on hover */
function MediaThumbnail({ url, title }: { url: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  if (isImageUrl(url)) {
    return (
      <img
        src={url}
        alt={title}
        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
  }

  if (isVideoUrl(url)) {
    return (
      <video
        ref={videoRef}
        src={url}
        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
        muted
        playsInline
        preload="metadata"
        loop
        onMouseEnter={() => videoRef.current?.play().catch(() => {})}
        onMouseLeave={() => { if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 } }}
      />
    )
  }

  // Generic file (PDF, etc.)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <FileIcon className="w-7 h-7 text-[#b0b0b0]" />
      <span className="text-[10px] text-[#b0b0b0]">
        {extLabel(url)}
      </span>
    </div>
  )
}

/** Inline video player used in modals */
function VideoPlayer({ url }: { url: string }) {
  return (
    <div className="w-full rounded-xl overflow-hidden border border-[#e8e8e8] bg-black">
      <video
        src={url}
        controls
        playsInline
        className="w-full max-h-80 object-contain"
        style={{ display: 'block' }}
      />
    </div>
  )
}

/** Media preview for forms (upload / edit) */
function MediaPreview({ url, onRemove }: { url: string; onRemove: () => void }) {
  if (isVideoUrl(url)) {
    return (
      <div className="mt-2 relative">
        <video
          src={url}
          controls
          playsInline
          muted
          className="w-full h-36 object-contain rounded-lg border border-[#e8e8e8] bg-black"
        />
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white border border-[#e0e0e0] flex items-center justify-center text-[#a0a0a0] hover:text-red-500"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }
  // Image (or unknown — try img)
  return (
    <div className="mt-2 relative">
      <img
        src={url}
        alt="preview"
        className="w-full h-28 object-cover rounded-lg border border-[#e8e8e8]"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white border border-[#e0e0e0] flex items-center justify-center text-[#a0a0a0] hover:text-red-500"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── Asset card ───────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onClick,
  onDelete,
}: {
  asset: ContentAsset
  onClick: (a: ContentAsset) => void
  onDelete: (a: ContentAsset) => void
}) {
  const clientName = asset.client?.company_name ?? null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={() => onClick(asset)}
      className="relative aspect-square overflow-hidden group cursor-pointer bg-[#182233] rounded-md"
    >
      {/* Mídia preenchendo o quadrado */}
      {asset.media_url ? (
        <MediaThumbnail url={asset.media_url} title={asset.title} />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#0d1424]">
          <TypeIcon type={asset.content_type} className="w-8 h-8 text-[#334155]" />
        </div>
      )}

      {/* Badge de tipo (canto superior esquerdo) */}
      <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white/90 capitalize">
          {contentTypeLabels[asset.content_type as ContentType] ?? asset.content_type}
        </span>
      </div>

      {/* Ações no hover (canto superior direito) */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
        <button
          onClick={e => { e.stopPropagation(); onClick(asset) }}
          className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm text-white/90 hover:bg-black/80 flex items-center justify-center"
          title="Visualizar / Editar"
        >
          <Eye className="w-3 h-3" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(asset) }}
          className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm text-white/90 hover:bg-[#ef4444] flex items-center justify-center"
          title="Remover"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Overlay com título e cliente (aparece no hover) */}
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[12px] font-semibold text-white leading-tight line-clamp-2">{asset.title}</p>
        {clientName && (
          <div className="flex items-center gap-1 mt-1">
            <Building2 className="w-2.5 h-2.5 text-white/70" />
            <span className="text-[10px] text-white/70 truncate">{clientName}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Asset Detail Modal (view + edit) ────────────────────────────────────────

function AssetDetailModal({
  asset,
  open,
  onClose,
  clients,
}: {
  asset: ContentAsset | null
  open: boolean
  onClose: () => void
  clients: Client[]
}) {
  const { user, agencyId } = useAuth()
  const { toast } = useToast()
  const updateAsset = useUpdateContentAsset()
  const deleteAsset = useDeleteContentAsset()
  const fileRef = useRef<HTMLInputElement>(null)

  const [editMode, setEditMode] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({
    title: '',
    client_id: '' as string,
    content_type: 'post' as ContentType,
    category: '',
    caption: '',
    observations: '',
    media_url: '',
    link_url: '',
  })

  // Sync form whenever the asset changes or modal opens
  useEffect(() => {
    if (asset) {
      setForm({
        title: asset.title,
        client_id: asset.client_id ?? '',
        content_type: asset.content_type,
        category: asset.category ?? '',
        caption: asset.caption ?? '',
        observations: asset.observations ?? '',
        media_url: asset.media_url ?? '',
        link_url: asset.link_url ?? '',
      })
      setEditMode(false)
      setConfirming(false)
    }
  }, [asset, open])

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const { allowed, message } = await checkStorageLimit(file.size)
      if (!allowed) { toast(message ?? 'Limite de armazenamento atingido.', 'error'); setUploading(false); e.target.value = ''; return }
      const ext  = file.name.split('.').pop() || 'bin'
      const path = `${agencyId!}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { url } = await uploadArquivo('content-assets', path, file)
      setForm(p => ({ ...p, media_url: url }))
      toast('Arquivo enviado!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    if (!asset || !form.title.trim()) return
    try {
      await updateAsset.mutateAsync({
        id: asset.id,
        title:        form.title.trim(),
        client_id:    form.client_id || null,
        content_type: form.content_type,
        category:     form.category.trim() || null,
        caption:      form.caption.trim() || null,
        observations: form.observations.trim() || null,
        media_url:    form.media_url.trim() || null,
        link_url:     form.link_url.trim() || null,
      })
      toast('Conteúdo atualizado!', 'success')
      setEditMode(false)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleDelete = async () => {
    if (!asset) return
    try {
      await deleteAsset.mutateAsync({
        id: asset.id,
        clientId: asset.client_id,
        mediaUrl: asset.media_url,
      })
      toast('Conteúdo removido.', 'success')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  if (!asset) return null

  const clientName = clients.find(c => c.id === (form.client_id || asset.client_id))?.company_name
    ?? asset.client?.company_name

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setEditMode(false); setConfirming(false) } }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0">
              {editMode ? (
                <p className="text-[11px] font-medium text-[#737373] uppercase tracking-wide mb-1">Editando conteúdo</p>
              ) : (
                <p className="text-[11px] font-medium text-[#737373] uppercase tracking-wide mb-1">Conteúdo</p>
              )}
              <DialogTitle className="text-[15px] leading-snug break-words">
                {editMode ? form.title || 'Sem título' : asset.title}
              </DialogTitle>
            </div>
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="flex-shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-[#e0e0e0] bg-white text-[11px] text-[#737373] hover:bg-[#f5f5f5] hover:text-[#0f0f0f] transition-colors"
              >
                <Pencil className="w-3 h-3" /> Editar
              </button>
            )}
          </div>
        </DialogHeader>

        {/* ── VIEW MODE ────────────────────────────────────────────────── */}
        {!editMode && (
          <div className="space-y-4 mt-1 min-w-0">
            {/* Media preview */}
            {asset.media_url && (
              isVideoUrl(asset.media_url) ? (
                <div className="space-y-2">
                  <VideoPlayer url={asset.media_url} />
                  <a
                    href={asset.media_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-[#737373] hover:text-[#0f0f0f] transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> Abrir em nova guia
                  </a>
                </div>
              ) : isImageUrl(asset.media_url) ? (
                <a href={asset.media_url} target="_blank" rel="noopener noreferrer" className="block w-full overflow-hidden rounded-xl border border-[#e8e8e8]">
                  <img
                    src={asset.media_url}
                    alt={asset.title}
                    className="w-full max-w-full object-contain max-h-64"
                  />
                </a>
              ) : (
                <a
                  href={asset.media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-[#e8e8e8] bg-[#f7f7f7] hover:bg-[#f0f0f0] transition-colors min-w-0 overflow-hidden"
                >
                  <FileIcon className="w-4 h-4 text-[#a0a0a0] flex-shrink-0" />
                  <span className="text-[12px] text-[#737373] flex-1 min-w-0 truncate">Abrir arquivo</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#b0b0b0] flex-shrink-0" />
                </a>
              )
            )}

            {/* Meta chips */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-[#f0f0f0] text-[#737373] border border-[#e8e8e8]">
                {contentTypeLabels[asset.content_type as ContentType] ?? asset.content_type}
              </span>
              {asset.category && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-[#f0f0f0] text-[#737373] border border-[#e8e8e8]">
                  <Tag className="w-2.5 h-2.5" /> {asset.category}
                </span>
              )}
              {clientName ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-[#f0f0f0] text-[#737373] border border-[#e8e8e8]">
                  <Building2 className="w-2.5 h-2.5" /> {clientName}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-[#b0b0b0] px-2 py-1 rounded-full border border-dashed border-[#e0e0e0]">
                  Biblioteca geral
                </span>
              )}
            </div>

            {/* Caption */}
            {asset.caption && (
              <div className="p-3.5 rounded-xl bg-[#f7f7f7] border border-[#e8e8e8]">
                <p className="text-[10px] font-medium text-[#a0a0a0] uppercase tracking-wide mb-2">Legenda / Copy</p>
                <p className="text-[13px] text-[#1a1a1a] leading-relaxed whitespace-pre-wrap break-words">{asset.caption}</p>
              </div>
            )}

            {/* Observations */}
            {asset.observations && (
              <div className="p-3.5 rounded-xl bg-[#f7f7f7] border border-[#e8e8e8]">
                <p className="text-[10px] font-medium text-[#a0a0a0] uppercase tracking-wide mb-2">Observações</p>
                <p className="text-[13px] text-[#737373] leading-relaxed break-words">{asset.observations}</p>
              </div>
            )}

            {/* Link externo */}
            {asset.link_url && (
              <a
                href={asset.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-xl bg-[#f7f7f7] border border-[#e8e8e8] hover:bg-[#f0f0f0] transition-colors min-w-0 overflow-hidden"
              >
                <Link2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-[12px] text-blue-600 flex-1 min-w-0 break-all">{asset.link_url}</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#b0b0b0] flex-shrink-0" />
              </a>
            )}

            {/* Empty state for content */}
            {!asset.caption && !asset.observations && !asset.media_url && !asset.link_url && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-[12px] text-[#b0b0b0]">
                <FileIcon className="w-6 h-6 mb-2 text-[#d8d8d8]" />
                Nenhum conteúdo adicional cadastrado.
              </div>
            )}
          </div>
        )}

        {/* ── EDIT MODE ────────────────────────────────────────────────── */}
        {editMode && (
          <div className="space-y-3 mt-1 min-w-0 w-full max-w-full overflow-x-hidden">
            {/* Client */}
            <div>
              <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">
                Cliente (opcional)
              </label>
              <Select
                value={form.client_id || '__none__'}
                onValueChange={v => set('client_id', v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem cliente — biblioteca geral" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem cliente — biblioteca geral</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              label="Título *"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Nome do conteúdo..."
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">
                  Tipo de conteúdo
                </label>
                <Select value={form.content_type} onValueChange={v => set('content_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(contentTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                label="Categoria"
                value={form.category}
                onChange={e => set('category', e.target.value)}
                placeholder="Ex: Educativo, Venda..."
              />
            </div>

            <Textarea
              label="Legenda / Copy"
              value={form.caption}
              onChange={e => set('caption', e.target.value)}
              rows={4}
              placeholder="Texto principal do conteúdo..."
            />

            <Textarea
              label="Observações (opcional)"
              value={form.observations}
              onChange={e => set('observations', e.target.value)}
              rows={2}
              placeholder="Notas para a equipe..."
            />

            {/* Media */}
            <div>
              <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">
                Mídia (imagem / vídeo)
              </label>
              <div className="flex gap-2">
                <Input
                  value={form.media_url}
                  onChange={e => set('media_url', e.target.value)}
                  placeholder="URL da mídia..."
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="h-9 px-3 rounded-lg border border-[#e0e0e0] bg-[#f7f7f7] text-[11px] text-[#737373] hover:bg-[#efefef] transition-colors flex items-center gap-1.5 flex-shrink-0 disabled:opacity-60"
                >
                  {uploading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Upload className="w-3.5 h-3.5" />}
                  {uploading ? 'Enviando...' : 'Upload'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*,.pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
              {form.media_url && (
                <MediaPreview url={form.media_url} onRemove={() => set('media_url', '')} />
              )}
            </div>

            <Input
              label="Link externo (opcional)"
              value={form.link_url}
              onChange={e => set('link_url', e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}

        <DialogFooter className="mt-4 flex items-center justify-between gap-2">
          {/* Delete — left side */}
          <div className="flex-1">
            {!editMode && (
              confirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#737373]">Confirmar exclusão?</span>
                  <button
                    onClick={() => setConfirming(false)}
                    className="text-[11px] text-[#a0a0a0] hover:text-[#0f0f0f] transition-colors"
                  >
                    Não
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleteAsset.isPending}
                    className="text-[11px] text-red-500 hover:text-red-600 font-medium transition-colors"
                  >
                    {deleteAsset.isPending ? 'Removendo...' : 'Sim, remover'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="flex items-center gap-1.5 text-[11px] text-[#c0c0c0] hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              )
            )}
          </div>

          {/* Right actions */}
          <div className="flex gap-2">
            {editMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditMode(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateAsset.isPending || !form.title.trim()}
                >
                  {updateAsset.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
                    : <><Save className="w-3.5 h-3.5" /> Salvar alterações</>}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={onClose}>
                Fechar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Asset Modal ──────────────────────────────────────────────────────────

function AddAssetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, agencyId } = useAuth()
  const { toast } = useToast()
  const { data: clients = [] } = useClients()
  const createAsset = useCreateContentAsset()
  const fileRef = useRef<HTMLInputElement>(null)

  const blank = {
    client_id: '' as string,
    title: '',
    content_type: 'post' as ContentType,
    category: '',
    caption: '',
    observations: '',
    media_url: '',
    link_url: '',
  }
  const [form, setForm] = useState(blank)
  const [uploading, setUploading] = useState(false)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const { allowed, message } = await checkStorageLimit(file.size)
      if (!allowed) { toast(message ?? 'Limite de armazenamento atingido.', 'error'); setUploading(false); return }
      const ext  = file.name.split('.').pop()
      const path = `${agencyId!}/${Date.now()}.${ext}`
      const { url } = await uploadArquivo('content-assets', path, file)
      setForm(p => ({ ...p, media_url: url }))
      toast('Arquivo enviado!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!user || !form.title.trim()) return
    try {
      await createAsset.mutateAsync({
        user_id: agencyId!,
        client_id: form.client_id || null,
        category:  form.category.trim() || null,
        title:     form.title.trim(),
        content_type: form.content_type,
        caption:   form.caption.trim() || null,
        observations: form.observations.trim() || null,
        media_url: form.media_url.trim() || null,
        link_url:  form.link_url.trim() || null,
      })
      toast('Conteúdo adicionado à biblioteca!', 'success')
      setForm(blank)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setForm(blank); onClose() } }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Novo conteúdo na biblioteca</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-1 min-w-0 w-full max-w-full overflow-x-hidden">
          {/* Client */}
          <div>
            <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">
              Cliente (opcional)
            </label>
            <Select value={form.client_id} onValueChange={v => set('client_id', v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sem cliente — biblioteca geral" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem cliente — biblioteca geral</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Input
            label="Título *"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Nome do conteúdo..."
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">
                Tipo de conteúdo
              </label>
              <Select value={form.content_type} onValueChange={v => set('content_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(contentTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Categoria"
              value={form.category}
              onChange={e => set('category', e.target.value)}
              placeholder="Ex: Educativo, Venda..."
            />
          </div>

          <Textarea
            label="Legenda / Copy"
            value={form.caption}
            onChange={e => set('caption', e.target.value)}
            rows={3}
            placeholder="Texto principal do conteúdo..."
          />

          <Textarea
            label="Observações (opcional)"
            value={form.observations}
            onChange={e => set('observations', e.target.value)}
            rows={2}
            placeholder="Notas para a equipe..."
          />

          {/* Media */}
          <div>
            <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">
              Mídia (imagem / vídeo)
            </label>
            <div className="flex gap-2">
              <Input
                value={form.media_url}
                onChange={e => set('media_url', e.target.value)}
                placeholder="URL da mídia..."
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="h-9 px-3 rounded-lg border border-[#e0e0e0] bg-[#f7f7f7] text-[11px] text-[#737373] hover:bg-[#efefef] transition-colors flex items-center gap-1.5 flex-shrink-0 disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                {uploading ? 'Enviando...' : 'Upload'}
              </button>
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
            </div>
            {form.media_url && (
              <MediaPreview url={form.media_url} onRemove={() => set('media_url', '')} />
            )}
          </div>

          <Input
            label="Link externo (opcional)"
            value={form.link_url}
            onChange={e => set('link_url', e.target.value)}
            placeholder="https://..."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setForm(blank); onClose() }}>Cancelar</Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={createAsset.isPending || !form.title.trim()}
          >
            {createAsset.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
              : <><Save className="w-3.5 h-3.5" /> Salvar conteúdo</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Conteúdos Tab ────────────────────────────────────────────────────────────

function ConteudosTab() {
  const { data: assets = [], isLoading } = useContentAssets()
  const { data: clients = [] } = useClients()
  const deleteAsset = useDeleteContentAsset()
  const { toast } = useToast()

  const [addOpen, setAddOpen]             = useState(false)
  const [viewingAsset, setViewingAsset]   = useState<ContentAsset | null>(null)
  const [detailOpen, setDetailOpen]       = useState(false)
  const [search, setSearch]               = useState('')
  const [clientFilter, setClientFilter]   = useState<string>('all')
  const [typeFilter, setTypeFilter]       = useState<string>('all')

  const filtered = useMemo(() => {
    let list = assets
    if (clientFilter === '__none__') list = list.filter(a => !a.client_id)
    else if (clientFilter !== 'all') list = list.filter(a => a.client_id === clientFilter)
    if (typeFilter !== 'all') list = list.filter(a => a.content_type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.caption ?? '').toLowerCase().includes(q) ||
        (a.category ?? '').toLowerCase().includes(q) ||
        (a.client?.company_name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [assets, clientFilter, typeFilter, search])

  // Open detail modal
  const openDetail = (asset: ContentAsset) => {
    setViewingAsset(asset)
    setDetailOpen(true)
  }

  // Quick-delete from card (bypass modal — same as before)
  const handleQuickDelete = async (asset: ContentAsset) => {
    if (!confirm(`Remover "${asset.title}"?`)) return
    try {
      await deleteAsset.mutateAsync({ id: asset.id, clientId: asset.client_id, mediaUrl: asset.media_url })
      toast('Conteúdo removido.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  // Unique types present in the current list
  const types = useMemo(() => [...new Set(assets.map(a => a.content_type))], [assets])

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap min-w-0 max-w-full">
          {/* Client filter */}
          <div className="relative max-w-full">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8] pointer-events-none" />
            <select
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              className="max-w-full h-10 rounded-xl border border-[#1e293b] bg-[#182233] text-[12px] text-[#CBD5E1] pl-9 pr-3 focus:outline-none focus:border-[#2563EB]/50 cursor-pointer [&>option]:bg-[#182233]"
            >
              <option value="all">Todos os clientes</option>
              <option value="__none__">Sem cliente</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>

          {/* Type filter */}
          <div className="relative max-w-full">
            <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8] pointer-events-none" />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="max-w-full h-10 rounded-xl border border-[#1e293b] bg-[#182233] text-[12px] text-[#CBD5E1] pl-9 pr-3 focus:outline-none focus:border-[#2563EB]/50 cursor-pointer [&>option]:bg-[#182233]"
            >
              <option value="all">Todos os tipos</option>
              {types.map(t => (
                <option key={t} value={t}>{contentTypeLabels[t as ContentType] ?? t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8] pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar conteúdo..."
            className="h-10 pl-9 pr-3 rounded-xl border border-[#1e293b] bg-[#182233] text-[12px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:border-[#2563EB]/50 w-64"
          />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-52 rounded-xl border border-[#1e293b] bg-[#182233] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-xl border border-[#1e293b] bg-[#182233] flex items-center justify-center mb-4">
            <ImageIcon className="w-5 h-5 text-[#475569]" />
          </div>
          <p className="text-[14px] font-medium text-[#CBD5E1]">Nenhum conteúdo encontrado</p>
          <p className="text-[12px] text-[#64748b] mt-1">Adicione conteúdos à biblioteca ou ajuste os filtros.</p>
          <button
            className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors hover:bg-[#1D4ED8] shadow-lg shadow-[#2563EB]/20"
            style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}
            onClick={() => setAddOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar conteúdo
          </button>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-[#64748b]">{filtered.length} conteúdo{filtered.length !== 1 ? 's' : ''}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
            <AnimatePresence>
              {filtered.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onClick={openDetail}
                  onDelete={handleQuickDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Add modal */}
      <AddAssetModal open={addOpen} onClose={() => setAddOpen(false)} />

      {/* Detail / Edit modal */}
      <AssetDetailModal
        asset={viewingAsset}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setViewingAsset(null) }}
        clients={clients}
      />
    </>
  )
}

// ─── Snippets Tab (existing — unchanged logic) ────────────────────────────────

function SnippetsTab() {
  const { user, agencyId } = useAuth()
  const { toast } = useToast()
  const [activeCategory, setActiveCategory] = useState<LibraryCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', category: 'ideia' as LibraryCategory, niche: '' })

  const { data: items, isLoading } = useLibrary(activeCategory === 'all' ? undefined : activeCategory)
  const createItem = useCreateLibraryItem()
  const deleteItem = useDeleteLibraryItem()

  const filtered = (items || []).filter(item =>
    item.title.toLowerCase().includes(search.toLowerCase()) ||
    item.content.toLowerCase().includes(search.toLowerCase())
  )

  const set = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }))

  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim() || !user) return
    try {
      await createItem.mutateAsync({
        user_id: agencyId!,
        title: form.title,
        content: form.content,
        category: form.category,
        niche: form.niche || null,
        tags: null,
      })
      toast('Item adicionado à biblioteca!', 'success')
      setOpen(false)
      setForm({ title: '', content: '', category: 'ideia', niche: '' })
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const getCategoryInfo = (cat: LibraryCategory) => snippetCategories.find(c => c.value === cat)

  return (
    <>
      {/* Category pills */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5 border ${
            activeCategory === 'all'
              ? 'bg-[#2563EB] text-white border-[#2563EB]'
              : 'bg-[#182233] text-[#94a3b8] border-[#1e293b] hover:bg-[#1e293b] hover:text-[color:var(--sm-text-1)]'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" /> Todos
        </button>
        {snippetCategories.map(cat => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5 border ${
              activeCategory === cat.value
                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                : 'bg-[#182233] text-[#94a3b8] border-[#1e293b] hover:bg-[#1e293b] hover:text-[color:var(--sm-text-1)]'
            }`}
          >
            <cat.icon className={`w-3.5 h-3.5 ${activeCategory === cat.value ? 'text-white' : cat.color}`} />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8] pointer-events-none" />
        <input
          placeholder="Buscar snippets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#1e293b] bg-[#182233] text-[12px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:border-[#2563EB]/50"
        />
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-[#1e293b] bg-[#182233] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="w-10 h-10 text-[#475569] mb-3" />
          <p className="text-[13px] text-[#64748b]">Biblioteca de snippets vazia.</p>
          <button
            className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors hover:bg-[#1D4ED8] shadow-lg shadow-[#2563EB]/20"
            style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}
            onClick={() => setOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar snippet
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((item, i) => {
              const catInfo = getCategoryInfo(item.category as LibraryCategory)
              return (
                <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <div className="bg-[#182233] rounded-xl border border-[#1e293b] p-4 hover:border-[#2563EB]/40 transition-all">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {catInfo && <catInfo.icon className={`w-4 h-4 flex-shrink-0 ${catInfo.color}`} />}
                        <p className="font-medium text-[#F8FAFC] text-[13px]">{item.title}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => copyToClipboard(item.content).then(() => toast('Copiado!', 'success'))}
                          className="text-[#64748b] hover:text-[color:var(--sm-text-1)] transition-colors p-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteItem.mutateAsync(item.id)}
                          className="text-[#64748b] hover:text-[#f87171] transition-colors p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[12px] text-[#94a3b8] line-clamp-3 leading-relaxed">{item.content}</p>
                    {item.niche && (
                      <span className="inline-block mt-2 text-[10px] text-[#94a3b8] bg-[#0d1424] border border-[#1e293b] px-2 py-0.5 rounded-full">
                        {item.niche}
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Add snippet modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar snippet à biblioteca</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">Categoria</label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {snippetCategories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input label="Título *" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Nome do snippet..." />
            <Textarea label="Conteúdo *" value={form.content} onChange={e => set('content', e.target.value)} rows={4} placeholder="Cole o texto aqui..." />
            <Input label="Nicho (opcional)" value={form.niche} onChange={e => set('niche', e.target.value)} placeholder="Ex: Fitness, Gastronomia..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createItem.isPending}>
              <Save className="w-3.5 h-3.5" /> Salvar snippet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Materiais Tab ────────────────────────────────────────────────────────────

const MATERIAL_TYPE_OPTIONS: { value: MaterialType; label: string }[] = [
  { value: 'pdf',       label: 'PDF' },
  { value: 'imagem',    label: 'Imagem' },
  { value: 'video',     label: 'Vídeo' },
  { value: 'link',      label: 'Link externo' },
  { value: 'documento', label: 'Documento' },
  { value: 'outro',     label: 'Outro' },
]

const MAT_TYPE_LABELS: Record<MaterialType, string> = {
  pdf: 'PDF', imagem: 'Imagem', video: 'Vídeo',
  link: 'Link', documento: 'Documento', outro: 'Outro',
}

function MatTypeIcon({ type, className }: { type: MaterialType; className?: string }) {
  const cls = className ?? 'w-4 h-4'
  switch (type) {
    case 'pdf':    return <FileText  className={`${cls} text-red-400`} />
    case 'imagem': return <ImageIcon className={`${cls} text-blue-400`} />
    case 'video':  return <Video     className={`${cls} text-purple-400`} />
    case 'link':   return <Link2     className={`${cls} text-sky-400`} />
    default:       return <FileIcon  className={`${cls} text-gray-400`} />
  }
}

function formatMatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ── Material Form Modal ──────────────────────────────────────────────────────

interface MatFormState {
  client_id: string
  title: string
  description: string
  type: MaterialType
  link_url: string
  folder_name: string
}

function MatFormModal({
  open,
  editing,
  clients,
  onClose,
}: {
  open: boolean
  editing: ClientMaterialWithClient | null
  clients: Client[]
  onClose: () => void
}) {
  const { user, agencyId } = useAuth()
  const { toast } = useToast()
  const addMaterial    = useAddMaterial()
  const updateMaterial = useUpdateMaterial()
  const fileRef = useRef<HTMLInputElement>(null)

  const blank: MatFormState = {
    client_id: '', title: '', description: '',
    type: 'documento', link_url: '', folder_name: '',
  }
  const [form, setForm]           = useState<MatFormState>(blank)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          client_id:   editing.client_id,
          title:       editing.title,
          description: editing.description || '',
          type:        editing.type,
          link_url:    editing.link_url || '',
          folder_name: editing.folder_name || '',
        })
      } else {
        setForm(blank)
      }
      setSelectedFile(null)
    }
  }, [open, editing])

  const isLink = form.type === 'link'
  const set = (k: keyof MatFormState, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.title.trim() || !user) return
    setUploading(true)
    try {
      let file_url:  string | null = editing?.file_url  ?? null
      let file_size: number | null = editing?.file_size ?? null

      if (selectedFile && !isLink) {
        const ext  = selectedFile.name.split('.').pop() || 'bin'
        const cid  = form.client_id || 'geral'
        const path = `${agencyId!}/${cid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { url } = await uploadArquivo('client-materials', path, selectedFile)
        file_url  = url
        file_size = selectedFile.size
      }

      const payload = {
        title:       form.title.trim(),
        description: form.description.trim() || null,
        type:        form.type,
        file_url:    isLink ? null : file_url,
        link_url:    isLink ? (form.link_url.trim() || null) : null,
        file_size:   isLink ? null : file_size,
        ...(form.folder_name?.trim() ? { folder_name: form.folder_name.trim() } : { folder_name: null }),
      }

      if (editing) {
        await updateMaterial.mutateAsync({ id: editing.id, clientId: editing.client_id, ...payload })
        toast('Material atualizado!', 'success')
      } else {
        if (!form.client_id) { toast('Selecione um cliente', 'error'); return }
        await addMaterial.mutateAsync({ user_id: agencyId!, client_id: form.client_id, ...payload })
        toast('Material adicionado!', 'success')
      }
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar material' : 'Novo material'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Client */}
          <div>
            <label className="block text-[11px] font-medium text-[#737373] mb-1.5 uppercase tracking-wide">
              Cliente *
            </label>
            <Select
              value={form.client_id || '__none__'}
              onValueChange={v => set('client_id', v === '__none__' ? '' : v)}
              disabled={!!editing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente..." />
              </SelectTrigger>
              <SelectContent>
                {!editing && <SelectItem value="__none__">Selecione o cliente...</SelectItem>}
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Input
            label="Título *"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Nome do material..."
          />

          <div>
            <label className="block text-[12px] text-zinc-500 mb-1.5">Tipo</label>
            <Select value={form.type} onValueChange={v => set('type', v as MaterialType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATERIAL_TYPE_OPTIONS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Textarea
            label="Descrição (opcional)"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Breve descrição para o cliente..."
            rows={2}
          />

          <Input
            label="Pasta (opcional)"
            value={form.folder_name}
            onChange={e => set('folder_name', e.target.value)}
            placeholder="Ex: Campanha Abril, Stories..."
          />

          {isLink ? (
            <Input
              label="URL *"
              value={form.link_url}
              onChange={e => set('link_url', e.target.value)}
              placeholder="https://..."
            />
          ) : (
            <div>
              <label className="block text-[12px] text-zinc-500 mb-1.5">Arquivo</label>
              {selectedFile ? (
                <div className="flex items-center gap-2 p-2.5 rounded-md border border-[#e0e0e0] bg-[#f7f7f7]">
                  <FileIcon className="w-3.5 h-3.5 text-[#a0a0a0] flex-shrink-0" />
                  <span className="text-[12px] text-[#737373] truncate flex-1">{selectedFile.name}</span>
                  <button type="button" onClick={() => setSelectedFile(null)} className="text-[#a0a0a0] hover:text-red-400 flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : editing?.file_url ? (
                <div className="flex items-center gap-2 p-2.5 rounded-md border border-[#e0e0e0] bg-[#f7f7f7]">
                  <FileIcon className="w-3.5 h-3.5 text-[#a0a0a0] flex-shrink-0" />
                  <span className="text-[12px] text-[#a0a0a0] truncate flex-1">Arquivo atual</span>
                  <button type="button" onClick={() => fileRef.current?.click()} className="text-[11px] text-blue-500 hover:text-blue-600 flex-shrink-0">
                    Substituir
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 w-full h-9 px-3 rounded-md border border-dashed border-[#c8c8c8] bg-[#f7f7f7] text-[#a0a0a0] text-[12px] hover:border-[#a0a0a0] hover:bg-[#f0f0f0] transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" /> Selecionar arquivo
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); e.target.value = '' }}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={uploading || !form.title.trim() || (isLink && !form.link_url.trim())}
          >
            {uploading
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Enviando...</>
              : editing
                ? <><Save className="w-3 h-3" /> Salvar</>
                : <><Plus className="w-3 h-3" /> Adicionar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── MateriaisTab main ────────────────────────────────────────────────────────

function MateriaisTab({ addOpen, onAddClose }: { addOpen: boolean; onAddClose: () => void }) {
  const { toast } = useToast()
  const { data: clients = [] } = useClients()
  const { data: materials = [], isLoading } = useAllClientMaterials()
  const deleteMaterial = useDeleteMaterial()

  const [clientFilter, setClientFilter]   = useState('all')
  const [typeFilter, setTypeFilter]       = useState('all')
  const [search, setSearch]               = useState('')
  const [editingMat, setEditingMat]       = useState<ClientMaterialWithClient | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [confirmingId, setConfirmingId]   = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = materials
    if (clientFilter !== 'all') list = list.filter(m => m.client_id === clientFilter)
    if (typeFilter !== 'all') list = list.filter(m => m.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q) ||
        (m.folder_name ?? '').toLowerCase().includes(q) ||
        (m.client?.company_name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [materials, clientFilter, typeFilter, search])

  const handleDelete = async (mat: ClientMaterialWithClient) => {
    try {
      await deleteMaterial.mutateAsync({ id: mat.id, clientId: mat.client_id, fileUrl: mat.file_url })
      toast('Material removido.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setConfirmingId(null)
    }
  }

  const openEdit = (mat: ClientMaterialWithClient) => {
    setEditingMat(mat)
    setEditModalOpen(true)
  }

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap min-w-0 max-w-full">
          <div className="relative max-w-full">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8] pointer-events-none" />
            <select
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              className="max-w-full h-10 rounded-xl border border-[#1e293b] bg-[#182233] text-[12px] text-[#CBD5E1] pl-9 pr-3 focus:outline-none focus:border-[#2563EB]/50 cursor-pointer [&>option]:bg-[#182233]"
            >
              <option value="all">Todos os clientes</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>

          <div className="relative max-w-full">
            <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8] pointer-events-none" />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="max-w-full h-10 rounded-xl border border-[#1e293b] bg-[#182233] text-[12px] text-[#CBD5E1] pl-9 pr-3 focus:outline-none focus:border-[#2563EB]/50 cursor-pointer [&>option]:bg-[#182233]"
            >
              <option value="all">Todos os tipos</option>
              {MATERIAL_TYPE_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8] pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar material..."
            className="h-10 pl-9 pr-3 rounded-xl border border-[#1e293b] bg-[#182233] text-[12px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:border-[#2563EB]/50 w-64"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-[#1e293b] bg-[#182233] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-xl border border-[#1e293b] bg-[#182233] flex items-center justify-center mb-4">
            <FolderOpen className="w-5 h-5 text-[#475569]" />
          </div>
          <p className="text-[14px] font-medium text-[#CBD5E1]">Nenhum material encontrado</p>
          <p className="text-[12px] text-[#64748b] mt-1">Adicione materiais para os seus clientes.</p>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-[#64748b]">{filtered.length} material{filtered.length !== 1 ? 'is' : ''}</p>
          <div className="space-y-1.5">
            {filtered.map(mat => (
              <div
                key={mat.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#1e293b] bg-[#182233] hover:border-[#2563EB]/40 transition-all group"
              >
                {/* Icon */}
                <div className="w-9 h-9 rounded-lg bg-[#0d1424] border border-[#1e293b] flex items-center justify-center flex-shrink-0">
                  <MatTypeIcon type={mat.type} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-[#F8FAFC] truncate">{mat.title}</p>
                    {mat.folder_name && (
                      <span className="hidden sm:flex items-center gap-1 text-[10px] text-[#94a3b8] bg-[#0d1424] border border-[#1e293b] px-1.5 py-0.5 rounded-full flex-shrink-0">
                        <FolderOpen className="w-2.5 h-2.5" /> {mat.folder_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[#64748b]">{MAT_TYPE_LABELS[mat.type]}</span>
                    {mat.file_size ? <><span className="text-[#334155]">·</span><span className="text-[10px] text-[#64748b]">{formatMatSize(mat.file_size)}</span></> : null}
                    {mat.client?.company_name && (
                      <>
                        <span className="text-[#334155]">·</span>
                        <span className="flex items-center gap-1 text-[10px] text-[#94a3b8]">
                          <Building2 className="w-2.5 h-2.5" /> {mat.client.company_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {(mat.file_url || mat.link_url) && (
                    <a
                      href={mat.link_url || mat.file_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[color:var(--sm-text-1)] hover:bg-[#1e293b] transition-colors"
                      title="Abrir"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => openEdit(mat)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[color:var(--sm-text-1)] hover:bg-[#1e293b] transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  {confirmingId === mat.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setConfirmingId(null)} className="text-[10px] text-[#94a3b8] hover:text-[#CBD5E1] px-1.5 py-1">Não</button>
                      <button onClick={() => handleDelete(mat)} className="text-[10px] text-[#f87171] hover:text-[#ef4444] px-1.5 py-1">Sim</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(mat.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[#f87171] hover:bg-[#ef4444]/10 transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add modal (triggered from header) */}
      <MatFormModal
        open={addOpen}
        editing={null}
        clients={clients}
        onClose={onAddClose}
      />

      {/* Edit modal */}
      <MatFormModal
        open={editModalOpen}
        editing={editingMat}
        clients={clients}
        onClose={() => { setEditModalOpen(false); setEditingMat(null) }}
      />
    </>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type LibraryTab = 'conteudos' | 'snippets' | 'materiais'

export function Library() {
  const [tab, setTab]         = useState<LibraryTab>('conteudos')
  const [addOpen, setAddOpen] = useState(false)
  const [matAddOpen, setMatAddOpen] = useState(false)

  const headerAction = tab === 'conteudos'
    ? (
      <button
        onClick={() => setAddOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors hover:bg-[#1D4ED8] shadow-lg shadow-[#2563EB]/20"
        style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', color: '#ffffff' }}
      >
        <Plus className="w-3.5 h-3.5" /> Novo conteúdo
      </button>
    )
    : tab === 'materiais'
      ? (
        <button
          onClick={() => setMatAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-medium transition-colors hover:opacity-90"
          style={{ background: '#0f0f0f', color: '#ffffff' }}
        >
          <Plus className="w-3.5 h-3.5" /> Novo material
        </button>
      )
      : undefined

  return (
    <div className="min-h-full bg-[#0B1020]">
      <div className="p-4 md:p-6 space-y-5">
        {/* Tab switcher + ação */}
        <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-[#182233] border border-[#1e293b] rounded-xl p-1 w-fit">
          {([
            ['conteudos', 'Conteúdos'],
            ['materiais', 'Materiais'],
            ['snippets',  'Snippets & Copy'],
          ] as [LibraryTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                tab === key
                  ? 'bg-[#1e293b] text-[color:var(--sm-text-1)] shadow-sm border border-[#334155]'
                  : 'text-[#94a3b8] hover:text-[color:var(--sm-text-1)] hover:bg-[#1e293b]/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
          {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            {tab === 'conteudos'
              ? <ConteudosTab />
              : tab === 'materiais'
                ? <MateriaisTab addOpen={matAddOpen} onAddClose={() => setMatAddOpen(false)} />
                : <SnippetsTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Global add modal for Conteúdos tab */}
      <AddAssetModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
