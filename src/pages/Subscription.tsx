import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Zap, Crown, Building2, Loader2, AlertTriangle, ExternalLink, RefreshCw, HardDrive } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import { useAIUsage } from '@/hooks/useAIUsage'
import { useStorageUsage } from '@/hooks/useStorageUsage'
import { PLANS, type PlanId } from '@/config/plans'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
}

async function startCheckout(priceId: string): Promise<string | null> {
  if (priceId.startsWith('CONFIGURE_')) {
    alert('Configure o Price ID do Stripe em src/config/plans.ts')
    return null
  }
  const { data, error } = await supabase.functions.invoke('create-checkout', { body: { priceId } })
  if (error || data?.error) { alert(data?.error ?? error?.message ?? 'Erro ao iniciar pagamento.'); return null }
  return data?.url ?? null
}

async function openPortal(fallbackPriceId?: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('create-portal', {})
  if (error || data?.error) { alert(data?.error ?? error?.message ?? 'Erro ao abrir portal.'); return null }
  // Se não há customer live, vai para checkout com o priceId do plano atual ou do alvo
  if (data?.needsCheckout && fallbackPriceId) return startCheckout(fallbackPriceId)
  if (data?.needsCheckout) { alert('Realize uma nova assinatura para gerenciar seu plano.'); return null }
  return data?.url ?? null
}

// ── Meta Pixel ────────────────────────────────────────────────────────────────

function trackPixel(event: string, params?: Record<string, unknown>) {
  try {
    const fbq = (window as any).fbq
    if (typeof fbq === 'function') fbq('track', event, params)
  } catch {}
}


// ── Visual ────────────────────────────────────────────────────────────────────
// Padrão editorial do sistema: tokens de tema, botões no azul escuro
// (var(--sm-primary)) e cor de status só em pontos/barras finas.

const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'agency']
const card = { background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' } as const
const eyebrow = 'text-[10.5px] font-semibold uppercase tracking-[0.08em]'
const btnBase = 'w-full h-10 rounded-xl text-[13px] font-semibold transition-opacity flex items-center justify-center gap-2 disabled:opacity-60'

// ── Medidor de uso (IA / armazenamento) ──────────────────────────────────────

function Meter({ label, valueLabel, pct, warn }: { label: string; valueLabel: string; pct: number; warn: string }) {
  const color = pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#2563EB'
  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>{label}</p>
        <p className="text-[12.5px] tabular-nums" style={{ color: pct >= 90 ? '#EF4444' : 'var(--sm-text-2)', fontWeight: pct >= 90 ? 600 : 500 }}>{valueLabel}</p>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: 'var(--sm-bg-alt)' }}>
        <motion.div className="h-full rounded-full" style={{ background: color }}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      </div>
      {pct >= 90 && (
        <p className="text-[11.5px] mt-1.5 flex items-center gap-1" style={{ color: '#EF4444' }}>
          <AlertTriangle className="w-3 h-3" /> {warn}
        </p>
      )}
    </div>
  )
}

// ── Card de plano ─────────────────────────────────────────────────────────────

