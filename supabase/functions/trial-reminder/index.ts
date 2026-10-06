// ── trial-reminder: avisa usuários com trial expirando em ~24h ───────────────
// Chamado pelo cron-job.org diariamente às 10:00 America/Sao_Paulo

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET       = Deno.env.get('CRON_SECRET') ?? ''
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY') ?? ''
const APP_URL           = Deno.env.get('APP_URL') ?? 'https://statusmedia.com.br'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-cron-secret, content-type',
      },
    })
  }

  // Auth: aceita service role key OU cron secret
  const auth   = req.headers.get('Authorization') ?? ''
  const secret = req.headers.get('X-Cron-Secret') ?? ''
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const authorized = token === SUPABASE_SERVICE || secret === CRON_SECRET || token === CRON_SECRET

  if (!authorized) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!RESEND_API_KEY) {
    console.error('[trial-reminder] RESEND_API_KEY não configurado')
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY não configurado' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE)

  // Janela: trials que expiram entre 20h e 28h a partir de agora
  // Garante que cada usuário recebe o email uma vez (na janela do "dia seguinte")
  const windowStart = new Date(Date.now() + 20 * 60 * 60 * 1000)
  const windowEnd   = new Date(Date.now() + 28 * 60 * 60 * 1000)

  const { data: subs, error } = await sb
    .from('subscriptions')
    .select('user_id, trial_ends_at')
    .eq('status', 'trialing')
    .gte('trial_ends_at', windowStart.toISOString())
    .lte('trial_ends_at', windowEnd.toISOString())

  if (error) {
    console.error('[trial-reminder] Erro ao buscar trials:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!subs?.length) {
    console.log('[trial-reminder] Nenhum trial expirando nas próximas 24h')
    return new Response(JSON.stringify({ sent: 0, message: 'Nenhum trial expirando amanhã' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  const errors: string[] = []

  for (const sub of subs) {
    try {
      const { data: authUser, error: userErr } = await sb.auth.admin.getUserById(sub.user_id)
      if (userErr || !authUser?.user?.email) {
        errors.push(`user ${sub.user_id}: sem email`)
        continue
      }

      const email = authUser.user.email
      const name  = authUser.user.user_metadata?.full_name
        ?? authUser.user.user_metadata?.name
        ?? email.split('@')[0]

      const trialEndsAt = new Date(sub.trial_ends_at)
      const hoursLeft   = Math.round((trialEndsAt.getTime() - Date.now()) / 3_600_000)

      const emailResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'StatusMedia <noreply@statusmedia.com.br>',
          to:   [email],
          subject: '⏰ Seu acesso gratuito termina amanhã — não perca nada',
          html: buildReminderEmail(name, hoursLeft, `${APP_URL}/planos`),
        }),
      })

      if (emailResp.ok) {
        sent++
        console.log(`[trial-reminder] Email enviado para ${email}`)
      } else {
        const errBody = await emailResp.text()
        errors.push(`${email}: ${emailResp.status} ${errBody.slice(0, 100)}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`user ${sub.user_id}: ${msg}`)
    }
  }

  console.log(`[trial-reminder] ${sent}/${subs.length} emails enviados`)

  return new Response(
    JSON.stringify({ sent, total: subs.length, errors: errors.length ? errors : undefined }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})

// ── Template do email ─────────────────────────────────────────────────────────

function buildReminderEmail(name: string, hoursLeft: number, plansUrl: string): string {
  const timeText = hoursLeft <= 24
    ? 'termina <strong>amanhã</strong>'
    : `termina em <strong>${hoursLeft}h</strong>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Seu período gratuito termina amanhã</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;">

<!-- Wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0f0f0f" style="background:#0f0f0f;padding:40px 16px;">
<tr><td align="center">

<!-- Card -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1a1a1a" style="max-width:580px;background:#1a1a1a;border-radius:16px;border:1px solid #2a2a2a;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background-color:#5b3be8;background-image:linear-gradient(135deg,#7c3aed,#4f46e5);padding:36px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase;">StatusMedia</p>
      <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;line-height:1.3;">
        ⏰ Seu acesso gratuito<br/>${timeText}
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:36px 40px;">

      <p style="margin:0 0 20px;font-size:16px;color:#d1d5db;line-height:1.6;">
        Olá, <strong style="color:#ffffff;">${escapeHtml(name)}</strong>!
      </p>

      <p style="margin:0 0 24px;font-size:16px;color:#d1d5db;line-height:1.6;">
        Você está aproveitando o período de teste gratuito do StatusMedia.
        <strong style="color:#ffffff;">Amanhã ele encerra</strong> e seu acesso será
        pausado automaticamente — a menos que você assine um plano.
      </p>

      <!-- Alerta -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#1e1530;border:1px solid #7c3aed;border-radius:12px;margin-bottom:28px;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0;font-size:15px;color:#c4b5fd;font-weight:600;">
              🔒 O que você vai perder sem uma assinatura:
            </p>
            <ul style="margin:12px 0 0;padding-left:20px;color:#d1d5db;font-size:14px;line-height:2;">
              <li>Gerenciamento de clientes e planejamento de conteúdo</li>
              <li>Agendamento automático no Instagram</li>
              <li>Assistente de IA para criação de conteúdo</li>
              <li>Portal do cliente e relatórios automáticos</li>
              <li>Comunicação e aprovação de conteúdo</li>
            </ul>
          </td>
        </tr>
      </table>

      <!-- CTA Principal -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(plansUrl)}"
               style="display:inline-block;background-color:#5b3be8;background-image:linear-gradient(135deg,#7c3aed,#4f46e5);color:#ffffff !important;
                      text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;
                      border-radius:10px;letter-spacing:0.3px;">
              Ver Planos e Assinar Agora →
            </a>
          </td>
        </tr>
      </table>

      <!-- Planos resumo -->
      <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">
        Planos disponíveis
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr>
          <!-- Starter -->
          <td width="32%" style="background:#111827;border:1px solid #2a2a2a;border-radius:10px;padding:16px;text-align:center;vertical-align:top;">
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Starter</p>
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">R$57<span style="font-size:12px;color:#9ca3af;">/mês</span></p>
            <p style="margin:0;font-size:12px;color:#9ca3af;">Até 5 clientes</p>
          </td>
          <td width="4%"></td>
          <!-- Pro -->
          <td width="32%" style="background:#1e1530;border:2px solid #7c3aed;border-radius:10px;padding:16px;text-align:center;vertical-align:top;">
            <p style="margin:0 0 2px;font-size:10px;color:#a78bfa;text-transform:uppercase;letter-spacing:1px;font-weight:600;">⭐ Popular</p>
            <p style="margin:0 0 4px;font-size:12px;color:#c4b5fd;text-transform:uppercase;letter-spacing:1px;">Pro</p>
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">R$97<span style="font-size:12px;color:#9ca3af;">/mês</span></p>
            <p style="margin:0;font-size:12px;color:#9ca3af;">Até 20 clientes</p>
          </td>
          <td width="4%"></td>
          <!-- Agency -->
          <td width="32%" style="background:#111827;border:1px solid #2a2a2a;border-radius:10px;padding:16px;text-align:center;vertical-align:top;">
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Agency</p>
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">R$197<span style="font-size:12px;color:#9ca3af;">/mês</span></p>
            <p style="margin:0;font-size:12px;color:#9ca3af;">Até 50 clientes</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 28px;font-size:14px;color:#9ca3af;line-height:1.6;text-align:center;">
        Cancele quando quiser. Sem fidelidade. Sem burocracia.
      </p>

      <!-- CTA Secundário -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">
            <a href="${escapeHtml(plansUrl)}"
               style="display:inline-block;background:transparent;color:#a78bfa;
                      text-decoration:none;font-size:14px;font-weight:600;padding:12px 32px;
                      border:1px solid #7c3aed;border-radius:8px;">
              Escolher meu plano
            </a>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#111111;padding:24px 40px;border-top:1px solid #2a2a2a;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
        StatusMedia — Plataforma de gestão para agências digitais
      </p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        Você recebeu este email porque criou uma conta no StatusMedia.<br/>
        <a href="${escapeHtml(plansUrl)}" style="color:#a78bfa;text-decoration:none;">Acessar plataforma</a>
      </p>
    </td>
  </tr>

</table>
<!-- /Card -->

</td></tr>
</table>
<!-- /Wrapper -->

</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
