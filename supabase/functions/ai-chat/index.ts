// ── ai-chat: streaming com limites por plano + visão + geração de imagens ──────

import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI, { toFile } from 'npm:openai@4'
import { agencyIdFor } from '../_shared/agency.ts'

const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? ''
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const AI_LIMITS: Record<string, number> = { starter: 150, pro: 600, agency: 2000 }

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function getUser(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user } } = await sb.auth.getUser(auth.replace('Bearer ', ''))
  return user
}

async function checkUsage(userId: string, cost = 1): Promise<{ allowed: boolean; plan: string; limit: number; reason?: string }> {
  const sb    = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const month = new Date().toISOString().slice(0, 7)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (sb as any).from('subscriptions').select('plan, status, trial_ends_at').eq('user_id', userId).maybeSingle()
  const plan   = sub?.plan ?? 'starter'
  const status = sub?.status ?? 'inactive'

  const isActive = status === 'active'
    || (status === 'trialing' && sub?.trial_ends_at && new Date(sub.trial_ends_at) > new Date())

  if (!isActive) return { allowed: false, plan, limit: 0, reason: 'subscription_inactive' }

  const limit = AI_LIMITS[plan] ?? 50

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: usage } = await (sb as any).from('ai_usage').select('requests').eq('user_id', userId).eq('month', month).maybeSingle()
  const current = usage?.requests ?? 0
  if (current + cost > limit) return { allowed: false, plan, limit, reason: 'limit_reached' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).from('ai_usage').upsert(
    { user_id: userId, month, requests: current + cost, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,month' },
  )
  return { allowed: true, plan, limit }
}

// ── PDF: converte [[PDF:nome|texto-codificado]] no texto extraído legível ─────
function stripPdfMarkers(content: string): string {
  return content.replace(/\[\[PDF:([^|]*?)\|([\s\S]*?)\]\]/g, (_, name: string, encoded: string) => {
    let text: string
    try { text = decodeURIComponent(encoded) } catch { text = encoded }
    return `\n📄 Conteúdo do arquivo "${name}":\n"""\n${text}\n"""\n`
  })
}

// ── Multimodal: converte conteúdo com [[IMG:url]] para o formato da OpenAI ──
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }

function hasImages(content: string): boolean {
  return content.includes('[[IMG:')
}

function buildContentParts(content: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = /\[\[IMG:([\s\S]*?)\]\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index).trim()
    if (before) parts.push({ type: 'text', text: before })
    parts.push({ type: 'image_url', image_url: { url: match[1], detail: 'auto' } })
    lastIndex = match.index + match[0].length
  }

  const after = content.slice(lastIndex).trim()
  if (after) parts.push({ type: 'text', text: after })

  return parts.length > 0 ? parts : [{ type: 'text', text: content }]
}

// ── Constrói array de mensagens no formato OpenAI ──────────────────────────
function buildMessages(
  systemPrompt: string,
  messages: { role: string; content: string }[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]

  for (const m of messages) {
    if (m.role === 'user') {
      const withPdfText = stripPdfMarkers(m.content)
      if (hasImages(withPdfText)) {
        result.push({ role: 'user', content: buildContentParts(withPdfText) as OpenAI.Chat.ChatCompletionContentPart[] })
      } else {
        result.push({ role: 'user', content: withPdfText })
      }
    } else if (m.role === 'assistant') {
      // Remove [[GENERATED_IMAGE:...]] markers from assistant history (só guarda o texto)
      const text = m.content.replace(/\[\[GENERATED_IMAGE:[\s\S]*?\]\]/g, '[imagem gerada]')
      result.push({ role: 'assistant', content: text })
    }
  }

  return result
}

// ── SSE helper ─────────────────────────────────────────────────────────────
function sseResponse(content: string) {
  return new Response(
    `data: ${JSON.stringify({ content })}\n\ndata: [DONE]\n\n`,
    { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } },
  )
}

