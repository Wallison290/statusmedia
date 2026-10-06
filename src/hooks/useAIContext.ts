import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import type { Client, PlannerItem, BrandDNA } from '@/types'
import { resolveAgencyId } from '@/hooks/useAuth'

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface AIUserMemory {
  id: string
  user_id: string
  key: string
  value: string
  created_at: string
  updated_at: string
}

export interface AIClientMemory {
  id: string
  client_id: string
  user_id: string
  key: string
  value: string
  created_at: string
  updated_at: string
}

// ── Hooks: memória persistente da agência/usuário ─────────────────────────────
export function useAIUserMemory() {
  return useQuery({
    queryKey: ['ai_user_memory'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const agencyId = user ? await resolveAgencyId(user.id) : null
      if (!user) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_user_memory')
        .select('*')
        .eq('user_id', agencyId!)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as AIUserMemory[]
    },
  })
}

export function useUpsertAIUserMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const agencyId = user ? await resolveAgencyId(user.id) : null
      if (!user) throw new Error('Não autenticado')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_user_memory')
        .upsert(
          { user_id: agencyId!, key, value, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,key' }
        )
        .select()
        .single()
      if (error) throw error
      return data as AIUserMemory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_user_memory'] }),
  })
}

export function buildUserMemoryContext(memories: AIUserMemory[]): string | null {
  if (memories.length === 0) return null
  const lines = [
    '━━━ MEMÓRIAS DA AGÊNCIA ━━━',
    '',
    'Fatos aprendidos sobre esta agência e sua forma de trabalhar:',
  ]
  memories.forEach(m => lines.push(`  • ${m.key.replace(/_/g, ' ')}: ${m.value}`))
  lines.push('')
  lines.push('Use esses dados para personalizar suas respostas quando relevante.')
  return lines.join('\n')
}

// ── Hook: memória persistente por cliente ──────────────────────────────────────
export function useAIMemory(clientId: string | null) {
  return useQuery({
    queryKey: ['ai_client_memory', clientId],
    queryFn: async () => {
      if (!clientId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_client_memory')
        .select('*')
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as AIClientMemory[]
    },
    enabled: !!clientId,
  })
}

export function useUpsertAIMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      clientId,
      key,
      value,
    }: {
      clientId: string
      key: string
      value: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const agencyId = user ? await resolveAgencyId(user.id) : null
      if (!user) throw new Error('Não autenticado')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_client_memory')
        .upsert(
          { client_id: clientId, user_id: agencyId!, key, value, updated_at: new Date().toISOString() },
          { onConflict: 'client_id,user_id,key' }
        )
        .select()
        .single()
      if (error) throw error
      return data as AIClientMemory
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ai_client_memory', vars.clientId] })
    },
  })
}

// ── Builder de contexto ────────────────────────────────────────────────────────
// Monta um bloco de texto rico para injetar no system prompt da IA

const statusLabels: Record<string, string> = {
  lead: 'Lead',
  proposta: 'Em proposta',
  fechado: 'Fechado',
  onboarding: 'Onboarding',
  ativo: 'Ativo',
  pausado: 'Pausado',
  encerrado: 'Encerrado',
}

const financialLabels: Record<string, string> = {
  ativo: 'Em dia',
  vence_em_breve: 'Vence em breve',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
}

const plannerStatusLabels: Record<string, string> = {
  ideia: 'ideia',
  producao: 'em produção',
  revisao: 'em revisão',
  aprovado: 'aprovado',
  publicado: 'publicado',
}

const contentTypeLabels: Record<string, string> = {
  post: 'Post',
  carrossel: 'Carrossel',
  reels: 'Reels',
  story: 'Story',
  educativo: 'Educativo',
  venda: 'Venda',
  autoridade: 'Autoridade',
  engajamento: 'Engajamento',
}

