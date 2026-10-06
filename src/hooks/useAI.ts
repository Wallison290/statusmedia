import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { callProxy, streamChat, type ImageSize } from '@/lib/aiProxy'
import { resolveAgencyId } from '@/hooks/useAuth'

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é a StatusIA — o assistente de IA do sistema StatusMedia, construído sobre o SocialForge v3. Você é um time completo de marketing digital com 13 especialidades e 48 agentes especializados.

## Sua identidade
Você funciona como uma agência de marketing digital de alto nível. Quando o usuário fizer um pedido, identifique qual(is) dos 13 squads abaixo é mais relevante e aplique aquela expertise com rigor. Você pode combinar múltiplos squads em uma mesma resposta. Não espere que o usuário nomeie o squad — você detecta e aplica automaticamente.

## Os 13 Squads — sua expertise completa

**1. 🔥 Fábrica de Conteúdo** (Luna · Sol · Davi · Bia · Léo · Kai)
→ Calendário editorial mensal, copies com gancho + CTA, legendas, roteiros de stories (5 pilares), scripts de Reels (hook em 4s), revisão de qualidade
→ Ative para: planejar posts, criar copies, roteiros, calendários, estratégia editorial

**2. 🔍 Diagnóstico de Perfil** (Sherlock · Vera · Nina · Max)
→ Análise de perfil Instagram (bio, feed, engajamento), benchmark de 3 concorrentes, identificação do gargalo principal, plano + calendário de 30 dias com copies completas
→ Ative para: diagnóstico de instagram, por que o perfil não cresce, análise de concorrentes

**3. 💼 Máquina de Clientes** (Rafa · Bruno · Clara · Dani)
→ Precificação com tabela 2025/2026 (3 faixas), proposta com ROI em 3 cenários, contrato com 14 cláusulas críticas, manual de onboarding personalizado
→ Ative para: quanto cobrar, proposta comercial, contrato, onboarding de cliente

**4. 📊 Auditoria de Marketing** (Atlas · Spike · Hana · Rex · Eve)
→ Score de copy (proposta de valor, CTAs, persuasão), tráfego pago, funil de conversão (CRO), SEO técnico + on-page, inteligência competitiva — plano de ação com quick wins
→ Ative para: auditoria de marketing, analisar funil, copy do site, análise de concorrência

**5. 🧠 Psicologia de Vendas** (Vera · Freya · Orion · Cyrus)
→ Pesquisa de audiência em 4 camadas (dores, linguagem, objeções, canais), 12 gatilhos mentais, mapa de jornada de compra (5 etapas), scripts de abertura + diagnóstico + oferta + objeções
→ Ative para: gatilhos mentais, por que o cliente não compra, script de vendas, objeções

**6. 🌱 Comunidade e Retenção** (Nico · Iris · Cleo · Zed)
→ Estrutura de comunidade + rituais de engajamento, sequências de email (boas-vindas + reativação), sistema anti-churn com sinais de risco + scripts de salvamento, automações de WhatsApp/CRM
→ Ative para: reter clientes, email marketing, comunidade, automação, anti-churn

**7. 🕵️ Inteligência Competitiva** (Hawk · Mira · Tática)
→ Perfis competitivos (site, Instagram, anúncios), voz do mercado via reviews (elogios, reclamações, frases reais), mapa de posicionamento + gaps + 5 ações imediatas
→ Ative para: analisar concorrentes, espaço no mercado, diferencial da marca

**8. 🔎 Motor de Conteúdo SEO** (Índex · Radar · Brief · Auditor)
→ Mapa de conteúdo existente + gaps, oportunidades de keyword (cauda longa, FAQ, featured snippet), briefs editoriais completos (H1/H2s, ângulo, meta), auditoria técnica + on-page com score
→ Ative para: SEO, ranquear no Google, blog, palavras-chave, tráfego orgânico

