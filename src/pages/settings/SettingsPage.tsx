// ── Configurações ─────────────────────────────────────────────────────────────
// Um lugar só para tudo que ajusta o sistema: a conta da pessoa, o WhatsApp da
// agência, a base do Financeiro e o CRM. Antes cada aba guardava as suas
// (/whatsapp, /crm/configuracoes, Financeiro › Contas e categorias); essas
// rotas agora redirecionam para cá. Cada seção é uma rota própria
// (/configuracoes/<secao>) para link direto e voltar do navegador.

import { Link, Navigate, useParams } from 'react-router-dom'
import {
  UserRound, MessageCircle, Wallet, Repeat, MessagesSquare, Magnet, FileText, Lock,
  type LucideIcon,
} from 'lucide-react'
import { usePlanFeature, PlanLocked } from '@/components/plan/PlanLocked'
import { useFinBootstrap } from '@/hooks/useFinance'
import { useTheme } from '@/contexts/ThemeContext'
import { WhatsAppSettings } from '@/pages/whatsapp/WhatsAppPage'
import { CrmSettingsArea, type CrmSettingsAreaKey } from '@/pages/crm/CrmSettingsPage'
import { SettingsTab as FinanceSettings } from '@/pages/financial/SettingsTab'
import { TabSkeleton } from '@/pages/financial/finUi'
import { AccountSettings } from './AccountSettings'

interface SectionDef {
  key:   string
  group: 'Sua conta' | 'Agência' | 'CRM'
  label: string
  /** Linha curta no menu */
  hint:  string
  /** Texto de abertura da seção */
  intro: string
  icon:  LucideIcon
  /** Área do CRM completo (planos Pro e Agency) */
  crm?:  CrmSettingsAreaKey
}

const SECTIONS: SectionDef[] = [
  { key: 'conta',          group: 'Sua conta', label: 'Perfil e acesso',       icon: UserRound,
    hint: 'Seus dados, tema e senha',
    intro: 'O que é seu: nome, foto, aparência do sistema, senha e o plano da agência.' },
  { key: 'whatsapp',       group: 'Agência',   label: 'WhatsApp',              icon: MessageCircle,
    hint: 'Número da agência e avisos',
    intro: 'O número que envia as mensagens da agência e quem recebe cada aviso: você, os clientes e os grupos.' },
  { key: 'financeiro',     group: 'Agência',   label: 'Contas e categorias',   icon: Wallet,
    hint: 'Base do Financeiro',
    intro: 'As contas onde o dinheiro entra e sai, e as categorias que organizam os lançamentos e o resultado do mês.' },
  { key: 'crm-followup',   group: 'CRM',       label: 'Follow-up',             icon: Repeat,          crm: 'followup',
    hint: 'Serviços e conversas automáticas',
    intro: 'Os serviços que você vende e como o sistema conversa sozinho com cada lead até a resposta.' },
  { key: 'crm-mensagens',  group: 'CRM',       label: 'Mensagens e lembretes', icon: MessagesSquare,  crm: 'mensagens',
    hint: 'Textos prontos e aviso diário',
    intro: 'Etiquetas do WhatsApp, mensagens prontas para enviar com um clique e o lembrete diário dos retornos.' },
  { key: 'crm-leads',      group: 'CRM',       label: 'Entrada de leads',      icon: Magnet,          crm: 'capture',
    hint: 'Formulário e dados do cliente',
    intro: 'Um lead é um possível cliente. Defina como ele chega ao funil e quais informações você quer guardar.' },
  { key: 'crm-documentos', group: 'CRM',       label: 'Propostas e contratos', icon: FileText,        crm: 'documents',
    hint: 'Sua marca e modelos',
    intro: 'A marca que aparece nos documentos, os padrões de cada proposta nova e o modelo de contrato.' },
]

const GROUPS = ['Sua conta', 'Agência', 'CRM'] as const

const num = (i: number) => String(i + 1).padStart(2, '0')

// ── Menu das seções ───────────────────────────────────────────────────────────
// Desktop: coluna fixa à esquerda, agrupada, com o número de cada seção.
// Celular: faixa rolável com sublinhado azul (mesmo padrão das abas do Financeiro).

