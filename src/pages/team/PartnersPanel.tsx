// ── Sócios da agência ─────────────────────────────────────────────────────────
// Diferente de "Membros" (colaboradores sem login, que só recebem tarefas por
// link), um sócio entra com login próprio e opera o sistema inteiro da agência,
// com os mesmos poderes do dono. Backend: Edge Function agency-partners e
// migration 088 (RLS por is_agency_member). Recurso do plano Agency.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, Mail, Loader2, Lock, RotateCw, Trash2, AlertCircle, Send } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'

interface Partner {
  id: string
  partner_user_id: string
  email: string
  name: string | null
  created_at: string
  last_sign_in_at: string | null
}

interface PartnersData {
  plan_ok: boolean
  me: string
  owner: { id: string; name: string | null; email: string | null }
  partners: Partner[]
}

async function callPartners<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('agency-partners', { body })
  if (error) {
    // Erro HTTP: a mensagem útil vem no corpo da resposta
    let msg = error.message
    try {
      const j = await (error as any).context?.json()
      msg = j?.message ?? j?.error ?? msg
    } catch { /* corpo não é JSON */ }
    throw new Error(msg)
  }
  return data as T
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function initial(name: string | null, email: string | null) {
  return (name || email || '?').trim()[0]?.toUpperCase() ?? '?'
}