// ── Converte data URL (base64) em bytes + mime ─────────────────────────────
function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const [meta, b64] = dataUrl.split(',')
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? 'image/png'
  const bin = atob(b64 ?? '')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, mime }
}

// ── Serve ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const user = await getUser(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Não autenticado' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  // Sócio age como o dono da agência (migration 088)
  const agencyId = await agencyIdFor(user.id)

  const { messages, systemPrompt, useWebSearch, generateImage, size, referenceAsStyle, classify, message: classifyMessage } = await req.json()

  // Tamanho de imagem — valida contra os formatos aceitos pela família gpt-image
  const ALLOWED_IMAGE_SIZES = ['1024x1024', '1024x1536', '1536x1024']
  const imgSize = ALLOWED_IMAGE_SIZES.includes(size) ? size : '1024x1024'

  // ── Classificação de squad (sem custo de request) ────────────────────────
  if (classify) {
    const CLASSIFY_PROMPT = `Você é um classificador de intenção. Dado uma mensagem do usuário, identifique qual squad especializado deve atender. Responda APENAS com o ID do squad ou "none".

Squads:
- fabrica-conteudo: calendário editorial, copies, posts, reels, stories, planejamento de conteúdo para redes sociais
- trafego-pago: Meta Ads, Google Ads, campanhas pagas, criativos de anúncio, tráfego pago, impulsionar
- diagnostico-perfil: análise ou diagnóstico de perfil do Instagram, crescimento de seguidores, engajamento
- maquina-clientes: precificação, proposta comercial, contratos, onboarding de clientes, quanto cobrar
- psicologia-vendas: psicologia de vendas, gatilhos mentais, scripts de conversão, objeções de venda
- inteligencia-competitiva: análise de concorrentes, benchmark, pesquisa de mercado competitivo
- identidade-marca: identidade de marca, tom de voz, branding, rebranding, guia de marca
- presenca-multiplataforma: TikTok, LinkedIn, YouTube, estratégia multiplataforma, carrossel viral
- mineracao-anuncios: ângulos de anúncio, mineração de criativos, hooks para ads, voz do cliente
- motor-conteudo-seo: SEO, palavras-chave, tráfego orgânico, artigo de blog, ranqueamento
- comunidade-retencao: comunidade, email marketing, retenção de clientes, anti-churn, automação WhatsApp
- design-criativo: relatórios de resultados, dashboards, apresentações para cliente, relatório mensal
- auditoria-marketing: auditoria de marketing, análise de funil, revisão de copy, conversão
- none: pergunta genérica, saudação, ou que não se encaixa em nenhum squad acima

Responda com apenas o ID (ex: "fabrica-conteudo") ou "none".`

    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: CLASSIFY_PROMPT },
          { role: 'user', content: classifyMessage ?? '' },
        ],
        max_tokens: 20,
        temperature: 0,
      })
      const squadId = res.choices[0]?.message?.content?.trim() ?? 'none'
      return new Response(JSON.stringify({ squadId }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    } catch {
      return new Response(JSON.stringify({ squadId: 'none' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
  }

  // ── Geração de imagem (DALL-E 3) — conta como 5 requests ────────────────
  if (generateImage) {
    const { allowed, plan, limit, reason } = await checkUsage(agencyId, 5)
    if (!allowed) {
      const msg = reason === 'subscription_inactive'
        ? 'Assinatura inativa. Assine um plano para usar a IA.'
        : `Limite do plano ${plan} atingido (${limit} requests/mês). Faça upgrade para continuar.`
      return new Response(JSON.stringify({ error: msg }), {
        status: 429, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const userPrompt = messages[messages.length - 1]?.content ?? ''
    // Imagens de referência anexadas (para edição/geração guiada)
    const refImages = [...userPrompt.matchAll(/\[\[IMG:([\s\S]*?)\]\]/g)].map(m => m[1]).slice(0, 4)
    // Remove os marcadores [[IMG:...]] da prompt
    const cleanPrompt = userPrompt.replace(/\[\[IMG:[\s\S]*?\]\]/g, '').trim() || 'imagem'

    // ── Monta um prompt de imagem otimizado a partir da conversa ────────────
    // Usa gpt-4o com visão real quando há imagens de referência — assim o modelo
    // vê as cores, logo e estilo da marca e os aplica corretamente na geração.
    let builtPrompt = cleanPrompt
    try {
      // No builder de Criação de Imagens (referenceAsStyle), o pedido é uma EDIÇÃO da
      // foto real do produto: precisa manter o produto fiel e só transformar a cena
      // ao redor. Fora do builder, é geração livre a partir de texto.
      const PROMPT_SYS = referenceAsStyle
        ? `You are an expert prompt engineer writing an edit instruction for an AI photo-editing model that will edit a real product reference photo.
Write ONE single detailed instruction describing exactly how to transform the reference photo into the final image.
Rules:
- Preserve the product exactly as shown in the reference photo: same bottle/package shape, cap, proportions, materials and colors, and any label text. Do not redesign, simplify or restyle the product itself.
- Replace everything else in the frame — background, environment, props, lighting, camera framing and mood — following the creative brief below in full detail. The new scene should look dramatically different from the original photo's plain background.
- Be specific about composition, dynamic elements (smoke, droplets, props, reflections), lighting direction/color and background atmosphere.
- If the user requested adjustments to a previous image ("without that color", "remove the white background", "make it darker"), apply those changes too.
- Specify exact color palette (hex codes when given).
- List any text the user explicitly asked to appear in the image EXACTLY as written, in quotes.
- Write the instruction in English (generates better results), but keep any text that appears IN the image in the original language.
- Reply with ONLY the final instruction, no comments or explanations.`
        : `You are an expert prompt engineer for a state-of-the-art image generation model.
Based on the conversation (and any reference images provided), write ONE single detailed visual prompt describing EXACTLY the image to generate NOW.
Rules:
- If the user sent reference images, describe the product's shape, materials and color palette so the new scene stays visually consistent with the real product (e.g. "tall faceted glass bottle, dark knurled cap, wine-to-black gradient liquid, silver metallic collar").
- If the user requested adjustments to a previous image ("without that color", "remove the white background", "make it darker"), apply those changes in the new prompt.
- Specify: visual style (photorealistic, illustrated, 3D render, etc.), exact color palette (hex codes when given), composition/layout, background, lighting.
- For promotional/marketing content: describe it as a professional high-quality marketing poster with clear visual hierarchy, bold typography, and brand-consistent colors.
- List any text the user explicitly asked to appear in the image EXACTLY as written, in quotes.
- Write the prompt in English (generates better results), but keep any text that appears IN the image in the original language.
- Reply with ONLY the final prompt, no comments or explanations.`

      // Constrói histórico passando imagens reais para o modelo de visão
      const historyForBuilder: OpenAI.Chat.ChatCompletionMessageParam[] =
        (messages as { role: string; content: string }[])
          .slice(-8)
          .map(m => {
            if (m.role === 'user' && hasImages(m.content)) {
              // Passa as imagens reais para o modelo de visão ver a marca/referência
              return {
                role: 'user' as const,
                content: buildContentParts(m.content) as OpenAI.Chat.ChatCompletionContentPart[],
              }
            }
            return {
              role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
              content: m.content
                .replace(/\[\[IMG:[\s\S]*?\]\]/g, '[reference image sent by user]')
                .replace(/\[\[GENERATED_IMAGE:[\s\S]*?\]\]/g, '[image you generated before]'),
            }
          })

      // Contexto da marca/cliente — cores, tom e estilo entram automaticamente
      const brandCtx = (systemPrompt ?? '').toString().slice(0, 4000)

      // Usa gpt-4o (visão) quando há imagens de referência; gpt-4o-mini para texto puro
      const builderModel = refImages.length > 0 ? 'gpt-4o' : 'gpt-4o-mini'

      const pr = await openai.chat.completions.create({
        model: builderModel,
        messages: [
          { role: 'system', content: PROMPT_SYS },
          ...(brandCtx
            ? [{ role: 'system' as const, content: `Brand/client context (apply colors, tone and style when relevant):\n${brandCtx}` }]
            : []),
          ...historyForBuilder,
        ] as OpenAI.Chat.ChatCompletionMessageParam[],
        max_tokens: 800,
      })
      const out = pr.choices[0]?.message?.content?.trim()
      if (out) builtPrompt = out
    } catch {
      builtPrompt = cleanPrompt
    }

    // Família gpt-image (dall-e-3 foi descontinuado). Tenta na ordem de qualidade
    // e cai para o próximo se um modelo falhar (ex: exigir verificação da org).
    // Esses modelos retornam a imagem em base64 (b64_json), não em URL.
    const IMAGE_MODELS = ['gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini']
    let imgUrl = ''
    let lastErr = 'modelo de imagem indisponível'
    for (const model of IMAGE_MODELS) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let imgRes: any
        if (refImages.length > 0) {
          // Edição/geração guiada usando as imagens enviadas como referência
          const files = await Promise.all(refImages.map(async (durl, idx) => {
            const { bytes, mime } = dataUrlToBytes(durl)
            const ext = (mime.split('/')[1] ?? 'png').replace('jpeg', 'jpg')
            return await toFile(bytes, `ref-${idx}.${ext}`, { type: mime })
          }))
          imgRes = await openai.images.edit({
            model,
            image: files.length === 1 ? files[0] : files,
            prompt: builtPrompt,
            n: 1,
            size: imgSize,
            quality: 'high',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          imgRes = await (openai.images.generate as any)({ model, prompt: builtPrompt, n: 1, size: imgSize, quality: 'high' })
        }
        const d = imgRes.data?.[0]
        imgUrl = d?.b64_json ? `data:image/png;base64,${d.b64_json}` : (d?.url ?? '')
        if (imgUrl) break
        lastErr = 'resposta vazia do modelo de imagem'
      } catch (err: unknown) {
        lastErr = err instanceof Error ? err.message : String(err)
        // tenta o próximo modelo da família
      }
    }
    if (imgUrl) {
      return sseResponse(`🎨 Imagem gerada com sucesso!\n\n[[GENERATED_IMAGE:${imgUrl}]]`)
    }
    return sseResponse(`❌ Erro ao gerar imagem: ${lastErr}`)
  }

  // ── Chat normal / visão ──────────────────────────────────────────────────
  const { allowed, plan, limit, reason } = await checkUsage(agencyId, 1)
  if (!allowed) {
    const msg = reason === 'subscription_inactive'
      ? 'Assinatura inativa. Assine um plano para usar a IA.'
      : `Limite do plano ${plan} atingido (${limit} requests/mês). Faça upgrade para continuar.`
    return new Response(JSON.stringify({ error: msg }), {
      status: 429, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const allMessages = buildMessages(systemPrompt, messages)
  const encoder     = new TextEncoder()

  // Detecta se há imagens nas mensagens (visão)
  const hasVision = messages.some((m: { role: string; content: string }) => m.role === 'user' && hasImages(m.content))

  if (useWebSearch) {
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-search-preview',
        messages: allMessages,
        stream: false,
        max_tokens: 4096,
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming)
      const content = res.choices[0]?.message?.content ?? ''
      return sseResponse(content)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return sseResponse(`❌ Erro: ${msg}`)
    }
  }

  // Usa gpt-4o para visão, gpt-4o-mini para texto
  const model = hasVision ? 'gpt-4o' : 'gpt-4o-mini'

  // Cria o stream com try/catch para que erros da OpenAI voltem COM headers CORS
  // (sem isso, uma exceção aqui gera um 500 sem CORS e o browser mostra "Failed to fetch")
  let stream
  try {
    stream = await openai.chat.completions.create({
      model,
      messages: allMessages,
      stream: true,
      max_tokens: 2048,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return sseResponse(`❌ Erro: ${msg}`)
  }

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
