// ── Edge Function: agency-whatsapp ────────────────────────────────────────────
// O WhatsApp PRÓPRIO da agência, conectado pela tela do CRM (QR code).
// Não é o número da plataforma: esse continua no notify-whatsapp.
//
// Ações (body.action):
//   status     → estado da conexão (e o QR code enquanto espera a leitura)
//   connect    → reserva/cria a instância da agência e gera o QR code
//   disconnect → desconecta o número (a instância continua reservada)
//   send       → envia texto para um lead da agência, pelo número dela
//
// O token da instância é a senha do WhatsApp da agência: fica na tabela
// whatsapp_instances (só service role) e nunca vai para o navegador.
//
// Secrets:
//   AGENCY_UAZAPI_URL    servidor UazAPI das instâncias das agências

//   UAZAPI_ADMIN_TOKEN   opcional: com ele a função CRIA uma instância nova por
//                        agência; sem ele, usa as instâncias livres do estoque
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'
import { agencyIdFor } from '../_shared/agency.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const BASE = (Deno.env.get('AGENCY_UAZAPI_URL') ?? '').replace(/\/$/, '')
const ADMIN_TOKEN = Deno.env.get('UAZAPI_ADMIN_TOKEN') ?? ''

// Assistente "CRM ..." e (no futuro) conversas no CRM: mensagens recebidas pelo
// número da agência chegam por este webhook, configurado aqui na conexão
const ASSISTANT_SECRET = Deno.env.get('CRM_ASSISTANT_SECRET') ?? ''

// Freio para proteger o número da agência de bloqueio por excesso de envio
const MAX_PER_HOUR = 60
const MAX_PER_DAY  = 300

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function uaz(path: string, token: string, init: { method?: string; body?: unknown; admin?: boolean } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(init.admin ? { admintoken: token } : { token }) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  return { ok: res.ok, status: res.status, data }
}

/** Lê o estado de qualquer formato de resposta da UazAPI. */
function readState(d: any) {
  const inst = d?.instance ?? d
  const raw = String(inst?.status ?? d?.status?.state ?? '').toLowerCase()
  const connected = d?.status?.connected === true || raw === 'connected' || raw === 'open'
  const connecting = !connected && (raw === 'connecting' || !!inst?.qrcode)
  const jid: string = d?.status?.jid ?? inst?.owner ?? ''
  const phone = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '') || null
  return {
    status: connected ? 'connected' : connecting ? 'connecting' : 'disconnected',
    qrcode: connected ? null : (inst?.qrcode || d?.qrcode || null),
    paircode: connected ? null : (inst?.paircode || d?.paircode || null),
    phone,
    profile_name: inst?.profileName ?? inst?.profile_name ?? null,
  }
}

