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

/** O que a demanda vai gerar: igual aos formatos do Planejamento */
export type DeliverableType = 'reels' | 'post' | 'carrossel'

/** Arquivo entregue pelo colaborador no portal (ordem = ordem dos slides) */
export interface TaskDelivery {
  id:   string
  url:  string
  type: 'image' | 'video'
  name: string
  size: number | null
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
  deliverable_type:  DeliverableType | null
  deliveries:        TaskDelivery[] | null
  delivered_at:      string | null
  agency_feedback:   string | null
  planner_id:        string | null
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
          deliverable_type, deliveries, delivered_at, agency_feedback, planner_id,
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
  deliverable_type?: DeliverableType | null
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
          deliverable_type: task.deliverable_type ?? null,
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

// ── Conferência da entrega (Equipe) ───────────────────────────────────────────

/** Devolve a demanda ao colaborador com o recado do que ajustar. */
export function useRequestDeliveryAdjust() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, feedback }: { taskId: string; feedback: string }) => {
      const { error } = await (supabase as any)
        .from('tasks')
        .update({ status: 'em_andamento', agency_feedback: feedback.trim(), updated_at: new Date().toISOString() })
        .eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team_tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

const PLANNER_FORMAT: Record<DeliverableType, { content_type: string; ig_post_type: string }> = {
  reels:     { content_type: 'reels',     ig_post_type: 'REELS' },
  post:      { content_type: 'post',      ig_post_type: 'IMAGE' },
  carrossel: { content_type: 'carrossel', ig_post_type: 'CAROUSEL_ALBUM' },
}

/** Formato do post a partir do que foi pedido ou, sem pedido, do que veio. */
export function plannerFormatFor(task: Pick<TeamTask, 'deliverable_type' | 'deliveries'>): DeliverableType {
  if (task.deliverable_type) return task.deliverable_type
  const files = task.deliveries ?? []
  if (files.length > 1) return 'carrossel'
  if (files[0]?.type === 'video') return 'reels'
  return 'post'
}

/**
 * Cria o post no Planejamento com os arquivos entregues (mídias do Instagram,
 * na ordem dos slides), liga a demanda a ele e conclui a demanda.
 * Devolve o id do post para abrir no Planejamento.
 */
export function useSendDeliveryToPlanner() {
  const { agencyId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ task, title, date, time }: {
      task: TeamTask; title: string; date: string; time: string | null
    }) => {
      if (!task.client_id) throw new Error('Escolha o cliente da demanda antes de mandar para o planejamento.')
      const fmt = PLANNER_FORMAT[plannerFormatFor(task)]
      const files = task.deliveries ?? []
      const notes = [
        task.description,
        task.delivery_url ? 'Entrega por link: ' + task.delivery_url : null,
        task.collaborator_note ? 'Observação do colaborador: ' + task.collaborator_note : null,
      ].filter(Boolean).join('\n\n') || null

      const { data: post, error } = await (supabase as any)
        .from('planner')
        .insert({
          user_id:        agencyId!,
          client_id:      task.client_id,
          title:          title.trim(),
          content_type:   fmt.content_type,
          ig_post_type:   files.length > 0 ? fmt.ig_post_type : null,
          scheduled_date: date,
          scheduled_time: time || null,
          status:         'producao',
          notes,
          sent_to_client: false,
          approval_status: null,
        })
        .select('id')
        .single()
      if (error) throw error

      if (files.length > 0) {
        const { error: attErr } = await (supabase as any).from('planner_attachments').insert(
          files.map((f, i) => ({
            planner_id:  post.id,
            user_id:     agencyId!,
            file_name:   f.name || (f.type === 'video' ? 'video.mp4' : 'imagem.jpg'),
            file_type:   guessMime(f),
            file_url:    f.url,
            file_size:   f.size,
            is_ig_media: true,
            sort_order:  i,
          })),
        )
        if (attErr) {
          await (supabase as any).from('planner').delete().eq('id', post.id)
          throw attErr
        }
      }

      const { error: tErr } = await (supabase as any)
        .from('tasks')
        .update({ planner_id: post.id, status: 'concluido', agency_feedback: null, updated_at: new Date().toISOString() })
        .eq('id', task.id)
      if (tErr) throw tErr
      return post.id as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team_tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['planner'] })
    },
  })
}

function guessMime(f: TaskDelivery): string {
  const ext = (f.name || f.url).split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  if (f.type === 'video') return ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic') return 'image/heic'
  return 'image/jpeg'
}
