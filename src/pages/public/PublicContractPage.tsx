// ── Contrato público (/contrato/:token) ──────────────────────────────────────
// O cliente lê e assina: nome completo, CPF/CNPJ, e-mail, rubrica desenhada e
// o aceite. Depois de assinado, a mesma página vira o comprovante (com as duas
// assinaturas, data, IP e o código do texto), pronto para salvar em PDF.
// Mesmo padrão editorial da proposta, na cor da agência.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Printer, Loader2, ShieldCheck } from 'lucide-react'
import { fetchPublicContract, signPublicContract, type PublicContract } from '@/hooks/useCrmDocuments'
import { SignaturePad } from '@/components/crm/SignaturePad'
import { fmtDateTime, fmtLongDate, isValidCpfCnpj, fmtCpfCnpj } from '@/utils/crm'
import { PublicShell, PublicLoading, PublicNotFound, SectionLabel, INK, MUTED, LINE, inputClass } from './PublicShell'

export function PublicContractPage() {
  const { token = '' } = useParams()
  const [data, setData]   = useState<PublicContract | null | undefined>(undefined)
  const [name, setName]   = useState('')
  const [doc, setDoc]     = useState('')
  const [email, setEmail] = useState('')
  const [sig, setSig]     = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  function load() {
    fetchPublicContract(token).then(setData).catch(() => setData(null))
  }
  useEffect(load, [token])

  if (data === undefined) return <PublicLoading />
  if (data === null)      return <PublicNotFound what="Contrato" />

  const signed = data.status === 'assinado'

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
    <div>
      <div className="h-24 flex items-end">{img && <img src={img} alt={`Assinatura de ${who}`} className="max-h-24" />}</div>
      <div className="border-t pt-2" style={{ borderColor: INK }}>
        <p className="font-semibold text-[14.5px]">{who}</p>
        <p className="text-[12.5px] mt-0.5" style={{ color: MUTED }}>{role}</p>
        {when && <p className="text-[12.5px]" style={{ color: MUTED }}>{fmtDateTime(when)}</p>}
      </div>
    </div>
  )

  return (
    <PublicShell agency={data.agency} wide>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand)' }}>
        {signed ? 'Contrato assinado' : 'Contrato para assinatura'}
      </p>
      <h1 className="font-display font-extrabold mt-4 text-[clamp(2.1rem,6.5vw,3.8rem)] leading-[0.97] tracking-[-0.03em]">
        {data.title}
      </h1>
      {data.sent_at && (
        <p className="mt-5 text-[14px]" style={{ color: MUTED }}>Enviado em {fmtLongDate(data.sent_at)}</p>
      )}

      <section className="mt-14">
        <SectionLabel n="01">Termos</SectionLabel>
        <article className="mt-6 text-[15.5px] leading-[1.8] whitespace-pre-line" style={{ color: '#2E2A25' }}>
          {data.content}
        </article>
      </section>

      <section className="mt-14">
        <SectionLabel n="02">Assinaturas</SectionLabel>
        <div className="mt-6 grid gap-10 sm:grid-cols-2">
          <SignBlock img={data.agency_signature} who={data.agency.name}
                     role={`Contratada${data.agency_signer_name ? ` · ${data.agency_signer_name}` : ''}`} when={data.agency_signed_at} />
          <SignBlock img={data.signature} who={data.signer_name ?? 'Aguardando assinatura'}
                     role={`Contratante${data.signer_document ? ` · doc. ${data.signer_document}` : ''}`} when={data.signed_at} />
        </div>
      </section>

      {signed ? (
        <section className="mt-14">
          <SectionLabel n="03">Registro</SectionLabel>
          <div className="mt-6 flex items-start gap-4 print:hidden">
            <CheckCircle2 className="w-8 h-8 shrink-0" style={{ color: '#15803D' }} />
            <div>
              <p className="font-display text-[24px] font-bold leading-tight">Contrato assinado.</p>
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
        <section className="mt-14 print:hidden">
          <SectionLabel n="03">Assinar</SectionLabel>
          <div className="mt-6 space-y-3">
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
            <button onClick={sign} disabled={busy}
                    className="w-full min-h-[52px] rounded-full text-[16px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity hover:opacity-90"
                    style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Assinar contrato
            </button>
          </div>
        </section>
      )}

      <div className="mt-10 flex justify-end text-[12px] print:hidden" style={{ color: MUTED }}>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 hover:underline">
          <Printer className="w-3.5 h-3.5" /> Imprimir ou salvar PDF
        </button>
      </div>
    </PublicShell>
  )
}
