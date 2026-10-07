import { useState } from 'react'
import { Plus, Trash2, ChevronLeft, Loader2, Check, Pencil, Copy, Repeat } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
  useTaskTemplates, useSaveTemplate, useDeleteTemplate, getTemplateItems,
  type TaskTemplate,
} from '@/hooks/useTaskTemplates'

// Lista enxuta de squads (id + rótulo) para a ponte tarefa→squad (Fase 4)
const SQUAD_OPTIONS: { id: string; label: string }[] = [
  { id: 'fabrica-conteudo',        label: '🔥 Fábrica de Conteúdo' },
  { id: 'diagnostico-perfil',      label: '🔍 Diagnóstico de Perfil' },
  { id: 'maquina-clientes',        label: '💼 Máquina de Clientes' },
  { id: 'auditoria-marketing',     label: '📊 Auditoria de Marketing' },
  { id: 'psicologia-vendas',       label: '🧠 Psicologia de Vendas' },
  { id: 'inteligencia-competitiva',label: '🕵️ Inteligência Competitiva' },
  { id: 'identidade-marca',        label: '🎨 Identidade de Marca' },
  { id: 'trafego-pago',            label: '💰 Tráfego Pago' },
  { id: 'presenca-multiplataforma',label: '🌐 Presença Multiplataforma' },
  { id: 'mineracao-anuncios',      label: '⚡ Mineração de Anúncios' },
  { id: 'motor-conteudo-seo',      label: '🔎 Motor de Conteúdo SEO' },
  { id: 'comunidade-retencao',     label: '🌱 Comunidade e Retenção' },
  { id: 'design-criativo',         label: '🖌️ Design Criativo' },
]

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'custom',   label: 'Personalizado' },
  { value: 'trafego',  label: 'Tráfego Pago' },
  { value: 'social',   label: 'Social Media' },
  { value: 'completo', label: 'Completo' },
  { value: 'mensal',   label: 'Mensal' },
]

type Priority = 'baixa' | 'media' | 'alta' | 'urgente'
interface DraftItem {
  title:        string
  description:  string
  priority:     Priority
  tags:         string   // separado por vírgula
  offset:       string   // número como string; '' = sem prazo
  is_recurring: boolean
  squad_id:     string   // '' = nenhum
}
interface Draft {
  id?:         string
  name:        string
  description: string
  emoji:       string
  category:    string
  items:       DraftItem[]
}

const emptyItem = (): DraftItem => ({ title: '', description: '', priority: 'media', tags: '', offset: '', is_recurring: false, squad_id: '' })
const emptyDraft = (): Draft => ({ name: '', description: '', emoji: '📋', category: 'custom', items: [emptyItem()] })

interface Props { open: boolean; onClose: () => void }

