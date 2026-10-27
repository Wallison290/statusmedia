// ── Proposta pública (/proposta/:token) ──────────────────────────────────────
// O cliente da agência lê a proposta e responde ali mesmo. Aceitar pede o nome
// completo (fica registrado com data, IP e um código do conteúdo aceito).
//
// Layout "capa de impacto": a primeira tela inteira na cor da agência (logo,
// título, para quem é e validade). Ao rolar, o miolo claro com seções
// numeradas: Apresentação, O que entregamos (ou o PDF anexado), Investimento
// num bloco escuro e Sua resposta. No celular, uma barra fixa com o valor e o
// botão de aceitar acompanha a leitura.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Printer, Loader2, ShieldCheck, Clock, Check, ArrowDown, CalendarClock } from 'lucide-react'
import { fetchPublicProposal, respondPublicProposal, type PublicProposal } from '@/hooks/useCrmDocuments'
import { fmtBRL, fmtLongDate, fmtDateTime, itemTotal, expandToken } from '@/utils/crm'
import { PublicLoading, PublicNotFound, SectionLabel, brandVars, INK, MUTED, LINE, PAPER, inputClass } from './PublicShell'
import { PublicPdfPages } from './PublicPdfPages'

export function PublicProposalPage() {
  const { token: raw = '' } = useParams()
  const token = expandToken(raw)
  const [data, setData]     = useState<PublicProposal | null | undefined>(undefined)
  const [mode, setMode]     = useState<'idle' | 'aceitar' | 'recusar'>('idle')
  const [name, setName]     = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const bodyRef     = useRef<HTMLDivElement>(null)
  const responseRef = useRef<HTMLElement>(null)

  function load() {
    fetchPublicProposal(token).then(setData).catch(() => setData(null))
  }
  useEffect(load, [token])

  if (data === undefined) return <PublicLoading />
  if (data === null)      return <PublicNotFound what="Proposta" />

  const isPdf = !!data.pdf_url
  // Várias opções: o cliente escolhe uma (a aceita, a tocada, a recomendada ou a primeira)
  const options  = isPdf ? [] : data.options ?? []
  const multi    = options.length > 0
  const chosenId = data.accepted_option ?? picked ?? options.find(o => o.recommended)?.id ?? options[0]?.id ?? null
  const chosen   = options.find(o => o.id === chosenId) ?? null
  const shownItems = chosen ? chosen.items : data.items
  const shownTotal = chosen ? Number(chosen.total ?? 0) : Number(data.total)
  const subtotal = data.items.reduce((s, i) => s + itemTotal(i), 0)
  const allMonthly = shownItems.length > 0 && shownItems.every(i => i.recurring)
  const hasValue = shownTotal > 0
  const answered = data.status === 'aceita' || data.status === 'recusada'
  // Rascunho aberto pela agência (migration 108): mesma página, sem responder
  const preview = data.status === 'rascunho'
  const canAnswer = !answered && !data.expired && !preview
  const client = data.lead ? (data.lead.company || data.lead.name) : null
  const agency = data.agency

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
      const r = await respondPublicProposal(token, accept, name.trim(), reason.trim() || undefined, multi ? chosenId : null)
      if (!r.ok) { setError(r.error ?? 'Não foi possível registrar sua resposta.'); return }
      load()
      setMode('idle')
    } catch {
      setError('Não foi possível registrar sua resposta. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const perMonth = (cls: string) => allMonthly && <span className={cls}>/mês</span>

  return (
    <div className="min-h-screen print:min-h-0" style={{ background: PAPER, color: INK, ...brandVars(agency?.color) }}>

      {preview && (
        <div className='sticky top-0 z-30 px-5 py-2.5 text-center text-[13px] font-medium print:hidden' style={{ background: INK, color: '#FAF8F4' }}>
          Pré-visualização: é assim que o cliente vai ver. O link só passa a funcionar para ele depois de enviar.
        </div>
      )}

      {/* ── Capa: a primeira tela inteira na cor da agência ── */}
      <header className="relative overflow-hidden min-h-[88svh] sm:min-h-[78vh] flex flex-col print:min-h-0 print:py-10"
              style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
        {/* Luz e textura discretas por cima da cor */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
             style={{ background: 'radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.22), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(0,0,0,0.22), transparent 60%)' }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[0.07]"
             style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '56px 56px', maskImage: 'linear-gradient(to bottom, black, transparent 85%)', WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 85%)' }} />
        <span aria-hidden className="absolute -right-6 sm:right-6 bottom-6 font-display font-extrabold leading-none select-none pointer-events-none opacity-[0.08] text-[46vw] sm:text-[22rem] tracking-[-0.06em]">
          {agency.name.slice(0, 1).toUpperCase()}
        </span>

        <div className="relative mx-auto w-full max-w-3xl px-5 sm:px-8 pt-6 sm:pt-10 flex items-center gap-3">
          {agency.logo ? (
            <img src={agency.logo} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-white/30 bg-white" />
          ) : (
            <div className="w-11 h-11 rounded-full flex items-center justify-center font-display font-bold text-[18px] ring-2 ring-white/25"
                 style={{ background: 'rgba(255,255,255,0.16)' }}>
              {agency.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="font-display text-[17px] font-bold tracking-[-0.01em]">{agency.name}</span>
        </div>

        <div className="relative mx-auto w-full max-w-3xl px-5 sm:px-8 flex-1 flex flex-col justify-center py-12">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.26em] opacity-75">Proposta comercial</p>
          <h1 className="font-display font-extrabold mt-5 text-[clamp(2.6rem,9vw,5.2rem)] leading-[0.92] tracking-[-0.04em] [text-wrap:balance]">
            {data.title}
          </h1>
          {client && (
            <p className="mt-6 text-[17px] sm:text-[19px] opacity-90">
              Preparada para <strong className="font-semibold">{client}</strong>
            </p>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-3xl px-5 sm:px-8 pb-6 sm:pb-10 flex items-end justify-between gap-4 flex-wrap">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            {data.sent_at && (
              <span className="px-3 h-8 inline-flex items-center rounded-full" style={{ background: 'rgba(255,255,255,0.14)' }}>
                Enviada em {fmtLongDate(data.sent_at)}
              </span>
            )}
            {data.valid_until && (
              <span className="px-3 h-8 inline-flex items-center gap-1.5 rounded-full font-medium"
                    style={data.expired ? { background: '#FEE2E2', color: '#B91C1C' } : { background: 'rgba(255,255,255,0.92)', color: INK }}>
                <CalendarClock className="w-3.5 h-3.5" />
                {data.expired ? 'Expirou em ' : 'Válida até '}{fmtLongDate(data.valid_until)}
              </span>
            )}
          </div>
          <button onClick={() => bodyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="inline-flex items-center gap-2 text-[13.5px] font-medium opacity-90 hover:opacity-100 print:hidden">
            Ler a proposta
            <span className="w-9 h-9 rounded-full flex items-center justify-center animate-bounce" style={{ background: 'rgba(255,255,255,0.18)' }}>
              <ArrowDown className="w-4 h-4" />
            </span>
          </button>
        </div>
      </header>

      {/* ── Miolo ── */}
      <div ref={bodyRef} className="mx-auto max-w-3xl px-5 sm:px-8 pt-14 sm:pt-20 pb-16 scroll-mt-0 print:pt-8">

        {/* Apresentação */}
        {data.intro && (
          <section>
            <SectionLabel n={next()}>Apresentação</SectionLabel>
            <p className="mt-6 text-[18px] sm:text-[20px] leading-[1.65] whitespace-pre-line" style={{ color: '#3F3A34' }}>{data.intro}</p>
          </section>
        )}

        {/* PDF anexado: a proposta é o próprio arquivo */}
        {isPdf && (
          <section className={n ? 'mt-16' : ''}>
            <SectionLabel n={next()}>A proposta</SectionLabel>
            <div className="mt-6">
              <PublicPdfPages token={token} name={data.pdf_name} preview={preview} directUrl={data.pdf_url} />
            </div>
          </section>
        )}

        {/* Várias opções: cartões lado a lado, o cliente toca para escolher */}
        {multi && (
          <section className={n ? 'mt-16' : ''}>
            <SectionLabel n={next()}>{answered ? 'Opção escolhida' : 'Escolha sua opção'}</SectionLabel>
            <div className={`mt-7 grid gap-4 ${options.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {options.map(o => {
                const sel = o.id === chosenId
                const monthly = o.items.length > 0 && o.items.every(i => i.recurring)
                const sub = o.items.reduce((s, i) => s + itemTotal(i), 0)
                return (
                  <button key={o.id} type="button" disabled={!canAnswer} onClick={() => setPicked(o.id)} aria-pressed={sel}
                    className="relative text-left rounded-3xl border-2 p-6 flex flex-col transition-all disabled:cursor-default bg-white"
                    style={{
                      borderColor: sel ? 'var(--brand)' : 'transparent',
                      boxShadow: sel ? '0 18px 40px -18px rgba(28,25,23,0.35)' : '0 1px 2px rgba(28,25,23,0.06)',
                      opacity: answered && !sel ? 0.45 : 1,
                    }}>
                    {o.recommended && (
                      <span className="absolute -top-3 left-6 text-[10.5px] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full"
                        style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>Recomendada</span>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display text-[22px] font-bold leading-tight">{o.name}</p>
                      <span className="w-6 h-6 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors"
                            style={{ borderColor: sel ? 'var(--brand)' : LINE, background: sel ? 'var(--brand)' : 'transparent' }}>
                        {sel && <Check className="w-3.5 h-3.5" style={{ color: 'var(--on-brand)' }} strokeWidth={3} />}
                      </span>
                    </div>
                    {o.description && <p className="text-[14px] mt-1 leading-relaxed" style={{ color: MUTED }}>{o.description}</p>}
                    <p className="font-display font-extrabold text-[32px] leading-none tracking-[-0.03em] tabular-nums mt-5">
                      {fmtBRL(Number(o.total ?? 0), true)}
                      {monthly && <span className="font-sans text-[13px] font-medium tracking-normal ml-1" style={{ color: MUTED }}>/mês</span>}
                    </p>
                    {Number(o.discount) > 0 && (
                      <p className="text-[12.5px] mt-1.5 tabular-nums" style={{ color: MUTED }}>
                        <span className="line-through">{fmtBRL(sub, true)}</span>
                        <span className="ml-2 font-semibold" style={{ color: '#15803D' }}>−{fmtBRL(Number(o.discount), true)}</span>
                      </p>
                    )}
                    <ul className="mt-5 space-y-3 border-t pt-5" style={{ borderColor: LINE }}>
                      {o.items.map((i, idx) => (
                        <li key={idx} className="flex gap-2.5 text-[14px]">
                          <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--brand)' }} strokeWidth={2.5} />
                          <div className="min-w-0">
                            <p className="font-semibold leading-snug">{Number(i.quantity) > 1 && <span style={{ color: MUTED }}>{i.quantity}× </span>}{i.description}</p>
                            {i.details && <p className="text-[13px] mt-0.5 leading-relaxed" style={{ color: MUTED }}>{i.details}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>
            {canAnswer && <p className="text-[13px] mt-4" style={{ color: MUTED }}>Toque numa opção para escolher e aceite no fim da página.</p>}
            {data.payment_terms && (
              <div className="mt-8 rounded-2xl bg-white px-5 py-4 text-[14.5px]">
                <p className="text-[11px] uppercase tracking-[0.18em] font-semibold" style={{ color: MUTED }}>Pagamento</p>
                <p className="mt-1.5 leading-relaxed">{data.payment_terms}</p>
              </div>
            )}
          </section>
        )}

        {/* O que entregamos */}
        {!multi && !isPdf && (
          <section className={n ? 'mt-16' : ''}>
            <SectionLabel n={next()}>O que entregamos</SectionLabel>
            <ul className="mt-7 space-y-3">
              {data.items.map((i, idx) => (
                <li key={idx} className="rounded-2xl bg-white p-5 sm:p-6 flex items-start gap-4" style={{ boxShadow: '0 1px 2px rgba(28,25,23,0.06)' }}>
                  <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--brand-soft)' }}>
                    <Check className="w-4 h-4" style={{ color: 'var(--brand)' }} strokeWidth={2.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[18px] sm:text-[20px] font-semibold leading-snug">
                      {Number(i.quantity) > 1 && <span style={{ color: MUTED }}>{i.quantity}× </span>}{i.description}
                    </p>
                    {i.details && <p className="text-[14.5px] mt-1 leading-relaxed" style={{ color: MUTED }}>{i.details}</p>}
                  </div>
                  <p className="text-[15px] font-semibold whitespace-nowrap pt-1 tabular-nums">
                    {fmtBRL(itemTotal(i), true)}
                    {i.recurring && <span className="text-[12px] font-normal" style={{ color: MUTED }}>/mês</span>}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Investimento: bloco escuro, o número em destaque */}
        {!multi && (hasValue || data.payment_terms || data.valid_until) && (
          <section className={n ? 'mt-16' : ''}>
            <SectionLabel n={next()}>Investimento</SectionLabel>
            <div className="mt-7 rounded-3xl p-6 sm:p-9 relative overflow-hidden print:border" style={{ background: INK, color: '#FAF8F4' }}>
              <div aria-hidden className="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-30 blur-3xl" style={{ background: 'var(--brand)' }} />
              {hasValue && (
                <div className="relative">
                  <p className="text-[11px] uppercase tracking-[0.22em] font-semibold" style={{ color: 'rgba(250,248,244,0.6)' }}>
                    {allMonthly ? 'Investimento mensal' : 'Investimento'}
                  </p>
                  {Number(data.discount) > 0 && (
                    <p className="text-[14px] tabular-nums mt-3" style={{ color: 'rgba(250,248,244,0.6)' }}>
                      <span className="line-through">{fmtBRL(subtotal, true)}</span>
                      <span className="ml-3 font-semibold" style={{ color: '#86EFAC' }}>−{fmtBRL(Number(data.discount), true)} de desconto</span>
                    </p>
                  )}
                  <p className="font-display font-extrabold text-[clamp(2.8rem,11vw,5rem)] leading-none tracking-[-0.04em] tabular-nums mt-2">
                    {fmtBRL(Number(data.total), true)}
                    {perMonth('font-sans text-[17px] font-medium tracking-normal ml-1.5 opacity-60')}
                  </p>
                </div>
              )}
              {(data.payment_terms || data.valid_until) && (
                <dl className={`relative grid sm:grid-cols-2 gap-5 text-[14.5px] ${hasValue ? 'mt-8 pt-6 border-t' : ''}`} style={{ borderColor: 'rgba(250,248,244,0.14)' }}>
                  {data.payment_terms && (
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.18em] font-semibold" style={{ color: 'rgba(250,248,244,0.55)' }}>Pagamento</dt>
                      <dd className="mt-1.5 leading-relaxed">{data.payment_terms}</dd>
                    </div>
                  )}
                  {data.valid_until && (
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.18em] font-semibold" style={{ color: 'rgba(250,248,244,0.55)' }}>Validade</dt>
                      <dd className="mt-1.5" style={data.expired ? { color: '#FCA5A5' } : undefined}>
                        {data.expired ? 'Expirou em ' : 'Até '}{fmtLongDate(data.valid_until)}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          </section>
        )}

        {/* Sua resposta */}
        <section ref={responseRef} className="mt-16 scroll-mt-6 print:hidden">
          <SectionLabel n={next()}>Sua resposta</SectionLabel>
          <div className="mt-7 rounded-3xl bg-white p-6 sm:p-8" style={{ boxShadow: '0 1px 2px rgba(28,25,23,0.06)' }}>
            {answered ? (
              <div className="flex items-start gap-4">
                {data.status === 'aceita'
                  ? <CheckCircle2 className="w-9 h-9 shrink-0" style={{ color: '#15803D' }} />
                  : <XCircle className="w-9 h-9 shrink-0" style={{ color: '#B91C1C' }} />}
                <div>
                  <p className="font-display text-[26px] font-bold leading-tight">
                    {data.status === 'aceita' ? (chosen ? `Proposta aceita: ${chosen.name}.` : 'Proposta aceita.') : 'Proposta recusada.'}
                  </p>
                  <p className="text-[15px] mt-1.5 leading-relaxed" style={{ color: MUTED }}>
                    Por {data.responder_name}{data.responded_at && ` em ${fmtDateTime(data.responded_at)}`}.
                    {data.status === 'aceita' && ` A ${agency.name} já foi avisada e vai entrar em contato.`}
                  </p>
                </div>
              </div>
            ) : data.expired ? (
              <div className="flex items-start gap-3">
                <Clock className="w-6 h-6 shrink-0 mt-0.5" style={{ color: '#B91C1C' }} />
                <p className="text-[16px] leading-relaxed">
                  O prazo desta proposta terminou. Fale com a {agency.name} para receber uma atualizada.
                </p>
              </div>
            ) : mode === 'idle' || preview ? (
              <>
                <p className="font-display text-[24px] sm:text-[28px] font-bold leading-tight tracking-[-0.02em]">
                  Vamos começar?
                </p>
                <p className="text-[15px] mt-1.5 leading-relaxed" style={{ color: MUTED }}>
                  Aceite por aqui e a {agency.name} recebe na hora para dar o próximo passo.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <button onClick={() => setMode('aceitar')} disabled={preview}
                          className="min-h-[54px] flex-1 rounded-full text-[16px] font-semibold transition-opacity hover:opacity-90"
                          style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
                    {chosen ? `Aceitar ${chosen.name}` : 'Aceitar proposta'}
                  </button>
                  <button onClick={() => setMode('recusar')} disabled={preview}
                          className="min-h-[54px] sm:w-44 rounded-full border text-[15px] transition-colors hover:bg-[#F6F4EF]"
                          style={{ borderColor: LINE, color: MUTED }}>
                    Recusar
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="font-display text-[22px] font-bold">
                  {mode === 'aceitar' ? (chosen ? `Confirme seu aceite: ${chosen.name}` : 'Confirme seu aceite') : 'Tudo bem. Pode contar o motivo?'}
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
          {!isPdf && (
            <button onClick={() => window.print()} className="flex items-center gap-1.5 hover:underline print:hidden">
              <Printer className="w-3.5 h-3.5" /> Imprimir ou salvar PDF
            </button>
          )}
        </div>

        <p className="mt-12 pt-6 border-t text-[11.5px] print:hidden" style={{ borderColor: LINE, color: MUTED }}>
          Documento enviado por {agency.name} · StatusMedia
        </p>
      </div>

      {/* Celular: valor e aceite sempre à mão enquanto lê */}
      {(canAnswer || preview) && mode === 'idle' && (
        <>
          <div className="h-24 sm:hidden" aria-hidden />
          <div className="sm:hidden fixed bottom-0 inset-x-0 z-20 border-t px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center gap-4 print:hidden"
               style={{ background: 'rgba(246,244,239,0.94)', backdropFilter: 'blur(10px)', borderColor: LINE }}>
            <div className="min-w-0">
              {hasValue ? (
                <>
                  <p className="text-[11px] uppercase tracking-[0.16em] truncate" style={{ color: MUTED }}>{chosen ? chosen.name : 'Investimento'}</p>
                  <p className="font-display text-[20px] font-bold leading-tight tabular-nums truncate">
                    {fmtBRL(shownTotal, true)}{perMonth('font-sans text-[12px] font-normal opacity-60')}
                  </p>
                </>
              ) : (
                <p className="font-display text-[16px] font-bold leading-tight truncate">{data.title}</p>
              )}
            </div>
            <button onClick={startAccept} disabled={preview}
                    className="ml-auto h-12 px-6 rounded-full text-[15px] font-semibold shrink-0"
                    style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
              Aceitar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
