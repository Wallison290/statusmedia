// ── UpgradeGate: bloqueia conteúdo quando o usuário atingiu o limite do plano ──

import { Link } from 'react-router-dom'
import { Lock, Zap } from 'lucide-react'

interface UpgradeGateProps {
  /** Se true, o conteúdo é mostrado normalmente */
  allowed: boolean
  /** Mensagem de contexto exibida no bloqueio */
  message?: string
  /** Mostrar conteúdo atrás de um blur em vez de esconder */
  blur?: boolean
  children: React.ReactNode
}

export function UpgradeGate({ allowed, message, blur = false, children }: UpgradeGateProps) {
  if (allowed) return <>{children}</>

  if (blur) {
    return (
      <div className="relative">
        <div className="pointer-events-none select-none opacity-40 blur-sm">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <UpgradeBanner message={message} />
        </div>
      </div>
    )
  }

  return <UpgradeBanner message={message} />
}

function UpgradeBanner({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 px-6 text-center">
      <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center">
        <Lock className="w-5 h-5 text-violet-600" />
      </div>
      <div>
        <p className="text-[14px] font-semibold text-[#0f172a]">Limite do plano atingido</p>
        <p className="text-[12.5px] text-[#64748b] mt-1 max-w-[260px]">
          {message ?? 'Faça upgrade para desbloquear este recurso.'}
        </p>
      </div>
      <Link
        to="/assinatura"
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] text-white text-[12.5px] font-semibold transition-colors"
      >
        <Zap className="w-3.5 h-3.5" />
        Ver planos
      </Link>
    </div>
  )
}

// ── Limite de clientes ─────────────────────────────────────────────────────────

interface ClientLimitGateProps {
  clientCount: number
  maxClients: number  // -1 = ilimitado
  children: React.ReactNode
}

export function ClientLimitGate({ clientCount, maxClients, children }: ClientLimitGateProps) {
  const allowed = maxClients === -1 || clientCount < maxClients
  return (
    <UpgradeGate
      allowed={allowed}
      message={`Seu plano permite até ${maxClients} clientes. Faça upgrade para adicionar mais.`}
    >
      {children}
    </UpgradeGate>
  )
}
