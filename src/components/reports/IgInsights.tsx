// ── IgInsights ────────────────────────────────────────────────────────────────
// Seções RICAS do relatório (vindas de client_reports.ig_data): visitas ao
// perfil, contas engajadas, impressões, interações totais, quebra de interações,
// top publicações do mês e demografia da audiência.
//
// Componente compartilhado entre a aba Resultados da agência (ReportsTab), o
// workspace global de Relatórios e o portal do cliente (PortalResultadosTab).
// Read-only. `isDark` é opcional (default claro). Visual do kit da marca:
// superfícies neutras, fios de 1px, azul #2563EB só em barras e números de
// seção. `numbers` traz o número (01, 02…) de cada seção, calculado por quem
// chama com `igSectionKeys` (o filho renderiza depois do pai, então não dá
// para numerar com um contador compartilhado);
// `showKpis={false}` omite a faixa de KPIs quando a página já os mostra.
// ─────────────────────────────────────────────────────────────────────────────

import { Heart, MessageCircle, Eye, ImageIcon, ArrowUpRight } from 'lucide-react'
import type { ClientReport } from '@/types'

const ACCENT = '#2563EB'
const GENDER_LABEL: Record<string, string> = { M: 'Masculino', F: 'Feminino', U: 'Outro' }

export function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR')
}

export function interactionsTotal(report: ClientReport): number | null {
  const inter = report.ig_data?.interactions
  if (!inter) return null
  const vals = [inter.likes, inter.comments, inter.saves, inter.shares]
  if (vals.every(v => v == null)) return null
  return vals.reduce<number>((s, v) => s + (v ?? 0), 0)
}

export type IgSection = 'inter' | 'top' | 'audience'

/** Seções que o relatório vai mostrar, na ordem em que aparecem. */
export function igSectionKeys(report: ClientReport): IgSection[] {
  const ig = report.ig_data
  if (!ig) return []
  const d = ig.demographics
  const hasDemo = !!(d?.gender && Object.keys(d.gender).length) || !!(d?.age && Object.keys(d.age).length) || !!d?.cities?.length
  return [
    interactionsTotal(report) != null && 'inter',
    !!ig.top_posts?.length && 'top',
    hasDemo && 'audience',
  ].filter(Boolean) as IgSection[]
}

function palette(isDark: boolean) {
  return isDark
    ? { card: '#182233', alt: '#101A2B', border: '#1E293B', track: '#1E293B', text: '#F8FAFC', text2: '#CBD5E1', text3: '#94A3B8' }
    : { card: '#FFFFFF', alt: '#F8FAFC', border: '#E2E8F0', track: '#EEF2F6', text: '#0F172A', text2: '#475569', text3: '#94A3B8' }
}
type Pal = ReturnType<typeof palette>

/** Cabeçalho de seção: número azul + título em Bricolage + fio embaixo. */
function Head({ n, title, aside, p }: { n?: string; title: string; aside?: React.ReactNode; p: Pal }) {
  return (
    <div className="px-5 py-3.5 flex items-center justify-between gap-3 border-b" style={{ borderColor: p.border }}>
      <h3 className="flex items-baseline gap-2 min-w-0">
        {n && <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: ACCENT }}>{n}</span>}
        <span className="font-display text-[15px] font-bold truncate" style={{ color: p.text }}>{title}</span>
      </h3>
      {aside}
    </div>
  )
}

function Eyebrow({ children, p }: { children: React.ReactNode; p: Pal }) {
  return <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: p.text3 }}>{children}</p>
}

function Bar({ label, value, total, max, p }: { label: string; value: number; total: number; max: number; p: Pal }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0
  const share = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3">
      <span className="text-[12px] truncate" style={{ color: p.text2 }}>{label}</span>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: p.track }}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: ACCENT }} />
      </div>
      <span className="text-[12px] tabular-nums text-right w-[4.5rem]" style={{ color: p.text }}>
        <span className="font-semibold">{fmt(value)}</span>
        <span style={{ color: p.text3 }}> · {share}%</span>
      </span>
    </div>
  )
}

