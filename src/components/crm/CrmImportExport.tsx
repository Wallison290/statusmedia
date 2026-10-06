// ── Importar e exportar leads (CSV) ──────────────────────────────────────────
// Exportar: todos os leads ativos numa planilha (separador ";" e acentos que o
// Excel em português abre direto).
// Importar: planilha com cabeçalho; as colunas são reconhecidas pelo nome
// (nome, whatsapp/telefone, e-mail, empresa, instagram, origem, valor,
// observações, tags). Quem já está no CRM (mesmo WhatsApp ou e-mail) é pulado.

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'
import { netValue } from '@/utils/crm'
import type { CrmColumn, CrmLead } from '@/types'

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** DDD + últimos 8 dígitos: o mesmo número com ou sem 55 e nono dígito. */
function phoneKey(raw: string | null | undefined) {
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : null
}

/** CSV com aspas, separador ";" ou "," (detectado pela primeira linha). */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(c => c.trim())) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some(c => c.trim())) rows.push(row)
  return rows
}

// Cabeçalhos aceitos para cada campo
const FIELDS: Record<string, RegExp> = {
  name:      /^(nome|name|contato|lead|cliente)$/,
  whatsapp:  /^(whatsapp|whats|telefone|celular|fone|phone|numero|tel)$/,
  email:     /^(e-?mail|email)$/,
  company:   /^(empresa|company|negocio|clinica|loja)$/,
  instagram: /^(instagram|insta|@)$/,
  source:    /^(origem|source|canal|fonte)$/,
  value:     /^(valor|value|valor estimado|preco|ticket)$/,
  notes:     /^(observacoes|observacao|obs|notas|notes|resumo)$/,
  tags:      /^(tags|etiquetas|tag)$/,
}

