// ── Financeiro ────────────────────────────────────────────────────────────────
// Fase 1 (migration 090): livro de lançamentos a receber e a pagar, contas,
// categorias, recorrências, inadimplência, fluxo de caixa e histórico.
// A aba "Clientes" é a tela antiga de mensalidades (ClientBillingTab).

import { useSearchParams } from 'react-router-dom'
import { useFinBootstrap } from '@/hooks/useFinance'
import { ClientBillingTab } from './Financial'
import { OverviewTab } from './OverviewTab'
import { EntriesTab } from './EntriesTab'
import { OverdueTab } from './OverdueTab'
import { RecurrencesTab } from './RecurrencesTab'
import { SettingsTab } from './SettingsTab'
import { HistoryTab } from './HistoryTab'
import { BillingTab } from './BillingTab'
import { InvoicesTab } from './InvoicesTab'
import { TabSkeleton } from './finUi'

const TABS = [
  { id: 'visao',          label: 'Visão geral' },
  { id: 'lancamentos',    label: 'Lançamentos' },
  { id: 'inadimplencia',  label: 'Inadimplência' },
  { id: 'cobranca',       label: 'Cobrança automática' },
  { id: 'notas',          label: 'Notas fiscais' },
  { id: 'clientes',       label: 'Clientes' },
  { id: 'recorrencias',   label: 'Recorrências' },
  { id: 'configuracoes',  label: 'Contas e categorias' },
  { id: 'historico',      label: 'Histórico' },
] as const
type TabId = typeof TABS[number]['id']

export function FinancePage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('aba')
  const tab: TabId = TABS.some(t => t.id === raw) ? (raw as TabId) : 'visao'
  const goTo = (t: string) => setParams(p => { p.set('aba', t); return p }, { replace: false })
  const { isLoading: booting } = useFinBootstrap()

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <header className="mb-5 max-md:pl-12 max-md:-mt-[3.25rem]">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Gestão da agência</p>
          <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>Financeiro</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>Contas a receber e a pagar, fluxo de caixa, cobranças e notas fiscais</p>
        </header>

        <nav className="flex gap-1 overflow-x-auto scrollbar-none border-b mb-5 -mx-4 px-4 md:mx-0 md:px-0" style={{ borderColor: 'var(--sm-border)' }} aria-label="Seções do Financeiro">
          {TABS.map(t => (
            <button key={t.id} onClick={() => goTo(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={`h-10 px-3 text-[13px] whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? 'font-semibold' : 'opacity-75 hover:opacity-100'}`}
              style={{ borderColor: tab === t.id ? '#2563EB' : 'transparent', color: tab === t.id ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>
              {t.label}
            </button>
          ))}
        </nav>

        {booting ? (
          <TabSkeleton kpis={5} blocks={[300, 200]} />
        ) : (
          <>
            {tab === 'visao' && <OverviewTab goTo={goTo} />}
            {tab === 'lancamentos' && <EntriesTab />}
            {tab === 'inadimplencia' && <OverdueTab />}
            {tab === 'cobranca' && <BillingTab />}
            {tab === 'notas' && <InvoicesTab />}
            {tab === 'clientes' && <ClientBillingTab />}
            {tab === 'recorrencias' && <RecurrencesTab />}
            {tab === 'configuracoes' && <SettingsTab />}
            {tab === 'historico' && <HistoryTab />}
          </>
        )}
      </div>
    </div>
  )
}
