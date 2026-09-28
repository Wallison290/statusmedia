import { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, MotionConfig } from 'framer-motion'
import { CalendarDays, ArrowUpRight, ArrowRight } from 'lucide-react'
import { DashboardHero } from '@/components/dashboard/DashboardHero'
import { useDashboardGreeting } from '@/hooks/useDashboardGreeting'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { contentTypeLabels } from '@/utils/formatters'
import { calcFinancialStatus } from '@/utils/financial'
import { PLAN_KEYS, planKey, planColor, type PlanKey } from '@/utils/planStatus'
import {
  startOfWeek, endOfWeek, startOfDay, endOfDay,
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  format, isToday, addDays, startOfToday,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ─── Approval helpers ────────────────────────────────────────────────────────
//
// "Aguardando aprovação do cliente" = item foi enviado para o cliente revisar
// e ainda não foi aprovado nem reprovado definitivamente.
//
// Conta: 'pendente_aprovacao' (enviado, aguardando 1ª resposta)
//        'ajuste_realizado'   (agência fez o ajuste, cliente precisa reaprovar)
//
// NÃO conta: null / itens nunca enviados ao cliente, 'aprovado', 'reprovado',
//            'ajuste_solicitado' (cliente pediu ajuste, não é "aguardando")
function isAwaitingClientApproval(item: { approval_status: string | null }): boolean {
  const as = item.approval_status
  return as === 'pendente_aprovacao' || as === 'ajuste_realizado'
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodMode = 'dia' | 'semana' | 'mes' | 'ano' | 'custom'

interface DateRange { start: Date; end: Date }

interface Stats {
  total_clients:              number
  active_clients:             number
  pending_tasks:              number
  overdue_tasks:              number
  period_pending_approval:    number
  period_approved:            number
  period_scheduled:           number
  period_published:           number
  period_adjustments:         number
  ig_scheduled:               number
  ig_published:               number
}

interface PlannerDay {
  id:              string
  title:           string
  content_type:    string
  status:          string
  scheduled_date:  string
  approval_status: string | null
  sent_to_client:  boolean | null
}

interface FinStats {
  mrr:          number
  received:     number
  pending:      number
  overdueAmt:   number
  overdueCount: number
  avgTicket:    number
}

function fmtBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style:                 'currency',
    currency:              'BRL',
    maximumFractionDigits: 0,
  }).format(n)
}

// Janela da agenda: ontem + os próximos 5 dias
const AGENDA_BEFORE = 1
const AGENDA_AFTER  = 5

// ─── Period helpers ───────────────────────────────────────────────────────────

function computeRange(mode: PeriodMode, custom: DateRange): DateRange {
  const now = new Date()
  switch (mode) {
    case 'dia':    return { start: startOfDay(now),   end: endOfDay(now) }
    case 'semana': return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) }
    case 'mes':    return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'ano':    return { start: startOfYear(now),  end: endOfYear(now) }
    case 'custom': return custom
  }
}

function rangeLabel(mode: PeriodMode, range: DateRange): string {
  if (mode === 'dia')    return format(range.start, "d 'de' MMM", { locale: ptBR })
  if (mode === 'ano')    return format(range.start, 'yyyy')
  return `${format(range.start, 'd MMM', { locale: ptBR })} – ${format(range.end, 'd MMM yyyy', { locale: ptBR })}`
}

// ─── Blocos base ──────────────────────────────────────────────────────────────

const CARD = 'rounded-2xl border border-[var(--sm-border)] bg-[var(--sm-bg-card)]'

