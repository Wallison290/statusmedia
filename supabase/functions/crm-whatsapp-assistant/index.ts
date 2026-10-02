// ── Edge Function: crm-whatsapp-assistant ─────────────────────────────────────
// A agência pergunta sobre o próprio funil pelo WhatsApp e a IA responde com os
// dados reais do CRM. Ideia trazida do assistente de WhatsApp do Sistema
// (api-app/services/whatsapp/assistente.js), em versão só de leitura.
//
// Como chega aqui: webhook de mensagens recebidas do WhatsApp CONECTADO DE CADA
// AGÊNCIA. A função agency-whatsapp configura esse webhook sozinha quando a
// agência conecta, com a URL:
//   .../crm-whatsapp-assistant?secret=<CRM_ASSISTANT_SECRET>&inst=<id da instância>
// O dono da agência manda "CRM ..." de um destes jeitos, e a resposta sai pelo
// número da agência:
//   • do número pessoal dele (o verificado na página WhatsApp) para o número
//     da agência; ou
//   • no próprio WhatsApp da agência, na conversa "Você" (mensagem para si
//     mesmo) — o caso de quem usa um número só, sem pessoal cadastrado.
// Deploy sem JWT (a UazAPI não manda token do Supabase):
//   supabase functions deploy crm-whatsapp-assistant --no-verify-jwt
//   supabase secrets set CRM_ASSISTANT_SECRET=<um texto aleatório longo>
//
// Regras de segurança:
//   • a agência é a dona da instância que recebeu a mensagem (`inst` na URL);
//   • só responde ao número pessoal VERIFICADO do dono dessa agência, ou ao
//     próprio aparelho da agência na conversa "Você": cliente ou lead que
//     escrever "CRM" para a agência não recebe dados do funil;
//   • a pergunta não escolhe de quem ler (não há como pedir dados de outra conta);
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
const UAZ_URL   = (Deno.env.get('AGENCY_UAZAPI_URL') ?? '').replace(/\/$/, '')

// Mesmos limites do ai-proxy / ai-chat
const AI_LIMITS: Record<string, number> = { starter: 150, pro: 600, agency: 2000 }

const MAX_LEADS = 150

const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

// ─── Leitura tolerante do webhook ─────────────────────────────────────────────
// UazAPI e Evolution mandam formatos diferentes, e versões diferentes da mesma
// API mudam nomes de campo. Tenta os conhecidos; sem texto ou remetente, ignora.

interface Incoming { number: string; text: string; fromMe: boolean; isGroup: boolean; byApi: boolean }

function parseIncoming(body: any): Incoming | null {
  const m = body?.message ?? body?.data ?? body
  const jid: string =
    m?.chatid ?? m?.sender ?? m?.key?.remoteJid ?? m?.remoteJid ?? m?.from ?? ''
  const text: string =
    m?.text ?? m?.content?.text ?? m?.body ??
    m?.message?.conversation ?? m?.message?.extendedTextMessage?.text ?? ''
  const fromMe = Boolean(m?.fromMe ?? m?.key?.fromMe)
  const isGroup = Boolean(m?.isGroup) || String(jid).endsWith('@g.us')
  // Mensagem que o próprio sistema enviou (a nossa resposta): nunca responder
  const byApi = Boolean(m?.wasSentByApi)
  const number = String(jid).split('@')[0].replace(/\D/g, '')
  if (!number || typeof text !== 'string' || !text.trim()) return null
  return { number, text: text.trim(), fromMe, isGroup, byApi }
}

// DDD + últimos 8 dígitos: o WhatsApp às vezes entrega o número sem o nono
// dígito, e o perfil pode ter sido salvo com ou sem 55, com máscara etc.
function phoneKey(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  if (d.length < 10) return null
  return d.slice(0, 2) + d.slice(-8)
}

