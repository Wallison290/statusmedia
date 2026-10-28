// ── Contrato público (/contrato/:token) ──────────────────────────────────────
// O cliente lê e assina: nome completo, CPF/CNPJ, e-mail, rubrica desenhada e
// o aceite. Depois de assinado, a mesma página vira o comprovante (com as duas
// assinaturas, data, IP e o código do texto), pronto para salvar em PDF.
// Mesmo padrão da proposta: capa na cor da agência com a logo em destaque e,
// no miolo, o texto organizado em blocos (partes, cláusulas, subcláusulas e
// listas) por contractBlocks.ts. Só a exibição muda: o texto assinado é o mesmo.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Printer, Loader2, ShieldCheck, ArrowDown, Check, PenLine } from 'lucide-react'
import { fetchPublicContract, signPublicContract, type PublicContract } from '@/hooks/useCrmDocuments'
import { SignaturePad } from '@/components/crm/SignaturePad'
import { fmtDateTime, fmtLongDate, isValidCpfCnpj, fmtCpfCnpj, expandToken } from '@/utils/crm'
import { PublicLoading, PublicNotFound, SectionLabel, brandVars, INK, MUTED, LINE, PAPER, inputClass } from './PublicShell'
import { parseContract, type ContractPiece } from './contractBlocks'

const CARD_SHADOW = '0 1px 2px rgba(28,25,23,0.06)'

function Piece({ piece }: { piece: ContractPiece }) {
  if (piece.kind === 'sub') return (
    <div className="grid grid-cols-[3rem_1fr] gap-2">
      <span className="font-display font-bold text-[14px] tabular-nums pt-0.5" style={{ color: 'var(--brand)' }}>{piece.num}</span>
      <p className="whitespace-pre-line">{piece.text}</p>
    </div>
  )
  if (piece.kind === 'label') return (
    <div className="rounded-xl px-4 py-3 border-l-[3px]" style={{ background: 'var(--brand-soft)', borderColor: 'var(--brand)' }}>
      <p className="font-semibold text-[14.5px]" style={{ color: INK }}>{piece.label}</p>
      {piece.text && <p className="mt-0.5 whitespace-pre-line">{piece.text}</p>}
    </div>
  )
  if (piece.kind === 'list') return (
    <ul className="space-y-2.5">
      {piece.items.map((it, i) => (
        <li key={i} className="flex items-start gap-3">
          {it.mark ? (
            <span className="w-6 shrink-0 font-display font-bold text-[14px] pt-0.5" style={{ color: 'var(--brand)' }}>{it.mark}</span>
          ) : (
            <span className="w-5 h-5 mt-[3px] rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--brand-soft)' }}>
              <Check className="w-3 h-3" style={{ color: 'var(--brand)' }} strokeWidth={3} />
            </span>
          )}
          <span>{it.text}</span>
        </li>
      ))}
    </ul>
  )
  // Linha curta terminada em ":" é um subtítulo ("Site institucional:")
  if (!piece.text.includes('\n') && piece.text.length <= 70 && piece.text.endsWith(':')) return (
    <p className="font-semibold pt-1" style={{ color: INK }}>{piece.text.slice(0, -1)}</p>
  )
  return <p className="whitespace-pre-line">{piece.text}</p>
}