export function buildClientContext(
  client: Client,
  plannerItems: PlannerItem[],
  brandDna: BrandDNA | null,
  memories: AIClientMemory[],
): string {
  const today = new Date()

  // Agrupa todos os posts por mês (YYYY-MM)
  const byMonth: Record<string, typeof plannerItems> = {}
  plannerItems.forEach(p => {
    const ym = p.scheduled_date?.slice(0, 7) ?? 'sem-data'
    if (!byMonth[ym]) byMonth[ym] = []
    byMonth[ym].push(p)
  })

  const lines: string[] = []

  lines.push('━━━ CONTEXTO DO CLIENTE ATIVO ━━━')
  lines.push('')

  // Dados básicos
  lines.push(`**Empresa:** ${client.company_name}`)
  lines.push(`**Responsável:** ${client.responsible_name}`)
  lines.push(`**Nicho:** ${client.niche}`)
  if (client.instagram)          lines.push(`**Instagram:** @${client.instagram.replace('@', '')}`)
  if (client.website)            lines.push(`**Website:** ${client.website}`)
  lines.push(`**Status do contrato:** ${statusLabels[client.status] ?? client.status}`)
  if (client.financial_status)   lines.push(`**Financeiro:** ${financialLabels[client.financial_status] ?? client.financial_status}`)
  if (client.valor_mensal)       lines.push(`**Mensalidade:** R$ ${client.valor_mensal.toLocaleString('pt-BR')}`)
  lines.push('')

  // Estratégia
  if (client.main_objective)     lines.push(`**Objetivo principal:** ${client.main_objective}`)
  if (client.target_audience)    lines.push(`**Público-alvo:** ${client.target_audience}`)
  if (client.tone_of_voice)      lines.push(`**Tom de voz:** ${client.tone_of_voice}`)
  if (client.communication_style) lines.push(`**Estilo de comunicação:** ${client.communication_style}`)
  if (client.differentials)      lines.push(`**Diferenciais:** ${client.differentials}`)
  if (client.services_offered)   lines.push(`**Serviços/produtos:** ${client.services_offered}`)
  if (client.forbidden_words)    lines.push(`**Palavras proibidas:** ${client.forbidden_words}`)
  if (client.observations)       lines.push(`**Observações:** ${client.observations}`)
  lines.push('')

  // DNA de marca
  if (brandDna) {
    lines.push('**DNA de Marca:**')
    if (brandDna.how_brand_speaks)     lines.push(`  • Como a marca fala: ${brandDna.how_brand_speaks}`)
    if (brandDna.how_brand_not_speaks) lines.push(`  • Como a marca NÃO fala: ${brandDna.how_brand_not_speaks}`)
    if (brandDna.positioning)          lines.push(`  • Posicionamento: ${brandDna.positioning}`)
    if (brandDna.ideal_language)       lines.push(`  • Linguagem ideal: ${brandDna.ideal_language}`)
    if (brandDna.mental_triggers)      lines.push(`  • Gatilhos mentais: ${brandDna.mental_triggers}`)
    // Este campo era gravado mas nunca lido — a agência preenchia e a IA
    // ignorava. Na tela ele se chamava "Estilo de Comunicação", colidindo com
    // o campo de tom da Visão Geral; o conteúdo real sempre foi a estrutura
    // narrativa do post.
    if (brandDna.communication_style)  lines.push(`  • Estrutura do conteúdo: ${brandDna.communication_style}`)
    lines.push('')
  }

  // Planejamento completo por mês
  if (plannerItems.length > 0) {
    lines.push('**Conteúdos já planejados (NÃO repita nem sugira duplicatas destes temas/títulos):**')
    lines.push('')

    Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([ym, items]) => {
        const [year, month] = ym.split('-')
        const monthLabel = new Date(Number(year), Number(month) - 1, 1)
          .toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
        const pub  = items.filter(p => p.status === 'publicado').length
        const apv  = items.filter(p => p.status === 'aprovado').length
        const prod = items.filter(p => p.status === 'producao').length
        const pend = items.filter(p => p.approval_status === 'pendente_aprovacao').length
        const adj  = items.filter(p => p.approval_status === 'ajuste_solicitado').length

        lines.push(`  📅 ${monthLabel} — ${items.length} posts (${pub} publicados · ${apv} aprovados · ${prod} em prod. · ${pend} aguardando · ${adj} com ajuste)`)
        items.forEach(p => {
          const date = new Date(p.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          const type = contentTypeLabels[p.content_type] ?? p.content_type
          const status = plannerStatusLabels[p.status] ?? p.status
          lines.push(`    • ${date} [${type}] "${p.title}" — ${status}`)
        })
        lines.push('')
      })
  }

  // Memórias aprendidas
  if (memories.length > 0) {
    lines.push('**Decisões e aprendizados anteriores:**')
    memories.forEach(m => {
      lines.push(`  • ${m.key}: ${m.value}`)
    })
    lines.push('')
  }

  lines.push('━━━ FIM DO CONTEXTO ━━━')
  lines.push('')
  lines.push('Use todas essas informações para dar respostas precisas e personalizadas para este cliente. Não precisa repetir esses dados para o usuário — apenas use-os para contextualizar suas respostas.')

  return lines.join('\n')
}

// ── Hook que monta o contexto completo de um cliente ──────────────────────────
export function useClientContext(clientId: string | null) {
  return useQuery({
    queryKey: ['ai_client_context', clientId],
    queryFn: async () => {
      if (!clientId) return null

      // Busca em paralelo: cliente, planner (mês atual + próximo), brand DNA, memórias
      const now = new Date()
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      // Inclui o mês atual e o próximo mês (para planejamentos adiantados)
      const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 3, 0)
        .toISOString().split('T')[0]

      const [clientRes, plannerRes, dnaRes, memRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).single(),
        supabase
          .from('planner')
          .select('*')
          .eq('client_id', clientId)
          .gte('scheduled_date', startOfMonth)
          .lte('scheduled_date', endOfNextMonth)
          .order('scheduled_date', { ascending: true }),
        supabase.from('brand_dna').select('*').eq('client_id', clientId).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('ai_client_memory')
          .select('*')
          .eq('client_id', clientId)
          .order('updated_at', { ascending: false })
          .limit(20),
      ])

      if (clientRes.error) throw clientRes.error

      const client      = clientRes.data as Client
      const planner     = (plannerRes.data ?? []) as PlannerItem[]
      const brandDna    = (dnaRes.data ?? null) as BrandDNA | null
      const memories    = (memRes.data ?? []) as AIClientMemory[]

      // eslint-disable-next-line no-console
      console.log('[AI Context] clientId:', clientId, '| planner items:', planner.length, '| range:', startOfMonth, '→', endOfNextMonth, '| error:', plannerRes.error)
      // eslint-disable-next-line no-console
      if (planner.length > 0) console.log('[AI Context] planner sample:', planner[0])

      const contextString = buildClientContext(client, planner, brandDna, memories)
      // eslint-disable-next-line no-console
      console.log('[AI Context] contextString preview (first 500 chars):', contextString.slice(0, 500))

      return {
        client,
        contextString,
      }
    },
    enabled: !!clientId,
    staleTime: 60_000, // 1 minuto — dados do cliente mudam com menos frequência
  })
}
