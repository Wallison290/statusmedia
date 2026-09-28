// Status do post numa chave só — a MESMA no Planejamento e no Dashboard, para o
// contador, a cor e o filtro nunca discordarem entre as telas.
export type PlanKey = 'rascunho' | 'pendente_aprovacao' | 'ajuste_solicitado' | 'ajuste_realizado' | 'aprovado' | 'reprovado'

export const PLAN_KEYS: { key: PlanKey; label: string; short: string; color: string }[] = [
  { key: 'rascunho',           label: 'Não enviado',          short: 'não enviados',  color: '#94A3B8' },
  { key: 'pendente_aprovacao', label: 'Aguardando aprovação', short: 'aguardando',    color: '#EAB308' },
  { key: 'ajuste_solicitado',  label: 'Ajuste solicitado',    short: 'ajuste pedido', color: '#F97316' },
  { key: 'ajuste_realizado',   label: 'Ajuste realizado',     short: 'ajuste feito',  color: '#3B82F6' },
  { key: 'aprovado',           label: 'Aprovado',             short: 'aprovados',     color: '#22C55E' },
  { key: 'reprovado',          label: 'Reprovado',            short: 'reprovados',    color: '#EF4444' },
]

type PlanLike = { sent_to_client?: boolean | null; approval_status?: string | null; status?: string | null }

export function planKey(item: PlanLike): PlanKey {
  if (!item.sent_to_client) return 'rascunho'
  return ((item.approval_status as PlanKey) || 'pendente_aprovacao')
}

/** Cor sólida do post: publicado conta como aprovado. */
export function planColor(item: PlanLike) {
  if (item.status === 'publicado') return '#22C55E'
  return PLAN_KEYS.find(k => k.key === planKey(item))?.color ?? '#94A3B8'
}
