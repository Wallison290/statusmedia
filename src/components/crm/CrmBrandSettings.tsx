// ── Identidade da agência nas páginas do cliente ─────────────────────────────
// Cor e logo que a proposta, o contrato e o formulário de captura usam. Com
// prévia ao vivo, para a agência ver como o cliente vai receber.

import { useEffect, useRef, useState } from 'react'
import { Palette, Upload, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { useCrmSettings, useUpdateCrmSettings } from '@/hooks/useCrmSettings'
import { uploadArquivo } from '@/lib/uploadArquivo'
import { brandVars, PAPER, INK, MUTED, LINE } from '@/pages/public/PublicShell'

// Sugestões com bom contraste; a agência pode escolher qualquer outra
const SWATCHES = ['#2563EB', '#0F766E', '#7C3AED', '#DB2777', '#EA580C', '#CA8A04', '#15803D', '#1C1917']

export function CrmBrandSettings() {
  const { toast } = useToast()
  const { user, profile } = useAuth()
  const { data: settings } = useCrmSettings()
  const update = useUpdateCrmSettings()
  const fileRef = useRef<HTMLInputElement>(null)

  const [color, setColor]   = useState('#2563EB')
  const [logo, setLogo]     = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!settings) return
    setColor(settings.brand_color ?? '#2563EB')
    setLogo(settings.brand_logo_url ?? null)
  }, [settings?.user_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings) return null
  const agencyName = profile?.agency_name || profile?.full_name || 'Sua agência'
  const shownLogo = logo || profile?.avatar_url || null
  const dirty = color !== (settings.brand_color ?? '#2563EB') || logo !== (settings.brand_logo_url ?? null)

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    if (!file.type.startsWith('image/') || file.type.includes('svg')) { toast('Envie uma imagem PNG, JPG ou WebP', 'warning'); return }
    if (file.size > 3 * 1024 * 1024) { toast('Imagem até 3 MB', 'warning'); return }
    setUploading(true)
    try {
      const { url } = await uploadArquivo('client-logos', `${user.id}/marca-${Date.now()}`, file)
      setLogo(url)
    } catch (err: any) {
      toast(err.message ?? 'Não consegui enviar o logo', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    try {
      await update.mutateAsync({ brand_color: color, brand_logo_url: logo })
      toast('Identidade salva. As páginas do cliente já usam a nova cor.', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao salvar', 'error')
    }
  }

  return (
    <section className="rounded-xl border p-4 sm:p-5 space-y-4" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <div>
        <h2 className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
          <Palette className="w-4 h-4" style={{ color: '#4F8EF7' }} /> Identidade nas páginas do cliente
        </h2>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
          A proposta, o contrato e o formulário de captura chegam ao cliente com a cor e o logo da sua agência.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--sm-text-3)' }}>Cor da marca</p>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Cor ${c}`}
                        className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ background: c, borderColor: c.toLowerCase() === color.toLowerCase() ? 'var(--sm-text-1)' : 'transparent' }} />
              ))}
              <label className="flex items-center gap-2 h-8 pl-1 pr-3 rounded-full border cursor-pointer text-[12px]"
                     style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                <input type="color" value={color} onChange={e => setColor(e.target.value.toUpperCase())}
                       className="w-6 h-6 rounded-full border-0 bg-transparent p-0 cursor-pointer" />
                {color.toUpperCase()}
              </label>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--sm-text-3)' }}>Logo</p>
            <div className="flex items-center gap-3">
              {shownLogo
                ? <img src={shownLogo} alt="" className="w-12 h-12 rounded-full object-cover bg-white" />
                : <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white" style={{ background: color }}>{agencyName[0]}</div>}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickLogo} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {logo ? 'Trocar logo' : 'Enviar logo'}
              </Button>
              {logo && (
                <Button size="sm" variant="ghost" onClick={() => setLogo(null)}>
                  <X className="w-3.5 h-3.5" /> Usar a foto do perfil
                </Button>
              )}
            </div>
            {!logo && <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--sm-text-4)' }}>Sem logo próprio, usamos a foto do seu perfil.</p>}
          </div>
        </div>

        {/* Prévia: um pedaço da proposta como o cliente vê */}
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--sm-border)', background: PAPER, ...brandVars(color) }}>
          <div className="h-1.5" style={{ background: 'var(--brand)' }} />
          <div className="p-4">
            <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: LINE }}>
              {shownLogo
                ? <img src={shownLogo} alt="" className="w-7 h-7 rounded-full object-cover" />
                : <div className="w-7 h-7 rounded-full" style={{ background: 'var(--brand)' }} />}
              <span className="font-display font-bold text-[13px]" style={{ color: INK }}>{agencyName}</span>
            </div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] mt-4" style={{ color: 'var(--brand)' }}>Proposta comercial</p>
            <p className="font-display font-extrabold text-[22px] leading-none mt-1.5 tracking-[-0.02em]" style={{ color: INK }}>Gestão de redes sociais</p>
            <p className="font-display font-extrabold text-[26px] mt-4 tabular-nums" style={{ color: INK }}>
              R$ 1.500<span className="text-[11px] font-normal" style={{ color: MUTED }}>/mês</span>
            </p>
            <div className="mt-3 h-9 rounded-full flex items-center justify-center text-[12.5px] font-semibold"
                 style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
              Aceitar proposta
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={!dirty || update.isPending || uploading}>
          {update.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Salvar identidade
        </Button>
      </div>
    </section>
  )
}
