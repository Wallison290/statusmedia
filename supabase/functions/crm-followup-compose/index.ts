// Sugestões e prévia. Não envia WhatsApp nem altera leads ou configurações.
import { createClient } from 'npm:@supabase/supabase-js@2.47.0'
import OpenAI from 'npm:openai@4.73.0'
import { consumeAi, aiDeniedMessage } from '../_shared/plans.ts'
import {
  buildFollowupPrompt, cleanFollowupMessage, normalizeFollowupStyle,
  normalizeFollowupDays, type FollowupPromptArgs,
} from '../_shared/followup-style.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json' },
})
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Não autenticado.' }, 401)
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    // Todas as leituras de dados do CRM passam pelo RLS do usuário autenticado.
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await client.auth.getUser(auth.slice(7))
    if (authError || !user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401)
    const bodyText = await req.text()
    if (bodyText.length > 1_000_000) return json({ error: 'Configuração muito grande.' }, 413)
    let body
    try { body = JSON.parse(bodyText) } catch { return json({ error: 'Solicitação inválida.' }, 400) }
    if (!body || !['suggest', 'preview'].includes(body.action) || !uuid(body.agencyId) || !uuid(body.offerId)) {
      return json({ error: 'Escolha um serviço cadastrado.' }, 400)
    }
    // Os dias vêm da tela: a prévia vale para a sequência que a agência está editando
    const days = normalizeFollowupDays(body.days)
    if (body.action === 'preview' && (!uuid(body.leadId) || !days.includes(body.step))) {
      return json({ error: 'Escolha um lead e um contato válido.' }, 400)
    }
    const { data: offer, error: offerError } = await client.from('crm_offers').select('*')
      .eq('user_id', body.agencyId).eq('id', body.offerId).maybeSingle()
    if (offerError) throw offerError
    // A agência usada na cota vem de uma linha autorizada por RLS, não de um ID arbitrário.
    if (!offer) return json({ error: 'Serviço não encontrado ou sem acesso.' }, 404)
    if (!offer.product?.trim()) return json({ error: 'Preencha o campo "O que você vende" no briefing antes de gerar mensagens.' }, 400)

    let lead: FollowupPromptArgs['lead'] = {}
    let conversation: FollowupPromptArgs['conversation'] = []
    if (body.action === 'preview') {
      const { data: found, error } = await client.from('crm_leads').select('name, company, notes, followup_offer_id')
        .eq('user_id', offer.user_id).eq('id', body.leadId).is('archived_at', null).maybeSingle()
      if (error) throw error
      if (!found) return json({ error: 'Lead não encontrado ou sem acesso.' }, 404)
      if (found.followup_offer_id && found.followup_offer_id !== offer.id) {
        return json({ error: 'Este lead está vinculado a outro serviço. Selecione o briefing dele para a prévia.' }, 400)
      }
      if (!found.followup_offer_id) {
        const { data: agencyOffers, error: offersError } = await client.from('crm_offers')
          .select('id, is_default').eq('user_id', offer.user_id).order('created_at')
        if (offersError) throw offersError
        const defaultOffer = agencyOffers?.find(item => item.is_default) ?? agencyOffers?.[0]
        if (defaultOffer?.id !== offer.id) return json({ error: 'Este lead usa o serviço padrão da agência. Escolha o serviço padrão para a prévia.' }, 400)
      }
      lead = found
      const { data: messages, error: messagesError } = await client.from('crm_messages')
        .select('direction, text, source, sent_at').eq('user_id', offer.user_id).eq('lead_id', body.leadId)
        .order('sent_at', { ascending: false }).limit(100)
      if (messagesError) throw messagesError
      conversation = messages ?? []
      if (!conversation.length) return json({ error: 'Este lead ainda não tem conversa registrada para contextualizar a prévia.' }, 400)
    }
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) return json({ error: 'Geração de mensagens indisponível no momento.' }, 503)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const quota = await consumeAi(admin, offer.user_id, 'ai_messages')
    if (!quota.allowed) return json({ error: aiDeniedMessage(quota, 'ai_messages'), usage: quota }, quota.reason === 'limit_reached' ? 429 : 403)
    const { data: profile } = await admin.from('profiles').select('agency_name, full_name').eq('id', offer.user_id).maybeSingle()
    const agency = profile?.agency_name || profile?.full_name || 'a agência'
    const style = normalizeFollowupStyle(body.style)
    const ai = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 0 })
    if (body.action === 'preview') {
      const prompt = buildFollowupPrompt({ agency, lead, offer, conversation, step: body.step, days, style })
      const response = await ai.chat.completions.create({
        model: 'gpt-4o-mini', temperature: 0.6, max_tokens: prompt.maxTokens,
        messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
      })
      const message = cleanFollowupMessage(response.choices[0]?.message?.content ?? '')
      if (!message) throw new Error('empty_generation')
      const lastReal = conversation.find(message => message.source !== 'followup')
      return json({ message, usage: quota, warning: lastReal?.direction === 'in'
        ? 'O lead falou por último. Esta é uma simulação; o follow-up automático aguarda sua resposta ao lead.' : null })
    }
    const prompts = days.map(step => ({
      step, ...buildFollowupPrompt({ agency, lead: {}, offer, conversation: [], step, days, style }),
    }))
    const format = JSON.stringify({ messages: Object.fromEntries(days.map(step => [String(step), 'texto'])) })
    const response = await ai.chat.completions.create({
      model: 'gpt-4o-mini', temperature: 0.6, max_tokens: 450 * days.length,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content:
        `Crie ${days.length} sugestões de mensagens de referência para o serviço descrito nos prompts. Siga as regras de escrita de cada prompt. Não existe lead concreto: não invente conversa, nome, necessidade ou resultados. Use apenas informações reais do briefing. As mensagens precisam ser diferentes entre si e funcionar como norte adaptável, nunca roteiro fixo. Nunca use emojis ou carinhas. Retorne apenas JSON no formato ${format}.` },
      { role: 'user', content: JSON.stringify(prompts) }],
    })
    const result = JSON.parse(response.choices[0]?.message?.content ?? '{}')
    const messages = Object.fromEntries(days.map(step => {
      const value = result?.messages?.[String(step)]
      const message = typeof value === 'string' ? cleanFollowupMessage(value).slice(0, 1000) : ''
      if (!message) throw new Error('empty_generation')
      return [String(step), message]
    }))
    return json({ messages, usage: quota })
  } catch (error) {
    // Não devolver histórico, briefing ou credenciais em erros do provedor.
    console.error('crm-followup-compose:', error instanceof Error ? error.name : 'generation_error')
    return json({ error: 'Não foi possível gerar a mensagem. Tente novamente em instantes.' }, 500)
  }
})
