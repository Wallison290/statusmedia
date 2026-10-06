import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import type { Client } from '@/types'
import { resolveAgencyId } from '@/hooks/useAuth'

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Client[]
    },
  })
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Client
    },
    enabled: !!id,
  })
}

export function useCreateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (client: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('clients').insert(client as any).select().single()
      if (error) throw error
      return data as Client
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export function useUpdateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      // 1. Atualiza a tabela clients (todos os campos, incluindo email)
      const { data, error } = await supabase
        .from('clients')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      // 2. Se o e-mail foi alterado, sincroniza com profiles e auth.users
      //    (cliente pode não ter acesso criado ainda — RPC ignora silenciosamente)
      if (updates.email) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc('sync_client_auth_email', {
          p_client_id: id,
          p_new_email:  updates.email,
        })
        // Não lançamos erro aqui: se não há usuário vinculado, o RPC retorna
        // normalmente sem alterar nada além de clients.email (já atualizado acima)
      }

      return data as Client
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['clients', data.id] })
    },
  })
}

/** Antes de excluir: o cliente tem acesso ao portal? Há outro cadastro com o mesmo e-mail? */
export async function checkClientDeletion(id: string): Promise<{ hasPortal: boolean; duplicates: number }> {
  const { data } = await supabase.functions.invoke('delete-client', { body: { clientId: id, check: true } })
  return { hasPortal: !!data?.hasPortal, duplicates: Number(data?.duplicates ?? 0) }
}

export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('delete-client', {
        body: { clientId: id },
      })
      // Extrai a mensagem real de erro (data.error tem prioridade sobre a mensagem genérica do SDK)
      if (data?.error) throw new Error(data.error)
      if (error) throw new Error(error.message || 'Erro ao excluir cliente')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export function useRegisterPayment() {
  const qc = useQueryClient()
  return useMutation({
    // Botão rápido do perfil do cliente. Desde a migration 090 passa pelo livro
    // de lançamentos: dá baixa na mensalidade em aberto mais antiga do cliente
    // (até o fim deste mês) ou, se não houver, registra o recebimento deste mês.
    // O banco atualiza client_payments e clients.last_payment_date como antes.
    mutationFn: async (id: string) => {
      const now = new Date()
      const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const today = iso(now)
      const monthEndISO = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))

      const { data: client, error: cErr } = await supabase.from('clients').select('*').eq('id', id).single()
      if (cErr) throw cErr

      if (!client.valor_mensal) {
        // Sem mensalidade cadastrada: só marca o pagamento no cliente (como antes)
        const { data, error } = await supabase.from('clients').update({
          last_payment_date: today, financial_status: 'ativo', manual_status_override: false,
          updated_at: new Date().toISOString(),
        }).eq('id', id).select().single()
        if (error) throw error
        return data as Client
      }

      const { data: open } = await (supabase as any).from('fin_entries')
        .select('id, amount, recurrence_id').eq('client_id', id).eq('type', 'receita').eq('status', 'aberto')
        .not('recurrence_id', 'is', null).lte('due_date', monthEndISO)
        .order('due_date').limit(1)

      if (open?.[0]) {
        const { error } = await (supabase as any).rpc('fin_settle', {
          p_entry: open[0].id, p_paid_at: today, p_amount: open[0].amount, p_account: null, p_notes: null,
        })
        if (error) throw error
      } else {
        const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
        const { error } = await (supabase as any).rpc('fin_register_client_payment', {
          p_client: id, p_amount: client.valor_mensal, p_paid_at: today,
          p_reference: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`, p_notes: null,
        })
        if (error) throw error
      }

      const { data } = await supabase.from('clients').select('*').eq('id', id).single()
      return data as Client
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['clients', data.id] })
      qc.invalidateQueries({ queryKey: ['client_payments', data.id] })
      qc.invalidateQueries({ queryKey: ['portal-payments'] })
      qc.invalidateQueries({ queryKey: ['fin_entries'] })
      qc.invalidateQueries({ queryKey: ['fin_accounts'] })
    },
  })
}

export function useBrandDNA(clientId: string) {
  return useQuery({
    queryKey: ['brand_dna', clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('brand_dna')
        .select('*')
        .eq('client_id', clientId)
        .single()
      return data
    },
    enabled: !!clientId,
  })
}

export function useUpsertBrandDNA() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dna: { client_id: string; [key: string]: unknown }) => {
      const { data, error } = await supabase
        .from('brand_dna')
        .upsert({ ...dna, updated_at: new Date().toISOString() } as any, { onConflict: 'client_id' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['brand_dna', vars.client_id] }),
  })
}
