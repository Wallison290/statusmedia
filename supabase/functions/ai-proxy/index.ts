// ── ai-proxy: chamadas OpenAI não-streaming ───────────────────────────────────
// greeting        → frase do Dashboard; não consome cota (só exige assinatura ativa)
// report-analysis → análise do relatório; consome a cota ai_reports do plano
// Cotas e limites: migration 093 (ai_consume / agency_active_plan).

import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { agencyIdFor } from '../_shared/agency.ts'
import { consumeAi, aiDeniedMessage } from '../_shared/plans.ts'

const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? ''
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  const sb   = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'Não autenticado' }, 401)
  const { data: { user } } = await sb.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return json({ error: 'Não autenticado' }, 401)
  // Sócio age como o dono da agência (migration 088)
  const agencyId = await agencyIdFor(user.id)

  const { type, payload } = await req.json()

  try {
    let content: string | null = null
    let usage: { used: number; limit: number } | undefined

    switch (type) {
      case 'greeting': {
        const { data: plan } = await sb.rpc('agency_active_plan', { p_agency: agencyId })
        if (!plan) return json({ error: 'Assinatura inativa.' }, 403)
        const { stats, hour, dayName } = payload
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Você é um assistente de dashboard para uma agência de social media. Responda APENAS com JSON válido, sem markdown, sem code block.' },
            { role: 'user', content: `Situação atual da agência (${dayName}, ${hour}h):\n- Clientes ativos: ${stats.active_clients} de ${stats.total_clients}\n- Conteúdos aguardando aprovação: ${stats.period_pending_approval}\n- Aprovados no período: ${stats.period_approved}\n- Tarefas pendentes: ${stats.pending_tasks}\n- Tarefas atrasadas: ${stats.overdue_tasks}\n\nRetorne APENAS este JSON:\n{\n  "message": "frase curta e inteligente (máx. 12 palavras)",\n  "pills": [{ "icon": "emoji", "label": "texto curto", "variant": "success|warning|default" }]\n}\n\nRegras:\n- 2 a 4 pills\n- "warning" APENAS se há atrasos\n- "success" para conquistas\n- Tom profissional e direto` },
          ],
          max_tokens: 220,
        })
        content = res.choices[0].message.content
        break
      }

      case 'report-analysis': {
        const quota = await consumeAi(sb, agencyId, 'ai_reports')
        if (!quota.allowed) {
          return json({ error: aiDeniedMessage(quota, 'ai_reports'), usage: quota }, quota.reason === 'limit_reached' ? 429 : 403)
        }
        usage = { used: quota.used, limit: quota.limit }
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Você é um analista de social media sênior de uma agência. Escreva uma análise mensal do desempenho no Instagram para apresentar AO CLIENTE, em português do Brasil. Estruture em parágrafos curtos: (1) visão geral do mês (crescimento de seguidores, alcance, engajamento); (2) destaques de conteúdo (as melhores publicações e por que performaram); (3) perfil da audiência (gênero, faixa etária e principais cidades); (4) 2 a 3 recomendações práticas para o próximo mês. Se o JSON também tiver um campo "planejamento" com dados de execução do calendário de conteúdo, inclua um parágrafo adicional (5) sobre a execução do planejamento do mês (quantos conteúdos foram publicados em relação ao planejado, tipos de conteúdo predominantes), antes das recomendações. Se o campo "planejamento" não existir, ignore este item. Tom profissional, claro e positivo, sem exageros. Use APENAS os números fornecidos — não invente dados. Não use markdown nem títulos em negrito. Máximo ~200 palavras.' },
            { role: 'user', content: `Dados do relatório (JSON):\n${JSON.stringify(payload)}` },
          ],
          temperature: 0.6,
          max_tokens: 850,
        })
        content = res.choices[0].message.content?.trim() ?? null
        break
      }

      default:
        return json({ error: `Tipo desconhecido: ${type}` }, 400)
    }

    return json({ content, usage })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
