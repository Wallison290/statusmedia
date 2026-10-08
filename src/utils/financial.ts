import type { Client, FinancialStatus } from '@/types'

// Due date (dia_vencimento) `monthOffset` months away from a reference date.
function dueOn(ref: Date, dayDue: number, monthOffset = 0): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + monthOffset, dayDue)
}

// Which billing cycle a payment is considered to cover: the dia_vencimento
// nearest to the payment date. Paying on Jun 3 (vencimento dia 10) covers the
// Jun 10 cycle (early payment); paying on May 15 covers the May 10 cycle (late).
// Ties favor the earlier due date (treated as catching up the current cycle,
// not prepaying the next).
function cycleCoveredBy(paid: Date, dayDue: number): Date {
  const candidates = [dueOn(paid, dayDue, -1), dueOn(paid, dayDue, 0), dueOn(paid, dayDue, 1)]
  let best = candidates[0]
  let bestDist = Infinity
  for (const c of candidates) {
    const dist = Math.abs(paid.getTime() - c.getTime())
    if (dist < bestDist) { bestDist = dist; best = c }
  }
  return best
}

// Returns true when client_payments contains a 'pago' record that covers the
// current billing cycle. A payment covers the current cycle when its nearest
// due date is this month's due date (or a later one, i.e. paid ahead). This
// keeps an early payment valid even after the due date passes.
export function hasPaidCurrentCycle(
  payments: Array<{ status: string; payment_date: string }>,
  diaVencimento: number | null | undefined,
): boolean {
  if (!diaVencimento || payments.length === 0) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueThisMonth = dueOn(today, diaVencimento)
  return payments.some(p => {
    if (p.status !== 'pago') return false
    const paid = new Date(p.payment_date + 'T00:00:00')
    return cycleCoveredBy(paid, diaVencimento).getTime() >= dueThisMonth.getTime()
  })
}

export function calcFinancialStatus(client: Client): FinancialStatus {
  // Cancelled is always manual and never overridden automatically
  if (client.manual_status_override && client.financial_status === 'cancelado') return 'cancelado'

  // Any other manual override: trust stored value
  if (client.manual_status_override && client.financial_status) return client.financial_status

  // No due day configured → can't determine status
  if (!client.dia_vencimento) return 'ativo'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayDue = client.dia_vencimento

  const dueThisMonth = dueOn(today, dayDue)
  const lastPaid = client.last_payment_date
    ? new Date(client.last_payment_date + 'T00:00:00')
    : null

  // Paid for this cycle if the last payment covers this month's due date (or a
  // later one). An early payment for the current cycle (ex.: pagou dia 3, vence
  // dia 10) continua válido depois que o vencimento passa — não vira atraso.
  const paidThisCycle = lastPaid != null &&
    cycleCoveredBy(lastPaid, dayDue).getTime() >= dueThisMonth.getTime()

  if (paidThisCycle) {
    const nextDue = new Date(today.getFullYear(), today.getMonth() + 1, dayDue)
    const daysUntil = Math.ceil((nextDue.getTime() - today.getTime()) / 86_400_000)
    if (daysUntil <= 5) return 'vence_em_breve'
    return 'ativo'
  }

  // Not yet paid for this cycle
  const daysUntil = Math.ceil((dueThisMonth.getTime() - today.getTime()) / 86_400_000)
  if (daysUntil < 0) return 'atrasado'
  if (daysUntil <= 5) return 'vence_em_breve'
  return 'ativo'
}

export function financialStatusLabel(status: FinancialStatus): string {
  return {
    ativo: 'Em dia',
    vence_em_breve: 'Vence em breve',
    atrasado: 'Atrasado',
    cancelado: 'Cancelado',
  }[status]
}

export function getFinancialAuxText(client: Client, status: FinancialStatus): string | null {
  const lastPaid = client.last_payment_date
    ? new Date(client.last_payment_date + 'T00:00:00')
    : null

  if (status === 'cancelado') {
    return lastPaid ? `Último pagamento: ${lastPaid.toLocaleDateString('pt-BR')}` : null
  }

  if (!client.dia_vencimento) {
    return lastPaid ? `Pago em ${lastPaid.toLocaleDateString('pt-BR')}` : null
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueThisMonth = dueOn(today, client.dia_vencimento)
  const paidThisCycle = lastPaid != null &&
    cycleCoveredBy(lastPaid, client.dia_vencimento).getTime() >= dueThisMonth.getTime()

  if (status === 'atrasado') {
    const days = Math.abs(Math.ceil((dueThisMonth.getTime() - today.getTime()) / 86_400_000))
    return `Atrasado há ${days} dia${days !== 1 ? 's' : ''}`
  }

  if (status === 'vence_em_breve') {
    const nextDue = paidThisCycle
      ? new Date(today.getFullYear(), today.getMonth() + 1, client.dia_vencimento)
      : dueThisMonth
    const days = Math.ceil((nextDue.getTime() - today.getTime()) / 86_400_000)
    if (days === 0) return 'Vence hoje'
    return `Vence em ${days} dia${days !== 1 ? 's' : ''}`
  }

  // ativo: "Pago em" só quando o pagamento cobre o ciclo atual; senão mostra o
  // próximo vencimento (um pagamento antigo não significa que este mês foi pago)
  if (paidThisCycle) return `Pago em ${lastPaid!.toLocaleDateString('pt-BR')}`
  return `Aguardando pagamento · vence ${dueThisMonth.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
}
