// ── CRM › Automações ─────────────────────────────────────────────────────────
// "Quando X acontecer com um lead, faça Y". Quem executa é o banco, na hora do
// evento (e uma vez por dia para "lead parado"). Aqui a agência monta as
// regras, liga/desliga e vê quantas vezes cada uma rodou e o último erro.

import { useMemo, useState } from 'react'
import { Plus, Zap, Loader2, Trash2, Pencil, AlertTriangle, Wand2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useCrmColumns } from '@/hooks/useCrm'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import {
  useCrmAutomations, useSaveCrmAutomation, useDeleteCrmAutomation, type CrmAutomationInput,
} from '@/hooks/useCrmAutomations'
import { CrmHeader } from '@/components/crm/CrmHeader'
import { CRM_TRIGGERS, CRM_ACTIONS, CRM_AUTOMATION_RECIPES } from '@/data/crmTemplates'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { CrmAutomation, CrmColumn } from '@/types'

const selectClass =
  'flex h-9 w-full rounded-md border px-3 text-[13px] [color-scheme:dark] focus:outline-none focus:border-[#2563EB]/50'
const selectStyle = { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }

const VARS_HINT = 'Use {nome}, {primeiro_nome}, {empresa} e {agencia}.'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--sm-text-3)' }}>
      {children}
    </label>
  )
}

/** Frase legível da regra: "Quando o lead entra em Proposta → Criar uma tarefa" */
function describe(a: CrmAutomation, columns: CrmColumn[]) {
  const t = CRM_TRIGGERS.find(x => x.id === a.trigger_type)
  const col = columns.find(c => c.id === a.trigger_column_id)?.name
  const when = a.trigger_type === 'lead_entrou_etapa'
    ? `O lead entra em "${col ?? 'qualquer etapa'}"`
    : a.trigger_type === 'lead_parado'
      ? `O lead fica ${a.trigger_days ?? 7} dias parado em "${col ?? 'qualquer etapa'}"`
      : t?.label ?? a.trigger_type
  const then = CRM_ACTIONS.find(x => x.id === a.action_type)?.label ?? a.action_type
  return { when, then }
}

const EMPTY: CrmAutomationInput = {
  name: '', is_active: true, trigger_type: 'lead_criado', trigger_column_id: null,
  trigger_days: null, action_type: 'criar_tarefa', action_params: {},
}

