import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'


export type NotificationType =
  | 'NEW_CONTENT'
  | 'APPROVAL_REQUEST'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMMENT'
  | 'ADJUSTMENT_DONE'
  | 'TASK_STATUS_UPDATE'
  | 'TASK_DONE'
  | 'FORM_SUBMITTED'
  | 'POST_PUBLISHED'
  | 'POST_FAILED'
  | 'NOTE_REQUEST'
  | 'NEW_REPORT'
  | 'IG_TOKEN_EXPIRING'
  | 'CRM_FOLLOWUP'
  | 'CRM_LEAD_NEW'
  | 'CRM_PROPOSAL_VIEWED'
  | 'CRM_PROPOSAL_ACCEPTED'
  | 'CRM_PROPOSAL_REJECTED'
  | 'CRM_CONTRACT_SIGNED'
  | 'CRM_AUTOMATION'

export interface Notification {
  id: string
  user_id: string
  client_id: string | null
  type: NotificationType
  title: string
  message: string
  link: string | null
  is_read: boolean
  created_at: string
}

export function useNotifications() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as Notification[]
    },
    enabled: !!user,
    refetchInterval: 30_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('id', id)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('user_id', user!.id)
        .eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
