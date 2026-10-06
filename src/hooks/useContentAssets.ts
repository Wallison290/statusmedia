import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { ContentAsset } from '@/types'

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * useContentAssets(clientId?)
 *   - no arg  → all assets (library view, joins client name)
 *   - clientId → only assets for that client
 */
export function useContentAssets(clientId?: string) {
  const { user, agencyId } = useAuth()
  return useQuery({
    queryKey: ['content-assets', clientId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('content_assets')
        .select('*, client:clients(id,company_name)')
        .eq('user_id', agencyId!)

      if (clientId) q = q.eq('client_id', clientId)

      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return data as ContentAsset[]
    },
    enabled: !!user,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateContentAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (asset: Omit<ContentAsset, 'id' | 'created_at' | 'updated_at' | 'client'>) => {
      const { data, error } = await supabase
        .from('content_assets')
        .insert(asset)
        .select('*, client:clients(id,company_name)')
        .single()
      if (error) throw error
      return data as ContentAsset
    },
    onSuccess: (data) => {
      if (data.client_id) qc.invalidateQueries({ queryKey: ['content-assets', data.client_id] })
      qc.invalidateQueries({ queryKey: ['content-assets', 'all'] })
    },
  })
}

export function useUpdateContentAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ContentAsset> & { id: string }) => {
      const { data, error } = await supabase
        .from('content_assets')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select('*, client:clients(id,company_name)')
        .single()
      if (error) throw error
      return data as ContentAsset
    },
    onSuccess: (data) => {
      if (data.client_id) qc.invalidateQueries({ queryKey: ['content-assets', data.client_id] })
      qc.invalidateQueries({ queryKey: ['content-assets', 'all'] })
    },
  })
}

export function useDeleteContentAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      clientId,
      mediaUrl,
    }: {
      id: string
      clientId?: string | null
      mediaUrl?: string | null
    }) => {
      if (mediaUrl) {
        const path = extractAssetStoragePath(mediaUrl)
        if (path) await supabase.storage.from('content-assets').remove([path])
      }
      const { error } = await supabase.from('content_assets').delete().eq('id', id)
      if (error) throw error
      return clientId ?? null
    },
    onSuccess: (clientId) => {
      if (clientId) qc.invalidateQueries({ queryKey: ['content-assets', clientId] })
      qc.invalidateQueries({ queryKey: ['content-assets', 'all'] })
    },
  })
}

// ─── Utils ────────────────────────────────────────────────────────────────────

export function extractAssetStoragePath(url: string): string | null {
  const marker = '/content-assets/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length))
}
