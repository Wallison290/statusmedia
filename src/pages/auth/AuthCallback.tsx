/**
 * AuthCallback — rota receptora de todos os links de auth do Supabase
 *
 * O Supabase redireciona aqui com o hash de token após:
 *  - convite de cliente (type=invite)
 *  - reset de senha    (type=recovery)
 *  - magic link        (type=magiclink)
 *
 * Este componente aguarda a sessão ser estabelecida e redireciona
 * para o destino correto via React Router (sem hash na URL).
 * Isso elimina race conditions de timing do onAuthStateChange.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'

function Spinner() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-white/40 text-sm">Verificando acesso…</p>
      </div>
    </div>
  )
}

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    let handled = false

    const redirect = async (session: import('@supabase/supabase-js').Session | null) => {
      if (handled) return
      handled = true

      if (!session) {
        navigate('/login', { replace: true })
        return
      }

      const meta = session.user.user_metadata ?? {}

      // 1. Cliente que ainda não criou senha → tela de criar senha
      if (meta.needs_password_setup === true) {
        navigate('/client-setup', { replace: true })
        return
      }

      // 1b. Sócio convidado pela aba Equipe que ainda não criou senha
      if (meta.needs_partner_password === true) {
        navigate('/reset-password?convite=socio', { replace: true })
        return
      }

      // 2. Reset de senha → tela de redefinir senha
      // (o evento PASSWORD_RECOVERY é tratado abaixo, mas aqui como fallback)
      // navigate('/reset-password') — não necessário: o evento cuida disso

      // 3. Lê o role do profile para saber para onde ir
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (profile?.role === 'client') {
        navigate('/portal', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    }

    // Ouve o evento de auth — INITIAL_SESSION sem sessão é ignorado
    // pois o hash ainda pode estar sendo trocado pelo token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' && !session) return

      // Reset de senha redireciona para a tela específica
      if (event === 'PASSWORD_RECOVERY') {
        if (handled) return
        handled = true
        navigate('/reset-password', { replace: true })
        return
      }

      redirect(session)
    })

    // Fallback: sessão já processada antes do componente montar
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) redirect(session)
    })

    // Timeout de segurança: 12s sem sessão → login
    const timeout = setTimeout(() => {
      if (!handled) redirect(null)
    }, 12_000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return <Spinner />
}
