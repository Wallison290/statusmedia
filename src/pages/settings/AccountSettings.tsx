// ── Configurações › Perfil e acesso ──────────────────────────────────────────
// O que é da pessoa logada: dados do perfil, tema, senha e o plano da agência.
// Substitui o antigo modal "Meu Perfil" do menu do usuário.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Check, Loader2, ArrowRight } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import { useStorageUsage } from '@/hooks/useStorageUsage'
import { useToast } from '@/components/ui/toast'
import { useTheme } from '@/contexts/ThemeContext'
import { PrimaryButton, GhostButton } from '@/pages/clients/tabs/tabUi'
import { SettingsSection, FieldLabel, cardStyle, fieldStyle, fieldClass } from './settingsUi'

/** "Sextou!" no Dashboard com cerveja 🍺 ou vinho 🍷: escolha da pessoa,
 *  guardada no cadastro dela (user_metadata.friday_drink), vale em qualquer aparelho. */
function FridayDrinkPicker() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [drink, setDrink] = useState<'cerveja' | 'vinho'>(user?.user_metadata?.friday_drink === 'vinho' ? 'vinho' : 'cerveja')
  const choose = async (d: 'cerveja' | 'vinho') => {
    if (d === drink) return
    const prev = drink
    setDrink(d)
    const { error } = await supabase.auth.updateUser({ data: { friday_drink: d } })
    if (error) { setDrink(prev); toast(error.message, 'error') }
    else toast(d === 'vinho' ? 'Na sexta, vinho 🍷' : 'Na sexta, cerveja 🍺', 'success')
  }
  return (
    <SettingsSection n="" title="Brinde da sexta" description="O emoji que aparece no &quot;Sextou!&quot; do Dashboard.">
      <div role="radiogroup" aria-label="Brinde da sexta" className="inline-flex gap-0.5 p-1 rounded-full border" style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
        {([['cerveja', '🍺', 'Cerveja'], ['vinho', '🍷', 'Vinho']] as const).map(([id, emoji, label]) => {
          const on = drink === id
          return (
            <button key={id} type="button" role="radio" aria-checked={on} onClick={() => choose(id)}
              className={`sm-glass-segment ${on ? 'is-active font-semibold' : 'font-medium hover:text-[var(--sm-text-1)]'} h-9 px-4 rounded-full text-[13px] inline-flex items-center gap-2 transition-colors`}
              style={{ color: on ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>
              <span className="text-[16px] leading-none">{emoji}</span> {label}
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}

// Miniaturas do tema com as cores do kit: Noite/Grafite no escuro, gelo/branco no claro
const THEMES = [
  { dark: true,  label: 'Escuro', hint: 'Fundo noite, menos brilho à noite', page: '#0B1020', side: '#050816', card: '#182233', line: '#1E293B', text: '#CBD5E1' },
  { dark: false, label: 'Claro',  hint: 'Fundo gelo, melhor em ambiente claro', page: '#F1F5F9', side: '#FFFFFF', card: '#FFFFFF', line: '#E2E8F0', text: '#475569' },
] as const

export function AccountSettings() {
  const { user, profile, refreshProfile } = useAuth()
  const { toast } = useToast()
  const { isDark, toggleTheme } = useTheme()
  const { data: subData } = useSubscription()
  const { data: storage } = useStorageUsage()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName]           = useState(profile?.full_name || '')
  const [agencyName, setAgency]   = useState((profile as any)?.agency_name || '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [sendingReset, setSendingReset] = useState(false)

  // Sincroniza os campos quando o profile carrega (useState não reinicia após mount)
  useEffect(() => {
    if (profile) {
      setName(profile.full_name || '')
      setAgency((profile as any).agency_name || '')
      setAvatarUrl(profile.avatar_url || '')
    }
  }, [profile?.full_name, (profile as any)?.agency_name, profile?.avatar_url])

  const dirty = !!profile && (
    name !== (profile.full_name || '') ||
    agencyName !== ((profile as any).agency_name || '') ||
    avatarUrl !== (profile.avatar_url || '')
  )

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/avatar.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      // Força reload sem cache
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`)
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ full_name: name, agency_name: agencyName, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) throw error
      await refreshProfile?.()
      toast('Perfil atualizado!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async () => {
    if (!user?.email) return
    setSendingReset(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast('E-mail de redefinição enviado!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setSendingReset(false)
    }
  }

  const initial = (name || profile?.email || 'U')[0].toUpperCase()

  const planName  = subData?.plan.name ?? 'Free'
  const usedGB    = storage?.usedGB  ?? 0
  const limitGB   = storage?.limitGB ?? 10
  const pct       = Math.min(100, Math.round((usedGB / limitGB) * 100))
  const usedLabel = usedGB < 1 ? `${(usedGB * 1024).toFixed(0)} MB` : `${usedGB.toFixed(1)} GB`
  const trialLeft = subData?.trialDaysLeft

  return (
    <div className="space-y-9">

      {/* ── 01: Perfil ── */}
      <SettingsSection n="01" title="Seu perfil" description="Nome e foto aparecem para a equipe, nos comentários e nos avisos. O nome da agência vai nas propostas e no portal do cliente.">
        <div className="rounded-2xl border" style={cardStyle}>
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-5">
            {/* Foto */}
            <div className="flex sm:flex-col items-center gap-3 sm:w-[112px] flex-shrink-0">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Alterar foto"
                className="relative w-20 h-20 p-0 rounded-full overflow-hidden group border flex-shrink-0"
                style={{ borderColor: 'var(--sm-border)' }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-white text-2xl font-bold" style={{ background: 'var(--sm-primary)' }}>
                    {initial}
                  </span>
                )}
                <span className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  {uploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
                </span>
              </button>
              <p className="text-[11.5px] sm:text-center leading-snug" style={{ color: 'var(--sm-text-4)' }}>Clique na foto para trocar</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>

            {/* Campos */}
            <div className="flex-1 min-w-0 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="cfg-nome">Nome completo</FieldLabel>
                <input id="cfg-nome" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" className={fieldClass} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="cfg-agencia">Nome da agência</FieldLabel>
                <input id="cfg-agencia" value={agencyName} onChange={e => setAgency(e.target.value)} placeholder="Nome da sua agência" className={fieldClass} style={fieldStyle} />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="cfg-email">E-mail de acesso</FieldLabel>
                <input id="cfg-email" value={user?.email || ''} disabled className={fieldClass} style={fieldStyle} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-4 sm:px-5 py-3 border-t" style={{ borderColor: 'var(--sm-border)' }}>
            {dirty && <span className="text-[12px]" style={{ color: 'var(--sm-text-4)' }}>Alterações não salvas</span>}
            <PrimaryButton onClick={handleSave} disabled={!dirty || saving || uploading}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Salvar perfil
            </PrimaryButton>
          </div>
        </div>
      </SettingsSection>

      {/* ── 02: Aparência ── */}
      <SettingsSection n="02" title="Aparência" description="Vale só para este navegador. O portal do cliente e as páginas públicas mantêm o visual próprio.">
        <div role="radiogroup" aria-label="Tema da interface" className="grid grid-cols-2 gap-3">
          {THEMES.map(t => {
            const on = isDark === t.dark
            return (
              <button
                key={t.label}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => { if (!on) toggleTheme() }}
                className="text-left rounded-2xl border p-2.5 transition-colors"
                style={{ ...cardStyle, borderColor: on ? '#2563EB' : 'var(--sm-border)', boxShadow: on ? '0 0 0 1px #2563EB' : undefined }}
              >
                {/* Miniatura da tela */}
                <span className="flex h-[72px] sm:h-[88px] rounded-xl overflow-hidden border" style={{ background: t.page, borderColor: t.line }}>
                  <span className="w-[22%] h-full border-r flex flex-col gap-1 p-1.5" style={{ background: t.side, borderColor: t.line }}>
                    <span className="h-1.5 rounded-full" style={{ background: 'linear-gradient(135deg, #29457a 0%, #16284d 100%)' }} />
                    <span className="h-1 w-3/4 rounded-full" style={{ background: t.line }} />
                    <span className="h-1 w-2/3 rounded-full" style={{ background: t.line }} />
                  </span>
                  <span className="flex-1 p-2 flex flex-col gap-1.5">
                    <span className="h-1.5 w-1/3 rounded-full" style={{ background: t.text, opacity: 0.6 }} />
                    <span className="flex-1 rounded-md border relative" style={{ background: t.card, borderColor: t.line }}>
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r" style={{ background: '#2563EB' }} />
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-2 mt-2.5 px-1">
                  <span className="w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0" style={{ borderColor: on ? '#2563EB' : 'var(--sm-border-alt, var(--sm-border))' }}>
                    {on && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#2563EB' }} />}
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{t.label}</span>
                </span>
                <span className="block text-[11.5px] mt-0.5 px-1 pl-[26px]" style={{ color: 'var(--sm-text-3)' }}>{t.hint}</span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      {/* ── Brinde da sexta ── */}
      <FridayDrinkPicker />

      {/* ── 03: Senha ── */}
      <SettingsSection n="03" title="Senha">
        <div className="rounded-2xl border flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-4" style={cardStyle}>
          <p className="flex-1 min-w-0 text-[13px]" style={{ color: 'var(--sm-text-2)' }}>
            Para trocar a senha, enviamos um link para <span className="font-semibold break-all" style={{ color: 'var(--sm-text-1)' }}>{user?.email}</span>. Abra o e-mail e escolha a senha nova.
          </p>
          <GhostButton onClick={handleResetPassword} disabled={sendingReset} className="self-start sm:self-auto flex-shrink-0">
            {sendingReset && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Enviar link de nova senha
          </GhostButton>
        </div>
      </SettingsSection>

      {/* ── 04: Plano ── */}
      <SettingsSection n="04" title="Plano e armazenamento">
        <div className="rounded-2xl border overflow-hidden" style={cardStyle}>
          <div className="grid sm:grid-cols-2">
            <div className="relative px-4 sm:px-5 py-4">
              <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r" style={{ background: '#2563EB' }} />
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-4)' }}>Plano atual</p>
              <p className="font-display text-[22px] font-bold leading-tight mt-1" style={{ color: 'var(--sm-text-1)' }}>{planName}</p>
              {trialLeft != null && (
                <p className="inline-flex items-center gap-1.5 text-[12px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#EAB308' }} />
                  Teste grátis: {trialLeft} {trialLeft === 1 ? 'dia restante' : 'dias restantes'}
                </p>
              )}
            </div>
            <div className="px-4 sm:px-5 py-4 border-t sm:border-t-0 sm:border-l" style={{ borderColor: 'var(--sm-border)' }}>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-4)' }}>Armazenamento</p>
              <p className="text-[13px] mt-1.5 tabular-nums" style={{ color: 'var(--sm-text-1)' }}>
                <span className="font-semibold">{usedLabel}</span>
                <span style={{ color: 'var(--sm-text-3)' }}> de {limitGB} GB · {pct}%</span>
              </p>
              <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: 'var(--sm-border)' }}>
                <div className="h-full rounded-full" style={{
                  width: `${pct > 0 ? Math.max(pct, 2) : 0}%`,
                  background: pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#2563EB',
                }} />
              </div>
            </div>
          </div>
          <Link to="/assinatura" className="flex items-center justify-between px-4 sm:px-5 py-3 border-t text-[13px] font-semibold hover:bg-[var(--sm-bg-alt)] transition-colors" style={{ borderColor: 'var(--sm-border)', color: isDark ? '#60A5FA' : '#2563EB' }}>
            Ver assinatura, faturas e trocar de plano
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </SettingsSection>
    </div>
  )
}
