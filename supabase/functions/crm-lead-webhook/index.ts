// ── Edge Function: crm-lead-webhook ───────────────────────────────────────────
// Entrada de leads de fora do CRM: anúncios do Meta (Lead Ads), formulários de
// site, n8n, Make, Zapier. Cada agência usa a URL com o token do formulário de
// captura dela:
//   POST .../functions/v1/crm-lead-webhook?token=<capture_token>
// Aceita JSON ou formulário, com nomes de campo variados (nome/name/full_name,
// whatsapp/telefone/phone_number, email, empresa, origem, mensagem) e também
// o formato do Meta ({ field_data: [{ name, values: [...] }] }).
//
// Tudo passa pela mesma função do formulário de captura (submit_crm_capture,
// migration 075): mesmo número não vira card duplicado, há freio contra
// enxurrada e a agência é avisada. O formulário de captura precisa estar ativo.
//   supabase functions deploy crm-lead-webhook --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Nomes aceitos para cada campo (sem acento, sem espaço, sem pontuação)
const KEYS: Record<string, string[]> = {
  name:      ['nome', 'name', 'fullname', 'nomecompleto', 'firstname', 'contato', 'lead'],
  whatsapp:  ['whatsapp', 'whats', 'telefone', 'celular', 'phone', 'phonenumber', 'fone', 'tel', 'numero'],
  email:     ['email', 'mail'],
  company:   ['empresa', 'company', 'companyname', 'negocio', 'clinica'],
  instagram: ['instagram', 'insta'],
  source:    ['origem', 'source', 'canal', 'utmsource', 'campanha', 'campaign', 'adname', 'formname'],
  message:   ['mensagem', 'message', 'obs', 'observacao', 'observacoes', 'comentario', 'duvida'],
}

/** Junta tudo num objeto plano: aceita o formato do Meta e objetos aninhados simples. */
function flatten(body: any): Record<string, string> {
  const out: Record<string, string> = {}
  const add = (k: string, v: unknown) => {
    if (v == null || typeof v === 'object') return
    const key = plain(k)
    if (key && !(key in out)) out[key] = String(v)
  }
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o.field_data)) {
      for (const f of o.field_data) add(f?.name ?? '', Array.isArray(f?.values) ? f.values[0] : f?.value)
    }
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v)
      else add(k, v)
    }
  }
  walk(body)
  return out
}

const pick = (flat: Record<string, string>, field: string) => {
  for (const k of KEYS[field]) if (flat[k]?.trim()) return flat[k].trim()
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405)

  const token = new URL(req.url).searchParams.get('token') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ ok: false, error: 'Token inválido.' }, 401)

  const type = req.headers.get('content-type') ?? ''
  let body: any = {}
  try {
    body = type.includes('application/json')
      ? await req.json()
      : Object.fromEntries((await req.formData()).entries())
  } catch {
    return json({ ok: false, error: 'Corpo da requisição ilegível.' }, 400)
  }

  const flat = flatten(body)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as any
  const { data, error } = await sb.rpc('submit_crm_capture', {
    p_token:     token,
    p_name:      pick(flat, 'name'),
    p_whatsapp:  pick(flat, 'whatsapp'),
    p_email:     pick(flat, 'email') || null,
    p_company:   pick(flat, 'company') || null,
    p_instagram: pick(flat, 'instagram') || null,
    p_message:   pick(flat, 'message') || null,
    p_source:    pick(flat, 'source') || 'Integração',
    p_website:   null,
  })
  if (error) {
    console.error('crm-lead-webhook:', error.message)
    return json({ ok: false, error: 'Não consegui registrar o lead.' }, 500)
  }
  return json(data ?? { ok: true }, data?.ok === false ? 400 : 200)
})
