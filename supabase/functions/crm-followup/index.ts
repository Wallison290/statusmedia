// ── Edge Function: crm-followup ───────────────────────────────────────────────
// Follow-up automático do CRM (migration 080). Roda de hora em hora pelo
// pg_cron e só envia das 8h às 20h, de segunda a sábado (horário de Brasília).
//
// Regra, lead a lead, nas agências que ligaram o follow-up:
//   1. A última mensagem REAL da conversa precisa ser da agência. Se o lead
//      falou por último, quem deve resposta é a agência: nada sai.
//      Follow-up automático não conta como mensagem real.
//   2. Degraus de 1, 3, 7 e 14 dias de silêncio, cada um usado uma vez só por
//      lead. O próximo degrau é o menor que ainda não foi usado, e sai quando o
//      silêncio chega nele. Ex.: o de 1 dia já foi, o lead respondeu e sumiu de
//      novo: espera completar 3 dias.
//   3. Dois degraus seguidos no mesmo silêncio respeitam a distância entre eles
//      (do de 1 para o de 3 dias, 2 dias). Lead parado há um mês não recebe
//      os quatro de uma vez.
//   4. A IA escreve a mensagem na hora com o briefing do que está sendo vendido,
//      o papel do degrau (guia de cadência) e a conversa real com o lead.
//   5. Depois do de 14 dias, o lead vai para a etapa de perdido.
//
// Cada mensagem consome 1 crédito de IA do plano, como o chat do app.
// Auth: mesmo esquema do whatsapp-health (X-Cron-Secret do Vault ou service role).
//   supabase functions deploy crm-followup --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { agencySender, sendVia, phoneKey } from '../_shared/whatsapp.ts'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET      = Deno.env.get('CRON_SECRET') ?? ''
const REFRESH_SECRET   = Deno.env.get('TOKEN_REFRESH_SECRET') ?? ''
const OPENAI_API_KEY   = Deno.env.get('OPENAI_API_KEY') ?? ''

const STEPS = [1, 3, 7, 14]
const DAY = 86_400_000

// Freios: por varredura e os mesmos do envio manual (agency-whatsapp)
const MAX_PER_AGENCY_RUN = 15
const MAX_PER_HOUR = 60
const MAX_PER_DAY  = 300
const LOST_REASON  = 'Sem resposta depois da cadência de follow-up'
// Depois do último follow-up, quantos dias de silêncio até ir para perdido
const LOST_AFTER_DAYS = 7

/** Remove acento e caixa para comparar nomes de etapa. */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Como reconhecer pelo nome a etapa de cada degrau: "Follow-up 24h",
// "Follow-Up 03 dias", "FUP 7 dias"...
const STEP_NAME: Record<number, RegExp> = {
  1:  /(^|\D)(24\s*h|24\s*horas|0?1\s*dia)(\D|$)/,
  3:  /(^|\D)0?3\s*dias?(\D|$)/,
  7:  /(^|\D)0?7\s*dias?(\D|$)/,
  14: /(^|\D)14\s*dias?(\D|$)/,
}

// Etapas comuns ("normal") que na prática encerram a conversa: sem follow-up
const NO_FOLLOWUP_NAME = /sem\s*interesse|desisti|descartad|perdid|nao\s*qualificad|desqualificad/

/** Etapa do funil para o degrau: a escolhida nas configurações ou a achada pelo nome. */
function followupColumn(step: number, columns: any[], chosen: Record<string, string>) {
  const pick = chosen?.[String(step)]
  if (pick === 'none') return null
  if (pick) return columns.find(c => c.id === pick) ?? null
  return columns.find(c => c.stage_type === 'normal' && STEP_NAME[step].test(plain(c.name))) ?? null
}

const AI_LIMITS: Record<string, number> = { starter: 150, pro: 600, agency: 2000 }