export function PartnersPanel() {
  const { toast } = useToast()
  const { agencyId } = useAuth()
  const qc = useQueryClient()
  const key = ['agency_partners', agencyId]

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => callPartners<PartnersData>({ action: 'list' }),
    enabled: !!agencyId,
  })

  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [removing, setRemoving] = useState<Partner | null>(null)

  const invite = useMutation({
    mutationFn: () => callPartners<{ ok: boolean; linked: boolean }>({ action: 'invite', name, email }),
    onSuccess: (res) => {
      toast(res.linked
        ? `${email} já tinha login no StatusMedia e agora é sócio. Ele entra com a senha que já usa.`
        : `Convite enviado para ${email}.`, 'success')
      setName(''); setEmail('')
      qc.invalidateQueries({ queryKey: key })
      // o sócio vira responsável (team_members) pelo trigger da migration 089
      qc.invalidateQueries({ queryKey: ['team_members'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const resend = useMutation({
    mutationFn: (p: Partner) => callPartners({ action: 'resend', partner_id: p.id }),
    onSuccess: (_, p) => { toast(`Convite reenviado para ${p.email}.`, 'success'); qc.invalidateQueries({ queryKey: key }) },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: (p: Partner) => callPartners({ action: 'remove', partner_id: p.id }),
    onSuccess: (_, p) => {
      toast(`${p.name || p.email} não é mais sócio.`, 'success')
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['team_members'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
    onSettled: () => setRemoving(null),
  })

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#94a3b8]" /></div>
  }
  if (error || !data) {
    return (
      <p className="text-[13px] text-[#94a3b8] text-center py-16">
        Não foi possível carregar os sócios. {(error as Error | null)?.message}
      </p>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Explicação */}
      <div className="bg-[#111827] rounded-2xl border border-[#1e293b] p-5 flex gap-4">
        <div className="w-10 h-10 rounded-xl bg-[#2563EB]/15 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-[#60A5FA]" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-[15px] font-bold text-[#F8FAFC]">Sócios da agência</h3>
          <p className="text-[13px] text-[#94a3b8] leading-relaxed">
            O sócio entra com <strong className="text-[#E2E8F0]">login próprio</strong> e tem acesso completo ao
            sistema: clientes, planejamento, Instagram, CRM, financeiro, relatórios, equipe e assinatura. Todos os
            sócios têm os mesmos poderes. Para só delegar tarefas a um colaborador, use a aba Membros.
          </p>
        </div>
      </div>

      {!data.plan_ok ? (
        <div className="bg-[#111827] rounded-2xl border border-[#1e293b] p-8 flex flex-col items-center text-center gap-3">
          <Lock className="w-8 h-8 text-[#475569]" />
          <p className="text-[14px] font-semibold text-[#F8FAFC]">Acesso de sócio é um recurso do plano Agency</p>
          <p className="text-[12px] text-[#64748b] max-w-sm">
            Faça upgrade para dividir a gestão da agência com sócios, cada um com o próprio login.
          </p>
          <Link
            to="/assinatura"
            className="mt-1 px-4 py-2 rounded-xl text-white text-[13px] font-semibold"
            style={{ background: '#2563EB' }}
          >
            Ver planos
          </Link>
        </div>
      ) : (
        <form
          onSubmit={e => { e.preventDefault(); if (email.trim()) invite.mutate() }}
          className="bg-[#111827] rounded-2xl border border-[#1e293b] p-5 space-y-3"
        >
          <p className="text-[13px] font-semibold text-[#F8FAFC]">Convidar sócio</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nome"
              className="h-10 px-3 rounded-xl border border-[#1e293b] bg-[#182233] text-[13px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:border-[#2563EB]/50"
            />
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@dosocio.com"
              className="h-10 px-3 rounded-xl border border-[#1e293b] bg-[#182233] text-[13px] text-[#E2E8F0] placeholder:text-[#64748b] focus:outline-none focus:border-[#2563EB]/50"
            />
            <button
              type="submit"
              disabled={invite.isPending || !email.trim()}
              className="h-10 px-4 rounded-xl text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ background: '#2563EB' }}
            >
              {invite.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar convite
            </button>
          </div>
          <p className="text-[11px] text-[#64748b]">
            A pessoa recebe um e-mail para criar a senha e já entra na agência.
          </p>
        </form>
      )}

      {/* Lista */}
      <div className="bg-[#111827] rounded-2xl border border-[#1e293b] divide-y divide-[#1e293b]">
        <Row
          letter={initial(data.owner.name, data.owner.email)}
          title={data.owner.name || data.owner.email || 'Sócio'}
          subtitle={data.owner.email}
          tag={<span className="text-[10px] font-semibold text-emerald-400">Sócio</span>}
          you={data.me === data.owner.id}
        />
        {data.partners.map(p => {
          const pending = !p.last_sign_in_at
          return (
            <Row
              key={p.id}
              letter={initial(p.name, p.email)}
              title={p.name || p.email}
              subtitle={p.name ? p.email : null}
              you={data.me === p.partner_user_id}
              tag={pending
                ? <span className="flex items-center gap-1 text-[10px] font-semibold text-[#94a3b8]"><Mail className="w-3 h-3" /> Convite pendente</span>
                : <span className="text-[10px] font-semibold text-emerald-400">Sócio · último acesso {formatDate(p.last_sign_in_at!)}</span>}
              actions={data.plan_ok && data.me !== p.partner_user_id && (
                <div className="flex items-center gap-1">
                  {pending && (
                    <button
                      onClick={() => resend.mutate(p)}
                      disabled={resend.isPending}
                      title="Reenviar convite"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[color:var(--sm-text-1)] hover:bg-[#182233]"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${resend.isPending ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <button
                    onClick={() => setRemoving(p)}
                    title="Remover sócio"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-red-400 hover:bg-[#182233]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            />
          )
        })}
        {data.partners.length === 0 && (
          <p className="text-[12px] text-[#64748b] px-5 py-4">Nenhum sócio ainda.</p>
        )}
      </div>

      <AnimatePresence>
        {removing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setRemoving(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-[#F8FAFC]">Remover sócio?</p>
                  <p className="text-[12px] text-[#64748b] mt-1">
                    <strong>{removing.name || removing.email}</strong> perde o acesso à agência na hora. Nada do que
                    ele fez é apagado.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => remove.mutate(removing)}
                  disabled={remove.isPending}
                  className="flex-1 h-9 rounded-lg bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 disabled:opacity-50"
                >
                  Remover
                </button>
                <button
                  onClick={() => setRemoving(null)}
                  className="flex-1 h-9 rounded-lg border border-[#1e293b] text-[13px] text-[#94a3b8] hover:text-[color:var(--sm-text-1)]"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Row({ letter, title, subtitle, tag, you, actions }: {
  letter: string
  title: string
  subtitle?: string | null
  tag: React.ReactNode
  you?: boolean
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 min-w-0">
      <div className="w-9 h-9 rounded-full bg-[#1e293b] flex items-center justify-center text-[13px] font-bold text-[#E2E8F0] flex-shrink-0">
        {letter}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#F8FAFC] truncate">
          {title}{you && <span className="ml-1.5 text-[10px] font-medium text-[#64748b]">(você)</span>}
        </p>
        {subtitle && <p className="text-[11px] text-[#64748b] truncate">{subtitle}</p>}
        <div className="mt-0.5">{tag}</div>
      </div>
      {actions}
    </div>
  )
}
