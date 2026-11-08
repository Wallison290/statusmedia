// ── Portal do Colaborador ─────────────────────────────────────────────────────
// Rota pública: /colaborador/:token (o token é a identidade; não há login).
// Mesmo visual de vidro do portal do cliente: menu lateral, painel que rola
// por dentro, Início com saudação e números, e a lista de demandas.
// Em cada demanda o colaborador vê as referências e ENTREGA o trabalho:
// arquivos (vídeo, imagem, carrossel na ordem dos slides) e/ou um link.
// Ao enviar, a demanda vai para "Em revisão" e a agência confere na Equipe.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { motion, MotionConfig } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ExternalLink, FileText,
  Film, Folder, Image as ImageIcon, Layers, LayoutDashboard, Link as LinkIcon, ListChecks,
  Loader2, Play, Send, Trash2, Upload, X,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { PortalLayout, type PortalNavItem } from '@/components/layout/PortalLayout'
import { PortalBlockTitle, PortalEmpty, PortalFilterChip, PortalSectionHead, portalPanel } from '@/components/portal/PortalUI'
import { mediaUrl } from '@/lib/thumbs'
import { edgeErrorMessage } from '@/lib/edgeErrors'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type DeliverableType = 'reels' | 'post' | 'carrossel'

interface CollaboratorMember {
  id: string
  name: string
  role: string | null
  color: string
  avatar_url: string | null
  portal_token: string
  user_id: string
}

interface TaskLink {
  id: string
  label: string
  url: string
  type: 'link' | 'imagem' | 'video' | 'arquivo' | 'pasta'
}

interface Delivery {
  id: string
  url: string
  type: 'image' | 'video'
  name: string
  size: number | null
}

interface CollaboratorTask {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  due_time: string | null
  collaborator_note: string | null
  delivery_url: string | null
  task_links: TaskLink[] | null
  deliverable_type: DeliverableType | null
  deliveries: Delivery[] | null
  delivered_at: string | null
  agency_feedback: string | null
  in_planner: boolean
  created_at: string
  updated_at: string
  client_id: string | null
  clients: { id: string; company_name: string; logo_url: string | null } | null
}

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; color: string }> = {
  a_fazer:      { label: 'A fazer',             color: '#94A3B8' },
  em_andamento: { label: 'Em andamento',        color: '#F59E0B' },
  revisao:      { label: 'Agência conferindo',  color: '#2563EB' },
  concluido:    { label: 'Aprovada',            color: '#10B981' },
}

const PRIORITY: Record<string, { label: string; color: string }> = {
  baixa:   { label: 'Baixa',   color: '#94A3B8' },
  media:   { label: 'Normal',  color: '#2563EB' },
  alta:    { label: 'Alta',    color: '#F97316' },
  urgente: { label: 'Urgente', color: '#EF4444' },
}

const DELIVERABLE: Record<DeliverableType, { label: string; ask: string; accept: string; max: number; Icon: typeof Film }> = {
  reels:     { label: 'Vídeo (Reels)', ask: 'Envie o vídeo editado.',                               accept: 'video/*',         max: 1,  Icon: Film },
  post:      { label: 'Imagem (post)', ask: 'Envie a imagem pronta.',                               accept: 'image/*',         max: 1,  Icon: ImageIcon },
  carrossel: { label: 'Carrossel',     ask: 'Envie as imagens do carrossel na ordem dos slides.',   accept: 'image/*,video/*', max: 10, Icon: Layers },
}

const EASE = [0.16, 1, 0.3, 1] as const
const fieldCls = 'w-full rounded-xl border px-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 placeholder:text-[var(--sm-text-4)]'
const fieldStyle = { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' } as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function ymdToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 'YYYY-MM-DD' lido como texto: sem o bug do fuso (UTC-3 mostrava o dia anterior)
function fmtDate(date: string | null, long = false) {
  if (!date) return null
  const [y, m, d] = date.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', long ? { day: 'numeric', month: 'long' } : { day: '2-digit', month: 'short' }).replace('.', '')
}

function isOverdue(t: Pick<CollaboratorTask, 'due_date' | 'status'>) {
  if (!t.due_date || t.status === 'concluido' || t.status === 'revisao') return false
  return t.due_date.split('T')[0] < ymdToday()
}

function needsAdjust(t: CollaboratorTask) {
  return !!t.agency_feedback && !t.in_planner && (t.status === 'a_fazer' || t.status === 'em_andamento')
}

function isOpen(t: CollaboratorTask) {
  return t.status === 'a_fazer' || t.status === 'em_andamento'
}

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// Windows às vezes não informa o tipo de .mov/.mkv: deduz pela extensão
function mimeOf(file: File) {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', gif: 'image/gif',
  }
  return map[ext] ?? ''
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// ── Envio de arquivo: permissão pelo token + PUT direto no R2 com progresso ──

async function uploadDelivery(token: string, taskId: string, file: File, onProgress: (p: number) => void) {
  const contentType = mimeOf(file)
  const { data, error } = await supabase.functions.invoke('collaborator-upload-url', {
    body: { token, taskId, fileName: file.name, contentType, sizeBytes: file.size },
  })
  if (error) throw new Error(await edgeErrorMessage(error, 'Não foi possível preparar o envio.'))
  if (data?.error) throw new Error(data.error)
  const { uploadUrl, publicUrl } = data as { uploadUrl: string; publicUrl: string }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl, true)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.timeout = 60_000 + Math.ceil(file.size / 200_000) * 1000
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`O envio foi recusado (${xhr.status}). Tente de novo.`)))
    xhr.onerror = () => reject(new Error('A conexão caiu durante o envio. Tente de novo.'))
    xhr.ontimeout = () => reject(new Error('O envio demorou demais. Tente de novo numa conexão melhor.'))
    xhr.send(file)
  })
  return publicUrl
}