function toNumber(v: string) {
  const s = v.replace(/[^\d,.-]/g, '')
  if (!s) return null
  // "1.500,00" → 1500.00; "1500.5" → 1500.5
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

interface Props {
  leads:   CrmLead[]
  columns: CrmColumn[]
}

export function CrmImportExport({ leads, columns }: Props) {
  const { toast } = useToast()
  const { user, agencyId } = useAuth()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const ordered = [...columns].sort((a, b) => a.position - b.position)

  const [preview, setPreview] = useState<{ fresh: any[]; dupes: number; invalid: number } | null>(null)
  const [targetCol, setTargetCol] = useState('')
  const [importing, setImporting] = useState(false)

  function exportCsv() {
    const stage = new Map(columns.map(c => [c.id, c.name]))
    const head = ['Nome', 'Empresa', 'WhatsApp', 'E-mail', 'Instagram', 'Origem', 'Etapa', 'Valor', 'Custos', 'Líquido',
      'Temperatura', 'Próximo contato', 'Reunião', 'Tags', 'Observações', 'Criado em']
    const rows = leads.filter(l => !l.archived_at).map(l => [
      l.name, l.company, l.whatsapp, l.email, l.instagram, l.source, stage.get(l.column_id) ?? '',
      l.estimated_value ?? '', l.estimated_cost ?? '', l.estimated_value != null ? netValue(l) : '',
      l.temperature, l.next_contact_at,
      l.meeting_at ? new Date(l.meeting_at).toLocaleString('pt-BR') : '',
      (l.tags ?? []).join(' | '), l.notes, new Date(l.created_at).toLocaleDateString('pt-BR'),
    ])
    const csv = '﻿' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(`${rows.length} lead(s) exportados`, 'success')
  }

  async function readFile(file: File) {
    const rows = parseCsv(await file.text())
    if (rows.length < 2) { toast('A planilha precisa de um cabeçalho e pelo menos uma linha', 'warning'); return }
    const header = rows[0].map(plain)
    const idx: Record<string, number> = {}
    for (const [field, re] of Object.entries(FIELDS)) {
      const i = header.findIndex(h => re.test(h))
      if (i >= 0) idx[field] = i
    }
    if (idx.name === undefined) { toast('Não achei a coluna "Nome" na planilha', 'error'); return }

    const known = new Set<string>()
    for (const l of leads) {
      const k = phoneKey(l.whatsapp); if (k) known.add('p' + k)
      if (l.email) known.add('e' + l.email.toLowerCase())
    }
    const fresh: any[] = []
    let dupes = 0, invalid = 0
    for (const r of rows.slice(1)) {
      const get = (f: string) => (idx[f] !== undefined ? (r[idx[f]] ?? '').trim() : '')
      const name = get('name')
      if (!name) { invalid++; continue }
      const pk = phoneKey(get('whatsapp'))
      const email = get('email').toLowerCase() || null
      if ((pk && known.has('p' + pk)) || (email && known.has('e' + email))) { dupes++; continue }
      if (pk) known.add('p' + pk)
      if (email) known.add('e' + email)
      fresh.push({
        name: name.slice(0, 120),
        whatsapp:  get('whatsapp') || null,
        email,
        company:   get('company') || null,
        instagram: get('instagram') || null,
        source:    get('source') || 'Importação',
        estimated_value: toNumber(get('value')),
        notes:     get('notes') || null,
        tags:      get('tags') ? get('tags').split(/[|,]/).map(t => t.trim()).filter(Boolean) : [],
      })
    }
    setTargetCol(ordered[0]?.id ?? '')
    setPreview({ fresh, dupes, invalid })
  }

  async function confirmImport() {
    if (!preview || !user || !targetCol) return
    setImporting(true)
    try {
      for (let i = 0; i < preview.fresh.length; i += 200) {
        const batch = preview.fresh.slice(i, i + 200).map(l => ({ ...l, user_id: agencyId!, column_id: targetCol, temperature: 'morno' }))
        const { error } = await (supabase as any).from('crm_leads').insert(batch)
        if (error) throw error
      }
      await qc.invalidateQueries({ queryKey: ['crm_leads'] })
      toast(`${preview.fresh.length} lead(s) importados`, 'success')
      setPreview(null)
    } catch (err: any) {
      toast(err.message ?? 'Erro ao importar', 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={exportCsv} disabled={!leads.length} title="Baixar planilha com os leads" aria-label="Exportar leads">
        <Download className="w-3.5 h-3.5" /> <span className="max-md:hidden">Exportar</span>
      </Button>
      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} title="Subir planilha de leads (CSV)" aria-label="Importar leads">
        <Upload className="w-3.5 h-3.5" /> <span className="max-md:hidden">Importar</span>
      </Button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
             onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = '' }} />

      <Dialog open={!!preview} onOpenChange={v => { if (!v && !importing) setPreview(null) }}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-md">
          <DialogHeader><DialogTitle>Importar leads</DialogTitle></DialogHeader>
          {preview && (
            <div className="space-y-3 text-[13px]" style={{ color: 'var(--sm-text-2)' }}>
              <p>
                <strong style={{ color: 'var(--sm-text-1)' }}>{preview.fresh.length}</strong> lead(s) novos para importar.
                {preview.dupes > 0 && <> {preview.dupes} já estavam no CRM (mesmo WhatsApp ou e-mail) e serão pulados.</>}
                {preview.invalid > 0 && <> {preview.invalid} linha(s) sem nome foram ignoradas.</>}
              </p>
              {preview.fresh.length > 0 && (
                <>
                  <ul className="text-[12px] space-y-0.5 max-h-32 overflow-y-auto" style={{ color: 'var(--sm-text-3)' }}>
                    {preview.fresh.slice(0, 8).map((l, i) => <li key={i}>• {l.name}{l.company ? ` (${l.company})` : ''}{l.whatsapp ? ` · ${l.whatsapp}` : ''}</li>)}
                    {preview.fresh.length > 8 && <li>…e mais {preview.fresh.length - 8}</li>}
                  </ul>
                  <label className="block">
                    <span className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--sm-text-3)' }}>Entram na etapa</span>
                    <select value={targetCol} onChange={e => setTargetCol(e.target.value)}
                            className="h-9 w-full rounded-md border px-2 text-[13px] [color-scheme:dark]"
                            style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }}>
                      {ordered.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                </>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setPreview(null)} disabled={importing}>Cancelar</Button>
                <Button onClick={confirmImport} disabled={importing || !preview.fresh.length}>
                  {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Importar {preview.fresh.length}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
