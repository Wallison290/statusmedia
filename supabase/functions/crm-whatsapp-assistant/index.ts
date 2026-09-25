// ── Edge Function: crm-whatsapp-assistant ─────────────────────────────────────
// A agência pergunta sobre o próprio funil pelo WhatsApp e a IA responde com os
// dados reais do CRM. Ideia trazida do assistente de WhatsApp do Sistema
// (api-app/services/whatsapp/assistente.js), em versão só de leitura.
//
// Como chega aqui: webhook de mensagens recebidas da instância UazAPI (a mesma
// que envia as notificações). Configure no painel da UazAPI:
//   URL:    https://<ref>.supabase.co/functions/v1/crm-whatsapp-assistant?secret=<CRM_ASSISTANT_SECRET>
//   Evento: messages
// Deploy sem JWT (a UazAPI não manda token do Supabase):
//   supabase functions deploy crm-whatsapp-assistant --no-verify-jwt
//   supabase secrets set CRM_ASSISTANT_SECRET=<um texto aleatório longo>
//
// Regras de segurança:
//   • só responde a número VERIFICADO de uma agência (whatsapp_verified);
//   • os dados consultados são sempre os da agência dona daquele número; a
//     pergunta não escolhe de quem ler (não há como pedir dados de outra conta);
//   • só lê, nunca grava no CRM;
//   • só reage a mensagem que começa com "CRM", para não responder a qualquer
//     "ok" ou "obrigado" que a agência mande para o número dos avisos;
//   • cada resposta consome 1 crédito de IA do plano, como o chat do app.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? ''
const WEBHOOK_SECRET       = Deno.env.get('CRM_ASSISTANT_SECRET') ?? ''

const APP_URL   = (Deno.env.get('APP_PUBLIC_URL') ?? 'https://statusmedia.com.br').replace(/\/$/, '')
const UAZ_URL   = (Deno.env.get('EVOLUTION_BASE_URL') ?? '').replace(/\/$/, '')
const UAZ_TOKEN = Deno.env.get('EVOLUTION_API_KEY') ?? ''

// Mesmos limites do ai-proxy / ai-chat
const AI_LIMITS: Record<string, number> = { starter: 150, pro: 600, agency: 2000 }

const MAX_LEADS = 150

const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

// ─── Leitura tolerante do webhook ─────────────────────────────────────────────
// UazAPI e Evolution mandam formatos diferentes, e versões diferentes da mesma
// API mudam nomes de campo. Tenta os conhecidos; sem texto ou remetente, ignora.

interface Incoming { number: string; text: string; fromMe: boolean; isGroup: boolean }

function parseIncoming(body: any): Incoming | null {
  const m = body?.message ?? body?.data ?? body
  const jid: string =
    m?.chatid ?? m?.sender ?? m?.key?.remoteJid ?? m?.remoteJid ?? m?.from ?? ''
  const text: string =
    m?.text ?? m?.content?.text ?? m?.body ??
    m?.message?.conversation ?? m?.message?.extendedTextMessage?.text ?? ''
  const fromMe = Boolean(m?.fromMe ?? m?.key?.fromMe)
  const isGroup = Boolean(m?.isGroup) || String(jid).endsWith('@g.us')
  const number = String(jid).split('@')[0].replace(/\D/g, '')
  if (!number || typeof text !== 'string' || !text.trim()) return null
  return { number, text: text.trim(), fromMe, isGroup }
}

// DDD + últimos 8 dígitos: o WhatsApp às vezes entrega o número sem o nono
// dígito, e o perfil pode ter sido salvo com ou sem 55, com máscara etc.
function phoneKey(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  if (d.length < 10) return null
  return d.slice(0, 2) + d.slice(-8)
}

