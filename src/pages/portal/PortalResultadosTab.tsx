import { useState } from 'react'
import {
  TrendingUp, Users, Eye, Heart, BarChart3,
  DollarSign, BookOpen, FileText, Link2, File, ExternalLink, ImageIcon, Instagram, Calendar,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { usePortalReports } from '@/hooks/usePortal'
import { usePlanningReport } from '@/hooks/usePlanningReport'
import { IgInsights } from '@/components/reports/IgInsights'
import { contentTypeLabels, statusLabels } from '@/utils/formatters'
import type { ClientReport, ReportAttachment } from '@/types'
import { PortalEmpty, PortalFilterChip, portalEyebrow } from '@/components/portal/PortalUI'

// ─── Config ───────────────────────────────────────────────────────────────────

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function monthLabel(month: number, year: number) {
  return `${MONTHS[month - 1]} ${year}`
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtBRL(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(n)
}

function followerDiff(r: ClientReport): string {
  if (r.followers_start == null || r.followers_end == null) return fmt(r.followers_end)
  const diff = r.followers_end - r.followers_start
  return diff >= 0 ? `+${fmt(diff)}` : fmt(diff)
}

function hasPaid(r: ClientReport) {
  return r.paid_investment != null || r.paid_leads != null || r.paid_cpl != null
    || r.paid_conversions != null || r.paid_roas != null
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent: string
}) {
  return (
    <div className="bg-white p-5 sm:p-6 flex flex-col">
      <p className="flex items-center gap-2 text-[12px] text-[#5B6576] [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-[#8A94A6]">{icon}{label}</p>
      <p className="font-display font-bold text-[#0F172A] tabular-nums leading-none tracking-[-0.045em] mt-4" style={{ fontSize: 'clamp(30px, 3.6vw, 44px)' }}>{value}</p>
      {sub && <p className="text-[11.5px] text-[#8A94A6] mt-2.5">{sub}</p>}
    </div>
  )
}

// ─── Attachment item (read-only) ──────────────────────────────────────────────

function AttachmentItem({ att }: { att: ReportAttachment }) {
  const [imgOpen, setImgOpen] = useState(false)
  const isImg = att.type === 'imagem'

  return (
    <>
      <div
        onClick={() => isImg && setImgOpen(true)}
        className={`group flex items-center gap-3 p-3 rounded-2xl border border-[#E4E7EC] bg-white transition-all duration-300 ${isImg ? 'cursor-pointer hover:border-[#0F172A]/30' : ''}`}
      >
        <div className="w-11 h-11 rounded-xl bg-[#F6F7F9] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {isImg && att.file_url
            ? <img src={att.file_url} alt={att.title} className="w-full h-full object-cover" />
            : att.type === 'pdf' ? <FileText className="w-4 h-4 text-red-400" />
            : att.type === 'link' ? <Link2 className="w-4 h-4 text-sky-400" />
            : <File className="w-4 h-4 text-gray-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-[#0f0f0f] truncate">{att.title}</p>
          {att.description && <p className="text-[10px] text-gray-500 truncate mt-0.5">{att.description}</p>}
          <p className="text-[10px] text-gray-600 mt-0.5 uppercase tracking-wide">
            {att.type === 'imagem' ? 'Imagem' : att.type === 'pdf' ? 'PDF' : 'Link'}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {att.type === 'link' && att.link_url && (
            <a href={att.link_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-[#0f0f0f] hover:bg-[#f0f0f0] transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {att.file_url && att.type !== 'link' && (
            <a href={att.file_url} download target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-[#0f0f0f] hover:bg-[#f0f0f0] transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {isImg && imgOpen && att.file_url && (
        <Dialog open={imgOpen} onOpenChange={setImgOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle className="truncate">{att.title}</DialogTitle></DialogHeader>
            <img src={att.file_url} alt={att.title} className="w-full rounded-xl" />
            <DialogFooter>
              <a href={att.file_url} download target="_blank" rel="noopener noreferrer">
                <Button size="sm"><ExternalLink className="w-3.5 h-3.5" /> Baixar</Button>
              </a>
              <Button variant="outline" size="sm" onClick={() => setImgOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// ─── Planejamento do mês (somente leitura) ───────────────────────────────────

function PlanningBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-[#5B6576] w-24 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[#EEF0F3] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#0F172A' }} />
      </div>
      <span className="text-[12px] font-semibold tabular-nums text-[#0F172A] w-6 text-right flex-shrink-0">{count}</span>
    </div>
  )
}

function PlanningSection({ clientId, month, year }: { clientId: string; month: number; year: number }) {
  const { data: planning } = usePlanningReport({ clientId, month, year, clientVisibleOnly: true })
  if (!planning || planning.total === 0) return null

  return (
    <section className="rounded-[22px] border border-[#E4E7EC] bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEF0F3] flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-gray-500" />
        <p className="text-[13px] font-semibold text-[#0F172A]">Planejamento do mês</p>
      </div>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-[10.5px] font-semibold text-[#8A94A6] uppercase tracking-[0.16em]">Por status</p>
            {Object.entries(planning.byStatus).map(([status, count]) => (
              <PlanningBar key={status} label={statusLabels[status] ?? status} count={count} total={planning.total} />
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[10.5px] font-semibold text-[#8A94A6] uppercase tracking-[0.16em]">Por tipo de conteúdo</p>
            {Object.entries(planning.byContentType).map(([type, count]) => (
              <PlanningBar key={type} label={contentTypeLabels[type] ?? type} count={count} total={planning.total} />
            ))}
          </div>
        </div>

        {planning.published.length > 0 && (
          <div>
            <p className="text-[10.5px] font-semibold text-[#8A94A6] uppercase tracking-[0.16em] mb-2">Publicados no mês</p>
            <div className="space-y-1">
              {planning.published.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-[#EEF0F3] last:border-b-0">
                  <span className="text-[13px] text-[#0F172A] truncate">{item.title}</span>
                  <span className="text-[11px] text-[#8A94A6] flex-shrink-0">{contentTypeLabels[item.content_type] ?? item.content_type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Report view (client read-only) ──────────────────────────────────────────

function ReportView({ report }: { report: ClientReport }) {
  const atts = report.attachments ?? []

  return (
    <div className="space-y-6">

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#E4E7EC] border border-[#E4E7EC] rounded-[22px] overflow-hidden">
        <MetricCard icon={<Users className="w-4 h-4 text-green-400" />}
          label="Crescimento de seguidores" value={followerDiff(report)}
          sub={report.followers_end != null ? `${fmt(report.followers_end)} total` : undefined}
          accent="border-green-500/20 bg-green-500/[0.05]" />
        <MetricCard icon={<Eye className="w-4 h-4 text-blue-400" />}
          label="Alcance" value={fmt(report.reach)}
          accent="border-blue-500/20 bg-blue-500/[0.05]" />
        <MetricCard icon={<Heart className="w-4 h-4 text-pink-400" />}
          label="Engajamento" value={report.engagement != null ? `${report.engagement}%` : '—'}
          accent="border-pink-500/20 bg-pink-500/[0.05]" />
        <MetricCard icon={<BarChart3 className="w-4 h-4 text-purple-400" />}
          label="Publicados" value={report.posts_published != null ? String(report.posts_published) : '—'}
          sub="conteúdos no mês" accent="border-purple-500/20 bg-purple-500/[0.05]" />
      </div>

      {/* Social metrics */}
      <section className="rounded-[22px] border border-[#E4E7EC] bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEF0F3] flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-gray-500" />
          <p className="text-[13px] font-semibold text-[#0F172A]">Redes sociais</p>
        </div>
        <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-7">
          {([
            ['Seguidores (início)', fmt(report.followers_start)],
            ['Seguidores (fim)', fmt(report.followers_end)],
            ['Alcance', fmt(report.reach)],
            ['Engajamento', report.engagement != null ? `${report.engagement}%` : '—'],
            ['Impressões', fmt(report.impressions)],
            ['Posts publicados', fmt(report.posts_published)],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label}>
              <p className="text-[10.5px] font-semibold text-[#8A94A6] uppercase tracking-[0.16em] mb-2">{label}</p>
              <p className="font-display text-[24px] font-bold tabular-nums tracking-[-0.03em] text-[#0F172A]">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Insights ricos do Instagram (visitas, interações, top posts, audiência) */}
      <IgInsights report={report} />

      {/* Execução do planejamento do mês */}
      <PlanningSection clientId={report.client_id} month={report.month} year={report.year} />

      {/* Paid traffic — only if has data */}
      {hasPaid(report) && (
        <section className="rounded-[22px] border border-[#E4E7EC] bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-[#EEF0F3] flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-gray-500" />
            <p className="text-[13px] font-semibold text-[#0F172A]">Tráfego pago</p>
          </div>
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-7">
            {([
              ['Investimento', fmtBRL(report.paid_investment)],
              ['Leads', fmt(report.paid_leads)],
              ['CPL', fmtBRL(report.paid_cpl)],
              ['Conversões', fmt(report.paid_conversions)],
              ['ROAS', report.paid_roas != null ? `${report.paid_roas}x` : '—'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label}>
                <p className="text-[10.5px] font-semibold text-[#8A94A6] uppercase tracking-[0.16em] mb-2">{label}</p>
                <p className="font-display text-[24px] font-bold tabular-nums tracking-[-0.03em] text-[#0F172A]">{value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Analysis */}
      {report.analysis_text && (
        <section className="rounded-[22px] border border-[#E4E7EC] bg-white p-6 sm:p-9">
          <p className={`${portalEyebrow} flex items-center gap-2`}>
            <BookOpen className="w-3.5 h-3.5 text-[#2563EB]" /> Leitura da agência
          </p>
          <p className="mt-5 pl-5 border-l-2 border-[#2563EB] font-display text-[18px] sm:text-[21px] leading-[1.45] tracking-[-0.015em] text-[#0F172A] whitespace-pre-wrap">
            {report.analysis_text}
          </p>
        </section>
      )}

      {/* Attachments */}
      {atts.length > 0 && (
        <section className="rounded-[22px] border border-[#E4E7EC] bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-[#EEF0F3]">
            <ImageIcon className="w-3.5 h-3.5 text-gray-500" />
            <p className="text-[13px] font-semibold text-[#0F172A]">Anexos</p>
            <span className="text-[11px] text-gray-600">{atts.length}</span>
          </div>
          <div className="p-5 space-y-2">
            {atts.map(att => <AttachmentItem key={att.id} att={att} />)}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Main Portal Tab ──────────────────────────────────────────────────────────

export function PortalResultadosTab() {
  const { data: reports = [], isLoading } = usePortalReports()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const typedReports = reports as ClientReport[]

  // Auto-select latest
  const selected = selectedId
    ? typedReports.find(r => r.id === selectedId) ?? typedReports[0] ?? null
    : typedReports[0] ?? null

  if (isLoading) {
    return <div className="py-12 text-center text-[12.5px] text-[#8A94A6]">Carregando resultados...</div>
  }

  if (typedReports.length === 0) {
    return (
      <PortalEmpty title="Nenhum relatório ainda" text="Quando a agência publicar os resultados do mês, eles aparecem aqui." />
    )
  }

  return (
    <div className="space-y-5">

      {/* Month selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {typedReports.map(r => (
          <PortalFilterChip
            key={r.id}
            active={r.id === selected?.id}
            label={monthLabel(r.month, r.year)}
            onClick={() => setSelectedId(r.id)}
          />
        ))}
      </div>

      {selected && (
        <>
          <div className="pt-4 pb-1">
            <h3 className="font-display font-bold text-[#0F172A] leading-none tracking-[-0.035em]" style={{ fontSize: 'clamp(26px, 3.2vw, 38px)' }}>
              {MONTHS[selected.month - 1]} <span className="text-[#A0A8B5] font-semibold">{selected.year}</span>
            </h3>
            {selected.ig_synced_at ? (
              <p className="text-[12px] text-[#15803D] mt-2.5 flex items-center gap-1.5">
                <Instagram className="w-3 h-3" />
                Sincronizado com o Instagram em {new Date(selected.ig_synced_at).toLocaleDateString('pt-BR')}
              </p>
            ) : (
              <p className="text-[12px] text-[#8A94A6] mt-2.5">Relatório de performance</p>
            )}
          </div>
          <ReportView key={selected.id} report={selected} />
        </>
      )}
    </div>
  )
}
