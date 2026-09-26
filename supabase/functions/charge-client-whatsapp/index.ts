// ── Edge Function: charge-client-whatsapp ──────────────────────────────────────
// Envia mensagem de cobrança no WhatsApp do cliente, pelo WhatsApp conectado da agência.
// Chamado pelo botão "Cobrar" na página Financeiro.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendForAgency } from '../_shared/whatsapp.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

function currentMonthLabel(): string {
  const now = new Date()
  return `${MONTHS_PT[now.getMonth()]} ${now.getFullYear()}`
}

function fmtBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function normalizeNumber(raw: string): string {
  let n = (raw || '').replace(/\D/g, '')
  if (!n) return ''
  if (!n.startsWith('55') && n.length <= 11) n = '55' + n
  return n
}

// ─── Mensagem de cobrança ─────────────────────────────────────────────────────

function buildChargeMessage(client: {
  company_name: string
  contact_name: string | null
  dia_vencimento: number | null
  valor_mensal: number | null
}): string {
  const name = client.contact_name || client.company_name
  const month = currentMonthLabel()
  const dueDay = client.dia_vencimento ? `dia ${client.dia_vencimento}` : 'data prevista'
  const amountLine = client.valor_mensal != null
    ? `\n💰 *Valor:* ${fmtBRL(client.valor_mensal)}`
    : ''

  return (
    `Olá, ${name}! 👋\n\n` +
    `Passando para lembrar que seu pagamento referente a *${month}* venceu no ${dueDay}.` +
    amountLine +
    `\n\nPode me confirmar quando o pagamento for realizado? 😊`
  )
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = await req.json().catch(() => ({}))
    const { client_id } = body as { client_id?: string }
    if (!client_id) throw new Error('client_id obrigatório.')

    // Verifica autenticação
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autenticado.')

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await anonClient.auth.getUser()
    if (authErr || !user) throw new Error('Token inválido.')

    // Busca o cliente com os dados necessários
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)
    // .eq('user_id'): sem isto qualquer agência logada cobrava o cliente de
    // outra, só sabendo o id
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('company_name, responsible_name, whatsapp, dia_vencimento, valor_mensal')
      .eq('id', client_id)
      .eq('user_id', user.id)
      .single()

    if (clientErr || !client) throw new Error('Cliente não encontrado.')
    if (!client.whatsapp) throw new Error('Cliente sem WhatsApp cadastrado.')

    const message = buildChargeMessage({ ...client, contact_name: client.responsible_name })
    // Sai pelo WhatsApp conectado da agência
    const result = await sendForAgency(supabase, user.id, client.whatsapp, message)
    if (!result.ok) throw new Error(result.error)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message ?? String(err) }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
