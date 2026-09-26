// ── Edge Function: notify-whatsapp ────────────────────────────────────────────
// Fan-out de uma notificação para o WhatsApp da AGÊNCIA via Evolution API.
//
// Dois modos de invocação:
//   1) Webhook (tempo real): chamado pelo trigger AFTER INSERT on notifications,
//      com body { type: 'INSERT', record: <notification> }.
//   2) Sweep (rede de segurança): chamado pelo cron sem record; varre as
//      notificações recentes sem entrega 'sent'/'skipped' e reprocessa.
//
// Regra de ouro da Fase 1: só envia se o destinatário for role = 'agency',
// estiver com opt_in + verified e com a categoria habilitada nas preferências.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendForAgency, platformSender } from '../_shared/whatsapp.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const EVOLUTION_BASE_URL = (Deno.env.get('EVOLUTION_BASE_URL') ?? '').replace(/\/$/, '')
const EVOLUTION_API_KEY  = Deno.env.get('EVOLUTION_API_KEY') ?? ''
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? ''

// Número da plataforma: reserva para agência que ainda não conectou o próprio
// WhatsApp (ver _shared/whatsapp.ts). Com o número da agência conectado, os
// avisos saem por ele.
const PLATFORM = platformSender(EVOLUTION_BASE_URL, EVOLUTION_API_KEY)

// Domínio público do app, para montar o link clicável na mensagem.
const APP_URL = (Deno.env.get('APP_PUBLIC_URL') ?? 'https://statusmedia.com.br').replace(/\/$/, '')

// Quantas notificações o sweep reprocessa por execução.
const SWEEP_LIMIT = 25

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface NotificationRow {
  id: string
  user_id: string
  client_id: string | null
  type: string
  title: string
  message: string
  link: string | null
  created_at: string
}

// ─── Mapa tipo → categoria (espelha notification_category no SQL) ─────────────

const CATEGORY_OF: Record<string, string> = {
  APPROVED: 'aprovacoes', REJECTED: 'aprovacoes', COMMENT: 'aprovacoes',
  APPROVAL_REQUEST: 'aprovacoes', ADJUSTMENT_DONE: 'aprovacoes',
  NEW_CONTENT: 'conteudo',
  POST_PUBLISHED: 'instagram', POST_FAILED: 'instagram',
  TASK_DONE: 'tarefas', TASK_STATUS_UPDATE: 'tarefas',
  FORM_SUBMITTED: 'solicitacoes', NOTE_REQUEST: 'solicitacoes',
  CRM_FOLLOWUP: 'crm', CRM_LEAD_NEW: 'crm', CRM_PROPOSAL_VIEWED: 'crm',
  CRM_PROPOSAL_ACCEPTED: 'crm', CRM_PROPOSAL_REJECTED: 'crm',
  CRM_CONTRACT_SIGNED: 'crm', CRM_AUTOMATION: 'crm',
}

// Link de destino por tipo (mesma lógica do Header.tsx onView).
function buildLink(n: NotificationRow): string | null {
  if (n.type === 'NOTE_REQUEST') return `${APP_URL}${n.link || '/notes'}`
  // O CRM grava o caminho completo no link ('/crm?lead=<id>')
  if (n.type.startsWith('CRM_')) return `${APP_URL}${n.link || '/crm'}`
  if (!n.link) {
    if (['APPROVAL_REQUEST', 'ADJUSTMENT_DONE', 'NEW_CONTENT'].includes(n.type)) {
      return `${APP_URL}/planner`
    }
    return null
  }
  if (['POST_PUBLISHED', 'POST_FAILED', 'FORM_SUBMITTED'].includes(n.type)) {
    return `${APP_URL}${n.link}`
  }
  return `${APP_URL}/planner?item=${n.link}`
}

