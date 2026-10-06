import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'

export interface PlannerComment {
  id: string
  planner_id: string
  user_id: string
  role: 'client' | 'agency'
  message: string
  created_at: string
}

export function usePlannerComments(plannerId: string) {
  return useQuery({
    queryKey: ['planner-comments', plannerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planner_comments')
        .select('*')
        .eq('planner_id', plannerId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as PlannerComment[]
    },
    enabled: !!plannerId,
  })
}

export function useAddPlannerComment() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()

  return useMutation({
    mutationFn: async ({
      plannerId,
      message,
      role,
    }: {
      plannerId: string
      message: string
      role: 'client' | 'agency'
    }) => {
      const { error } = await supabase
        .from('planner_comments')
        .insert({
          planner_id: plannerId,
          user_id: agencyId!,
          role,
          message: message.trim(),
        })
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['planner-comments', variables.plannerId] })
    },
  })
}
