import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface ClientPayment {
  id: string
  client_id: string
  user_id: string
  amount: number
  payment_date: string
  reference_month: string
  status: 'pago' | 'atrasado'
  notes: string | null
  created_at: string
}

export function useClientPayments(clientId: string | null) {
  return useQuery({
    queryKey: ['client_payments', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_payments')
        .select('*')
        .eq('client_id', clientId!)
        .order('payment_date', { ascending: false })
      if (error) throw error
      return data as ClientPayment[]
    },
    enabled: !!clientId,
  })
}

export function useCreatePayment() {
  const qc = useQueryClient()
  return useMutation({
    // Desde a migration 090 o pagamento passa pelo livro de lançamentos: dá
    // baixa na parcela da mensalidade daquele mês (ou cria um recebimento pago)
    // e o banco grava client_payments + clients.last_payment_date como antes.
    mutationFn: async ({
      client_id, amount, payment_date, reference_month, notes,
    }: Omit<ClientPayment, 'id' | 'status' | 'created_at'>) => {
      const { data: entryId, error } = await (supabase as any).rpc('fin_register_client_payment', {
        p_client: client_id, p_amount: amount, p_paid_at: payment_date,
        p_reference: reference_month, p_notes: notes || null,
      })
      if (error) throw error
      const { data } = await supabase.from('client_payments').select('*')
        .eq('entry_id' as any, entryId).maybeSingle()
      return (data ?? { client_id }) as ClientPayment
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['client_payments', data.client_id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['fin_entries'] })
      qc.invalidateQueries({ queryKey: ['fin_accounts'] })
    },
  })
}
