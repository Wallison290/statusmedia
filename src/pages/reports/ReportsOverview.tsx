import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, ChevronRight, Building2 } from 'lucide-react'
import { useClients } from '@/hooks/useClients'
import { useReportsOverview } from '@/hooks/useReports'
import { useSubscription } from '@/hooks/useSubscription'
import type { ClientReport } from '@/types'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const CURRENT = new Date()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT.getFullYear() - i)

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

type OverviewReport = Pick<ClientReport, 'ig_synced_at' | 'analysis_text' | 'reach' | 'followers_end' | 'posts_published'>

// Colunas fixas: os números ficam sempre alinhados na vertical.
const COLS = 'md:grid md:grid-cols-[minmax(0,1fr)_120px_120px_96px_96px_72px_28px] md:items-center md:gap-x-4'

function Dot({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap" style={{ color: ok ? 'var(--sm-text-2)' : 'var(--sm-text-4)' }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ok ? '#22C55E' : 'var(--sm-border-alt)' }} />
      {ok ? yes : no}
    </span>
  )
}

// ── Linha de cliente ────────────────────────────────────────────────────────

function ClientReportRow({
  client, report, first, onClick,
}: {
  client: { id: string; company_name: string; logo_url: string | null; niche: string }
  report: OverviewReport | undefined
  first: boolean
  onClick: () => void
}) {
  const hasReport = !!report
  const num = (v: number | null | undefined, label: string) => (
    <span className="md:text-right tabular-nums">
      <span className="text-[13.5px] font-semibold" style={{ color: hasReport ? 'var(--sm-text-1)' : 'var(--sm-text-4)' }}>{hasReport ? fmt(v) : '—'}</span>
      <span className="md:hidden text-[11px] ml-1" style={{ color: 'var(--sm-text-4)' }}>{label}</span>
    </span>
  )

  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left px-4 md:px-5 py-3.5 group transition-colors hover:bg-black/[0.02] ${COLS} ${first ? '' : 'border-t'}`}
      style={{ borderColor: 'var(--sm-border)' }}
    >
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
        style={{ background: !hasReport ? 'transparent' : report?.analysis_text ? '#22C55E' : '#F59E0B' }} />

      <span className="flex items-center gap-3 min-w-0">
        {client.logo_url ? (
          <img src={client.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sm-bg-alt)' }}>
            <Building2 className="w-4 h-4" style={{ color: 'var(--sm-text-4)' }} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{client.company_name}</span>
          <span className="block text-[11.5px] truncate" style={{ color: 'var(--sm-text-4)' }}>
            {hasReport ? client.niche : 'Sem relatório neste mês · clique para criar'}
          </span>
        </span>
        <ChevronRight className="md:hidden w-4 h-4 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} />
      </span>

      {hasReport ? (
        <>
          <span className="max-md:hidden"><Dot ok={!!report?.ig_synced_at} yes="Sincronizado" no="Sem sync" /></span>
          <span className="max-md:hidden"><Dot ok={!!report?.analysis_text} yes="Análise pronta" no="Sem análise" /></span>
          <span className="max-md:flex max-md:flex-wrap max-md:gap-x-4 max-md:gap-y-1 max-md:mt-2 max-md:pl-12 md:contents">
            <span className="md:hidden"><Dot ok={!!report?.ig_synced_at} yes="Sincronizado" no="Sem sync" /></span>
            <span className="md:hidden"><Dot ok={!!report?.analysis_text} yes="Análise pronta" no="Sem análise" /></span>
            {num(report?.followers_end, 'seguidores')}
            {num(report?.reach, 'alcance')}
            {num(report?.posts_published, 'posts')}
          </span>
        </>
      ) : (
        <>
          <span className="max-md:hidden" /><span className="max-md:hidden" />
          <span className="max-md:hidden" /><span className="max-md:hidden" /><span className="max-md:hidden" />
        </>
      )}

      <ChevronRight className="max-md:hidden w-4 h-4 justify-self-end opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--sm-text-3)' }} />
    </button>
  )
}

// ── Página ────────────────────────────────────────────────────────────────

export function ReportsOverview() {
  const navigate = useNavigate()
  const { data: subData } = useSubscription()
  const { data: clients = [], isLoading: clientsLoading } = useClients()
  const [month, setMonth] = useState(CURRENT.getMonth() + 1)
  const [year, setYear]   = useState(CURRENT.getFullYear())
  const { data: reports = [], isLoading: reportsLoading } = useReportsOverview(month, year)

  const reportByClient = new Map(reports.map(r => [r.client_id, r]))
  const comRelatorio = clients.filter(c => reportByClient.has(c.id)).length
  const sincronizados = reports.filter(r => r.ig_synced_at).length
  const comAnalise = reports.filter(r => r.analysis_text).length

  // Quem tem relatório primeiro; o resto mantém a ordem da carteira.
  const ordenados = [...clients].sort((a, b) => Number(reportByClient.has(b.id)) - Number(reportByClient.has(a.id)))

  const selectCls = 'h-10 text-[13px] font-medium rounded-xl px-3 outline-none border cursor-pointer [color-scheme:light_dark]'
  const selectStyle = { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }

  if (!subData?.plan.hasReports) {
    return (
      <div className="min-h-full flex items-center justify-center p-6" style={{ background: 'var(--sm-bg-page)' }}>
        <div className="flex flex-col items-center text-center gap-3 max-w-sm">
          <BarChart3 className="w-7 h-7" style={{ color: 'var(--sm-text-4)' }} />
          <p className="font-display text-[20px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Relatórios no Pro e Agency</p>
          <p className="text-[13px]" style={{ color: 'var(--sm-text-3)' }}>Faça upgrade para acompanhar os relatórios de todos os seus clientes num só lugar.</p>
          <a href="/assinatura" className="h-10 px-4 inline-flex items-center rounded-xl text-white text-[13px] font-semibold hover:opacity-90 transition-opacity" style={{ background: 'var(--sm-primary)' }}>
            Ver planos
          </a>
        </div>
      </div>
    )
  }

  const loading = clientsLoading || reportsLoading

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <div className="max-w-6xl mx-auto p-4 md:p-6">

        {/* ── Cabeçalho (no celular, ao lado do menu) ── */}
        <header className="mb-6 max-md:pl-12 max-md:-mt-[3.25rem] flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Resultados</p>
            <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>
              Relatórios
            </h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
              Instagram, planejamento e análise por IA de cada cliente, mês a mês.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select value={month} onChange={e => setMonth(Number(e.target.value))} aria-label="Mês" className={selectCls} style={selectStyle}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Ano" className={selectCls} style={selectStyle}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </header>

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-[88px] rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
            <div className="h-[320px] rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
          </div>
        ) : clients.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed" style={{ borderColor: 'var(--sm-border)' }}>
            <Building2 className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--sm-text-4)' }} />
            <p className="text-[13.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Nenhum cliente cadastrado</p>
            <p className="text-[12.5px] mt-1" style={{ color: 'var(--sm-text-3)' }}>Cadastre um cliente para começar a gerar relatórios.</p>
          </div>
        ) : (
          <>
            {/* ── Resumo do mês em uma faixa ── */}
            <div className="rounded-2xl border grid grid-cols-3 overflow-hidden mb-6" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
              {[
                { label: `Relatórios de ${MONTHS[month - 1].toLowerCase()}`, value: comRelatorio, of: clients.length },
                { label: 'Sincronizados com o Instagram', value: sincronizados, of: comRelatorio },
                { label: 'Com análise pronta', value: comAnalise, of: comRelatorio },
              ].map((k, i) => (
                <div key={k.label} className={`px-4 md:px-5 py-4 ${i > 0 ? 'border-l' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                  <p className="text-[10px] md:text-[10.5px] font-semibold uppercase tracking-[0.08em] leading-tight" style={{ color: 'var(--sm-text-4)' }}>{k.label}</p>
                  <p className="font-display text-[22px] md:text-[26px] font-bold leading-tight mt-1 tabular-nums" style={{ color: 'var(--sm-text-1)' }}>
                    {k.value}<span className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-4)' }}> / {k.of}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* ── Lista de clientes ── */}
            <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
              <div className={`max-md:hidden px-5 py-2.5 border-b text-[10.5px] font-semibold uppercase tracking-[0.08em] ${COLS}`}
                style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-4)', background: 'var(--sm-bg-alt)' }}>
                <span>Cliente</span>
                <span>Instagram</span>
                <span>Análise</span>
                <span className="text-right">Seguidores</span>
                <span className="text-right">Alcance</span>
                <span className="text-right">Posts</span>
                <span />
              </div>
              {ordenados.map((client, i) => (
                <ClientReportRow
                  key={client.id}
                  client={client}
                  report={reportByClient.get(client.id)}
                  first={i === 0}
                  onClick={() => navigate(`/reports/${client.id}?month=${month}&year=${year}`)}
                />
              ))}
            </div>
            <p className="text-[11.5px] mt-2.5 flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--sm-text-4)' }}>
              <span className="inline-flex items-center gap-1.5"><span className="w-[3px] h-3 rounded" style={{ background: '#22C55E' }} /> relatório com análise</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-[3px] h-3 rounded" style={{ background: '#F59E0B' }} /> falta a análise</span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
