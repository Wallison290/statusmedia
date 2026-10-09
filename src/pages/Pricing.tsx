import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Loader2, LogOut, Zap, Crown, Building2, Shield, RefreshCw, ArrowRight } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import { PLANS, type PlanId } from '@/config/plans'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
}

async function startCheckout(priceId: string): Promise<void> {
  if (priceId.startsWith('CONFIGURE_')) {
    alert('Este plano estará disponível para assinatura em instantes. Tente novamente mais tarde.')
    return
  }
  const { data, error } = await supabase.functions.invoke('create-checkout', { body: { priceId } })
  if (error || data?.error) {
    alert(data?.error ?? error?.message ?? 'Erro ao iniciar pagamento.')
    return
  }
  if (data?.url) window.location.href = data.url
}

async function openPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-portal', {})
  if (error || data?.error) {
    alert(data?.error ?? error?.message ?? 'Erro ao abrir portal.')
    return
  }
  if (data?.url) window.location.href = data.url
}

// ── Ícones por plano ──────────────────────────────────────────────────────────

const PLAN_ICON: Record<PlanId, React.ElementType> = {
  starter: Zap,
  pro:     Crown,
  agency:  Building2,
}

const PLAN_GRADIENT: Record<PlanId, string> = {
  starter: 'from-blue-500 to-cyan-500',
  pro:     'from-violet-600 to-purple-600',
  agency:  'from-amber-500 to-orange-500',
}

// ── Card de plano ─────────────────────────────────────────────────────────────