const AGENCY_TITLE: Record<string, string> = {
  APPROVED:           '✅ Aprovação recebida!',
  REJECTED:           '❌ Conteúdo reprovado',
  COMMENT:            '✏️ Ajuste solicitado',
  POST_PUBLISHED:     '📸 Post publicado no Instagram!',
  POST_FAILED:        '🚨 Falha ao publicar',
  FORM_SUBMITTED:     '📋 Formulário respondido',
  NOTE_REQUEST:       '💡 Nova solicitação/ideia',
  TASK_DONE:          '✔️ Tarefa concluída',
  TASK_STATUS_UPDATE: '🔄 Atualização de tarefa',
  // CRM_FOLLOWUP e CRM_AUTOMATION usam o título gravado ("Você tem 3 retornos
  // hoje", nome da automação), mais informativo que um título fixo.
  CRM_LEAD_NEW:          '🧲 Novo lead',
  CRM_PROPOSAL_VIEWED:   '👀 Proposta aberta agora',
  CRM_PROPOSAL_ACCEPTED: '🎉 Proposta aceita!',
  CRM_PROPOSAL_REJECTED: '📉 Proposta recusada',
  CRM_CONTRACT_SIGNED:   '✍️ Contrato assinado!',
}

function buildMessage(n: NotificationRow): string {
  const link = buildLink(n)
  const head = `*${AGENCY_TITLE[n.type] ?? n.title}*`
  const body = n.message ? `\n\n${n.message}` : ''
  const tail = link ? `\n\n👉 ${link}` : ''
  return `${head}${body}${tail}`
}

// ─── UazAPI ──────────────────────────────────────────────────────────────────
// Endpoint: POST /send/text
// Auth:     header "token" com o token da instância
// Body:     { number, text }

// Normaliza número: só dígitos, com DDI 55 (Brasil).
function normalizeNumber(raw: string): string {
  let n = (raw || '').replace(/\D/g, '')
  if (!n) return n
  if (!n.startsWith('55') && n.length <= 11) n = '55' + n
  return n
}

