// ── CRM › Relatórios ─────────────────────────────────────────────────────────
// As perguntas que o board sozinho não responde: quanto fechei no período,
// de cada 10 leads quantos viram cliente, quanto tempo leva, onde perco,
// qual origem traz lead bom e como está a meta do mês.
//
// Tudo calculado aqui a partir dos leads (arquivados inclusive: quem fechou e
// foi arquivado continua contando) e das movimentações de etapa do histórico.

import { useMemo, useState } from 'react'
import { Loader2, Target, Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useCrmColumns, useCrmLeads, useUpdateCrmColumn } from '@/hooks/useCrm'
import { useCrmStageMoves } from '@/hooks/useCrmActivities'
import { useCrmSettings, useUpdateCrmSettings } from '@/hooks/useCrmSettings'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import { CrmHeader } from '@/components/crm/CrmHeader'
import type { CrmLead } from '@/types'
import { useMoney } from '@/hooks/useHideValues'
import { netValue } from '@/utils/crm'
import { useFollowupMessages, FOLLOWUP_STEPS } from '@/hooks/useCrmFollowup'

type Period = 'mes' | 'mes_passado' | '90d' | 'ano'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'mes',         label: 'Este mês' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: '90d',         label: 'Últimos 90 dias' },
  { id: 'ano',         label: 'Este ano' },
]

// Uma cor só para magnitude; o texto usa as cores de texto do tema
const BAR = '#4F8EF7'

function range(p: Period): [Date, Date] {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  switch (p) {
    case 'mes':         return [new Date(y, m, 1), new Date(y, m + 1, 1)]
    case 'mes_passado': return [new Date(y, m - 1, 1), new Date(y, m, 1)]
    case '90d':         return [new Date(now.getTime() - 90 * 86_400_000), new Date(now.getTime() + 86_400_000)]
    case 'ano':         return [new Date(y, 0, 1), new Date(y + 1, 0, 1)]
  }
}

