import { motion } from 'framer-motion'

// Peças visuais do portal do cliente — o mesmo estilo editorial do app da
// agência: títulos em Bricolage, seções numeradas, fios de 1px no lugar de
// sombras e o azul da marca só nos pontos que pedem ação.

export const PORTAL_ACCENT = '#2563EB'

/** Superfície padrão: branco, fio de 1px, cantos generosos. */
export const portalPanel = 'rounded-[22px] border border-[#E4E7EC] bg-white'

/** Rótulo pequeno em caixa alta, usado acima de títulos e números. */
export const portalEyebrow = 'text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#8A94A6]'

const ease = [0.16, 1, 0.3, 1] as const

interface SectionHeadProps {
  /** Número da seção, ex.: "02" */
  n: string
  eyebrow: string
  title: string
  /** Parte do título em azul (vem depois do título) */
  accent?: string
  desc?: string
  right?: React.ReactNode
}

/** Abertura de cada aba: número, rótulo, título grande e fio embaixo. */
export function PortalSectionHead({ n, eyebrow, title, accent, desc, right }: SectionHeadProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease }}
      className="mb-7 sm:mb-9"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-8 pb-5 border-b border-[#E4E7EC]">
        <div className="min-w-0">
          <p className={portalEyebrow}>
            <span className="text-[#2563EB] tabular-nums">{n}</span>
            <span className="mx-2 text-[#C4CAD4]">/</span>
            {eyebrow}
          </p>
          <h2
            className="font-display font-bold text-[#0F172A] mt-3 leading-[0.98] tracking-[-0.035em]"
            style={{ fontSize: 'clamp(30px, 4.2vw, 48px)' }}
          >
            {title}
            {accent && <> <span className="text-[#2563EB]">{accent}</span></>}
          </h2>
          {desc && <p className="text-[13.5px] leading-relaxed text-[#5B6576] mt-3 max-w-[58ch]">{desc}</p>}
        </div>
        {right && <div className="flex-shrink-0">{right}</div>}
      </div>
    </motion.header>
  )
}

/** Título interno de um bloco, com número pequeno e fio. */
export function PortalBlockTitle({ label, count, right }: { label: string; count?: number; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-[#EEF0F3]">
      <p className="text-[13px] font-semibold text-[#0F172A] flex items-center gap-2">
        {label}
        {count != null && <span className="text-[11px] font-medium text-[#8A94A6] tabular-nums">{count}</span>}
      </p>
      {right}
    </div>
  )
}

/** Estado vazio discreto, sem ícone gigante. */
export function PortalEmpty({ title, text }: { title: string; text?: string }) {
  return (
    <div className={`${portalPanel} px-6 py-14 text-center`}>
      <p className="font-display text-[20px] font-semibold text-[#0F172A] tracking-[-0.02em]">{title}</p>
      {text && <p className="text-[13px] text-[#5B6576] mt-2 max-w-sm mx-auto leading-relaxed">{text}</p>}
    </div>
  )
}

/** Pílula de filtro: ponto de cor + rótulo + contagem. Ativa fica escura. */
export function PortalFilterChip({
  active, label, count, dot, onClick,
}: { active: boolean; label: string; count?: number; dot?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-[12px] font-medium border transition-all duration-300 ${
        active
          ? 'bg-[#0F172A] border-[#0F172A] text-white'
          : 'bg-white border-[#E4E7EC] text-[#5B6576] hover:border-[#0F172A] hover:text-[#0F172A]'
      }`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />}
      {label}
      {count != null && (
        <span className={`tabular-nums text-[11px] ${active ? 'text-white/60' : 'text-[#A0A8B5]'}`}>{count}</span>
      )}
    </button>
  )
}
