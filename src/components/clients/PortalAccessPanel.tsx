// ── Acesso ao portal (perfil do cliente) ─────────────────────────────────────
// Responde "o cliente recebeu o convite? criou a senha? já entrou?" sem a
// agência precisar perguntar ao cliente. Etapas: convite → senha → acessos,
// com a linha do tempo completa embaixo (client_portal_events, migration 095).

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Loader2, Send } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import {
  usePortalStatus, usePortalEvents, useSendPortalInvite, PORTAL_STATE, PORTAL_EVENT_LABEL,
} from '@/hooks/usePortalAccess'

const fmt = (iso?: string | null, withTime = false) =>
  iso ? new Date(iso).toLocaleString('pt-BR', withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

function Step({ n, title, done, when, last }: { n: string; title: string; done: boolean; when: string | null; last?: boolean }) {
  return (
    <div className="flex-1 min-w-0 flex items-start gap-2.5">
      <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-semibold border"
        style={done
          ? { background: '#22C55E', borderColor: '#22C55E', color: '#fff' }
          : { borderColor: 'var(--sm-border-alt)', color: 'var(--sm-text-4)' }}>
        {done ? <Check className="w-3.5 h-3.5" /> : n}
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium" style={{ color: done ? 'var(--sm-text-1)' : 'var(--sm-text-3)' }}>{title}</p>
        <p className="text-[11.5px] tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{when ?? (last ? 'ainda não' : 'pendente')}</p>
      </div>
    </div>
  )
}

export function PortalAccessPanel({ clientId }: { clientId: string }) {
  const { toast } = useToast()
  const { data: st, isLoading } = usePortalStatus(clientId)
  const { data: events = [] } = usePortalEvents(clientId)
  const send = useSendPortalInvite()
  const [showHistory, setShowHistory] = useState(false)

  if (isLoading || !st) return null
  const cfg = PORTAL_STATE[st.state]
  const lastFailure = events[0]?.kind === 'convite_falhou' ? events[0] : null

  const invite = async (resend: boolean) => {
    const r = await send.mutateAsync({ clientId, resend })
    toast(r.message, r.ok ? 'success' : 'error')
  }

  const invited = st.state === 'aguardando_senha' || st.state === 'ativo'
  const sentAt  = fmt(st.invited_at) ?? fmt(events.find(e => e.kind === 'convite_enviado' || e.kind === 'convite_reenviado')?.at)

  return (
    <section className="rounded-2xl border mb-4 overflow-hidden" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <div className="px-4 md:px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Situação */}
        <div className="lg:w-[260px] flex-shrink-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--sm-text-4)' }}>Acesso ao portal</p>
          <p className="mt-1 inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} /> {cfg.label}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>{cfg.hint}</p>
          {st.email && <p className="text-[11.5px] mt-1 truncate" style={{ color: 'var(--sm-text-4)' }}>{st.email}</p>}
        </div>

        {/* Etapas */}
        {st.state !== 'sem_email' && st.state !== 'conta_externa' && (
          <div className="flex-1 flex flex-col sm:flex-row gap-3 sm:gap-4 lg:border-l lg:pl-5" style={{ borderColor: 'var(--sm-border)' }}>
            <Step n="1" title="Convite enviado" done={invited} when={invited ? sentAt : null} />
            <Step n="2" title="Senha criada" done={st.state === 'ativo'} when={st.state === 'ativo' ? (fmt(st.password_set_at) ?? 'concluída') : null} />
            <Step n="3" title="Último acesso" done={!!st.last_sign_in_at} when={fmt(st.last_sign_in_at, true)} last />
          </div>
        )}

        {/* Ação */}
        <div className="flex-shrink-0 flex lg:justify-end">
          {(st.state === 'nao_convidado' || st.state === 'aguardando_senha') && (
            <button onClick={() => invite(st.state === 'aguardando_senha')} disabled={send.isPending}
              className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              style={st.state === 'nao_convidado'
                ? { background: 'var(--sm-primary)', color: '#fff' }
                : { border: '1px solid var(--sm-border)', color: 'var(--sm-text-2)' }}>
              {send.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {st.state === 'nao_convidado' ? 'Enviar convite' : 'Reenviar convite'}
            </button>
          )}
          {(st.state === 'sem_email' || st.state === 'conta_externa') && (
            <Link to={`/clients/${clientId}/edit`}
              className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold inline-flex items-center border"
              style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
              {st.state === 'sem_email' ? 'Cadastrar e-mail' : 'Trocar e-mail'}
            </Link>
          )}
        </div>
      </div>

      {lastFailure && (
        <p className="px-4 md:px-5 pb-3 text-[12px]" style={{ color: '#EF4444' }}>
          Último envio falhou em {fmt(lastFailure.at, true)}{lastFailure.detail ? `: ${lastFailure.detail}` : ''}
        </p>
      )}

      {events.length > 0 && (
        <div className="border-t" style={{ borderColor: 'var(--sm-border)' }}>
          <button onClick={() => setShowHistory(v => !v)}
            className="w-full px-4 md:px-5 h-9 flex items-center justify-between text-[12px] font-medium hover:bg-black/[0.02]"
            style={{ color: 'var(--sm-text-3)' }} aria-expanded={showHistory}>
            Histórico do acesso ({events.length})
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          </button>
          {showHistory && (
            <ol className="px-4 md:px-5 pb-3">
              {events.map(e => (
                <li key={e.id} className="flex items-baseline gap-3 py-1.5 border-t first:border-t-0" style={{ borderColor: 'var(--sm-border)' }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 translate-y-[-1px]"
                    style={{ background: e.kind === 'convite_falhou' ? '#EF4444' : e.kind === 'senha_criada' || e.kind === 'primeiro_acesso' ? '#22C55E' : '#3B82F6' }} />
                  <span className="flex-1 min-w-0 text-[12.5px]" style={{ color: 'var(--sm-text-2)' }}>
                    {PORTAL_EVENT_LABEL[e.kind]}
                    {e.actor_name && <span style={{ color: 'var(--sm-text-4)' }}> · por {e.actor_name}</span>}
                    {e.kind === 'convite_falhou' && e.detail && <span style={{ color: 'var(--sm-text-4)' }}> · {e.detail}</span>}
                  </span>
                  <span className="text-[11.5px] tabular-nums flex-shrink-0" style={{ color: 'var(--sm-text-4)' }}>{fmt(e.at, true)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}
