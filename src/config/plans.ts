// ── Definição central dos planos ──────────────────────────────────────────────
// Os mesmos números ficam no banco (migration 093, função plan_limit), que é
// quem aplica de verdade. Mudou aqui? Mude lá também.
// stripePriceId: preços de 2026. Os preços antigos (R$57/97/197) continuam
// valendo para quem já assina (mapeados em supabase/functions/_shared/plans.ts).

export type PlanId = 'starter' | 'pro' | 'agency'

// Features agrupadas por categoria — facilita a comparação entre planos
export interface PlanFeatureGroup {
  title: string
  items: string[]
}

export interface Plan {
  id: PlanId
  name: string
  price: number
  maxClients: number          // -1 = ilimitado
  storageGB: number           // armazenamento em GB
  hasClientPortal: boolean
  hasReports: boolean         // relatórios mensais automáticos do Instagram
  crmFull: boolean            // propostas, contratos, automações, relatórios e todos os modelos de funil
  autoBilling: boolean        // cobrança automática (WhatsApp/Pix) + nota fiscal
  hasPartners: boolean        // acesso de sócios
  maxTeamMembers: number      // membros de equipe (-1 = ilimitado)
  instagramProfiles: number   // perfis com agendamento automático (-1 = ilimitado)
  aiMessages: number          // mensagens com IA no CRM por mês (follow-up + "Sugerir com IA")
  aiReports: number           // análises de relatório com IA por mês
  aiAssistant: number         // perguntas ao assistente do CRM por mês (app + WhatsApp)
  supportLevel: 'email' | 'priority' | 'sla'
  supportLabel: string
  stripePriceId: string | null
  badge?: string
  description: string
  featureGroups: PlanFeatureGroup[]
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 97,
    maxClients: 5,
    storageGB: 10,
    hasClientPortal: true,
    hasReports: false,
    crmFull: false,
    autoBilling: false,
    hasPartners: false,
    maxTeamMembers: 1,
    instagramProfiles: 1,
    aiMessages: 0,
    aiReports: 0,
    aiAssistant: 0,
    supportLevel: 'email',
    supportLabel: 'WhatsApp',
    stripePriceId: 'CONFIGURE_STARTER_2026',
    description: 'Para quem está começando a agência',
    featureGroups: [
      { title: 'Gestão da Agência', items: ['Até 5 clientes', 'Equipe com 1 usuário', '10 GB de armazenamento', 'Financeiro: mensalidades e lançamentos'] },
      { title: 'Produção', items: ['Planejamento e aprovação de conteúdo', 'Agendamento no Instagram (1 perfil)', 'Tarefas e notas'] },
      { title: 'Cliente', items: ['Portal do cliente', 'Notificações via WhatsApp'] },
      { title: 'Vendas', items: ['CRM com o funil comercial padrão'] },
      { title: 'Suporte', items: ['WhatsApp'] },
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 197,
    maxClients: 15,
    storageGB: 50,
    hasClientPortal: true,
    hasReports: true,
    crmFull: true,
    autoBilling: true,
    hasPartners: false,
    maxTeamMembers: 3,
    instagramProfiles: 10,
    aiMessages: 300,
    aiReports: 30,
    aiAssistant: 0,
    supportLevel: 'priority',
    supportLabel: 'WhatsApp',
    stripePriceId: 'CONFIGURE_PRO_2026',
    badge: 'Mais popular',
    description: 'Para agências em crescimento',
    featureGroups: [
      { title: 'Gestão da Agência', items: ['Até 15 clientes', 'Equipe com até 3 usuários', '50 GB de armazenamento', 'Cobrança automática via WhatsApp e Pix', 'Nota fiscal assistida'] },
      { title: 'Produção', items: ['Planejamento e aprovação de conteúdo', 'Agendamento no Instagram (até 10 perfis)', 'Relatórios mensais automáticos do Instagram'] },
      { title: 'Vendas', items: ['CRM completo: funis, propostas e contratos', 'Follow-up automático no WhatsApp'] },
      { title: 'IA', items: ['300 mensagens com IA por mês', '30 análises de relatório com IA por mês'] },
      { title: 'Suporte', items: ['WhatsApp'] },
    ],
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    price: 297,
    maxClients: 40,
    storageGB: 150,
    hasClientPortal: true,
    hasReports: true,
    crmFull: true,
    autoBilling: true,
    hasPartners: true,
    maxTeamMembers: -1,
    instagramProfiles: 40,
    aiMessages: 1500,
    aiReports: 150,
    aiAssistant: 1000,
    supportLevel: 'sla',
    supportLabel: 'WhatsApp prioritário',
    stripePriceId: 'CONFIGURE_AGENCY_2026',
    badge: 'Completo',
    description: 'Para agências consolidadas',
    featureGroups: [
      { title: 'Gestão da Agência', items: ['Até 40 clientes', 'Equipe com usuários ilimitados', 'Acesso para sócios', '150 GB de armazenamento', 'Cobrança automática e nota fiscal'] },
      { title: 'Produção', items: ['Tudo do Pro', 'Agendamento no Instagram (até 40 perfis)'] },
      { title: 'Vendas', items: ['CRM completo com follow-up automático', 'Assistente do CRM no app e no WhatsApp'] },
      { title: 'IA', items: ['1.500 mensagens com IA por mês', '150 análises de relatório com IA por mês'] },
      { title: 'Suporte', items: ['WhatsApp prioritário'] },
    ],
  },
}

export const PLAN_STORAGE_GB: Record<PlanId, number> = {
  starter: PLANS.starter.storageGB,
  pro:     PLANS.pro.storageGB,
  agency:  PLANS.agency.storageGB,
}

/** Label legível para agendamento Instagram */
export function instagramSchedulingLabel(planId: PlanId | string | null | undefined): string {
  const n = getPlan(planId).instagramProfiles
  if (n === -1) return 'Ilimitado'
  if (n === 1)  return '1 perfil'
  return `Até ${n} perfis`
}

/** Label legível para equipe */
export function teamMembersLabel(planId: PlanId | string | null | undefined): string {
  const n = getPlan(planId).maxTeamMembers
  if (n === -1) return 'Ilimitado'
  if (n === 1)  return '1'
  return `Até ${n}`
}

/** Verifica se o plano tem acesso a um recurso liga/desliga */
export function planHas(planId: PlanId | string | null | undefined, feature: keyof Pick<Plan,
  'hasClientPortal' | 'hasReports' | 'crmFull' | 'autoBilling' | 'hasPartners'
>): boolean {
  return getPlan(planId)[feature] ?? false
}

/** Plano mínimo que libera um recurso (para o texto do convite de upgrade) */
export function minPlanFor(feature: 'hasReports' | 'crmFull' | 'autoBilling' | 'hasPartners' | 'aiAssistant'): Plan {
  const order: PlanId[] = ['starter', 'pro', 'agency']
  const id = order.find(p => {
    const v = PLANS[p][feature]
    return typeof v === 'number' ? v > 0 : v
  })
  return PLANS[id ?? 'agency']
}

export function getPlan(id: PlanId | string | null | undefined): Plan {
  return PLANS[(id as PlanId) ?? 'starter'] ?? PLANS.starter
}
