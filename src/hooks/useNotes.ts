import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { Note, NoteChecklistItem, NoteType, NoteOrigin } from '@/types'
import { resolveAgencyId } from '@/hooks/useAuth'

const db = () => (supabase.from('notes') as any)

function parseNote(n: any): Note {
  return {
    ...n,
    checklist: Array.isArray(n.checklist) ? n.checklist : [],
    client: n.client ?? undefined,
  }
}

// ─── Agency hooks ─────────────────────────────────────────────────────────────

export interface NotesFilter {
  client_id?: string | null
  type?: NoteType | null
  origin?: NoteOrigin | null
}

export function useNotes(filter: NotesFilter = {}) {
  return useQuery<Note[]>({
    queryKey: ['notes', filter],
    queryFn: async () => {
      let q = db()
        .select('*, client:clients(id, company_name)')
        .order('updated_at', { ascending: false })

      if (filter.client_id) q = q.eq('client_id', filter.client_id)
      if (filter.type)      q = q.eq('type', filter.type)
      if (filter.origin)    q = q.eq('origin', filter.origin)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map(parseNote)
    },
  })
}

export interface CreateNotePayload {
  title: string
  content?: string | null
  checklist?: NoteChecklistItem[]
  client_id?: string | null
  type?: NoteType
  origin?: NoteOrigin
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateNotePayload) => {
      const { data: { user } } = await supabase.auth.getUser()
      const agencyId = user ? await resolveAgencyId(user.id) : null
      const { data, error } = await db()
        .insert({
          user_id:   agencyId!,
          title:     payload.title,
          content:   payload.content   ?? null,
          checklist: payload.checklist ?? [],
          client_id: payload.client_id ?? null,
          type:      payload.type      ?? 'interna',
          origin:    payload.origin    ?? 'agency',
        })
        .select('*, client:clients(id, company_name)')
        .single()
      if (error) throw error
      return parseNote(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

export interface UpdateNotePayload {
  id: string
  title?: string
  content?: string | null
  checklist?: NoteChecklistItem[]
  client_id?: string | null
  type?: NoteType
  origin?: NoteOrigin
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateNotePayload) => {
      const { data, error } = await db()
        .update(patch)
        .eq('id', id)
        .select('*, client:clients(id, company_name)')
        .single()
      if (error) throw error
      return parseNote(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

// ─── Portal hooks (cliente) ───────────────────────────────────────────────────

function useIsPortalClient() {
  const { profile } = useAuth()
  return profile?.role === 'client' && !!profile?.linked_client_id
}

export function usePortalNotes() {
  const { profile, agencyId } = useAuth()
  const isClient = useIsPortalClient()

  return useQuery<Note[]>({
    queryKey: ['portal-notes', profile?.linked_client_id],
    queryFn: async () => {
      const { data, error } = await db()
        .select('*, client:clients(id, company_name)')
        .eq('client_id', profile!.linked_client_id!)
        .neq('type', 'interna')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(parseNote)
    },
    enabled: isClient,
  })
}

export function useCreatePortalNote() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (payload: { title: string; content?: string | null; checklist?: NoteChecklistItem[] }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await db()
        .insert({
          user_id:   user!.id,
          client_id: profile!.linked_client_id!,
          title:     payload.title,
          content:   payload.content   ?? null,
          checklist: payload.checklist ?? [],
          type:      'solicitacao',
          origin:    'client',
        })
        .select('*, client:clients(id, company_name)')
        .single()
      if (error) throw error

      // A notificação para a agência é criada automaticamente por um trigger no
      // banco (notify_note_request, SECURITY DEFINER) — ver migration 046.
      // Não inserimos aqui porque a RLS bloqueia o cliente de notificar a agência.

      return parseNote(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-notes'] })
      qc.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useUpdatePortalNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; title?: string; content?: string | null; checklist?: NoteChecklistItem[] }) => {
      const { data, error } = await db()
        .update(patch)
        .eq('id', id)
        .select('*, client:clients(id, company_name)')
        .single()
      if (error) throw error
      return parseNote(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-notes'] })
      qc.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useDeletePortalNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-notes'] })
      qc.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}
