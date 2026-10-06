// ── Edge Function: instagram-report ───────────────────────────────────────────
// Gera (ou atualiza) o relatório MENSAL de um cliente puxando as métricas da
// conta de Instagram conectada via API de Insights (instagram_business_manage_insights).
//
// Entrada (POST, autenticado com o JWT do usuário da agência):
//   { client_id: uuid, month: 1-12, year: number }
//
// Preenche em client_reports as colunas sociais (followers_*, reach, impressions,
// engagement %, posts_published) e um bloco RICO em ig_data:
//   profile_views, accounts_engaged, interactions{likes,comments,saves,shares},
//   top_posts[] (top 3 do mês com alcance) e demographics{gender,age,cities}.
// Mantém intactos os campos de tráfego pago e a análise escrita.
//
// Robusto: cada métrica é independente; falhas viram null/omissão e seguimos.
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function monthRange(year: number, month: number) {
  const since = Math.floor(Date.UTC(year, month - 1, 1, 0, 0, 0) / 1000)
  const until = Math.floor(Date.UTC(year, month, 1, 0, 0, 0) / 1000)
  return { since, until }
}

// ── Métrica de conta: total no período (lida com total_value e values[]) ──────
async function fetchAccountMetric(
  igUserId: string, token: string, metric: string,
  since: number, until: number, warnings: string[],
): Promise<number | null> {
  const tryUrls = [
    `${IG_API}/${igUserId}/insights?metric=${metric}&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${token}`,
    `${IG_API}/${igUserId}/insights?metric=${metric}&period=day&since=${since}&until=${until}&access_token=${token}`,
  ]
  for (const url of tryUrls) {
    try {
      const res  = await fetch(url)
      const data = await res.json()
      if (data.error) {
        if (url === tryUrls[tryUrls.length - 1]) warnings.push(`${metric}: ${data.error.message ?? 'erro'}`)
        continue
      }
      const row = data?.data?.[0]
      if (!row) continue
      if (row.total_value && typeof row.total_value.value === 'number') return row.total_value.value
      if (Array.isArray(row.values)) return row.values.reduce((s: number, v: any) => s + (Number(v.value) || 0), 0)
    } catch (e) { warnings.push(`${metric}: ${String(e)}`) }
  }
  return null
}

// ── Demografia de seguidores por dimensão (gender | age | city) ───────────────
async function fetchDemographics(
  igUserId: string, token: string, breakdown: string, warnings: string[],
): Promise<Record<string, number> | null> {
  try {
    const url = `${IG_API}/${igUserId}/insights?metric=follower_demographics&period=lifetime` +
      `&metric_type=total_value&breakdown=${breakdown}&access_token=${token}`
    const res  = await fetch(url)
    const data = await res.json()
    if (data.error) { warnings.push(`demographics(${breakdown}): ${data.error.message ?? 'erro'}`); return null }
    const results = data?.data?.[0]?.total_value?.breakdowns?.[0]?.results
    if (!Array.isArray(results)) return null
    const out: Record<string, number> = {}
    for (const r of results) {
      const key = Array.isArray(r.dimension_values) ? r.dimension_values[0] : String(r.dimension_values)
      out[key] = Number(r.value) || 0
    }
    return out
  } catch (e) { warnings.push(`demographics(${breakdown}): ${String(e)}`); return null }
}

// ── Mídias do mês (lista paginada) → conta + base para top posts ──────────────
async function fetchMonthMedia(
  igUserId: string, token: string, since: number, until: number, warnings: string[],
): Promise<any[] | null> {
  try {
    const fields = 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count'
    let url: string | null =
      `${IG_API}/${igUserId}/media?fields=${fields}&since=${since}&until=${until}&limit=100&access_token=${token}`
    const all: any[] = []
    let guard = 0
    while (url && guard < 10) {
      const res: Response = await fetch(url)
      const data = await res.json()
      if (data.error) { warnings.push(`media: ${data.error.message ?? 'erro'}`); return null }
      for (const m of (data.data ?? [])) all.push(m)
      url = data.paging?.next ?? null
      guard++
    }
    return all
  } catch (e) { warnings.push(`media: ${String(e)}`); return null }
}