// ── Peças pequenas ────────────────────────────────────────────────────────────

function Dot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap text-[var(--sm-text-2)]">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {children}
    </span>
  )
}

function Section({ title, aside, children, className = 'mt-12' }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline gap-3 mb-4 min-w-0">
        <h2 className="font-display text-[20px] sm:text-[22px] font-bold tracking-[-0.025em] leading-none text-[var(--sm-text-1)]">{title}</h2>
        {aside && <span className="text-[12px] text-[var(--sm-text-3)] truncate">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

/** Linha de demanda: barra de 3px na cor do estado, título, cliente e prazo. */
function TaskRow({ task, onOpen }: { task: CollaboratorTask; onOpen: () => void }) {
  const st = STATUS[task.status] ?? STATUS.a_fazer
  const overdue = isOverdue(task)
  const adjust = needsAdjust(task)
  const bar = adjust ? '#F59E0B' : overdue ? '#EF4444' : st.color
  const type = task.deliverable_type ? DELIVERABLE[task.deliverable_type] : null
  return (
    <button
      onClick={onOpen}
      className="group relative w-full flex items-center gap-4 px-5 sm:px-6 py-4 text-left transition-colors hover:bg-[var(--sm-bg-alt)]"
    >
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: bar }} />
      <span className="w-11 h-11 rounded-xl border border-[var(--sm-border)] bg-[var(--sm-bg-alt)] flex items-center justify-center flex-shrink-0 text-[var(--sm-text-3)]">
        {type ? <type.Icon className="w-4 h-4" /> : <ListChecks className="w-4 h-4" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[14px] font-semibold truncate ${task.status === 'concluido' ? 'text-[var(--sm-text-3)]' : 'text-[var(--sm-text-1)]'}`}>{task.title}</span>
        <span className="block text-[12px] text-[var(--sm-text-3)] mt-0.5 truncate">
          {task.clients?.company_name ?? 'Interno'}
          {task.due_date && (
            <>
              <span className="mx-1.5 text-[var(--sm-text-4)]">·</span>
              <span style={overdue ? { color: '#EF4444', fontWeight: 600 } : undefined}>{overdue ? 'Atrasada · ' : ''}{fmtDate(task.due_date)}</span>
            </>
          )}
          {adjust && <><span className="mx-1.5 text-[var(--sm-text-4)]">·</span><span style={{ color: '#B45309', fontWeight: 600 }}>Ajuste pedido</span></>}
        </span>
      </span>
      <span className="hidden sm:inline-flex flex-shrink-0"><Dot color={st.color}>{st.label}</Dot></span>
      <span className="w-8 h-8 rounded-full border border-[var(--sm-border)] flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:-rotate-45 group-hover:border-[var(--sm-text-3)] text-[var(--sm-text-1)]">
        <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </button>
  )
}

// ── Início ────────────────────────────────────────────────────────────────────

function HomeTab({ member, tasks, onOpen, onGo }: {
  member: CollaboratorMember
  tasks: CollaboratorTask[]
  onOpen: (t: CollaboratorTask) => void
  onGo: (tab: string, filter?: string) => void
}) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const hour = now.getHours()
  const greet = hour < 12 ? 'Bom dia,' : hour < 18 ? 'Boa tarde,' : 'Boa noite,'
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const firstName = member.name.split(' ')[0]

  const open = tasks.filter(isOpen)
  const overdue = tasks.filter(isOverdue)
  const review = tasks.filter(t => t.status === 'revisao')
  const done = tasks.filter(t => t.status === 'concluido')
  const adjust = tasks.filter(needsAdjust)

  const subline = tasks.length === 0
    ? 'Você ainda não tem demandas. Assim que a agência mandar alguma, ela aparece aqui.'
    : adjust.length > 0
      ? `A agência pediu ajuste em ${adjust.length === 1 ? '1 entrega' : `${adjust.length} entregas`}. Comece por ${adjust.length === 1 ? 'ela' : 'elas'}.`
      : overdue.length > 0
        ? `${overdue.length === 1 ? '1 demanda passou' : `${overdue.length} demandas passaram`} do prazo. Vale olhar primeiro.`
        : open.length > 0
          ? `${open.length === 1 ? '1 demanda está' : `${open.length} demandas estão`} com você agora.`
          : 'Tudo entregue. Nenhuma demanda esperando por você.'

  const next = [...open].sort((a, b) => {
    const pa = needsAdjust(a) ? 0 : isOverdue(a) ? 1 : 2
    const pb = needsAdjust(b) ? 0 : isOverdue(b) ? 1 : 2
    if (pa !== pb) return pa - pb
    return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
  })
  const first = next[0]

  const kpis = [
    { label: 'Para fazer',          short: 'Para fazer', value: open.length,    note: open.length > 0 ? 'ver as demandas' : 'nada pendente', color: '#2563EB', go: 'abertas' },
    { label: 'Atrasadas',           short: 'Atrasadas',  value: overdue.length, note: 'passaram do prazo',   color: '#EF4444', go: 'abertas', alert: true },
    { label: 'Agência conferindo',  short: 'Conferindo', value: review.length,  note: 'entregues por você', color: '#8B5CF6', go: 'revisao' },
    { label: 'Aprovadas',           short: 'Aprovadas',  value: done.length,    note: 'entregas aprovadas',          color: '#10B981', go: 'concluidas' },
  ]

  // Por cliente: só ajuda quando há mais de um
  const byClient = useMemo(() => {
    const m = new Map<string, { name: string; open: number; total: number }>()
    for (const t of tasks) {
      const k = t.client_id ?? '__none__'
      const g = m.get(k) ?? { name: t.clients?.company_name ?? 'Interno', open: 0, total: 0 }
      g.total++
      if (isOpen(t)) g.open++
      m.set(k, g)
    }
    return [...m.entries()].sort((a, b) => b[1].open - a[1].open || a[1].name.localeCompare(b[1].name, 'pt-BR'))
  }, [tasks])

  return (
    <MotionConfig reducedMotion="user">
      <div className="px-4 sm:px-6 lg:px-8 pb-12">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="pt-5 md:pt-9 flex items-start justify-between gap-8"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sm-text-3)]">
              <span className="capitalize">{dateStr}</span>
              <span className="mx-2 text-[var(--sm-text-4)]">/</span>
              <span className="tabular-nums">{timeStr}</span>
            </p>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
              className="font-display font-bold text-[var(--sm-text-1)] mt-4 sm:mt-5 leading-[0.95] tracking-[-0.035em]"
              style={{ fontSize: 'clamp(34px, 4.4vw, 60px)' }}
            >
              {greet}
              <br className="sm:hidden" />{' '}
              <span className="text-[#2563EB]">{firstName}.</span>
            </motion.h1>
            <p className="text-[14px] leading-relaxed text-[var(--sm-text-2)] mt-4 sm:mt-5 max-w-[60ch]">{subline}</p>
            {first && (
              <button
                onClick={() => onOpen(first)}
                className="group mt-6 inline-flex items-center gap-3 h-11 pl-5 pr-1.5 rounded-full text-[13px] font-semibold transition-all duration-300 hover:gap-4"
                style={{ background: 'var(--sm-primary)', color: '#ffffff' }}
              >
                {needsAdjust(first) ? 'Ver o ajuste' : 'Abrir a próxima'}
                <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center transition-transform duration-300 group-hover:-rotate-45">
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            )}
          </div>

          {/* Cartão do colaborador */}
          <div className={`${portalPanel} sm-invert hidden lg:flex w-[300px] items-center gap-3 px-4 py-3 flex-shrink-0`}>
            {member.avatar_url ? (
              <img src={member.avatar_url} alt={member.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display font-bold text-[15px]" style={{ background: member.color, color: '#ffffff' }}>
                {initials(member.name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--sm-text-1)] truncate">{member.name}</p>
              <p className="text-[11px] text-[var(--sm-text-3)] truncate">{member.role || 'Colaborador'}</p>
            </div>
          </div>
        </motion.header>

        {/* Números */}
        <Section title="Seus números" aside="tudo o que já passou por você" className="mt-9">
          <div className="grid grid-cols-3 lg:grid-cols-[1.55fr_1fr_1fr_1fr] gap-2.5 sm:gap-3">
            {kpis.map((k, i) => {
              const lead = i === 0
              return (
                <button
                  key={k.label}
                  onClick={() => onGo('demandas', k.go)}
                  className={`${portalPanel} group relative overflow-hidden text-left flex flex-col justify-between transition-colors hover:bg-[var(--sm-bg-input)] ${
                    lead ? 'col-span-3 lg:col-span-1 gap-5 p-5 sm:p-6 min-h-[140px] lg:min-h-[176px]' : 'gap-4 px-3.5 py-4 sm:p-6 min-h-[112px] sm:min-h-[140px]'
                  }`}
                >
                  <span
                    className={`absolute left-0 w-[3px] rounded-r-full ${lead ? 'top-6 bottom-6' : 'top-4 bottom-4 sm:top-6 sm:bottom-6'}`}
                    style={{ background: k.value > 0 ? k.color : 'var(--sm-border)' }}
                  />
                  <span className="flex items-center gap-2 min-w-0 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--sm-text-3)]">
                    <span className={lead ? '' : 'hidden sm:inline'}>{k.label}</span>
                    {!lead && <span className="sm:hidden">{k.short}</span>}
                    <ArrowRight className="hidden sm:block w-3.5 h-3.5 ml-auto opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                  </span>
                  <span className="block">
                    <span
                      className="block font-display font-bold tabular-nums leading-[0.85] tracking-[-0.045em]"
                      style={{ fontSize: lead ? 'clamp(56px, 7vw, 92px)' : 'clamp(32px, 4vw, 50px)', color: k.alert && k.value > 0 ? '#DC2626' : 'var(--sm-text-1)' }}
                    >
                      {k.value}
                    </span>
                    <span className={`block text-[12px] text-[var(--sm-text-3)] mt-2.5 leading-snug ${lead ? '' : 'hidden sm:block'}`}>{k.note}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </Section>

        {/* Demandas */}
        <Section title="Com você agora" aside="ajustes e atrasadas primeiro">
          {tasks.length === 0 ? (
            <PortalEmpty title="Nenhuma demanda ainda" text="Quando a agência mandar uma demanda, ela aparece aqui com os prazos e as referências." />
          ) : (
            <div className={`grid grid-cols-1 ${byClient.length > 1 ? 'lg:grid-cols-[1fr_320px]' : ''} gap-2.5 sm:gap-3 items-start`}>
              <div className={`${portalPanel} overflow-hidden min-w-0`}>
                <PortalBlockTitle
                  label={next.length > 0 ? 'Para fazer' : 'Tudo entregue'}
                  count={next.length || undefined}
                  right={next.length > 6 ? (
                    <button onClick={() => onGo('demandas', 'abertas')} className="text-[12px] font-semibold text-[#2563EB] inline-flex items-center gap-1">
                      Ver todas <ArrowRight className="w-3 h-3" />
                    </button>
                  ) : undefined}
                />
                {next.length === 0 ? (
                  <p className="px-6 py-5 text-[13px] text-[var(--sm-text-2)]">
                    {review.length > 0 ? `A agência está conferindo ${review.length === 1 ? 'a sua entrega' : `${review.length} entregas suas`}. Se precisar de ajuste, aparece aqui.` : 'Nenhuma demanda pendente.'}
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--sm-border)]">
                    {next.slice(0, 6).map(t => <TaskRow key={t.id} task={t} onOpen={() => onOpen(t)} />)}
                  </div>
                )}
              </div>

              {byClient.length > 1 && (
                <div className={`${portalPanel} overflow-hidden`}>
                  <PortalBlockTitle label="Por cliente" count={byClient.length} />
                  <div className="divide-y divide-[var(--sm-border)]">
                    {byClient.map(([key, g]) => (
                      <button
                        key={key}
                        onClick={() => onGo('demandas', `cliente:${key}`)}
                        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-[var(--sm-bg-alt)] transition-colors"
                      >
                        <span className="text-[13px] font-semibold text-[var(--sm-text-1)] truncate">{g.name}</span>
                        <span className="text-[12px] text-[var(--sm-text-3)] tabular-nums flex-shrink-0">
                          {g.open > 0 ? <><span className="text-[var(--sm-text-1)] font-semibold">{g.open}</span> para fazer</> : `${g.total} no total`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>
      </div>
    </MotionConfig>
  )
}

// ── Demandas ──────────────────────────────────────────────────────────────────

function DemandsTab({ tasks, filter, setFilter, onOpen }: {
  tasks: CollaboratorTask[]
  filter: string
  setFilter: (f: string) => void
  onOpen: (t: CollaboratorTask) => void
}) {
  const clients = useMemo(() => {
    const m = new Map<string, string>()
    tasks.forEach(t => m.set(t.client_id ?? '__none__', t.clients?.company_name ?? 'Interno'))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [tasks])

  const statusFilters = [
    { key: 'abertas',    label: 'Para fazer',         dot: '#2563EB', match: isOpen },
    { key: 'revisao',    label: 'Agência conferindo', dot: '#8B5CF6', match: (t: CollaboratorTask) => t.status === 'revisao' },
    { key: 'concluidas', label: 'Aprovadas',         dot: '#10B981', match: (t: CollaboratorTask) => t.status === 'concluido' },
    { key: 'todas',      label: 'Todas',              dot: undefined, match: () => true },
  ]
  const clientKey = filter.startsWith('cliente:') ? filter.slice(8) : null
  const sf = statusFilters.find(f => f.key === filter) ?? statusFilters[3]
  const list = tasks
    .filter(t => (clientKey ? (t.client_id ?? '__none__') === clientKey : sf.match(t)))
    .sort((a, b) => {
      const pa = needsAdjust(a) ? 0 : isOverdue(a) ? 1 : 2
      const pb = needsAdjust(b) ? 0 : isOverdue(b) ? 1 : 2
      if (pa !== pb) return pa - pb
      return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    })

  // Agrupa por cliente quando a lista mistura clientes
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; items: CollaboratorTask[] }>()
    for (const t of list) {
      const k = t.client_id ?? '__none__'
      const g = m.get(k) ?? { name: t.clients?.company_name ?? 'Interno', items: [] }
      g.items.push(t)
      m.set(k, g)
    }
    return [...m.values()]
  }, [list])

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-6 md:pt-10 pb-12">
      <PortalSectionHead
        eyebrow="Demandas"
        title="O que está"
        accent="com você."
        desc="Abra a demanda para ver as referências da agência e entregar o trabalho pronto: vídeo, imagem, carrossel ou link."
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {statusFilters.map(f => (
          <PortalFilterChip key={f.key} active={filter === f.key} label={f.label} dot={f.dot}
            count={tasks.filter(f.match).length} onClick={() => setFilter(f.key)} />
        ))}
        {clients.length > 1 && clients.map(([k, name]) => (
          <PortalFilterChip key={k} active={clientKey === k} label={name}
            count={tasks.filter(t => (t.client_id ?? '__none__') === k).length} onClick={() => setFilter(`cliente:${k}`)} />
        ))}
      </div>

      {list.length === 0 ? (
        <PortalEmpty title="Nada por aqui" text={filter === 'abertas' ? 'Nenhuma demanda esperando por você.' : 'Nenhuma demanda neste filtro.'} />
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.name} className={`${portalPanel} overflow-hidden`}>
              {groups.length > 1 && <PortalBlockTitle label={g.name} count={g.items.length} />}
              <div className="divide-y divide-[var(--sm-border)]">
                {g.items.map(t => <TaskRow key={t.id} task={t} onOpen={() => onOpen(t)} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Referências da agência ────────────────────────────────────────────────────

function References({ links }: { links: TaskLink[] }) {
  if (links.length === 0) return null
  const media = links.filter(l => l.type === 'imagem' || l.type === 'video')
  const others = links.filter(l => l.type !== 'imagem' && l.type !== 'video')
  const iconOf = (t: TaskLink['type']) => (t === 'arquivo' ? FileText : t === 'pasta' ? Folder : LinkIcon)
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--sm-text-3)] mb-2.5">Referências da agência</p>
      {others.length > 0 && (
        <div className="space-y-2">
          {others.map(l => {
            const Icon = iconOf(l.type)
            return (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                className="group flex items-center gap-3 p-3 rounded-2xl border border-[var(--sm-border)] hover:bg-[var(--sm-bg-alt)] transition-colors">
                <span className="w-9 h-9 rounded-xl bg-[var(--sm-bg-alt)] flex items-center justify-center flex-shrink-0 text-[var(--sm-text-2)]"><Icon className="w-4 h-4" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-[var(--sm-text-1)] truncate">{l.label || 'Link'}</span>
                  <span className="block text-[11px] text-[var(--sm-text-3)] truncate">{l.url}</span>
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-[var(--sm-text-3)] flex-shrink-0" />
              </a>
            )
          })}
        </div>
      )}
      {media.length > 0 && (
        <div className={`grid grid-cols-2 gap-2 ${others.length > 0 ? 'mt-2' : ''}`}>
          {media.map(l => (
            <div key={l.id} className="rounded-2xl overflow-hidden border border-[var(--sm-border)] bg-black/5">
              {l.type === 'video'
                ? <video src={mediaUrl(l.url)} controls playsInline preload="metadata" className="w-full aspect-[4/5] object-cover bg-black" />
                : <a href={mediaUrl(l.url)} target="_blank" rel="noopener noreferrer"><img src={mediaUrl(l.url)} alt={l.label} className="w-full aspect-[4/5] object-cover" /></a>}
              <p className="px-2.5 py-1.5 text-[11px] text-[var(--sm-text-2)] truncate">{l.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Entrega ───────────────────────────────────────────────────────────────────

interface DraftFile {
  id: string
  type: 'image' | 'video'
  name: string
  size: number | null
  url: string | null          // pública, quando já subiu
  preview: string             // blob local ou a própria URL
  progress: number            // 0..1
  error: string | null
}

function DeliveryEditor({ task, token, onSaved }: {
  task: CollaboratorTask
  token: string
  onSaved: (patch: Partial<CollaboratorTask>) => void
}) {
  const spec = task.deliverable_type ? DELIVERABLE[task.deliverable_type] : null
  const max = spec?.max ?? 10
  const accept = spec?.accept ?? 'image/*,video/*'
  const [files, setFiles] = useState<DraftFile[]>(() =>
    (task.deliveries ?? []).map(d => ({ id: d.id, type: d.type, name: d.name, size: d.size, url: d.url, preview: mediaUrl(d.url), progress: 1, error: null })),
  )
  const [link, setLink] = useState(task.delivery_url ?? '')
  const [note, setNote] = useState(task.collaborator_note ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploading = files.some(f => !f.url && !f.error)

  const addFiles = (list: FileList | File[]) => {
    setError(null)
    const picked = Array.from(list).filter(f => {
      const m = mimeOf(f)
      if (!/^(image|video)\//.test(m) || m.startsWith('image/svg')) return false
      if (task.deliverable_type === 'reels') return m.startsWith('video/')
      if (task.deliverable_type === 'post') return m.startsWith('image/')
      return true
    })
    if (picked.length === 0) {
      setError(task.deliverable_type === 'reels' ? 'Escolha um arquivo de vídeo.' : task.deliverable_type === 'post' ? 'Escolha um arquivo de imagem.' : 'Escolha imagens ou vídeos.')
      return
    }
    // Vídeo e post: um arquivo só (o novo substitui). Carrossel: até 10.
    const keep = max === 1 ? [] : files
    const room = Math.max(0, max - keep.length)
    if (room === 0) { setError(`O carrossel aceita até ${max} arquivos.`); return }
    if (picked.length > room) setError(`Só cabem mais ${room}. Os outros ficaram de fora.`)
    const drafts: DraftFile[] = picked.slice(0, room).map(f => ({
      id: newId(),
      type: mimeOf(f).startsWith('video/') ? 'video' : 'image',
      name: f.name,
      size: f.size,
      url: null,
      preview: URL.createObjectURL(f),
      progress: 0,
      error: null,
    }))
    setFiles([...keep, ...drafts])
    drafts.forEach((d, i) => {
      const file = picked[i]
      uploadDelivery(token, task.id, file, p => setFiles(prev => prev.map(x => (x.id === d.id ? { ...x, progress: p } : x))))
        .then(url => setFiles(prev => prev.map(x => (x.id === d.id ? { ...x, url, progress: 1 } : x))))
        .catch((e: Error) => setFiles(prev => prev.map(x => (x.id === d.id ? { ...x, error: e.message } : x))))
    })
  }

  const move = (id: string, dir: -1 | 1) => setFiles(prev => {
    const i = prev.findIndex(f => f.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= prev.length) return prev
    const next = [...prev]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    setFiles(prev => {
      const from = prev.findIndex(f => f.id === dragId)
      const to = prev.findIndex(f => f.id === targetId)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      return next
    })
    setDragId(null)
  }

  const ready = files.filter(f => f.url && !f.error)
  const canSend = !sending && !uploading && (ready.length > 0 || link.trim().length > 0)

  const submit = async () => {
    setSending(true); setError(null)
    try {
      const deliveries = ready.map(f => ({ id: f.id, url: f.url, type: f.type, name: f.name, size: f.size }))
      const { data, error: rpcError } = await (supabase as any).rpc('submit_collaborator_delivery', {
        p_token: token,
        p_task_id: task.id,
        p_deliveries: deliveries,
        p_delivery_url: link.trim() || null,
        p_note: note.trim() || null,
      })
      if (rpcError) throw new Error(rpcError.message)
      if (data?.error) throw new Error(data.error)
      setSent(true)
      onSaved({
        deliveries: data.deliveries ?? deliveries,
        delivery_url: link.trim() || null,
        collaborator_note: note.trim() || null,
        status: 'revisao',
        delivered_at: data.delivered_at ?? new Date().toISOString(),
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const already = !!task.delivered_at && task.status === 'revisao'

  return (
    <div className={`${portalPanel} overflow-hidden`}>
      <div className="px-5 py-4 border-b border-[var(--sm-border)]">
        <p className="text-[14px] font-semibold text-[var(--sm-text-1)]">{already ? 'Sua entrega' : 'Entregar o trabalho'}</p>
        <p className="text-[12.5px] text-[var(--sm-text-3)] mt-0.5 leading-snug">
          {already
            ? `Enviada em ${fmtDate(task.delivered_at!.slice(0, 10), true)}. A agência está conferindo; se mudar algo, envie de novo.`
            : spec ? spec.ask : 'Anexe os arquivos prontos ou cole um link.'}
        </p>
      </div>

      <div className="p-5 space-y-4">
        {/* Arquivos */}
        <div
          onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) } }}
        >
          {files.length > 0 && (
            <div className={`grid gap-2 mb-2 ${max === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {files.map((f, i) => (
                <div
                  key={f.id}
                  draggable={max > 1}
                  onDragStart={() => setDragId(f.id)}
                  onDragOver={e => { if (dragId) e.preventDefault() }}
                  onDrop={e => { if (dragId) { e.preventDefault(); e.stopPropagation(); dropOn(f.id) } }}
                  className={`relative rounded-2xl overflow-hidden border bg-black ${dragId === f.id ? 'opacity-40' : ''}`}
                  style={{ borderColor: f.error ? '#EF4444' : 'var(--sm-border)' }}
                >
                  {f.type === 'video' ? (
                    <video src={f.preview} controls={max === 1 && !!f.url} muted={max > 1} playsInline preload="metadata"
                      className={`w-full ${max === 1 ? 'max-h-[360px]' : 'aspect-[4/5] object-cover'} bg-black`} />
                  ) : (
                    <img src={f.preview} alt={f.name} className={`w-full ${max === 1 ? 'max-h-[360px] object-contain' : 'aspect-[4/5] object-cover'}`} />
                  )}
                  {max > 1 && (
                    <span className="absolute top-2 left-2 min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center bg-black/70 text-white">{i + 1}</span>
                  )}
                  {max > 1 && f.type === 'video' && (
                    <span className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center bg-black/70 text-white"><Play className="w-3 h-3" /></span>
                  )}
                  {/* Rodapé: nome, progresso, ações */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-black/0 pt-6 px-2 pb-2">
                    {!f.url && !f.error && (
                      <div className="h-1 rounded-full bg-white/25 overflow-hidden mb-1.5">
                        <div className="h-full bg-white transition-[width] duration-200" style={{ width: `${Math.round(f.progress * 100)}%` }} />
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="flex-1 min-w-0 text-[10.5px] text-white/90 truncate">
                        {f.error ? f.error : !f.url ? `Enviando ${Math.round(f.progress * 100)}%` : `${f.name}${f.size ? ` · ${fmtSize(f.size)}` : ''}`}
                      </span>
                      {max > 1 && (
                        <>
                          <button type="button" onClick={() => move(f.id, -1)} disabled={i === 0} aria-label="Mover para antes"
                            className="w-6 h-6 rounded-full bg-white/15 text-white flex items-center justify-center disabled:opacity-30"><ArrowLeft className="w-3 h-3" /></button>
                          <button type="button" onClick={() => move(f.id, 1)} disabled={i === files.length - 1} aria-label="Mover para depois"
                            className="w-6 h-6 rounded-full bg-white/15 text-white flex items-center justify-center disabled:opacity-30"><ArrowRight className="w-3 h-3" /></button>
                        </>
                      )}
                      <button type="button" onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))} aria-label="Tirar arquivo"
                        className="w-6 h-6 rounded-full bg-white/15 text-white flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(max > 1 ? files.length < max : true) && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-2xl border border-dashed px-4 py-6 flex flex-col items-center gap-2 text-center transition-colors hover:bg-[var(--sm-bg-alt)]"
              style={{ borderColor: dragOver ? '#2563EB' : 'var(--sm-border)', background: dragOver ? 'rgba(37,99,235,0.06)' : undefined }}
            >
              <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--sm-primary)' }}>
                <Upload className="w-4 h-4" style={{ color: '#ffffff' }} />
              </span>
              <span className="text-[13px] font-semibold text-[var(--sm-text-1)]">
                {files.length > 0 && max === 1 ? 'Trocar o arquivo' : files.length > 0 ? 'Adicionar mais' : task.deliverable_type === 'reels' ? 'Anexar o vídeo' : task.deliverable_type === 'post' ? 'Anexar a imagem' : 'Anexar arquivos'}
              </span>
              <span className="text-[11.5px] text-[var(--sm-text-3)]">
                {max > 1 ? `Até ${max} arquivos. No computador, dá para arrastar para cá e mudar a ordem arrastando.` : 'No computador, dá para arrastar o arquivo para cá.'}
              </span>
            </button>
          )}
          <input ref={inputRef} type="file" accept={accept} multiple={max > 1} className="hidden"
            onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }} />
        </div>

        {/* Link */}
        <div>
          <label className="text-[11.5px] font-medium text-[var(--sm-text-3)] mb-1.5 flex items-center gap-1.5">
            <LinkIcon className="w-3.5 h-3.5" /> {files.length > 0 ? 'Link (opcional)' : 'Ou cole um link (Drive, WeTransfer…)'}
          </label>
          <input type="url" inputMode="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://drive.google.com/..."
            className={`${fieldCls} h-10`} style={fieldStyle} />
          {files.length === 0 && link.trim() && (
            <p className="text-[11.5px] text-[var(--sm-text-3)] mt-1.5 leading-snug">Dica: anexando o arquivo aqui, a agência já publica sem precisar baixar do link.</p>
          )}
        </div>

        {/* Observação */}
        <div>
          <label className="text-[11.5px] font-medium text-[var(--sm-text-3)] mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Observação para a agência (opcional)
          </label>
          <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: deixei duas versões de capa no link."
            className={`${fieldCls} py-2.5 resize-none`} style={fieldStyle} />
        </div>

        {error && <p className="text-[12.5px] font-medium" style={{ color: '#DC2626' }}>{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="w-full h-12 rounded-2xl text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
          style={{ background: sent ? '#10B981' : 'var(--sm-primary)', color: '#ffffff' }}
        >
          {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
            : uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Aguarde o arquivo terminar de subir</>
            : sent ? <><Check className="w-4 h-4" /> Entrega enviada</>
            : <><Send className="w-4 h-4" /> {already ? 'Enviar de novo' : 'Enviar entrega'}</>}
        </button>
      </div>
    </div>
  )
}

// ── Janela da demanda ─────────────────────────────────────────────────────────

function TaskModal({ task, token, onClose, onUpdated }: {
  task: CollaboratorTask
  token: string
  onClose: () => void
  onUpdated: (id: string, patch: Partial<CollaboratorTask>) => void
}) {
  const st = STATUS[task.status] ?? STATUS.a_fazer
  const pri = PRIORITY[task.priority] ?? PRIORITY.media
  const overdue = isOverdue(task)
  const links = Array.isArray(task.task_links) ? task.task_links : []
  const spec = task.deliverable_type ? DELIVERABLE[task.deliverable_type] : null
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const start = async () => {
    setStarting(true)
    try {
      const { data, error } = await (supabase as any).rpc('update_collaborator_task', { p_token: token, p_task_id: task.id, p_status: 'em_andamento' })
      if (!error && !data?.error) onUpdated(task.id, { status: 'em_andamento' })
    } finally {
      setStarting(false)
    }
  }

  const delivered = task.deliveries ?? []

  return createPortal(
    <div data-theme="light" className="portal-light fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm-glass-overlay p-0 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="sm-glass-modal shadow-2xl w-full sm:max-w-[640px] max-h-[94dvh] overflow-y-auto overflow-x-hidden rounded-t-[26px] sm:rounded-[26px]"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="sticky top-0 z-10 px-5 sm:px-6 pt-5 pb-4 border-b border-[var(--sm-border)]" style={{ background: 'var(--sm-bg-card2, var(--sm-bg-card))' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--sm-text-3)] truncate">{task.clients?.company_name ?? 'Interno'}</p>
              <h2 className="font-display text-[22px] sm:text-[26px] font-bold leading-[1.05] tracking-[-0.025em] text-[var(--sm-text-1)] mt-1.5">{task.title}</h2>
            </div>
            <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full border border-[var(--sm-border)] flex items-center justify-center flex-shrink-0 hover:bg-[var(--sm-bg-alt)]">
              <X className="w-4 h-4 text-[var(--sm-text-2)]" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
            <Dot color={st.color}>{st.label}</Dot>
            <Dot color={pri.color}>{pri.label}</Dot>
            {spec && <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--sm-text-2)]"><spec.Icon className="w-3.5 h-3.5" /> {spec.label}</span>}
            {task.due_date && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium tabular-nums" style={{ color: overdue ? '#DC2626' : 'var(--sm-text-2)' }}>
                <CalendarDays className="w-3.5 h-3.5" /> {overdue ? 'Atrasada · ' : 'Prazo '}{fmtDate(task.due_date, true)}{task.due_time ? ` às ${task.due_time.slice(0, 5)}` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-5">
          {/* Pedido de ajuste */}
          {needsAdjust(task) && (
            <div className="relative rounded-2xl border border-[var(--sm-border)] pl-5 pr-4 py-3.5" style={{ background: 'rgba(245,158,11,0.07)' }}>
              <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-[#F59E0B]" />
              <p className="text-[12.5px] font-semibold text-[var(--sm-text-1)]">A agência pediu ajuste</p>
              <p className="text-[13px] text-[var(--sm-text-2)] mt-1 leading-relaxed whitespace-pre-wrap">{task.agency_feedback}</p>
            </div>
          )}

          {task.status === 'a_fazer' && !task.in_planner && (
            <button onClick={start} disabled={starting}
              className="w-full h-11 rounded-2xl border border-[var(--sm-border)] text-[13px] font-semibold text-[var(--sm-text-1)] inline-flex items-center justify-center gap-2 hover:bg-[var(--sm-bg-alt)] disabled:opacity-60">
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Comecei a fazer
            </button>
          )}

          {task.description && (
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--sm-text-3)] mb-2">O que fazer</p>
              <p className="text-[14px] text-[var(--sm-text-1)] leading-relaxed whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          <References links={links} />

          {/* Entrega */}
          {task.in_planner || (task.status === 'concluido' && !!task.delivered_at) ? (
            <div className={`${portalPanel} relative overflow-hidden pl-6 pr-5 py-4`}>
              <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r bg-[#10B981]" />
              <p className="text-[14px] font-semibold text-[var(--sm-text-1)] flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#10B981]" /> Entrega aprovada</p>
              <p className="text-[12.5px] text-[var(--sm-text-2)] mt-1 leading-snug">{task.in_planner ? 'A agência aprovou e o conteúdo já está no planejamento do cliente. Obrigado!' : 'A agência aprovou a sua entrega. Obrigado!'}</p>
              {delivered.length > 0 && (
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {delivered.map(d => (
                    <a key={d.id} href={mediaUrl(d.url)} target="_blank" rel="noopener noreferrer" className="w-16 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-black">
                      {d.type === 'video'
                        ? <span className="w-full h-full flex items-center justify-center"><Film className="w-4 h-4 text-white" /></span>
                        : <img src={mediaUrl(d.url)} alt="" className="w-full h-full object-cover" />}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : task.status === 'concluido' && !task.delivered_at ? (
            <p className="text-[13px] text-[var(--sm-text-2)]">Demanda concluída.</p>
          ) : (
            <DeliveryEditor task={task} token={token} onSaved={patch => onUpdated(task.id, patch)} />
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

// ── Carregando / erro ─────────────────────────────────────────────────────────

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center h-full min-h-[60vh] px-6">{children}</div>
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function CollaboratorPortal() {
  const { token } = useParams<{ token: string }>()
  const [member, setMember] = useState<CollaboratorMember | null>(null)
  const [agencyName, setAgencyName] = useState<string | null>(null)
  const [tasks, setTasks] = useState<CollaboratorTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState('inicio')
  const [filter, setFilter] = useState('abertas')

  useEffect(() => {
    if (!token) { setError('O link está incompleto.'); setLoading(false); return }
    let alive = true
    ;(async () => {
      try {
        const { data, error: rpcError } = await (supabase as any).rpc('get_collaborator_data', { p_token: token })
        if (rpcError) throw new Error(rpcError.message)
        if (data?.error) throw new Error(data.error)
        if (!alive) return
        setMember(data.member)
        setAgencyName(data.agency_name ?? null)
        setTasks(data.tasks ?? [])
      } catch (e) {
        if (alive) setError((e as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [token])

  useEffect(() => {
    document.title = member ? `Demandas · ${member.name.split(' ')[0]}` : 'Portal do colaborador'
  }, [member])

  const updateTask = (id: string, patch: Partial<CollaboratorTask>) =>
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))

  const openTask = tasks.find(t => t.id === openId) ?? null
  const openCount = tasks.filter(isOpen).length

  const nav: PortalNavItem[] = [
    { key: 'inicio',   label: 'Início',   icon: LayoutDashboard },
    { key: 'demandas', label: 'Demandas', icon: ListChecks, badge: openCount || undefined },
  ]

  const subtitle = agencyName ? `Colaborador · ${agencyName}` : 'Portal do colaborador'

  if (loading || error || !member) {
    return (
      <PortalLayout publicAccess clientName={subtitle}>
        <Center>
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
              <p className="text-[13px] text-[var(--sm-text-3)]">Carregando suas demandas...</p>
            </div>
          ) : (
            <div className="text-center max-w-sm">
              <p className="font-display text-[26px] font-bold tracking-[-0.025em] text-[var(--sm-text-1)]">Link inválido</p>
              <p className="text-[13.5px] text-[var(--sm-text-2)] mt-2 leading-relaxed">
                {error === 'Link inválido' ? 'Este link não está mais ativo. Peça um novo link para a agência.' : error ?? 'Colaborador não encontrado.'}
              </p>
            </div>
          )}
        </Center>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout publicAccess clientName={subtitle} nav={nav} active={tab} onNavigate={setTab}>
      <div className="max-w-[1320px] mx-auto">
        {tab === 'inicio' ? (
          <HomeTab
            member={member}
            tasks={tasks}
            onOpen={t => setOpenId(t.id)}
            onGo={(next, f) => { if (f) setFilter(f); setTab(next) }}
          />
        ) : (
          <DemandsTab tasks={tasks} filter={filter} setFilter={setFilter} onOpen={t => setOpenId(t.id)} />
        )}
      </div>

      {openTask && token && (
        <TaskModal task={openTask} token={token} onClose={() => setOpenId(null)} onUpdated={updateTask} />
      )}
    </PortalLayout>
  )
}
