import { useEffect, useState, useMemo } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, CheckCircle2, XCircle, MessageSquare,
  Clock, FileText, Check, Wrench, ClipboardList,
  Instagram, AlertTriangle, CheckCheck, Lightbulb, X, BarChart3,
  CalendarClock, Magnet, Eye, Trophy, PenLine, Zap,
} from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/useNotifications'
import type { Notification, NotificationType } from '@/hooks/useNotifications'

// ─── Tipo → visual ────────────────────────────────────────────────────────────

const typeConfig: Record<NotificationType, { Icon: React.ElementType; color: string; bg: string }> = {
  NEW_CONTENT:        { Icon: FileText,      color: 'text-[#a78bfa]', bg: 'bg-[#8b5cf6]/15' },
  APPROVAL_REQUEST:   { Icon: Clock,         color: 'text-[#fbbf24]', bg: 'bg-[#f59e0b]/15' },
  APPROVED:           { Icon: CheckCircle2,  color: 'text-[#4ade80]', bg: 'bg-[#22c55e]/15' },
  REJECTED:           { Icon: XCircle,       color: 'text-[#f87171]', bg: 'bg-[#ef4444]/15' },
  COMMENT:            { Icon: MessageSquare, color: 'text-[#60a5fa]', bg: 'bg-[#2563eb]/15' },
  ADJUSTMENT_DONE:    { Icon: Wrench,        color: 'text-[#60a5fa]', bg: 'bg-[#2563eb]/15' },
  TASK_STATUS_UPDATE: { Icon: CheckCheck,    color: 'text-[#818cf8]', bg: 'bg-[#6366f1]/15' },
  TASK_DONE:          { Icon: CheckCircle2,  color: 'text-[#4ade80]', bg: 'bg-[#22c55e]/15' },
  FORM_SUBMITTED:     { Icon: ClipboardList, color: 'text-[#a78bfa]', bg: 'bg-[#8b5cf6]/15' },
  POST_PUBLISHED:     { Icon: Instagram,     color: 'text-[#f472b6]', bg: 'bg-[#ec4899]/15' },
  POST_FAILED:        { Icon: AlertTriangle, color: 'text-[#f87171]', bg: 'bg-[#ef4444]/15' },
  NOTE_REQUEST:       { Icon: Lightbulb,     color: 'text-[#60a5fa]', bg: 'bg-[#2563eb]/15' },
  NEW_REPORT:         { Icon: BarChart3,     color: 'text-[#4ade80]', bg: 'bg-[#22c55e]/15' },
  IG_TOKEN_EXPIRING:  { Icon: AlertTriangle, color: 'text-[#fbbf24]', bg: 'bg-[#f59e0b]/15' },
  CRM_FOLLOWUP:          { Icon: CalendarClock, color: 'text-[#fbbf24]', bg: 'bg-[#f59e0b]/15' },
  CRM_LEAD_NEW:          { Icon: Magnet,        color: 'text-[#60a5fa]', bg: 'bg-[#2563eb]/15' },
  CRM_PROPOSAL_VIEWED:   { Icon: Eye,           color: 'text-[#a78bfa]', bg: 'bg-[#8b5cf6]/15' },
  CRM_PROPOSAL_ACCEPTED: { Icon: Trophy,        color: 'text-[#4ade80]', bg: 'bg-[#22c55e]/15' },
  CRM_PROPOSAL_REJECTED: { Icon: XCircle,       color: 'text-[#f87171]', bg: 'bg-[#ef4444]/15' },
  CRM_CONTRACT_SIGNED:   { Icon: PenLine,       color: 'text-[#4ade80]', bg: 'bg-[#22c55e]/15' },
  CRM_AUTOMATION:        { Icon: Zap,           color: 'text-[#818cf8]', bg: 'bg-[#6366f1]/15' },
}

