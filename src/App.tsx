import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/components/ui/toast'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { Layout } from '@/components/layout/Layout'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import { isConfigured } from '@/integrations/supabase/client'
import { Setup } from '@/pages/Setup'

// Cada página é um chunk separado — só baixa o JS da rota que o usuário realmente abre.
const Login             = lazy(() => import('@/pages/auth/Login').then(m => ({ default: m.Login })))
const Register          = lazy(() => import('@/pages/auth/Register').then(m => ({ default: m.Register })))
const ForgotPassword    = lazy(() => import('@/pages/auth/ForgotPassword').then(m => ({ default: m.ForgotPassword })))
const ResetPassword     = lazy(() => import('@/pages/auth/ResetPassword').then(m => ({ default: m.ResetPassword })))
const ClientRegister    = lazy(() => import('@/pages/auth/ClientRegister').then(m => ({ default: m.ClientRegister })))
const ClientSetup       = lazy(() => import('@/pages/auth/ClientSetup').then(m => ({ default: m.ClientSetup })))
const AuthCallback      = lazy(() => import('@/pages/auth/AuthCallback').then(m => ({ default: m.AuthCallback })))
const Dashboard         = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })))
const ClientList        = lazy(() => import('@/pages/clients/ClientList').then(m => ({ default: m.ClientList })))
const ClientForm        = lazy(() => import('@/pages/clients/ClientForm').then(m => ({ default: m.ClientForm })))
const ClientProfile     = lazy(() => import('@/pages/clients/ClientProfile').then(m => ({ default: m.ClientProfile })))
const CrmBoard          = lazy(() => import('@/pages/crm/CrmBoard').then(m => ({ default: m.CrmBoard })))
const CrmProposals      = lazy(() => import('@/pages/crm/CrmProposals').then(m => ({ default: m.CrmProposals })))
const CrmContracts      = lazy(() => import('@/pages/crm/CrmContracts').then(m => ({ default: m.CrmContracts })))
const CrmAutomations    = lazy(() => import('@/pages/crm/CrmAutomations').then(m => ({ default: m.CrmAutomations })))
const CrmReports        = lazy(() => import('@/pages/crm/CrmReports').then(m => ({ default: m.CrmReports })))
const CrmSettingsPage   = lazy(() => import('@/pages/crm/CrmSettingsPage').then(m => ({ default: m.CrmSettingsPage })))
const PublicProposalPage = lazy(() => import('@/pages/public/PublicProposalPage').then(m => ({ default: m.PublicProposalPage })))
const PublicContractPage = lazy(() => import('@/pages/public/PublicContractPage').then(m => ({ default: m.PublicContractPage })))
const LeadCapturePage    = lazy(() => import('@/pages/public/LeadCapturePage').then(m => ({ default: m.LeadCapturePage })))
const FeedOrganizer     = lazy(() => import('@/pages/feed/FeedOrganizer').then(m => ({ default: m.FeedOrganizer })))
const Planner           = lazy(() => import('@/pages/planner/Planner').then(m => ({ default: m.Planner })))
const Tasks             = lazy(() => import('@/pages/tasks/Tasks').then(m => ({ default: m.Tasks })))
const Library           = lazy(() => import('@/pages/library/Library').then(m => ({ default: m.Library })))
const Financial         = lazy(() => import('@/pages/financial/Financial').then(m => ({ default: m.Financial })))
const Notes             = lazy(() => import('@/pages/notes/Notes').then(m => ({ default: m.Notes })))
const AIPage            = lazy(() => import('@/pages/ai/AIPage').then(m => ({ default: m.AIPage })))
const AIHub             = lazy(() => import('@/pages/ai/AIHub').then(m => ({ default: m.AIHub })))
const Subscription       = lazy(() => import('@/pages/Subscription').then(m => ({ default: m.Subscription })))
const Pricing            = lazy(() => import('@/pages/Pricing').then(m => ({ default: m.Pricing })))
const PortalDashboard    = lazy(() => import('@/pages/portal/PortalDashboard').then(m => ({ default: m.PortalDashboard })))
const CollaboratorPortal = lazy(() => import('@/pages/portal/CollaboratorPortal').then(m => ({ default: m.CollaboratorPortal })))
const TeamPage           = lazy(() => import('@/pages/team/TeamPage').then(m => ({ default: m.TeamPage })))
const InstagramPage      = lazy(() => import('@/pages/instagram/InstagramPage').then(m => ({ default: m.InstagramPage })))
const WhatsAppPage       = lazy(() => import('@/pages/whatsapp/WhatsAppPage').then(m => ({ default: m.WhatsAppPage })))
const ReportsOverview    = lazy(() => import('@/pages/reports/ReportsOverview').then(m => ({ default: m.ReportsOverview })))
const ReportsWorkspace   = lazy(() => import('@/pages/reports/ReportsWorkspace').then(m => ({ default: m.ReportsWorkspace })))
const PrivacyPage        = lazy(() => import('@/pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })))
const TermsPage          = lazy(() => import('@/pages/TermsPage').then(m => ({ default: m.TermsPage })))
const DataDeletionPage   = lazy(() => import('@/pages/DataDeletionPage').then(m => ({ default: m.DataDeletionPage })))
const WeeklyFormPage     = lazy(() => import('@/pages/public/WeeklyFormPage').then(m => ({ default: m.WeeklyFormPage })))
const LandingPage        = lazy(() => import('@/pages/LandingPage').then(m => ({ default: m.LandingPage })))
const AdminPanel         = lazy(() => import('@/pages/admin/AdminPanel').then(m => ({ default: m.AdminPanel })))

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

// ── Loading screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-[#94a3b8] text-sm">Carregando...</p>
      </div>
    </div>
  )
}