function normalize(raw: string) {
  let n = (raw || '').replace(/\D/g, '')
  if (!n.startsWith('55') || n.length <= 11) n = '55' + n
  return n
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!BASE) return json({ ok: false, error: 'Servidor de WhatsApp não configurado.' }, 503)

  const sb = createClient(SUPABASE_URL, SERVICE_KEY) as any
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: { user } } = await sb.auth.getUser(jwt)
  if (!user) return json({ ok: false, error: 'Não autenticado.' }, 401)
  // Sócio age como o dono da agência (migration 088)
  const agencyId = await agencyIdFor(user.id)

  const { data: profile } = await sb.from('profiles').select('role').eq('id', agencyId).maybeSingle()
  if (profile?.role !== 'agency') return json({ ok: false, error: 'Disponível só para agências.' }, 403)

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? 'status')

  const { data: inst } = await sb.from('whatsapp_instances').select('*').eq('user_id', agencyId).maybeSingle()

  /** Liga o webhook de mensagens recebidas da instância, uma vez só. */
  async function ensureWebhook(row: any) {
    if (!row?.id || row.webhook_set || !ASSISTANT_SECRET) return
    const url = `${SUPABASE_URL}/functions/v1/crm-whatsapp-assistant?secret=${ASSISTANT_SECRET}&inst=${row.id}`
    const r = await uaz('/webhook', row.instance_token, {
      method: 'POST',
      body: { enabled: true, url, events: ['messages'], excludeMessages: ['wasSentByApi', 'isGroupYes'] },
    })
    if (r.ok) await sb.from('whatsapp_instances').update({ webhook_set: true }).eq('id', row.id)
    else console.warn('agency-whatsapp: webhook não configurado', r.status, JSON.stringify(r.data).slice(0, 200))
  }

  async function saveState(s: ReturnType<typeof readState>) {
    const row: Record<string, unknown> = { user_id: user!.id, status: s.status, updated_at: new Date().toISOString() }
    if (s.status === 'connected') {
      row.phone = s.phone
      row.profile_name = s.profile_name
    }
    const { data: prev } = await sb.from('agency_whatsapp').select('status').eq('user_id', user!.id).maybeSingle()
    if (s.status === 'connected' && prev?.status !== 'connected') row.connected_at = new Date().toISOString()
    await sb.from('agency_whatsapp').upsert(row, { onConflict: 'user_id' })
  }

  try {
    // ── status ────────────────────────────────────────────────────────────────
    if (action === 'status') {
      if (!inst) {
        // "Disponível" = dá para conectar agora: com admin token cria uma
        // instância nova; sem ele, só se sobrou instância livre no estoque.
        // A tela esconde o recurso de quem não tem como usar.
        const { count } = await sb.from('whatsapp_instances').select('id', { count: 'exact', head: true }).is('user_id', null)
        return json({ ok: true, status: 'disconnected', hasInstance: false, available: !!ADMIN_TOKEN || (count ?? 0) > 0 })
      }
      const r = await uaz('/instance/status', inst.instance_token)
      if (!r.ok) return json({ ok: false, error: 'Não consegui falar com o servidor do WhatsApp.' }, 502)
      const s = readState(r.data)
      await saveState(s)
      if (s.status === 'connected') await ensureWebhook(inst)
      return json({ ok: true, hasInstance: true, available: true, ...s })
    }

    // ── connect ───────────────────────────────────────────────────────────────
    // Cria a instância da agência na UazAPI: nome em sequência (agencia-001,
    // agencia-002...) e nome/e-mail da agência nos campos de admin, para o
    // painel da UazAPI dizer de quem é cada número (migration 078).
    const createInstance = async () => {
      const { data: name } = await sb.rpc('next_whatsapp_instance_name')
      if (!name) return null
      const r = await uaz('/instance/init', ADMIN_TOKEN, { method: 'POST', admin: true, body: { name, systemName: 'statusmedia' } })
      const token = r.data?.token ?? r.data?.instance?.token
      const uazId = r.data?.instance?.id ?? r.data?.id
      if (!r.ok || !token) return null

      const { data: prof } = await sb.from('profiles').select('agency_name, full_name, email').eq('id', agencyId).maybeSingle()
      if (uazId) {
        await uaz('/instance/updateAdminFields', ADMIN_TOKEN, {
          method: 'POST', admin: true,
          body: { id: uazId, adminField01: prof?.agency_name || prof?.full_name || '', adminField02: prof?.email || '' },
        })
      }
      const { data: created } = await sb.from('whatsapp_instances')
        .insert({ instance_name: name, instance_token: token, user_id: agencyId, assigned_at: new Date().toISOString() })
        .select().single()
      return created
    }

    if (action === 'connect') {
      let instance = inst
      if (!instance && ADMIN_TOKEN) {
        instance = await createInstance()
        if (!instance) return json({ ok: false, error: 'Não consegui criar o WhatsApp da agência agora.' }, 502)
      }
      if (!instance) {
        const { data: claimed } = await sb.rpc('claim_whatsapp_instance', { p_user: agencyId })
        instance = claimed?.id ? claimed : null
      }
      if (!instance) {
        return json({ ok: false, error: 'Nenhum WhatsApp disponível para conectar agora. Fale com o suporte da StatusMedia.' }, 409)
      }

      // Instância apagada no painel da UazAPI (token não vale mais): descarta o
      // registro e, com o admin token, cria outra no lugar
      let cur = await uaz('/instance/status', instance.instance_token)
      if (cur.status === 401 && ADMIN_TOKEN) {
        await sb.from('whatsapp_instances').delete().eq('id', instance.id)
        instance = await createInstance()
        if (!instance) return json({ ok: false, error: 'Não consegui criar o WhatsApp da agência agora.' }, 502)
        cur = await uaz('/instance/status', instance.instance_token)
      }

      // Já conectado: não gera QR à toa
      if (cur.ok && readState(cur.data).status === 'connected') {
        const s = readState(cur.data)
        await saveState(s)
        await ensureWebhook(instance)
        return json({ ok: true, ...s })
      }

      const r = await uaz('/instance/connect', instance.instance_token, { method: 'POST', body: {} })
      if (!r.ok) {
        // Plano da UazAPI no limite de números conectados ao mesmo tempo
        const limit = /maximum number of instances/i.test(JSON.stringify(r.data))
        return json({
          ok: false,
          error: limit
            ? 'O servidor de WhatsApp da StatusMedia atingiu o limite de números conectados. Fale com o suporte.'
            : 'Não consegui gerar o QR code. Tente de novo.',
        }, 502)
      }
      const s = readState(r.data)
      // A resposta do connect às vezes vem sem o QR; ele aparece no status logo depois
      if (!s.qrcode) {
        const again = await uaz('/instance/status', instance.instance_token)
        if (again.ok) Object.assign(s, readState(again.data))
      }
      await saveState({ ...s, status: s.status === 'disconnected' ? 'connecting' : s.status })
      return json({ ok: true, ...s, status: s.status === 'disconnected' ? 'connecting' : s.status })
    }

    // ── disconnect ────────────────────────────────────────────────────────────
    if (action === 'disconnect') {
      if (inst) await uaz('/instance/disconnect', inst.instance_token, { method: 'POST', body: {} })
      await sb.from('agency_whatsapp').upsert(
        { user_id: agencyId, status: 'disconnected', phone: null, profile_name: null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      return json({ ok: true, status: 'disconnected' })
    }

    // ── labels ────────────────────────────────────────────────────────────────
    // Etiquetas do WhatsApp Business da agência, para escolher a do primeiro
    // contato. WhatsApp comum não tem etiquetas: volta lista vazia.
    if (action === 'labels') {
      if (!inst) return json({ ok: true, labels: [] })
      const r = await uaz('/labels', inst.instance_token)
      const list = Array.isArray(r.data) ? r.data : []
      return json({
        ok: true,
        labels: list.map((l: any) => ({
          id: String(l.labelid ?? l.id),
          // O WhatsApp põe um caractere invisível no nome das etiquetas padrão
          name: String(l.name ?? '').replace(/[‎‏]/g, '').trim(),
          color: l.colorHex ?? null,
        })).filter((l: any) => l.name),
      })
    }

    // ── send ──────────────────────────────────────────────────────────────────
    if (action === 'send') {
      const leadId = String(body?.lead_id ?? '')
      const text = String(body?.text ?? '').trim().slice(0, 4000)
      const label = String(body?.label ?? 'Mensagem').slice(0, 80)
      if (!leadId || !text) return json({ ok: false, error: 'Mensagem vazia.' }, 400)
      if (!inst) return json({ ok: false, error: 'Conecte o seu WhatsApp em CRM → Configurações.' }, 409)

      // O lead precisa ser DESTA agência: o id vem do navegador
      const { data: lead } = await sb.from('crm_leads').select('id, name, whatsapp, column_id').eq('id', leadId).eq('user_id', agencyId).maybeSingle()
      if (!lead) return json({ ok: false, error: 'Lead não encontrado.' }, 404)
      if (!lead.whatsapp) return json({ ok: false, error: 'Este lead está sem WhatsApp no cadastro.' }, 400)

      const hourAgo = new Date(Date.now() - 3600e3).toISOString()
      const dayAgo  = new Date(Date.now() - 86400e3).toISOString()
      const count = async (since: string) => (await sb.from('crm_lead_activities').select('id', { count: 'exact', head: true })
        .eq('user_id', agencyId).eq('kind', 'whatsapp').eq('meta->>sent_via', 'agency_whatsapp').gte('created_at', since)).count ?? 0
      if (await count(hourAgo) >= MAX_PER_HOUR || await count(dayAgo) >= MAX_PER_DAY) {
        return json({ ok: false, error: 'Limite de envios pelo sistema atingido por agora, para proteger o seu número. Use o botão de abrir no WhatsApp.' }, 429)
      }

      // Registra ANTES de enviar e serve de trava: se chegar outra chamada com o
      // mesmo texto para o mesmo lead no último minuto (clique duplo, pedido
      // repetido), só a primeira envia. As outras respondem ok sem mandar nada.
      const content = `${label} (enviada pelo sistema): "${text}"`
      const { data: mine } = await sb.from('crm_lead_activities').insert({
        user_id: agencyId, lead_id: lead.id, kind: 'whatsapp', content,
        meta: { sent_via: 'agency_whatsapp' },
      }).select('id, created_at').single()
      const { data: same } = await sb.from('crm_lead_activities').select('id')
        .eq('lead_id', lead.id).eq('kind', 'whatsapp').eq('meta->>sent_via', 'agency_whatsapp')
        .eq('content', content).gte('created_at', new Date(Date.now() - 60e3).toISOString())
        .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(1)
      if (mine && same?.[0] && same[0].id !== mine.id) {
        await sb.from('crm_lead_activities').delete().eq('id', mine.id)
        return json({ ok: true, duplicate: true })
      }

      // linkPreview false: sem o cartão grande com imagem do site junto do link
      const r = await uaz('/send/text', inst.instance_token, { method: 'POST', body: { number: normalize(lead.whatsapp), text, linkPreview: false } })
      if (!r.ok) {
        if (mine) await sb.from('crm_lead_activities').delete().eq('id', mine.id)
        const st = await uaz('/instance/status', inst.instance_token)
        if (st.ok) await saveState(readState(st.data))
        const disconnected = st.ok && readState(st.data).status !== 'connected'
        return json({
          ok: false,
          error: disconnected
            ? 'O seu WhatsApp está desconectado. Conecte de novo em CRM → Configurações.'
            : 'O WhatsApp não aceitou o envio. Confira se o número do lead está certo.',
        }, 502)
      }

      // A agência respondeu: o lead sai da fila "esperando resposta"
      await sb.from('crm_leads').update({ awaiting_reply_since: null }).eq('id', lead.id)

      // Entra na conversa do lead: o follow-up automático conta a partir daqui
      await sb.from('crm_messages').insert({
        user_id: agencyId, lead_id: lead.id, direction: 'out', text, source: 'sistema',
        wa_id: [r.data?.messageid, r.data?.key?.id, r.data?.id].find(v => typeof v === 'string') ?? null,
      })

      // Primeiro contato (lead na primeira etapa do funil): a conversa ganha a
      // etiqueta escolhida no WhatsApp Business. Falhar aqui não desfaz o envio.
      let labeled = false
      try {
        const [{ data: settings }, { data: first }] = await Promise.all([
          sb.from('crm_settings').select('wa_first_contact_label').eq('user_id', agencyId).maybeSingle(),
          sb.from('crm_columns').select('id').eq('user_id', agencyId).order('position').limit(1).maybeSingle(),
        ])
        if (settings?.wa_first_contact_label && first?.id === lead.column_id) {
          const lr = await uaz('/chat/labels', inst.instance_token, {
            method: 'POST',
            body: { number: normalize(lead.whatsapp), add_labelid: settings.wa_first_contact_label },
          })
          labeled = lr.ok
          if (!lr.ok) console.warn('agency-whatsapp: etiqueta não aplicada', lr.status, JSON.stringify(lr.data).slice(0, 200))
        }
      } catch (err) {
        console.warn('agency-whatsapp: etiqueta', err)
      }
      return json({ ok: true, labeled })
    }

    return json({ ok: false, error: 'Ação desconhecida.' }, 400)
  } catch (err) {
    console.error('agency-whatsapp:', err)
    return json({ ok: false, error: 'Falha ao falar com o WhatsApp. Tente de novo.' }, 500)
  }
})
