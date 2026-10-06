import { useFinAudit, fmtBRL, type FinAuditEvent } from '@/hooks/useFinance'
import { Card, EmptyState } from './finUi'

const TABLE_LABEL: Record<string, string> = {
  fin_entries: 'lançamento', fin_recurrences: 'recorrência', fin_accounts: 'conta',
  fin_categories: 'categoria', fin_transfers: 'transferência',
}
const FIELD_LABEL: Record<string, string> = {
  amount: 'valor', due_date: 'vencimento', status: 'situação', paid_at: 'data do pagamento',
  paid_amount: 'valor pago', description: 'descrição', category_id: 'categoria', account_id: 'conta',
  client_id: 'cliente', counterparty: 'fornecedor', notes: 'observação', is_active: 'ativo',
  day_of_month: 'dia do vencimento', name: 'nome', initial_balance: 'saldo inicial', end_date: 'término',
  interval_months: 'periodicidade', competence: 'competência', color: 'cor',
}
const HIDDEN = new Set(['category_id', 'account_id', 'client_id', 'competence', 'color'])

function fmtVal(k: string, v: any) {
  if (v == null || v === '') return '—'
  if (['amount', 'paid_amount', 'initial_balance'].includes(k)) return fmtBRL(Number(v))
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00').toLocaleDateString('pt-BR')
  if (k === 'status') return ({ aberto: 'em aberto', pago: 'pago', cancelado: 'cancelado' } as any)[v] ?? v
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  return String(v)
}

function describe(ev: FinAuditEvent) {
  const what = TABLE_LABEL[ev.table_name] ?? 'registro'
  if (ev.action !== 'alterou' || !ev.changes) return null
  const parts = Object.entries(ev.changes)
    .filter(([k]) => !HIDDEN.has(k))
    .map(([k, c]: [string, any]) => `${FIELD_LABEL[k] ?? k}: ${fmtVal(k, c.de)} → ${fmtVal(k, c.para)}`)
  if (Object.keys(ev.changes).some(k => HIDDEN.has(k)) && !parts.length) parts.push(`dados do ${what}`)
  return parts.join(' · ')
}

export function HistoryTab() {
  const { data: events = [], isLoading } = useFinAudit(150)
  if (isLoading) return <p className="py-12 text-center text-[13px]" style={{ color: 'var(--sm-text-3)' }}>Carregando...</p>
  return (
    <div className="space-y-2">
      <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>
        Tudo que foi criado, alterado ou excluído no Financeiro, e por quem. "Sistema" são as mensalidades e parcelas geradas automaticamente.
      </p>
      <Card>
        {events.length === 0 ? <EmptyState title="Nenhuma alteração ainda" /> : events.map((ev, i) => {
          const detail = describe(ev)
          const d = new Date(ev.at)
          return (
            <div key={ev.id} className={`px-4 py-2.5 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
              <p className="text-[13px]" style={{ color: 'var(--sm-text-2)' }}>
                <strong style={{ color: 'var(--sm-text-1)' }}>{ev.actor_name ?? 'Sistema'}</strong>{' '}
                {ev.action} {TABLE_LABEL[ev.table_name] ?? 'registro'}{' '}
                {ev.summary && <span style={{ color: 'var(--sm-text-1)' }}>“{ev.summary}”</span>}
              </p>
              <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--sm-text-4)' }}>
                {d.toLocaleDateString('pt-BR')} às {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {detail && <> · {detail}</>}
              </p>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
