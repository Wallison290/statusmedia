// ── Etiqueta do WhatsApp Business no primeiro contato ───────────────────────
// Mensagem enviada pelo CRM com o lead na primeira etapa do funil: a conversa
// ganha esta etiqueta no WhatsApp Business da agência (função agency-whatsapp).
// Só aparece com o WhatsApp conectado e com etiquetas (conta Business).

import { Tag } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useCrmColumns } from '@/hooks/useCrm'
import { useCrmSettings, useUpdateCrmSettings } from '@/hooks/useCrmSettings'
import { useAgencyWhatsapp, useAgencyWhatsappLabels } from '@/hooks/useAgencyWhatsapp'

export function CrmWhatsappLabelSetting() {
  const { toast } = useToast()
  const { data: wa } = useAgencyWhatsapp()
  const connected = wa?.status === 'connected'
  const { data: labels = [], isLoading } = useAgencyWhatsappLabels(connected)
  const { data: settings } = useCrmSettings()
  const { data: columns = [] } = useCrmColumns()
  const update = useUpdateCrmSettings()

  if (!connected || isLoading || !labels.length || !settings) return null

  const first = [...columns].sort((a, b) => a.position - b.position)[0]
  const current = settings.wa_first_contact_label ?? ''

  async function choose(id: string) {
    const label = labels.find(l => l.id === id)
    try {
      await update.mutateAsync({ wa_first_contact_label: id || null, wa_first_contact_label_name: label?.name ?? null })
      toast(label ? `Etiqueta "${label.name}" no primeiro contato` : 'Etiqueta desligada', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar', 'error')
    }
  }

  return (
    <section className="rounded-xl border p-4 sm:p-5 space-y-3" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <div>
        <h2 className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
          <Tag className="w-4 h-4" style={{ color: '#4F8EF7' }} /> Etiqueta no WhatsApp Business
        </h2>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
          Quando você manda mensagem pelo CRM para um lead em {first ? `"${first.name}"` : 'a primeira etapa'}, a conversa já aparece no seu WhatsApp com esta etiqueta. As etiquetas que a conversa já tinha continuam.
        </p>
      </div>
      <select
        className="flex h-9 w-full sm:w-72 min-w-0 rounded-md border px-3 text-[13px] [color-scheme:dark] focus:outline-none"
        style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}
        value={current}
        disabled={update.isPending}
        onChange={e => choose(e.target.value)}
      >
        <option value="">Não colocar etiqueta</option>
        {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </section>
  )
}