**9. ⚡ Mineração de Anúncios** (Garimpo · Lente · Forja)
→ Extração de dores + desejos reais da voz do cliente, análise de padrões de criativos no nicho, banco de ângulos ranqueado (8+ ângulos com hooks + copy completa + formato recomendado)
→ Ative para: ângulos de ads, criativos de tráfego pago, o que usar nos anúncios

**10. 🎨 Identidade de Marca** (Voz · Paleta · Remix)
→ Guia de tom de voz (escala de formalidade, vocabulário, anti-voz, 5 exemplos), identidade visual (cores, tipografia, estilo), reaproveitamento de 1 conteúdo em 7 formatos
→ Ative para: tom de voz, branding, identidade visual, reaproveitar conteúdo

**11. 💰 Tráfego Pago** (Mídia · Criativo · Social · Fiscal)
→ Arquitetura de conta (estrutura por funil, orçamento, lances, segmentação), copies por fase (topo/meio/fundo + A/B), estratégia Meta Ads (prospecção, engajamento, retargeting, retenção), auditoria com benchmarks 2025 e severidade (🔴/🟡/🟢)
→ Ative para: Meta Ads, Google Ads, campanha nova, auditoria de anúncios, prints de resultado

**12. 🌐 Presença Multiplataforma** (Viral · Autoridade · Motor · Adaptador)
→ Estratégia TikTok (hook 3s, calendário, scripts, trends), LinkedIn (posicionamento + 5 posts), carrosséis virais 6 slides (arco hook→problema→agitação→solução→prova→CTA), adaptação cross-platform
→ Ative para: TikTok, LinkedIn, carrosséis virais, expandir para outras plataformas

**13. 🖌️ Design Criativo** (Painel · Estilo · Narrador · Insights)
→ Relatório mensal estruturado (resumo executivo, métricas, destaques, próximos passos), guia de marca completo (8 seções), estrutura de apresentação narrativa (7 slides), pesquisa visual do nicho
→ Ative para: relatório de resultados, guia de marca, apresentação para cliente, pesquisa visual

## Regras de execução

**Não acesse links.** Você NÃO acessa URLs, perfis do Instagram, Meta Ad Library, sites ou qualquer conteúdo externo. Trabalhe com:
- O contexto do cliente cadastrado no sistema (disponível abaixo quando ativo)
- O que o usuário colar/escrever na conversa
- Prints e imagens enviados pelo usuário
- Seu conhecimento treinado do mercado brasileiro

Quando faltar dado para análise, peça ao usuário para colar o texto, enviar prints ou descrever os dados. Nunca invente números de um perfil/site que você não viu — use o nicho como referência e deixe claro que é estimativa.

**Busca web:** Use quando precisar de tendências recentes, dados de mercado atualizados ou notícias. Combine com o contexto interno do cliente.

**Seja específico.** Copies prontas, roteiros completos, scripts testáveis, benchmarks reais — não teoria genérica. Entregue trabalho aplicável.

Responda sempre em português brasileiro. Direto, prático, orientado a resultados.

Data atual: ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface AIMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  web_search?: boolean
  created_at: string
}

export interface AISession {
  id: string
  user_id: string
  title: string
  squad_id: string | null // 'livre' | 'imagem' | id de um squad — filtra o histórico por estúdio
  created_at: string
  updated_at: string
}

// ── Hooks de sessão ────────────────────────────────────────────────────────────
// squadId: 'livre' | 'imagem' | id de squad — filtra o histórico daquele estúdio.
// Sem valor, retorna tudo (uso legado/administrativo).
export function useAISessions(squadId?: string) {
  return useQuery({
    queryKey: ['ai_sessions', squadId ?? 'all'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('ai_sessions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50)
      if (squadId) query = query.eq('squad_id', squadId)
      const { data, error } = await query
      if (error) throw error
      return data as AISession[]
    },
  })
}

export function useAIMessages(sessionId: string | null) {
  return useQuery({
    queryKey: ['ai_messages', sessionId],
    queryFn: async () => {
      if (!sessionId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as AIMessage[]
    },
    enabled: !!sessionId,
  })
}

export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (title: string = 'Nova conversa') => {
      const { data: { user } } = await supabase.auth.getUser()
      const agencyId = user ? await resolveAgencyId(user.id) : null
      if (!user) throw new Error('Não autenticado')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_sessions')
        .insert({ user_id: agencyId!, title })
        .select()
        .single()
      if (error) throw error
      return data as AISession
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_sessions'] }),
  })
}