async function reply(token: string, number: string, text: string) {
  if (!UAZ_URL || !token) return
  await fetch(`${UAZ_URL}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ number, text }),
  }).catch(() => {})
}

// ─── Conversa com leads (follow-up automático, migration 080) ─────────────────
// Toda mensagem entre o número da agência e um lead fica gravada: é por ela
// que a função crm-followup sabe quem falou por último e há quanto tempo.
// Mensagem sem texto (áudio, foto) também conta como interação.

async function storeConversation(sb: any, instId: string, body: any) {
  const m = body?.message ?? body?.data ?? body
  const jid: string = m?.chatid ?? m?.key?.remoteJid ?? m?.remoteJid ?? m?.sender ?? m?.from ?? ''
  if (!jid || String(jid).endsWith('@g.us') || m?.isGroup || m?.wasSentByApi) return
  const key = phoneKey(String(jid).split('@')[0])
  if (!key || !/^[0-9a-f-]{36}$/i.test(instId)) return

  const { data: inst } = await sb.from('whatsapp_instances').select('user_id').eq('id', instId).maybeSingle()
  if (!inst?.user_id) return
  const { data: leads } = await sb.from('crm_leads').select('id, name, whatsapp, archived_at, awaiting_reply_since, opted_out_at')
    .eq('user_id', inst.user_id).not('whatsapp', 'is', null)
  const matches = (leads ?? []).filter((l: any) => phoneKey(l.whatsapp) === key)
  // Mesmo número em mais de um card: fica no que está ativo
  const lead = matches.find((l: any) => !l.archived_at) ?? matches[0]
  if (!lead) return

  const rawText =
    m?.text ?? m?.content?.text ?? m?.body ??
    m?.message?.conversation ?? m?.message?.extendedTextMessage?.text ?? ''
  const type = String(m?.messageType ?? m?.type ?? '').toLowerCase()
  const text = typeof rawText === 'string' && rawText.trim()
    ? rawText.trim().slice(0, 4000)
    : `[${/audio|ptt/.test(type) ? 'áudio' : /image/.test(type) ? 'imagem' : /video/.test(type) ? 'vídeo' : /document/.test(type) ? 'documento' : /sticker/.test(type) ? 'figurinha' : 'mídia'}]`
  let ts = Number(m?.messageTimestamp ?? m?.timestamp ?? 0)
  if (ts && ts < 1e12) ts *= 1000
  const sentAt = ts ? new Date(ts).toISOString() : new Date().toISOString()
  const waId = m?.messageid ?? m?.id ?? m?.key?.id ?? null

  const direction = (m?.fromMe ?? m?.key?.fromMe) ? 'out' : 'in'
  const { error } = await sb.from('crm_messages').insert({
    user_id: inst.user_id, lead_id: lead.id,
    direction, text, source: 'whatsapp', wa_id: waId ? String(waId) : null, sent_at: sentAt,
  })
  // 23505 = a UazAPI reenviou a mesma mensagem: já está gravada (e já tratada)
  if (error) {
    if (error.code !== '23505') console.error('crm-whatsapp-assistant: conversa não gravada', error.message)
    return
  }

  // A agência respondeu (pelo celular): sai da fila de "esperando resposta"
  if (direction === 'out') {
    if (lead.awaiting_reply_since) await sb.from('crm_leads').update({ awaiting_reply_since: null }).eq('id', lead.id)
    return
  }

  // Lead pediu para parar: pausa o follow-up, vai para "Sem interesse" e avisa
  if (!lead.opted_out_at && OPT_OUT.test(plainText(text))) {
    await optOut(sb, inst.user_id, lead, text)
    return
  }

  // Lead respondeu: entra na fila "sua vez" e a agência é avisada uma vez por rodada
  if (!lead.awaiting_reply_since) {
    await sb.from('crm_leads').update({ awaiting_reply_since: sentAt }).eq('id', lead.id)
    await sb.rpc('crm_notify', {
      p_user: inst.user_id, p_type: 'CRM_REPLY',
      p_title: `${lead.name} respondeu no WhatsApp`,
      p_message: text.slice(0, 200),
      p_lead: lead.id,
    })
  }
}

// ─── Opt-out: o lead pediu para não receber mais mensagens ────────────────────
// Frases claras de recusa. "Agora não" ou "depois vejo" NÃO entram: isso é
// objeção, não pedido para parar.
const OPT_OUT = /\b(nao (tenho|tem) (mais )?interesse|sem interesse|nao me interessa|nao quero (mais )?(receber|mensage|contato|nada)|par(e|a|ar|em) de (me )?(mandar|enviar)|nao (me )?(mande|envie|mandem|enviem) mais|(me )?(tira|tire|remove|remova|exclua|exclui)( meu (numero|contato))?( da (sua )?lista)|descadastr|nao insista|nao entre (mais )?em contato)/

const plainText = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

async function optOut(sb: any, userId: string, lead: any, text: string) {
  const { data: columns } = await sb.from('crm_columns').select('id, name, stage_type, position').eq('user_id', userId).order('position')
  const target = (columns ?? []).find((c: any) => /sem\s*interesse/.test(plainText(c.name)))
    ?? (columns ?? []).find((c: any) => c.stage_type === 'perdido')
  const patch: Record<string, unknown> = {
    opted_out_at: new Date().toISOString(), followup_paused: true, awaiting_reply_since: null,
  }
  if (target) {
    patch.column_id = target.id
    if (target.stage_type === 'perdido') patch.lost_reason = 'Pediu para não receber mais mensagens'
  }
  await sb.from('crm_leads').update(patch).eq('id', lead.id)
  await sb.from('crm_lead_activities').insert({
    user_id: userId, lead_id: lead.id, kind: 'nota',
    content: `Pediu para não receber mais mensagens: "${text.slice(0, 300)}". Follow-up automático pausado${target ? ` e lead movido para "${target.name}"` : ''}.`,
  })
  await sb.rpc('crm_notify', {
    p_user: userId, p_type: 'CRM_OPT_OUT',
    p_title: `${lead.name} pediu para não receber mais mensagens`,
    p_message: `Follow-up pausado${target ? ` e lead movido para "${target.name}"` : ''}. Mensagem: "${text.slice(0, 160)}"`,
    p_lead: lead.id,
  })
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
  const params = new URL(req.url).searchParams
  const secret = params.get('secret') ?? ''
  const instId = params.get('inst') ?? ''
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => null)

  // Antes de tudo: guarda a conversa se for com um lead. Falha aqui não pode
  // impedir o assistente de responder.
  try {
    await storeConversation(createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY), instId, body)
  } catch (err) {
    console.error('crm-whatsapp-assistant: storeConversation', err)
  }

  const msg = parseIncoming(body)
  // Resposta 200 mesmo quando ignora: webhook com erro é reenviado pela UazAPI.
  // Mensagem comum (sem "CRM") sai sem log, para não encher o registro.
  if (!msg || msg.isGroup || msg.byApi) return ok({ ignored: true })
  if (!/^crm\b/i.test(msg.text)) return ok({ ignored: true })

  // Daqui em diante é um comando: todo "ignorado" deixa o motivo no log da
  // função (Supabase > Edge Functions > Logs), sem o número completo.
  const { number: from, fromMe } = msg
  const skip = (reason: string) => {
    console.log(`crm-whatsapp-assistant: ignorado (${reason}) inst=${instId.slice(0, 8)} de=…${from.slice(-4)} fromMe=${fromMe}`)
    return ok({ ignored: true, reason })
  }

  const question = msg.text.replace(/^crm[\s:,.-]*/i, '').trim()
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) as any

  // A instância que recebeu diz de qual agência é o número
  if (!/^[0-9a-f-]{36}$/i.test(instId)) return skip('inst inválida na URL do webhook')
  const { data: inst } = await sb.from('whatsapp_instances').select('user_id, instance_token').eq('id', instId).maybeSingle()
  if (!inst?.user_id) return skip('instância não encontrada')

  const { data: agency } = await sb
    .from('profiles')
    .select('id, whatsapp, whatsapp_verified, agency_name, full_name, role')
    .eq('id', inst.user_id)
    .maybeSingle()

  if (!agency || agency.role !== 'agency') return skip('conta não é agência')

  // Só o dono. Dois caminhos:
  //   • fromMe na conversa com o próprio número conectado (conversa "Você");
  //   • mensagem recebida do número pessoal verificado do dono.
  // Qualquer outro remetente (cliente, lead) recebe silêncio: responder
  // confirmaria que o número atende comandos. E fromMe em outra conversa é a
  // agência falando com um cliente — também não é comando.
  const key = phoneKey(msg.number)
  if (!key) return skip('número do remetente ilegível')
  if (msg.fromMe) {
    const { data: own } = await sb.from('agency_whatsapp').select('phone').eq('user_id', agency.id).maybeSingle()
    if (phoneKey(own?.phone) !== key) return skip('enviado pela agência em conversa que não é a "Você"')
  } else if (!agency.whatsapp_verified || phoneKey(agency.whatsapp) !== key) {
    return skip(agency.whatsapp_verified ? 'remetente não é o número pessoal do dono' : 'número pessoal do dono não verificado')
  }
  const token = inst.instance_token

  if (!question) {
    await reply(token, msg.number, 'Oi! Me pergunte sobre o seu funil começando com CRM. Ex: *CRM quem eu preciso chamar hoje?*')
    return ok()
  }

  const blocked = await consumeCredit(sb, agency.id)
  if (blocked) {
    await reply(token, msg.number, blocked)
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
    await reply(token, msg.number, `${answer}\n\n_Detalhes no CRM: ${APP_URL}/crm_`)
  } catch (err) {
    console.error('crm-whatsapp-assistant:', err)
    await reply(token, msg.number, 'Tive um problema para consultar o CRM agora. Tente de novo em instantes.')
  }

  return ok()
})
