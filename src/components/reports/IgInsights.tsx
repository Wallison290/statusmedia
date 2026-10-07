// ── IgInsights ────────────────────────────────────────────────────────────────
// Seções RICAS do relatório (vindas de client_reports.ig_data): visitas ao
// perfil, contas engajadas, impressões, interações totais, quebra de interações,
// top publicações do mês e demografia da audiência.
//
// Componente compartilhado entre a aba Resultados da agência (ReportsTab), o
// workspace global de Relatórios e o portal do cliente (PortalResultadosTab).
// Read-only. O prop `isDark` é opcional e default `false` (tema claro) — quem
// quiser dark mode passa `isDark` explicitamente (ex: workspace de Relatórios).
// Portal e ReportsTab continuam sem passar o prop, então continuam sempre claros.
// ─────────────────────────────────────────────────────────────────────────────

import { Eye, Users, TrendingUp, Zap, Heart, Instagram, ImageIcon, BarChart3 } from 'lucide-react'
import type { ClientReport } from '@/types'

const GENDER_LABEL: Record<string, string> = { M: 'Masculino', F: 'Feminino', U: 'Outro' }

type Tone = 'amber' | 'teal' | 'sky' | 'violet'

const TONE: Record<Tone, { icon: string; iconDark: string; light: string; dark: string }> = {
  amber:  { icon: 'text-amber-600',  iconDark: 'text-amber-400',  light: 'border-amber-300 bg-amber-100',   dark: 'border-amber-700/50 bg-amber-950/60'  },
  teal:   { icon: 'text-teal-600',   iconDark: 'text-teal-400',   light: 'border-teal-300 bg-teal-100',     dark: 'border-teal-700/50 bg-teal-950/60'    },
  sky:    { icon: 'text-sky-600',    iconDark: 'text-sky-400',    light: 'border-sky-300 bg-sky-100',       dark: 'border-sky-700/50 bg-sky-950/60'      },
  violet: { icon: 'text-violet-600', iconDark: 'text-violet-400', light: 'border-violet-300 bg-violet-100', dark: 'border-violet-700/50 bg-violet-950/60' },
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// Cartão neutro: a cor do tom fica só no ícone (mesmo visual dos KPIs do sistema).
function MetricCard({ icon: Icon, tone, label, value, isDark }: {
  icon: React.ElementType; tone: Tone; label: string; value: string; isDark: boolean
}) {
  const t = TONE[tone]
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-2"
      style={{ background: isDark ? '#182233' : '#ffffff', borderColor: isDark ? '#1e293b' : '#e2e8f0' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>{label}</p>
        <Icon className={`w-4 h-4 flex-shrink-0 ${isDark ? t.iconDark : t.icon}`} />
      </div>
      <p className="font-display text-[24px] font-bold leading-tight tabular-nums" style={{ color: isDark ? '#F8FAFC' : '#0f0f0f' }}>{value}</p>
    </div>
  )
}

function Bar({ label, value, max, isDark }: { label: string; value: number; max: number; isDark: boolean }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] w-24 flex-shrink-0 truncate" style={{ color: isDark ? '#CBD5E1' : '#475569' }}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: isDark ? '#1e293b' : '#e2e8f0' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#2563EB' }} />
      </div>
      <span className="text-[11px] font-semibold w-14 text-right flex-shrink-0" style={{ color: isDark ? '#F8FAFC' : '#0f0f0f' }}>{fmt(value)}</span>
    </div>
  )
}

