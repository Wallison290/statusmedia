// Peças visuais comuns do Financeiro. Usam os tokens de tema (var(--sm-*)),
// então funcionam no tema claro e no escuro.

import { forwardRef } from 'react'
import type { EntryState, FinType } from '@/hooks/useFinance'

export const inputCls =
  'w-full h-10 rounded-xl border px-3 text-[13px] outline-none transition-colors focus:border-[#2563EB]/60 [color-scheme:light_dark]'
export const inputStyle: React.CSSProperties = {
  background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)',
}

export function Field({ label, hint, children, className = '' }: {
  label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--sm-text-3)' }}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] mt-1" style={{ color: 'var(--sm-text-4)' }}>{hint}</span>}
    </label>
  )
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', style, ...p }, ref) => (
    <input ref={ref} {...p} className={`${inputCls} ${className}`} style={{ ...inputStyle, ...style }} />
  ),
)
TextInput.displayName = 'TextInput'

export function SelectInput({ className = '', style, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={`${inputCls} ${className}`} style={{ ...inputStyle, ...style }}>
      {children}
    </select>
  )
}

/** Campo de valor em reais: aceita "1.500,50" ou "1500.50". */
export function parseMoney(v: string): number {
  const s = v.trim().replace(/[R$\s]/g, '')
  if (!s) return 0
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
export function moneyToInput(n: number | null | undefined) {
  return n ? n.toFixed(2).replace('.', ',') : ''
}

export function PrimaryButton({ children, className = '', style, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`h-10 px-4 rounded-xl text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-opacity hover:opacity-95 ${className}`}
      style={{ background: '#2563EB', ...style }}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, className = '', style, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`h-10 px-3.5 rounded-xl border text-[13px] font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors hover:bg-white/5 ${className}`}
      style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)', ...style }}
    >
      {children}
    </button>
  )
}

export function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl border ${className}`} style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)', ...style }}>
      {children}
    </div>
  )
}

export function SectionTitle({ n, title, right }: { n?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <h2 className="font-display text-[17px] font-bold flex items-baseline gap-2" style={{ color: 'var(--sm-text-1)' }}>
        {n && <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{n}</span>}
        {title}
      </h2>
      {right}
    </div>
  )
}

const STATE_META: Record<EntryState, { label: string; color: string }> = {
  pago:      { label: 'Pago',      color: '#22C55E' },
  aberto:    { label: 'Em aberto', color: '#94A3B8' },
  atrasado:  { label: 'Atrasado',  color: '#EF4444' },
  cancelado: { label: 'Cancelado', color: '#64748B' },
}

/** Situação: ponto colorido + texto (nunca só cor). */
export function StatePill({ state, type }: { state: EntryState; type?: FinType }) {
  const m = STATE_META[state]
  const label = state === 'pago' && type ? (type === 'receita' ? 'Recebido' : 'Pago') : m.label
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium whitespace-nowrap" style={{ color: 'var(--sm-text-2)' }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
      {label}
    </span>
  )
}

export function Amount({ value, type, className = '' }: { value: number; type: FinType; className?: string }) {
  const fmt = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return (
    <span className={`tabular-nums font-semibold whitespace-nowrap ${className}`}
          style={{ color: type === 'receita' ? 'var(--sm-text-1)' : 'var(--sm-text-2)' }}>
      {type === 'despesa' ? '− ' : ''}{fmt}
    </span>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="py-12 px-6 text-center">
      <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{title}</p>
      {text && <p className="text-[12.5px] mt-1 max-w-md mx-auto" style={{ color: 'var(--sm-text-3)' }}>{text}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/** Moldura de janela modal simples (fundo escurecido + cartão). */
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border shadow-2xl`}
        style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--sm-border)' }}>
          <h3 className="font-display text-[16px] font-bold" style={{ color: 'var(--sm-text-1)' }}>{title}</h3>
          <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5"
                  style={{ color: 'var(--sm-text-3)' }}>✕</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--sm-border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Bloco de número do topo das abas (mesmo desenho em todo o Financeiro). */
export function KpiTile({ label, value, sub, tone, onClick, active }: {
  label: string; value: string; sub?: string
  tone?: 'good' | 'warn' | 'bad'; onClick?: () => void; active?: boolean
}) {
  const bar = tone === 'bad' ? '#EF4444' : tone === 'warn' ? '#F59E0B' : tone === 'good' ? '#22C55E' : 'transparent'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={`relative text-left rounded-2xl border px-4 py-3.5 overflow-hidden min-w-0 ${onClick ? 'transition-colors hover:bg-white/[0.03]' : ''}`}
      style={{ background: 'var(--sm-bg-card)', borderColor: active ? '#2563EB' : 'var(--sm-border)' }}
    >
      <span className="absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded-r" style={{ background: bar }} />
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] truncate" style={{ color: 'var(--sm-text-4)' }}>{label}</p>
      <p className="font-display text-[22px] font-bold tabular-nums leading-tight mt-1 truncate" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
      {sub && <p className="text-[11.5px] mt-0.5 truncate" style={{ color: 'var(--sm-text-3)' }}>{sub}</p>}
    </Tag>
  )
}

/** Bloco cinza pulsando no lugar do conteúdo enquanto carrega. */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`rounded-2xl animate-pulse ${className}`} style={{ background: 'var(--sm-bg-card)', ...style }} />
}

/** Esqueleto padrão de uma aba: faixa de números + blocos de conteúdo. */
export function TabSkeleton({ kpis = 4, blocks = [260, 180] }: { kpis?: number; blocks?: number[] }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      {kpis > 0 && (
        <div className={`grid grid-cols-2 ${kpis >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
          {Array.from({ length: kpis }, (_, i) => <Skeleton key={i} className="h-[92px]" />)}
        </div>
      )}
      {blocks.map((h, i) => <Skeleton key={i} style={{ height: h }} />)}
    </div>
  )
}
