// ── Motivo de perda ──────────────────────────────────────────────────────────
// Pedido sempre que um lead vai para uma etapa de perda: no arrasto, no menu
// "mover para" e na troca de etapa dentro da ficha. Sem ele o relatório de
// motivos de perda fica vazio, e é justamente o dado que ensina a vender melhor.

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CRM_LOST_REASONS } from '@/data/crmTemplates'

const OTHER = '__outro__'

/** Lista de motivos + campo livre. `value` é o texto final do motivo. */
export function LostReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // "Outro" precisa de estado próprio: com o campo livre ainda vazio, `value`
  // sozinho não diz se a pessoa escolheu "Outro" ou não escolheu nada.
  const [other, setOther] = useState(!!value && !CRM_LOST_REASONS.includes(value))
  const choice = CRM_LOST_REASONS.includes(value) ? value : other ? OTHER : ''

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[...CRM_LOST_REASONS, OTHER].map(r => {
          const active = choice === r
          return (
            <button
              key={r}
              type="button"
              onClick={() => { setOther(r === OTHER); onChange(r === OTHER ? '' : r) }}
              className="px-2.5 h-7 rounded-md border text-[12px] transition-colors"
              style={{
                borderColor: active ? '#ef4444' : 'var(--sm-border)',
                background:  active ? 'rgba(239,68,68,0.10)' : 'var(--sm-bg-input)',
                color:       active ? '#f87171' : 'var(--sm-text-3)',
              }}
            >
              {r === OTHER ? 'Outro motivo' : r}
            </button>
          )
        })}
      </div>
      {choice === OTHER && (
        <Input
          autoFocus
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Qual foi o motivo?"
          maxLength={200}
        />
      )}
    </div>
  )
}

interface DialogProps {
  open:      boolean
  leadName:  string
  saving?:   boolean
  onCancel:  () => void
  onConfirm: (reason: string | null) => void
}

export function CrmLostReasonDialog({ open, leadName, saving, onCancel, onConfirm }: DialogProps) {
  const [reason, setReason] = useState('')

  useEffect(() => { if (open) setReason('') }, [open])

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel() }}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>Por que perdemos {leadName}?</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] -mt-2" style={{ color: 'var(--sm-text-3)' }}>
          O motivo entra no relatório e mostra onde o funil está vazando.
        </p>
        <LostReasonField value={reason} onChange={setReason} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onConfirm(null)} disabled={saving}>Pular</Button>
          <Button variant="destructive" onClick={() => onConfirm(reason.trim() || null)} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Marcar como perdido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