function SectionNav({ active, crmLocked }: { active: string; crmLocked: boolean }) {
  return (
    <>
      <nav aria-label="Seções das configurações" className="lg:hidden flex w-fit max-w-full gap-0.5 p-1 rounded-full border overflow-x-auto scrollbar-none mb-6" style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
        {SECTIONS.map(s => {
          const on = s.key === active
          return (
            <Link key={s.key} to={`/configuracoes/${s.key}`} aria-current={on ? 'page' : undefined}
              className={`sm-glass-segment flex-shrink-0 h-8 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap transition-colors ${on ? 'is-active font-semibold' : 'font-medium hover:text-[var(--sm-text-1)]'}`}
              style={{ color: on ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>
              {s.group === 'CRM' && <span style={{ color: 'var(--sm-text-4)' }}>CRM ·</span>}
              {s.label}
              {s.crm && crmLocked && <Lock className="w-3 h-3" style={{ color: 'var(--sm-text-4)' }} />}
            </Link>
          )
        })}
      </nav>

      <nav aria-label="Seções das configurações" className="hidden lg:block sticky top-6 space-y-6">
        {GROUPS.map(g => (
          <div key={g}>
            <p className="px-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--sm-text-3)' }}>{g}</p>
            <ul className="space-y-0.5">
              {SECTIONS.filter(s => s.group === g).map(s => {
                const on = s.key === active
                const i = SECTIONS.indexOf(s)
                return (
                  <li key={s.key}>
                    <Link to={`/configuracoes/${s.key}`} aria-current={on ? 'page' : undefined}
                      className={`group relative flex items-start gap-2.5 px-3 py-2 rounded-2xl transition-colors ${on ? 'sm-glass-segment is-active' : 'hover:bg-[var(--sm-bg-alt)]'}`}>
                      {on && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r" style={{ background: '#2563EB' }} />}
                      <span className="min-w-0 flex-1">
                        <span className={`flex items-center gap-1.5 text-[13px] leading-snug transition-colors ${on ? 'font-semibold' : 'font-medium group-hover:!text-[color:var(--sm-text-1)]'}`}
                          style={{ color: on ? 'var(--sm-text-1)' : 'var(--sm-text-2)' }}>
                          {s.label}
                          {s.crm && crmLocked && <Lock className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} />}
                        </span>
                        <span className="block text-[11.5px] leading-snug mt-0.5" style={{ color: 'var(--sm-text-3)' }}>{s.hint}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  )
}

// ── Conteúdo de cada seção ────────────────────────────────────────────────────

function FinanceSection() {
  // Cria as contas e categorias padrão na primeira visita, como no Financeiro
  const { isLoading } = useFinBootstrap()
  if (isLoading) return <TabSkeleton kpis={0} blocks={[220, 300]} />
  return <FinanceSettings />
}

function SectionBody({ section, crmLocked }: { section: SectionDef; crmLocked: boolean }) {
  if (section.crm) {
    if (crmLocked) {
      return (
        <div className="rounded-2xl border" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
          <PlanLocked feature="crmFull" title="CRM completo" compact
            description="Follow-up automático no WhatsApp, propostas, contratos com assinatura e formulário de captura. No seu plano, o CRM tem o funil comercial padrão com os leads movidos à mão." />
        </div>
      )
    }
    return <CrmSettingsArea area={section.crm} />
  }
  switch (section.key) {
    case 'conta':      return <AccountSettings />
    case 'whatsapp':   return <WhatsAppSettings />
    case 'financeiro': return <FinanceSection />
    default:           return null
  }
}

// ── Página ────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { secao } = useParams()
  const { isDark } = useTheme()
  const { ready, allowed: crmFull } = usePlanFeature('crmFull')
  const section = SECTIONS.find(s => s.key === secao)
  if (!section) return <Navigate to="/configuracoes/conta" replace />

  const i = SECTIONS.indexOf(section)
  const crmLocked = ready && !crmFull

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:pt-8">

        {/* ── Cabeçalho (no celular, ao lado do menu) ── */}
        <header className="mb-5 lg:mb-8 max-md:pl-12 max-md:-mt-[3.25rem]">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-3)' }}>Sistema</p>
          <h1 className="font-display text-[30px] md:text-[38px] font-bold leading-[1.02] tracking-[-0.03em]" style={{ color: 'var(--sm-text-1)' }}>
            Configurações
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
            Tudo o que ajusta o sistema ao seu jeito e ao da agência, num lugar só
          </p>
        </header>

        <div className="lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-12 items-start">
          <SectionNav active={section.key} crmLocked={crmLocked} />

          <main className="min-w-0 max-w-3xl">
            {/* Abertura da seção: número grande em azul + título em Bricolage */}
            <div className="flex items-start gap-4 pb-5 mb-7 border-b" style={{ borderColor: 'var(--sm-border)' }}>
              <span className="font-display text-[34px] md:text-[40px] font-bold leading-none tabular-nums tracking-[-0.03em]" style={{ color: '#2563EB' }}>{num(i)}</span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: isDark ? '#60A5FA' : '#2563EB' }}>{section.group}</p>
                <h2 className="font-display text-[22px] md:text-[26px] font-bold leading-tight tracking-[-0.01em]" style={{ color: 'var(--sm-text-1)' }}>{section.label}</h2>
                <p className="text-[13px] mt-1 max-w-[60ch]" style={{ color: 'var(--sm-text-3)' }}>{section.intro}</p>
              </div>
            </div>

            <SectionBody key={section.key} section={section} crmLocked={crmLocked} />
          </main>
        </div>
      </div>
    </div>
  )
}
