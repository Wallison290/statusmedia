import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, Lock, Eye, EyeOff, Check } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

export function ResetPassword() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)
  const [validSession, setValid]  = useState(false)
  // Sócio convidado pela aba Equipe chega aqui para criar a primeira senha
  const isPartnerInvite = useSearchParams()[0].get('convite') === 'socio'

  // Supabase injeta o token de recovery na hash da URL automaticamente
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setValid(true)
    })
    // Tenta pegar a sessão atual (caso já tenha sido injetada)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setValid(true)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      toast('As senhas não coincidem', 'error')
      return
    }
    if (password.length < 6) {
      toast('A senha precisa ter pelo menos 6 caracteres', 'error')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser(
      isPartnerInvite ? { password, data: { needs_partner_password: false } } : { password },
    )
    setLoading(false)
    if (error) {
      toast(error.message, 'error')
    } else {
      setDone(true)
      setTimeout(() => navigate('/'), 2500)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0c11] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-[#0d0f14]/90 backdrop-blur-xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4">
              {done ? <Check className="w-6 h-6 text-white" /> : <Zap className="w-6 h-6 text-white" />}
            </div>
            <h1 className="text-2xl font-bold text-white">
              {done ? (isPartnerInvite ? 'Tudo pronto!' : 'Senha alterada!') : (isPartnerInvite ? 'Crie sua senha' : 'Nova senha')}
            </h1>
            <p className="text-sm text-gray-400 mt-1 text-center">
              {done
                ? 'Redirecionando para o sistema...'
                : isPartnerInvite
                  ? 'Você foi convidado como sócio da agência. Crie uma senha para entrar.'
                  : 'Digite a nova senha para sua conta.'}
            </p>
          </div>

          {!done && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  label="Nova senha"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  icon={<Lock className="w-4 h-4" />}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-9 text-gray-400 hover:text-white transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Input
                label="Confirmar senha"
                type={showPwd ? 'text' : 'password'}
                placeholder="Repita a nova senha"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                icon={<Lock className="w-4 h-4" />}
                required
              />
              <Button
                type="submit"
                variant="premium"
                size="lg"
                className="w-full"
                disabled={loading || !validSession}
              >
                {loading ? 'Salvando...' : isPartnerInvite ? 'Criar senha e entrar' : 'Salvar nova senha'}
              </Button>
              {!validSession && (
                <p className="text-[12px] text-amber-400 text-center">
                  Link inválido ou expirado. Solicite um novo link de redefinição.
                </p>
              )}
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}