async function fetchMediaReach(mediaId: string, token: string): Promise<number | null> {
  try {
    const res  = await fetch(`${IG_API}/${mediaId}/insights?metric=reach&access_token=${token}`)
    const data = await res.json()
    if (data.error) return null
    const row = data?.data?.[0]
    if (row?.total_value && typeof row.total_value.value === 'number') return row.total_value.value
    if (Array.isArray(row?.values)) return Number(row.values[0]?.value) || null
    return null
  } catch { return null }
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

    const { client_id, month, year } = await req.json()
    if (!client_id || !month || !year) return json({ error: 'Parâmetros faltando (client_id, month, year)' }, 400)
    if (month < 1 || month > 12) return json({ error: 'Mês inválido' }, 400)

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE)

    // Relatórios (incluindo a sincronização com o Instagram) são recurso dos
    // planos Pro/Agency — sem essa checagem, o gate era só visual (a tela
    // escondia o botão, mas a função aceitava a chamada de qualquer plano).
    const { data: sub } = await admin
      .from('subscriptions').select('plan').eq('user_id', agencyId).maybeSingle()
    const plan = (sub as any)?.plan ?? 'starter'
    if (plan !== 'pro' && plan !== 'agency') {
      return json({ ok: false, error: 'plan_required', message: 'Relatórios estão disponíveis nos planos Pro e Agency.' }, 403)
    }

    const { data: client } = await admin
      .from('clients').select('id, user_id, company_name').eq('id', client_id).maybeSingle()
    if (!client || (client as any).user_id !== agencyId) {
      return json({ error: 'Cliente não encontrado ou sem permissão' }, 403)
    }

    const { data: account } = await admin
      .from('instagram_accounts')
      .select('ig_user_id, username, access_token, followers_count, token_expires_at, is_active')
      .eq('client_id', client_id).eq('is_active', true).maybeSingle()

    const acc = account as any
    if (!acc) {
      return json({ ok: false, error: 'no_account', message: 'Nenhuma conta de Instagram conectada a este cliente. Conecte na aba Instagram do cliente.' })
    }
    if (acc.token_expires_at && new Date(acc.token_expires_at) < new Date()) {
      return json({ ok: false, error: 'token_expired', message: 'O token do Instagram expirou. Reconecte a conta para gerar o relatório.' })
    }

    const token    = acc.access_token
    const igUserId = String(acc.ig_user_id)
    const { since, until } = monthRange(Number(year), Number(month))
    const warnings: string[] = []

    // ── Seguidores ATUAIS (live) → followers_end ──────────────────────────────
    let followersEnd: number | null = acc.followers_count ?? null
    try {
      const meRes  = await fetch(`${IG_API}/${igUserId}?fields=followers_count&access_token=${token}`)
      const meData = await meRes.json()
      if (!meData.error && typeof meData.followers_count === 'number') {
        followersEnd = meData.followers_count
        await admin.from('instagram_accounts')
          .update({ followers_count: followersEnd, updated_at: new Date().toISOString() })
          .eq('client_id', client_id).eq('ig_user_id', igUserId)
      }
    } catch { /* usa cache */ }

    // followers_start = followers_end do mês anterior (se houver)
    const prevMonth = Number(month) === 1 ? 12 : Number(month) - 1
    const prevYear  = Number(month) === 1 ? Number(year) - 1 : Number(year)
    const { data: prevReport } = await admin
      .from('client_reports').select('followers_end')
      .eq('client_id', client_id).eq('month', prevMonth).eq('year', prevYear).maybeSingle()
    const followersStart = (prevReport as any)?.followers_end ?? null

    // ── Métricas de conta do mês ──────────────────────────────────────────────
    const reach        = await fetchAccountMetric(igUserId, token, 'reach', since, until, warnings)
    let impressions    = await fetchAccountMetric(igUserId, token, 'views', since, until, warnings)
    if (impressions == null) impressions = await fetchAccountMetric(igUserId, token, 'impressions', since, until, warnings)
    const interactions = await fetchAccountMetric(igUserId, token, 'total_interactions', since, until, warnings)
    const profileViews = await fetchAccountMetric(igUserId, token, 'profile_views', since, until, warnings)
    const accountsEng  = await fetchAccountMetric(igUserId, token, 'accounts_engaged', since, until, warnings)
    const likes        = await fetchAccountMetric(igUserId, token, 'likes', since, until, warnings)
    const comments     = await fetchAccountMetric(igUserId, token, 'comments', since, until, warnings)
    const saves        = await fetchAccountMetric(igUserId, token, 'saves', since, until, warnings)
    const shares       = await fetchAccountMetric(igUserId, token, 'shares', since, until, warnings)

    // ── Mídias do mês → contagem + top 3 ──────────────────────────────────────
    const media       = await fetchMonthMedia(igUserId, token, since, until, warnings)
    const postsCount  = media ? media.length : null

    const topPosts: any[] = []
    if (media && media.length) {
      const ranked = [...media]
        .sort((a, b) => ((b.like_count ?? 0) + (b.comments_count ?? 0)) - ((a.like_count ?? 0) + (a.comments_count ?? 0)))
        .slice(0, 3)
      for (const m of ranked) {
        const r = await fetchMediaReach(m.id, token)
        topPosts.push({
          id:         m.id,
          permalink:  m.permalink ?? null,
          thumbnail:  m.thumbnail_url ?? m.media_url ?? null,
          media_type: m.media_product_type ?? m.media_type ?? null,
          caption:    m.caption ? String(m.caption).slice(0, 120) : null,
          likes:      m.like_count ?? 0,
          comments:   m.comments_count ?? 0,
          reach:      r,
        })
      }
    }

    // ── Demografia ────────────────────────────────────────────────────────────
    const gender = await fetchDemographics(igUserId, token, 'gender', warnings)
    const age    = await fetchDemographics(igUserId, token, 'age', warnings)
    const cityMap = await fetchDemographics(igUserId, token, 'city', warnings)
    const cities = cityMap
      ? Object.entries(cityMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5)
      : null

    // ── Engajamento (%) ───────────────────────────────────────────────────────
    let engagement: number | null = null
    if (interactions != null && reach && reach > 0) {
      engagement = Math.min(999.99, Math.round((interactions / reach) * 10000) / 100)
    }

    const anyData = [reach, impressions, interactions, postsCount, profileViews, accountsEng].some(v => v != null)
      || topPosts.length > 0 || !!gender || !!age || !!cities
    if (!anyData) {
      return json({
        ok: false, error: 'insights_unavailable',
        message: 'Não foi possível ler os insights desta conta. Verifique se a permissão de insights foi concedida/aprovada e se a conta é Profissional (Business/Creator).',
        warnings,
      })
    }

    const igData = {
      profile_views:   profileViews,
      accounts_engaged: accountsEng,
      interactions:    { likes, comments, saves, shares },
      top_posts:       topPosts,
      demographics:    { gender, age, cities },
      synced_at:       new Date().toISOString(),
    }

    const social = {
      followers_start: followersStart,
      followers_end:   followersEnd,
      reach,
      impressions,
      engagement,
      posts_published: postsCount,
      ig_data:         igData,
      auto_generated:  true,
      ig_synced_at:    new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    }

    const { data: existing } = await admin
      .from('client_reports').select('id')
      .eq('client_id', client_id).eq('month', month).eq('year', year).maybeSingle()

    let reportId: string
    if (existing) {
      reportId = (existing as any).id
      const { error: upErr } = await admin.from('client_reports').update(social).eq('id', reportId)
      if (upErr) return json({ error: upErr.message }, 500)
    } else {
      const { data: ins, error: insErr } = await admin.from('client_reports')
        .insert({ client_id, user_id: agencyId, month, year, ...social }).select('id').single()
      if (insErr) return json({ error: insErr.message }, 500)
      reportId = (ins as any).id
    }

    return json({
      ok: true, report_id: reportId,
      metrics: { followers_start: followersStart, followers_end: followersEnd, reach, impressions, engagement, posts_published: postsCount, profile_views: profileViews },
      account: acc.username, warnings,
    })
  } catch (err) {
    console.error('instagram-report error:', err)
    return json({ error: String(err) }, 500)
  }
})
