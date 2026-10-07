import { useState, useEffect } from 'react'
import {
  ImageIcon, Video, Music, FileText, File,
  ExternalLink, Link2, Building2, Pencil, Trash2, Check,
  Instagram, Loader2, AlertCircle, ChevronLeft, ChevronRight, X,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUpdatePlannerItem, useDeletePlannerItem } from '@/hooks/usePlanner'
import { useToast } from '@/components/ui/toast'
import { contentTypeLabels, isStoryContent } from '@/utils/formatters'
import { PlannerCommentsThread } from '@/components/PlannerCommentsThread'
import { useClientInstagramAccount, useCreateScheduledPost } from '@/hooks/useInstagram'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'
import { jaPublicoNoR2 } from '@/lib/uploadArquivo'
import type { PlannerItem, PlannerAttachment, PlannerStatus, ContentType, ApprovalStatus } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const statusPillStyle: Record<PlannerStatus, string> = {
  ideia:     'bg-transparent text-[color:var(--sm-text-1)] border-[color:var(--sm-border)]',
  producao:  'bg-transparent text-[color:var(--sm-text-1)] border-[color:var(--sm-border)]',
  revisao:   'bg-transparent text-[color:var(--sm-text-1)] border-[color:var(--sm-border)]',
  aprovado:  'bg-transparent text-[color:var(--sm-text-1)] border-[color:var(--sm-border)]',
  publicado: 'bg-transparent text-[color:var(--sm-text-1)] border-[color:var(--sm-border)]',
}
const statusDot: Record<PlannerStatus, string> = {
  ideia: 'bg-purple-500', producao: 'bg-blue-500', revisao: 'bg-yellow-400',
  aprovado: 'bg-green-500', publicado: 'bg-emerald-500',
}
const statusLabels: Record<PlannerStatus, string> = {
  ideia: 'Ideia', producao: 'Produção', revisao: 'Revisão',
  aprovado: 'Aprovado', publicado: 'Publicado',
}

const approvalDot: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'bg-yellow-400', aprovado: 'bg-green-500',
  ajuste_solicitado: 'bg-orange-400', ajuste_realizado: 'bg-blue-400', reprovado: 'bg-red-500',
}
const approvalTextColor: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'text-[color:var(--sm-text-1)]', aprovado: 'text-[color:var(--sm-text-1)]',
  ajuste_solicitado: 'text-[color:var(--sm-text-1)]', ajuste_realizado: 'text-[color:var(--sm-text-1)]', reprovado: 'text-[color:var(--sm-text-1)]',
}
const approvalLabel: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'Aguardando aprovação', aprovado: 'Aprovado pelo cliente',
  ajuste_solicitado: 'Ajuste solicitado', ajuste_realizado: 'Ajuste realizado — aguardando revisão',
  reprovado: 'Reprovado pelo cliente',
}
// Fundo neutro; a cor do status fica só no ponto ao lado do texto.
const approvalBg: Record<ApprovalStatus, string> = {
  pendente_aprovacao: 'bg-[color:var(--sm-bg-alt)] border-[color:var(--sm-border)]',
  aprovado:           'bg-[color:var(--sm-bg-alt)] border-[color:var(--sm-border)]',
  ajuste_solicitado:  'bg-[color:var(--sm-bg-alt)] border-[color:var(--sm-border)]',
  ajuste_realizado:   'bg-[color:var(--sm-bg-alt)] border-[color:var(--sm-border)]',
  reprovado:          'bg-[color:var(--sm-bg-alt)] border-[color:var(--sm-border)]',
}

