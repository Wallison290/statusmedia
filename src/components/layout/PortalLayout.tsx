import { LogOut, Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface PortalLayoutProps {
  children: React.ReactNode
  clientName?: string
  unreadCount?: number
  onBellClick?: () => void
  /** @deprecated use unreadCount */
  pendingCount?: number
}

// Moldura do portal do cliente: barra fina e translúcida no topo, fundo
// neutro claro e uma trama de linhas finas que some logo abaixo do topo.

export function PortalLayout({
  children,
  clientName,
  unreadCount = 0,
  onBellClick,
  pendingCount,
}: PortalLayoutProps) {
  const { profile, signOut } = useAuth()

  // Compatibilidade retroativa: se unreadCount não foi passado mas pendingCount foi
  const badgeCount = unreadCount || pendingCount || 0

  const rawName   = profile?.full_name || ''
  const firstName = rawName.split(' ')[0] || 'Cliente'
  const initial   = (rawName || profile?.email || 'C')[0].toUpperCase()

  return (
    <div className="portal-light relative min-h-screen overflow-x-clip bg-[#F6F7F9] text-[#0F172A] flex flex-col">
      {/* Trama de linhas finas no topo da página */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{
          backgroundImage:
            'linear-gradient(#E4E7EC 1px, transparent 1px), linear-gradient(90deg, #E4E7EC 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.55,
          WebkitMaskImage: 'radial-gradient(ellipse 70% 100% at 50% 0%, #000 0%, transparent 75%)',
          maskImage: 'radial-gradient(ellipse 70% 100% at 50% 0%, #000 0%, transparent 75%)',
        }}
      />

      <header className="sticky top-0 z-30 flex-shrink-0 border-b border-[#E4E7EC] bg-[#F6F7F9]/85 backdrop-blur-xl">
        <div className="max-w-[1180px] mx-auto h-14 px-4 sm:px-6 flex items-center gap-3">
          {/* Marca */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <img src="/logo-icon.png" alt="StatusMedia" className="w-7 h-7 object-contain select-none flex-shrink-0" draggable={false} />
            <span className="font-display text-[15px] font-bold tracking-[-0.03em] text-[#0F172A] flex-shrink-0">
              Status<span className="text-[#2563EB]">Media</span>
            </span>
            {clientName && (
              <>
                <span className="text-[#C4CAD4] text-sm flex-shrink-0">/</span>
                <span className="text-[12.5px] text-[#5B6576] truncate">{clientName}</span>
              </>
            )}
          </div>

          {/* Notificações */}
          <button
            onClick={onBellClick}
            title={badgeCount > 0 ? `${badgeCount} notificação${badgeCount === 1 ? '' : 'ões'} não lida${badgeCount === 1 ? '' : 's'}` : 'Notificações'}
            className="relative flex items-center justify-center w-9 h-9 rounded-full border border-transparent text-[#334155] hover:border-[#E4E7EC] hover:bg-white transition-all"
          >
            <Bell className="w-4 h-4" />
            {badgeCount > 0 && (
              <span
                className="absolute top-0.5 right-0.5 min-w-[16px] h-4 rounded-full bg-[#2563EB] ring-2 ring-[#F6F7F9] text-[9px] font-bold flex items-center justify-center px-1 leading-none"
                style={{ color: '#ffffff' }}
              >
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </button>

          {/* Pessoa + sair */}
          <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-[#E4E7EC]">
            <div className="w-8 h-8 rounded-full bg-[#0F172A] flex items-center justify-center flex-shrink-0">
              <span className="text-[12px] font-semibold" style={{ color: '#ffffff' }}>{initial}</span>
            </div>
            <span className="text-[13px] text-[#0F172A] font-medium hidden sm:block">{firstName}</span>
            <button
              onClick={signOut}
              title="Sair"
              className="flex items-center gap-1.5 text-[12px] text-[#8A94A6] hover:text-[#0F172A] transition-colors h-8 px-2.5 rounded-full hover:bg-white"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
