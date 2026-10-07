import { useState, useRef, useMemo, useEffect } from 'react'
import {
  Plus, Upload, Trash2, ExternalLink, FileText,
  ImageIcon, Video, Link2, File, Pencil, X, Save,
  Folder, FolderPlus, ArrowLeft, ChevronRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import {
  useClientMaterials,
  useAddMaterial,
  useUpdateMaterial,
  useDeleteMaterial,
} from '@/hooks/useClientMaterials'
import { supabase } from '@/integrations/supabase/client'
import { uploadArquivo } from '@/lib/uploadArquivo'
import { checkStorageLimit } from '@/utils/storageGate'
import { formatDate } from '@/utils/formatters'
import type { ClientMaterial, MaterialType } from '@/types'
import { TabHeader, PrimaryButton, GhostButton, EmptyState, cardStyle } from './tabUi'

// ─── Configs ──────────────────────────────────────────────────────────────────

const MATERIAL_TYPES: { value: MaterialType; label: string }[] = [
  { value: 'pdf',       label: 'PDF' },
  { value: 'imagem',    label: 'Imagem' },
  { value: 'video',     label: 'Vídeo' },
  { value: 'link',      label: 'Link externo' },
  { value: 'documento', label: 'Documento' },
  { value: 'outro',     label: 'Outro' },
]

// Cor do tipo só no ícone; a caixa do ícone é neutra (sem fundo colorido).
const TYPE_META: Record<MaterialType, { label: string; color: string }> = {
  pdf:       { label: 'PDF',       color: '#EF4444' },
  imagem:    { label: 'Imagem',    color: '#2563EB' },
  video:     { label: 'Vídeo',     color: '#8B5CF6' },
  link:      { label: 'Link',      color: '#0EA5E9' },
  documento: { label: 'Documento', color: '#64748B' },
  outro:     { label: 'Outro',     color: '#94A3B8' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MaterialIcon({ type, size = 'md' }: { type: MaterialType; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-6 h-6' : 'w-4 h-4'
  const style = { color: TYPE_META[type].color }
  switch (type) {
    case 'pdf':    return <FileText  className={sz} style={style} />
    case 'imagem': return <ImageIcon className={sz} style={style} />
    case 'video':  return <Video     className={sz} style={style} />
    case 'link':   return <Link2     className={sz} style={style} />
    default:       return <File      className={sz} style={style} />
  }
}

const iconBox = 'rounded-lg flex items-center justify-center flex-shrink-0 bg-[color:var(--sm-bg-alt)]'

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ─── Material view modal ───────────────────────────────────────────────────────

function MaterialViewModal({
  mat,
  open,
  onClose,
  onEdit,
  onDelete,
}: {
  mat:      ClientMaterial | null
  open:     boolean
  onClose:  () => void
  onEdit:   () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!mat) return null

  const meta    = TYPE_META[mat.type]
  const size    = formatSize(mat.file_size)
  const fileUrl = mat.link_url || mat.file_url

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setConfirmDelete(false) } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 pr-6">
            <div className={`w-10 h-10 ${iconBox}`}>
              <MaterialIcon type={mat.type} size="lg" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold text-[color:var(--sm-text-1)] leading-snug truncate">
                {mat.title}
              </DialogTitle>
              <p className="text-[11px] mt-0.5">
                <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
                {size && <span className="text-[color:var(--sm-text-4)]"> · {size}</span>}
                {mat.folder_name && (
                  <span className="text-[color:var(--sm-text-4)]"> · 📁 {mat.folder_name}</span>
                )}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-1 max-h-[55vh] overflow-y-auto pr-1">
          {/* Preview: imagem */}
          {mat.type === 'imagem' && mat.file_url && (
            <div className="rounded-xl overflow-hidden border border-[color:var(--sm-border)]">
              <img
                src={mat.file_url}
                alt={mat.title}
                className="w-full max-h-64 object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}

          {/* Preview: vídeo */}
          {mat.type === 'video' && mat.file_url && (
            <div className="rounded-xl overflow-hidden border border-[color:var(--sm-border)] bg-black">
              <video
                src={mat.file_url}
                controls
                className="w-full max-h-64"
                preload="metadata"
              />
            </div>
          )}

          {/* Descrição */}
          {mat.description && (
            <div className="bg-[color:var(--sm-bg-alt)] rounded-xl p-3.5 border border-[color:var(--sm-border)]">
              <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">Descrição</p>
              <p className="text-[13px] text-[color:var(--sm-text-2)] leading-relaxed whitespace-pre-wrap">{mat.description}</p>
            </div>
          )}

          {/* Arquivo / link — botão de abrir */}
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3.5 rounded-xl border border-[color:var(--sm-border)] hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
            >
              <div className={`w-9 h-9 ${iconBox}`}>
                <MaterialIcon type={mat.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[color:var(--sm-text-1)] group-hover:text-blue-700 transition-colors">
                  {mat.type === 'link' ? 'Abrir link externo' : 'Abrir arquivo em nova guia'}
                </p>
                <p className="text-[10px] text-[color:var(--sm-text-4)] truncate mt-0.5">{fileUrl}</p>
              </div>
              <ExternalLink className="w-4 h-4 text-[color:var(--sm-text-4)] group-hover:text-blue-500 flex-shrink-0" />
            </a>
          )}

          {/* Metadados */}
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className="bg-[color:var(--sm-bg-alt)] rounded-xl p-3 border border-[color:var(--sm-border)]">
              <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Adicionado em</p>
              <p className="text-[12px] text-[color:var(--sm-text-2)] font-medium">{formatDate(mat.created_at)}</p>
            </div>
            {mat.folder_name && (
              <div className="bg-[color:var(--sm-bg-alt)] rounded-xl p-3 border border-[color:var(--sm-border)]">
                <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Pasta</p>
                <p className="text-[12px] text-[color:var(--sm-text-2)] font-medium flex items-center gap-1">
                  <Folder className="w-3.5 h-3.5 text-[#f59e0b]" /> {mat.folder_name}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-[color:var(--sm-border)] pt-3">
          {confirmDelete ? (
            <>
              <span className="text-[12px] text-[color:var(--sm-text-3)] self-center">Confirmar exclusão?</span>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Não</Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white border-0"
                onClick={() => { setConfirmDelete(false); onClose(); onDelete() }}
              >
                Excluir
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
              </Button>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
              <Button size="sm" onClick={() => { onClose(); onEdit() }}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Folder card ──────────────────────────────────────────────────────────────

function FolderCard({
  name,
  count,
  onClick,
  onRename,
  onDelete,
}: {
  name:     string
  count:    number
  onClick:  () => void
  onRename: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const iconBtn = 'w-7 h-7 rounded-md flex items-center justify-center hover:bg-black/5 transition-colors'

  return (
    <div
      className="relative rounded-2xl border p-4 cursor-pointer transition-colors hover:border-[#2563EB]/50 group select-none"
      style={cardStyle}
      onClick={() => { if (!confirmDelete) onClick() }}
    >
      <Folder className="w-8 h-8 mb-3" style={{ color: '#F59E0B' }} strokeWidth={1.6} />
      <p className="text-[13px] font-semibold truncate leading-snug pr-4" style={{ color: 'var(--sm-text-1)' }}>{name}</p>
      <p className="text-[11.5px] mt-0.5 tabular-nums" style={{ color: 'var(--sm-text-4)' }}>
        {count} arquivo{count !== 1 ? 's' : ''}
      </p>

      <div
        className="absolute top-2 right-2 flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--sm-text-3)' }}
        onClick={e => e.stopPropagation()}
      >
        {confirmDelete ? (
          <div className="flex items-center gap-1 border rounded-lg shadow-sm px-2 py-1" style={cardStyle}>
            <span className="text-[11px]" style={{ color: 'var(--sm-text-3)' }}>Excluir?</span>
            <button onClick={() => setConfirmDelete(false)} className="text-[11px] px-1.5 py-0.5 rounded hover:bg-black/5" style={{ color: 'var(--sm-text-2)' }}>Não</button>
            <button onClick={() => { setConfirmDelete(false); onDelete() }} className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ color: '#EF4444' }}>Sim</button>
          </div>
        ) : (
          <>
            <button onClick={onRename} className={iconBtn} title="Renomear pasta" aria-label="Renomear pasta"><Pencil className="w-3 h-3" /></button>
            <button onClick={() => setConfirmDelete(true)} className={`${iconBtn} hover:text-red-500`} title="Excluir pasta" aria-label="Excluir pasta"><Trash2 className="w-3 h-3" /></button>
          </>
        )}
      </div>

      <ChevronRight className="absolute right-3 bottom-4 w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--sm-text-4)' }} />
    </div>
  )
}

// ─── Material row ─────────────────────────────────────────────────────────────

function MaterialRow({
  mat,
  first,
  onView,
  onEdit,
  onDelete,
}: {
  mat:      ClientMaterial
  first:    boolean
  onView:   () => void
  onEdit:   () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const meta = TYPE_META[mat.type]
  const size = formatSize(mat.file_size)
  const iconBtn = 'w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className={`flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02] transition-colors group cursor-pointer ${first ? '' : 'border-t'}`}
      style={{ borderColor: 'var(--sm-border)' }}
      onClick={() => { if (!confirmDelete) onView() }}
    >
      <span className={`w-9 h-9 ${iconBox}`}><MaterialIcon type={mat.type} /></span>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{mat.title}</p>
        <p className="text-[11.5px] mt-0.5 truncate" style={{ color: 'var(--sm-text-4)' }}>
          {meta.label}{size && ` · ${size}`} · {formatDate(mat.created_at)}
          {mat.description && <span style={{ color: 'var(--sm-text-3)' }}> · {mat.description}</span>}
        </p>
      </div>

      <div
        className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"
        style={{ color: 'var(--sm-text-3)' }}
        onClick={e => e.stopPropagation()}
      >
        {(mat.file_url || mat.link_url) && (
          <a href={mat.link_url || mat.file_url || '#'} target="_blank" rel="noopener noreferrer"
            className={`${iconBtn} max-sm:hidden`} title="Abrir em nova guia" aria-label="Abrir em nova guia">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button onClick={onEdit} className={iconBtn} title="Editar" aria-label="Editar"><Pencil className="w-3.5 h-3.5" /></button>
        {confirmDelete ? (
          <span className="flex items-center gap-1 ml-1">
            <button onClick={() => setConfirmDelete(false)} className="text-[11.5px] px-2 h-7 rounded-md hover:bg-black/5" style={{ color: 'var(--sm-text-2)' }}>Não</button>
            <button onClick={onDelete} className="text-[11.5px] font-semibold px-2 h-7 rounded-md hover:bg-red-500/10" style={{ color: '#EF4444' }}>Excluir</button>
          </span>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className={`${iconBtn} hover:text-red-500`} title="Excluir" aria-label="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
        )}
      </div>
    </motion.div>
  )
}

function MaterialList({ items, onView, onEdit, onDelete }: {
  items: ClientMaterial[]
  onView: (m: ClientMaterial) => void
  onEdit: (m: ClientMaterial) => void
  onDelete: (m: ClientMaterial) => void
}) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={cardStyle}>
      <AnimatePresence initial={false}>
        {items.map((mat, i) => (
          <MaterialRow key={mat.id} mat={mat} first={i === 0}
            onView={() => onView(mat)} onEdit={() => onEdit(mat)} onDelete={() => onDelete(mat)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// ─── Material form modal ───────────────────────────────────────────────────────

const blankForm = {
  title:       '',
  description: '',
  type:        'documento' as MaterialType,
  link_url:    '',
  folder_name: '',
}

function MaterialFormModal({
  open,
  onClose,
  editing,
  prefillFolder,
  clientId,
  userId,
}: {
  open:          boolean
  onClose:       () => void
  editing:       ClientMaterial | null
  prefillFolder: string
  clientId:      string
  userId:        string
}) {
  const addMaterial    = useAddMaterial()
  const updateMaterial = useUpdateMaterial()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm]                 = useState(blankForm)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading]       = useState(false)

  const isLink = form.type === 'link'

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        title:       editing.title,
        description: editing.description || '',
        type:        editing.type,
        link_url:    editing.link_url || '',
        folder_name: editing.folder_name || '',
      })
    } else {
      setForm({ ...blankForm, folder_name: prefillFolder })
    }
    setSelectedFile(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  const set = (k: keyof typeof blankForm, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.title.trim()) return
    setUploading(true)
    try {
      let file_url:  string | null = editing?.file_url  ?? null
      let file_size: number | null = editing?.file_size ?? null

      if (selectedFile && !isLink) {
        const { allowed, message } = await checkStorageLimit(selectedFile.size)
        if (!allowed) { toast(message ?? 'Limite de armazenamento atingido.', 'error'); setUploading(false); return }
        const ext  = selectedFile.name.split('.').pop() || 'bin'
        const path = `${userId}/${clientId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
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
        folder_name: form.folder_name.trim() || null,
      }

      if (editing) {
        await updateMaterial.mutateAsync({ id: editing.id, clientId, ...payload })
        toast('Material atualizado!', 'success')
      } else {
        await addMaterial.mutateAsync({ user_id: userId, client_id: clientId, ...payload })
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar material' : 'Adicionar material'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1 max-h-[60vh] overflow-y-auto pr-1">
          <Input
            label="Título *"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Nome do material..."
          />

          <div>
            <label className="block text-[11px] font-medium text-[color:var(--sm-text-3)] mb-1.5 uppercase tracking-wide">Tipo</label>
            <Select value={form.type} onValueChange={v => set('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATERIAL_TYPES.map(t => (
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

          <div>
            <label className="block text-[11px] font-medium text-[color:var(--sm-text-3)] mb-1.5 uppercase tracking-wide">
              Pasta (opcional)
            </label>
            <div className="relative">
              <Folder className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#f59e0b] pointer-events-none" />
              <input
                type="text"
                value={form.folder_name}
                onChange={e => set('folder_name', e.target.value)}
                placeholder="Ex: Campanha Abril, Stories..."
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-card)] text-[13px] text-[color:var(--sm-text-1)] placeholder:text-[color:var(--sm-text-4)] focus:outline-none focus:border-[#2563EB]/50"
              />
            </div>
          </div>

          {isLink ? (
            <Input
              label="URL *"
              value={form.link_url}
              onChange={e => set('link_url', e.target.value)}
              placeholder="https://..."
            />
          ) : (
            <div>
              <label className="block text-[11px] font-medium text-[color:var(--sm-text-3)] mb-1.5 uppercase tracking-wide">
                Arquivo
              </label>
              {selectedFile ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)]">
                  <File className="w-3.5 h-3.5 text-[color:var(--sm-text-3)] flex-shrink-0" />
                  <span className="text-[12px] text-[color:var(--sm-text-2)] truncate flex-1">{selectedFile.name}</span>
                  <button type="button" onClick={() => setSelectedFile(null)} className="text-[color:var(--sm-text-4)] hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : editing?.file_url ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)]">
                  <File className="w-3.5 h-3.5 text-[color:var(--sm-text-3)] flex-shrink-0" />
                  <span className="text-[12px] text-[color:var(--sm-text-3)] truncate flex-1">Arquivo atual</span>
                  <button type="button" onClick={() => fileRef.current?.click()} className="text-[11px] text-blue-600 hover:text-blue-700">
                    Substituir
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center justify-center gap-2 w-full h-16 rounded-xl border-2 border-dashed border-[color:var(--sm-border)] text-[color:var(--sm-text-4)] text-[12px] hover:border-[#2563EB]/50 hover:bg-black/5 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Clique para selecionar arquivo
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) setSelectedFile(f)
                  e.target.value = ''
                }}
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
            {uploading ? (
              <><Upload className="w-3 h-3 animate-pulse" /> Enviando...</>
            ) : editing ? (
              <><Save className="w-3 h-3" /> Salvar</>
            ) : (
              <><Plus className="w-3 h-3" /> Adicionar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── New / rename folder modal ─────────────────────────────────────────────────

function FolderNameModal({
  open,
  onClose,
  onConfirm,
  existingFolders,
  initialName,
  mode,
}: {
  open:            boolean
  onClose:         () => void
  onConfirm:       (name: string) => void
  existingFolders: string[]
  initialName:     string
  mode:            'create' | 'rename'
}) {
  const [name, setName] = useState(initialName)

  useEffect(() => {
    if (open) setName(initialName)
  }, [open, initialName])

  const isDuplicate = name.trim() !== initialName && existingFolders.includes(name.trim())
  const unchanged   = mode === 'rename' && name.trim() === initialName

  const handleConfirm = () => {
    const trimmed = name.trim()
    if (!trimmed || isDuplicate || unchanged) return
    onConfirm(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nova pasta' : 'Renomear pasta'}</DialogTitle>
        </DialogHeader>
        <div className="mt-1">
          <div className="relative">
            <Folder className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#f59e0b] pointer-events-none" />
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
              placeholder="Nome da pasta..."
              autoFocus
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-card)] text-[13px] text-[color:var(--sm-text-1)] placeholder:text-[color:var(--sm-text-4)] focus:outline-none focus:border-[#2563EB]/50"
            />
          </div>
          {isDuplicate && (
            <p className="text-[11px] text-red-500 mt-1.5">Já existe uma pasta com esse nome.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!name.trim() || isDuplicate || unchanged}
          >
            {mode === 'create' ? (
              <><FolderPlus className="w-3 h-3" /> Criar pasta</>
            ) : (
              <><Save className="w-3 h-3" /> Renomear</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MaterialsTab({ clientId }: { clientId: string }) {
  const { user, agencyId } = useAuth()
  const { data: materials = [] } = useClientMaterials(clientId)
  const updateMaterial = useUpdateMaterial()
  const deleteMaterial = useDeleteMaterial()
  const { toast } = useToast()

  // Navigation
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)

  // Modals
  const [formOpen, setFormOpen]               = useState(false)
  const [editing, setEditing]                 = useState<ClientMaterial | null>(null)
  const [prefillFolder, setPrefillFolder]     = useState('')

  const [viewingMat, setViewingMat]           = useState<ClientMaterial | null>(null)

  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'rename'>('create')
  const [renamingFolder, setRenamingFolder]   = useState('')

  // Derived
  const folders = useMemo(() => {
    const map = new Map<string, number>()
    materials.forEach(m => {
      if (m.folder_name) map.set(m.folder_name, (map.get(m.folder_name) ?? 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [materials])

  const rootMaterials   = useMemo(() => materials.filter(m => !m.folder_name), [materials])
  const folderMaterials = useMemo(
    () => materials.filter(m => m.folder_name === currentFolder),
    [materials, currentFolder],
  )

  // Add
  const openAdd = (folder = '') => {
    setEditing(null)
    setPrefillFolder(folder)
    setFormOpen(true)
  }

  // Edit
  const openEdit = (mat: ClientMaterial) => {
    setEditing(mat)
    setPrefillFolder(mat.folder_name ?? '')
    setFormOpen(true)
  }

  // Delete material
  const handleDelete = async (mat: ClientMaterial) => {
    try {
      await deleteMaterial.mutateAsync({ id: mat.id, clientId, fileUrl: mat.file_url })
      toast('Material removido.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  // Delete folder
  const handleDeleteFolder = async (folderName: string) => {
    const toDelete = materials.filter(m => m.folder_name === folderName)
    try {
      await Promise.all(
        toDelete.map(m => deleteMaterial.mutateAsync({ id: m.id, clientId, fileUrl: m.file_url }))
      )
      toast(`Pasta "${folderName}" excluída.`, 'success')
      if (currentFolder === folderName) setCurrentFolder(null)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  // Rename folder — update all materials inside
  const handleRenameFolder = async (oldName: string, newName: string) => {
    const toUpdate = materials.filter(m => m.folder_name === oldName)
    try {
      await Promise.all(
        toUpdate.map(m =>
          updateMaterial.mutateAsync({ id: m.id, clientId, folder_name: newName })
        )
      )
      toast(`Pasta renomeada para "${newName}".`, 'success')
      if (currentFolder === oldName) setCurrentFolder(newName)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  // New folder
  const handleNewFolder = () => {
    setFolderModalMode('create')
    setRenamingFolder('')
    setFolderModalOpen(true)
  }

  // Rename folder open
  const handleOpenRename = (name: string) => {
    setFolderModalMode('rename')
    setRenamingFolder(name)
    setFolderModalOpen(true)
  }

  // Folder modal confirm
  const handleFolderModalConfirm = (name: string) => {
    setFolderModalOpen(false)
    if (folderModalMode === 'create') {
      setCurrentFolder(name)
      openAdd(name)
    } else {
      handleRenameFolder(renamingFolder, name)
    }
  }

  const modals = (
    <>
      <MaterialViewModal
        mat={viewingMat}
        open={!!viewingMat}
        onClose={() => setViewingMat(null)}
        onEdit={() => { setViewingMat(null); openEdit(viewingMat!) }}
        onDelete={() => { setViewingMat(null); handleDelete(viewingMat!) }}
      />
      <MaterialFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        editing={editing}
        prefillFolder={prefillFolder}
        clientId={clientId}
        userId={agencyId ?? ''}
      />
      <FolderNameModal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        onConfirm={handleFolderModalConfirm}
        existingFolders={folders.map(([n]) => n).filter(n => n !== renamingFolder)}
        initialName={renamingFolder}
        mode={folderModalMode}
      />
    </>
  )

  const sectionLabel = (n: string, text: string) => (
    <h3 className="flex items-baseline gap-2 mb-2.5">
      <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{n}</span>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-3)' }}>{text}</span>
    </h3>
  )

  // ── View: folder ────────────────────────────────────────────────────────────

  if (currentFolder !== null) {
    return (
      <section>
        <button onClick={() => setCurrentFolder(null)}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium mb-2 hover:underline" style={{ color: 'var(--sm-text-3)' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Materiais
        </button>
        <TabHeader
          title={currentFolder}
          subtitle={`${folderMaterials.length} arquivo${folderMaterials.length !== 1 ? 's' : ''} nesta pasta`}
          actions={<>
            <GhostButton onClick={() => handleOpenRename(currentFolder)}><Pencil className="w-3.5 h-3.5" /> Renomear</GhostButton>
            <PrimaryButton onClick={() => openAdd(currentFolder)}><Plus className="w-3.5 h-3.5" /> Adicionar arquivo</PrimaryButton>
          </>}
        />

        {folderMaterials.length === 0 ? (
          <EmptyState Icon={Folder} title="Pasta vazia" hint="Adicione o primeiro arquivo a esta pasta."
            action={<PrimaryButton onClick={() => openAdd(currentFolder)}><Plus className="w-3.5 h-3.5" /> Adicionar arquivo</PrimaryButton>} />
        ) : (
          <MaterialList items={folderMaterials} onView={setViewingMat} onEdit={openEdit} onDelete={handleDelete} />
        )}

        {modals}
      </section>
    )
  }

  // ── View: root ──────────────────────────────────────────────────────────────

  return (
    <section>
      <TabHeader
        title="Materiais"
        subtitle={`${materials.length} ${materials.length === 1 ? 'arquivo' : 'arquivos'} · o cliente vê tudo no portal`}
        actions={<>
          <GhostButton onClick={handleNewFolder}><FolderPlus className="w-3.5 h-3.5" /> Nova pasta</GhostButton>
          <PrimaryButton onClick={() => openAdd('')}><Plus className="w-3.5 h-3.5" /> Adicionar arquivo</PrimaryButton>
        </>}
      />

      {materials.length === 0 && (
        <EmptyState Icon={Folder} title="Nenhum material ainda"
          hint="Adicione PDFs, imagens, links e documentos. O cliente verá tudo no portal."
          action={<PrimaryButton onClick={() => openAdd('')}><Plus className="w-3.5 h-3.5" /> Adicionar arquivo</PrimaryButton>} />
      )}

      {folders.length > 0 && (
        <div className="mb-6">
          {sectionLabel('01', `Pastas · ${folders.length}`)}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {folders.map(([name, count]) => (
              <FolderCard
                key={name}
                name={name}
                count={count}
                onClick={() => setCurrentFolder(name)}
                onRename={() => handleOpenRename(name)}
                onDelete={() => handleDeleteFolder(name)}
              />
            ))}
          </div>
        </div>
      )}

      {rootMaterials.length > 0 && (
        <div>
          {folders.length > 0 && sectionLabel('02', `Sem pasta · ${rootMaterials.length}`)}
          <MaterialList items={rootMaterials} onView={setViewingMat} onEdit={openEdit} onDelete={handleDelete} />
        </div>
      )}

      {modals}
    </section>
  )
}