// O que cada degrau entrega (guia "Cadência de follow-up")
const STEP_GOAL: Record<number, string> = {
  1:  'Retomar o objetivo do lead usando as palavras que ele mesmo usou na conversa.',
  3:  'Contar um caso de cliente parecido que alcançou o resultado. Use SOMENTE casos e resultados que estão no briefing. Se o briefing não tiver nenhum, fale do resultado que a solução costuma trazer para negócios como o dele, sem inventar nomes, números nem depoimentos.',
  7:  'Dar uma dica útil que o lead pode aplicar mesmo sem comprar, ligada ao problema dele.',
  14: 'Encerrar de forma leve, sem cobrança, deixando a porta aberta para quando fizer sentido.',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** 8h às 20h, segunda a sábado, em Brasília. */
function inBusinessHours(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const weekday = parts.find(p => p.type === 'weekday')?.value
  return weekday !== 'Sun' && hour >= 8 && hour < 20
}

async function consumeCredit(sb: any, userId: string): Promise<boolean> {
  const month = new Date().toISOString().slice(0, 7)
  const { data: sub } = await sb.from('subscriptions').select('plan, status, trial_ends_at').eq('user_id', userId).maybeSingle()
  const active = sub?.status === 'active'
    || (sub?.status === 'trialing' && sub?.trial_ends_at && new Date(sub.trial_ends_at) > new Date())
  if (!active) return false
  const limit = AI_LIMITS[sub?.plan ?? 'starter'] ?? 50
  const { data: usage } = await sb.from('ai_usage').select('requests').eq('user_id', userId).eq('month', month).maybeSingle()
  const current = usage?.requests ?? 0
  if (current + 1 > limit) return false
  await sb.from('ai_usage').upsert(
    { user_id: userId, month, requests: current + 1, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,month' },
  )
  return true
}

function briefingText(o: any) {
  return [
    `Oferta: ${o.name}`,
    o.product  && `O que vendemos: ${o.product}`,
    o.audience && `Para quem: ${o.audience}`,
    o.problem  && `Necessidade/dor que resolvemos: ${o.problem}`,
    o.solution && `O que isso muda na vida do negócio: ${o.solution}`,
    o.price    && `Preço/condições: ${o.price}`,
    o.proof    && `Casos e resultados reais: ${o.proof}`,
    o.tips     && `Dicas úteis que podemos dar: ${o.tips}`,
    o.tone     && `Tom de voz: ${o.tone}`,
  ].filter(Boolean).join('\n')
}

async function writeMessage(ai: OpenAI, args: {
  agency: string; lead: any; offer: any; step: number; conversation: any[]
}) {
  const { agency, lead, offer, step, conversation } = args
  const firstName = String(lead.name ?? '').trim().split(/\s+/)[0] ?? ''
  const history = conversation.slice().reverse().map(m => {
    const who = m.direction === 'in' ? firstName || 'Lead' : 'Nós'
    const tag = m.source === 'followup' ? ' (follow-up automático)' : ''
    return `${who}${tag}: ${String(m.text).slice(0, 600)}`
  }).join('\n')

  const system =
    `Você escreve mensagens de follow-up de WhatsApp em nome de "${agency}", em português do Brasil.\n` +
    'O lead conversou com a agência e parou de responder. A mensagem reconecta o lead com o problema e os objetivos que ELE disse, sem cobrar resposta.\n\n' +
    'Regras obrigatórias:\n' +
    '- Nada de "e aí, pensou?", "conseguiu ver minha proposta?" ou qualquer cobrança.\n' +
    '- Curta e humana: no máximo 3 linhas, uma pergunta só, como uma pessoa escrevendo.\n' +
    '- Termine com uma pergunta fácil de responder.\n' +
    '- Sem pressão e sem escassez falsa. Nunca invente fatos, números, casos ou promessas que não estejam no briefing.\n' +
    '- Não repita o que já foi dito nos follow-ups anteriores.\n' +
    '- Nunca atribua ao lead algo que ele não escreveu na conversa. Nada de "você comentou", "você disse" ou "lembrei que você" sem a fala real dele.\n' +
    '- Sem markdown, sem aspas, no máximo 1 emoji. Chame o lead pelo primeiro nome.\n' +
    '- Responda somente com o texto da mensagem.\n\n' +
    `BRIEFING DO QUE ESTAMOS VENDENDO:\n${briefingText(offer)}`

  const user =
    `Lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''}\n` +
    (lead.notes ? `Anotações da agência: ${String(lead.notes).slice(0, 800)}\n` : '') +
    `\nEste é o follow-up de ${step} dia${step > 1 ? 's' : ''}. Objetivo desta mensagem: ${STEP_GOAL[step]}\n\n` +
    `Conversa (mais antiga primeiro):\n${history}`

  // Lead que ainda não respondeu nada não tem palavras dele para retomar
  const leadSpoke = conversation.some(m => m.direction === 'in')
  const silentNote = leadSpoke ? '' :
    '\nO lead AINDA NÃO RESPONDEU nada: não existe fala dele para retomar. Parta do motivo do contato e da necessidade descrita no briefing, em forma de pergunta, sem afirmar o que ele pensa ou precisa.\n'

  const res = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.6,
    max_tokens: 220,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user + silentNote }],
  })
  return (res.choices[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '')
}