// Variante de alto contraste para tema claro (cores sólidas)
const typeConfigLight: Record<NotificationType, { color: string; bg: string }> = {
  NEW_CONTENT:        { color: 'text-purple-600', bg: 'bg-purple-100' },
  APPROVAL_REQUEST:   { color: 'text-amber-600',  bg: 'bg-amber-100'  },
  APPROVED:           { color: 'text-green-600',  bg: 'bg-green-100'  },
  REJECTED:           { color: 'text-red-600',    bg: 'bg-red-100'    },
  COMMENT:            { color: 'text-blue-600',   bg: 'bg-blue-100'   },
  ADJUSTMENT_DONE:    { color: 'text-blue-600',   bg: 'bg-blue-100'   },
  TASK_STATUS_UPDATE: { color: 'text-indigo-600', bg: 'bg-indigo-100' },
  TASK_DONE:          { color: 'text-green-600',  bg: 'bg-green-100'  },
  FORM_SUBMITTED:     { color: 'text-purple-600', bg: 'bg-purple-100' },
  POST_PUBLISHED:     { color: 'text-pink-600',   bg: 'bg-pink-100'   },
  POST_FAILED:        { color: 'text-red-600',    bg: 'bg-red-100'    },
  NOTE_REQUEST:       { color: 'text-blue-600',   bg: 'bg-blue-100'   },
  NEW_REPORT:         { color: 'text-green-600',  bg: 'bg-green-100'  },
  IG_TOKEN_EXPIRING:  { color: 'text-amber-600',  bg: 'bg-amber-100'  },
  CRM_FOLLOWUP:          { color: 'text-amber-600',  bg: 'bg-amber-100'  },
  CRM_LEAD_NEW:          { color: 'text-blue-600',   bg: 'bg-blue-100'   },
  CRM_PROPOSAL_VIEWED:   { color: 'text-purple-600', bg: 'bg-purple-100' },
  CRM_PROPOSAL_ACCEPTED: { color: 'text-green-600',  bg: 'bg-green-100'  },
  CRM_PROPOSAL_REJECTED: { color: 'text-red-600',    bg: 'bg-red-100'    },
  CRM_CONTRACT_SIGNED:   { color: 'text-green-600',  bg: 'bg-green-100'  },
  CRM_AUTOMATION:        { color: 'text-indigo-600', bg: 'bg-indigo-100' },
}

// ─── Categorias (abas) ────────────────────────────────────────────────────────
// Cada tipo de notificação pertence a uma categoria. As abas são dinâmicas:
// só aparecem se houver notificação daquela categoria.

const CATEGORY_OF: Record<NotificationType, string> = {
  APPROVED:           'aprovacoes',
  REJECTED:           'aprovacoes',
  COMMENT:            'aprovacoes',
  APPROVAL_REQUEST:   'aprovacoes',
  ADJUSTMENT_DONE:    'aprovacoes',
  NEW_CONTENT:        'conteudo',
  POST_PUBLISHED:     'instagram',
  POST_FAILED:        'instagram',
  IG_TOKEN_EXPIRING:  'instagram',
  TASK_DONE:          'tarefas',
  TASK_STATUS_UPDATE: 'tarefas',
  FORM_SUBMITTED:     'solicitacoes',
  NOTE_REQUEST:       'solicitacoes',
  NEW_REPORT:         'relatorios',
  CRM_FOLLOWUP:          'crm',
  CRM_LEAD_NEW:          'crm',
  CRM_PROPOSAL_VIEWED:   'crm',
  CRM_PROPOSAL_ACCEPTED: 'crm',
  CRM_PROPOSAL_REJECTED: 'crm',
  CRM_CONTRACT_SIGNED:   'crm',
  CRM_AUTOMATION:        'crm',
}

