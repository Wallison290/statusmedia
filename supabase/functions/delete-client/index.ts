// ── delete-client: deleta perfil do cliente + usuário Auth vinculado ─────────

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    // Valida que é a própria agência chamando (JWT do usuário logado)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado')

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Verifica identidade do caller
    const { data: { user: caller } } = await sb.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!caller) throw new Error('Não autorizado')

    const { clientId, check } = await req.json()
    if (!clientId) throw new Error('clientId é obrigatório')

    // 1. Verifica se o cliente pertence ao usuário logado
    const { data: client, error: clientErr } = await sb
      .from('clients')
      .select('id, user_id')
      .eq('id', clientId)
      .single()

    if (clientErr || !client) throw new Error('Cliente não encontrado')
    if (client.user_id !== caller.id) throw new Error('Sem permissão para deletar este cliente')

    // 2. Busca o usuário Auth vinculado a este cliente (se existir)
    const { data: linkedProfile } = await sb
      .from('profiles')
      .select('id')
      .eq('linked_client_id', clientId)
      .maybeSingle()

    // Consulta prévia (check: true): a tela pergunta antes de excluir se este
    // cadastro tem acesso ao portal, e se existe outro cadastro com o mesmo
    // e-mail. Foi o caso real: dois cadastros iguais, e a agência apagou
    // justamente o que tinha o acesso do cliente.
    if (check) {
      const { data: full } = await sb.from('clients').select('email').eq('id', clientId).single()
      let duplicates = 0
      if (full?.email) {
        const { count } = await sb.from('clients').select('id', { count: 'exact', head: true })
          .eq('user_id', caller.id).ilike('email', full.email).neq('id', clientId)
        duplicates = count ?? 0
      }
      return new Response(
        JSON.stringify({ success: true, hasPortal: !!linkedProfile?.id, duplicates }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Remove contas Instagram vinculadas ao cliente antes de deletar
    // (evita violação de unique constraint ao fazer SET NULL em registros duplicados)
    await sb
      .from('instagram_accounts')
      .delete()
      .eq('client_id', clientId)

    // 4. Deleta o cliente (CASCADE cuida de todos os dados relacionados)
    const { error: deleteErr } = await sb
      .from('clients')
      .delete()
      .eq('id', clientId)

    if (deleteErr) throw deleteErr

    // 4. Se tinha usuário Auth vinculado, deleta ele também
    if (linkedProfile?.id) {
      const { error: authDeleteErr } = await sb.auth.admin.deleteUser(linkedProfile.id)
      if (authDeleteErr) {
        // Loga mas não falha — o cliente já foi deletado do banco
        console.error('Erro ao deletar usuário Auth:', authDeleteErr.message)
      }
    }

    return new Response(
      JSON.stringify({ success: true, authUserDeleted: !!linkedProfile?.id }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    // Sempre retorna 200 para que o SDK consiga ler o body com a mensagem real
    return new Response(
      JSON.stringify({ success: false, error: err.message ?? 'Erro desconhecido' }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})
