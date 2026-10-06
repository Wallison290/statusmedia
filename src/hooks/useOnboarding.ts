import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { ChecklistItem, ClientDocument, ClientBriefing, BriefingData, ClientStatus, Profile } from '@/types'

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CHECKLIST: string[] = [
  'Contrato assinado',
  'Pagamento confirmado',
  'Criar pasta do cliente',
  'Criar perfil no sistema',
  'Criar grupo WhatsApp',
  'Definir responsável interno',
  'Enviar boas-vindas',
  'Liberar acesso à área do cliente',
  'Liberar manual / reunião de kickoff',
]

async function ensureDefaultChecklist(clientId: string) {
  const { data: existing } = await supabase
    .from('client_checklist')
    .select('id')
    .eq('client_id', clientId)
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase.from('client_checklist').insert(
    DEFAULT_CHECKLIST.map(title => ({ client_id: clientId, title, completed: false }))
  )
}

// ─── Checklist ────────────────────────────────────────────────────────────────

export function useChecklist(clientId: string) {
  return useQuery({
    queryKey: ['checklist', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_checklist')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ChecklistItem[]
    },
    enabled: !!clientId,
  })
}

export function useToggleChecklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, completed, clientId }: { id: string; completed: boolean; clientId: string }) => {
      const { error } = await supabase
        .from('client_checklist')
        .update({ completed })
        .eq('id', id)
      if (error) throw error
      return clientId
    },
    onSuccess: (clientId) => {
      qc.invalidateQueries({ queryKey: ['checklist', clientId] })
    },
  })
}

/** Garante o checklist padrão para um cliente (idempotente). Usado quando o
 *  cliente já está em onboarding mas o checklist nunca foi semeado. */
export function useEnsureChecklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (clientId: string) => { await ensureDefaultChecklist(clientId) },
    onSuccess: (_d, clientId) => qc.invalidateQueries({ queryKey: ['checklist', clientId] }),
  })
}

// ─── Status do cliente (com criação automática do checklist) ──────────────────

export function useUpdateClientStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ClientStatus }) => {
      // 'fechado' é transição: cria checklist e vai direto para 'onboarding'
      let finalStatus: ClientStatus = status
      if (status === 'fechado') {
        await ensureDefaultChecklist(id)
        finalStatus = 'onboarding'
      }
      const { data, error } = await supabase
        .from('clients')
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['clients', data.id] })
      qc.invalidateQueries({ queryKey: ['checklist', data.id] })
    },
  })
}

// ─── Documentos ───────────────────────────────────────────────────────────────

export function useClientDocuments(clientId: string) {
  return useQuery({
    queryKey: ['client-documents', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_documents')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ClientDocument[]
    },
    enabled: !!clientId,
  })
}

export function useAddDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (doc: Omit<ClientDocument, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('client_documents')
        .insert(doc)
        .select()
        .single()
      if (error) throw error
      return data as ClientDocument
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['client-documents', data.client_id] })
    },
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, clientId, fileUrl }: { id: string; clientId: string; fileUrl: string }) => {
      const path = extractDocStoragePath(fileUrl)
      if (path) await supabase.storage.from('client-documents').remove([path])
      const { error } = await supabase.from('client_documents').delete().eq('id', id)
      if (error) throw error
      return clientId
    },
    onSuccess: (clientId) => {
      qc.invalidateQueries({ queryKey: ['client-documents', clientId] })
    },
  })
}

function extractDocStoragePath(url: string): string | null {
  const marker = '/client-documents/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length))
}

// ─── Briefing ─────────────────────────────────────────────────────────────────

export function useClientBriefing(clientId: string) {
  return useQuery({
    queryKey: ['client-briefing', clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_briefing')
        .select('*')
        .eq('client_id', clientId)
        .single()
      return data as ClientBriefing | null
    },
    enabled: !!clientId,
  })
}

export function useUpsertBriefing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ clientId, data }: { clientId: string; data: BriefingData }) => {
      const { error } = await supabase
        .from('client_briefing')
        .upsert(
          { client_id: clientId, data: data as unknown as import('@/integrations/supabase/types').Json, updated_at: new Date().toISOString() },
          { onConflict: 'client_id' }
        )
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['client-briefing', vars.clientId] })
    },
  })
}

// ─── Membros da equipe ────────────────────────────────────────────────────────

// Pessoas com login na agência (dono e sócios) — o campo clients.responsible_user_id
// aponta para auth.users, então colaboradores sem login ficam de fora. As linhas
// vêm de team_members (kind owner/partner), mantidas pelo banco (migration 089).
export function useTeamMembers() {
  const { agencyId } = useAuth()
  return useQuery({
    queryKey: ['team-members', agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('team_members')
        .select('member_user_id, name, email, avatar_url')
        .eq('user_id', agencyId!)
        .in('kind', ['owner', 'partner'])
        .eq('is_active', true)
        .order('kind')
        .order('name')
      if (error) throw error
      return (data ?? []).map((m: any) => ({
        id: m.member_user_id as string,
        full_name: m.name as string,
        email: m.email as string,
        avatar_url: m.avatar_url as string | null,
      })) as Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[]
    },
  })
}
