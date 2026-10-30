// ── Adiantar o código das telas ──────────────────────────────────────────────
// Cada aba é um pedaço de código separado (lazy em App.tsx), baixado só no
// primeiro clique. Aqui:
//   • preloadRoute(href): ao passar o mouse/tocar no menu, já baixa a tela;
//   • preloadAllRoutes(): com o sistema parado depois do login, baixa as abas
//     uma de cada vez, para o primeiro clique não esperar.
// O import() é o mesmo de App.tsx, então o navegador reaproveita o arquivo.

const ROUTES: [prefix: string, load: () => Promise<unknown>][] = [
  ['/dashboard',     () => import('@/pages/Dashboard')],
  ['/crm',           () => import('@/pages/crm/CrmBoard')],
  ['/clients',       () => import('@/pages/clients/ClientList')],
  ['/feed',          () => import('@/pages/feed/FeedOrganizer')],
  ['/reports',       () => import('@/pages/reports/ReportsOverview')],
  ['/planner',       () => import('@/pages/planner/Planner')],
  ['/tasks',         () => import('@/pages/tasks/Tasks')],
  ['/notes',         () => import('@/pages/notes/Notes')],
  ['/instagram',     () => import('@/pages/instagram/InstagramPage')],
  ['/financial',     () => import('@/pages/financial/FinancePage')],
  ['/equipe',        () => import('@/pages/team/TeamPage')],
  ['/configuracoes', () => import('@/pages/settings/SettingsPage')],
  ['/assinatura',    () => import('@/pages/Subscription')],
]

const done = new Set<string>()

export function preloadRoute(href: string) {
  const hit = ROUTES.find(([p]) => href === p || href.startsWith(p + '/'))
  if (!hit || done.has(hit[0])) return
  done.add(hit[0])
  hit[1]().catch(() => done.delete(hit[0]))   // falhou (rede): tenta de novo no próximo
}

/** Baixa as outras abas aos poucos, com o navegador ocioso. Pula em conexão/aparelho fraco. */
export function preloadAllRoutes() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number }
  if (nav.connection?.saveData || /2g/.test(nav.connection?.effectiveType ?? '') || (nav.deviceMemory ?? 8) <= 2) return
  const idle = (cb: () => void) =>
    typeof (window as any).requestIdleCallback === 'function' ? (window as any).requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 400)
  let i = 0
  const next = () => {
    while (i < ROUTES.length && done.has(ROUTES[i][0])) i++
    if (i >= ROUTES.length) return
    const [prefix, load] = ROUTES[i++]
    done.add(prefix)
    load().catch(() => done.delete(prefix)).finally(() => idle(next))
  }
  idle(next)
}
