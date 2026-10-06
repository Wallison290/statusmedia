// ── Edge Function: whatsapp-health ───────────────────────────────────────────
// Vigia a conexão da instância UazAPI e avisa por e-mail quando ela cai.
//
// Problema que isto resolve: quando a instância desconecta, nada no sistema
// percebe. O primeiro sinal é um envio falhando na frente do cliente, com a
// mensagem genérica "Edge Function returned a non-2xx status code". Entre a
// queda e a descoberta, todas as notificações de WhatsApp somem em silêncio.
//
// Por que o alerta é e-mail, e não WhatsApp: o canal que caiu não pode ser o
// canal do aviso. Uma mensagem enviada pela mesma instância desconectada só
// chegaria depois que ela voltasse — ou seja, depois de o problema já ter sido
// notado de outro jeito. O Resend já é usado pelo invite-client e pelo
// trial-reminder, então não há infra nova aqui.
//
// Chamada pelo pg_cron a cada 5 minutos (migration 071).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET      = Deno.env.get('CRON_SECRET') ?? ''

// Segundo segredo aceito, pelo mesmo motivo documentado no instagram-token-refresh:
// o pg_cron monta o header a partir do Vault, e o CRON_SECRET não é recuperável
// para ser copiado para lá (a Management API só devolve digest SHA-256 dos
// secrets). O TOKEN_REFRESH_SECRET existe justamente por ser legível nos dois
// lados, e é o valor guardado em vault.instagram_cron_secret — que é de onde o
// cron desta função tira o header.
const REFRESH_SECRET   = Deno.env.get('TOKEN_REFRESH_SECRET') ?? ''
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') ?? ''
const APP_URL          = Deno.env.get('APP_URL') ?? 'https://statusmedia.com.br'

// Para onde vai o alerta. Sem isso a função roda e registra o estado, mas não
// avisa ninguém — por isso o motivo aparece no retorno, para o cron não mentir.
const ALERT_EMAIL = Deno.env.get('ALERT_EMAIL') ?? ''

// O projeto mantém dois jogos de secrets para a MESMA instância UazAPI:
// notify-whatsapp/whatsapp-verify/whatsapp-fetch-groups leem EVOLUTION_*,
// enquanto send-whatsapp e charge-client-whatsapp leem UAZAPI_*. Os dois estão
// preenchidos em produção.
//
// A ordem abaixo não é arbitrária: EVOLUTION_* vem primeiro porque é o par que
// o notify-whatsapp usa para mandar o conteúdo do planejamento ao cliente — o
// envio cuja falha originou este monitor. Vigiar o outro par deixaria o banner
// dizer "conectado" enquanto justamente esses envios falham.
const BASE_URL = (Deno.env.get('EVOLUTION_BASE_URL') ?? Deno.env.get('UAZAPI_URL') ?? '').replace(/\/$/, '')
const TOKEN    = Deno.env.get('EVOLUTION_API_KEY') ?? Deno.env.get('UAZAPI_TOKEN') ?? ''

// Enquanto seguir caída, repete o alerta neste intervalo — um único e-mail
// perdido no meio da caixa de entrada não pode custar um dia inteiro de envios.
const REALERT_AFTER_MS = 6 * 60 * 60 * 1000

type Status = 'connected' | 'disconnected' | 'unknown'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-cron-secret, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ─── Leitura do status na UazAPI ─────────────────────────────────────────────
// O payload varia conforme a versão, então a extração é defensiva — mesmo
// critério que whatsapp-fetch-groups já usa para achar o JID de um grupo.

const CONNECTED    = ['connected', 'open', 'online', 'authenticated', 'inchat']
const DISCONNECTED = ['disconnected', 'close', 'closed', 'offline', 'logged_out',
                      'loggedout', 'qrcode', 'connecting', 'pairing', 'timeout']