const CATEGORY_ORDER = ['crm', 'aprovacoes', 'conteudo', 'instagram', 'tarefas', 'solicitacoes', 'relatorios']
const CATEGORY_LABEL: Record<string, string> = {
  crm:          'CRM',
  aprovacoes:   'Aprovações',
  conteudo:     'Conteúdo',
  instagram:    'Instagram',
  tarefas:      'Tarefas',
  solicitacoes: 'Solicitações',
  relatorios:   'Relatórios',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NotificationsModalProps {
  open: boolean
  onClose: () => void
  onView: (notification: Notification) => void
}

// ─── Componente (drawer lateral) ──────────────────────────────────────────────

export function NotificationsModal({ open, onClose, onView }: NotificationsModalProps) {
  const { data: notifications = [], isLoading } = useNotifications()
  const markRead    = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const { isDark }  = useTheme()

  const [activeTab, setActiveTab]   = useState<string>('todas')
  const [onlyUnread, setOnlyUnread] = useState(false)

  const unreadCount = notifications.filter(n => !n.is_read).length

  // Categorias presentes (dinâmicas) — só mostra aba se houver notificação dela
  const presentCategories = useMemo(() => {
    const set = new Set(notifications.map(n => CATEGORY_OF[n.type]).filter(Boolean))
    return CATEGORY_ORDER.filter(c => set.has(c))
  }, [notifications])

  // Lista filtrada por aba + "só não lidas"
  const filtered = useMemo(() => {
    return notifications.filter(n => {
      if (onlyUnread && n.is_read) return false
      if (activeTab !== 'todas' && CATEGORY_OF[n.type] !== activeTab) return false
      return true
    })
  }, [notifications, activeTab, onlyUnread])

  // Contador de não lidas por aba (para os badges)
  const unreadByTab = useMemo(() => {
    const m: Record<string, number> = { todas: 0 }
    notifications.forEach(n => {
      if (n.is_read) return
      m.todas = (m.todas || 0) + 1
      const c = CATEGORY_OF[n.type]
      if (c) m[c] = (m[c] || 0) + 1
    })
    return m
  }, [notifications])

  // Fechar com Escape; reseta filtros ao abrir
  useEffect(() => {
    if (!open) return
    setActiveTab('todas')
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleView = async (n: Notification) => {
    if (!n.is_read) await markRead.mutateAsync(n.id)
    onView(n)
  }

  const tabs = ['todas', ...presentCategories]

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="fixed top-0 right-0 z-50 h-full w-full sm:w-[390px] bg-[#0B1020] border-l border-[#1e293b] shadow-2xl flex flex-col"
          >
            {/* ── Cabeçalho ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e293b] flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#94a3b8]" />
                <span className="text-[15px] font-bold text-[#F8FAFC]">Notificações</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#29457a] text-white leading-none">
                    {unreadCount}
                  </span>
                )}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#1e293b] transition-colors">
                <X className="w-4 h-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* ── Ações: marcar todas + só não lidas ── */}
            <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-b border-[#1e293b] flex-shrink-0">
              <button
                onClick={() => setOnlyUnread(o => !o)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                  onlyUnread
                    ? 'bg-[#29457a]/30 border-[#29457a] text-[#9bb6dd]'
                    : 'bg-[#182233] border-[#1e293b] text-[#94a3b8] hover:text-[color:var(--sm-text-1)]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${onlyUnread ? 'bg-[#6f93c9]' : 'bg-[#475569]'}`} />
                Só não lidas
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="flex items-center gap-1 text-[11px] font-medium text-[#6f93c9] hover:text-[#9bb6dd] transition-colors disabled:opacity-50"
                >
                  <Check className="w-3 h-3" /> Marcar todas como lidas
                </button>
              )}
            </div>

            {/* ── Abas dinâmicas ── */}
            {tabs.length > 1 && (
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1e293b] overflow-x-auto flex-shrink-0"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {tabs.map(tab => {
                  const label = tab === 'todas' ? 'Todas' : CATEGORY_LABEL[tab]
                  const count = unreadByTab[tab] || 0
                  const active = activeTab === tab
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium whitespace-nowrap transition-all ${
                        active
                          ? 'bg-[#29457a] text-white'
                          : 'bg-[#182233] text-[#94a3b8] hover:text-[color:var(--sm-text-1)]'
                      }`}
                    >
                      {label}
                      {count > 0 && (
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full leading-none ${
                          active ? 'bg-white/20 text-white' : 'bg-[#0d1424] text-[#9bb6dd]'
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── Lista ── */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="px-5 py-12 text-center text-[12px] text-[#64748b]">Carregando…</div>
              )}

              {!isLoading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full px-5 py-16 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#182233] border border-[#1e293b] flex items-center justify-center mb-3">
                    <Bell className="w-5 h-5 text-[#475569]" />
                  </div>
                  <p className="text-[13px] font-medium text-[#94a3b8]">
                    {onlyUnread ? 'Nenhuma não lida' : 'Nenhuma notificação'}
                  </p>
                  <p className="text-[11px] text-[#64748b] mt-0.5">Você está em dia!</p>
                </div>
              )}

              {!isLoading && filtered.map(n => {
                const cfg      = typeConfig[n.type] ?? typeConfig.COMMENT
                const cfgLight = typeConfigLight[n.type] ?? typeConfigLight.COMMENT
                const { Icon } = cfg
                const iconBg    = isDark ? cfg.bg    : cfgLight.bg
                const iconColor = isDark ? cfg.color : cfgLight.color
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-5 py-3.5 border-b border-[#1e293b]/60 transition-colors ${
                      n.is_read ? '' : 'bg-[#29457a]/10'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center ${iconBg}`}>
                      <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12.5px] font-semibold text-[#F8FAFC] leading-snug">{n.title}</p>
                        {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-[#6f93c9] flex-shrink-0 mt-1.5" />}
                      </div>
                      <p className="text-[11.5px] text-[#94a3b8] leading-snug mt-0.5 line-clamp-2">{n.message}</p>
                      <div className="flex items-center justify-between mt-1.5 gap-2">
                        <span className="text-[10px] text-[#64748b]">
                          {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                        {n.link && (
                          <button
                            onClick={() => handleView(n)}
                            className="text-[11px] font-semibold text-[#6f93c9] hover:text-[#9bb6dd] transition-colors flex-shrink-0"
                          >
                            Ver →
                          </button>
                        )}
                        {!n.link && !n.is_read && (
                          <button
                            onClick={() => markRead.mutate(n.id)}
                            className="text-[11px] text-[#64748b] hover:text-[#94a3b8] transition-colors flex-shrink-0"
                          >
                            Marcar lida
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Rodapé ── */}
            {filtered.length > 0 && (
              <div className="px-5 py-2.5 border-t border-[#1e293b] bg-[#0B1020] flex-shrink-0">
                <p className="text-[10px] text-[#64748b] text-center">
                  {filtered.length} notificaç{filtered.length === 1 ? 'ão' : 'ões'}
                  {onlyUnread ? ' não lida' + (filtered.length === 1 ? '' : 's') : ''}
                </p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
