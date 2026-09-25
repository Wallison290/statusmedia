// ── Contrato público (/contrato/:token) ──────────────────────────────────────
// O cliente lê e assina: nome completo, CPF/CNPJ, e-mail, rubrica desenhada e
// o aceite. Depois de assinado, a mesma página vira o comprovante (com as duas
// assinaturas, data, IP e o código do texto), pronto para salvar em PDF.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Printer, Loader2, ShieldCheck } from 'lucide-react'
import { fetchPublicContract, signPublicContract, type PublicContract } from '@/hooks/useCrmDocuments'
import { SignaturePad } from '@/components/crm/SignaturePad'
import { fmtDateTime, isValidCpfCnpj, fmtCpfCnpj } from '@/utils/crm'
import { PublicShell, PublicLoading, PublicNotFound, INK, MUTED, LINE, BRAND, inputClass } from './PublicShell'

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

  return (
    <PublicShell agency={data.agency} wide>
      <p className="text-[12px] uppercase tracking-widest font-semibold" style={{ color: BRAND }}>Contrato</p>
      <h1 className="text-[22px] sm:text-[26px] font-bold leading-tight mt-1" style={{ color: INK }}>{data.title}</h1>

      <article className="mt-6 text-[14px] leading-relaxed whitespace-pre-line" style={{ color: '#1e293b' }}>
        {data.content}
      </article>

      {/* Assinaturas */}
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="h-20 flex items-end">
            {data.agency_signature && <img src={data.agency_signature} alt="Assinatura da contratada" className="max-h-20" />}
          </div>
          <div className="border-t pt-1.5 text-[12px]" style={{ borderColor: INK, color: MUTED }}>
            <p className="font-semibold" style={{ color: INK }}>{data.agency.name}</p>
            <p>CONTRATADA{data.agency_signer_name && ` · ${data.agency_signer_name}`}</p>
            {data.agency_signed_at && <p>{fmtDateTime(data.agency_signed_at)}</p>}
          </div>
        </div>
        <div>
          <div className="h-20 flex items-end">
            {data.signature && <img src={data.signature} alt="Assinatura do contratante" className="max-h-20" />}
          </div>
          <div className="border-t pt-1.5 text-[12px]" style={{ borderColor: INK, color: MUTED }}>
            <p className="font-semibold" style={{ color: INK }}>{data.signer_name ?? 'Contratante'}</p>
            <p>CONTRATANTE{data.signer_document && ` · doc. ${data.signer_document}`}</p>
            {data.signed_at && <p>{fmtDateTime(data.signed_at)}</p>}
          </div>
        </div>
      </div>

      {signed ? (
        <>
          <div className="mt-8 rounded-xl p-4 flex items-start gap-3 print:hidden" style={{ background: '#f0fdf4' }}>
            <CheckCircle2 className="w-6 h-6 flex-shrink-0" style={{ color: '#16a34a' }} />
            <div>
              <p className="text-[15px] font-semibold" style={{ color: INK }}>Contrato assinado</p>
              <p className="text-[13px]" style={{ color: MUTED }}>
                Guarde uma cópia: use "Imprimir ou salvar PDF" abaixo.
              </p>
            </div>
          </div>
          <div className="mt-6 rounded-xl p-3 text-[11px] space-y-0.5" style={{ background: '#f8fafc', color: MUTED }}>
            <p className="flex items-center gap-1 font-semibold" style={{ color: INK }}>
              <ShieldCheck className="w-3.5 h-3.5" /> Registro da assinatura eletrônica
            </p>
            <p>Assinado por {data.signer_name} em {data.signed_at && fmtDateTime(data.signed_at)}{data.sign_ip && ` · IP ${data.sign_ip}`}</p>
            {data.content_hash && <p className="break-all">Código do texto assinado (SHA-256): {data.content_hash}</p>}
          </div>
        </>
      ) : (
        <div className="mt-10 pt-6 border-t space-y-3 print:hidden" style={{ borderColor: LINE }}>
          <p className="text-[16px] font-semibold" style={{ color: INK }}>Assinar contrato</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={`${inputClass} sm:col-span-2`} style={{ borderColor: LINE, color: INK }}
                   placeholder="Nome completo" value={name} onChange={e => setName(e.target.value)} />
            <input className={inputClass} style={{ borderColor: LINE, color: INK }} inputMode="numeric"
                   placeholder="CPF ou CNPJ" value={doc} onChange={e => setDoc(fmtCpfCnpj(e.target.value))} />
            <input className={inputClass} style={{ borderColor: LINE, color: INK }} type="email"
                   placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <SignaturePad onChange={setSig} />
          <label className="flex items-start gap-2 text-[13px] cursor-pointer" style={{ color: '#334155' }}>
            <input type="checkbox" className="mt-0.5" checked={agree} onChange={e => setAgree(e.target.checked)} />
            Li o contrato inteiro e concordo com os termos. Entendo que esta assinatura eletrônica tem validade jurídica e que serão registrados meu nome, documento, e-mail, data, hora e endereço de acesso.
          </label>
          {error && <p className="text-[13px]" style={{ color: '#dc2626' }}>{error}</p>}
          <button onClick={sign} disabled={busy}
                  className="w-full h-12 rounded-xl text-white text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: BRAND }}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Assinar contrato
          </button>
        </div>
      )}

      <div className="mt-6 flex justify-end text-[11px] print:hidden" style={{ color: MUTED }}>
        <button onClick={() => window.print()} className="flex items-center gap-1">
          <Printer className="w-3.5 h-3.5" /> Imprimir ou salvar PDF
        </button>
      </div>
    </PublicShell>
  )
}
