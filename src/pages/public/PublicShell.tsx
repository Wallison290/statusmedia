// ── Moldura das páginas públicas do CRM ──────────────────────────────────────
// Proposta, contrato e formulário de captura são abertos pelo cliente da
// agência, sem login. Conceito: editorial, como uma revista impressa com a
// marca da agência. Papel claro e quente, tinta escura, títulos grandes em
// Bricolage Grotesque, seções numeradas separadas por linhas finas e a cor da
// agência como ÚNICO destaque (configurada em CRM › Configurações).
// Sempre claras (independem do tema do app) e prontas para salvar em PDF.

import { Loader2, AlertTriangle } from 'lucide-react'
import type { PublicAgency } from '@/hooks/useCrmDocuments'

export const INK   = '#1C1917'
export const MUTED = '#6B645C'
export const LINE  = '#E4DFD6'
export const PAPER = '#F6F4EF'
const DEFAULT_BRAND = '#2563EB'

/** Texto legível por cima da cor da agência: escuro em cor clara, branco em cor escura. */
function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.45 ? INK : '#FFFFFF'
}

/** Variáveis da marca: --brand, --on-brand e --brand-soft para fundos suaves. */
export function brandVars(color?: string | null): React.CSSProperties {
  const brand = color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : DEFAULT_BRAND
  return {
    ['--brand' as any]: brand,
    ['--on-brand' as any]: onColor(brand),
    ['--brand-soft' as any]: `${brand}14`,
  }
}

export function PublicShell({ agency, children, wide }: { agency?: PublicAgency | null; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen print:min-h-0" style={{ background: PAPER, color: INK, ...brandVars(agency?.color) }}>
      {/* Faixa fina na cor da agência: a assinatura visual da página */}
      <div className="h-1.5 print:hidden" style={{ background: 'var(--brand)' }} />
      <div className={`mx-auto px-5 sm:px-8 pt-8 sm:pt-12 pb-16 print:p-0 ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        {agency && (
          <header className="flex items-center gap-3 pb-6 mb-8 sm:mb-12 border-b" style={{ borderColor: LINE }}>
            {agency.logo ? (
              <img src={agency.logo} alt="" className="w-11 h-11 rounded-full object-cover" />
            ) : (
              <div className="w-11 h-11 rounded-full flex items-center justify-center font-display font-bold text-[18px]"
                   style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
                {agency.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="font-display text-[17px] font-bold tracking-[-0.01em]">{agency.name}</span>
          </header>
        )}
        <main>{children}</main>
        <p className="mt-16 pt-6 border-t text-[11.5px] print:hidden" style={{ borderColor: LINE, color: MUTED }}>
          Documento enviado por {agency?.name ?? 'a agência'} · StatusMedia
        </p>
      </div>
    </div>
  )
}

/** Número de seção + rótulo em caixa alta, com linha fina: o ritmo editorial */
export function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: MUTED }}>
      <span className="font-display text-[14px] tracking-normal" style={{ color: 'var(--brand)' }}>{n}</span>
      {children}
      <span className="flex-1 h-px" style={{ background: LINE }} />
    </p>
  )
}

export function PublicLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: PAPER }}>
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: MUTED }} />
    </div>
  )
}

export function PublicNotFound({ what }: { what: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: PAPER }}>
      <div className="max-w-sm">
        <AlertTriangle className="w-9 h-9 mb-4" style={{ color: '#B45309' }} />
        <h1 className="font-display text-[28px] font-bold leading-tight" style={{ color: INK }}>{what} não encontrado.</h1>
        <p className="text-[15px] mt-3 leading-relaxed" style={{ color: MUTED }}>
          O link pode ter expirado ou sido cancelado. Fale com quem enviou para receber um novo.
        </p>
      </div>
    </div>
  )
}

export const inputClass =
  'w-full h-12 rounded-xl border px-4 text-[16px] bg-white focus:outline-none focus:ring-4 focus:ring-[var(--brand-soft)] focus:border-[var(--brand)] transition-colors'

export const BRAND = 'var(--brand)'
