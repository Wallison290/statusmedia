// ── Proposta pública (/proposta/:token) ──────────────────────────────────────
// O cliente da agência lê a proposta e responde ali mesmo. Aceitar pede o nome
// completo (fica registrado com data, IP e um código do conteúdo aceito).

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Printer, Loader2, ShieldCheck, Clock } from 'lucide-react'
import { fetchPublicProposal, respondPublicProposal, type PublicProposal } from '@/hooks/useCrmDocuments'
import { fmtBRL, fmtLongDate, fmtDateTime, itemTotal } from '@/utils/crm'
import { PublicShell, PublicLoading, PublicNotFound, INK, MUTED, LINE, BRAND, inputClass } from './PublicShell'

export function PublicProposalPage() {
  const { token = '' } = useParams()
  const [data, setData]       = useState<PublicProposal | null | undefined>(undefined)
  const [mode, setMode]       = useState<'idle' | 'aceitar' | 'recusar'>('idle')
  const [name, setName]       = useState('')
  const [reason, setReason]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  function load() {
    fetchPublicProposal(token).then(setData).catch(() => setData(null))
  }
  useEffect(load, [token])

  if (data === undefined) return <PublicLoading />
  if (data === null)      return <PublicNotFound what="Proposta" />

  const monthly  = data.items.filter(i => i.recurring).reduce((s, i) => s + itemTotal(i), 0)
  const answered = data.status === 'aceita' || data.status === 'recusada'
  const subtotal = data.items.reduce((s, i) => s + itemTotal(i), 0)

  async function respond(accept: boolean) {
    setError('')
    if (name.trim().split(/\s+/).length < 2) { setError('Digite seu nome completo.'); return }
    setBusy(true)
    try {
      const r = await respondPublicProposal(token, accept, name.trim(), reason.trim() || undefined)
      if (!r.ok) { setError(r.error ?? 'Não foi possível registrar sua resposta.'); return }
      load()
      setMode('idle')
    } catch {
      setError('Não foi possível registrar sua resposta. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicShell agency={data.agency} wide>
      <p className="text-[12px] uppercase tracking-widest font-semibold" style={{ color: BRAND }}>Proposta comercial</p>
      <h1 className="text-[24px] sm:text-[28px] font-bold leading-tight mt-1" style={{ color: INK }}>{data.title}</h1>
      {data.lead && (
        <p className="text-[14px] mt-1" style={{ color: MUTED }}>
          Para {data.lead.company ? `${data.lead.company} · ${data.lead.name}` : data.lead.name}
        </p>
      )}

      {data.intro && (
        <p className="text-[15px] leading-relaxed mt-6 whitespace-pre-line" style={{ color: '#334155' }}>{data.intro}</p>
      )}

      {/* Itens */}
      <div className="mt-8 border-t" style={{ borderColor: LINE }}>
        {data.items.map((i, idx) => (
          <div key={idx} className="flex items-start justify-between gap-4 py-4 border-b" style={{ borderColor: LINE }}>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: INK }}>
                {Number(i.quantity) > 1 && <span style={{ color: MUTED }}>{i.quantity}× </span>}{i.description}
              </p>
              {i.details && <p className="text-[13px] mt-0.5" style={{ color: MUTED }}>{i.details}</p>}
            </div>
            <p className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
              {fmtBRL(itemTotal(i), true)}{i.recurring && <span className="text-[12px] font-normal" style={{ color: MUTED }}>/mês</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-1 text-right">
        {Number(data.discount) > 0 && (
          <>
            <p className="text-[13px]" style={{ color: MUTED }}>Subtotal {fmtBRL(subtotal, true)}</p>
            <p className="text-[13px]" style={{ color: '#16a34a' }}>Desconto −{fmtBRL(Number(data.discount), true)}</p>
          </>
        )}
        <p className="text-[26px] font-bold" style={{ color: INK }}>{fmtBRL(Number(data.total), true)}</p>
        {monthly > 0 && monthly === subtotal && (
          <p className="text-[12px]" style={{ color: MUTED }}>valor mensal</p>
        )}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 text-[13px]">
        {data.payment_terms && (
          <div className="rounded-xl p-3" style={{ background: '#f8fafc' }}>
            <p className="font-semibold" style={{ color: INK }}>Pagamento</p>
            <p style={{ color: MUTED }}>{data.payment_terms}</p>
          </div>
        )}
        {data.valid_until && (
          <div className="rounded-xl p-3" style={{ background: data.expired ? '#fef2f2' : '#f8fafc' }}>
            <p className="font-semibold" style={{ color: INK }}>Validade</p>
            <p style={{ color: data.expired ? '#dc2626' : MUTED }}>
              {data.expired ? 'Expirou em ' : 'Até '}{fmtLongDate(data.valid_until)}
            </p>
          </div>
        )}
      </div>

      {/* Resposta */}
      <div className="mt-8 pt-6 border-t print:hidden" style={{ borderColor: LINE }}>
        {answered ? (
          <div className="rounded-xl p-4 flex items-start gap-3"
               style={{ background: data.status === 'aceita' ? '#f0fdf4' : '#fef2f2' }}>
            {data.status === 'aceita'
              ? <CheckCircle2 className="w-6 h-6 flex-shrink-0" style={{ color: '#16a34a' }} />
              : <XCircle className="w-6 h-6 flex-shrink-0" style={{ color: '#dc2626' }} />}
            <div>
              <p className="text-[15px] font-semibold" style={{ color: INK }}>
                {data.status === 'aceita' ? 'Proposta aceita' : 'Proposta recusada'}
              </p>
              <p className="text-[13px]" style={{ color: MUTED }}>
                Por {data.responder_name}{data.responded_at && ` em ${fmtDateTime(data.responded_at)}`}.
                {data.status === 'aceita' && ` A ${data.agency.name} já foi avisada e vai entrar em contato.`}
              </p>
            </div>
          </div>
        ) : data.expired ? (
          <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: '#fef2f2' }}>
            <Clock className="w-5 h-5" style={{ color: '#dc2626' }} />
            <p className="text-[14px]" style={{ color: INK }}>
              O prazo desta proposta terminou. Fale com a {data.agency.name} para receber uma atualizada.
            </p>
          </div>
        ) : mode === 'idle' ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => setMode('aceitar')}
                    className="flex-1 h-12 rounded-xl text-white text-[15px] font-semibold" style={{ background: '#16a34a' }}>
              Aceitar proposta
            </button>
            <button onClick={() => setMode('recusar')}
                    className="sm:w-40 h-12 rounded-xl border text-[14px]" style={{ borderColor: LINE, color: MUTED }}>
              Recusar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[15px] font-semibold" style={{ color: INK }}>
              {mode === 'aceitar' ? 'Confirme seu aceite' : 'Tudo bem! Pode contar o motivo?'}
            </p>
            <input className={inputClass} style={{ borderColor: LINE, color: INK }}
                   placeholder="Seu nome completo" value={name} onChange={e => setName(e.target.value)} autoFocus />
            {mode === 'recusar' && (
              <textarea className={`${inputClass} h-24 py-2.5`} style={{ borderColor: LINE, color: INK }}
                        placeholder="Ex: preço, prazo, momento... (opcional)" value={reason} onChange={e => setReason(e.target.value)} />
            )}
            {mode === 'aceitar' && (
              <p className="text-[12px]" style={{ color: MUTED }}>
                Ao confirmar, você declara que leu e concorda com esta proposta. Registramos seu nome, a data e o endereço de acesso.
              </p>
            )}
            {error && <p className="text-[13px]" style={{ color: '#dc2626' }}>{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => respond(mode === 'aceitar')} disabled={busy}
                      className="flex-1 h-12 rounded-xl text-white text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ background: mode === 'aceitar' ? '#16a34a' : '#dc2626' }}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'aceitar' ? 'Confirmar aceite' : 'Enviar resposta'}
              </button>
              <button onClick={() => { setMode('idle'); setError('') }} className="px-4 h-12 rounded-xl text-[14px]" style={{ color: MUTED }}>
                Voltar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap text-[11px]" style={{ color: MUTED }}>
        {data.content_hash
          ? <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Código do conteúdo aceito: {data.content_hash.slice(0, 24)}</span>
          : <span />}
        <button onClick={() => window.print()} className="flex items-center gap-1 print:hidden">
          <Printer className="w-3.5 h-3.5" /> Imprimir ou salvar PDF
        </button>
      </div>
    </PublicShell>
  )
}