async function sendToJid(jid: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY) {
    return { ok: false, error: 'UazAPI não configurada (faltam secrets)' }
  }
  try {
    const res = await fetch(`${EVOLUTION_BASE_URL}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: jid, text }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(data)}` }
    const id = data?.key?.id ?? data?.id ?? null
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

async function sendText(to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  return sendToJid(normalizeNumber(to), text)
}

// ─── Tipos de notificação que vão para o cliente (envio manual) ──────────────

const CLIENT_NOTIFY_TYPES_MANUAL = new Set(['APPROVAL_REQUEST', 'ADJUSTMENT_DONE', 'NEW_CONTENT'])

// ─── Mensagem para o cliente (formato amigável, sem contexto interno) ─────────

function buildClientMessage(n: NotificationRow, agencyName: string): string {
  const link = buildLink(n)
  const linkLine = link ? `\n👉 ${link}` : ''
  switch (n.type) {
    case 'APPROVAL_REQUEST':
      return `🔔 *Conteúdo aguardando sua aprovação*\n\nA *${agencyName}* atualizou o conteúdo e está aguardando o seu feedback.\n\nClique para aprovar, reprovar ou solicitar ajustes:${linkLine}`
    case 'ADJUSTMENT_DONE':
      return `✅ *Ajuste concluído!*\n\nA *${agencyName}* finalizou o ajuste que você solicitou.\nO conteúdo está pronto para a sua aprovação final.${link ? '\n\n👉 ' + link : ''}`
    case 'NEW_CONTENT':
      return `🆕 *Novo conteúdo no seu planejamento!*\n\nA *${agencyName}* adicionou novos conteúdos para você revisar e aprovar.\n\nAcesse o link abaixo para conferir:${linkLine}`
    default:
      return `${n.title}\n\n${n.message ?? ''}${link ? '\n\n👉 ' + link : ''}`
  }
}

// ─── Fan-out para o WhatsApp do cliente ──────────────────────────────────────

type Supa = ReturnType<typeof createClient>

async function sendClientNotification(
  supabase: Supa,
  n: NotificationRow,
  agencyProfile: any,
): Promise<{ ok: boolean; error?: string }> {
  if (!n.client_id) return { ok: false, error: 'sem client_id' }
  const { data: client } = await supabase
    .from('clients')
    .select('whatsapp, company_name')
    .eq('id', n.client_id)
    .maybeSingle()

  const whatsapp = (client as any)?.whatsapp
  if (!whatsapp) return { ok: false, error: 'cliente sem WhatsApp cadastrado' }

  const agencyName = (agencyProfile as any).agency_name || (agencyProfile as any).full_name || 'Sua agência'
  const msg = buildClientMessage(n, agencyName)
  return sendForAgency(supabase, n.user_id, whatsapp, msg, PLATFORM)
}

// ─── Processa uma notificação ─────────────────────────────────────────────────

async function processNotification(supabase: Supa, n: NotificationRow): Promise<string> {
  // Reserva a entrega (idempotência): se já existe, ninguém mais envia.
  const { data: existing } = await supabase
    .from('notification_deliveries')
    .select('id, status')
    .eq('notification_id', n.id)
    .eq('channel', 'whatsapp')
    .maybeSingle()

  if (existing && (existing as any).status !== 'failed' && (existing as any).status !== 'pending') {
    return (existing as any).status // 'sent' ou 'skipped' — nada a fazer
  }

  const isFirstTime = !existing

  // Cria/garante a linha de entrega como 'pending'.
  if (!existing) {
    const { error: insErr } = await supabase
      .from('notification_deliveries')
      .insert({ notification_id: n.id, channel: 'whatsapp', provider: 'evolution', status: 'pending' })
    // Corrida: outra invocação já criou — deixa o dono original seguir.
    if (insErr) return 'pending'
  }

  const finish = async (
    status: 'sent' | 'failed' | 'skipped',
    extra: Record<string, unknown> = {},
  ) => {
    await supabase
      .from('notification_deliveries')
      .update({ status, updated_at: new Date().toISOString(), ...extra })
      .eq('notification_id', n.id)
      .eq('channel', 'whatsapp')
    return status
  }

  // Busca o perfil da agência (usado para envio da agência e fan-out do cliente).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, whatsapp, whatsapp_opt_in, whatsapp_verified, whatsapp_prefs, full_name, agency_name')
    .eq('id', n.user_id)
    .maybeSingle()

  const p = profile as any

  // ── Notificação da agência ────────────────────────────────────────────────────
  if (!p)                        return finish('skipped', { error: 'perfil não encontrado' })
  if (p.role !== 'agency')       return finish('skipped', { error: 'destinatário não é agência' })
  if (!p.whatsapp)               return finish('skipped', { error: 'sem número de WhatsApp' })
  if (!p.whatsapp_opt_in)        return finish('skipped', { error: 'opt-in desligado' })
  if (!p.whatsapp_verified)      return finish('skipped', { error: 'número não verificado' })

  const category = CATEGORY_OF[n.type]
  if (!category)                 return finish('skipped', { error: `tipo sem categoria: ${n.type}` })
  const prefs = p.whatsapp_prefs ?? {}
  if (prefs[category] === false) return finish('skipped', { error: `categoria '${category}' desligada` })

  // Envia para a agência.
  const text = buildMessage(n)
  const sent = await sendForAgency(supabase, n.user_id, p.whatsapp, text, PLATFORM, { toOwner: true })

  // Incrementa tentativas sempre.
  await supabase.rpc('increment_delivery_attempts', { p_notification_id: n.id }).catch(() => {})

  // Fan-out para grupos configurados da agência.
  const { data: groups } = await (supabase as any)
    .from('whatsapp_groups')
    .select('group_jid, categories')
    .eq('user_id', n.user_id)
    .eq('is_active', true)

  for (const g of groups ?? []) {
    const cats = g.categories ?? {}
    // CRM só vai para grupo que ligou a categoria de propósito: grupo pode ter
    // cliente dentro, e o aviso traz nome de lead e valor de proposta.
    if (category === 'crm' ? cats.crm !== true : cats[category] === false) continue
    await sendForAgency(supabase, n.user_id, g.group_jid, text, PLATFORM).catch(() => {})
  }

  if (sent.ok) {
    return finish('sent', {
      provider_msg_id: sent.id ?? null, to_number: normalizeNumber(p.whatsapp), error: null,
      provider: sent.via === 'agency' ? 'agency_whatsapp' : 'evolution',
    })
  }
  // Falha fica como 'failed' → o sweep tenta de novo na próxima passada.
  return finish('failed', { error: sent.error ?? 'erro desconhecido' })
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

  try {
    const body = await req.json().catch(() => ({}))

    // Modo manual: chamado diretamente pelo frontend para notificar um cliente.
    if (body?.mode === 'manual_client') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ ok: false, error: 'Não autorizado' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      const jwt = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
      if (authErr || !user) {
        return new Response(JSON.stringify({ ok: false, error: 'Token inválido' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      const { client_id, type, group_jids } = body as { client_id: string; type: string; group_jids?: string[] }
      if (!client_id || !type || !CLIENT_NOTIFY_TYPES_MANUAL.has(type)) {
        return new Response(JSON.stringify({ ok: false, error: 'Parâmetros inválidos' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      const { data: agencyProfile } = await supabase
        .from('profiles')
        .select('role, full_name, agency_name')
        .eq('id', user.id)
        .maybeSingle()
      if (!agencyProfile || (agencyProfile as any).role !== 'agency') {
        return new Response(JSON.stringify({ ok: false, error: 'Apenas agências podem notificar' }), {
          status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      const fakeNotif: NotificationRow = {
        id: crypto.randomUUID(),
        user_id: user.id,
        client_id,
        type,
        title: '',
        message: '',
        link: null,
        created_at: new Date().toISOString(),
      }
      const result = await sendClientNotification(supabase, fakeNotif, agencyProfile)

      // Envia também para os grupos selecionados
      if (Array.isArray(group_jids) && group_jids.length > 0) {
        const agencyName = (agencyProfile as any).agency_name || (agencyProfile as any).full_name || 'Sua agência'
        const { data: clientData } = await supabase
          .from('clients').select('company_name').eq('id', client_id).maybeSingle()
        const clientName = (clientData as any)?.company_name ?? ''
        const groupMsg = buildClientMessage(fakeNotif, agencyName) +
          (clientName ? `\n\n_Cliente: ${clientName}_` : '')
        for (const jid of group_jids) {
          await sendForAgency(supabase, user.id, jid, groupMsg, PLATFORM).catch(() => {})
        }
      }

      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 422,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Modo manual apenas grupos (sem cliente específico).
    if (body?.mode === 'manual_groups') {
      const authHeader = req.headers.get('Authorization')
      const jwt = authHeader?.replace('Bearer ', '') ?? ''
      const { data: { user } } = await supabase.auth.getUser(jwt)
      if (!user) return new Response(JSON.stringify({ ok: false, error: 'Não autorizado' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      })
      const { type, group_jids } = body as { type: string; group_jids: string[] }
      if (!Array.isArray(group_jids) || group_jids.length === 0) {
        return new Response(JSON.stringify({ ok: false, error: 'Nenhum grupo selecionado' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      const { data: agencyProfile } = await supabase.from('profiles')
        .select('full_name, agency_name').eq('id', user.id).maybeSingle()
      const agencyName = (agencyProfile as any)?.agency_name || (agencyProfile as any)?.full_name || 'Agência'
      const fakeNotif: NotificationRow = {
        id: crypto.randomUUID(), user_id: user.id, client_id: null,
        type, title: '', message: '', link: null, created_at: new Date().toISOString(),
      }
      const msg = buildClientMessage(fakeNotif, agencyName)
      for (const jid of group_jids) { await sendForAgency(supabase, user.id, jid, msg, PLATFORM).catch(() => {}) }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Modo 1: webhook com um record específico.
    if (body?.record?.id) {
      const status = await processNotification(supabase, body.record as NotificationRow)
      return new Response(JSON.stringify({ ok: true, status }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Modo 2: sweep — reprocessa pendentes/falhas das últimas 24h.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: pending } = await supabase
      .from('notification_deliveries')
      .select('notification_id')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
      .gte('created_at', since)
      .limit(SWEEP_LIMIT)

    const ids = (pending ?? []).map((d: any) => d.notification_id)
    let processed = 0
    if (ids.length) {
      const { data: notifs } = await supabase
        .from('notifications')
        .select('*')
        .in('id', ids)
      for (const n of (notifs ?? []) as NotificationRow[]) {
        await processNotification(supabase, n)
        processed++
      }
    }

    return new Response(JSON.stringify({ ok: true, swept: processed }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-whatsapp error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