async function reply(number: string, text: string) {
  if (!UAZ_URL || !UAZ_TOKEN) return
  await fetch(`${UAZ_URL}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: UAZ_TOKEN },
    body: JSON.stringify({ number, text }),
  }).catch(() => {})
}

// ─── Créditos de IA (mesma regra do ai-chat) ──────────────────────────────────

async function consumeCredit(sb: any, userId: string): Promise<string | null> {
  const month = new Date().toISOString().slice(0, 7)
  const { data: sub } = await sb.from('subscriptions').select('plan, status, trial_ends_at').eq('user_id', userId).maybeSingle()
  const plan = sub?.plan ?? 'starter'
  const active = sub?.status === 'active'
    || (sub?.status === 'trialing' && sub?.trial_ends_at && new Date(sub.trial_ends_at) > new Date())
  if (!active) return 'Sua assinatura da StatusMedia está inativa, então não consigo consultar o CRM agora.'

  const limit = AI_LIMITS[plan] ?? 50
  const { data: usage } = await sb.from('ai_usage').select('requests').eq('user_id', userId).eq('month', month).maybeSingle()
  const current = usage?.requests ?? 0
  if (current + 1 > limit) return `Os créditos de IA do plano acabaram este mês (${limit}). Dá para continuar pelo CRM no app.`

  await sb.from('ai_usage').upsert(
    { user_id: userId, month, requests: current + 1, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,month' },
  )
  return null
}

// ─── Foto do funil ────────────────────────────────────────────────────────────

function todayBR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })  // yyyy-mm-dd
}

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)

async function snapshot(sb: any, userId: string) {
  const [{ data: columns }, { data: leads }, { data: proposals }, { data: members }] = await Promise.all([
    sb.from('crm_columns').select('id, name, stage_type, position').eq('user_id', userId).order('position'),
    sb.from('crm_leads').select('*').eq('user_id', userId).is('archived_at', null).order('updated_at', { ascending: false }).limit(MAX_LEADS),
    sb.from('crm_proposals').select('title, lead_id, status, total, valid_until, view_count').eq('user_id', userId).in('status', ['enviada', 'visualizada']),
    sb.from('team_members').select('id, name').eq('user_id', userId),
  ])

  const today = todayBR()
  const col = new Map((columns ?? []).map((c: any) => [c.id, c]))
  const member = new Map((members ?? []).map((m: any) => [m.id, m.name]))
  const leadName = new Map((leads ?? []).map((l: any) => [l.id, l.name]))
  const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

  const stages = (columns ?? []).map((c: any) => {
    const ls = (leads ?? []).filter((l: any) => l.column_id === c.id)
    const v = ls.reduce((s: number, l: any) => s + Number(l.estimated_value ?? 0), 0)
    return `- ${c.name} (${c.stage_type}): ${ls.length}${v ? `, ${brl(v)}` : ''}`
  }).join('\n')

  const rows = (leads ?? []).map((l: any) => [
    l.name + (l.company ? ` (${l.company})` : ''),
    `etapa: ${(col.get(l.column_id) as any)?.name ?? '?'}`,
    `há ${days(l.stage_entered_at ?? l.created_at)}d na etapa`,
    l.temperature && `temperatura: ${l.temperature}`,
    l.estimated_value != null && `valor: ${brl(Number(l.estimated_value))}`,
    l.next_contact_at ? `retorno: ${l.next_contact_at}${l.next_contact_at < today ? ' (ATRASADO)' : ''}` : 'sem retorno marcado',
    l.source && `origem: ${l.source}`,
    member.get(l.responsible_user_id) && `responsável: ${member.get(l.responsible_user_id)}`,
    l.notes && `obs: ${String(l.notes).slice(0, 140)}`,
  ].filter(Boolean).join(' | ')).map((r: string) => `- ${r}`).join('\n')

  const props = (proposals ?? []).map((p: any) =>
    `- "${p.title}" para ${leadName.get(p.lead_id) ?? 'sem lead'}: ${brl(Number(p.total))}, ${p.status}` +
    `${p.view_count ? `, aberta ${p.view_count}x` : ', ainda não aberta'}${p.valid_until ? `, válida até ${p.valid_until}` : ''}`,
  ).join('\n')

  return `Hoje é ${today}.\n\nETAPAS:\n${stages || '- nenhuma'}\n\nLEADS ATIVOS:\n${rows || '- nenhum'}\n\nPROPOSTAS AGUARDANDO RESPOSTA:\n${props || '- nenhuma'}`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ ok: false })

  // Sem segredo configurado a função não atende ninguém: melhor parada do que aberta
  const secret = new URL(req.url).searchParams.get('secret') ?? ''
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const msg = parseIncoming(body)
  // Resposta 200 mesmo quando ignora: webhook com erro é reenviado pela UazAPI
  if (!msg || msg.fromMe || msg.isGroup) return ok({ ignored: true })
  if (!/^crm\b/i.test(msg.text)) return ok({ ignored: true })

  const question = msg.text.replace(/^crm[\s:,.-]*/i, '').trim()
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) as any

  const key = phoneKey(msg.number)
  const { data: agencies } = await sb
    .from('profiles')
    .select('id, whatsapp, agency_name, full_name')
    .eq('role', 'agency')
    .eq('whatsapp_verified', true)
    .not('whatsapp', 'is', null)
  const matches = (agencies ?? []).filter((p: any) => key && phoneKey(p.whatsapp) === key)

  // Número desconhecido: silêncio. Responder confirmaria para qualquer um que o
  // número existe e atende comandos.
  if (matches.length !== 1) return ok({ ignored: true })
  const agency = matches[0]

  if (!question) {
    await reply(msg.number, 'Oi! Me pergunte sobre o seu funil começando com CRM. Ex: *CRM quem eu preciso chamar hoje?*')
    return ok()
  }

  const blocked = await consumeCredit(sb, agency.id)
  if (blocked) {
    await reply(msg.number, blocked)
    return ok()
  }

  try {
    const name = agency.agency_name || agency.full_name || 'a agência'
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 450,
      messages: [
        {
          role: 'system',
          content:
            `Você é o assistente comercial de ${name} e responde pelo WhatsApp. ` +
            'Responda em português do Brasil, curto (no máximo ~8 linhas), usando SOMENTE os dados abaixo. ' +
            'Cite leads pelo nome. Se o dado não estiver aqui, diga que não encontrou; nunca invente. ' +
            'Formatação de WhatsApp: *negrito* com um asterisco, listas com "•". Sem tabelas e sem markdown de títulos.\n\n' +
            (await snapshot(sb, agency.id)),
        },
        { role: 'user', content: question.slice(0, 500) },
      ],
    })
    const answer = res.choices[0]?.message?.content?.trim() || 'Não consegui montar a resposta agora.'
    await reply(msg.number, `${answer}\n\n_Detalhes no CRM: ${APP_URL}/crm_`)
  } catch (err) {
    console.error('crm-whatsapp-assistant:', err)
    await reply(msg.number, 'Tive um problema para consultar o CRM agora. Tente de novo em instantes.')
  }

  return ok()
})
