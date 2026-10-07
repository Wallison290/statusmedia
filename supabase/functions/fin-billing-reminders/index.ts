// ── Edge Function: fin-billing-reminders ──────────────────────────────────────
// Cobrança automática (Financeiro, Fase 2 — migration 091).
//
// O cliente paga direto na conta da agência (sem API de banco). Esta função
// manda os lembretes — antes, no dia e depois do vencimento — pelo WhatsApp da
// agência e/ou e-mail, com Pix Copia e Cola do valor exato. Só lançamentos EM
// ABERTO recebem lembrete: marcar como pago para as cobranças.
//
// Ações (POST JSON):
//   run        (pg_cron, X-Cron-Secret)  agências no horário escolhido
//   preview    (JWT) { client_id? }      mensagem de exemplo + textos padrão
//   send_now   (JWT) { client_id }       cobra agora tudo que está vencendo/vencido
//
// Regras do automático:
//   • etapa = dias em relação ao vencimento (−3, 0, 1, 3, 7...). Cada etapa sai
//     uma vez por parcela e canal; vale até 2 dias depois do dia certo, para
//     uma hora perdida não pular o lembrete.
//   • se várias etapas couberem (rotina parada), só a mais recente sai e as
//     outras ficam como "puladas" — nada de enxurrada.
//   • várias parcelas do mesmo cliente viram UMA mensagem com o total.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendForAgency, normalizeNumber } from '../_shared/whatsapp.ts'
import { agencyIdFor } from '../_shared/agency.ts'
import {
  DEFAULT_TEMPLATES, nowBR, daysBetween, buildMessage, type Entry,
} from '../_shared/billingMessage.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY') ?? ''
const SECRETS = [Deno.env.get('CRON_SECRET'), Deno.env.get('TOKEN_REFRESH_SECRET')].filter(Boolean) as string[]
const GRACE_DAYS = 2
const MAX_ATTEMPTS = 3

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
async function loadAgency(sb: any, agency: string) {
  const [{ data: settings }, { data: profile }] = await Promise.all([
    sb.from('fin_billing_settings').select('*').eq('user_id', agency).maybeSingle(),
    sb.from('profiles').select('agency_name, full_name, email').eq('id', agency).maybeSingle(),
  ])
  return { settings, agencyName: profile?.agency_name || profile?.full_name || 'Agência', agencyEmail: profile?.email ?? null }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function sendEmail(to: string, subject: string, text: string, pix: string | null, agencyName: string, replyTo: string | null) {
  if (!RESEND_KEY) return { ok: false, error: 'E-mail não configurado (RESEND_API_KEY).' }
  const body = esc(text).replace(/\*(.+?)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F3F4F6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F3F4F6"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:560px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:14px;">
<tr><td style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#1F2937;">${body}
${pix ? `<p style="margin:20px 0 6px;font-size:13px;color:#4B5563;"><strong style="color:#111827;">Pix Copia e Cola</strong> (copie e cole no app do seu banco):</p>
<p style="margin:0;padding:12px;background:#F3F4F6;border-radius:8px;font-family:Consolas,monospace;font-size:12px;line-height:18px;color:#111827;word-break:break-all;">${esc(pix)}</p>` : ''}
</td></tr></table>
<p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;">Enviado por ${esc(agencyName)} via StatusMedia</p>
</td></tr></table></body></html>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${agencyName.replace(/[<>"]/g, '')} <noreply@statusmedia.com.br>`,
        to: [to], subject, html, text: pix ? `${text}\n\nPix Copia e Cola:\n${pix}` : text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// deno-lint-ignore no-explicit-any
async function deliver(sb: any, agency: string, entries: Entry[], today: string, s: any, agencyName: string, agencyEmail: string | null) {
  const client = entries[0].clients
  const msg = buildMessage(entries, today, s, agencyName)
  const results: { channel: 'whatsapp' | 'email'; ok: boolean; error?: string; skipped?: boolean }[] = []

  if (s?.channel_whatsapp !== false) {
    if (!client.whatsapp) results.push({ channel: 'whatsapp', ok: false, skipped: true, error: 'Cliente sem WhatsApp cadastrado.' })
    else {
      const to = normalizeNumber(client.whatsapp)
      const r = await sendForAgency(sb, agency, to, msg.text)
      if (r.ok && msg.pix) await sendForAgency(sb, agency, to, msg.pix)
      results.push({ channel: 'whatsapp', ok: r.ok, error: r.error })
    }
  }
  if (s?.channel_email) {
    if (!client.email) results.push({ channel: 'email', ok: false, skipped: true, error: 'Cliente sem e-mail cadastrado.' })
    else {
      const r = await sendEmail(client.email, msg.subject, msg.text, msg.pix, agencyName, agencyEmail)
      results.push({ channel: 'email', ok: r.ok, error: r.error })
    }
  }
  return { msg, results }
}

// deno-lint-ignore no-explicit-any
async function runAgency(sb: any, agency: string, today: string) {
  const { settings: s, agencyName, agencyEmail } = await loadAgency(sb, agency)
  if (!s?.enabled) return { agency, skipped: 'desligada' }
  const stages: number[] = (s.stages ?? [-3, 0, 1, 3, 7]).slice().sort((a: number, b: number) => a - b)
  const minStage = stages[0], maxStage = stages[stages.length - 1]
  // Janela: do vencimento mais antigo ainda dentro da última etapa (+tolerância)
  // até o mais distante que a primeira etapa (antes do vencimento) alcança.
  const from = new Date(Date.parse(today + 'T00:00:00Z') - (maxStage + GRACE_DAYS) * 86_400_000).toISOString().slice(0, 10)
  const to   = new Date(Date.parse(today + 'T00:00:00Z') - Math.min(0, minStage) * 86_400_000).toISOString().slice(0, 10)

  const { data: entries } = await sb.from('fin_entries')
    .select('id, description, amount, due_date, client_id, clients!inner(id, company_name, responsible_name, whatsapp, email, auto_billing), fin_invoices(number, pdf_url)')
    .eq('user_id', agency).eq('type', 'receita').eq('status', 'aberto').eq('billing_paused', false)
    .not('client_id', 'is', null).gte('due_date', from).lte('due_date', to)
  const list = ((entries ?? []) as Entry[]).filter(e => e.clients?.auto_billing !== false)
  if (!list.length) return { agency, sent: 0 }

  const { data: logs } = await sb.from('fin_billing_log')
    .select('entry_id, stage, channel, status, attempts').eq('manual', false)
    .in('entry_id', list.map(e => e.id))
  const channels = [s.channel_whatsapp !== false ? 'whatsapp' : null, s.channel_email ? 'email' : null].filter(Boolean) as ('whatsapp' | 'email')[]
  const done = (entryId: string, stage: number, ch: string) => (logs ?? []).some((l: any) =>
    l.entry_id === entryId && l.stage === stage && l.channel === ch &&
    (l.status !== 'falhou' || l.attempts >= MAX_ATTEMPTS))

  // Qual etapa vale hoje para cada parcela (a mais recente que ainda cabe)
  const due: { entry: Entry; stage: number; older: number[] }[] = []
  for (const e of list) {
    const d = daysBetween(e.due_date, today)
    const fit = stages.filter(st => d >= st && d <= st + GRACE_DAYS)
    if (!fit.length) continue
    const stage = fit[fit.length - 1]
    if (channels.every(ch => done(e.id, stage, ch))) continue
    due.push({ entry: e, stage, older: fit.slice(0, -1) })
  }
  if (!due.length) return { agency, sent: 0 }

  // Uma mensagem por cliente
  const byClient = new Map<string, typeof due>()
  for (const d of due) byClient.set(d.entry.client_id, [...(byClient.get(d.entry.client_id) ?? []), d])

  let sent = 0
  for (const group of byClient.values()) {
    const { results } = await deliver(sb, agency, group.map(g => g.entry), today, s, agencyName, agencyEmail)
    for (const g of group) {
      for (const r of results) {
        const prev = (logs ?? []).find((l: any) => l.entry_id === g.entry.id && l.stage === g.stage && l.channel === r.channel)
        const status = r.ok ? 'enviado' : r.skipped ? 'pulado' : 'falhou'
        if (prev) {
          await sb.from('fin_billing_log').update({ status, attempts: (prev.attempts ?? 1) + 1, error: r.error ?? null, sent_at: new Date().toISOString() })
            .eq('entry_id', g.entry.id).eq('stage', g.stage).eq('channel', r.channel).eq('manual', false)
        } else {
          await sb.from('fin_billing_log').insert({
            user_id: agency, entry_id: g.entry.id, client_id: g.entry.client_id, stage: g.stage,
            channel: r.channel, status, error: r.error ?? null,
          })
        }
        if (r.ok) sent++
        // Etapas anteriores que não saíram (rotina parada) ficam como puladas
        for (const old of g.older) {
          if (!(logs ?? []).some((l: any) => l.entry_id === g.entry.id && l.stage === old && l.channel === r.channel)) {
            await sb.from('fin_billing_log').insert({
              user_id: agency, entry_id: g.entry.id, client_id: g.entry.client_id, stage: old,
              channel: r.channel, status: 'pulado', error: 'Substituído por um lembrete mais recente.',
            }).then(() => {}, () => {})
          }
        }
      }
    }
  }
  return { agency, sent }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const body = await req.json().catch(() => ({}))
  const action = body.action ?? 'run'
  const { date: today, hour } = nowBR()

  try {
    // ── Rotina agendada ───────────────────────────────────────────────────────
    if (action === 'run') {
      const secret = req.headers.get('X-Cron-Secret') ?? ''
      if (!SECRETS.some(s => s === secret)) return new Response('Unauthorized', { status: 401 })
      const { data: agencies } = await sb.from('fin_billing_settings')
        .select('user_id, send_hour').eq('enabled', true)
      const now = (agencies ?? []).filter((a: any) => body.force === true || a.send_hour === hour)
      const out = []
      for (const a of now) out.push(await runAgency(sb, a.user_id, today))
      return json({ ok: true, hour, today, agencies: out })
    }

    // ── Ações da tela (usuário logado) ────────────────────────────────────────
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await sb.auth.getUser(jwt)
    if (!user) return json({ error: 'Não autenticado.' }, 401)
    const agency = await agencyIdFor(user.id)
    const { settings: s, agencyName, agencyEmail } = await loadAgency(sb, agency)

    if (action === 'preview') {
      // Usa a parcela em aberto mais próxima do cliente; sem cliente, um exemplo
      let entries: Entry[] = []
      if (body.client_id) {
        const { data } = await sb.from('fin_entries')
          .select('id, description, amount, due_date, client_id, clients!inner(id, company_name, responsible_name, whatsapp, email, auto_billing), fin_invoices(number, pdf_url)')
          .eq('user_id', agency).eq('client_id', body.client_id).eq('type', 'receita').eq('status', 'aberto')
          .order('due_date').limit(3)
        entries = (data ?? []) as unknown as Entry[]
      }
      if (!entries.length) {
        entries = [{
          id: '00000000000000000000000000', description: 'Mensalidade · Cliente Exemplo', amount: 1500,
          due_date: new Date(Date.parse(today + 'T00:00:00Z') + 3 * 86_400_000).toISOString().slice(0, 10),
          client_id: 'exemplo',
          clients: { id: 'exemplo', company_name: 'Cliente Exemplo', responsible_name: 'Maria', whatsapp: null, email: null, auto_billing: true },
        }]
      }
      // Pré-visualização com o rascunho da tela (ainda não salvo), se vier
      const draft = { ...(s ?? {}), ...(body.draft ?? {}) }
      const msg = buildMessage(entries, today, draft, agencyName)
      return json({ ok: true, text: msg.text, pix: msg.pix, defaults: DEFAULT_TEMPLATES, agency_name: agencyName })
    }

    if (action === 'send_now') {
      if (!body.client_id) return json({ error: 'client_id obrigatório.' }, 400)
      const { data } = await sb.from('fin_entries')
        .select('id, description, amount, due_date, client_id, clients!inner(id, company_name, responsible_name, whatsapp, email, auto_billing), fin_invoices(number, pdf_url)')
        .eq('user_id', agency).eq('client_id', body.client_id).eq('type', 'receita').eq('status', 'aberto')
        .lte('due_date', new Date(Date.parse(today + 'T00:00:00Z') + 7 * 86_400_000).toISOString().slice(0, 10))
        .order('due_date')
      const entries = (data ?? []) as unknown as Entry[]
      if (!entries.length) return json({ ok: false, error: 'Nada em aberto para cobrar (vencido ou vencendo em 7 dias).' })
      const settingsForSend = { ...(s ?? {}), channel_whatsapp: s?.channel_whatsapp ?? true }
      const { results } = await deliver(sb, agency, entries, today, settingsForSend, agencyName, agencyEmail)
      for (const e of entries) for (const r of results) {
        await sb.from('fin_billing_log').insert({
          user_id: agency, entry_id: e.id, client_id: e.client_id, stage: daysBetween(e.due_date, today),
          channel: r.channel, status: r.ok ? 'enviado' : r.skipped ? 'pulado' : 'falhou', error: r.error ?? null, manual: true,
        })
      }
      const ok = results.some(r => r.ok)
      return json({ ok, results, error: ok ? undefined : results.map(r => r.error).filter(Boolean).join(' ') || 'Nenhum canal ativo.' })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (err) {
    console.error('fin-billing-reminders error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
