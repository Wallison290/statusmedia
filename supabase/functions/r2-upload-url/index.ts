// Gera uma URL assinada para o navegador enviar o arquivo DIRETO para o
// Cloudflare R2, sem passar pelo Supabase.
//
// Por que assim: as Edge Functions têm limite de payload e não aguentam um
// vídeo de centenas de MB atravessando elas. Com a URL assinada, o navegador
// fala direto com o R2 e esta função só assina a permissão — as credenciais
// nunca chegam ao browser.
//
// Secrets necessários (supabase secrets set ...):
//   R2_ACCOUNT_ID       — id da conta Cloudflare
//   R2_ACCESS_KEY_ID    — Access Key do token R2
//   R2_SECRET_KEY       — Secret Access Key do token R2
//   R2_BUCKET           — nome do bucket
//   R2_PUBLIC_URL       — base pública, ex: https://pub-xxxx.r2.dev

import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// Tipos que aceitamos no R2 (todo arquivo do sistema vai para lá: o Supabase
// gratuito tem só 1 GB). Fora da lista, e SVG (pode carregar script), o arquivo
// continua no Supabase Storage.
const TIPOS_PERMITIDOS = /^(video|image|audio)\/|^application\/(pdf|zip|x-zip-compressed|msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-|vnd\.oasis\.opendocument\.)|^text\/(plain|csv)$/
const TIPOS_BLOQUEADOS = /^image\/svg/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const accountId = Deno.env.get('R2_ACCOUNT_ID')
    const accessKey = Deno.env.get('R2_ACCESS_KEY_ID')
    const secretKey = Deno.env.get('R2_SECRET_KEY')
    const bucket    = Deno.env.get('R2_BUCKET')
    const publicUrl = Deno.env.get('R2_PUBLIC_URL')?.replace(/\/$/, '')

    if (!accountId || !accessKey || !secretKey || !bucket || !publicUrl) {
      return json({ error: 'R2 não configurado. Faltam secrets no Supabase.' }, 500)
    }

    // ── Só usuário autenticado pode pedir permissão de upload ──────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await sb.auth.getUser()
    if (authError || !user) return json({ error: 'Não autenticado.' }, 401)

    // ── Validação do pedido ────────────────────────────────────────────────
    const { fileName, contentType, sizeBytes } = await req.json()

    if (!fileName || !contentType) {
      return json({ error: 'fileName e contentType são obrigatórios.' }, 400)
    }
    if (!TIPOS_PERMITIDOS.test(contentType) || TIPOS_BLOQUEADOS.test(contentType)) {
      return json({ error: `Tipo não permitido no R2: ${contentType}` }, 400)
    }
    // Teto da Meta para Reels é 1 GB — não faz sentido aceitar acima disso.
    const LIMITE = 1024 * 1024 * 1024
    if (typeof sizeBytes === 'number' && sizeBytes > LIMITE) {
      return json({ error: 'Arquivo acima de 1 GB. O Instagram não aceita.' }, 400)
    }

    // ── Caminho: separa por usuário e evita colisão de nome ────────────────
    const limpo = String(fileName).replace(/[^\w.\-]/g, '_').slice(-80)
    const key = `${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${limpo}`

    // ── Assina o PUT ───────────────────────────────────────────────────────
    const client = new AwsClient({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      service: 's3',
      region: 'auto',
    })

    const alvo = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`)
    alvo.searchParams.set('X-Amz-Expires', '3600') // 1 hora para concluir o envio

    const assinada = await client.sign(alvo.toString(), {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      aws: { signQuery: true },
    })

    return json({
      uploadUrl: assinada.url,   // para onde o navegador manda o arquivo
      publicUrl: `${publicUrl}/${key}`, // onde o arquivo fica acessível depois
      key,
    })

  } catch (err) {
    console.error('r2-upload-url:', err)
    return json({ error: 'Erro ao preparar o envio.' }, 500)
  }
})
