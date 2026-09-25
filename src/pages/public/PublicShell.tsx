// ── Moldura das páginas públicas do CRM ──────────────────────────────────────
// Proposta, contrato e formulário de captura são abertos pelo cliente da
// agência, sem login. Sempre claras (independem do tema do app), com a marca
// da agência no topo, e prontas para imprimir/salvar em PDF.

import { Loader2, AlertTriangle } from 'lucide-react'
import type { PublicAgency } from '@/hooks/useCrmDocuments'

export const INK   = '#0f172a'
export const MUTED = '#64748b'
export const LINE  = '#e2e8f0'
export const BRAND = '#2563EB'

export function PublicShell({ agency, children, wide }: { agency?: PublicAgency | null; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen print:min-h-0" style={{ background: '#f1f5f9', color: INK }}>
      <div className={`mx-auto px-4 py-8 sm:py-12 print:p-0 ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        {agency && (
          <header className="flex items-center gap-3 mb-6">
            {agency.logo ? (
              <img src={agency.logo} alt="" className="w-11 h-11 rounded-xl object-cover" />
            ) : (
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-[18px]" style={{ background: BRAND }}>
                {agency.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="text-[16px] font-semibold">{agency.name}</span>
          </header>
        )}
        <main className="rounded-2xl bg-white shadow-sm print:shadow-none border print:border-0 p-5 sm:p-8" style={{ borderColor: LINE }}>
          {children}
        </main>
        <p className="text-center text-[11px] mt-6 print:hidden" style={{ color: MUTED }}>
          Documento enviado por {agency?.name ?? 'a agência'} pela StatusMedia
        </p>
      </div>
    </div>
  )
}

export function PublicLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}>
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: MUTED }} />
    </div>
  )
}

export function PublicNotFound({ what }: { what: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f1f5f9' }}>
      <div className="text-center max-w-sm">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: '#f59e0b' }} />
        <h1 className="text-[18px] font-bold mb-1" style={{ color: INK }}>{what} não encontrado</h1>
        <p className="text-[13px]" style={{ color: MUTED }}>
          O link pode ter expirado ou sido cancelado. Fale com quem enviou para receber um novo.
        </p>
      </div>
    </div>
  )
}

export const inputClass =
  'w-full h-11 rounded-xl border px-3.5 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500'
