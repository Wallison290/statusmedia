import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, CreditCard, LogOut, Key, ChevronRight,
  Camera, Building2, Zap, Crown,
  HelpCircle, Sun, Moon,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import { useToast } from '@/components/ui/toast'
import { useTheme } from '@/contexts/ThemeContext'
// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  src, initial, size = 7, dark = true, onClick, showCamera = false,
}: {
  src?: string | null
  initial: string
  size?: number
  dark?: boolean
  onClick?: () => void
  showCamera?: boolean
}) {
  const cls = `w-${size} h-${size} rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 relative`
  return (
    <div
      className={`${cls} ${onClick ? 'cursor-pointer' : ''} group`}
      onClick={onClick}
      style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
    >
      {src ? (
        <img src={src} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full flex items-center justify-center text-[10px] font-semibold ${
          dark ? 'bg-white/15 border border-white/20' : 'bg-[#16284d] border border-[#16284d]'
        }`}>
          <span style={{ color: '#ffffff', fontSize: `${size * 1.6}px` }}>{initial}</span>
        </div>
      )}
      {showCamera && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
          <Camera className="w-4 h-4 text-white" />
        </div>
      )}
    </div>
  )
}

// ── Badge de plano ────────────────────────────────────────────────────────────

const PLAN_CONFIG = {
  starter: { label: 'Starter', icon: Zap,      color: 'bg-blue-100 text-blue-700' },
  pro:     { label: 'Pro',     icon: Crown,     color: 'bg-violet-100 text-violet-700' },
  agency:  { label: 'Agency',  icon: Building2, color: 'bg-amber-100 text-amber-700' },
}

// O antigo modal "Meu Perfil" virou a seção Configurações › Perfil e acesso.

// ── Dropdown ──────────────────────────────────────────────────────────────────

interface UserMenuProps {
  dark?: boolean
}

export function UserMenu({ dark = true }: UserMenuProps) {
  const navigate              = useNavigate()
  const { profile, user, signOut } = useAuth()
  const { data: subData }     = useSubscription()
  const { toast }             = useToast()
  const { isDark, toggleTheme } = useTheme()
  const [open, setOpen]       = useState(false)
  const menuRef               = useRef<HTMLDivElement>(null)
  const buttonRef             = useRef<HTMLButtonElement>(null)
  const dropdownRef           = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 })

  // Calcula posição do dropdown ao abrir
  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({
        top:   rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      })
    }
    setOpen(v => !v)
  }

  // Fecha ao clicar fora — verifica tanto o botão quanto o dropdown (portal)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const inButton   = menuRef.current?.contains(e.target as Node)
      const inDropdown = dropdownRef.current?.contains(e.target as Node)
      if (!inButton && !inDropdown) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const rawName     = profile?.full_name || (user?.user_metadata?.full_name as string) || ''
  const firstName   = rawName.split(' ')[0] || 'Usuário'
  const initial     = (rawName || profile?.email || 'U')[0].toUpperCase()
  const avatarUrl   = profile?.avatar_url || null
  const plan        = subData?.subscription.plan as keyof typeof PLAN_CONFIG | undefined
  const planCfg     = plan ? PLAN_CONFIG[plan] : null
  const PlanIcon    = planCfg?.icon

  const handleResetPassword = async () => {
    if (!user?.email) return
    setOpen(false)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast('E-mail de redefinição enviado!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleSignOut = async () => {
    setOpen(false)
    await signOut()
  }

  return (
    <>
      <div ref={menuRef} className="relative">
        {/* Trigger */}
        <button
          ref={buttonRef}
          onClick={handleToggle}
          className={`flex items-center gap-2 ml-1 pl-2 border-l ${dark ? 'border-white/15' : 'border-[#e8e8e8]'} focus:outline-none`}
        >
          <div className="text-right hidden sm:block">
            <p className={`text-[11px] ${dark ? 'text-white/50' : 'text-[#a0a0a0]'}`}>
              {new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'},
            </p>
            <p className={`text-[11px] font-medium ${dark ? 'text-white' : 'text-[#0f0f0f]'}`}>{firstName}</p>
          </div>
          <div className="relative">
            <div className={`w-7 h-7 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ring-2 transition-all ${
              open
                ? 'ring-violet-500'
                : dark ? 'ring-white/20 hover:ring-violet-400' : 'ring-[#e8e8e8] hover:ring-violet-400'
            }`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full flex items-center justify-center ${dark ? 'bg-white/15' : 'bg-[#16284d]'}`}>
                  <span className="text-white text-[10px] font-semibold">{initial}</span>
                </div>
              )}
            </div>
            {/* Badge de plano */}
            {PlanIcon && (
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-violet-600 flex items-center justify-center ring-1 ring-white">
                <PlanIcon className="w-2 h-2 text-white" />
              </div>
            )}
          </div>
        </button>

      </div>

      {/* Dropdown via Portal — independente do overflow-hidden do pai */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed',
                top:      dropdownPos.top,
                right:    dropdownPos.right,
                zIndex:   9999,
              }}
            >
              <motion.div
                key="user-dropdown"
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.12 }}
                className="w-64 bg-white rounded-2xl shadow-xl border border-[#f1f5f9] overflow-hidden"
              >
                {/* Header do menu */}
                <div className="px-4 pt-4 pb-3 border-b border-[#f1f5f9]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-violet-200">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                          <span className="text-white text-sm font-bold">{initial}</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[#0f172a] truncate">{rawName || 'Usuário'}</p>
                      <p className="text-[11px] text-[#94a3b8] truncate">{user?.email}</p>
                    </div>
                  </div>

                  {/* Plano atual */}
                  {planCfg && PlanIcon && (
                    <div className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${planCfg.color}`}>
                      <PlanIcon className="w-3 h-3" />
                      Plano {planCfg.label}
                      {subData?.isTrialing && (
                        <span className="text-[10px] opacity-70">· {subData.trialDaysLeft}d trial</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Itens do menu */}
                <div className="p-2">
                  <MenuItem
                    icon={User}
                    label="Meu Perfil"
                    description="Foto, nome e agência"
                    onClick={() => { setOpen(false); navigate('/configuracoes/conta') }}
                  />
                  <MenuItem
                    icon={CreditCard}
                    label="Assinatura"
                    description="Planos, upgrade e cobrança"
                    onClick={() => { setOpen(false); navigate('/assinatura') }}
                  />

                  <div className="my-1.5 border-t border-[#f1f5f9]" />

                  <MenuItem
                    icon={Key}
                    label="Alterar Senha"
                    description="Enviar e-mail de redefinição"
                    onClick={handleResetPassword}
                  />
                  <MenuItem
                    icon={HelpCircle}
                    label="Suporte"
                    description="Falar no WhatsApp"
                    onClick={() => { setOpen(false); window.open('https://wa.me/5587988693940', '_blank') }}
                  />
                  <MenuItem
                    icon={WhatsAppIcon}
                    label="Comunidade"
                    description="Novidades, atualizações e feedbacks"
                    whatsapp
                    onClick={() => { setOpen(false); window.open('https://chat.whatsapp.com/HMFkOUKuMW4CdbjBgggkCG?mode=gi_t', '_blank', 'noopener,noreferrer') }}
                  />

                  {/* Toggle de tema */}
                  <button
                    onClick={toggleTheme}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-[#f8fafc] group"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-amber-100' : 'bg-blue-100'}`}>
                      {isDark
                        ? <Sun className="w-3.5 h-3.5 text-amber-500" />
                        : <Moon className="w-3.5 h-3.5 text-blue-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-[#0f172a]">
                        {isDark ? 'Tema Claro' : 'Tema Escuro'}
                      </p>
                      <p className="text-[11px] text-[#94a3b8]">Aparência da interface</p>
                    </div>
                    {/* Pill toggle */}
                    <div className={`w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${isDark ? 'bg-[#1e293b]' : 'bg-[#2563EB]'}`}>
                      <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all ${isDark ? 'left-[3px]' : 'left-[19px]'}`} />
                    </div>
                  </button>

                  <div className="my-1.5 border-t border-[#f1f5f9]" />

                  <MenuItem
                    icon={LogOut}
                    label="Sair"
                    description="Encerrar sessão"
                    onClick={handleSignOut}
                    danger
                  />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

    </>
  )
}

// ── Item do menu ──────────────────────────────────────────────────────────────

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a11.882 11.882 0 005.71 1.447h.006c6.585 0 11.946-5.359 11.949-11.945a11.87 11.87 0 00-3.495-8.4"/>
    </svg>
  )
}

function MenuItem({
  icon: Icon, label, description, onClick, danger, highlight, whatsapp,
}: {
  icon: React.ElementType
  label: string
  description: string
  onClick: () => void
  danger?: boolean
  highlight?: boolean
  whatsapp?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group ${
        danger
          ? 'hover:bg-red-50'
          : whatsapp
          ? 'hover:bg-[#25D366]/10'
          : highlight
          ? 'hover:bg-violet-50'
          : 'hover:bg-[#f8fafc]'
      }`}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
        danger ? 'bg-red-100' : whatsapp ? 'bg-[#25D366]/15' : highlight ? 'bg-violet-100' : 'bg-[#f1f5f9]'
      }`}>
        <Icon className={`w-3.5 h-3.5 ${danger ? 'text-red-500' : whatsapp ? 'text-[#25D366]' : highlight ? 'text-violet-600' : 'text-[#64748b]'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[12.5px] font-medium ${danger ? 'text-red-600' : whatsapp ? 'text-[#1EA952]' : highlight ? 'text-violet-700' : 'text-[#0f172a]'}`}>
          {label}
        </p>
        <p className="text-[11px] text-[#94a3b8] truncate">{description}</p>
      </div>
      <ChevronRight className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${danger ? 'text-red-400' : 'text-[#94a3b8]'}`} />
    </button>
  )
}
