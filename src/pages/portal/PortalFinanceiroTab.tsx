import {
  CheckCircle2, Clock, AlertCircle, Ban, DollarSign,
  CalendarDays, History, MessageCircle, ExternalLink, ArrowRight,
} from 'lucide-react'
import { usePortalClient, usePortalPayments, usePortalSupportContacts } from '@/hooks/usePortal'
import { calcFinancialStatus, getFinancialAuxText, hasPaidCurrentCycle } from '@/utils/financial'
import type { FinancialStatus, ContactType } from '@/types'
import { PortalEmpty, portalPanel, portalEyebrow, PortalBlockTitle } from '@/components/portal/PortalUI'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

// ─── Status config ─────────────────────────────────────────────────────────────

const statusConfig: Record<FinancialStatus, {
  icon: React.ReactNode
  color: string          // border + bg
  titleColor: string
  label: string
  message: (aux: string | null) => string
}> = {
  ativo: {
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
    color: 'border-emerald-200 bg-emerald-50',
    titleColor: 'text-emerald-700',
    label: 'Em dia',
    message: (aux) => aux ?? 'Seu plano está em dia. Obrigado!',
  },
  vence_em_breve: {
    icon: <Clock className="w-5 h-5 text-amber-600" />,
    color: 'border-amber-200 bg-amber-50',
    titleColor: 'text-amber-700',
    label: 'Vence em breve',
    message: (aux) => aux ? `${aux}. Fique atento ao pagamento.` : 'Seu pagamento vence em breve.',
  },
  atrasado: {
    icon: <AlertCircle className="w-5 h-5 text-red-600" />,
    color: 'border-red-200 bg-red-50',
    titleColor: 'text-red-700',
    label: 'Pagamento em atraso',
    message: (aux) => aux ? `${aux}. Entre em contato para regularizar.` : 'Seu pagamento está em atraso.',
  },
  cancelado: {
    icon: <Ban className="w-5 h-5 text-zinc-500" />,
    color: 'border-zinc-200 bg-zinc-50',
    titleColor: 'text-zinc-600',
    label: 'Contrato cancelado',
    message: () => 'Seu contrato está cancelado. Entre em contato com a agência para mais informações.',
  },
}

// ─── Contact button ────────────────────────────────────────────────────────────

const contactTypeLabel: Partial<Record<ContactType, string>> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  telefone: 'Telefone',
}

