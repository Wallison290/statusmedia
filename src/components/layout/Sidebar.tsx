import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Users, Calendar, CheckSquare,
  LogOut, ChevronLeft, ChevronRight, Wallet, NotebookPen, LayoutGrid, Zap, UserCheck, Instagram, HardDrive, Info, MessageCircle, BarChart3,
  ShieldCheck, Target,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/utils/formatters'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import { useStorageUsage } from '@/hooks/useStorageUsage'

interface NavItem {
  href:       string
  icon:       LucideIcon
  label:      string
  /** Tooltip em inglês. A interface é em português, e o App Review da Meta pede
   *  que elementos não óbvios sejam explicados para quem não fala o idioma. */
  hint?:      string
  comingSoon?: boolean
  adminOnly?: boolean
}

interface NavGroup {
  /** null = bloco sem cabeçalho (Dashboard no topo, StatusIA no fim) */
  title: string | null
  items: NavItem[]
}

// Os itens são agrupados por assunto em vez de virem numa lista corrida.
// CLIENTES  = o que se abre pensando num cliente específico
// PRODUÇÃO  = o trabalho sendo feito
// CANAIS    = por onde o conteúdo sai
// AGÊNCIA   = a casa, não o cliente
// Dashboard e StatusIA ficam soltos de propósito: um é a porta de entrada,
// o outro é o diferencial do produto e perde força dentro de um grupo.
const navGroups: NavGroup[] = [
  {
    title: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    title: 'Clientes',
    items: [
      // O CRM vem antes da carteira: o lead é o passo anterior ao cliente
      { href: '/crm',     icon: Target,     label: 'CRM'            },
      { href: '/clients', icon: Users,      label: 'Clientes', hint: 'Clients — the brands this agency manages. Each client can have one connected Instagram professional account.' },
      { href: '/feed',    icon: LayoutGrid, label: 'Feed do Perfil' },
      { href: '/reports', icon: BarChart3,  label: 'Relatórios', hint: 'Reports — monthly performance reports built from Instagram Insights.' },
    ],
  },
  {
    title: 'Produção',
    items: [
      { href: '/planner', icon: Calendar,    label: 'Planejamento', hint: 'Planner — plan, approve and schedule the content that gets published to Instagram.' },
      { href: '/tasks',   icon: CheckSquare, label: 'Tarefas'      },
      { href: '/notes',   icon: NotebookPen, label: 'Notas'        },
    ],
  },
  {
    title: 'Canais',
    items: [
      // Sem `comingSoon`: a integração está ativa e é o que a Meta avalia no App
      // Review. Um selo "em breve" na tela que o revisor foi testar contradiz a
      // submissão. A infraestrutura do selo continua aqui para o próximo recurso
      // que precisar dela.
      { href: '/instagram', icon: Instagram,     label: 'Instagram', hint: 'Instagram — connect client accounts and follow scheduled and published posts.' },
      { href: '/whatsapp',  icon: MessageCircle, label: 'WhatsApp'   },
    ],
  },
  {
    title: 'Agência',
    items: [
      { href: '/financial', icon: Wallet,      label: 'Financeiro' },
      { href: '/equipe',    icon: UserCheck,   label: 'Equipe'     },
      { href: '/admin',     icon: ShieldCheck, label: 'Admin', adminOnly: true },
    ],
  },
  // StatusIA fora do menu (set/2026): a StatusMedia deixou de vender IA por
  // enquanto. As rotas /ai continuam existindo; para reativar, é só voltar:
  // { title: null, items: [{ href: '/ai', icon: Sparkles, label: 'StatusIA' }] },
]

// ── Initials avatar ───────────────────────────────────────────────────────────

function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-[13px] font-bold select-none"
      style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)' }}
    >
      {initials}
    </div>
  )
}

// ── Brand mark ────────────────────────────────────────────────────────────────

function BrandMark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2.5 flex-1 min-w-0">
      <img
        src="/logo-icon.png"
        alt="StatusMedia"
        className="flex-shrink-0 w-8 h-8 object-contain select-none"
        draggable={false}
      />
      {!collapsed && (
        <motion.div
          initial={false}
          animate={{ opacity: 1 }}
          className="min-w-0"
        >
          <span className="block text-[15px] font-bold leading-none tracking-tight whitespace-nowrap" style={{ color: 'var(--sm-text-1)' }}>
            Status<span style={{ color: '#6f93c9' }}>Media</span>
          </span>
          <span className="block text-[10px] whitespace-nowrap mt-0.5 tracking-wide" style={{ color: 'var(--sm-sidebar-text)' }}>
            Organize. Produza. Escale.
          </span>
        </motion.div>
      )}
    </div>
  )
}

// ── Coming soon badge + info tooltip ─────────────────────────────────────────

