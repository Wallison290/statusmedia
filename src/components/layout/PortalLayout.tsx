import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { LogOut, Bell, Menu, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { GlassBackdrop } from '@/components/dashboard/GlassBackdrop'

export interface PortalNavItem {
  key:    string
  label:  string
  icon:   LucideIcon
  /** Número de destaque (amarelo): ex. conteúdos esperando aprovação */
  badge?: number
}

interface PortalLayoutProps {
  children:     React.ReactNode
  clientName?:  string
  unreadCount?: number
  onBellClick?: () => void
  /** @deprecated use unreadCount */
  pendingCount?: number
  nav?:         PortalNavItem[]
  active?:      string
  onNavigate?:  (key: string) => void
}

// Moldura do portal do cliente no mesmo visual de vidro do acesso da agência:
// fundo com profundidade (brilhos + anel da marca), menu lateral recolhido que
// abre ao passar o mouse empurrando o painel, e um painel de vidro que rola por
// dentro. Tema claro fixo por enquanto (data-theme só aqui dentro), porque as
// outras abas do portal ainda são desenhadas em claro.

function useIsDesktop() {
  const query = '(min-width: 768px)'
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return match
}

const ITEM = 'relative w-full flex items-center gap-3 h-10 pl-[15.5px] pr-3 rounded-2xl text-[13px] text-left transition-colors duration-150'

function RailButton({ icon: Icon, label, active, collapsed, badge, dotOnly, onClick }: {
  icon: LucideIcon; label: string; active?: boolean; collapsed: boolean
  badge?: number; dotOnly?: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`${ITEM} ${active ? 'sm-rail-active font-semibold' : 'hover:bg-[var(--sm-sidebar-hover)]'}`}
      style={active
        ? { background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 20px -8px rgba(22,40,77,0.8)', color: '#ffffff' }
        : { color: 'var(--sm-sidebar-text)' }}
    >
      <span className="relative flex-shrink-0">
        <Icon className="w-[17px] h-[17px]" style={{ color: active ? '#ffffff' : 'var(--sm-sidebar-text)' }} />
        {!!badge && collapsed && (
          <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full ring-2 ring-[#16284d]" style={{ background: dotOnly ? '#60A5FA' : '#EAB308' }} />
        )}
      </span>
      {!collapsed && (
        <>
          <span className="whitespace-nowrap flex-1 truncate" style={active ? { color: '#ffffff' } : undefined}>{label}</span>
          {!!badge && (
            <span
              className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={dotOnly ? { background: '#2563EB', color: '#ffffff' } : { background: '#EAB308', color: '#ffffff' }}
            >
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </>
      )}
    </button>
  )
}

export function PortalLayout({
  children,
  clientName,
  unreadCount = 0,
  onBellClick,
  pendingCount,
  nav = [],
  active,
  onNavigate,
}: PortalLayoutProps) {
  const { signOut } = useAuth()
  const isDesktop = useIsDesktop()
  const badgeCount = unreadCount || pendingCount || 0

  // Celular: a página por trás fica parada e só o painel rola (igual à agência)
  useEffect(() => {
    document.documentElement.classList.add('sm-app-shell')
    return () => document.documentElement.classList.remove('sm-app-shell')
  }, [])

  // Trocou de aba: o painel volta para o topo e a gaveta do celular fecha
  const scrollRef = useRef<HTMLDivElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setDrawerOpen(false)
  }, [active])

  // Trilho: abre com o mouse (pequena espera para não abrir só de o cursor
  // atravessar a tela). No toque, tocar no espaço vazio abre e fecha.
  const [railOpen, setRailOpen] = useState(false)
  const railTimer = useRef<number>()
  const openRail = (v: boolean) => {
    window.clearTimeout(railTimer.current)
    railTimer.current = window.setTimeout(() => setRailOpen(v), v ? 90 : 160)
  }
  useEffect(() => () => window.clearTimeout(railTimer.current), [])
  useEffect(() => { if (!isDesktop) setRailOpen(false) }, [isDesktop])

  const rail = (expanded: boolean, onPick: (fn: () => void) => void) => {
    const collapsed = !expanded
    return (
      <>
        <div className="flex items-center gap-2.5 h-16 pl-[17px] pr-3 flex-shrink-0">
          <img src="/logo-icon.png" alt="StatusMedia" className="w-8 h-8 flex-shrink-0 object-contain select-none" draggable={false} />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block text-[15px] font-bold leading-none tracking-tight whitespace-nowrap" style={{ color: 'var(--sm-text-1)' }}>
                Status<span style={{ color: 'var(--sm-brand-media, #5B8DEF)' }}>Media</span>
              </span>
              {clientName && (
                <span className="block text-[10.5px] mt-1 truncate max-w-[150px]" style={{ color: 'var(--sm-sidebar-text)' }}>{clientName}</span>
              )}
            </span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-1 px-2.5 space-y-0.5" style={{ scrollbarWidth: 'none' }}>
          {nav.map(item => (
            <RailButton
              key={item.key}
              icon={item.icon}
              label={item.label}
              active={active === item.key}
              collapsed={collapsed}
              badge={item.badge}
              onClick={() => onPick(() => onNavigate?.(item.key))}
            />
          ))}
        </nav>

        <div className="flex-shrink-0 px-2.5 pb-3 pt-2 space-y-0.5" style={{ borderTop: '1px solid var(--sm-sidebar-border)' }}>
          <RailButton icon={Bell} label="Notificações" collapsed={collapsed} badge={badgeCount} dotOnly onClick={() => onPick(() => onBellClick?.())} />
          <RailButton icon={LogOut} label="Sair" collapsed={collapsed} onClick={() => signOut()} />
        </div>
      </>
    )
  }

  return (
    <div data-theme="light" className="portal-light relative flex h-screen h-[100dvh] overflow-hidden text-[var(--sm-text-1)]">
      <GlassBackdrop />

      {/* ── Computador: trilho de vidro que abre no hover e empurra o painel ── */}
      {isDesktop && (
        <div className="relative z-20 h-full flex-shrink-0 py-4 pl-4 pr-3">
          <motion.aside
            animate={{ width: railOpen ? 236 : 68 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onPointerEnter={e => { if (e.pointerType === 'mouse') openRail(true) }}
            onPointerLeave={e => { if (e.pointerType === 'mouse') openRail(false) }}
            onClick={e => {
              if ((e.target as HTMLElement).closest('button')) return
              window.clearTimeout(railTimer.current)
              setRailOpen(o => !o)
            }}
            className={`relative h-full flex flex-col overflow-hidden sm-glass-rail ${railOpen ? 'sm-glass-rail-open' : ''}`}
          >
            {rail(railOpen, fn => { fn(); window.clearTimeout(railTimer.current); setRailOpen(false) })}
          </motion.aside>
        </div>
      )}

      {/* ── Celular: botão flutuante + gaveta ── */}
      {!isDesktop && (
        <>
          <button
            onClick={() => setDrawerOpen(true)}
            className="fixed top-3 left-3 z-30 w-9 h-9 flex items-center justify-center rounded-xl border border-white/10"
            style={{ background: 'linear-gradient(180deg, #16284d 0%, #0B1020 100%)' }}
            aria-label="Abrir menu"
          >
            <Menu className="w-4 h-4" style={{ color: '#ffffff' }} />
            {(badgeCount > 0 || nav.some(n => n.badge)) && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#EAB308] ring-2 ring-white" />
            )}
          </button>
          {drawerOpen && <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setDrawerOpen(false)} />}
          <aside
            className={`fixed z-40 top-3 bottom-3 left-3 w-[250px] flex flex-col overflow-hidden sm-glass-rail sm-glass-rail-open transition-transform duration-200 ease-out ${drawerOpen ? 'translate-x-0' : '-translate-x-[calc(100%+24px)]'}`}
          >
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-3 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[var(--sm-sidebar-hover)]"
              aria-label="Fechar menu"
            >
              <X className="w-4 h-4" style={{ color: 'var(--sm-sidebar-text)' }} />
            </button>
            {rail(true, fn => { setDrawerOpen(false); fn() })}
          </aside>
        </>
      )}

      {/* ── Painel de vidro: o conteúdo rola aqui dentro ── */}
      <main className="relative z-10 flex-1 min-w-0 min-h-0 flex md:py-4 md:pr-4">
        <div
          ref={scrollRef}
          className="sm-glass-panel sm-scroll flex-1 min-h-0 h-full overflow-y-auto overflow-x-hidden md:rounded-[32px] pt-12 md:pt-0 pb-[env(safe-area-inset-bottom)] md:pb-0"
        >
          {children}
        </div>
      </main>
    </div>
  )
}
