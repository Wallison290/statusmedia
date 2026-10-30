// ── Edge Function: thumb-store ────────────────────────────────────────────────
// Recebe a miniatura WebP (já reduzida) de um arquivo ANTIGO do R2 e grava em
// thumbs/<chave original>.webp. Usada só pelo processamento em lote
// (scripts/thumbs-backfill), que gera as miniaturas fora do Supabase: a edge
// function não tem CPU para decodificar artes de vários MB.
//
// Autenticação: header x-thumb-secret; aqui fica só o SHA-256 dele (sem JWT).
// Função temporária: é apagada depois do processamento em lote.
// Entrada (POST): { key: string, data: base64 do WebP }
// ─────────────────────────────────────────────────────────────────────────────

import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  try {
    const given = req.headers.get('x-thumb-secret') ?? ''
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(given))))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    if (digest !== '1c97e9cef1c77587fc7d5d6a89f19fe3a027c3010f9c6bfb6153f0729eb5fa7c') return json({ error: 'forbidden' }, 403)

    const accountId = Deno.env.get('R2_ACCOUNT_ID')!
    const accessKey = Deno.env.get('R2_ACCESS_KEY_ID')!
    const secretKey = Deno.env.get('R2_SECRET_KEY')!
    const bucket    = Deno.env.get('R2_BUCKET')!

    const { key, data, variant } = await req.json()
    if (typeof key !== 'string' || !key || key.startsWith('thumbs/') || key.includes('..') || typeof data !== 'string') {
      return json({ error: 'parâmetros inválidos' }, 400)
    }
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
    if (bytes.length > 2 * 1024 * 1024) return json({ error: 'miniatura grande demais' }, 400)

    const aws = new AwsClient({ accessKeyId: accessKey, secretAccessKey: secretKey, service: 's3', region: 'auto' })
    const res = await aws.fetch(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/thumbs/${variant === 'md' ? 'md/' : ''}${key}.webp`, {
      method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: bytes,
    })
    if (!res.ok) return json({ error: `R2 ${res.status}` }, 502)
    return json({ ok: true })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
