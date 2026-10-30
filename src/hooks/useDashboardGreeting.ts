import { useState, useEffect, useRef, useCallback } from 'react'
import { callProxy } from '@/lib/aiProxy'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface HeroPill {
  icon: string
  label: string
  variant: 'default' | 'warning' | 'success'
  href?: string
}

export interface DashboardStats {
  total_clients: number
  active_clients: number
  pending_tasks: number
  overdue_tasks: number
  period_pending_approval: number
  period_approved: number
}

export interface GreetingResult {
  greeting: string
  message: string
  pills: HeroPill[]
  isLoading: boolean
  refresh: () => void
}

// ── Cache TTL: 30 minutos ──────────────────────────────────────────────────────

const CACHE_TTL = 30 * 60 * 1000

// ── Injeta hrefs nas pills com base no conteúdo do label ──────────────────────

function withHrefs(pills: HeroPill[]): HeroPill[] {
  return pills.map(pill => {
    if (pill.href) return pill
    const l = pill.label.toLowerCase()
    if (l.includes('cliente'))                                          return { ...pill, href: '/clients' }
    if (l.includes('tarefa') || l.includes('task'))                    return { ...pill, href: '/tasks' }
    if (l.includes('aprovação') || l.includes('aprovacao') ||
        l.includes('conteúdo') || l.includes('conteudo') ||
        l.includes('planner') || l.includes('publicação'))             return { ...pill, href: '/planner' }
    return pill
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export type FridayDrink = 'cerveja' | 'vinho'

/** Saudação do topo do Dashboard. Sem nome (ainda carregando ou não
 *  cadastrado): sem o "você" no lugar, só a saudação. O brinde da sexta é
 *  escolha da pessoa em Configurações › Conta (cerveja 🍺 ou vinho 🍷). */
export function getGreetingText(name: string, drink: FridayDrink = 'cerveja'): string {
  const hour = new Date().getHours()
  const dow  = new Date().getDay() // 5 = sexta
  const n = name ? `, ${name}` : ''

  if (dow === 5) return `Sextou${n}! ${drink === 'vinho' ? '🍷' : '🍺'}`
  if (hour < 12) return `Bom dia${n}.`
  if (hour < 18) return `Boa tarde${n}.`
  return `Boa noite${n}.`
}

function getFallbackPills(stats: DashboardStats): HeroPill[] {
  const pills: HeroPill[] = []

  if (stats.active_clients > 0)
    pills.push({
      icon: '✅',
      label: `${stats.active_clients} de ${stats.total_clients} clientes ativos`,
      variant: 'success',
      href: '/clients',
    })

  if (stats.overdue_tasks > 0)
    pills.push({
      icon: '⚠️',
      label: `${stats.overdue_tasks} tarefa${stats.overdue_tasks > 1 ? 's' : ''} atrasada${stats.overdue_tasks > 1 ? 's' : ''}`,
      variant: 'warning',
      href: '/tasks',
    })

  if (stats.period_pending_approval > 0)
    pills.push({
      icon: '🕐',
      label: `${stats.period_pending_approval} conteúdo${stats.period_pending_approval > 1 ? 's' : ''} aguardando aprovação`,
      variant: 'default',
      href: '/planner',
    })

  if (stats.period_approved > 0 && pills.length < 3)
    pills.push({
      icon: '🚀',
      label: `${stats.period_approved} aprovação${stats.period_approved > 1 ? 'ões' : ''} no período`,
      variant: 'success',
      href: '/planner',
    })

  return pills.slice(0, 4)
}

function getFallbackMessage(stats: DashboardStats, agencyName?: string): string {
  const agency = agencyName ? ` na ${agencyName}` : ''
  if (stats.overdue_tasks > 0)
    return `${stats.overdue_tasks} tarefa${stats.overdue_tasks > 1 ? 's atrasadas' : ' atrasada'}${agency}. Vale dar uma olhada hoje.`
  if (stats.period_approved > 0)
    return `${stats.period_approved} aprovação${stats.period_approved > 1 ? 'ões' : ''}${agency} no período. Ótimo ritmo!`
  if (stats.period_pending_approval > 0)
    return `${stats.period_pending_approval} conteúdo${stats.period_pending_approval > 1 ? 's aguardam' : ' aguarda'} aprovação do cliente${agency}.`
  if (stats.active_clients > 0)
    return `Todos os clientes ativos${agency} estão sem tarefas pendentes. Bom trabalho!`
  return `Sua operação${agency} está organizada. Bom trabalho!`
}

// ── Hook principal ─────────────────────────────────────────────────────────────

export function useDashboardGreeting(
  userId: string | undefined,
  userName: string,
  stats: DashboardStats,
  statsReady: boolean,
  agencyName?: string,
): GreetingResult {
  const [message, setMessage]     = useState('Carregando resumo da sua operação…')
  const [pills, setPills]         = useState<HeroPill[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const hasFetched                = useRef(false)

  const cacheKey = userId ? `dash_greeting_v3_${userId}` : null

  // ── Fetch via Edge Function (com cache localStorage) ──────────────────────
  const fetchGreeting = useCallback(async (forceRefresh = false) => {
    if (!userId || !cacheKey) return

    // Lê cache (se não for refresh forçado)
    if (!forceRefresh) {
      try {
        const raw = localStorage.getItem(cacheKey)
        if (raw) {
          const { msg, pills: cachedPills, ts } = JSON.parse(raw)
          if (Date.now() - ts < CACHE_TTL && typeof msg === 'string') {
            setMessage(msg)
            setPills(withHrefs(cachedPills ?? []))
            setIsLoading(false)
            return
          }
        }
      } catch { /* cache corrompido — regenera */ }
    }

    setIsLoading(true)

    const hour    = new Date().getHours()
    const dayName = new Date().toLocaleDateString('pt-BR', { weekday: 'long' })

    try {
      const { content } = await callProxy<{ content: string }>('greeting', { stats, hour, dayName })
      const json = JSON.parse(content ?? '{}')

      const newMsg   = typeof json.message === 'string' ? json.message : getFallbackMessage(stats, agencyName)
      const rawPills = Array.isArray(json.pills) ? (json.pills as HeroPill[]).slice(0, 4) : getFallbackPills(stats)
      const newPills = withHrefs(rawPills)

      try {
        localStorage.setItem(cacheKey, JSON.stringify({ msg: newMsg, pills: newPills, ts: Date.now() }))
      } catch { /* storage cheio — ignora */ }

      setMessage(newMsg)
      setPills(newPills)
    } catch {
      // Fallback sem IA
      setMessage(getFallbackMessage(stats, agencyName))
      setPills(withHrefs(getFallbackPills(stats)))
    } finally {
      setIsLoading(false)
    }
  }, [userId, cacheKey, stats.active_clients, stats.period_approved, stats.overdue_tasks, stats.period_pending_approval, stats.pending_tasks, stats.total_clients])

  // ── Executa apenas uma vez, após dados carregados ──────────────────────────
  useEffect(() => {
    if (!statsReady || !userId || hasFetched.current) return
    hasFetched.current = true
    fetchGreeting(false)
  }, [statsReady, userId, fetchGreeting])

  return {
    greeting: getGreetingText(userName),
    message,
    pills,
    isLoading,
    refresh: () => {
      hasFetched.current = false
      fetchGreeting(true)
    },
  }
}
