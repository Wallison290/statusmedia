import type { ReactNode } from 'react'

export function CrmSetupSection({ id, number, title, description, children, aside }: {
  id: string; number: string; title: string; description: string; children: ReactNode; aside?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="crm-setup-section">
      <div className="crm-setup-heading">
        <span className="crm-setup-number" aria-hidden="true">{number}</span>
        <div className="min-w-0 flex-1">
          <h3 id={`${id}-title`} className="font-display text-[19px] font-semibold tracking-tight" style={{ color: 'var(--sm-text-1)' }}>{title}</h3>
          <p className="text-[13px] leading-relaxed mt-1 max-w-2xl" style={{ color: 'var(--sm-text-2)' }}>{description}</p>
        </div>
        {aside && <div className="max-sm:w-full max-sm:pl-11">{aside}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}