const PLANNER_STATUSES: { value: PlannerStatus; label: string }[] = [
  { value: 'ideia',     label: 'Ideia' },
  { value: 'producao',  label: 'Produção' },
  { value: 'revisao',   label: 'Revisão' },
  { value: 'aprovado',  label: 'Aprovado' },
  { value: 'publicado', label: 'Publicado' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function FileTypeIcon({ type, size = 'sm' }: { type: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-4 h-4' : 'w-3 h-3'
  if (type.startsWith('image/')) return <ImageIcon className={`${cls} text-blue-500`} />
  if (type.startsWith('video/')) return <Video     className={`${cls} text-purple-500`} />
  if (type.startsWith('audio/')) return <Music     className={`${cls} text-green-500`} />
  if (type === 'application/pdf') return <FileText className={`${cls} text-red-500`} />
  return <File className={`${cls} text-[color:var(--sm-text-4)]`} />
}

function computeOverallApproval(art: ApprovalStatus | null, copy: ApprovalStatus | null): ApprovalStatus {
  const statuses = [art, copy].filter(Boolean) as ApprovalStatus[]
  if (statuses.length === 0) return 'pendente_aprovacao'
  if (statuses.some(s => s === 'reprovado')) return 'reprovado'
  if (statuses.some(s => s === 'ajuste_solicitado')) return 'ajuste_solicitado'
  if (statuses.some(s => s === 'ajuste_realizado')) return 'ajuste_realizado'
  if (statuses.every(s => s === 'aprovado')) return 'aprovado'
  return 'pendente_aprovacao'
}

async function notifyClientAdjustmentDone(clientId: string | null, plannerId: string) {
  if (!clientId) return
  try {
    const { data: portalUser } = await supabase
      .from('profiles').select('id')
      .eq('linked_client_id', clientId).eq('role', 'client').maybeSingle()
    if (!portalUser?.id) return
    await (supabase as any).from('notifications').insert({
      user_id:   portalUser.id,
      client_id: clientId,
      type:      'ADJUSTMENT_DONE',
      title:     'Ajuste realizado pela agência',
      message:   'A agência corrigiu o conteúdo e está aguardando sua aprovação.',
      link:      `/portal`,
    })
  } catch {/* silencioso */}
}

type CarouselSlide = { slide: number; status: 'aprovado' | 'ajuste_solicitado' | 'reprovado'; feedback: string }

function parseCarouselFeedback(feedback: string | null | undefined): CarouselSlide[] | null {
  if (!feedback) return null
  try {
    const data = JSON.parse(feedback)
    if (Array.isArray(data) && data.length > 0 && typeof data[0].slide === 'number') return data as CarouselSlide[]
    return null
  } catch { return null }
}

const slideDotCls: Record<string, string> = {
  aprovado: 'bg-green-500', ajuste_solicitado: 'bg-orange-400', reprovado: 'bg-red-500',
}
const slideTextCls: Record<string, string> = {
  aprovado: 'text-[color:var(--sm-text-1)]', ajuste_solicitado: 'text-[color:var(--sm-text-1)]', reprovado: 'text-[color:var(--sm-text-1)]',
}
const slideLabelStr: Record<string, string> = {
  aprovado: 'Aprovado', ajuste_solicitado: 'Ajuste solicitado', reprovado: 'Reprovado',
}

// ─── Approval Field Block ─────────────────────────────────────────────────────

function ApprovalFieldBlock({
  label, status, feedback, showAction, onMarkDone, isPending,
}: {
  label: string
  status: ApprovalStatus
  feedback: string | null
  showAction: boolean
  onMarkDone: () => Promise<void>
  isPending: boolean
}) {
  const carouselSlides = parseCarouselFeedback(feedback)

  return (
    <div className={`rounded-xl border p-3 ${approvalBg[status]}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-bold text-[color:var(--sm-text-3)] uppercase tracking-wide">
          {label}{carouselSlides ? ` · Carrossel (${carouselSlides.length} slides)` : ''}
        </p>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${approvalDot[status]}`} />
          <span className={`text-[11px] font-semibold ${approvalTextColor[status]}`}>
            {approvalLabel[status]}
          </span>
        </div>
      </div>

      {/* Feedback do cliente */}
      {status !== 'aprovado' && status !== 'pendente_aprovacao' && (
        carouselSlides ? (
          <div className="mt-2 space-y-1.5">
            {carouselSlides.map(s => (
              <div key={s.slide} className="bg-[color:var(--sm-bg-card)] rounded-lg px-2.5 py-1.5 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${slideDotCls[s.status] ?? 'bg-gray-400'}`} />
                  <span className="text-[10px] font-semibold text-[color:var(--sm-text-3)]">Slide {s.slide}</span>
                  <span className={`text-[10px] font-semibold ml-auto ${slideTextCls[s.status] ?? 'text-[color:var(--sm-text-3)]'}`}>
                    {slideLabelStr[s.status] ?? s.status}
                  </span>
                </div>
                {s.feedback && (
                  <p className="text-xs text-[color:var(--sm-text-2)] leading-relaxed break-words pl-3">"{s.feedback}"</p>
                )}
              </div>
            ))}
          </div>
        ) : feedback ? (
          <div className="mt-2 bg-[color:var(--sm-bg-card)] rounded-lg px-2.5 py-2">
            <p className="text-xs text-[color:var(--sm-text-2)] leading-relaxed break-words select-text">"{feedback}"</p>
          </div>
        ) : null
      )}

      {/* Botão ajuste realizado */}
      {showAction && (status === 'ajuste_solicitado' || status === 'reprovado') && (
        <button
          onClick={onMarkDone}
          disabled={isPending}
          className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-[#2563EB] border border-[#2563EB]/40 hover:bg-[#2563EB]/10 transition-colors disabled:opacity-50"
        >
          {isPending
            ? <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            : <Check className="w-3 h-3" />}
          Marcar ajuste de {label} como realizado
        </button>
      )}
    </div>
  )
}

// ─── Instagram Schedule Section ───────────────────────────────────────────────

type PostType = 'IMAGE' | 'CAROUSEL_ALBUM' | 'REELS'

const POST_TYPE_OPTS: { value: PostType; label: string }[] = [
  { value: 'IMAGE',          label: 'Imagem' },
  { value: 'CAROUSEL_ALBUM', label: 'Carrossel' },
  { value: 'REELS',          label: 'Reel' },
]

async function uploadMediaFromUrl(url: string, userId: string): Promise<string> {
  // Já está numa URL pública do R2: a Meta baixa direto de lá. Copiar seria
  // trazer o vídeo inteiro para o navegador só para reenviá-lo — lento e, acima
  // de 50 MB, recusado pelo Supabase.
  if (jaPublicoNoR2(url)) return url

  const res  = await fetch(url)
  const blob = await res.blob()
  const ext  = url.split('.').pop()?.split('?')[0] ?? 'jpg'
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await (supabase as any).storage.from('post-media').upload(path, blob)
  if (error) throw error
  const { data } = (supabase as any).storage.from('post-media').getPublicUrl(path)
  return data.publicUrl as string
}

function InstagramScheduleSection({ item }: { item: PlannerItem }) {
  const { user, agencyId } = useAuth()
  const { data: igAccount, isLoading: igLoading } = useClientInstagramAccount(item.client_id ?? undefined)
  const createPost = useCreateScheduledPost()
  const { toast } = useToast()

  const imageAttachments = item.attachments?.filter(a => a.file_type.startsWith('image/')) ?? []
  const videoAttachments = item.attachments?.filter(a => a.file_type.startsWith('video/')) ?? []

  const [postType, setPostType]       = useState<PostType>('IMAGE')
  const [caption, setCaption]         = useState(item.notes ?? '')
  const [scheduledAt, setScheduledAt] = useState('')
  const [scheduledTime, setScheduledTime] = useState(item.scheduled_time?.slice(0, 5) ?? '09:00')
  const [publishing, setPublishing]   = useState(false)
  const [success, setSuccess]         = useState(false)

  const defaultDate = item.scheduled_date

  const handleSchedule = async () => {
    if (!igAccount || !user) return
    // Rede de segurança: o bloco de story acima já impede o formulário de
    // aparecer, mas a regra não pode depender só da ordem dos returns.
    if (isStoryContent(item.content_type)) return
    const date = scheduledAt || defaultDate
    if (!date || !scheduledTime) { toast('Preencha a data e horário.', 'error'); return }
    const attachments = postType === 'REELS' ? videoAttachments : imageAttachments
    if (attachments.length === 0) { toast('Este post não tem mídia anexada.', 'error'); return }
    setPublishing(true)
    try {
      const mediaUrls: string[] = []
      for (const att of attachments.slice(0, postType === 'CAROUSEL_ALBUM' ? 10 : 1)) {
        const publicUrl = await uploadMediaFromUrl(att.file_url, agencyId!)
        mediaUrls.push(publicUrl)
      }
      const scheduledAtISO = new Date(`${date}T${scheduledTime}:00`).toISOString()
      await createPost.mutateAsync({
        ig_account_id: igAccount.id,
        client_id:     item.client_id,
        post_type:     postType,
        caption,
        media_urls:    mediaUrls,
        scheduled_at:  scheduledAtISO,
        planner_id:    item.id,
      })
      setSuccess(true)
      toast('Post agendado no Instagram!', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao agendar.', 'error')
    } finally {
      setPublishing(false)
    }
  }

  // Story — a plataforma não agenda stories (migration 072 barra no banco).
  // Antes do igLoading: não faz sentido esperar a conta do Instagram carregar
  // para dizer que este item não vai ser agendado de jeito nenhum.
  if (isStoryContent(item.content_type)) return (
    <div className="p-3 bg-[color:var(--sm-bg-alt)] rounded-xl border border-[color:var(--sm-border)] space-y-1.5">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <p className="text-xs font-semibold text-[color:var(--sm-text-1)]">Stories não são agendados</p>
      </div>
      <p className="text-[11px] text-[color:var(--sm-text-3)] leading-relaxed">
        A plataforma não publica stories no Instagram. Mesmo aprovado pelo cliente, este
        item não entra no agendamento — publique o story direto pelo aplicativo.
      </p>
    </div>
  )

  if (igLoading) return (
    <div className="flex items-center gap-2 py-2">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-[color:var(--sm-text-4)]" />
      <span className="text-xs text-[color:var(--sm-text-3)]">Verificando conta Instagram...</span>
    </div>
  )

  if (!item.client_id) return (
    <div className="flex items-center gap-2 p-3 bg-[color:var(--sm-bg-alt)] rounded-xl border border-[color:var(--sm-border)]">
      <AlertCircle className="w-3.5 h-3.5 text-[color:var(--sm-text-4)] flex-shrink-0" />
      <p className="text-xs text-[color:var(--sm-text-3)]">Este post não está vinculado a um cliente.</p>
    </div>
  )

  if (!igAccount) return (
    <div className="p-3 bg-[color:var(--sm-bg-alt)] rounded-xl border border-[color:var(--sm-border)] space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)' }}>
          <Instagram className="w-3.5 h-3.5 text-white" />
        </div>
        <p className="text-xs text-[color:var(--sm-text-2)] font-medium">Instagram não conectado</p>
      </div>
      <p className="text-[11px] text-[color:var(--sm-text-3)]">
        Acesse o perfil do cliente → aba <strong className="text-[color:var(--sm-text-3)]">Instagram</strong> para conectar a conta.
      </p>
    </div>
  )

  if (success) return (
    <div className="flex items-center gap-3 p-3 bg-[color:var(--sm-bg-alt)] rounded-xl border border-[color:var(--sm-border)]">
      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
      <div>
        <p className="text-xs font-medium text-[color:var(--sm-text-1)]">Post agendado!</p>
        <p className="text-[11px] text-[color:var(--sm-text-3)] mt-0.5">
          Veja o status em <strong className="text-[color:var(--sm-text-3)]">Instagram → Agendados</strong>.
        </p>
      </div>
    </div>
  )

  const imageCount = imageAttachments.length
  const videoCount = videoAttachments.length
  const hasMedia   = imageCount > 0 || videoCount > 0

  return (
    <div className="p-3 bg-[color:var(--sm-bg-alt)] rounded-xl border border-[color:var(--sm-border)] space-y-3">
      {/* Conta conectada */}
      <div className="flex items-center gap-2">
        {igAccount.profile_picture_url ? (
          <img src={igAccount.profile_picture_url} alt="" className="w-6 h-6 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        ) : (
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)' }}>
            <Instagram className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        <span className="text-xs text-[color:var(--sm-text-2)] font-medium">@{igAccount.username}</span>
        <span className="ml-auto text-[10px] px-1.5 py-0.5 inline-flex items-center gap-1 border border-[color:var(--sm-border)] text-[color:var(--sm-text-2)]">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Conectado
        </span>
      </div>

      {!hasMedia && (
        <div className="flex items-center gap-2 text-[11px] text-amber-600">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Nenhuma imagem/vídeo anexado. Adicione mídia ao item no planejador.
        </div>
      )}

      {/* Tipo do post */}
      <div>
        <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-1.5">Tipo de post</p>
        <div className="flex gap-1.5 flex-wrap">
          {POST_TYPE_OPTS.filter(o => o.value === 'REELS' ? videoCount > 0 : imageCount > 0).map(opt => (
            <button
              key={opt.value}
              onClick={() => setPostType(opt.value)}
              className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-all ${
                postType === opt.value
                  ? 'bg-[#2563EB] text-white border-[#2563EB]'
                  : 'bg-[color:var(--sm-bg-card)] text-[color:var(--sm-text-3)] border-[color:var(--sm-border)] hover:border-[#2563EB]/50'
              }`}
            >
              {opt.label}
              {opt.value === 'IMAGE'          && imageCount > 0 && ` (${Math.min(1, imageCount)})`}
              {opt.value === 'CAROUSEL_ALBUM' && imageCount > 1 && ` (${Math.min(10, imageCount)})`}
              {opt.value === 'REELS'          && videoCount > 0 && ` (1)`}
            </button>
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div>
        <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-1.5">Legenda</p>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          rows={3}
          placeholder="Legenda do post..."
          className="w-full text-xs bg-[color:var(--sm-bg-card)] border border-[color:var(--sm-border)] rounded-lg px-3 py-2 text-[color:var(--sm-text-1)] placeholder-[color:var(--sm-text-4)] resize-none focus:outline-none focus:border-[#2563EB] transition-colors"
        />
      </div>

      {/* Data e hora */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-1.5">Data</p>
          <input
            type="date"
            value={scheduledAt || defaultDate}
            onChange={e => setScheduledAt(e.target.value)}
            className="w-full text-xs bg-[color:var(--sm-bg-card)] border border-[color:var(--sm-border)] rounded-lg px-3 py-2 text-[color:var(--sm-text-1)] focus:outline-none focus:border-[#2563EB] transition-colors"
          />
        </div>
        <div>
          <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-1.5">Horário</p>
          <input
            type="time"
            value={scheduledTime}
            onChange={e => setScheduledTime(e.target.value)}
            className="w-full text-xs bg-[color:var(--sm-bg-card)] border border-[color:var(--sm-border)] rounded-lg px-3 py-2 text-[color:var(--sm-text-1)] focus:outline-none focus:border-[#2563EB] transition-colors"
          />
        </div>
      </div>

      <Button
        size="sm"
        onClick={handleSchedule}
        disabled={publishing || !hasMedia}
        className="w-full h-9 text-white border-0 hover:opacity-90" style={{ background: '#2563EB' }}
      >
        {publishing
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Agendando...</>
          : <><Instagram className="w-3.5 h-3.5 mr-1.5" /> Agendar no Instagram</>}
      </Button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlannerItemViewModal({
  item,
  open,
  onClose,
  showAgencyActions = false,
}: {
  item: PlannerItem
  open: boolean
  onClose: () => void
  showAgencyActions?: boolean
}) {
  const allMedia = (item.attachments ?? [])
    .filter(a => a.file_type.startsWith('image/') || a.file_type.startsWith('video/'))
    .sort((a, b) => a.sort_order - b.sort_order)

  const otherAttachments = (item.attachments ?? []).filter((a: PlannerAttachment) =>
    !a.file_type.startsWith('image/') && !a.file_type.startsWith('video/')
  )

  const [imgIdx, setImgIdx]           = useState(0)
  const [editingStatus, setEditingStatus] = useState(false)
  const [newStatus, setNewStatus]     = useState<PlannerStatus>(item.status as PlannerStatus)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [localApprovalStatus, setLocalApprovalStatus] = useState<ApprovalStatus | null>(
    item.approval_status as ApprovalStatus | null
  )

  useEffect(() => {
    setLocalApprovalStatus(item.approval_status as ApprovalStatus | null)
    setNewStatus(item.status as PlannerStatus)
  }, [item.approval_status, item.status, item.art_approval_status, item.copy_approval_status])

  useEffect(() => { setImgIdx(0) }, [item.id])

  const updateItem = useUpdatePlannerItem()
  const deleteItem = useDeletePlannerItem()
  const { toast } = useToast()

  const currentApproval = (localApprovalStatus ?? item.approval_status) as ApprovalStatus | null

  const handleMarkAdjustmentDone = async () => {
    try {
      await updateItem.mutateAsync({ id: item.id, approval_status: 'ajuste_realizado' })
      setLocalApprovalStatus('ajuste_realizado')
      toast('Ajuste marcado como realizado.', 'success')
    } catch (err: any) { toast(err.message, 'error') }
  }

  const handleStatusSave = async () => {
    try {
      await updateItem.mutateAsync({ id: item.id, status: newStatus })
      toast('Status atualizado!', 'success')
      setEditingStatus(false)
    } catch (err: any) { toast(err.message, 'error') }
  }

  const handleDelete = async () => {
    try {
      await deleteItem.mutateAsync(item.id)
      toast('Item removido.', 'success')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
      setConfirmDelete(false)
    }
  }

  const handleClose = () => {
    onClose()
    setConfirmDelete(false)
    setEditingStatus(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent
        className="p-0 overflow-hidden [&>button.absolute]:hidden gap-0 rounded-2xl shadow-2xl border-0 flex flex-col"
        style={{ width: '96vw', maxWidth: '64rem', height: '92vh' }}
      >
        <DialogTitle className="sr-only">{item.title}</DialogTitle>

        <div className="flex flex-1 min-h-0 overflow-hidden rounded-2xl">

          {/* ── Coluna Esquerda: apenas a mídia, cheia, sem nenhuma barra (estilo Instagram web) ── */}
          <div className="w-[42%] min-w-[260px] hidden sm:flex flex-col flex-shrink-0 overflow-hidden bg-black">

            {/* Área da imagem — cheia, sem letterbox (object-cover) */}
            <div className="flex-1 min-h-0 relative bg-black">
              {allMedia.length > 0 ? (
                <>
                  {allMedia[imgIdx].file_type.startsWith('image/') ? (
                    <img
                      src={allMedia[imgIdx].file_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <video
                      src={allMedia[imgIdx].file_url}
                      controls
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}

                  {/* Setas de navegação */}
                  {allMedia.length > 1 && (
                    <>
                      <button
                        onClick={() => setImgIdx(i => Math.max(0, i - 1))}
                        disabled={imgIdx === 0}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow hover:bg-white transition-colors disabled:opacity-25"
                      >
                        <ChevronLeft className="w-4 h-4 text-[color:var(--sm-text-2)]" />
                      </button>
                      <button
                        onClick={() => setImgIdx(i => Math.min(allMedia.length - 1, i + 1))}
                        disabled={imgIdx === allMedia.length - 1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow hover:bg-white transition-colors disabled:opacity-25"
                      >
                        <ChevronRight className="w-4 h-4 text-[color:var(--sm-text-2)]" />
                      </button>
                    </>
                  )}

                  {/* Abrir em nova aba */}
                  <a
                    href={allMedia[imgIdx].file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow hover:bg-white transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[color:var(--sm-text-3)]" />
                  </a>

                  {/* Miniaturas do carrossel — sobrepostas na base da imagem, com leve transparência */}
                  {allMedia.length > 1 && (
                    <div className="absolute bottom-0 inset-x-0 flex gap-1.5 px-3 pt-6 pb-2.5 overflow-x-auto bg-gradient-to-t from-black/75 to-transparent scrollbar-thin">
                      {allMedia.map((m, i) => (
                        <button
                          key={m.id}
                          onClick={() => setImgIdx(i)}
                          className={`w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${
                            i === imgIdx ? 'border-white shadow-md' : 'border-white/30 opacity-70 hover:opacity-100'
                          }`}
                        >
                          {m.file_type.startsWith('image/') ? (
                            <img src={m.file_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-[#182233] flex items-center justify-center">
                              <Video className="w-4 h-4 text-[color:var(--sm-text-4)]" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#111827]">
                  <ImageIcon className="w-10 h-10 text-[color:var(--sm-text-3)]" />
                  <p className="text-sm text-[color:var(--sm-text-3)]">Sem mídia</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Coluna Direita: Detalhes ──────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[color:var(--sm-bg-card)]">

            {/* Cabeçalho fixo */}
            <div className="px-5 pt-4 pb-3 border-b border-[color:var(--sm-border)] flex-shrink-0">
              {/* Linha superior: cliente + ações */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {item.client && (
                    <>
                      <Building2 className="w-3.5 h-3.5 text-[color:var(--sm-text-4)] flex-shrink-0" />
                      <span className="text-xs text-[color:var(--sm-text-4)] truncate">{item.client.company_name}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {showAgencyActions && !editingStatus && (
                    <button
                      onClick={() => setEditingStatus(true)}
                      title="Editar status"
                      className="p-1.5 rounded-lg hover:bg-black/5 text-[color:var(--sm-text-4)] hover:text-[color:var(--sm-text-3)] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={handleClose}
                    className="p-1.5 rounded-lg hover:bg-black/5 text-[color:var(--sm-text-4)] hover:text-[color:var(--sm-text-3)] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Título */}
              <h2 className="font-display text-[19px] font-bold text-[color:var(--sm-text-1)] leading-snug tracking-[-0.01em] break-words select-text mb-2">
                {item.title}
              </h2>

              {/* Meta: data · tipo · status · aprovação */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-[color:var(--sm-text-3)]">
                  {format(parseISO(item.scheduled_date), "dd 'de' MMM", { locale: ptBR })}
                  {item.scheduled_time && (
                    <> · {item.scheduled_time.slice(0, 5)}</>
                  )}
                </span>
                <span className="text-[color:var(--sm-text-4)]">·</span>
                <span className="text-xs text-[color:var(--sm-text-4)]">
                  {contentTypeLabels[item.content_type as ContentType]}
                </span>
                <span className="text-[color:var(--sm-text-4)]">·</span>

                {/* Status pill / edit inline */}
                {editingStatus ? (
                  <div className="flex items-center gap-1.5">
                    <Select value={newStatus} onValueChange={v => setNewStatus(v as PlannerStatus)}>
                      <SelectTrigger className="h-6 text-xs px-2 py-0 min-w-[90px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANNER_STATUSES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-6 text-xs px-2 py-0"
                      onClick={handleStatusSave}
                      disabled={updateItem.isPending}
                    >
                      Salvar
                    </Button>
                    <button
                      onClick={() => { setEditingStatus(false); setNewStatus(item.status as PlannerStatus) }}
                      className="text-xs text-[color:var(--sm-text-4)] hover:text-[color:var(--sm-text-3)] transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${statusPillStyle[item.status as PlannerStatus]}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusDot[item.status as PlannerStatus]}`} />
                    {statusLabels[item.status as PlannerStatus]}
                  </span>
                )}

                {/* Approval status inline */}
                {currentApproval && (
                  <>
                    <span className="text-[color:var(--sm-text-4)]">·</span>
                    <div className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${approvalDot[currentApproval]}`} />
                      <span className={`text-xs font-medium ${approvalTextColor[currentApproval]}`}>
                        {approvalLabel[currentApproval]}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Conteúdo rolável */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Legenda */}
              {item.notes && (
                <div>
                  <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-1.5">Legenda</p>
                  <p className="text-sm text-[color:var(--sm-text-2)] leading-relaxed whitespace-pre-wrap break-words select-text">
                    {item.notes}
                  </p>
                </div>
              )}

              {/* Mídia (mobile: painel esquerdo oculto) */}
              {allMedia.length > 0 && (
                <div className="sm:hidden">
                  <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-2">Prévia do post</p>

                  {/* Visualizador principal */}
                  <div className="relative rounded-2xl overflow-hidden bg-[color:var(--sm-bg-alt)] border border-[color:var(--sm-border)]">
                    {/* Mídia atual */}
                    <div className="relative w-full aspect-[4/5] flex items-center justify-center bg-[color:var(--sm-bg-alt)]">
                      {allMedia[imgIdx].file_type.startsWith('image/') ? (
                        <img
                          src={allMedia[imgIdx].file_url}
                          alt={allMedia[imgIdx].file_name}
                          className="w-full h-full object-contain"
                          draggable={false}
                        />
                      ) : (
                        <video
                          src={allMedia[imgIdx].file_url}
                          controls
                          autoPlay={false}
                          className="w-full h-full object-contain"
                        />
                      )}

                      {/* Setas de navegação */}
                      {allMedia.length > 1 && (
                        <>
                          <button
                            onClick={() => setImgIdx(i => Math.max(0, i - 1))}
                            disabled={imgIdx === 0}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-md disabled:opacity-25 active:scale-95 transition-all"
                          >
                            <ChevronLeft className="w-5 h-5 text-[color:var(--sm-text-2)]" />
                          </button>
                          <button
                            onClick={() => setImgIdx(i => Math.min(allMedia.length - 1, i + 1))}
                            disabled={imgIdx === allMedia.length - 1}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-md disabled:opacity-25 active:scale-95 transition-all"
                          >
                            <ChevronRight className="w-5 h-5 text-[color:var(--sm-text-2)]" />
                          </button>
                        </>
                      )}

                      {/* Contador / indicador */}
                      {allMedia.length > 1 && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full">
                          {allMedia.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setImgIdx(i)}
                              className={`rounded-full transition-all ${
                                i === imgIdx
                                  ? 'w-4 h-1.5 bg-[color:var(--sm-bg-card)]'
                                  : 'w-1.5 h-1.5 bg-white/50'
                              }`}
                            />
                          ))}
                        </div>
                      )}

                      {/* Botão abrir em nova aba */}
                      <a
                        href={allMedia[imgIdx].file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[color:var(--sm-text-3)]" />
                      </a>
                    </div>

                    {/* Tira de thumbnails quando carrossel */}
                    {allMedia.length > 1 && (
                      <div className="flex gap-1.5 p-2.5 bg-[color:var(--sm-bg-alt)] overflow-x-auto">
                        {allMedia.map((m, i) => (
                          <button
                            key={m.id}
                            onClick={() => setImgIdx(i)}
                            className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${
                              i === imgIdx
                                ? 'border-[#2563EB] shadow-md'
                                : 'border-transparent opacity-60'
                            }`}
                          >
                            {m.file_type.startsWith('image/') ? (
                              <img src={m.file_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-[color:var(--sm-bg-alt)] flex items-center justify-center">
                                <Video className="w-4 h-4 text-[color:var(--sm-text-3)]" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Outros anexos */}
              {otherAttachments.length > 0 && (
                <div>
                  <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-2">Anexos</p>
                  <div className="space-y-1.5">
                    {otherAttachments.map((att: PlannerAttachment) => (
                      <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-2.5 bg-[color:var(--sm-bg-alt)] border border-[color:var(--sm-border)] rounded-xl hover:border-[#2563EB]/50 hover:bg-black/5 transition-colors min-w-0 overflow-hidden">
                        <FileTypeIcon type={att.file_type} size="md" />
                        <span className="text-xs text-[color:var(--sm-text-2)] truncate flex-1">{att.file_name}</span>
                        {att.file_size && (
                          <span className="text-[10px] text-[color:var(--sm-text-4)] flex-shrink-0">{formatFileSize(att.file_size)}</span>
                        )}
                        <ExternalLink className="w-3 h-3 text-[color:var(--sm-text-4)] flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Links */}
              {item.links && item.links.length > 0 && (
                <div>
                  <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-2">Links</p>
                  <div className="space-y-1.5">
                    {item.links.map(link => (
                      <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-2.5 bg-[color:var(--sm-bg-alt)] border border-[color:var(--sm-border)] rounded-xl hover:border-[#2563EB]/50 hover:bg-black/5 transition-colors min-w-0 overflow-hidden">
                        <Link2 className="w-3.5 h-3.5 text-[#2563EB] flex-shrink-0" />
                        <span className="text-xs text-[#2563EB] flex-1 min-w-0 break-all">{link.label || link.url}</span>
                        <ExternalLink className="w-3 h-3 text-[color:var(--sm-text-4)] flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Resposta do cliente ─────────────────────────────────── */}
              {item.approval_status && (
                <div>
                  <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-2">Resposta do Cliente</p>

                  {/* Status geral + timestamp */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${approvalDot[currentApproval ?? 'pendente_aprovacao']}`} />
                    <span className={`text-xs font-medium ${approvalTextColor[currentApproval ?? 'pendente_aprovacao']}`}>
                      {approvalLabel[currentApproval ?? 'pendente_aprovacao']}
                    </span>
                    {item.reviewed_at && (
                      <span className="text-[10px] text-[color:var(--sm-text-4)] ml-auto">
                        {format(parseISO(item.reviewed_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {/* Arte */}
                    {item.art_approval_status && (
                      <ApprovalFieldBlock
                        label="Arte"
                        status={item.art_approval_status as ApprovalStatus}
                        feedback={item.art_feedback ?? null}
                        showAction={showAgencyActions}
                        onMarkDone={async () => {
                          const newCopyStatus = item.copy_approval_status as ApprovalStatus | null
                          const newOverall = computeOverallApproval('ajuste_realizado', newCopyStatus)
                          await updateItem.mutateAsync({
                            id: item.id,
                            art_approval_status: 'ajuste_realizado',
                            approval_status: newOverall,
                          } as any)
                          if (newOverall === 'ajuste_realizado') {
                            await notifyClientAdjustmentDone(item.client_id ?? null, item.id)
                          }
                          toast('Ajuste de Arte marcado como realizado.', 'success')
                        }}
                        isPending={updateItem.isPending}
                      />
                    )}

                    {/* Copy */}
                    {item.copy_approval_status && (
                      <ApprovalFieldBlock
                        label="Copy"
                        status={item.copy_approval_status as ApprovalStatus}
                        feedback={item.copy_feedback ?? null}
                        showAction={showAgencyActions}
                        onMarkDone={async () => {
                          const newArtStatus = item.art_approval_status as ApprovalStatus | null
                          const newOverall = computeOverallApproval(newArtStatus, 'ajuste_realizado')
                          await updateItem.mutateAsync({
                            id: item.id,
                            copy_approval_status: 'ajuste_realizado',
                            approval_status: newOverall,
                          } as any)
                          if (newOverall === 'ajuste_realizado') {
                            await notifyClientAdjustmentDone(item.client_id ?? null, item.id)
                          }
                          toast('Ajuste de Copy marcado como realizado.', 'success')
                        }}
                        isPending={updateItem.isPending}
                      />
                    )}

                    {/* Fallback: feedback geral (posts legados sem Arte/Copy parcial) */}
                    {!item.art_approval_status && !item.copy_approval_status && item.client_feedback && (
                      <div className="bg-[color:var(--sm-bg-alt)] rounded-xl px-3 py-2 border border-[color:var(--sm-border)]">
                        <p className="text-xs text-[color:var(--sm-text-2)] leading-relaxed break-words select-text">
                          "{item.client_feedback}"
                        </p>
                      </div>
                    )}

                    {/* Botão legado ajuste realizado */}
                    {showAgencyActions && !item.art_approval_status && !item.copy_approval_status &&
                      currentApproval === 'ajuste_solicitado' && (
                      <button
                        onClick={handleMarkAdjustmentDone}
                        disabled={updateItem.isPending}
                        className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg text-[#2563EB] border border-[#2563EB]/40 hover:bg-[#2563EB]/10 transition-colors disabled:opacity-50"
                      >
                        {updateItem.isPending
                          ? <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          : <Check className="w-3 h-3" />}
                        Ajuste realizado
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Agendar no Instagram ────────────────────────────────── */}
              {showAgencyActions && item.status !== 'publicado' && (
                <div>
                  <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Instagram className="w-3 h-3" /> Agendar no Instagram
                  </p>
                  <InstagramScheduleSection item={item} />
                </div>
              )}

              {/* ── Comentários ────────────────────────────────────────── */}
              <div>
                <PlannerCommentsThread plannerId={item.id} role="agency" />
              </div>

              {/* ── Excluir ────────────────────────────────────────────── */}
              {showAgencyActions && (
                <div className="pt-3 border-t border-[color:var(--sm-border)]">
                  {confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[color:var(--sm-text-3)] mr-1">Confirmar exclusão?</span>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs text-[color:var(--sm-text-3)] hover:text-[color:var(--sm-text-2)] px-2.5 py-1 rounded-lg border border-[color:var(--sm-border)] hover:bg-black/5 transition-colors"
                      >
                        Não
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={deleteItem.isPending}
                        className="text-xs text-red-600 px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        Sim, excluir
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 text-xs text-[color:var(--sm-text-4)] hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir item
                    </button>
                  )}
                </div>
              )}

            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
