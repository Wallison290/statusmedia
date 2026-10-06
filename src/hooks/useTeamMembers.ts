// ── Hook: gerenciamento de membros da equipe ──────────────────────────────────

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'

export interface TeamMember {
  id:           string
  user_id:      string
  name:         string
  role:         string | null
  whatsapp:     string | null
  email:        string | null
  color:        string
  avatar_url:   string | null
  portal_token: string
  is_active:    boolean
  // collaborator = cadastrado na aba Equipe; owner/partner = dono e sócios,
  // criados e mantidos pelo banco (migration 089) para aparecerem como responsáveis
  kind:           'collaborator' | 'owner' | 'partner'
  member_user_id: string | null
  created_at:   string
  updated_at:   string
}

export interface TaskLink {
  id:    string   // uuid gerado no frontend
  label: string
  url:   string
  type:  'link' | 'imagem' | 'video' | 'arquivo' | 'pasta'
}

export interface TeamTask {
  id:                string
  title:             string
  description:       string | null
  status:            string
  priority:          string
  due_date:          string | null
  collaborator_note: string | null
  delivery_url:      string | null
  task_links:        TaskLink[] | null
  created_at:        string
  updated_at:        string
  client_id:         string | null
  assignee_id:       string | null
  clients:           { id: string; company_name: string } | null
}

// ── Leitura ───────────────────────────────────────────────────────────────────

export function useTeamMembers() {
  const { user, agencyId } = useAuth()

  return useQuery<TeamMember[]>({
    queryKey: ['team_members', agencyId],
    enabled:  !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('team_members')
        .select('*')
        .eq('user_id', agencyId!)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useTeamTasks() {
  const { user, agencyId } = useAuth()

  return useQuery<TeamTask[]>({
    queryKey: ['team_tasks', agencyId],
    enabled:  !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('tasks')
        .select(`
          id, title, description, status, priority, due_date,
          collaborator_note, delivery_url, task_links, created_at, updated_at,
          client_id, assignee_id,
          clients(id, company_name)
        `)
        .eq('user_id', agencyId!)
        .not('assignee_id', 'is', null)
        .order('due_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
  })
}

// ── Criação ───────────────────────────────────────────────────────────────────

export function useCreateTeamMember() {
  const { user, agencyId } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (member: Pick<TeamMember, 'name' | 'role' | 'whatsapp' | 'email' | 'color'>) => {
      const { data, error } = await (supabase as any)
        .from('team_members')
        .insert({ ...member, user_id: agencyId! })
        .select()
        .single()
      if (error) throw error
      return data as TeamMember
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team_members'] }),
  })
}

// ── Edição ────────────────────────────────────────────────────────────────────

export function useUpdateTeamMember() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TeamMember> & { id: string }) => {
      const { error } = await (supabase as any)
        .from('team_members')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team_members'] }),
  })
}

// ── Remoção (soft delete) ─────────────────────────────────────────────────────

export function useDeleteTeamMember() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('team_members')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team_members'] }),
  })
}

// ── Criar e delegar tarefa (modal Nova demanda da Equipe) ─────────────────────

export interface NewTeamTaskInput {
  title:       string
  description: string | null
  due_date:    string | null
  due_time:    string | null
  priority:    string
  status:      string
  client_id:   string | null
  assignee_id: string
  assignee:    string       // nome do membro, para exibição na aba Tarefas
  task_links?: TaskLink[]   // links/referências adicionados pela agência
}

export function useCreateAndDelegateTask() {
  const { user, agencyId } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (task: NewTeamTaskInput) => {
      const { error } = await (supabase as any)
        .from('tasks')
        .insert({
          user_id:     agencyId!,
          title:       task.title,
          description: task.description,
          due_date:    task.due_date,
          due_time:    task.due_time,
          priority:    task.priority,
          status:      task.status,
          client_id:   task.client_id,
          assignee_id: task.assignee_id,
          assignee:    task.assignee,
          task_links:  task.task_links ?? [],
        })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team_tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// ── Delegar tarefa ────────────────────────────────────────────────────────────

export function useDelegateTask() {
  const qc = useQueryClient()

  return useMutation({
    // assignee = nome do membro (campo texto exibido na aba Tarefas)
    mutationFn: async ({
      task_id,
      assignee_id,
      assignee,
    }: {
      task_id:     string
      assignee_id: string | null
      assignee?:   string | null   // nome para exibição na aba Tarefas
    }) => {
      const payload: Record<string, unknown> = {
        assignee_id,
        updated_at: new Date().toISOString(),
      }
      // Só inclui assignee se foi fornecido (evita apagar quando não necessário)
      if (assignee !== undefined) payload.assignee = assignee

      const { error } = await (supabase as any)
        .from('tasks')
        .update(payload)
        .eq('id', task_id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team_tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
