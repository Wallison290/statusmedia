// ── Avisos de vencimento da assinatura ────────────────────────────────────────
// Regra no banco (migration 113, billing_settings): aviso nos dias antes do
// vencimento, carência depois dele e bloqueio quando a carência acaba.
//
// · BillingBanner: faixa fixa no topo durante a carência.
// · BillingPopup: pop-up no painel inicial quando faltam poucos dias (uma vez
//   por dia) e em qualquer tela durante a carência (uma vez por sessão).

import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useSubscription, type SubscriptionData } from '@/hooks/useSubscription'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Abre a área da Stripe para pagar a fatura em aberto ou trocar o cartão. */
export async function openBillingPortal(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('create-portal', {})
  if (error || data?.error) { alert(data?.error ?? error?.message ?? 'Não foi possível abrir o pagamento.'); return false }
  if (data?.url) { window.location.href = data.url; return true }
  return false
}

/** Botão "Atualizar pagamento": Stripe quando há assinatura lá, senão a tela de planos. */
export function PayButton({ sub, onDone, label = 'Atualizar pagamento' }: { sub: SubscriptionData; onDone?: () => void; label?: string }) {
  const [loading, setLoading] = useState(false)
  if (!sub.subscription.stripe_customer_id) {
    return (
      <Button asChild onClick={onDone}>
        <Link to="/assinatura">Ver formas de pagamento</Link>
      </Button>
    )
  }
  return (
    <Button disabled={loading} onClick={async () => {
      setLoading(true)
      const ok = await openBillingPortal()
      if (!ok) setLoading(false)
    }}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {label}
    </Button>
  )
}

export function BillingBanner() {
  const { data: sub } = useSubscription()
  const access = sub?.access
  if (!sub || access?.state !== 'carencia') return null
  const days = access.graceDaysLeft ?? 0
  return (
    <div className="w-full text-white text-center py-2 px-4 text-[12.5px] font-medium flex items-center justify-center gap-2 flex-shrink-0 flex-wrap"
      style={{ background: '#B91C1C' }}>
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      Pagamento da assinatura não identificado.
      {days > 0 ? ` O acesso será suspenso em ${plural(days, 'dia', 'dias')} (${fmtDate(access.graceUntil)}).` : ' O acesso será suspenso hoje.'}
      <Link to="/assinatura" className="underline underline-offset-2 hover:no-underline font-semibold">
        Regularizar →
      </Link>
    </div>
  )
}

const DUE_KEY   = 'sm_billing_due_popup'    // localStorage: um por dia
const GRACE_KEY = 'sm_billing_grace_popup'  // sessionStorage: um por sessão

function readKey(storage: () => Storage, key: string) {
  try { return storage().getItem(key) } catch { return null }
}
function writeKey(storage: () => Storage, key: string, value: string) {
  try { storage().setItem(key, value) } catch { /* sem storage: só fecha */ }
}

export function BillingPopup() {
  const { data: sub } = useSubscription()
  const { pathname } = useLocation()
  const today = new Date().toISOString().slice(0, 10)
  const [closed, setClosed] = useState(false)

  const access = sub?.access
  const state  = access?.state
  const show =
    !!sub && !closed && (
      (state === 'vence_em_breve' && pathname === '/dashboard' && readKey(() => localStorage, DUE_KEY) !== today) ||
      (state === 'carencia' && readKey(() => sessionStorage, GRACE_KEY) !== '1')
    )
  if (!show || !sub || !access) return null

  const close = () => {
    if (state === 'carencia') writeKey(() => sessionStorage, GRACE_KEY, '1')
    else writeKey(() => localStorage, DUE_KEY, today)
    setClosed(true)
  }

  const price   = `R$ ${sub.plan.price}`
  const auto    = !!sub.subscription.stripe_subscription_id && !sub.cancelAtPeriodEnd
  const dueDays = access.daysToDue ?? 0

  return (
    <Dialog open onOpenChange={v => { if (!v) close() }}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state === 'carencia'
              ? <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#EF4444' }} />
              : <CalendarClock className="w-5 h-5 flex-shrink-0" style={{ color: '#2563EB' }} />}
            {state === 'carencia'
              ? 'Pagamento não identificado'
              : dueDays === 0 ? 'Sua assinatura vence hoje' : `Sua assinatura vence em ${plural(dueDays, 'dia', 'dias')}`}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-[13px] leading-relaxed">
              {state === 'carencia' ? (
                <>
                  <p>
                    O plano <b>{sub.plan.name}</b> venceu em <b>{fmtDate(access.paidUntil)}</b> e ainda não recebemos o pagamento.
                  </p>
                  <p>
                    Você tem até <b>{fmtDate(access.graceUntil)}</b> para regularizar. Depois disso o acesso ao sistema fica suspenso até o pagamento ser confirmado.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    O plano <b>{sub.plan.name}</b> ({price}/mês) vence em <b>{fmtDate(access.paidUntil)}</b>.
                  </p>
                  <p>
                    {auto
                      ? 'A cobrança é feita automaticamente no cartão cadastrado. Se o cartão mudou ou está perto de vencer, atualize antes para não ter interrupção.'
                      : 'Faça o pagamento até essa data para continuar usando o sistema sem interrupção.'}
                  </p>
                  <p>Se o pagamento não for confirmado, você ainda tem {plural(access.graceDays, 'dia', 'dias')} de carência depois do vencimento.</p>
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close}>{state === 'carencia' ? 'Lembrar depois' : 'Entendi'}</Button>
          <PayButton sub={sub} onDone={close} label={auto ? 'Conferir cartão' : 'Atualizar pagamento'} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
