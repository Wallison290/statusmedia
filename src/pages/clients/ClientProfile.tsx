import { useParams, Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Edit, Instagram, Mail, Globe, Phone, ArrowLeft, Save, Brain,
  Plus, Trash2, ImageIcon, X, Upload, Eye, Pencil, Link2, ExternalLink,
  DollarSign, CalendarDays, CheckCircle2, AlertCircle, Clock, Ban, ChevronDown,
  Unlink, RefreshCw, Send, Lightbulb,
  Home, CheckSquare, UserCircle, Dna, Briefcase, Folder, Headphones, TrendingUp, ClipboardList,
  MoreHorizontal,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PortalAccessPanel } from '@/components/clients/PortalAccessPanel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useClient, useBrandDNA, useUpsertBrandDNA, useUpdateClient, useRegisterPayment } from '@/hooks/useClients'
import { useClientInstagramAccount, useAllInstagramAccounts, useDisconnectInstagram } from '@/hooks/useInstagram'
import { useSubscription } from '@/hooks/useSubscription'
import { useTasks } from '@/hooks/useTasks'
import { usePlanner } from '@/hooks/usePlanner'
import { useContentAssets, useCreateContentAsset, useUpdateContentAsset, useDeleteContentAsset } from '@/hooks/useContentAssets'
import { useAuth } from '@/hooks/useAuth'
import { OnboardingTab } from './tabs/OnboardingTab'
import { MaterialsTab } from './tabs/MaterialsTab'
import { SupportTab } from './tabs/SupportTab'
import { TasksTab } from './tabs/TasksTab'
import { PlannerItemViewModal } from '@/components/PlannerItemViewModal'
import { ReportsTab } from './tabs/ReportsTab'
import { WeeklyFormTab } from './tabs/WeeklyFormTab'
import { RequestsIdeasTab } from './tabs/RequestsIdeasTab'
import { useToast } from '@/components/ui/toast'
import { useTheme } from '@/contexts/ThemeContext'
import { formatDate, contentTypeLabels, cn } from '@/utils/formatters'
import { format, parseISO, startOfWeek, endOfWeek, addMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { calcFinancialStatus, financialStatusLabel, getFinancialAuxText } from '@/utils/financial'
import { isImageUrl } from '@/utils/media'
import type { FinancialStatus } from '@/types'
import { supabase } from '@/integrations/supabase/client'
import { uploadArquivo } from '@/lib/uploadArquivo'
import { getBannerStyle, clientBannerId, CLIENT_STATUS } from '@/utils/clientBanner'
import { buildInstagramOAuthUrl, isInstagramConfigured } from '@/lib/instagramOAuth'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { ContentAsset, ContentType, PlannerItem } from '@/types'

// ─── Asset Card ───────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onEdit,
  onDelete,
  onView,
}: {
  asset: ContentAsset
  onEdit: () => void
  onDelete: () => void
  onView: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const isImage = isImageUrl(asset.media_url)
  const iconBtn = 'w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors'

  return (
    <div className="group rounded-2xl border overflow-hidden transition-colors hover:border-[#2563EB]/50"
      style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <button className="block w-full aspect-square overflow-hidden" style={{ background: 'var(--sm-bg-alt)' }} onClick={onView} aria-label={`Ver ${asset.title}`}>
        {isImage ? (
          <img src={asset.media_url!} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
        ) : (
          <span className="w-full h-full flex flex-col items-center justify-center gap-1.5">
            <ImageIcon className="w-7 h-7" style={{ color: 'var(--sm-text-4)' }} />
            {asset.media_url && (
              <span className="text-[10.5px] font-semibold" style={{ color: 'var(--sm-text-4)' }}>
                {asset.media_url.split('.').pop()?.split('?')[0]?.toUpperCase() || 'ARQUIVO'}
              </span>
            )}
          </span>
        )}
      </button>

      <div className="px-3 pt-2.5">
        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{asset.title}</p>
        <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>{contentTypeLabels[asset.content_type]}</p>
      </div>

      {confirming ? (
        <div className="px-3 pb-2 pt-1 flex items-center gap-1.5">
          <span className="text-[11.5px] flex-1" style={{ color: 'var(--sm-text-3)' }}>Excluir?</span>
          <button className="h-7 px-2 rounded-md text-[11.5px] hover:bg-black/5" style={{ color: 'var(--sm-text-2)' }} onClick={() => setConfirming(false)}>Não</button>
          <button className="h-7 px-2 rounded-md text-[11.5px] font-semibold" style={{ color: '#EF4444' }} onClick={() => { setConfirming(false); onDelete() }}>Sim</button>
        </div>
      ) : (
        <div className="px-1.5 pb-1.5 flex items-center" style={{ color: 'var(--sm-text-3)' }}>
          <button className={iconBtn} onClick={onView} title="Ver" aria-label="Ver"><Eye className="w-3.5 h-3.5" /></button>
          <button className={iconBtn} onClick={onEdit} title="Editar" aria-label="Editar"><Pencil className="w-3.5 h-3.5" /></button>
          <button className={`${iconBtn} ml-auto hover:text-red-500`} onClick={() => setConfirming(true)} title="Excluir" aria-label="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  )
}

// ─── Asset View Dialog ────────────────────────────────────────────────────────

function AssetViewDialog({
  asset,
  open,
  onClose,
  onEdit,
}: {
  asset: ContentAsset | null
  open: boolean
  onClose: () => void
  onEdit: () => void
}) {
  if (!asset) return null
  const isImage = isImageUrl(asset.media_url)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-[14px] break-words">{asset.title}</DialogTitle>
          <p className="text-[11px] text-[color:var(--sm-text-4)] mt-0.5">
            {contentTypeLabels[asset.content_type]} · {formatDate(asset.created_at)}
          </p>
        </DialogHeader>
        <div className="space-y-3 mt-1 min-w-0 w-full max-w-full overflow-x-hidden">
          {asset.media_url && (
            isImage ? (
              <a href={asset.media_url} target="_blank" rel="noopener noreferrer" className="block w-full max-w-full overflow-hidden">
                <img
                  src={asset.media_url}
                  alt={asset.title}
                  className="w-full max-w-full max-h-[60vh] rounded-lg border border-[color:var(--sm-border)] object-contain"
                />
              </a>
            ) : (
              <a
                href={asset.media_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-lg border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)] hover:bg-[#2563EB]/10 transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-[color:var(--sm-text-4)]" />
                <span className="text-[12px] text-[color:var(--sm-text-2)] flex-1 truncate">Abrir arquivo</span>
              </a>
            )
          )}
          {asset.caption && (
            <div className="p-3 rounded-lg bg-[color:var(--sm-bg-alt)] border border-[color:var(--sm-border)]">
              <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-1.5">Legenda</p>
              <p className="text-[13px] text-[color:var(--sm-text-2)] leading-relaxed whitespace-pre-wrap break-words">{asset.caption}</p>
            </div>
          )}
          {asset.observations && (
            <div className="p-3 rounded-lg bg-[color:var(--sm-bg-alt)] border border-[color:var(--sm-border)]">
              <p className="text-[10px] text-[color:var(--sm-text-4)] uppercase tracking-wide mb-1.5">Observações</p>
              <p className="text-[13px] text-[color:var(--sm-text-3)] leading-relaxed break-words">{asset.observations}</p>
            </div>
          )}
          {asset.link_url && (
            <a
              href={asset.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-3 rounded-lg border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)] hover:bg-[#2563EB]/10 transition-colors min-w-0 max-w-full overflow-hidden"
            >
              <Link2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span className="text-[12px] text-blue-600 flex-1 min-w-0 break-all">{asset.link_url}</span>
              <ExternalLink className="w-3.5 h-3.5 text-[color:var(--sm-text-4)] flex-shrink-0" />
            </a>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          <Button size="sm" onClick={onEdit}><Pencil className="w-3 h-3" /> Editar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Faixa da mensalidade ─────────────────────────────────────────────────────
// Uma linha só (mensalidade muda uma vez por mês; o conteúdo, todo dia). A
// barrinha à esquerda ganha cor quando pede atenção: amarelo vencendo, vermelho
// atrasado. Situação sempre como ponto + texto.

const FIN_STATUS_COLOR: Record<FinancialStatus, string> = {
  ativo: '#22C55E', vence_em_breve: '#F59E0B', atrasado: '#EF4444', cancelado: '#64748B',
}

function FinancialCard({ client }: { client: import('@/types').Client }) {
  const updateClient = useUpdateClient()
  const registerPayment = useRegisterPayment()
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)

  const status = calcFinancialStatus(client)
  const aux = getFinancialAuxText(client, status)
  const attention = status === 'atrasado' || status === 'vence_em_breve'

  if (client.valor_mensal == null && client.dia_vencimento == null) return null

  const pay = async () => {
    try { await registerPayment.mutateAsync(client.id); toast('Pagamento registrado.', 'success') }
    catch (err: any) { toast(err.message, 'error') }
  }
  const setStatus = async (patch: Partial<import('@/types').Client>, msg: string) => {
    try { await updateClient.mutateAsync({ id: client.id, ...patch } as any); toast(msg, 'success'); setMenuOpen(false) }
    catch (err: any) { toast(err.message, 'error') }
  }

  return (
    <div className="relative rounded-2xl border pl-5 pr-3 sm:pr-4 py-3 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2"
      style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: attention ? FIN_STATUS_COLOR[status] : 'transparent' }} />

      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-4)' }}>Mensalidade</p>
        <p className="font-display text-[19px] font-bold tabular-nums leading-tight" style={{ color: 'var(--sm-text-1)' }}>
          {client.valor_mensal != null
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(client.valor_mensal)
            : '—'}
        </p>
      </div>
      {client.dia_vencimento != null && (
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-4)' }}>Vencimento</p>
          <p className="text-[13.5px] font-medium" style={{ color: 'var(--sm-text-2)' }}>Dia {client.dia_vencimento}</p>
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-4)' }}>Situação</p>
        <p className="text-[13px] font-medium inline-flex items-center gap-1.5" style={{ color: 'var(--sm-text-2)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: FIN_STATUS_COLOR[status] }} />
          {financialStatusLabel(status)}
          {aux && <span className="font-normal" style={{ color: attention ? FIN_STATUS_COLOR[status] : 'var(--sm-text-4)' }}>· {aux}</span>}
        </p>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {status !== 'cancelado' && (
          <button onClick={pay} disabled={registerPayment.isPending}
            className="h-9 px-3 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'rgba(34,197,94,0.12)', color: '#16A34A' }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> {registerPayment.isPending ? 'Salvando…' : 'Registrar pagamento'}
          </button>
        )}
        <div className="relative">
          <button onClick={() => setMenuOpen(o => !o)} title="Alterar situação financeira"
            className="h-9 px-2.5 rounded-xl text-[12.5px] inline-flex items-center gap-1 hover:bg-black/5" style={{ color: 'var(--sm-text-3)' }}>
            Situação <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-xl border overflow-hidden shadow-2xl"
                style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
                <button onClick={() => setStatus({ manual_status_override: false }, 'Situação no automático.')}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] text-left hover:bg-black/5" style={{ color: 'var(--sm-text-1)' }}>
                  <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
                  <span className="flex-1">Automático<span className="block text-[11px]" style={{ color: 'var(--sm-text-4)' }}>Segue a data de vencimento</span></span>
                  {!client.manual_status_override && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />}
                </button>
                <div className="h-px" style={{ background: 'var(--sm-border)' }} />
                {(['ativo', 'vence_em_breve', 'atrasado', 'cancelado'] as FinancialStatus[]).map(s => (
                  <button key={s} onClick={() => setStatus({ financial_status: s, manual_status_override: true }, 'Situação atualizada.')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-left hover:bg-black/5" style={{ color: 'var(--sm-text-2)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: FIN_STATUS_COLOR[s] }} />
                    <span className="flex-1">{financialStatusLabel(s)}</span>
                    {client.manual_status_override && client.financial_status === s && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <Link to="/financial?aba=clientes" title="Ver no Financeiro"
          className="h-9 px-2.5 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1 hover:bg-black/5" style={{ color: '#2563EB' }}>
          Financeiro <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

// ─── Planner Filter ───────────────────────────────────────────────────────────

type PlannerFilterType =
  | 'todos'
  | 'este_mes'
  | 'proximo_mes'
  | 'ultimos_3'
  | 'proximos_3'
  | 'mes_especifico'
  | 'personalizado'

function filterPlannerItems(
  items: PlannerItem[],
  filter: PlannerFilterType,
  month: string,
  dateStart: string,
  dateEnd: string,
): PlannerItem[] {
  if (filter === 'todos') return items

  const today = new Date(); today.setHours(0, 0, 0, 0)
  let start: Date, end: Date

  if (filter === 'este_mes') {
    start = startOfMonth(today); end = endOfMonth(today)
  } else if (filter === 'proximo_mes') {
    const next = addMonths(today, 1)
    start = startOfMonth(next); end = endOfMonth(next)
  } else if (filter === 'ultimos_3') {
    start = startOfMonth(addMonths(today, -3)); end = endOfMonth(today)
  } else if (filter === 'proximos_3') {
    start = startOfMonth(today); end = endOfMonth(addMonths(today, 3))
  } else if (filter === 'mes_especifico' && month) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1, 1)
    start = startOfMonth(d); end = endOfMonth(d)
  } else if (filter === 'personalizado') {
    if (!dateStart && !dateEnd) return items
    start = dateStart ? parseISO(dateStart) : new Date(0)
    end   = dateEnd   ? parseISO(dateEnd)   : new Date(9999, 11, 31)
  } else {
    return items
  }

  return items.filter(item => {
    const d = parseISO(item.scheduled_date)
    return d >= start && d <= end
  })
}

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const label = format(new Date(y, m - 1, 1), 'MMMM yyyy', { locale: ptBR })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// ─── Planner Week View Helpers ────────────────────────────────────────────────

type WeekGroup = {
  key: string
  label: string
  dateRange: string
  items: PlannerItem[]
}

function groupPlannerByWeek(items: PlannerItem[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>()
  items.forEach(item => {
    const date = parseISO(item.scheduled_date)
    const weekStart = startOfWeek(date, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(date, { weekStartsOn: 1 })
    const key = format(weekStart, 'yyyy-MM-dd')
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: '',
        dateRange: `${format(weekStart, 'dd MMM', { locale: ptBR })} - ${format(weekEnd, 'dd MMM', { locale: ptBR })}`,
        items: [],
      })
    }
    map.get(key)!.items.push(item)
  })
  const sorted = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
  sorted.forEach((w, i) => { w.label = `Semana ${i + 1}` })
  return sorted
}

// Fundo sólido + texto branco (via inline style no local de uso) — imune ao
// tema claro/escuro, ao contrário de fundo translúcido + texto claro.
function getPlannerBadge(item: PlannerItem): { label: string; bg: string } {
  if (item.status === 'publicado') return { label: 'Publicado', bg: '#059669' }
  switch (item.approval_status) {
    case 'aprovado':          return { label: 'Aprovado',     bg: '#059669' }
    case 'reprovado':         return { label: 'Reprovado',    bg: '#dc2626' }
    case 'ajuste_solicitado': return { label: 'Ajuste',       bg: '#c2410c' }
    case 'ajuste_realizado':  return { label: 'Ajuste Feito', bg: '#2563EB' }
    default:                  return { label: 'Em Aprovação', bg: '#b45309' }
  }
}

function getCardAccentColor(item: PlannerItem): string {
  if (item.status === 'publicado') return '#10b981'
  switch (item.approval_status) {
    case 'aprovado':          return '#4ade80'
    case 'reprovado':         return '#f87171'
    case 'ajuste_solicitado': return '#fb923c'
    case 'ajuste_realizado':  return '#60a5fa'
    default:                  return '#facc15'
  }
}

function getWeekSummaryBadge(items: PlannerItem[]): { label: string; bg: string } {
  const hasAjuste    = items.some(i => i.approval_status === 'ajuste_solicitado')
  const hasReprovado = items.some(i => i.approval_status === 'reprovado')
  const allPublished = items.length > 0 && items.every(i => i.status === 'publicado')
  const allApproved  = items.length > 0 && items.every(i => i.approval_status === 'aprovado' || i.status === 'publicado')
  if (hasReprovado) return { label: 'Reprovado',   bg: '#dc2626' }
  if (hasAjuste)    return { label: 'Ajuste',      bg: '#c2410c' }
  if (allPublished) return { label: 'Publicado',   bg: '#059669' }
  if (allApproved)  return { label: 'Aprovado',    bg: '#059669' }
  return              { label: 'Em Aprovação', bg: '#b45309' }
}

// ─── Instagram Tab ────────────────────────────────────────────────────────────

function ClientInstagramTab({ clientId, userId }: { clientId: string; userId: string }) {
  const { data: igAccount, isLoading } = useClientInstagramAccount(clientId)
  const { data: allAccounts = [] }     = useAllInstagramAccounts()
  const { data: subData }              = useSubscription()
  const disconnect = useDisconnectInstagram()
  const { toast } = useToast()
  const [confirming, setConfirming] = useState(false)

  // Contas ativas (deduplicated por ig_user_id)
  const activeCount = new Set(allAccounts.map(a => a.ig_user_id)).size
  const maxProfiles = subData?.plan.instagramProfiles ?? 1
  const limitReached = maxProfiles !== -1 && !igAccount && activeCount >= maxProfiles

  const handleConnect = () => {
    if (!isInstagramConfigured) {
      toast('VITE_META_APP_ID não configurado.', 'error')
      return
    }
    if (limitReached) {
      const planName = subData?.plan.name ?? 'atual'
      toast(
        `Limite de ${maxProfiles} perfil${maxProfiles === 1 ? '' : 's'} do plano ${planName} atingido. Faça upgrade para conectar mais contas.`,
        'error'
      )
      return
    }
    const url = buildInstagramOAuthUrl(userId, clientId)
    window.location.href = url
  }

  const handleDisconnect = async () => {
    if (!igAccount) return
    try {
      await disconnect.mutateAsync(igAccount.id)
      toast('Instagram desconectado.', 'success')
      setConfirming(false)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!igAccount) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)' }}
        >
          <Instagram className="w-8 h-8 text-white" />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-semibold text-[color:var(--sm-text-1)]">Instagram não conectado</p>
          <p className="text-[12px] text-[color:var(--sm-text-4)] mt-1">
            Conecte a conta Business ou Creator deste cliente para agendar posts.
          </p>
          {/* Indicador de uso do limite */}
          {maxProfiles !== -1 && (
            <p className={`text-[11px] mt-2 font-medium ${limitReached ? 'text-red-500' : 'text-[#6f93c9]'}`}>
              {activeCount}/{maxProfiles} perfil{maxProfiles === 1 ? '' : 's'} usados do plano {subData?.plan.name ?? ''}
            </p>
          )}
        </div>
        <Button
          onClick={handleConnect}
          disabled={limitReached}
          className="gap-2"
          title={limitReached
            ? `Limite de ${maxProfiles} perfil${maxProfiles === 1 ? '' : 's'} atingido`
            : "Connect Instagram — starts Business Login for Instagram to link this client's professional account, so the agency can publish and read insights for it"}
        >
          <Instagram className="w-3.5 h-3.5" />
          Conectar Instagram
        </Button>
        {limitReached && (
          <p className="text-[11px] text-red-500 text-center max-w-[280px]">
            Faça upgrade do plano para conectar mais contas de Instagram.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Conta conectada */}
      <div className="flex items-center gap-4 p-4 rounded-xl border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-card)] shadow-sm">
        {igAccount.profile_picture_url ? (
          <img
            src={igAccount.profile_picture_url}
            alt={igAccount.username}
            className="w-14 h-14 rounded-full border-2 border-[color:var(--sm-border)] object-cover flex-shrink-0"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)' }}
          >
            <Instagram className="w-7 h-7 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-[color:var(--sm-text-1)]">@{igAccount.username}</p>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#22C55E]/15 text-[#4ade80] border border-[#22C55E]/30">
              Conectado
            </span>
          </div>
          {igAccount.name && (
            <p className="text-[12px] text-[color:var(--sm-text-3)] mt-0.5">{igAccount.name}</p>
          )}
          <p className="text-[12px] text-[color:var(--sm-text-4)] mt-0.5">
            {igAccount.followers_count.toLocaleString('pt-BR')} seguidores
          </p>
        </div>
        <div className="flex-shrink-0">
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[color:var(--sm-text-4)]">Desconectar?</span>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Não</Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-[#f87171]"
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
              >
                Sim
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)} className="text-[11px]">
              <Unlink className="w-3 h-3" /> Desconectar
            </Button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-4 rounded-xl border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)]">
        <p className="text-[12px] text-[color:var(--sm-text-3)] leading-relaxed">
          Com o Instagram conectado, você pode agendar posts diretamente pelo modal de planejamento.
          Basta abrir qualquer post no planejador e usar a aba <strong>"Agendar no Instagram"</strong>.
        </p>
      </div>

      {/* Reconectar */}
      <Button size="sm" variant="outline" onClick={handleConnect} className="text-[11px]">
        <RefreshCw className="w-3 h-3" /> Reconectar / Trocar conta
      </Button>
    </div>
  )
}

// ─── Painel de situação ───────────────────────────────────────────────────────
// Responde "o que está pegando neste cliente agora?" antes de qualquer dado
// estático. Cada item leva direto para a aba onde se resolve.

type ResumoSituacao = {
  aguardandoAprovacao: number
  ajusteSolicitado: number
  tarefasAtrasadas: number
  tarefasAbertas: number
  proximoPost: { titulo: string; data: string } | null
}

function SituacaoDoCliente({
  resumo, onIr,
}: { resumo: ResumoSituacao; onIr: (aba: string) => void }) {
  const itens = [
    { n: resumo.aguardandoAprovacao, label: resumo.aguardandoAprovacao === 1 ? 'conteúdo aguardando aprovação' : 'conteúdos aguardando aprovação', aba: 'planner', cor: '#3B82F6' },
    { n: resumo.ajusteSolicitado, label: resumo.ajusteSolicitado === 1 ? 'ajuste pedido pelo cliente' : 'ajustes pedidos pelo cliente', aba: 'planner', cor: '#8B5CF6' },
    { n: resumo.tarefasAtrasadas, label: resumo.tarefasAtrasadas === 1 ? 'tarefa atrasada' : 'tarefas atrasadas', aba: 'tasks', cor: '#EF4444' },
    { n: resumo.tarefasAbertas, label: resumo.tarefasAbertas === 1 ? 'tarefa em aberto' : 'tarefas em aberto', aba: 'tasks', cor: '#94A3B8' },
  ].filter(i => i.n > 0)

  return (
    <section>
      <div className="flex items-end justify-between gap-3 mb-3">
        <h2 className="font-display text-[17px] font-bold flex items-baseline gap-2" style={{ color: 'var(--sm-text-1)' }}>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>01</span>
          Precisa de você
        </h2>
        {resumo.proximoPost && (
          <p className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--sm-text-3)' }}>
            <CalendarDays className="w-3.5 h-3.5" /> Próximo post: <strong style={{ color: 'var(--sm-text-1)' }}>{resumo.proximoPost.data}</strong>
          </p>
        )}
      </div>

      {itens.length === 0 ? (
        <div className="rounded-2xl border px-5 py-4 flex items-center gap-2.5" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#22C55E' }} />
          <p className="text-[13px]" style={{ color: 'var(--sm-text-2)' }}>Nada pendente neste cliente agora.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {itens.map(i => (
            <button key={i.label} onClick={() => onIr(i.aba)}
              className="relative text-left rounded-2xl border pl-5 pr-4 py-3.5 transition-colors hover:border-[#2563EB]/50"
              style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
              <span className="absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded-r" style={{ background: i.cor }} />
              <p className="font-display text-[26px] font-bold tabular-nums leading-none" style={{ color: 'var(--sm-text-1)' }}>{i.n}</p>
              <p className="text-[12px] mt-1.5" style={{ color: 'var(--sm-text-3)' }}>{i.label} →</p>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Abas ─────────────────────────────────────────────────────────────────────
// Ordem por frequência de uso, não por ordem histórica: o que se abre todo dia
// vem primeiro. Sem cor própria — cor aqui é reservada para status.

type TabDef = { value: string; label: string; Icon: React.ElementType }

// As quatro do dia a dia ficam sempre visíveis.
const TABS_PRINCIPAIS: TabDef[] = [
  { value: 'overview', label: 'Visão Geral',  Icon: Home },
  { value: 'planner',  label: 'Planejamento', Icon: CalendarDays },
  { value: 'tasks',    label: 'Tarefas',      Icon: CheckSquare },
  { value: 'requests', label: 'Solicitações', Icon: Lightbulb },
]

// Os outros oito, agrupados por assunto.
type Grupo = { titulo: string; itens: TabDef[] }

const GRUPO_CONTEUDO: Grupo = { titulo: 'Conteúdo', itens: [
  { value: 'contents',  label: 'Arsenal',   Icon: Briefcase },
  { value: 'materials', label: 'Materiais', Icon: Folder },
]}
const GRUPO_CANAIS: Grupo = { titulo: 'Canais e resultados', itens: [
  { value: 'instagram', label: 'Instagram',  Icon: Instagram },
  { value: 'results',   label: 'Resultados', Icon: TrendingUp },
]}
const GRUPO_MARCA: Grupo = { titulo: 'Marca', itens: [
  { value: 'dna',        label: 'DNA da Marca', Icon: Dna },
  { value: 'onboarding', label: 'Onboarding',   Icon: UserCircle },
]}
const GRUPO_CLIENTE: Grupo = { titulo: 'Cliente', itens: [
  { value: 'formulario', label: 'Formulário', Icon: ClipboardList },
  { value: 'support',    label: 'Suporte',    Icon: Headphones },
]}

// Em tela larga, Conteúdo e Canais sobem para a barra — sobra espaço para eles.
// Em tela estreita, descem para o "Mais", para nada estourar nem voltar a
// aparecer barra de rolagem. O menu só lista o que NÃO está visível, então
// nenhuma aba aparece em dois lugares ao mesmo tempo.
// A ordem aqui é a ordem de prioridade: o primeiro é o primeiro a subir para a
// barra quando há espaço. Canais e resultados vem antes de Conteúdo porque
// Instagram e Resultados são consultados com mais frequência que Arsenal e
// Materiais.
const GRUPOS_PROMOVIVEIS: Grupo[] = [GRUPO_CANAIS, GRUPO_CONTEUDO]
const GRUPOS_SEMPRE_NO_MENU: Grupo[] = [GRUPO_MARCA, GRUPO_CLIENTE]

const TAB_VALUES: readonly string[] = [
  ...TABS_PRINCIPAIS,
  ...GRUPOS_PROMOVIVEIS.flatMap(g => g.itens),
  ...GRUPOS_SEMPRE_NO_MENU.flatMap(g => g.itens),
].map(t => t.value)

// Largura mínima da própria barra para caber cada grupo promovido, somando os
// botões que já existem à esquerda. Medir a barra em vez da janela é o que faz
// isso funcionar com qualquer escala de tela do Windows, qualquer zoom do
// navegador e com o menu lateral recolhido ou não.
const LARGURA_PARA_GRUPO = [900, 1160]

/** Observa a largura real do elemento e devolve em pixels de CSS. */
function useLarguraDe<T extends HTMLElement>(ref: React.RefObject<T>): number {
  const [largura, setLargura] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setLargura(entry.contentRect.width))
    ro.observe(el)
    setLargura(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [ref])
  return largura
}

// ─── Barra de abas ────────────────────────────────────────────────────────────
// Uma linha, sem barra de rolagem. As quatro do dia a dia ficam à vista; as
// outras oito vivem no "Mais", separadas por assunto. Quando a aba ativa é uma
// das de dentro, o botão "Mais" assume o nome dela, para você nunca perder a
// referência de onde está.

function BotaoAba({
  tab, active, pending, onClick, dentroDoMenu = false,
}: {
  tab: TabDef
  active: boolean
  pending?: number
  onClick: () => void
  dentroDoMenu?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2 whitespace-nowrap transition-colors ${
        dentroDoMenu
          ? 'w-full px-3 h-9 rounded-lg text-left hover:bg-black/5'
          : 'px-3 h-10 border-b-2 -mb-px flex-shrink-0'
      }`}
      style={dentroDoMenu
        ? (active ? { background: 'rgba(37,99,235,0.10)' } : undefined)
        : { borderColor: active ? '#2563EB' : 'transparent' }}
    >
      <tab.Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.8}
        style={{ color: active ? '#2563EB' : 'var(--sm-text-4)' }} />
      <span className={`text-[13px] ${active ? 'font-semibold' : 'font-medium'}`}
        style={{ color: active ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>
        {tab.label}
      </span>
      {/* Só aparece quando há algo esperando. Sem número = nada a fazer aqui. */}
      {!!pending && pending > 0 && (
        <span
          className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ml-auto tabular-nums"
          style={{ background: 'rgba(37,99,235,0.14)', color: '#2563EB' }}
          title={`${pending} ${pending === 1 ? 'item aguardando' : 'itens aguardando'}`}
        >
          {pending}
        </span>
      )}
    </button>
  )
}

function TabBar({
  activeTab, onChange, pendencias,
}: {
  activeTab: string
  onChange: (v: string) => void
  pendencias: Record<string, number>
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const barraRef = useRef<HTMLDivElement>(null)
  const largura = useLarguraDe(barraRef)

  // Quantos grupos cabem na barra agora, medindo a barra de verdade.
  const quantosCabem = LARGURA_PARA_GRUPO.filter(min => largura >= min).length
  const gruposNaBarra = GRUPOS_PROMOVIVEIS.slice(0, quantosCabem)
  const gruposNoMenu  = [...GRUPOS_PROMOVIVEIS.slice(quantosCabem), ...GRUPOS_SEMPRE_NO_MENU]
  const abaExtraAtiva = gruposNoMenu.flatMap(g => g.itens).find(t => t.value === activeTab)

  const Divisor = () => (
    <span className="w-px h-4 mx-1 flex-shrink-0 self-center" style={{ background: 'var(--sm-border)' }} />
  )

  return (
    // Sublinhado, igual ao Financeiro: sem caixa em volta, uma linha fina embaixo.
    // flex-wrap: no celular as abas continuam na linha de baixo em vez de
    // empurrar a página para fora da tela.
    <div ref={barraRef} className="flex flex-wrap items-end gap-x-1 border-b mb-6 max-w-full"
      style={{ borderColor: 'var(--sm-border)' }}>
      {TABS_PRINCIPAIS.map(t => (
        <BotaoAba key={t.value} tab={t} active={activeTab === t.value} pending={pendencias[t.value]} onClick={() => onChange(t.value)} />
      ))}

      {gruposNaBarra.map(grupo => (
        <span key={grupo.titulo} className="flex items-end gap-x-1">
          <Divisor />
          {grupo.itens.map(t => (
            <BotaoAba key={t.value} tab={t} active={activeTab === t.value} pending={pendencias[t.value]} onClick={() => onChange(t.value)} />
          ))}
        </span>
      ))}

      <Divisor />

      <div className="relative">
        <button onClick={() => setMenuAberto(o => !o)} aria-expanded={menuAberto}
          className="flex items-center gap-2 px-3 h-10 border-b-2 -mb-px whitespace-nowrap transition-colors"
          style={{ borderColor: abaExtraAtiva ? '#2563EB' : 'transparent' }}>
          {abaExtraAtiva
            ? <abaExtraAtiva.Icon className="w-4 h-4" strokeWidth={1.8} style={{ color: '#2563EB' }} />
            : <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} style={{ color: 'var(--sm-text-4)' }} />}
          <span className={`text-[13px] ${abaExtraAtiva ? 'font-semibold' : 'font-medium'}`}
            style={{ color: abaExtraAtiva ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>
            {abaExtraAtiva ? abaExtraAtiva.label : 'Mais'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 transition-transform"
            style={{ color: 'var(--sm-text-4)', transform: menuAberto ? 'rotate(180deg)' : undefined }} />
        </button>

        {menuAberto && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
            <div className="absolute left-0 top-full mt-1.5 z-20 w-56 max-w-[calc(100vw-2.5rem)] rounded-xl border shadow-2xl p-1.5"
              style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
              {gruposNoMenu.map((grupo, i) => (
                <div key={grupo.titulo} className={i > 0 ? 'mt-1.5 pt-1.5 border-t' : ''}
                  style={i > 0 ? { borderColor: 'var(--sm-border)' } : undefined}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] px-3 pb-1" style={{ color: 'var(--sm-text-4)' }}>
                    {grupo.titulo}
                  </p>
                  {grupo.itens.map(t => (
                    <BotaoAba key={t.value} tab={t} active={activeTab === t.value} pending={pendencias[t.value]} dentroDoMenu
                      onClick={() => { onChange(t.value); setMenuAberto(false) }} />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ClientProfile() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, agencyId } = useAuth()
  const { data: client, isLoading } = useClient(id!)
  const { data: dna } = useBrandDNA(id!)
  const { data: tasks } = useTasks(id)
  const { data: planner } = usePlanner(id)
  const { data: assets } = useContentAssets(id)
  const upsertDNA = useUpsertBrandDNA()
  const createAsset = useCreateContentAsset()
  const updateAsset = useUpdateContentAsset()
  const deleteAsset = useDeleteContentAsset()
  const { toast } = useToast()

  // Toast ao retornar do OAuth do Instagram
  useEffect(() => {
    if (searchParams.get('ig_connected') === 'true') {
      toast('Instagram conectado com sucesso!', 'success')
      setSearchParams(prev => { prev.delete('ig_connected'); return prev }, { replace: true })
    }
    const igError = searchParams.get('ig_error')
    if (igError) {
      const messages: Record<string, string> = {
        profile_limit:        'Limite de perfis Instagram do seu plano atingido. Faça upgrade para conectar mais contas.',
        auth_denied:          'Autorização negada pelo Instagram. Tente novamente e aceite as permissões solicitadas.',
        token_exchange_failed:'Falha ao autenticar com o Instagram. Verifique se o aplicativo Meta está configurado corretamente.',
        profile_failed:       'Não foi possível obter os dados do perfil. Certifique-se de usar uma conta Business ou Creator.',
        save_failed:          'Erro ao salvar a conexão no banco de dados. Tente novamente.',
        invalid_callback:     'Link de retorno inválido. Tente conectar novamente.',
        unknown:              'Erro inesperado ao conectar o Instagram. Tente novamente.',
      }
      toast(messages[igError] ?? 'Erro ao conectar Instagram. Tente novamente.', 'error')
      setSearchParams(prev => { prev.delete('ig_error'); return prev }, { replace: true })
    }
  }, [searchParams])

  const assetFileRef = useRef<HTMLInputElement>(null)

  const [selectedPlannerItem, setSelectedPlannerItem] = useState<PlannerItem | null>(null)
  const [plannerItemOpen, setPlannerItemOpen] = useState(false)

  // ── Aba ativa vive no endereço ────────────────────────────────────────────
  // Antes era só useState: atualizar a página voltava para "Visão Geral", não
  // dava para mandar a alguém o link de uma aba, e o botão voltar do navegador
  // não desfazia a troca. Agora /clients/:id?aba=planner resolve os três.
  const abaDaUrl = searchParams.get('aba')
  const activeTab = abaDaUrl && TAB_VALUES.includes(abaDaUrl) ? abaDaUrl : 'overview'

  const setActiveTab = (value: string) => {
    setSearchParams(prev => {
      if (value === 'overview') prev.delete('aba')
      else prev.set('aba', value)
      return prev
    })
  }

  // ── Pendências por aba ────────────────────────────────────────────────────
  // Conta o que ESPERA UMA AÇÃO, não o total de itens. "Tarefas 0" não dizia
  // nada; "Tarefas 3" agora significa três tarefas em aberto.
  const pendencias = useMemo<Record<string, number>>(() => {
    const aguardandoAprovacao = (planner || []).filter(p =>
      p.approval_status === 'pendente_aprovacao' ||
      p.approval_status === 'ajuste_solicitado'
    ).length

    const tarefasAbertas = (tasks || []).filter(t => t.status !== 'concluido').length

    return {
      planner: aguardandoAprovacao,
      tasks:   tarefasAbertas,
    }
  }, [planner, tasks])

  // ── Resumo da situação (painel da Visão Geral) ────────────────────────────
  const resumoSituacao = useMemo<ResumoSituacao>(() => {
    const hoje = format(new Date(), 'yyyy-MM-dd')

    const aguardandoAprovacao = (planner || []).filter(p => p.approval_status === 'pendente_aprovacao').length
    const ajusteSolicitado    = (planner || []).filter(p => p.approval_status === 'ajuste_solicitado').length

    const abertas = (tasks || []).filter(t => t.status !== 'concluido')
    const tarefasAtrasadas = abertas.filter(t => t.due_date && t.due_date < hoje).length
    // Não soma as atrasadas duas vezes: elas já aparecem no próprio item.
    const tarefasAbertas   = abertas.length - tarefasAtrasadas

    const futuros = (planner || [])
      .filter(p => p.scheduled_date >= hoje)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))

    const proximo = futuros[0]

    return {
      aguardandoAprovacao,
      ajusteSolicitado,
      tarefasAtrasadas,
      tarefasAbertas,
      proximoPost: proximo
        ? { titulo: proximo.title ?? '', data: format(parseISO(proximo.scheduled_date), "dd/MM") }
        : null,
    }
  }, [planner, tasks])

  // ── Planner filter ────────────────────────────────────────────────────────
  const [plannerFilter, setPlannerFilter]       = useState<PlannerFilterType>('este_mes')
  const [plannerMonth, setPlannerMonth]         = useState(() => format(new Date(), 'yyyy-MM'))
  const [plannerDateStart, setPlannerDateStart] = useState('')
  const [plannerDateEnd, setPlannerDateEnd]     = useState('')

  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    ;(planner || []).forEach(item => {
      set.add(format(parseISO(item.scheduled_date), 'yyyy-MM'))
    })
    for (let i = -3; i <= 6; i++) {
      set.add(format(addMonths(new Date(), i), 'yyyy-MM'))
    }
    return Array.from(set).sort()
  }, [planner])

  const filteredPlanner = useMemo(
    () => filterPlannerItems(planner || [], plannerFilter, plannerMonth, plannerDateStart, plannerDateEnd),
    [planner, plannerFilter, plannerMonth, plannerDateStart, plannerDateEnd],
  )

  const [dnaForm, setDnaForm] = useState({
    how_brand_speaks: '', how_brand_not_speaks: '', positioning: '',
    ideal_language: '', mental_triggers: '', communication_style: '',
  })

  useEffect(() => {
    if (dna) setDnaForm(dna as any)
  }, [dna])

  const handleSaveDNA = async () => {
    try {
      await upsertDNA.mutateAsync({ client_id: id!, ...dnaForm })
      toast('DNA da marca salvo!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const [backHover, setBackHover] = useState(false)
  const [editHover, setEditHover] = useState(false)
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<ContentAsset | null>(null)
  const [viewingAsset, setViewingAsset] = useState<ContentAsset | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [assetForm, setAssetForm] = useState({
    title: '',
    caption: '',
    content_type: 'post' as ContentType,
    observations: '',
    link_url: '',
  })
  const [assetFile, setAssetFile] = useState<File | null>(null)
  const [assetUploading, setAssetUploading] = useState(false)

  const resetAssetForm = () => {
    setAssetForm({ title: '', caption: '', content_type: 'post', observations: '', link_url: '' })
    setAssetFile(null)
    setEditingAsset(null)
  }

  const openCreateAsset = () => {
    resetAssetForm()
    setAssetModalOpen(true)
  }

  const openEditAsset = (asset: ContentAsset) => {
    setViewOpen(false)
    setEditingAsset(asset)
    setAssetForm({
      title: asset.title,
      caption: asset.caption || '',
      content_type: asset.content_type,
      observations: asset.observations || '',
      link_url: asset.link_url || '',
    })
    setAssetFile(null)
    setAssetModalOpen(true)
  }

  const openViewAsset = (asset: ContentAsset) => {
    setViewingAsset(asset)
    setViewOpen(true)
  }

  const handleSaveAsset = async () => {
    if (!assetForm.title.trim() || !user || !id) return
    setAssetUploading(true)
    try {
      let media_url: string | null = editingAsset?.media_url ?? null

      if (assetFile) {
        const ext = assetFile.name.split('.').pop() || 'bin'
        const path = `${agencyId!}/${id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { url } = await uploadArquivo('content-assets', path, assetFile)
        media_url = url
      }

      const payload = {
        title: assetForm.title.trim(),
        caption: assetForm.caption.trim() || null,
        content_type: assetForm.content_type,
        observations: assetForm.observations.trim() || null,
        media_url,
        link_url: assetForm.link_url.trim() || null,
        category: null as string | null,
      }

      if (editingAsset) {
        await updateAsset.mutateAsync({ id: editingAsset.id, ...payload })
        toast('Conteúdo atualizado!', 'success')
      } else {
        await createAsset.mutateAsync({
          user_id: agencyId!,
          client_id: id,
          ...payload,
        })
        toast('Conteúdo adicionado ao arsenal!', 'success')
      }

      setAssetModalOpen(false)
      resetAssetForm()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setAssetUploading(false)
    }
  }

  const handleDeleteAsset = async (asset: ContentAsset) => {
    try {
      await deleteAsset.mutateAsync({
        id: asset.id,
        clientId: asset.client_id,
        mediaUrl: asset.media_url,
      })
      toast('Conteúdo removido do arsenal.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  // ── Loading / not found ─────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="min-h-full p-4 md:p-6 space-y-5" style={{ background: 'var(--sm-bg-page)' }} aria-busy="true">
      <div className="h-[180px] rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
      <div className="h-[64px] rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
      <div className="h-[260px] rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
    </div>
  )

  if (!client) return (
    <div className="flex flex-col items-center justify-center gap-3 h-full p-6" style={{ background: 'var(--sm-bg-page)' }}>
      <p className="font-display text-[18px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Cliente não encontrado.</p>
      <Link to="/clients" className="text-[13px] font-semibold" style={{ color: '#2563EB' }}>← Voltar para Clientes</Link>
    </div>
  )

  const statusCfg = CLIENT_STATUS[client.status] ?? { label: client.status, color: '#94A3B8' }
  const contatos = [
    client.instagram && { Icon: Instagram, text: `@${client.instagram.replace('@', '')}` },
    client.email && { Icon: Mail, text: client.email },
    client.whatsapp && { Icon: Phone, text: client.whatsapp },
    client.website && { Icon: Globe, text: client.website },
  ].filter(Boolean) as { Icon: React.ElementType; text: string }[]

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">

        {/* ── Barra de topo: voltar + ações (no celular, ao lado do menu) ────── */}
        <div className="flex items-center justify-between gap-3 mb-4 max-md:pl-12 max-md:-mt-[3.25rem] max-md:min-h-[44px]">
          <Link to="/clients" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline" style={{ color: 'var(--sm-text-3)' }}>
            <ArrowLeft className="w-4 h-4" /> Clientes
          </Link>
          <div className="flex items-center gap-1.5">
            <Link to={`/clients/${id}/edit`}
              className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5 text-white"
              style={{ background: 'var(--sm-primary)' }}>
              <Edit className="w-3.5 h-3.5" /> Editar
            </Link>
          </div>
        </div>

        {/* ── Cabeçalho: capa do cliente + identidade ─────────────────────────── */}
        <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border overflow-hidden mb-4" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
          <div className="h-20 md:h-24" style={getBannerStyle(clientBannerId(client))} />
          <div className="px-4 md:px-6 pb-5 flex flex-col md:flex-row md:items-end gap-x-6 gap-y-3">
            <div className="-mt-9 flex-shrink-0">
              {client.logo_url ? (
                <img src={client.logo_url} alt="" className="w-[72px] h-[72px] rounded-2xl object-cover" style={{ boxShadow: '0 0 0 4px var(--sm-bg-card)' }} />
              ) : (
                <div className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center font-display font-bold text-[24px]"
                  style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)', boxShadow: '0 0 0 4px var(--sm-bg-card)' }}>
                  {client.company_name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="font-display text-[26px] md:text-[32px] font-bold leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]"
                  style={{ color: 'var(--sm-text-1)' }}>
                  {client.company_name}
                </h1>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: 'var(--sm-text-2)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: statusCfg.color }} />
                  {statusCfg.label}
                </span>
              </div>
              <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
                {client.responsible_name} · {client.niche} · cliente desde {formatDate(client.entry_date)}
              </p>
              {contatos.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 min-w-0 [overflow-wrap:anywhere]">
                  {contatos.map(c => (
                    <span key={c.text} className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
                      <c.Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} /> {c.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.header>

        {/* Acesso ao portal: convite, senha criada, último acesso */}
        <PortalAccessPanel clientId={client.id} />

        {/* ── Mensalidade ──────────────────────────────────────────────────── */}
        <FinancialCard client={client} />

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        {/* Antes eram 12 cartões de 90px numa grade, com uma cor diferente cada
            um — a navegação empurrava o conteúdo para fora da primeira tela e o
            arco-íris gastava as cores que o sistema usa para status. Agora é uma
            barra de uma linha, ícones neutros, e cor só onde há ação pendente. */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabBar
            activeTab={activeTab}
            onChange={setActiveTab}
            pendencias={pendencias}
          />

          {/* ── Visão Geral ───────────────────────────────────────────────── */}
          {/* A situação vem primeiro ("o que está pegando aqui agora?"); os dados
              de marca ficam abaixo, como ficha com linhas finas. */}
          <TabsContent value="overview">
            <SituacaoDoCliente resumo={resumoSituacao} onIr={setActiveTab} />

            {(() => {
              const fatos = [
                { label: 'Objetivo principal', value: client.main_objective },
                { label: 'Público-alvo', value: client.target_audience },
                { label: 'Tom de voz', value: client.tone_of_voice },
                { label: 'Estilo de comunicação', value: client.communication_style },
                { label: 'Diferenciais', value: client.differentials },
                { label: 'Serviços oferecidos', value: client.services_offered },
                { label: 'Palavras proibidas', value: client.forbidden_words },
                { label: 'Observações', value: client.observations },
              ].filter(f => f.value && String(f.value).trim())
              return (
                <section className="mt-8">
                  <div className="flex items-end justify-between gap-3 mb-3">
                    <h2 className="font-display text-[17px] font-bold flex items-baseline gap-2" style={{ color: 'var(--sm-text-1)' }}>
                      <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>02</span>
                      Sobre a marca
                    </h2>
                    <Link to={`/clients/${id}/edit`} className="text-[12px] font-semibold" style={{ color: '#2563EB' }}>Editar</Link>
                  </div>
                  {fatos.length === 0 ? (
                    <div className="rounded-2xl border px-5 py-6 text-center" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
                      <p className="text-[13px]" style={{ color: 'var(--sm-text-3)' }}>Nenhuma informação de marca cadastrada ainda.</p>
                      <Link to={`/clients/${id}/edit`} className="text-[12.5px] font-semibold mt-1 inline-block" style={{ color: '#2563EB' }}>Preencher agora →</Link>
                    </div>
                  ) : (
                    <dl className="rounded-2xl border grid md:grid-cols-2 overflow-hidden" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
                      {fatos.map((f, i) => (
                        <div key={f.label}
                          className={`px-5 py-4 ${i > 0 ? 'border-t' : ''} ${i === 1 ? 'md:border-t-0' : ''} ${i % 2 === 1 ? 'md:border-l' : ''}`}
                          style={{ borderColor: 'var(--sm-border)' }}>
                          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-4)' }}>{f.label}</dt>
                          <dd className="text-[13.5px] leading-relaxed mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: 'var(--sm-text-1)' }}>{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              )
            })()}
          </TabsContent>

          {/* ── DNA ──────────────────────────────────────────────────────── */}
          <TabsContent value="dna">
            <section>
              <div className="flex items-end justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-display text-[17px] font-bold" style={{ color: 'var(--sm-text-1)' }}>DNA da marca</h2>
                  <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>A IA usa estes campos para escrever no jeito da marca.</p>
                </div>
                <button onClick={handleSaveDNA} disabled={upsertDNA.isPending}
                  className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5 text-white disabled:opacity-50"
                  style={{ background: 'var(--sm-primary)' }}>
                  <Save className="w-3.5 h-3.5" /> {upsertDNA.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
              <div className="rounded-2xl border p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
                style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
                <Textarea label="Como a marca fala" value={dnaForm.how_brand_speaks} onChange={e => setDnaForm(p => ({ ...p, how_brand_speaks: e.target.value }))} placeholder="Ex: De forma descontraída..." rows={4} />
                <Textarea label="Como NÃO deve falar" value={dnaForm.how_brand_not_speaks} onChange={e => setDnaForm(p => ({ ...p, how_brand_not_speaks: e.target.value }))} placeholder="Ex: Sem jargões técnicos..." rows={4} />
                <Textarea label="Posicionamento" value={dnaForm.positioning} onChange={e => setDnaForm(p => ({ ...p, positioning: e.target.value }))} placeholder="Ex: A academia mais personalizada..." rows={4} />
                <Textarea label="Linguagem ideal" value={dnaForm.ideal_language} onChange={e => setDnaForm(p => ({ ...p, ideal_language: e.target.value }))} placeholder="Ex: Informal, com emoji..." rows={4} />
                <Textarea label="Gatilhos mentais" value={dnaForm.mental_triggers} onChange={e => setDnaForm(p => ({ ...p, mental_triggers: e.target.value }))} placeholder="Ex: Urgência, prova social..." rows={4} />
                {/* "Estrutura do Conteúdo" grava em communication_style do DNA
                    (sempre guardou estrutura, não tom) e a IA usa. */}
                <Textarea label="Estrutura do conteúdo" value={dnaForm.communication_style} onChange={e => setDnaForm(p => ({ ...p, communication_style: e.target.value }))} placeholder="Ex: Problema → Reflexão → Solução → Resultado" rows={4} />
              </div>
            </section>
          </TabsContent>

          {/* ── Onboarding ───────────────────────────────────────────────── */}
          <TabsContent value="onboarding">
            <OnboardingTab client={client} />
          </TabsContent>

          {/* ── Arsenal ──────────────────────────────────────────────────── */}
          <TabsContent value="contents">
            <section>
              <div className="flex items-end justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-display text-[17px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Arsenal</h2>
                  <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>{assets?.length || 0} conteúdo(s) prontos para usar</p>
                </div>
                <button onClick={openCreateAsset}
                  className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5 text-white"
                  style={{ background: 'var(--sm-primary)' }}>
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>

              {(!assets || assets.length === 0) ? (
                <div className="rounded-2xl border border-dashed py-12 text-center" style={{ borderColor: 'var(--sm-border)' }}>
                  <ImageIcon className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--sm-text-4)' }} />
                  <p className="text-[13px] font-medium" style={{ color: 'var(--sm-text-2)' }}>Nenhum conteúdo no arsenal ainda.</p>
                  <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-4)' }}>Adicione imagens, vídeos e legendas prontos para usar.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {assets.map(asset => (
                    <AssetCard key={asset.id} asset={asset}
                      onView={() => openViewAsset(asset)} onEdit={() => openEditAsset(asset)} onDelete={() => handleDeleteAsset(asset)} />
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          {/* ── Planejamento ─────────────────────────────────────────────── */}
          <TabsContent value="planner">
            <div className="mb-4 space-y-2.5">
              <div className="flex gap-1 p-1 rounded-xl overflow-x-auto scrollbar-none max-w-full w-fit" style={{ background: 'var(--sm-bg-alt)' }}>
                {([
                  { key: 'este_mes',       label: 'Este mês' },
                  { key: 'proximo_mes',    label: 'Próximo mês' },
                  { key: 'ultimos_3',      label: 'Últimos 3 meses' },
                  { key: 'proximos_3',     label: 'Próximos 3 meses' },
                  { key: 'mes_especifico', label: 'Mês específico' },
                  { key: 'personalizado',  label: 'Período' },
                  { key: 'todos',          label: 'Todos' },
                ] as { key: PlannerFilterType; label: string }[]).map(opt => (
                  <button key={opt.key} onClick={() => setPlannerFilter(opt.key)} aria-pressed={plannerFilter === opt.key}
                    className="h-8 px-3 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-colors"
                    style={plannerFilter === opt.key ? { background: 'var(--sm-bg-card)', color: 'var(--sm-text-1)' } : { color: 'var(--sm-text-3)' }}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {plannerFilter === 'mes_especifico' && (
                <select value={plannerMonth} onChange={e => setPlannerMonth(e.target.value)}
                  className="h-10 px-3 rounded-xl border text-[13px] outline-none cursor-pointer [color-scheme:light_dark]"
                  style={{ background: 'var(--sm-field-bg)', borderColor: 'var(--sm-field-border)', color: 'var(--sm-text-1)' }}>
                  {availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
              )}

              {plannerFilter === 'personalizado' && (
                <div className="flex flex-wrap gap-2 items-center">
                  <input type="date" value={plannerDateStart} onChange={e => setPlannerDateStart(e.target.value)}
                    className="h-10 px-3 rounded-xl border text-[13px] outline-none flex-1 min-w-[150px] [color-scheme:light_dark]"
                    style={{ background: 'var(--sm-field-bg)', borderColor: 'var(--sm-field-border)', color: 'var(--sm-text-1)' }} />
                  <span className="text-[12px]" style={{ color: 'var(--sm-text-4)' }}>até</span>
                  <input type="date" value={plannerDateEnd} onChange={e => setPlannerDateEnd(e.target.value)}
                    className="h-10 px-3 rounded-xl border text-[13px] outline-none flex-1 min-w-[150px] [color-scheme:light_dark]"
                    style={{ background: 'var(--sm-field-bg)', borderColor: 'var(--sm-field-border)', color: 'var(--sm-text-1)' }} />
                </div>
              )}
            </div>

            {(() => {
              const weeks = groupPlannerByWeek(filteredPlanner)
              const vazio = (texto: string, acao?: React.ReactNode) => (
                <div className="rounded-2xl border border-dashed py-14 text-center" style={{ borderColor: 'var(--sm-border)' }}>
                  <CalendarDays className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--sm-text-4)' }} />
                  <p className="text-[13px]" style={{ color: 'var(--sm-text-3)' }}>{texto}</p>
                  {acao}
                </div>
              )
              if ((planner || []).length === 0) return vazio('Nenhum planejamento ainda.')
              if (weeks.length === 0) return vazio('Nenhum post neste período.',
                <button onClick={() => setPlannerFilter('todos')} className="text-[12.5px] font-semibold mt-2" style={{ color: '#2563EB' }}>
                  Ver todos os planejamentos →
                </button>)

              return (
                <div className="overflow-x-auto pb-2">
                  <div className="flex" style={{ minWidth: `${Math.max(weeks.length * 272, 544)}px` }}>
                    {weeks.map((week, wi) => {
                      const summary = getWeekSummaryBadge(week.items)
                      const isLast = wi === weeks.length - 1
                      return (
                        <div key={week.key} className={`flex-shrink-0 w-[272px] px-4 ${!isLast ? 'border-r' : ''}`}
                          style={{ borderColor: 'var(--sm-border)', paddingLeft: wi === 0 ? 0 : undefined, paddingRight: isLast ? 0 : undefined }}>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-display text-[15px] font-bold" style={{ color: 'var(--sm-text-1)' }}>{week.label}</p>
                              <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>{week.dateRange}</p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium mt-1" style={{ color: 'var(--sm-text-3)' }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: summary.bg }} />
                              {summary.label}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {week.items.map(item => {
                              const badge  = getPlannerBadge(item)
                              const accent = getCardAccentColor(item)
                              const thumb  = item.attachments?.find(a => a.file_type.startsWith('image/'))
                              return (
                                <button key={item.id} onClick={() => { setSelectedPlannerItem(item); setPlannerItemOpen(true) }}
                                  className="relative w-full text-left rounded-xl border overflow-hidden transition-colors hover:border-[#2563EB]/50"
                                  style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
                                  <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: accent }} />
                                  <div className="pl-4 pr-3 py-3">
                                    {thumb && <img src={thumb.file_url} alt="" className="w-full h-28 object-cover rounded-lg mb-2.5" />}
                                    <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--sm-text-4)' }}>
                                      {format(parseISO(item.scheduled_date), 'dd MMM', { locale: ptBR }).replace('.', '')}
                                      {item.scheduled_time ? ` · ${item.scheduled_time.slice(0, 5)}` : ''}
                                      {' · '}{contentTypeLabels[item.content_type] || item.content_type}
                                    </p>
                                    <p className="text-[13px] font-semibold leading-snug mb-2 line-clamp-2" style={{ color: 'var(--sm-text-1)' }}>{item.title}</p>
                                    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: 'var(--sm-text-2)' }}>
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: badge.bg }} />
                                      {badge.label}
                                    </span>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {selectedPlannerItem && (
              <PlannerItemViewModal
                item={selectedPlannerItem}
                open={plannerItemOpen}
                onClose={() => { setPlannerItemOpen(false); setSelectedPlannerItem(null) }}
                showAgencyActions
              />
            )}
          </TabsContent>

          {/* ── Materiais ────────────────────────────────────────────────── */}
          <TabsContent value="materials">
            <MaterialsTab clientId={id!} />
          </TabsContent>

          {/* ── Suporte ──────────────────────────────────────────────────── */}
          <TabsContent value="support">
            <SupportTab clientId={id!} />
          </TabsContent>

          {/* ── Resultados ───────────────────────────────────────────────── */}
          <TabsContent value="results">
            <ReportsTab clientId={id!} />
          </TabsContent>

          {/* ── Instagram ────────────────────────────────────────────────── */}
          <TabsContent value="instagram">
            {user && <ClientInstagramTab clientId={id!} userId={agencyId!} />}
          </TabsContent>

          {/* ── Solicitações e Ideias ─────────────────────────────────────── */}
          <TabsContent value="requests">
            <RequestsIdeasTab clientId={id!} clientName={client?.company_name || ''} />
          </TabsContent>

          {/* ── Tarefas ──────────────────────────────────────────────────── */}
          <TabsContent value="tasks">
            <TasksTab clientId={id!} />
          </TabsContent>

          {/* ── Formulário Semanal ────────────────────────────────────────── */}
          <TabsContent value="formulario">
            <WeeklyFormTab
              clientId={id!}
              clientName={client?.company_name || ''}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Asset View Dialog ─────────────────────────────────────────────── */}
      <AssetViewDialog
        asset={viewingAsset}
        open={viewOpen}
        onClose={() => { setViewOpen(false); setViewingAsset(null) }}
        onEdit={() => viewingAsset && openEditAsset(viewingAsset)}
      />

      {/* ── Asset Create / Edit Modal ─────────────────────────────────────── */}
      <Dialog open={assetModalOpen} onOpenChange={v => { setAssetModalOpen(v); if (!v) resetAssetForm() }}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingAsset ? 'Editar conteúdo' : 'Adicionar ao Arsenal'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-1 min-w-0 w-full max-w-full overflow-x-hidden">
            <Input
              label="Título *"
              value={assetForm.title}
              onChange={e => setAssetForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Ex: Post de lançamento do produto..."
            />

            <div>
              <label className="block text-[12px] font-normal text-[color:var(--sm-text-3)] mb-1.5">Tipo</label>
              <Select
                value={assetForm.content_type}
                onValueChange={v => setAssetForm(p => ({ ...p, content_type: v as ContentType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(contentTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Textarea
              label="Legenda"
              value={assetForm.caption}
              onChange={e => setAssetForm(p => ({ ...p, caption: e.target.value }))}
              placeholder="Texto pronto para publicar..."
              rows={4}
            />

            {/* Mídia */}
            <div>
              <label className="block text-[12px] font-normal text-[color:var(--sm-text-3)] mb-1.5">Mídia</label>

              {editingAsset?.media_url && !assetFile && (() => {
                const isImg = isImageUrl(editingAsset.media_url)
                return (
                  <div className="mb-2 relative">
                    {isImg ? (
                      <img
                        src={editingAsset.media_url!}
                        alt=""
                        className="w-full max-h-32 object-cover rounded-md border border-[color:var(--sm-border)]"
                      />
                    ) : (
                      <div className="flex items-center gap-2 p-2.5 rounded-md border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)]">
                        <ImageIcon className="w-3.5 h-3.5 text-[color:var(--sm-text-4)]" />
                        <span className="text-[12px] text-[color:var(--sm-text-3)] truncate flex-1">Arquivo atual</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/50"
                      onClick={() => setEditingAsset(prev => prev ? { ...prev, media_url: null } : prev)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })()}

              {assetFile ? (
                <div className="flex items-center gap-2 p-2.5 rounded-md border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)]">
                  <ImageIcon className="w-3.5 h-3.5 text-[color:var(--sm-text-4)]" />
                  <span className="text-[12px] text-[color:var(--sm-text-2)] truncate flex-1">{assetFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setAssetFile(null)}
                    className="text-[color:var(--sm-text-4)] hover:text-red-500 flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => assetFileRef.current?.click()}
                  className="flex items-center gap-2 w-full h-9 px-3 rounded-md border border-dashed border-[color:var(--sm-border)] bg-[color:var(--sm-bg-card)] text-[color:var(--sm-text-4)] text-[12px] hover:border-[#2563EB]/30 hover:bg-[color:var(--sm-bg-alt)] transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Clique para selecionar imagem ou vídeo
                </button>
              )}
              <input
                ref={assetFileRef}
                type="file"
                accept="image/*,video/*,.pdf"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) setAssetFile(f)
                  e.target.value = ''
                }}
              />
            </div>

            <Textarea
              label="Observações (opcional)"
              value={assetForm.observations}
              onChange={e => setAssetForm(p => ({ ...p, observations: e.target.value }))}
              placeholder="Notas internas, contexto..."
              rows={2}
            />

            <Input
              label="Link externo (opcional)"
              value={assetForm.link_url}
              onChange={e => setAssetForm(p => ({ ...p, link_url: e.target.value }))}
              placeholder="https://..."
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setAssetModalOpen(false); resetAssetForm() }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAsset}
              disabled={assetUploading || !assetForm.title.trim()}
            >
              {assetUploading ? (
                <><Upload className="w-3 h-3 animate-pulse" /> Enviando...</>
              ) : editingAsset ? (
                <><Save className="w-3 h-3" /> Salvar</>
              ) : (
                <><Plus className="w-3 h-3" /> Adicionar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