function buildContactHref(type: ContactType, value: string, directLink: string | null): string {
  if (directLink) return directLink
  if (type === 'whatsapp') {
    const digits = value.replace(/\D/g, '')
    const phone = digits.startsWith('55') ? digits : `55${digits}`
    const msg = encodeURIComponent('Olá! Gostaria de falar sobre minha situação financeira.')
    return `https://wa.me/${phone}?text=${msg}`
  }
  if (type === 'email') return `mailto:${value}`
  if (type === 'telefone') return `tel:${value}`
  return value
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PortalFinanceiroTab() {
  const { data: client, isLoading: loadingClient } = usePortalClient()
  const { data: payments = [], isLoading: loadingPayments } = usePortalPayments()
  const { data: contacts = [] } = usePortalSupportContacts()

  // Loading
  if (loadingClient) {
    return <div className="py-12 text-center text-[12px] text-gray-600">Carregando...</div>
  }

  // No financial data configured
  if (!client || (client.valor_mensal == null && client.dia_vencimento == null)) {
    return (
      <PortalEmpty
        title="Financeiro ainda não cadastrado"
        text="A agência ainda não registrou as informações financeiras do seu plano."
      />
    )
  }

  const rawStatus = calcFinancialStatus(client)
  const status = (rawStatus === 'vence_em_breve' || rawStatus === 'atrasado') &&
    hasPaidCurrentCycle(payments, client.dia_vencimento)
    ? 'ativo' as const
    : rawStatus
  const aux = getFinancialAuxText(client, status)
  const cfg = statusConfig[status]

  // Best contact for financial matters: prefer whatsapp, then email, then first available
  const preferOrder: ContactType[] = ['whatsapp', 'email', 'telefone', 'outro']
  const financialContact = contacts
    .slice()
    .sort((a, b) => preferOrder.indexOf(a.contact_type) - preferOrder.indexOf(b.contact_type))[0] ?? null

  // Compute next due date for display
  const nextDueLabel = (() => {
    if (!client.dia_vencimento) return '—'
    const today = new Date()
    const dueThisMonth = new Date(today.getFullYear(), today.getMonth(), client.dia_vencimento)
    const dueDate = dueThisMonth < today
      ? new Date(today.getFullYear(), today.getMonth() + 1, client.dia_vencimento)
      : dueThisMonth
    return dueDate.toLocaleDateString('pt-BR')
  })()

  const STATUS_DOT: Record<FinancialStatus, string> = {
    ativo: '#22C55E', vence_em_breve: '#EAB308', atrasado: '#EF4444', cancelado: '#94A3B8',
  }

  // "2026-09-01" → "Setembro de 2026"; qualquer outro formato aparece como veio
  const monthLabel = (ref: string) => {
    const m = /^(\d{4})-(\d{2})/.exec(ref)
    if (!m) return ref
    const d = new Date(+m[1], +m[2] - 1, 1)
    const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  return (
    <div className="space-y-5 w-full max-w-full min-w-0">

      {/* ── Manchete: mensalidade grande + situação ── */}
      <div className={`${portalPanel} overflow-hidden grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr]`}>
        <div className="p-6 sm:p-9 min-w-0">
          <span
            className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-[#E4E7EC] text-[12px] font-semibold text-[#0F172A]"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_DOT[status] }} />
            {cfg.label}
          </span>
          <p className={`${portalEyebrow} mt-7`}>Mensalidade</p>
          <p
            className="font-display font-bold text-[#0F172A] tabular-nums leading-none tracking-[-0.05em] mt-3 break-words"
            style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}
          >
            {client.valor_mensal != null ? fmtBRL(client.valor_mensal) : '—'}
          </p>
          <p className="text-[13.5px] text-[#5B6576] mt-5 leading-relaxed max-w-[48ch] break-words">
            {cfg.message(aux)}
          </p>
        </div>
        <div className="border-t lg:border-t-0 lg:border-l border-[#EEF0F3] divide-y divide-[#EEF0F3]">
          <div className="p-6 sm:px-8 sm:py-7">
            <p className="flex items-center gap-2 text-[12px] text-[#5B6576]">
              <CalendarDays className="w-3.5 h-3.5 text-[#8A94A6]" /> Próximo vencimento
            </p>
            <p className="font-display text-[28px] font-bold tabular-nums tracking-[-0.03em] text-[#0F172A] mt-2">{nextDueLabel}</p>
            {client.dia_vencimento != null && (
              <p className="text-[12px] text-[#8A94A6] mt-1">Todo dia {client.dia_vencimento}</p>
            )}
          </div>
          <div className="p-6 sm:px-8 sm:py-7">
            <p className="flex items-center gap-2 text-[12px] text-[#5B6576]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#8A94A6]" /> Último pagamento
            </p>
            <p className="font-display text-[28px] font-bold tabular-nums tracking-[-0.03em] text-[#0F172A] mt-2">
              {fmtDate(client.last_payment_date)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Histórico ── */}
      <section className={`${portalPanel} overflow-hidden min-w-0`}>
        <PortalBlockTitle
          label="Histórico de pagamentos"
          count={payments.length > 0 ? payments.length : undefined}
          right={<History className="w-4 h-4 text-[#A0A8B5]" />}
        />

        {loadingPayments && (
          <div className="px-6 py-6 text-center text-[12.5px] text-[#8A94A6]">Carregando...</div>
        )}

        {!loadingPayments && payments.length === 0 && (
          <div className="px-6 py-10 text-center">
            <p className="text-[13px] text-[#5B6576]">Nenhum pagamento registrado ainda.</p>
          </div>
        )}

        {!loadingPayments && payments.length > 0 && (
          <div className="divide-y divide-[#EEF0F3]">
            {payments.map(p => (
              <div key={p.id} className="relative flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-6 pl-6 pr-5 sm:pr-6 py-4 min-w-0">
                <span className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r ${p.status === 'pago' ? 'bg-[#22C55E]' : 'bg-[#EF4444]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#0F172A] break-words">{monthLabel(p.reference_month)}</p>
                  {p.notes && <p className="text-[12px] text-[#8A94A6] truncate mt-0.5">{p.notes}</p>}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <p className="text-[12px] text-[#8A94A6] tabular-nums">{fmtDate(p.payment_date)}</p>
                  <p className="text-[14px] font-semibold text-[#0F172A] tabular-nums sm:w-28 sm:text-right">{fmtBRL(p.amount)}</p>
                  <span className={`text-[11px] font-semibold ${p.status === 'pago' ? 'text-[#15803D]' : 'text-[#B91C1C]'}`}>
                    {p.status === 'pago' ? 'Pago' : 'Atrasado'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Contato do financeiro ── */}
      {financialContact && (
        <div className="relative overflow-hidden rounded-[22px] p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5 min-w-0" style={{ background: '#0F172A' }}>
          <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 90% at 100% 0%, rgba(37,99,235,0.35) 0%, transparent 70%)' }} />
          <div className="relative flex-1 min-w-0">
            <p className="font-display text-[22px] sm:text-[26px] font-bold tracking-[-0.03em] leading-tight" style={{ color: '#ffffff' }}>
              Precisa de ajuda com o financeiro?
            </p>
            <p className="text-[13px] mt-1.5" style={{ color: '#B6C2D6' }}>Fale direto com a nossa equipe.</p>
          </div>
          <a
            href={buildContactHref(financialContact.contact_type, financialContact.contact_value, financialContact.direct_link)}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative w-full sm:w-auto flex items-center justify-center gap-2.5 h-11 pl-5 pr-1.5 rounded-full bg-white text-[13px] font-semibold text-[#0F172A] transition-all hover:gap-3.5"
          >
            {financialContact.contact_type === 'whatsapp'
              ? <MessageCircle className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
              : <ExternalLink className="w-4 h-4 text-[#2563EB] flex-shrink-0" />}
            Falar com o financeiro
            {contactTypeLabel[financialContact.contact_type] && (
              <span className="text-[11px] text-[#8A94A6] font-medium">{contactTypeLabel[financialContact.contact_type]}</span>
            )}
            <span className="w-8 h-8 rounded-full bg-[#0F172A] flex items-center justify-center transition-transform duration-300 group-hover:-rotate-45">
              <ArrowRight className="w-3.5 h-3.5" style={{ color: '#ffffff' }} />
            </span>
          </a>
        </div>
      )}
    </div>
  )
}
