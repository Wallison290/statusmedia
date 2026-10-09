// ── Recurso fora do plano ────────────────────────────────────────────────────
// usePlanFeature: o plano atual inclui o recurso? (enquanto carrega, `ready`
// fica false para a tela não piscar o bloqueio)
// PlanLocked: tela de convite ao upgrade, no padrão editorial do sistema.
// Quem aplica de verdade é o banco/Edge Functions (migration 093); isto é a vitrine.

import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import { getPlan, minPlanFor } from '@/config/plans'

type Feature = 'hasReports' | 'crmFull' | 'autoBilling' | 'hasPartners' | 'aiAssistant' | 'aiMessages'

export function usePlanFeature(feature: Feature) {
  const { data, isLoading } = useSubscription()
  const plan = getPlan(data?.subscription.plan)
  const v = plan[feature]
  const allowed = typeof v === 'number' ? v > 0 : !!v
  const minPlan = minPlanFor(feature === 'aiMessages' ? 'crmFull' : feature)
  return { ready: !isLoading, allowed: isLoading ? true : allowed, minPlan }
}

interface Props {
  feature: Feature
  title: string
  description: string
  /** Bloco compacto (dentro de um painel) em vez de tela inteira */
  compact?: boolean
}

export function PlanLocked({ feature, title, description, compact }: Props) {
  const { minPlan } = usePlanFeature(feature)
  return (
    <div className={compact ? 'py-6 px-4' : 'min-h-[50vh] flex items-center justify-center p-6'}>
      <div className="max-w-md text-center mx-auto">
        <div className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center border"
          style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
          <Lock className="w-4 h-4" />
        </div>
        <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>
          Plano {minPlan.name} · R$ {minPlan.price}/mês
        </p>
        <h2 className="font-display text-[22px] font-bold leading-tight mt-1" style={{ color: 'var(--sm-text-1)' }}>{title}</h2>
        <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--sm-text-3)' }}>{description}</p>
        <Link to="/assinatura"
          className="inline-flex items-center justify-center h-10 px-5 mt-5 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: 'var(--sm-primary)' }}>
          Ver planos
        </Link>
      </div>
    </div>
  )
}