export function TemplatesManagerModal({ open, onClose }: Props) {
  const { toast } = useToast()
  const { data: templates = [], isLoading } = useTaskTemplates()
  const save   = useSaveTemplate()
  const del    = useDeleteTemplate()

  const [draft, setDraft]         = useState<Draft | null>(null)   // null = tela de lista
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [confirmDel, setConfirmDel]   = useState<string | null>(null)

  async function openEditor(tpl: TaskTemplate, asCopy: boolean) {
    setLoadingEdit(true)
    try {
      const items = await getTemplateItems(tpl.id)
      setDraft({
        id: asCopy ? undefined : tpl.id,
        name: asCopy ? `${tpl.name} (cópia)` : tpl.name,
        description: tpl.description ?? '',
        emoji: tpl.emoji ?? '📋',
        category: asCopy ? 'custom' : tpl.category,
        items: items.map(it => ({
          title: it.title, description: it.description ?? '', priority: it.priority,
          tags: (it.tags ?? []).join(', '),
          offset: it.due_offset_days != null ? String(it.due_offset_days) : '',
          is_recurring: it.is_recurring, squad_id: it.squad_id ?? '',
        })),
      })
    } catch (e: any) { toast(e.message ?? 'Erro ao carregar modelo', 'error') }
    finally { setLoadingEdit(false) }
  }

  function setItem(idx: number, patch: Partial<DraftItem>) {
    setDraft(d => d && ({ ...d, items: d.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }))
  }

  async function handleSave() {
    if (!draft) return
    if (!draft.name.trim()) { toast('Dê um nome ao modelo', 'error'); return }
    const items = draft.items.filter(it => it.title.trim())
    if (items.length === 0) { toast('Adicione pelo menos uma tarefa', 'error'); return }
    try {
      await save.mutateAsync({
        id: draft.id, name: draft.name.trim(), description: draft.description.trim() || null,
        emoji: draft.emoji.trim() || '📋', category: draft.category,
        items: items.map(it => ({
          title: it.title.trim(), description: it.description.trim() || null, priority: it.priority,
          tags: it.tags.split(',').map(t => t.trim()).filter(Boolean),
          due_offset_days: it.is_recurring ? null : (it.offset.trim() === '' ? null : parseInt(it.offset, 10)),
          is_recurring: it.is_recurring, squad_id: it.squad_id || null,
        })),
      })
      toast('Modelo salvo!', 'success')
      setDraft(null)
    } catch (e: any) { toast(e.message ?? 'Erro ao salvar', 'error') }
  }

  async function handleDelete(id: string) {
    try { await del.mutateAsync(id); toast('Modelo excluído.', 'success'); setConfirmDel(null) }
    catch (e: any) { toast(e.message ?? 'Erro ao excluir', 'error') }
  }

  const lbl = 'block text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-1.5 text-[color:var(--sm-text-4)]'
  const campo = 'h-9 px-3 rounded-lg border text-[12.5px] placeholder:text-[color:var(--sm-text-4)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/50 disabled:opacity-40'
  const campoStyle = { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' } as const
  const iconBtn = 'w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors disabled:opacity-40'
  const meus = templates.filter(t => !t.is_system)
  const sistema = templates.filter(t => t.is_system)

  const linha = (t: TaskTemplate, i: number) => (
    <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
      <span className="text-[18px] w-6 text-center flex-shrink-0">{t.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{t.name}</p>
        <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-4)' }}>
          <span className="tabular-nums">{t.item_count} tarefas</span>{t.description && <> · {t.description}</>}
        </p>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0" style={{ color: 'var(--sm-text-3)' }}>
        <button onClick={() => openEditor(t, true)} title="Duplicar" aria-label="Duplicar" disabled={loadingEdit} className={iconBtn}>
          <Copy className="w-3.5 h-3.5" />
        </button>
        {!t.is_system && (
          <>
            <button onClick={() => openEditor(t, false)} title="Editar" aria-label="Editar" disabled={loadingEdit} className={iconBtn}>
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {confirmDel === t.id ? (
              <button onClick={() => handleDelete(t.id)} className="px-2 h-8 rounded-lg text-[11.5px] font-semibold hover:bg-red-500/10" style={{ color: '#EF4444' }}>Confirmar?</button>
            ) : (
              <button onClick={() => setConfirmDel(t.id)} title="Excluir" aria-label="Excluir" className={`${iconBtn} hover:text-red-500`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setDraft(null); onClose() } }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          {draft && (
            <button onClick={() => setDraft(null)} className="inline-flex items-center gap-1 text-[12.5px] font-medium mb-1 hover:underline w-fit" style={{ color: 'var(--sm-text-3)' }}>
              <ChevronLeft className="w-4 h-4" /> Modelos
            </button>
          )}
          <DialogTitle className="font-display text-[19px] font-bold">
            {draft ? (draft.id ? 'Editar modelo' : 'Novo modelo') : 'Modelos de tarefas'}
          </DialogTitle>
          {!draft && <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>Sequências prontas que viram tarefas com um clique.</p>}
        </DialogHeader>

        {/* ── LISTA ── */}
        {!draft && (
          <div className="space-y-5 mt-1">
            {isLoading ? (
              <div className="h-40 rounded-xl animate-pulse" style={{ background: 'var(--sm-bg-alt)' }} />
            ) : (
              <>
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <p className={lbl.replace('mb-1.5', 'mb-0')}>01 · Meus modelos · {meus.length}</p>
                    <button onClick={() => setDraft(emptyDraft())}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12.5px] font-semibold hover:bg-black/5" style={{ color: '#2563EB' }}>
                      <Plus className="w-3.5 h-3.5" /> Criar modelo
                    </button>
                  </div>
                  {meus.length === 0 ? (
                    <button onClick={() => setDraft(emptyDraft())}
                      className="w-full rounded-xl border border-dashed py-6 text-[12.5px] hover:border-[#2563EB]/50 transition-colors"
                      style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
                      Nenhum modelo seu ainda. Crie do zero ou duplique um do sistema.
                    </button>
                  ) : (
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sm-border)' }}>{meus.map(linha)}</div>
                  )}
                </section>
                {sistema.length > 0 && (
                  <section>
                    <p className={lbl}>02 · Modelos do sistema · {sistema.length}</p>
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sm-border)' }}>{sistema.map(linha)}</div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* ── EDITOR ── */}
        {draft && (
          <div className="space-y-4 mt-1">
            <div className="flex gap-2">
              <Input label="Emoji" value={draft.emoji} onChange={e => setDraft(d => d && ({ ...d, emoji: e.target.value }))} className="w-20 text-center" />
              <div className="flex-1">
                <Input label="Nome do modelo *" value={draft.name} onChange={e => setDraft(d => d && ({ ...d, name: e.target.value }))} placeholder="Ex: Onboarding de E-commerce" />
              </div>
            </div>
            <Input label="Descrição" value={draft.description} onChange={e => setDraft(d => d && ({ ...d, description: e.target.value }))} placeholder="Resumo do que o modelo cobre" />
            <div>
              <label className={lbl}>Categoria</label>
              <Select value={draft.category} onValueChange={v => setDraft(d => d && ({ ...d, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Tarefas do modelo */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className={lbl.replace('mb-1.5', 'mb-0')}>Tarefas · {draft.items.length}</p>
                <button onClick={() => setDraft(d => d && ({ ...d, items: [...d.items, emptyItem()] }))}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12.5px] font-semibold hover:bg-black/5" style={{ color: '#2563EB' }}>
                  <Plus className="w-3.5 h-3.5" /> Adicionar tarefa
                </button>
              </div>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sm-border)' }}>
                {draft.items.map((it, idx) => (
                  <div key={idx} className={`p-3.5 space-y-2 ${idx > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[13px] font-bold w-6 flex-shrink-0 tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{String(idx + 1).padStart(2, '0')}</span>
                      <input value={it.title} onChange={e => setItem(idx, { title: e.target.value })} placeholder="Título da tarefa"
                        className={`${campo} flex-1 text-[13px] font-medium`} style={campoStyle} />
                      <button onClick={() => setDraft(d => d && ({ ...d, items: d.items.filter((_, i) => i !== idx) }))}
                        title="Remover tarefa" aria-label="Remover tarefa"
                        className={`${iconBtn} hover:text-red-500 flex-shrink-0`} style={{ color: 'var(--sm-text-3)' }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="pl-8 space-y-2">
                      <input value={it.description} onChange={e => setItem(idx, { description: e.target.value })} placeholder="Descrição (opcional)"
                        className={`${campo} w-full`} style={campoStyle} />
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Select value={it.priority} onValueChange={v => setItem(idx, { priority: v as Priority })}>
                          <SelectTrigger className="h-9 text-[12.5px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="baixa">Baixa</SelectItem>
                            <SelectItem value="media">Média</SelectItem>
                            <SelectItem value="alta">Alta</SelectItem>
                            <SelectItem value="urgente">Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                        <input value={it.offset} onChange={e => setItem(idx, { offset: e.target.value.replace(/[^0-9]/g, '') })}
                          disabled={it.is_recurring} placeholder="Prazo (D+ dias)" className={campo} style={campoStyle} />
                        <input value={it.tags} onChange={e => setItem(idx, { tags: e.target.value })} placeholder="tags, separadas"
                          className={campo} style={campoStyle} />
                        <label className="flex items-center gap-1.5 text-[12px] cursor-pointer px-1" style={{ color: 'var(--sm-text-2)' }}>
                          <input type="checkbox" checked={it.is_recurring} onChange={e => setItem(idx, { is_recurring: e.target.checked })} className="accent-[#2563EB]" />
                          <Repeat className="w-3 h-3" style={{ color: 'var(--sm-text-4)' }} /> Recorrente
                        </label>
                      </div>
                      <Select value={it.squad_id || 'none'} onValueChange={v => setItem(idx, { squad_id: v === 'none' ? '' : v })}>
                        <SelectTrigger className="h-9 text-[12.5px]"><SelectValue placeholder="Squad (opcional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem squad vinculado</SelectItem>
                          {SQUAD_OPTIONS.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {draft ? (
            <>
              <Button variant="outline" onClick={() => setDraft(null)}>Voltar</Button>
              <Button onClick={handleSave} disabled={save.isPending}>
                {save.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : <><Check className="w-3.5 h-3.5" /> Salvar modelo</>}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
