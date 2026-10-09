// ── Cabeçalho comum das telas do CRM ─────────────────────────────────────────
// Cada aba é uma rota própria (/crm, /crm/propostas...), e não um estado da
// página: assim o link do WhatsApp ou da notificação cai direto na aba certa,
// e o voltar do navegador funciona.

import { NavLink } from 'react-router-dom'
import { Columns3, FileText, PenLine, Zap, BarChart3, Settings2, Eye, EyeOff, Lock } from 'lucide-react'
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
  { to: '/crm/configuracoes', label: 'Configurações', icon: Settings2, full: true },
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

interface Props {
  subtitle?: React.ReactNode
  actions?:  React.ReactNode
}

export function CrmHeader({ subtitle, actions }: Props) {
  const hidden = useHideValues()
  const { allowed: crmFull } = usePlanFeature('crmFull')
  return (
    // No celular a página reserva 3.5rem no topo para o botão de menu flutuante
    // (sm-menu-gap). O cabeçalho sobe para essa faixa e o título fica ao lado do
    // botão, devolvendo esse espaço para o conteúdo (no CRM, os cartões do funil).
    <div className="border-b flex-shrink-0 max-md:-mt-14" style={{ borderColor: 'var(--sm-border)' }}>
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 max-md:pt-3 max-md:pl-14 pb-2 gap-x-4 gap-y-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold" style={{ color: 'var(--sm-text-1)' }}>CRM</h1>
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
          {subtitle && (
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-4)' }}>{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap max-md:-ml-10 max-md:w-[calc(100%+2.5rem)]">{actions}</div>}
      </div>

      <nav className="flex gap-1 px-3 sm:px-5 overflow-x-auto" aria-label="Seções do CRM">
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 h-9 text-[12.5px] whitespace-nowrap border-b-2 transition-colors ${
                isActive ? 'border-[#2563EB] font-semibold' : 'border-transparent hover:opacity-100 opacity-70'
              }`}
            style={({ isActive }) => ({ color: isActive ? 'var(--sm-text-1)' : 'var(--sm-text-3)' })}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.full && !crmFull && <Lock className="w-3 h-3 opacity-60" aria-label="Disponível no plano Pro" />}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
