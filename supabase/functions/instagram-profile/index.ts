// ── Edge Function: instagram-profile ──────────────────────────────────────────
// Perfil e posts publicados da conta de Instagram conectada a um cliente, para
// a prévia do Feed do Perfil: bio, link, seguidores, seguindo, quantidade de
// posts, foto e os últimos posts do feed (o que já está no ar).
//
// Entrada (POST, autenticado com o JWT do usuário da agência ou sócio):
//   { client_id: uuid }
// Saída:
//   { ok: true, profile: {...}, media: [{ id, media_type, image, permalink, timestamp, caption }] }
//   { ok: false, error: 'no_account' | 'token_expired' | 'ig_error', message }
//
// Só leitura (permissão instagram_business_basic, já aprovada). Atualiza o
// cache followers_count/profile_picture_url em instagram_accounts de carona.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { agencyIdFor } from '../_shared/agency.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON    = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const IG_API           = 'https://graph.instagram.com/v21.0'
const MEDIA_LIMIT      = 36

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Não autenticado' }, 401)
    // Sócio age como o dono da agência (migration 088)
    const agencyId = await agencyIdFor(user.id)

    const { client_id } = await req.json()
    if (!client_id) return json({ error: 'Parâmetro faltando (client_id)' }, 400)

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE)

    const { data: client } = await admin
      .from('clients').select('id, user_id').eq('id', client_id).maybeSingle()
    if (!client || (client as any).user_id !== agencyId) {
      return json({ error: 'Cliente não encontrado ou sem permissão' }, 403)
    }

    const { data: account } = await admin
      .from('instagram_accounts')
      .select('ig_user_id, username, access_token, token_expires_at')
      .eq('client_id', client_id).eq('is_active', true).maybeSingle()
    const acc = account as any
    if (!acc) {
      return json({ ok: false, error: 'no_account', message: 'Nenhuma conta de Instagram conectada a este cliente.' })
    }
    if (acc.token_expires_at && new Date(acc.token_expires_at) < new Date()) {
      return json({ ok: false, error: 'token_expired', message: 'O token do Instagram expirou. Reconecte a conta do cliente.' })
    }

    const token    = acc.access_token
    const igUserId = String(acc.ig_user_id)

    const fields = 'username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url'
    let [profRes, mediaRes] = await Promise.all([
      fetch(`${IG_API}/${igUserId}?fields=${fields}&access_token=${token}`).then(r => r.json()).catch(() => null),
      fetch(`${IG_API}/${igUserId}/media?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp,caption&limit=${MEDIA_LIMIT}&access_token=${token}`)
        .then(r => r.json()).catch(() => null),
    ])

    // Algum campo recusado (conta pessoal, versão da API): tenta o básico
    if (profRes?.error) {
      const basic = await fetch(`${IG_API}/${igUserId}?fields=username,followers_count,media_count,profile_picture_url&access_token=${token}`)
        .then(r => r.json()).catch(() => null)
      if (basic && !basic.error) profRes = basic
    }

    if (!profRes || profRes.error) {
      return json({ ok: false, error: 'ig_error', message: profRes?.error?.message ?? 'Não foi possível ler o perfil do Instagram.' })
    }

    const profile = {
      username:            profRes.username ?? acc.username ?? null,
      name:                profRes.name ?? null,
      biography:           profRes.biography ?? '',
      website:             profRes.website ?? '',
      followers_count:     profRes.followers_count ?? null,
      follows_count:       profRes.follows_count ?? null,
      media_count:         profRes.media_count ?? null,
      profile_picture_url: profRes.profile_picture_url ?? null,
    }

    // Reels/vídeo: a capa vem em thumbnail_url; foto e carrossel em media_url
    const media = (mediaRes?.data ?? []).map((m: any) => ({
      id:         String(m.id),
      media_type: m.media_type ?? null,
      image:      m.media_type === 'VIDEO' ? (m.thumbnail_url ?? null) : (m.media_url ?? m.thumbnail_url ?? null),
      permalink:  m.permalink ?? null,
      timestamp:  m.timestamp ?? null,
      caption:    m.caption ?? null,
    })).filter((m: any) => m.image)

    // Cache de carona (o resto do app lê daqui)
    const cache: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof profile.followers_count === 'number') cache.followers_count = profile.followers_count
    if (profile.profile_picture_url) cache.profile_picture_url = profile.profile_picture_url
    await admin.from('instagram_accounts').update(cache).eq('client_id', client_id).eq('ig_user_id', igUserId)

    return json({ ok: true, profile, media })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Erro inesperado' }, 500)
  }
})
