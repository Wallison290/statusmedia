import type { ReactNode, ElementType, ButtonHTMLAttributes } from 'react'

// Peças comuns das abas internas do perfil do cliente, no mesmo visual
// editorial do topo do perfil (título display, linhas finas, tokens de tema).
// Atenção: botões com texto branco usam o azul (#2563EB), nunca hex escuro —
// o tema claro remapeia bg-[#0f0f0f]/#111827/#1e293b para fundos claros.

export function TabHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-bold" style={{ color: 'var(--sm-text-1)' }}>{title}</h2>
        {subtitle && <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

export function PrimaryButton({ className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props}
      className={`h-9 px-3.5 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${className}`}
      style={{ background: 'var(--sm-primary)', ...props.style }}>
      {children}
    </button>
  )
}

export function GhostButton({ className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props}
      className={`h-9 px-3 rounded-xl border text-[12.5px] font-medium inline-flex items-center gap-1.5 hover:bg-black/5 transition-colors disabled:opacity-50 ${className}`}
      style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)', ...props.style }}>
      {children}
    </button>
  )
}

export function EmptyState({ Icon, title, hint, action }: { Icon: ElementType; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed py-12 px-4 text-center" style={{ borderColor: 'var(--sm-border)' }}>
      <Icon className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--sm-text-4)' }} />
      <p className="text-[13px] font-medium" style={{ color: 'var(--sm-text-2)' }}>{title}</p>
      {hint && <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-4)' }}>{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  )
}

/** Status como ponto + texto (sem pílula colorida). */
export function DotLabel({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: 'var(--sm-text-2)' }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {children}
    </span>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-4)' }}>{children}</p>
  )
}

export const cardStyle = { background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' } as const
export const inputStyle = { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' } as const
