// ── invite-client: convite de acesso ao portal do cliente ────────────────────
// POST (JWT da agência) { clientId, resend? }
//
// Segurança:
//   • só quem é da agência dona do cliente pode convidar;
//   • o e-mail é o do cadastro do cliente (nunca um e-mail vindo do navegador);
//   • reenvio só recria a conta se ela for DESTE cliente e ainda estiver sem
//     senha. Conta com senha criada, ou de outra pessoa, nunca é apagada.
// Cada tentativa vai para client_portal_events (migration 095), que a tela do
// cliente mostra como linha do tempo do acesso ao portal.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { agencyIdFor } from '../_shared/agency.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL              = Deno.env.get('APP_URL') ?? 'https://statusmedia.com.br'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // ── Quem está pedindo ──────────────────────────────────────────────────────
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: { user } } = await sb.auth.getUser(jwt)
  if (!user) return json({ error: 'Não autenticado.' }, 401)
  const agencyId = await agencyIdFor(user.id)

  const { clientId, resend } = await req.json().catch(() => ({}))
  if (!clientId) return json({ error: 'clientId é obrigatório.' }, 400)

  const { data: client } = await sb.from('clients')
    .select('id, user_id, email, responsible_name, company_name').eq('id', clientId).maybeSingle()
  if (!client || client.user_id !== agencyId) return json({ error: 'Cliente não encontrado.' }, 404)

  const email = String(client.email ?? '').trim().toLowerCase()
  if (!email) return json({ error: 'Cadastre o e-mail do cliente antes de enviar o convite.' }, 400)

  const { data: actorName } = await sb.rpc('login_display_name', { p_user: user.id })
  const log = (kind: string, detail?: string) => sb.from('client_portal_events').insert({
    client_id: client.id, user_id: agencyId, kind, email, detail: detail ?? null, actor_name: actorName ?? null,
  })

  try {
    // ── Assinatura ativa ─────────────────────────────────────────────────────
    const { data: plan } = await sb.rpc('agency_active_plan', { p_agency: agencyId })
    if (!plan) return json({ error: 'Assinatura inativa. Assine um plano para convidar clientes ao portal.' }, 403)

    // ── Já existe login com esse e-mail? ─────────────────────────────────────
    const { data: existingId } = await sb.rpc('find_user_id_by_email', { p_email: email })
    if (existingId) {
      const [{ data: prof }, { data: auth }] = await Promise.all([
        sb.from('profiles').select('role, linked_client_id').eq('id', existingId).maybeSingle(),
        sb.auth.admin.getUserById(existingId as string),
      ])
      const meta = auth?.user?.user_metadata ?? {}
      const isThisClient = prof?.role === 'client' && (prof?.linked_client_id === client.id || meta.linked_client_id === client.id)

      if (!isThisClient) {
        await log('convite_falhou', 'e-mail já é login de outra conta')
        return json({ error: 'Esse e-mail já é usado por outra conta da StatusMedia. Cadastre outro e-mail para o cliente.' }, 409)
      }
      if (meta.needs_password_setup !== true) {
        return json({ success: true, state: 'ativo', message: 'O cliente já criou a senha e tem acesso ao portal.' })
      }
      if (!resend) {
        return json({ success: true, state: 'aguardando_senha', message: 'Convite já enviado; o cliente ainda não criou a senha.' })
      }
      // Reenvio: a conta é deste cliente e ainda sem senha, então pode ser recriada
      const { error: delErr } = await sb.auth.admin.deleteUser(existingId as string)
      if (delErr) throw delErr
    }

    // ── Envia ────────────────────────────────────────────────────────────────
    const { data: invite, error } = await sb.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${APP_URL}/auth/callback`,
      data: {
        role: 'client',
        full_name: client.responsible_name ?? '',
        company_name: client.company_name ?? '',
        linked_client_id: client.id,
        needs_password_setup: true,
      },
    })
    if (error) throw error

    if (invite?.user?.id) {
      await sb.rpc('setup_client_profile', {
        p_user_id: invite.user.id, p_client_id: client.id, p_client_name: client.responsible_name ?? '', p_email: email,
      })
    }

    await log(existingId ? 'convite_reenviado' : 'convite_enviado')
    return json({ success: true, state: 'aguardando_senha', resent: !!existingId })
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    await log('convite_falhou', msg.slice(0, 300))
    return json({ error: `O convite não foi enviado: ${msg}` }, 400)
  }
})
