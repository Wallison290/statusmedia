// ── Página: Instagram Dashboard ───────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Instagram, Image, Film, LayoutGrid,
  CheckCircle2, XCircle, Clock, Loader2, X,
  ExternalLink, RefreshCw, AlertCircle, Calendar,
  Users, ArrowLeft, ChevronRight, Trash2, Plus, Building2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/integrations/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { useClients } from '@/hooks/useClients'
import { useSubscription } from '@/hooks/useSubscription'
import { buildInstagramOAuthUrl, isInstagramConfigured } from '@/lib/instagramOAuth'
import {
  useAllInstagramAccounts,
  useScheduledPosts,
  useCancelScheduledPost,
  useRetryScheduledPost,
  useRescheduleScheduledPost,
  useRefreshInstagramProfile,
  type ScheduledPost,
  type InstagramAccount,
} from '@/hooks/useInstagram'

// ── Visual ────────────────────────────────────────────────────────────────────
// Mesmo padrão editorial do sistema: tokens de tema, status como ponto + texto
// e barra de 3px à esquerda. O gradiente do Instagram fica só no anel do avatar.
// Os textos visíveis batem com o dicionário de src/lib/reviewLocale.ts (modo
// inglês do App Review da Meta) — ao mudar um rótulo, atualize lá também.

const IG_RING = 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
const card = { background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' } as const
const eyebrow = 'text-[10.5px] font-semibold uppercase tracking-[0.08em]'
const primaryBtn = 'inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap'
const ghostBtn = 'inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl border text-[13px] font-medium hover:bg-black/5 transition-colors whitespace-nowrap disabled:opacity-50'
const ghostStyle = { borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' } as const

// ── Constantes ────────────────────────────────────────────────────────────────

type TabType = 'all' | 'scheduled' | 'published' | 'failed' | 'cancelled'

// Mantém em sincronia com MAX_RETRIES da Edge Function instagram-publish-cron
const MAX_RETRIES = 3

// A renovação do token é automática (Edge Function instagram-token-refresh,
// diária, renova quando faltam 10 dias). O aviso fica sempre visível: em estado
// normal serve de confirmação de que a renovação está em dia — sem ele, "nada
// aparecendo" é indistinguível de "quebrado". Laranja e vermelho só surgem
// quando a renovação automática não deu conta e a reconexão manual virou a
// única saída (senha trocada, app removido pelo cliente, cron parado).
const TOKEN_WARN_DAYS = 7

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                     'jul', 'ago', 'set', 'out', 'nov', 'dez']

function tokenDaysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null
  return Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
}

function tokenState(expiresAt: string | null) {
  const days = tokenDaysLeft(expiresAt)
  if (days === null) return null
  const expired = days <= 0
  const warning = !expired && days <= TOKEN_WARN_DAYS
  const d       = new Date(expiresAt!)
  const data    = `${String(d.getDate()).padStart(2, '0')}/${MESES_ABREV[d.getMonth()]}`
  return {
    expired, warning,
    label: expired ? 'Reconectar Instagram' : warning ? `Conexão expira em ${days}d` : `Conexão até ${data}`,
    color: expired ? '#EF4444' : warning ? '#F59E0B' : '#22C55E',
    title: expired
      ? 'A conexão com o Instagram expirou. Reconecte a conta para voltar a publicar.'
      : warning
        ? 'A renovação automática não conseguiu estender esta conexão. Reconecte a conta.'
        : `Renovação automática em dia. A conexão é estendida sozinha ${TOKEN_WARN_DAYS + 3} dias antes de vencer.`,
  }
}

function TokenBadge({ expiresAt }: { expiresAt: string | null }) {
  const st = tokenState(expiresAt)
  if (!st) return null
  const alerta = st.expired || st.warning
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] whitespace-nowrap" title={st.title}
      style={{ color: alerta ? st.color : 'var(--sm-text-3)', fontWeight: alerta ? 600 : 500 }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: st.color }} />
      {st.label}
    </span>
  )
}

