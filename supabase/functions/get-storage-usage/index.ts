// ── get-storage-usage: retorna uso total de armazenamento do usuário ──────────
// Usa função SQL SECURITY DEFINER que acessa storage.objects diretamente,
// contornando a limitação da REST API que não expõe o schema storage.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { agencyIdFor } from '../_shared/agency.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    // Autenticar o usuário a partir do token JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado' }, 401)

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Não autorizado' }, 401)
    // Sócio age como o dono da agência (migration 088)
    const agencyId = await agencyIdFor(user.id)

    // R2 (arquivos que a agência ainda usa) + Supabase Storage — migration 094
    const { data, error } = await sb.rpc('agency_storage_bytes', {
      p_agency: agencyId,
    })

    if (error) {
      console.error('RPC error:', error.message)
      return json({ error: error.message }, 400)
    }

    const totalBytes = data ?? 0
    const usedGB = totalBytes / (1024 * 1024 * 1024)

    return json({ usedBytes: totalBytes, usedGB })

  } catch (err: any) {
    console.error('get-storage-usage error:', err.message)
    return json({ error: err.message }, 400)
  }
})
