// ── Aberturas do documento pelo cliente ──────────────────────────────────────
// Quantas vezes e quando o lead abriu o contrato ou a proposta (migration 102).
// A agência abrindo o próprio link não conta, e recarregar a página dentro de
// 30 minutos também não.

import { useState } from 'react'
import { Eye, ChevronDown } from 'lucide-react'
import { useCrmDocViews } from '@/hooks/useCrmDocuments'
import { fmtDateTime } from '@/utils/crm'

interface Props {
  kind:          'contrato' | 'proposta'
  docId:         string
  count:         number
  firstAt:       string | null | undefined
  lastAt:        string | null | undefined
}

/** "iPhone", "Android", "Windows"... o suficiente para reconhecer o aparelho. */
function device(ua: string | null) {
  if (!ua) return null
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac'
  return null
}

export function CrmDocViews({ kind, docId, count, firstAt, lastAt }: Props) {
  const [open, setOpen] = useState(false)
  const { data: views, isLoading } = useCrmDocViews(kind, docId, open)
  const noun = kind === 'contrato' ? 'o contrato' : 'a proposta'

  if (!count && !firstAt) {
    return (
      <p className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--sm-text-4)' }}>
        <Eye className="w-3.5 h-3.5" /> O cliente ainda não abriu {noun}.
      </p>
    )
  }

  const total = Math.max(count, 1)
  return (
    <div className="rounded-lg border text-[12px]" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-1.5 px-3 py-2 text-left">
        <Eye className="w-3.5 h-3.5 shrink-0" style={{ color: '#4F8EF7' }} />
        <span className="flex-1 min-w-0">
          <strong style={{ color: 'var(--sm-text-1)' }}>Aberto {total}x</strong>
          {firstAt && <> · primeira vez em {fmtDateTime(firstAt)}</>}
          {lastAt && total > 1 && <> · última em {fmtDateTime(lastAt)}</>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-2.5 border-t pt-2" style={{ borderColor: 'var(--sm-border)' }}>
          {isLoading ? (
            <p style={{ color: 'var(--sm-text-4)' }}>Carregando…</p>
          ) : views && views.length ? (
            <ol className="space-y-1">
              {views.map((v, i) => (
                <li key={v.id} className="flex items-center gap-2">
                  <span className="w-6 text-right tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{views.length - i}ª</span>
                  <span style={{ color: 'var(--sm-text-2)' }}>{fmtDateTime(v.viewed_at)}</span>
                  {device(v.user_agent) && <span style={{ color: 'var(--sm-text-4)' }}>· {device(v.user_agent)}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: 'var(--sm-text-4)' }}>
              Os horários de cada abertura passaram a ser registrados agora. As próximas aparecem aqui.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