export function IgInsights({ report, isDark = false, numbers, showKpis = true }: {
  report: ClientReport; isDark?: boolean; numbers?: Partial<Record<IgSection, string>>; showKpis?: boolean
}) {
  const ig = report.ig_data
  if (!ig) return null
  const p = palette(isDark)

  const inter = ig.interactions
  const demo  = ig.demographics
  const genderEntries = demo?.gender ? Object.entries(demo.gender).sort((a, b) => b[1] - a[1]) : []
  const genderTotal   = genderEntries.reduce((s, [, v]) => s + v, 0)
  const genderMax     = genderEntries.reduce((m, [, v]) => Math.max(m, v), 0)
  const ageEntries    = demo?.age ? Object.entries(demo.age).sort((a, b) => a[0].localeCompare(b[0])) : []
  const ageTotal      = ageEntries.reduce((s, [, v]) => s + v, 0)
  const ageMax        = ageEntries.reduce((m, [, v]) => Math.max(m, v), 0)
  const cities        = demo?.cities ?? []
  // Cidades vêm só as 5 maiores: a fatia é sobre o total de seguidores, não sobre as 5.
  const cityTotal     = genderTotal || ageTotal || cities.reduce((s, c) => s + c.value, 0)
  const cityMax       = cities.reduce((m, c) => Math.max(m, c.value), 0)
  const interTotal    = interactionsTotal(report)
  const hasInter      = interTotal != null
  const hasDemo       = genderEntries.length > 0 || ageEntries.length > 0 || cities.length > 0
  const hasExtraKpis  = ig.profile_views != null || ig.accounts_engaged != null || report.impressions != null || interTotal != null
  const topPosts      = ig.top_posts ?? []
  const demoCols      = [genderEntries.length, ageEntries.length, cities.length].filter(Boolean).length

  const section = { background: p.card, borderColor: p.border }

  return (
    <>
      {/* Faixa de KPIs com divisórias de 1px */}
      {showKpis && hasExtraKpis && (
        <div className="rounded-2xl border grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden"
          style={{ background: p.border, borderColor: p.border }}>
          {([
            ['Visitas ao perfil', ig.profile_views],
            ['Contas engajadas', ig.accounts_engaged],
            ['Visualizações', report.impressions],
            ['Interações totais', interTotal],
          ] as [string, number | null][]).map(([label, value]) => (
            <div key={label} className="px-4 py-3.5 min-w-0" style={{ background: p.card }}>
              <Eyebrow p={p}>{label}</Eyebrow>
              <p className="font-display text-[22px] font-bold leading-none tabular-nums mt-1.5" style={{ color: p.text }}>{fmt(value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Interações: quanto cada tipo pesa no total */}
      {hasInter && (
        <section className="rounded-2xl border overflow-hidden" style={section}>
          <Head n={numbers?.inter} title="Interações do mês" p={p}
            aside={<span className="text-[12px] tabular-nums" style={{ color: p.text3 }}>{fmt(interTotal)} no total</span>} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: p.border }}>
            {([
              ['Curtidas', inter!.likes],
              ['Comentários', inter!.comments],
              ['Salvamentos', inter!.saves],
              ['Compartilhamentos', inter!.shares],
            ] as [string, number | null][]).map(([label, value]) => {
              const share = interTotal && value != null ? Math.round((value / interTotal) * 100) : 0
              return (
                <div key={label} className="px-5 py-4 min-w-0" style={{ background: p.card }}>
                  <Eyebrow p={p}>{label}</Eyebrow>
                  <p className="font-display text-[22px] font-bold leading-none tabular-nums mt-1.5" style={{ color: p.text }}>{fmt(value)}</p>
                  <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: p.track }}>
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: ACCENT }} />
                  </div>
                  <p className="text-[11px] mt-1.5 tabular-nums" style={{ color: p.text3 }}>{share}%</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Top publicações */}
      {topPosts.length > 0 && (
        <section className="rounded-2xl border overflow-hidden" style={section}>
          <Head n={numbers?.top} title="Top publicações do mês" p={p} />
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {topPosts.map((post, i) => (
              <a key={post.id} href={post.permalink ?? undefined} target="_blank" rel="noopener noreferrer"
                className="group rounded-xl border overflow-hidden flex flex-col transition-colors"
                style={{ background: p.alt, borderColor: p.border }}>
                <div className="relative aspect-square overflow-hidden" style={{ background: p.track }}>
                  {post.thumbnail
                    ? <img src={post.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ color: p.text3 }}><ImageIcon className="w-6 h-6" /></div>}
                  <span className="absolute top-2.5 left-2.5 h-6 px-2 rounded-md text-[11px] font-semibold tabular-nums inline-flex items-center bg-black/70 text-white">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {post.permalink && (
                    <span className="absolute top-2.5 right-2.5 w-6 h-6 rounded-md inline-flex items-center justify-center bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col gap-2">
                  {post.media_type && <Eyebrow p={p}>{post.media_type.replace('_', ' ')}</Eyebrow>}
                  {post.caption && (
                    <p className="text-[12px] leading-snug line-clamp-2" style={{ color: p.text2 }}>{post.caption}</p>
                  )}
                  <div className="mt-auto pt-2 border-t grid grid-cols-3 gap-2 text-[11.5px] tabular-nums" style={{ borderColor: p.border, color: p.text }}>
                    <span className="flex items-center gap-1" title="Curtidas"><Heart className="w-3 h-3" style={{ color: p.text3 }} /> {fmt(post.likes)}</span>
                    <span className="flex items-center gap-1" title="Comentários"><MessageCircle className="w-3 h-3" style={{ color: p.text3 }} /> {fmt(post.comments)}</span>
                    <span className="flex items-center gap-1" title="Alcance"><Eye className="w-3 h-3" style={{ color: p.text3 }} /> {fmt(post.reach)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Audiência */}
      {hasDemo && (
        <section className="rounded-2xl border overflow-hidden" style={section}>
          <Head n={numbers?.audience} title="Audiência" p={p}
            aside={<span className="text-[12px]" style={{ color: p.text3 }}>Seguidores da conta</span>} />
          <div className={`grid grid-cols-1 gap-px ${demoCols === 3 ? 'lg:grid-cols-3' : demoCols === 2 ? 'lg:grid-cols-2' : ''}`} style={{ background: p.border }}>
            {genderEntries.length > 0 && (
              <div className="p-5 space-y-3" style={{ background: p.card }}>
                <Eyebrow p={p}>Gênero</Eyebrow>
                {genderEntries.map(([g, v]) => (
                  <Bar key={g} label={GENDER_LABEL[g] ?? g} value={v} total={genderTotal} max={genderMax} p={p} />
                ))}
              </div>
            )}
            {ageEntries.length > 0 && (
              <div className="p-5 space-y-3" style={{ background: p.card }}>
                <Eyebrow p={p}>Faixa etária</Eyebrow>
                {ageEntries.map(([a, v]) => (
                  <Bar key={a} label={a} value={v} total={ageTotal} max={ageMax} p={p} />
                ))}
              </div>
            )}
            {cities.length > 0 && (
              <div className="p-5 space-y-3" style={{ background: p.card }}>
                <Eyebrow p={p}>Principais cidades</Eyebrow>
                {cities.map(c => (
                  <Bar key={c.name} label={c.name} value={c.value} total={cityTotal} max={cityMax} p={p} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  )
}
