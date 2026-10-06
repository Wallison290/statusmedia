// ── Edge Function: send-whatsapp ───────────────────────────────────────────────
// Envia uma mensagem pelo WhatsApp conectado da agência.
// Usado pelo botão WhatsApp da página Equipe.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendForAgency } from '../_shared/whatsapp.ts'
import { agencyIdFor } from '../_shared/agency.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

function normalizeNumber(raw: string): string {
  let n = (raw || '').replace(/\D/g, '')
  if (!n) return ''
  if (!n.startsWith('55') && n.length <= 11) n = '55' + n
  return n
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { number, text } = await req.json().catch(() => ({})) as { number?: string; text?: string }

    if (!number || !text) throw new Error('number e text são obrigatórios.')

    // Verifica autenticação
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autenticado.')

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await anonClient.auth.getUser()
    if (authErr || !user) throw new Error('Token inválido.')
    // Sócio age como o dono da agência (migration 088)
    const agencyId = await agencyIdFor(user.id)

    const normalizedNumber = normalizeNumber(number)
    if (!normalizedNumber) throw new Error('Número de telefone inválido.')

    const service = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Só agência envia por aqui (a tela é a da equipe da agência)
    const { data: profile } = await service.from('profiles').select('role').eq('id', agencyId).maybeSingle()
    if ((profile as any)?.role !== 'agency') throw new Error('Não autorizado.')

    // Sai pelo WhatsApp conectado da agência
    const sent = await sendForAgency(service, agencyId, normalizedNumber, text)
    if (!sent.ok) throw new Error(sent.error ?? 'Falha no envio.')

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message ?? String(err) }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
