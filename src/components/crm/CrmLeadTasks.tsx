// ── Tarefas do lead ──────────────────────────────────────────────────────────
// Tarefas comuns do sistema, só que ligadas ao lead: aparecem em Tarefas, no
// portal do colaborador (se tiver responsável) e aqui. Criar e concluir entra
// no histórico sozinho.

import { useState } from 'react'
import { CheckCircle2, Circle, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import { useUpdateTask } from '@/hooks/useTasks'
import { useCrmLeadTasks, useCreateLeadTask } from '@/hooks/useCrmActivities'
import { todayISO, fmtShortDate } from '@/utils/crm'

const selectClass =
  'h-8 rounded-md border px-2 text-[12px] [color-scheme:dark] focus:outline-none'

export function CrmLeadTasks({ leadId, defaultAssignee }: { leadId: string; defaultAssignee: string | null }) {
  const { toast } = useToast()
  const { data: tasks = [], isLoading } = useCrmLeadTasks(leadId)
  const { data: members = [] } = useTeamMembers()
  const create = useCreateLeadTask()
  const update = useUpdateTask()

  const [title, setTitle]       = useState('')
  const [due, setDue]           = useState(todayISO(1))
  const [assignee, setAssignee] = useState(defaultAssignee ?? '')

  const active = members.filter(m => m.is_active)

  async function handleCreate() {
    const t = title.trim()
    if (!t) return
    const member = active.find(m => m.id === assignee)
    try {
      await create.mutateAsync({
        lead_id: leadId, title: t, due_date: due || null,
        assignee_id: member?.id ?? null, assignee: member?.name ?? null,
      })
      setTitle('')
    } catch (err: any) {
      toast(err.message ?? 'Não consegui criar a tarefa', 'error')
    }
  }

  const today = todayISO()

  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-2.5 space-y-2" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
          placeholder="Ex: Enviar proposta, ligar amanhã..."
          className="h-8 text-[12.5px]"
        />
        <div className="flex gap-2 flex-wrap">
          <Input type="date" value={due} onChange={e => setDue(e.target.value)} className="h-8 w-[140px] text-[12px]" />
          {active.length > 0 && (
            <select
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              className={selectClass}
              style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}
            >
              <option value="">Eu mesmo</option>
              {active.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <Button size="sm" className="ml-auto" onClick={handleCreate} disabled={!title.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Criar tarefa
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--sm-text-3)' }} /></div>
      ) : tasks.length === 0 ? (
        <p className="text-[11.5px] text-center py-6" style={{ color: 'var(--sm-text-4)' }}>
          Nenhuma tarefa para este lead.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map(t => {
            const done = t.status === 'concluido'
            const late = !done && t.due_date != null && t.due_date < today
            return (
              <li key={t.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5" style={{ background: 'var(--sm-bg-alt)' }}>
                <button
                  onClick={() => update.mutate({ id: t.id, status: done ? 'a_fazer' : 'concluido' })}
                  className="mt-0.5 flex-shrink-0"
                  aria-label={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
                >
                  {done
                    ? <CheckCircle2 className="w-4 h-4" style={{ color: '#22C55E' }} />
                    : <Circle className="w-4 h-4" style={{ color: 'var(--sm-text-4)' }} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-[12.5px] leading-snug ${done ? 'line-through opacity-60' : ''}`} style={{ color: 'var(--sm-text-1)' }}>
                    {t.title}
                  </p>
                  <p className="text-[10.5px]" style={{ color: late ? '#f87171' : 'var(--sm-text-4)' }}>
                    {t.due_date ? fmtShortDate(t.due_date) : 'Sem prazo'}
                    {t.assignee ? ` · ${t.assignee}` : ''}
                    {late ? ' · atrasada' : ''}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
