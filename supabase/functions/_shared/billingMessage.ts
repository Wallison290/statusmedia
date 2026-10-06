// Montagem da mensagem de cobrança (texto + Pix). Puro, sem rede: usado pela
// Edge Function fin-billing-reminders e testável isoladamente.
import { buildPixPayload, type PixKeyType } from './pix.ts'

// ── Textos padrão (a agência pode editar na aba Cobrança automática) ─────────
export const DEFAULT_TEMPLATES = {
  before:
`Olá, {cliente}! Tudo bem?
Passando para lembrar do pagamento com vencimento em *{vencimento}*:

{descricao}
*Total: {valor}*

{pix_info}
Dados para transferência: {dados_bancarios}

Se já pagou, pode desconsiderar. Obrigado!
{agencia}`,
  due:
`Olá, {cliente}! Hoje, *{vencimento}*, é o vencimento de:

{descricao}
*Total: {valor}*

{pix_info}
Dados para transferência: {dados_bancarios}

Se já pagou, pode desconsiderar. Obrigado!
{agencia}`,
  after:
`Olá, {cliente}. Ainda não identificamos o pagamento abaixo, vencido em *{vencimento}* ({dias_atraso} dias):

{descricao}
*Total: {valor}*

{pix_info}
Dados para transferência: {dados_bancarios}

Se já pagou, por favor nos envie o comprovante por aqui. Obrigado!
{agencia}`,
}
export const PIX_INFO = 'O código Pix Copia e Cola vai na próxima mensagem: é só copiar e colar no app do seu banco.'

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Data e hora de agora em Brasília. */
export function nowBR() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 }
}
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)

/** Troca {variáveis}; linha cuja variável ficou vazia sai inteira. */
export function render(tpl: string, vars: Record<string, string>) {
  return tpl.split('\n').filter(line => {
    const used = [...line.matchAll(/\{(\w+)\}/g)].map(m => m[1])
    return used.every(v => (vars[v] ?? '').trim() !== '')
  }).map(line => line.replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '')).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim()
}

export interface Entry {
  id: string; description: string; amount: number; due_date: string; client_id: string
  clients: { id: string; company_name: string; responsible_name: string | null; whatsapp: string | null; email: string | null; auto_billing: boolean }
}

// deno-lint-ignore no-explicit-any
export function buildMessage(entries: Entry[], today: string, s: any, agencyName: string) {
  const client = entries[0].clients
  const total = Math.round(entries.reduce((t, e) => t + Number(e.amount), 0) * 100) / 100
  const earliest = entries.map(e => e.due_date).sort()[0]
  const late = daysBetween(earliest, today)
  const kind: 'before' | 'due' | 'after' = late > 0 ? 'after' : late === 0 ? 'due' : 'before'
  const tpl = (kind === 'before' ? s?.template_before : kind === 'due' ? s?.template_due : s?.template_after) || DEFAULT_TEMPLATES[kind]

  const pix = s?.pix_key && s?.pix_key_type
    ? buildPixPayload({
        key: s.pix_key, keyType: s.pix_key_type as PixKeyType,
        name: s.receiver_name || agencyName, city: s.receiver_city || 'BRASIL',
        amount: total, txid: entries[0].id.replace(/-/g, '').slice(0, 25),
      })
    : null

  const text = render(tpl, {
    cliente: (client.responsible_name || client.company_name || '').split(' ')[0],
    empresa: client.company_name ?? '',
    agencia: agencyName,
    valor: brl(total),
    vencimento: brDate(earliest),
    dias_atraso: String(Math.max(0, late)),
    descricao: entries.map(e => `• ${e.description} (vence ${brDate(e.due_date)}): ${brl(Number(e.amount))}`).join('\n'),
    dados_bancarios: s?.bank_details ?? '',
    pix_info: pix ? PIX_INFO : '',
  })
  return { text, pix, total, kind, subject: kind === 'after' ? `Pagamento em atraso · ${agencyName}` : `Lembrete de pagamento · ${agencyName}` }
}

