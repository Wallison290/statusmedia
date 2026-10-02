// ── Ficha do lead ────────────────────────────────────────────────────────────
// Cadastro à esquerda; à direita, o que aconteceu e o que falta fazer:
// histórico, tarefas e documentos (propostas e contratos). Lead novo mostra só
// o cadastro: ainda não há histórico para contar.

import { useState, useEffect } from 'react'
import {
  Trash2, Loader2, UserPlus, MessageCircle, Mail, Instagram, Building2,
  CalendarClock, Wallet, Receipt, Flame, Tag, StickyNote, ArrowRightLeft, Archive, ArchiveRestore,
  History, CheckSquare, FileText, XCircle, MessagesSquare,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import {
  useCreateCrmLead, useUpdateCrmLead, useDeleteCrmLead, type CrmLeadInput,
} from '@/hooks/useCrm'
import { useArchiveCrmLead } from '@/hooks/useCrmActivities'
import { CRM_SOURCES } from '@/data/crmTemplates'
import { todayISO, netValue } from '@/utils/crm'
import { LostReasonField } from './CrmLostReason'
import { CrmLeadTimeline } from './CrmLeadTimeline'
import { CrmLeadTasks } from './CrmLeadTasks'
import { CrmLeadDocs } from './CrmLeadDocs'
import { CrmWhatsappActions } from './CrmWhatsappActions'
import { useHideValues, useMoney } from '@/hooks/useHideValues'
import { CrmLeadConversation, CrmLeadFollowup } from './CrmLeadConversation'
import type { CrmColumn, CrmLead, CrmTemperature } from '@/types'

interface Props {
  open:        boolean
  onClose:     () => void
  lead:        CrmLead | null      // null = criando
  columns:     CrmColumn[]
  columnId:    string              // coluna de destino ao criar
  onConvert?:  (lead: CrmLead) => void
}

const TEMPERATURES: { value: CrmTemperature; label: string; color: string }[] = [
  { value: 'frio',   label: 'Frio',   color: '#4F8EF7' },
  { value: 'morno',  label: 'Morno',  color: '#F5A623' },
  { value: 'quente', label: 'Quente', color: '#ef4444' },
]

// Atalhos do "próximo contato": é a data que alimenta o lembrete diário
const QUICK_DATES: { label: string; days: number }[] = [
  { label: 'Hoje',     days: 0 },
  { label: 'Amanhã',   days: 1 },
  { label: '3 dias',   days: 3 },
  { label: '1 semana', days: 7 },
]

type Panel = 'conversa' | 'historico' | 'tarefas' | 'documentos'

/** "Sexta-feira, daqui a 3 dias" / "Atrasado há 2 dias": a data dita em palavras. */
function nextContactHint(iso: string): { text: string; late: boolean } {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  const weekday = target.toLocaleDateString('pt-BR', { weekday: 'long' })
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  if (diff === 0) return { text: `Hoje, ${weekday}`, late: false }
  if (diff === 1) return { text: `Amanhã, ${weekday}`, late: false }
  if (diff < 0)   return { text: `Atrasado há ${-diff} dia${diff === -1 ? '' : 's'}`, late: true }
  return { text: `${cap}, daqui a ${diff} dias`, late: false }
}

// Campo com rótulo em caixa alta, o mesmo padrão dos outros modais do sistema
function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--sm-text-3)' }}>
        {icon}{label}
      </label>
      {children}
    </div>
  )
}

/** Campo de dinheiro. Olho do CRM fechado: vira pontinhos, mas continua editável. */
function MoneyInput({ value, onChange, hidden }: { value: number | null | undefined; onChange: (v: number | null) => void; hidden: boolean }) {
  return (
    <Input
      type={hidden ? 'password' : 'number'}
      inputMode="decimal"
      min={0}
      step="0.01"
      value={value ?? ''}
      onChange={e => {
        // Em modo escondido o campo é texto: vírgula vira ponto e letra é ignorada
        const v = e.target.value.replace(',', '.')
        if (v === '') onChange(null)
        else if (Number.isFinite(Number(v))) onChange(Number(v))
      }}
      placeholder="0,00"
    />
  )
}