async function runAgency(sb: any, ai: OpenAI, userId: string) {
  const report = { sent: 0, skipped: 0, lost: 0, errors: [] as string[] }
  const sender = await agencySender(sb, userId)
  if (!sender) return { ...report, note: 'WhatsApp desconectado' }

  const [{ data: columns }, { data: offers }, { data: leads }, { data: prof }, { data: settings }] = await Promise.all([
    sb.from('crm_columns').select('id, name, stage_type, position').eq('user_id', userId).order('position'),
    sb.from('crm_offers').select('*').eq('user_id', userId).order('created_at'),
    sb.from('crm_leads').select('id, name, company, notes, whatsapp, column_id, followup_offer_id, followup_done, followup_last_at')
      .eq('user_id', userId).is('archived_at', null).eq('followup_paused', false).not('whatsapp', 'is', null),
    sb.from('profiles').select('agency_name, full_name').eq('id', userId).maybeSingle(),
    sb.from('crm_settings').select('followup_columns').eq('user_id', userId).maybeSingle(),
  ])
  if (!offers?.length) return { ...report, note: 'sem briefing' }

  const stage = new Map((columns ?? []).map((c: any) => [c.id, c.stage_type]))
  const colById = new Map((columns ?? []).map((c: any) => [c.id, c]))
  const stepColumn = (step: number) => followupColumn(step, columns ?? [], settings?.followup_columns ?? {})

  /** Leva o card para a etapa do degrau, só para frente no funil. */
  async function moveTo(lead: any, target: any) {
    const cur: any = colById.get(lead.column_id)
    if (!target || target.id === lead.column_id || (cur && cur.position >= target.position)) return
    await sb.from('crm_leads').update({ column_id: target.id }).eq('id', lead.id)
    lead.column_id = target.id
  }
  const lostColumn = (columns ?? []).find((c: any) => c.stage_type === 'perdido')
  const defaultOffer = offers.find((o: any) => o.is_default) ?? offers[0]
  const agency = prof?.agency_name || prof?.full_name || 'a agência'
  const now = Date.now()

  const countSent = async (since: number) => (await sb.from('crm_lead_activities').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('kind', 'whatsapp').eq('meta->>sent_via', 'agency_whatsapp')
    .gte('created_at', new Date(since).toISOString())).count ?? 0

  for (const lead of leads ?? []) {
    if (report.sent >= MAX_PER_AGENCY_RUN) break
    const st = stage.get(lead.column_id)
    // Etapa fechada (ganho/perdido) ou de descarte ("Sem interesse"): nada de follow-up
    const colName = plain((colById.get(lead.column_id) as any)?.name ?? '')
    if (st === 'ganho' || st === 'perdido' || NO_FOLLOWUP_NAME.test(colName) || !phoneKey(lead.whatsapp)) continue

    const done: number[] = lead.followup_done ?? []
    const next = STEPS.find(d => !done.includes(d))
    const lastStep = STEPS[STEPS.length - 1]
    // Cadência inteira usada: só falta ver se o lead do último degrau vai para perdido
    if (!next && !(done.includes(lastStep) && stepColumn(lastStep) && lostColumn)) continue

    const { data: conv } = await sb.from('crm_messages').select('direction, text, source, sent_at')
      .eq('lead_id', lead.id).order('sent_at', { ascending: false }).limit(40)
    const lastReal = (conv ?? []).find((m: any) => m.source !== 'followup')

    if (!next) {
      // Recebeu o de 14 dias, ficou na etapa dele e seguiu sem responder por
      // mais LOST_AFTER_DAYS: a cadência acabou, vai para perdido
      const lastFollowAt = lead.followup_last_at ? new Date(lead.followup_last_at).getTime() : 0
      const silentSince = lastReal ? new Date(lastReal.sent_at).getTime() : 0
      if (lastReal?.direction === 'out' && lastFollowAt > silentSince && (now - lastFollowAt) >= LOST_AFTER_DAYS * DAY
          && lead.column_id === stepColumn(lastStep)?.id) {
        await sb.from('crm_leads').update({ column_id: lostColumn.id, lost_reason: LOST_REASON }).eq('id', lead.id)
        report.lost++
      }
      continue
    }
    // Sem conversa gravada ou o lead falou por último: nada a fazer
    if (!lastReal || lastReal.direction !== 'out') { report.skipped++; continue }

    const lastRealAt = new Date(lastReal.sent_at).getTime()
    if ((now - lastRealAt) < next * DAY) continue

    // Já houve follow-up neste mesmo silêncio: respeita a distância entre degraus
    const lastFollowAt = lead.followup_last_at ? new Date(lead.followup_last_at).getTime() : 0
    if (lastFollowAt > lastRealAt) {
      const prev = Math.max(0, ...done.filter(d => d < next))
      if ((now - lastFollowAt) < (next - prev) * DAY) continue
    }

    if (await countSent(now - 3600e3) >= MAX_PER_HOUR || await countSent(now - DAY) >= MAX_PER_DAY) {
      report.errors.push('limite de envios atingido')
      break
    }

    const offer = offers.find((o: any) => o.id === lead.followup_offer_id) ?? defaultOffer

    const { data: claimed } = await sb.rpc('crm_followup_claim', { p_lead: lead.id, p_step: next })
    if (!claimed) continue

    if (!(await consumeCredit(sb, userId))) {
      await sb.rpc('crm_followup_release', { p_lead: lead.id, p_step: next })
      report.errors.push('sem créditos de IA ou assinatura inativa')
      break
    }

    let text = ''
    try {
      text = await writeMessage(ai, { agency, lead, offer, step: next, conversation: conv ?? [] })
    } catch (err) {
      console.error('crm-followup: IA', err)
    }
    if (!text) {
      await sb.rpc('crm_followup_release', { p_lead: lead.id, p_step: next })
      report.errors.push(`IA sem resposta (${lead.id.slice(0, 8)})`)
      continue
    }

    const sent = await sendVia(sender, lead.whatsapp, text)
    if (!sent.ok) {
      await sb.rpc('crm_followup_release', { p_lead: lead.id, p_step: next })
      report.errors.push(`envio falhou (${lead.id.slice(0, 8)}): ${sent.error ?? ''}`.slice(0, 200))
      break   // provavelmente desconectou: tenta na próxima hora
    }

    const label = `Follow-up de ${next} dia${next > 1 ? 's' : ''}`
    await sb.from('crm_messages').insert({
      user_id: userId, lead_id: lead.id, direction: 'out', text, source: 'followup',
      followup_step: next, wa_id: sent.id ?? null,
    })
    await sb.from('crm_lead_activities').insert({
      user_id: userId, lead_id: lead.id, kind: 'whatsapp',
      content: `${label} (automático): "${text}"`,
      meta: { sent_via: 'agency_whatsapp', followup_step: next },
    })

    // O card acompanha a cadência: vai para a etapa do degrau (ex.: "Follow-up 24h").
    // Último degrau sem etapa própria no funil: vai direto para perdido.
    const target = stepColumn(next)
    if (target) await moveTo(lead, target)
    else if (next === lastStep && lostColumn) {
      await sb.from('crm_leads').update({ column_id: lostColumn.id, lost_reason: LOST_REASON }).eq('id', lead.id)
    }

    report.sent++
    await sleep(2500 + Math.random() * 2500)   // não dispara tudo no mesmo segundo
  }
  return report
}

