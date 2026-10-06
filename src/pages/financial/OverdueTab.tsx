import { useMemo, useState } from 'react'
import { MessageCircle, Check, BellOff, Bell } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import {
  useFinOpenUntil, useSendBillingNow, useToggleEntryBillingPause,
  todayISO, fmtBRL, fmtDateBR, daysBetween, type FinEntry,
} from '@/hooks/useFinance'
import { Card, SectionTitle, EmptyState } from './finUi'
import { SettleModal } from './EntryModals'

interface Debtor { key: string; name: string; clientId: string | null; total: number; oldest: string; entries: FinEntry[] }

function group(entries: FinEntry[]): Debtor[] {
  const map = new Map<string, Debtor>()
  for (const e of entries) {
    const key = e.client_id ?? `cp:${(e.counterparty ?? 'Sem nome').toLowerCase()}`
    const name = e.clients?.company_name ?? e.counterparty ?? 'Sem nome'
    const d = map.get(key) ?? { key, name, clientId: e.client_id, total: 0, oldest: e.due_date, entries: [] }
    d.total += e.amount
    if (e.due_date < d.oldest) d.oldest = e.due_date
    d.entries.push(e)
    map.set(key, d)
  }
  return [...map.values()].sort((a, b) => a.oldest.localeCompare(b.oldest))
}

export function OverdueTab() {
  const { toast } = useToast()
  const today = todayISO()
  const yesterday = (() => {
    const d = new Date(Date.now() - 86_400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const { data: open = [], isLoading } = useFinOpenUntil(yesterday)
  const [settling, setSettling] = useState<FinEntry | null>(null)
  const [charging, setCharging] = useState<string | null>(null)
  const sendNow = useSendBillingNow()
  const togglePause = useToggleEntryBillingPause()

  const receivables = useMemo(() => group(open.filter(e => e.type === 'receita')), [open])
  const payables = useMemo(() => open.filter(e => e.type === 'despesa'), [open])
  const totalRec = receivables.reduce((s, d) => s + d.total, 0)

  const charge = async (d: Debtor) => {
    if (!d.clientId) return
    setCharging(d.key)
    try {
      // Mesma mensagem da cobrança automática: total do cliente + Pix Copia e Cola
      await sendNow.mutateAsync(d.clientId)
      toast(`Cobrança enviada para ${d.name}.`, 'success')
    } catch (err: any) {
      toast(err.message ?? 'Não foi possível enviar.', 'error')
    } finally {
      setCharging(null)
    }
  }

  if (isLoading) return <p className="py-12 text-center text-[13px]" style={{ color: 'var(--sm-text-3)' }}>Carregando...</p>

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle n="01" title="Clientes em atraso" right={
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(totalRec)}</span>
        } />
        <Card>
          {receivables.length === 0 ? (
            <EmptyState title="Ninguém em atraso" text="Todos os recebimentos vencidos já foram baixados." />
          ) : receivables.map((d, i) => {
            const days = daysBetween(d.oldest, today)
            return (
              <div key={d.key} className={`px-4 py-3.5 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{d.name}</p>
                    <p className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
                      {d.entries.length} em aberto · mais antigo há{' '}
                      <strong style={{ color: days > 30 ? '#EF4444' : days > 7 ? '#F59E0B' : 'var(--sm-text-2)' }}>{days} dia{days !== 1 ? 's' : ''}</strong>
                    </p>
                  </div>
                  <span className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(d.total)}</span>
                  {d.clientId && (
                    <button onClick={() => charge(d)} disabled={charging === d.key}
                      className="h-9 px-3 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                      style={{ background: 'rgba(37,211,102,0.12)', color: '#25D366' }}>
                      <MessageCircle className="w-4 h-4" /> {charging === d.key ? 'Enviando...' : 'Cobrar no WhatsApp'}
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  {d.entries.map(e => (
                    <div key={e.id} className="flex items-center gap-3 text-[12.5px] rounded-lg px-2.5 py-1.5" style={{ background: 'var(--sm-bg-alt)' }}>
                      <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--sm-text-2)' }}>{e.description}</span>
                      <span className="whitespace-nowrap" style={{ color: 'var(--sm-text-3)' }}>venceu {fmtDateBR(e.due_date)}</span>
                      <span className="font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--sm-text-1)' }}>{fmtBRL(e.amount)}</span>
                      <button onClick={() => togglePause.mutate({ id: e.id, paused: !e.billing_paused })}
                        title={e.billing_paused ? 'Retomar cobrança automática desta parcela' : 'Pausar cobrança automática desta parcela'}
                        aria-label={e.billing_paused ? 'Retomar cobrança automática' : 'Pausar cobrança automática'}
                        className="w-7 h-7 rounded-md flex items-center justify-center" style={{ color: e.billing_paused ? '#F59E0B' : 'var(--sm-text-4)' }}>
                        {e.billing_paused ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => setSettling(e)} title="Registrar recebimento" aria-label="Registrar recebimento"
                        className="w-7 h-7 rounded-md flex items-center justify-center" style={{ color: '#22C55E' }}>
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </Card>
        <p className="text-[11.5px] mt-2" style={{ color: 'var(--sm-text-4)' }}>
          A cobrança sai pelos canais da aba Cobrança automática, com o total do cliente e o Pix Copia e Cola. O sino pausa a cobrança automática de uma parcela (ex.: acordo combinado).
        </p>
      </section>

      <section>
        <SectionTitle n="02" title="Contas a pagar vencidas" />
        <Card>
          {payables.length === 0 ? (
            <EmptyState title="Nenhuma conta a pagar vencida" />
          ) : payables.map((e, i) => (
            <div key={e.id} className={`px-4 py-3 flex items-center gap-3 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{e.description}</p>
                <p className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
                  {e.counterparty ?? 'Sem fornecedor'} · venceu {fmtDateBR(e.due_date)} ({daysBetween(e.due_date, today)} dias)
                </p>
              </div>
              <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-2)' }}>− {fmtBRL(e.amount)}</span>
              <button onClick={() => setSettling(e)} className="h-8 px-2.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
                <Check className="w-3.5 h-3.5" /> Paguei
              </button>
            </div>
          ))}
        </Card>
      </section>

      <SettleModal entry={settling} onClose={() => setSettling(null)} />
    </div>
  )
}