// A resposta de /instance/status traz o token da instância junto com o estado.
// O `detail` é gravado no banco e impresso no e-mail de alerta, então esses
// campos precisam sair antes — um alerta de infraestrutura não pode ser o
// caminho pelo qual a credencial vaza para uma caixa de entrada.
const SENSITIVE = /("(?:token|apikey|api_key|secret|qrcode|paircode|authorization|jwt)"\s*:\s*)"[^"]*"/gi

function redact(text: string): string {
  return text.replace(SENSITIVE, '$1"[oculto]"')
}

function extractStatus(data: any): Status {
  if (typeof data?.loggedIn === 'boolean')  return data.loggedIn  ? 'connected' : 'disconnected'
  if (typeof data?.connected === 'boolean') return data.connected ? 'connected' : 'disconnected'

  const raw = data?.instance?.status ?? data?.instance?.state ?? data?.status
            ?? data?.state ?? data?.connectionStatus ?? data?.connection
  if (typeof raw === 'string') {
    const s = raw.toLowerCase().trim()
    if (CONNECTED.includes(s))    return 'connected'
    if (DISCONNECTED.includes(s)) return 'disconnected'
  }
  return 'unknown'
}

async function probe(): Promise<{ status: Status; detail: string }> {
  if (!BASE_URL || !TOKEN) {
    return { status: 'disconnected', detail: 'UazAPI não configurada (faltam os secrets de URL/token)' }
  }
  try {
    const res  = await fetch(`${BASE_URL}/instance/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', token: TOKEN },
    })
    const text = await res.text()
    let data: any = {}
    try { data = JSON.parse(text) } catch { /* resposta não-JSON */ }

    const safe = redact(text)

    // A API respondeu, mas recusou: token revogado ou instância removida.
    if (!res.ok) {
      return { status: 'disconnected', detail: `HTTP ${res.status}: ${safe.slice(0, 200)}` }
    }

    const status = extractStatus(data)
    // Só o formato mudou: a instância pode estar de pé. Não alarma à toa.
    if (status === 'unknown') {
      return { status: 'unknown', detail: `resposta não reconhecida: ${safe.slice(0, 200)}` }
    }

    // No caminho feliz nem o corpo redigido interessa: guarda só o essencial,
    // que é o que aparece no painel e no histórico.
    const nome = typeof data?.instance?.profileName === 'string' ? ` (${data.instance.profileName})` : ''
    return { status, detail: `instância ${status}${nome}` }
  } catch (err) {
    // Nem chegou a responder: servidor fora, DNS, TLS.
    return { status: 'disconnected', detail: `inalcançável: ${String(err).slice(0, 200)}` }
  }
}

// ─── E-mail de alerta (Resend) ───────────────────────────────────────────────

function downEmail(detail: string, since: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#b91c1c;margin:0 0 12px">🔴 WhatsApp desconectado</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 16px">
        A instância da UazAPI parou de responder. Enquanto isso, <strong>nenhuma
        notificação de WhatsApp está saindo</strong> — nem para você, nem para os
        clientes no planejamento.
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 8px"><strong>Detectado em:</strong> ${since}</p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 20px"><strong>Resposta da API:</strong><br>
        <code style="background:#f3f4f6;padding:6px 8px;display:inline-block;border-radius:4px;word-break:break-all">${detail}</code>
      </p>
      <p style="margin:0 0 20px">
        <a href="${APP_URL}" style="display:inline-block;background-color:#2563EB;color:#FFFFFF !important;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold"><span style="color:#FFFFFF !important">Abrir o StatusMedia</span></a>
      </p>
      <p style="color:#4B5563;font-size:12px;margin:0">
        Reconecte a instância no painel da UazAPI (leitura do QR Code). Assim que
        ela voltar, você recebe um e-mail de confirmação.
      </p>
    </div>`
}

function upEmail(downSince: string | null): string {
  const howLong = downSince
    ? `<p style="color:#6b7280;font-size:13px;margin:0 0 20px">Ficou fora desde <strong>${downSince}</strong>.</p>`
    : ''
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#15803d;margin:0 0 12px">🟢 WhatsApp reconectado</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 16px">
        A instância da UazAPI voltou a responder e as notificações estão saindo
        normalmente de novo.
      </p>
      ${howLong}
      <p style="color:#4B5563;font-size:12px;margin:0">
        Vale conferir o planejamento: mensagens que falharam durante a queda não
        são reenviadas sozinhas.
      </p>
    </div>`
}

async function sendAlert(subject: string, html: string): Promise<string> {
  if (!RESEND_API_KEY) return 'RESEND_API_KEY ausente'
  if (!ALERT_EMAIL)    return 'ALERT_EMAIL ausente'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'StatusMedia <noreply@statusmedia.com.br>',
        to: [ALERT_EMAIL],
        subject,
        html,
      }),
    })
    if (!res.ok) return `Resend HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`
    return 'enviado'
  } catch (err) {
    return `falha no Resend: ${String(err).slice(0, 120)}`
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Service role key OU um dos segredos de cron, no header X-Cron-Secret ou
  // como Bearer — mesma checagem do instagram-token-refresh.
  const auth   = req.headers.get('Authorization') ?? ''
  const secret = req.headers.get('X-Cron-Secret') ?? ''
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const valid  = [CRON_SECRET, REFRESH_SECRET].filter(s => s.length > 0)
  const authorized = (!!SUPABASE_SERVICE && token === SUPABASE_SERVICE)
    || valid.some(s => s === secret || s === token)
  if (!authorized) return new Response('Unauthorized', { status: 401, headers: CORS })

  const sb  = createClient(SUPABASE_URL, SUPABASE_SERVICE)
  const now = new Date()

  const { data: row } = await sb
    .from('whatsapp_health')
    .select('status, changed_at, alerted_at')
    .eq('id', 1)
    .maybeSingle()

  const previous = ((row as any)?.status ?? 'unknown') as Status
  const { status, detail } = await probe()

  // 'unknown' significa que só o formato da resposta mudou — registra o
  // diagnóstico, mas não move o estado nem dispara alerta.
  if (status === 'unknown') {
    await sb.from('whatsapp_health')
      .update({ detail, last_checked_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', 1)
    return json({ ok: true, status: previous, probe: 'unknown', detail, alert: 'nenhum' })
  }

  const changed   = status !== previous
  const alertedAt = (row as any)?.alerted_at ? new Date((row as any).alerted_at) : null

  // Segue caída e o alerta ainda não saiu: sem isto, um Resend fora do ar na
  // hora da queda deixaria o aviso preso para sempre — na próxima passada
  // `changed` já é falso e não haveria alerted_at para envelhecer.
  const neverAlerted = !alertedAt
  const staleAlert   = !!alertedAt && now.getTime() - alertedAt.getTime() > REALERT_AFTER_MS

  let alert = 'nenhum'

  if (status === 'disconnected' && (changed || neverAlerted || staleAlert)) {
    const since = (changed ? now : new Date((row as any)?.changed_at ?? now))
      .toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    alert = await sendAlert('🔴 WhatsApp desconectado — StatusMedia', downEmail(detail, since))
  } else if (status === 'connected' && changed && previous === 'disconnected') {
    const downSince = (row as any)?.changed_at
      ? new Date((row as any).changed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : null
    alert = await sendAlert('🟢 WhatsApp reconectado — StatusMedia', upEmail(downSince))
  }

  await sb.from('whatsapp_health').update({
    status,
    detail,
    last_checked_at: now.toISOString(),
    updated_at:      now.toISOString(),
    ...(status === 'connected' ? { last_ok_at: now.toISOString() } : {}),
    ...(changed                ? { changed_at: now.toISOString() } : {}),
    // alerted_at só avança quando um e-mail realmente saiu, senão uma falha do
    // Resend faria o re-alerta de 6h nunca mais disparar.
    ...(alert === 'enviado'    ? { alerted_at: now.toISOString() } : {}),
    ...(status === 'connected' ? { alerted_at: null } : {}),
  }).eq('id', 1)

  console.log(`[whatsapp-health] ${previous} → ${status} | alerta: ${alert}`)
  return json({ ok: true, previous, status, changed, alert, detail })
})
