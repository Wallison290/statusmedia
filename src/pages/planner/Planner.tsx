import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon,
  Save, Send, Paperclip, Link2, X, FileText, ImageIcon, Video, Music, File,
  Building2, Upload, Trash2, Pencil, CalendarDays, ExternalLink, Check, Instagram, Loader2,
  LayoutGrid, Film, ChevronDown, MessageCircle,
  Clock, CheckCircle2, ClipboardList, Folder, AlertTriangle,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { usePlanner, useCreatePlannerItem, useUpdatePlannerItem, useDeletePlannerItem } from '@/hooks/usePlanner'
import { useClients } from '@/hooks/useClients'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { VideoComSom } from '@/components/VideoComSom'
import { useWhatsappGroups } from '@/hooks/useWhatsappGroups'
import { contentTypeLabels, isStoryContent } from '@/utils/formatters'
import { supabase } from '@/integrations/supabase/client'
import { uploadArquivo } from '@/lib/uploadArquivo'
import { edgeErrorMessage } from '@/lib/edgeErrors'
import { checkStorageLimit } from '@/utils/storageGate'
import { isImageUrl, isImageMedia, isVideoMedia, mimeFromUrl } from '@/utils/media'
import { useContentAssets } from '@/hooks/useContentAssets'
import { PlannerCommentsThread } from '@/components/PlannerCommentsThread'
import { useTheme } from '@/contexts/ThemeContext'
import { PLAN_KEYS, planKey, planColor } from '@/utils/planStatus'
import { useClientInstagramAccount, useCreateScheduledPost } from '@/hooks/useInstagram'
import type { PlannerStatus, PlannerItem, PlannerAttachment, PlannerLink, ContentType, ApprovalStatus, ContentAsset } from '@/types'

// ─── Status config ────────────────────────────────────────────────────────────

const statusColors: Record<PlannerStatus, string> = {
  ideia: 'bg-purple-500',
  producao: 'bg-blue-500',
  revisao: 'bg-yellow-500',
  aprovado: 'bg-green-500',
  publicado: 'bg-emerald-500',
}

const statusTextColors: Record<PlannerStatus, string> = {
  ideia: 'text-purple-400',
  producao: 'text-blue-400',
  revisao: 'text-yellow-400',
  aprovado: 'text-green-400',
  publicado: 'text-emerald-400',
}

const statusLabels: Record<PlannerStatus, string> = {
  ideia: 'Ideia',
  producao: 'Produção',
  revisao: 'Revisão',
  aprovado: 'Aprovado',
  publicado: 'Publicado',
}

// ─── Notificar cliente (WhatsApp) — opções de mensagem ───────────────────────

const WA_MESSAGE_OPTIONS = [
  {
    value: 'NEW_CONTENT' as const,
    label: 'Novo conteúdo no planejamento',
    description: 'Informe que um novo conteúdo foi adicionado ao planejamento.',
    Icon: ClipboardList,
    iconBg: '#2563EB1a',
    iconColor: '#2563EB',
  },
  {
    value: 'APPROVAL_REQUEST' as const,
    label: 'Conteúdo aguardando aprovação',
    description: 'Lembre o cliente que há conteúdos pendentes de aprovação.',
    Icon: Clock,
    iconBg: '#F5A6231a',
    iconColor: '#B45309',
  },
  {
    value: 'ADJUSTMENT_DONE' as const,
    label: 'Ajuste concluído',
    description: 'Notifique que as alterações solicitadas foram realizadas.',
    Icon: CheckCircle2,
    iconBg: '#22C55E1a',
    iconColor: '#16A34A',
  },
]

function WaCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors"
      style={checked
        ? { background: '#2563EB', borderColor: '#2563EB' }
        : { borderColor: 'var(--sm-border)' }}
    >
      {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
    </span>
  )
}

// ─── Approval config ─────────────────────────────────────────────────────────

const approvalDot: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'bg-yellow-400',
  aprovado: 'bg-green-400',
  ajuste_solicitado: 'bg-orange-400',
  ajuste_realizado: 'bg-blue-400',
  reprovado: 'bg-red-400',
}
const approvalTextColor: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'text-yellow-400',
  aprovado: 'text-green-400',
  ajuste_solicitado: 'text-orange-400',
  ajuste_realizado: 'text-blue-400',
  reprovado: 'text-red-400',
}
const approvalTextColorLight: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'text-yellow-700',
  aprovado:           'text-green-700',
  ajuste_solicitado:  'text-orange-700',
  ajuste_realizado:   'text-blue-700',
  reprovado:          'text-red-700',
}
const approvalHex: Record<ApprovalStatus, string> = {
  pendente_aprovacao: '#F59E0B',
  aprovado:           '#22C55E',
  ajuste_solicitado:  '#F97316',
  ajuste_realizado:   '#2563EB',
  reprovado:          '#EF4444',
}
const statusHex: Record<PlannerStatus, string> = {
  ideia: '#8B5CF6', producao: '#3B82F6', revisao: '#EAB308', aprovado: '#22C55E', publicado: '#10B981',
}

// Aviso neutro com barra colorida à esquerda (substitui caixas de fundo colorido)
function Aviso({ color, title, children }: { color: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="relative rounded-xl border p-3 pl-4 overflow-hidden space-y-1"
      style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
      <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r" style={{ background: color }} />
      <p className="text-[12.5px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--sm-text-1)' }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />{title}
      </p>
      {children && <p className="text-[12px] leading-relaxed" style={{ color: 'var(--sm-text-3)' }}>{children}</p>}
    </div>
  )
}

const approvalLabel: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado pelo cliente',
  ajuste_solicitado: 'Ajuste solicitado',
  ajuste_realizado: 'Ajuste realizado',
  reprovado: 'Reprovado pelo cliente',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Recalcula o approval_status geral com base nos status parciais Arte e Copy
function computeOverallApproval(
  art: ApprovalStatus | null,
  copy: ApprovalStatus | null,
): ApprovalStatus {
  const statuses = [art, copy].filter(Boolean) as ApprovalStatus[]
  if (statuses.length === 0) return 'pendente_aprovacao'
  if (statuses.some(s => s === 'reprovado')) return 'reprovado'
  if (statuses.some(s => s === 'ajuste_solicitado')) return 'ajuste_solicitado'
  if (statuses.some(s => s === 'ajuste_realizado')) return 'ajuste_realizado'
  if (statuses.every(s => s === 'aprovado')) return 'aprovado'
  return 'pendente_aprovacao'
}

// Parseia feedback de carrossel (JSON por slide) — retorna null se for texto simples
type CarouselSlide = { slide: number; status: 'aprovado' | 'ajuste_solicitado' | 'reprovado'; feedback: string }
function parseCarouselFeedback(feedback: string | null | undefined): CarouselSlide[] | null {
  if (!feedback) return null
  try {
    const data = JSON.parse(feedback)
    if (Array.isArray(data) && data.length > 0 && typeof data[0].slide === 'number') return data as CarouselSlide[]
    return null
  } catch { return null }
}


function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function FileTypeIcon({ type, size = 'sm' }: { type: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-4 h-4' : 'w-3 h-3'
  if (type.startsWith('image/')) return <ImageIcon className={`${cls} text-blue-400`} />
  if (type.startsWith('video/')) return <Video className={`${cls} text-purple-400`} />
  if (type.startsWith('audio/')) return <Music className={`${cls} text-green-400`} />
  if (type === 'application/pdf') return <FileText className={`${cls} text-red-400`} />
  return <File className={`${cls} text-gray-400`} />
}

function extractStoragePath(url: string): string | null {
  const marker = '/planner-attachments/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length))
}

// ─── Video Preview (pending file — objectURL gerenciado) ─────────────────────

function VideoPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [src, setSrc]           = useState<string>('')
  const [loading, setLoading]   = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    setLoading(true)
    setHasError(false)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!src) return null

  return (
    <div className="border border-white/8 rounded-xl overflow-hidden bg-black">
      {hasError ? (
        // Codec não suportado pelo browser (ex: HEVC/MOV do iOS) — arquivo ainda sobe normalmente
        <div className="flex flex-col items-center justify-center py-5 gap-2 text-gray-400">
          <Video className="w-7 h-7 text-purple-400" />
          <p className="text-[11px] text-center leading-relaxed">
            Preview indisponível neste browser<br />
            <span className="text-gray-600">O arquivo será enviado normalmente ao salvar</span>
          </p>
        </div>
      ) : (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
            </div>
          )}
          {/* Sem `muted`: este player não toca sozinho, então o navegador não
              exige silêncio. Antes vinha mudo à toa e obrigava a pessoa a
              caçar o botãozinho de som para ouvir o que acabou de anexar. */}
          <video
            src={src}
            playsInline
            controls
            className="w-full max-h-[220px] object-contain bg-black"
            onCanPlay={() => setLoading(false)}
            onError={() => { setHasError(true); setLoading(false) }}
          />
        </div>
      )}
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.04]">
        <Video className="w-3 h-3 text-purple-400 flex-shrink-0" />
        <span className="text-xs text-gray-300 truncate flex-1">{file.name}</span>
        <span className="text-[10px] text-gray-600 flex-shrink-0">{formatFileSize(file.size)}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover" className="p-2 -m-1.5 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Helpers de mídia ────────────────────────────────────────────────────────

function guessMediaType(url: string): string {
  return mimeFromUrl(url) ?? 'application/octet-stream'
}

// MIME type com fallback por extensão (para File objects que retornam '' em alguns browsers)
function getMimeType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  return mimeFromUrl(file.name) || file.type || 'application/octet-stream'
}

// Detecção de vídeo/imagem com fallback por extensão da URL (cobre file_type salvo incorretamente)
function isVideoAttachment(att: { file_type: string; file_url: string }): boolean {
  return isVideoMedia(att.file_type, att.file_url)
}

function isImageAttachment(att: { file_type: string; file_url: string }): boolean {
  return isImageMedia(att.file_type, att.file_url)
}

// ─── Content Picker Dialog ────────────────────────────────────────────────────

