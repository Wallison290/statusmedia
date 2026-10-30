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

// Opções de parcelas mostradas como botões (a lista nativa do navegador abria
// alta, cinza e cortada dentro do modal). Cada botão já diz quanto fica a parcela.
const INSTALLMENT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 36]

export function InstallmentChooser({ total, entrada, value, onChange, format }: {
  total: number
  entrada: number
  value: number | null
  onChange: (n: number) => void
  /** Formata o valor da parcela (no CRM respeita o olho de esconder valores) */
  format: (n: number) => string
}) {
  // Parcela fora da lista (cadastro antigo ou digitado à mão) continua aparecendo
  const options = value && !INSTALLMENT_OPTIONS.includes(value)
    ? [...INSTALLMENT_OPTIONS, value].sort((a, b) => a - b)
    : INSTALLMENT_OPTIONS
  return (
    <div role="radiogroup" aria-label="Quantidade de parcelas" className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
      {options.map(n => {
        const s = splitInstallments(total, entrada, n)
        const active = value === n
        return (
          <button key={n} type="button" role="radio" aria-checked={active} onClick={() => onChange(n)}
            className="h-12 rounded-xl border px-1.5 flex flex-col items-center justify-center leading-tight transition-colors hover:border-[#2563EB]/50 min-w-0"
            style={{
              borderColor: active ? '#2563EB' : 'var(--sm-border)',
              background:  active ? 'rgba(37,99,235,0.12)' : 'var(--sm-bg-card)',
            }}>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: active ? 'var(--sm-text-1)' : 'var(--sm-text-2)' }}>{n}x</span>
            <span className="text-[10.5px] tabular-nums truncate max-w-full" style={{ color: active ? '#4F8EF7' : 'var(--sm-text-4)' }}>
              {s ? format(s.parcela) : '—'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
