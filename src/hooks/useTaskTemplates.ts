import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { offsetToDate } from '@/utils/businessDays'

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface TaskTemplate {
  id:          string
  user_id:     string | null
  name:        string
  description: string | null
  category:    string
  emoji:       string | null
  is_system:   boolean
  item_count?: number
}

export interface TaskTemplateItem {
  id:              string
  template_id:     string
  position:        number
  title:           string
  description:     string | null
  priority:        'baixa' | 'media' | 'alta' | 'urgente'
  tags:            string[]
  due_offset_days: number | null
  is_recurring:    boolean
  squad_id:        string | null
}

// ── Leitura ─────────────────────────────────────────────────────────────────────
export function useTaskTemplates() {
  return useQuery<TaskTemplate[]>({
    queryKey: ['task_templates'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('task_templates')
        .select('*, task_template_items(count)')
        .order('is_system', { ascending: false })
        .order('name')
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((t: any) => ({ ...t, item_count: t.task_template_items?.[0]?.count ?? 0 }))
    },
  })
}

export function useTaskTemplateItems(templateId: string | null) {
  return useQuery<TaskTemplateItem[]>({
    queryKey: ['task_template_items', templateId],
    enabled:  !!templateId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('task_template_items')
        .select('*')
        .eq('template_id', templateId)
        .order('position')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Busca avulsa dos itens de um modelo (para editar/duplicar). */
export async function getTemplateItems(templateId: string): Promise<TaskTemplateItem[]> {
  const { data, error } = await (supabase as any)
    .from('task_template_items')
    .select('*')
    .eq('template_id', templateId)
    .order('position')
  if (error) throw error
  return data ?? []
}

// ── Criar / editar / excluir modelos do usuário ─────────────────────────────────
export interface SaveTemplateItem {
  title:           string
  description:     string | null
  priority:        'baixa' | 'media' | 'alta' | 'urgente'
  tags:            string[]
  due_offset_days: number | null
  is_recurring:    boolean
  squad_id:        string | null
}
export interface SaveTemplateInput {
  id?:         string
  name:        string
  description: string | null
  emoji:       string | null
  category:    string
  items:       SaveTemplateItem[]
}

export function useSaveTemplate() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()
  return useMutation({
    mutationFn: async (input: SaveTemplateInput): Promise<string> => {
      if (!user) throw new Error('Não autenticado')
      let templateId = input.id

      if (templateId) {
        const { error } = await (supabase as any).from('task_templates')
          .update({ name: input.name, description: input.description, emoji: input.emoji, category: input.category })
          .eq('id', templateId)
        if (error) throw error
        await (supabase as any).from('task_template_items').delete().eq('template_id', templateId)
      } else {
        const { data, error } = await (supabase as any).from('task_templates')
          .insert({ user_id: agencyId!, name: input.name, description: input.description, emoji: input.emoji, category: input.category, is_system: false })
          .select().single()
        if (error) throw error
        templateId = data.id
      }

      if (input.items.length > 0) {
        const rows = input.items.map((it, i) => ({
          template_id: templateId, position: i + 1,
          title: it.title, description: it.description, priority: it.priority,
          tags: it.tags, due_offset_days: it.due_offset_days, is_recurring: it.is_recurring, squad_id: it.squad_id,
        }))
        const { error } = await (supabase as any).from('task_template_items').insert(rows)
        if (error) throw error
      }
      return templateId!
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task_templates'] })
      qc.invalidateQueries({ queryKey: ['task_template_items'] })
    },
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('task_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task_templates'] }),
  })
}

// ── Aplicação (cria as tarefas no kanban) ───────────────────────────────────────
export interface ApplyTemplateInput {
  templateId:   string
  templateName: string
  clientId:     string | null
  assignee:     string | null
  assigneeId:   string | null
  startDate:    string              // yyyy-MM-dd
  mode:         'separate' | 'checklist'
}

export function useApplyTaskTemplate() {
  const qc = useQueryClient()
  const { user, agencyId } = useAuth()

  return useMutation({
    mutationFn: async (input: ApplyTemplateInput): Promise<number> => {
      if (!user) throw new Error('Não autenticado')

      const { data: items, error } = await (supabase as any)
        .from('task_template_items')
        .select('*')
        .eq('template_id', input.templateId)
        .order('position')
      if (error) throw error
      const list = (items ?? []) as TaskTemplateItem[]
      if (list.length === 0) throw new Error('Modelo sem tarefas')

      // Modo: 1 tarefa com checklist (itens viram checklist em markdown na descrição)
      if (input.mode === 'checklist') {
        const checklist = list.map(it => `- [ ] ${it.title}`).join('\n')
        const { error: e2 } = await (supabase as any).from('tasks').insert({
          user_id: agencyId!, client_id: input.clientId,
          title: input.templateName, description: checklist,
          due_date: null, due_time: null,
          priority: 'media', status: 'a_fazer',
          assignee: input.assignee, assignee_id: input.assigneeId, tags: [],
        })
        if (e2) throw e2
        return 1
      }

      // Modo: tarefas separadas (uma por item, com prazo em dias úteis)
      // Horário inteligente: por dia, distribui a partir das 08:00 de 2 em 2 horas
      // (1ª tarefa 08:00, 2ª 10:00, 3ª 12:00...). Recorrentes/sem data ficam sem hora.
      const perDay: Record<string, number> = {}
      const rows = list.map(it => {
        const due_date = it.is_recurring ? null : offsetToDate(input.startDate, it.due_offset_days)
        let due_time: string | null = null
        if (due_date) {
          const idx = perDay[due_date] ?? 0
          perDay[due_date] = idx + 1
          const hour = Math.min(8 + idx * 2, 22)   // limita a 22:00 se houver muitas no dia
          due_time = `${String(hour).padStart(2, '0')}:00`
        }
        return {
          user_id:     agencyId!,
          client_id:   input.clientId,
          title:       it.title,
          description: it.description,
          due_date,
          due_time,
          priority:    it.priority,
          status:      'a_fazer',
          assignee:    input.assignee,
          assignee_id: input.assigneeId,
          tags:        it.tags ?? [],
        }
      })
      const { error: e3 } = await (supabase as any).from('tasks').insert(rows)
      if (e3) throw e3
      return rows.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['team_tasks'] })
    },
  })
}
