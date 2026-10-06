import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, ArrowRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { AuthField } from '@/components/auth/AuthField'
import { AuthCardPage, AuthButton } from '@/components/auth/AuthCardPage'
import { traduzirErroAuth } from '@/lib/authErrors'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { resetPassword } = useAuth()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await resetPassword(email.trim().toLowerCase())
    setLoading(false)
    if (error) toast(traduzirErroAuth(error.message), 'error')
    else setSent(true)
  }

  return (
    <AuthCardPage
      title="Recuperar senha"
      subtitle={sent
        ? 'E-mail enviado! Verifique sua caixa de entrada para criar uma nova senha.'
        : 'Informe seu e-mail para receber o link de redefinição.'}
      footer={
        <p className="text-center mt-3">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#29457a] hover:text-[#16284d]">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
          </Link>
        </p>
      }
    >
      {!sent && (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <AuthField
            label="Email"
            type="email"
            placeholder="voce@suaagencia.com.br"
            value={email}
            onChange={e => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            required
            autoComplete="email"
          />
          <AuthButton type="submit" disabled={loading}>
            {loading ? 'Enviando...' : <><span>Enviar link</span><ArrowRight className="w-4 h-4" /></>}
          </AuthButton>
        </form>
      )}
    </AuthCardPage>
  )
}
