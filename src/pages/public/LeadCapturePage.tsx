// ── Formulário de captura (/captura/:token) ──────────────────────────────────
// Link para a bio do Instagram, site ou anúncio. Quem preenche cai direto no
// funil da agência. `?origem=instagram` (ou utm_source) vira a origem do lead,
// então dá para ter um link por canal e saber de onde vem cada contato.

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { fetchCaptureForm, submitCaptureForm, type PublicCaptureForm } from '@/hooks/useCrmDocuments'
import { PublicShell, PublicLoading, PublicNotFound, INK, MUTED, LINE, inputClass } from './PublicShell'

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
        <div className="py-6">
          <CheckCircle2 className="w-10 h-10 mb-5" style={{ color: 'var(--brand)' }} />
          <p className="font-display text-[clamp(2.2rem,8vw,3rem)] font-extrabold leading-none tracking-[-0.03em]" style={{ color: INK }}>Pronto!</p>
          <p className="text-[16px] mt-4 leading-relaxed whitespace-pre-line" style={{ color: MUTED }}>{form.thanks}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand)' }}>Contato</p>
          <h1 className="font-display font-extrabold text-[clamp(2.3rem,9vw,3.4rem)] leading-[0.95] tracking-[-0.035em]" style={{ color: INK }}>{form.title}</h1>
          {form.description && (
            <p className="text-[16px] leading-relaxed whitespace-pre-line pt-1" style={{ color: MUTED }}>{form.description}</p>
          )}

          <div className="pt-6 space-y-3">
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
            <textarea className={`${inputClass} h-28 py-3`} style={{ borderColor: LINE, color: INK }}
                      placeholder="Como podemos ajudar?" value={f.message} onChange={set('message')} />

            {/* Armadilha para robôs: invisível para pessoas, preenchida por bots */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
                   value={f.website} onChange={set('website')}
                   style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
          </div>

          {error && <p className="text-[14px]" style={{ color: '#B91C1C' }}>{error}</p>}

          <button type="submit" disabled={busy}
                  className="w-full min-h-[52px] rounded-full text-[16px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity hover:opacity-90"
                  style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Enviar
          </button>
          <p className="text-[12px] pt-1" style={{ color: MUTED }}>
            Seus dados vão só para {form.agency.name}, para retornar o seu contato.
          </p>
        </form>
      )}
    </PublicShell>
  )
}