function IgAvatar({ account, size, onError }: { account: InstagramAccount; size: number; onError: () => void }) {
  return (
    <span className="block rounded-full p-[2px] flex-shrink-0" style={{ width: size, height: size, background: IG_RING }}>
      <span className="block w-full h-full rounded-full p-[2px]" style={{ background: 'var(--sm-bg-card)' }}>
        {account.profile_picture_url ? (
          <img src={account.profile_picture_url} alt={account.username}
            className="w-full h-full rounded-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; onError() }} />
        ) : (
          <span className="w-full h-full rounded-full flex items-center justify-center" style={{ background: 'var(--sm-bg-alt)' }}>
            <Instagram className="w-1/2 h-1/2" style={{ color: 'var(--sm-text-3)' }} />
          </span>
        )}
      </span>
    </span>
  )
}

const POST_TYPE_CFG = {
  IMAGE:          { label: 'Imagem',    Icon: Image      },
  CAROUSEL_ALBUM: { label: 'Carrossel', Icon: LayoutGrid },
  REELS:          { label: 'Reel',      Icon: Film       },
} as const

const STATUS_CFG = {
  scheduled:  { label: 'Agendado',   color: '#2563EB', Icon: Clock,        spin: false },
  publishing: { label: 'Publicando', color: '#F59E0B', Icon: Loader2,      spin: true  },
  published:  { label: 'Publicado',  color: '#22C55E', Icon: CheckCircle2, spin: false },
  failed:     { label: 'Falhou',     color: '#EF4444', Icon: XCircle,      spin: false },
  cancelled:  { label: 'Cancelado',  color: '#94A3B8', Icon: X,            spin: false },
} as const

const TABS: { value: TabType; label: string; statuses: string[] }[] = [
  { value: 'all',       label: 'Todos',      statuses: ['scheduled','publishing','published','failed','cancelled'] },
  { value: 'scheduled', label: 'Agendados',  statuses: ['scheduled', 'publishing'] },
  { value: 'published', label: 'Publicados', statuses: ['published']               },
  { value: 'failed',    label: 'Falhas',     statuses: ['failed']                  },
  { value: 'cancelled', label: 'Cancelados', statuses: ['cancelled']               },
]

// ── Linha da conta (lista) ────────────────────────────────────────────────────

function AccountListCard({
  account,
  posts,
  first,
  onClick,
  onRefreshPic,
}: {
  account: InstagramAccount
  posts: ScheduledPost[]
  first: boolean
  onClick: () => void
  onRefreshPic: (id: string) => void
}) {
  const accountPosts   = posts.filter(p => p.ig_account_id === account.id)
  const scheduledCount = accountPosts.filter(p => ['scheduled','publishing'].includes(p.status)).length
  const publishedCount = accountPosts.filter(p => p.status === 'published').length
  const failedCount    = accountPosts.filter(p => p.status === 'failed').length
  const tk = tokenState(account.token_expires_at)
  const alerta = failedCount > 0 || !!(tk && (tk.expired || tk.warning))

  const num = (n: number, label: string, color: string) => (
    <span className="text-center min-w-[64px]">
      <span className="block font-display text-[18px] font-bold leading-none tabular-nums" style={{ color: n > 0 ? color : 'var(--sm-text-4)' }}>{n}</span>
      <span className="block text-[10.5px] mt-1" style={{ color: 'var(--sm-text-4)' }}>{label}</span>
    </span>
  )

  return (
    <button
      onClick={onClick}
      className={`relative w-full flex items-center gap-4 pl-5 pr-4 py-4 text-left transition-colors hover:bg-black/[0.02] group ${first ? '' : 'border-t'}`}
      style={{ borderColor: 'var(--sm-border)' }}
    >
      {alerta && <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r" style={{ background: failedCount > 0 ? '#EF4444' : tk!.color }} />}
      <IgAvatar account={account} size={48} onError={() => onRefreshPic(account.id)} />

      <div className="flex-1 min-w-0">
        <p className="text-[14.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>@{account.username}</p>
        <p className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5">
          <span className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
            <span className="tabular-nums">{account.followers_count.toLocaleString('pt-BR')}</span> <span>seguidores</span>
          </span>
          <TokenBadge expiresAt={account.token_expires_at} />
        </p>
      </div>

      <div className="hidden sm:flex items-center gap-1">
        {num(scheduledCount, 'Agendados', '#2563EB')}
        {num(publishedCount, 'Publicados', 'var(--sm-text-1)')}
        {num(failedCount, 'Falhas', '#EF4444')}
      </div>

      <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--sm-text-3)' }} />
    </button>
  )
}