export function useDeleteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('ai_sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_sessions'] }),
  })
}

// ── Extração de memória (background, via Edge Function) ───────────────────────
const MEMORY_EXTRACTION_PROMPT = `Você é um extrator de memórias para um sistema de gestão de social media.

Analise o par de mensagens abaixo e extraia APENAS decisões importantes, preferências confirmadas ou aprendizados específicos sobre o cliente que devam ser lembrados em conversas futuras.

Retorne JSON: { "memories": [{ "key": string, "value": string }] }
Retorne array vazio se não houver nada relevante.

Exemplos de memórias VÁLIDAS (específicas e acionáveis):
- { "key": "frequencia_posts", "value": "3 posts por semana no Instagram" }
- { "key": "melhor_horario", "value": "publicações às 18h-20h performam melhor" }
- { "key": "formato_preferido", "value": "cliente prefere carrosséis a posts simples" }
- { "key": "tom_ajustado", "value": "tom mais descontraído aprovado pelo cliente" }
- { "key": "restricao_conteudo", "value": "não mencionar concorrente X" }
- { "key": "campanha_ativa", "value": "promoção de julho para consultas particulares" }

NÃO extraia informações genéricas ou já presentes no cadastro do cliente.
Seja específico e conciso. Máximo 5 memórias por resposta.`

const USER_MEMORY_EXTRACTION_PROMPT = `Você é um extrator de memórias sobre a agência de social media que usa este sistema.

Analise o par de mensagens abaixo e extraia APENAS fatos relevantes sobre a agência, seus hábitos, preferências de trabalho ou informações do negócio que devam ser lembrados em conversas futuras.

Retorne JSON: { "memories": [{ "key": string, "value": string }] }
Retorne array vazio se não houver nada relevante.

Exemplos de memórias VÁLIDAS sobre a agência:
- { "key": "nome_agencia", "value": "StatusMedia — agência de social media" }
- { "key": "especialidade", "value": "especialistas em saúde e bem-estar" }
- { "key": "ferramentas", "value": "usam Canva, CapCut e Meta Business Suite" }
- { "key": "equipe", "value": "time de 5 pessoas" }
- { "key": "estilo_relatorio", "value": "preferem relatórios semanais resumidos" }
- { "key": "dia_reuniao", "value": "reuniões de alinhamento às segundas-feiras" }

NÃO extraia informações específicas de clientes individuais (isso é capturado separadamente).
NÃO extraia informações genéricas sobre social media em geral.
Máximo 3 memórias por resposta.`

async function extractMemoriesBackground(
  userMessage: string,
  assistantResponse: string,
  clientId: string,
  userId: string,
  onMemoriesSaved: (keys: string[]) => void,
): Promise<void> {
  try {
    const { content } = await callProxy<{ content: string }>('memory-extract', {
      systemPrompt: MEMORY_EXTRACTION_PROMPT,
      userMessage,
      assistantResponse,
    })

    const parsed = JSON.parse(content ?? '{}') as { memories?: { key: string; value: string }[] }
    const memories = parsed.memories ?? []
    if (memories.length === 0) return

    const savedKeys: string[] = []
    for (const mem of memories) {
      if (!mem.key || !mem.value) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_client_memory')
        .upsert(
          {
            client_id: clientId,
            user_id: userId,
            key: mem.key,
            value: mem.value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'client_id,user_id,key' }
        )
      if (!error) savedKeys.push(mem.key)
    }

    if (savedKeys.length > 0) onMemoriesSaved(savedKeys)
  } catch {
    // extração em background — falha silenciosa
  }
}

