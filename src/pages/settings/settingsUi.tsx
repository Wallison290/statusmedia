import type { ReactNode } from 'react'

// Peças da página Configurações: título em Bricolage (font-display), linhas de
// 1px, cartões neutros. Seções sem numeração (pedido do usuário); `n` segue
// aceito e não aparece.

export const cardStyle = { background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' } as const
export const fieldStyle = { background: 'var(--sm-field-bg, var(--sm-bg-input))', borderColor: 'var(--sm-field-border, var(--sm-border))', color: 'var(--sm-text-1)' } as const
export const fieldClass = 'w-full h-10 px-3 rounded-xl border text-[13px] outline-none focus:border-[#2563EB]/60 focus:ring-2 focus:ring-[#2563EB]/20 placeholder:text-[color:var(--sm-text-4)] disabled:cursor-not-allowed disabled:opacity-70'

export function SettingsSection({ n, title, description, aside, children }: {
  n: string
  title: string
  description?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-display text-[17px] font-bold tracking-[-0.01em]" style={{ color: 'var(--sm-text-1)' }}>{title}</h3>
          {description && <p className="text-[12.5px] mt-0.5 max-w-[62ch]" style={{ color: 'var(--sm-text-3)' }}>{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: 'var(--sm-text-3)' }}>
      {children}
    </label>
  )
}
