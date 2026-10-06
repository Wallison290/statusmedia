import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Lock, Check, ArrowRight } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/components/ui/toast'
import { AuthField } from '@/components/auth/AuthField'
import { AuthCardPage, AuthButton } from '@/components/auth/AuthCardPage'
import { traduzirErroAuth } from '@/lib/authErrors'

export function ResetPassword() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)
  const [validSession, setValid]  = useState(false)
  // Sócio convidado pela aba Equipe chega aqui para criar a primeira senha
  const isPartnerInvite = useSearchParams()[0].get('convite') === 'socio'

  // Supabase injeta o token de recovery na hash da URL automaticamente
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setValid(true)
    })
    // Tenta pegar a sessão atual (caso já tenha sido injetada)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setValid(true)
    })
    return () => subscription.unsubscribe()
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
      toast(traduzirErroAuth(error.message), 'error')
    } else {
      setDone(true)
      setTimeout(() => navigate('/'), 2500)
    }
  }

  if (done) {
    return (
      <AuthCardPage
        title={isPartnerInvite ? 'Tudo pronto!' : 'Senha alterada!'}
        subtitle="Redirecionando para o sistema..."
      >
        <div className="flex justify-center py-2">
          <div className="w-11 h-11 rounded-full bg-[#eaf0f8] flex items-center justify-center">
            <Check className="w-5 h-5 text-[#29457a]" />
          </div>
        </div>
      </AuthCardPage>
    )
  }

  return (
    <AuthCardPage
      title={isPartnerInvite ? 'Crie sua senha' : 'Nova senha'}
      subtitle={isPartnerInvite
        ? 'Você foi convidado como sócio da agência. Crie uma senha para entrar.'
        : 'Digite a nova senha para sua conta.'}
      footer={!validSession && (
        <p className="text-center text-[12px] mt-3">
          <Link to="/forgot-password" className="text-[#29457a] font-semibold hover:text-[#16284d]">
            Pedir um novo link
          </Link>
        </p>
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <AuthField
          label="Nova senha"
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={e => setPassword(e.target.value)}
          icon={<Lock className="w-4 h-4" />}
          togglePassword
          required
          autoComplete="new-password"
        />
        <AuthField
          label="Confirmar senha"
          placeholder="Repita a nova senha"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          icon={<Lock className="w-4 h-4" />}
          togglePassword
          required
          autoComplete="new-password"
        />
        <AuthButton type="submit" disabled={loading || !validSession}>
          {loading
            ? 'Salvando...'
            : <><span>{isPartnerInvite ? 'Criar senha e entrar' : 'Salvar nova senha'}</span><ArrowRight className="w-4 h-4" /></>}
        </AuthButton>
        {!validSession && (
          <p className="text-[12px] text-[#b45309] text-center">
            Link inválido ou expirado. Peça um novo link abaixo.
          </p>
        )}
      </form>
    </AuthCardPage>
  )
}
