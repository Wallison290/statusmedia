// ── Histórico do lead ────────────────────────────────────────────────────────
// Linha do tempo com tudo que aconteceu: o que a agência registrou (nota,
// ligação, reunião...) e o que o sistema gravou sozinho (mudança de etapa,
// proposta aberta, contrato assinado, automação que rodou).

import { useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  StickyNote, Phone, MessageCircle, Users, Mail, Sparkles, ArrowRight, Trophy, XCircle,
  RotateCcw, Archive, ArchiveRestore, UserCheck, CheckSquare, CheckCircle2, FileText,
  PenLine, Magnet, Zap, Trash2, Loader2, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useCrmActivities, useAddCrmActivity, useDeleteCrmActivity } from '@/hooks/useCrmActivities'
import type { CrmActivityKind, CrmManualActivityKind } from '@/types'

const KIND: Record<CrmActivityKind, { icon: LucideIcon; color: string; label: string }> = {
  nota:             { icon: StickyNote,     color: '#94a3b8', label: 'Nota' },
  ligacao:          { icon: Phone,          color: '#4F8EF7', label: 'Ligação' },
  whatsapp:         { icon: MessageCircle,  color: '#22C55E', label: 'WhatsApp' },
  reuniao:          { icon: Users,          color: '#8B5CF6', label: 'Reunião' },
  email:            { icon: Mail,           color: '#0ea5e9', label: 'E-mail' },
  criado:           { icon: Sparkles,       color: '#64748b', label: 'Cadastro' },
  etapa:            { icon: ArrowRight,     color: '#64748b', label: 'Etapa' },
  ganho:            { icon: Trophy,         color: '#22C55E', label: 'Ganho' },
  perdido:          { icon: XCircle,        color: '#ef4444', label: 'Perdido' },
  reaberto:         { icon: RotateCcw,      color: '#F5A623', label: 'Reaberto' },
  arquivado:        { icon: Archive,        color: '#64748b', label: 'Arquivado' },
  restaurado:       { icon: ArchiveRestore, color: '#64748b', label: 'Restaurado' },
  convertido:       { icon: UserCheck,      color: '#22C55E', label: 'Virou cliente' },
  tarefa:           { icon: CheckSquare,    color: '#818cf8', label: 'Tarefa' },
  tarefa_concluida: { icon: CheckCircle2,   color: '#22C55E', label: 'Tarefa' },
  proposta:         { icon: FileText,       color: '#8B5CF6', label: 'Proposta' },
  contrato:         { icon: PenLine,        color: '#14b8a6', label: 'Contrato' },
  captura:          { icon: Magnet,         color: '#2563EB', label: 'Formulário' },
  automacao:        { icon: Zap,            color: '#818cf8', label: 'Automação' },
}

const MANUAL: CrmManualActivityKind[] = ['nota', 'ligacao', 'whatsapp', 'reuniao', 'email']

const PLACEHOLDER: Record<CrmManualActivityKind, string> = {
  nota:     'Anote o que for importante sobre este lead...',
  ligacao:  'Como foi a ligação? O que ficou combinado?',
  whatsapp: 'Resumo da conversa no WhatsApp...',
  reuniao:  'Pontos da reunião, objeções, próximos passos...',
  email:    'Assunto e resumo do e-mail...',
}

export function CrmLeadTimeline({ leadId }: { leadId: string }) {
  const { toast } = useToast()
  const { data: activities = [], isLoading } = useCrmActivities(leadId)
  const add = useAddCrmActivity()
  const del = useDeleteCrmActivity()

  const [kind, setKind] = useState<CrmManualActivityKind>('nota')
  const [text, setText] = useState('')

  async function handleAdd() {
    const content = text.trim()
    if (!content) return
    try {
      await add.mutateAsync({ lead_id: leadId, kind, content })
      setText('')
    } catch (err: any) {
      toast(err.message ?? 'Não consegui registrar', 'error')
    }
  }

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Registrar */}
      <div className="rounded-xl border p-2.5 space-y-2" style={{ borderColor: 'var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
        <div className="flex flex-wrap gap-1">
          {MANUAL.map(k => {
            const K = KIND[k]
            const active = kind === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="flex items-center gap-1 px-2 h-6 rounded-md text-[11px] transition-colors"
                style={{
                  background: active ? `${K.color}22` : 'transparent',
                  color:      active ? K.color : 'var(--sm-text-3)',
                }}
              >
                <K.icon className="w-3 h-3" /> {K.label}
              </button>
            )
          })}
        </div>
        <Textarea
          rows={2}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd() }}
          placeholder={PLACEHOLDER[kind]}
          className="text-[12.5px]"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAdd} disabled={!text.trim() || add.isPending}>
            {add.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            Registrar
          </Button>
        </div>
      </div>

      {/* Linha do tempo */}
      {isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--sm-text-3)' }} /></div>
      ) : activities.length === 0 ? (
        <p className="text-[11.5px] text-center py-6" style={{ color: 'var(--sm-text-4)' }}>
          Nada registrado ainda. O que acontecer com este lead aparece aqui.
        </p>
      ) : (
        <ol className="relative space-y-3 pl-5">
          <span className="absolute left-[9px] top-1 bottom-1 w-px" style={{ background: 'var(--sm-border)' }} />
          {activities.map(a => {
            const K = KIND[a.kind] ?? KIND.nota
            const manual = MANUAL.includes(a.kind as CrmManualActivityKind)
            return (
              <li key={a.id} className="relative group">
                <span
                  className="absolute -left-5 top-0.5 w-[19px] h-[19px] rounded-full flex items-center justify-center"
                  style={{ background: 'var(--sm-bg-card)', border: `1px solid ${K.color}66` }}
                >
                  <K.icon className="w-2.5 h-2.5" style={{ color: K.color }} />
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: K.color }}>{K.label}</span>
                  <span className="text-[10.5px]" style={{ color: 'var(--sm-text-4)' }}
                        title={new Date(a.created_at).toLocaleString('pt-BR')}>
                    {formatDistanceToNow(parseISO(a.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                  {manual && (
                    <button
                      onClick={() => del.mutate({ id: a.id, lead_id: leadId })}
                      className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Apagar registro"
                    >
                      <Trash2 className="w-3 h-3" style={{ color: 'var(--sm-text-4)' }} />
                    </button>
                  )}
                </div>
                {a.content && (
                  <p className="text-[12px] leading-snug mt-0.5 whitespace-pre-line break-words" style={{ color: 'var(--sm-text-2)' }}>
                    {a.content}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