function ComingSoonBadge({ onInfo }: { onInfo: (pos: { x: number; y: number } | null) => void }) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.preventDefault()}>
      <span
        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
        style={{ background: 'var(--sm-sidebar-badge)', border: '1px solid var(--sm-sidebar-border)', color: 'var(--sm-sidebar-text)' }}
      >
        em breve
      </span>
      <div
        className="cursor-help"
        onMouseEnter={(e) => {
          e.preventDefault()
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          onInfo({ x: rect.right + 8, y: rect.top + rect.height / 2 })
        }}
        onMouseLeave={() => onInfo(null)}
      >
        <Info className="w-3 h-3 transition-colors" style={{ color: 'var(--sm-sidebar-icon)' }} />
      </div>
    </div>
  )
}

// ── Cabeçalho de grupo ────────────────────────────────────────────────────────
// Expandido: o nome do grupo. Recolhido: só uma linha, porque o texto não cabe
// nos 56px — a separação continua existindo, sem o rótulo.

function GroupHeading({ title, collapsed }: { title: string | null; collapsed: boolean }) {
  if (collapsed) {
    return <div className="mx-2 my-2 h-px" style={{ background: 'var(--sm-sidebar-border)' }} />
  }
  if (!title) return <div className="pt-3" />
  return (
    <div
      className="px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider select-none"
      style={{ color: 'var(--sm-sidebar-text)' }}
    >
      {title}
    </div>
  )
}

// ── Item de navegação ─────────────────────────────────────────────────────────

function NavEntry({ item, active, collapsed, onInfo }: {
  item:      NavItem
  active:    boolean
  collapsed: boolean
  onInfo:    (pos: { x: number; y: number } | null) => void
}) {
  // Recolhido, só o ícone aparece: o tooltip precisa dizer que item é esse.
  // Expandido, o rótulo já está visível: sobra espaço para a explicação em
  // inglês, que existe para quem não lê português — inclusive o revisor da Meta.
  const tooltip = collapsed
    ? (item.comingSoon ? `${item.label} — Em breve (aguardando liberação do Meta)` : item.label)
    : item.hint

  // Item ativo
  if (active) {
    return (
      <Link to={item.href}>
        <div
          title={tooltip}
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all duration-150"
          style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)' }}
        >
          <item.icon className="w-[15px] h-[15px] flex-shrink-0 text-white" />
          {!collapsed && (
            <>
              <span className="whitespace-nowrap text-white flex-1">{item.label}</span>
              {item.comingSoon && <ComingSoonBadge onInfo={onInfo} />}
            </>
          )}
        </div>
      </Link>
    )
  }

  // Item normal inativo
  return (
    <Link to={item.href}>
      <div
        title={tooltip}
        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[13px] transition-all duration-150 group"
        style={{ color: 'var(--sm-sidebar-text)' }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--sm-sidebar-hover)'
          ;(e.currentTarget as HTMLDivElement).style.color = 'var(--sm-text-1)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLDivElement).style.color = 'var(--sm-sidebar-text)'
        }}
      >
        <item.icon className="w-[15px] h-[15px] flex-shrink-0 transition-colors" style={{ color: 'var(--sm-sidebar-icon)' }} />
        {!collapsed && (
          <>
            <span className="whitespace-nowrap flex-1">{item.label}</span>
            {item.comingSoon && <ComingSoonBadge onInfo={onInfo} />}
          </>
        )}
      </div>
    </Link>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  onMobileClose?: () => void
}

