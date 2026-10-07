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

const PRIORITY_COLOR: Record<string, string> = { baixa: '#94A3B8', media: '#2563EB', alta: '#F97316', urgente: '#EF4444' }
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

  const lbl = 'block text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-1.5 text-[color:var(--sm-text-4)]'
  const opcao = (ativo: boolean) => ativo
    ? { borderColor: '#2563EB', background: 'rgba(37,99,235,0.06)', boxShadow: 'inset 0 0 0 1px #2563EB' }
    : { borderColor: 'var(--sm-border)', background: 'var(--sm-bg-card)' }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="font-display text-[19px] font-bold">Criar tarefas a partir de um modelo</DialogTitle>
          <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>Escolha o modelo, como as tarefas serão criadas e a data de início.</p>
        </DialogHeader>

        <div className="space-y-5 mt-1">
          {/* 01 · Modelo */}
          <section>
            <p className={lbl}>01 · Modelo</p>
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[0, 1, 2, 3].map(i => <div key={i} className="h-[76px] rounded-xl animate-pulse" style={{ background: 'var(--sm-bg-alt)' }} />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Modelos">
                {templates.map(t => {
                  const ativo = selectedId === t.id
                  return (
                    <button key={t.id} role="radio" aria-checked={ativo} onClick={() => setSelectedId(t.id)}
                      className="relative text-left p-3 rounded-xl border transition-colors hover:border-[#2563EB]/50"
                      style={opcao(ativo)}>
                      <span className="flex items-center gap-2">
                        <span className="text-[16px]">{t.emoji}</span>
                        <span className="text-[13px] font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--sm-text-1)' }}>{t.name}</span>
                        {ativo && <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#2563EB' }} />}
                      </span>
                      {t.description && <span className="block text-[11.5px] mt-1 line-clamp-2" style={{ color: 'var(--sm-text-3)' }}>{t.description}</span>}
                      <span className="block text-[11px] mt-1.5 tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{t.item_count} tarefas</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {selected && (
            <>
              {/* 02 · Como criar */}
              <section>
                <p className={lbl}>02 · Como criar</p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Como criar">
                  {([
                    { v: 'separate', Icon: ListTodo, t: 'Tarefas separadas', d: 'Uma tarefa por etapa, com prazo' },
                    { v: 'checklist', Icon: ListChecks, t: '1 tarefa com checklist', d: 'Os passos viram itens' },
                  ] as const).map(o => (
                    <button key={o.v} role="radio" aria-checked={mode === o.v} onClick={() => setMode(o.v)}
                      className="flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors hover:border-[#2563EB]/50"
                      style={opcao(mode === o.v)}>
                      <o.Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: mode === o.v ? '#2563EB' : 'var(--sm-text-4)' }} />
                      <span>
                        <span className="block text-[12.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{o.t}</span>
                        <span className="block text-[11px]" style={{ color: 'var(--sm-text-3)' }}>{o.d}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* 03 · Responsável e início */}
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>03 · Responsável</label>
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
                    <label className={lbl}>Data de início</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 [color-scheme:light_dark]"
                      style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
                    />
                  </div>
                )}
              </section>

              {/* Prévia */}
              <section>
                <p className={lbl}>Prévia · {items.length} {items.length === 1 ? 'tarefa' : 'tarefas'}</p>
                <div className="max-h-56 overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--sm-border)' }}>
                  {items.map((it, i) => (
                    <div key={it.id} className={`flex items-center gap-3 px-3.5 py-2 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                      <span className="text-[11px] font-semibold w-9 flex-shrink-0 tabular-nums" style={{ color: 'var(--sm-text-4)' }}>
                        {it.is_recurring ? '↻' : it.due_offset_days != null ? `D+${it.due_offset_days}` : '—'}
                      </span>
                      <span className="text-[12.5px] flex-1 min-w-0 truncate" style={{ color: 'var(--sm-text-1)' }}>{it.title}</span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] flex-shrink-0" style={{ color: 'var(--sm-text-3)' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIORITY_COLOR[it.priority] ?? '#94A3B8' }} />
                        {PRIORITY_LABEL[it.priority]}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--sm-text-4)' }}>Prazos em dias úteis. Tarefas recorrentes (↻) nascem sem prazo.</p>
              </section>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancelar</Button>
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
