import { useState, useMemo, useEffect } from 'react'
import { format } from 'date-fns'
import { Loader2, Check, Repeat, ListChecks, ListTodo } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import {
  useTaskTemplates, useTaskTemplateItems, useApplyTaskTemplate,
} from '@/hooks/useTaskTemplates'
import { cn } from '@/utils/formatters'

const PRIORITY_LABEL: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' }

interface Props {
  clientId:        string | null
  open:            boolean
  onClose:         () => void
  onApplied?:      (count: number) => void
  initialCategory?: string | null   // pré-seleciona o modelo do sistema dessa categoria
}

export function ApplyTemplateModal({ clientId, open, onClose, onApplied, initialCategory }: Props) {
  const { toast } = useToast()
  const { data: templates = [], isLoading } = useTaskTemplates()
  const { data: members = [] }              = useTeamMembers()
  const activeMembers                       = members.filter(m => m.is_active)
  const apply                               = useApplyTaskTemplate()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode]             = useState<'separate' | 'checklist'>('separate')
  const [assigneeId, setAssigneeId] = useState<string>('none')
  const [startDate, setStartDate]   = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data: items = [] } = useTaskTemplateItems(selectedId)
  const selected = useMemo(() => templates.find(t => t.id === selectedId) ?? null, [templates, selectedId])

  // Pré-seleciona o modelo do sistema da categoria informada (ex: vindo do cadastro)
  useEffect(() => {
    if (open && initialCategory && selectedId === null) {
      const match = templates.find(t => t.is_system && t.category === initialCategory)
      if (match) setSelectedId(match.id)
    }
  }, [open, initialCategory, templates, selectedId])

  function reset() {
    setSelectedId(null); setMode('separate'); setAssigneeId('none')
    setStartDate(format(new Date(), 'yyyy-MM-dd'))
  }

  async function handleApply() {
    if (!selected) return
    const member = activeMembers.find(m => m.id === assigneeId)
    try {
      const count = await apply.mutateAsync({
        templateId:   selected.id,
        templateName: selected.name,
        clientId,
        assignee:     member?.name ?? null,
        assigneeId:   member?.id ?? null,
        startDate,
        mode,
      })
      toast(`${count} ${count === 1 ? 'tarefa criada' : 'tarefas criadas'} no kanban!`, 'success')
      onApplied?.(count)
      reset()
      onClose()
    } catch (err: any) {
      toast(err.message ?? 'Erro ao aplicar o modelo', 'error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Criar tarefas a partir de um modelo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Lista de modelos */}
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#94a3b8]" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    'text-left p-3 rounded-xl border transition-all',
                    selectedId === t.id
                      ? 'border-[#2563EB] bg-[#182233]'
                      : 'border-[#1e293b] bg-[#111827] hover:border-[#2563EB]/50',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[15px]">{t.emoji}</span>
                    <span className="text-[13px] font-semibold text-[#F8FAFC]">{t.name}</span>
                  </div>
                  <p className="text-[11px] text-[#94a3b8] line-clamp-2">{t.description}</p>
                  <p className="text-[10px] text-[#64748b] mt-1.5">{t.item_count} tarefas</p>
                </button>
              ))}
            </div>
          )}

          {/* Configuração (após selecionar) */}
          {selected && (
            <div className="space-y-4 border-t border-[#1e293b] pt-4">
              {/* Modo */}
              <div>
                <label className="block text-[11px] font-medium text-[#94a3b8] uppercase tracking-wide mb-1.5">Como criar</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMode('separate')}
                    className={cn('flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all',
                      mode === 'separate' ? 'border-[#2563EB] bg-[#182233]' : 'border-[#1e293b] bg-[#111827] hover:border-[#2563EB]/50')}
                  >
                    <ListTodo className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
                    <div>
                      <p className="text-[12px] font-medium text-[#E2E8F0]">Tarefas separadas</p>
                      <p className="text-[10px] text-[#64748b]">Uma tarefa por etapa, com prazo</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setMode('checklist')}
                    className={cn('flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all',
                      mode === 'checklist' ? 'border-[#2563EB] bg-[#182233]' : 'border-[#1e293b] bg-[#111827] hover:border-[#2563EB]/50')}
                  >
                    <ListChecks className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
                    <div>
                      <p className="text-[12px] font-medium text-[#E2E8F0]">1 tarefa com checklist</p>
                      <p className="text-[10px] text-[#64748b]">Os passos viram itens</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Responsável + data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#94a3b8] uppercase tracking-wide mb-1.5">Responsável</label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger><SelectValue placeholder="Agência" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Agência</SelectItem>
                      {activeMembers.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {mode === 'separate' && (
                  <div>
                    <label className="block text-[11px] font-medium text-[#94a3b8] uppercase tracking-wide mb-1.5">Data de início</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[#1e293b] bg-[#182233] text-[13px] text-[#E2E8F0] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 [color-scheme:dark]"
                    />
                  </div>
                )}
              </div>

              {/* Prévia das tarefas */}
              <div>
                <label className="block text-[11px] font-medium text-[#94a3b8] uppercase tracking-wide mb-1.5">
                  Prévia ({items.length} {items.length === 1 ? 'tarefa' : 'tarefas'})
                </label>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-[#1e293b] bg-[#0d1424] divide-y divide-[#1e293b]">
                  {items.map(it => (
                    <div key={it.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-[10px] text-[#64748b] w-8 flex-shrink-0">
                        {it.is_recurring ? '↻' : it.due_offset_days != null ? `D+${it.due_offset_days}` : '—'}
                      </span>
                      <span className="text-[12px] text-[#CBD5E1] flex-1 min-w-0 truncate">{it.title}</span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#182233] text-[#2563EB] flex-shrink-0">
                        {PRIORITY_LABEL[it.priority]}
                      </span>
                      {it.is_recurring && <Repeat className="w-3 h-3 text-[#64748b] flex-shrink-0" />}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[#64748b] mt-1.5">Prazos em dias úteis. Tarefas recorrentes (↻) nascem sem prazo.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button onClick={handleApply} disabled={!selected || apply.isPending}>
            {apply.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Criando...</>
              : <><Check className="w-3.5 h-3.5" /> {selected ? `Criar ${mode === 'checklist' ? '1 tarefa' : `${items.length} tarefas`}` : 'Criar tarefas'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
