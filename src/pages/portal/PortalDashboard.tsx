import { useState, useMemo, useEffect, useRef } from 'react'
import { useWeeklyFormConfig } from '@/hooks/useWeeklyForm'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Paperclip, Link2,
  FileText, ImageIcon, Video, Music, File, Building2,
  ExternalLink, Instagram, Mail, Globe, Phone, Sparkles,
  CheckCircle2, AlertCircle, XCircle, Clock, MessageSquare, X,
  LayoutDashboard, CalendarDays, FolderOpen, LifeBuoy,
  ArrowRight, Bell, Calendar, MessageCircle, Download, Eye,
  ClipboardList, Copy,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, parseISO, isThisMonth, startOfToday, isBefore,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PortalLayout } from '@/components/layout/PortalLayout'
import { PortalSectionHead, PortalEmpty, PortalFilterChip, PortalBlockTitle, portalPanel, portalEyebrow } from '@/components/portal/PortalUI'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  usePortalClient, usePortalPlanner, usePortalContents,
  useSubmitPartialApproval, useApproveAll,
  usePortalMaterials, usePortalSupportContacts,
  usePortalContentAssets, usePortalBrandDNA, usePortalPayments,
} from '@/hooks/usePortal'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { PlannerCommentsThread } from '@/components/PlannerCommentsThread'
import { NotificationsModal } from '@/components/NotificationsModal'
import { PortalResultadosTab } from './PortalResultadosTab'
import { PortalFinanceiroTab } from './PortalFinanceiroTab'
import { PortalNotesTab } from './PortalNotesTab'
import { useNotifications } from '@/hooks/useNotifications'
import type { ApprovalStatus, Client, Content, ClientMaterial, ClientSupportContact, MaterialType, ContactType, ContentAsset, BrandDNA } from '@/types'
import { contentTypeLabels, formatDate, formatRelative, statusLabels as clientStatusLabels } from '@/utils/formatters'
import { calcFinancialStatus, getFinancialAuxText, hasPaidCurrentCycle } from '@/utils/financial'
import { isImageUrl, isVideoUrl } from '@/utils/media'
import type { PlannerItem, PlannerAttachment, PlannerStatus, ContentType } from '@/types'
import { VideoComSom } from '@/components/VideoComSom'

// ─── Status config ────────────────────────────────────────────────────────────

const statusColors: Record<PlannerStatus, string> = {
  ideia: 'bg-purple-500', producao: 'bg-blue-500', revisao: 'bg-yellow-500',
  aprovado: 'bg-green-500', publicado: 'bg-emerald-500',
}
const statusTextColors: Record<PlannerStatus, string> = {
  ideia: 'text-purple-600', producao: 'text-blue-600', revisao: 'text-yellow-600',
  aprovado: 'text-green-600', publicado: 'text-emerald-600',
}
const statusLabels: Record<PlannerStatus, string> = {
  ideia: 'Ideia', producao: 'Produção', revisao: 'Revisão',
  aprovado: 'Aprovado', publicado: 'Publicado',
}

// ─── Approval config ─────────────────────────────────────────────────────────