function PlanCard({
  planId, currentPlanId, hasStripe, onUpgrade, onPortal, loadingPlan,
}: {
  planId: PlanId
  currentPlanId: PlanId
  hasStripe: boolean
  onUpgrade: (priceId: string) => void
  onPortal: (fallbackPriceId?: string) => void
  loadingPlan: string | null
}) {
  const plan      = PLANS[planId]
  const isCurrent = planId === currentPlanId
  const isDowngrade = (
    (currentPlanId === 'agency' && planId !== 'agency') ||
    (currentPlanId === 'pro'    && planId === 'starter')
  )
  const idx = PLAN_ORDER.indexOf(planId)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      className="relative rounded-2xl border p-6 flex flex-col gap-5"
      style={isCurrent
        ? { ...card, borderColor: '#2563EB', boxShadow: 'inset 0 0 0 1px #2563EB, 0 18px 40px -28px rgba(22,40,77,0.45)' }
        : card}
    >
      {/* Cabeçalho do plano */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{String(idx + 1).padStart(2, '0')}</p>
          <h3 className="font-display text-[22px] font-bold leading-tight" style={{ color: 'var(--sm-text-1)' }}>{plan.name}</h3>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
            {plan.maxClients === -1 ? 'Clientes ilimitados' : `Até ${plan.maxClients} clientes`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isCurrent && (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: '#2563EB' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#2563EB' }} /> Plano atual
            </span>
          )}
          {plan.badge && !isCurrent && (
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-3)' }}>{plan.badge}</span>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-1 pb-5 border-b" style={{ borderColor: 'var(--sm-border)' }}>
        <span className="text-[13px]" style={{ color: 'var(--sm-text-3)' }}>R$</span>
        <span className="font-display text-[38px] font-bold leading-none tabular-nums tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>{plan.price}</span>
        <span className="text-[12.5px]" style={{ color: 'var(--sm-text-4)' }}>/mês</span>
      </div>

      <div className="space-y-4 flex-1">
        {plan.featureGroups.map(g => (
          <div key={g.title}>
            <p className={`${eyebrow} mb-1.5`} style={{ color: 'var(--sm-text-4)' }}>{g.title}</p>
            <ul className="space-y-1.5">
              {g.items.map(f => (
                <li key={f} className="flex items-start gap-2 text-[12.5px]" style={{ color: 'var(--sm-text-2)' }}>
                  <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#10B981' }} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {isCurrent ? (
        hasStripe ? (
          <button onClick={() => onPortal()} disabled={!!loadingPlan}
            className={`${btnBase} border hover:bg-black/5`} style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}>
            {loadingPlan === 'portal' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
            Gerenciar assinatura
          </button>
        ) : (
          <div className={`${btnBase} text-[12.5px]`} style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-3)' }}>Plano atual</div>
        )
      ) : isDowngrade ? (
        <button onClick={() => onPortal(plan.stripePriceId ?? undefined)} disabled={!!loadingPlan}
          className={`${btnBase} border hover:bg-black/5`} style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
          {loadingPlan === plan.stripePriceId && <Loader2 className="w-4 h-4 animate-spin" />}
          Fazer downgrade
        </button>
      ) : plan.stripePriceId && !plan.stripePriceId.startsWith('CONFIGURE') ? (
        <button onClick={() => onUpgrade(plan.stripePriceId!)} disabled={!!loadingPlan}
          className={`${btnBase} text-white hover:opacity-90 active:scale-[0.98]`} style={{ background: 'var(--sm-primary)' }}>
          {loadingPlan === plan.stripePriceId && <Loader2 className="w-4 h-4 animate-spin" />}
          Fazer upgrade
        </button>
      ) : (
        <div className={`${btnBase} text-[12px]`} style={{ background: 'rgba(245,158,11,0.10)', color: '#B45309' }}>
          Configure o Stripe para ativar
        </div>
      )}
    </motion.div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export function Subscription() {
  const { user, agencyId }                                 = useAuth()
  const { data: subData, isLoading: subLoading } = useSubscription()
  const { data: usage }                          = useAIUsage(agencyId ?? undefined)
  const { data: storageUsage }                   = useStorageUsage()
  const [searchParams]                           = useSearchParams()
  const [loadingPlan, setLoadingPlan]             = useState<string | null>(null)

  const success       = searchParams.get('success') === '1'
  const canceled      = searchParams.get('canceled') === '1'
  const currentPlanId = (subData?.subscription.plan ?? 'starter') as PlanId
  const hasStripe     = !!subData?.subscription.stripe_subscription_id

  const purchaseFired = useRef(false)
  useEffect(() => {
    if (!success || !subData || purchaseFired.current) return
    purchaseFired.current = true
    const plan = PLANS[currentPlanId]
    trackPixel('Purchase', {
      value: plan.price,
      currency: 'BRL',
      content_name: plan.name,
      content_ids: [currentPlanId],
      num_items: 1,
    })
  }, [success, subData, currentPlanId])

  const handleUpgrade = async (priceId: string) => {
    setLoadingPlan(priceId)
    const url = await startCheckout(priceId)
    if (url) window.location.href = url
    setLoadingPlan(null)
  }

  const handlePortal = async (fallbackPriceId?: string) => {
    setLoadingPlan(fallbackPriceId ?? 'portal')
    const url = await openPortal(fallbackPriceId)
    if (url) window.location.href = url
    setLoadingPlan(null)
  }


  if (subLoading) return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4" aria-busy="true">
      <div className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
      <div className="h-96 rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
    </div>
  )

  const aiPct = usage ? Math.min(100, Math.round((usage.requests / usage.limit) * 100)) : 0
  const stPct = storageUsage ? Math.min(100, Math.round((storageUsage.usedGB / storageUsage.limitGB) * 100)) : 0
  const stUsedLabel = storageUsage
    ? (storageUsage.usedGB < 1 ? `${(storageUsage.usedGB * 1024).toFixed(0)} MB` : `${storageUsage.usedGB.toFixed(1)} GB`)
    : ''

  const linhas: { label: string; values: (string | boolean)[] }[] = [
    { label: 'Clientes',              values: ['5', '15', '50'] },
    { label: 'Requests IA/mês',        values: ['150', '600', '2.000'] },
    { label: 'Armazenamento',          values: ['10 GB', '50 GB', '100 GB'] },
    { label: 'IA Copilot',             values: [true, true, true] },
    { label: 'Portal do cliente',      values: ['Até 2 clientes', 'Até 10 clientes', 'Até 50 clientes'] },
    { label: 'Relatórios',             values: [false, true, true] },
    { label: 'Equipe (usuários)',       values: ['1', 'Até 3', 'Ilimitado'] },
    { label: 'Agendamento Instagram',  values: ['1 perfil', 'Até 5 perfis', 'Até 20 perfis'] },
    { label: 'WhatsApp notifications', values: [true, true, true] },
    { label: 'Suporte',                values: ['E-mail', 'Prioritário (24h)', 'WhatsApp + SLA 4h'] },
    { label: 'Preço/mês',              values: [fmtBRL(57), fmtBRL(97), fmtBRL(197)] },
  ]

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8">

      {/* ── Cabeçalho (no celular, ao lado do menu) ── */}
      <header className="max-md:pl-12 max-md:-mt-[3.25rem] flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Conta</p>
          <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>
            Assinatura
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>Seu plano, o que você já usou no mês e as opções para crescer.</p>
        </div>
        {hasStripe && (
          <button onClick={() => handlePortal()} disabled={!!loadingPlan}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border text-[13px] font-medium hover:bg-black/5 transition-colors disabled:opacity-60"
            style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
            {loadingPlan === 'portal' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Gerenciar pagamento
          </button>
        )}
      </header>

      {success && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="relative flex items-center gap-3 pl-5 pr-4 py-3 rounded-xl border text-[13px] overflow-hidden" style={{ ...card, color: 'var(--sm-text-1)' }}>
          <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r" style={{ background: '#10B981' }} />
          <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#10B981' }} />
          Pagamento confirmado! Seu plano foi atualizado.
        </motion.div>
      )}
      {canceled && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="relative flex items-center gap-3 pl-5 pr-4 py-3 rounded-xl border text-[13px] overflow-hidden" style={{ ...card, color: 'var(--sm-text-1)' }}>
          <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r" style={{ background: '#F59E0B' }} />
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#D97706' }} />
          Pagamento cancelado. Você continua no plano atual.
        </motion.div>
      )}

      {/* 01 · Plano atual + uso */}
      <section>
        <h2 className="flex items-baseline gap-2 mb-3">
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>01</span>
          <span className="font-display text-[17px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Seu plano</span>
        </h2>
        <div className="rounded-2xl border grid grid-cols-1 md:grid-cols-3 gap-px overflow-hidden" style={{ background: 'var(--sm-border)', borderColor: 'var(--sm-border)' }}>
          <div className="relative px-5 py-4" style={{ background: 'var(--sm-bg-card)' }}>
            <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r" style={{ background: '#2563EB' }} />
            <p className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>Plano atual</p>
            <p className="font-display text-[26px] font-bold leading-tight mt-0.5" style={{ color: 'var(--sm-text-1)' }}>{subData?.plan.name ?? 'Starter'}</p>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
              {subData?.subscription.current_period_end
                ? `Renova em ${new Date(subData.subscription.current_period_end).toLocaleDateString('pt-BR')}`
                : `R$ ${PLANS[currentPlanId].price}/mês`}
            </p>
          </div>
          <div style={{ background: 'var(--sm-bg-card)' }}>
            {usage
              ? <Meter label="IA usada este mês" valueLabel={`${usage.requests} / ${usage.limit} requests`} pct={aiPct} warn="Quase no limite — considere fazer upgrade" />
              : <div className="h-full min-h-[76px]" />}
          </div>
          <div style={{ background: 'var(--sm-bg-card)' }}>
            {storageUsage
              ? <Meter label="Armazenamento usado" valueLabel={`${stUsedLabel} / ${storageUsage.limitGB} GB`} pct={stPct} warn="Armazenamento quase cheio — faça upgrade para liberar espaço" />
              : <div className="h-full min-h-[76px]" />}
          </div>
        </div>
      </section>

      {/* 02 · Planos */}
      <section>
        <h2 className="flex items-baseline gap-2 mb-3">
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>02</span>
          <span className="font-display text-[17px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Planos disponíveis</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLAN_ORDER.map(id => (
            <PlanCard key={id} planId={id} currentPlanId={currentPlanId}
              hasStripe={hasStripe} onUpgrade={handleUpgrade} onPortal={handlePortal} loadingPlan={loadingPlan} />
          ))}
        </div>
      </section>

      {/* 03 · Comparativo */}
      <section>
        <h2 className="flex items-baseline gap-2 mb-3">
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>03</span>
          <span className="font-display text-[17px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Comparativo</span>
        </h2>
        <div className="rounded-2xl border overflow-x-auto" style={card}>
          <table className="w-full text-[13px] min-w-[560px]">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
                <th className={`text-left px-5 py-3 ${eyebrow}`} style={{ color: 'var(--sm-text-4)' }}>Recurso</th>
                {PLAN_ORDER.map(id => (
                  <th key={id} className="text-center px-4 py-3 text-[13px] font-bold" style={{ color: id === currentPlanId ? '#2563EB' : 'var(--sm-text-1)' }}>
                    {PLANS[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((row, ri) => (
                <tr key={row.label} className={`hover:bg-black/[0.02] ${ri > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                  <td className="px-5 py-3" style={{ color: 'var(--sm-text-2)' }}>{row.label}</td>
                  {row.values.map((v, i) => {
                    const atual = PLAN_ORDER[i] === currentPlanId
                    return (
                      <td key={i} className="text-center px-4 py-3 tabular-nums"
                        style={{ color: 'var(--sm-text-1)', background: atual ? 'rgba(37,99,235,0.05)' : undefined, fontWeight: atual ? 600 : 400 }}>
                        {typeof v === 'boolean' ? (
                          v
                            ? <Check className="w-4 h-4 mx-auto" style={{ color: '#10B981' }} />
                            : <span style={{ color: 'var(--sm-text-4)' }}>—</span>
                        ) : v}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
    </div>
  )
}