/** Entra ao rolar: sobe 16px e aparece. Respeita "reduzir movimento" via MotionConfig. */
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Título de seção numerado: 01, 02… em azul + nome em display. */
function SectionHead({ n, title, aside, children }: {
  n: string; title: string; aside?: React.ReactNode; children?: React.ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-x-4 gap-y-3 mb-4 flex-wrap">
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="font-display text-[12px] font-semibold tabular-nums text-[#2563EB]">{n}</span>
        <h2 className="font-display text-[20px] sm:text-[22px] font-bold tracking-[-0.025em] leading-none text-[var(--sm-text-1)]">
          {title}
        </h2>
        {aside && <span className="text-[12px] text-[var(--sm-text-3)] truncate">{aside}</span>}
      </div>
      {children}
    </div>
  )
}

function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--sm-text-3)]">
      {color && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />}
      {children}
    </span>
  )
}

// ─── Seletor de período ───────────────────────────────────────────────────────

interface PeriodPickerProps {
  mode:          PeriodMode
  range:         DateRange
  customRange:   DateRange
  onMode:        (m: PeriodMode) => void
  onCustomRange: (r: DateRange) => void
}

function PeriodPicker({ mode, range, customRange, onMode, onCustomRange }: PeriodPickerProps) {
  const [open, setOpen]   = useState(false)
  const [tempS, setTempS] = useState(format(customRange.start, 'yyyy-MM-dd'))
  const [tempE, setTempE] = useState(format(customRange.end,   'yyyy-MM-dd'))
  const popoverRef        = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function applyCustom() {
    if (!tempS || !tempE) return
    onCustomRange({ start: new Date(tempS + 'T00:00:00'), end: new Date(tempE + 'T23:59:59') })
    onMode('custom')
    setOpen(false)
  }

  const pills: { key: PeriodMode; label: string }[] = [
    { key: 'dia',    label: 'Dia'    },
    { key: 'semana', label: 'Semana' },
    { key: 'mes',    label: 'Mês'    },
    { key: 'ano',    label: 'Ano'    },
  ]

  const inputCls = 'w-full h-8 px-3 rounded-lg text-[12px] bg-[var(--sm-bg-input)] border border-[var(--sm-border)] text-[var(--sm-text-1)] focus:outline-none focus:ring-1 focus:ring-[#2563EB]/40'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[var(--sm-bg-alt)]">
        {pills.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onMode(key)}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              mode === key
                ? 'bg-[var(--sm-bg-card)] text-[var(--sm-text-1)] shadow-sm'
                : 'text-[var(--sm-text-3)] hover:text-[var(--sm-text-1)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => {
            setTempS(format(customRange.start, 'yyyy-MM-dd'))
            setTempE(format(customRange.end,   'yyyy-MM-dd'))
            setOpen(v => !v)
          }}
          className={`flex items-center gap-2 h-9 px-3 rounded-xl text-[12px] border transition-colors bg-[var(--sm-bg-card)] text-[var(--sm-text-2)] hover:text-[var(--sm-text-1)] ${
            mode === 'custom' ? 'border-[#2563EB]' : 'border-[var(--sm-border)] hover:border-[var(--sm-text-4)]'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="capitalize whitespace-nowrap">{rangeLabel(mode, range)}</span>
        </button>

        {open && (
          <div className={`absolute right-0 top-full mt-2 z-50 p-4 w-[260px] shadow-2xl ${CARD}`}>
            <p className="text-[12px] font-semibold mb-3 text-[var(--sm-text-1)]">Período personalizado</p>
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] block mb-1 text-[var(--sm-text-2)]">Data inicial</label>
                <input type="date" value={tempS} onChange={e => setTempS(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[11px] block mb-1 text-[var(--sm-text-2)]">Data final</label>
                <input type="date" value={tempE} min={tempS} onChange={e => setTempE(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 h-8 rounded-lg text-[12px] border border-[var(--sm-border)] text-[var(--sm-text-2)] hover:text-[var(--sm-text-1)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={applyCustom}
                disabled={!tempS || !tempE || tempE < tempS}
                className="flex-1 h-8 rounded-lg text-[12px] text-white font-medium disabled:opacity-40 bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 01 · Faixa de números do período ─────────────────────────────────────────
// Uma faixa só, dividida por fios de 1px. O primeiro número (o que depende do
// cliente) é o destaque; os outros três ficam menores ao lado.

interface Kpi {
  label: string
  value: number
  note:  string
  href:  string
  color: string
  alert?: boolean
}

function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-[1.55fr_1fr_1fr_1fr] gap-px bg-[var(--sm-border)] rounded-2xl overflow-hidden border border-[var(--sm-border)]">
      {items.map((k, i) => {
        const lead = i === 0
        return (
          <Link
            key={k.label}
            to={k.href}
            className={`group relative flex flex-col justify-between gap-5 bg-[var(--sm-bg-card)] hover:bg-[var(--sm-bg-input)] transition-colors p-5 sm:p-6 min-h-[140px] ${lead ? 'col-span-2 lg:col-span-1 lg:min-h-[184px]' : ''}`}
          >
            {/* Barra de cor do status, como nos cartões do Planejamento */}
            <span
              className="absolute left-0 top-6 bottom-6 w-[3px] rounded-r-full transition-all duration-300 group-hover:top-4 group-hover:bottom-4"
              style={{ background: k.value > 0 ? k.color : 'var(--sm-border)' }}
            />
            <div className="flex items-center gap-2">
              <Eyebrow>{k.label}</Eyebrow>
              <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-[var(--sm-text-3)] opacity-0 -translate-x-1 translate-y-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-300" />
            </div>
            <div>
              <p
                className="font-display font-bold tabular-nums leading-[0.85] tracking-[-0.045em]"
                style={{
                  fontSize: lead ? 'clamp(56px, 7vw, 92px)' : 'clamp(38px, 4vw, 50px)',
                  color: k.alert && k.value > 0 ? k.color : 'var(--sm-text-1)',
                }}
              >
                {k.value}
              </p>
              <p className="text-[12px] text-[var(--sm-text-3)] mt-2.5 leading-snug">{k.note}</p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ─── 02 · Planejamento: onde cada post está ───────────────────────────────────

function PipelineWidget({ counts }: { counts: { key: PlanKey; label: string; color: string; n: number }[] }) {
  const total = counts.reduce((s, c) => s + c.n, 0)

  return (
    <div className={`${CARD} p-5 sm:p-6 h-full flex flex-col`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className="font-display font-bold tabular-nums leading-[0.85] tracking-[-0.045em] text-[var(--sm-text-1)]"
            style={{ fontSize: 'clamp(44px, 5vw, 64px)' }}
          >
            {total}
          </p>
          <p className="text-[12px] text-[var(--sm-text-3)] mt-2">
            {total === 1 ? 'post agendado no período' : 'posts agendados no período'}
          </p>
        </div>
        <Link
          to="/planner"
          className="group flex items-center gap-1.5 text-[12px] font-medium text-[var(--sm-text-2)] hover:text-[var(--sm-text-1)] transition-colors flex-shrink-0 pt-1"
        >
          Abrir planejamento
          <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </div>

      {total === 0 ? (
        <div className="flex-1 flex flex-col items-start justify-end pt-10">
          <div className="w-full h-2.5 rounded-full bg-[var(--sm-bg-alt)]" />
          <p className="text-[12.5px] text-[var(--sm-text-3)] mt-4">
            Nada no calendário neste período.{' '}
            <Link to="/planner" className="text-[#2563EB] hover:underline underline-offset-2">Criar um post</Link>
          </p>
        </div>
      ) : (
        <>
          {/* Barra única com a proporção de cada status */}
          <div className="flex w-full h-2.5 gap-[3px] mt-7 mb-6">
            {counts.filter(c => c.n > 0).map((c, i) => (
              <motion.span
                key={c.key}
                title={`${c.label}: ${c.n}`}
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-full origin-left"
                style={{ background: c.color, flexGrow: c.n, flexBasis: 0 }}
              />
            ))}
          </div>

          {/* Legenda com número e porcentagem */}
          <div className="grid sm:grid-cols-2 gap-x-8 mt-auto">
            {counts.map(c => (
              <div
                key={c.key}
                className={`flex items-center gap-3 py-2.5 border-t border-[var(--sm-border)] ${c.n === 0 ? 'opacity-45' : ''}`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                <span className="text-[12.5px] text-[var(--sm-text-2)] flex-1 truncate">{c.label}</span>
                <span className="text-[11px] tabular-nums text-[var(--sm-text-4)] w-9 text-right">
                  {Math.round((c.n / total) * 100)}%
                </span>
                <span className="font-display text-[16px] font-bold tabular-nums text-[var(--sm-text-1)] w-7 text-right">{c.n}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── 02 · Agenda dos próximos dias ────────────────────────────────────────────

function AgendaWidget({ items }: { items: PlannerDay[] }) {
  const today = startOfToday()
  const days  = Array.from({ length: AGENDA_BEFORE + AGENDA_AFTER + 1 }, (_, i) => addDays(today, i - AGENDA_BEFORE))
  const [selected, setSelected] = useState(format(today, 'yyyy-MM-dd'))

  const dayItems = items.filter(i => i.scheduled_date === selected)
  const selDate  = days.find(d => format(d, 'yyyy-MM-dd') === selected) ?? today
  const selLabel = isToday(selDate) ? 'Hoje' : format(selDate, "EEEE, d 'de' MMM", { locale: ptBR })

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <Eyebrow>Agenda</Eyebrow>
        <span className="text-[11.5px] text-[var(--sm-text-3)] capitalize">{format(today, 'MMMM', { locale: ptBR })}</span>
      </div>

      {/* Tira de dias */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const key     = format(day, 'yyyy-MM-dd')
          const posts   = items.filter(i => i.scheduled_date === key)
          const isSel   = key === selected
          const isNow   = isToday(day)
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg border transition-colors ${
                isSel
                  ? 'bg-[var(--sm-bg-alt)] border-[var(--sm-border)]'
                  : 'border-transparent hover:bg-[var(--sm-bg-alt)]'
              } ${isNow ? '!border-[#2563EB] ring-1 ring-[#2563EB]/30' : ''}`}
            >
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--sm-text-4)]">
                {format(day, 'EEEEEE', { locale: ptBR })}
              </span>
              <span className={`font-display text-[17px] font-bold leading-none tabular-nums ${isNow ? 'text-[#2563EB]' : 'text-[var(--sm-text-1)]'}`}>
                {format(day, 'd')}
              </span>
              <span className="flex gap-[3px] h-1">
                {posts.slice(0, 3).map(p => (
                  <span key={p.id} className="w-1 h-1 rounded-full" style={{ background: planColor(p) }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {/* Posts do dia escolhido */}
      <div className="mt-4 pt-4 border-t border-[var(--sm-border)]">
        <p className="text-[12px] font-semibold text-[var(--sm-text-1)] mb-2.5 first-letter:uppercase">
          {selLabel}
          <span className="font-normal text-[var(--sm-text-3)]"> · {dayItems.length} {dayItems.length === 1 ? 'post' : 'posts'}</span>
        </p>
        {dayItems.length === 0 ? (
          <p className="text-[12px] text-[var(--sm-text-3)] py-1">Dia livre no calendário.</p>
        ) : (
          <div className="space-y-1.5">
            {dayItems.slice(0, 4).map(item => (
              <Link
                key={item.id}
                to={`/planner?item=${item.id}`}
                className="block rounded-md border-l-[3px] bg-[var(--sm-bg-alt)] hover:bg-[var(--sm-bg-input)] hover:translate-x-0.5 transition-all pl-2.5 pr-2 py-1.5"
                style={{ borderLeftColor: planColor(item) }}
              >
                <p className="text-[12px] font-medium leading-tight truncate text-[var(--sm-text-1)]">{item.title}</p>
                <p className="text-[10.5px] leading-tight truncate text-[var(--sm-text-3)] mt-0.5">
                  {contentTypeLabels[item.content_type as keyof typeof contentTypeLabels] ?? item.content_type}
                  {' · '}
                  {PLAN_KEYS.find(k => k.key === planKey(item))?.label}
                </p>
              </Link>
            ))}
            {dayItems.length > 4 && (
              <Link to="/planner" className="block text-[11.5px] text-[var(--sm-text-3)] hover:text-[var(--sm-text-1)] pt-1 transition-colors">
                +{dayItems.length - 4} no planejamento →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 02 · Tarefas e aprovações ────────────────────────────────────────────────

function OpsWidget({ rows }: { rows: { label: string; value: number; color: string; href: string }[] }) {
  return (
    <div className={`${CARD} px-5 pt-5 pb-2`}>
      <Eyebrow>Operação</Eyebrow>
      <div className="mt-3">
        {rows.map(row => (
          <Link
            key={row.label}
            to={row.href}
            className="group flex items-center gap-3 py-2.5 border-t border-[var(--sm-border)] first:border-t-0"
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: row.value > 0 ? row.color : 'var(--sm-text-4)' }} />
            <span className="text-[12.5px] flex-1 text-[var(--sm-text-2)] group-hover:text-[var(--sm-text-1)] transition-colors">{row.label}</span>
            <span
              className="font-display text-[18px] font-bold tabular-nums leading-none transition-transform duration-300 group-hover:-translate-x-1"
              style={{ color: row.value > 0 ? 'var(--sm-text-1)' : 'var(--sm-text-4)' }}
            >
              {row.value}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── 03 · Financeiro ──────────────────────────────────────────────────────────
// MRR é a manchete, grande à esquerda, com a barra do quanto já entrou no mês.
// Os outros quatro valores ficam num 2×2 ao lado.

function FinancialBlock({ data }: { data: FinStats }) {
  const receivedPct = data.mrr > 0 ? Math.min(100, Math.round((data.received / data.mrr) * 100)) : 0

  const cells = [
    { label: 'Recebido',     value: data.received,   note: 'pago no mês atual',    color: '#22C55E', on: data.received > 0 },
    { label: 'A receber',    value: data.pending,    note: 'vence em breve',        color: '#EAB308', on: data.pending > 0 },
    { label: 'Em atraso',    value: data.overdueAmt,
      note: data.overdueCount > 0 ? `${data.overdueCount} cliente${data.overdueCount !== 1 ? 's' : ''} em atraso` : 'nenhum cliente em atraso',
      color: '#EF4444', on: data.overdueCount > 0 },
    { label: 'Ticket médio', value: data.avgTicket,  note: 'por cliente ativo',    color: '#3B82F6', on: false },
  ]

  return (
    <div className="grid lg:grid-cols-[1.25fr_1fr] gap-px bg-[var(--sm-border)] rounded-2xl overflow-hidden border border-[var(--sm-border)]">
      {/* Manchete: MRR */}
      <div className="bg-[var(--sm-bg-card)] p-6 sm:p-8 flex flex-col justify-between gap-8 min-h-[220px]">
        <Eyebrow>Receita mensal recorrente</Eyebrow>
        <div>
          <p
            className="font-display font-bold tabular-nums leading-[0.9] tracking-[-0.045em] text-[var(--sm-text-1)] break-words"
            style={{ fontSize: 'clamp(40px, 5.6vw, 76px)' }}
          >
            {fmtBRL(data.mrr)}
          </p>
          <div className="mt-6">
            <div className="h-1.5 rounded-full bg-[var(--sm-bg-alt)] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${receivedPct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-full bg-[#22C55E]"
              />
            </div>
            <p className="text-[12px] text-[var(--sm-text-3)] mt-2.5">
              <span className="text-[var(--sm-text-1)] font-medium tabular-nums">{receivedPct}%</span> do MRR já recebido este mês
            </p>
          </div>
        </div>
      </div>

      {/* 2×2 */}
      <div className="grid grid-cols-2 gap-px bg-[var(--sm-border)]">
        {cells.map(c => (
          <div key={c.label} className="bg-[var(--sm-bg-card)] p-5 sm:p-6 flex flex-col justify-between gap-4 min-h-[118px]">
            <Eyebrow color={c.on ? c.color : undefined}>{c.label}</Eyebrow>
            <div>
              <p
                className="font-display text-[20px] sm:text-[26px] font-bold tabular-nums leading-none tracking-[-0.03em] break-words"
                style={{ color: c.on && c.label === 'Em atraso' ? c.color : 'var(--sm-text-1)' }}
              >
                {fmtBRL(c.value)}
              </p>
              <p className="text-[11.5px] text-[var(--sm-text-3)] mt-1.5 leading-snug">{c.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { user, profile } = useAuth()

  // ── Period state (single source of truth) ─────────────────────────────────
  const defaultCustom: DateRange = {
    start: startOfWeek(new Date(), { locale: ptBR }),
    end:   endOfWeek(new Date(),   { locale: ptBR }),
  }
  const [periodMode, setPeriodMode]   = useState<PeriodMode>('semana')
  const [customRange, setCustomRange] = useState<DateRange>(defaultCustom)

  const range = useMemo(
    () => computeRange(periodMode, customRange),
    [periodMode, customRange],
  )

  // ── User name ─────────────────────────────────────────────────────────────
  const userName = (
    user?.user_metadata?.full_name?.split(' ')[0] ||
    user?.user_metadata?.name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'você'
  ) as string

  // ── Data state ────────────────────────────────────────────────────────────
  const [statsReady, setStatsReady]           = useState(false)
  const [stats, setStats]                     = useState<Stats>({ total_clients: 0, active_clients: 0, pending_tasks: 0, overdue_tasks: 0, period_pending_approval: 0, period_approved: 0, period_scheduled: 0, period_published: 0, period_adjustments: 0, ig_scheduled: 0, ig_published: 0 })
  const [planCounts, setPlanCounts]           = useState(PLAN_KEYS.map(k => ({ ...k, n: 0 })))
  const [plannerCalItems, setPlannerCalItems] = useState<PlannerDay[]>([])
  const [finStats, setFinStats]               = useState<FinStats>({ mrr: 0, received: 0, pending: 0, overdueAmt: 0, overdueCount: 0, avgTicket: 0 })

  // ── Re-fetch whenever user or range changes ───────────────────────────────
  useEffect(() => {
    if (!user) return
    fetchStats(range)
  }, [user, range.start.toISOString(), range.end.toISOString()])

  // ── Fetch ─────────────────────────────────────────────────────────────────
  async function fetchStats({ start, end }: DateRange) {
    const now       = new Date()
    const startIso  = start.toISOString()
    const endIso    = end.toISOString()
    const startDate = format(start, 'yyyy-MM-dd')
    const endDate   = format(end,   'yyyy-MM-dd')

    // Agenda: janela fixa em torno de hoje
    const calStart = format(addDays(now, -AGENDA_BEFORE), 'yyyy-MM-dd')
    const calEnd   = format(addDays(now,  AGENDA_AFTER),  'yyyy-MM-dd')

    const [
      clientsRes,
      tasksRes,
      plannerRes,
      plannerCalRes,
      igPostsRes,
    ] = await Promise.all([
      supabase.from('clients').select('id, status, valor_mensal, financial_status, last_payment_date, dia_vencimento, manual_status_override').eq('user_id', user!.id),
      supabase.from('tasks').select('id, status, due_date').eq('user_id', user!.id).neq('status', 'concluido'),
      supabase.from('planner')
        .select('status, approval_status, sent_to_client')
        .eq('user_id', user!.id)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate),
      supabase.from('planner')
        .select('id, title, content_type, status, scheduled_date, approval_status, sent_to_client')
        .eq('user_id', user!.id)
        .gte('scheduled_date', calStart)
        .lte('scheduled_date', calEnd),
      supabase.from('scheduled_posts')
        .select('status, scheduled_at')
        .eq('user_id', user!.id),
    ])

    const clients  = clientsRes.data  || []
    const taskList = tasksRes.data    || []

    const periodTasks = taskList.filter(task => {
      if (!task.due_date) return true
      const d = new Date(task.due_date)
      return d >= start && d <= end
    })
    const overdue = taskList.filter(t => t.due_date && new Date(t.due_date) < now).length

    // sent_to_client existe no banco (migration 039), mas não nos tipos gerados
    const pList = (plannerRes.data || []) as unknown as { status: string; approval_status: string | null; sent_to_client: boolean | null }[]

    const period_scheduled        = pList.filter((p: any) => p.status === 'aprovado').length
    const period_published        = pList.filter((p: any) => p.status === 'publicado').length
    const period_pending_approval = pList.filter(isAwaitingClientApproval).length
    const period_approved         = pList.filter((p: any) => p.approval_status === 'aprovado').length
    const period_adjustments      = pList.filter((p: any) => p.approval_status === 'ajuste_solicitado').length

    const igPosts    = igPostsRes.data || []
    const ig_scheduled = igPosts.filter((p: any) => p.status === 'scheduled' || p.status === 'publishing').length
    const ig_published = igPosts.filter((p: any) =>
      p.status === 'published' && p.scheduled_at >= startIso && p.scheduled_at <= endIso
    ).length

    setStatsReady(true)
    setStats({
      total_clients:  clients.length,
      active_clients: clients.filter(c => c.status === 'ativo').length,
      pending_tasks:  periodTasks.length,
      overdue_tasks:  overdue,
      period_pending_approval,
      period_approved,
      period_scheduled,
      period_published,
      period_adjustments,
      ig_scheduled,
      ig_published,
    })

    setPlanCounts(PLAN_KEYS.map(k => ({ ...k, n: pList.filter((p: any) => planKey(p) === k.key).length })))
    setPlannerCalItems((plannerCalRes.data || []) as unknown as PlannerDay[])

    const thisYear  = now.getFullYear()
    const thisMonth = now.getMonth() + 1
    const finClients     = clients.filter((c: any) => c.valor_mensal != null || c.dia_vencimento != null)
    const withCalcStatus = finClients.map((c: any) => ({ client: c, status: calcFinancialStatus(c) }))
    const mrrClients     = withCalcStatus.filter((x: any) => x.status !== 'cancelado')
    const mrr            = mrrClients.reduce((s: number, x: any) => s + (Number(x.client.valor_mensal) || 0), 0)
    const received = withCalcStatus
      .filter((x: any) => {
        if (!x.client.last_payment_date) return false
        const [y, m] = x.client.last_payment_date.split('-').map(Number)
        return y === thisYear && m === thisMonth
      })
      .reduce((s: number, x: any) => s + (Number(x.client.valor_mensal) || 0), 0)
    const pending      = withCalcStatus.filter((x: any) => x.status === 'vence_em_breve').reduce((s: number, x: any) => s + (Number(x.client.valor_mensal) || 0), 0)
    const overdueAmt   = withCalcStatus.filter((x: any) => x.status === 'atrasado').reduce((s: number, x: any) => s + (Number(x.client.valor_mensal) || 0), 0)
    const overdueCount = withCalcStatus.filter((x: any) => x.status === 'atrasado').length
    const avgTicket    = mrrClients.length > 0 ? mrr / mrrClients.length : 0
    setFinStats({ mrr, received, pending, overdueAmt, overdueCount, avgTicket })
  }

  // ── Greeting com IA ───────────────────────────────────────────────────────
  const { greeting, message, pills, isLoading: greetingLoading, refresh: refreshGreeting } =
    useDashboardGreeting(user?.id, userName, stats, statsReady, (profile as any)?.agency_name || '')

  // ─────────────────────────────────────────────────────────────────────────

  const kpis: Kpi[] = [
    {
      label: 'Aguardando aprovação', value: stats.period_pending_approval, href: '/planner', color: '#EAB308',
      note:  stats.period_pending_approval > 0 ? 'posts com o cliente, esperando resposta' : 'nada parado com o cliente',
    },
    {
      label: 'Ajustes pedidos', value: stats.period_adjustments, href: '/planner', color: '#F97316', alert: true,
      note:  stats.period_adjustments > 0 ? 'o cliente pediu correções' : 'nenhum ajuste pendente',
    },
    {
      label: 'Fila do Instagram', value: stats.ig_scheduled, href: '/instagram', color: '#3B82F6',
      note:  stats.ig_scheduled > 0 ? 'agendados para publicar' : 'nenhum na fila',
    },
    {
      label: 'Publicados', value: stats.ig_published, href: '/instagram', color: '#22C55E',
      note:  stats.ig_published > 0 ? 'no Instagram, no período' : 'nada publicado ainda',
    },
  ]

  const opsRows = [
    { label: 'Aprovados no período', value: stats.period_approved, color: '#22C55E', href: '/planner' },
    { label: 'Tarefas em aberto',    value: stats.pending_tasks,   color: '#3B82F6', href: '/tasks'   },
    { label: 'Tarefas atrasadas',    value: stats.overdue_tasks,   color: '#EF4444', href: '/tasks'   },
    { label: 'Clientes ativos',      value: stats.active_clients,  color: '#94A3B8', href: '/clients' },
  ]

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-full bg-[var(--sm-bg-page)]">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 pt-4 sm:pt-6 pb-16">

          <DashboardHero
            greeting={greeting}
            userName={userName}
            message={message}
            pills={pills}
            isLoading={greetingLoading}
            onRefresh={refreshGreeting}
          />

          {/* ── 01 · O período ─────────────────────────────────────────────── */}
          <section className="mt-12 sm:mt-16">
            <SectionHead n="01" title="O período">
              <PeriodPicker
                mode={periodMode}
                range={range}
                customRange={customRange}
                onMode={m => setPeriodMode(m)}
                onCustomRange={r => setCustomRange(r)}
              />
            </SectionHead>
            <Reveal>
              <KpiStrip items={kpis} />
            </Reveal>
          </section>

          {/* ── 02 · Produção ──────────────────────────────────────────────── */}
          <section className="mt-12 sm:mt-16">
            <SectionHead n="02" title="Produção" aside="onde cada post está" />
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] gap-4 lg:gap-5">
              <Reveal>
                <PipelineWidget counts={planCounts} />
              </Reveal>
              <div className="flex flex-col gap-4 lg:gap-5">
                <Reveal delay={0.08}>
                  <AgendaWidget items={plannerCalItems} />
                </Reveal>
                <Reveal delay={0.16}>
                  <OpsWidget rows={opsRows} />
                </Reveal>
              </div>
            </div>
          </section>

          {/* ── 03 · Financeiro ────────────────────────────────────────────── */}
          <section className="mt-12 sm:mt-16">
            <SectionHead n="03" title="Financeiro" aside="ciclo atual">
              <Link
                to="/financial"
                className="group flex items-center gap-1.5 text-[12px] font-medium text-[var(--sm-text-2)] hover:text-[var(--sm-text-1)] transition-colors"
              >
                Ver detalhes
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </SectionHead>
            <Reveal>
              <FinancialBlock data={finStats} />
            </Reveal>
          </section>

        </div>
      </div>
    </MotionConfig>
  )
}
