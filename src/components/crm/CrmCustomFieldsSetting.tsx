// ── Campos personalizados do lead ────────────────────────────────────────────
// A agência cria os campos que fazem sentido para o nicho dela ("Especialidade",
// "Nº de seguidores", "Tem site?"). Aparecem na ficha de todo lead.

import { useEffect, useState } from 'react'
import { ListPlus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useCrmSettings, useUpdateCrmSettings } from '@/hooks/useCrmSettings'
import type { CrmCustomField } from '@/types'

const TYPES: { value: CrmCustomField['type']; label: string }[] = [
  { value: 'text',   label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'bool',   label: 'Sim / não' },
]

/** "Nº de seguidores" → "n_de_seguidores": chave estável para guardar o valor. */
const toKey = (label: string) =>
  label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

export function CrmCustomFieldsSetting() {
  const { toast } = useToast()
  const { data: settings } = useCrmSettings()
  const update = useUpdateCrmSettings()
  const [fields, setFields] = useState<CrmCustomField[]>([])

  useEffect(() => { setFields(settings?.custom_fields ?? []) }, [settings?.user_id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const seen = new Set<string>()
    const clean = fields
      .filter(f => f.label.trim())
      // Campo já salvo mantém a chave (senão os valores gravados se perdem)
      .map(f => ({ ...f, label: f.label.trim(), key: f.key || toKey(f.label) }))
      .filter(f => f.key && !seen.has(f.key) && seen.add(f.key))
    try {
      await update.mutateAsync({ custom_fields: clean })
      setFields(clean)
      toast('Campos salvos', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar', 'error')
    }
  }

  return (
    <section className="rounded-xl border p-4 sm:p-5 space-y-3" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <div>
        <h2 className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
          <ListPlus className="w-4 h-4" style={{ color: '#4F8EF7' }} /> Campos personalizados
        </h2>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
          Informações do seu nicho que aparecem na ficha de todo lead. Ex.: Especialidade, Nº de seguidores, Tem site?
        </p>
      </div>
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="flex gap-2">
            <Input value={f.label} placeholder="Nome do campo" className="h-9 flex-1"
                   onChange={e => setFields(fs => fs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <select value={f.type}
                    onChange={e => setFields(fs => fs.map((x, j) => (j === i ? { ...x, type: e.target.value as CrmCustomField['type'] } : x)))}
                    className="h-9 rounded-md border px-2 text-[12.5px] [color-scheme:dark]"
                    style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <Button size="icon" variant="ghost" aria-label="Remover campo" onClick={() => setFields(fs => fs.filter((_, j) => j !== i))}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => setFields(fs => [...fs, { key: '', label: '', type: 'text' }])}>
          <Plus className="w-3 h-3" /> Adicionar campo
        </Button>
        <Button size="sm" disabled={update.isPending} onClick={save}>Salvar campos</Button>
      </div>
    </section>
  )
}