// ── Guards ────────────────────────────────────────────────────────────────────

/** Redireciona usuários já autenticados para a área correta */
function GuestGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  if (loading) return null
  if (user) {
    // Cliente que ainda não criou senha vai para setup, não para o portal
    if (user.user_metadata?.needs_password_setup === true) return <Navigate to="/client-setup" replace />
    if (profile?.role === 'client') return <Navigate to="/portal" replace />
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

/** Página inicial pública: mostra a landing para visitantes,
 *  redireciona usuários autenticados para a área correta. */
function HomeGate() {
  const { user, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user) {
    if (user.user_metadata?.needs_password_setup === true) return <Navigate to="/client-setup" replace />
    if (profile?.role === 'client') return <Navigate to="/portal" replace />
    return <Navigate to="/dashboard" replace />
  }
  return <LandingPage />
}

/** Exige autenticação. Redireciona client-role para o portal. */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role === 'client') return <Navigate to="/portal" replace />
  return <>{children}</>
}

/** Exige assinatura ativa. Redireciona para /planos se não pago. */
function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { data: subData, isLoading, isFetched } = useSubscription()

  // Aguarda até ter uma resposta real do servidor antes de decidir qualquer coisa
  if (isLoading || !isFetched) return null

  // Só redireciona depois de ter certeza que a assinatura está inativa
  if (!subData || !subData.isActive) {
    return <Navigate to="/planos" replace />
  }

  return <>{children}</>
}

/** Se já tem assinatura PAGA ativa, vai direto para o app em vez de mostrar /planos.
 *  Usuários em trial podem acessar /planos para assinar. */
function ActivePlanRedirect({ children }: { children: React.ReactNode }) {
  const { data: subData, isLoading, isFetched } = useSubscription()
  if (isLoading || !isFetched) return null
  // Só redireciona quem já pagou (status=active). Trial não bloqueia.
  if (subData?.subscription.status === 'active') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

/** Protege rotas do portal — agency role é redirecionado para / */
function PortalGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (profile && profile.role !== 'client') return <Navigate to="/dashboard" replace />
  // Se o cliente ainda não criou senha (chegou via convite), vai para setup
  if (user.user_metadata?.needs_password_setup === true) {
    return <Navigate to="/client-setup" replace />
  }
  return <>{children}</>
}

/** Painel de admin — exige is_admin=true no profile. A RLS do banco é quem
 *  realmente bloqueia os dados; este guard só evita renderizar a tela pra
 *  quem não tem acesso (não é a camada de segurança). */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!profile?.is_admin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

/** Remonta o AIPage do zero a cada troca de squad/rota — cada card do hub abre um chat limpo. */
function AIPageRoute() {
  const { squadId } = useParams()
  return <AIPage key={squadId ?? 'livre'} />
}

/** Remonta o workspace de relatório do zero a cada troca de cliente. */
function ReportsWorkspaceRoute() {
  const { clientId } = useParams()
  return <ReportsWorkspace key={clientId} />
}