export function IgInsights({ report, isDark = false }: { report: ClientReport; isDark?: boolean }) {
  const ig = report.ig_data
  if (!ig) return null

  const inter = ig.interactions
  const demo  = ig.demographics
  const genderEntries = demo?.gender ? Object.entries(demo.gender).sort((a, b) => b[1] - a[1]) : []
  const genderTotal   = genderEntries.reduce((s, [, v]) => s + v, 0)
  const ageEntries    = demo?.age ? Object.entries(demo.age).sort((a, b) => a[0].localeCompare(b[0])) : []
  const ageMax        = ageEntries.reduce((m, [, v]) => Math.max(m, v), 0)
  const cities        = demo?.cities ?? []
  const cityMax       = cities.reduce((m, c) => Math.max(m, c.value), 0)
  const hasInter      = !!inter && [inter.likes, inter.comments, inter.saves, inter.shares].some(v => v != null)
  const interTotal    = inter ? [inter.likes, inter.comments, inter.saves, inter.shares].reduce<number>((s, v) => s + (v ?? 0), 0) : null
  const hasDemo       = genderEntries.length > 0 || ageEntries.length > 0 || cities.length > 0
  const hasExtraKpis  = ig.profile_views != null || ig.accounts_engaged != null || report.impressions != null || interTotal != null

  const cardBg     = isDark ? '#182233' : '#ffffff'
  const cardBorder = isDark ? '#1e293b' : '#e2e8f0'
  const headText   = isDark ? '#F8FAFC' : '#0f0f0f'
  const mutedText  = isDark ? '#CBD5E1' : '#475569'
  const iconColor  = isDark ? '#94a3b8' : '#64748b'

  return (
    <>
      {/* Visão extra — 4 KPIs preenchem a linha por completo */}
      {hasExtraKpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={Eye} tone="amber" label="Visitas ao perfil" value={fmt(ig.profile_views)} isDark={isDark} />
          <MetricCard icon={Users} tone="teal" label="Contas engajadas" value={fmt(ig.accounts_engaged)} isDark={isDark} />
          <MetricCard icon={TrendingUp} tone="sky" label="Impressões" value={fmt(report.impressions)} isDark={isDark} />
          <MetricCard icon={Zap} tone="violet" label="Interações totais" value={fmt(interTotal)} isDark={isDark} />
        </div>
      )}

      {/* Interações */}
      {hasInter && (
        <section className="rounded-2xl border overflow-hidden" style={{ background: cardBg, borderColor: cardBorder }}>
          <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: cardBorder }}>
            <Heart className="w-3.5 h-3.5" style={{ color: iconColor }} />
            <p className="text-[13px] font-semibold" style={{ color: headText }}>Interações do mês</p>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              ['Curtidas', inter!.likes],
              ['Comentários', inter!.comments],
              ['Salvamentos', inter!.saves],
              ['Compartilhamentos', inter!.shares],
            ] as [string, number | null][]).map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: mutedText }}>{label}</p>
                <p className="text-[16px] font-bold" style={{ color: headText }}>{fmt(value)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top publicações */}
      {ig.top_posts && ig.top_posts.length > 0 && (
        <section className="rounded-2xl border overflow-hidden" style={{ background: cardBg, borderColor: cardBorder }}>
          <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: cardBorder }}>
            <Instagram className="w-3.5 h-3.5" style={{ color: iconColor }} />
            <p className="text-[13px] font-semibold" style={{ color: headText }}>Top publicações do mês</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ig.top_posts.map(post => (
              <a key={post.id} href={post.permalink ?? undefined} target="_blank" rel="noopener noreferrer"
                className="group rounded-xl border overflow-hidden transition-colors"
                style={{ background: isDark ? '#101A2B' : '#fafafa', borderColor: cardBorder }}>
                <div className="aspect-square overflow-hidden" style={{ background: isDark ? '#0B1020' : '#eee' }}>
                  {post.thumbnail
                    ? <img src={post.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ color: isDark ? '#334155' : '#c0c0c0' }}><ImageIcon className="w-6 h-6" /></div>}
                </div>
                <div className="p-2.5">
                  {post.media_type && <p className="text-[9px] uppercase tracking-wide mb-1" style={{ color: mutedText }}>{post.media_type}</p>}
                  <div className="flex items-center gap-3 text-[11px] font-medium" style={{ color: headText }}>
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-pink-500" /> {fmt(post.likes)}</span>
                    <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3 text-blue-500" /> {fmt(post.reach)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Audiência */}
      {hasDemo && (
        <section className="rounded-2xl border overflow-hidden" style={{ background: cardBg, borderColor: cardBorder }}>
          <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: cardBorder }}>
            <Users className="w-3.5 h-3.5" style={{ color: iconColor }} />
            <p className="text-[13px] font-semibold" style={{ color: headText }}>Audiência</p>
          </div>
          <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {genderEntries.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: mutedText }}>Gênero</p>
                {genderEntries.map(([g, v]) => (
                  <Bar key={g} label={GENDER_LABEL[g] ?? g} value={v} max={genderTotal} isDark={isDark} />
                ))}
              </div>
            )}
            {ageEntries.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: mutedText }}>Faixa etária</p>
                {ageEntries.map(([a, v]) => (
                  <Bar key={a} label={a} value={v} max={ageMax} isDark={isDark} />
                ))}
              </div>
            )}
            {cities.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: mutedText }}>Principais cidades</p>
                {cities.map(c => (
                  <Bar key={c.name} label={c.name} value={c.value} max={cityMax} isDark={isDark} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  )
}
