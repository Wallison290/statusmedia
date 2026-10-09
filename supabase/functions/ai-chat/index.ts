// ── ai-chat: respostas da IA em streaming (SSE) ──────────────────────────────
// Usado por dois recursos do CRM, cada um com a sua cota do plano (migration 093):
//   kind 'assistant' → assistente do funil (ai_assistant, plano Agency)
//   kind 'message'   → "Sugerir com IA" na ficha do lead (ai_messages, Pro e Agency)
// O chat livre da antiga StatusIA (imagem, visão, busca na web) foi removido.

import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { agencyIdFor } from '../_shared/agency.ts'
import { consumeAi, aiDeniedMessage, type AiKind } from '../_shared/plans.ts'

const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? ''
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const KINDS: Record<string, AiKind> = { assistant: 'ai_assistant', message: 'ai_messages' }

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const sseOnce = (content: string) =>
  new Response(`data: ${JSON.stringify({ content })}\n\ndata: [DONE]\n\n`,
    { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const sb   = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const auth = req.headers.get('Authorization')
  if (!auth) return jsonError('Não autenticado', 401)
  const { data: { user } } = await sb.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return jsonError('Não autenticado', 401)
  // Sócio age como o dono da agência (migration 088)
  const agencyId = await agencyIdFor(user.id)

  const { messages, systemPrompt, kind } = await req.json()
  const quotaKind = KINDS[kind]
  if (!quotaKind) return jsonError('Uso de IA não reconhecido.', 400)
  if (!Array.isArray(messages) || messages.length === 0) return jsonError('Mensagem vazia.', 400)

  const quota = await consumeAi(sb, agencyId, quotaKind)
  if (!quota.allowed) return jsonError(aiDeniedMessage(quota, quotaKind), quota.reason === 'limit_reached' ? 429 : 403)

  const chat: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: String(systemPrompt ?? '').slice(0, 20000) },
    ...(messages as { role: string; content: string }[]).slice(-20).map(m => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: String(m.content ?? '').slice(0, 8000),
    })),
  ]

  // Erros da OpenAI voltam como texto no stream, com CORS (senão o navegador
  // mostra só "Failed to fetch")
  let stream
  try {
    stream = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: chat, stream: true, max_tokens: 1500 })
  } catch (err: unknown) {
    return sseOnce(`❌ Erro: ${err instanceof Error ? err.message : String(err)}`)
  }

  const encoder  = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? ''
          if (delta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } finally { controller.close() }
    },
  })

  return new Response(readable, {
    headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
})