// ── Rotas ─────────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Páginas públicas sem auth */}
      <Route path="/formulario/:token" element={<WeeklyFormPage />} />
      {/* CRM: abertos pelo cliente da agência, sem login */}
      <Route path="/proposta/:token" element={<PublicProposalPage />} />
      <Route path="/contrato/:token" element={<PublicContractPage />} />
      <Route path="/captura/:token"  element={<LeadCapturePage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms"   element={<TermsPage />} />
      {/* Exigida pela Meta (Data Deletion Instructions URL) — precisa abrir deslogado */}
      <Route path="/data-deletion" element={<DataDeletionPage />} />

      {/* Página de vendas pública — visitante vê a landing, logado vai para o app */}
      <Route path="/" element={<HomeGate />} />

      {/* Receptor de links do Supabase (convite, reset de senha, magic link) */}
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Públicas */}
      <Route path="/login"           element={<GuestGuard><Login /></GuestGuard>} />
      <Route path="/register"        element={<GuestGuard><Register /></GuestGuard>} />
      <Route path="/forgot-password" element={<GuestGuard><ForgotPassword /></GuestGuard>} />
      <Route path="/reset-password"  element={<ResetPassword />} />
      <Route path="/client-register" element={<GuestGuard><ClientRegister /></GuestGuard>} />
      {/* Sem GuestGuard: cliente chega aqui autenticado via link de convite */}
      <Route path="/client-setup" element={<ClientSetup />} />

      {/* Portal do cliente */}
      <Route path="/portal" element={<PortalGuard><PortalDashboard /></PortalGuard>} />

      {/* Portal do colaborador — rota pública, sem autenticação */}
      <Route path="/colaborador/:token" element={<CollaboratorPortal />} />

      {/* Página de planos — auth obrigatória; se já tem plano ativo, redireciona */}
      <Route path="/planos" element={<AuthGuard><ActivePlanRedirect><Pricing /></ActivePlanRedirect></AuthGuard>} />

      {/* App da agência — auth + assinatura ativa obrigatórias */}
      <Route element={<AuthGuard><SubscriptionGuard><Layout /></SubscriptionGuard></AuthGuard>}>
        <Route path="/dashboard"     element={<Dashboard />} />
        <Route path="/crm"           element={<CrmBoard />} />
        <Route path="/crm/propostas"     element={<CrmProposals />} />
        <Route path="/crm/contratos"     element={<CrmContracts />} />
        <Route path="/crm/automacoes"    element={<CrmAutomations />} />
        <Route path="/crm/relatorios"    element={<CrmReports />} />
        <Route path="/crm/configuracoes" element={<CrmSettingsPage />} />
        <Route path="/clients"       element={<ClientList />} />
        <Route path="/clients/new"   element={<ClientForm />} />
        <Route path="/clients/:id"   element={<ClientProfile />} />
        <Route path="/clients/:id/edit" element={<ClientForm />} />
        <Route path="/feed"          element={<FeedOrganizer />} />
        <Route path="/content"       element={<Navigate to="/dashboard" replace />} />
        <Route path="/history"       element={<Navigate to="/dashboard" replace />} />
        <Route path="/history/:id"   element={<Navigate to="/dashboard" replace />} />
        <Route path="/planner"       element={<Planner />} />
        <Route path="/tasks"         element={<Tasks />} />
        <Route path="/notes"         element={<Notes />} />
        <Route path="/library"       element={<Library />} />
        <Route path="/financial"     element={<Financial />} />
        <Route path="/ai"            element={<AIHub />} />
        <Route path="/ai/squad/:squadId" element={<AIPageRoute />} />
        <Route path="/ai/livre"      element={<AIPage key="livre" />} />
        <Route path="/ai/imagem"     element={<AIPage key="imagem" />} />
        <Route path="/equipe"        element={<TeamPage />} />
        <Route path="/instagram"     element={<InstagramPage />} />
        <Route path="/whatsapp"      element={<WhatsAppPage />} />
        <Route path="/reports"            element={<ReportsOverview />} />
        <Route path="/reports/:clientId"  element={<ReportsWorkspaceRoute />} />
        <Route path="/assinatura"    element={<Subscription />} />
      </Route>

      {/* Painel de admin — sem SubscriptionGuard (não posso ficar trancado
          fora se minha própria assinatura expirar) */}
      <Route element={<AuthGuard><AdminGuard><Layout /></AdminGuard></AuthGuard>}>
        <Route path="/admin" element={<AdminPanel />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  if (!isConfigured) return <Setup />

  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<LoadingScreen />}>
              <AppRoutes />
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
