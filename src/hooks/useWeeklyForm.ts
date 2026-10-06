import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'

// ── Question config ───────────────────────────────────────────────────────────

export type QuestionSlot =
  | 'qDoubts' | 'qObjections' | 'qHighlights' | 'qDemands'
  | 'qCases'  | 'qTrends'     | 'qFaq'        | 'qSuggestions' | 'qImportant'

export interface QuestionConfig {
  key: QuestionSlot
  enabled: boolean
  emoji: string
  title: string
  question: string
  placeholder: string
}

export const DEFAULT_QUESTIONS: QuestionConfig[] = [
  {
    key: 'qDoubts', enabled: true, emoji: '❓',
    title: 'Principais dúvidas recebidas na semana',
    question: 'Quais dúvidas os clientes mais fizeram nesta semana?',
    placeholder: 'Descreva as dúvidas mais frequentes que você recebeu...',
  },
  {
    key: 'qObjections', enabled: true, emoji: '🛑',
    title: 'Objeções encontradas',
    question: 'Houve alguma objeção recorrente durante atendimentos ou vendas?',
    placeholder: 'Ex: preço, prazo, confiança, comparação com concorrentes...',
  },
  {
    key: 'qHighlights', enabled: true, emoji: '🌟',
    title: 'Temas que merecem destaque',
    question: 'Existe algum serviço, produto ou solução que precisa receber mais visibilidade?',
    placeholder: 'Descreva o que precisa ser mais divulgado ou destacado...',
  },
  {
    key: 'qDemands', enabled: true, emoji: '📋',
    title: 'Demandas do setor',
    question: 'Seu setor identificou alguma necessidade de comunicação ou conteúdo?',
    placeholder: 'Ex: explicar um processo, divulgar um serviço, corrigir informações...',
  },
  {
    key: 'qCases', enabled: true, emoji: '💼',
    title: 'Casos e experiências da semana',
    question: 'Houve algum caso interessante, resultado ou situação que possa virar conteúdo?',
    placeholder: 'Conte um caso de atendimento, resultado alcançado ou situação relevante...',
  },
  {
    key: 'qTrends', enabled: true, emoji: '📈',
    title: 'Tendências percebidas',
    question: 'Você percebeu alguma tendência ou assunto muito comentado pelos clientes?',
    placeholder: 'Descreva comportamentos, temas em alta ou padrões que você percebeu...',
  },
  {
    key: 'qFaq', enabled: false, emoji: '🔁',
    title: 'Perguntas Frequentes (FAQ)',
    question: 'Quais perguntas foram feitas repetidamente nesta semana?',
    placeholder: 'Liste as perguntas que você mais ouviu dos clientes...',
  },
  {
    key: 'qSuggestions', enabled: false, emoji: '💡',
    title: 'Sugestões de conteúdo',
    question: 'Existe algum conteúdo que você acredita que deveríamos produzir?',
    placeholder: 'Sugira temas, formatos, ideias de posts, vídeos ou outros conteúdos...',
  },
  {
    key: 'qImportant', enabled: false, emoji: '🔒',
    title: 'Informações importantes',
    question: 'Existe alguma informação estratégica que a equipe de marketing precisa saber?',
    placeholder: 'Compartilhe qualquer informação relevante que impacte a comunicação...',
  },
]

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklyFormConfig {
  id: string
  client_id: string
  user_id: string
  day_of_week: number          // 0=Dom 1=Seg … 6=Sáb
  is_active: boolean
  public_token: string
  custom_questions: QuestionConfig[] | null
  created_at: string
  updated_at: string
}

export interface WeeklyFormResponse {
  id: string
  config_id: string
  client_id: string
  week_reference: string       // YYYY-MM-DD (segunda da semana)
  respondent_name: string
  respondent_role: string
  q_doubts: string | null
  q_objections: string | null
  q_highlights: string | null
  q_demands: string | null
  q_cases: string | null
  q_trends: string | null
  q_faq: string | null
  q_suggestions: string | null
  q_important: string | null
  is_internal: boolean
  user_id: string | null
  created_at: string
}

// ── Config hooks ──────────────────────────────────────────────────────────────

export function useWeeklyFormConfig(clientId: string) {
  return useQuery({
    queryKey: ['weekly-form-config', clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('weekly_form_configs')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle()
      if (error) throw error
      return data as WeeklyFormConfig | null
    },
    enabled: !!clientId,
  })
}

