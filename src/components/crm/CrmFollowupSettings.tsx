// ── Follow-up automático: liga/desliga e briefings do que a agência vende ────
// A regra (degraus de 1, 3, 7 e 14 dias, só quando a agência falou por último,
// 8h às 20h de segunda a sábado) roda na função crm-followup. Aqui a agência
// liga a automação e escreve o briefing que a IA usa para escrever cada mensagem.

import { useState } from 'react'
import { Loader2, Plus, Trash2, Repeat, Star, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useCrmSettings, useUpdateCrmSettings } from '@/hooks/useCrmSettings'
import { useCrmColumns } from '@/hooks/useCrm'
import { useAgencyWhatsapp } from '@/hooks/useAgencyWhatsapp'
import {
  useCrmOffers, useSaveCrmOffer, useDeleteCrmOffer, FOLLOWUP_STEPS, FOLLOWUP_STEP_GOAL, autoFollowupColumn,
  type CrmOfferInput,
} from '@/hooks/useCrmFollowup'
import type { CrmOffer } from '@/types'

const FIELDS: { key: keyof CrmOfferInput; label: string; placeholder: string; rows: number }[] = [
  { key: 'product',  label: 'O que você vende',                  rows: 2, placeholder: 'Ex: Site de link na bio: uma página com os botões certos para o cliente agendar, comprar ou chamar no WhatsApp.' },
  { key: 'audience', label: 'Para quem',                         rows: 2, placeholder: 'Ex: Clínicas, salões e profissionais liberais que vendem pelo Instagram.' },
  { key: 'problem',  label: 'Necessidade que você ataca',        rows: 3, placeholder: 'Ex: O cliente chega pelo Instagram, clica no link da bio e cai num Linktree genérico ou num site lento. Perde contato e venda.' },
  { key: 'solution', label: 'O que isso resolve na vida do negócio', rows: 3, placeholder: 'Ex: Mais agendamentos pelo Instagram, imagem profissional, tudo num link só, sem depender de agência para trocar.' },
  { key: 'price',    label: 'Preço e condições',                 rows: 1, placeholder: 'Ex: R$ 497 à vista ou 3x, entrega em 5 dias.' },
  { key: 'proof',    label: 'Casos e resultados reais',          rows: 3, placeholder: 'Ex: Clínica X passou de 4 para 11 agendamentos por semana vindos da bio. A IA só cita o que estiver aqui.' },
  { key: 'tips',     label: 'Dicas úteis que você pode dar',     rows: 3, placeholder: 'Ex: Colocar o botão de WhatsApp em primeiro lugar; usar uma chamada com o benefício, não "clique aqui".' },
  { key: 'tone',     label: 'Tom de voz',                        rows: 1, placeholder: 'Ex: Próximo e direto, sem formalidade.' },
]

const EMPTY: CrmOfferInput = { name: '' }