async function extractUserMemoriesBackground(
  userMessage: string,
  assistantResponse: string,
  userId: string,
  onMemoriesSaved: (keys: string[]) => void,
): Promise<void> {
  try {
    const { content } = await callProxy<{ content: string }>('memory-extract', {
      systemPrompt: USER_MEMORY_EXTRACTION_PROMPT,
      userMessage,
      assistantResponse,
    })

    const parsed = JSON.parse(content ?? '{}') as { memories?: { key: string; value: string }[] }
    const memories = parsed.memories ?? []
    if (memories.length === 0) return

    const savedKeys: string[] = []
    for (const mem of memories) {
      if (!mem.key || !mem.value) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_user_memory')
        .upsert(
          { user_id: userId, key: mem.key, value: mem.value, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,key' }
        )
      if (!error) savedKeys.push(mem.key)
    }

    if (savedKeys.length > 0) onMemoriesSaved(savedKeys)
  } catch {
    // extração em background — falha silenciosa
  }
}

// ── Hook principal de chat ─────────────────────────────────────────────────────
export function useAIChat(sessionId: string | null) {
  const qc = useQueryClient()
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming]             = useState(false)
  const [isLoading, setIsLoading]                 = useState(false)
  const [memoriesSaved, setMemoriesSaved]         = useState<string[]>([])
  const [userMemoriesSaved, setUserMemoriesSaved] = useState<string[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)

  const clearMemoriesSaved     = useCallback(() => setMemoriesSaved([]), [])
  const clearUserMemoriesSaved = useCallback(() => setUserMemoriesSaved([]), [])

  // ── Detecção de intent de geração de imagem ────────────────────────────────
  // verbo de criação + (artigo/qualquer coisa curta) + substantivo visual
  const IMAGE_GEN_RE = /\b(crie|cria|criar|gere|gera|gerar|fa[çc]a|faz|fazer|desenh[ae]|ilustr[ae]|monte|monta|produza|produz|make|generate|create|draw)\b[\sa-zà-ú]{0,24}?\b(imagem|imagens|arte|ilustra[çc][ãa]o|desenho|logo|logotipo|banner|criativo|capa|thumbnail|figura|image)\b/i
  const IMAGE_GEN_DIRECT = ['dall-e', 'dall e', 'gerar imagem', 'gerar uma imagem']
  function isImageGenRequest(text: string): boolean {
    const lower = text.toLowerCase()
    return IMAGE_GEN_RE.test(lower) || IMAGE_GEN_DIRECT.some(kw => lower.includes(kw))
  }

  const sendMessage = useCallback(async (
    content: string,
    history: AIMessage[],
    useWebSearch = false,
    onSessionCreated?: (session: AISession) => void,
    clientContext?: string | null,
    clientId?: string | null,
    squadPrompt?: string | null,
    attachedImages?: string[],  // base64 data URLs
    forceImage = false,         // botão "Imagem" liga geração explicitamente
    attachedPdfs?: { name: string; text: string }[], // texto já extraído no navegador
    imageSize: ImageSize = '1024x1024', // formato da imagem gerada (Criação de Imagens)
    referenceAsStyle = false, // true = referência só informa estilo/cores; sempre gera cena nova (não edita a foto)
    squadContext = 'livre', // 'livre' | 'imagem' | id do squad — grava em qual estúdio a sessão nasceu
  ) => {
    if (!content.trim() && (!attachedImages || attachedImages.length === 0) && (!attachedPdfs || attachedPdfs.length === 0)) return
    if (isStreaming || isLoading) return

    // Monta conteúdo com imagens (marcadores [[IMG:...]])
    let fullContent = content.trim()
    if (attachedImages && attachedImages.length > 0) {
      const imgMarkers = attachedImages.map(url => `\n[[IMG:${url}]]`).join('')
      fullContent = fullContent ? `${fullContent}${imgMarkers}` : imgMarkers.trim()
    }

    // Monta conteúdo com PDFs (marcadores [[PDF:nome|texto-codificado]])
    if (attachedPdfs && attachedPdfs.length > 0) {
      const pdfMarkers = attachedPdfs
        .map(pdf => `\n[[PDF:${pdf.name}|${encodeURIComponent(pdf.text)}]]`)
        .join('')
      fullContent = fullContent ? `${fullContent}${pdfMarkers}` : pdfMarkers.trim()
    }

    // Gera imagem se: o botão Imagem estiver ligado (usa imagens anexadas como referência),
    // OU o texto pedir geração e NÃO houver imagem/PDF anexado (sem botão, anexo = análise/leitura).
    const generateImage = forceImage || (isImageGenRequest(fullContent) && !attachedImages?.length && !attachedPdfs?.length)

    let activeSessionId = sessionId

    // Cria sessão se não existe
    if (!activeSessionId) {
      const { data: { user } } = await supabase.auth.getUser()
      const agencyId = user ? await resolveAgencyId(user.id) : null
      if (!user) return
      const title = (content || 'Imagem').slice(0, 60) + ((content || 'Imagem').length > 60 ? '…' : '')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: session, error } = await (supabase as any)
        .from('ai_sessions')
        .insert({ user_id: agencyId!, title, squad_id: squadContext })
        .select()
        .single()
      if (error || !session) return
      activeSessionId = (session as AISession).id
      qc.invalidateQueries({ queryKey: ['ai_sessions'] })
      onSessionCreated?.(session as AISession)
    }

    // Salva mensagem do usuário no Supabase (com conteúdo completo incluindo marcadores de imagem)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userMsg } = await (supabase as any)
      .from('ai_messages')
      .insert({ session_id: activeSessionId, role: 'user', content: fullContent, web_search: useWebSearch })
      .select()
      .single()

    if (userMsg) {
      qc.setQueryData<AIMessage[]>(['ai_messages', activeSessionId], prev =>
        [...(prev ?? []), userMsg as AIMessage]
      )
    }

    // Prepara histórico de chat (inclui mensagem atual com marcadores de imagem)
    const chatHistory = [
      ...history,
      ...(userMsg ? [userMsg as AIMessage] : [{ id: 'pending', session_id: activeSessionId!, role: 'user' as const, content: fullContent, created_at: new Date().toISOString() }]),
    ].map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    // Monta system prompt composto
    const systemParts = [SYSTEM_PROMPT]
    if (clientContext) systemParts.push(clientContext)
    if (squadPrompt) {
      systemParts.push(
        `⚠️ MODO SQUAD ATIVO — PRIORIDADE MÁXIMA
O usuário ativou um time especializado. A partir de agora você DEVE atuar estritamente como o squad descrito abaixo: apresente-se como esse time, siga o pipeline dele e conduza o usuário pelo fluxo do squad — mesmo que a pergunta seja genérica (ex: "o que você faz?"). Quando a pergunta for vaga, responda explicando o que ESTE squad entrega e faça a primeira pergunta do briefing dele. Não responda como um assistente genérico de social media.

📌 REGRA DE EXECUÇÃO OBRIGATÓRIA — NUNCA IGNORE:
Execute APENAS UMA ETAPA por resposta. Após entregar cada passo, PARE completamente e faça perguntas para ganhar mais contexto antes de avançar. Exemplos: "As datas comemorativas fazem sentido para a estratégia? Quer ajustar alguma coisa antes de montar o calendário?", "O macroplano ficou alinhado com o que você esperava? Algum ajuste antes de escrever as copies?". Só avance para a próxima etapa quando o usuário confirmar ou aprovar. Isso é essencial — respostas longas demais perdem qualidade. Prefira profundidade por etapa a velocidade.

📌 REGRA DE FORMATAÇÃO OBRIGATÓRIA:
Use sempre formatação rica e organizada:
- Títulos em negrito para cada seção (ex: **Passo 2 — Luna: Pesquisa**)
- Listas com bullet points ou numeração
- Tabelas quando houver dados comparativos
- Separadores visuais entre seções (linha em branco + --- quando necessário)
- Destaque os pontos mais importantes em **negrito**
- Mantenha hierarquia clara: título > subtítulo > conteúdo

${squadPrompt}`
      )
    }
    const systemContent = systemParts.join('\n\n')

    setIsLoading(true)
    setStreamingContent('')

    let aiResponse = ''

    // Cria AbortController para poder cancelar
    const abort = new AbortController()
    abortControllerRef.current = abort

    setIsLoading(false)
    setIsStreaming(true)

    try {
      aiResponse = await streamChat(
        chatHistory,
        systemContent,
        useWebSearch,
        (chunk) => setStreamingContent(prev => prev + chunk),
        abort.signal,
        generateImage,
        imageSize,
        referenceAsStyle,
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Cancelado pelo usuário — mantém o que foi gerado até aqui
        aiResponse = streamingContent
      } else {
        const errMsg = err instanceof Error ? err.message : String(err)
        // eslint-disable-next-line no-console
        console.error('[useAI] chat error:', errMsg, err)
        aiResponse = `❌ Erro: ${errMsg}`
      }
    }

    // Salva resposta do assistente no Supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: aiMsg } = await (supabase as any)
      .from('ai_messages')
      .insert({
        session_id: activeSessionId,
        role: 'assistant',
        content: aiResponse,
        web_search: useWebSearch,
      })
      .select()
      .single()

    if (aiMsg) {
      qc.setQueryData<AIMessage[]>(['ai_messages', activeSessionId], prev => [
        ...(prev ?? []).filter(m => m.id !== 'streaming'),
        aiMsg as AIMessage,
      ])
    }

    // Atualiza título da sessão com a primeira mensagem (se for genérico)
    const currentSessions = qc.getQueryData<AISession[]>(['ai_sessions']) ?? []
    const currentSession  = currentSessions.find(s => s.id === activeSessionId)
    if (currentSession?.title === 'Nova conversa') {
      const displayContent = content || (attachedImages?.length ? 'Análise de imagem' : 'Nova conversa')
      const title = displayContent.slice(0, 60) + (displayContent.length > 60 ? '…' : '')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('ai_sessions').update({ title }).eq('id', activeSessionId!)
      qc.invalidateQueries({ queryKey: ['ai_sessions'] })
    }

    // Extração de memória em background (cliente + agência)
    if (aiResponse && !aiResponse.startsWith('❌')) {
      const { data: { user } } = await supabase.auth.getUser()
      const agencyId = user ? await resolveAgencyId(user.id) : null
      if (user) {
        if (clientId) {
          extractMemoriesBackground(content || 'análise de imagem', aiResponse, clientId, agencyId!, (keys) => {
            setMemoriesSaved(keys)
            qc.invalidateQueries({ queryKey: ['ai_client_memory', clientId] })
            qc.invalidateQueries({ queryKey: ['ai_client_context', clientId] })
          })
        }
        extractUserMemoriesBackground(content || 'análise de imagem', aiResponse, agencyId!, (keys) => {
          setUserMemoriesSaved(keys)
          qc.invalidateQueries({ queryKey: ['ai_user_memory'] })
        })
      }
    }

    setIsStreaming(false)
    setStreamingContent('')
  }, [sessionId, isStreaming, isLoading, qc, streamingContent])

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsStreaming(false)
    setStreamingContent('')
  }, [])

  return { sendMessage, isStreaming, isLoading, streamingContent, stopGeneration, memoriesSaved, clearMemoriesSaved, userMemoriesSaved, clearUserMemoriesSaved }
}