function ContentPickerDialog({
  open,
  onClose,
  clientId,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  onSelect: (asset: ContentAsset) => void
}) {
  const { data: assets } = useContentAssets(clientId)
  const [search, setSearch] = useState('')

  const filtered = (assets || []).filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-xl max-h-[80vh] flex flex-col overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Selecionar conteúdo do arsenal</DialogTitle>
        </DialogHeader>

        <input
          type="text"
          placeholder="Buscar por título..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-8 px-3 rounded-md border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)] text-[13px] text-[color:var(--sm-text-1)] placeholder:text-[color:var(--sm-text-4)] focus:outline-none focus:ring-1 focus:ring-[#2563EB]/30 mb-3"
        />

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <ImageIcon className="w-6 h-6 text-[color:var(--sm-text-4)] mx-auto mb-1.5" />
              <p className="text-[12px] text-[color:var(--sm-text-4)]">
                {(assets || []).length === 0
                  ? 'Nenhum conteúdo no arsenal deste cliente.'
                  : 'Nenhum resultado para a busca.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filtered.map(asset => {
                const isImg = isImageUrl(asset.media_url)
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => { onSelect(asset); onClose() }}
                    className="group text-left rounded-lg border border-[color:var(--sm-border)] overflow-hidden bg-[color:var(--sm-bg-card)] hover:border-[#2563EB]/50 transition-colors"
                  >
                    <div className="aspect-square overflow-hidden bg-[color:var(--sm-bg-alt)]">
                      {isImg ? (
                        <img
                          src={asset.media_url!}
                          alt={asset.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-[color:var(--sm-text-4)]" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-[11px] text-[color:var(--sm-text-1)] truncate">{asset.title}</p>
                      <p className="text-[10px] text-[color:var(--sm-text-4)]">{contentTypeLabels[asset.content_type as ContentType]}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Hover Tooltip (inalterado) ───────────────────────────────────────────────

interface HoverState { items: PlannerItem[]; top: number; left: number }

function DayTooltip({ state }: { state: HoverState }) {
  return (
    <div className="fixed z-50 pointer-events-none" style={{ top: state.top, left: state.left }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4 }}
        transition={{ duration: 0.13 }}
        className="bg-[var(--sm-bg-alt)] border border-[var(--sm-border)] rounded-xl shadow-xl w-[260px] p-3 text-xs text-[var(--sm-text-1)]"
      >
        {state.items.map((item, i) => (
          <div key={item.id} className={i > 0 ? 'mt-2.5 pt-2.5 border-t border-[var(--sm-border)]' : ''}>
            <div className="flex items-start gap-2 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full mt-[3px] flex-shrink-0 ${statusColors[item.status as PlannerStatus]}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--sm-text-1)] text-[11px] leading-snug">{item.title}</p>
                <p className="text-[10px] text-[var(--sm-text-3)] mt-0.5">
                  {contentTypeLabels[item.content_type as ContentType]} · {statusLabels[item.status as PlannerStatus]}
                </p>
              </div>
            </div>
            {item.client && (
              <div className="flex items-center gap-1 mb-1">
                <Building2 className="w-3 h-3 text-[var(--sm-text-3)] flex-shrink-0" />
                <span className="text-[10px] text-[var(--sm-text-3)] truncate">{item.client.company_name}</span>
              </div>
            )}
            {/* Approval badge no tooltip — omitido para rascunhos */}
            {(() => {
              const artP  = (item as any).art_approval_status  as ApprovalStatus | null
              const copyP = (item as any).copy_approval_status as ApprovalStatus | null
              const hasApprovalContext = item.sent_to_client || item.approval_status || artP || copyP
                || item.status === 'aprovado' || item.status === 'publicado'
              if (!hasApprovalContext) return null
              const as_: ApprovalStatus = (() => {
                if (artP || copyP) return computeOverallApproval(artP, copyP)
                if (item.approval_status) return item.approval_status as ApprovalStatus
                if (item.status === 'aprovado' || item.status === 'publicado') return 'aprovado'
                return 'pendente_aprovacao'
              })()
              const badgeCls =
                as_ === 'aprovado'          ? 'bg-green-100 text-green-700' :
                as_ === 'ajuste_solicitado' ? 'bg-orange-100 text-orange-700' :
                as_ === 'ajuste_realizado'  ? 'bg-blue-100 text-blue-700' :
                as_ === 'reprovado'         ? 'bg-red-100 text-red-700' :
                                              'bg-amber-100 text-amber-700'
              return (
                <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md mb-1.5 ${badgeCls}`}>
                  <div className={`w-1 h-1 rounded-full flex-shrink-0 ${approvalDot[as_]}`} />
                  <span className="text-[9px] font-medium">{approvalLabel[as_]}</span>
                </div>
              )
            })()}
            {item.notes && (
              <p className="text-[10px] text-[var(--sm-text-3)] line-clamp-2 mb-1.5 leading-relaxed">{item.notes}</p>
            )}
            {item.client_feedback && (
              <p className="text-[10px] text-[var(--sm-text-4)] italic line-clamp-1 mb-1.5">"{item.client_feedback}"</p>
            )}
            {(() => {
              const img = item.attachments?.find(a => isImageAttachment(a))
              const vid = item.attachments?.find(a => isVideoAttachment(a))
              if (img) return <img src={img.file_url} alt="" className="w-full h-20 object-cover rounded-lg mb-1.5" />
              if (vid) return (
                <div className="w-full h-20 rounded-lg mb-1.5 bg-black overflow-hidden">
                  <video
                    src={vid.file_url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
              )
              return null
            })()}
            <div className="flex items-center gap-3 flex-wrap">
              {item.attachments && item.attachments.length > 0 && (
                <div className="flex items-center gap-1">
                  <Paperclip className="w-3 h-3 text-[var(--sm-text-3)]" />
                  <span className="text-[10px] text-[var(--sm-text-3)]">
                    {item.attachments.length} {item.attachments.length === 1 ? 'anexo' : 'anexos'}
                  </span>
                </div>
              )}
              {item.links && item.links.length > 0 && (
                <div className="flex items-center gap-1 min-w-0">
                  <Link2 className="w-3 h-3 text-blue-500 flex-shrink-0" />
                  <span className="text-[10px] text-blue-500 truncate">
                    {item.links.length === 1 ? item.links[0].url : `${item.links.length} links`}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

// ─── Instagram Schedule Section ───────────────────────────────────────────────

type IgPostType = 'IMAGE' | 'CAROUSEL_ALBUM' | 'REELS'

function InstagramScheduleSection({ item }: { item: PlannerItem; userId: string }) {
  const { data: igAccount, isLoading: igLoading } = useClientInstagramAccount(item.client_id ?? undefined)
  const createPost = useCreateScheduledPost()
  const updatePlanner = useUpdatePlannerItem()
  const { toast }  = useToast()
  const { isDark } = useTheme()

  // Tipo vem direto do planner (sem re-seleção)
  const postType = item.ig_post_type as IgPostType | null
  const ptLabel  = postType === 'IMAGE' ? 'imagem'
    : postType === 'CAROUSEL_ALBUM' ? 'carrossel'
    : postType === 'REELS' ? 'reel' : 'post'

  // ⚠️ Hooks de estado ANTES de qualquer return condicional (Regras dos Hooks):
  // quando o item vira ig_scheduled=true, o componente retorna cedo abaixo — se
  // os useState ficassem após os returns, o React chamaria menos hooks e quebraria.
  const [caption, setCaption]       = useState(item.notes ?? '')
  const [schedDate, setSchedDate]   = useState(item.scheduled_date)
  const [schedTime, setSchedTime]   = useState(item.scheduled_time?.slice(0, 5) ?? '09:00')
  const [publishing, setPublishing] = useState(false)
  const [success, setSuccess]       = useState(false)

  // ── Estados que bloqueiam agendamento ──────────────────────────────────────
  // Aprovado + agendado automaticamente
  if (item.ig_scheduled && item.approval_status === 'aprovado') {
    return (
      <Aviso color="#22C55E" title="Aprovado e agendado">
          Este {ptLabel} está agendado no Instagram e marcado como aprovado — o cliente
          não vê mais como pendente de aprovação. Acompanhe a publicação na aba <strong>Instagram</strong>.
        </Aviso>
    )
  }

  // Story — a plataforma não agenda stories (migration 072 barra no banco).
  // Vem depois do bloco acima de propósito: se algum item antigo já estiver
  // agendado, o estado real continua sendo mostrado em vez desta regra.
  if (isStoryContent(item.content_type)) {
    return (
      <div className="p-3 rounded-xl space-y-1.5"
        style={{ background: 'var(--sm-bg-alt)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--sm-border)' }}>
        <div className="flex items-center gap-2">
          <Instagram className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} />
          <p className="text-xs font-medium" style={{ color: 'var(--sm-text-2)' }}>Stories não são agendados</p>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--sm-text-3)' }}>
          A plataforma não publica stories no Instagram. Mesmo com a aprovação do cliente,
          este item não entra no agendamento — publique o story direto pelo aplicativo.
        </p>
      </div>
    )
  }

  // Ajuste solicitado — cliente pediu correções
  if (item.approval_status === 'ajuste_solicitado') {
    return (
      <Aviso color="#F97316" title="Ajustes pendentes">
          Realize os ajustes solicitados pelo cliente e reenvie para aprovação.
          O agendamento será liberado automaticamente após a aprovação completa.
        </Aviso>
    )
  }

  // Ajuste realizado — agência corrigiu, aguardando nova aprovação
  if (item.approval_status === 'ajuste_realizado') {
    return (
      <Aviso color="#2563EB" title="Aguardando nova aprovação do cliente">
          Os ajustes foram realizados e o {ptLabel} foi reenviado ao cliente.
          Quando ele aprovar, o agendamento no Instagram acontecerá automaticamente.
        </Aviso>
    )
  }

  // Reprovado — cliente rejeitou
  if (item.approval_status === 'reprovado') {
    return (
      <Aviso color="#EF4444" title="Conteúdo reprovado">
          Revise os ajustes indicados pelo cliente e reenvie para aprovação.
          O agendamento será liberado automaticamente após a aprovação completa.
        </Aviso>
    )
  }

  // Mídias IG: usa is_ig_media explícito; fallback = todas as imagens/vídeos do item
  const igMediaExplicit = (item.attachments ?? [])
    .filter(a => a.is_ig_media)
    .sort((a, b) => a.sort_order - b.sort_order)
  const igMediaFallback = (item.attachments ?? [])
    .filter(a => isImageAttachment(a) || isVideoAttachment(a))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const igMedia = igMediaExplicit.length > 0 ? igMediaExplicit : igMediaFallback

  const handleSchedule = async () => {
    if (!igAccount || !postType) return
    // Rede de segurança: o bloco acima já impede o formulário de aparecer para
    // story, mas a regra não pode depender só da ordem dos returns.
    if (isStoryContent(item.content_type)) return
    setPublishing(true)
    try {
      await createPost.mutateAsync({
        ig_account_id: igAccount.id,
        client_id:     item.client_id,
        post_type:     postType,
        caption,
        media_urls:    igMedia.map(a => a.file_url),
        scheduled_at:  new Date(`${schedDate}T${schedTime}:00`).toISOString(),
        planner_id:    item.id,
      })

      // Agendou manualmente pela agência → considera o conteúdo aprovado.
      // O cliente deixa de ver "pendente de aprovação" e o item sobe para
      // "publicado" na agência. Marcamos ig_scheduled=true para o trigger do
      // banco NÃO reagendar (evita post duplicado).
      await updatePlanner.mutateAsync({
        id:                  item.id,
        status:              'publicado',
        approval_status:     'aprovado',
        art_approval_status: 'aprovado',
        copy_approval_status:'aprovado',
        ig_scheduled:        true,
      })

      setSuccess(true)
      toast('Post agendado no Instagram!', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao agendar.', 'error')
    } finally {
      setPublishing(false)
    }
  }

  if (igLoading) return (
    <div className="flex items-center gap-2 py-2 text-xs text-[var(--sm-text-3)]">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--sm-text-4)]" /> Verificando Instagram...
    </div>
  )

  if (!item.client_id) return (
    <div className="p-3 bg-[var(--sm-bg-alt)] rounded-xl border border-[var(--sm-border)] text-xs text-[var(--sm-text-3)]">
      Post sem cliente vinculado — não é possível agendar no Instagram.
    </div>
  )

  if (!igAccount) return (
    <div className="p-3 bg-[var(--sm-bg-alt)] rounded-xl border border-[var(--sm-border)] space-y-1.5">
      <div className="flex items-center gap-2">
        <Instagram className="w-3.5 h-3.5 text-[var(--sm-text-4)]" />
        <p className="text-xs text-[var(--sm-text-2)] font-medium">Instagram não conectado</p>
      </div>
      <p className="text-[11px] text-[var(--sm-text-3)]">
        Acesse o perfil do cliente → aba <strong className="text-[var(--sm-text-2)]">Instagram</strong> para conectar a conta.
      </p>
    </div>
  )

  if (!postType) return (
    <Aviso color="#F59E0B" title="Tipo de post não configurado">Edite o post e selecione o tipo (Imagem, Carrossel ou Reel) para poder agendar.</Aviso>
  )

  if (igMedia.length === 0) return (
    <Aviso color="#F59E0B" title="Sem mídia configurada">Edite o post e adicione as mídias na seção "Publicação no Instagram".</Aviso>
  )

  if (success) return (
    <Aviso color="#22C55E" title="Post agendado!">Veja em <strong>Instagram → Agendados</strong>.</Aviso>
  )

  const typeLabel = postType === 'IMAGE' ? 'Imagem' : postType === 'CAROUSEL_ALBUM' ? `Carrossel (${igMedia.length})` : 'Reel'
  const TypeIcon  = postType === 'REELS' ? Film : postType === 'CAROUSEL_ALBUM' ? LayoutGrid : ImageIcon

  return (
    <div className="p-3 bg-[var(--sm-bg-alt)] rounded-xl border border-[var(--sm-border)] space-y-3">
      {/* Conta conectada */}
      <div className="flex items-center gap-2">
        {igAccount.profile_picture_url
          ? <img src={igAccount.profile_picture_url} alt="" className="w-6 h-6 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          : <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }}><Instagram className="w-3.5 h-3.5 text-white" /></div>
        }
        <span className="text-xs text-[var(--sm-text-2)] font-medium">@{igAccount.username}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--sm-text-2)' }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22C55E' }} />Conectado</span>
      </div>

      {/* Tipo + prévia das mídias */}
      <div className="flex items-center gap-2 p-2 bg-[var(--sm-bg-card)] rounded-lg border border-[var(--sm-border)]">
        <TypeIcon className="w-3.5 h-3.5 text-[var(--sm-text-3)] flex-shrink-0" />
        <span className="text-xs text-[var(--sm-text-2)] font-medium">{typeLabel}</span>
        <div className="ml-auto flex gap-1">
          {igMedia.slice(0, 4).map((att, i) => (
            <div key={att.id} className="w-8 h-8 rounded overflow-hidden border border-[var(--sm-border)] flex-shrink-0">
              {isVideoAttachment(att)
                ? <video src={att.file_url} className="w-full h-full object-cover" muted />
                : <img src={att.file_url} alt="" className="w-full h-full object-cover" />
              }
            </div>
          ))}
          {igMedia.length > 4 && (
            <span className="text-[10px] text-[var(--sm-text-4)] self-center pl-0.5">+{igMedia.length - 4}</span>
          )}
        </div>
      </div>

      {/* Legenda */}
      <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3} placeholder="Legenda..."
        className="w-full text-xs bg-[var(--sm-bg-card)] border border-[var(--sm-border)] rounded-lg px-3 py-2 text-[var(--sm-text-1)] placeholder-[var(--sm-text-4)] resize-none focus:outline-none focus:border-[#2563EB] transition-colors" />

      {/* Data/hora */}
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
          className="text-xs bg-[var(--sm-bg-card)] border border-[var(--sm-border)] rounded-lg px-3 py-2 text-[var(--sm-text-1)] focus:outline-none focus:border-[#2563EB] transition-colors [color-scheme:light_dark]" />
        <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
          className="text-xs bg-[var(--sm-bg-card)] border border-[var(--sm-border)] rounded-lg px-3 py-2 text-[var(--sm-text-1)] focus:outline-none focus:border-[#2563EB] transition-colors [color-scheme:light_dark]" />
      </div>

      <Button size="sm" onClick={handleSchedule} disabled={publishing}
        title="Schedule on Instagram — queues this approved content to be published to the client's connected Instagram account at the date and time above"
        className="w-full h-9 text-white border-0 hover:opacity-90" style={{ background: 'var(--sm-primary)' }}>
        {publishing
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Agendando...</>
          : <><Instagram className="w-3.5 h-3.5" /> Agendar no Instagram</>}
      </Button>
    </div>
  )
}

// ─── Visualização completa do evento ─────────────────────────────────────────

function PlannerItemView({
  item,
  open,
  onClose,
  onEdit,
  userId,
}: {
  item: PlannerItem
  open: boolean
  onClose: () => void
  onEdit: () => void
  userId: string
}) {
  const { isDark } = useTheme()
  const otherAttachments = item.attachments?.filter(a => !isImageAttachment(a) && !isVideoAttachment(a)) || []

  // Carrossel: segue a MESMA ordem dos slides (sort_order) que o cliente vê no
  // portal e que é enviada ao Instagram. Ordena todas as imagens/vídeos do item
  // por sort_order, de modo que a capa (slide 1) é sempre o menor sort_order.
  const mediaItems = (item.attachments ?? [])
    .filter(a => isImageAttachment(a) || isVideoAttachment(a))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(a => ({
      ...a,
      kind: isVideoAttachment(a) ? ('video' as const) : ('image' as const),
    }))
  const [mediaIdx, setMediaIdx] = useState(0)
  const currentMedia = mediaItems[mediaIdx] ?? null

  const [notesExpanded, setNotesExpanded]       = useState(false)
  const [localApprovalStatus, setLocalApprovalStatus] = useState<ApprovalStatus | null>(
    item.approval_status as ApprovalStatus | null
  )
  const updateItem = useUpdatePlannerItem()
  const { toast }  = useToast()

  const scrollRef     = useRef<HTMLDivElement>(null)  // wrapper mobile
  const bodyScrollRef = useRef<HTMLDivElement>(null)  // corpo desktop

  // Garante que o modal sempre abre no topo — useLayoutEffect roda ANTES da
  // pintura, então não há o "desce e sobe" visível que o setTimeout causava.
  useLayoutEffect(() => {
    if (!open) return
    if (scrollRef.current)     scrollRef.current.scrollTop = 0
    if (bodyScrollRef.current) bodyScrollRef.current.scrollTop = 0
  }, [open])

  // Status efetivo: calcula a partir dos parciais quando disponíveis
  const artPartial  = (item as any).art_approval_status  as ApprovalStatus | null
  const copyPartial = (item as any).copy_approval_status as ApprovalStatus | null
  const effectiveStatus: ApprovalStatus = (artPartial || copyPartial)
    ? computeOverallApproval(artPartial, copyPartial)
    : ((localApprovalStatus ?? item.approval_status) as ApprovalStatus ?? 'pendente_aprovacao')

  // Auto-corrige o DB se os parciais dizem ajuste_realizado mas o overall ainda está errado
  useEffect(() => {
    if (
      artPartial === 'ajuste_realizado' &&
      copyPartial === 'ajuste_realizado' &&
      item.approval_status !== 'ajuste_realizado'
    ) {
      updateItem.mutateAsync({ id: item.id, approval_status: 'ajuste_realizado' } as any)
        .catch(() => {/* silencioso */})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artPartial, copyPartial, item.approval_status, item.id])

  const handleMarkAdjustmentDone = async () => {
    try {
      await updateItem.mutateAsync({ id: item.id, approval_status: 'ajuste_realizado' })
      setLocalApprovalStatus('ajuste_realizado')
      toast('Ajuste marcado como realizado.', 'success')
    } catch (err: any) { toast(err.message, 'error') }
  }

  const hasMedia = mediaItems.length > 0

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      {/* Modal estilo Instagram — altura fixa para scroll funcionar */}
      <DialogContent
        ref={scrollRef}
        onOpenAutoFocus={e => { e.preventDefault(); if (scrollRef.current) scrollRef.current.scrollTop = 0; if (bodyScrollRef.current) bodyScrollRef.current.scrollTop = 0 }}
        className="w-[96vw] max-w-[96vw] lg:w-auto lg:max-w-[94vw] p-0 gap-0 [&>button.absolute]:hidden flex flex-col max-h-[90vh] overflow-y-auto lg:h-[90vh] lg:overflow-hidden"
      >

        {/* ── Layout dois painéis, cada um com altura 100% do modal ── */}
        <div className="flex flex-col lg:flex-row lg:h-full overflow-visible lg:overflow-hidden">

          {/* ══ ESQUERDA: a mídia — painel abraça a imagem (tamanho natural, sem corte e sem borda) ══ */}
          {hasMedia && (
            <div className="lg:w-auto flex-shrink-0 flex flex-col bg-black overflow-hidden lg:h-full">

              {/* Mídia principal — mobile: largura total natural; desktop: altura do modal, largura natural (sem corte) */}
              <div className="relative bg-black lg:h-full lg:min-h-0 lg:flex lg:items-center lg:justify-center">
                {currentMedia?.kind === 'image' ? (
                  <img
                    src={currentMedia.file_url}
                    alt={currentMedia.file_name}
                    className="block w-full h-auto lg:w-auto lg:h-full lg:max-w-[62vw] lg:object-contain"
                  />
                ) : currentMedia?.kind === 'video' ? (
                  <VideoComSom
                    key={currentMedia.file_url}
                    src={currentMedia.file_url}
                    className="block w-full h-auto lg:w-auto lg:h-full lg:max-w-[62vw] lg:object-contain"
                  />
                ) : null}

                {/* Setas de navegação */}
                {mediaItems.length > 1 && (
                  <>
                    <button
                      onClick={() => setMediaIdx(i => Math.max(0, i - 1))}
                      disabled={mediaIdx === 0}
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center text-white transition-all disabled:opacity-20 active:scale-95"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setMediaIdx(i => Math.min(mediaItems.length - 1, i + 1))}
                      disabled={mediaIdx === mediaItems.length - 1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center text-white transition-all disabled:opacity-20 active:scale-95"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}

                {/* Abrir original */}
                {currentMedia && (
                  <a
                    href={currentMedia.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white/80 hover:text-white transition-all"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* Miniaturas — MOBILE: faixa própria abaixo da imagem (não sobrepõe a arte) */}
              {mediaItems.length > 1 && (
                <div className="lg:hidden flex gap-1.5 px-3 py-2.5 overflow-x-auto bg-black border-t border-white/10 scrollbar-none">
                  {mediaItems.map((m, i) => (
                    <button
                      key={m.id}
                      onClick={() => setMediaIdx(i)}
                      className={`relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${i === mediaIdx ? 'border-white shadow-md' : 'border-white/25 opacity-70'}`}
                    >
                      {m.kind === 'image'
                        ? <img src={m.file_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-[#182233] flex items-center justify-center"><Film className="w-4 h-4 text-[#64748b]" /></div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ DIREITA: Informações — scroll independente ══ */}
          <div style={{ background: 'var(--sm-bg-card)' }} className={`flex flex-col lg:overflow-hidden ${hasMedia ? 'lg:flex-1 lg:min-w-[380px] lg:max-w-[560px] lg:h-full lg:border-l border-[color:var(--sm-border)]' : 'w-full lg:flex-1'}`}>
            {/* Header fixo — não rola */}
            <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-[color:var(--sm-border)]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {item.client && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Building2 className="w-3 h-3 text-[var(--sm-text-4)] flex-shrink-0" />
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--sm-text-4)]">{item.client.company_name}</span>
                    </div>
                  )}
                  <h2 className="font-display text-[19px] font-bold text-[var(--sm-text-1)] leading-snug tracking-[-0.01em] break-words">{item.title}</h2>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[11px] text-[var(--sm-text-3)]">
                      {format(parseISO(item.scheduled_date), "dd 'de' MMM", { locale: ptBR })}
                      {item.scheduled_time && ` · ${item.scheduled_time.slice(0,5)}`}
                    </span>
                    <span className="text-[var(--sm-text-2)]">·</span>
                    <span className="text-[11px] text-[var(--sm-text-3)]">{contentTypeLabels[item.content_type as ContentType]}</span>
                    <span className="text-[var(--sm-text-2)]">·</span>
                    {/* Status — seletor inline: muda o status do conteúdo direto por aqui */}
                    <div className="relative inline-flex items-center">
                      <span className="absolute left-2 w-1.5 h-1.5 rounded-full pointer-events-none" style={{ background: statusHex[item.status as PlannerStatus] }} />
                      <select
                        value={item.status}
                        disabled={updateItem.isPending}
                        onChange={async (e) => {
                          const next = e.target.value as PlannerStatus
                          if (next === item.status) return
                          try {
                            await updateItem.mutateAsync({ id: item.id, status: next })
                            toast('Status atualizado!', 'success')
                          } catch (err: any) {
                            toast(err.message, 'error')
                          }
                        }}
                        className="appearance-none cursor-pointer hover:bg-black/5 border rounded-md pl-5 pr-6 h-6 text-[11.5px] font-semibold outline-none transition-colors disabled:opacity-50 border-[color:var(--sm-border)] text-[color:var(--sm-text-1)] bg-transparent"
                      >
                        {(Object.keys(statusLabels) as PlannerStatus[]).map(s => (
                          <option key={s} value={s}>
                            {statusLabels[s]}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-[var(--sm-text-3)] absolute right-1.5 pointer-events-none" />
                    </div>
                  </div>
                </div>
                {/* Celular: alvos de 40px e "Editar" escrito, bem separado do X.
                    Com 28px colados, o dedo acertava o fechar no lugar do lápis. */}
                <div className="flex items-center gap-3 lg:gap-1.5 flex-shrink-0">
                  <button type="button" onClick={onEdit} aria-label="Editar"
                          className="h-10 px-3 lg:h-7 lg:w-7 lg:px-0 rounded-lg border border-[color:var(--sm-border)] hover:bg-black/5 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[var(--sm-text-2)] hover:text-[var(--sm-text-1)] transition-all">
                    <Pencil className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                    <span className="lg:hidden">Editar</span>
                  </button>
                  <button type="button" onClick={onClose} aria-label="Fechar"
                          className="w-10 h-10 lg:w-7 lg:h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[var(--sm-text-3)] hover:text-[var(--sm-text-1)] transition-all">
                    <X className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Corpo — rola independentemente */}
            <div ref={bodyScrollRef} className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto px-5 py-4 space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color:var(--sm-border-alt)] [&::-webkit-scrollbar-track]:bg-transparent">

              {/* Miniaturas — DESKTOP: no painel direito, acima da legenda */}
              {mediaItems.length > 1 && (
                <div className="hidden lg:flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {mediaItems.map((m, i) => (
                    <button
                      key={m.id}
                      onClick={() => setMediaIdx(i)}
                      className={`relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${i === mediaIdx ? 'border-[#2563EB] shadow-md' : 'border-[color:var(--sm-border)] opacity-70 hover:opacity-100'}`}
                    >
                      {m.kind === 'image'
                        ? <img src={m.file_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-[#182233] flex items-center justify-center"><Film className="w-4 h-4 text-[#64748b]" /></div>}
                    </button>
                  ))}
                </div>
              )}

              {/* Legenda */}
              {item.notes && (
                <div>
                  <p className="text-[10px] text-[var(--sm-text-4)] uppercase tracking-wider font-semibold mb-2">Legenda</p>
                  <div className="relative">
                    <p className={`text-[13px] text-[var(--sm-text-2)] leading-relaxed whitespace-pre-wrap break-words select-text ${!notesExpanded ? 'line-clamp-4' : ''}`}>
                      {item.notes}
                    </p>
                    {item.notes.length > 200 && (
                      <button onClick={() => setNotesExpanded(v => !v)} className="text-[12px] text-[var(--sm-text-3)] hover:text-[var(--sm-text-2)] mt-1.5 font-medium transition-colors">
                        {notesExpanded ? 'ver menos' : 'ver mais'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Outros anexos */}
              {otherAttachments.length > 0 && (
                <div>
                  <p className="text-[10px] text-[var(--sm-text-4)] uppercase tracking-wider font-semibold mb-2">Anexos</p>
                  <div className="space-y-1.5">
                    {otherAttachments.map(att => (
                      <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-2.5 bg-[var(--sm-bg-alt)] border border-[var(--sm-border)] rounded-lg hover:bg-[var(--sm-bg-card)] transition-colors min-w-0 overflow-hidden">
                        <FileTypeIcon type={att.file_type} size="md" />
                        <span className="text-xs text-[var(--sm-text-2)] truncate flex-1">{att.file_name}</span>
                        {att.file_size && <span className="text-[10px] text-[var(--sm-text-4)] flex-shrink-0">{formatFileSize(att.file_size)}</span>}
                        <ExternalLink className="w-3 h-3 text-[var(--sm-text-4)] flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Links */}
              {item.links && item.links.length > 0 && (
                <div>
                  <p className="text-[10px] text-[var(--sm-text-4)] uppercase tracking-wider font-semibold mb-2">Links</p>
                  <div className="space-y-1.5">
                    {item.links.map(link => (
                      <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2.5 bg-[var(--sm-bg-alt)] border border-[var(--sm-border)] rounded-lg hover:bg-[var(--sm-bg-card)] transition-colors min-w-0 overflow-hidden">
                        <Link2 className={`w-3.5 h-3.5 flex-shrink-0 text-[#2563EB]`} />
                        <span className={`text-xs flex-1 min-w-0 truncate text-[#2563EB]`}>{link.label || link.url}</span>
                        <ExternalLink className="w-3 h-3 text-[var(--sm-text-4)] flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Resposta do cliente */}
              {item.approval_status && (
                <div className="space-y-2">
                  <p className="text-[10px] text-[var(--sm-text-4)] uppercase tracking-wider font-semibold">Resposta do Cliente</p>

                  {/* Status geral + data */}
                  <div className="flex items-center gap-2 px-0.5 flex-wrap">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: approvalHex[effectiveStatus] }} />
                    <span className="text-[12.5px] font-semibold text-[var(--sm-text-1)]">
                      {approvalLabel[effectiveStatus]}
                    </span>
                    {item.reviewed_at && (
                      <span className="text-[10px] text-[var(--sm-text-4)] ml-auto">
                        {format(parseISO(item.reviewed_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </div>

                  {/* ── Arte ── */}
                  {(item as any).art_approval_status && (() => {
                    const artStatus = (item as any).art_approval_status as ApprovalStatus
                    const artFeedbackRaw = (item as any).art_feedback as string | null
                    const carouselSlides = parseCarouselFeedback(artFeedbackRaw)
                    const bgMap: Record<ApprovalStatus, string> = {
                      pendente_aprovacao: 'border-yellow-500/25 bg-yellow-500/10',
                      aprovado:           'border-green-500/25 bg-green-500/10',
                      ajuste_solicitado:  'border-orange-500/25 bg-orange-500/10',
                      ajuste_realizado:   'border-[#2563EB]/30 bg-[#2563EB]/10',
                      reprovado:          'border-red-500/25 bg-red-500/10',
                    }
                    const slideDot: Record<string, string> = {
                      aprovado: 'bg-green-500', ajuste_solicitado: 'bg-orange-400', reprovado: 'bg-red-500'
                    }
                    const slideText: Record<string, string> = {
                      aprovado: 'text-[var(--sm-text-1)]', ajuste_solicitado: 'text-[var(--sm-text-1)]', reprovado: 'text-[var(--sm-text-1)]'
                    }
                    const slideLabel: Record<string, string> = {
                      aprovado: 'Aprovado', ajuste_solicitado: 'Ajuste solicitado', reprovado: 'Reprovado'
                    }
                    return (
                      <div className="relative rounded-xl border p-3 pl-4 overflow-hidden" style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
                        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: approvalHex[artStatus] }} />
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-[10px] font-bold text-[var(--sm-text-3)] uppercase tracking-wide">
                            Arte{carouselSlides ? ` · Carrossel (${carouselSlides.length} slides)` : ''}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: approvalHex[artStatus] }} />
                            <span className="text-[11.5px] font-semibold text-[var(--sm-text-1)]">
                              {approvalLabel[artStatus]}
                            </span>
                          </div>
                        </div>

                        {/* Carrossel: mostra por slide */}
                        {carouselSlides ? (
                          <div className="mt-2 space-y-1.5">
                            {carouselSlides.map(s => (
                              <div key={s.slide} className="flex flex-col gap-1 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--sm-bg-card)' }}>
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${slideDot[s.status] ?? 'bg-gray-500'}`} />
                                  <span className="text-[10px] font-semibold text-[var(--sm-text-3)]">Slide {s.slide}</span>
                                  <span className={`text-[10px] font-semibold ml-auto ${slideText[s.status] ?? 'text-[var(--sm-text-3)]'}`}>
                                    {slideLabel[s.status] ?? s.status}
                                  </span>
                                </div>
                                {s.feedback && (
                                  <p className="text-[11px] text-[var(--sm-text-2)] leading-relaxed pl-3 break-words">"{s.feedback}"</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : artFeedbackRaw && artStatus !== 'aprovado' && artStatus !== 'pendente_aprovacao' ? (
                          /* Feedback texto simples (legado) */
                          <div className="mt-2 flex items-start gap-2 rounded-lg px-2.5 py-2" style={{ background: 'var(--sm-bg-card)' }}>
                            <span className="text-[10px] text-[var(--sm-text-4)] flex-shrink-0 mt-0.5">Cliente:</span>
                            <p className="text-xs text-[var(--sm-text-2)] leading-relaxed break-words select-text flex-1">"{artFeedbackRaw}"</p>
                          </div>
                        ) : null}

                        {(artStatus === 'ajuste_solicitado' || artStatus === 'reprovado') && (
                          <button
                            onClick={async () => {
                              try {
                                const newCopyStatus = (item as any).copy_approval_status as ApprovalStatus | null
                                const newOverall = computeOverallApproval('ajuste_realizado', newCopyStatus)
                                await updateItem.mutateAsync({
                                  id: item.id,
                                  art_approval_status: 'ajuste_realizado',
                                  approval_status: newOverall,
                                } as any)
                                toast('Ajuste de Arte marcado como realizado.', 'success')
                              } catch (err: any) { toast(err.message, 'error') }
                            }}
                            disabled={updateItem.isPending}
                            className={`mt-2.5 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 border-[#2563EB]/40 text-[#2563EB] hover:bg-[#2563EB]/10`}
                          >
                            {updateItem.isPending
                              ? <span className="w-3 h-3 border-2 border-[#60A5FA] border-t-transparent rounded-full animate-spin" />
                              : <Check className="w-3 h-3" />}
                            Marcar ajuste de Arte como realizado
                          </button>
                        )}
                      </div>
                    )
                  })()}

                  {/* ── Copy ── */}
                  {(item as any).copy_approval_status && (() => {
                    const copyStatus = (item as any).copy_approval_status as ApprovalStatus
                    const copyFeedback = (item as any).copy_feedback as string | null
                    const bgMap: Record<ApprovalStatus, string> = {
                      pendente_aprovacao: 'border-yellow-500/25 bg-yellow-500/10',
                      aprovado:           'border-green-500/25 bg-green-500/10',
                      ajuste_solicitado:  'border-orange-500/25 bg-orange-500/10',
                      ajuste_realizado:   'border-[#2563EB]/30 bg-[#2563EB]/10',
                      reprovado:          'border-red-500/25 bg-red-500/10',
                    }
                    return (
                      <div className="relative rounded-xl border p-3 pl-4 overflow-hidden" style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
                        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: approvalHex[copyStatus] }} />
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-[10px] font-bold text-[var(--sm-text-3)] uppercase tracking-wide">Copy</p>
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: approvalHex[copyStatus] }} />
                            <span className="text-[11.5px] font-semibold text-[var(--sm-text-1)]">
                              {approvalLabel[copyStatus]}
                            </span>
                          </div>
                        </div>
                        {copyFeedback && copyStatus !== 'aprovado' && copyStatus !== 'pendente_aprovacao' && (
                          <div className="mt-2 flex items-start gap-2 rounded-lg px-2.5 py-2" style={{ background: 'var(--sm-bg-card)' }}>
                            <span className="text-[10px] text-[var(--sm-text-4)] flex-shrink-0 mt-0.5">Cliente:</span>
                            <p className="text-xs text-[var(--sm-text-2)] leading-relaxed break-words select-text flex-1">"{copyFeedback}"</p>
                          </div>
                        )}
                        {(copyStatus === 'ajuste_solicitado' || copyStatus === 'reprovado') && (
                          <button
                            onClick={async () => {
                              try {
                                const newArtStatus = (item as any).art_approval_status as ApprovalStatus | null
                                const newOverall = computeOverallApproval(newArtStatus, 'ajuste_realizado')
                                await updateItem.mutateAsync({
                                  id: item.id,
                                  copy_approval_status: 'ajuste_realizado',
                                  approval_status: newOverall,
                                } as any)
                                toast('Ajuste de Copy marcado como realizado.', 'success')
                              } catch (err: any) { toast(err.message, 'error') }
                            }}
                            disabled={updateItem.isPending}
                            className={`mt-2.5 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 border-[#2563EB]/40 text-[#2563EB] hover:bg-[#2563EB]/10`}
                          >
                            {updateItem.isPending
                              ? <span className="w-3 h-3 border-2 border-[#60A5FA] border-t-transparent rounded-full animate-spin" />
                              : <Check className="w-3 h-3" />}
                            Marcar ajuste de Copy como realizado
                          </button>
                        )}
                      </div>
                    )
                  })()}

                  {/* Fallback legado: feedback geral quando não há campos parciais */}
                  {!(item as any).art_approval_status && !(item as any).copy_approval_status && item.client_feedback && (
                    <p className="text-xs text-[var(--sm-text-2)] leading-relaxed bg-[var(--sm-bg-alt)] border border-[var(--sm-border)] rounded-lg px-3 py-2 break-words">
                      "{item.client_feedback}"
                    </p>
                  )}

                  {/* Botão legado "Ajuste realizado" — só quando não usa campos parciais */}
                  {!(item as any).art_approval_status && !(item as any).copy_approval_status &&
                    (localApprovalStatus ?? item.approval_status) === 'ajuste_solicitado' && (
                    <button onClick={handleMarkAdjustmentDone} disabled={updateItem.isPending}
                      className={`flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 border-[#2563EB]/40 text-[#2563EB] hover:bg-[#2563EB]/10`}>
                      {updateItem.isPending
                        ? <span className="w-3 h-3 border-2 border-[#60A5FA] border-t-transparent rounded-full animate-spin" />
                        : <Check className="w-3 h-3" />}
                      Ajuste realizado
                    </button>
                  )}
                </div>
              )}

              {/* Agendar no Instagram */}
              <div>
                <p className="text-[10px] text-[var(--sm-text-4)] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                  <Instagram className="w-3 h-3" /> Agendar no Instagram
                </p>
                <InstagramScheduleSection item={item} userId={userId} />
              </div>

              {/* Comentários */}
              <div className="pb-2">
                <p className="text-[10px] text-[var(--sm-text-4)] uppercase tracking-wider font-semibold mb-2">Comentários</p>
                <PlannerCommentsThread plannerId={item.id} role="agency" />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Day Item Card — card clicável na lista do dia ────────────────────────────

function DayItemCard({
  item,
  onView,
  onEdit,
  onDelete,
  onSend,
}: {
  item: PlannerItem
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onSend: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const imageThumbnail = item.attachments?.find(a => isImageAttachment(a))
  const videoThumbnail = item.attachments?.find(a => isVideoAttachment(a))

  const { isDark } = useTheme()

  return (
    <div
      className="rounded-xl overflow-hidden w-full max-w-full min-w-0"
      style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}
    >
      {/* Área clicável para visualização */}
      <div
        onClick={onView}
        className="flex items-start gap-3 p-3 cursor-pointer transition-colors group/view min-w-0 w-full max-w-full"
        style={{ ['--tw-hover-bg' as string]: 'var(--sm-bg-input)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--sm-bg-input)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {imageThumbnail && (
          <img src={imageThumbnail.file_url} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
        )}
        {!imageThumbnail && videoThumbnail && (
          <div className="w-14 h-14 rounded-lg flex-shrink-0 bg-black overflow-hidden">
            <video
              src={videoThumbnail.file_url}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusHex[item.status as PlannerStatus] }} />
            <p className="font-semibold text-[13.5px] break-words" style={{ color: 'var(--sm-text-1)' }}>{item.title}</p>
          </div>
          <div className="flex items-center gap-2 ml-3.5 mb-1">
            <p className="text-xs" style={{ color: 'var(--sm-text-3)' }}>
              {contentTypeLabels[item.content_type as ContentType]} · {statusLabels[item.status as PlannerStatus]}
            </p>
            {item.sent_to_client
              ? <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--sm-text-2)' }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22C55E' }} />Enviado ao cliente</span>
              : <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--sm-text-3)' }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--sm-border-alt)' }} />Rascunho</span>
            }
          </div>
          {item.client && (
            <div className="flex items-center gap-1 ml-3.5 mb-1">
              <Building2 className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--sm-text-3)' }} />
              <span className="text-xs truncate" style={{ color: 'var(--sm-text-3)' }}>{item.client.company_name}</span>
            </div>
          )}
          {item.notes && (
            <p className="text-xs line-clamp-2 ml-3.5 mb-1" style={{ color: 'var(--sm-text-3)' }}>{item.notes}</p>
          )}
          {(() => {
            const artPartial  = (item as any).art_approval_status  as ApprovalStatus | null
            const copyPartial = (item as any).copy_approval_status as ApprovalStatus | null
            // Só exibe o badge de aprovação se o item foi enviado ao cliente ou já
            // tem um status de aprovação real — rascunhos não precisam disso.
            const hasApprovalContext = item.sent_to_client || item.approval_status || artPartial || copyPartial
              || item.status === 'aprovado' || item.status === 'publicado'
            if (!hasApprovalContext) return null
            const as_: ApprovalStatus = (() => {
              if (artPartial || copyPartial) return computeOverallApproval(artPartial, copyPartial)
              if (item.approval_status) return item.approval_status as ApprovalStatus
              if (item.status === 'aprovado' || item.status === 'publicado') return 'aprovado'
              return 'pendente_aprovacao'
            })()
            return (
              <div className="flex items-center gap-1.5 ml-3.5 mb-1">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: approvalHex[as_] }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--sm-text-2)' }}>
                  {approvalLabel[as_]}
                </span>
              </div>
            )
          })()}
          <div className="flex items-center gap-3 ml-3.5 mt-1">
            {item.attachments && item.attachments.length > 0 && (
              <div className="flex items-center gap-1">
                <Paperclip className="w-3 h-3" style={{ color: 'var(--sm-text-3)' }} />
                <span className="text-[11px]" style={{ color: 'var(--sm-text-3)' }}>
                  {item.attachments.length} {item.attachments.length === 1 ? 'anexo' : 'anexos'}
                </span>
              </div>
            )}
            {item.links && item.links.length > 0 && (
              <div className="flex items-center gap-1">
                <Link2 className={`w-3 h-3 text-[#2563EB]`} />
                <span className={`text-[11px] text-[#2563EB]`}>
                  {item.links.length} {item.links.length === 1 ? 'link' : 'links'}
                </span>
              </div>
            )}
          </div>
        </div>
        {/* Seta indicando que é clicável */}
        <ChevronRightIcon className="w-4 h-4 group-hover/view:opacity-100 opacity-50 transition-opacity flex-shrink-0 mt-0.5" style={{ color: 'var(--sm-text-2)' }} />
      </div>

      {/* Ações separadas da área de visualização */}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--sm-border)' }}>
          <span className="text-xs flex-1" style={{ color: 'var(--sm-text-3)' }}>Confirmar exclusão?</span>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-400"
            onClick={() => { setConfirming(false); onDelete() }}
          >
            Excluir
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2 px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--sm-border)' }}>
          <Button
            size="sm"
            variant="ghost"
            className="hover:text-red-500"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
          </Button>
          {!item.sent_to_client && item.client_id && (
            <Button
              size="sm"
              variant="premium"
              onClick={e => { e.stopPropagation(); onSend() }}
              className="text-[11px]"
            >
              <Send className="w-3.5 h-3.5 mr-1" /> Enviar ao cliente
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Drag & Drop primitives ───────────────────────────────────────────────────

function getChipStyle(item: PlannerItem, isDark: boolean): { bg: string; border: string; text: string } {
  const s     = item.status as PlannerStatus
  const artP  = (item as any).art_approval_status  as ApprovalStatus | null
  const copyP = (item as any).copy_approval_status as ApprovalStatus | null
  const as_: ApprovalStatus = (() => {
    if (artP || copyP) return computeOverallApproval(artP, copyP)
    if (item.approval_status) return item.approval_status as ApprovalStatus
    if (s === 'aprovado' || s === 'publicado') return 'aprovado'
    return 'pendente_aprovacao'
  })()

  if (isDark) {
    if (!item.sent_to_client)         return { bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.30)', text: '#cbd5e1' }
    if (s === 'publicado')            return { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.30)',  text: '#86efac' }
    if (as_ === 'aprovado')           return { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.30)',  text: '#86efac' }
    if (as_ === 'reprovado')          return { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.30)',  text: '#fca5a5' }
    if (as_ === 'ajuste_solicitado')  return { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.30)', text: '#fcd34d' }
    if (as_ === 'ajuste_realizado')   return { bg: 'rgba(37,99,235,0.14)',  border: 'rgba(37,99,235,0.35)',  text: '#93c5fd' }
    return { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.30)', text: '#fde047' }
  }

  // Light mode — texto escuro para contraste sobre fundo claro
  if (!item.sent_to_client)         return { bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.28)', text: '#374151' }
  if (s === 'publicado')            return { bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.35)',   text: '#14532d' }
  if (as_ === 'aprovado')           return { bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.35)',   text: '#14532d' }
  if (as_ === 'reprovado')          return { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.30)',   text: '#7f1d1d' }
  if (as_ === 'ajuste_solicitado')  return { bg: 'rgba(245,158,11,0.14)',  border: 'rgba(245,158,11,0.32)',  text: '#78350f' }
  if (as_ === 'ajuste_realizado')   return { bg: 'rgba(37,99,235,0.12)',   border: 'rgba(37,99,235,0.30)',   text: '#1e3a8a' }
  return { bg: 'rgba(234,179,8,0.14)', border: 'rgba(234,179,8,0.32)', text: '#713f12' }
}

function DayPreviewChip({
  item, disabled, onItemClick,
}: { item: PlannerItem; disabled: boolean; onItemClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled })
  const typeLabel = contentTypeLabels[item.content_type as ContentType] ?? item.content_type ?? ''
  const clientName = (item as any).client?.company_name as string | undefined

  // Fundo neutro e uma barra lateral com a cor do status: o calendário fica
  // calmo e a cor ainda diz o estado de cada post de relance.
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={e => { e.stopPropagation(); onItemClick() }}
      style={{ touchAction: 'none', borderLeftColor: planColor(item) }}
      className={`w-full rounded-md border-l-[3px] bg-[var(--sm-bg-alt)] pl-1.5 pr-1 py-1 min-w-0 transition-all select-none
        ${isDragging ? 'opacity-0' : 'hover:bg-[var(--sm-bg-input)] hover:translate-x-0.5'}
        ${disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
      title={`${item.title}${clientName ? ' · ' + clientName : ''}`}
    >
      <p className="text-[11.5px] font-medium leading-tight truncate text-[var(--sm-text-1)]">{item.title}</p>
      <p className="text-[10px] leading-tight truncate text-[var(--sm-text-3)] mt-0.5">
        {typeLabel}{clientName ? ` · ${clientName}` : ''}
      </p>
    </div>
  )
}

function DroppableDay({
  day, isCurrentMonth, isCurrentDay, hasItems, dragging,
  onDayClick, onMouseEnter, onMouseLeave, children,
}: {
  day: Date
  isCurrentMonth: boolean
  isCurrentDay: boolean
  hasItems: boolean
  dragging: boolean
  onDayClick: () => void
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => void
  onMouseLeave: () => void
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${format(day, 'yyyy-MM-dd')}`,
    disabled: !isCurrentMonth,
  })
  return (
    <div
      ref={setNodeRef}
      onClick={() => isCurrentMonth && !dragging && onDayClick()}
      onMouseEnter={e => isCurrentMonth && !dragging && onMouseEnter(e)}
      onMouseLeave={() => !dragging && onMouseLeave()}
      className={`
        min-h-[64px] sm:min-h-[112px] overflow-hidden p-1 sm:p-2 rounded-lg border transition-colors
        ${isCurrentMonth
          ? `cursor-pointer ${isOver
              ? 'border-[#2563EB]/60 bg-[#2563EB]/10'
              : 'border-[var(--sm-border)] bg-[var(--sm-bg-card)] hover:border-[var(--sm-text-4)]'}`
          : 'border-transparent opacity-35 cursor-default'}
        ${isCurrentDay && !isOver ? '!border-[#2563EB] ring-1 ring-[#2563EB]/40' : ''}
        ${hasItems && isCurrentMonth && !isOver ? '' : ''}
      `}
    >
      {children}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Planner() {
  const { user, agencyId } = useAuth()
  const qc = useQueryClient()
  const { isDark } = useTheme()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Modal de criação/edição
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    content_type: 'post',
    status: 'ideia' as PlannerStatus,
    notes: '',
    client_id: null as string | null,
    scheduled_date: format(new Date(), 'yyyy-MM-dd'),
    scheduled_time: '',
    ig_post_type: null as 'IMAGE' | 'CAROUSEL_ALBUM' | 'REELS' | null,
  })
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [linkInput, setLinkInput] = useState('')
  const [pendingLinks, setPendingLinks] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)

  // Mídia Instagram (separada dos outros anexos)
  const [igFiles, setIgFiles]         = useState<File[]>([])
  const [igPreviews, setIgPreviews]   = useState<string[]>([])
  const [igDragOver, setIgDragOver]   = useState<number | null>(null)
  const igDragIdx  = useRef<number | null>(null)
  const igFileRef  = useRef<HTMLInputElement>(null)
  const [existingIgMedia, setExistingIgMedia] = useState<PlannerAttachment[]>([])
  const [igMediaToDelete, setIgMediaToDelete] = useState<PlannerAttachment[]>([])

  // IG drag handlers — reordenação ao vivo (funciona em todas as direções)
  const igOnDragStart = useCallback((i: number) => {
    igDragIdx.current = i
    setIgDragOver(i)
  }, [])
  const igOnDragEnter = useCallback((i: number) => {
    const from = igDragIdx.current
    if (from === null || from === i) { setIgDragOver(i); return }
    const reorder = <T,>(arr: T[]) => {
      const next = [...arr]; const [item] = next.splice(from, 1); next.splice(i, 0, item); return next
    }
    setIgFiles(reorder); setIgPreviews(reorder)
    igDragIdx.current = i           // o item arrastado agora está nesta posição
    setIgDragOver(i)
  }, [])
  const igOnDragEnd   = useCallback(() => { setIgDragOver(null); igDragIdx.current = null }, [])
  const igOnDrop      = useCallback(() => { setIgDragOver(null); igDragIdx.current = null }, [])

  // Reordenação das mídias JÁ SALVAS (modo edição) — também ao vivo
  const [exIgDragOver, setExIgDragOver] = useState<number | null>(null)
  const exIgDragIdx = useRef<number | null>(null)
  const exIgOnDragStart = useCallback((i: number) => { exIgDragIdx.current = i; setExIgDragOver(i) }, [])
  const exIgOnDragEnter = useCallback((i: number) => {
    const from = exIgDragIdx.current
    if (from === null || from === i) { setExIgDragOver(i); return }
    setExistingIgMedia(prev => {
      const next = [...prev]; const [m] = next.splice(from, 1); next.splice(i, 0, m); return next
    })
    exIgDragIdx.current = i
    setExIgDragOver(i)
  }, [])
  const exIgOnDragEnd = useCallback(() => { setExIgDragOver(null); exIgDragIdx.current = null }, [])

  // Arrastar (drag and drop do HTML) não funciona com o dedo: no celular a
  // ordem do carrossel muda pelas setas de cada miniatura.
  const swap = <T,>(arr: T[], i: number, j: number) => {
    if (j < 0 || j >= arr.length) return arr
    const next = [...arr]; [next[i], next[j]] = [next[j], next[i]]; return next
  }
  const moveExistingIg = (i: number, dir: -1 | 1) => setExistingIgMedia(prev => swap(prev, i, i + dir))
  const moveNewIg = (i: number, dir: -1 | 1) => {
    setIgFiles(prev => swap(prev, i, i + dir))
    setIgPreviews(prev => swap(prev, i, i + dir))
  }

  const handleIgFiles = (list: FileList | null) => {
    if (!list || !form.ig_post_type) return
    const max    = form.ig_post_type === 'CAROUSEL_ALBUM' ? 10 : 1
    const accept = form.ig_post_type === 'REELS' ? 'video/' : 'image/'
    const arr    = Array.from(list).filter(f => f.type.startsWith(accept)).slice(0, max)
    const urls   = arr.map(f => URL.createObjectURL(f))
    setIgFiles(prev  => form.ig_post_type === 'CAROUSEL_ALBUM' ? [...prev, ...arr].slice(0, max) : arr)
    setIgPreviews(prev => form.ig_post_type === 'CAROUSEL_ALBUM' ? [...prev, ...urls].slice(0, max) : urls)
  }

  const removeIgFile = (i: number) => {
    setIgFiles(p    => p.filter((_, idx) => idx !== i))
    setIgPreviews(p => p.filter((_, idx) => idx !== i))
  }

  const removeExistingIgMedia = (att: PlannerAttachment) => {
    setExistingIgMedia(p => p.filter(a => a.id !== att.id))
    setIgMediaToDelete(p => [...p, att])
  }

  // Modo edição
  const [editingItem, setEditingItem] = useState<PlannerItem | null>(null)
  const [existingAttachments, setExistingAttachments] = useState<PlannerAttachment[]>([])
  const [existingLinks, setExistingLinks] = useState<PlannerLink[]>([])
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<PlannerAttachment[]>([])
  const [linksToDelete, setLinksToDelete] = useState<PlannerLink[]>([])

  // Modal de detalhes do dia
  const [dayDetailsOpen, setDayDetailsOpen] = useState(false)
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null)

  // ── NOVO: visualização completa do evento ──────────────────────────────────
  const [selectedPlannerItem, setSelectedPlannerItem] = useState<PlannerItem | null>(null)
  const [itemViewOpen, setItemViewOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const autoOpenProcessed = useRef(false)

  // Arsenal: picker de conteúdo
  const [pickerOpen, setPickerOpen] = useState(false)
  const [linkedAsset, setLinkedAsset] = useState<ContentAsset | null>(null)

  // Modo de visualização
  const [viewMode, setViewMode] = useState<'mensal' | 'feed'>('mensal')

  // Filtro por cliente
  const [selectedClientFilter, setSelectedClientFilter] = useState<string | null>(null)

  // Filtro por status de aprovação
  const [selectedApprovalFilter, setSelectedApprovalFilter] = useState<ApprovalStatus | 'todos' | 'rascunho'>('todos')

  // Dropdowns de filtro
  const [clientDropOpen, setClientDropOpen]   = useState(false)
  const [statusDropOpen, setStatusDropOpen]   = useState(false)

  // WhatsApp — notificador manual
  const [waDropOpen,  setWaDropOpen]  = useState(false)
  const [waClientIds, setWaClientIds] = useState<string[]>([])
  const [waType,      setWaType]      = useState<'NEW_CONTENT' | 'APPROVAL_REQUEST' | 'ADJUSTMENT_DONE'>('NEW_CONTENT')
  const [waSending,   setWaSending]   = useState(false)
  const [waGroupJids, setWaGroupJids] = useState<string[]>([])
  const { data: waGroups = [] } = useWhatsappGroups()

  // Hover tooltip
  const [hover, setHover] = useState<HoverState | null>(null)

  // Drag and drop
  const [draggingItem, setDraggingItem] = useState<PlannerItem | null>(null)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const { data: items } = usePlanner()
  const { data: clients } = useClients()

  // Sempre usa a versão mais recente do item do cache React Query.
  // Resolve o problema de selectedPlannerItem ficar stale após save/invalidação.
  const liveSelectedItem = useMemo(
    () => selectedPlannerItem
      ? ((items || []).find(i => i.id === selectedPlannerItem.id) ?? selectedPlannerItem)
      : null,
    [selectedPlannerItem, items]
  )

  // Auto-abrir item via query param ?item=UUID (vindo de notificação)
  useEffect(() => {
    const itemId = searchParams.get('item')
    if (!itemId || !items?.length || autoOpenProcessed.current) return
    const found = items.find(i => i.id === itemId)
    if (found) {
      autoOpenProcessed.current = true
      setSelectedPlannerItem(found)
      setItemViewOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, items])

  // Navegar para mês específico via ?month=YYYY-MM (vindo da exportação da IA)
  useEffect(() => {
    const monthParam = searchParams.get('month')
    if (!monthParam) return
    const [y, m] = monthParam.split('-').map(Number)
    if (y && m >= 1 && m <= 12) setCurrentMonth(new Date(y, m - 1, 1))
    setSearchParams({}, { replace: true })
  }, [searchParams])
  const createItem = useCreatePlannerItem()
  const updateItem = useUpdatePlannerItem()
  const deleteItem = useDeletePlannerItem()
  const { toast } = useToast()

  const openWaDrop = () => {
    // Nada vem pré-selecionado — evita enviar sem querer pra cliente/grupo errado
    setWaClientIds([])
    setWaGroupJids([])
    setWaDropOpen(true)
  }

  const toggleWaGroup = (jid: string) => {
    setWaGroupJids(prev => prev.includes(jid) ? prev.filter(j => j !== jid) : [...prev, jid])
  }

  const toggleWaClient = (id: string) => {
    setWaClientIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const sendWhatsApp = async () => {
    if (waClientIds.length === 0 && waGroupJids.length === 0) return
    setWaSending(true)
    try {
      // Notifica cada cliente selecionado (grupos vão numa chamada separada, pra não duplicar)
      for (const clientId of waClientIds) {
        const { data, error } = await supabase.functions.invoke('notify-whatsapp', {
          body: { mode: 'manual_client', client_id: clientId, type: waType },
        })
        // Propaga o erro original: o motivo real vem no corpo da resposta, que
        // o supabase-js guarda em error.context. Reembrulhar em new Error aqui
        // descartaria esse corpo e sobraria só "non-2xx status code".
        if (error) throw error
        if (data?.error) throw new Error(data.error)
      }
      // Notifica os grupos selecionados uma única vez
      if (waGroupJids.length > 0) {
        const { data, error } = await supabase.functions.invoke('notify-whatsapp', {
          body: { mode: 'manual_groups', type: waType, group_jids: waGroupJids },
        })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
      }
      toast('Mensagem enviada via WhatsApp!', 'success')
      setWaDropOpen(false)
      setWaClientIds([])
    } catch (err: any) {
      toast(await edgeErrorMessage(err, 'Erro ao enviar.'), 'error')
    } finally {
      setWaSending(false)
    }
  }

  // ── Auto-agendamento Instagram ─────────────────────────────────────────────
  // MOVIDO PARA TRIGGER NO BANCO (migration 041_auto_schedule_instagram_trigger.sql)
  // O agendamento agora ocorre automaticamente no servidor quando o cliente aprova,
  // independente de quem está com o sistema aberto.
  // Este efeito apenas exibe um toast informativo quando detecta um item recém-agendado.
  const notifiedScheduled = useRef(new Set<string>())

  useEffect(() => {
    if (!items) return
    items.forEach(item => {
      if (item.ig_scheduled && !notifiedScheduled.current.has(item.id)) {
        // Só notifica se o item foi aprovado recentemente (reviewed_at nas últimas 2 minutos)
        if (item.reviewed_at) {
          const reviewedAt = new Date(item.reviewed_at).getTime()
          const twoMinutesAgo = Date.now() - 2 * 60 * 1000
          if (reviewedAt > twoMinutesAgo) {
            notifiedScheduled.current.add(item.id)
            toast(`"${item.title}" agendado no Instagram! 🚀`, 'success')
          } else {
            notifiedScheduled.current.add(item.id) // marca sem notificar
          }
        }
      }
    })
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Calendar calculations ──────────────────────────────────────────────────

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { locale: ptBR })
  const calendarEnd = endOfWeek(monthEnd, { locale: ptBR })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const filteredItems = (selectedClientFilter
    ? (items || []).filter(i => i.client_id === selectedClientFilter)
    : (items || [])
  ).filter(i => selectedApprovalFilter === 'todos' || planKey(i) === selectedApprovalFilter)

  const getItemsForDay = (day: Date) =>
    filteredItems.filter(item => isSameDay(parseISO(item.scheduled_date), day))

  // ── Form helpers ───────────────────────────────────────────────────────────

  const set = (field: string, value: unknown) => setForm(p => ({ ...p, [field]: value }))

  const resetForm = () => {
    setForm({
      title: '', content_type: 'post', status: 'ideia',
      notes: '', client_id: null,
      scheduled_date: format(new Date(), 'yyyy-MM-dd'),
      scheduled_time: '',
      ig_post_type: null,
    })
    setPendingFiles([])
    setPendingLinks([])
    setLinkInput('')
    setEditingItem(null)
    setExistingAttachments([])
    setExistingLinks([])
    setAttachmentsToDelete([])
    setLinksToDelete([])
    setLinkedAsset(null)
    setIgFiles([])
    setIgPreviews([])
    setExistingIgMedia([])
    setIgMediaToDelete([])
  }

  const FILE_SIZE_LIMIT = 50 * 1024 * 1024 // 50MB — limite do Supabase free tier

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const ok: File[] = []
    const big: string[] = []

    for (const f of files) {
      if (f.size > FILE_SIZE_LIMIT) {
        big.push(`${f.name} (${formatFileSize(f.size)})`)
      } else {
        ok.push(f)
      }
    }

    if (big.length > 0) {
      toast(
        `Arquivo(s) acima de 50MB não suportados: ${big.join(', ')}. Comprima o vídeo antes de enviar.`,
        'error'
      )
    }
    if (ok.length > 0) setPendingFiles(prev => [...prev, ...ok])
    e.target.value = ''
  }

  const addLink = () => {
    const url = linkInput.trim()
    if (!url) return
    setPendingLinks(prev => [...prev, url])
    setLinkInput('')
  }

  // ── Drag and drop handlers ─────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const item = (items || []).find(i => i.id === event.active.id)
    if (item) { setDraggingItem(item); setHover(null) }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggingItem(null)
    const { active, over } = event
    if (!over || !active) return
    const newDate = over.id as string          // "day-YYYY-MM-DD"
    if (!newDate.startsWith('day-')) return
    const dateStr = newDate.replace('day-', '')
    const item = (items || []).find(i => i.id === active.id)
    if (!item || item.scheduled_date === dateStr) return
    try {
      await updateItem.mutateAsync({ id: item.id, scheduled_date: dateStr })
      toast('Post movido para ' + format(new Date(dateStr + 'T00:00:00'), "dd/MM", { locale: ptBR }), 'success')
    } catch {
      toast('Erro ao mover post. Tente novamente.', 'error')
    }
  }

  // ── Click: dia vazio → criar | dia com itens → detalhes ───────────────────

  const handleDayClick = (day: Date, dayItems: PlannerItem[]) => {
    setHover(null)
    if (dayItems.length === 0) {
      resetForm()
      setForm(prev => ({
        ...prev,
        scheduled_date: format(day, 'yyyy-MM-dd'),
        client_id: selectedClientFilter ?? null,
      }))
      setOpen(true)
    } else {
      setSelectedDayDate(day)
      setDayDetailsOpen(true)
    }
  }

  // ── Abrir visualização completa do evento ──────────────────────────────────

  const openItemView = (item: PlannerItem) => {
    setSelectedPlannerItem(item)
    setItemViewOpen(true)
  }

  const closeItemView = () => {
    setItemViewOpen(false)
    setSelectedPlannerItem(null)
  }

  // ── Abrir modo edição ──────────────────────────────────────────────────────

  const openEdit = (item: PlannerItem) => {
    setDayDetailsOpen(false)
    setItemViewOpen(false)
    setSelectedPlannerItem(null)
    setEditingItem(item)
    const allAtts    = item.attachments || []
    const igPostType = (item.ig_post_type as any) ?? null
    // Mídias marcadas explicitamente como IG
    const igExplicit = allAtts.filter(a => a.is_ig_media).sort((a,b) => a.sort_order - b.sort_order)
    // Fallback: se ig_post_type configurado mas sem is_ig_media, usa imagens/vídeos regulares
    const igFallback = igPostType && igExplicit.length === 0
      ? allAtts.filter(a => isImageAttachment(a) || isVideoAttachment(a))
      : []
    const igMedia    = igExplicit.length > 0 ? igExplicit : igFallback
    const igIds      = new Set(igMedia.map(a => a.id))
    const otherAtts  = allAtts.filter(a => !igIds.has(a.id))
    setForm({
      title: item.title,
      content_type: item.content_type,
      status: item.status,
      notes: item.notes || '',
      client_id: item.client_id,
      scheduled_date: item.scheduled_date,
      scheduled_time: item.scheduled_time || '',
      ig_post_type: igPostType,
    })
    setExistingIgMedia(igMedia)
    setIgFiles([])
    setIgPreviews([])
    setIgMediaToDelete([])
    setExistingAttachments(otherAtts)
    setExistingLinks(item.links || [])
    setPendingFiles([])
    setPendingLinks([])
    setLinkInput('')
    setAttachmentsToDelete([])
    setLinksToDelete([])
    setOpen(true)
  }

  // ── Marcar para remoção (aplicado só no save) ──────────────────────────────

  const markAttachmentForDeletion = (att: PlannerAttachment) => {
    setExistingAttachments(prev => prev.filter(a => a.id !== att.id))
    setAttachmentsToDelete(prev => [...prev, att])
  }

  const markLinkForDeletion = (link: PlannerLink) => {
    setExistingLinks(prev => prev.filter(l => l.id !== link.id))
    setLinksToDelete(prev => [...prev, link])
  }

  // ── Salvar: cria ou atualiza ───────────────────────────────────────────────

  // Liga o arquivo enviado ao post. Se falhar, avisa: antes o post aparecia
  // salvo sem a mídia e sem explicação nenhuma.
  const insertAttachment = async (row: Record<string, unknown>) => {
    const { error } = await (supabase as any).from('planner_attachments').insert(row)
    if (error) toast(`O arquivo "${row.file_name}" subiu, mas não consegui ligar ao post: ${error.message}`, 'error')
  }

  const handleSave = async (sendToClient: boolean = false) => {
    if (!form.title.trim() || !user) return

    // FIX: captura qualquer URL digitada mas não adicionada com o botão "+"
    // Evita que o usuário perca o link ao clicar em Salvar sem clicar em Adicionar
    const allLinks = [...pendingLinks]
    const rawInput = linkInput.trim()
    if (rawInput && !allLinks.includes(rawInput)) {
      allLinks.push(rawInput)
    }

    setIsUploading(true)
    try {
      if (editingItem) {
        await updateItem.mutateAsync({
          id: editingItem.id,
          title: form.title,
          content_type: form.content_type as ContentType,
          status: form.status,
          notes: form.notes || null,
          client_id: form.client_id,
          scheduled_date: form.scheduled_date,
          scheduled_time: form.scheduled_time || null,
          ig_post_type: form.ig_post_type,
          sent_to_client: sendToClient ? true : (editingItem?.sent_to_client ?? false),
          approval_status: sendToClient && form.status !== 'publicado' && form.client_id ? 'pendente_aprovacao' : (editingItem?.approval_status ?? null),
        })
        // Deletar mídias IG removidas
        for (const att of igMediaToDelete) {
          const path = extractStoragePath(att.file_url)
          if (path) await supabase.storage.from('planner-attachments').remove([path])
          await supabase.from('planner_attachments').delete().eq('id', att.id)
        }
        // Persiste a ordem (sort_order) de TODAS as mídias IG existentes pela posição
        // atual no array — assim a reordenação feita na edição é salva.
        // Também promove anexos de fallback para is_ig_media = true.
        for (let i = 0; i < existingIgMedia.length; i++) {
          await (supabase as any).from('planner_attachments')
            .update({ is_ig_media: true, sort_order: i })
            .eq('id', existingIgMedia[i].id)
        }
        // Upload novas mídias IG
        const igStart = existingIgMedia.length
        if (igFiles.length > 0) {
          const totalIgBytes = igFiles.reduce((acc, f) => acc + f.size, 0)
          const { allowed, message } = await checkStorageLimit(totalIgBytes)
          if (!allowed) { toast(message ?? 'Limite de armazenamento atingido.', 'error'); return }
        }
        for (let fi = 0; fi < igFiles.length; fi++) {
          const file = igFiles[fi]
          const ext  = file.name.split('.').pop() || 'bin'
          const path = `${agencyId!}/${editingItem.id}/ig_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
          let publicUrl = ''
          try {
            ;({ url: publicUrl } = await uploadArquivo('planner-attachments', path, file))
          } catch (e) {
            toast(`Erro ao enviar "${file.name}": ${(e as Error).message}`, 'error'); continue
          }
          await insertAttachment({
            planner_id: editingItem.id, user_id: agencyId!,
            file_name: file.name, file_type: getMimeType(file),
            file_url: publicUrl, file_size: file.size,
            is_ig_media: true, sort_order: igStart + fi,
          })
        }
        for (const att of attachmentsToDelete) {
          const path = extractStoragePath(att.file_url)
          if (path) await supabase.storage.from('planner-attachments').remove([path])
          await supabase.from('planner_attachments').delete().eq('id', att.id)
        }
        if (linksToDelete.length > 0) {
          await supabase.from('planner_links').delete().in('id', linksToDelete.map(l => l.id))
        }
        if (pendingFiles.length > 0) {
          const totalBytes = pendingFiles.reduce((acc, f) => acc + f.size, 0)
          const { allowed, message } = await checkStorageLimit(totalBytes)
          if (!allowed) { toast(message ?? 'Limite de armazenamento atingido.', 'error'); return }
        }
        for (let fi = 0; fi < pendingFiles.length; fi++) {
          const file = pendingFiles[fi]
          setUploadProgress({ current: fi + 1, total: pendingFiles.length })
          const ext = file.name.split('.').pop() || 'bin'
          const path = `${agencyId!}/${editingItem.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
          let publicUrl = ''
          try {
            ;({ url: publicUrl } = await uploadArquivo('planner-attachments', path, file))
          } catch (e) {
            toast(`Erro ao enviar "${file.name}": ${(e as Error).message}`, 'error')
            continue
          }
          await insertAttachment({
            planner_id: editingItem.id, user_id: agencyId!,
            file_name: file.name, file_type: getMimeType(file),
            file_url: publicUrl, file_size: file.size,
          })
        }
        setUploadProgress(null)
        if (allLinks.length > 0) {
          await supabase.from('planner_links').insert(
            allLinks.map(url => ({ planner_id: editingItem.id, user_id: agencyId!, url, label: null }))
          )
        }
        toast(sendToClient ? 'Post enviado ao cliente!' : 'Post salvo!', 'success')
      } else {
        const created = await createItem.mutateAsync({
          user_id: agencyId!,
          title: form.title,
          content_type: form.content_type as ContentType,
          status: form.status,
          notes: form.notes || null,
          client_id: form.client_id,
          scheduled_date: form.scheduled_date,
          scheduled_time: form.scheduled_time || null,
          ig_post_type: form.ig_post_type,
          content_id: null,
          asset_id: linkedAsset?.id ?? null,
          sent_to_client: sendToClient,
          approval_status: sendToClient && form.status !== 'publicado' && form.client_id ? 'pendente_aprovacao' : null,
          client_feedback: null,
          reviewed_at: null,
          reviewed_by: null,
        })
        // Upload mídias Instagram
        if (igFiles.length > 0 || pendingFiles.length > 0) {
          const totalAllBytes = [...igFiles, ...pendingFiles].reduce((acc, f) => acc + f.size, 0)
          const { allowed, message } = await checkStorageLimit(totalAllBytes)
          if (!allowed) { toast(message ?? 'Limite de armazenamento atingido.', 'error'); return }
        }
        for (let fi = 0; fi < igFiles.length; fi++) {
          const file = igFiles[fi]
          const ext  = file.name.split('.').pop() || 'bin'
          const path = `${agencyId!}/${created.id}/ig_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
          let publicUrl = ''
          try {
            ;({ url: publicUrl } = await uploadArquivo('planner-attachments', path, file))
          } catch (e) {
            toast(`Erro ao enviar "${file.name}": ${(e as Error).message}`, 'error'); continue
          }
          await insertAttachment({
            planner_id: created.id, user_id: agencyId!,
            file_name: file.name, file_type: getMimeType(file),
            file_url: publicUrl, file_size: file.size,
            is_ig_media: true, sort_order: fi,
          })
        }
        // Vincular mídia do arsenal como anexo
        if (linkedAsset?.media_url) {
          const ext = linkedAsset.media_url.split('.').pop()?.split('?')[0] || 'file'
          await insertAttachment({
            planner_id: created.id,
            user_id: agencyId!,
            file_name: `${linkedAsset.title}.${ext}`,
            file_type: guessMediaType(linkedAsset.media_url),
            file_url: linkedAsset.media_url,
            file_size: null,
          })
        }
        for (let fi = 0; fi < pendingFiles.length; fi++) {
          const file = pendingFiles[fi]
          setUploadProgress({ current: fi + 1, total: pendingFiles.length })
          const ext = file.name.split('.').pop() || 'bin'
          const path = `${agencyId!}/${created.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
          let publicUrl = ''
          try {
            ;({ url: publicUrl } = await uploadArquivo('planner-attachments', path, file))
          } catch (e) {
            toast(`Erro ao enviar "${file.name}": ${(e as Error).message}`, 'error')
            continue
          }
          await insertAttachment({
            planner_id: created.id, user_id: agencyId!,
            file_name: file.name, file_type: getMimeType(file),
            file_url: publicUrl, file_size: file.size,
          })
        }
        setUploadProgress(null)
        if (allLinks.length > 0) {
          await supabase.from('planner_links').insert(
            allLinks.map(url => ({ planner_id: created.id, user_id: agencyId!, url, label: null }))
          )
        }
        toast(sendToClient ? 'Post enviado ao cliente!' : 'Post salvo internamente!', 'success')
      }

      // FIX: força refetch DEPOIS que todos os dados (incluindo links) foram salvos.
      // Sem isso, o onSuccess do mutation dispara um refetch prematuro (antes dos links
      // estarem no banco) e o modal pode abrir com dados incompletos.
      await qc.refetchQueries({ queryKey: ['planner'] })
      setOpen(false)
      resetForm()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setIsUploading(false)
    }
  }

  // ── Selecionar conteúdo do arsenal ────────────────────────────────────────

  const handleAssetSelect = (asset: ContentAsset) => {
    setLinkedAsset(asset)
    set('title', asset.title)
    set('content_type', asset.content_type)
    if (asset.caption) set('notes', asset.caption)
    if (asset.link_url) setPendingLinks(prev => {
      if (prev.includes(asset.link_url!)) return prev
      return [...prev, asset.link_url!]
    })
  }

  // ── Hover handler ──────────────────────────────────────────────────────────

  const handleDayMouseEnter = (e: React.MouseEvent<HTMLDivElement>, dayItems: PlannerItem[]) => {
    if (dayItems.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const tooltipWidth = 268
    const left = rect.right + 8 + tooltipWidth > window.innerWidth
      ? rect.left - tooltipWidth - 4
      : rect.right + 8
    const estimatedHeight = Math.min(dayItems.length * 130, 380)
    const top = Math.min(rect.top, window.innerHeight - estimatedHeight - 16)
    setHover({ items: dayItems, top, left })
  }

  // ─────────────────────────────────────────────────────────────────────────

  // Números do mês: respeitam o cliente escolhido, mas não o filtro de status
  // (senão, ao filtrar, os outros contadores zerariam).
  const monthItems = (items || []).filter(i =>
    (!selectedClientFilter || i.client_id === selectedClientFilter) &&
    isSameMonth(parseISO(i.scheduled_date), currentMonth))
  const monthCounts = PLAN_KEYS.map(k => ({ ...k, n: monthItems.filter(i => planKey(i) === k.key).length }))
  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
  const waitingCount = monthCounts.filter(c => c.key === 'pendente_aprovacao' || c.key === 'ajuste_realizado').reduce((s, c) => s + c.n, 0)
  const agendaItems = filteredItems
    .filter(i => isSameMonth(parseISO(i.scheduled_date), currentMonth))
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))

  return (
    <div className="min-h-full bg-[var(--sm-bg-page)]">
      <div className="p-4 md:p-6">
        {/* ── Cabeçalho ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 mb-5 min-h-[36px]">
          <div className="min-w-0">
            <h1 className="font-display text-[22px] sm:text-[26px] font-bold tracking-[-0.02em] leading-tight text-[var(--sm-text-1)]">
              Planejamento
            </h1>
            <p className="text-[12.5px] text-[var(--sm-text-3)] mt-0.5">
              {monthTitle} · {monthItems.length} {monthItems.length === 1 ? 'post' : 'posts'}
              {waitingCount > 0 && <> · <span className="text-[#CA8A04] font-medium">{waitingCount} com o cliente</span></>}
            </p>
          </div>
          <Button
            onClick={() => {
              resetForm()
              setForm(prev => ({
                ...prev,
                scheduled_date: format(new Date(), 'yyyy-MM-dd'),
                client_id: selectedClientFilter ?? null,
              }))
              setOpen(true)
            }}
            size="sm"
            className="bg-[#2563EB] !text-white !border-0 !shadow-none flex-shrink-0"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Novo post</span><span className="sm:hidden">Novo</span>
          </Button>
        </div>

        {/* ── Barra de ferramentas: visão, filtros e aviso ao cliente ─────────── */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-[var(--sm-bg-alt)] rounded-xl w-fit">
          <button
            onClick={() => setViewMode('mensal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
              viewMode === 'mensal'
                ? 'bg-[#2563EB] text-white shadow-sm'
                : 'text-[var(--sm-text-3)] hover:text-[var(--sm-text-1)]'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Calendário
          </button>
          <button
            onClick={() => setViewMode('feed')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
              viewMode === 'feed'
                ? 'bg-[#2563EB] text-white shadow-sm'
                : 'text-[var(--sm-text-3)] hover:text-[var(--sm-text-1)]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Feed
          </button>
        </div>

          {/* Seletor de cliente */}
          {(() => {
            const selectedClient = (clients || []).find(c => c.id === selectedClientFilter)
            return (
              <div className="relative">
                <button
                  onClick={() => { setClientDropOpen(o => !o); setStatusDropOpen(false) }}
                  className={`flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-xl text-[12px] font-medium border transition-all ${
                    selectedClientFilter
                      ? 'bg-[#2563EB] text-white border-[#2563EB]'
                      : 'bg-[var(--sm-bg-card)] text-[var(--sm-text-2)] border-[var(--sm-border)] hover:border-[#2f3b52] hover:bg-[var(--sm-bg-alt)]'
                  }`}
                >
                  {selectedClient ? (
                    selectedClient.logo_url ? (
                      <img src={selectedClient.logo_url} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0">
                        {selectedClient.company_name[0].toUpperCase()}
                      </span>
                    )
                  ) : (
                    <Building2 className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                  )}
                  <span className="max-w-[140px] truncate">
                    {selectedClient ? selectedClient.company_name : 'Todos os clientes'}
                  </span>
                  <ChevronRightIcon className={`w-3.5 h-3.5 flex-shrink-0 transition-transform opacity-60 ${clientDropOpen ? 'rotate-90' : 'rotate-90 -rotate-90'} ${clientDropOpen ? '-rotate-90' : 'rotate-90'}`} />
                </button>

                <AnimatePresence>
                  {clientDropOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setClientDropOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 top-full mt-1.5 z-30 bg-[var(--sm-bg-alt)] border border-[var(--sm-border)] rounded-2xl shadow-xl overflow-hidden py-1.5 min-w-[200px]"
                      >
                        {/* Opção Todos */}
                        <button
                          onClick={() => { setSelectedClientFilter(null); setClientDropOpen(false) }}
                          className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium transition-colors text-left ${
                            selectedClientFilter === null ? 'bg-[var(--sm-bg-card)] text-[var(--sm-text-1)]' : 'text-[var(--sm-text-2)] hover:bg-[var(--sm-bg-card)]'
                          }`}
                        >
                          <span className="w-5 h-5 rounded-full bg-[var(--sm-bg-alt)] flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-3 h-3 text-[var(--sm-text-3)]" />
                          </span>
                          Todos os clientes
                          {selectedClientFilter === null && <Check className="w-3 h-3 ml-auto text-[#60A5FA]" />}
                        </button>
                        {(clients || []).length > 0 && <div className="h-px bg-[var(--sm-bg-alt)] mx-3 my-1" />}
                        {(clients || []).map(c => (
                          <button
                            key={c.id}
                            onClick={() => { setSelectedClientFilter(c.id); setClientDropOpen(false) }}
                            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium transition-colors text-left ${
                              selectedClientFilter === c.id ? 'bg-[var(--sm-bg-card)] text-[var(--sm-text-1)]' : 'text-[var(--sm-text-2)] hover:bg-[var(--sm-bg-card)]'
                            }`}
                          >
                            {c.logo_url ? (
                              <img src={c.logo_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0">
                                {c.company_name[0].toUpperCase()}
                              </span>
                            )}
                            <span className="truncate flex-1">{c.company_name}</span>
                            {selectedClientFilter === c.id && <Check className="w-3 h-3 ml-auto text-[#60A5FA] flex-shrink-0" />}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )
          })()}

          {/* Seletor de status de aprovação */}
          {(() => {
            const STATUS_OPTIONS = [
              { key: 'todos',              label: 'Todos os status',   dot: 'bg-[#64748b]' },
              { key: 'rascunho',           label: 'Rascunho',           dot: 'bg-gray-400' },
              { key: 'pendente_aprovacao', label: 'Aguardando aprovação', dot: 'bg-yellow-400' },
              { key: 'aprovado',           label: 'Aprovados',          dot: 'bg-green-400' },
              { key: 'ajuste_solicitado',  label: 'Ajuste solicitado',  dot: 'bg-orange-400' },
              { key: 'ajuste_realizado',   label: 'Ajuste realizado',   dot: 'bg-blue-400' },
              { key: 'reprovado',          label: 'Reprovados',         dot: 'bg-red-400' },
            ] as const
            const current = STATUS_OPTIONS.find(s => s.key === selectedApprovalFilter) ?? STATUS_OPTIONS[0]
            const isFiltered = selectedApprovalFilter !== 'todos'
            // No calendário, os contadores do mês já filtram por status
            if (viewMode === 'mensal') return null
            return (
              <div className="relative">
                <button
                  onClick={() => { setStatusDropOpen(o => !o); setClientDropOpen(false) }}
                  className={`flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-xl text-[12px] font-medium border transition-all ${
                    isFiltered
                      ? 'bg-[#2563EB] text-white border-[#2563EB]'
                      : 'bg-[var(--sm-bg-card)] text-[var(--sm-text-2)] border-[var(--sm-border)] hover:border-[#2f3b52] hover:bg-[var(--sm-bg-alt)]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${current.dot}`} />
                  <span>{current.label}</span>
                  <ChevronRightIcon className={`w-3.5 h-3.5 flex-shrink-0 opacity-60 transition-transform ${statusDropOpen ? '-rotate-90' : 'rotate-90'}`} />
                </button>

                <AnimatePresence>
                  {statusDropOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setStatusDropOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 top-full mt-1.5 z-30 bg-[var(--sm-bg-alt)] border border-[var(--sm-border)] rounded-2xl shadow-xl overflow-hidden py-1.5 min-w-[190px]"
                      >
                        {STATUS_OPTIONS.map(({ key, label, dot }) => (
                          <button
                            key={key}
                            onClick={() => { setSelectedApprovalFilter(key); setStatusDropOpen(false) }}
                            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium transition-colors text-left ${
                              selectedApprovalFilter === key ? 'bg-[var(--sm-bg-card)] text-[var(--sm-text-1)]' : 'text-[var(--sm-text-2)] hover:bg-[var(--sm-bg-card)]'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                            <span className="flex-1">{label}</span>
                            {selectedApprovalFilter === key && <Check className="w-3 h-3 ml-auto text-[#60A5FA] flex-shrink-0" />}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )
          })()}

          {/* Notificador WhatsApp manual */}
          <button
            onClick={() => { openWaDrop(); setClientDropOpen(false); setStatusDropOpen(false) }}
            className="sm:ml-auto flex items-center gap-2 h-9 pl-3 pr-3 rounded-xl text-[12px] font-medium border transition-all bg-[var(--sm-bg-card)] text-[#25D366] border-[var(--sm-border)] hover:border-[#25D366]/30 hover:bg-[var(--sm-bg-alt)]"
          >
            <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Notificar cliente</span>
          </button>

          <Dialog open={waDropOpen} onOpenChange={setWaDropOpen}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-start gap-3 pr-6">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: '#25D36620', border: '1px solid #25D36640' }}
                >
                  <MessageCircle className="w-5 h-5 text-[#25D366]" />
                </div>
                <div className="min-w-0">
                  <DialogTitle>Notificar cliente</DialogTitle>
                  <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-2)' }}>
                    Envie uma mensagem via WhatsApp para um ou mais clientes.
                  </p>
                </div>
              </div>

              {/* Cliente */}
              <div>
                <p className="text-[12px] font-semibold mb-2" style={{ color: 'var(--sm-text-1)' }}>Cliente</p>
                <div className="flex flex-col gap-1.5">
                  {(clients || []).filter(c => c.whatsapp).length === 0 ? (
                    <p className="text-[12px] px-1" style={{ color: 'var(--sm-text-2)' }}>Nenhum cliente com WhatsApp cadastrado</p>
                  ) : (clients || []).filter(c => c.whatsapp).map(c => {
                    const checked = waClientIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleWaClient(c.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left"
                        style={checked
                          ? { background: '#2563EB0d', borderColor: '#2563EB66' }
                          : { borderColor: 'var(--sm-border)' }}
                      >
                        {c.logo_url ? (
                          <img src={c.logo_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0">
                            {c.company_name[0].toUpperCase()}
                          </span>
                        )}
                        <span className="flex-1 min-w-0 truncate text-[13px] font-medium" style={{ color: 'var(--sm-text-1)' }}>{c.company_name}</span>
                        <WaCheckbox checked={checked} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Mensagem */}
              <div>
                <p className="text-[12px] font-semibold mb-2" style={{ color: 'var(--sm-text-1)' }}>Mensagem</p>
                <div className="flex flex-col gap-2">
                  {WA_MESSAGE_OPTIONS.map(opt => {
                    const checked = waType === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setWaType(opt.value)}
                        className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-colors text-left"
                        style={checked
                          ? { background: '#2563EB0d', borderColor: '#2563EB' }
                          : { borderColor: 'var(--sm-border)' }}
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: opt.iconBg }}>
                          <opt.Icon className="w-4 h-4" style={{ color: opt.iconColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{opt.label}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--sm-text-2)' }}>{opt.description}</p>
                        </div>
                        <WaCheckbox checked={checked} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Grupos */}
              {waGroups.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: 'var(--sm-text-1)' }}>Grupos</p>
                  <div className="flex flex-col gap-1.5">
                    {waGroups.map(g => {
                      const checked = waGroupJids.includes(g.group_jid)
                      return (
                        <button
                          key={g.group_jid}
                          onClick={() => toggleWaGroup(g.group_jid)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left"
                          style={checked
                            ? { background: '#2563EB0d', borderColor: '#2563EB66' }
                            : { borderColor: 'var(--sm-border)' }}
                        >
                          <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sm-bg-alt)' }}>
                            <Folder className="w-4 h-4" style={{ color: 'var(--sm-text-2)' }} />
                          </span>
                          <span className="flex-1 min-w-0 truncate text-[13px] font-medium" style={{ color: 'var(--sm-text-1)' }}>{g.group_name}</span>
                          <WaCheckbox checked={checked} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={sendWhatsApp}
                disabled={(waClientIds.length === 0 && waGroupJids.length === 0) || waSending}
                className="w-full h-11 rounded-xl bg-[#2563EB] text-white text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1eb858] transition-colors"
              >
                {waSending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <MessageCircle className="w-4 h-4" />
                }
                {waSending ? 'Enviando...' : 'Enviar mensagem'}
              </button>
            </DialogContent>
          </Dialog>

        </div>

        {/* ── Feed View ────────────────────────────────────────────────────────── */}
        {viewMode === 'feed' && (() => {
          const selectedClient = (clients || []).find(c => c.id === selectedClientFilter) ?? null
          // Itens do cliente selecionado — mais recente primeiro (topo da grade, como Instagram)
          const feedItems = (selectedClientFilter
            ? (items || []).filter(i => i.client_id === selectedClientFilter)
            : (items || [])
          ).sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))

          return (
            <div className="max-w-2xl mx-auto">
              {/* ── Cabeçalho de perfil ── */}
              <div className="flex items-center gap-5 mb-5">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-[var(--sm-border)]">
                  {selectedClient?.logo_url ? (
                    <img src={selectedClient.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                      <span className="text-xl font-bold text-white">
                        {selectedClient ? selectedClient.company_name[0].toUpperCase() : '?'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info do perfil */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <h2 className="text-sm font-semibold text-[var(--sm-text-1)] truncate">
                      {selectedClient ? selectedClient.company_name : 'Todos os clientes'}
                    </h2>
                    {!selectedClient && (
                      <span className="text-[11px] text-[var(--sm-text-3)] bg-[var(--sm-bg-alt)] px-2 py-0.5 rounded-full">
                        Selecione um cliente
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="text-center">
                      <p className="text-sm font-bold text-[var(--sm-text-1)]">{feedItems.length}</p>
                      <p className="text-[10px] text-[var(--sm-text-3)]">planejados</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-[var(--sm-text-1)]">
                        {feedItems.filter(i => i.status === 'publicado').length}
                      </p>
                      <p className="text-[10px] text-[var(--sm-text-3)]">publicados</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-[var(--sm-text-1)]">
                        {feedItems.filter(i => i.approval_status === 'aprovado').length}
                      </p>
                      <p className="text-[10px] text-[var(--sm-text-3)]">aprovados</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Grade estilo Instagram (3 colunas) ── */}
              {feedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-[var(--sm-bg-alt)] flex items-center justify-center mb-3">
                    <LayoutGrid className="w-7 h-7 text-[var(--sm-text-2)]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--sm-text-3)]">Nenhum conteúdo planejado</p>
                  <p className="text-xs text-[var(--sm-text-4)] mt-1">
                    {selectedClientFilter ? 'Crie posts no calendário para visualizar o feed' : 'Selecione um cliente para ver o feed'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-0.5 max-w-2xl">
                  {feedItems.map(item => {
                    // Capa: prioriza imagem IG marcada → qualquer imagem → vídeo IG → qualquer vídeo
                    const igImages  = (item.attachments ?? []).filter(a => a.is_ig_media && a.file_type.startsWith('image/'))
                    const anyImages = (item.attachments ?? []).filter(a => a.file_type.startsWith('image/'))
                    const igVideos  = (item.attachments ?? []).filter(a => a.is_ig_media && a.file_type.startsWith('video/'))
                    const anyVideos = (item.attachments ?? []).filter(a => a.file_type.startsWith('video/'))
                    const coverImg  = igImages[0] ?? anyImages[0] ?? null
                    const coverVid  = igVideos[0] ?? anyVideos[0] ?? null

                    // Cor de status para placeholder
                    const statusBg: Record<PlannerStatus, string> = {
                      ideia: 'from-purple-500/20 to-purple-600/10',
                      producao: 'from-blue-500/20 to-blue-600/10',
                      revisao: 'from-yellow-500/20 to-yellow-600/10',
                      aprovado: 'from-green-500/20 to-green-600/10',
                      publicado: 'from-emerald-500/20 to-emerald-600/10',
                    }
                    const bg = statusBg[item.status as PlannerStatus] ?? 'from-slate-500/20 to-slate-600/10'

                    // Ícone de tipo de conteúdo
                    const isCarousel = item.content_type === 'carrossel' || igImages.length > 1
                    const isReel = item.content_type === 'reels' || anyVideos.length > 0

                    return (
                      <button
                        key={item.id}
                        onClick={() => openItemView(item)}
                        className="relative aspect-square group overflow-hidden focus:outline-none bg-black"
                      >
                        {coverImg ? (
                          // Tem imagem → exibe imagem
                          <>
                            <img
                              src={coverImg.file_url}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            {/* Overlay hover */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-center px-2">
                                <p className="text-white text-[11px] font-semibold leading-snug line-clamp-2 drop-shadow">{item.title}</p>
                                <p className="text-white/80 text-[10px] mt-0.5 drop-shadow">
                                  {format(parseISO(item.scheduled_date), 'dd/MM', { locale: ptBR })}
                                </p>
                              </div>
                            </div>
                          </>
                        ) : coverVid ? (
                          // Tem vídeo → exibe preview do vídeo (autoplay mudo, como Instagram)
                          <>
                            <video
                              src={coverVid.file_url}
                              autoPlay
                              muted
                              loop
                              playsInline
                              className="w-full h-full object-cover"
                            />
                            {/* Overlay hover */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200 flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-center px-2">
                                <p className="text-white text-[11px] font-semibold leading-snug line-clamp-2 drop-shadow">{item.title}</p>
                                <p className="text-white/80 text-[10px] mt-0.5 drop-shadow">
                                  {format(parseISO(item.scheduled_date), 'dd/MM', { locale: ptBR })}
                                </p>
                              </div>
                            </div>
                          </>
                        ) : (
                          // Sem mídia — placeholder informativo
                          <div className={`w-full h-full bg-gradient-to-br ${bg} flex flex-col items-center justify-center p-2 group-hover:opacity-90 transition-opacity`}>
                            <div className={`w-6 h-6 rounded-full mb-1.5 flex-shrink-0 ${statusColors[item.status as PlannerStatus]}`} />
                            <p className="text-[10px] font-semibold text-[var(--sm-text-1)] text-center leading-tight line-clamp-2">{item.title}</p>
                            <p className="text-[9px] text-[var(--sm-text-2)] mt-1">
                              {format(parseISO(item.scheduled_date), 'dd/MM', { locale: ptBR })}
                            </p>
                            <p className="text-[9px] text-[var(--sm-text-3)]">{contentTypeLabels[item.content_type as ContentType]}</p>
                          </div>
                        )}

                        {/* Badges: carrossel / reel / status aprovação */}
                        <div className="absolute top-1 right-1 flex items-center gap-0.5">
                          {isCarousel && !isReel && (
                            <span className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                              <LayoutGrid className="w-2.5 h-2.5 text-white" />
                            </span>
                          )}
                          {isReel && (
                            <span className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                              <Film className="w-2.5 h-2.5 text-white" />
                            </span>
                          )}
                        </div>

                        {/* Badge de aprovação (canto inferior esquerdo) */}
                        {item.approval_status && (
                          <div className="absolute bottom-1 left-1">
                            <div className={`w-2.5 h-2.5 rounded-full border border-white/80 ${approvalDot[item.approval_status as ApprovalStatus]}`} />
                          </div>
                        )}

                        {/* Data (canto inferior direito) */}
                        <div className="absolute bottom-1 right-1 text-[9px] text-white/80 font-medium drop-shadow leading-none bg-black/30 px-1 py-0.5 rounded">
                          {format(parseISO(item.scheduled_date), 'dd/MM')}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Legenda de status */}
              <div className="flex gap-3 mt-4 flex-wrap max-w-2xl">
                {(Object.entries(approvalDot) as [ApprovalStatus, string][]).map(([status, dot]) => (
                  <div key={status} className="flex items-center gap-1.5 text-[11px] text-[var(--sm-text-3)]">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                    {approvalLabel[status]}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── Mês + contadores por status (legenda e filtro ao mesmo tempo) ────── */}
        {viewMode === 'mensal' && <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} aria-label="Mês anterior"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--sm-text-2)] hover:bg-[var(--sm-bg-alt)] transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="font-display text-[17px] font-semibold text-[var(--sm-text-1)] min-w-[150px] text-center tabular-nums">
              {monthTitle}
            </h2>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} aria-label="Próximo mês"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--sm-text-2)] hover:bg-[var(--sm-bg-alt)] transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isSameMonth(currentMonth, new Date()) && (
              <button onClick={() => setCurrentMonth(new Date())}
                      className="ml-1 h-7 px-2.5 rounded-lg text-[11.5px] font-medium border border-[var(--sm-border)] text-[var(--sm-text-2)] hover:text-[var(--sm-text-1)] hover:bg-[var(--sm-bg-alt)] transition-colors">
                Hoje
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 lg:mx-0 lg:px-0 lg:ml-auto">
            {monthCounts.map(c => {
              const active = selectedApprovalFilter === c.key
              return (
                <button key={c.key}
                        onClick={() => setSelectedApprovalFilter(active ? 'todos' : c.key)}
                        title={active ? 'Mostrar todos' : `Mostrar só: ${c.label}`}
                        className={`flex-shrink-0 flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full border text-[11.5px] transition-colors
                          ${active
                            ? 'border-[var(--sm-text-2)] bg-[var(--sm-bg-alt)] text-[var(--sm-text-1)]'
                            : 'border-[var(--sm-border)] text-[var(--sm-text-3)] hover:text-[var(--sm-text-1)] hover:border-[var(--sm-text-4)]'}
                          ${c.n === 0 && !active ? 'opacity-50' : ''}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                  <span className="font-semibold tabular-nums text-[var(--sm-text-1)]">{c.n}</span>
                  {c.short}
                </button>
              )
            })}
            {selectedApprovalFilter !== 'todos' && (
              <button onClick={() => setSelectedApprovalFilter('todos')}
                      className="flex-shrink-0 h-7 px-2 text-[11.5px] text-[#60A5FA] hover:underline">
                Limpar
              </button>
            )}
          </div>
        </div>}

        {/* Calendar grid */}
        {viewMode === 'mensal' && <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
        <div className="rounded-lg border border-[var(--sm-border)] bg-[var(--sm-bg-card)]">
          <div className="p-2 sm:p-4">
            <div className="w-full max-w-full min-w-0">
            <div className="grid grid-cols-7 mb-1 sm:mb-2">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                <div key={d} className="text-center text-[11px] sm:text-xs font-semibold text-[var(--sm-text-2)] py-1.5 sm:py-2 truncate">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1 auto-rows-fr">
              {days.map(day => {
                const dayItems = getItemsForDay(day)
                const isCurrentMonth = isSameMonth(day, currentMonth)
                const isCurrentDay = isToday(day)
                const hasItems = dayItems.length > 0

                return (
                  <DroppableDay
                    key={day.toISOString()}
                    day={day}
                    isCurrentMonth={isCurrentMonth}
                    isCurrentDay={isCurrentDay}
                    hasItems={hasItems}
                    dragging={!!draggingItem}
                    onDayClick={() => handleDayClick(day, dayItems)}
                    onMouseEnter={e => handleDayMouseEnter(e, dayItems)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div className={`
                      text-[12px] sm:text-xs font-semibold mb-1 w-6 h-6 sm:w-5 sm:h-5 flex items-center justify-center rounded-full
                      ${isCurrentDay ? 'bg-[#2563EB] text-white' : isCurrentMonth ? 'text-[var(--sm-text-1)]' : 'text-[var(--sm-text-2)]'}
                    `}>
                      {format(day, 'd')}
                    </div>
                    {isMobile ? (
                      <div className="flex flex-wrap gap-[3px] px-0.5">
                        {dayItems.slice(0, 6).map(item => (
                          <span key={item.id} className="w-1.5 h-1.5 rounded-full" style={{ background: planColor(item) }} />
                        ))}
                      </div>
                    ) : (
                    <div className="space-y-0.5 sm:space-y-1">
                      {dayItems.slice(0, 3).map(item => (
                        <DayPreviewChip
                          key={item.id}
                          item={item}
                          disabled={isMobile}
                          onItemClick={() => openItemView(item)}
                        />
                      ))}
                      {dayItems.length > 3 && (
                        <p className="text-[10.5px] text-[var(--sm-text-3)] font-medium pl-1">+{dayItems.length - 3} mais</p>
                      )}
                    </div>
                    )}
                  </DroppableDay>
                )
              })}
            </div>
            </div>
          </div>
        </div>

        {/* Overlay visual durante o drag */}
        <DragOverlay dropAnimation={null}>
          {draggingItem ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--sm-bg-card)] border border-[var(--sm-border)] shadow-lg text-[10px] text-[var(--sm-text-1)] max-w-[160px]">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColors[draggingItem.status as PlannerStatus]}`} />
              <span className="truncate">{draggingItem.title}</span>
            </div>
          ) : null}
        </DragOverlay>
        </DndContext>}

        {/* ── Lista do mês (celular): o calendário mostra só as bolinhas ────────── */}
        {viewMode === 'mensal' && isMobile && (
          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--sm-text-3)] mb-2">
              Posts do mês
            </p>
            {agendaItems.length === 0 ? (
              <p className="text-[13px] text-[var(--sm-text-3)] py-6 text-center">Nenhum post neste mês.</p>
            ) : (
              <div className="rounded-xl border border-[var(--sm-border)] bg-[var(--sm-bg-card)] divide-y divide-[var(--sm-border)] overflow-hidden">
                {agendaItems.map(item => {
                  const d = parseISO(item.scheduled_date)
                  const k = PLAN_KEYS.find(p => p.key === planKey(item))
                  const clientName = (item as any).client?.company_name as string | undefined
                  return (
                    <button key={item.id} onClick={() => openItemView(item)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-[var(--sm-bg-alt)]">
                      <div className="w-9 flex-shrink-0 text-center">
                        <p className="font-display text-[17px] font-bold leading-none text-[var(--sm-text-1)] tabular-nums">{format(d, 'd')}</p>
                        <p className="text-[10px] uppercase text-[var(--sm-text-3)] mt-0.5">{format(d, 'EEE', { locale: ptBR }).slice(0, 3)}</p>
                      </div>
                      <span className="w-[3px] self-stretch rounded-full flex-shrink-0" style={{ background: planColor(item) }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-[var(--sm-text-1)] truncate">{item.title}</p>
                        <p className="text-[11.5px] text-[var(--sm-text-3)] truncate">
                          {[contentTypeLabels[item.content_type as ContentType] ?? item.content_type, clientName, item.status === 'publicado' ? 'Publicado' : k?.label].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--sm-text-4)] flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover Tooltip */}
      <AnimatePresence>
        {hover && <DayTooltip state={hover} />}
      </AnimatePresence>

      {/* ── Modal: Detalhes do Dia ── */}
      <Dialog open={dayDetailsOpen} onOpenChange={setDayDetailsOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" style={{ color: 'var(--sm-text-3)' }} />
              <DialogTitle className="font-display text-[19px] font-bold capitalize" style={{ color: 'var(--sm-text-1)' }}>
                {selectedDayDate && format(selectedDayDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </DialogTitle>
            </div>
            {selectedDayDate && (() => {
              const count = getItemsForDay(selectedDayDate).length
              return (
                <p className="text-xs mt-0.5 ml-6" style={{ color: 'var(--sm-text-3)' }}>
                  {count} {count === 1 ? 'post planejado' : 'posts planejados'} · clique em um para ver detalhes
                </p>
              )
            })()}
          </DialogHeader>

          <div className="space-y-3 my-1 min-w-0 w-full max-w-full overflow-x-hidden">
            {selectedDayDate && getItemsForDay(selectedDayDate).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[13px] font-medium" style={{ color: 'var(--sm-text-2)' }}>Nenhum post neste dia.</p>
                <p className="text-[12px] mt-1" style={{ color: 'var(--sm-text-4)' }}>Use o botão abaixo para adicionar.</p>
              </div>
            ) : (
              selectedDayDate && getItemsForDay(selectedDayDate).map(item => (
                <DayItemCard
                  key={item.id}
                  item={item}
                  onView={() => openItemView(item)}
                  onEdit={() => openEdit(item)}
                  onDelete={() => deleteItem.mutateAsync(item.id)}
                  onSend={async () => {
                    try {
                      await updateItem.mutateAsync({
                        id: item.id,
                        sent_to_client: true,
                        approval_status: item.status !== 'publicado' && item.client_id ? 'pendente_aprovacao' : (item.approval_status ?? null),
                      } as any)
                      await qc.refetchQueries({ queryKey: ['planner'] })
                      toast('Post enviado ao cliente!', 'success')
                    } catch (err: any) {
                      toast(err.message, 'error')
                    }
                  }}
                />
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="premium"
              onClick={() => {
                setDayDetailsOpen(false)
                resetForm()
                setForm(prev => ({
                  ...prev,
                  scheduled_date: selectedDayDate ? format(selectedDayDate, 'yyyy-MM-dd') : prev.scheduled_date,
                }))
                setOpen(true)
              }}
            >
              <Plus className="w-4 h-4" /> Adicionar novo post neste dia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Content Picker (Arsenal) ── */}
      {form.client_id && (
        <ContentPickerDialog
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          clientId={form.client_id}
          onSelect={handleAssetSelect}
        />
      )}

      {/* ── Modal: Visualização Completa do Evento ── */}
      {liveSelectedItem && (
        <PlannerItemView
          item={liveSelectedItem}
          open={itemViewOpen}
          onClose={closeItemView}
          onEdit={() => openEdit(liveSelectedItem)}
          userId={agencyId ?? ''}
        />
      )}

      {/* ── Modal: Criar / Editar Post ── */}
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm() }}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="pr-8 font-display text-[19px] font-bold">{editingItem ? 'Editar post' : 'Adicionar ao planejamento'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 min-w-0 w-full max-w-full overflow-x-hidden">
            <Input label="Título *" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Post sobre tendências..." />

            <div className="grid grid-cols-1 xs:grid-cols-[1fr_140px] sm:grid-cols-[1fr_140px] gap-3">
              <div>
                <label className="block text-xs font-medium text-[color:var(--sm-text-3)] mb-1.5">Data *</label>
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={e => set('scheduled_date', e.target.value)}
                  // iPhone dá ao campo de data uma largura mínima própria: sem
                  // min-w-0 e appearance-none ele passa da largura do modal
                  className="w-full min-w-0 appearance-none h-10 sm:h-9 px-3 rounded-md text-sm text-left focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  style={{ background: 'var(--sm-bg-input)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--sm-text-3)] mb-1.5">Hora (opcional)</label>
                <input
                  type="time"
                  value={form.scheduled_time}
                  onChange={e => set('scheduled_time', e.target.value)}
                  className="w-full min-w-0 appearance-none h-10 sm:h-9 px-3 rounded-md text-sm text-left focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  style={{ background: 'var(--sm-bg-input)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[color:var(--sm-text-3)] mb-1.5">Tipo</label>
                <Select value={form.content_type} onValueChange={v => set('content_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(contentTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--sm-text-3)] mb-1.5">Status</label>
                <Select value={form.status} onValueChange={v => set('status', v as PlannerStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ideia" textValue="Ideia">Ideia</SelectItem>
                    <SelectItem value="producao" textValue="Produção">Produção</SelectItem>
                    <SelectItem value="revisao" textValue="Revisão">Revisão</SelectItem>
                    <SelectItem value="aprovado" textValue="Aprovado">Aprovado</SelectItem>
                    <SelectItem value="publicado" textValue="Publicado">Publicado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[color:var(--sm-text-3)] mb-1.5">Cliente</label>
              <Select value={form.client_id || '__none__'} onValueChange={v => set('client_id', v === '__none__' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Sem cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" textValue="Sem cliente">Sem cliente</SelectItem>
                  {(clients || []).map(c => <SelectItem key={c.id} value={c.id} textValue={c.company_name}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Usar conteúdo do arsenal — só ao criar, quando cliente selecionado */}
            {!editingItem && form.client_id && (
              <div className="rounded-md border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-[color:var(--sm-text-3)] uppercase tracking-wide">Arsenal do cliente</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPickerOpen(true)}
                  >
                    <ImageIcon className="w-3 h-3" />
                    {linkedAsset ? 'Trocar conteúdo' : 'Selecionar conteúdo'}
                  </Button>
                </div>
                {linkedAsset ? (
                  <div className="flex items-center gap-2.5 p-2 rounded-md bg-[color:var(--sm-bg-alt)] border border-[color:var(--sm-border)]">
                    {isImageUrl(linkedAsset.media_url) ? (
                      <img
                        src={linkedAsset.media_url ?? undefined}
                        alt=""
                        className="w-10 h-10 object-cover rounded flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-[color:var(--sm-bg-alt)] flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-4 h-4 text-[color:var(--sm-text-4)]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-[color:var(--sm-text-1)] truncate">{linkedAsset.title}</p>
                      <p className="text-[10px] text-[color:var(--sm-text-4)]">{contentTypeLabels[linkedAsset.content_type as ContentType]}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinkedAsset(null)}
                      aria-label="Remover"
                      className="p-2 -m-1 text-[color:var(--sm-text-3)] hover:text-[color:var(--sm-text-2)] flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-[color:var(--sm-text-4)]">
                    Selecione um conteúdo para preencher título, legenda e mídia automaticamente.
                  </p>
                )}
              </div>
            )}

            <Textarea label="Copy" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Contexto, referências..." />

            {/* ── Publicação Instagram ───────────────────────────────────── */}
            <div className="rounded-md border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)] p-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--sm-bg-alt)' }}>
                  <Instagram className="w-3 h-3" style={{ color: 'var(--sm-text-2)' }} />
                </div>
                <p className="text-[11px] text-[color:var(--sm-text-3)] uppercase tracking-wide font-semibold">Publicação no Instagram</p>
              </div>

              {/* Story: o agendamento não acontece, e o usuário precisa saber
                  aqui — senão anexa a mídia, o cliente aprova e nada publica,
                  sem nenhuma explicação em lugar nenhum. */}
              {isStoryContent(form.content_type) && (
                <div className="relative flex items-start gap-2 rounded-md border px-2.5 py-2 pl-3.5 overflow-hidden" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: '#F59E0B' }} />
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" style={{ color: '#D97706' }} />
                  <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--sm-text-3)' }}>
                    <strong className="font-semibold" style={{ color: 'var(--sm-text-1)' }}>
                      Stories não são agendados.
                    </strong>{' '}
                    A mídia abaixo serve para o cliente aprovar, mas nem a aprovação dele nem o botão
                    de agendar publicam um story — isso é feito direto pelo aplicativo do Instagram.
                  </p>
                </div>
              )}

              {/* Seletor de tipo */}
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { value: null,             label: 'Nenhum',    Icon: X         },
                  { value: 'IMAGE',          label: 'Imagem',    Icon: ImageIcon },
                  { value: 'CAROUSEL_ALBUM', label: 'Carrossel', Icon: LayoutGrid },
                  { value: 'REELS',          label: 'Reel',      Icon: Film      },
                ] as const).map(({ value, label, Icon }) => {
                  const active = form.ig_post_type === value
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        set('ig_post_type', value)
                        setIgFiles([]); setIgPreviews([])
                      }}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-[10px] font-medium transition-all ${
                        active
                          ? 'border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]'
                          : 'border-[color:var(--sm-border)] text-[color:var(--sm-text-3)] hover:border-[color:var(--sm-border)] hover:text-[color:var(--sm-text-2)]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  )
                })}
              </div>

              {/* Área de upload de mídia IG */}
              {form.ig_post_type && (() => {
                const isCarousel = form.ig_post_type === 'CAROUSEL_ALBUM'
                const isReel     = form.ig_post_type === 'REELS'
                const max        = isCarousel ? 10 : 1
                const totalIg    = existingIgMedia.length + igFiles.length

                return (
                  <div className="space-y-2">
                    {isCarousel && (
                      <p className="text-[10px] text-[color:var(--sm-text-4)]">
                        <span className="hidden sm:inline">Arraste para reordenar</span>
                        <span className="sm:hidden">Use as setas para reordenar</span>
                        {' '}· 1ª imagem = capa
                      </p>
                    )}

                    {/* Mídias existentes (edição) — arrastáveis para reordenar */}
                    {existingIgMedia.length > 0 && (
                      isCarousel ? (
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                          {existingIgMedia.map((att, i) => (
                            <div
                              key={att.id}
                              draggable
                              onDragStart={() => exIgOnDragStart(i)}
                              onDragEnter={() => exIgOnDragEnter(i)}
                              onDragOver={e => e.preventDefault()}
                              onDragEnd={exIgOnDragEnd}
                              onDrop={exIgOnDragEnd}
                              className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-grab active:cursor-grabbing select-none transition-all ${
                                exIgDragOver === i
                                  ? 'border-[#2563EB] scale-105'
                                  : exIgDragIdx.current === i
                                  ? 'border-[#2563EB]/40 opacity-50'
                                  : 'border-[color:var(--sm-border)] hover:border-[color:var(--sm-border)]'
                              }`}
                            >
                              {isVideoAttachment(att)
                                ? <video src={att.file_url} className="w-full h-full object-cover pointer-events-none" />
                                : <img src={att.file_url} alt="" className="w-full h-full object-cover pointer-events-none" draggable={false} />
                              }
                              <div className={`absolute top-0.5 left-0.5 text-[8px] font-bold px-1 py-0.5 rounded leading-none ${
                                i === 0 ? 'bg-[#2563EB] text-white' : 'bg-black/60 text-white'
                              }`}>
                                {i === 0 ? '★' : i + 1}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeExistingIgMedia(att)}
                                className="absolute top-0.5 right-0.5 w-7 h-7 sm:w-4 sm:h-4 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500 transition-colors"
                              >
                                <X className="w-3.5 h-3.5 sm:w-2.5 sm:h-2.5 text-white" />
                              </button>
                              <div className="sm:hidden absolute bottom-0 inset-x-0 flex justify-between">
                                <button type="button" aria-label="Mover para trás" disabled={i === 0}
                                        onClick={() => moveExistingIg(i, -1)}
                                        className="w-7 h-7 bg-black/60 text-white flex items-center justify-center disabled:opacity-0">
                                  <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button type="button" aria-label="Mover para frente" disabled={i === existingIgMedia.length - 1}
                                        onClick={() => moveExistingIg(i, 1)}
                                        className="w-7 h-7 bg-black/60 text-white flex items-center justify-center disabled:opacity-0">
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="relative w-full h-28 rounded-xl overflow-hidden border border-[color:var(--sm-border)]">
                          {isVideoAttachment(existingIgMedia[0])
                            ? <video src={existingIgMedia[0].file_url} className="w-full h-full object-cover" controls />
                            : <img src={existingIgMedia[0].file_url} alt="" className="w-full h-full object-cover" />
                          }
                          <button
                            type="button"
                            onClick={() => removeExistingIgMedia(existingIgMedia[0])}
                            className="absolute top-1.5 right-1.5 w-8 h-8 sm:top-1 sm:right-1 sm:w-5 sm:h-5 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500 transition-colors"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      )
                    )}

                    {/* Novas mídias pendentes */}
                    {igPreviews.length > 0 && (
                      isCarousel ? (
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                          {igPreviews.map((url, i) => {
                            const globalIdx = existingIgMedia.length + i
                            return (
                              <div
                                key={i}
                                draggable
                                onDragStart={() => igOnDragStart(i)}
                                onDragEnter={() => igOnDragEnter(i)}
                                onDragOver={e => e.preventDefault()}
                                onDragEnd={igOnDragEnd}
                                onDrop={igOnDrop}
                                className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-grab active:cursor-grabbing select-none transition-all ${
                                  igDragOver === i
                                    ? 'border-[#2563EB] scale-105'
                                    : igDragIdx.current === i
                                    ? 'border-[#2563EB]/40 opacity-50'
                                    : 'border-[color:var(--sm-border)] hover:border-[color:var(--sm-border)]'
                                }`}
                              >
                                {isReel
                                  ? <video src={url} className="w-full h-full object-cover pointer-events-none" />
                                  : <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" draggable={false} />
                                }
                                <div className={`absolute top-0.5 left-0.5 text-[8px] font-bold px-1 py-0.5 rounded leading-none ${
                                  globalIdx === 0 ? 'bg-[#2563EB] text-white' : 'bg-black/60 text-white'
                                }`}>
                                  {globalIdx === 0 ? '★' : globalIdx + 1}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeIgFile(i)}
                                  className="absolute top-0.5 right-0.5 w-7 h-7 sm:w-4 sm:h-4 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5 sm:w-2.5 sm:h-2.5 text-white" />
                                </button>
                                <div className="sm:hidden absolute bottom-0 inset-x-0 flex justify-between">
                                  <button type="button" aria-label="Mover para trás" disabled={i === 0}
                                          onClick={() => moveNewIg(i, -1)}
                                          className="w-7 h-7 bg-black/60 text-white flex items-center justify-center disabled:opacity-0">
                                    <ChevronLeft className="w-4 h-4" />
                                  </button>
                                  <button type="button" aria-label="Mover para frente" disabled={i === igPreviews.length - 1}
                                          onClick={() => moveNewIg(i, 1)}
                                          className="w-7 h-7 bg-black/60 text-white flex items-center justify-center disabled:opacity-0">
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                          {totalIg < max && (
                            <button
                              type="button"
                              onClick={() => igFileRef.current?.click()}
                              className="aspect-square rounded-lg border-2 border-dashed border-[color:var(--sm-border)] hover:border-[#2563EB]/50 flex flex-col items-center justify-center gap-0.5 transition-colors text-[color:var(--sm-text-4)] hover:text-[color:var(--sm-text-3)]"
                            >
                              <Plus className="w-4 h-4" />
                              <span className="text-[9px]">Add</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="relative w-full h-28 rounded-xl overflow-hidden border border-[color:var(--sm-border)]">
                          {isReel
                            ? <video src={igPreviews[0]} className="w-full h-full object-cover" controls />
                            : <img src={igPreviews[0]} alt="" className="w-full h-full object-cover" />
                          }
                          <button
                            type="button"
                            onClick={() => { setIgFiles([]); setIgPreviews([]) }}
                            className="absolute top-1.5 right-1.5 w-8 h-8 sm:top-1 sm:right-1 sm:w-5 sm:h-5 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500 transition-colors"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      )
                    )}

                    {/* Botão de upload inicial */}
                    {totalIg === 0 && (
                      <button
                        type="button"
                        onClick={() => igFileRef.current?.click()}
                        className="flex items-center gap-2 w-full h-10 px-3 rounded-lg border border-dashed border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)] text-[color:var(--sm-text-3)] text-xs hover:border-[#2563EB]/50 hover:text-[color:var(--sm-text-2)] transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {isCarousel ? 'Selecionar imagens (até 10)' : isReel ? 'Selecionar vídeo' : 'Selecionar imagem'}
                        </span>
                      </button>
                    )}

                    {/* Carousel add button when empty new files but has existing */}
                    {isCarousel && igPreviews.length === 0 && existingIgMedia.length > 0 && existingIgMedia.length < max && (
                      <button
                        type="button"
                        onClick={() => igFileRef.current?.click()}
                        className="flex items-center gap-2 w-full h-9 px-3 rounded-lg border border-dashed border-[color:var(--sm-border)] text-[color:var(--sm-text-4)] text-xs hover:border-[#2563EB]/50 hover:text-[color:var(--sm-text-3)] transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar mais imagens ({existingIgMedia.length}/{max})
                      </button>
                    )}

                    <input
                      ref={igFileRef}
                      type="file"
                      accept={isReel ? 'video/*' : 'image/*'}
                      multiple={isCarousel}
                      className="hidden"
                      onChange={e => handleIgFiles(e.target.files)}
                    />

                    {isCarousel && (existingIgMedia.length + igFiles.length) > 1 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {[...existingIgMedia, ...igFiles].map((_, i) => (
                          <span key={i} className="flex items-center gap-1">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                              i === 0 ? 'bg-[#2563EB] text-white' : 'bg-white/10 text-[color:var(--sm-text-3)]'
                            }`}>
                              {i === 0 ? 'Capa' : `Parte ${i + 1}`}
                            </span>
                            {i < (existingIgMedia.length + igFiles.length) - 1 && (
                              <span className="text-[color:var(--sm-text-4)] text-[9px]">→</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Outros Anexos */}
            <div>
              <label className="block text-xs font-medium text-[color:var(--sm-text-3)] mb-1.5">Outros anexos</label>
              {existingAttachments.length > 0 && (
                <div className="mb-2 space-y-2">
                  {existingAttachments.map(att => {
                    const isVideo = isVideoAttachment(att)
                    return isVideo ? (
                      <div key={att.id} className="border border-[color:var(--sm-border)] rounded-xl overflow-hidden bg-black">
                        <video
                          src={att.file_url}
                          autoPlay
                          muted
                          loop
                          playsInline
                          controls
                          className="w-full max-h-[200px] object-contain bg-black"
                        />
                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[color:var(--sm-bg-alt)]">
                          <Video className="w-3 h-3 text-[#8B5CF6] flex-shrink-0" />
                          <span className="text-xs text-[color:var(--sm-text-2)] truncate flex-1">{att.file_name}</span>
                          {att.file_size && <span className="text-[10px] text-[color:var(--sm-text-4)] flex-shrink-0">{formatFileSize(att.file_size)}</span>}
                          <button type="button" onClick={() => markAttachmentForDeletion(att)} aria-label="Remover" className="p-2 -m-1.5 text-[color:var(--sm-text-3)] hover:text-red-400 transition-colors flex-shrink-0">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={att.id} className="flex items-center gap-2 text-xs text-[color:var(--sm-text-2)] bg-[color:var(--sm-bg-alt)] border border-[color:var(--sm-border)] rounded-md px-2.5 py-1.5">
                        <FileTypeIcon type={att.file_type} />
                        <span className="truncate flex-1">{att.file_name}</span>
                        {att.file_size && <span className="text-[color:var(--sm-text-4)] flex-shrink-0 text-[10px]">{formatFileSize(att.file_size)}</span>}
                        <button type="button" onClick={() => markAttachmentForDeletion(att)} aria-label="Remover" className="p-2 -m-1.5 text-[color:var(--sm-text-3)] hover:text-red-400 transition-colors flex-shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 w-full h-9 px-3 rounded-md border border-dashed border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)] text-[color:var(--sm-text-3)] text-xs hover:border-[#2563EB]/50 hover:bg-[color:var(--sm-bg-alt)] transition-colors">
                <Paperclip className="w-3.5 h-3.5" />
                <span>Clique para anexar arquivos</span>
                <span className="ml-auto text-[10px] text-[color:var(--sm-text-4)]">máx. 50MB por arquivo</span>
              </button>
              <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" className="hidden" onChange={handleFileSelect} />
              {pendingFiles.length > 0 && (
                <div className="mt-2 space-y-2">
                  {pendingFiles.map((f, i) => {
                    const isVideo = getMimeType(f).startsWith('video/')
                    const remove = () => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))
                    return isVideo ? (
                      <VideoPreview key={i} file={f} onRemove={remove} />
                    ) : (
                      <div key={i} className="flex items-center gap-2 text-xs text-[color:var(--sm-text-2)] bg-[color:var(--sm-bg-alt)] border border-[color:var(--sm-border)] rounded-md px-2.5 py-1.5">
                        <FileTypeIcon type={f.type} />
                        <span className="truncate flex-1">{f.name}</span>
                        <span className="text-[color:var(--sm-text-4)] flex-shrink-0 text-[10px]">{formatFileSize(f.size)}</span>
                        <button type="button" onClick={remove} aria-label="Remover" className="p-2 -m-1.5 text-[color:var(--sm-text-3)] hover:text-red-400 transition-colors flex-shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Links */}
            <div>
              <label className="block text-xs font-medium text-[color:var(--sm-text-3)] mb-1.5">Links de referência</label>
              {existingLinks.length > 0 && (
                <div className="mb-2 space-y-1">
                  {existingLinks.map(link => (
                    <div key={link.id} className="flex items-center gap-2 text-xs bg-[color:var(--sm-bg-alt)] border border-[color:var(--sm-border)] rounded-md px-2.5 py-1.5">
                      <Link2 className="w-3 h-3 text-[#2563EB] flex-shrink-0" />
                      <span className="truncate flex-1 text-[#2563EB] text-[11px]">{link.url}</span>
                      <button type="button" onClick={() => markLinkForDeletion(link)} aria-label="Remover" className="p-2 -m-1.5 text-[color:var(--sm-text-3)] hover:text-red-400 transition-colors flex-shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://..."
                  value={linkInput}
                  onChange={e => setLinkInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
                  className="flex-1 h-9 px-3 rounded-md border text-sm placeholder:text-[color:var(--sm-text-4)] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
                />
                <Button type="button" size="sm" variant="outline" onClick={addLink} disabled={!linkInput.trim()} className="flex-shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
              {pendingLinks.length > 0 && (
                <div className="mt-2 space-y-1">
                  {pendingLinks.map((url, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-[color:var(--sm-bg-alt)] border border-[color:var(--sm-border)] rounded-md px-2.5 py-1.5">
                      <Link2 className="w-3 h-3 text-[#2563EB] flex-shrink-0" />
                      <span className="truncate flex-1 text-[#2563EB] text-[11px]">{url}</span>
                      <button type="button" onClick={() => setPendingLinks(prev => prev.filter((_, idx) => idx !== i))} aria-label="Remover" className="p-2 -m-1.5 text-[color:var(--sm-text-3)] hover:text-red-400 transition-colors flex-shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Celular: botões de 40px, um por linha, fáceis de acertar com o dedo */}
          <DialogFooter className="flex-col sm:flex-row gap-2 [&>button]:h-10 sm:[&>button]:h-8">
            <Button variant="outline" onClick={() => { setOpen(false); resetForm() }} className="sm:mr-auto">Cancelar</Button>
            <Button
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={createItem.isPending || updateItem.isPending || isUploading || !form.title.trim()}
            >
              {isUploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
              ) : (
                <><Save className="w-4 h-4" /> Salvar</>
              )}
            </Button>
            <Button
              variant="premium"
              onClick={() => handleSave(true)}
              disabled={createItem.isPending || updateItem.isPending || isUploading || !form.title.trim() || !form.client_id}
              title={!form.client_id ? 'Selecione um cliente para enviar' : ''}
            >
              {isUploading ? (
                uploadProgress
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando {uploadProgress.current}/{uploadProgress.total}...</>
                  : <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
              ) : (
                <><Send className="w-4 h-4" /> Salvar e enviar ao cliente</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
