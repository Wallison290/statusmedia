// ── whatsapp-fetch-groups (UazAPI) ────────────────────────────────────────────
// POST body { invite_code: "..." }
//   1. Tenta POST /group/join  → bot entra e retorna info do grupo
//   2. Se join falha (já membro) → tenta POST /group/inviteInfo → obtém info sem entrar
//   Nunca lista todos os grupos (privacidade multi-tenant)

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

import { createClient } from 'npm:@supabase/supabase-js@2'
import { agencySender } from '../_shared/whatsapp.ts'

const BASE_URL = (Deno.env.get('EVOLUTION_BASE_URL') ?? '').replace(/\/$/, '')
const TOKEN    = Deno.env.get('EVOLUTION_API_KEY') ?? ''

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Número usado nesta chamada: o da agência, se conectado; senão o da plataforma
let callBase = BASE_URL
let callToken = TOKEN

async function uazPost(path: string, body: unknown) {
  const res  = await fetch(`${callBase}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', token: callToken },
    body:    JSON.stringify(body),
  })
  const text = await res.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { /* não é JSON */ }
  return { ok: res.ok, status: res.status, data, text }
}

function extractGroup(data: any): { jid: string; name: string } | null {
  // Alguns endpoints envolvem o grupo em { group: { ... } }
  const d = data?.group ?? data
  const jid  = d?.JID ?? d?.id ?? d?.remoteJid ?? d?.jid ?? d?.groupJid ?? d?.GroupJID ?? ''
  const name = d?.Name ?? d?.Subject ?? d?.name ?? d?.subject ?? d?.groupName ?? d?.GroupName ?? ''
  if (typeof jid === 'string' && jid.endsWith('@g.us')) return { jid, name: name || jid }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!BASE_URL || !TOKEN) {
    return json({ ok: false, error: 'UazAPI não configurada (faltam secrets)' })
  }

  try {
    callBase = BASE_URL
    callToken = TOKEN
    // Com o WhatsApp da agência conectado, é o número dela que identifica (e,
    // se preciso, entra) no grupo: é ele que vai mandar as mensagens depois
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (jwt) {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { data: { user } } = await sb.auth.getUser(jwt)
      const agency = user ? await agencySender(sb, user.id) : null
      if (agency) { callBase = agency.base; callToken = agency.token }
    }

    const body   = await req.json().catch(() => ({}))
    const invite = ((body as any).invite_code ?? '').trim()
    if (!invite) return json({ ok: false, error: 'invite_code é obrigatório' })

    // Extrai o código puro do link (sem query string): "https://chat.whatsapp.com/CODE?mode=..."  → "CODE"
    const inviteCode = invite.includes('chat.whatsapp.com/')
      ? invite.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0]
      : invite.split('?')[0]

    // ── 1. Tenta entrar no grupo (URL limpa, sem query params) ───────────
    const cleanUrl = `https://chat.whatsapp.com/${inviteCode}`
    const joinRes  = await uazPost('/group/join', { invitecode: cleanUrl })
    console.log('join status:', joinRes.status, joinRes.text.slice(0, 200))
    const fromJoin = extractGroup(joinRes.data)

    // ── 2. Obtém info do grupo pelo código (retorna nome mesmo se já membro)
    const infoRes  = await uazPost('/group/inviteInfo', { invitecode: inviteCode })
    console.log('inviteInfo status:', infoRes.status, infoRes.text.slice(0, 200))
    const fromInfo = extractGroup(infoRes.data)

    // ── 3. Combina: usa o JID de qualquer fonte; prefere nome do inviteInfo
    const jid  = fromJoin?.jid  ?? fromInfo?.jid  ?? ''
    const name = fromInfo?.name ?? fromJoin?.name ?? ''
    // Se nome ainda é o próprio JID (fallback vazio), prefere fromInfo.name
    const finalName = (name && name !== jid) ? name : (fromInfo?.name ?? fromJoin?.name ?? jid)

    if (jid.endsWith('@g.us')) {
      return json({ ok: true, group: { jid, name: finalName || jid } })
    }

    // ── 4. Nenhuma fonte retornou um JID válido ────────────────────────────
    const detail = `join ${joinRes.status}: ${joinRes.text.slice(0, 120)} | inviteInfo ${infoRes.status}: ${infoRes.text.slice(0, 120)}`
    return json({ ok: false, error: detail })

  } catch (err) {
    return json({ ok: false, error: String(err) })
  }
})
