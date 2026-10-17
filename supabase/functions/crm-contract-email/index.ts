// ── Edge Function: crm-contract-email ────────────────────────────────────────
// Manda o link de assinatura do contrato para o e-mail do lead (migration 101).
//
// POST JSON (JWT) { contract_id }
//   • o contrato é lido com o RLS de quem chamou: só a agência dona (ou um
//     sócio dela) consegue disparar;
//   • só contrato "enviado" sai: rascunho e cancelado não têm link no ar, e o
//     assinado já foi resolvido;
//   • o link é montado aqui com o token do banco, nunca vindo da tela.
// E-mail com a marca da agência (logo e cor de CRM › Configurações) e resposta
// direto para o e-mail da agência.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildContractEmail, type Agency } from '../_shared/contractEmail.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY') ?? ''
const APP_URL      = (Deno.env.get('APP_PUBLIC_URL') ?? Deno.env.get('APP_URL') ?? 'https://statusmedia.com.br').replace(/\/$/, '')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const validEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 200 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v)

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Não autenticado.' }, 401)
  if (!RESEND_KEY) return json({ error: 'E-mail não configurado (RESEND_API_KEY).' }, 503)

  try {
    const user = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user: me }, error: authError } = await user.auth.getUser(auth.slice(7))
    if (authError || !me) return json({ error: 'Sessão inválida. Entre novamente.' }, 401)

    let body: { contract_id?: unknown }
    try { body = await req.json() } catch { return json({ error: 'Solicitação inválida.' }, 400) }
    if (!uuid(body?.contract_id)) return json({ error: 'Contrato inválido.' }, 400)

    // RLS de quem chamou: contrato de outra agência simplesmente não aparece
    const { data: c, error } = await user.from('crm_contracts')
      .select('id, user_id, lead_id, title, status, public_token, agency_signature')
      .eq('id', body.contract_id).maybeSingle()
    if (error) throw error
    if (!c) return json({ error: 'Contrato não encontrado.' }, 404)
    if (c.status !== 'enviado') return json({ error: 'Só contrato enviado para assinatura pode ir por e-mail.' }, 400)
    if (!c.lead_id) return json({ error: 'Contrato sem lead vinculado.' }, 400)

    const { data: lead } = await user.from('crm_leads').select('name, email').eq('id', c.lead_id).maybeSingle()
    const to = lead?.email?.trim().toLowerCase()
    if (!validEmail(to)) return json({ error: 'O lead está sem e-mail válido cadastrado.' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    const [{ data: agency }, { data: profile }] = await Promise.all([
      admin.rpc('crm_agency_public', { p_user: c.user_id }),
      admin.from('profiles').select('email').eq('id', c.user_id).maybeSingle(),
    ])
    const ag: Agency = { name: agency?.name || 'Agência', logo: agency?.logo ?? null, color: agency?.color ?? null }
    const replyTo = validEmail(profile?.email) ? profile!.email : null
    const link = `${APP_URL}/contrato/${c.public_token}`
    const firstName = lead?.name?.trim().split(/\s+/)[0] || null

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${ag.name.replace(/[<>"\r\n]/g, '').slice(0, 80)} <noreply@statusmedia.com.br>`,
        to: [to],
        subject: `Contrato para assinatura: ${c.title}`.replace(/[\r\n]/g, ' ').slice(0, 180),
        html: buildContractEmail({ agency: ag, firstName, title: c.title, link, agencySigned: !!c.agency_signature }),
        text: `${firstName ? `Olá, ${firstName}!` : 'Olá!'} A ${ag.name} enviou o contrato "${c.title}" para você conferir e assinar.\n\nAbra o link para assinar: ${link}\n\nFicou com dúvida? É só responder este e-mail.`,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })
    if (!res.ok) {
      console.error('[crm-contract-email] Resend', res.status, (await res.text()).slice(0, 300))
      return json({ error: 'Não consegui enviar o e-mail agora. Tente de novo em instantes.' }, 502)
    }

    const sentAt = new Date().toISOString()
    await Promise.all([
      admin.from('crm_contracts').update({ email_sent_at: sentAt, email_sent_to: to }).eq('id', c.id),
      admin.rpc('crm_log', {
        p_user: c.user_id, p_lead: c.lead_id, p_kind: 'contrato',
        p_content: `Contrato enviado por e-mail para ${to}`,
        p_meta: { contract_id: c.id, channel: 'email' },
      }),
    ])
    return json({ ok: true, to, sent_at: sentAt })
  } catch (err) {
    console.error('[crm-contract-email]', err)
    return json({ error: 'Erro ao enviar o e-mail do contrato.' }, 500)
  }
})
