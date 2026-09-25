// ── Formulário de captura (/captura/:token) ──────────────────────────────────
// Link para a bio do Instagram, site ou anúncio. Quem preenche cai direto no
// funil da agência. `?origem=instagram` (ou utm_source) vira a origem do lead,
// então dá para ter um link por canal e saber de onde vem cada contato.

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { fetchCaptureForm, submitCaptureForm, type PublicCaptureForm } from '@/hooks/useCrmDocuments'
import { PublicShell, PublicLoading, PublicNotFound, INK, MUTED, LINE, BRAND, inputClass } from './PublicShell'

export function LeadCapturePage() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const [form, setForm] = useState<PublicCaptureForm | null | undefined>(undefined)
  const [f, setF] = useState({ name: '', whatsapp: '', email: '', company: '', instagram: '', message: '', website: '' })
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const [done, setDone]   = useState(false)

  useEffect(() => {
    fetchCaptureForm(token).then(setForm).catch(() => setForm(null))
  }, [token])

  if (form === undefined) return <PublicLoading />
  if (form === null)      return <PublicNotFound what="Formulário" />

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (f.name.trim().length < 2) return setError('Informe seu nome.')
    const digits = f.whatsapp.replace(/\D/g, '')
    if (digits.length < 10) return setError('Informe seu WhatsApp com DDD.')
    setBusy(true)
    try {
      const source = params.get('origem') || params.get('utm_source') || undefined
      const r = await submitCaptureForm(token, { ...f, source })
      if (!r.ok) return setError(r.error ?? 'Não foi possível enviar.')
      setDone(true)
    } catch {
      setError('Não foi possível enviar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicShell agency={form.agency}>
      {done ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: '#16a34a' }} />
          <p className="text-[18px] font-semibold" style={{ color: INK }}>Pronto!</p>
          <p className="text-[14px] mt-1 whitespace-pre-line" style={{ color: MUTED }}>{form.thanks}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <h1 className="text-[22px] font-bold leading-tight" style={{ color: INK }}>{form.title}</h1>
          {form.description && (
            <p className="text-[14px] leading-relaxed whitespace-pre-line" style={{ color: MUTED }}>{form.description}</p>
          )}

          <div className="pt-2 space-y-3">
            <input className={inputClass} style={{ borderColor: LINE, color: INK }} placeholder="Seu nome *"
                   value={f.name} onChange={set('name')} autoComplete="name" />
            <input className={inputClass} style={{ borderColor: LINE, color: INK }} placeholder="WhatsApp com DDD *"
                   value={f.whatsapp} onChange={set('whatsapp')} inputMode="tel" autoComplete="tel" />
            <input className={inputClass} style={{ borderColor: LINE, color: INK }} placeholder="E-mail"
                   value={f.email} onChange={set('email')} type="email" autoComplete="email" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={inputClass} style={{ borderColor: LINE, color: INK }} placeholder="Empresa"
                     value={f.company} onChange={set('company')} autoComplete="organization" />
              <input className={inputClass} style={{ borderColor: LINE, color: INK }} placeholder="@ do Instagram"
                     value={f.instagram} onChange={set('instagram')} />
            </div>
            <textarea className={`${inputClass} h-24 py-2.5`} style={{ borderColor: LINE, color: INK }}
                      placeholder="Como podemos ajudar?" value={f.message} onChange={set('message')} />

            {/* Armadilha para robôs: invisível para pessoas, preenchida por bots */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
                   value={f.website} onChange={set('website')}
                   style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
          </div>

          {error && <p className="text-[13px]" style={{ color: '#dc2626' }}>{error}</p>}

          <button type="submit" disabled={busy}
                  className="w-full h-12 rounded-xl text-white text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: BRAND }}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Enviar
          </button>
          <p className="text-[11px] text-center" style={{ color: MUTED }}>
            Seus dados vão só para {form.agency.name}, para retornar o seu contato.
          </p>
        </form>
      )}
    </PublicShell>
  )
}
