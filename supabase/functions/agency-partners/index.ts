// ── Edge Function: agency-partners ────────────────────────────────────────────
// Sócios da agência (migration 088): pessoas com login próprio que operam o
// sistema inteiro da agência, com os mesmos poderes do dono — inclusive
// assinatura e convites de outros sócios. Recurso do plano Agency.
//
// POST (JWT do usuário) { action, ... }
//   list                      → dono + sócios, com "convite pendente" ou "ativo"
//   invite { email, name }    → convida por e-mail; quem já tem login (sem
//                               agência própria) é vinculado na hora
//   resend { partner_id }     → reenvia o convite de quem ainda não entrou
//   remove { partner_id }     → tira o acesso (o dono nunca está na lista)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'
import { agencyIdFor } from '../_shared/agency.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL      = Deno.env.get('APP_URL') ?? 'https://statusmedia.com.br'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// deno-lint-ignore no-explicit-any
async function sendInvite(sb: any, email: string, name: string) {
  const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${APP_URL}/auth/callback`,
    data: { full_name: name, partner_invite: true, needs_partner_password: true },
  })
  if (error) throw error
  const id = data?.user?.id as string | undefined
  if (!id) throw new Error('Não foi possível criar o convite.')
  // O cadastro cria um trial Starter para toda conta de agência nova. O sócio
  // usa a assinatura da agência; sem isso ele receberia avisos de trial.
  await sb.from('subscriptions').delete().eq('user_id', id)
  return id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const sb  = createClient(SUPABASE_URL, SERVICE_KEY)
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await sb.auth.getUser(jwt)
    if (!user) return json({ error: 'Não autenticado.' }, 401)
    const agencyId = await agencyIdFor(user.id)

    const { data: owner } = await sb.from('profiles')
      .select('id, full_name, email, role').eq('id', agencyId).maybeSingle()
    if (owner?.role !== 'agency') return json({ error: 'Disponível só para agências.' }, 403)

    const { data: sub } = await sb.from('subscriptions')
      .select('plan, status, trial_ends_at').eq('user_id', agencyId).maybeSingle()
    const planOk = sub?.plan === 'agency' && (sub.status === 'active'
      || (sub.status === 'trialing' && !!sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date()))

    const body = await req.json().catch(() => ({}))
    const action = body.action ?? 'list'

    if (action === 'list') {
      const { data: rows } = await sb.from('agency_partners')
        .select('id, partner_user_id, email, name, created_at')
        .eq('owner_id', agencyId).order('created_at')
      const partners = await Promise.all((rows ?? []).map(async (r) => {
        const { data } = await sb.auth.admin.getUserById(r.partner_user_id)
        return { ...r, last_sign_in_at: data?.user?.last_sign_in_at ?? null }
      }))
      return json({
        plan_ok: planOk,
        me: user.id,
        owner: { id: owner.id, name: owner.full_name, email: owner.email },
        partners,
      })
    }

    if (!planOk) {
      return json({ error: 'plan_required', message: 'Acesso de sócio é um recurso do plano Agency.' }, 403)
    }

    if (action === 'invite') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const name  = String(body.name ?? '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'E-mail inválido.' }, 400)
      if (email === String(owner.email ?? '').toLowerCase()) {
        return json({ error: 'Esse é o e-mail do dono da agência.' }, 400)
      }

      const { data: existingId } = await sb.rpc('find_user_id_by_email', { p_email: email })
      let partnerId: string
      let linked = false

      if (existingId) {
        partnerId = existingId as string
        const { data: other } = await sb.from('agency_partners')
          .select('owner_id').eq('partner_user_id', partnerId).maybeSingle()
        if (other) {
          return json({ error: other.owner_id === agencyId
            ? 'Essa pessoa já é sócia da agência.'
            : 'Esse e-mail já é sócio de outra agência no StatusMedia.' }, 409)
        }
        const { data: prof } = await sb.from('profiles').select('role').eq('id', partnerId).maybeSingle()
        if (prof?.role === 'client') {
          return json({ error: 'Esse e-mail é de um cliente no portal. Use outro e-mail para o sócio.' }, 409)
        }
        // Quem já tem agência própria com clientes perderia a visão dela ao
        // virar sócio — melhor usar outro e-mail do que esconder dados.
        const { count } = await sb.from('clients')
          .select('id', { count: 'exact', head: true }).eq('user_id', partnerId)
        if ((count ?? 0) > 0) {
          return json({ error: 'Esse e-mail já tem uma agência própria no StatusMedia, com clientes cadastrados. Use outro e-mail para o sócio.' }, 409)
        }
        linked = true
      } else {
        partnerId = await sendInvite(sb, email, name)
      }

      const { error: insErr } = await sb.from('agency_partners').insert({
        owner_id: agencyId, partner_user_id: partnerId, email, name: name || null, invited_by: user.id,
      })
      if (insErr) throw insErr
      return json({ ok: true, linked })
    }

    if (action === 'resend' || action === 'remove') {
      const { data: row } = await sb.from('agency_partners')
        .select('id, partner_user_id, email, name')
        .eq('id', body.partner_id ?? '').eq('owner_id', agencyId).maybeSingle()
      if (!row) return json({ error: 'Sócio não encontrado.' }, 404)

      if (action === 'remove') {
        await sb.from('agency_partners').delete().eq('id', row.id)
        return json({ ok: true })
      }

      // Reenvio: só para quem nunca entrou (o login ainda não tem senha).
      const { data: au } = await sb.auth.admin.getUserById(row.partner_user_id)
      if (au?.user?.last_sign_in_at) return json({ error: 'Essa pessoa já entrou no sistema.' }, 409)
      await sb.from('agency_partners').delete().eq('id', row.id)
      await sb.auth.admin.deleteUser(row.partner_user_id)
      const newId = await sendInvite(sb, row.email, row.name ?? '')
      await sb.from('agency_partners').insert({
        owner_id: agencyId, partner_user_id: newId, email: row.email, name: row.name, invited_by: user.id,
      })
      return json({ ok: true })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (err) {
    console.error('agency-partners error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
