import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, Check, CheckCircle2, ExternalLink, Film, Image as ImageIcon, Layers, Loader2, RotateCcw, X } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { mediaUrl } from '@/lib/thumbs'
import { supabase } from '@/integrations/supabase/client'
import {
  plannerFormatFor, useApproveDelivery, useRequestDeliveryAdjust, useSendDeliveryToPlanner, useTeamMembers,
  type DeliverableType, type TeamMember, type TeamTask,
} from '@/hooks/useTeamMembers'

// Entrega do colaborador dentro da demanda (Equipe): a agência vê o vídeo, a
// imagem ou o carrossel que veio do portal e decide — pedir ajuste (volta ao
// colaborador com o recado) ou mandar para o Planejamento (vira post do cliente
// com os arquivos, pronto para enviar à aprovação).

export const DELIVERABLE_OPTIONS: { value: DeliverableType | null; label: string; hint: string; Icon: typeof Film }[] = [
  { value: 'reels',     label: 'Vídeo',     hint: 'Reels',            Icon: Film },
  { value: 'post',      label: 'Imagem',    hint: 'post',             Icon: ImageIcon },
  { value: 'carrossel', label: 'Carrossel', hint: 'até 10 imagens',   Icon: Layers },
]

export const DELIVERABLE_LABEL: Record<DeliverableType, string> = {
  reels: 'Vídeo (Reels)', post: 'Imagem (post)', carrossel: 'Carrossel',
}