export function CrmAutomations() {
  const { toast } = useToast()
  const { data: automations = [], isLoading } = useCrmAutomations()
  const { data: columns = [] } = useCrmColumns()
  const { data: members = [] } = useTeamMembers()
  const save = useSaveCrmAutomation()
  const del  = useDeleteCrmAutomation()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft]         = useState<CrmAutomationInput | null>(null)

  const trigger = CRM_TRIGGERS.find(t => t.id === draft?.trigger_type)
  const p = draft?.action_params ?? {}
  const setParam = (k: string, v: unknown) => setDraft(d => d && ({ ...d, action_params: { ...d.action_params, [k]: v } }))

  const activeMembers = useMemo(() => members.filter(m => m.is_active), [members])

  function openNew(base?: Partial<CrmAutomationInput>) {
    setEditingId(null)
    setDraft({ ...EMPTY, ...base, action_params: { ...(base?.action_params ?? {}) } })
  }

  function openEdit(a: CrmAutomation) {
    setEditingId(a.id)
    setDraft({
      name: a.name, is_active: a.is_active, trigger_type: a.trigger_type,
      trigger_column_id: a.trigger_column_id, trigger_days: a.trigger_days,
      action_type: a.action_type, action_params: { ...a.action_params },
    })
  }

  async function handleSave() {
    if (!draft) return
    if (!draft.name.trim()) { toast('Dê um nome à automação', 'warning'); return }
    if (draft.action_type === 'mover_etapa' && !p.column_id) { toast('Escolha a etapa de destino', 'warning'); return }
    if (draft.action_type === 'criar_tarefa' && !String(p.title ?? '').trim()) { toast('Escreva o título da tarefa', 'warning'); return }
    if (draft.action_type === 'definir_temperatura' && !p.temperature) { toast('Escolha a temperatura', 'warning'); return }
    try {
      await save.mutateAsync({
        id: editingId ?? undefined,
        ...draft,
        name: draft.name.trim(),
        trigger_column_id: trigger?.column ? draft.trigger_column_id : null,
        trigger_days: trigger?.days ? (draft.trigger_days ?? 7) : null,
      })
      toast(editingId ? 'Automação atualizada' : 'Automação criada', 'success')
      setDraft(null)
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar', 'error')
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--sm-bg-page)' }}>
      <CrmHeader
        subtitle="Quando algo acontecer com um lead, o sistema faz o próximo passo"
        actions={<Button size="sm" onClick={() => openNew()}><Plus className="w-3.5 h-3.5" /> Nova automação</Button>}
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-6">
        {isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sm-text-3)' }} /></div>
        ) : (
          <>
            {automations.length > 0 && (
              <ul className="space-y-2">
                {automations.map(a => {
                  const d = describe(a, columns)
                  return (
                    <li key={a.id} className="rounded-xl border px-4 py-3 flex items-start gap-3"
                        style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)', opacity: a.is_active ? 1 : 0.6 }}>
                      <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: a.is_active ? '#818cf8' : 'var(--sm-text-4)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{a.name}</p>
                        <p className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
                          <span style={{ color: 'var(--sm-text-2)' }}>Quando:</span> {d.when} · <span style={{ color: 'var(--sm-text-2)' }}>Então:</span> {d.then}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--sm-text-4)' }}>
                          {a.run_count === 0 ? 'Ainda não rodou' : `Rodou ${a.run_count} ${a.run_count === 1 ? 'vez' : 'vezes'}`}
                          {a.last_run_at && ` · última ${formatDistanceToNow(parseISO(a.last_run_at), { addSuffix: true, locale: ptBR })}`}
                        </p>
                        {a.last_error && (
                          <p className="flex items-center gap-1 text-[11.5px] mt-1" style={{ color: '#f87171' }}>
                            <AlertTriangle className="w-3 h-3" /> Último erro: {a.last_error}
                          </p>
                        )}
                      </div>
                      <label className="flex items-center gap-1.5 text-[11.5px] cursor-pointer" style={{ color: 'var(--sm-text-3)' }}>
                        <input type="checkbox" checked={a.is_active}
                               onChange={e => save.mutate({ id: a.id, is_active: e.target.checked })} />
                        Ativa
                      </label>
                      <Button size="icon-sm" variant="ghost" onClick={() => openEdit(a)} aria-label="Editar"><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Excluir"
                              onClick={() => { if (window.confirm(`Excluir "${a.name}"?`)) del.mutate(a.id) }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Receitas prontas */}
            <section>
              <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--sm-text-3)' }}>
                <Wand2 className="w-3.5 h-3.5" /> {automations.length ? 'Mais ideias' : 'Comece por uma destas'}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CRM_AUTOMATION_RECIPES.filter(r => !automations.some(a => a.name === r.name)).map(r => {
                  const t = CRM_TRIGGERS.find(x => x.id === r.trigger_type)
                  const ac = CRM_ACTIONS.find(x => x.id === r.action_type)
                  return (
                    <button key={r.name}
                            onClick={() => openNew({ ...r, trigger_days: r.trigger_days ?? null })}
                            className="text-left rounded-xl border px-3.5 py-3 transition-colors hover:border-[#818cf8]/60"
                            style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{r.name}</p>
                      <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>{t?.label} → {ac?.label}</p>
                    </button>
                  )
                })}
              </div>
            </section>

            <p className="text-[11.5px] max-w-2xl" style={{ color: 'var(--sm-text-4)' }}>
              Por segurança, o sistema nunca manda mensagem automática para o lead pelo WhatsApp da plataforma.
              A ação "Me lembrar de mandar um WhatsApp" te entrega a mensagem pronta no seu WhatsApp, e você envia do seu número com um toque.
            </p>
          </>
        )}
      </div>

      {/* Editor */}
      <Dialog open={!!draft} onOpenChange={v => { if (!v) setDraft(null) }}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4" style={{ color: '#818cf8' }} />
              {editingId ? 'Editar automação' : 'Nova automação'}
            </DialogTitle>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Ex: Responder lead na hora" />
              </div>

              <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--sm-text-2)' }}>QUANDO</p>
                <select className={selectClass} style={selectStyle} value={draft.trigger_type}
                        onChange={e => setDraft({ ...draft, trigger_type: e.target.value as CrmAutomationInput['trigger_type'] })}>
                  {CRM_TRIGGERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {trigger && <p className="text-[11px] -mt-1.5" style={{ color: 'var(--sm-text-4)' }}>{trigger.hint}</p>}
                {trigger?.column && (
                  <select className={selectClass} style={selectStyle} value={draft.trigger_column_id ?? ''}
                          onChange={e => setDraft({ ...draft, trigger_column_id: e.target.value || null })}>
                    <option value="">Qualquer etapa</option>
                    {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {trigger?.days && (
                  <div className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--sm-text-2)' }}>
                    Parado há
                    <Input type="number" min={1} max={365} className="w-20 h-8"
                           value={draft.trigger_days ?? 7}
                           onChange={e => setDraft({ ...draft, trigger_days: Number(e.target.value) || 1 })} />
                    dias ou mais
                  </div>
                )}
              </div>

              <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--sm-text-2)' }}>ENTÃO</p>
                <select className={selectClass} style={selectStyle} value={draft.action_type}
                        onChange={e => setDraft({ ...draft, action_type: e.target.value as CrmAutomationInput['action_type'], action_params: {} })}>
                  {CRM_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
                <p className="text-[11px] -mt-1.5" style={{ color: 'var(--sm-text-4)' }}>
                  {CRM_ACTIONS.find(a => a.id === draft.action_type)?.hint}
                </p>

                {draft.action_type === 'criar_tarefa' && (
                  <>
                    <Input value={p.title ?? ''} onChange={e => setParam('title', e.target.value)} placeholder="Título: Ligar para {nome}" />
                    <Textarea rows={2} value={p.description ?? ''} onChange={e => setParam('description', e.target.value)} placeholder="Descrição (opcional)" />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label>Prazo (dias)</Label>
                        <Input type="number" min={0} value={p.due_in_days ?? 0} onChange={e => setParam('due_in_days', Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>Prioridade</Label>
                        <select className={selectClass} style={selectStyle} value={p.priority ?? 'media'} onChange={e => setParam('priority', e.target.value)}>
                          <option value="baixa">Baixa</option><option value="media">Média</option>
                          <option value="alta">Alta</option><option value="urgente">Urgente</option>
                        </select>
                      </div>
                      <div>
                        <Label>Responsável</Label>
                        <select className={selectClass} style={selectStyle} value={p.assignee_id ?? ''} onChange={e => setParam('assignee_id', e.target.value || null)}>
                          <option value="">Eu</option>
                          {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>{VARS_HINT}</p>
                  </>
                )}

                {(draft.action_type === 'lembrete_whatsapp' || draft.action_type === 'notificar') && (
                  <>
                    <Textarea rows={4} value={p.message ?? ''} onChange={e => setParam('message', e.target.value)}
                              placeholder={draft.action_type === 'lembrete_whatsapp'
                                ? 'Oi {primeiro_nome}! Aqui é da {agencia}...'
                                : 'Ex: {nome} está esperando retorno'} />
                    <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>{VARS_HINT}</p>
                  </>
                )}

                {draft.action_type === 'mover_etapa' && (
                  <select className={selectClass} style={selectStyle} value={p.column_id ?? ''} onChange={e => setParam('column_id', e.target.value)}>
                    <option value="">Escolha a etapa</option>
                    {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}

                {draft.action_type === 'agendar_contato' && (
                  <div className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--sm-text-2)' }}>
                    Próximo contato daqui a
                    <Input type="number" min={0} className="w-20 h-8" value={p.days ?? 1} onChange={e => setParam('days', Number(e.target.value))} />
                    dia(s)
                  </div>
                )}

                {draft.action_type === 'definir_temperatura' && (
                  <select className={selectClass} style={selectStyle} value={p.temperature ?? ''} onChange={e => setParam('temperature', e.target.value)}>
                    <option value="">Escolha</option>
                    <option value="frio">Frio</option><option value="morno">Morno</option><option value="quente">Quente</option>
                  </select>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
                <Button onClick={handleSave} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
