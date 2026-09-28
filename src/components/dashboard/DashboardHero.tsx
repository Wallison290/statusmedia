import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Bell, ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { HeroPill } from '@/hooks/useDashboardGreeting'
import { useNotifications } from '@/hooks/useNotifications'
import { NotificationsModal } from '@/components/NotificationsModal'
import { UserMenu } from '@/components/layout/UserMenu'
import { useTheme } from '@/contexts/ThemeContext'

// ── Pauta do dia ──────────────────────────────────────────────────────────────
// Os destaques da IA viram linhas de pauta: ponto na cor do assunto + texto +
// seta que aparece no hover. Sem cápsulas coloridas nem emoji.

const PILL_DOT: Record<HeroPill['variant'], string> = {
  default: 'var(--sm-text-4)',
  success: '#22C55E',
  warning: '#EAB308',
}

function Pill({ label, variant, href }: HeroPill) {
  const inner = (
    <span className="group inline-flex items-center gap-2 py-1 text-[12.5px] text-[var(--sm-text-2)]">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PILL_DOT[variant] ?? PILL_DOT.default }} />
      <span className={href ? 'bg-[linear-gradient(currentColor,currentColor)] bg-no-repeat bg-[length:0%_1px] bg-[position:0_100%] group-hover:bg-[length:100%_1px] transition-[background-size,color] duration-300 group-hover:text-[var(--sm-text-1)]' : ''}>
        {label}
      </span>
      {href && <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />}
    </span>
  )
  if (href) return <Link to={href}>{inner}</Link>
  return inner
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

// ── Cabeçalho editorial ───────────────────────────────────────────────────────

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

  // Relógio em tempo real
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const dateStr = now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', weekday: 'long' })
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const commaIdx     = greeting.indexOf(', ')
  const greetingBase = commaIdx !== -1 ? greeting.slice(0, commaIdx + 1) : greeting
  const greetingName = commaIdx !== -1 ? greeting.slice(commaIdx + 2)    : ''

  return (
    <header className="relative">
      {/* ── Linha de cima: data + ações ── */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sm-text-3)] truncate">
          <span className="capitalize">{dateStr}</span>
          <span className="mx-2 text-[var(--sm-text-4)]">/</span>
          <span className="tabular-nums">{timeStr}</span>
        </p>

        <div className="flex items-center gap-1 flex-shrink-0">
          {onRefresh && !isLoading && (
            <button
              onClick={onRefresh}
              title="Atualizar mensagem da IA"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--sm-text-4)] hover:text-[var(--sm-text-1)] hover:bg-[var(--sm-bg-alt)] transition-colors [&:hover>svg]:rotate-90"
            >
              <RefreshCw className="w-3.5 h-3.5 transition-transform duration-500" />
            </button>
          )}
          <button
            onClick={() => setShowNotifications(true)}
            title={unreadCount > 0 ? `${unreadCount} notificação${unreadCount === 1 ? '' : 'ões'} não lida${unreadCount === 1 ? '' : 's'}` : 'Notificações'}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg text-[var(--sm-text-3)] hover:text-[var(--sm-text-1)] hover:bg-[var(--sm-bg-alt)] transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] rounded-full bg-red-500 text-[8px] font-bold flex items-center justify-center px-0.5 leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <UserMenu dark={isDark} />
        </div>
      </div>

      {/* ── Saudação em display ── */}
      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="font-display font-bold text-[var(--sm-text-1)] mt-5 sm:mt-7 leading-[0.95] tracking-[-0.035em]"
        style={{ fontSize: 'clamp(38px, 6.2vw, 76px)' }}
      >
        {greetingBase}
        {greetingName && (
          <>
            <br className="sm:hidden" />{' '}
            <span className={isDark ? 'text-[#5B8DEF]' : 'text-[#2563EB]'}>{greetingName}</span>
          </>
        )}
      </motion.h1>

      {/* ── Mensagem da IA + pauta ── */}
      <div className="mt-5 sm:mt-6 grid lg:grid-cols-[minmax(0,62ch)_1fr] gap-x-10 gap-y-3 items-start">
        <div className="min-h-[40px]">
          {isLoading ? (
            <div className="space-y-2 pt-1">
              <div className="h-[13px] w-full max-w-[420px] rounded-full bg-[var(--sm-bg-alt)] animate-pulse" />
              <div className="h-[13px] w-2/3 max-w-[280px] rounded-full bg-[var(--sm-bg-alt)] animate-pulse" />
            </div>
          ) : (
            <motion.p
              key={message}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="text-[14px] leading-relaxed text-[var(--sm-text-2)]"
            >
              {message}
            </motion.p>
          )}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-0.5 lg:flex-col lg:border-l lg:border-[var(--sm-border)] lg:pl-6 min-h-[28px]">
          {isLoading
            ? [120, 170, 140].map(w => (
                <div key={w} className="h-[12px] my-2 rounded-full bg-[var(--sm-bg-alt)] animate-pulse" style={{ width: w }} />
              ))
            : pills.map((pill, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Pill {...pill} />
                </motion.div>
              ))}
        </div>
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
    </header>
  )
}
