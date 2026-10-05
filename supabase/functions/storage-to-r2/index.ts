// ── Edge Function: storage-to-r2 ──────────────────────────────────────────────
// Devolve ao Cloudflare R2 os arquivos que caíram na reserva do Supabase
// Storage (src/lib/uploadArquivo.ts: quando o navegador não consegue falar com
// o R2, o arquivo vai pelo Supabase para o post não ficar sem mídia).
//
// O servidor fala com o R2 normalmente, então esta rotina, de 10 em 10 minutos
// (migration 087):
//   1. acha links do Supabase Storage nas tabelas que recebem upload;
//   2. copia o arquivo para o R2;
//   3. troca o link na linha (só se ainda for o mesmo link) e
//   4. apaga o arquivo do Supabase, que volta a ficar livre.
// Auth: X-Cron-Secret (mesmo esquema do whatsapp-health).
//   supabase functions deploy storage-to-r2 --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SECRETS = [Deno.env.get('CRON_SECRET'), Deno.env.get('TOKEN_REFRESH_SECRET')].filter(Boolean) as string[]

const R2_ACCOUNT = Deno.env.get('R2_ACCOUNT_ID') ?? ''
const R2_BUCKET  = Deno.env.get('R2_BUCKET') ?? ''
const R2_PUBLIC  = (Deno.env.get('R2_PUBLIC_URL') ?? '').replace(/\/$/, '')

// Por execução: arquivos movidos e tamanho máximo (memória da função)
const MAX_PER_RUN = 20
const MAX_BYTES   = 150 * 1024 * 1024

// Onde o app grava links de upload, e a chave de cada linha
const TARGETS = [
  { table: 'planner_attachments', column: 'file_url',       key: 'id' },
  { table: 'content_assets',      column: 'media_url',      key: 'id' },
  { table: 'client_materials',    column: 'file_url',       key: 'id' },
  { table: 'crm_settings',        column: 'brand_logo_url', key: 'user_id' },
]
// Buckets que o uploadArquivo usa como reserva
const BUCKETS = new Set(['planner-attachments', 'content-assets', 'client-materials', 'client-logos'])
// Mesmos tipos que o R2 aceita no app (SVG fica no Supabase: pode carregar script)
const R2_TYPES = /^(video|image|audio)\/|^application\/(pdf|zip|x-zip-compressed|msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-|vnd\.oasis\.opendocument\.)|^text\/(plain|csv)$/

const EXT_TYPE: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf',
}

Deno.serve(async (req) => {
  const secret = req.headers.get('X-Cron-Secret') ?? ''
  if (!SECRETS.some(s => s === secret)) return new Response('Unauthorized', { status: 401 })
  if (!R2_ACCOUNT || !R2_BUCKET || !R2_PUBLIC) return new Response('R2 não configurado', { status: 500 })

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE) as any
  const r2 = new AwsClient({
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!, secretAccessKey: Deno.env.get('R2_SECRET_KEY')!,
    service: 's3', region: 'auto',
  })
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/`
  const report = { moved: 0, skipped: 0, errors: [] as string[] }

  for (const t of TARGETS) {
    if (report.moved >= MAX_PER_RUN) break
    const { data: rows, error } = await sb.from(t.table).select(`${t.key}, ${t.column}`)
      .like(t.column, `${prefix}%`).limit(MAX_PER_RUN - report.moved)
    if (error) { report.errors.push(`${t.table}: ${error.message}`); continue }

    for (const row of rows ?? []) {
      const oldUrl: string = row[t.column]
      const [bucket, ...rest] = oldUrl.slice(prefix.length).split('?')[0].split('/')
      const path = decodeURIComponent(rest.join('/'))
      if (!BUCKETS.has(bucket) || !path) { report.skipped++; continue }

      try {
        const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(path)
        if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download vazio')
        const ext = path.split('.').pop()?.toLowerCase() ?? ''
        const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : (EXT_TYPE[ext] ?? '')
        if (!R2_TYPES.test(type) || blob.size > MAX_BYTES) { report.skipped++; continue }

        // Mesmo formato de chave do r2-upload-url: <usuário>/<data>-<id>-<nome>
        const owner = path.split('/')[0]
        const name = path.split('/').pop()!.replace(/[^\w.\-]/g, '_').slice(-80)
        const key = `${owner}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${name}`
        const put = await r2.fetch(`https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`, {
          method: 'PUT', headers: { 'Content-Type': type }, body: await blob.arrayBuffer(),
        })
        if (!put.ok) throw new Error(`R2 ${put.status}`)

        // Troca o link só se ninguém mexeu na linha enquanto isso
        const newUrl = `${R2_PUBLIC}/${key}`
        const { data: upd, error: upErr } = await sb.from(t.table).update({ [t.column]: newUrl })
          .eq(t.key, row[t.key]).eq(t.column, oldUrl).select(t.key)
        if (upErr) throw new Error(upErr.message)
        if (!upd?.length) {
          // A linha mudou: desfaz a cópia no R2 e deixa como está
          await r2.fetch(`https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`, { method: 'DELETE' })
          report.skipped++
          continue
        }
        await sb.storage.from(bucket).remove([path])
        report.moved++
      } catch (err) {
        report.errors.push(`${t.table}/${row[t.key]}: ${String((err as Error).message ?? err).slice(0, 120)}`)
      }
    }
  }

  if (report.moved || report.errors.length) console.log('storage-to-r2:', JSON.stringify(report))
  return new Response(JSON.stringify({ ok: true, ...report }), { headers: { 'Content-Type': 'application/json' } })
})
