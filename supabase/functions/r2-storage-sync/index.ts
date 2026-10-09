// ── Edge Function: r2-storage-sync ────────────────────────────────────────────
// Inventário do Cloudflare R2 (migration 094). A cada 30 min (pg_cron):
//   1. lista o bucket inteiro e grava chave, URL e tamanho real em r2_objects;
//   2. tira do inventário o que não existe mais no bucket;
//   3. marca como órfão o que nenhuma coluna do banco cita (r2_mark_orphans);
//   4. apaga do R2 o que está órfão há mais de 7 dias — SÓ com o secret
//      R2_ORPHAN_DELETE=on. Sem ele, só relata (modo de conferência).
// Auth: X-Cron-Secret (mesmo esquema do storage-to-r2).
//   supabase functions deploy r2-storage-sync --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SECRETS = [Deno.env.get('CRON_SECRET'), Deno.env.get('TOKEN_REFRESH_SECRET')].filter(Boolean) as string[]

const R2_ACCOUNT = Deno.env.get('R2_ACCOUNT_ID') ?? ''
const R2_BUCKET  = Deno.env.get('R2_BUCKET') ?? ''
const R2_PUBLIC  = (Deno.env.get('R2_PUBLIC_URL') ?? '').replace(/\/$/, '')
const DELETE_ON  = Deno.env.get('R2_ORPHAN_DELETE') === 'on'

// Freio por execução: nunca apaga uma montanha de arquivos de uma vez
const MAX_DELETE_PER_RUN = 200

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const xmlText = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")

/** Chave do R2 → URL pública, no mesmo formato que o app grava (r2-upload-url). */
const publicUrlFor = (key: string) => `${R2_PUBLIC}/${key}`

Deno.serve(async (req) => {
  const secret = req.headers.get('X-Cron-Secret') ?? ''
  if (!SECRETS.some(s => s === secret)) return new Response('Unauthorized', { status: 401 })
  if (!R2_ACCOUNT || !R2_BUCKET || !R2_PUBLIC) return json({ error: 'R2 não configurado' }, 500)

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE) as any
  const r2 = new AwsClient({
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!, secretAccessKey: Deno.env.get('R2_SECRET_KEY')!,
    service: 's3', region: 'auto',
  })
  const endpoint = `https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}`
  const report = { listed: 0, bytes: 0, removedFromInventory: 0, orphansDue: 0, orphanBytesDue: 0, deleted: 0, deleteMode: DELETE_ON, errors: [] as string[] }
  const runStart = new Date().toISOString()

  // ── 1. Lista o bucket (ListObjectsV2, 1000 por página) ────────────────────
  let token: string | null = null
  do {
    const u = new URL(endpoint)
    u.searchParams.set('list-type', '2')
    u.searchParams.set('max-keys', '1000')
    if (token) u.searchParams.set('continuation-token', token)
    const res = await r2.fetch(u.toString())
    if (!res.ok) return json({ ...report, error: `listagem falhou: HTTP ${res.status}` }, 502)
    const xml = await res.text()

    const rows = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(m => {
      const key  = xmlText(m[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? '')
      const size = Number(m[1].match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0)
      const mod  = m[1].match(/<LastModified>([^<]+)<\/LastModified>/)?.[1] ?? runStart
      return { key, url: publicUrlFor(key), bytes: size, created_at: mod, synced_at: runStart }
    }).filter(r => r.key)

    if (rows.length) {
      const { error } = await sb.from('r2_objects').upsert(rows, { onConflict: 'key' })
      if (error) return json({ ...report, error: `inventário: ${error.message}` }, 500)
    }
    report.listed += rows.length
    report.bytes  += rows.reduce((s, r) => s + r.bytes, 0)

    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? xmlText(xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? '') || null
      : null
  } while (token)

  // ── 2. Some do inventário o que não está mais no bucket ───────────────────
  // (envio assinado há menos de 1 h pode ainda não ter chegado: fica)
  const { count: gone } = await sb.from('r2_objects').delete({ count: 'exact' })
    .or(`synced_at.lt.${runStart},synced_at.is.null`)
    .lt('created_at', new Date(Date.now() - 3600e3).toISOString())
  report.removedFromInventory = gone ?? 0

  // ── 3. Órfãos ──────────────────────────────────────────────────────────────
  const base = new URL(R2_PUBLIC).host
  const { data: due, error: orphErr } = await sb.rpc('r2_mark_orphans', { p_base: base })
  if (orphErr) return json({ ...report, error: `órfãos: ${orphErr.message}` }, 500)
  report.orphansDue = due?.length ?? 0
  report.orphanBytesDue = (due ?? []).reduce((s: number, d: any) => s + Number(d.bytes ?? 0), 0)

  // ── 4. Apaga (só com R2_ORPHAN_DELETE=on) ─────────────────────────────────
  if (DELETE_ON) {
    for (const d of (due ?? []).slice(0, MAX_DELETE_PER_RUN)) {
      const res = await r2.fetch(`${endpoint}/${d.key.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) { report.errors.push(`${d.key}: HTTP ${res.status}`); continue }
      await sb.from('r2_objects').delete().eq('key', d.key)
      report.deleted++
    }
  }

  console.log('r2-storage-sync', JSON.stringify(report))
  return json(report)
})
