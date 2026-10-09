// ── Planos e cotas, lado servidor ────────────────────────────────────────────
// Os números ficam no banco (migration 093: plan_limit / agency_limit /
// ai_consume). Aqui só os atalhos para as Edge Functions.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

// Preço do Stripe → plano. Os preços antigos continuam mapeados porque quem
// já assina mantém o valor antigo até migrar.
type PlanKey = 'starter' | 'pro' | 'agency'

// Preços de 2026 (R$97 / R$197 / R$297) — iguais aos de src/config/plans.ts
export const CURRENT_PRICES: Record<PlanKey, string> = {
  starter: 'CONFIGURE_STARTER_2026',
  pro:     'CONFIGURE_PRO_2026',
  agency:  'CONFIGURE_AGENCY_2026',
}

// Preços antigos (R$57 / R$97 / R$197): só para assinaturas existentes
const LEGACY_PRICES: Record<PlanKey, string> = {
  starter: 'price_1Tjj4F0khDYycmTvwkNmnfFk',
  pro:     'price_1Tjj4w0khDYycmTvDDOmCvi7',
  agency:  'price_1Tjj5c0khDYycmTvDDntAKuf',
}

export const PRICE_TO_PLAN: Record<string, PlanKey> = Object.fromEntries(
  [...Object.entries(CURRENT_PRICES), ...Object.entries(LEGACY_PRICES)].map(([plan, id]) => [id, plan as PlanKey]),
)

// Só os preços atuais servem para um checkout novo
export const CHECKOUT_PRICES = new Set(Object.values(CURRENT_PRICES))

export type AiKind = 'ai_messages' | 'ai_reports' | 'ai_assistant'

export interface AiQuota {
  allowed: boolean
  used:    number
  limit:   number
  plan?:   string
  reason?: 'subscription_inactive' | 'not_in_plan' | 'limit_reached'
}

/** Consome 1 da cota de IA da agência (atômico, no banco). */
export async function consumeAi(sb: Sb, agencyId: string, kind: AiKind): Promise<AiQuota> {
  const { data, error } = await sb.rpc('ai_consume', { p_agency: agencyId, p_kind: kind })
  if (error) throw new Error(error.message)
  return data as AiQuota
}

const KIND_LABEL: Record<AiKind, string> = {
  ai_messages:  'mensagens com IA',
  ai_reports:   'análises de relatório com IA',
  ai_assistant: 'perguntas ao assistente do CRM',
}

/** Texto para o usuário quando a cota nega o uso. */
export function aiDeniedMessage(q: AiQuota, kind: AiKind): string {
  if (q.reason === 'subscription_inactive') return 'Assinatura inativa. Assine um plano para usar a IA.'
  if (q.reason === 'not_in_plan') {
    return kind === 'ai_assistant'
      ? 'O assistente do CRM faz parte do plano Agency. Faça upgrade para usar.'
      : 'Recurso de IA disponível a partir do plano Pro. Faça upgrade para usar.'
  }
  return `Você usou as ${q.limit} ${KIND_LABEL[kind]} do plano este mês. Faça upgrade para continuar.`
}

/** Limite da agência numa chave de plan_limit (0 = sem assinatura / não incluso). */
export async function agencyLimit(sb: Sb, agencyId: string, key: string): Promise<number> {
  const { data, error } = await sb.rpc('agency_limit', { p_agency: agencyId, p_key: key })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
