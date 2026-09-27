// ── Cabeçalho comum das telas do CRM ─────────────────────────────────────────
// Cada aba é uma rota própria (/crm, /crm/propostas...), e não um estado da
// página: assim o link do WhatsApp ou da notificação cai direto na aba certa,
// e o voltar do navegador funciona.

import { NavLink } from 'react-router-dom'
import { Columns3, FileText, PenLine, Zap, BarChart3, Settings2 } from 'lucide-react'

const TABS = [
  { to: '/crm',               label: 'Funil',         icon: Columns3,  end: true },
  { to: '/crm/propostas',     label: 'Propostas',     icon: FileText },
  { to: '/crm/contratos',     label: 'Contratos',     icon: PenLine },
  { to: '/crm/automacoes',    label: 'Automações',    icon: Zap },
  { to: '/crm/relatorios',    label: 'Relatórios',    icon: BarChart3 },
  { to: '/crm/configuracoes', label: 'Configurações', icon: Settings2 },
]

interface Props {
  subtitle?: React.ReactNode
  actions?:  React.ReactNode
}

export function CrmHeader({ subtitle, actions }: Props) {
  return (
    <div className="border-b flex-shrink-0" style={{ borderColor: 'var(--sm-border)' }}>
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold" style={{ color: 'var(--sm-text-1)' }}>CRM</h1>
          {subtitle && (
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-4)' }}>{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
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
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
