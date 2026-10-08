// ── Painel de Admin — visão de todos os usuários e clientes do sistema ────────
// Só carrega dados quando profile.is_admin === true. Os dados vêm de RPCs
// dedicadas (admin_list_profiles/admin_list_clients/admin_list_subscriptions,
// ver useAdmin.ts) — não de policies de RLS nas tabelas, para que o "ver
// tudo" fique restrito só a esta tela e não vaze para Clientes/Financeiro do
// próprio admin. Nenhum dado de senha é lido, exibido ou armazenado aqui.
//
// Visual: padrão editorial do sistema. Status/categoria aparecem como ponto
// colorido + texto em cor de tema (legível em qualquer tema, sem fundo
// translúcido + texto claro, que some no tema claro).

import { useMemo, useState } from 'react'
import { ShieldCheck, Users, Building2, Search, ChevronDown, UsersRound } from 'lucide-react'
import { useAdminUsers, useAdminClients, type AdminUserRow, type AdminClientRow } from '@/hooks/useAdmin'
import { formatDate, statusLabels } from '@/utils/formatters'
import { calcFinancialStatus, financialStatusLabel } from '@/utils/financial'
import type { PlanId } from '@/config/plans'

type Tab = 'users' | 'clients' | 'byAgency'
type UserFilter = 'todos' | 'agencia' | 'portal' | 'pagante' | 'trial'

const PLAN_LABEL: Record<PlanId, string> = { starter: 'Starter', pro: 'Pro', agency: 'Agency' }

const USER_FILTER_LABELS: Record<UserFilter, string> = {
  todos: 'Todos',
  agencia: 'Contas de agência',
  portal: 'Clientes com portal',
  pagante: 'Assinantes pagantes',
  trial: 'Em trial',
}

const ROLE_COLOR: Record<'agency' | 'client', string> = {
  agency: '#2563EB',
  client: '#8B5CF6',
}

const SUB_STATUS_CFG: Record<string, { label: string; color: string }> = {
  active:   { label: 'Pagante',   color: '#10B981' },
  trialing: { label: 'Trial',     color: '#2563EB' },
  past_due: { label: 'Em atraso', color: '#F59E0B' },
  canceled: { label: 'Cancelado', color: '#EF4444' },
  inactive: { label: 'Inativo',   color: '#94A3B8' },
}

const FIN_STATUS_COLOR: Record<string, string> = {
  ativo:          '#10B981',
  vence_em_breve: '#F59E0B',
  atrasado:       '#EF4444',
  cancelado:      '#94A3B8',
}

const card = { background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' } as const
const eyebrow = 'text-[10.5px] font-semibold uppercase tracking-[0.08em]'

// Colunas fixas: os valores ficam alinhados na vertical em todas as linhas.
const USER_COLS   = 'md:grid md:grid-cols-[minmax(0,1fr)_170px_90px_110px_90px] md:items-center md:gap-x-4'
const CLIENT_COLS = 'md:grid md:grid-cols-[minmax(0,1fr)_190px_110px_130px_90px] md:items-center md:gap-x-4'
const AGENCY_COLS = 'md:grid md:grid-cols-[minmax(0,1fr)_90px_110px_90px_24px] md:items-center md:gap-x-4'

function Dot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap" style={{ color: 'var(--sm-text-2)' }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {children}
    </span>
  )
}

