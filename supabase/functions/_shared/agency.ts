// ── Agência de quem está logado ──────────────────────────────────────────────
// Todo dado da agência pertence ao user_id do dono. Um sócio (agency_partners,
// migration 088) age em nome desse dono: as funções usam o id devolvido aqui
// no lugar de user.id sempre que o assunto for "de qual agência é isso".
import { createClient } from 'npm:@supabase/supabase-js@2'

export async function agencyIdFor(userId: string): Promise<string> {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await sb.rpc('agency_partner_owner', { p_user: userId })
  if (error) console.error('agency_partner_owner failed:', error.message)
  return (data as string | null) ?? userId
}