export function useUpsertWeeklyFormConfig() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()
  return useMutation({
    mutationFn: async (payload: {
      clientId: string
      dayOfWeek: number
      isActive: boolean
      existingId?: string
      customQuestions?: QuestionConfig[] | null
    }) => {
      if (payload.existingId) {
        const updateData: Record<string, unknown> = {
          day_of_week: payload.dayOfWeek,
          is_active: payload.isActive,
          updated_at: new Date().toISOString(),
        }
        if (payload.customQuestions !== undefined) {
          updateData.custom_questions = payload.customQuestions
        }
        const { data, error } = await (supabase as any)
          .from('weekly_form_configs')
          .update(updateData)
          .eq('id', payload.existingId)
          .select()
          .single()
        if (error) throw error
        return data as WeeklyFormConfig
      } else {
        const { data, error } = await (supabase as any)
          .from('weekly_form_configs')
          .insert({
            client_id: payload.clientId,
            user_id: agencyId!,
            day_of_week: payload.dayOfWeek,
            is_active: payload.isActive,
            custom_questions: payload.customQuestions ?? null,
          })
          .select()
          .single()
        if (error) throw error
        return data as WeeklyFormConfig
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['weekly-form-config', vars.clientId] })
    },
  })
}

// ── Responses hooks ───────────────────────────────────────────────────────────

export function useWeeklyFormResponses(clientId: string) {
  return useQuery({
    queryKey: ['weekly-form-responses', clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('weekly_form_responses')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as WeeklyFormResponse[]
    },
    enabled: !!clientId,
    refetchInterval: 60_000,
  })
}

export function useDeleteWeeklyFormResponse(clientId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (responseId: string) => {
      const { error } = await (supabase as any)
        .from('weekly_form_responses')
        .delete()
        .eq('id', responseId)
      if (error) {
        const msg = (error as { message?: string }).message || JSON.stringify(error)
        throw new Error(msg)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekly-form-responses', clientId] })
    },
  })
}

// ── Submit response (usado tanto interno quanto público) ──────────────────────

export interface SubmitFormPayload {
  configId: string
  clientId: string
  respondentName: string
  respondentRole: string
  qDoubts: string
  qObjections: string
  qHighlights: string
  qDemands: string
  qCases: string
  qTrends: string
  qFaq: string
  qSuggestions: string
  qImportant: string
  isInternal: boolean
  userId?: string
}

export async function submitWeeklyFormResponse(payload: SubmitFormPayload) {
  const monday = getMonday(new Date())

  // Não usamos .select() após o insert para evitar exigir permissão de SELECT
  // no formulário público (usuários anônimos só têm permissão de INSERT)
  const { error } = await (supabase as any)
    .from('weekly_form_responses')
    .insert({
      config_id:       payload.configId,
      client_id:       payload.clientId,
      week_reference:  monday,
      respondent_name: payload.respondentName,
      respondent_role: payload.respondentRole,
      q_doubts:        payload.qDoubts       || null,
      q_objections:    payload.qObjections   || null,
      q_highlights:    payload.qHighlights   || null,
      q_demands:       payload.qDemands      || null,
      q_cases:         payload.qCases        || null,
      q_trends:        payload.qTrends       || null,
      q_faq:           payload.qFaq          || null,
      q_suggestions:   payload.qSuggestions  || null,
      q_important:     payload.qImportant    || null,
      is_internal:     payload.isInternal,
      user_id:         payload.userId        || null,
    })

  if (error) {
    const msg = (error as { message?: string }).message || JSON.stringify(error)
    throw new Error(msg)
  }
}

// ── Config by public token (sem auth) ────────────────────────────────────────

export async function fetchConfigByToken(token: string) {
  // RPC SECURITY DEFINER: valida o token dentro da função, no banco — a
  // tabela weekly_form_configs não é mais legível direto por anon (evitava
  // que qualquer chamada à API, sem passar pelo app, listasse os tokens de
  // todos os clientes só filtrando por is_active=true).
  const { data, error } = await (supabase as any)
    .rpc('get_weekly_form_config_by_token', { p_token: token })
  if (error) throw error
  return data as (WeeklyFormConfig & { clients: { company_name: string } }) | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMonday(d: Date): string {
  const date = new Date(d)
  const day  = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return date.toISOString().slice(0, 10)
}

/** Retorna as perguntas efetivas do formulário:
 *  usa custom_questions se configurado, senão usa os defaults. */
export function resolveQuestions(config: WeeklyFormConfig | null | undefined): QuestionConfig[] {
  if (config?.custom_questions && config.custom_questions.length > 0) {
    return config.custom_questions
  }
  return DEFAULT_QUESTIONS
}

export const DAY_LABELS = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
]
