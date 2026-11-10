// ── Qual WhatsApp envia a mensagem ────────────────────────────────────────────
// Regra única: cada agência fala pelo PRÓPRIO número, conectado pela
// StatusMedia (instância UazAPI dela, ver migration 076 e a função
// agency-whatsapp). Não existe mais número da plataforma: agência sem WhatsApp
// conectado não envia nada por WhatsApp (os avisos seguem no sininho do app).
//
// Aviso para o próprio dono quando o número dele é o mesmo conectado: a
// mensagem cai na conversa "Você" e não toca notificação. Continua sendo
// enviada (fica registrada), e a tela de WhatsApp recomenda cadastrar um
// número pessoal diferente para receber os avisos.

type Supa = any

export interface Sender {
  base:  string
  token: string
  phone: string | null   // número conectado
}

export const NOT_CONNECTED = 'Conecte o WhatsApp da agência na página WhatsApp da StatusMedia para enviar mensagens.'

const AGENCY_BASE = (Deno.env.get('AGENCY_UAZAPI_URL') ?? '').replace(/\/$/, '')

/** WhatsApp da agência, se ela conectou um. */
export async function agencySender(sb: Supa, userId: string): Promise<Sender | null> {
  if (!AGENCY_BASE || !userId) return null
  const [{ data: inst }, { data: state }] = await Promise.all([
    sb.from('whatsapp_instances').select('instance_token, server_url').eq('user_id', userId).maybeSingle(),
    sb.from('agency_whatsapp').select('status, phone').eq('user_id', userId).maybeSingle(),
  ])
  if (!inst?.instance_token || state?.status !== 'connected') return null
  // cada instância no servidor dela (migration 117); vazio = servidor do secret
  return { base: (inst.server_url || AGENCY_BASE).replace(/\/$/, ''), token: inst.instance_token, phone: state.phone ?? null }
}

export function normalizeNumber(raw: string): string {
  let n = (raw || '').replace(/\D/g, '')
  if (!n) return n
  if (!n.startsWith('55') && n.length <= 11) n = '55' + n
  return n
}

/** DDD + últimos 8 dígitos: compara números com/sem 55 e com/sem o nono dígito. */
export function phoneKey(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  if (d.length < 10) return null
  return d.slice(0, 2) + d.slice(-8)
}

export async function sendVia(s: Sender, to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  // Grupo vai como está (…@g.us); número vira só dígitos com 55
  const number = to.includes('@') ? to : normalizeNumber(to)
  if (!number) return { ok: false, error: 'Número inválido.' }
  try {
    const res = await fetch(`${s.base}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: s.token },
      // linkPreview false: links (proposta, Pix, portal) sem o cartão grande com imagem
      body: JSON.stringify({ number, text, linkPreview: false }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}` }
    return { ok: true, id: data?.key?.id ?? data?.id ?? data?.messageid }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/** Envia pelo WhatsApp da agência. `notConnected` diferencia "não conectou" de falha. */
// ── Número oficial da Status Media (decisão de 10/11/2026) ──────────────────
// Avisos às agências, código de verificação e mensagens automáticas aos clientes
// (cobrança, lembretes, aprovação, avisos ao colaborador) saem pelo número da
// plataforma (secrets STATUSMEDIA_WA_URL + STATUSMEDIA_WA_TOKEN). O número de
// cada agência fica para: grupos de WhatsApp (o número oficial não está neles),
// conversa com leads do CRM (crm-followup usa agencySender direto) e o assistente.
// Sem os secrets, ou se o número oficial falhar, usa o número da agência.
const PLATAFORMA_BASE  = (Deno.env.get('STATUSMEDIA_WA_URL') ?? '').replace(/\/$/, '')
const PLATAFORMA_TOKEN = Deno.env.get('STATUSMEDIA_WA_TOKEN') ?? ''

export function platformSender(): Sender | null {
  return PLATAFORMA_BASE && PLATAFORMA_TOKEN ? { base: PLATAFORMA_BASE, token: PLATAFORMA_TOKEN, phone: null } : null
}

export async function sendForAgency(
  sb: Supa, userId: string, to: string, text: string,
): Promise<{ ok: boolean; id?: string; error?: string; notConnected?: boolean; via?: 'plataforma' | 'agencia' }> {
  const grupo = to.includes('@g.us')
  const oficial = grupo ? null : platformSender()
  if (oficial) {
    const r = await sendVia(oficial, to, text)
    if (r.ok) return { ...r, via: 'plataforma' }
    console.warn('whatsapp: número oficial falhou, tentando pelo da agência', r.error)
    const agency = await agencySender(sb, userId)
    if (!agency) return r
    return { ...(await sendVia(agency, to, text)), via: 'agencia' }
  }
  const agency = await agencySender(sb, userId)
  if (!agency) return { ok: false, error: NOT_CONNECTED, notConnected: true }
  return { ...(await sendVia(agency, to, text)), via: 'agencia' }
}
