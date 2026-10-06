import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { resolveAgencyId } from '@/hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedPost {
  id: string
  image_url: string
  caption?: string
  asset_id?: string
}

export interface FeedVersion {
  id: string
  user_id: string
  client_id: string
  name: string
  posts: FeedPost[]
  created_at: string
  updated_at: string
}

export interface FeedClientMeta {
  bio: string
  link: string
}

const feedsDb = () => (supabase.from('feeds') as any)
const metaDb  = () => (supabase.from('feed_meta') as any)

function parseFeed(f: any): FeedVersion {
  return {
    ...f,
    posts: Array.isArray(f.posts) ? f.posts : [],
  }
}

// ─── Versions ─────────────────────────────────────────────────────────────────

/** All feed versions for the logged-in user (across every client). */
export function useFeeds() {
  return useQuery<FeedVersion[]>({
    queryKey: ['feeds'],
    queryFn: async () => {
      const { data, error } = await feedsDb()
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map(parseFeed)
    },
  })
}

export interface CreateFeedPayload {
  client_id: string
  name: string
  posts?: FeedPost[]
}

export function useCreateFeedVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateFeedPayload) => {
      const { data: { user } } = await supabase.auth.getUser()
      const agencyId = user ? await resolveAgencyId(user.id) : null
      const { data, error } = await feedsDb()
        .insert({
          user_id:   agencyId!,
          client_id: payload.client_id,
          name:      payload.name,
          posts:     payload.posts ?? [],
        })
        .select('*')
        .single()
      if (error) throw error
      return parseFeed(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feeds'] }),
  })
}

export interface UpdateFeedPayload {
  id: string
  name?: string
  posts?: FeedPost[]
}

export function useUpdateFeedVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateFeedPayload) => {
      const { data, error } = await feedsDb()
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return parseFeed(data)
    },
    // Optimistic update so post reorder / add / remove feels instant.
    onMutate: async ({ id, ...patch }: UpdateFeedPayload) => {
      await qc.cancelQueries({ queryKey: ['feeds'] })
      const prev = qc.getQueryData<FeedVersion[]>(['feeds'])
      qc.setQueryData<FeedVersion[]>(['feeds'], old =>
        (old ?? []).map(v => v.id === id ? { ...v, ...patch } : v)
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['feeds'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['feeds'] }),
  })
}

export function useDeleteFeedVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await feedsDb().delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['feeds'] })
      const prev = qc.getQueryData<FeedVersion[]>(['feeds'])
      qc.setQueryData<FeedVersion[]>(['feeds'], old => (old ?? []).filter(v => v.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['feeds'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['feeds'] }),
  })
}

// ─── Meta (bio / link per client) ───────────────────────────────────────────────

/** Map of client_id → { bio, link } for the logged-in user. */
export function useFeedMeta() {
  return useQuery<Record<string, FeedClientMeta>>({
    queryKey: ['feed_meta'],
    queryFn: async () => {
      const { data, error } = await metaDb().select('client_id, bio, link')
      if (error) throw error
      const map: Record<string, FeedClientMeta> = {}
      for (const row of data ?? []) {
        map[row.client_id] = { bio: row.bio ?? '', link: row.link ?? '' }
      }
      return map
    },
  })
}

export function useUpsertFeedMeta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ client_id, bio, link }: { client_id: string } & FeedClientMeta) => {
      const { data: { user } } = await supabase.auth.getUser()
      const agencyId = user ? await resolveAgencyId(user.id) : null
      const { error } = await metaDb()
        .upsert(
          { user_id: agencyId!, client_id, bio, link, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,client_id' }
        )
      if (error) throw error
    },
    onMutate: async ({ client_id, bio, link }) => {
      await qc.cancelQueries({ queryKey: ['feed_meta'] })
      const prev = qc.getQueryData<Record<string, FeedClientMeta>>(['feed_meta'])
      qc.setQueryData<Record<string, FeedClientMeta>>(['feed_meta'], old => ({
        ...(old ?? {}),
        [client_id]: { bio, link },
      }))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['feed_meta'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['feed_meta'] }),
  })
}