// ── Post ──────────────────────────────────────────────────────────────────────

function PostCard({ post, first, onCancel, onRetry, onReschedule }: { post: ScheduledPost; first: boolean; onCancel: (id: string) => void; onRetry: (id: string) => void; onReschedule: (id: string, scheduledAt: string) => void }) {
  const cfg        = STATUS_CFG[post.status]
  const StatusIcon = cfg.Icon
  const typeCfg    = POST_TYPE_CFG[post.post_type]
  const TypeIcon   = typeCfg?.Icon ?? Image

  // Edição de data/hora (posts ainda agendados)
  const localDateTime = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
  }
  const [editing, setEditing] = useState(false)
  const init = localDateTime(post.scheduled_at)
  const [editDate, setEditDate] = useState(init.date)
  const [editTime, setEditTime] = useState(init.time)

  const saveReschedule = () => {
    if (!editDate || !editTime) return
    onReschedule(post.id, new Date(`${editDate}T${editTime}:00`).toISOString())
    setEditing(false)
  }

  const field = 'h-9 text-[12.5px] rounded-lg border px-2.5 focus:outline-none focus:border-[#2563EB]/60 [color-scheme:light_dark]'
  const fieldStyle = { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' } as const
  const linkBtn = 'inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[12px] font-semibold hover:bg-black/5 transition-colors'

  return (
    <div className={`relative pl-5 pr-4 py-4 space-y-3 ${first ? '' : 'border-t'}`} style={{ borderColor: 'var(--sm-border)' }}>
      <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r" style={{ background: cfg.color }} />

      <div className="flex gap-3">
        {/* Mídias */}
        {post.media_urls.length > 0 && (
          <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'var(--sm-bg-alt)' }}>
            {post.post_type === 'REELS'
              ? <video src={post.media_urls[0]} className="w-full h-full object-cover" />
              : <img src={post.media_urls[0]} alt="" className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
            {post.media_urls.length > 1 && (
              <span className="absolute bottom-1 right-1 min-w-[20px] h-5 px-1 rounded-full bg-black/60 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {post.media_urls.length}
              </span>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
              <StatusIcon className={`w-3.5 h-3.5 ${cfg.spin ? 'animate-spin' : ''}`} style={{ color: cfg.color }} />
              {cfg.label}
            </span>
            <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
              <TypeIcon className="w-3.5 h-3.5" /> {typeCfg?.label}
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] tabular-nums" style={{ color: 'var(--sm-text-3)' }}>
              <Calendar className="w-3.5 h-3.5" />
              {format(parseISO(post.scheduled_at), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
            </span>
            {/* Reprocessamento automático após falha transitória */}
            {(post.retry_count ?? 0) > 0 && post.status !== 'published' && post.status !== 'cancelled' && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: '#D97706' }}
                title={`Falha temporária ao publicar. Tentando novamente automaticamente (tentativa ${post.retry_count}/${MAX_RETRIES}).`}>
                <RefreshCw className="w-3 h-3" /> Tentativa {post.retry_count}/{MAX_RETRIES}
              </span>
            )}
          </div>
          {post.caption && (
            <p className="text-[13px] line-clamp-2 leading-relaxed mt-1.5" style={{ color: 'var(--sm-text-2)' }}>{post.caption}</p>
          )}
        </div>
      </div>

      {/* Mensagem de erro */}
      {post.error_message && (
        <div className="flex items-start gap-2 text-[12px] rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.07)', color: '#B91C1C' }}>
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{post.error_message}</span>
        </div>
      )}

      {/* Ações */}
      {(post.status === 'failed' || post.status === 'scheduled' || post.ig_post_id) && (
        <div className="flex items-center gap-1 flex-wrap -ml-2">
          {post.status === 'failed' && (
            <button onClick={() => onRetry(post.id)}
              className="inline-flex items-center gap-1.5 h-8 px-3 ml-2 rounded-lg text-[12px] font-semibold text-white hover:opacity-90"
              style={{ background: 'var(--sm-primary)' }}>
              <RefreshCw className="w-3 h-3" />
              Tentar novamente
            </button>
          )}
          {post.status === 'scheduled' && (
            <>
              <button onClick={() => { setEditing(e => !e); const i = localDateTime(post.scheduled_at); setEditDate(i.date); setEditTime(i.time) }}
                className={linkBtn} style={{ color: '#2563EB' }}>
                {editing ? 'Fechar' : 'Editar data'}
              </button>
              <button onClick={() => onCancel(post.id)} className={`${linkBtn} hover:bg-red-500/10`} style={{ color: '#EF4444' }}>
                Cancelar
              </button>
            </>
          )}
          {post.ig_post_id && (
            <a href={`https://www.instagram.com/p/${post.ig_post_id}/`} target="_blank" rel="noopener noreferrer"
              className={linkBtn} style={{ color: '#2563EB' }}>
              <ExternalLink className="w-3 h-3" />
              Ver no Instagram
            </a>
          )}
        </div>
      )}

      {/* Editor de data/hora (post agendado) */}
      {post.status === 'scheduled' && editing && (
        <div className="flex items-end gap-2 flex-wrap pt-3 border-t" style={{ borderColor: 'var(--sm-border)' }}>
          <div>
            <p className={`${eyebrow} mb-1`} style={{ color: 'var(--sm-text-4)' }}>Data</p>
            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={field} style={fieldStyle} />
          </div>
          <div>
            <p className={`${eyebrow} mb-1`} style={{ color: 'var(--sm-text-4)' }}>Horário</p>
            <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className={field} style={fieldStyle} />
          </div>
          <button onClick={saveReschedule} className="h-9 px-3.5 rounded-lg text-[12.5px] font-semibold text-white hover:opacity-90" style={{ background: 'var(--sm-primary)' }}>
            Salvar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Detalhe da conta ──────────────────────────────────────────────────────────

function AccountDetailView({
  account,
  posts,
  onBack,
  onCancel,
  onRetry,
  onReschedule,
  onDisconnect,
  onRefreshPic,
}: {
  account: InstagramAccount
  posts: ScheduledPost[]
  onBack: () => void
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onReschedule: (id: string, scheduledAt: string) => void
  onDisconnect: (id: string) => void
  onRefreshPic: (id: string) => void
}) {
  const [tab, setTab] = useState<TabType>('all')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const accountPosts = posts.filter(p => p.ig_account_id === account.id)

  const stats = {
    scheduled: accountPosts.filter(p => ['scheduled','publishing'].includes(p.status)).length,
    published: accountPosts.filter(p => p.status === 'published').length,
    failed:    accountPosts.filter(p => p.status === 'failed').length,
    cancelled: accountPosts.filter(p => p.status === 'cancelled').length,
  }

  const filteredPosts = accountPosts.filter(p =>
    TABS.find(t => t.value === tab)?.statuses.includes(p.status) ?? false
  )

  return (
    <motion.div
      key="detail"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.2 }}
      className="space-y-5"
    >
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline" style={{ color: 'var(--sm-text-3)' }}>
        <ArrowLeft className="w-4 h-4" /> <span>Contas conectadas</span>
      </button>

      {/* Cabeçalho da conta */}
      <div className="rounded-2xl border p-4 md:p-5 flex items-center gap-4 flex-wrap sm:flex-nowrap" style={card}>
        <IgAvatar account={account} size={64} onError={() => onRefreshPic(account.id)} />
        <div className="flex-1 min-w-0">
          <p className="font-display text-[22px] font-bold leading-tight truncate" style={{ color: 'var(--sm-text-1)' }}>@{account.username}</p>
          <p className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-1">
            <span className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>
              <span className="tabular-nums">{account.followers_count.toLocaleString('pt-BR')}</span> <span>seguidores</span>
            </span>
            <TokenBadge expiresAt={account.token_expires_at} />
          </p>
        </div>

        {confirmDisconnect ? (
          <div className="flex items-center justify-end gap-1.5 w-full sm:w-auto flex-shrink-0">
            <span className="text-[12px] font-semibold" style={{ color: '#EF4444' }}>Desconectar esta conta?</span>
            <button onClick={() => { onDisconnect(account.id); onBack() }}
              className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white" style={{ background: '#EF4444' }}>
              Sim
            </button>
            <button onClick={() => setConfirmDisconnect(false)} className="h-8 px-3 rounded-lg border text-[12px] hover:bg-black/5" style={ghostStyle}>
              Não
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDisconnect(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12.5px] font-medium hover:bg-red-500/10 hover:text-red-500 transition-colors flex-shrink-0"
            style={{ color: 'var(--sm-text-3)' }}
            aria-label="Desconectar conta" title="Desconectar conta">
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Desconectar</span>
          </button>
        )}
      </div>

      {/* Números da conta */}
      <div className="rounded-2xl border grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden" style={{ background: 'var(--sm-border)', borderColor: 'var(--sm-border)' }}>
        {[
          { label: 'Agendados',  value: stats.scheduled, color: '#2563EB' },
          { label: 'Publicados', value: stats.published, color: '#22C55E' },
          { label: 'Falhas',     value: stats.failed,    color: '#EF4444' },
          { label: 'Cancelados', value: stats.cancelled, color: '#94A3B8' },
        ].map(s => (
          <div key={s.label} className="px-4 py-3.5" style={{ background: 'var(--sm-bg-card)' }}>
            <p className={`${eyebrow} flex items-center gap-1.5`} style={{ color: 'var(--sm-text-4)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} /><span>{s.label}</span>
            </p>
            <p className="font-display text-[26px] font-bold leading-tight tabular-nums mt-0.5"
              style={{ color: s.label === 'Falhas' && s.value > 0 ? '#EF4444' : 'var(--sm-text-1)' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Posts: abas sublinhadas + lista com linhas finas */}
      <div>
        <div className="flex items-end gap-1 border-b overflow-x-auto [&::-webkit-scrollbar]:hidden mb-3" style={{ borderColor: 'var(--sm-border)' }}>
          {TABS.map(t => {
            const count  = accountPosts.filter(p => t.statuses.includes(p.status)).length
            const active = tab === t.value
            return (
              <button key={t.value} onClick={() => setTab(t.value)} aria-current={active ? 'true' : undefined}
                className="flex-shrink-0 inline-flex items-center gap-1.5 h-10 px-3 border-b-2 -mb-px text-[13px] whitespace-nowrap transition-colors"
                style={{ borderColor: active ? '#2563EB' : 'transparent', color: active ? 'var(--sm-text-1)' : 'var(--sm-text-3)', fontWeight: active ? 600 : 500 }}>
                {t.label}
                {count > 0 && <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{count}</span>}
              </button>
            )
          })}
        </div>

        {filteredPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-12 px-4 text-center" style={{ borderColor: 'var(--sm-border)' }}>
            <Calendar className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--sm-text-4)' }} />
            <p className="text-[13.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Nenhum post aqui</p>
            <p className="text-[12.5px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
              Ainda não há posts nesta categoria para esta conta.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden" style={card}>
            {filteredPosts.map((post, i) => (
              <PostCard key={post.id} post={post} first={i === 0} onCancel={onCancel} onRetry={onRetry} onReschedule={onReschedule} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

// ── Conectar Instagram ────────────────────────────────────────────────────────
// O botão que inicia o Business Login precisa estar visível aqui, e não apenas
// três níveis abaixo dentro do perfil de um cliente: a Meta exige, no App
// Review, que o botão de login apareça no app e no screencast.
//
// A conta sempre fica vinculada a um cliente. É por client_id que o
// agendamento (useClientInstagramAccount) e o relatório (a Edge Function
// instagram-report) encontram o token — conta conectada solta ficaria órfã e
// não publicaria nem geraria métricas. Por isso o cliente é escolhido antes.

function ConnectInstagramModal({
  open, onOpenChange, accounts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: InstagramAccount[]
}) {
  const { user, agencyId }                          = useAuth()
  const { data: clients = [], isLoading } = useClients()
  const { data: subData }                 = useSubscription()
  const { toast }                         = useToast()

  const connectedClientIds = new Set(
    accounts.map(a => a.client_id).filter(Boolean) as string[]
  )

  const activeCount  = new Set(accounts.map(a => a.ig_user_id)).size
  const maxProfiles  = subData?.plan.instagramProfiles ?? 1
  const limitReached = maxProfiles !== -1 && activeCount >= maxProfiles

  const handlePick = (clientId: string) => {
    if (!user) return
    if (!isInstagramConfigured) {
      toast('VITE_META_APP_ID não configurado.', 'error')
      return
    }
    // Reconectar um cliente que já tem conta não ocupa uma vaga nova — é a
    // mesma regra aplicada pela Edge Function instagram-oauth.
    if (limitReached && !connectedClientIds.has(clientId)) {
      toast(
        `Limite de ${maxProfiles} perfil${maxProfiles === 1 ? '' : 's'} do plano ` +
        `${subData?.plan.name ?? 'atual'} atingido. Faça upgrade para conectar mais contas.`,
        'error'
      )
      return
    }
    window.location.href = buildInstagramOAuthUrl(agencyId!, clientId)
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[19px] font-bold">Conectar Instagram</DialogTitle>
          <DialogDescription>
            Escolha de qual cliente é a conta profissional que você vai conectar.
            Você será levado ao Instagram para autorizar o acesso.
          </DialogDescription>
        </DialogHeader>

        {maxProfiles !== -1 && (
          <div className="-mt-1">
            <div className="flex items-center justify-between text-[12px] mb-1">
              <span style={{ color: limitReached ? '#EF4444' : 'var(--sm-text-3)', fontWeight: limitReached ? 600 : 500 }}>
                {activeCount}/{maxProfiles} perfil{maxProfiles === 1 ? '' : 's'} usados
                {subData?.plan.name ? ` do plano ${subData.plan.name}` : ''}
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--sm-bg-alt)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (activeCount / maxProfiles) * 100)}%`, background: limitReached ? '#EF4444' : '#2563EB' }} />
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="h-40 rounded-xl animate-pulse" style={{ background: 'var(--sm-bg-alt)' }} />
        ) : clients.length === 0 ? (
          <div className="rounded-xl border border-dashed py-8 px-4 text-center" style={{ borderColor: 'var(--sm-border)' }}>
            <p className="text-[13.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
              Você ainda não tem clientes cadastrados.
            </p>
            <p className="text-[12.5px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
              Cadastre um cliente antes de conectar o Instagram dele.
            </p>
            <Link to="/clients/new" className={`${primaryBtn} h-9 mt-4`} style={{ background: 'var(--sm-primary)' }}>
              <Plus className="w-4 h-4" />
              Novo cliente
            </Link>
          </div>
        ) : (
          <div className="max-h-[320px] overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--sm-border)' }}>
            {clients.map((client, i) => {
              const already = connectedClientIds.has(client.id)
              return (
                <button
                  key={client.id}
                  onClick={() => handlePick(client.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-black/[0.03] ${i > 0 ? 'border-t' : ''}`}
                  style={{ borderColor: 'var(--sm-border)' }}
                >
                  {client.logo_url ? (
                    <img src={client.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sm-bg-alt)' }}>
                      <Building2 className="w-4 h-4" style={{ color: 'var(--sm-text-4)' }} />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>
                      {client.company_name}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11.5px] truncate" style={{ color: 'var(--sm-text-3)' }}>
                      {already && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#22C55E' }} />}
                      <span>{already ? 'Já conectado — reconectar' : 'Conectar conta profissional'}</span>
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} />
                </button>
              )
            })}
          </div>
        )}

        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--sm-text-4)' }}>
          É preciso que a conta seja Business ou Creator. Ao autorizar, o StatusMedia
          passa a ler o perfil, publicar os conteúdos que você agendar e consultar
          as métricas para os relatórios. Você pode desconectar quando quiser.
        </p>
      </DialogContent>
    </Dialog>
  )
}

export function InstagramPage() {
  const [searchParams] = useSearchParams()
  const [selectedAccount, setSelectedAccount] = useState<InstagramAccount | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const { toast }       = useToast()
  const cancelPost      = useCancelScheduledPost()
  const retryPost       = useRetryScheduledPost()
  const reschedulePost  = useRescheduleScheduledPost()

  const { data: rawAccounts = [], isLoading: loadingAccounts, refetch: refetchAccounts, isRefetching: refetchingAccounts } = useAllInstagramAccounts()
  const { data: posts       = [], isLoading: loadingPosts,    refetch: refetchPosts,    isRefetching: refetchingPosts    } = useScheduledPosts()
  const refreshProfile = useRefreshInstagramProfile()

  // Deduplicar por ig_user_id: preferindo conta vinculada a cliente
  const accounts = Object.values(
    rawAccounts.reduce<Record<string, InstagramAccount>>((acc, a) => {
      const existing = acc[a.ig_user_id]
      if (!existing || (!existing.client_id && a.client_id)) {
        acc[a.ig_user_id] = a
      }
      return acc
    }, {})
  )

  const isRefreshing = refetchingAccounts || refetchingPosts
  const isLoading    = loadingAccounts || loadingPosts

  // Sincronizar selectedAccount com dados mais recentes (caso conta seja atualizada)
  useEffect(() => {
    if (!selectedAccount) return
    const updated = accounts.find(a => a.id === selectedAccount.id)
    if (updated && updated !== selectedAccount) setSelectedAccount(updated)
  }, [accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toast de retorno OAuth
  useEffect(() => {
    const connected = searchParams.get('connected')
    const error     = searchParams.get('error')
    if (connected === 'true') {
      toast('Instagram conectado com sucesso!', 'success')
      window.history.replaceState({}, '', '/instagram')
      refetchAccounts()
    }
    if (error) {
      toast(
        error === 'profile_limit'
          ? 'Limite de perfis do seu plano atingido. Faça upgrade para conectar mais contas.'
          : 'Não foi possível conectar o Instagram. Tente novamente.',
        'error'
      )
      window.history.replaceState({}, '', '/instagram')
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar este post agendado?')) return
    await cancelPost.mutateAsync(id)
    toast('Post cancelado', 'success')
  }

  const handleRetry = async (id: string) => {
    try {
      await retryPost.mutateAsync(id)
      toast('Post recolocado na fila — será publicado em instantes.', 'success')
    } catch (err: any) {
      toast(err?.message ?? 'Não foi possível reagendar o post.', 'error')
    }
  }

  const handleReschedule = async (id: string, scheduledAt: string) => {
    try {
      await reschedulePost.mutateAsync({ id, scheduled_at: scheduledAt })
      toast('Agendamento atualizado!', 'success')
    } catch (err: any) {
      toast(err?.message ?? 'Não foi possível alterar a data.', 'error')
    }
  }


  const totalFalhas = posts.filter(p => p.status === 'failed').length
  const totalAgendados = posts.filter(p => ['scheduled', 'publishing'].includes(p.status)).length

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">

        {/* ── Cabeçalho (no celular, ao lado do menu) ── */}
        <header className="max-md:pl-12 max-md:-mt-[3.25rem] flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Publicação</p>
            <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>
              Instagram
            </h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
              {selectedAccount
                ? 'Detalhes da conta selecionada'
                : 'Selecione uma conta para ver os detalhes'}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => { refetchAccounts(); refetchPosts(); accounts.forEach(a => refreshProfile.mutate(a.id)) }}
              disabled={isRefreshing}
              className={`${ghostBtn} flex-shrink-0 px-3 sm:px-3.5`}
              style={ghostStyle}
              title="Refresh — reloads the connected accounts and the status of scheduled posts"
              aria-label="Atualizar"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
            <button
              onClick={() => setConnectOpen(true)}
              title="Connect Instagram — starts Business Login for Instagram so the agency can publish and read insights for a client account"
              className={`${primaryBtn} flex-1 sm:flex-none`}
              style={{ background: 'var(--sm-primary)' }}
            >
              <Instagram className="w-4 h-4" />
              Conectar Instagram
            </button>
          </div>
        </header>

        {/* ── Conteúdo: lista ou detalhe ───────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {selectedAccount ? (
            <AccountDetailView
              key="detail"
              account={selectedAccount}
              posts={posts}
              onBack={() => setSelectedAccount(null)}
              onCancel={handleCancel}
              onRetry={handleRetry}
              onReschedule={handleReschedule}
              onDisconnect={async (id) => {
                await (supabase as any).from('instagram_accounts').delete().eq('id', id)
                setSelectedAccount(null)
              }}
              onRefreshPic={(id) => refreshProfile.mutate(id)}
            />
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              {/* Resumo da fila */}
              {!isLoading && accounts.length > 0 && (
                <div className="rounded-2xl border grid grid-cols-3 gap-px overflow-hidden" style={{ background: 'var(--sm-border)', borderColor: 'var(--sm-border)' }}>
                  {[
                    { label: 'Contas conectadas', value: accounts.length, alert: false },
                    { label: 'Agendados', value: totalAgendados, alert: false },
                    { label: 'Falhas', value: totalFalhas, alert: totalFalhas > 0 },
                  ].map(k => (
                    <div key={k.label} className="relative px-4 md:px-5 py-3.5" style={{ background: 'var(--sm-bg-card)' }}>
                      {k.alert && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: '#EF4444' }} />}
                      <p className={`${eyebrow} leading-tight`} style={{ color: 'var(--sm-text-4)' }}>{k.label}</p>
                      <p className="font-display text-[24px] md:text-[26px] font-bold leading-tight tabular-nums mt-0.5"
                        style={{ color: k.alert ? '#EF4444' : 'var(--sm-text-1)' }}>{k.value}</p>
                    </div>
                  ))}
                </div>
              )}

              <section>
                <h2 className="flex items-baseline gap-2 mb-2.5">
                  <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>01</span>
                  <span className="font-display text-[16px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Contas conectadas</span>
                </h2>

                {isLoading ? (
                  <div className="space-y-2" aria-busy="true">
                    {[0, 1].map(i => <div key={i} className="h-[80px] rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />)}
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed py-12 px-6 text-center" style={{ borderColor: 'var(--sm-border)' }}>
                    <span className="inline-block rounded-2xl p-[2px] mb-4" style={{ background: IG_RING }}>
                      <span className="w-14 h-14 rounded-[14px] flex items-center justify-center" style={{ background: 'var(--sm-bg-card)' }}>
                        <Instagram className="w-7 h-7" style={{ color: 'var(--sm-text-2)' }} />
                      </span>
                    </span>
                    <p className="font-display text-[18px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Nenhuma conta conectada</p>
                    <p className="text-[13px] mt-1.5 max-w-xs mx-auto" style={{ color: 'var(--sm-text-3)' }}>
                      Conecte a conta Business ou Creator de um cliente para agendar
                      publicações e gerar relatórios.
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
                      <button
                        onClick={() => setConnectOpen(true)}
                        title="Connect Instagram — starts Business Login for Instagram so the agency can publish and read insights for a client account"
                        className={primaryBtn}
                        style={{ background: 'var(--sm-primary)' }}
                      >
                        <Instagram className="w-4 h-4" />
                        Conectar Instagram
                      </button>
                      <Link to="/clients" className={ghostBtn} style={ghostStyle}>
                        <Users className="w-4 h-4" />
                        Ir para Clientes
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border overflow-hidden" style={card}>
                    {accounts.map((acc, i) => (
                      <AccountListCard
                        key={acc.id}
                        account={acc}
                        posts={posts}
                        first={i === 0}
                        onClick={() => setSelectedAccount(acc)}
                        onRefreshPic={(id) => refreshProfile.mutate(id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConnectInstagramModal
        open={connectOpen}
        onOpenChange={setConnectOpen}
        accounts={accounts}
      />
    </div>
  )
}