const approvalBg: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'bg-yellow-50 border-yellow-200',
  aprovado: 'bg-green-50 border-green-200',
  ajuste_solicitado: 'bg-orange-50 border-orange-200',
  ajuste_realizado: 'bg-blue-50 border-blue-200',
  reprovado: 'bg-red-50 border-red-200',
}
const approvalText: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'text-yellow-600',
  aprovado: 'text-green-600',
  ajuste_solicitado: 'text-orange-600',
  ajuste_realizado: 'text-blue-600',
  reprovado: 'text-red-600',
}
const approvalLabels: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  ajuste_solicitado: 'Ajuste solicitado',
  ajuste_realizado: 'Ajuste realizado — revise e decida',
  reprovado: 'Reprovado',
}
const approvalIcons: Record<ApprovalStatus, React.ReactNode> = {
  pendente_aprovacao: <Clock className="w-3.5 h-3.5" />,
  aprovado: <CheckCircle2 className="w-3.5 h-3.5" />,
  ajuste_solicitado: <AlertCircle className="w-3.5 h-3.5" />,
  ajuste_realizado: <CheckCircle2 className="w-3.5 h-3.5" />,
  reprovado: <XCircle className="w-3.5 h-3.5" />,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Hover Tooltip ────────────────────────────────────────────────────────────

interface HoverState { items: PlannerItem[]; top: number; left: number }

function DayTooltip({ state }: { state: HoverState }) {
  return (
    <div className="fixed z-50 pointer-events-none" style={{ top: state.top, left: state.left }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4 }}
        transition={{ duration: 0.13 }}
        className="bg-white border border-[#e2e8f0] rounded-xl shadow-xl w-[260px] p-3 text-xs text-[#0f0f0f]"
      >
        {state.items.map((item, i) => (
          <div key={item.id} className={i > 0 ? 'mt-2.5 pt-2.5 border-t border-[#e2e8f0]' : ''}>
            <div className="flex items-start gap-2 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full mt-[3px] flex-shrink-0 ${statusColors[item.status as PlannerStatus]}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#0f0f0f] text-[11px] leading-snug">{item.title}</p>
                <p className="text-[10px] text-[#64748b] mt-0.5">
                  {contentTypeLabels[item.content_type as ContentType]} · {statusLabels[item.status as PlannerStatus]}
                </p>
              </div>
            </div>
            {item.notes && (
              <p className="text-[10px] text-[#64748b] line-clamp-2 mb-1.5 leading-relaxed">{item.notes}</p>
            )}
            {(() => {
              const img = item.attachments?.find(a => a.file_type.startsWith('image/'))
              return img ? <img src={img.file_url} alt="" className="w-full h-20 object-cover rounded-lg mb-1.5" /> : null
            })()}
            <div className="flex items-center gap-3 flex-wrap">
              {item.attachments && item.attachments.length > 0 && (
                <div className="flex items-center gap-1">
                  <Paperclip className="w-3 h-3 text-[#94a3b8]" />
                  <span className="text-[10px] text-[#64748b]">
                    {item.attachments.length} {item.attachments.length === 1 ? 'anexo' : 'anexos'}
                  </span>
                </div>
              )}
              {item.links && item.links.length > 0 && (
                <div className="flex items-center gap-1 min-w-0">
                  <Link2 className="w-3 h-3 text-blue-500 flex-shrink-0" />
                  <span className="text-[10px] text-blue-600 truncate">
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

// ─── Bloco de aprovação parcial (Arte ou Copy) ───────────────────────────────

interface PartialApprovalBlockProps {
  label: string
  description: string
  status: ApprovalStatus | null
  pending: ApprovalStatus | null
  feedback: string
  isBusy: boolean
  busyThis: boolean
  onAction: (s: ApprovalStatus) => void
  onFeedbackChange: (v: string) => void
  onCancelPending: () => void
}

const approvalDot: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'bg-yellow-400',
  aprovado:           'bg-green-500',
  ajuste_solicitado:  'bg-orange-400',
  ajuste_realizado:   'bg-blue-400',
  reprovado:          'bg-red-500',
}

// ─── Feedback do cliente: carrossel (JSON por slide) ou texto simples ─────────

type ParsedSlideFeedback = { slide: number; status: 'aprovado' | 'ajuste_solicitado' | 'reprovado'; feedback: string }

function parseCarouselFeedback(feedback: string | null | undefined): ParsedSlideFeedback[] | null {
  if (!feedback) return null
  try {
    const data = JSON.parse(feedback)
    if (Array.isArray(data) && data.length > 0 && typeof data[0]?.slide === 'number') return data as ParsedSlideFeedback[]
    return null
  } catch { return null }
}

const slideFbDot: Record<string, string> = { aprovado: 'bg-green-500', ajuste_solicitado: 'bg-orange-400', reprovado: 'bg-red-500' }
const slideFbText: Record<string, string> = { aprovado: 'text-green-700', ajuste_solicitado: 'text-orange-600', reprovado: 'text-red-600' }
const slideFbLabel: Record<string, string> = { aprovado: 'Aprovado', ajuste_solicitado: 'Ajuste solicitado', reprovado: 'Reprovado' }

/** Mostra o feedback do cliente de forma legível — se for carrossel (JSON), quebra por slide. */
function ClientFeedbackView({ feedback }: { feedback: string }) {
  const slides = parseCarouselFeedback(feedback)
  if (slides) {
    return (
      <div className="mt-2 space-y-1.5">
        {slides.map(s => (
          <div key={s.slide} className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${slideFbDot[s.status] ?? 'bg-gray-400'}`} />
              <span className="text-[10px] font-semibold text-gray-500">Slide {s.slide}</span>
              <span className={`text-[10px] font-semibold ml-auto ${slideFbText[s.status] ?? 'text-gray-500'}`}>{slideFbLabel[s.status] ?? s.status}</span>
            </div>
            {s.feedback && <p className="text-[11px] text-gray-600 leading-relaxed break-words pl-3">"{s.feedback}"</p>}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="mt-2 flex items-start gap-2 p-2.5 bg-gray-50 border border-gray-100 rounded-xl">
      <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
      <p className="text-[11px] text-gray-600 leading-relaxed break-words select-text">{feedback}</p>
    </div>
  )
}

function PartialApprovalBlock({
  label, description, status, pending, feedback, isBusy, busyThis, onAction, onFeedbackChange, onCancelPending,
}: PartialApprovalBlockProps) {
  const resolved = status || 'pendente_aprovacao'
  const isDecided = resolved !== 'pendente_aprovacao' && resolved !== 'ajuste_realizado'
  const needsFeedback = pending === 'ajuste_solicitado' || pending === 'reprovado'

  return (
    <div className="space-y-2.5">
      {/* Label + status atual */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
          <span className="text-[9px] text-gray-300">·</span>
          <span className="text-[10px] text-gray-400">{description}</span>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${approvalText[resolved]}`}>
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${approvalDot[resolved]}`} />
          {approvalLabels[resolved]}
        </div>
      </div>

      {/* Chips de ação — só quando não decidido */}
      {!isDecided && (
        <div className="flex gap-1.5 flex-wrap">
          {/* Aprovar */}
          <button
            onClick={() => onAction('aprovado')}
            disabled={isBusy}
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-700 hover:bg-green-50"
          >
            {busyThis && !pending
              ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <CheckCircle2 className="w-3 h-3" />}
            Aprovar
          </button>

          {/* Solicitar ajuste */}
          <button
            onClick={() => onAction('ajuste_solicitado')}
            disabled={isBusy}
            className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed
              ${pending === 'ajuste_solicitado'
                ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            {busyThis && pending === 'ajuste_solicitado'
              ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <AlertCircle className="w-3 h-3" />}
            {pending === 'ajuste_solicitado' ? 'Confirmar' : 'Solicitar ajuste'}
          </button>

          {/* Reprovar */}
          <button
            onClick={() => onAction('reprovado')}
            disabled={isBusy}
            className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed
              ${pending === 'reprovado'
                ? 'bg-red-500 border-red-500 text-white shadow-sm'
                : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}
          >
            {busyThis && pending === 'reprovado'
              ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <XCircle className="w-3 h-3" />}
            {pending === 'reprovado' ? 'Confirmar' : 'Reprovar'}
          </button>
        </div>
      )}

      {/* Feedback já salvo */}
      {status && (status === 'ajuste_solicitado' || status === 'reprovado') && feedback && !pending && (
        <div className="flex items-start gap-2 p-2.5 bg-gray-50 border border-gray-100 rounded-xl">
          <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-600 leading-relaxed break-words select-text">{feedback}</p>
        </div>
      )}

      {/* Textarea inline para feedback */}
      {needsFeedback && (
        <div className="space-y-1.5">
          <textarea
            value={feedback}
            onChange={e => onFeedbackChange(e.target.value)}
            placeholder={`O que precisa ajustar na ${label.toLowerCase()}?`}
            rows={2}
            className="w-full text-[11px] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none transition-all"
          />
          <button onClick={onCancelPending} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Helper: recalcular status geral no cliente (espelha lógica do hook) ─────

function computeClientOverall(
  art: ApprovalStatus | null,
  copy: ApprovalStatus | null,
): ApprovalStatus {
  const statuses = [art, copy].filter(Boolean) as ApprovalStatus[]
  if (statuses.some(s => s === 'reprovado')) return 'reprovado'
  if (statuses.some(s => s === 'ajuste_solicitado')) return 'ajuste_solicitado'
  if (statuses.some(s => s === 'ajuste_realizado')) return 'ajuste_realizado'
  if (statuses.length > 0 && statuses.every(s => s === 'aprovado')) return 'aprovado'
  return 'pendente_aprovacao'
}

// ─── Item Detail View ─────────────────────────────────────────────────────────

function ItemDetailView({
  item, open, onClose,
}: { item: PlannerItem; open: boolean; onClose: () => void }) {
  const submitPartial = useSubmitPartialApproval()
  const approveAll   = useApproveAll()
  const { toast }    = useToast()
  const scrollRef     = useRef<HTMLDivElement>(null)  // wrapper mobile
  const bodyScrollRef = useRef<HTMLDivElement>(null)  // corpo desktop

  // Garante que o modal sempre abre no topo em ambos os layouts
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      if (scrollRef.current)     scrollRef.current.scrollTop = 0
      if (bodyScrollRef.current) bodyScrollRef.current.scrollTop = 0
    }, 0)
    return () => clearTimeout(t)
  }, [open])

  // Mídias (imagens + vídeos, ordenadas por sort_order)
  const mediaItems = useMemo(() => [
    ...(item.attachments?.filter(a => a.file_type.startsWith('image/')) || []).map(a => ({ ...a, kind: 'image' as const })),
    ...(item.attachments?.filter(a => a.file_type.startsWith('video/')) || []).map(a => ({ ...a, kind: 'video' as const })),
  ].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [item.attachments])

  const otherAttachments = item.attachments?.filter(
    (a: PlannerAttachment) => !a.file_type.startsWith('image/') && !a.file_type.startsWith('video/')
  ) || []

  const isCarousel = mediaItems.length > 1
  const [mediaIdx, setMediaIdx]       = useState(0)
  const currentMedia                   = mediaItems[mediaIdx] ?? null
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [expandedSection, setExpandedSection] = useState<'completa' | 'partes'>('partes')

  // Approval state
  const [localStatus, setLocalStatus] = useState<ApprovalStatus>(
    (item.approval_status || 'pendente_aprovacao') as ApprovalStatus
  )
  const [localArtStatus, setLocalArtStatus] = useState<ApprovalStatus | null>(
    (item.art_approval_status as ApprovalStatus) || null
  )
  const [localCopyStatus, setLocalCopyStatus] = useState<ApprovalStatus | null>(
    (item.copy_approval_status as ApprovalStatus) || null
  )
  const [artFeedback, setArtFeedback]   = useState(item.art_feedback || '')
  const [copyFeedback, setCopyFeedback] = useState(item.copy_feedback || '')
  const [artPending, setArtPending]     = useState<ApprovalStatus | null>(null)
  const [copyPending, setCopyPending]   = useState<ApprovalStatus | null>(null)
  const [busyField, setBusyField]       = useState<'all' | 'art' | 'copy' | null>(null)

  // Per-slide approval state (carousel) — inclui ajuste_solicitado e feedback por slide
  type SlideDecision = {
    status: 'aprovado' | 'ajuste_solicitado' | 'reprovado' | null
    feedback: string
    pendingStatus: 'ajuste_solicitado' | 'reprovado' | null
  }
  const [slideDecisions, setSlideDecisions] = useState<Record<string, SlideDecision>>(() => {
    const m: Record<string, SlideDecision> = {}
    mediaItems.forEach(s => { m[s.id] = { status: null, feedback: '', pendingStatus: null } })
    return m
  })

  useEffect(() => {
    setLocalStatus((item.approval_status || 'pendente_aprovacao') as ApprovalStatus)
    setLocalArtStatus((item.art_approval_status as ApprovalStatus) || null)
    setLocalCopyStatus((item.copy_approval_status as ApprovalStatus) || null)
    setArtFeedback(item.art_feedback || '')
    setCopyFeedback(item.copy_feedback || '')
    setArtPending(null)
    setCopyPending(null)
    setBusyField(null)
    setMediaIdx(0)
    setNotesExpanded(false)
    setExpandedSection('partes')
    const m: Record<string, SlideDecision> = {}
    mediaItems.forEach(s => { m[s.id] = { status: null, feedback: '', pendingStatus: null } })
    setSlideDecisions(m)
  }, [item.id])

  const isBusy        = busyField !== null
  const overallDecided = localStatus !== 'pendente_aprovacao' && localStatus !== 'ajuste_realizado'
  const artResolved   = (localArtStatus  || 'pendente_aprovacao') as ApprovalStatus
  const copyResolved  = (localCopyStatus || 'pendente_aprovacao') as ApprovalStatus
  const needsReview   = localStatus === 'ajuste_realizado'

  // Aprovado → decisão permanente, botões somem para sempre.
  // Ajuste solicitado / reprovado → botões somem enquanto aguarda agência.
  // Quando agência retorna (ajuste_realizado), apenas as partes com ajuste/reprovado
  // reaparecem com botões — o que já estava aprovado continua sem botões.
  const artDecided  = artResolved  === 'aprovado'
    || (artResolved  !== 'pendente_aprovacao' && artResolved  !== 'ajuste_realizado' && !needsReview)
  const copyDecided = copyResolved === 'aprovado'
    || (copyResolved !== 'pendente_aprovacao' && copyResolved !== 'ajuste_realizado' && !needsReview)

  // Quando a agência devolveu (ajuste_realizado), mostrar "Ajuste realizado" no label
  // em vez do status anterior (ajuste_solicitado / reprovado) — contexto mais claro pro cliente
  const displayArtStatus: ApprovalStatus  = (needsReview && (artResolved  === 'ajuste_solicitado' || artResolved  === 'reprovado')) ? 'ajuste_realizado' : artResolved
  const displayCopyStatus: ApprovalStatus = (needsReview && (copyResolved === 'ajuste_solicitado' || copyResolved === 'reprovado')) ? 'ajuste_realizado' : copyResolved
  const artNeedsFeedback  = artPending  === 'ajuste_solicitado' || artPending  === 'reprovado'
  const copyNeedsFeedback = copyPending === 'ajuste_solicitado' || copyPending === 'reprovado'

  // ── Handlers ──

  const handleApproveAll = async () => {
    setBusyField('all')
    try {
      await approveAll.mutateAsync({ plannerId: item.id })
      setLocalStatus('aprovado'); setLocalArtStatus('aprovado'); setLocalCopyStatus('aprovado')
      const all: Record<string, SlideDecision> = {}
      mediaItems.forEach(s => { all[s.id] = { status: 'aprovado', feedback: '', pendingStatus: null } })
      setSlideDecisions(all)
      toast('Tudo aprovado! 🎉', 'success')
    } catch (err: any) { toast(err.message, 'error') }
    finally { setBusyField(null) }
  }

  const handleArtAction = async (status: ApprovalStatus) => {
    const needsFeedback = status === 'ajuste_solicitado' || status === 'reprovado'
    if (needsFeedback && artPending !== status) { setArtPending(status); return }
    setBusyField('art')
    try {
      await submitPartial.mutateAsync({ plannerId: item.id, field: 'art', status, feedback: artFeedback, currentArtStatus: localArtStatus, currentCopyStatus: localCopyStatus })
      setLocalArtStatus(status)
      setLocalStatus(computeClientOverall(status, localCopyStatus))
      setArtPending(null)
      toast(`Arte: ${approvalLabels[status]}!`, 'success')
    } catch (err: any) { toast(err.message, 'error') }
    finally { setBusyField(null) }
  }

  // Seleciona status para o slide atual — se precisa feedback, entra em modo pendente
  const handleSlideStatus = (slideId: string, status: 'aprovado' | 'ajuste_solicitado' | 'reprovado') => {
    const needsFeedback = status === 'ajuste_solicitado' || status === 'reprovado'
    setSlideDecisions(prev => ({
      ...prev,
      [slideId]: {
        ...prev[slideId],
        pendingStatus: needsFeedback ? status : null,
        status: needsFeedback ? prev[slideId].status : status,
      }
    }))
  }

  // Confirma decisão do slide (com ou sem feedback) e verifica se todos estão decididos
  const confirmSlideDecision = async (slideId: string) => {
    const decision = slideDecisions[slideId]
    const finalStatus = decision.pendingStatus ?? decision.status!
    const updatedDecisions = {
      ...slideDecisions,
      [slideId]: { status: finalStatus, feedback: decision.feedback.trim(), pendingStatus: null }
    }
    setSlideDecisions(updatedDecisions)

    // Se todos os slides têm decisão confirmada, submete
    const allDecided = mediaItems.every(m => {
      const d = updatedDecisions[m.id]
      return d.status !== null && d.pendingStatus === null
    })
    if (!allDecided) return

    // Agrega: prioridade reprovado > ajuste_solicitado > aprovado
    const statuses = mediaItems.map(m => updatedDecisions[m.id].status!)
    const aggregate: ApprovalStatus = statuses.every(s => s === 'aprovado') ? 'aprovado'
      : statuses.some(s => s === 'reprovado') ? 'reprovado'
      : 'ajuste_solicitado'

    // Feedback estruturado por slide (JSON) para a agência ver com detalhes
    const feedbackData = mediaItems.map((m, i) => ({
      slide: i + 1,
      status: updatedDecisions[m.id].status!,
      feedback: updatedDecisions[m.id].feedback,
    }))

    setBusyField('art')
    try {
      await submitPartial.mutateAsync({
        plannerId: item.id, field: 'art', status: aggregate,
        feedback: JSON.stringify(feedbackData),
        currentArtStatus: localArtStatus, currentCopyStatus: localCopyStatus,
      })
      setLocalArtStatus(aggregate)
      setLocalStatus(computeClientOverall(aggregate, localCopyStatus))
      toast('Carrossel avaliado! ✓', 'success')
    } catch (err: any) { toast(err.message, 'error') }
    finally { setBusyField(null) }
  }

  const handleCopyAction = async (status: ApprovalStatus) => {
    const needsFeedback = status === 'ajuste_solicitado' || status === 'reprovado'
    if (needsFeedback && copyPending !== status) { setCopyPending(status); return }
    setBusyField('copy')
    try {
      await submitPartial.mutateAsync({ plannerId: item.id, field: 'copy', status, feedback: copyFeedback, currentArtStatus: localArtStatus, currentCopyStatus: localCopyStatus })
      setLocalCopyStatus(status); setCopyPending(null)
      setLocalStatus(computeClientOverall(localArtStatus, status))
      toast(`Copy: ${approvalLabels[status]}!`, 'success')
    } catch (err: any) { toast(err.message, 'error') }
    finally { setBusyField(null) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        className="w-[96vw] max-w-[96vw] lg:w-[min(1100px,94vw)] p-0 overflow-hidden !bg-white [&>button.absolute]:hidden flex flex-col"
        style={{ maxHeight: 'min(92vh, 900px)', height: 'min(92vh, 900px)' }}
        onOpenAutoFocus={e => { e.preventDefault(); if (scrollRef.current) scrollRef.current.scrollTop = 0 }}
      >

        {/* Wrapper único: rola no mobile como um todo, flex-row no desktop */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent"
        >

          {/* ══ HEADER MOBILE — primeiro filho = topo no mobile ══ */}
          <div className="lg:hidden px-4 pt-3.5 pb-3 border-b border-gray-100 bg-white flex-shrink-0">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-[11px] text-gray-500">
                  {format(parseISO(item.scheduled_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  {item.scheduled_time && ` às ${item.scheduled_time.slice(0, 5)}`}
                </span>
                <span className="text-gray-200">·</span>
                <div className={`flex items-center gap-1 text-[10px] font-semibold ${approvalText[localStatus]}`}>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${approvalDot[localStatus]}`} />
                  {approvalLabels[localStatus]}
                </div>
              </div>
              <button onClick={onClose}
                className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-all flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <h2 className="text-[17px] font-bold text-gray-900 leading-tight tracking-tight break-words">{item.title}</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-semibold">
                {statusLabels[item.status as PlannerStatus]}
              </span>
              <span className="text-[11px] px-2.5 py-1 bg-gray-100 text-gray-500 rounded-lg font-medium">
                {contentTypeLabels[item.content_type as ContentType]}
              </span>
            </div>
          </div>

          {/* ══ ESQUERDA: a mídia — painel abraça a imagem (tamanho natural, sem corte e sem borda) ══ */}
          {mediaItems.length > 0 && (
            <div className="lg:w-auto flex-shrink-0 flex flex-col bg-black border-b lg:border-b-0 lg:border-r border-gray-100">

              {/* Mídia principal — mobile: largura total natural; desktop: altura do modal, largura natural (sem corte) */}
              <div className="relative bg-black lg:h-full lg:min-h-0 lg:flex lg:items-center lg:justify-center">
                {currentMedia?.kind === 'image' ? (
                  <img src={currentMedia.file_url} alt={currentMedia.file_name}
                    className="block w-full h-auto lg:w-auto lg:h-full lg:max-w-[62vw] lg:object-contain" />
                ) : currentMedia?.kind === 'video' ? (
                  // Tela onde o cliente aprova o conteúdo. Antes começava mudo
                  // e o som só saía pelo ícone minúsculo dos controles nativos
                  // — no celular, quase impossível de acertar. Agora tem botão
                  // grande, e depois do primeiro toque os vídeos seguintes da
                  // sessão já vêm com som.
                  <VideoComSom key={currentMedia.file_url} src={currentMedia.file_url}
                    className="block w-full h-auto lg:w-auto lg:h-full lg:max-w-[62vw] lg:object-contain" />
                ) : null}

                {/* Número do slide (estilo referência) */}
                {isCarousel && (
                  <div className="absolute top-2 left-2 z-10 min-w-[26px] h-7 px-1.5 rounded-lg bg-white/90 border border-gray-200 shadow-sm flex items-center justify-center text-[11px] font-bold text-gray-700">
                    {String(mediaIdx + 1).padStart(2, '0')}
                  </div>
                )}

                {/* Setas de navegação */}
                {isCarousel && (
                  <>
                    <button onClick={() => setMediaIdx(i => Math.max(0, i - 1))} disabled={mediaIdx === 0}
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow border border-gray-200 flex items-center justify-center transition-all disabled:opacity-30 active:scale-95">
                      <ChevronLeft className="w-5 h-5 text-gray-700" />
                    </button>
                    <button onClick={() => setMediaIdx(i => Math.min(mediaItems.length - 1, i + 1))} disabled={mediaIdx === mediaItems.length - 1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow border border-gray-200 flex items-center justify-center transition-all disabled:opacity-30 active:scale-95">
                      <ChevronRight className="w-5 h-5 text-gray-700" />
                    </button>
                  </>
                )}

                {currentMedia && (
                  <a href={currentMedia.file_url} target="_blank" rel="noopener noreferrer"
                    className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center transition-all">
                    <ExternalLink className="w-3 h-3" style={{ color: '#fff' }} />
                  </a>
                )}

              </div>

              {/* Miniaturas — MOBILE: faixa própria abaixo da imagem (não sobrepõe a arte) */}
              {isCarousel && (
                <div className="lg:hidden flex gap-1.5 px-4 py-3 overflow-x-auto bg-white border-t border-gray-100 scrollbar-none">
                  {mediaItems.map((m, i) => {
                    const sd = slideDecisions[m.id]
                    const ss = sd?.status
                    return (
                      <button key={m.id} onClick={() => setMediaIdx(i)}
                        className={`relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all
                          ${i === mediaIdx ? 'border-indigo-500 shadow-sm' : ss === 'aprovado' ? 'border-green-400' : ss === 'ajuste_solicitado' ? 'border-orange-400' : ss === 'reprovado' ? 'border-red-400' : 'border-gray-200 opacity-60'}`}>
                        {m.kind === 'image'
                          ? <img src={m.file_url} className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-gray-100 flex items-center justify-center"><Video className="w-4 h-4 text-gray-400" /></div>}
                        {ss === 'aprovado'          && <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center"><CheckCircle2 className="w-2.5 h-2.5" style={{ color: '#fff' }} /></div>}
                        {ss === 'ajuste_solicitado' && <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center"><AlertCircle className="w-2.5 h-2.5" style={{ color: '#fff' }} /></div>}
                        {ss === 'reprovado'         && <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center"><XCircle className="w-2.5 h-2.5" style={{ color: '#fff' }} /></div>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ DIREITA: Info + Aprovação ══ */}
          <div className="lg:flex lg:flex-col lg:flex-1 lg:overflow-hidden bg-white min-w-0">

            {/* Header — oculto no mobile (aparece acima no bloco dedicado) */}
            <div className="hidden lg:block flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="text-[11px] text-gray-500">
                    {format(parseISO(item.scheduled_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    {item.scheduled_time && ` às ${item.scheduled_time.slice(0, 5)}`}
                  </span>
                  <span className="text-gray-200">·</span>
                  <div className={`flex items-center gap-1 text-[10px] font-semibold ${approvalText[localStatus]}`}>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${approvalDot[localStatus]}`} />
                    {approvalLabels[localStatus]}
                  </div>
                </div>
                <button onClick={onClose}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-all flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <h2 className="text-[19px] font-bold text-gray-900 leading-tight tracking-tight break-words">{item.title}</h2>
              <div className="flex items-center gap-2 mt-2.5">
                <span className="text-[11px] px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-semibold">
                  {statusLabels[item.status as PlannerStatus]}
                </span>
                <span className="text-[11px] px-2.5 py-1 bg-gray-100 text-gray-500 rounded-lg font-medium">
                  {contentTypeLabels[item.content_type as ContentType]}
                </span>
              </div>
            </div>

            {/* Corpo — sem scroll próprio no mobile (o wrapper pai rola); scroll interno apenas no desktop */}
            <div ref={bodyScrollRef} className="px-5 py-4 space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">

              {/* Miniaturas — DESKTOP: no painel direito, acima da legenda */}
              {isCarousel && (
                <div className="hidden lg:flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {mediaItems.map((m, i) => {
                    const sd = slideDecisions[m.id]
                    const ss = sd?.status
                    return (
                      <button key={m.id} onClick={() => setMediaIdx(i)}
                        className={`relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all
                          ${i === mediaIdx ? 'border-indigo-500 shadow-sm' : ss === 'aprovado' ? 'border-green-400' : ss === 'ajuste_solicitado' ? 'border-orange-400' : ss === 'reprovado' ? 'border-red-400' : 'border-gray-200 opacity-60 hover:opacity-100'}`}>
                        {m.kind === 'image'
                          ? <img src={m.file_url} className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-gray-100 flex items-center justify-center"><Video className="w-4 h-4 text-gray-400" /></div>}
                        {ss === 'aprovado'          && <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center"><CheckCircle2 className="w-2.5 h-2.5" style={{ color: '#fff' }} /></div>}
                        {ss === 'ajuste_solicitado' && <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center"><AlertCircle className="w-2.5 h-2.5" style={{ color: '#fff' }} /></div>}
                        {ss === 'reprovado'         && <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center"><XCircle className="w-2.5 h-2.5" style={{ color: '#fff' }} /></div>}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Legenda */}
              {item.notes && (
                <div className="rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Legenda</p>
                    {item.notes.length > 120 && (
                      <button onClick={() => setNotesExpanded(v => !v)}
                        className="text-[12px] text-blue-600 hover:text-blue-700 font-semibold transition-colors flex-shrink-0">
                        {notesExpanded ? 'Ver menos' : 'Ver mais'}
                      </button>
                    )}
                  </div>
                  <p className={`text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words select-text ${!notesExpanded ? 'line-clamp-3' : ''}`}>
                    {item.notes}
                  </p>
                </div>
              )}

              {/* Links */}
              {item.links && item.links.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Links</p>
                  <div className="space-y-1.5">
                    {item.links.map(link => (
                      <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-100 rounded-lg hover:bg-gray-100 transition-colors">
                        <Link2 className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        <span className="text-xs text-blue-600 truncate flex-1">{link.label || link.url}</span>
                        <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Outros anexos */}
              {otherAttachments.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Anexos</p>
                  <div className="space-y-1.5">
                    {otherAttachments.map((att: PlannerAttachment) => (
                      <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-2.5 bg-gray-50 border border-gray-100 rounded-lg hover:bg-gray-100 transition-colors">
                        <FileTypeIcon type={att.file_type} size="md" />
                        <span className="text-xs text-gray-700 truncate flex-1">{att.file_name}</span>
                        {att.file_size && <span className="text-[10px] text-gray-400 flex-shrink-0">{formatFileSize(att.file_size)}</span>}
                        <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Aprovação do cliente ── */}
              <div className="rounded-2xl border border-gray-100 overflow-hidden shadow-sm">

                {/* Card header */}
                <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                  <p className="text-[14px] font-bold text-gray-900">Aprovação do cliente</p>
                  <p className="text-[12px] text-gray-400 mt-0.5">Escolha como deseja aprovar este post.</p>
                </div>

                {/* ─ Opção 1: Aprovação completa ─ */}
                <div className="border-b border-gray-100">
                  <button
                    onClick={() => setExpandedSection(s => s === 'completa' ? 'partes' : 'completa')}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left ${expandedSection === 'completa' ? 'bg-green-50/70' : 'hover:bg-gray-50'}`}>
                    <div className="w-9 h-9 rounded-full bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-gray-800">Aprovação completa</p>
                      <p className="text-[11px] text-gray-400">Aprova todas as artes e textos do post de uma vez.</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expandedSection === 'completa' ? 'rotate-90' : ''}`} />
                  </button>
                  {expandedSection === 'completa' && (
                    <div className="px-4 pb-3.5">
                      {overallDecided ? (
                        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${approvalBg[localStatus]}`}>
                          <span className={approvalText[localStatus]}>{approvalIcons[localStatus]}</span>
                          <span className={`text-[12px] font-semibold ${approvalText[localStatus]}`}>{approvalLabels[localStatus]}</span>
                        </div>
                      ) : (
                        <button onClick={handleApproveAll} disabled={isBusy}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-all"
                          style={{ color: '#ffffff' }}>
                          {busyField === 'all'
                            ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <CheckCircle2 className="w-4 h-4" />}
                          Aprovar tudo de uma vez
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ─ Opção 2: Aprovação por partes ─ */}
                <div>
                  <button
                    onClick={() => setExpandedSection(s => s === 'partes' ? 'completa' : 'partes')}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left ${expandedSection === 'partes' ? 'bg-indigo-50/60' : 'hover:bg-gray-50'}`}>
                    <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-gray-800">Aprovação por partes</p>
                      <p className="text-[11px] text-gray-400">Aprove ou reprove cada arte ou texto individualmente.</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expandedSection === 'partes' ? 'rotate-90' : ''}`} />
                  </button>

                  {expandedSection === 'partes' && (
                    <div className="px-4 pb-4 space-y-4 border-t border-gray-50">

                      {/* ── ARTE ── */}
                      <div className="pt-3">
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Arte</span>
                            <span className="text-[9px] text-gray-300">·</span>
                            <span className="text-[10px] text-gray-400">Imagem, vídeo ou carrossel</span>
                          </div>
                          <div className={`flex items-center gap-1 text-[10px] font-semibold ${approvalText[displayArtStatus]}`}>
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${approvalDot[displayArtStatus]}`} />
                            {approvalLabels[displayArtStatus]}
                          </div>
                        </div>

                        {artDecided ? (
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${approvalBg[displayArtStatus]}`}>
                            <span className={approvalText[displayArtStatus]}>{approvalIcons[displayArtStatus]}</span>
                            <span className={`text-[11px] font-semibold ${approvalText[displayArtStatus]}`}>{approvalLabels[displayArtStatus]}</span>
                          </div>
                        ) : isCarousel ? (
                          /* Carrossel: seletor por slide sincronizado com o painel esquerdo */
                          <div className="space-y-3">
                            {/* Barra de progresso dos slides */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {mediaItems.map((slide, i) => {
                                const sd = slideDecisions[slide.id]
                                const ss = sd?.status
                                const isPending = sd?.pendingStatus !== null
                                const isActive = i === mediaIdx
                                const dotColor = ss === 'aprovado' ? 'bg-green-500'
                                  : ss === 'ajuste_solicitado' ? 'bg-orange-400'
                                  : ss === 'reprovado' ? 'bg-red-500'
                                  : isPending ? 'bg-yellow-400'
                                  : 'bg-gray-200'
                                return (
                                  <button key={slide.id} onClick={() => setMediaIdx(i)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all
                                      ${isActive ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                                    Slide {i + 1}
                                  </button>
                                )
                              })}
                            </div>

                            {/* Controles do slide atual */}
                            {(() => {
                              const slide = mediaItems[mediaIdx]
                              if (!slide) return null
                              const sd = slideDecisions[slide.id]
                              const ss = sd?.status
                              const pending = sd?.pendingStatus
                              const needsFeedback = pending === 'ajuste_solicitado' || pending === 'reprovado'
                              const isConfirmed = ss !== null && pending === null

                              return (
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2.5">
                                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                                    Slide {mediaIdx + 1} de {mediaItems.length}
                                    {isConfirmed && (
                                      <span className={`ml-2 font-semibold ${ss === 'aprovado' ? 'text-green-600' : ss === 'ajuste_solicitado' ? 'text-orange-600' : 'text-red-600'}`}>
                                        · {ss === 'aprovado' ? 'Aprovado' : ss === 'ajuste_solicitado' ? 'Ajuste solicitado' : 'Reprovado'}
                                      </span>
                                    )}
                                  </p>

                                  {isConfirmed ? (
                                    /* Slide já decidido — mostra status + botão para alterar */
                                    <div className="space-y-1.5">
                                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-semibold
                                        ${ss === 'aprovado' ? 'bg-green-50 border-green-200 text-green-700'
                                          : ss === 'ajuste_solicitado' ? 'bg-orange-50 border-orange-200 text-orange-700'
                                          : 'bg-red-50 border-red-200 text-red-700'}`}>
                                        {ss === 'aprovado' ? <CheckCircle2 className="w-3.5 h-3.5" />
                                          : ss === 'ajuste_solicitado' ? <AlertCircle className="w-3.5 h-3.5" />
                                          : <XCircle className="w-3.5 h-3.5" />}
                                        {ss === 'aprovado' ? 'Aprovado' : ss === 'ajuste_solicitado' ? 'Ajuste solicitado' : 'Reprovado'}
                                      </div>
                                      {sd.feedback && (
                                        <div className="flex items-start gap-1.5 px-2.5 py-2 bg-white border border-gray-100 rounded-lg">
                                          <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                                          <p className="text-[11px] text-gray-600">{sd.feedback}</p>
                                        </div>
                                      )}
                                      <button onClick={() => setSlideDecisions(prev => ({ ...prev, [slide.id]: { status: null, feedback: '', pendingStatus: null } }))}
                                        className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
                                        Alterar decisão
                                      </button>
                                    </div>
                                  ) : (
                                    /* Slide aguardando decisão */
                                    <div className="space-y-2">
                                      <div className="grid grid-cols-3 gap-2">
                                        <button onClick={async () => {
                                            // Aprovar não precisa de feedback — confirma direto
                                            const updatedDecisions = {
                                              ...slideDecisions,
                                              [slide.id]: { status: 'aprovado' as const, feedback: '', pendingStatus: null }
                                            }
                                            setSlideDecisions(updatedDecisions)
                                            const allDecided = mediaItems.every(m => updatedDecisions[m.id]?.status !== null && updatedDecisions[m.id]?.pendingStatus === null)
                                            if (!allDecided) return
                                            const statuses = mediaItems.map(m => updatedDecisions[m.id].status!)
                                            const aggregate: ApprovalStatus = statuses.every(s => s === 'aprovado') ? 'aprovado' : statuses.some(s => s === 'reprovado') ? 'reprovado' : 'ajuste_solicitado'
                                            const feedbackData = mediaItems.map((m, i) => ({ slide: i + 1, status: updatedDecisions[m.id].status!, feedback: updatedDecisions[m.id].feedback }))
                                            setBusyField('art')
                                            try {
                                              await submitPartial.mutateAsync({ plannerId: item.id, field: 'art', status: aggregate, feedback: JSON.stringify(feedbackData), currentArtStatus: localArtStatus, currentCopyStatus: localCopyStatus })
                                              setLocalArtStatus(aggregate); setLocalStatus(computeClientOverall(aggregate, localCopyStatus))
                                              toast('Carrossel avaliado! ✓', 'success')
                                            } catch (err: any) { toast(err.message, 'error') }
                                            finally { setBusyField(null) }
                                          }} disabled={isBusy}
                                          className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border bg-green-50 border-green-200 text-green-700 hover:bg-green-100 transition-all disabled:opacity-50">
                                          <CheckCircle2 className="w-3 h-3" /> Aprovar
                                        </button>
                                        <button onClick={() => handleSlideStatus(slide.id, 'ajuste_solicitado')} disabled={isBusy}
                                          className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border transition-all disabled:opacity-50
                                            ${pending === 'ajuste_solicitado' ? 'bg-orange-100 border-orange-400 text-orange-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                                          <AlertCircle className="w-3 h-3" /> Solicitar ajuste
                                        </button>
                                        <button onClick={() => handleSlideStatus(slide.id, 'reprovado')} disabled={isBusy}
                                          className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border transition-all disabled:opacity-50
                                            ${pending === 'reprovado' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                                          <XCircle className="w-3 h-3" /> Reprovar
                                        </button>
                                      </div>
                                      {needsFeedback && (
                                        <div className="space-y-2">
                                          <textarea
                                            value={sd.feedback}
                                            onChange={e => setSlideDecisions(prev => ({ ...prev, [slide.id]: { ...prev[slide.id], feedback: e.target.value } }))}
                                            placeholder={pending === 'ajuste_solicitado' ? 'O que precisa ajustar neste slide?' : 'Por que este slide foi reprovado?'}
                                            rows={2}
                                            className="w-full text-[11px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                                          />
                                          <div className="flex items-center gap-2">
                                            <button onClick={() => confirmSlideDecision(slide.id)} disabled={isBusy}
                                              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-all disabled:opacity-50
                                                ${pending === 'ajuste_solicitado' ? 'bg-orange-500 border-orange-500' : 'bg-red-500 border-red-500'}`}
                                              style={{ color: '#fff' }}>
                                              {isBusy ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                              Confirmar
                                            </button>
                                            <button onClick={() => setSlideDecisions(prev => ({ ...prev, [slide.id]: { ...prev[slide.id], pendingStatus: null } }))}
                                              className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                                              Cancelar
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                      {!needsFeedback && (
                                        <button onClick={() => confirmSlideDecision(slide.id)} disabled={isBusy || sd.status === null}
                                          className="text-[10px] text-blue-500 hover:text-blue-700 font-medium transition-colors disabled:opacity-0">
                                          Confirmar e ir para próximo
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                            {/* Resumo + contador de progresso */}
                            {(() => {
                              const decided = mediaItems.filter(m => slideDecisions[m.id]?.status !== null && slideDecisions[m.id]?.pendingStatus === null).length
                              const total = mediaItems.length
                              return decided > 0 && decided < total ? (
                                <p className="text-[10px] text-gray-400">
                                  {decided} de {total} slides avaliados · navegue pelos slides para avaliar todos
                                </p>
                              ) : null
                            })()}
                          </div>
                        ) : (
                          /* Arte única */
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                              <button onClick={() => handleArtAction('aprovado')} disabled={isBusy}
                                className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border bg-green-50 border-green-200 text-green-700 hover:bg-green-100 transition-all disabled:opacity-50">
                                {busyField === 'art' && !artPending ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                Aprovar
                              </button>
                              <button onClick={() => handleArtAction('ajuste_solicitado')} disabled={isBusy}
                                className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border transition-all disabled:opacity-50
                                  ${artPending === 'ajuste_solicitado' ? 'bg-orange-100 border-orange-400 text-orange-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                                <AlertCircle className="w-3 h-3" /> Solicitar ajuste
                              </button>
                              <button onClick={() => handleArtAction('reprovado')} disabled={isBusy}
                                className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border transition-all disabled:opacity-50
                                  ${artPending === 'reprovado' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                                <XCircle className="w-3 h-3" /> Reprovar
                              </button>
                            </div>
                            {artNeedsFeedback && (
                              <div className="space-y-2">
                                <textarea value={artFeedback} onChange={e => setArtFeedback(e.target.value)}
                                  placeholder="O que precisa ajustar na arte?" rows={2}
                                  className="w-full text-[11px] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none" />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleArtAction(artPending!)}
                                    disabled={isBusy}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-all disabled:opacity-50
                                      ${artPending === 'ajuste_solicitado' ? 'bg-orange-500 border-orange-500' : 'bg-red-500 border-red-500'}`}
                                    style={{ color: '#fff' }}>
                                    {busyField === 'art'
                                      ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      : <CheckCircle2 className="w-3 h-3" />}
                                    Confirmar
                                  </button>
                                  <button onClick={() => setArtPending(null)} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Feedback arte salvo — carrossel vira lista por slide; texto simples fica como está */}
                        {artFeedback && (artResolved === 'reprovado' || artResolved === 'ajuste_solicitado') && (
                          <ClientFeedbackView feedback={artFeedback} />
                        )}
                      </div>

                      <div className="h-px bg-gray-100" />

                      {/* ── COPY ── */}
                      <div>
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Copy</span>
                            <span className="text-[9px] text-gray-300">·</span>
                            <span className="text-[10px] text-gray-400">Legenda e texto do post</span>
                          </div>
                          <div className={`flex items-center gap-1 text-[10px] font-semibold ${approvalText[displayCopyStatus]}`}>
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${approvalDot[displayCopyStatus]}`} />
                            {approvalLabels[displayCopyStatus]}
                          </div>
                        </div>

                        {copyDecided ? (
                          <div>
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${approvalBg[displayCopyStatus]}`}>
                              <span className={approvalText[displayCopyStatus]}>{approvalIcons[displayCopyStatus]}</span>
                              <span className={`text-[11px] font-semibold ${approvalText[displayCopyStatus]}`}>{approvalLabels[displayCopyStatus]}</span>
                            </div>
                            {copyFeedback && (copyResolved === 'ajuste_solicitado' || copyResolved === 'reprovado') && !needsReview && (
                              <div className="mt-2 flex items-start gap-2 p-2.5 bg-gray-50 border border-gray-100 rounded-xl">
                                <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-gray-600 leading-relaxed">{copyFeedback}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                              <button onClick={() => handleCopyAction('aprovado')} disabled={isBusy}
                                className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border bg-green-50 border-green-200 text-green-700 hover:bg-green-100 transition-all disabled:opacity-50">
                                {busyField === 'copy' && !copyPending ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                Aprovar
                              </button>
                              <button onClick={() => handleCopyAction('ajuste_solicitado')} disabled={isBusy}
                                className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border transition-all disabled:opacity-50
                                  ${copyPending === 'ajuste_solicitado' ? 'bg-orange-100 border-orange-400 text-orange-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                                <AlertCircle className="w-3 h-3" />
                                Solicitar ajuste
                              </button>
                              <button onClick={() => handleCopyAction('reprovado')} disabled={isBusy}
                                className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[12px] font-semibold border transition-all disabled:opacity-50
                                  ${copyPending === 'reprovado' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                                <XCircle className="w-3 h-3" />
                                Reprovar
                              </button>
                            </div>
                            {copyNeedsFeedback && (
                              <div className="space-y-2">
                                <textarea value={copyFeedback} onChange={e => setCopyFeedback(e.target.value)}
                                  placeholder="O que precisa ajustar na copy?" rows={2}
                                  className="w-full text-[11px] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none" />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleCopyAction(copyPending!)}
                                    disabled={isBusy}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-all disabled:opacity-50
                                      ${copyPending === 'ajuste_solicitado' ? 'bg-orange-500 border-orange-500' : 'bg-red-500 border-red-500'}`}
                                    style={{ color: '#fff' }}>
                                    {busyField === 'copy'
                                      ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      : <CheckCircle2 className="w-3 h-3" />}
                                    Confirmar
                                  </button>
                                  <button onClick={() => setCopyPending(null)} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>
              </div>

              {/* Comentários */}
              <div className="pb-2">
                <PlannerCommentsThread plannerId={item.id} role="client" />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Chip style helper (mesmo sistema de cores da agência) ───────────────────

function getPortalChipStyle(item: PlannerItem): { bg: string; border: string; text: string } {
  const s = item.status as PlannerStatus
  const as_ = (item.approval_status || 'pendente_aprovacao') as ApprovalStatus
  // Publicado tem prioridade máxima
  if (s === 'publicado') return { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' }
  // Aprovado pelo cliente (status de produção OU approval_status) → verde
  if (s === 'aprovado' || as_ === 'aprovado') return { bg: '#f0fdf4', border: '#86efac', text: '#166534' }
  // Demais estados de aprovação do cliente
  if (as_ === 'reprovado')         return { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' }
  if (as_ === 'ajuste_solicitado') return { bg: '#fff7ed', border: '#fdba74', text: '#9a3412' }
  if (as_ === 'ajuste_realizado')  return { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' }
  // Fallback por status de produção
  if (s === 'revisao')   return { bg: '#fefce8', border: '#fde047', text: '#854d0e' }
  if (s === 'producao')  return { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' }
  return { bg: '#faf5ff', border: '#c4b5fd', text: '#5b21b6' }
}

// ─── Portal Planner (read-only) ───────────────────────────────────────────────

type PortalApprovalFilter = ApprovalStatus | 'todos'

const PORTAL_FILTER_OPTIONS: { key: PortalApprovalFilter; label: string; dot: string; activeBg: string; activeBorder: string; activeText: string }[] = [
  { key: 'todos',               label: 'Todos',             dot: 'bg-gray-400',   activeBg: 'bg-gray-100',    activeBorder: 'border-gray-400',   activeText: 'text-gray-700' },
  { key: 'pendente_aprovacao',  label: 'Pendente',          dot: 'bg-yellow-400', activeBg: 'bg-yellow-50',   activeBorder: 'border-yellow-400', activeText: 'text-yellow-700' },
  { key: 'aprovado',            label: 'Aprovado',          dot: 'bg-green-500',  activeBg: 'bg-green-50',    activeBorder: 'border-green-500',  activeText: 'text-green-700' },
  { key: 'ajuste_solicitado',   label: 'Ajuste solicitado', dot: 'bg-orange-400', activeBg: 'bg-orange-50',   activeBorder: 'border-orange-400', activeText: 'text-orange-700' },
  { key: 'ajuste_realizado',    label: 'Ajuste realizado',  dot: 'bg-blue-500',   activeBg: 'bg-blue-50',     activeBorder: 'border-blue-500',   activeText: 'text-blue-700' },
  { key: 'reprovado',           label: 'Reprovado',         dot: 'bg-red-500',    activeBg: 'bg-red-50',      activeBorder: 'border-red-500',    activeText: 'text-red-700' },
]

// Mesmas cores de status do Planejamento da agência (utils/planStatus)
const PORTAL_FILTER_DOT: Record<PortalApprovalFilter, string> = {
  todos: '#0F172A', pendente_aprovacao: '#EAB308', aprovado: '#22C55E',
  ajuste_solicitado: '#F97316', ajuste_realizado: '#3B82F6', reprovado: '#EF4444',
}

function PortalPlannerView({
  items,
  autoOpenItemId,
  onItemAutoOpened,
}: {
  items: PlannerItem[]
  autoOpenItemId?: string | null
  onItemAutoOpened?: () => void
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [hover, setHover] = useState<HoverState | null>(null)
  const [dayItems, setDayItems] = useState<PlannerItem[]>([])
  const [dayDate, setDayDate] = useState<Date | null>(null)
  const [dayOpen, setDayOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PlannerItem | null>(null)
  const [itemOpen, setItemOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  const [approvalFilter, setApprovalFilter] = useState<PortalApprovalFilter>('todos')

  // Itens filtrados pelo status de aprovação
  const filteredItems = useMemo(() => {
    if (approvalFilter === 'todos') return items
    return items.filter(i => {
      const status = (i.approval_status || 'pendente_aprovacao') as ApprovalStatus
      return status === approvalFilter
    })
  }, [items, approvalFilter])

  // Contagem por status para os chips
  const countByStatus = useMemo(() => {
    const counts: Record<PortalApprovalFilter, number> = {
      todos: items.length,
      pendente_aprovacao: 0,
      aprovado: 0,
      ajuste_solicitado: 0,
      ajuste_realizado: 0,
      reprovado: 0,
    }
    items.forEach(i => {
      const s = (i.approval_status || 'pendente_aprovacao') as ApprovalStatus
      if (s in counts) counts[s]++
    })
    return counts
  }, [items])

  // Auto-abrir item ao receber autoOpenItemId (vindo de notificação)
  useEffect(() => {
    if (!autoOpenItemId || !items.length) return
    const found = items.find(i => i.id === autoOpenItemId)
    if (found) {
      setSelectedItem(found)
      setItemOpen(true)
      onItemAutoOpened?.()
    }
  }, [autoOpenItemId, items])

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { locale: ptBR })
  const calEnd = endOfWeek(monthEnd, { locale: ptBR })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const getDay = (day: Date) => filteredItems.filter(i => isSameDay(parseISO(i.scheduled_date), day))

  const handleDayClick = (day: Date, di: PlannerItem[]) => {
    if (di.length === 0) return
    setDayDate(day)
    setDayItems(di)
    setDayOpen(true)
    setHover(null)
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>, di: PlannerItem[]) => {
    if (di.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const tooltipWidth = 268
    const left = rect.right + 8 + tooltipWidth > window.innerWidth ? rect.left - tooltipWidth - 4 : rect.right + 8
    const top = Math.min(rect.top, window.innerHeight - Math.min(di.length * 130, 380) - 16)
    setHover({ items: di, top, left })
  }

  return (
    <div>
      {/* ── Filtros de aprovação ── */}
      <div className="flex flex-wrap gap-2 mb-8">
        {PORTAL_FILTER_OPTIONS.map(opt => {
          const count = countByStatus[opt.key]
          if (opt.key !== 'todos' && count === 0) return null
          return (
            <PortalFilterChip
              key={opt.key}
              active={approvalFilter === opt.key}
              label={opt.label}
              count={count}
              dot={PORTAL_FILTER_DOT[opt.key]}
              onClick={() => setApprovalFilter(opt.key)}
            />
          )
        })}
      </div>

      {/* ── Mês em display + navegação ── */}
      <div className="flex items-end justify-between gap-4 mb-5">
        <h3 className="font-display font-bold text-[#0F172A] capitalize leading-none tracking-[-0.035em]" style={{ fontSize: 'clamp(26px, 3.2vw, 38px)' }}>
          {format(currentMonth, 'MMMM', { locale: ptBR })}{' '}
          <span className="text-[#A0A8B5] font-semibold">{format(currentMonth, 'yyyy')}</span>
        </h3>
        <div className="flex items-center gap-1 p-1 rounded-full border border-[#E4E7EC] bg-white">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} title="Mês anterior"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#5B6576] hover:bg-[#F6F7F9] hover:text-[#0F172A] transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentMonth(new Date())}
            className="h-8 px-3.5 rounded-full text-[12px] font-semibold text-[#0F172A] hover:bg-[#F6F7F9] transition-colors">
            Hoje
          </button>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} title="Próximo mês"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#5B6576] hover:bg-[#F6F7F9] hover:text-[#0F172A] transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Calendário ── */}
      <div className={`${portalPanel} p-2 sm:p-4`}>
          <div className="w-full max-w-full min-w-0">
          <div className="grid grid-cols-7 mb-1 sm:mb-2 border-b border-[#EEF0F3]">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="text-center text-[9px] sm:text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#8A94A6] py-2 sm:py-3 truncate">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {days.map(day => {
              const di = getDay(day)
              const inMonth = isSameMonth(day, currentMonth)
              const today = isToday(day)
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => inMonth && handleDayClick(day, di)}
                  onMouseEnter={!isMobile ? e => inMonth && handleMouseEnter(e, di) : undefined}
                  onMouseLeave={!isMobile ? () => setHover(null) : undefined}
                  className={`
                    min-h-[52px] sm:min-h-[96px] p-0.5 sm:p-2 rounded-md sm:rounded-xl border transition-all duration-300
                    ${inMonth ? 'border-[#EEF0F3] bg-white' : 'border-transparent opacity-30 cursor-default'}
                    ${inMonth && di.length > 0 ? 'hover:border-[#0F172A]/30 hover:bg-[#FAFBFC] cursor-pointer' : ''}
                    ${today ? '!border-[#2563EB]/50 !bg-[#EFF4FF]' : ''}
                  `}
                >
                  <div className={`text-[10px] sm:text-[12px] font-semibold tabular-nums mb-0.5 sm:mb-1.5 w-4 h-4 sm:w-6 sm:h-6 flex items-center justify-center rounded-full
                    ${today ? 'text-white' : inMonth ? 'text-[#0F172A]' : 'text-gray-400'}`}
                    style={today ? { background: '#2563EB', color: '#ffffff' } : undefined}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {di.slice(0, 2).map(item => {
                      const { bg, border, text } = getPortalChipStyle(item)
                      const typeLabel = contentTypeLabels[item.content_type as ContentType] ?? ''
                      return (
                        <div
                          key={item.id}
                          onClick={e => { e.stopPropagation(); setSelectedItem(item); setItemOpen(true) }}
                          style={{ backgroundColor: bg, borderColor: border, color: text }}
                          className="w-full rounded border px-1 py-0.5 min-w-0 cursor-pointer hover:brightness-95 transition-opacity"
                        >
                          <div className="flex items-start gap-0.5 min-w-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-[8px] sm:text-[9px] font-medium leading-tight truncate">{item.title}</p>
                              {typeLabel && (
                                <p className="text-[7px] sm:text-[8px] leading-tight truncate opacity-70 hidden sm:block">{typeLabel}</p>
                              )}
                            </div>
                            <Instagram className="w-2 h-2 sm:w-2.5 sm:h-2.5 flex-shrink-0 mt-px opacity-50" strokeWidth={1.5} />
                          </div>
                        </div>
                      )
                    })}
                    {di.length > 2 && <p className="text-[8px] sm:text-[10px] text-[#64748b]">+{di.length - 2}</p>}
                  </div>
                </div>
              )
            })}
          </div>
          </div>
      </div>

      {/* Legend */}
      <div className="flex gap-x-5 gap-y-2 mt-5 flex-wrap">
        {(Object.entries(statusColors) as [PlannerStatus, string][]).map(([s, c]) => (
          <div key={s} className="flex items-center gap-1.5 text-[12px] text-[#5B6576]">
            <div className={`w-2 h-2 rounded-full ${c}`} />
            {statusLabels[s]}
          </div>
        ))}
      </div>

      {/* Tooltip — desktop only */}
      <AnimatePresence>
        {!isMobile && hover && <DayTooltip state={hover} />}
      </AnimatePresence>

      {/* Day modal */}
      <Dialog open={dayOpen} onOpenChange={setDayOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>
              {dayDate && format(dayDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </DialogTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              {dayItems.length} {dayItems.length === 1 ? 'post planejado' : 'posts planejados'} · clique para ver detalhes
            </p>
          </DialogHeader>
          <div className="space-y-3 my-1 min-w-0 w-full max-w-full overflow-x-hidden">
            {dayItems.map(item => {
              const thumb = item.attachments?.find(a => a.file_type.startsWith('image/'))
              return (
                <div
                  key={item.id}
                  onClick={() => { setDayOpen(false); setSelectedItem(item); setItemOpen(true) }}
                  className="flex items-start gap-3 p-3 bg-white border border-[#e8e8e8] rounded-xl cursor-pointer hover:bg-[#f5f5f5] hover:border-[#d0d0d0] transition-colors group"
                >
                  {thumb && (
                    <img src={thumb.file_url} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0 border border-[#e8e8e8]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColors[item.status as PlannerStatus]}`} />
                      <p className="font-medium text-[#0f0f0f] text-sm break-words">{item.title}</p>
                    </div>
                    <p className="text-xs text-[#737373] ml-3.5">
                      {contentTypeLabels[item.content_type as ContentType]} · {statusLabels[item.status as PlannerStatus]}
                    </p>
                    {item.approval_status && item.approval_status !== 'pendente_aprovacao' && (
                      <span className={`ml-3.5 inline-flex items-center gap-1 text-[10px] font-medium ${approvalText[item.approval_status as ApprovalStatus]}`}>
                        {approvalIcons[item.approval_status as ApprovalStatus]}
                        {approvalLabels[item.approval_status as ApprovalStatus]}
                      </span>
                    )}
                    {item.notes && (
                      <p className="text-xs text-[#737373] line-clamp-1 ml-3.5 mt-0.5">{item.notes}</p>
                    )}
                    <div className="flex items-center gap-3 ml-3.5 mt-1.5">
                      {item.attachments && item.attachments.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Paperclip className="w-3 h-3 text-[#a0a0a0]" />
                          <span className="text-[11px] text-[#737373]">{item.attachments.length} {item.attachments.length === 1 ? 'anexo' : 'anexos'}</span>
                        </div>
                      )}
                      {item.links && item.links.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Link2 className="w-3 h-3 text-blue-500" />
                          <span className="text-[11px] text-blue-600">{item.links.length} {item.links.length === 1 ? 'link' : 'links'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#a0a0a0] group-hover:text-[#737373] transition-colors flex-shrink-0 mt-0.5" />
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDayOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedItem && (
        <ItemDetailView
          item={selectedItem}
          open={itemOpen}
          onClose={() => { setItemOpen(false); setSelectedItem(null) }}
        />
      )}
    </div>
  )
}

// ─── Dashboard helpers ────────────────────────────────────────────────────────

function humanizeActivity(status: ApprovalStatus, _item: PlannerItem): string {
  switch (status) {
    case 'aprovado':          return 'Você aprovou um conteúdo'
    case 'reprovado':         return 'Você reprovou um conteúdo'
    case 'ajuste_solicitado': return 'Você solicitou ajuste em um conteúdo'
    case 'ajuste_realizado':  return 'A agência realizou o ajuste solicitado'
    default:                  return 'Conteúdo enviado para revisão'
  }
}

type CardColor = 'amber' | 'green' | 'blue' | 'purple' | 'default'

const cardColorMap: Record<CardColor, { icon: string; label: string; value: string; ring: string; dot: string; bar: string }> = {
  amber:   { icon: 'text-orange-800',  label: 'text-orange-900',  value: 'text-orange-900',  ring: 'border-orange-200  bg-orange-50',   dot: 'bg-orange-400',  bar: 'bg-[#f97316]' },
  green:   { icon: 'text-green-800',   label: 'text-green-900',   value: 'text-green-900',   ring: 'border-green-200   bg-green-50',    dot: 'bg-green-500',   bar: 'bg-[#3fa06e]' },
  blue:    { icon: 'text-blue-800',    label: 'text-blue-900',    value: 'text-blue-900',    ring: 'border-blue-200    bg-blue-50',     dot: 'bg-blue-500',    bar: 'bg-[#3b82f6]' },
  purple:  { icon: 'text-purple-800',  label: 'text-purple-900',  value: 'text-purple-900',  ring: 'border-purple-200  bg-purple-50',   dot: 'bg-purple-500',  bar: 'bg-[#8b5cf6]' },
  default: { icon: 'text-gray-500',    label: 'text-[#737373]',   value: 'text-[#0f0f0f]',   ring: 'border-[#e8e8e8]   bg-white',      dot: 'bg-gray-400',    bar: 'bg-[#e2e8f0]' },
}

function StatusCard({
  icon, label, value, color, onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: CardColor
  onClick?: () => void
}) {
  const c = cardColorMap[color]
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border overflow-hidden flex flex-col transition-all shadow-sm ${c.ring} ${onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.01]' : ''}`}
    >
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between">
          <span className={c.icon}>{icon}</span>
          <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        </div>
        <div>
          <p className={`text-[11px] leading-snug ${c.label}`}>{label}</p>
          <p className={`text-[13px] font-semibold mt-1 leading-tight ${c.value}`}>{value}</p>
        </div>
      </div>
      <div className={`h-1 w-full ${c.bar}`} />
    </div>
  )
}

function AgencyWorkItem({
  icon, label, detail,
}: {
  icon: React.ReactNode
  label: string
  detail: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-lg bg-[#f0f0f0] border border-[#e8e8e8] flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-[#0f0f0f] truncate">{label}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">{detail}</p>
      </div>
      <div className="w-1.5 h-1.5 rounded-full bg-green-400/60 flex-shrink-0" />
    </div>
  )
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function ClientDashboardTab({
  client,
  plannerItems,
  contents,
  onNavigate,
  firstName,
  payments,
}: {
  client: Client
  plannerItems: PlannerItem[]
  contents: Content[]
  onNavigate: (tab: string) => void
  firstName: string
  payments: Array<{ status: string; payment_date: string }>
}) {
  const [selectedItem, setSelectedItem] = useState<PlannerItem | null>(null)
  const [itemOpen, setItemOpen] = useState(false)

  const today = startOfToday()

  const pendingItems = plannerItems.filter(
    i => i.approval_status === 'pendente_aprovacao' || (i.status === 'revisao' && !i.approval_status)
  )
  const approvedThisMonth = plannerItems.filter(
    i => i.approval_status === 'aprovado' && isThisMonth(parseISO(i.scheduled_date))
  )
  const thisMonthItems = plannerItems.filter(i => isThisMonth(parseISO(i.scheduled_date)))
  const publishedItems = plannerItems.filter(i => i.status === 'publicado')
  const inProductionCount = plannerItems.filter(i => i.status === 'producao' || i.status === 'revisao').length
  const inIdeaCount = plannerItems.filter(i => i.status === 'ideia').length

  const upcomingItems = plannerItems
    .filter(i => !isBefore(parseISO(i.scheduled_date), today))
    .sort((a, b) => parseISO(a.scheduled_date).getTime() - parseISO(b.scheduled_date).getTime())
    .slice(0, 5)
  const recentActivity = plannerItems
    .filter(i => i.reviewed_at)
    .sort((a, b) => parseISO(b.reviewed_at!).getTime() - parseISO(a.reviewed_at!).getTime())
    .slice(0, 5)

  // Financial alert — only show for 'vence_em_breve'
  const financialStatus = calcFinancialStatus(client)
  const financialAux = getFinancialAuxText(client, financialStatus)
  const showFinancialAlert = financialStatus === 'vence_em_breve'
    && client.dia_vencimento != null
    && !hasPaidCurrentCycle(payments, client.dia_vencimento)

  // Dynamic hero copy
  const headline = pendingItems.length > 0
    ? pendingItems.length === 1
      ? 'Você tem 1 conteúdo aguardando sua aprovação'
      : `Você tem ${pendingItems.length} conteúdos aguardando sua aprovação`
    : plannerItems.length === 0
      ? 'Estamos preparando seus primeiros conteúdos'
      : 'Seu planejamento está ativo e atualizado'

  const subline = pendingItems.length > 0
    ? 'Revise e aprove para manter o calendário em dia.'
    : plannerItems.length === 0
      ? 'Em breve você verá todos os conteúdos aqui.'
      : `${thisMonthItems.length} ${thisMonthItems.length === 1 ? 'conteúdo programado' : 'conteúdos programados'} para este mês.`

  return (
    <div>
      {/* ── 01 Abertura: saudação e manchete do momento ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.6fr] gap-8 lg:gap-14 items-end pb-9 sm:pb-12 border-b border-[#E4E7EC]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className={portalEyebrow}>
            <span className="text-[#2563EB] tabular-nums">01</span>
            <span className="mx-2 text-[#C4CAD4]">/</span>
            Olá, {firstName}
          </p>
          <h2
            className="font-display font-bold text-[#0F172A] mt-4 leading-[1.0] tracking-[-0.035em] max-w-[18ch]"
            style={{ fontSize: 'clamp(30px, 4.6vw, 56px)' }}
          >
            {pendingItems.length > 0 ? (
              <>
                Você tem{' '}
                <span className="text-[#2563EB]">
                  {pendingItems.length} {pendingItems.length === 1 ? 'conteúdo' : 'conteúdos'}
                </span>{' '}
                esperando a sua aprovação.
              </>
            ) : (
              headline + '.'
            )}
          </h2>
          <p className="text-[14px] leading-relaxed text-[#5B6576] mt-4 max-w-[52ch]">{subline}</p>
          {pendingItems.length > 0 && (
            <button
              onClick={() => { setSelectedItem(pendingItems[0]); setItemOpen(true) }}
              className="group mt-7 inline-flex items-center gap-3 h-12 pl-6 pr-2 rounded-full text-[13px] font-semibold transition-all duration-300 hover:gap-4"
              style={{ background: '#0F172A', color: '#ffffff' }}
            >
              Revisar agora
              <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center transition-transform duration-300 group-hover:-rotate-45">
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-3"
        >
          {showFinancialAlert && (
            <button
              onClick={() => onNavigate('financeiro')}
              className="group w-full text-left rounded-[18px] border border-[#F2D98A] bg-[#FFFBEB] px-5 py-4 flex items-start gap-3 transition-colors hover:border-[#EAB308]"
            >
              <span className="w-2 h-2 rounded-full bg-[#EAB308] mt-1.5 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-semibold text-[#854D0E]">Vence em breve</span>
                <span className="block text-[12.5px] text-[#92400E] mt-0.5 leading-snug">
                  {financialAux === 'Vence hoje' ? 'Seu pagamento vence hoje.' : `${financialAux}. Fique atento ao pagamento.`}
                </span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#92400E] mt-1 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </motion.div>
      </div>

      {/* ── Números do mês: uma faixa, fios de 1px ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#E4E7EC] border-b border-[#E4E7EC]"
      >
        {[
          { label: 'Aguardando você', value: pendingItems.length, note: pendingItems.length > 0 ? 'Toque para revisar' : 'Tudo revisado', dot: '#EAB308', go: pendingItems.length > 0 ? 'planejamento' : undefined, hot: pendingItems.length > 0 },
          { label: 'Aprovados no mês', value: approvedThisMonth.length, note: 'Prontos para publicar', dot: '#22C55E' },
          { label: 'Programados no mês', value: thisMonthItems.length, note: 'Ver o calendário', dot: '#2563EB', go: 'planejamento' },
          { label: 'Já publicados', value: publishedItems.length, note: 'No ar no seu perfil', dot: '#0F172A' },
        ].map(s => {
          const Tag = s.go ? 'button' : 'div'
          return (
            <Tag
              key={s.label}
              onClick={s.go ? () => onNavigate(s.go!) : undefined}
              className={`group text-left bg-[#F6F7F9] py-7 sm:py-9 px-4 sm:px-6 transition-colors ${s.go ? 'cursor-pointer hover:bg-white' : ''}`}
            >
              <p className="flex items-center gap-2 text-[11.5px] font-medium text-[#5B6576]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                {s.label}
              </p>
              <p
                className={`font-display font-bold tabular-nums leading-none tracking-[-0.05em] mt-4 ${s.hot ? 'text-[#2563EB]' : 'text-[#0F172A]'}`}
                style={{ fontSize: 'clamp(40px, 5vw, 64px)' }}
              >
                {s.value}
              </p>
              <p className={`text-[11.5px] mt-3 text-[#8A94A6] inline-flex items-center gap-1 ${s.go ? 'group-hover:text-[#0F172A] transition-colors' : ''}`}>
                {s.note}
                {s.go && <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />}
              </p>
            </Tag>
          )
        })}
      </motion.div>

      {/* ── Corpo: aprovação e andamento à esquerda, agenda à direita ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 mt-9 sm:mt-12">
        <div className="space-y-5 min-w-0">

          {/* Precisam da sua aprovação */}
          {pendingItems.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={`${portalPanel} overflow-hidden`}
            >
              <PortalBlockTitle
                label="Precisam da sua aprovação"
                count={pendingItems.length}
                right={<span className="w-2 h-2 rounded-full bg-[#EAB308] animate-pulse" />}
              />
              <div className="divide-y divide-[#EEF0F3]">
                {pendingItems.map(item => {
                  const thumb = item.attachments?.find(a => a.file_type.startsWith('image/'))
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setSelectedItem(item); setItemOpen(true) }}
                      className="group relative w-full flex items-center gap-4 px-5 sm:px-6 py-4 text-left transition-colors hover:bg-[#FAFBFC]"
                    >
                      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-[#EAB308]" />
                      {thumb ? (
                        <img src={thumb.file_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-[#E4E7EC] flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-[#F6F7F9] border border-[#E4E7EC] flex items-center justify-center flex-shrink-0">
                          <div className={`w-2 h-2 rounded-full ${statusColors[item.status as PlannerStatus]}`} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-[#0F172A] truncate">{item.title}</p>
                        <p className="text-[12px] text-[#8A94A6] mt-0.5">
                          {format(parseISO(item.scheduled_date), "dd 'de' MMMM", { locale: ptBR })}
                          <span className="mx-1.5 text-[#C4CAD4]">·</span>
                          {contentTypeLabels[item.content_type as ContentType]}
                        </p>
                      </div>
                      <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0F172A]">
                        <span className="hidden sm:inline">Revisar</span>
                        <span className="w-8 h-8 rounded-full border border-[#E4E7EC] flex items-center justify-center transition-all duration-300 group-hover:bg-[#0F172A] group-hover:border-[#0F172A] group-hover:text-white group-hover:-rotate-45">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </motion.section>
          )}

          {/* O que a agência está fazendo */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className={`${portalPanel} overflow-hidden`}
          >
            <PortalBlockTitle
              label="Em andamento na agência"
              right={
                <span className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse [animation-delay:300ms]" />
                </span>
              }
            />
            {plannerItems.length === 0 ? (
              <p className="px-6 py-5 text-[13px] text-[#5B6576]">A agência está preparando a estratégia inicial para você.</p>
            ) : (
              <div className="grid sm:grid-cols-2">
                {[
                  inIdeaCount > 0 && { n: inIdeaCount, label: 'Ideias em desenvolvimento', detail: inIdeaCount === 1 ? 'conteúdo na fase criativa' : 'conteúdos na fase criativa', icon: <Sparkles className="w-4 h-4" /> },
                  inProductionCount > 0 && { n: inProductionCount, label: 'Em produção', detail: inProductionCount === 1 ? 'item sendo criado' : 'itens sendo criados', icon: <CalendarDays className="w-4 h-4" /> },
                  { n: thisMonthItems.length, label: 'Planejamento do mês', detail: thisMonthItems.length === 1 ? 'conteúdo programado' : 'conteúdos programados', icon: <LayoutDashboard className="w-4 h-4" /> },
                  contents.length > 0 && { n: contents.length, label: 'Estratégia de conteúdo', detail: contents.length === 1 ? 'conteúdo gerado' : 'conteúdos gerados', icon: <MessageSquare className="w-4 h-4" /> },
                ].filter(Boolean).map((w, i) => {
                  const it = w as { n: number; label: string; detail: string; icon: React.ReactNode }
                  return (
                    <div key={it.label} className={`flex items-center gap-4 px-5 sm:px-6 py-4 border-[#EEF0F3] ${i > 0 ? 'border-t' : ''} ${i === 1 ? 'sm:border-t-0' : ''} ${i % 2 === 0 ? 'sm:border-r' : ''} ${i >= 2 ? 'sm:border-t' : ''}`}>
                      <span className="w-10 h-10 rounded-xl bg-[#F6F7F9] text-[#5B6576] flex items-center justify-center flex-shrink-0">{it.icon}</span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#0F172A] truncate">{it.label}</p>
                        <p className="text-[12px] text-[#8A94A6]"><span className="tabular-nums text-[#0F172A] font-medium">{it.n}</span> {it.detail}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.section>

          {/* Atividade recente: linha do tempo com fio */}
          {recentActivity.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className={`${portalPanel} overflow-hidden`}
            >
              <PortalBlockTitle label="Atividade recente" />
              <ol className="px-5 sm:px-6 py-5 relative">
                <span className="absolute left-[33px] sm:left-[37px] top-7 bottom-7 w-px bg-[#E4E7EC]" />
                {recentActivity.map(item => {
                  const status = (item.approval_status || 'pendente_aprovacao') as ApprovalStatus
                  return (
                    <li key={item.id} className="relative flex items-start gap-4 py-2.5">
                      <span className={`relative z-10 w-6 h-6 rounded-full bg-white border border-[#E4E7EC] flex items-center justify-center flex-shrink-0 ${approvalText[status]} [&>svg]:w-3 [&>svg]:h-3`}>
                        {approvalIcons[status]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#0F172A]">{humanizeActivity(status, item)}</p>
                        <p className="text-[12px] text-[#5B6576] truncate mt-0.5">{item.title}</p>
                      </div>
                      {item.reviewed_at && (
                        <span className="text-[11px] text-[#A0A8B5] flex-shrink-0 mt-0.5">{formatRelative(item.reviewed_at)}</span>
                      )}
                    </li>
                  )
                })}
              </ol>
            </motion.section>
          )}
        </div>

        {/* ── Coluna direita ── */}
        <div className="space-y-5">
          {/* Próximos conteúdos: agenda com a data em destaque */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.22 }}
            className={`${portalPanel} overflow-hidden`}
          >
            <PortalBlockTitle
              label="Próximos conteúdos"
              right={
                <button
                  onClick={() => onNavigate('planejamento')}
                  className="group inline-flex items-center gap-1 text-[12px] font-medium text-[#2563EB]"
                >
                  Ver todos <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                </button>
              }
            />
            {upcomingItems.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-[13px] text-[#5B6576]">Nenhum conteúdo agendado.</p>
                <p className="text-[12px] text-[#A0A8B5] mt-1">A agência está preparando o calendário.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#EEF0F3]">
                {upcomingItems.map(item => {
                  const isPending = item.approval_status === 'pendente_aprovacao'
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setSelectedItem(item); setItemOpen(true) }}
                      className="group w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[#FAFBFC]"
                    >
                      <div className="w-11 flex-shrink-0 text-center">
                        <p className="font-display text-[24px] font-bold text-[#0F172A] tabular-nums leading-none tracking-[-0.04em]">
                          {format(parseISO(item.scheduled_date), 'd')}
                        </p>
                        <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#8A94A6] mt-1">
                          {format(parseISO(item.scheduled_date), 'MMM', { locale: ptBR }).replace('.', '')}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0 border-l border-[#EEF0F3] pl-4">
                        <p className="text-[13px] font-medium text-[#0F172A] truncate">{item.title}</p>
                        <p className="text-[11.5px] text-[#8A94A6] mt-0.5 flex items-center gap-1.5">
                          {isPending && <span className="w-1.5 h-1.5 rounded-full bg-[#EAB308]" />}
                          {contentTypeLabels[item.content_type as ContentType]}
                          {isPending && <span className="text-[#A16207]">· aguardando</span>}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[#C4CAD4] group-hover:text-[#0F172A] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            )}
          </motion.section>

          {/* Conversa com a agência */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.28 }}
            className="relative overflow-hidden rounded-[22px] p-6"
            style={{ background: '#0F172A' }}
          >
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 70% 60% at 100% 0%, rgba(37,99,235,0.35) 0%, transparent 70%)' }}
            />
            <div className="relative">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#93A4C3' }}>Próxima reunião</p>
              <p className="font-display text-[24px] font-bold leading-[1.05] tracking-[-0.03em] mt-3" style={{ color: '#ffffff' }}>
                Quer alinhar a estratégia?
              </p>
              <p className="text-[12.5px] leading-relaxed mt-2" style={{ color: '#B6C2D6' }}>
                Peça uma conversa com a agência. O pedido fica registrado em Solicitações.
              </p>
              <button
                onClick={() => onNavigate('notas')}
                className="group mt-5 inline-flex items-center gap-2 h-10 pl-4 pr-1.5 rounded-full bg-white text-[12.5px] font-semibold text-[#0F172A] transition-all hover:gap-3"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Solicitar reunião
                <span className="w-7 h-7 rounded-full bg-[#0F172A] flex items-center justify-center transition-transform duration-300 group-hover:-rotate-45">
                  <ArrowRight className="w-3 h-3" style={{ color: '#ffffff' }} />
                </span>
              </button>
            </div>
          </motion.section>
        </div>
      </div>

      {selectedItem && (
        <ItemDetailView
          item={selectedItem}
          open={itemOpen}
          onClose={() => { setItemOpen(false); setSelectedItem(null) }}
        />
      )}
    </div>
  )
}

// ─── Portal Materiais ─────────────────────────────────────────────────────────

const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  pdf: 'PDF', imagem: 'Imagem', video: 'Vídeo',
  link: 'Link', documento: 'Documento', outro: 'Outro',
}

function matIsImage(mat: ClientMaterial): boolean {
  if (mat.type === 'imagem') return true
  return isImageUrl(mat.file_url)
}
function matIsPdf(mat: ClientMaterial): boolean {
  if (mat.type === 'pdf') return true
  if (!mat.file_url) return false
  return /\.pdf(\?|$)/i.test(mat.file_url)
}
function matIsVideo(mat: ClientMaterial): boolean {
  if (mat.type === 'video') return true
  return isVideoUrl(mat.file_url)
}

function PortalMaterialIcon({ type, size = 'sm' }: { type: MaterialType; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'w-8 h-8' : 'w-4 h-4'
  switch (type) {
    case 'pdf':    return <FileText  className={`${cls} text-red-400`} />
    case 'imagem': return <ImageIcon className={`${cls} text-blue-400`} />
    case 'video':  return <Video     className={`${cls} text-purple-400`} />
    case 'link':   return <Link2     className={`${cls} text-sky-400`} />
    default:       return <File      className={`${cls} text-gray-500`} />
  }
}

// ── Hover card ──────────────────────────────────────────────────────────────

interface MatHoverState { mat: ClientMaterial; top: number; left: number }

function MaterialHoverCard({ state }: { state: MatHoverState }) {
  const { mat } = state
  const isImg = matIsImage(mat)
  return (
    <div className="fixed z-50 pointer-events-none" style={{ top: state.top, left: state.left }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4 }}
        transition={{ duration: 0.13 }}
        className="bg-white border border-[#e2e8f0] rounded-xl shadow-xl w-[220px] overflow-hidden text-[#0f0f0f]"
      >
        {isImg && mat.file_url ? (
          <img
            src={mat.file_url}
            alt={mat.title}
            className="w-full h-32 object-cover"
          />
        ) : (
          <div className="w-full h-24 bg-[#f5f7fb] flex items-center justify-center">
            <PortalMaterialIcon type={mat.type} size="lg" />
          </div>
        )}
        <div className="p-3">
          <p className="text-[12px] font-medium text-[#0f0f0f] leading-snug">{mat.title}</p>
          {mat.description && (
            <p className="text-[10px] text-[#64748b] mt-0.5 line-clamp-2 leading-relaxed">{mat.description}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[10px] text-[#94a3b8]">{MATERIAL_TYPE_LABELS[mat.type]}</span>
            <span className="text-[#94a3b8] text-[10px]">·</span>
            <span className="text-[10px] text-[#94a3b8]">{formatDate(mat.created_at)}</span>
          </div>
          <p className="text-[10px] text-blue-600 mt-1.5 flex items-center gap-1">
            <Eye className="w-2.5 h-2.5" /> Clique para visualizar
          </p>
        </div>
      </motion.div>
    </div>
  )
}

// ── Detail modal ────────────────────────────────────────────────────────────

function MaterialDetailModal({
  mat, open, onClose,
}: { mat: ClientMaterial; open: boolean; onClose: () => void }) {
  const isImg  = matIsImage(mat)
  const isPdf  = matIsPdf(mat)
  const isVid  = matIsVideo(mat)
  const isLink = !!(mat.link_url)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-center gap-2.5 min-w-0">
            <PortalMaterialIcon type={mat.type} />
            <DialogTitle className="text-base leading-snug break-words min-w-0">{mat.title}</DialogTitle>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-gray-500">{MATERIAL_TYPE_LABELS[mat.type]}</span>
            <span className="text-gray-700">·</span>
            <span className="text-xs text-gray-500">{formatDate(mat.created_at)}</span>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-1 min-w-0 w-full max-w-full overflow-x-hidden">
          {mat.description && (
            <div className="p-3 bg-[#f5f7fb] rounded-xl border border-[#e2e8f0]">
              <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-1.5">Descrição</p>
              <p className="text-sm text-[#374151] leading-relaxed break-words">{mat.description}</p>
            </div>
          )}

          {/* Preview: imagem */}
          {isImg && mat.file_url && (
            <div className="w-full max-w-full overflow-hidden rounded-xl border border-[#e2e8f0]">
              <img
                src={mat.file_url}
                alt={mat.title}
                className="w-full max-w-full max-h-[60vh] object-contain"
              />
            </div>
          )}

          {/* Preview: vídeo */}
          {isVid && mat.file_url && (
            <video
              src={mat.file_url}
              controls
              className="w-full max-w-full rounded-xl border border-[#e2e8f0]"
            />
          )}

          {/* Preview: PDF (iframe) */}
          {isPdf && mat.file_url && (
            <div className="rounded-xl overflow-hidden border border-[#e2e8f0]">
              <iframe
                src={mat.file_url}
                title={mat.title}
                className="w-full h-72"
              />
            </div>
          )}

          {/* Link externo */}
          {isLink && mat.link_url && (
            <a
              href={mat.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-3 bg-[#f5f7fb] border border-[#e2e8f0] rounded-xl hover:bg-[#eef2ff] hover:border-[#c7d2fe] transition-colors"
            >
              <Link2 className="w-4 h-4 text-sky-500 flex-shrink-0" />
              <span className="text-sm text-sky-600 flex-1 min-w-0 break-all">{mat.link_url}</span>
              <ExternalLink className="w-3 h-3 text-[#94a3b8] flex-shrink-0" />
            </a>
          )}

          {/* Fallback: nenhum preview disponível */}
          {!isImg && !isVid && !isPdf && !isLink && (
            <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-[#e2e8f0] bg-[#f5f7fb]">
              <PortalMaterialIcon type={mat.type} size="lg" />
              <p className="text-xs text-[#94a3b8] mt-2">Sem visualização disponível</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          {isLink && mat.link_url && (
            <a href={mat.link_url} target="_blank" rel="noopener noreferrer">
              <Button size="sm">
                <ExternalLink className="w-3.5 h-3.5" /> Acessar link
              </Button>
            </a>
          )}
          {mat.file_url && (
            <a href={mat.file_url} download target="_blank" rel="noopener noreferrer">
              <Button size="sm">
                <Download className="w-3.5 h-3.5" /> Baixar material
              </Button>
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Material row (shared between flat + grouped views) ──────────────────────

type MatHoverSetter = (s: MatHoverState | null) => void

function MatRow({
  mat,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  mat: ClientMaterial
  onClick: (m: ClientMaterial) => void
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>, m: ClientMaterial) => void
  onMouseLeave: MatHoverSetter
}) {
  const isImg  = matIsImage(mat)
  const isLink = mat.type === 'link' && !!mat.link_url

  // Links get a special card — no hover card, click opens URL directly
  if (isLink) {
    return (
      <div className="flex items-center gap-4 px-5 py-4 bg-white border border-[#E4E7EC] rounded-[18px] hover:border-[#0F172A]/30 transition-all duration-300 group">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-[#EFF4FF] flex items-center justify-center flex-shrink-0">
          <Link2 className="w-4 h-4 text-[#2563EB]" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#0F172A] text-[14px] truncate">{mat.title}</p>
          {mat.description && (
            <p className="text-[12.5px] text-[#5B6576] mt-0.5 leading-snug line-clamp-2">{mat.description}</p>
          )}
          <p className="text-[11px] text-[#A0A8B5] mt-1 truncate">{mat.link_url}</p>
        </div>

        {/* CTA */}
        <a
          href={mat.link_url!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex-shrink-0 flex items-center gap-1.5 h-9 px-4 rounded-full border border-[#0F172A] text-[#0F172A] text-[12px] font-semibold hover:bg-[#0F172A] hover:text-white transition-colors whitespace-nowrap"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Abrir
        </a>
      </div>
    )
  }

  return (
    <div
      onClick={() => onClick(mat)}
      onMouseEnter={e => onMouseEnter(e, mat)}
      onMouseLeave={() => onMouseLeave(null)}
      className="flex items-center gap-4 px-5 py-4 bg-white border border-[#E4E7EC] rounded-[18px] hover:border-[#0F172A]/30 transition-all duration-300 group cursor-pointer"
    >
      {/* Thumbnail */}
      {isImg && mat.file_url ? (
        <img
          src={mat.file_url}
          alt={mat.title}
          className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-[#E4E7EC]"
        />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-[#F6F7F9] flex items-center justify-center flex-shrink-0">
          <PortalMaterialIcon type={mat.type} />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#0F172A] text-[14px] truncate">{mat.title}</p>
        {mat.description && (
          <p className="text-[12.5px] text-[#5B6576] truncate mt-0.5">{mat.description}</p>
        )}
        <p className="text-[11px] text-[#A0A8B5] mt-1">
          {MATERIAL_TYPE_LABELS[mat.type]}
          {' · '}{formatDate(mat.created_at)}
        </p>
      </div>

      {/* Hint */}
      <span className="flex-shrink-0 w-9 h-9 rounded-full border border-[#E4E7EC] flex items-center justify-center text-[#0F172A] transition-all duration-300 group-hover:bg-[#0F172A] group-hover:border-[#0F172A] group-hover:text-white group-hover:-rotate-45">
        <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </div>
  )
}

// ── Tab principal ───────────────────────────────────────────────────────────

type MatTypeFilter = 'todos' | MaterialType

const MAT_TAB_LABELS: { value: MatTypeFilter; label: string }[] = [
  { value: 'todos',     label: 'Todos'     },
  { value: 'imagem',    label: 'Imagens'   },
  { value: 'video',     label: 'Vídeos'    },
  { value: 'pdf',       label: 'PDFs'      },
  { value: 'link',      label: 'Links'     },
  { value: 'documento', label: 'Documentos'},
  { value: 'outro',     label: 'Outros'    },
]

function PortalMateriaisTab({ materials }: { materials: ClientMaterial[] }) {
  const [hover, setHover]         = useState<MatHoverState | null>(null)
  const [selected, setSelected]   = useState<ClientMaterial | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<MatTypeFilter>('todos')

  const handleClick = (mat: ClientMaterial) => {
    setSelected(mat)
    setModalOpen(true)
    setHover(null)
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>, mat: ClientMaterial) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const tooltipW = 228
    const left = rect.right + 8 + tooltipW > window.innerWidth
      ? rect.left - tooltipW - 4
      : rect.right + 8
    const top = Math.min(rect.top, window.innerHeight - 320 - 16)
    setHover({ mat, top, left })
  }

  // Types that actually exist in the data
  const availableTypes = useMemo(() => {
    const present = new Set(materials.map(m => m.type))
    return MAT_TAB_LABELS.filter(t => t.value === 'todos' || present.has(t.value as MaterialType))
  }, [materials])

  // Materials filtered by type
  const filtered = useMemo(() =>
    typeFilter === 'todos' ? materials : materials.filter(m => m.type === typeFilter),
    [materials, typeFilter]
  )

  // Group by folder_name
  const { folders, byFolder, noFolder } = useMemo(() => {
    const foldersSet = new Set<string>()
    const byFolder: Record<string, ClientMaterial[]> = {}
    const noFolder: ClientMaterial[] = []
    filtered.forEach(m => {
      if (m.folder_name) {
        foldersSet.add(m.folder_name)
        if (!byFolder[m.folder_name]) byFolder[m.folder_name] = []
        byFolder[m.folder_name].push(m)
      } else {
        noFolder.push(m)
      }
    })
    return { folders: [...foldersSet], byFolder, noFolder }
  }, [filtered])

  const hasFolders = folders.length > 0

  if (materials.length === 0) {
    return (
      <PortalEmpty title="Nenhum material ainda" text="Quando a agência adicionar materiais, eles aparecem aqui." />
    )
  }

  const rowProps = { onClick: handleClick, onMouseEnter: handleMouseEnter, onMouseLeave: setHover }

  return (
    <div className="space-y-4">
      {/* Type filter tabs — only shown when multiple types exist */}
      {availableTypes.length > 2 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {availableTypes.map(({ value, label }) => (
            <PortalFilterChip
              key={value}
              active={typeFilter === value}
              label={label}
              count={value === 'todos' ? materials.length : materials.filter(m => m.type === value).length}
              onClick={() => setTypeFilter(value)}
            />
          ))}
        </div>
      )}

      {/* Material list — grouped by folder or flat */}
      {filtered.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-[13px] text-[#8A94A6]">Nenhum material nessa categoria.</p>
        </div>
      ) : hasFolders ? (
        <div className="space-y-9">
          {/* Folders */}
          {folders.map(folder => (
            <div key={folder}>
              <div className="flex items-center gap-3 mb-3 pb-2.5 border-b border-[#E4E7EC]">
                <FolderOpen className="w-4 h-4 text-[#8A94A6]" />
                <p className="font-display text-[18px] font-semibold tracking-[-0.02em] text-[#0F172A]">{folder}</p>
                <span className="text-[11px] tabular-nums text-[#A0A8B5]">{byFolder[folder].length}</span>
              </div>
              <div className="space-y-2 pl-0.5">
                {byFolder[folder].map(mat => <MatRow key={mat.id} mat={mat} {...rowProps} />)}
              </div>
            </div>
          ))}
          {/* Items without folder */}
          {noFolder.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3 pb-2.5 border-b border-[#E4E7EC]">
                <p className="font-display text-[18px] font-semibold tracking-[-0.02em] text-[#0F172A]">Outros</p>
                <span className="text-[11px] tabular-nums text-[#A0A8B5]">{noFolder.length}</span>
              </div>
              <div className="space-y-2">
                {noFolder.map(mat => <MatRow key={mat.id} mat={mat} {...rowProps} />)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(mat => <MatRow key={mat.id} mat={mat} {...rowProps} />)}
        </div>
      )}

      <AnimatePresence>
        {hover && <MaterialHoverCard state={hover} />}
      </AnimatePresence>

      {selected && (
        <MaterialDetailModal
          mat={selected}
          open={modalOpen}
          onClose={() => { setModalOpen(false); setSelected(null) }}
        />
      )}
    </div>
  )
}

// ─── Portal Suporte ───────────────────────────────────────────────────────────

const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  whatsapp: 'WhatsApp', email: 'E-mail', telefone: 'Telefone', outro: 'Outro',
}

function PortalContactIcon({ type }: { type: ContactType }) {
  switch (type) {
    case 'whatsapp': return <MessageCircle className="w-4 h-4 text-green-500" />
    case 'email':    return <Mail          className="w-4 h-4 text-blue-500" />
    case 'telefone': return <Phone         className="w-4 h-4 text-[#64748b]" />
    default:         return <Phone         className="w-4 h-4 text-[#94a3b8]" />
  }
}

function autoLink(type: ContactType, value: string): string {
  const clean = value.trim()
  switch (type) {
    case 'whatsapp': return `https://wa.me/${clean.replace(/\D/g, '')}`
    case 'email':    return `mailto:${clean}`
    case 'telefone': return `tel:${clean.replace(/\s/g, '')}`
    default:         return clean.startsWith('http') ? clean : `https://${clean}`
  }
}

function PortalSuporteTab({ contacts }: { contacts: ClientSupportContact[] }) {
  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-xl border border-[#e8e8e8] bg-[#f0f0f0] flex items-center justify-center mb-4">
          <LifeBuoy className="w-5 h-5 text-gray-600" />
        </div>
        <p className="text-[14px] font-medium text-[#737373]">Nenhum contato de suporte</p>
        <p className="text-[12px] text-gray-600 mt-1 max-w-xs">
          Em breve você verá os canais de atendimento da sua agência aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 mb-4">
        Precisa de ajuda? Entre em contato com a equipe pelos canais abaixo.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {contacts.map(c => {
          const href = c.direct_link || autoLink(c.contact_type, c.contact_value)
          return (
            <a
              key={c.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-white border border-[#e8e8e8] rounded-xl hover:bg-[#f5f5f5] hover:border-[#d0d0d0] transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#f0f0f0] border border-[#e8e8e8] flex items-center justify-center flex-shrink-0">
                <PortalContactIcon type={c.contact_type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#0f0f0f] text-sm truncate">{c.name}</p>
                {c.role && <p className="text-xs text-gray-500 truncate">{c.role}</p>}
                <p className="text-[11px] text-gray-600 mt-0.5 truncate">
                  {CONTACT_TYPE_LABELS[c.contact_type]} · {c.contact_value}
                </p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-[#737373] transition-colors flex-shrink-0" />
            </a>
          )
        })}
      </div>
    </div>
  )
}

// ─── Content Asset Detail Modal ──────────────────────────────────────────────

function ContentAssetDetailModal({
  asset,
  open,
  onClose,
}: { asset: ContentAsset; open: boolean; onClose: () => void }) {
  const isImg = isImageUrl(asset.media_url)
  const isVid = isVideoUrl(asset.media_url)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-center gap-2.5 min-w-0">
            <ImageIcon className="w-4 h-4 text-[#a0a0a0] flex-shrink-0" />
            <DialogTitle className="text-base leading-snug break-words min-w-0">{asset.title}</DialogTitle>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs text-gray-500">{contentTypeLabels[asset.content_type as ContentType]}</span>
            {asset.category && (
              <>
                <span className="text-gray-700">·</span>
                <span className="text-xs text-gray-500">{asset.category}</span>
              </>
            )}
            <span className="text-gray-700">·</span>
            <span className="text-xs text-gray-500">{formatDate(asset.created_at)}</span>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-1 min-w-0">

          {/* Imagem */}
          {isImg && asset.media_url && (
            <a href={asset.media_url} target="_blank" rel="noopener noreferrer"
              className="block w-full overflow-hidden rounded-xl border border-[#e8e8e8] hover:border-[#c8c8c8] transition-colors">
              <img src={asset.media_url} alt={asset.title} className="w-full max-w-full object-contain" style={{ maxHeight: 280 }} />
            </a>
          )}

          {/* Vídeo */}
          {isVid && asset.media_url && (
            <video src={asset.media_url} controls className="w-full max-w-full rounded-xl border border-[#e8e8e8]" />
          )}

          {/* Arquivo não-mídia */}
          {asset.media_url && !isImg && !isVid && (
            <a href={asset.media_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-2.5 bg-[#f7f7f7] border border-[#e8e8e8] rounded-xl hover:border-[#d0d0d0] hover:bg-[#f0f0f0] transition-colors min-w-0">
              <File className="w-4 h-4 text-[#a0a0a0] flex-shrink-0" />
              <span className="text-xs text-[#0f0f0f] truncate flex-1 min-w-0">Abrir arquivo</span>
              <ExternalLink className="w-3 h-3 text-[#a0a0a0] flex-shrink-0" />
            </a>
          )}

          {/* Legenda */}
          {asset.caption && (
            <div className="p-3 bg-[#f7f7f7] rounded-xl border border-[#e8e8e8]">
              <p className="text-[10px] text-[#a0a0a0] uppercase tracking-wide mb-2">Legenda / Copy</p>
              <p className="text-sm text-[#0f0f0f] leading-relaxed whitespace-pre-wrap break-words">{asset.caption}</p>
            </div>
          )}

          {/* Observações */}
          {asset.observations && (
            <div className="p-3 bg-[#f7f7f7] rounded-xl border border-[#e8e8e8]">
              <p className="text-[10px] text-[#a0a0a0] uppercase tracking-wide mb-2">Observações</p>
              <p className="text-sm text-[#737373] leading-relaxed whitespace-pre-wrap break-words">{asset.observations}</p>
            </div>
          )}

          {/* Link externo — botão proeminente */}
          {asset.link_url && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Link</p>
              <a
                href={asset.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 bg-[#f7f7f7] border border-[#e8e8e8] rounded-xl hover:border-[#d0d0d0] hover:bg-[#f0f0f0] transition-colors min-w-0 overflow-hidden"
              >
                <Link2 className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" />
                <span className="text-xs text-blue-800 flex-1 min-w-0 break-all">{asset.link_url}</span>
                <span className="flex items-center gap-1 text-[11px] font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-md px-2 py-1 flex-shrink-0">
                  Abrir link <ExternalLink className="w-3 h-3" />
                </span>
              </a>
            </div>
          )}

          {!asset.caption && !asset.observations && !asset.media_url && !asset.link_url && (
            <p className="text-xs text-[#a0a0a0] text-center py-4">Nenhuma informação adicional.</p>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          {asset.link_url && (
            <a href={asset.link_url} target="_blank" rel="noopener noreferrer">
              <Button size="sm">
                <Link2 className="w-3.5 h-3.5" /> Abrir link
              </Button>
            </a>
          )}
          {asset.media_url && !isImg && !isVid && (
            <a href={asset.media_url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline">
                <Download className="w-3.5 h-3.5" /> Baixar arquivo
              </Button>
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Aba Formulário Semanal (portal do cliente) ───────────────────────────────

function PortalFormularioTab({ token, clientName }: { token: string; clientName: string }) {
  const { toast } = useToast()
  const formUrl = `${window.location.origin}/formulario/${token}`

  const handleCopy = () => {
    navigator.clipboard.writeText(formUrl)
    toast('Link copiado!', 'success')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5 items-stretch">
      {/* Chamada principal */}
      <a
        href={formUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative overflow-hidden rounded-[22px] p-7 sm:p-9 flex flex-col justify-between min-h-[240px]"
        style={{ background: '#0F172A' }}
      >
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 70% at 100% 0%, rgba(37,99,235,0.4) 0%, transparent 70%)' }} />
        <ClipboardList className="relative w-7 h-7" style={{ color: '#93A4C3' }} />
        <div className="relative mt-10">
          <p className="font-display text-[30px] sm:text-[36px] font-bold leading-[1.0] tracking-[-0.035em]" style={{ color: '#ffffff' }}>
            Preencher o formulário da semana
          </p>
          <span className="mt-6 inline-flex items-center gap-3 h-11 pl-5 pr-1.5 rounded-full bg-white text-[#0F172A] text-[13px] font-semibold transition-all duration-300 group-hover:gap-4">
            Abrir agora
            <span className="w-8 h-8 rounded-full bg-[#0F172A] flex items-center justify-center transition-transform duration-300 group-hover:-rotate-45">
              <ExternalLink className="w-3.5 h-3.5" style={{ color: '#ffffff' }} />
            </span>
          </span>
        </div>
      </a>

      {/* Link para copiar */}
      <div className={`${portalPanel} p-6 sm:p-7 flex flex-col justify-between`}>
        <div>
          <p className={portalEyebrow}>Link do formulário</p>
          <p className="text-[13px] text-[#5B6576] mt-3 leading-relaxed">
            Quer que outra pessoa da equipe responda? Copie o link e envie.
          </p>
        </div>
        <div className="mt-6 flex items-center gap-2 bg-[#F6F7F9] border border-[#E4E7EC] rounded-full pl-4 pr-1.5 py-1.5">
          <span className="text-[12px] text-[#334155] flex-1 truncate">{formUrl}</span>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold transition-opacity hover:opacity-85"
            style={{ background: '#0F172A', color: '#ffffff' }}
          >
            <Copy className="w-3 h-3" /> Copiar
          </button>
        </div>
      </div>

      <p className="lg:col-span-2 text-[12px] text-[#8A94A6]">
        Você pode compartilhar este link com outros colaboradores da {clientName || 'sua empresa'}.
      </p>
    </div>
  )
}

// ─── Main Portal Dashboard ────────────────────────────────────────────────────

export function PortalDashboard() {
  const { data: client, isLoading } = usePortalClient()
  const { data: plannerItems } = usePortalPlanner()
  const { data: contents } = usePortalContents()
  const { data: contentAssets = [] } = usePortalContentAssets()
  const { data: brandDNA } = usePortalBrandDNA()
  const { data: materials = [] } = usePortalMaterials()
  const { data: supportContacts = [] } = usePortalSupportContacts()
  const { data: portalPayments = [] } = usePortalPayments()
  const { data: notifications = [] } = useNotifications()
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const tabsRef = useRef<HTMLDivElement>(null)

  // No celular a barra de abas rola de lado: traz a aba escolhida para a área visível
  useEffect(() => {
    const list = tabsRef.current
    const el = list?.querySelector<HTMLElement>('[data-state="active"]')
    if (!list || !el) return
    const left = el.offsetLeft - 16
    const right = el.offsetLeft + el.offsetWidth - list.clientWidth + 16
    if (list.scrollLeft > left) list.scrollTo({ left, behavior: 'smooth' })
    else if (list.scrollLeft < right) list.scrollTo({ left: right, behavior: 'smooth' })
  }, [activeTab])
  const clientId = profile?.linked_client_id ?? ''
  const { data: formConfig } = useWeeklyFormConfig(clientId)
  const [selectedAsset, setSelectedAsset] = useState<ContentAsset | null>(null)
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [autoOpenPlannerItemId, setAutoOpenPlannerItemId] = useState<string | null>(null)

  const rawName = profile?.full_name || ''
  const firstName = rawName.split(' ')[0] || 'Cliente'

  const pendingCount = (plannerItems || []).filter(
    i => i.approval_status === 'pendente_aprovacao' || (i.status === 'revisao' && !i.approval_status)
  ).length

  const unreadCount = notifications.filter(n => !n.is_read).length

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-full py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#64748b] text-sm">Carregando...</p>
          </div>
        </div>
      </PortalLayout>
    )
  }

  if (!client) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-full py-32">
          <div className="text-center">
            <Building2 className="w-10 h-10 text-[#94a3b8] mx-auto mb-3" />
            <p className="text-[#737373] font-medium">Conta não vinculada</p>
            <p className="text-gray-500 text-sm mt-1">Entre em contato com sua agência.</p>
          </div>
        </div>
      </PortalLayout>
    )
  }

  const infoFields = [
    { label: 'Objetivo Principal', value: client.main_objective },
    { label: 'Público-alvo', value: client.target_audience },
    { label: 'Tom de Voz', value: client.tone_of_voice },
    { label: 'Estilo de Comunicação', value: client.communication_style },
    { label: 'Diferenciais', value: client.differentials },
    { label: 'Serviços Oferecidos', value: client.services_offered },
    { label: 'Observações', value: client.observations },
  ]

  return (
    <>
    <PortalLayout
      clientName={client.company_name}
      unreadCount={unreadCount}
      pendingCount={pendingCount}
      onBellClick={() => setShowNotifications(true)}
    >
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-16">

        {/* ── Capa do cliente: faixa escura, logo sobreposta, dados principais ── */}
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-[28px] border border-[#E4E7EC] bg-white"
        >
          {/* Faixa da capa */}
          <div className="relative h-[150px] sm:h-[190px] overflow-hidden" style={{ background: '#0F172A' }}>
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
                backgroundSize: '44px 44px',
                WebkitMaskImage: 'radial-gradient(ellipse 65% 120% at 85% 20%, #000 0%, transparent 75%)',
                maskImage: 'radial-gradient(ellipse 65% 120% at 85% 20%, #000 0%, transparent 75%)',
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse 45% 90% at 88% 0%, ${/^#[0-9a-f]{6}$/i.test(client.brand_color_primary ?? '') ? client.brand_color_primary : '#2563EB'}66 0%, transparent 70%), radial-gradient(ellipse 35% 80% at 10% 120%, rgba(37,99,235,0.25) 0%, transparent 70%)`,
              }}
            />
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(96,165,250,0.5) 45%, transparent)' }} />

            <div className="relative h-full flex items-start justify-between gap-4 p-5 sm:p-7">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#93A4C3' }}>
                Área do cliente
              </p>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11.5px] font-semibold bg-white/10 backdrop-blur" style={{ color: '#ffffff' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: client.status === 'ativo' ? '#22C55E' : client.status === 'pausado' ? '#EAB308' : client.status === 'encerrado' ? '#EF4444' : '#60A5FA' }} />
                  {clientStatusLabels[client.status] ?? client.status}
                </span>
                <span className="hidden sm:inline-flex items-center h-7 px-3 rounded-full text-[11.5px] bg-white/10 backdrop-blur" style={{ color: '#CBD5E1' }}>
                  Cliente desde {formatDate(client.entry_date)}
                </span>
              </div>
            </div>
          </div>

          {/* Identidade */}
          <div className="relative px-5 sm:px-8 pb-6 sm:pb-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 md:gap-8">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 min-w-0">
                {client.logo_url ? (
                  <img src={client.logo_url} alt={client.company_name}
                    className="-mt-12 sm:-mt-14 w-24 h-24 sm:w-28 sm:h-28 rounded-[26px] object-cover border-4 border-white bg-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.35)] flex-shrink-0" />
                ) : (
                  <div className="-mt-12 sm:-mt-14 w-24 h-24 sm:w-28 sm:h-28 rounded-[26px] border-4 border-white flex items-center justify-center flex-shrink-0 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.35)]"
                    style={{ background: '#0F172A' }}>
                    <span className="font-display text-[44px] font-bold tracking-[-0.04em]" style={{ color: '#ffffff' }}>
                      {client.company_name[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 sm:pb-1">
                  <h1
                    className="font-display font-bold text-[#0F172A] leading-[0.95] tracking-[-0.04em] break-words"
                    style={{ fontSize: 'clamp(32px, 5vw, 56px)' }}
                  >
                    {client.company_name}<span className="text-[#2563EB]">.</span>
                  </h1>
                  <p className="text-[13px] text-[#5B6576] mt-2.5">
                    <span className="font-medium text-[#0F172A]">{client.responsible_name}</span>
                    {client.niche && <><span className="mx-2 text-[#C4CAD4]">·</span>{client.niche}</>}
                    <span className="sm:hidden"><span className="mx-2 text-[#C4CAD4]">·</span>desde {formatDate(client.entry_date)}</span>
                  </p>
                </div>
              </div>

              {/* Contatos */}
              {(client.instagram || client.whatsapp || client.email || client.website) && (
                <div className="flex flex-wrap gap-2 md:justify-end md:max-w-[46%]">
                  {[
                    client.instagram && { icon: <Instagram className="w-3.5 h-3.5" />, label: `@${client.instagram.replace('@', '')}`, href: `https://instagram.com/${client.instagram.replace('@', '')}` },
                    client.whatsapp && { icon: <Phone className="w-3.5 h-3.5" />, label: client.whatsapp, href: `https://wa.me/${client.whatsapp.replace(/\D/g, '').replace(/^(?!55)/, '55')}` },
                    client.email && { icon: <Mail className="w-3.5 h-3.5" />, label: client.email, href: `mailto:${client.email}` },
                    client.website && { icon: <Globe className="w-3.5 h-3.5" />, label: client.website.replace(/^https?:\/\//, ''), href: client.website.startsWith('http') ? client.website : `https://${client.website}` },
                  ].filter(Boolean).map(c => {
                    const it = c as { icon: React.ReactNode; label: string; href: string }
                    return (
                      <a key={it.href} href={it.href} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 h-9 max-w-full px-3.5 rounded-full border border-[#E4E7EC] text-[12.5px] text-[#334155] hover:border-[#0F172A] hover:text-[#0F172A] transition-colors">
                        <span className="text-[#8A94A6]">{it.icon}</span>
                        <span className="truncate">{it.label}</span>
                      </a>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Dados principais do cliente */}
            {infoFields.slice(0, 3).some(f => f.value) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#EEF0F3] border-t border-[#EEF0F3] mt-7 -mx-5 sm:-mx-8 -mb-6 sm:-mb-8">
                {infoFields.slice(0, 3).filter(f => f.value).map(f => (
                  <div key={f.label} className="bg-white px-5 sm:px-8 py-5">
                    <p className={portalEyebrow}>{f.label}</p>
                    <p className="text-[13px] leading-relaxed text-[#0F172A] mt-2 line-clamp-3">{f.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.header>

        {/* ── Abas numeradas, com fio azul embaixo da ativa ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-10 sm:mt-14">
          {/* O fio fica no invólucro (fora da área que rola) para a barra não tremer na vertical */}
          <div className="relative -mx-4 sm:mx-0 mb-9 sm:mb-12 border-b border-[#E4E7EC]">
          <div aria-hidden className="sm:hidden absolute right-0 top-0 bottom-px w-12 z-10 pointer-events-none bg-gradient-to-l from-[#F6F7F9] to-transparent" />
          <TabsList
            ref={tabsRef}
            className="portal-tabs relative flex w-full h-auto p-0 px-4 sm:px-0 bg-transparent border-0 rounded-none justify-start gap-6 sm:gap-8 flex-nowrap overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-none"
          >
            {[
              { v: 'dashboard',    label: 'Dashboard' },
              { v: 'planejamento', label: 'Planejamento', count: plannerItems?.length || 0 },
              { v: 'notas',        label: 'Solicitações e ideias' },
              { v: 'materiais',    label: 'Materiais' },
              { v: 'resultados',   label: 'Resultados' },
              { v: 'financeiro',   label: 'Financeiro' },
              ...(formConfig?.is_active ? [{ v: 'formulario', label: 'Formulário' }] : []),
            ].map((t, i) => (
              <TabsTrigger
                key={t.v}
                value={t.v}
                className="group relative flex-shrink-0 gap-2 rounded-none px-0 pt-1 pb-3.5 text-[13.5px] font-medium bg-transparent text-[#8A94A6] hover:bg-transparent hover:text-[#0F172A] data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:left-0 after:right-0 after:bottom-0 after:h-[2px] after:bg-[#0F172A] after:origin-left after:scale-x-0 after:transition-transform after:duration-500 data-[state=active]:after:scale-x-100"
              >
                <span className="text-[10.5px] tabular-nums text-[#C4CAD4] group-data-[state=active]:text-[#2563EB] transition-colors">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {t.label}
                {pendingCount > 0 && t.v === 'planejamento' ? (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: '#EAB308', color: '#fff' }}>
                    {pendingCount}
                  </span>
                ) : t.count != null && (
                  <span className="text-[11px] tabular-nums text-[#A0A8B5]">{t.count}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          </div>

          {/* Aba Dashboard */}
          <TabsContent value="dashboard" className="mt-0">
            <ClientDashboardTab
              client={client}
              plannerItems={plannerItems || []}
              contents={contents || []}
              onNavigate={setActiveTab}
              firstName={firstName}
              payments={portalPayments}
            />
          </TabsContent>

          {/* Aba Planejamento */}
          <TabsContent value="planejamento" className="mt-0">
            <PortalSectionHead
              n="02" eyebrow="Planejamento" title="O calendário" accent="do mês."
              desc="Cada post aparece no dia em que vai ao ar. Clique para ver a arte, ler a legenda e aprovar ou pedir ajuste."
            />
            {plannerItems && plannerItems.length === 0 ? (
              <PortalEmpty title="Nada planejado ainda" text="Assim que a agência montar o calendário, os conteúdos aparecem aqui." />
            ) : (
              <PortalPlannerView
                items={plannerItems || []}
                autoOpenItemId={autoOpenPlannerItemId}
                onItemAutoOpened={() => setAutoOpenPlannerItemId(null)}
              />
            )}
          </TabsContent>

          {/* Aba Materiais */}
          <TabsContent value="materiais" className="mt-0">
            <PortalSectionHead
              n="04" eyebrow="Materiais" title="Tudo da sua marca," accent="num lugar só."
              desc="Logos, fotos, vídeos e documentos que a agência organizou para você baixar quando precisar."
            />
            <PortalMateriaisTab materials={materials} />
          </TabsContent>

          {/* Aba Resultados */}
          <TabsContent value="resultados" className="mt-0">
            <PortalSectionHead
              n="05" eyebrow="Resultados" title="O que os números" accent="dizem."
              desc="O relatório de cada mês, com alcance, seguidores, engajamento e a leitura da agência."
            />
            <PortalResultadosTab />
          </TabsContent>

          {/* Aba Financeiro */}
          <TabsContent value="financeiro" className="mt-0">
            <PortalSectionHead
              n="06" eyebrow="Financeiro" title="Pagamentos" accent="em dia."
              desc="A situação do contrato, o próximo vencimento e o histórico do que já foi pago."
            />
            <PortalFinanceiroTab />
          </TabsContent>

          {/* Aba Notas */}
          <TabsContent value="notas" className="mt-0">
            <PortalSectionHead
              n="03" eyebrow="Solicitações e ideias" title="Fale com" accent="a agência."
              desc="Mande ideias de conteúdo, avisos e pedidos. Tudo fica registrado aqui, em vez de se perder na conversa."
            />
            <PortalNotesTab />
          </TabsContent>

          {/* Aba Formulário */}
          {formConfig?.is_active && (
            <TabsContent value="formulario" className="mt-0">
              <PortalSectionHead
                n="07" eyebrow="Formulário" title="A sua semana" accent="em 5 minutos."
                desc="Conte o que está acontecendo aí. É com isso que a agência cria conteúdos alinhados à sua realidade."
              />
              <PortalFormularioTab
                token={formConfig.public_token}
                clientName={client?.company_name || ''}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Modal de detalhe de conteúdo do arsenal */}
      {selectedAsset && (
        <ContentAssetDetailModal
          asset={selectedAsset}
          open={assetModalOpen}
          onClose={() => { setAssetModalOpen(false); setSelectedAsset(null) }}
        />
      )}
    </PortalLayout>

    {/* Modal de notificações */}
    <NotificationsModal
      open={showNotifications}
      onClose={() => setShowNotifications(false)}
      onView={(notification) => {
        setShowNotifications(false)
        if (notification.type === 'NEW_REPORT') {
          setActiveTab('resultados')
          return
        }
        setActiveTab('planejamento')
        if (notification.link) {
          setAutoOpenPlannerItemId(notification.link)
        }
      }}
    />
    </>
  )
}