export function CrmFollowupSettings() {
  const { toast } = useToast()
  const { data: settings } = useCrmSettings()
  const update = useUpdateCrmSettings()
  const { data: wa } = useAgencyWhatsapp()
  const { data: offers = [], isLoading } = useCrmOffers()
  const save = useSaveCrmOffer()
  const remove = useDeleteCrmOffer()

  const [editing, setEditing] = useState<(CrmOfferInput & { id?: string }) | null>(null)

  const { data: allColumns = [] } = useCrmColumns()
  const columns = [...allColumns].sort((a, b) => a.position - b.position)

  const enabled = !!settings?.followup_enabled
  const connected = wa?.status === 'connected'

  async function toggle(on: boolean) {
    if (on && !offers.length) { toast('Cadastre o briefing do que você vende antes de ligar', 'warning'); return }
    try {
      await update.mutateAsync({ followup_enabled: on })
      toast(on ? 'Follow-up automático ligado' : 'Follow-up automático desligado', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar', 'error')
    }
  }

  async function submit() {
    if (!editing) return
    if (!editing.name.trim()) { toast('Dê um nome ao briefing', 'warning'); return }
    const clean = Object.fromEntries(
      Object.entries(editing).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]),
    ) as CrmOfferInput & { id?: string }
    try {
      // O primeiro briefing já nasce como padrão
      await save.mutateAsync({ ...clean, name: editing.name.trim(), is_default: editing.is_default || !offers.length })
      toast('Briefing salvo', 'success')
      setEditing(null)
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar', 'error')
    }
  }

  function edit(o: CrmOffer) {
    const { user_id: _u, created_at: _c, updated_at: _up, ...rest } = o
    setEditing(rest)
  }

  return (
    <section className="rounded-xl border p-4 sm:p-5 space-y-4" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <div>
        <h2 className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
          <Repeat className="w-4 h-4" style={{ color: '#4F8EF7' }} /> Follow-up automático
        </h2>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
          Você faz o primeiro contato. Quando o lead para de responder, o sistema manda o follow-up pelo seu WhatsApp, escrito pela IA a partir do briefing abaixo e da conversa real com ele.
        </p>
      </div>

      <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--sm-text-1)' }}>
        <input type="checkbox" checked={enabled} disabled={update.isPending} onChange={e => toggle(e.target.checked)} />
        Follow-up automático ligado
      </label>
      {enabled && !connected && (
        <p className="text-[11.5px]" style={{ color: '#f87171' }}>
          O seu WhatsApp está desconectado. Nenhum follow-up sai até você conectar de novo.
        </p>
      )}

      {/* A cadência e a etapa do funil de cada degrau */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FOLLOWUP_STEPS.map(d => {
          const chosen = settings?.followup_columns?.[String(d)]
          const auto = autoFollowupColumn(d, columns)
          const value = chosen ?? auto?.id ?? 'none'
          return (
            <div key={d} className="rounded-lg border px-3 py-2 flex flex-col gap-1.5" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
              <div className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{d} dia{d > 1 ? 's' : ''}</div>
              <div className="text-[11.5px] leading-snug flex-1" style={{ color: 'var(--sm-text-3)' }}>{FOLLOWUP_STEP_GOAL[d]}</div>
              <select
                aria-label={`Etapa do follow-up de ${d} dias`}
                className="h-8 w-full min-w-0 rounded-md border px-2 text-[12px] [color-scheme:dark]"
                style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
                value={value}
                disabled={update.isPending}
                onChange={e => update.mutate(
                  { followup_columns: { ...(settings?.followup_columns ?? {}), [String(d)]: e.target.value } },
                  { onError: (err: any) => toast(err.message ?? 'Erro ao salvar', 'error') },
                )}
              >
                <option value="none">Não mover o card</option>
                {columns.filter(c => c.stage_type === 'normal').map(c => <option key={c.id} value={c.id}>→ {c.name}</option>)}
              </select>
            </div>
          )
        })}
      </div>
      <ul className="text-[11.5px] space-y-1" style={{ color: 'var(--sm-text-4)' }}>
        <li>• Só dispara quando a última mensagem da conversa foi sua. Se o lead mandou a última, quem deve resposta é você.</li>
        <li>• Cada degrau é usado uma vez por lead. Se ele voltar a conversar e sumir de novo, o sistema espera o próximo degrau que ainda não foi usado.</li>
        <li>• Sai das 8h às 20h, de segunda a sábado. A cada follow-up o card vai para a etapa escolhida acima, só para frente: lead que já está mais adiante no funil não volta.</li>
        <li>• Depois do de 14 dias, se o lead seguir sem responder por mais 7 dias, vai para a etapa de perdido.</li>
        <li>• Leads em etapas fechadas ou de descarte (Ganho, Perdido, Sem interesse) nunca recebem follow-up.</li>
        <li>• Vale para as conversas a partir de agora: o sistema precisa ter visto a conversa para saber quem falou por último. Cada mensagem usa 1 crédito de IA.</li>
      </ul>

      {/* Briefings */}
      <div className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--sm-text-3)' }}>O que você está vendendo</div>
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--sm-text-3)' }} />
        ) : offers.map(o => (
          <div key={o.id} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--sm-border)' }}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: 'var(--sm-text-1)' }}>
                <span className="truncate">{o.name}</span>
                {o.is_default && <span className="text-[10.5px] px-1.5 rounded" style={{ background: 'rgba(37,99,235,0.12)', color: '#4F8EF7' }}>padrão</span>}
              </div>
              {o.product && <div className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-3)' }}>{o.product}</div>}
            </div>
            {!o.is_default && (
              <Button size="icon-sm" variant="ghost" title="Tornar padrão" onClick={() => save.mutate({ id: o.id, name: o.name, is_default: true })}>
                <Star className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" title="Editar" onClick={() => edit(o)}><Pencil className="w-3.5 h-3.5" /></Button>
            <Button size="icon-sm" variant="ghost" title="Excluir" onClick={() => {
              if (window.confirm(`Excluir o briefing "${o.name}"?`)) remove.mutate(o.id, { onError: (e: any) => toast(e.message, 'error') })
            }}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        ))}
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="w-3 h-3" /> Novo briefing
          </Button>
        )}
      </div>

      {editing && (
        <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--sm-text-3)' }}>Nome</label>
            <Input value={editing.name} placeholder="Ex: Site de link na bio" onChange={e => setEditing({ ...editing, name: e.target.value })} />
          </div>
          {FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--sm-text-3)' }}>{f.label}</label>
              {f.rows === 1 ? (
                <Input value={(editing[f.key] as string) ?? ''} placeholder={f.placeholder}
                       onChange={e => setEditing({ ...editing, [f.key]: e.target.value })} />
              ) : (
                <Textarea rows={f.rows} value={(editing[f.key] as string) ?? ''} placeholder={f.placeholder} className="text-[12.5px]"
                          onChange={e => setEditing({ ...editing, [f.key]: e.target.value })} />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button size="sm" disabled={save.isPending} onClick={submit}>
              {save.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Salvar briefing
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