Deno.serve(async (req) => {
  const auth   = req.headers.get('Authorization') ?? ''
  const secret = req.headers.get('X-Cron-Secret') ?? ''
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const valid  = [CRON_SECRET, REFRESH_SECRET].filter(s => s.length > 0)
  const authorized = (!!SUPABASE_SERVICE && token === SUPABASE_SERVICE)
    || valid.some(s => s === secret || s === token)
  if (!authorized) return new Response('Unauthorized', { status: 401 })

  if (!inBusinessHours()) return json({ ok: true, skipped: 'fora do horário' })
  if (!OPENAI_API_KEY) return json({ ok: false, error: 'OPENAI_API_KEY ausente' }, 500)

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE) as any
  const ai = new OpenAI({ apiKey: OPENAI_API_KEY })

  const { data: agencies } = await sb.from('crm_settings').select('user_id').eq('followup_enabled', true)
  const results: Record<string, unknown> = {}
  for (const a of agencies ?? []) {
    try {
      results[a.user_id.slice(0, 8)] = await runAgency(sb, ai, a.user_id)
    } catch (err) {
      console.error('crm-followup:', a.user_id, err)
      results[a.user_id.slice(0, 8)] = { error: String(err).slice(0, 200) }
    }
  }
  console.log('crm-followup:', JSON.stringify(results))
  return json({ ok: true, results })
})
