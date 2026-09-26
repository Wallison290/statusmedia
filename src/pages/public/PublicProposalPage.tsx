// ── Proposta pública (/proposta/:token) ──────────────────────────────────────
// O cliente da agência lê a proposta e responde ali mesmo. Aceitar pede o nome
// completo (fica registrado com data, IP e um código do conteúdo aceito).
//
// Layout editorial: seções numeradas (Apresentação, O que entregamos,
// Investimento, Sua resposta) na cor da agência. No celular, uma barra fixa com
// o valor e o botão de aceitar acompanha a leitura.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Printer, Loader2, ShieldCheck, Clock } from 'lucide-react'
import { fetchPublicProposal, respondPublicProposal, type PublicProposal } from '@/hooks/useCrmDocuments'
import { fmtBRL, fmtLongDate, fmtDateTime, itemTotal } from '@/utils/crm'
import { PublicShell, PublicLoading, PublicNotFound, SectionLabel, INK, MUTED, LINE, inputClass } from './PublicShell'

export function PublicProposalPage() {
  const { token = '' } = useParams()
  const [data, setData]     = useState<PublicProposal | null | undefined>(undefined)
  const [mode, setMode]     = useState<'idle' | 'aceitar' | 'recusar'>('idle')
  const [name, setName]     = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const responseRef = useRef<HTMLElement>(null)

  function load() {
    fetchPublicProposal(token).then(setData).catch(() => setData(null))
  }
  useEffect(load, [token])

  if (data === undefined) return <PublicLoading />
  if (data === null)      return <PublicNotFound what="Proposta" />

  const subtotal = data.items.reduce((s, i) => s + itemTotal(i), 0)
  const allMonthly = data.items.length > 0 && data.items.every(i => i.recurring)
  const answered = data.status === 'aceita' || data.status === 'recusada'
  const canAnswer = !answered && !data.expired

  // Numeração só das seções que existem
  let n = 0
  const next = () => String(++n).padStart(2, '0')

  function startAccept() {
    setMode('aceitar')
    setTimeout(() => responseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

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
      {/* Capa */}
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand)' }}>
        Proposta comercial
      </p>
      <h1 className="font-display font-extrabold mt-4 text-[clamp(2.4rem,7.5vw,4.4rem)] leading-[0.95] tracking-[-0.035em]">
        {data.title}
      </h1>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-[14px]" style={{ color: MUTED }}>
        {data.lead && <span>Para <strong style={{ color: INK }}>{data.lead.company || data.lead.name}</strong></span>}
        {data.sent_at && <span>Enviada em {fmtLongDate(data.sent_at)}</span>}
        {data.valid_until && (
          <span style={data.expired ? { color: '#B91C1C' } : undefined}>
            {data.expired ? 'Expirou em ' : 'Válida até '}{fmtLongDate(data.valid_until)}
          </span>
        )}
      </div>

      {/* Apresentação */}
      {data.intro && (
        <section className="mt-14">
          <SectionLabel n={next()}>Apresentação</SectionLabel>
          <p className="mt-6 text-[17px] sm:text-[18px] leading-[1.7] whitespace-pre-line" style={{ color: '#3F3A34' }}>{data.intro}</p>
        </section>
      )}

      {/* O que entregamos */}
      <section className="mt-14">
        <SectionLabel n={next()}>O que entregamos</SectionLabel>
        <ul className="mt-4">
          {data.items.map((i, idx) => (
            <li key={idx} className="flex items-start justify-between gap-6 py-5 border-b" style={{ borderColor: LINE }}>
              <div className="min-w-0">
                <p className="font-display text-[19px] sm:text-[21px] font-semibold leading-snug">
                  {Number(i.quantity) > 1 && <span style={{ color: MUTED }}>{i.quantity}× </span>}{i.description}
                </p>
                {i.details && <p className="text-[14.5px] mt-1 leading-relaxed" style={{ color: MUTED }}>{i.details}</p>}
              </div>
              <p className="text-[16px] font-semibold whitespace-nowrap pt-0.5 tabular-nums">
                {fmtBRL(itemTotal(i), true)}
                {i.recurring && <span className="text-[12.5px] font-normal" style={{ color: MUTED }}>/mês</span>}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Investimento */}
      <section className="mt-14">
        <SectionLabel n={next()}>Investimento</SectionLabel>
        <div className="mt-6">
          <div>
            {Number(data.discount) > 0 && (
              <p className="text-[14px] tabular-nums" style={{ color: MUTED }}>
                <span className="line-through">{fmtBRL(subtotal, true)}</span>
                <span className="ml-3 font-semibold" style={{ color: '#15803D' }}>−{fmtBRL(Number(data.discount), true)} de desconto</span>
              </p>
            )}
            <p className="font-display font-extrabold text-[clamp(2.8rem,10vw,4.6rem)] leading-none tracking-[-0.04em] tabular-nums mt-1">
              {fmtBRL(Number(data.total), true)}
              {allMonthly && <span className="font-sans text-[16px] font-medium tracking-normal ml-1" style={{ color: MUTED }}>/mês</span>}
            </p>
          </div>
        </div>
        {(data.payment_terms || data.valid_until) && (
          <dl className="mt-8 grid sm:grid-cols-2 gap-6 text-[14.5px]">
            {data.payment_terms && (
              <div className="border-t pt-4" style={{ borderColor: LINE }}>
                <dt className="text-[11px] uppercase tracking-[0.18em] font-semibold" style={{ color: MUTED }}>Pagamento</dt>
                <dd className="mt-1.5 leading-relaxed">{data.payment_terms}</dd>
              </div>
            )}
            {data.valid_until && (
              <div className="border-t pt-4" style={{ borderColor: LINE }}>
                <dt className="text-[11px] uppercase tracking-[0.18em] font-semibold" style={{ color: MUTED }}>Validade</dt>
                <dd className="mt-1.5" style={data.expired ? { color: '#B91C1C' } : undefined}>
                  {data.expired ? 'Expirou em ' : 'Até '}{fmtLongDate(data.valid_until)}
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {/* Sua resposta */}
      <section ref={responseRef} className="mt-14 scroll-mt-6 print:hidden">
        <SectionLabel n={next()}>Sua resposta</SectionLabel>
        <div className="mt-6">
          {answered ? (
            <div className="flex items-start gap-4">
              {data.status === 'aceita'
                ? <CheckCircle2 className="w-8 h-8 shrink-0" style={{ color: '#15803D' }} />
                : <XCircle className="w-8 h-8 shrink-0" style={{ color: '#B91C1C' }} />}
              <div>
                <p className="font-display text-[26px] font-bold leading-tight">
                  {data.status === 'aceita' ? 'Proposta aceita.' : 'Proposta recusada.'}
                </p>
                <p className="text-[15px] mt-1.5 leading-relaxed" style={{ color: MUTED }}>
                  Por {data.responder_name}{data.responded_at && ` em ${fmtDateTime(data.responded_at)}`}.
                  {data.status === 'aceita' && ` A ${data.agency.name} já foi avisada e vai entrar em contato.`}
                </p>
              </div>
            </div>
          ) : data.expired ? (
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 shrink-0 mt-0.5" style={{ color: '#B91C1C' }} />
              <p className="text-[16px] leading-relaxed">
                O prazo desta proposta terminou. Fale com a {data.agency.name} para receber uma atualizada.
              </p>
            </div>
          ) : mode === 'idle' ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => setMode('aceitar')}
                      className="min-h-[52px] flex-1 rounded-full text-[16px] font-semibold transition-opacity hover:opacity-90"
                      style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
                Aceitar proposta
              </button>
              <button onClick={() => setMode('recusar')}
                      className="min-h-[52px] sm:w-44 rounded-full border text-[15px] transition-colors hover:bg-white"
                      style={{ borderColor: LINE, color: MUTED }}>
                Recusar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-display text-[22px] font-bold">
                {mode === 'aceitar' ? 'Confirme seu aceite' : 'Tudo bem. Pode contar o motivo?'}
              </p>
              <input className={inputClass} style={{ borderColor: LINE, color: INK }}
                     placeholder="Seu nome completo" value={name} onChange={e => setName(e.target.value)} autoFocus />
              {mode === 'recusar' && (
                <textarea className={`${inputClass} h-28 py-3`} style={{ borderColor: LINE, color: INK }}
                          placeholder="Ex: preço, prazo, momento... (opcional)" value={reason} onChange={e => setReason(e.target.value)} />
              )}
              {mode === 'aceitar' && (
                <p className="text-[13px] leading-relaxed" style={{ color: MUTED }}>
                  Ao confirmar, você declara que leu e concorda com esta proposta. Registramos seu nome, a data e o endereço de acesso.
                </p>
              )}
              {error && <p className="text-[14px]" style={{ color: '#B91C1C' }}>{error}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => respond(mode === 'aceitar')} disabled={busy}
                        className="min-h-[52px] flex-1 rounded-full text-[16px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                        style={mode === 'aceitar'
                          ? { background: 'var(--brand)', color: 'var(--on-brand)' }
                          : { background: '#B91C1C', color: '#fff' }}>
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {mode === 'aceitar' ? 'Confirmar aceite' : 'Enviar resposta'}
                </button>
                <button onClick={() => { setMode('idle'); setError('') }} className="px-5 min-h-[52px] rounded-full text-[15px]" style={{ color: MUTED }}>
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="mt-10 flex items-center justify-between gap-3 flex-wrap text-[12px]" style={{ color: MUTED }}>
        {data.content_hash
          ? <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Código do conteúdo aceito: {data.content_hash.slice(0, 24)}</span>
          : <span />}
        <button onClick={() => window.print()} className="flex items-center gap-1.5 hover:underline print:hidden">
          <Printer className="w-3.5 h-3.5" /> Imprimir ou salvar PDF
        </button>
      </div>

      {/* Celular: valor e aceite sempre à mão enquanto lê */}
      {canAnswer && mode === 'idle' && (
        <>
          <div className="h-24 sm:hidden" aria-hidden />
          <div className="sm:hidden fixed bottom-0 inset-x-0 z-20 border-t px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center gap-4 print:hidden"
               style={{ background: 'rgba(246,244,239,0.94)', backdropFilter: 'blur(10px)', borderColor: LINE }}>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: MUTED }}>Investimento</p>
              <p className="font-display text-[20px] font-bold leading-tight tabular-nums truncate">
                {fmtBRL(Number(data.total), true)}{allMonthly && <span className="font-sans text-[12px] font-normal" style={{ color: MUTED }}>/mês</span>}
              </p>
            </div>
            <button onClick={startAccept}
                    className="ml-auto h-12 px-6 rounded-full text-[15px] font-semibold shrink-0"
                    style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
              Aceitar
            </button>
          </div>
        </>
      )}
    </PublicShell>
  )
}