/** Escolha do que vai ser entregue. Tocar de novo na opção marcada desmarca. */
export function DeliverableTypePicker({ value, onChange, compact }: {
  value: DeliverableType | null
  onChange: (v: DeliverableType | null) => void
  compact?: boolean
}) {
  return (
    <div>
      <label className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-medium block mb-1.5`} style={{ color: 'var(--sm-text-3)' }}>
        O que vai ser entregue <span style={{ color: 'var(--sm-text-4)' }}>(opcional)</span>
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        {DELIVERABLE_OPTIONS.map(o => {
          const active = value === o.value
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => onChange(active ? null : o.value)}
              className={`flex flex-col items-start gap-0.5 rounded-xl border px-2.5 ${compact ? 'py-1.5' : 'py-2'} text-left transition-colors`}
              style={active
                ? { borderColor: '#2563EB', background: 'rgba(37,99,235,0.08)', color: 'var(--sm-text-1)' }
                : { borderColor: 'var(--sm-border)', background: 'var(--sm-bg-input)', color: 'var(--sm-text-2)' }}
            >
              <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                <o.Icon className="w-3.5 h-3.5" style={{ color: active ? '#2563EB' : 'var(--sm-text-3)' }} />
                {o.label}
              </span>
              <span className="text-[10.5px]" style={{ color: 'var(--sm-text-3)' }}>{o.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A demanda tem entrega do colaborador esperando conferência? */
export function hasPendingDelivery(task: Pick<TeamTask, 'delivered_at' | 'planner_id' | 'status'>) {
  return !!task.delivered_at && !task.planner_id && task.status === 'revisao'
}

// ── Aviso no WhatsApp do colaborador (sai pelo WhatsApp conectado da agência) ──

const EMOJI_OK = '\u2705'          // ✅
const EMOJI_EDIT = '\u270F\uFE0F'  // ✏️

function portalUrlOf(member: TeamMember) {
  return `${window.location.origin}/colaborador/${member.portal_token}`
}

function approvedMessage(member: TeamMember, task: TeamTask, toPlanner: boolean) {
  const first = member.name.split(' ')[0]
  const cliente = task.clients?.company_name ? ` (${task.clients.company_name})` : ''
  return `Olá, ${first}! ${EMOJI_OK} Sua entrega "${task.title}"${cliente} foi aprovada`
    + (toPlanner ? ' e já foi para o planejamento do cliente.' : '.')
    + ` Obrigado!\n\nSuas demandas: ${portalUrlOf(member)}`
}

function adjustMessage(member: TeamMember, task: TeamTask, feedback: string) {
  const first = member.name.split(' ')[0]
  return `Olá, ${first}! ${EMOJI_EDIT} A agência pediu um ajuste em "${task.title}":\n\n${feedback.trim()}\n\nVeja e envie de novo por aqui: ${portalUrlOf(member)}`
}

/** Devolve null quando avisou, ou o motivo de não ter avisado. */
async function notifyWhatsApp(member: TeamMember | undefined, text: string): Promise<string | null> {
  if (!member?.whatsapp) return 'sem WhatsApp cadastrado'
  try {
    const { data, error } = await supabase.functions.invoke('send-whatsapp', { body: { number: member.whatsapp, text } })
    if (error) return 'o WhatsApp da agência não respondeu'
    if (data?.ok === false) return data.error ?? 'falha no envio'
    return null
  } catch {
    return 'o WhatsApp da agência não respondeu'
  }
}

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fieldStyle = { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' } as const

export function DeliveryReviewBlock({ task, onDone }: { task: TeamTask; onDone?: () => void }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const adjust = useRequestDeliveryAdjust()
  const approve = useApproveDelivery()
  const send = useSendDeliveryToPlanner()
  const { data: members = [] } = useTeamMembers()
  const member = members.find(m => m.id === task.assignee_id)
  const firstName = member?.name.split(' ')[0] ?? 'o colaborador'
  const [notifyWa, setNotifyWa] = useState(true)
  const canWa = !!member?.whatsapp

  // Avisa no WhatsApp e mostra o resultado junto da confirmação
  const tellCollaborator = async (text: string, done: string) => {
    if (!notifyWa || !canWa) { toast(done, 'success'); return }
    const fail = await notifyWhatsApp(member, text)
    if (fail) toast(`${done} Não deu para avisar ${firstName} no WhatsApp: ${fail}.`, 'error')
    else toast(`${done} ${firstName} foi avisado no WhatsApp.`, 'success')
  }

  const files = Array.isArray(task.deliveries) ? task.deliveries : []
  const hasDelivery = files.length > 0 || !!task.delivery_url || !!task.collaborator_note
  const [mode, setMode] = useState<'idle' | 'ajuste' | 'planejamento'>('idle')
  const [feedback, setFeedback] = useState('')
  const [title, setTitle] = useState(task.title)
  const [date, setDate] = useState(task.due_date && task.due_date >= todayYmd() ? task.due_date : todayYmd())
  const [time, setTime] = useState('')
  const [slide, setSlide] = useState(0)

  if (!hasDelivery && !task.agency_feedback) return null

  const format = plannerFormatFor(task)
  const pending = hasPendingDelivery(task)
  const current = files[Math.min(slide, files.length - 1)]

  const doAdjust = async () => {
    if (!feedback.trim()) return
    try {
      await adjust.mutateAsync({ taskId: task.id, feedback })
      await tellCollaborator(member ? adjustMessage(member, task, feedback) : '', 'Ajuste pedido.')
      setMode('idle'); setFeedback('')
      onDone?.()
    } catch (e) {
      toast((e as Error).message || 'Não foi possível pedir o ajuste.', 'error')
    }
  }

  const doSend = async () => {
    if (!title.trim() || !date) return
    try {
      const postId = await send.mutateAsync({ task, title, date, time: time || null })
      await tellCollaborator(member ? approvedMessage(member, task, true) : '', 'Post criado no Planejamento.')
      onDone?.()
      navigate(`/planner?item=${postId}`)
    } catch (e) {
      toast((e as Error).message || 'Não foi possível mandar para o planejamento.', 'error')
    }
  }

  const doApprove = async () => {
    try {
      await approve.mutateAsync({ taskId: task.id })
      await tellCollaborator(member ? approvedMessage(member, task, false) : '', 'Entrega aprovada.')
      onDone?.()
    } catch (e) {
      toast((e as Error).message || 'Não foi possível aprovar.', 'error')
    }
  }

  const busy = approve.isPending || adjust.isPending || send.isPending

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: pending ? 'rgba(37,99,235,0.45)' : 'var(--sm-border)', background: 'var(--sm-bg-card)' }}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--sm-border)' }}>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#2563EB' }}>Entrega do colaborador</p>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
            {task.planner_id ? 'Aprovada e enviada ao Planejamento'
              : task.status === 'concluido' ? 'Aprovada'
              : pending ? 'Esperando a sua conferência'
              : task.agency_feedback ? 'Ajuste pedido, aguardando nova entrega'
              : 'Recebida'}
            {files.length > 0 && <> · {files.length === 1 ? (files[0].type === 'video' ? '1 vídeo' : '1 imagem') : `${files.length} arquivos`}</>}
          </p>
        </div>
        {pending && <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse flex-shrink-0" />}
      </div>

      {/* Mídia: vídeo toca aqui; carrossel passa slide a slide */}
      {current && (
        <div className="bg-black/90">
          <div className="relative flex items-center justify-center" style={{ minHeight: 220 }}>
            {current.type === 'video' ? (
              <video key={current.id} src={mediaUrl(current.url)} controls playsInline preload="metadata" className="w-full max-h-[420px] bg-black" />
            ) : (
              <img key={current.id} src={mediaUrl(current.url)} alt={current.name} className="w-full max-h-[420px] object-contain" />
            )}
          </div>
          {files.length > 1 && (
            <div className="flex gap-1.5 p-2 overflow-x-auto" style={{ background: 'var(--sm-bg-alt)' }}>
              {files.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSlide(i)}
                  className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2"
                  style={{ borderColor: i === slide ? '#2563EB' : 'transparent' }}
                  title={`Slide ${i + 1}`}
                >
                  {f.type === 'video'
                    ? <span className="w-full h-full flex items-center justify-center bg-black"><Film className="w-4 h-4 text-white" /></span>
                    : <img src={mediaUrl(f.url)} alt="" className="w-full h-full object-cover" />}
                  <span className="absolute bottom-0 right-0 text-[9px] font-bold px-1 rounded-tl bg-black/70 text-white">{i + 1}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-3 space-y-2.5">
        {task.delivery_url && (
          <a href={task.delivery_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[12px] font-semibold hover:underline break-all" style={{ color: '#2563EB' }}>
            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" /> Abrir o link da entrega
          </a>
        )}
        {task.collaborator_note && (
          <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--sm-text-2)' }}>
            <span className="font-semibold" style={{ color: 'var(--sm-text-1)' }}>Observação: </span>{task.collaborator_note}
          </p>
        )}
        {task.agency_feedback && !task.planner_id && (
          <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap pl-3 border-l-[3px]" style={{ color: 'var(--sm-text-2)', borderColor: '#F59E0B' }}>
            <span className="font-semibold" style={{ color: 'var(--sm-text-1)' }}>Seu pedido de ajuste: </span>{task.agency_feedback}
          </p>
        )}
        {files.length === 0 && task.delivery_url && !task.planner_id && (
          <p className="text-[11.5px] leading-snug" style={{ color: 'var(--sm-text-3)' }}>
            Entrega só por link: o post será criado sem arquivo. Para publicar sozinho, anexe o arquivo no Planejamento.
          </p>
        )}

        {/* Ações */}
        {task.planner_id ? (
          <button
            type="button"
            onClick={() => navigate(`/planner?item=${task.planner_id}`)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold hover:underline"
            style={{ color: '#2563EB' }}
          >
            Ver o post no Planejamento <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : task.status === 'concluido' ? (
          <p className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: '#10B981' }}>
            <CheckCircle2 className="w-4 h-4" /> Entrega aprovada
          </p>
        ) : pending && mode === 'idle' ? (
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => setMode('planejamento')}
              disabled={busy}
              className="w-full h-10 rounded-xl text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
              style={{ background: 'var(--sm-primary)', color: '#ffffff' }}
            >
              <CalendarDays className="w-4 h-4" /> Aprovar e mandar para o Planejamento
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={doApprove}
                disabled={busy}
                title="Aprova sem criar post (ex.: material que não vai ao Instagram)"
                className="h-10 rounded-xl border text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)', background: 'transparent' }}
              >
                {approve.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" style={{ color: '#10B981' }} />} Só aprovar
              </button>
              <button
                type="button"
                onClick={() => setMode('ajuste')}
                disabled={busy}
                className="h-10 rounded-xl border text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)', background: 'transparent' }}
              >
                <RotateCcw className="w-4 h-4" /> Pedir ajuste
              </button>
            </div>
          </div>
        ) : null}

        {/* Avisar no WhatsApp: vale para aprovar e para pedir ajuste */}
        {pending && (
          <label className={`flex items-center gap-2 text-[12px] select-none ${canWa ? 'cursor-pointer' : ''}`} style={{ color: 'var(--sm-text-2)' }}>
            <input
              type="checkbox"
              checked={canWa && notifyWa}
              disabled={!canWa}
              onChange={e => setNotifyWa(e.target.checked)}
              className="w-4 h-4 accent-[#2563EB]"
            />
            {canWa ? `Avisar ${firstName} no WhatsApp` : `${firstName} não tem WhatsApp cadastrado na Equipe`}
          </label>
        )}

        {mode === 'ajuste' && (
          <div className="space-y-2 pt-1">
            <label className="text-[11px] font-medium block" style={{ color: 'var(--sm-text-3)' }}>O que precisa ajustar?</label>
            <textarea
              autoFocus
              rows={3}
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Ex.: cortar os 3 primeiros segundos e trocar a música."
              className="w-full px-3 py-2 rounded-xl border text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
              style={fieldStyle}
            />
            <div className="flex gap-2">
              <button type="button" onClick={doAdjust} disabled={!feedback.trim() || adjust.isPending}
                className="flex-1 h-9 rounded-xl text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                style={{ background: 'var(--sm-primary)', color: '#ffffff' }}>
                {adjust.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Enviar pedido
              </button>
              <button type="button" onClick={() => setMode('idle')}
                className="h-9 px-3 rounded-xl border text-[12.5px] inline-flex items-center gap-1"
                style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
            </div>
          </div>
        )}

        {mode === 'planejamento' && (
          <div className="space-y-2.5 pt-1">
            {!task.client_id && (
              <p className="text-[12px] font-medium" style={{ color: '#EF4444' }}>
                Esta demanda não tem cliente. Edite a demanda e escolha o cliente antes.
              </p>
            )}
            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--sm-text-3)' }}>Título do post</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30" style={fieldStyle} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--sm-text-3)' }}>Data da postagem</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30" style={fieldStyle} />
              </div>
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--sm-text-3)' }}>Horário <span style={{ color: 'var(--sm-text-4)' }}>(opcional)</span></label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30" style={fieldStyle} />
              </div>
            </div>
            <p className="text-[11.5px] leading-snug" style={{ color: 'var(--sm-text-3)' }}>
              Vai virar um post de <b>{DELIVERABLE_LABEL[format]}</b> no Planejamento do cliente. Lá você escreve a legenda e envia para aprovação; aprovado, ele é publicado sozinho no horário.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={doSend} disabled={!task.client_id || !title.trim() || !date || send.isPending}
                className="flex-1 h-9 rounded-xl text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                style={{ background: 'var(--sm-primary)', color: '#ffffff' }}>
                {send.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />}
                Criar o post
              </button>
              <button type="button" onClick={() => setMode('idle')}
                className="h-9 px-3 rounded-xl border text-[12.5px] inline-flex items-center gap-1"
                style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Janela só com a entrega (aberta pelo cartão do quadro). */
export function DeliveryModal({ task, onClose }: { task: TeamTask; onClose: () => void }) {
  // Portal: o cartão do quadro é arrastável e não pode capturar cliques da janela
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm-glass-overlay p-0 sm:p-4" onClick={onClose}>
      <div
        className="sm-glass-modal shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-[24px] sm:rounded-[24px] p-4 sm:p-5 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-[18px] font-bold leading-snug" style={{ color: 'var(--sm-text-1)' }}>{task.title}</h3>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
              {task.clients?.company_name ?? 'Interno'}
              {task.deliverable_type && <> · {DELIVERABLE_LABEL[task.deliverable_type]}</>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-[var(--sm-bg-alt)] flex items-center justify-center flex-shrink-0" aria-label="Fechar">
            <X className="w-4 h-4" style={{ color: 'var(--sm-text-3)' }} />
          </button>
        </div>
        <DeliveryReviewBlock task={task} onDone={onClose} />
      </div>
    </div>,
    document.body,
  )
}
