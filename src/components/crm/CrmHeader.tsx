// ── Cabeçalho comum das telas do CRM ─────────────────────────────────────────
// Cada aba é uma rota própria (/crm, /crm/propostas...), e não um estado da
// página: assim o link do WhatsApp ou da notificação cai direto na aba certa,
// e o voltar do navegador funciona.

import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Columns3, FileText, PenLine, Zap, BarChart3, Settings2, Eye, EyeOff, Lock,
  SlidersHorizontal, ChevronDown, type LucideIcon,
} from 'lucide-react'
import { useHideValues, setHideValues } from '@/hooks/useHideValues'
import { PlanLocked, usePlanFeature } from '@/components/plan/PlanLocked'

// `full`: aba do CRM completo (planos Pro e Agency). No Starter ela aparece com
// cadeado e abre o convite de upgrade.
const TABS = [
  { to: '/crm',               label: 'Funil',         icon: Columns3,  end: true },
  { to: '/crm/propostas',     label: 'Propostas',     icon: FileText,  full: true },
  { to: '/crm/contratos',     label: 'Contratos',     icon: PenLine,   full: true },
  { to: '/crm/automacoes',    label: 'Automações',    icon: Zap,       full: true },
  { to: '/crm/relatorios',    label: 'Relatórios',    icon: BarChart3, full: true },
  // Atalho: as configurações do CRM moraram aqui até out/2026; hoje ficam em /configuracoes
  { to: '/configuracoes/crm-followup', label: 'Configurações', icon: Settings2, full: true },
]

/** Abas do CRM completo: no Starter mostra o cabeçalho e o convite de upgrade. */
export function CrmPlanGate({ children }: { children: React.ReactNode }) {
  const { ready, allowed } = usePlanFeature('crmFull')
  if (!ready) return null
  if (allowed) return <>{children}</>
  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--sm-bg-page)' }}>
      <CrmHeader subtitle="Funil comercial da agência" />
      <PlanLocked feature="crmFull" title="CRM completo"
        description="Propostas, contratos com assinatura, follow-up automático no WhatsApp, relatórios de vendas e todos os modelos de funil. No seu plano, o CRM tem o funil comercial padrão com os leads movidos à mão." />
    </div>
  )
}

/** Item da gaveta de ferramentas (Perguntar à IA, Modelos, Exportar...) */
export interface CrmTool {
  icon:      LucideIcon
  label:     string
  hint?:     string
  onClick:   () => void
  disabled?: boolean
  iconColor?: string
}

interface Props {
  /** Fica no title do "CRM" — a linha de subtítulo saiu para dar altura ao conteúdo */
  subtitle?: React.ReactNode
  /** Ações sempre à vista (busca, botão principal) */
  actions?:  React.ReactNode
  /** Ações secundárias: ficam guardadas na gaveta "Ferramentas" */
  tools?:    CrmTool[]
}

// ── Gaveta de ferramentas ─────────────────────────────────────────────────────
// Clicou, as ações deslizam para fora do botão em vidro; clicou fora ou Esc, fecha.

function CrmToolsDrawer({ tools }: { tools: CrmTool[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="Ferramentas do CRM"
        title="Ferramentas"
        className="flex items-center gap-1.5 h-9 px-3 rounded-full border text-[12px] font-medium transition-colors"
        style={{
          borderColor: open ? 'rgba(37,99,235,0.55)' : 'var(--sm-border)',
          background:  open ? 'rgba(37,99,235,0.12)' : 'var(--sm-bg-card)',
          color:       open ? 'var(--sm-text-1)' : 'var(--sm-text-2)',
        }}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span className="max-md:hidden">Ferramentas</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="sm-glass-pop absolute right-0 top-full mt-2 z-50 w-[260px] rounded-[20px] p-1.5 shadow-2xl origin-top-right"
          >
            {tools.map((t, i) => (
              <motion.button
                key={t.label}
                type="button"
                disabled={t.disabled}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 + i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => { setOpen(false); t.onClick() }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-left transition-colors hover:bg-[var(--sm-bg-alt)] disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sm-bg-alt)' }}>
                  <t.icon className="w-4 h-4" style={{ color: t.iconColor ?? 'var(--sm-text-2)' }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium" style={{ color: 'var(--sm-text-1)' }}>{t.label}</span>
                  {t.hint && <span className="block text-[11px] truncate" style={{ color: 'var(--sm-text-3)' }}>{t.hint}</span>}
                </span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Cabeçalho ─────────────────────────────────────────────────────────────────
// Uma linha só: "CRM" + olho, as abas numa cápsula de vidro ao lado, e as ações
// à direita. Abaixo do lg as abas descem para uma faixa que desliza.

export function CrmHeader({ subtitle, actions, tools }: Props) {
  const hidden = useHideValues()
  const { allowed: crmFull } = usePlanFeature('crmFull')
  return (
    // No celular a página reserva 3.5rem no topo para o botão de menu flutuante
    // (sm-menu-gap). O cabeçalho sobe para essa faixa e o título fica ao lado do
    // botão, devolvendo esse espaço para o conteúdo (no CRM, os cartões do funil).
    <div className="flex-shrink-0 max-md:-mt-14 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 pt-4 max-md:pt-3 max-md:pl-14 pb-2">
      <div className="flex items-center gap-1 flex-shrink-0">
        <h1
          className="font-display text-[22px] font-bold tracking-[-0.025em] leading-none"
          style={{ color: 'var(--sm-text-1)' }}
          title={typeof subtitle === 'string' ? subtitle : undefined}
        >
          CRM
        </h1>
        {/* Olho: esconde os valores em reais em todas as telas do CRM */}
        <button
          type="button"
          onClick={() => setHideValues(!hidden)}
          aria-label={hidden ? 'Mostrar valores' : 'Esconder valores'}
          aria-pressed={hidden}
          title={hidden ? 'Mostrar valores' : 'Esconder valores'}
          className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          style={{ color: hidden ? '#4F8EF7' : 'var(--sm-text-3)' }}
        >
          {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      <nav
        aria-label="Seções do CRM"
        className="max-lg:order-last max-lg:w-full overflow-x-auto scrollbar-none"
      >
        <div className="inline-flex items-center gap-0.5 p-1 rounded-full border" style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
          {TABS.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              title={t.label}
              className={({ isActive }) =>
                `sm-glass-segment flex items-center gap-1.5 px-3 h-8 rounded-full text-[12.5px] whitespace-nowrap transition-colors ${
                  isActive ? 'is-active font-semibold' : 'hover:text-[var(--sm-text-1)]'
                }`}
              style={({ isActive }) => ({ color: isActive ? 'var(--sm-text-1)' : 'var(--sm-text-3)' })}
            >
              {({ isActive }) => (
                <>
                  <t.icon className="w-3.5 h-3.5" style={isActive ? { color: '#2563EB' } : undefined} />
                  {t.label}
                  {t.full && !crmFull && <Lock className="w-3 h-3 opacity-60" aria-label="Disponível no plano Pro" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {(actions || (tools && tools.length > 0)) && (
        <div className="flex items-center gap-2 ml-auto max-md:w-[calc(100%+2.5rem)] max-md:-ml-10 max-md:order-last">
          {actions}
          {tools && tools.length > 0 && <CrmToolsDrawer tools={tools} />}
        </div>
      )}
    </div>
  )
}