function KpiStrip({ items }: { items: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className={`rounded-2xl border grid grid-cols-2 ${items.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-px overflow-hidden`}
      style={{ background: 'var(--sm-border)', borderColor: 'var(--sm-border)' }}>
      {items.map(k => (
        <div key={k.label} className="px-4 md:px-5 py-3.5" style={{ background: 'var(--sm-bg-card)' }}>
          <p className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>{k.label}</p>
          <p className="font-display text-[26px] font-bold leading-tight tabular-nums mt-0.5" style={{ color: 'var(--sm-text-1)' }}>{k.value}</p>
          {k.sub && <p className="text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>{k.sub}</p>}
        </div>
      ))}
    </div>
  )
}

function ListHeader({ cols, labels }: { cols: string; labels: string[] }) {
  return (
    <div className={`max-md:hidden px-4 py-2.5 border-b ${cols}`} style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
      {labels.map((l, i) => (
        <span key={i} className={`${eyebrow} ${i === labels.length - 1 && l ? 'text-right' : ''}`} style={{ color: 'var(--sm-text-4)' }}>{l}</span>
      ))}
    </div>
  )
}

function Avatar({ label, size = 36 }: { label: string; size?: number }) {
  return (
    <span className="rounded-lg flex items-center justify-center font-bold flex-shrink-0"
      style={{ width: size, height: size, background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)', fontSize: Math.round(size * 0.36) }}>
      {label[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-[84px] rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
      <div className="h-[320px] rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return <div className="py-16 text-center text-[13px]" style={{ color: '#EF4444' }}>{msg}</div>
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-dashed py-14 text-center text-[13px]" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
      {msg}
    </div>
  )
}

// ─── Aba: Usuários ──────────────────────────────────────────────────────────

function UsersTab({ search }: { search: string }) {
  const { data: rows = [], isLoading, error } = useAdminUsers()
  const [filter, setFilter] = useState<UserFilter>('todos')

  const counts = useMemo(() => ({
    todos: rows.length,
    agencia: rows.filter(r => r.role === 'agency').length,
    portal: rows.filter(r => r.role === 'client').length,
    pagante: rows.filter(r => r.subStatus === 'active').length,
    trial: rows.filter(r => r.subStatus === 'trialing').length,
  }), [rows])

  const filtered = useMemo(() => {
    let list = rows
    if (filter === 'agencia') list = list.filter(r => r.role === 'agency')
    else if (filter === 'portal') list = list.filter(r => r.role === 'client')
    else if (filter === 'pagante') list = list.filter(r => r.subStatus === 'active')
    else if (filter === 'trial') list = list.filter(r => r.subStatus === 'trialing')

    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(r =>
      r.email.toLowerCase().includes(q) ||
      (r.full_name ?? '').toLowerCase().includes(q) ||
      (r.agency_name ?? '').toLowerCase().includes(q)
    )
  }, [rows, filter, search])

  if (isLoading) return <Skeleton />
  if (error) return <ErrorMsg msg={`Erro ao carregar usuários: ${(error as Error).message}`} />

  return (
    <div className="space-y-5">
      <KpiStrip items={[
        { label: 'Contas de agência', value: String(counts.agencia) },
        { label: 'Clientes com portal', value: String(counts.portal), sub: 'acesso via /portal' },
        { label: 'Assinantes pagantes', value: String(counts.pagante) },
        { label: 'Em trial', value: String(counts.trial) },
      ]} />

      {/* Filtros */}
      <div className="flex gap-1 flex-wrap">
        {(Object.keys(USER_FILTER_LABELS) as UserFilter[]).map(key => {
          const ativo = filter === key
          return (
            <button key={key} onClick={() => setFilter(key)} aria-pressed={ativo}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] transition-colors hover:bg-black/5"
              style={ativo
                ? { background: 'var(--sm-bg-card)', color: 'var(--sm-text-1)', fontWeight: 600, boxShadow: 'inset 0 0 0 1px var(--sm-border)' }
                : { color: 'var(--sm-text-3)', fontWeight: 500 }}>
              {USER_FILTER_LABELS[key]}
              <span className="tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{counts[key]}</span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? <Empty msg="Nenhum usuário encontrado." /> : (
        <div className="rounded-2xl border overflow-hidden" style={card}>
          <ListHeader cols={USER_COLS} labels={['Usuário', 'Agência', 'Plano', 'Assinatura', 'Cadastro']} />
          {filtered.map((u, i) => {
            const subCfg = u.subStatus ? SUB_STATUS_CFG[u.subStatus] : null
            const role = u.role === 'client' ? 'client' : 'agency'
            return (
              <div key={u.id} className={`px-4 py-3 hover:bg-black/[0.02] transition-colors ${USER_COLS} ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar label={u.full_name || u.email} />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{u.full_name || '—'}</p>
                    <p className="text-[12px] truncate" style={{ color: 'var(--sm-text-4)' }}>{u.email}</p>
                  </div>
                </div>
                <div className="max-md:flex max-md:flex-wrap max-md:gap-x-4 max-md:gap-y-1 max-md:mt-2 max-md:pl-12 md:contents">
                  <span className="min-w-0 flex flex-col">
                    <Dot color={ROLE_COLOR[role]}>{role === 'client' ? 'Cliente (portal)' : 'Agência'}</Dot>
                    {u.agency_name && <span className="text-[11.5px] truncate md:pl-3" style={{ color: 'var(--sm-text-4)' }}>{u.agency_name}</span>}
                  </span>
                  <span className="text-[12.5px] font-medium" style={{ color: u.plan ? 'var(--sm-text-1)' : 'var(--sm-text-4)' }}>
                    {u.plan ? (PLAN_LABEL[u.plan] ?? u.plan) : '—'}
                  </span>
                  <span>{subCfg ? <Dot color={subCfg.color}>{subCfg.label}</Dot> : <span className="text-[12px]" style={{ color: 'var(--sm-text-4)' }}>—</span>}</span>
                  <span className="text-[12px] md:text-right tabular-nums" style={{ color: 'var(--sm-text-3)' }}>{formatDate(u.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Aba: Clientes ──────────────────────────────────────────────────────────

function ClientsTab({ search }: { search: string }) {
  const { data: rows = [], isLoading, error } = useAdminClients()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(c =>
      c.company_name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.responsible_name ?? '').toLowerCase().includes(q) ||
      (c.ownerAgencyName ?? '').toLowerCase().includes(q) ||
      (c.ownerEmail ?? '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const kpis = useMemo(() => {
    const totalMrr = rows.reduce((s, c) => s + (c.valor_mensal ?? 0), 0)
    const active = rows.filter(c => c.status === 'ativo' || c.status === 'fechado').length
    return { total: rows.length, active, totalMrr }
  }, [rows])

  if (isLoading) return <Skeleton />
  if (error) return <ErrorMsg msg={`Erro ao carregar clientes: ${(error as Error).message}`} />

  return (
    <div className="space-y-5">
      <KpiStrip items={[
        { label: 'Clientes cadastrados', value: String(kpis.total), sub: 'somando todas as agências' },
        { label: 'Ativos', value: String(kpis.active) },
        { label: 'Faturamento somado', value: `R$ ${kpis.totalMrr.toLocaleString('pt-BR')}`, sub: 'soma de valor_mensal' },
      ]} />

      {filtered.length === 0 ? <Empty msg="Nenhum cliente encontrado." /> : (
        <div className="rounded-2xl border overflow-hidden" style={card}>
          <ListHeader cols={CLIENT_COLS} labels={['Cliente', 'Agência', 'Status', 'Financeiro', 'Entrada']} />
          {filtered.map((c, i) => {
            const finStatus = calcFinancialStatus(c)
            return (
              <div key={c.id} className={`px-4 py-3 hover:bg-black/[0.02] transition-colors ${CLIENT_COLS} ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  {c.logo_url
                    ? <img src={c.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                    : <Avatar label={c.company_name} />}
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{c.company_name}</p>
                    <p className="text-[12px] truncate" style={{ color: 'var(--sm-text-4)' }}>{c.email || c.responsible_name || '—'}</p>
                  </div>
                </div>
                <div className="max-md:flex max-md:flex-wrap max-md:gap-x-4 max-md:gap-y-1 max-md:mt-2 max-md:pl-12 md:contents">
                  <span className="min-w-0">
                    <span className="block text-[12.5px] truncate" style={{ color: 'var(--sm-text-2)' }}>{c.ownerAgencyName || '—'}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: 'var(--sm-text-4)' }}>{c.ownerEmail || 'sem dono'}</span>
                  </span>
                  <span className="text-[12.5px]" style={{ color: 'var(--sm-text-2)' }}>{statusLabels[c.status] ?? c.status}</span>
                  <span>
                    {c.valor_mensal != null
                      ? <Dot color={FIN_STATUS_COLOR[finStatus] ?? '#94A3B8'}>{financialStatusLabel(finStatus)}</Dot>
                      : <span className="text-[12px]" style={{ color: 'var(--sm-text-4)' }}>—</span>}
                  </span>
                  <span className="text-[12px] md:text-right tabular-nums" style={{ color: 'var(--sm-text-3)' }}>{formatDate(c.entry_date)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Aba: Usuários & Clientes (agrupado por agência) ─────────────────────────

function AgencyGroupCard({ agency, clients, first }: { agency: AdminUserRow; clients: AdminClientRow[]; first: boolean }) {
  const [open, setOpen] = useState(false)
  const subCfg = agency.subStatus ? SUB_STATUS_CFG[agency.subStatus] : null

  return (
    <div className={first ? '' : 'border-t'} style={{ borderColor: 'var(--sm-border)' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`w-full text-left px-4 py-3 hover:bg-black/[0.02] transition-colors ${AGENCY_COLS}`}>
        <div className="flex items-center gap-3 min-w-0">
          <Avatar label={agency.agency_name || agency.full_name || agency.email} />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{agency.agency_name || agency.full_name || 'Sem nome'}</p>
            <p className="text-[12px] truncate" style={{ color: 'var(--sm-text-4)' }}>{agency.email}</p>
          </div>
        </div>
        <div className="max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-4 max-md:gap-y-1 max-md:mt-2 max-md:pl-12 md:contents">
          <span className="text-[12.5px] font-medium" style={{ color: agency.plan ? 'var(--sm-text-1)' : 'var(--sm-text-4)' }}>
            {agency.plan ? (PLAN_LABEL[agency.plan] ?? agency.plan) : '—'}
          </span>
          <span>{subCfg ? <Dot color={subCfg.color}>{subCfg.label}</Dot> : <span className="text-[12px]" style={{ color: 'var(--sm-text-4)' }}>—</span>}</span>
          <span className="text-[12.5px] md:text-right tabular-nums" style={{ color: 'var(--sm-text-2)' }}>
            <strong style={{ color: 'var(--sm-text-1)' }}>{clients.length}</strong> cliente{clients.length !== 1 ? 's' : ''}
          </span>
          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform max-md:ml-auto ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--sm-text-4)' }} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-3 md:pl-16">
          {clients.length === 0 ? (
            <p className="text-[12.5px] py-2" style={{ color: 'var(--sm-text-3)' }}>Essa agência ainda não cadastrou clientes.</p>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
              {clients.map((c, i) => {
                const finStatus = calcFinancialStatus(c)
                return (
                  <div key={c.id} className={`flex items-center gap-3 px-3 py-2 flex-wrap sm:flex-nowrap ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                    {c.logo_url
                      ? <img src={c.logo_url} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
                      : <Avatar label={c.company_name} size={28} />}
                    <p className="text-[12.5px] font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--sm-text-1)' }}>{c.company_name}</p>
                    <span className="text-[12px] flex-shrink-0" style={{ color: 'var(--sm-text-3)' }}>{statusLabels[c.status] ?? c.status}</span>
                    {c.valor_mensal != null && <Dot color={FIN_STATUS_COLOR[finStatus] ?? '#94A3B8'}>{financialStatusLabel(finStatus)}</Dot>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AgencyGroupsTab({ search }: { search: string }) {
  const { data: users = [], isLoading: loadingUsers, error: usersError } = useAdminUsers()
  const { data: clients = [], isLoading: loadingClients, error: clientsError } = useAdminClients()

  const agencies = useMemo(() => users.filter(u => u.role === 'agency'), [users])

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    return agencies
      .map(agency => ({
        agency,
        clients: clients.filter(c => c.user_id === agency.id),
      }))
      .filter(({ agency, clients: cs }) => {
        if (!q) return true
        const agencyMatch =
          (agency.agency_name ?? '').toLowerCase().includes(q) ||
          (agency.full_name ?? '').toLowerCase().includes(q) ||
          agency.email.toLowerCase().includes(q)
        const clientMatch = cs.some(c => c.company_name.toLowerCase().includes(q))
        return agencyMatch || clientMatch
      })
  }, [agencies, clients, search])

  const isLoading = loadingUsers || loadingClients
  const error = usersError || clientsError

  if (isLoading) return <Skeleton />
  if (error) return <ErrorMsg msg={`Erro ao carregar dados: ${(error as Error).message}`} />

  return (
    <div className="space-y-5">
      <KpiStrip items={[
        { label: 'Agências', value: String(agencies.length) },
        { label: 'Clientes cadastrados', value: String(clients.length), sub: 'somando todas as agências' },
        { label: 'Média por agência', value: agencies.length > 0 ? (clients.length / agencies.length).toFixed(1) : '0' },
      ]} />

      {groups.length === 0 ? <Empty msg="Nenhuma agência encontrada." /> : (
        <div className="rounded-2xl border overflow-hidden" style={card}>
          <ListHeader cols={AGENCY_COLS} labels={['Agência', 'Plano', 'Assinatura', 'Clientes', '']} />
          {groups.map(({ agency, clients: cs }, i) => (
            <AgencyGroupCard key={agency.id} agency={agency} clients={cs} first={i === 0} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>('users')
  const [search, setSearch] = useState('')

  const TABS = [
    { id: 'users' as Tab,    label: 'Usuários',            Icon: Users },
    { id: 'clients' as Tab,  label: 'Clientes',            Icon: Building2 },
    { id: 'byAgency' as Tab, label: 'Usuários & Clientes', Icon: UsersRound },
  ]

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Cabeçalho (no celular, ao lado do menu) */}
        <header className="mb-5 max-md:pl-12 max-md:-mt-[3.25rem]">
          <p className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>
            <ShieldCheck className="w-3.5 h-3.5" /> Restrito
          </p>
          <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>
            Painel de Admin
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
            Visão de todos os usuários e clientes cadastrados no sistema. Visível só para você.
          </p>
        </header>

        {/* Abas sublinhadas + busca */}
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b mb-5" style={{ borderColor: 'var(--sm-border)' }}>
          <div className="flex items-end gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden -mb-px">
            {TABS.map(({ id, label, Icon }) => {
              const ativo = tab === id
              return (
                <button key={id} onClick={() => setTab(id)} aria-current={ativo ? 'page' : undefined}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 h-10 px-3 border-b-2 text-[13px] whitespace-nowrap transition-colors"
                  style={{ borderColor: ativo ? '#2563EB' : 'transparent', color: ativo ? 'var(--sm-text-1)' : 'var(--sm-text-3)', fontWeight: ativo ? 600 : 500 }}>
                  <Icon className="w-4 h-4" style={{ color: ativo ? '#2563EB' : 'var(--sm-text-4)' }} /> {label}
                </button>
              )
            })}
          </div>
          <div className="relative w-full sm:w-64 pb-2">
            <Search className="absolute left-3 top-[calc(50%-4px)] -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--sm-text-4)' }} />
            <input
              type="text"
              placeholder={tab === 'users' ? 'Buscar usuário...' : tab === 'clients' ? 'Buscar cliente...' : 'Buscar agência ou cliente...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-xl border text-[13px] focus:outline-none focus:border-[#2563EB]/50 transition-colors placeholder:text-[color:var(--sm-text-4)]"
              style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
            />
          </div>
        </div>

        {tab === 'users' && <UsersTab search={search} />}
        {tab === 'clients' && <ClientsTab search={search} />}
        {tab === 'byAgency' && <AgencyGroupsTab search={search} />}
      </div>
    </div>
  )
}
