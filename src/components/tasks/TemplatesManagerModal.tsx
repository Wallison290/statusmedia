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

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setDraft(null); onClose() } }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {draft && (
              <button onClick={() => setDraft(null)} className="text-[#94a3b8] hover:text-[color:var(--sm-text-1)]"><ChevronLeft className="w-4 h-4" /></button>
            )}
            {draft ? (draft.id ? 'Editar modelo' : 'Novo modelo') : 'Modelos de Tarefas'}
          </DialogTitle>
        </DialogHeader>

        {/* ── LISTA ── */}
        {!draft && (
          <div className="space-y-3 mt-1">
            <button
              onClick={() => setDraft(emptyDraft())}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[#334155] text-[13px] font-medium text-[#2563EB] hover:border-[#2563EB] hover:bg-[#182233] transition-all">
              <Plus className="w-4 h-4" /> Criar modelo
            </button>

            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#94a3b8]" /></div>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#1e293b] bg-[#111827]">
                    <span className="text-[18px]">{t.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-[#F8FAFC] truncate">{t.name}</p>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${t.is_system ? 'bg-[#182233] text-[#64748b]' : 'bg-[#2563EB]/10 text-[#2563EB]'}`}>
                          {t.is_system ? 'Sistema' : 'Meu'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#94a3b8] truncate">{t.item_count} tarefas · {t.description}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEditor(t, true)} title="Duplicar" disabled={loadingEdit}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[color:var(--sm-text-1)] hover:bg-[#1e293b] transition-colors">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {!t.is_system && (
                        <>
                          <button onClick={() => openEditor(t, false)} title="Editar" disabled={loadingEdit}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[color:var(--sm-text-1)] hover:bg-[#1e293b] transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {confirmDel === t.id ? (
                            <button onClick={() => handleDelete(t.id)} className="px-2 h-7 rounded-lg text-[11px] text-red-500 hover:bg-red-500/10 font-medium">Confirmar?</button>
                          ) : (
                            <button onClick={() => setConfirmDel(t.id)} title="Excluir"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-red-500 hover:bg-red-500/10 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
              <label className="block text-[12px] text-[#94a3b8] mb-1.5">Categoria</label>
              <Select value={draft.category} onValueChange={v => setDraft(d => d && ({ ...d, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Tarefas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">Tarefas ({draft.items.length})</label>
                <button onClick={() => setDraft(d => d && ({ ...d, items: [...d.items, emptyItem()] }))}
                  className="inline-flex items-center gap-1 text-[12px] text-[#2563EB] hover:text-[color:var(--sm-text-1)]"><Plus className="w-3.5 h-3.5" /> Adicionar tarefa</button>
              </div>
              <div className="space-y-2">
                {draft.items.map((it, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-[#1e293b] bg-[#0d1424] space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#64748b] w-5 flex-shrink-0">{idx + 1}.</span>
                      <input value={it.title} onChange={e => setItem(idx, { title: e.target.value })} placeholder="Título da tarefa"
                        className="flex-1 h-8 px-2.5 rounded-lg border border-[#1e293b] bg-[#182233] text-[13px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#2563EB]/40" />
                      <button onClick={() => setDraft(d => d && ({ ...d, items: d.items.filter((_, i) => i !== idx) }))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#64748b] hover:text-red-500 hover:bg-red-500/10 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <input value={it.description} onChange={e => setItem(idx, { description: e.target.value })} placeholder="Descrição (opcional)"
                      className="w-full h-8 px-2.5 rounded-lg border border-[#1e293b] bg-[#182233] text-[12px] text-[#CBD5E1] placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#2563EB]/40" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Select value={it.priority} onValueChange={v => setItem(idx, { priority: v as Priority })}>
                        <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="baixa">Baixa</SelectItem>
                          <SelectItem value="media">Média</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="urgente">Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                      <input value={it.offset} onChange={e => setItem(idx, { offset: e.target.value.replace(/[^0-9]/g, '') })}
                        disabled={it.is_recurring} placeholder="Dia (D+)"
                        className="h-8 px-2.5 rounded-lg border border-[#1e293b] bg-[#182233] text-[12px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#2563EB]/40 disabled:opacity-40" />
                      <input value={it.tags} onChange={e => setItem(idx, { tags: e.target.value })} placeholder="tags, separadas"
                        className="h-8 px-2.5 rounded-lg border border-[#1e293b] bg-[#182233] text-[12px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#2563EB]/40" />
                      <label className="flex items-center gap-1.5 text-[11px] text-[#94a3b8] cursor-pointer px-1">
                        <input type="checkbox" checked={it.is_recurring} onChange={e => setItem(idx, { is_recurring: e.target.checked })} className="accent-[#2563EB]" />
                        <Repeat className="w-3 h-3" /> Recorrente
                      </label>
                    </div>
                    <Select value={it.squad_id || 'none'} onValueChange={v => setItem(idx, { squad_id: v === 'none' ? '' : v })}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Squad (opcional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem squad vinculado</SelectItem>
                        {SQUAD_OPTIONS.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {draft ? (
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>Voltar</Button>
              <Button onClick={handleSave} disabled={save.isPending}>
                {save.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : <><Check className="w-3.5 h-3.5" /> Salvar modelo</>}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