const selectClass =
  'flex h-9 w-full min-w-0 max-w-full rounded-md border border-[#1e293b] bg-[#182233] px-3 text-[13px] text-[#E2E8F0] ' +
  'focus:outline-none focus:ring-1 focus:ring-[#2563EB]/30 focus:border-[#2563EB]/50 [color-scheme:dark]'

export function CrmLeadModal({ open, onClose, lead, columns, columnId, onConvert }: Props) {
  const { toast } = useToast()
  const { data: members = [] } = useTeamMembers()
  const hideValues = useHideValues()
  const money = useMoney()
  const activeMembers = members.filter(m => m.is_active)

  const createLead = useCreateCrmLead()
  const updateLead = useUpdateCrmLead()
  const deleteLead = useDeleteCrmLead()
  const archive    = useArchiveCrmLead()
  const saving = createLead.isPending || updateLead.isPending

  const [form, setForm] = useState<CrmLeadInput>({ name: '', column_id: columnId })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [panel, setPanel] = useState<Panel>('conversa')
  // Mandou mensagem pelo CRM com o lead na primeira etapa: o contato foi feito,
  // então ao salvar ou fechar ele passa para a etapa seguinte do funil.
  const [sentFromCrm, setSentFromCrm] = useState(false)

  // Recarrega o formulário sempre que o modal abre — abrir outro lead não pode
  // herdar o que estava digitado no anterior.
  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    setPanel('conversa')
    setSentFromCrm(false)
    setForm(lead
      ? {
          name:                lead.name,
          column_id:           lead.column_id,
          company:             lead.company,
          whatsapp:            lead.whatsapp,
          email:               lead.email,
          instagram:           lead.instagram,
          source:              lead.source,
          estimated_value:     lead.estimated_value,
          estimated_cost:      lead.estimated_cost ?? null,
          temperature:         lead.temperature ?? 'morno',
          responsible_user_id: lead.responsible_user_id,
          next_contact_at:     lead.next_contact_at,
          notes:               lead.notes,
          lost_reason:         lead.lost_reason,
        }
      : { name: '', column_id: columnId, temperature: 'morno' })
    // Só na abertura: recarregar quando `lead` muda (refetch após salvar uma
    // nota no histórico) apagaria o que a pessoa está digitando no cadastro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id, columnId])

  function set<K extends keyof CrmLeadInput>(key: K, value: CrmLeadInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const currentColumn = columns.find(c => c.id === form.column_id)

  const ordered     = [...columns].sort((a, b) => a.position - b.position)
  const firstColumn = ordered[0]
  const contactColumn = ordered[1]?.stage_type === 'normal' ? ordered[1] : undefined

  /** Etapa de destino quando houve envio pelo CRM com o lead na primeira etapa. */
  function advancedColumn(columnId: string) {
    return sentFromCrm && contactColumn && columnId === firstColumn?.id ? contactColumn : null
  }

  // Fechar sem salvar (X, Cancelar, fora do card): só a etapa muda, o resto do
  // formulário continua descartado como sempre
  function handleClose() {
    const to = lead && !lead.archived_at ? advancedColumn(lead.column_id) : null
    if (lead && to) {
      updateLead.mutate({ id: lead.id, column_id: to.id }, {
        onSuccess: () => toast(`${lead.name} foi para "${to.name}"`, 'success'),
        onError:   (e: any) => toast(e.message ?? 'Não consegui mudar a etapa', 'error'),
      })
    }
    onClose()
  }
  const isWonColumn   = currentColumn?.stage_type === 'ganho'
  const isLostColumn  = currentColumn?.stage_type === 'perdido'

  async function handleSave() {
    const name = (form.name ?? '').trim()
    if (!name) { toast('Dê um nome ao lead', 'warning'); return }

    const moved = advancedColumn(form.column_id)

    // Campos de texto vazios viram null para não poluir o card com string vazia
    const payload = {
      ...form,
      column_id: moved?.id ?? form.column_id,
      name,
      company:   form.company?.trim()   || null,
      whatsapp:  form.whatsapp?.trim()  || null,
      email:     form.email?.trim()     || null,
      instagram: form.instagram?.trim() || null,
      source:    form.source?.trim()    || null,
      notes:     form.notes?.trim()     || null,
      next_contact_at: form.next_contact_at || null,
      responsible_user_id: form.responsible_user_id || null,
      estimated_value: form.estimated_value ?? null,
      estimated_cost:  form.estimated_cost ?? null,
      lost_reason: isLostColumn ? (form.lost_reason?.trim() || null) : null,
    }

    try {
      if (lead) {
        await updateLead.mutateAsync({ id: lead.id, ...payload })
        toast(moved ? `Lead atualizado e movido para "${moved.name}"` : 'Lead atualizado', 'success')
      } else {
        await createLead.mutateAsync(payload as CrmLeadInput)
        toast('Lead cadastrado', 'success')
      }
      onClose()
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar o lead', 'error')
    }
  }

  async function handleDelete() {
    if (!lead) return
    try {
      await deleteLead.mutateAsync(lead.id)
      toast('Lead excluído', 'success')
      onClose()
    } catch (err: any) {
      toast(err.message ?? 'Erro ao excluir', 'error')
    }
  }

  async function handleArchive() {
    if (!lead) return
    const archived = !lead.archived_at
    try {
      await archive.mutateAsync({ id: lead.id, archived })
      toast(archived ? 'Lead arquivado. Ele continua contando nos relatórios.' : 'Lead de volta ao funil', 'success')
      onClose()
    } catch (err: any) {
      toast(err.message ?? 'Erro ao arquivar', 'error')
    }
  }

  const formBody = (
    <div className="space-y-4">
      {/* Identificação */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nome do contato">
          <Input
            autoFocus={!lead}
            value={form.name ?? ''}
            onChange={e => set('name', e.target.value)}
            placeholder="Ex: Marina Souza"
          />
        </Field>
        <Field label="Empresa" icon={<Building2 className="w-3 h-3" />}>
          <Input
            value={form.company ?? ''}
            onChange={e => set('company', e.target.value)}
            placeholder="Ex: Clínica Vida"
          />
        </Field>
      </div>

      {/* Contato */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="WhatsApp" icon={<MessageCircle className="w-3 h-3" />}>
          <Input
            value={form.whatsapp ?? ''}
            onChange={e => set('whatsapp', e.target.value)}
            placeholder="(87) 90000-0000"
          />
        </Field>
        <Field label="E-mail" icon={<Mail className="w-3 h-3" />}>
          <Input
            type="email"
            value={form.email ?? ''}
            onChange={e => set('email', e.target.value)}
            placeholder="contato@empresa.com"
          />
        </Field>
        <Field label="Instagram" icon={<Instagram className="w-3 h-3" />}>
          <Input
            value={form.instagram ?? ''}
            onChange={e => set('instagram', e.target.value)}
            placeholder="@perfil"
          />
        </Field>
      </div>

      {/* Negócio: origem, valor bruto e custos. O líquido é calculado embaixo. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="col-span-2 sm:col-span-1">
        <Field label="Origem" icon={<Tag className="w-3 h-3" />}>
          {/* Select nativo: o <datalist> não abre lista nenhuma no celular.
              Origem digitada à mão em leads antigos continua aparecendo. */}
          <select
            className={selectClass}
            value={form.source ?? ''}
            onChange={e => set('source', e.target.value || null)}
          >
            <option value="">De onde veio?</option>
            {CRM_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            {form.source && !CRM_SOURCES.includes(form.source) && (
              <option value={form.source}>{form.source}</option>
            )}
          </select>
        </Field>
        </div>
        <Field label="Valor (bruto)" icon={<Wallet className="w-3 h-3" />}>
          <MoneyInput hidden={hideValues} value={form.estimated_value} onChange={v => set('estimated_value', v)} />
        </Field>
        <Field label="Custos / taxas" icon={<Receipt className="w-3 h-3" />}>
          <MoneyInput hidden={hideValues} value={form.estimated_cost} onChange={v => set('estimated_cost', v)} />
        </Field>
      </div>
      {form.estimated_value != null && (
        <p className="-mt-2 text-[11.5px] flex flex-wrap gap-x-3" style={{ color: 'var(--sm-text-3)' }}>
          <span>
            Líquido:{' '}
            <strong style={{ color: netValue(form as CrmLead) < 0 ? '#f87171' : '#22C55E' }}>{money(netValue(form as CrmLead), true)}</strong>
          </span>
          {!!form.estimated_cost && form.estimated_value > 0 && !hideValues && (
            <span>custos = {Math.round((form.estimated_cost / form.estimated_value) * 100)}% do valor</span>
          )}
        </p>
      )}

      {/* Próximo contato: é o que entra no lembrete diário */}
      <Field label="Próximo contato" icon={<CalendarClock className="w-3 h-3" />}>
        {/* Celular: data na largura toda e atalhos numa grade de 4 embaixo.
            Computador: tudo numa linha só. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            type="date"
            value={form.next_contact_at ?? ''}
            onChange={e => set('next_contact_at', e.target.value || null)}
            // O iPhone dá ao campo de data uma largura mínima própria: sem min-w-0
            // e appearance-none ele passa da largura do modal
            className="w-full min-w-0 appearance-none sm:w-[160px] text-left [&::-webkit-date-and-time-value]:text-left"
          />
          {/* minmax(0,1fr): sem isto "1 semana" alarga a coluna e a grade vaza em 320px */}
          <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-1.5 sm:flex sm:gap-2">
            {QUICK_DATES.map(q => {
              const v = todayISO(q.days)
              const active = form.next_contact_at === v
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => set('next_contact_at', v)}
                  className="h-10 sm:h-7 px-1 sm:px-2 min-w-0 truncate rounded-lg sm:rounded-md border text-[12.5px] sm:text-[11.5px] font-medium sm:font-normal transition-colors"
                  style={{
                    borderColor: active ? '#2563EB' : 'var(--sm-border)',
                    background:  active ? 'rgba(37,99,235,0.12)' : 'var(--sm-bg-input)',
                    color:       active ? '#4F8EF7' : 'var(--sm-text-3)',
                  }}
                >
                  {q.label}
                </button>
              )
            })}
          </div>
        </div>
        {form.next_contact_at && (
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11.5px]" style={{ color: nextContactHint(form.next_contact_at).late ? '#f87171' : 'var(--sm-text-4)' }}>
              {nextContactHint(form.next_contact_at).text}
            </span>
            <button type="button" onClick={() => set('next_contact_at', null)}
                    className="text-[11.5px] underline" style={{ color: 'var(--sm-text-4)' }}>
              limpar
            </button>
          </div>
        )}
      </Field>

      {/* Temperatura */}
      <Field label="Temperatura" icon={<Flame className="w-3 h-3" />}>
        <div className="grid grid-cols-3 gap-2">
          {TEMPERATURES.map(t => {
            const active = (form.temperature ?? 'morno') === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => set('temperature', t.value)}
                className="h-9 rounded-md border text-[12px] font-medium transition-all"
                style={{
                  borderColor: active ? t.color : 'var(--sm-border)',
                  background:  active ? `${t.color}1f` : 'var(--sm-bg-input)',
                  color:       active ? t.color : 'var(--sm-text-3)',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </Field>

      {/* Responsável + coluna */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Responsável">
          <select
            className={selectClass}
            value={form.responsible_user_id ?? ''}
            onChange={e => set('responsible_user_id', e.target.value || null)}
          >
            <option value="">Sem responsável</option>
            {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Etapa do funil" icon={<ArrowRightLeft className="w-3 h-3" />}>
          <select
            className={selectClass}
            value={form.column_id}
            onChange={e => set('column_id', e.target.value)}
          >
            {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      {isLostColumn && (
        <Field label="Por que perdemos este lead?" icon={<XCircle className="w-3 h-3" />}>
          <LostReasonField value={form.lost_reason ?? ''} onChange={v => set('lost_reason', v)} />
        </Field>
      )}

      {/* Resumo fixo. O dia a dia vai para o histórico, com data. */}
      <Field label={lead ? 'Resumo do lead' : 'Observações'} icon={<StickyNote className="w-3 h-3" />}>
        <Textarea
          rows={lead ? 3 : 4}
          value={form.notes ?? ''}
          onChange={e => set('notes', e.target.value)}
          placeholder={lead
            ? 'O essencial sobre este lead, que aparece no card. Conversas do dia a dia vão no histórico ao lado.'
            : 'O que foi conversado, objeções, o que ficou combinado...'}
        />
      </Field>

      {/* Converter em cliente — só faz sentido em coluna de ganho */}
      {lead && isWonColumn && !lead.converted_client_id && onConvert && (
        <button
          type="button"
          onClick={() => onConvert(lead)}
          className="w-full h-9 rounded-md text-[12.5px] font-medium transition-colors"
          style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)' }}
        >
          Converter este lead em cliente →
        </button>
      )}
      {lead?.converted_client_id && (
        <p className="text-[11.5px] text-center" style={{ color: '#22C55E' }}>
          Este lead já virou cliente.
        </p>
      )}
    </div>
  )

  const PANELS: { id: Panel; label: string; icon: React.ElementType }[] = [
    { id: 'conversa',   label: 'Conversa',   icon: MessagesSquare },
    { id: 'historico',  label: 'Histórico',  icon: History },
    { id: 'tarefas',    label: 'Tarefas',    icon: CheckSquare },
    { id: 'documentos', label: 'Documentos', icon: FileText },
  ]

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent
        // Lead existente: não põe o cursor em campo nenhum. No celular isso abre o
        // teclado sozinho e cobre a tela antes de a pessoa decidir o que fazer.
        onOpenAutoFocus={e => { if (lead) e.preventDefault() }}
        // overflow-x-hidden: overflow-y-auto sozinho também libera rolagem lateral,
        // e no celular o modal inteiro fica "arrastando" para os lados
        className={`w-[95vw] max-w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden overscroll-contain ${lead ? 'lg:max-w-6xl' : 'sm:max-w-2xl'}`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <UserPlus className="w-4 h-4 flex-shrink-0" style={{ color: '#4F8EF7' }} />
            <span className="truncate">{lead ? lead.name : 'Novo lead'}</span>
            {lead?.archived_at && (
              <span className="text-[10.5px] px-1.5 py-0.5 rounded-md font-normal"
                    style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-3)' }}>
                arquivado
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {lead ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6">
            {formBody}

            <div className="flex flex-col gap-3 min-w-0 order-first lg:order-none lg:border-l lg:pl-6" style={{ borderColor: 'var(--sm-border)' }}>
              <CrmWhatsappActions lead={lead} columns={columns} onSent={() => setSentFromCrm(true)} />
              <CrmLeadFollowup lead={lead} />

              <div className="flex gap-1 border-b" style={{ borderColor: 'var(--sm-border)' }}>
                {PANELS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPanel(p.id)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2 sm:px-2.5 h-8 text-[12px] whitespace-nowrap border-b-2 -mb-px transition-colors ${
                      panel === p.id ? 'border-[#2563EB] font-semibold' : 'border-transparent'}`}
                    style={{ color: panel === p.id ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}
                  >
                    <p.icon className="hidden sm:block w-3.5 h-3.5" /> {p.label}
                  </button>
                ))}
              </div>

              <div className="min-h-[240px]">
                {panel === 'conversa'   && <CrmLeadConversation leadId={lead.id} />}
                {panel === 'historico'  && <CrmLeadTimeline leadId={lead.id} />}
                {panel === 'tarefas'    && <CrmLeadTasks leadId={lead.id} defaultAssignee={lead.responsible_user_id} />}
                {panel === 'documentos' && <CrmLeadDocs leadId={lead.id} onNavigate={onClose} />}
              </div>
            </div>
          </div>
        ) : formBody}

        {/* Ações */}
        <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
          <div className="flex items-center gap-1">
            {lead && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px]" style={{ color: 'var(--sm-text-3)' }}>
                    Excluir apaga o histórico junto. Prefira arquivar.
                  </span>
                  <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleteLead.isPending}>
                    {deleteLead.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Excluir'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Não</Button>
                </div>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={handleArchive} disabled={archive.isPending}>
                    {lead.archived_at
                      ? <><ArchiveRestore className="w-3.5 h-3.5" /> Restaurar</>
                      : <><Archive className="w-3.5 h-3.5" /> Arquivar</>}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </Button>
                </>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {lead ? 'Salvar' : 'Cadastrar lead'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
