import { useState, useEffect } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { Menu, Clock, AlertTriangle } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useSubscription } from '@/hooks/useSubscription'
import { useAgencyWhatsapp } from '@/hooks/useAgencyWhatsapp'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'

function TrialBanner() {
  const { data: sub } = useSubscription()
  if (!sub?.isTrialing || sub.trialDaysLeft === null) return null
  const days = sub.trialDaysLeft
  return (
    <div className="w-full bg-amber-500 text-white text-center py-2 px-4 text-[12.5px] font-medium flex items-center justify-center gap-2 flex-shrink-0">
      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
      {days === 0
        ? 'Seu período de teste termina hoje. '
        : `Período de teste: ${days} dia${days !== 1 ? 's' : ''} restante${days !== 1 ? 's' : ''}. `}
      <Link to="/assinatura" className="underline underline-offset-2 hover:no-underline font-semibold">
        Assine agora →
      </Link>
    </div>
  )
}

/**
 * Aviso de WhatsApp da agência desconectado.
 *
 * Todo WhatsApp sai pelo número conectado da própria agência (não existe mais
 * número da plataforma). Sem ele, nenhum aviso chega aos clientes nem ao dono
 * pelo WhatsApp, e isso só seria percebido quando alguém reclamasse.
 *
 * Aparece como pop-up uma vez por sessão do navegador. "Fechar" some até a
 * próxima sessão; "Não mostrar mais" some de vez neste navegador.
 */
const WA_POPUP_SEEN_KEY  = 'sm_wa_disconnected_popup_seen'
const WA_POPUP_NEVER_KEY = 'sm_wa_disconnected_popup_never'

function readFlag(storage: () => Storage, key: string) {
  try { return storage().getItem(key) === '1' } catch { return false }
}
function writeFlag(storage: () => Storage, key: string) {
  try { storage().setItem(key, '1') } catch { /* navegador sem storage: só fecha */ }
}

function AgencyWhatsappPopup() {
  const { data } = useAgencyWhatsapp()
  const [dismissed, setDismissed] = useState(
    () => readFlag(() => localStorage, WA_POPUP_NEVER_KEY) || readFlag(() => sessionStorage, WA_POPUP_SEEN_KEY),
  )

  const disconnected = !!data && data.status !== 'connected' && (data.available || data.hasInstance)
  if (!disconnected || dismissed) return null

  const close = () => {
    writeFlag(() => sessionStorage, WA_POPUP_SEEN_KEY)
    setDismissed(true)
  }
  const never = () => {
    writeFlag(() => localStorage, WA_POPUP_NEVER_KEY)
    close()
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) close() }}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            {data.hasInstance ? 'WhatsApp desconectado' : 'WhatsApp não conectado'}
          </DialogTitle>
          <DialogDescription>
            {data.hasInstance ? 'O WhatsApp da agência está desconectado.' : 'O WhatsApp da agência ainda não foi conectado.'}
            {' '}Os avisos para você e para os seus clientes não estão saindo pelo WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={never}>Não mostrar mais</Button>
          <Button variant="outline" onClick={close}>Fechar</Button>
          <Button asChild onClick={close}>
            <Link to="/whatsapp">Conectar agora</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isDark } = useTheme()

  // Aplica o data-theme só enquanto o app autenticado estiver montado — páginas
  // públicas (landing, login, portal do cliente...) nunca herdam essa preferência.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    return () => { document.documentElement.removeAttribute('data-theme') }
  }, [isDark])

  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden" style={{ background: 'var(--sm-bg-page)' }}>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, static on md+ */}
      <div
        className={`
          fixed md:relative inset-y-0 left-0 z-40 md:z-auto h-full
          transition-transform duration-200 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <Sidebar onMobileClose={() => setMobileOpen(false)} />
      </div>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {/* Botão de menu flutuante — só no mobile, sem barra ocupando o topo */}
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden fixed top-3 left-3 z-30 w-9 h-9 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm border border-white/10 hover:bg-black/60 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-4 h-4 text-white/80" />
        </button>

        <AgencyWhatsappPopup />
        <TrialBanner />
        {/* sm-menu-gap: no celular a página começa abaixo do botão de menu
            flutuante, que senão cobre o título e os primeiros controles */}
        <div className="sm-menu-gap flex-1 overflow-y-auto overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