export function PublicContractPage() {
  const { token: raw = '' } = useParams()
  const token = expandToken(raw)
  const [data, setData]   = useState<PublicContract | null | undefined>(undefined)
  const [name, setName]   = useState('')
  const [doc, setDoc]     = useState('')
  const [email, setEmail] = useState('')
  const [sig, setSig]     = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const parsed  = useMemo(() => (data ? parseContract(data.content) : null), [data])

  function load() {
    fetchPublicContract(token).then(setData).catch(() => setData(null))
  }
  useEffect(load, [token])

  if (data === undefined) return <PublicLoading />
  if (data === null || !parsed) return <PublicNotFound what="Contrato" />

  const signed = data.status === 'assinado'
  // Rascunho aberto pela agência (migration 111): mesma página, sem assinar
  const preview = data.status === 'rascunho'

  async function sign() {
    setError('')
    if (name.trim().split(/\s+/).length < 2) return setError('Digite seu nome completo.')
    if (!isValidCpfCnpj(doc))                return setError('CPF ou CNPJ inválido.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('E-mail inválido.')
    if (!sig)                                return setError('Faça sua rubrica no quadro.')
    if (!agree)                              return setError('Marque que leu e concorda com o contrato.')
    setBusy(true)
    try {
      const r = await signPublicContract(token, { name: name.trim(), document: doc, email: email.trim(), signature: sig })
      if (!r.ok) return setError(r.error ?? 'Não foi possível assinar.')
      load()
    } catch {
      setError('Não foi possível assinar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const SignBlock = ({ img, who, role, when }: { img: string | null; who: string; role: string; when: string | null }) => (
    <div className="rounded-2xl bg-white p-5 sm:p-6" style={{ boxShadow: CARD_SHADOW }}>
      <div className="h-24 flex items-end">{img && <img src={img} alt={`Assinatura de ${who}`} className="max-h-24" />}</div>
      <div className="border-t pt-2" style={{ borderColor: INK }}>
        <p className="font-semibold text-[14.5px]">{who}</p>
        <p className="text-[12.5px] mt-0.5" style={{ color: MUTED }}>{role}</p>
        {when && <p className="text-[12.5px]" style={{ color: MUTED }}>{fmtDateTime(when)}</p>}
      </div>
    </div>
  )

  const agency   = data.agency
  const hired    = parsed.parties.find(p => p.role.startsWith('CONTRATAD'))
  const client   = parsed.parties.find(p => p.role === 'CONTRATANTE')
  const subtitle = parsed.headings.filter(h => h.toLowerCase() !== data.title.trim().toLowerCase())
  let sec = 0
  const next = () => String(++sec).padStart(2, '0')

  return (
    <div className="min-h-screen print:min-h-0" style={{ background: PAPER, color: INK, ...brandVars(agency?.color) }}>
      {preview && (
        <div className="sticky top-0 z-30 px-5 py-2.5 text-center text-[13px] font-medium print:hidden" style={{ background: INK, color: '#FAF8F4' }}>
          Pré-visualização: é assim que o cliente vai ver. O link só passa a funcionar para ele depois de enviar.
        </div>
      )}

      {/* ── Capa na cor da agência ── */}
      <header className="relative overflow-hidden min-h-[82svh] sm:min-h-[72vh] flex flex-col print:min-h-0 print:py-10"
              style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
        <div aria-hidden className="absolute inset-0 pointer-events-none"
             style={{ background: 'radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.20), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(0,0,0,0.25), transparent 60%)' }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[0.07]"
             style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '56px 56px', maskImage: 'linear-gradient(to bottom, black, transparent 85%)', WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 85%)' }} />

        <div className="relative mx-auto w-full max-w-3xl px-5 sm:px-8 pt-8 sm:pt-12 flex items-center gap-4">
          {agency.logo ? (
            <span className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white flex items-center justify-center p-2.5 shrink-0"
                  style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.22)' }}>
              <img src={agency.logo} alt={agency.name} className="max-w-full max-h-full object-contain rounded-xl" />
            </span>
          ) : (
            <span className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl flex items-center justify-center font-display font-extrabold text-[38px] shrink-0"
                  style={{ background: 'rgba(255,255,255,0.16)' }}>
              {agency.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-display text-[20px] sm:text-[24px] font-bold tracking-[-0.02em] leading-tight">{agency.name}</p>
            <p className="text-[13px] opacity-75 mt-0.5">Contrato digital</p>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-3xl px-5 sm:px-8 flex-1 flex flex-col justify-center py-12">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.26em] opacity-75">
            {signed ? 'Contrato assinado' : 'Contrato para assinatura'}
          </p>
          <h1 className="font-display font-extrabold mt-5 text-[clamp(2.4rem,8vw,4.6rem)] leading-[0.95] tracking-[-0.04em] [text-wrap:balance]">
            {data.title}
          </h1>
          {subtitle.map(h => (
            <p key={h} className="mt-4 text-[12.5px] sm:text-[13.5px] font-semibold uppercase tracking-[0.16em] opacity-80">{h}</p>
          ))}
          {client && (
            <p className="mt-7 text-[16px] sm:text-[18px] opacity-90 leading-snug">
              Entre <strong className="font-semibold">{hired?.name ?? agency.name}</strong> e <strong className="font-semibold">{client.name}</strong>
            </p>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-3xl px-5 sm:px-8 pb-7 sm:pb-10 flex items-end justify-between gap-4 flex-wrap">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            {data.sent_at && (
              <span className="px-3 h-8 inline-flex items-center rounded-full" style={{ background: 'rgba(255,255,255,0.14)' }}>
                Enviado em {fmtLongDate(data.sent_at)}
              </span>
            )}
            {parsed.clauses.length > 0 && (
              <span className="px-3 h-8 inline-flex items-center rounded-full" style={{ background: 'rgba(255,255,255,0.14)' }}>
                {parsed.clauses.length} cláusulas
              </span>
            )}
            <span className="px-3 h-8 inline-flex items-center gap-1.5 rounded-full font-medium" style={{ background: 'rgba(255,255,255,0.92)', color: INK }}>
              {signed ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#15803D' }} /> : <PenLine className="w-3.5 h-3.5" />}
              {signed ? `Assinado${data.signed_at ? ` em ${fmtLongDate(data.signed_at)}` : ''}` : 'Aguardando sua assinatura'}
            </span>
          </div>
          <button onClick={() => bodyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="inline-flex items-center gap-2 text-[13.5px] font-medium opacity-90 hover:opacity-100 print:hidden">
            Ler o contrato
            <span className="w-9 h-9 rounded-full flex items-center justify-center animate-bounce" style={{ background: 'rgba(255,255,255,0.18)' }}>
              <ArrowDown className="w-4 h-4" />
            </span>
          </button>
        </div>
      </header>

      {/* ── Miolo ── */}
      <div ref={bodyRef} className="mx-auto max-w-3xl px-5 sm:px-8 pt-14 sm:pt-20 pb-16 print:pt-8 text-[15.5px] leading-[1.75]" style={{ color: '#2E2A25' }}>

        {parsed.parties.length > 0 && (
          <section>
            <SectionLabel n={next()}>As partes</SectionLabel>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {parsed.parties.map(p => (
                <div key={p.role + p.name} className="rounded-2xl bg-white p-5 sm:p-6" style={{ boxShadow: CARD_SHADOW }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--brand)' }}>{p.role}</p>
                  <p className="font-display text-[19px] font-bold leading-snug mt-2" style={{ color: INK }}>{p.name}</p>
                  {p.text.length > p.name.length + 2 && (
                    <p className="text-[13.5px] leading-relaxed mt-2" style={{ color: MUTED }}>{p.text.slice(p.name.length).replace(/^[\s,.–—-]+/, '')}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {parsed.intro.length > 0 && (
          <div className={`space-y-4 ${sec ? 'mt-10' : ''}`}>
            {parsed.intro.map((pc, i) => <Piece key={i} piece={pc} />)}
          </div>
        )}

        {parsed.clauses.length > 0 ? (
          <section className={sec ? 'mt-16' : ''}>
            <SectionLabel n={next()}>Cláusulas</SectionLabel>
            {/* Sumário: atalho para cada cláusula */}
            <nav className="mt-6 flex flex-wrap gap-2 print:hidden">
              {parsed.clauses.map(c => (
                <a key={c.num} href={`#clausula-${c.num}`}
                   className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-white text-[12.5px] font-medium transition-colors hover:bg-[var(--brand-soft)]"
                   style={{ color: INK, boxShadow: CARD_SHADOW }}>
                  <span className="font-display font-bold" style={{ color: 'var(--brand)' }}>{c.num}</span>
                  <span className="first-letter:uppercase">{c.title.toLocaleLowerCase('pt-BR')}</span>
                </a>
              ))}
            </nav>
            <div className="mt-8 space-y-5">
              {parsed.clauses.map(c => (
                <article key={c.num} id={`clausula-${c.num}`} className="scroll-mt-6 rounded-3xl bg-white p-6 sm:p-8"
                         style={{ boxShadow: CARD_SHADOW }}>
                  <header className="flex items-center gap-4 pb-5 mb-5 border-b" style={{ borderColor: LINE }}>
                    <span className="w-12 h-12 rounded-2xl flex items-center justify-center font-display font-extrabold text-[20px] shrink-0"
                          style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
                      {c.num}
                    </span>
                    <h2 className="font-display font-bold text-[19px] sm:text-[22px] leading-tight tracking-[-0.02em]" style={{ color: INK }}>
                      {c.title}
                    </h2>
                  </header>
                  <div className="space-y-4">
                    {c.pieces.map((pc, i) => <Piece key={i} piece={pc} />)}
                  </div>
                </article>
              ))}
            </div>
            {parsed.closing && <p className="mt-8 text-right italic" style={{ color: MUTED }}>{parsed.closing}</p>}
          </section>
        ) : (
          <section className={sec ? 'mt-16' : ''}>
            <SectionLabel n={next()}>Termos</SectionLabel>
            <article className="mt-6 rounded-3xl bg-white p-6 sm:p-8 whitespace-pre-line" style={{ boxShadow: CARD_SHADOW }}>
              {data.content}
            </article>
          </section>
        )}

        <section className="mt-16">
          <SectionLabel n={next()}>Assinaturas</SectionLabel>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <SignBlock img={data.agency_signature} who={agency.name}
                       role={`Contratada${data.agency_signer_name ? ` · ${data.agency_signer_name}` : ''}`} when={data.agency_signed_at} />
            <SignBlock img={data.signature} who={data.signer_name ?? 'Aguardando assinatura'}
                       role={`Contratante${data.signer_document ? ` · doc. ${data.signer_document}` : ''}`} when={data.signed_at} />
          </div>
        </section>

        {signed ? (
          <section className="mt-16">
            <SectionLabel n={next()}>Registro</SectionLabel>
            <div className="mt-6 flex items-start gap-4 print:hidden">
              <CheckCircle2 className="w-8 h-8 shrink-0" style={{ color: '#15803D' }} />
              <div>
                <p className="font-display text-[24px] font-bold leading-tight" style={{ color: INK }}>Contrato assinado.</p>
                <p className="text-[15px] mt-1" style={{ color: MUTED }}>Guarde uma cópia: use "Imprimir ou salvar PDF" abaixo.</p>
              </div>
            </div>
            <div className="mt-6 text-[12.5px] leading-relaxed space-y-1" style={{ color: MUTED }}>
              <p className="flex items-center gap-1.5 font-semibold" style={{ color: INK }}>
                <ShieldCheck className="w-4 h-4" /> Registro da assinatura eletrônica
              </p>
              <p>Assinado por {data.signer_name}{data.signed_at && ` em ${fmtDateTime(data.signed_at)}`}{data.sign_ip && ` · IP ${data.sign_ip}`}</p>
              {data.content_hash && <p className="break-all">Código do texto assinado (SHA-256): {data.content_hash}</p>}
            </div>
          </section>
        ) : (
          <section className="mt-16 print:hidden">
            <SectionLabel n={next()}>Assinar</SectionLabel>
            <div className="mt-6 rounded-3xl bg-white p-6 sm:p-8 space-y-3" style={{ boxShadow: CARD_SHADOW }}>
              <input className={inputClass} style={{ borderColor: LINE, color: INK }}
                     placeholder="Nome completo" value={name} onChange={e => setName(e.target.value)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={inputClass} style={{ borderColor: LINE, color: INK }} inputMode="numeric"
                       placeholder="CPF ou CNPJ" value={doc} onChange={e => setDoc(fmtCpfCnpj(e.target.value))} />
                <input className={inputClass} style={{ borderColor: LINE, color: INK }} type="email"
                       placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <SignaturePad onChange={setSig} border={LINE} />
              <label className="flex items-start gap-3 text-[14px] leading-relaxed cursor-pointer" style={{ color: '#3F3A34' }}>
                <input type="checkbox" className="mt-1 w-4 h-4 accent-[var(--brand)]" checked={agree} onChange={e => setAgree(e.target.checked)} />
                Li o contrato inteiro e concordo com os termos. Entendo que esta assinatura eletrônica tem validade jurídica e que serão registrados meu nome, documento, e-mail, data, hora e endereço de acesso.
              </label>
              {error && <p className="text-[14px]" style={{ color: '#B91C1C' }}>{error}</p>}
              <button onClick={sign} disabled={busy || preview}
                      className="w-full min-h-[52px] rounded-full text-[16px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity hover:opacity-90"
                      style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {preview ? 'Assinar contrato (o cliente assina aqui)' : 'Assinar contrato'}
              </button>
            </div>
          </section>
        )}

        <div className="mt-10 flex justify-end text-[12px] print:hidden" style={{ color: MUTED }}>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 hover:underline">
            <Printer className="w-3.5 h-3.5" /> Imprimir ou salvar PDF
          </button>
        </div>

        <p className="mt-16 pt-6 border-t text-[11.5px] print:hidden" style={{ borderColor: LINE, color: MUTED }}>
          Documento enviado por {agency.name} · StatusMedia
        </p>
      </div>
    </div>
  )
}
