import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Moon, Sun, SunMedium, RefreshCw, Bell } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { HeroPill } from '@/hooks/useDashboardGreeting'
import { DashboardHeroArt } from './DashboardHeroArt'
import { useNotifications } from '@/hooks/useNotifications'
import { NotificationsModal } from '@/components/NotificationsModal'
import { UserMenu } from '@/components/layout/UserMenu'
import { useTheme } from '@/contexts/ThemeContext'

// ── Pill ─────────────────────────────────────────────────────────────────────

function Pill({ icon, label, variant, href }: HeroPill) {
  const { isDark } = useTheme()

  const darkStyles = {
    default: { bg: 'rgba(255,255,255,0.07)', bgHover: 'rgba(255,255,255,0.13)', border: 'rgba(255,255,255,0.13)', color: '#94a3b8' },
    success: { bg: 'rgba(16,185,129,0.10)',  bgHover: 'rgba(16,185,129,0.18)',  border: 'rgba(16,185,129,0.22)',  color: '#34d399' },
    warning: { bg: 'rgba(245,158,11,0.10)',  bgHover: 'rgba(245,158,11,0.18)',  border: 'rgba(245,158,11,0.22)',  color: '#fbbf24' },
  }
  const lightStyles = {
    default: { bg: 'rgba(0,0,0,0.04)',       bgHover: 'rgba(0,0,0,0.08)',       border: 'rgba(0,0,0,0.10)',       color: '#475569' },
    success: { bg: 'rgba(16,185,129,0.10)',  bgHover: 'rgba(16,185,129,0.18)',  border: 'rgba(16,185,129,0.28)',  color: '#059669' },
    warning: { bg: 'rgba(245,158,11,0.10)',  bgHover: 'rgba(245,158,11,0.18)',  border: 'rgba(245,158,11,0.28)',  color: '#b45309' },
  }

  const map = isDark ? darkStyles : lightStyles
  const style = map[variant as keyof typeof map] ?? map.default

  const inner = (
    <motion.div
      whileHover={{ scale: 1.04, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className="flex items-center gap-1.5 px-3 py-[5px] rounded-full backdrop-blur-sm transition-colors"
      style={{
        background: style.bg,
        border:     `1px solid ${style.border}`,
        color:      style.color,
        boxShadow:  isDark ? '0 1px 6px rgba(0,0,0,0.18)' : '0 1px 6px rgba(37,99,235,0.08)',
        cursor:     href ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (href) (e.currentTarget as HTMLDivElement).style.background = style.bgHover }}
      onMouseLeave={e => { if (href) (e.currentTarget as HTMLDivElement).style.background = style.bg }}
    >
      <span className="text-[12px] leading-none">{icon}</span>
      <span className="text-[11.5px] font-medium whitespace-nowrap">{label}</span>
    </motion.div>
  )

  if (href) return <Link to={href} className="block">{inner}</Link>
  return inner
}

// ── Context icon ──────────────────────────────────────────────────────────────

function ContextIcon({ hour }: { hour: number }) {
  const { isDark } = useTheme()

  const cfg =
    hour < 12
      ? { Icon: Sun,       bg: isDark ? 'rgba(251,191,36,0.12)' : 'rgba(251,191,36,0.18)', border: isDark ? 'rgba(251,191,36,0.22)' : 'rgba(251,191,36,0.30)', color: isDark ? '#fbbf24' : '#d97706' }
      : hour < 18
        ? { Icon: SunMedium, bg: isDark ? 'rgba(111,147,201,0.12)' : 'rgba(37,99,235,0.10)', border: isDark ? 'rgba(111,147,201,0.24)' : 'rgba(37,99,235,0.20)', color: isDark ? '#6f93c9' : '#2563eb' }
        : { Icon: Moon,      bg: isDark ? 'rgba(111,147,201,0.12)' : 'rgba(37,99,235,0.10)', border: isDark ? 'rgba(111,147,201,0.24)' : 'rgba(37,99,235,0.20)', color: isDark ? '#6f93c9' : '#2563eb' }

  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 backdrop-blur-sm"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <cfg.Icon style={{ width: 17, height: 17, color: cfg.color }} />
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface DashboardHeroProps {
  greeting:   string
  userName:   string
  message:    string
  pills:      HeroPill[]
  isLoading:  boolean
  onRefresh?: () => void
}

// ── Componente principal ───────────────────────────────────────────────────────

export function DashboardHero({
  greeting,
  message,
  pills,
  isLoading,
  onRefresh,
}: DashboardHeroProps) {
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const { data: notifications = [] } = useNotifications()
  const [showNotifications, setShowNotifications] = useState(false)
  const unreadCount = notifications.filter((n: { is_read: boolean }) => !n.is_read).length

  // ── Relógio em tempo real ─────────────────────────────────────────────────
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const hour    = now.getHours()
  const dateStr = now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', weekday: 'long' })
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const commaIdx     = greeting.indexOf(', ')
  const greetingBase = commaIdx !== -1 ? greeting.slice(0, commaIdx + 2) : greeting + ' '
  const greetingName = commaIdx !== -1 ? greeting.slice(commaIdx + 2)    : ''

  // ── Theme-dependent values ────────────────────────────────────────────────
  const heroBg = isDark
    ? 'linear-gradient(135deg, #050816 0%, #0B1020 45%, #101A2B 100%)'
    : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 45%, #f1f5f9 100%)'

  const heroBorder  = isDark ? '#1a2035'                  : 'rgba(203,213,225,0.8)'
  const heroShadow  = isDark
    ? '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.25)'
    : '0 8px 24px rgba(0,0,0,0.07), 0 2px 8px rgba(0,0,0,0.04)'

  const topLineGrad = isDark
    ? 'linear-gradient(90deg, transparent 0%, rgba(41,69,122,0.55) 35%, rgba(111,147,201,0.30) 65%, transparent 100%)'
    : 'linear-gradient(90deg, transparent 0%, rgba(203,213,225,0.6) 35%, rgba(226,232,240,0.4) 65%, transparent 100%)'

  const glow1 = isDark
    ? 'radial-gradient(ellipse 55% 80% at 8% 55%, rgba(111,147,201,0.12) 0%, transparent 65%)'
    : 'none'

  const glow2 = isDark
    ? 'radial-gradient(ellipse 40% 55% at 95% 90%, rgba(79,142,247,0.06) 0%, transparent 62%)'
    : 'none'

  const dateColor     = isDark ? '#6f93c9' : '#64748b'
  const greetTextCol  = isDark ? '#f1f5f9' : '#1e293b'
  const greetNameCol  = isDark ? '#7aa0d4' : '#2563eb'
  const greetNameShad = isDark ? '0 0 22px rgba(41,69,122,0.45)' : 'none'
  const msgColor      = isDark ? '#64748b' : '#64748b'
  const dotColor1     = isDark ? 'bg-purple-400/20' : 'bg-slate-300/40'
  const dotColor2     = isDark ? 'bg-blue-400/15'   : 'bg-slate-200/50'
  const dotColor3     = isDark ? 'bg-purple-300/15' : 'bg-slate-200/40'

  const bellBg        = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
  const bellBgHover   = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)'
  const bellColor     = isDark ? 'rgba(148,163,184,0.7)'  : '#64748b'

  const skeletonBase  = isDark ? 'bg-white/[0.07]' : 'bg-blue-200/40'
  const skeletonAlt   = isDark ? 'bg-white/[0.05]' : 'bg-blue-100/50'

  const refreshColor      = isDark ? 'rgba(148,163,184,0.45)' : 'rgba(100,116,139,0.5)'
  const refreshColorHover = isDark ? '#6f93c9'                : '#2563eb'

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-b-[28px] border-b border-x min-h-[240px]"
      style={{
        background:  heroBg,
        borderColor: heroBorder,
        boxShadow:   heroShadow,
      }}
    >
      {/* ── Glow esquerda ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: glow1 }} />

      {/* ── Glow direita-inferior ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: glow2 }} />

      {/* ── Linha topo iluminada ── */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none" style={{ background: topLineGrad }} />

      {/* ── Dots decorativos ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-8  left-[12%]  w-1   h-1   rounded-full ${dotColor1}`} />
        <div className={`absolute top-16 right-[30%] w-0.5 h-0.5 rounded-full ${dotColor2}`} />
        <div className={`absolute bottom-10 left-[25%] w-0.5 h-0.5 rounded-full ${dotColor3}`} />
      </div>

      {/* ── Conteúdo principal ── */}
      <div className="relative flex items-center justify-between px-8 pt-16 pb-8 md:px-12 md:py-9 gap-6 min-h-[240px]">

        {/* Coluna esquerda */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">

          {/* Ícone contextual + data/hora */}
          <div className="flex items-center gap-2.5 mb-4">
            <ContextIcon hour={hour} />
            <p className="text-[12.5px] font-semibold capitalize tracking-wide" style={{ color: dateColor }}>
              {dateStr} • {timeStr}
            </p>
          </div>

          {/* Saudação */}
          <h2 className="text-[30px] md:text-[32px] font-bold leading-tight mb-2.5 tracking-[-0.4px]">
            <span style={{ color: greetTextCol }}>{greetingBase}</span>
            <span style={{ color: greetNameCol, textShadow: greetNameShad }}>
              {greetingName}
            </span>
          </h2>

          {/* Mensagem da IA */}
          <div className="min-h-[38px] mb-5">
            {isLoading ? (
              <div className="space-y-2">
                <div className={`h-[13px] w-72 rounded-full ${skeletonBase} animate-pulse`} />
                <div className={`h-[13px] w-48 rounded-full ${skeletonAlt} animate-pulse`} />
              </div>
            ) : (
              <motion.p
                key={message}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="text-[13.5px] leading-relaxed"
                style={{ color: msgColor }}
              >
                {message}
              </motion.p>
            )}
          </div>

          {/* Pills */}
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {isLoading ? (
              <>
                <div className={`h-[28px] rounded-full ${skeletonBase} animate-pulse`} style={{ width: 142 }} />
                <div className={`h-[28px] rounded-full ${skeletonAlt} animate-pulse`} style={{ width: 188 }} />
                <div className={`h-[28px] rounded-full ${skeletonAlt} animate-pulse`} style={{ width: 130 }} />
              </>
            ) : (
              pills.map((pill, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9, y: 3 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.24, ease: 'easeOut' }}
                >
                  <Pill {...pill} />
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Coluna direita — ilustração */}
        <div className="hidden lg:flex flex-shrink-0 items-end self-end" style={{ width: 265, height: 225 }}>
          <DashboardHeroArt dark={isDark} />
        </div>
      </div>

      {/* ── Canto superior direito: Sino + Avatar + Refresh ── */}
      <div className="absolute top-3 right-3 flex items-center gap-1">

        <button
          onClick={() => setShowNotifications(true)}
          title={unreadCount > 0 ? `${unreadCount} notificação${unreadCount === 1 ? '' : 'ões'} não lida${unreadCount === 1 ? '' : 's'}` : 'Notificações'}
          className="relative flex items-center justify-center w-8 h-8 rounded-xl transition-colors"
          style={{ color: bellColor, background: bellBg }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = bellBgHover }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = bellBg }}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] rounded-full bg-red-500 text-[8px] font-bold flex items-center justify-center px-0.5 leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <UserMenu dark={isDark} />

        {onRefresh && !isLoading && (
          <motion.button
            whileHover={{ scale: 1.12, rotate: 20 }}
            whileTap={{ scale: 0.9 }}
            onClick={onRefresh}
            title="Atualizar mensagem da IA"
            className="w-7 h-7 flex items-center justify-center rounded-full transition-all"
            style={{ color: refreshColor }}
            onMouseEnter={e => (e.currentTarget.style.color = refreshColorHover)}
            onMouseLeave={e => (e.currentTarget.style.color = refreshColor)}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </div>

      <NotificationsModal
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
        onView={(notification) => {
          setShowNotifications(false)
          if (notification.type === 'NOTE_REQUEST') navigate(notification.link || '/notes')
          else if (notification.link) navigate(`/planner?item=${notification.link}`)
          else navigate('/planner')
        }}
      />
    </motion.div>
  )
}
