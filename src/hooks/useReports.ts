import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { ClientReport, ReportAttachment, ReportAttachmentType } from '@/types'

export function useClientReports(clientId: string) {
  return useQuery({
    queryKey: ['client-reports', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_reports')
        .select('*, attachments:report_attachments(*)')
        .eq('client_id', clientId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (error) throw error
      return data as ClientReport[]
    },
    enabled: !!clientId,
  })
}

export function useCreateReport() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()
  return useMutation({
    mutationFn: async (payload: { client_id: string; month: number; year: number }) => {
      const { data, error } = await supabase
        .from('client_reports')
        .insert({ ...payload, user_id: agencyId! })
        .select()
        .single()
      if (error) throw error
      return data as ClientReport
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-reports'] }),
  })
}

export function useUpdateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ClientReport> & { id: string }) => {
      const { data, error } = await supabase
        .from('client_reports')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ClientReport
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-reports'] }),
  })
}

export function useDeleteReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('client_reports').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-reports'] }),
  })
}

export function useAddReportAttachment() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()
  return useMutation({
    mutationFn: async (payload: {
      report_id: string
      type: ReportAttachmentType
      title: string
      description?: string | null
      file_url?: string | null
      link_url?: string | null
      file_size?: number | null
    }) => {
      const { error } = await supabase
        .from('report_attachments')
        .insert({ ...payload, user_id: agencyId! })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-reports'] }),
  })
}

export function useDeleteReportAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fileUrl }: { id: string; fileUrl: string | null }) => {
      if (fileUrl) {
        const path = fileUrl.split('/report-attachments/')[1]
        if (path) await supabase.storage.from('report-attachments').remove([decodeURIComponent(path.split('?')[0])])
      }
      const { error } = await supabase.from('report_attachments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-reports'] }),
  })
}

// ── Visão geral: relatórios de todos os clientes num mês (aba Relatórios) ─────

export function useReportsOverview(month: number, year: number) {
  return useQuery({
    queryKey: ['reports-overview', month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_reports')
        .select('id, client_id, month, year, ig_synced_at, analysis_text, reach, followers_end, posts_published')
        .eq('month', month)
        .eq('year', year)
      if (error) throw error
      return data as Pick<ClientReport,
        'id' | 'client_id' | 'month' | 'year' | 'ig_synced_at' | 'analysis_text' | 'reach' | 'followers_end' | 'posts_published'
      >[]
    },
  })
}
