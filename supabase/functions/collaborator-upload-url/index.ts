// Permissão de envio para o PORTAL DO COLABORADOR (/colaborador/:token).
//
// O colaborador não tem login: quem prova quem ele é é o portal_token. Esta
// função confere o token, confere que a demanda é dele e devolve uma URL
// assinada para o navegador mandar o arquivo direto ao Cloudflare R2 (igual
// à r2-upload-url). O arquivo conta no espaço do plano da agência dona do
// colaborador e fica em <agência>/colab/..., o que o submit_collaborator_delivery
// exige (a URL tem de começar com o id da agência).
//
// Deploy: functions deploy collaborator-upload-url --no-verify-jwt

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

// Entrega de conteúdo: só imagem e vídeo (o que vai para o Instagram)
const TIPOS_PERMITIDOS = /^(video|image)\//
const TIPOS_BLOQUEADOS = /^image\/svg/
const LIMITE = 1024 * 1024 * 1024 // 1 GB, teto da Meta para Reels

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const accountId = Deno.env.get('R2_ACCOUNT_ID')
    const accessKey = Deno.env.get('R2_ACCESS_KEY_ID')
    const secretKey = Deno.env.get('R2_SECRET_KEY')
    const bucket    = Deno.env.get('R2_BUCKET')
    const publicUrl = Deno.env.get('R2_PUBLIC_URL')?.replace(/\/$/, '')
    if (!accountId || !accessKey || !secretKey || !bucket || !publicUrl) {
      return json({ error: 'Envio de arquivos indisponível no momento.' }, 500)
    }

    const { token, taskId, fileName, contentType, sizeBytes } = await req.json()
    if (!token || !taskId || !fileName || !contentType) {
      return json({ error: 'Pedido incompleto.' }, 400)
    }
    if (!TIPOS_PERMITIDOS.test(contentType) || TIPOS_BLOQUEADOS.test(contentType)) {
      return json({ error: 'Envie só imagem ou vídeo.' }, 400)
    }
    if (typeof sizeBytes === 'number' && sizeBytes > LIMITE) {
      return json({ error: 'Arquivo acima de 1 GB. O Instagram não aceita.' }, 400)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── Token → colaborador → demanda dele ────────────────────────────────
    const { data: member } = await admin
      .from('team_members').select('id, user_id')
      .eq('portal_token', String(token)).eq('is_active', true).maybeSingle()
    if (!member) return json({ error: 'Link inválido.' }, 401)

    const { data: task } = await admin
      .from('tasks').select('id, planner_id')
      .eq('id', String(taskId)).eq('assignee_id', member.id).maybeSingle()
    if (!task) return json({ error: 'Demanda não encontrada.' }, 404)
    if (task.planner_id) return json({ error: 'Esta demanda já está no planejamento.' }, 409)

    const agencyId = member.user_id as string

    // ── Espaço do plano da agência (migration 094) ─────────────────────────
    const declared = typeof sizeBytes === 'number' && sizeBytes > 0 ? Math.round(sizeBytes) : 0
    const [{ data: limitGB }, { data: usedBytes }] = await Promise.all([
      admin.rpc('agency_limit', { p_agency: agencyId, p_key: 'storage_gb' }),
      admin.rpc('agency_storage_bytes', { p_agency: agencyId }),
    ])
    const limitBytes = Number(limitGB ?? 0) * 1024 ** 3
    if (Number(limitGB ?? 0) !== -1 && Number(usedBytes ?? 0) + declared > limitBytes) {
      return json({ error: 'O espaço de arquivos da agência está cheio. Avise a agência ou envie por link.' }, 413)
    }

    // ── Caminho e assinatura ───────────────────────────────────────────────
    const limpo = String(fileName).replace(/[^\w.\-]/g, '_').slice(-80)
    const key = `${agencyId}/colab/${task.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${limpo}`

    const aws = new AwsClient({ accessKeyId: accessKey, secretAccessKey: secretKey, service: 's3', region: 'auto' })
    const alvo = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`)
    alvo.searchParams.set('X-Amz-Expires', '3600')
    const assinada = await aws.sign(alvo.toString(), {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      aws: { signQuery: true },
    })

    await admin.from('r2_objects').upsert(
      { key, url: `${publicUrl}/${key}`, bytes: declared, owner_hint: agencyId },
      { onConflict: 'key' },
    )

    return json({ uploadUrl: assinada.url, publicUrl: `${publicUrl}/${key}`, key })
  } catch (err) {
    console.error('collaborator-upload-url:', err)
    return json({ error: 'Erro ao preparar o envio.' }, 500)
  }
})
