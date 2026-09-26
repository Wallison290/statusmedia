// ── Edge Function: whatsapp-verify ────────────────────────────────────────────
// Verificação do número PESSOAL do dono da agência (onde ele recebe os avisos),
// em duas etapas:
//   action = 'send'    → gera um código de 6 dígitos, salva no profile (com
//                        expiração de 10 min) e envia pelo WhatsApp conectado
//                        da agência (não existe mais número da plataforma).
//   action = 'confirm' → compara o código informado; se bater, marca
//                        whatsapp_verified = true e liga o opt-in.
//
// Autenticação: usa o JWT do usuário (header Authorization) para descobrir quem
// está pedindo — cada agência só verifica o próprio número.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendForAgency } from '../_shared/whatsapp.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON     = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!


const MAX_ATTEMPTS = 5

function normalizeNumber(raw: string): string {
  let n = (raw || '').replace(/\D/g, '')
  if (!n) return n
  if (!n.startsWith('55') && n.length <= 11) n = '55' + n
  return n
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // Identifica o usuário pelo JWT.
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Não autenticado' }, 401)

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE)
    const { action, phone, code } = await req.json()

    // ── Envia código ──────────────────────────────────────────────────────────
    if (action === 'send') {
      if (!phone || normalizeNumber(phone).length < 12) {
        return json({ error: 'Número inválido' }, 400)
      }
      const verifyCode = String(Math.floor(100000 + Math.random() * 900000))
      const expires    = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      const { error: upErr } = await admin
        .from('profiles')
        .update({
          whatsapp: phone,
          whatsapp_verified: false,
          whatsapp_verify_code: verifyCode,
          whatsapp_verify_expires: expires,
          whatsapp_verify_attempts: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
      if (upErr) throw upErr

      const sent = await sendForAgency(
        admin, user.id, phone,
        `*StatusMedia* 🔐\nSeu código de verificação é *${verifyCode}*.\nEle expira em 10 minutos.`,
      )
      if (!sent.ok) {
        return json({ error: sent.notConnected
          ? 'Conecte primeiro o WhatsApp da agência (acima nesta página). É por ele que o código é enviado.'
          : `Não foi possível enviar: ${sent.error}` }, sent.notConnected ? 409 : 502)
      }

      return json({ ok: true, message: 'Código enviado pelo WhatsApp' })
    }

    // ── Confirma código ───────────────────────────────────────────────────────
    if (action === 'confirm') {
      if (!code) return json({ error: 'Informe o código' }, 400)

      const { data: prof } = await admin
        .from('profiles')
        .select('whatsapp_verify_code, whatsapp_verify_expires, whatsapp_verify_attempts')
        .eq('id', user.id)
        .maybeSingle()

      const pr = prof as any
      if (!pr?.whatsapp_verify_code) return json({ error: 'Nenhum código pendente. Reenvie.' }, 400)
      if (pr.whatsapp_verify_attempts >= MAX_ATTEMPTS) {
        return json({ error: 'Muitas tentativas. Reenvie um novo código.' }, 429)
      }
      if (pr.whatsapp_verify_expires && new Date(pr.whatsapp_verify_expires) < new Date()) {
        return json({ error: 'Código expirado. Reenvie.' }, 400)
      }

      if (String(code).trim() !== pr.whatsapp_verify_code) {
        await admin
          .from('profiles')
          .update({ whatsapp_verify_attempts: (pr.whatsapp_verify_attempts ?? 0) + 1 })
          .eq('id', user.id)
        return json({ error: 'Código incorreto' }, 400)
      }

      // Sucesso: verifica e liga o opt-in.
      await admin
        .from('profiles')
        .update({
          whatsapp_verified: true,
          whatsapp_opt_in: true,
          whatsapp_verify_code: null,
          whatsapp_verify_expires: null,
          whatsapp_verify_attempts: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      return json({ ok: true, verified: true })
    }

    return json({ error: 'Ação inválida' }, 400)
  } catch (err) {
    console.error('whatsapp-verify error:', err)
    return json({ error: String(err) }, 500)
  }
})
