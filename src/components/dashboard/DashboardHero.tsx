import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Bell, ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { HeroPill } from '@/hooks/useDashboardGreeting'
import { DashboardHeroArt } from './DashboardHeroArt'
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

// ── Banner ────────────────────────────────────────────────────────────────────
// Cartão colado no topo (cantos arredondados só embaixo), com trama de linhas
// finas que some em direção ao texto e um brilho azul atrás da ilustração.

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
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-b-[28px] border-x border-b border-[var(--sm-border)] bg-[var(--sm-bg-card)]"
    >
      {/* ── Trama de linhas finas, visível só do lado da ilustração ── */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--sm-border) 1px, transparent 1px), linear-gradient(90deg, var(--sm-border) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          opacity: isDark ? 0.55 : 0.7,
          WebkitMaskImage: 'radial-gradient(ellipse 60% 110% at 88% 60%, #000 0%, transparent 70%)',
          maskImage:       'radial-gradient(ellipse 60% 110% at 88% 60%, #000 0%, transparent 70%)',
        }}
      />

      {/* ── Brilho azul atrás da ilustração ── */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 38% 75% at 86% 70%, rgba(37,99,235,${isDark ? 0.16 : 0.07}) 0%, transparent 70%)`,
        }}
      />

      {/* ── Fio iluminado no topo ── */}
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(37,99,235,0.45) 40%, rgba(96,165,250,0.25) 70%, transparent 100%)' }}
      />

      {/* ── Canto superior direito: atualizar + sino + avatar ── */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
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

      {/* ── Conteúdo ── */}
      {/* pt-16 no celular: o botão do menu fica fixo no canto superior esquerdo */}
      <div className="relative max-w-[1320px] mx-auto px-5 sm:px-6 md:px-8 lg:px-10 pt-16 md:pt-10 pb-8 md:pb-10 flex items-end justify-between gap-8 min-h-[260px]">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sm-text-3)]">
            <span className="capitalize">{dateStr}</span>
            <span className="mx-2 text-[var(--sm-text-4)]">/</span>
            <span className="tabular-nums">{timeStr}</span>
          </p>

          {/* Saudação em display */}
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="font-display font-bold text-[var(--sm-text-1)] mt-4 sm:mt-5 leading-[0.95] tracking-[-0.035em]"
            style={{ fontSize: 'clamp(38px, 5.8vw, 72px)' }}
          >
            {greetingBase}
            {greetingName && (
              <>
                <br className="sm:hidden" />{' '}
                <span className={isDark ? 'text-[#5B8DEF]' : 'text-[#2563EB]'}>{greetingName}</span>
              </>
            )}
          </motion.h1>

          {/* Mensagem da IA */}
          <div className="mt-4 sm:mt-5 min-h-[40px] max-w-[62ch]">
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

          {/* Pauta */}
          <div className="flex flex-wrap gap-x-5 gap-y-0.5 mt-4 pt-4 border-t border-[var(--sm-border)] max-w-[720px] min-h-[28px]">
            {isLoading
              ? [120, 170, 140].map(w => (
                  <div key={w} className="h-[12px] my-2 rounded-full bg-[var(--sm-bg-alt)] animate-pulse" style={{ width: w }} />
                ))
              : pills.map((pill, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Pill {...pill} />
                  </motion.div>
                ))}
          </div>
        </div>

        {/* Ilustração */}
        <div className="hidden lg:block flex-shrink-0 -mb-2" style={{ width: 290, height: 206 }}>
          <DashboardHeroArt dark={isDark} />
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
    </motion.header>
  )
}
