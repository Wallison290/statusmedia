// ── Follow-up: em quais dias de silêncio cada contato sai ────────────────────
// Mesma ideia da cobrança automática do financeiro: a agência marca os dias e
// salva. O rascunho mora no CrmFollowupSettings, porque as mensagens de cada
// contato (etapa 03) acompanham os dias marcados aqui antes mesmo de salvar.

import { useId, useState } from 'react'
import { Check, Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useCrmSettings, useUpdateCrmSettings } from '@/hooks/useCrmSettings'
import { useCrmColumns } from '@/hooks/useCrm'
import { autoFollowupColumn } from '@/hooks/useCrmFollowup'
import { CrmSetupSection } from './CrmSetupSection'
import {
  FOLLOWUP_DEFAULT_DAYS, FOLLOWUP_MAX_CONTACTS, FOLLOWUP_MAX_DAY,
  followupDayLabel, normalizeFollowupDays,
} from '../../../supabase/functions/_shared/followup-style'

const SUGGESTED_DAYS = [1, 2, 3, 5, 7, 10, 14, 21, 30]

export function CrmFollowupDaysSettings({ days, onChange, saved }: {
  days: number[]; onChange: (days: number[]) => void; saved: number[]
}) {
  const id = useId()
  const { toast } = useToast()
  const { data: settings } = useCrmSettings()
  const update = useUpdateCrmSettings()
  const { data: allColumns = [] } = useCrmColumns()
  const columns = [...allColumns].sort((a, b) => a.position - b.position)
  const [custom, setCustom] = useState('')

  const dirty = days.join() !== saved.join()
  const full = days.length >= FOLLOWUP_MAX_CONTACTS
  const options = [...new Set([...SUGGESTED_DAYS, ...days])].sort((a, b) => a - b)

  function toggle(day: number) {
    if (days.includes(day)) {
      if (days.length === 1) { toast('A sequência precisa de pelo menos um contato.', 'warning'); return }
      onChange(days.filter(d => d !== day))
    } else {
      if (full) { toast(`Use no máximo ${FOLLOWUP_MAX_CONTACTS} contatos. Desmarque um dia para escolher outro.`, 'warning'); return }
      onChange(normalizeFollowupDays([...days, day]))
    }
  }

  function addCustom() {
    const day = Number(custom)
    if (!Number.isInteger(day) || day < 1 || day > FOLLOWUP_MAX_DAY) { toast(`Digite um número de 1 a ${FOLLOWUP_MAX_DAY}.`, 'warning'); return }
    if (days.includes(day)) { setCustom(''); return }
    if (full) { toast(`Use no máximo ${FOLLOWUP_MAX_CONTACTS} contatos. Desmarque um dia para escolher outro.`, 'warning'); return }
    onChange(normalizeFollowupDays([...days, day]))
    setCustom('')
  }

  async function save() {
    try {
      await update.mutateAsync({ followup_steps: days })
      toast('Dias do follow-up salvos.', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar', 'error')
    }
  }

  return (
    <CrmSetupSection id="followup-days" number="02" title="Escolha quando cada contato sai"
      description="Marque depois de quantos dias sem resposta o CRM deve chamar o cliente de novo. Cada dia marcado vira um contato da sequência.">
      <div className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <p id={`${id}-days-label`} className="crm-field-label !mb-0">Dias sem resposta</p>
            <p className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>{days.length} de {FOLLOWUP_MAX_CONTACTS} contatos</p>
          </div>
          <div role="group" aria-labelledby={`${id}-days-label`} className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            {options.map(day => {
              const on = days.includes(day)
              return <button key={day} type="button" className="crm-choice" aria-pressed={on}
                disabled={!on && full} onClick={() => toggle(day)}>
                {on && <Check className="w-3.5 h-3.5" aria-hidden="true" />}{followupDayLabel(day)}
              </button>
            })}
          </div>
          <div className="flex items-end gap-2 mt-3 flex-wrap">
            <div>
              <label htmlFor={`${id}-custom`} className="crm-field-label">Outro dia</label>
              <input id={`${id}-custom`} type="number" inputMode="numeric" min={1} max={FOLLOWUP_MAX_DAY} value={custom} placeholder="Ex: 45"
                className="h-10 w-28 rounded-lg border px-3 text-[13px] focus:outline-none"
                onChange={event => setCustom(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustom() } }} />
            </div>
            <Button type="button" variant="outline" className="h-10" disabled={!custom || full} onClick={addCustom}><Plus className="w-3.5 h-3.5" /> Adicionar dia</Button>
          </div>
          <p className="crm-field-hint">Os dias contam a partir da sua última mensagem sem resposta. Escolha de 1 a {FOLLOWUP_MAX_CONTACTS} contatos, entre 1 e {FOLLOWUP_MAX_DAY} dias.</p>
        </div>

        <ol aria-label="Sequência que será usada" className="crm-panel p-3 sm:p-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {days.map((day, index) => (
            <li key={day} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
              <span className="crm-setup-number !w-7 !h-7 !text-[11px]" aria-hidden="true">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{index + 1}º contato</span>
                <span className="block text-[12px]" style={{ color: 'var(--sm-text-2)' }}>após {followupDayLabel(day)} sem resposta{index === days.length - 1 && days.length > 1 ? ' · último' : ''}</span>
              </span>
              {days.length > 1 && <button type="button" className="p-1.5 rounded-md hover:opacity-80" style={{ color: 'var(--sm-text-2)' }}
                aria-label={`Remover o contato de ${followupDayLabel(day)}`} onClick={() => toggle(day)}><X className="w-4 h-4" /></button>}
            </li>
          ))}
        </ol>

        <details className="crm-disclosure">
          <summary>Mover o card no funil a cada contato (opcional)</summary>
          <div className="crm-disclosure-body space-y-4">
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--sm-text-2)' }}>Escolha a etapa para onde o card vai depois de cada envio. O card só avança, nunca volta para uma etapa anterior. Essas escolhas são salvas na hora.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {days.map((day, index) => {
                const chosen = settings?.followup_columns?.[String(day)]
                const auto = autoFollowupColumn(day, columns)
                return <div key={day}>
                  <label htmlFor={`${id}-column-${day}`} className="crm-field-label">Depois do {index + 1}º contato ({followupDayLabel(day)})</label>
                  <select id={`${id}-column-${day}`} className="h-10 w-full min-w-0 rounded-lg border px-3 text-[13px]" value={chosen ?? auto?.id ?? 'none'} disabled={update.isPending}
                    onChange={event => update.mutate({ followup_columns: { ...(settings?.followup_columns ?? {}), [String(day)]: event.target.value } }, { onError: (error: Error) => toast(error.message, 'error') })}>
                    <option value="none">Não mover o card</option>
                    {columns.filter(column => column.stage_type === 'normal').map(column => <option key={column.id} value={column.id}>{column.name}</option>)}
                  </select>
                </div>
              })}
            </div>
          </div>
        </details>

        <div className="crm-save-bar" data-dirty={dirty}>
          <p className="text-[12px]" role="status" style={{ color: 'var(--sm-text-2)' }}>
            {dirty ? 'Dias alterados. Salve para valer nos próximos envios.' : `Sequência salva: ${saved.map(followupDayLabel).join(', ')}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {days.join() !== FOLLOWUP_DEFAULT_DAYS.join() && <Button type="button" size="sm" variant="ghost" disabled={update.isPending} onClick={() => onChange([...FOLLOWUP_DEFAULT_DAYS])}>Usar 1, 3, 7 e 14 dias</Button>}
            {dirty && <Button type="button" size="sm" variant="ghost" disabled={update.isPending} onClick={() => onChange(saved)}>Descartar</Button>}
            <Button type="button" size="sm" className="h-9" disabled={!dirty || update.isPending} onClick={save}>
              {update.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Salvar dias
            </Button>
          </div>
        </div>
      </div>
    </CrmSetupSection>
  )
}
