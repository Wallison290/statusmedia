// ── Camada de acesso às Edge Functions de IA ──────────────────────────────────
// ai-proxy (resposta única: saudação do Dashboard, análise de relatório) e
// ai-chat (streaming/SSE: assistente do CRM, mensagem sugerida para o lead).
// Cada uso consome a sua cota do plano (migration 093); quando a cota nega,
// a função devolve a mensagem pronta para o usuário em `error`.

import { supabase } from '@/integrations/supabase/client'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ── Chamadas não-streaming ─────────────────────────────────────────────────────

export async function callProxy<T extends { content?: string | null }>(
  type: 'greeting' | 'report-analysis',
  payload: unknown,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: { type, payload },
  })

  if (error) {
    // Resposta 4xx: a mensagem útil (ex.: cota esgotada) vem no corpo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await (error as any).context?.json?.().catch(() => null)
    throw new Error(body?.error ?? error.message)
  }
  if (data?.error) throw new Error(data.error)

  return data as T
}

// ── Streaming via SSE ──────────────────────────────────────────────────────────

/** 'assistant' = assistente do CRM · 'message' = mensagem sugerida para o lead */
export type AiChatKind = 'assistant' | 'message'

export async function streamChat(
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt: string,
  kind: AiChatKind,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ messages, systemPrompt, kind }),
    signal,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body?.error ?? `HTTP ${response.status}`)
  }

  const reader  = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer       = ''
  let fullContent  = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      try {
        const { content } = JSON.parse(line.slice(6)) as { content?: string }
        if (content) {
          fullContent += content
          onChunk(content)
        }
      } catch {
        // ignora linhas malformadas
      }
    }
  }

  return fullContent
}