const inRange = (iso: string | null, [a, b]: [Date, Date]) => {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= a.getTime() && t < b.getTime()
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null)

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--sm-text-3)' }}>{label}</p>
      <p className="text-[24px] font-bold mt-0.5 leading-tight" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
      {sub && <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--sm-text-4)' }}>{sub}</p>}
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <h2 className="text-[13.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{title}</h2>
      {hint && <p className="text-[11.5px] mb-3" style={{ color: 'var(--sm-text-4)' }}>{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

/** Barras horizontais: rótulo e valor em texto, barra fina com ponta arredondada. */
function Bars({ rows, format }: { rows: { label: string; value: number; note?: string }[]; format: (n: number) => string }) {
  const max = Math.max(...rows.map(r => r.value), 0)
  if (rows.length === 0 || max === 0) {
    return <p className="text-[12px] py-4 text-center" style={{ color: 'var(--sm-text-4)' }}>Sem dados no período.</p>
  }
  return (
    <ul className="space-y-2.5">
      {rows.map(r => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}${r.note ? ` · ${r.note}` : ''}`}>
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="truncate" style={{ color: 'var(--sm-text-2)' }}>{r.label}</span>
            <span className="whitespace-nowrap font-medium" style={{ color: 'var(--sm-text-1)' }}>
              {format(r.value)}{r.note && <span className="font-normal" style={{ color: 'var(--sm-text-4)' }}> · {r.note}</span>}
            </span>
          </div>
          <div className="h-2 mt-1 rounded-full" style={{ background: 'var(--sm-bg-alt)' }}>
            <div className="h-2 rounded-full" style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, background: BAR }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function GoalBar({ label, current, goal, format }: { label: string; current: number; goal: number; format: (n: number) => string }) {
  const p = Math.min(Math.round((current / goal) * 100), 100)
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span style={{ color: 'var(--sm-text-2)' }}>{label}</span>
        <span style={{ color: 'var(--sm-text-1)' }}>
          <strong>{format(current)}</strong> <span style={{ color: 'var(--sm-text-4)' }}>de {format(goal)} ({Math.round((current / goal) * 100)}%)</span>
        </span>
      </div>
      <div className="h-2.5 mt-1 rounded-full" style={{ background: 'var(--sm-bg-alt)' }}>
        <div className="h-2.5 rounded-full transition-all" style={{ width: `${Math.max(p, 2)}%`, background: p >= 100 ? '#22C55E' : BAR }} />
      </div>
    </div>
  )
}

export function CrmReports() {
  const money = useMoney()
  const { toast } = useToast()
  const [period, setPeriod] = useState<Period>('mes')
  const { data: columns = [] } = useCrmColumns()
  const { data: leads = [], isLoading } = useCrmLeads()
  const { data: members = [] } = useTeamMembers()
  const { data: settings } = useCrmSettings()
  const updateSettings = useUpdateCrmSettings()

  const r = range(period)
  // Histórico desde o início do período mais longo possível (ano ou 90 dias)
  const since = useMemo(() => {
    const y = new Date(new Date().getFullYear(), 0, 1)
    const d90 = new Date(Date.now() - 90 * 86_400_000)
    return (y < d90 ? y : d90).toISOString()
  }, [])
  const { data: moves = [] } = useCrmStageMoves(since)
  const { data: fupMsgs = [] } = useFollowupMessages(since)
  const updateColumn = useUpdateCrmColumn()

  // Previsão de vendas: valor em aberto de cada etapa x chance de fechar.
  // Etapa sem chance definida: sugerida pela posição (10% na primeira, 80% na última).
  const forecast = useMemo(() => {
    // Etapas de descarte ("Sem interesse") ficam fora: ali não há venda a prever
    const discard = /sem\s*interesse|desisti|descartad|perdid|desqualificad/i
    const open = [...columns]
      .filter(c => c.stage_type === 'normal' && !discard.test(c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
      .sort((a, b) => a.position - b.position)
    const rows = open.map((c, i) => {
      const suggested = open.length > 1 ? Math.round(10 + (70 * i) / (open.length - 1)) : 50
      const prob = c.win_probability ?? suggested
      const ls = leads.filter(l => !l.archived_at && l.column_id === c.id)
      const value = ls.reduce((s, l) => s + (l.estimated_value ?? 0), 0)
      return { col: c, prob, custom: c.win_probability != null, count: ls.length, value, weighted: (value * prob) / 100 }
    })
    return { rows, total: rows.reduce((s, x) => s + x.weighted, 0) }
  }, [columns, leads])

  // Follow-up automático: quantos respondem a cada degrau e quanto vendeu
  const fup = useMemo(() => {
    const [from, to] = [r[0].getTime(), r[1].getTime()]
    const byLead = new Map<string, typeof fupMsgs>()
    for (const m of fupMsgs) {
      if (!byLead.has(m.lead_id)) byLead.set(m.lead_id, [])
      byLead.get(m.lead_id)!.push(m)
    }
    const steps = new Map<number, { sent: number; replied: number }>(FOLLOWUP_STEPS.map(s => [s, { sent: 0, replied: 0 }]))
    for (const list of byLead.values()) {
      list.forEach((m, i) => {
        if (m.source !== 'followup' || !m.followup_step) return
        const t = new Date(m.sent_at).getTime()
        if (t < from || t > to) return
        const e = steps.get(m.followup_step); if (!e) return
        e.sent++
        // Respondeu: mensagem do lead depois deste follow-up e antes do próximo (até 7 dias)
        for (const n of list.slice(i + 1)) {
          if (n.source === 'followup') break
          if (n.direction === 'in' && new Date(n.sent_at).getTime() - t <= 7 * 86_400_000) { e.replied++; break }
        }
      })
    }
    // Vendas com follow-up: ganhos no período que receberam follow-up antes de fechar
    const wonStage = new Set(columns.filter(c => c.stage_type === 'ganho').map(c => c.id))
    const won = leads.filter(l => wonStage.has(l.column_id) && l.closed_at
      && new Date(l.closed_at).getTime() >= from && new Date(l.closed_at).getTime() <= to
      && (byLead.get(l.id) ?? []).some(m => m.source === 'followup' && m.sent_at < l.closed_at!))
    return {
      rows: FOLLOWUP_STEPS.map(s => {
        const e = steps.get(s)!
        return { label: `${s} dia${s > 1 ? 's' : ''}`, value: e.sent ? Math.round((e.replied / e.sent) * 100) : 0, note: `${e.replied} de ${e.sent}` }
      }),
      sent: [...steps.values()].reduce((a, e) => a + e.sent, 0),
      wonCount: won.length,
      wonValue: won.reduce((a, l) => a + (l.estimated_value ?? 0), 0),
    }
  }, [fupMsgs, leads, columns, r[0].getTime(), r[1].getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  const [editGoal, setEditGoal] = useState(false)
  const [goalValue, setGoalValue] = useState('')
  const [goalDeals, setGoalDeals] = useState('')

  const report = useMemo(() => {
    const stage = new Map(columns.map(c => [c.id, c.stage_type]))
    const isWon  = (l: CrmLead) => stage.get(l.column_id) === 'ganho'
    const isLost = (l: CrmLead) => stage.get(l.column_id) === 'perdido'

    const created = leads.filter(l => inRange(l.created_at, r))
    const won     = leads.filter(l => isWon(l) && inRange(l.closed_at, r))
    const lost    = leads.filter(l => isLost(l) && inRange(l.closed_at, r))
    const wonValue = won.reduce((s, l) => s + (l.estimated_value ?? 0), 0)

    const open = leads.filter(l => !l.archived_at && stage.get(l.column_id) === 'normal')
    const cycleDays = won
      .filter(l => l.closed_at)
      .map(l => (new Date(l.closed_at!).getTime() - new Date(l.created_at).getTime()) / 86_400_000)

    // Funil atual (etapas do meio + terminais), leads ativos
    const funnel = columns.map(c => {
      const ls = leads.filter(l => !l.archived_at && l.column_id === c.id)
      return { label: c.name, value: ls.length, note: ls.reduce((s, l) => s + (l.estimated_value ?? 0), 0) ? money(ls.reduce((s, l) => s + (l.estimated_value ?? 0), 0)) : undefined }
    })

    // Tempo médio que o lead passa em cada etapa, pelas saídas registradas no período
    const hours = new Map<string, number[]>()
    for (const m of moves) {
      if (!inRange(m.created_at, r)) continue
      const from = m.meta?.from as string | undefined
      const h = Number(m.meta?.hours_in_stage)
      if (!from || !Number.isFinite(h)) continue
      hours.set(from, [...(hours.get(from) ?? []), h])
    }
    const timeInStage = columns
      .filter(c => c.stage_type === 'normal' && hours.has(c.id))
      .map(c => {
        const hs = hours.get(c.id)!
        return { label: c.name, value: hs.reduce((s, x) => s + x, 0) / hs.length / 24, note: `${hs.length} saída(s)` }
      })

    const reasons = new Map<string, number>()
    for (const l of lost) {
      const k = l.lost_reason?.trim() || 'Sem motivo informado'
      reasons.set(k, (reasons.get(k) ?? 0) + 1)
    }

    // Origem: leads criados no período e quantos desses já fecharam
    const bySource = new Map<string, { total: number; won: number; value: number }>()
    for (const l of created) {
      const k = l.source?.trim() || 'Não informada'
      const e = bySource.get(k) ?? { total: 0, won: 0, value: 0 }
      e.total++
      if (isWon(l)) { e.won++; e.value += l.estimated_value ?? 0 }
      bySource.set(k, e)
    }

    const memberName = new Map(members.map(m => [m.id, m.name]))
    const byMember = new Map<string, { won: number; value: number; lost: number }>()
    for (const l of [...won, ...lost]) {
      const k = memberName.get(l.responsible_user_id ?? '') ?? 'Sem responsável'
      const e = byMember.get(k) ?? { won: 0, value: 0, lost: 0 }
      if (isWon(l)) { e.won++; e.value += l.estimated_value ?? 0 } else e.lost++
      byMember.set(k, e)
    }

    return {
      created: created.length,
      won: won.length,
      wonValue,
      wonNet: won.reduce((s, l) => s + netValue(l), 0),
      lost: lost.length,
      conversion: pct(won.length, won.length + lost.length),
      ticket: won.length ? wonValue / won.length : null,
      cycle: cycleDays.length ? Math.round(cycleDays.reduce((s, x) => s + x, 0) / cycleDays.length) : null,
      openCount: open.length,
      openValue: open.reduce((s, l) => s + (l.estimated_value ?? 0), 0),
      funnel,
      timeInStage,
      reasons: [...reasons.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      sources: [...bySource.entries()].map(([k, v]) => ({ source: k, ...v })).sort((a, b) => b.total - a.total),
      members: [...byMember.entries()].map(([k, v]) => ({ name: k, ...v })).sort((a, b) => b.value - a.value),
    }
  }, [leads, columns, moves, members, r[0].getTime(), r[1].getTime(), money]) // eslint-disable-line react-hooks/exhaustive-deps

  // Meta é sempre do mês corrente, independente do período escolhido
  const month = useMemo(() => {
    const mr = range('mes')
    const stage = new Map(columns.map(c => [c.id, c.stage_type]))
    const won = leads.filter(l => stage.get(l.column_id) === 'ganho' && inRange(l.closed_at, mr))
    return { deals: won.length, value: won.reduce((s, l) => s + (l.estimated_value ?? 0), 0) }
  }, [leads, columns])

  async function saveGoals() {
    try {
      await updateSettings.mutateAsync({
        goal_monthly_value: goalValue ? Number(goalValue) : null,
        goal_monthly_deals: goalDeals ? Number(goalDeals) : null,
      })
      setEditGoal(false)
      toast('Meta atualizada', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar a meta', 'error')
    }
  }

  const hasGoal = !!(settings?.goal_monthly_value || settings?.goal_monthly_deals)

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--sm-bg-page)' }}>
      <CrmHeader subtitle="Conversão, metas e onde o funil está vazando" />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Meta do mês */}
        <section className="rounded-xl border p-4" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
              <Target className="w-4 h-4" style={{ color: '#22C55E' }} /> Meta do mês
            </h2>
            {!editGoal && (
              <Button size="sm" variant="ghost" onClick={() => {
                setGoalValue(settings?.goal_monthly_value?.toString() ?? '')
                setGoalDeals(settings?.goal_monthly_deals?.toString() ?? '')
                setEditGoal(true)
              }}>
                <Pencil className="w-3 h-3" /> {hasGoal ? 'Editar' : 'Definir meta'}
              </Button>
            )}
          </div>
          {editGoal ? (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'var(--sm-text-3)' }}>Valor fechado no mês (R$)</p>
                <Input type="number" min={0} className="w-40" value={goalValue} onChange={e => setGoalValue(e.target.value)} />
              </div>
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'var(--sm-text-3)' }}>Clientes fechados no mês</p>
                <Input type="number" min={0} className="w-32" value={goalDeals} onChange={e => setGoalDeals(e.target.value)} />
              </div>
              <Button size="sm" onClick={saveGoals} disabled={updateSettings.isPending}><Check className="w-3 h-3" /> Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditGoal(false)}>Cancelar</Button>
            </div>
          ) : hasGoal ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {!!settings?.goal_monthly_value && (
                <GoalBar label="Valor fechado" current={month.value} goal={Number(settings.goal_monthly_value)} format={n => money(n)} />
              )}
              {!!settings?.goal_monthly_deals && (
                <GoalBar label="Clientes fechados" current={month.deals} goal={settings.goal_monthly_deals} format={n => String(n)} />
              )}
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: 'var(--sm-text-4)' }}>
              Defina quanto quer fechar por mês e acompanhe aqui o quanto já foi.
            </p>
          )}
        </section>

        <div className="flex flex-wrap gap-1">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
                    className="text-[12px] px-2.5 h-7 rounded-lg border transition-colors"
                    style={{
                      borderColor: period === p.id ? '#2563EB' : 'var(--sm-border)',
                      background:  period === p.id ? 'rgba(37,99,235,0.12)' : 'transparent',
                      color:       period === p.id ? '#4F8EF7' : 'var(--sm-text-3)',
                    }}>
              {p.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sm-text-3)' }} /></div>
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Tile label="Fechados" value={money(report.wonValue)}
                    sub={`${report.wonNet !== report.wonValue ? `líquido ${money(report.wonNet)} · ` : ''}${report.won} cliente(s) no período`} />
              <Tile label="Conversão" value={report.conversion === null ? 'sem dados' : `${report.conversion}%`}
                    sub={`${report.won} ganho(s) de ${report.won + report.lost} fechado(s)`} />
              <Tile label="Ticket médio" value={report.ticket === null ? 'sem dados' : money(report.ticket)}
                    sub={report.cycle === null ? 'sem vendas no período' : `${report.cycle} dia(s) do cadastro ao fechamento`} />
              <Tile label="Na mesa agora" value={money(report.openValue)} sub={`${report.openCount} lead(s) em aberto · ${report.created} novo(s) no período`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Follow-up automático" hint="Quantos leads respondem a cada degrau da cadência (até 7 dias depois do envio) e quanto foi vendido para quem recebeu follow-up.">
                {fup.sent === 0 ? (
                  <p className="text-[12px]" style={{ color: 'var(--sm-text-4)' }}>Nenhum follow-up automático enviado no período.</p>
                ) : (
                  <>
                    <Bars rows={fup.rows} format={n => `${n}%`} />
                    <p className="text-[12px] mt-3" style={{ color: 'var(--sm-text-2)' }}>
                      {fup.sent} follow-up(s) no período · <strong style={{ color: 'var(--sm-text-1)' }}>{fup.wonCount}</strong> venda(s) de leads que receberam follow-up
                      {fup.wonValue > 0 && <> · {money(fup.wonValue)}</>}
                    </p>
                  </>
                )}
              </Card>

              <Card title="Previsão de vendas" hint="Valor em aberto de cada etapa multiplicado pela chance de fechar. Ajuste a % de cada etapa conforme a sua experiência.">
                <div className="space-y-1.5">
                  {forecast.rows.map(x => (
                    <div key={x.col.id} className="flex items-center gap-2 text-[12.5px]">
                      <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--sm-text-2)' }}>{x.col.name}</span>
                      <span className="w-16 text-right tabular-nums" style={{ color: 'var(--sm-text-3)' }}>{x.count} lead(s)</span>
                      <input
                        type="number" min={0} max={100} inputMode="numeric"
                        defaultValue={x.prob}
                        key={`${x.col.id}-${x.prob}`}
                        title={x.custom ? 'Chance definida por você' : 'Sugestão pela posição da etapa'}
                        onBlur={e => {
                          const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value))))
                          if (!Number.isFinite(v) || v === x.prob) return
                          updateColumn.mutate({ id: x.col.id, win_probability: v }, { onError: (err: any) => toast(err.message, 'error') })
                        }}
                        className="w-14 h-7 rounded-md border px-1.5 text-right text-[12px] tabular-nums [color-scheme:dark]"
                        style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: x.custom ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}
                      />
                      <span className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>%</span>
                      <span className="w-24 text-right tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{money(x.weighted)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-baseline justify-between mt-3 pt-2 border-t text-[13px]" style={{ borderColor: 'var(--sm-border)' }}>
                  <span style={{ color: 'var(--sm-text-2)' }}>Previsão de fechamento</span>
                  <strong className="text-[16px]" style={{ color: '#22C55E' }}>{money(forecast.total)}</strong>
                </div>
              </Card>

              <Card title="Funil agora" hint="Leads ativos em cada etapa, com o valor somado.">
                <Bars rows={report.funnel} format={n => `${n}`} />
              </Card>

              <Card title="Tempo médio em cada etapa" hint="Quanto tempo o lead fica numa etapa antes de sair dela. A mais lenta é onde o funil trava.">
                <Bars rows={report.timeInStage} format={n => (n < 1 ? `${Math.round(n * 24)}h` : `${n.toFixed(1)} dias`)} />
              </Card>

              <Card title="Por que perdemos" hint="Motivo informado ao mover para a etapa de perda.">
                <Bars rows={report.reasons} format={n => `${n}`} />
              </Card>

              <Card title="De onde vêm os leads" hint="Leads novos no período por origem, e quantos desses já viraram cliente.">
                {report.sources.length === 0 ? (
                  <p className="text-[12px] py-4 text-center" style={{ color: 'var(--sm-text-4)' }}>Sem dados no período.</p>
                ) : (
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr style={{ color: 'var(--sm-text-4)' }}>
                        <th className="text-left font-medium pb-1.5">Origem</th>
                        <th className="text-right font-medium pb-1.5">Leads</th>
                        <th className="text-right font-medium pb-1.5">Clientes</th>
                        <th className="text-right font-medium pb-1.5">Conversão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.sources.map(s => (
                        <tr key={s.source} className="border-t" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                          <td className="py-1.5">{s.source}</td>
                          <td className="py-1.5 text-right">{s.total}</td>
                          <td className="py-1.5 text-right">{s.won}{s.value ? ` · ${money(s.value)}` : ''}</td>
                          <td className="py-1.5 text-right" style={{ color: 'var(--sm-text-1)' }}>{pct(s.won, s.total) ?? 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              {report.members.length > 0 && (
                <Card title="Por responsável" hint="Negócios fechados (ganhos e perdidos) no período.">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr style={{ color: 'var(--sm-text-4)' }}>
                        <th className="text-left font-medium pb-1.5">Responsável</th>
                        <th className="text-right font-medium pb-1.5">Ganhos</th>
                        <th className="text-right font-medium pb-1.5">Perdidos</th>
                        <th className="text-right font-medium pb-1.5">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.members.map(m => (
                        <tr key={m.name} className="border-t" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                          <td className="py-1.5">{m.name}</td>
                          <td className="py-1.5 text-right">{m.won}</td>
                          <td className="py-1.5 text-right">{m.lost}</td>
                          <td className="py-1.5 text-right" style={{ color: 'var(--sm-text-1)' }}>{money(m.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
