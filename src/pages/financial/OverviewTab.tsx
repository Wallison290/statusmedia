import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts'
import { AlertTriangle, FileSignature, Wallet } from 'lucide-react'
import {
  useFinAccounts, useFinOpenUntil, useFinEntries, useContractsAwaitingBilling,
  todayISO, monthStartISO, addMonthsISO, fmtBRL, fmtDateBR, daysBetween,
} from '@/hooks/useFinance'
import { Card, SectionTitle, EmptyState, KpiTile, TabSkeleton } from './finUi'

const HORIZON = 90

export function OverviewTab({ goTo }: { goTo: (tab: string) => void }) {
  const today = todayISO()
  const horizonISO = addMonthsISO(today, 3)
  const in30 = addMonthsISO(today, 1)
  const month = monthStartISO(today)
  const monthEndISO = (() => {
    const d = new Date(new Date(addMonthsISO(month, 1, 1) + 'T00:00:00').getTime() - 86_400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  // Só desenha com tudo carregado: antes a tela aparecia zerada (saldo R$ 0,00,
  // gráfico reto) e pulava para os valores reais um instante depois.
  const { data: accounts = [], isLoading: l1 } = useFinAccounts()
  const { data: open = [], isLoading: l2 } = useFinOpenUntil(horizonISO)
  const { data: monthEntries = [], isLoading: l3 } = useFinEntries(month, monthEndISO)
  const { data: awaiting = [] } = useContractsAwaitingBilling()
  const loading = l1 || l2 || l3

  const balance = accounts.filter(a => a.is_active).reduce((s, a) => s + a.balance, 0)

  const k = useMemo(() => {
    let rec30 = 0, pay30 = 0, overdueRec = 0, overduePay = 0, overdueCount = 0
    for (const e of open) {
      if (e.due_date < today) {
        if (e.type === 'receita') { overdueRec += e.amount; overdueCount++ } else overduePay += e.amount
      } else if (e.due_date <= in30) {
        if (e.type === 'receita') rec30 += e.amount; else pay30 += e.amount
      }
    }
    let recMonth = 0, payMonth = 0
    for (const e of monthEntries) {
      if (e.status !== 'pago' || !e.paid_at || e.paid_at < month || e.paid_at > monthEndISO) continue
      if (e.type === 'receita') recMonth += e.paid_amount ?? e.amount; else payMonth += e.paid_amount ?? e.amount
    }
    return { rec30, pay30, overdueRec, overduePay, overdueCount, recMonth, payMonth, result: recMonth - payMonth }
  }, [open, monthEntries, today, in30, month, monthEndISO])

  // Saldo previsto dia a dia: saldo de hoje + o que vence (atrasados ficam de
  // fora: não dá para contar com eles numa data)
  const series = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const e of open) {
      if (e.due_date < today) continue
      byDay.set(e.due_date, (byDay.get(e.due_date) ?? 0) + (e.type === 'receita' ? e.amount : -e.amount))
    }
    const out: { date: string; saldo: number }[] = []
    let running = balance
    const start = new Date(today + 'T00:00:00')
    for (let i = 0; i <= HORIZON; i++) {
      const d = new Date(start.getTime() + i * 86_400_000)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      running += byDay.get(iso) ?? 0
      out.push({ date: iso, saldo: Math.round(running * 100) / 100 })
    }
    return out
  }, [open, balance, today])

  const minPoint = series.reduce((m, p) => (p.saldo < m.saldo ? p : m), series[0] ?? { date: today, saldo: 0 })
  const endPoint = series[series.length - 1]
  const upcoming = open.filter(e => e.due_date >= today && daysBetween(today, e.due_date) <= 7)

  if (loading) return <TabSkeleton kpis={5} blocks={[300, 200]} />

  return (
    <div className="space-y-6">
      {awaiting.length > 0 && (
        <button onClick={() => goTo('recorrencias')}
          className="w-full text-left rounded-2xl border px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
          style={{ borderColor: 'rgba(37,99,235,0.4)', background: 'rgba(37,99,235,0.08)' }}>
          <FileSignature className="w-5 h-5 flex-shrink-0" style={{ color: '#60A5FA' }} />
          <span className="text-[13px] flex-1" style={{ color: 'var(--sm-text-1)' }}>
            <strong>{awaiting.length} contrato{awaiting.length > 1 ? 's' : ''} assinado{awaiting.length > 1 ? 's' : ''}</strong> no CRM
            {awaiting.length > 1 ? ' ainda não geraram' : ' ainda não gerou'} cobrança.
          </span>
          <span className="text-[12.5px] font-semibold" style={{ color: '#60A5FA' }}>Gerar cobrança →</span>
        </button>
      )}

      {/* Números */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiTile label="Saldo em contas" value={fmtBRL(balance)} sub={`${accounts.filter(a => a.is_active).length} conta(s)`} />
        <KpiTile label="A receber em 30 dias" value={fmtBRL(k.rec30)} sub="vencimentos futuros" />
        <KpiTile label="A pagar em 30 dias" value={fmtBRL(k.pay30)} sub="vencimentos futuros" />
        <KpiTile label="Resultado do mês" value={fmtBRL(k.result)}
          sub={`${fmtBRL(k.recMonth)} entrou · ${fmtBRL(k.payMonth)} saiu`} tone={k.result < 0 ? 'bad' : undefined} />
        <KpiTile label="Em atraso" value={fmtBRL(k.overdueRec)} sub={`${k.overdueCount} recebimento(s) vencido(s)`}
          tone={k.overdueRec > 0 ? 'warn' : undefined} onClick={k.overdueRec > 0 ? () => goTo('inadimplencia') : undefined} />
      </div>

      {/* Fluxo de caixa */}
      <section>
        <SectionTitle n="01" title="Saldo previsto · próximos 90 dias" />
        <Card className="p-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3 text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>
            <span>Hoje: <strong style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(balance)}</strong></span>
            <span>Em 90 dias: <strong style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(endPoint?.saldo ?? balance)}</strong></span>
            <span className="inline-flex items-center gap-1">
              {minPoint.saldo < 0 && <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />}
              Menor saldo: <strong style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(minPoint.saldo)}</strong> em {fmtDateBR(minPoint.date)}
            </span>
          </div>
          <div className="h-[220px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="finFlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--sm-border)" strokeDasharray="0" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28}
                  tick={{ fill: 'var(--sm-text-4)', fontSize: 11 }}
                  tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} />
                <YAxis tickLine={false} axisLine={false} width={64}
                  tick={{ fill: 'var(--sm-text-4)', fontSize: 11 }}
                  tickFormatter={(v: number) => Math.abs(v) >= 1000 ? `R$${Math.round(v / 1000)}k` : `R$${v}`} />
                {minPoint.saldo < 0 && <ReferenceLine y={0} stroke="var(--sm-text-4)" strokeDasharray="4 4" />}
                <Tooltip
                  cursor={{ stroke: 'var(--sm-text-4)', strokeWidth: 1 }}
                  content={({ active, payload }) => active && payload?.[0] ? (
                    <div className="rounded-lg border px-3 py-2 text-[12px] shadow-lg"
                      style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                      <p>{fmtDateBR(payload[0].payload.date)}</p>
                      <p className="font-semibold" style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(payload[0].payload.saldo)}</p>
                    </div>
                  ) : null}
                />
                <Area isAnimationActive={false} type="stepAfter" dataKey="saldo" stroke="#3B82F6" strokeWidth={2} fill="url(#finFlow)"
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--sm-bg-card)' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11.5px] mt-2" style={{ color: 'var(--sm-text-4)' }}>
            Saldo de hoje somado ao que vence em cada dia. Recebimentos já atrasados não entram na previsão.
          </p>
        </Card>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <SectionTitle n="02" title="Saldo por conta" right={
            <button onClick={() => goTo('configuracoes')} className="text-[12px] font-semibold" style={{ color: '#60A5FA' }}>Gerenciar</button>
          } />
          <Card>
            {accounts.filter(a => a.is_active).map((a, i) => (
              <div key={a.id} className={`px-4 py-3 flex items-center gap-3 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                <Wallet className="w-4 h-4" style={{ color: 'var(--sm-text-4)' }} />
                <span className="flex-1 text-[13px]" style={{ color: 'var(--sm-text-1)' }}>{a.name}</span>
                <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(a.balance)}</span>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <SectionTitle n="03" title="Próximos 7 dias" right={
            <button onClick={() => goTo('lancamentos')} className="text-[12px] font-semibold" style={{ color: '#60A5FA' }}>Ver lançamentos</button>
          } />
          <Card>
            {upcoming.length === 0 ? (
              <EmptyState title="Nada vence nos próximos 7 dias" />
            ) : upcoming.slice(0, 8).map((e, i) => (
              <div key={e.id} className={`px-4 py-2.5 flex items-center gap-3 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                <span className="text-[12px] w-12 tabular-nums" style={{ color: 'var(--sm-text-3)' }}>{e.due_date.slice(8, 10)}/{e.due_date.slice(5, 7)}</span>
                <span className="flex-1 min-w-0 text-[13px] truncate" style={{ color: 'var(--sm-text-1)' }}>
                  {e.description}
                  <span className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}> · {e.type === 'receita' ? 'receber' : 'pagar'}</span>
                </span>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: e.type === 'receita' ? 'var(--sm-text-1)' : 'var(--sm-text-2)' }}>
                  {e.type === 'despesa' ? '− ' : ''}{fmtBRL(e.amount)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      </div>
    </div>
  )
}