export function Sidebar({ onMobileClose }: SidebarProps) {
  const location  = useLocation()
  const { signOut, profile, user } = useAuth()
  const [collapsed, setCollapsed]  = useState(false)
  const [igTooltip, setIgTooltip] = useState<{ x: number; y: number } | null>(null)
  const { data: subData }          = useSubscription()
  const { data: storage }          = useStorageUsage()

  const planName  = subData?.plan.name ?? 'Free'

  const stUsedGB  = storage?.usedGB  ?? 0
  const stLimitGB = storage?.limitGB ?? 10
  const stPct     = Math.min(100, Math.round((stUsedGB / stLimitGB) * 100))
  const stWarning = stPct >= 80
  const stLabel   = stUsedGB < 1 ? `${(stUsedGB * 1024).toFixed(0)} MB` : `${stUsedGB.toFixed(1)} GB`

  // "Admin" só aparece para a conta marcada como is_admin no banco. Grupo que
  // ficar vazio depois desse filtro não é renderizado — evita cabeçalho órfão.
  const groups = navGroups
    .map(group => ({ ...group, items: group.items.filter(i => !i.adminOnly || profile?.is_admin) }))
    .filter(group => group.items.length > 0)

  useEffect(() => {
    onMobileClose?.()
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.aside
      animate={{ width: collapsed ? 56 : 220 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="relative flex flex-col h-full overflow-hidden flex-shrink-0"
      style={{ background: 'var(--sm-sidebar-bg)', borderRight: '1px solid var(--sm-sidebar-border)' }}
    >
      {/* ── Brand header ── */}
      <div className="flex items-center h-14 px-3.5" style={{ borderBottom: '1px solid var(--sm-sidebar-border)' }}>
        <BrandMark collapsed={collapsed} />
      </div>

      {/* ── Nav ── */}
      <nav
        className="flex-1 py-1.5 px-2 overflow-y-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
      >
        {groups.map((group, gi) => (
          <div key={group.title ?? `bloco-${gi}`}>
            {/* O primeiro bloco encosta no topo — cabeçalho só a partir do segundo */}
            {gi > 0 && <GroupHeading title={group.title} collapsed={collapsed} />}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavEntry
                  key={item.href}
                  item={item}
                  active={
                    location.pathname === item.href ||
                    (item.href !== '/' && location.pathname.startsWith(item.href))
                  }
                  collapsed={collapsed}
                  onInfo={setIgTooltip}
                />
              ))}
            </div>
          </div>
        ))}

        {/* ── Plano + uso de IA + Armazenamento — rola junto com o menu ── */}
        <div className="pt-1 pb-1">
        <Link to="/assinatura">
          <div
            className="rounded-xl px-2.5 py-2 transition-colors"
            style={{ background: 'var(--sm-sidebar-card)', border: '1px solid var(--sm-sidebar-border)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--sm-sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--sm-sidebar-card)' }}
          >
            {!collapsed ? (
              <div className="space-y-2">
                {/* Plano. O contador de créditos de IA saiu junto com o StatusIA do menu */}
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-[#6366f1]" />
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{planName}</span>
                </div>
                {/* Storage */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <HardDrive className={`w-3 h-3 ${stWarning ? 'text-amber-400' : 'text-[#60a5fa]'}`} />
                      <span className="text-[10px]" style={{ color: 'var(--sm-sidebar-text)' }}>Armazenamento</span>
                    </div>
                    <span className={`text-[10px] ${stWarning ? 'text-amber-400' : ''}`} style={!stWarning ? { color: 'var(--sm-sidebar-text)' } : {}}>
                      {stLabel}/{stLimitGB} GB
                    </span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--sm-sidebar-border)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${stPct > 0 ? Math.max(stPct, 3) : 0}%`,
                        background: stPct >= 90 ? '#ef4444' : stPct >= 70 ? '#f59e0b' : 'linear-gradient(90deg, #29457a, #16284d)',
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Zap className="w-[15px] h-[15px] text-[#6366f1]" />
                <HardDrive className={`w-[15px] h-[15px] ${stWarning ? 'text-amber-400' : 'text-[#60a5fa]'}`} />
              </div>
            )}
          </div>
        </Link>
        </div>
      </nav>

      {/* ── Sair ── */}
      <div className="px-2 pb-2 pt-1 flex-shrink-0" style={{ borderTop: '1px solid var(--sm-sidebar-border)' }}>
        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[13px] transition-colors duration-150"
          style={{ color: 'var(--sm-sidebar-text)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--sm-sidebar-hover)'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--sm-text-1)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--sm-sidebar-text)'
          }}
        >
          <LogOut className="w-[15px] h-[15px] flex-shrink-0" style={{ color: 'var(--sm-sidebar-icon)' }} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>

      {/* ── Botão colapsar (oculto no mobile) ── */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        className="absolute -right-3 top-16 z-10 w-6 h-6 rounded-full hidden md:flex items-center justify-center transition-colors shadow-lg"
        style={{ background: 'var(--sm-sidebar-card)', border: '1px solid rgba(37,99,235,0.55)', color: '#60A5FA' }}
        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#2563EB'; b.style.color = '#ffffff' }}
        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--sm-sidebar-card)'; b.style.color = '#60A5FA' }}
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5" />
          : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* ── Tooltip do selo "em breve" (portal para escapar do overflow-hidden) ──
          Dorme enquanto nenhum item do menu tiver `comingSoon`. O texto é
          genérico de propósito: já esteve preso ao Instagram e ficou errado
          quando a integração foi liberada. */}
      {igTooltip && createPortal(
        <div
          className="pointer-events-none"
          style={{ position: 'fixed', left: igTooltip.x, top: igTooltip.y, transform: 'translateY(-50%)', zIndex: 9999 }}
        >
          <div
            className="w-52 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed shadow-2xl"
            style={{ background: 'var(--sm-sidebar-bg)', border: '1px solid var(--sm-sidebar-border)', color: 'var(--sm-sidebar-text)' }}
          >
            <p className="font-semibold mb-1" style={{ color: 'var(--sm-text-1)' }}>Em breve</p>
            <p>Este recurso ainda está em desenvolvimento e será liberado em breve.</p>
          </div>
        </div>,
        document.body,
      )}
    </motion.aside>
  )
}
