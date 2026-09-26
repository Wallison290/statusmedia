// ── Qual WhatsApp envia a mensagem ────────────────────────────────────────────
// Regra: cada agência fala pelo PRÓPRIO número, conectado pela StatusMedia
// (instância UazAPI dela, ver migration 076 e a função agency-whatsapp).
// Enquanto a agência não conecta, ou se o número dela falhar, a mensagem sai
// pelo número da plataforma, como era antes. Assim nenhuma agência fica sem
// aviso durante a troca.
//
// Exceção: aviso para o próprio dono da agência quando o número dele é o mesmo
// que está conectado. WhatsApp enviado de um número para ele mesmo cai na
// conversa "Você" sem tocar notificação, e o aviso passaria despercebido.
// Nesse caso o aviso sai pelo número da plataforma.

type Supa = any

export interface Sender {
  base:  string
  token: string
  kind:  'agency' | 'platform'
  phone: string | null   // número conectado (só no da agência)
}

const AGENCY_BASE = (Deno.env.get('AGENCY_UAZAPI_URL') ?? Deno.env.get('EVOLUTION_BASE_URL') ?? '').replace(/\/$/, '')

/** Número da plataforma, com a configuração que cada função já usava. */
export function platformSender(base: string, token: string): Sender | null {
  const b = (base ?? '').replace(/\/$/, '')
  return b && token ? { base: b, token, kind: 'platform', phone: null } : null
}

/** WhatsApp da agência, se ela conectou um. */
export async function agencySender(sb: Supa, userId: string): Promise<Sender | null> {
  if (!AGENCY_BASE || !userId) return null
  const [{ data: inst }, { data: state }] = await Promise.all([
    sb.from('whatsapp_instances').select('instance_token').eq('user_id', userId).maybeSingle(),
    sb.from('agency_whatsapp').select('status, phone').eq('user_id', userId).maybeSingle(),
  ])
  if (!inst?.instance_token || state?.status !== 'connected') return null
  return { base: AGENCY_BASE, token: inst.instance_token, kind: 'agency', phone: state.phone ?? null }
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
      body: JSON.stringify({ number, text }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}` }
    return { ok: true, id: data?.key?.id ?? data?.id ?? data?.messageid }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Envia em nome da agência: número dela primeiro, plataforma se não houver ou
 * se falhar. `toOwner` liga a exceção do aviso para o próprio dono.
 */
export async function sendForAgency(
  sb: Supa, userId: string, to: string, text: string,
  platform: Sender | null, opts: { toOwner?: boolean } = {},
): Promise<{ ok: boolean; via?: Sender['kind']; id?: string; error?: string }> {
  const agency = await agencySender(sb, userId)
  const selfChat = opts.toOwner && agency && phoneKey(agency.phone) !== null && phoneKey(agency.phone) === phoneKey(to)

  if (agency && !selfChat) {
    const r = await sendVia(agency, to, text)
    if (r.ok) return { ...r, via: 'agency' }
    if (!platform) return { ...r, via: 'agency' }
    console.warn('[whatsapp] número da agência falhou, usando o da plataforma:', r.error)
  }
  if (!platform) return { ok: false, error: 'Nenhum WhatsApp configurado para enviar.' }
  const r = await sendVia(platform, to, text)
  return { ...r, via: 'platform' }
}
