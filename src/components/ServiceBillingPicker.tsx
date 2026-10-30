// ── Forma de cobrança do serviço ─────────────────────────────────────────────
// Usado no cadastro do cliente e no card do lead (CRM): pagamento único,
// mensalidade recorrente ou entrada + parcelas. A conta das parcelas é a mesma
// do banco (migration 114) e da proposta parcelada: centavos que sobram vão na
// entrada, para a soma bater com o total.

import { CircleDollarSign, Repeat, Layers } from 'lucide-react'

export type ServiceBillingMode = 'unico' | 'recorrente' | 'parcelado'

const OPTIONS: { id: ServiceBillingMode; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'unico',      label: 'Pagamento único',   short: 'Único',    icon: CircleDollarSign },
  { id: 'recorrente', label: 'Mensal',            short: 'Mensal',   icon: Repeat },
  { id: 'parcelado',  label: 'Entrada + parcelas', short: 'Parcelas', icon: Layers },
]

export function ServiceBillingPicker({ value, onChange, className = '' }: {
  value: ServiceBillingMode
  onChange: (mode: ServiceBillingMode) => void
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label="Forma de cobrança"
      className={`grid grid-cols-3 gap-0.5 p-1 rounded-full border ${className}`}
      style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
      {OPTIONS.map(o => {
        const active = value === o.id
        return (
          <button key={o.id} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.id)}
            className={`sm-glass-segment ${active ? 'is-active font-semibold' : 'font-medium hover:text-[var(--sm-text-1)]'} h-9 px-2 rounded-full text-[12.5px] inline-flex items-center justify-center gap-1.5 min-w-0 transition-colors`}
            style={{ color: active ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>
            <o.icon className="w-3.5 h-3.5 flex-shrink-0" style={active ? { color: '#2563EB' } : undefined} />
            <span className="truncate sm:hidden">{o.short}</span>
            <span className="truncate max-sm:hidden">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Parcela e entrada ajustada (os centavos do arredondamento ficam na entrada). */
export function splitInstallments(total: number, entrada: number, parcelas: number) {
  const n = Math.max(1, Math.floor(parcelas || 1))
  const ent = Math.max(0, entrada || 0)
  if (!(total > 0) || ent >= total) return null
  const parcela = Math.round(((total - ent) / n) * 100) / 100
  return { parcela, entrada: Math.round((total - parcela * n) * 100) / 100, parcelas: n }
}