function PlanCard({
  planId,
  currentPlanId,
  isActive,
  hasStripe,
  loading,
  onSelect,
}: {
  planId: PlanId
  currentPlanId: PlanId | null
  isActive: boolean
  hasStripe: boolean
  loading: boolean
  onSelect: () => void
}) {
  const plan      = PLANS[planId]
  const Icon      = PLAN_ICON[planId]
  const isCurrent = planId === currentPlanId && isActive
  const isPro     = planId === 'pro'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: ['starter','pro','agency'].indexOf(planId) * 0.08 }}
      className={`relative rounded-2xl p-6 flex flex-col gap-5 transition-shadow ${
        isPro
          ? 'bg-white border-2 border-violet-500 shadow-xl shadow-violet-100/60'
          : 'bg-white border border-[#e8e8e8] hover:shadow-md'
      }`}
    >
      {/* Badge */}
      {plan.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className={`text-[10px] font-bold px-3.5 py-1 rounded-full text-white bg-gradient-to-r ${PLAN_GRADIENT[planId]} shadow-sm`}>
            {plan.badge}
          </span>
        </div>
      )}
      {isCurrent && (
        <div className="absolute -top-3.5 right-4">
          <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-green-100 text-green-700 border border-green-200">
            Plano atual
          </span>
        </div>
      )}

      {/* Ícone + nome */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${PLAN_GRADIENT[planId]} shadow-sm`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-[16px] font-bold text-[#0f172a]">{plan.name}</h3>
          <p className="text-[11.5px] text-[#64748b]">{plan.description}</p>
        </div>
      </div>

      {/* Preço */}
      <div className="flex items-baseline gap-1">
        <span className="text-[13px] text-[#64748b]">R$</span>
        <span className="text-[36px] font-black text-[#0f172a] leading-none">{plan.price}</span>
        <span className="text-[13px] text-[#94a3b8]">/mês</span>
      </div>

      {/* Features agrupadas por categoria */}
      <div className="space-y-4 flex-1">
        {plan.featureGroups.map(g => (
          <div key={g.title}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-2">{g.title}</p>
            <ul className="space-y-2">
              {g.items.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* CTA */}
      {isCurrent ? (
        hasStripe ? (
          <button
            onClick={openPortal}
            className="w-full py-3 rounded-xl border border-[#e2e8f0] text-[13.5px] font-medium text-[#475569] hover:bg-[#f8fafc] transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Gerenciar assinatura
          </button>
        ) : (
          <div className="w-full py-3 rounded-xl bg-green-50 border border-green-200 text-center text-[13px] text-green-700 font-medium">
            ✓ Plano ativo
          </div>
        )
      ) : (
        <button
          onClick={onSelect}
          disabled={loading}
          className={`w-full py-3 rounded-xl text-[13.5px] font-semibold text-white transition-all flex items-center justify-center gap-2 bg-gradient-to-r ${PLAN_GRADIENT[planId]} hover:opacity-90 active:scale-[0.98] disabled:opacity-60 shadow-sm`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? 'Aguarde...' : 'Assinar agora'}
        </button>
      )}
    </motion.div>
  )
}

// ── Barra de uso (para quem já tem plano ativo) ───────────────────────────────

function ActiveBar({ planName }: { planName: string }) {
  return (
    <div className="max-w-sm mx-auto bg-white rounded-2xl border border-[#e8e8e8] px-5 py-4 text-center">
      <p className="text-[12px] text-[#64748b]">
        Plano <strong className="text-[#0f172a]">{planName}</strong> ativo
      </p>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export function Pricing() {
  const navigate                                     = useNavigate()
  const { signOut, user, agencyId }                            = useAuth()
  const { data: subData }                            = useSubscription()
  const [loadingPlan, setLoadingPlan]                = useState<PlanId | null>(null)
  const [searchParams]                               = useSearchParams()
  const paymentSuccess                               = searchParams.get('success') === '1'

  const currentPlanId = subData?.subscription.plan as PlanId | null
  const isActive      = subData?.isActive ?? false
  const hasStripe     = !!subData?.subscription.stripe_subscription_id

  // Após pagamento bem-sucedido, fica verificando até o webhook ativar o plano
  useEffect(() => {
    if (!paymentSuccess || isActive) return
    const interval = setInterval(() => {
      // React Query vai refetch automaticamente; se isActive mudar, o efeito limpa
    }, 2000)
    return () => clearInterval(interval)
  }, [paymentSuccess, isActive])

  // Quando plano ativar após pagamento, redireciona pro sistema
  useEffect(() => {
    if (paymentSuccess && isActive) {
      navigate('/', { replace: true })
    }
  }, [paymentSuccess, isActive, navigate])

  const handleSelect = async (planId: PlanId) => {
    const priceId = PLANS[planId].stripePriceId
    if (!priceId) return
    setLoadingPlan(planId)
    await startCheckout(priceId)
    setLoadingPlan(null)
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">

      {/* Topbar mínima */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#f1f5f9]">
        <div className="flex items-center gap-2">
          {/* Era um quadrado preto "SB" com Georgia serif — sobra do rebrand. */}
          <picture>
            <source srcSet="/logo-icon.avif" type="image/avif" />
            <source srcSet="/logo-icon.webp" type="image/webp" />
            <img src="/logo-icon.png" alt="" width={28} height={28} className="w-7 h-7 object-contain" />
          </picture>
          <span className="text-[13px] font-semibold text-[#0f0f0f]">
            Status<span className="text-[#29457a]">Media</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isActive && (
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-violet-600 hover:text-violet-700 transition-colors"
            >
              Acessar o sistema
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => signOut()}
            className="flex items-center gap-1.5 text-[12.5px] text-[#94a3b8] hover:text-[#475569] transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 gap-10">

        {/* Header */}
        <div className="text-center space-y-3 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-[11.5px] font-semibold mb-1"
          >
            <Shield className="w-3.5 h-3.5" />
            Acesso completo ao sistema
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-[28px] md:text-[32px] font-black text-[#0f172a] leading-tight"
          >
            Escolha seu plano
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-[14px] text-[#64748b]"
          >
            Clientes, conteúdo, vendas e financeiro da agência num lugar só. Cancele quando quiser.
          </motion.p>
        </div>

        {/* Banner de sucesso do pagamento */}
        {paymentSuccess && !isActive && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 px-5 py-3.5 bg-green-50 border border-green-200 rounded-xl text-green-700 text-[13px] font-medium"
          >
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            Pagamento confirmado! Ativando seu plano...
          </motion.div>
        )}

        {/* Uso atual (apenas quem já tem plano ativo) */}
        {isActive && <ActiveBar planName={subData?.plan.name ?? ''} />}

        {/* Cards */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-5">
          {(['starter', 'pro', 'agency'] as PlanId[]).map(id => (
            <PlanCard
              key={id}
              planId={id}
              currentPlanId={currentPlanId}
              isActive={isActive}
              hasStripe={hasStripe}
              loading={loadingPlan === id}
              onSelect={() => handleSelect(id)}
            />
          ))}
        </div>

        {/* Garantia */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-2 text-[12px] text-[#94a3b8]"
        >
          <Shield className="w-3.5 h-3.5" />
          Pagamento seguro via Stripe · Cancele quando quiser
        </motion.div>
      </div>
    </div>
  )
}
