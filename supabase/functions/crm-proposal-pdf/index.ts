// ── Edge Function: crm-proposal-pdf ──────────────────────────────────────────
// Entrega o PDF de uma proposta anexada (migration 107) para a página pública
// /proposta/<token> desenhar as páginas no navegador.
//
// GET ?t=<public_token>   (sem login: deploy com --no-verify-jwt)
//   • só proposta fora de rascunho, igual ao get_crm_proposal;
//   • o arquivo só é buscado no R2 público ou no Storage do próprio projeto,
//     nunca numa URL qualquer;
//   • não conta abertura: isso continua no get_crm_proposal.
// Por que existe: o R2 público não manda cabeçalho de CORS, e o leitor de PDF
// (pdf.js) precisa baixar o arquivo pelo navegador.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const R2_PUBLIC    = (Deno.env.get('R2_PUBLIC_URL') ?? '').replace(/\/$/, '')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

function allowed(url: string) {
  if (R2_PUBLIC && url.startsWith(R2_PUBLIC + '/')) return true
  if (url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`)) return true
  try { return new URL(url).hostname.endsWith('.r2.dev') } catch { return false }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return new Response('Método não permitido.', { status: 405, headers: cors })

  const token = new URL(req.url).searchParams.get('t')
  if (!uuid(token)) return new Response('Link inválido.', { status: 400, headers: cors })

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: p } = await sb.from('crm_proposals')
    .select('pdf_url, pdf_name, status')
    .eq('public_token', token)
    .maybeSingle()
  if (!p || p.status === 'rascunho' || !p.pdf_url || !allowed(p.pdf_url)) {
    return new Response('Proposta não encontrada.', { status: 404, headers: cors })
  }

  const file = await fetch(p.pdf_url)
  if (!file.ok || !file.body) return new Response('Arquivo indisponível.', { status: 502, headers: cors })

  const name = (p.pdf_name || 'proposta.pdf').replace(/[^\w. -]+/g, '_')
  return new Response(file.body, {
    headers: {
      ...cors,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'private, max-age=300',
      ...(file.headers.get('content-length') ? { 'Content-Length': file.headers.get('content-length')! } : {}),
    },
  })
})
