import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, Instagram, Sparkles, RefreshCw, Plus, Trash2,
  Users, Eye, Heart, DollarSign, TrendingUp, Calendar, CheckCircle2, BookOpen,
  Pencil, Save, X, Upload, File, FileText, Link2, ExternalLink, ImageIcon,
  ArrowUp, ArrowDown, Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/hooks/useAuth'
import { useClient } from '@/hooks/useClients'
import { useSubscription } from '@/hooks/useSubscription'
import {
  useClientReports, useCreateReport, useUpdateReport, useDeleteReport,
  useAddReportAttachment, useDeleteReportAttachment,
} from '@/hooks/useReports'
import { usePlanningReport } from '@/hooks/usePlanningReport'
import { IgInsights } from '@/components/reports/IgInsights'
import { supabase } from '@/integrations/supabase/client'
import { callProxy } from '@/lib/aiProxy'
import { checkStorageLimit } from '@/utils/storageGate'
import { contentTypeLabels, statusLabels } from '@/utils/formatters'
import type { ClientReport, ReportAttachment, ReportAttachmentType } from '@/types'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

function monthLabel(month: number, year: number) {
  return `${MONTHS[month - 1]} ${year}`
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtBRL(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(n)
}

function followerDiff(r: ClientReport): string {
  if (r.followers_start == null || r.followers_end == null) return fmt(r.followers_end)
  const diff = r.followers_end - r.followers_start
  return diff >= 0 ? `+${fmt(diff)}` : fmt(diff)
}

function hasPaid(r: ClientReport) {
  return r.paid_investment != null || r.paid_leads != null || r.paid_cpl != null
    || r.paid_conversions != null || r.paid_roas != null
}

function prevMonthOf(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
}

// ── Form de edição manual ────────────────────────────────────────────────

type ReportForm = {
  followers_start: string; followers_end: string; reach: string
  engagement: string; impressions: string; posts_published: string
  paid_investment: string; paid_leads: string; paid_cpl: string
  paid_conversions: string; paid_roas: string; analysis_text: string
}

function toForm(r: ClientReport): ReportForm {
  const s = (v: number | null) => (v == null ? '' : String(v))
  return {
    followers_start: s(r.followers_start), followers_end: s(r.followers_end),
    reach: s(r.reach), engagement: s(r.engagement),
    impressions: s(r.impressions), posts_published: s(r.posts_published),
    paid_investment: s(r.paid_investment), paid_leads: s(r.paid_leads),
    paid_cpl: s(r.paid_cpl), paid_conversions: s(r.paid_conversions),
    paid_roas: s(r.paid_roas), analysis_text: r.analysis_text ?? '',
  }
}

function fromForm(f: ReportForm): Partial<ClientReport> {
  const n = (v: string) => v.trim() === '' ? null : Number(v)
  return {
    followers_start: n(f.followers_start), followers_end: n(f.followers_end),
    reach: n(f.reach), engagement: n(f.engagement),
    impressions: n(f.impressions), posts_published: n(f.posts_published),
    paid_investment: n(f.paid_investment), paid_leads: n(f.paid_leads),
    paid_cpl: n(f.paid_cpl), paid_conversions: n(f.paid_conversions),
    paid_roas: n(f.paid_roas),
    analysis_text: f.analysis_text.trim() || null,
  }
}

// ── Modal: novo relatório (escolhe mês/ano) ─────────────────────────────────

function CreateReportModal({
  clientId, open, onClose, onCreated,
}: { clientId: string; open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast()
  const create = useCreateReport()
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year, setYear] = useState(String(CURRENT_YEAR))

  const handleCreate = async () => {
    try {
      const report = await create.mutateAsync({ client_id: clientId, month: Number(month), year: Number(year) })
      toast('Relatório criado!', 'success')
      onCreated(report.id)
      onClose()
    } catch (err: any) {
      toast(err.message === 'duplicate key value violates unique constraint "client_reports_client_id_month_year_key"'
        ? 'Já existe um relatório para esse mês.' : err.message, 'error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Novo relatório</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-1">
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: 'var(--sm-text-2)' }}>Mês</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: 'var(--sm-text-2)' }}>Ano</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleCreate} disabled={create.isPending}>
            <Plus className="w-3 h-3" /> Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Anexo (item + modal de adicionar) ────────────────────────────────────

function AttachmentItem({ att, first, onDelete }: { att: ReportAttachment; first: boolean; onDelete: () => void }) {
  const [imgOpen, setImgOpen] = useState(false)
  const isImg = att.type === 'imagem'
  const href = att.type === 'link' ? att.link_url : att.file_url
  const iconBtn = 'w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors'

  return (
    <>
      <div
        onClick={() => isImg && setImgOpen(true)}
        className={`group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-black/[0.02] ${isImg ? 'cursor-pointer' : ''} ${first ? '' : 'border-t'}`}
        style={{ borderColor: 'var(--sm-border)' }}
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: 'var(--sm-bg-alt)' }}>
          {isImg && att.file_url
            ? <img src={att.file_url} alt="" className="w-full h-full object-cover" />
            : att.type === 'pdf' ? <FileText className="w-4 h-4" style={{ color: '#EF4444' }} />
            : att.type === 'link' ? <Link2 className="w-4 h-4" style={{ color: '#2563EB' }} />
            : <File className="w-4 h-4" style={{ color: 'var(--sm-text-4)' }} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{att.title}</p>
          <p className="text-[11.5px] truncate" style={{ color: 'var(--sm-text-4)' }}>
            {att.type === 'imagem' ? 'Imagem' : att.type === 'pdf' ? 'PDF' : 'Link'}
            {att.description && <span style={{ color: 'var(--sm-text-3)' }}> · {att.description}</span>}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity" style={{ color: 'var(--sm-text-3)' }}>
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className={iconBtn} title="Abrir" aria-label="Abrir" {...(att.type !== 'link' ? { download: true } : {})}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            className={`${iconBtn} hover:text-red-500`} title="Excluir anexo" aria-label="Excluir anexo">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isImg && imgOpen && att.file_url && (
        <Dialog open={imgOpen} onOpenChange={setImgOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle className="truncate">{att.title}</DialogTitle></DialogHeader>
            <img src={att.file_url} alt={att.title} className="w-full rounded-xl" />
            <DialogFooter>
              <a href={att.file_url} download target="_blank" rel="noopener noreferrer">
                <Button size="sm"><ExternalLink className="w-3.5 h-3.5" /> Baixar</Button>
              </a>
              <Button variant="outline" size="sm" onClick={() => setImgOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function AddAttachmentModal({
  reportId, open, onClose,
}: { reportId: string; open: boolean; onClose: () => void }) {
  const { user, agencyId } = useAuth()
  const { toast } = useToast()
  const add = useAddReportAttachment()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState({ type: 'imagem' as ReportAttachmentType, title: '', description: '', link_url: '' })

  const isLink = form.type === 'link'
  const reset = () => { setForm({ type: 'imagem', title: '', description: '', link_url: '' }); setFile(null) }

  const handleSave = async () => {
    if (!form.title.trim() || !user) return
    setUploading(true)
    try {
      let file_url: string | null = null
      let file_size: number | null = null

      if (file && !isLink) {
        const { allowed, message } = await checkStorageLimit(file.size)
        if (!allowed) { toast(message ?? 'Limite de armazenamento atingido.', 'error'); setUploading(false); return }
        const ext = file.name.split('.').pop() || 'bin'
        const path = `${agencyId!}/${reportId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('report-attachments').upload(path, file)
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('report-attachments').getPublicUrl(path)
        file_url = publicUrl
        file_size = file.size
      }

      await add.mutateAsync({
        report_id: reportId, type: form.type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        file_url: isLink ? null : file_url,
        link_url: isLink ? (form.link_url.trim() || null) : null,
        file_size: isLink ? null : file_size,
      })

      toast('Anexo adicionado!', 'success')
      reset(); onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Adicionar anexo</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-1">
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: 'var(--sm-text-2)' }}>Tipo</label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as ReportAttachmentType }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="imagem">Imagem</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="link">Link externo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Input label="Título *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Print de resultados do Instagram" />
          <Textarea label="Descrição (opcional)" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Breve descrição..." />

          {isLink ? (
            <Input label="URL *" value={form.link_url} onChange={e => setForm(p => ({ ...p, link_url: e.target.value }))} placeholder="https://..." />
          ) : (
            <div>
              <label className="block text-[12px] mb-1.5" style={{ color: 'var(--sm-text-2)' }}>Arquivo</label>
              {file ? (
                <div className="flex items-center gap-2 p-2.5 rounded-md" style={{ border: '1px solid var(--sm-border)', background: 'var(--sm-bg-alt)' }}>
                  <File className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--sm-text-2)' }} />
                  <span className="text-[12px] truncate flex-1" style={{ color: 'var(--sm-text-1)' }}>{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} className="flex-shrink-0 hover:text-red-400" style={{ color: 'var(--sm-text-2)' }}><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 w-full h-9 px-3 rounded-md border border-dashed text-[12px] transition-colors"
                  style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
                  <Upload className="w-3.5 h-3.5" /> Selecionar arquivo
                </button>
              )}
              <input ref={fileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { onClose(); reset() }}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={uploading || !form.title.trim() || (isLink && !form.link_url.trim())}>
            {uploading ? <><Upload className="w-3 h-3 animate-pulse" /> Enviando...</> : <><Plus className="w-3 h-3" /> Adicionar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── KPI do resumo do mês ───────────────────────────────────────────────────

function PctBadge({ current, prev }: { current: number | null | undefined; prev: number | null | undefined }) {
  if (current == null || prev == null || prev === 0) return null
  const diff = Math.round(((current - prev) / Math.abs(prev)) * 100)
  if (diff === 0) {
    return (
      <span className="text-[11px] font-medium inline-flex items-center gap-0.5" style={{ color: 'var(--sm-text-4)' }}>
        <Minus className="w-3 h-3" /> 0%
      </span>
    )
  }
  const up = diff > 0
  return (
    <span className="text-[11px] font-semibold inline-flex items-center gap-0.5 tabular-nums" style={{ color: up ? '#16A34A' : '#EF4444' }}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />} {Math.abs(diff)}%
    </span>
  )
}

function KpiCell({ label, value, delta }: { label: string; value: string; delta?: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] truncate" style={{ color: 'var(--sm-text-4)' }}>{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1 flex-wrap">
        <p className="font-display text-[22px] font-bold leading-none tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
        {delta}
      </div>
    </div>
  )
}

function StatRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[12px] w-24 flex-shrink-0 truncate" style={{ color: 'var(--sm-text-3)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sm-bg-alt)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#2563EB' }} />
      </div>
      <span className="text-[12px] font-semibold w-6 text-right flex-shrink-0 tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{count}</span>
    </div>
  )
}

// Seção numerada com título display e linha fina abaixo do cabeçalho.
function Secao({ n, title, aside, accent, children }: {
  n: string; title: string; aside?: React.ReactNode; accent?: string; children: React.ReactNode
}) {
  return (
    <section className="relative rounded-2xl border overflow-hidden" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      {accent && <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r" style={{ background: accent }} />}
      <div className="px-5 py-3.5 flex items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--sm-border)' }}>
        <h2 className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{n}</span>
          <span className="font-display text-[15px] font-bold truncate" style={{ color: 'var(--sm-text-1)' }}>{title}</span>
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Fato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: 'var(--sm-text-4)' }}>{label}</p>
      <p className="text-[15px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
    </div>
  )
}

const primaryBtn = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60'
const ghostBtn = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[12.5px] font-medium hover:bg-black/5 transition-colors disabled:opacity-60'
const ghostStyle = { borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' } as const

// ── Página ────────────────────────────────────────────────────────────────

export function ReportsWorkspace() {
  const { clientId } = useParams<{ clientId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { isDark } = useTheme()

  const now = new Date()
  const initialMonth = Number(searchParams.get('month')) || now.getMonth() + 1
  const initialYear  = Number(searchParams.get('year'))  || now.getFullYear()

  const { data: subData } = useSubscription()
  const { data: client } = useClient(clientId!)
  const { data: reports = [], isLoading: reportsLoading } = useClientReports(clientId!)
  const updateReport = useUpdateReport()
  const deleteReport = useDeleteReport()
  const deleteAtt     = useDeleteReportAttachment()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [syncing, setSyncing]       = useState(false)
  const [aiLoading, setAiLoading]   = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [form, setForm]             = useState<ReportForm | null>(null)
  const [attOpen, setAttOpen]       = useState(false)

  useEffect(() => {
    if (reports.length === 0) { setSelectedId(null); return }
    if (selectedId && reports.some(r => r.id === selectedId)) return
    const match = reports.find(r => r.month === initialMonth && r.year === initialYear)
    setSelectedId((match ?? reports[0]).id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports])

  const selected = reports.find(r => r.id === selectedId) ?? null

  const planning = usePlanningReport({
    clientId,
    month: selected?.month ?? initialMonth,
    year: selected?.year ?? initialYear,
    clientVisibleOnly: false,
  })

  const prevMonthLabel = selected ? monthLabel(prevMonthOf(selected.month, selected.year).month, prevMonthOf(selected.month, selected.year).year) : ''
  const prevReport = selected
    ? (() => {
        const p = prevMonthOf(selected.month, selected.year)
        return reports.find(r => r.month === p.month && r.year === p.year) ?? null
      })()
    : null

  useEffect(() => {
    setConfirmDel(false)
    setEditMode(false)
    setForm(selected ? toForm(selected) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const f = (key: keyof ReportForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => p ? { ...p, [key]: e.target.value } : p)

  const handleSave = async () => {
    if (!selected || !form) return
    try {
      await updateReport.mutateAsync({ id: selected.id, ...fromForm(form) })
      toast('Relatório salvo!', 'success')
      setEditMode(false)
    } catch (err: any) { toast(err.message ?? 'Erro ao salvar.', 'error') }
  }

  const handleDelete = async () => {
    if (!selected) return
    try {
      await deleteReport.mutateAsync(selected.id)
      toast('Relatório removido.', 'success')
      setConfirmDel(false)
      setSelectedId(reports.find(r => r.id !== selected.id)?.id ?? null)
    } catch (err: any) { toast(err.message ?? 'Erro ao remover relatório.', 'error') }
  }

  const handleDeleteAtt = async (att: ReportAttachment) => {
    try {
      await deleteAtt.mutateAsync({ id: att.id, fileUrl: att.file_url })
      toast('Anexo removido.', 'success')
    } catch (err: any) { toast(err.message ?? 'Erro ao remover anexo.', 'error') }
  }

  const handleAutoGenerate = async () => {
    if (!selected) return
    setSyncing(true)
    try {
      const { data, error } = await supabase.functions.invoke('instagram-report', {
        body: { client_id: clientId, month: selected.month, year: selected.year },
      })
      if (error) throw error
      if (data && data.ok === false) {
        toast(data.message ?? 'Não foi possível gerar o relatório.', 'error')
        return
      }
      toast('Relatório atualizado com dados do Instagram.', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao gerar relatório.', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleAiAnalysis = async () => {
    if (!selected) return
    setAiLoading(true)
    try {
      const ig = selected.ig_data
      const pl = planning.data
      const payload = {
        mes: monthLabel(selected.month, selected.year),
        seguidores_inicio: selected.followers_start,
        seguidores_fim: selected.followers_end,
        alcance: selected.reach,
        impressoes: selected.impressions,
        engajamento_pct: selected.engagement,
        posts_publicados: selected.posts_published,
        visitas_perfil: ig?.profile_views ?? null,
        contas_engajadas: ig?.accounts_engaged ?? null,
        interacoes: ig?.interactions ?? null,
        top_posts: ig?.top_posts?.map(p => ({ tipo: p.media_type, curtidas: p.likes, comentarios: p.comments, alcance: p.reach })) ?? null,
        demografia: ig?.demographics ?? null,
        planejamento: pl ? {
          total_conteudos: pl.total,
          publicados: pl.published.length,
          por_status: pl.byStatus,
          por_tipo: pl.byContentType,
          titulos_publicados: pl.published.slice(0, 10).map(p => p.title),
        } : null,
      }
      const { content } = await callProxy<{ content?: string }>('report-analysis', payload)
      if (!content) throw new Error('A IA não retornou texto.')
      await updateReport.mutateAsync({ id: selected.id, analysis_text: content })
      toast('Análise gerada pela IA!', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao gerar análise.', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  if (!subData?.plan.hasReports) {
    return (
      <div className="min-h-full flex items-center justify-center p-6" style={{ background: 'var(--sm-bg-page)' }}>
        <div className="flex flex-col items-center text-center gap-3 max-w-sm">
          <BarChart3 className="w-7 h-7" style={{ color: 'var(--sm-text-4)' }} />
          <p className="font-display text-[20px] font-bold" style={{ color: 'var(--sm-text-1)' }}>Relatórios no Pro e Agency</p>
          <a href="/assinatura" className="h-10 px-4 inline-flex items-center rounded-xl text-white text-[13px] font-semibold hover:opacity-90" style={{ background: 'var(--sm-primary)' }}>
            Ver planos
          </a>
        </div>
      </div>
    )
  }

  const showPaid = selected ? (hasPaid(selected) || editMode) : false
  const atts = selected?.attachments ?? []
  let secao = 0
  const proxima = () => String(++secao).padStart(2, '0')

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">

        {/* ── Barra de topo (no celular, ao lado do menu) ── */}
        <div className="flex items-center justify-between gap-3 max-md:pl-12 max-md:-mt-[3.25rem] max-md:min-h-[44px]">
          <button onClick={() => navigate('/reports')}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline" style={{ color: 'var(--sm-text-3)' }}>
            <ArrowLeft className="w-4 h-4" /> Relatórios
          </button>
          <button onClick={() => setCreateOpen(true)} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
            <Plus className="w-3.5 h-3.5" /> Novo relatório
          </button>
        </div>

        {/* ── Cabeçalho do cliente ── */}
        <header className="flex items-center gap-4">
          {client?.logo_url ? (
            <img src={client.logo_url} alt="" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
          ) : (
            <span className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 font-display font-bold text-[20px]"
              style={{ background: 'var(--sm-bg-card)', color: 'var(--sm-text-3)', border: '1px solid var(--sm-border)' }}>
              {(client?.company_name ?? '?').slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Relatório mensal</p>
            <h1 className="font-display text-[26px] md:text-[32px] font-bold leading-[1.05] tracking-[-0.02em] truncate" style={{ color: 'var(--sm-text-1)' }}>
              {client?.company_name ?? 'Cliente'}
            </h1>
          </div>
        </header>

        {reportsLoading ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
            <div className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
            <div className="h-56 rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed" style={{ borderColor: 'var(--sm-border)' }}>
            <BarChart3 className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--sm-text-4)' }} />
            <p className="text-[13.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Nenhum relatório ainda</p>
            <p className="text-[12.5px] mt-1 mb-4" style={{ color: 'var(--sm-text-3)' }}>Crie o primeiro relatório mensal para este cliente.</p>
            <button onClick={() => setCreateOpen(true)} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
              <Plus className="w-3.5 h-3.5" /> Criar primeiro relatório
            </button>
          </div>
        ) : (
          <>
            {/* ── Meses como abas sublinhadas ── */}
            <div className="flex items-end gap-1 border-b overflow-x-auto scrollbar-none" style={{ borderColor: 'var(--sm-border)' }}>
              {reports.map(r => {
                const ativo = r.id === selectedId
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    aria-current={ativo ? 'true' : undefined}
                    className="flex-shrink-0 h-10 px-3 border-b-2 -mb-px text-[13px] whitespace-nowrap transition-colors"
                    style={{ borderColor: ativo ? '#2563EB' : 'transparent', color: ativo ? 'var(--sm-text-1)' : 'var(--sm-text-3)', fontWeight: ativo ? 600 : 500 }}
                  >
                    {monthLabel(r.month, r.year)}
                  </button>
                )
              })}
            </div>

            {selected && form && (
              <div className="space-y-5">

                {/* ── Título do mês + ações ── */}
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-[20px] font-bold" style={{ color: 'var(--sm-text-1)' }}>{monthLabel(selected.month, selected.year)}</h2>
                    <p className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--sm-text-3)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: selected.ig_synced_at ? '#22C55E' : 'var(--sm-border-alt)' }} />
                      {selected.ig_synced_at
                        ? `Sincronizado com o Instagram em ${new Date(selected.ig_synced_at).toLocaleDateString('pt-BR')}`
                        : 'Ainda não sincronizado com o Instagram'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {editMode ? (
                      <>
                        <button onClick={() => { setEditMode(false); setForm(toForm(selected)) }} className={ghostBtn} style={ghostStyle}>
                          <X className="w-3.5 h-3.5" /> Cancelar
                        </button>
                        <button onClick={handleSave} disabled={updateReport.isPending} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
                          <Save className="w-3.5 h-3.5" /> Salvar
                        </button>
                      </>
                    ) : confirmDel ? (
                      <>
                        <span className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>Excluir o relatório de {monthLabel(selected.month, selected.year)}?</span>
                        <button onClick={() => setConfirmDel(false)} className={ghostBtn} style={ghostStyle}>Não</button>
                        <button onClick={handleDelete} disabled={deleteReport.isPending} className={primaryBtn} style={{ background: '#EF4444' }}>
                          Sim, excluir
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setConfirmDel(true)} title="Excluir relatório deste mês" aria-label="Excluir relatório deste mês"
                          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-colors"
                          style={{ color: 'var(--sm-text-3)' }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditMode(true)} className={ghostBtn} style={ghostStyle}>
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button onClick={handleAutoGenerate} disabled={syncing} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}
                          title="Preencher com os dados reais da conta de Instagram conectada">
                          {syncing
                            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sincronizando...</>
                            : <><Instagram className="w-3.5 h-3.5" /> Gerar do Instagram</>}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Resumo do mês: uma faixa com divisórias ── */}
                <div>
                  <div className="rounded-2xl border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px overflow-hidden [&>*]:bg-[color:var(--sm-bg-card)]"
                    style={{ background: 'var(--sm-border)', borderColor: 'var(--sm-border)' }}>
                    <KpiCell label="Seguidores" value={followerDiff(selected)}
                      delta={<PctBadge current={selected.followers_end} prev={prevReport?.followers_end} />} />
                    <KpiCell label="Alcance" value={fmt(selected.reach)}
                      delta={<PctBadge current={selected.reach} prev={prevReport?.reach} />} />
                    <KpiCell label="Engajamento" value={selected.engagement != null ? `${selected.engagement}%` : '—'}
                      delta={<PctBadge current={selected.engagement} prev={prevReport?.engagement} />} />
                    <KpiCell label="Posts publicados" value={fmt(selected.posts_published)}
                      delta={<PctBadge current={selected.posts_published} prev={prevReport?.posts_published} />} />
                    <KpiCell label="Planejados" value={String(planning.data?.total ?? 0)} />
                    <KpiCell label="Publicados no calendário" value={String(planning.data?.published.length ?? 0)} />
                  </div>
                  {!prevReport && (
                    <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--sm-text-4)' }}>
                      Sem relatório de {prevMonthLabel} para comparar a variação.
                    </p>
                  )}
                </div>

                {/* ── Redes sociais ── */}
                <Secao n={proxima()} title="Redes sociais">
                  <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
                    {editMode ? (
                      <>
                        <Input label="Seguidores (início)" type="number" value={form.followers_start} onChange={f('followers_start')} placeholder="0" />
                        <Input label="Seguidores (fim)" type="number" value={form.followers_end} onChange={f('followers_end')} placeholder="0" />
                        <Input label="Alcance" type="number" value={form.reach} onChange={f('reach')} placeholder="0" />
                        <Input label="Engajamento (%)" type="number" value={form.engagement} onChange={f('engagement')} placeholder="0.00" />
                        <Input label="Impressões" type="number" value={form.impressions} onChange={f('impressions')} placeholder="0" />
                        <Input label="Posts publicados" type="number" value={form.posts_published} onChange={f('posts_published')} placeholder="0" />
                      </>
                    ) : (
                      ([
                        ['Seguidores (início)', fmt(selected.followers_start)],
                        ['Seguidores (fim)', fmt(selected.followers_end)],
                        ['Alcance', fmt(selected.reach)],
                        ['Engajamento', selected.engagement != null ? `${selected.engagement}%` : '—'],
                        ['Impressões', fmt(selected.impressions)],
                        ['Posts publicados', fmt(selected.posts_published)],
                      ] as [string, string][]).map(([label, value]) => <Fato key={label} label={label} value={value} />)
                    )}
                  </div>
                </Secao>

                <IgInsights report={selected} isDark={isDark} />

                {/* ── Planejamento ── */}
                <Secao n={proxima()} title="Planejamento"
                  aside={<button onClick={() => navigate('/planner')} className="text-[12px] font-semibold hover:underline" style={{ color: '#2563EB' }}>Abrir planejamento</button>}>
                  <div className="p-5 space-y-6">
                    {planning.isLoading ? (
                      <div className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--sm-bg-alt)' }} />
                    ) : !planning.data || planning.data.total === 0 ? (
                      <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>
                        Nenhum item planejado para este cliente neste mês.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2.5">
                            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-4)' }}>Por status</p>
                            {Object.entries(planning.data.byStatus).map(([status, count]) => (
                              <StatRow key={status} label={statusLabels[status] ?? status} count={count} total={planning.data!.total} />
                            ))}
                          </div>
                          <div className="space-y-2.5">
                            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--sm-text-4)' }}>Por tipo de conteúdo</p>
                            {Object.entries(planning.data.byContentType).map(([type, count]) => (
                              <StatRow key={type} label={contentTypeLabels[type] ?? type} count={count} total={planning.data!.total} />
                            ))}
                          </div>
                        </div>

                        {planning.data.published.length > 0 && (
                          <div>
                            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--sm-text-4)' }}>Publicados no mês</p>
                            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sm-border)' }}>
                              {planning.data.published.map((item, i) => (
                                <button
                                  key={item.id}
                                  onClick={() => navigate('/planner')}
                                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-black/[0.02] transition-colors ${i > 0 ? 'border-t' : ''}`}
                                  style={{ borderColor: 'var(--sm-border)' }}
                                >
                                  <span className="text-[12.5px] truncate" style={{ color: 'var(--sm-text-1)' }}>{item.title}</span>
                                  <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--sm-text-4)' }}>{contentTypeLabels[item.content_type] ?? item.content_type}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </Secao>

                {/* ── Tráfego pago ── */}
                {showPaid && (
                  <Secao n={proxima()} title="Tráfego pago">
                    <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
                      {editMode ? (
                        <>
                          <Input label="Investimento (R$)" type="number" value={form.paid_investment} onChange={f('paid_investment')} placeholder="0,00" />
                          <Input label="Leads" type="number" value={form.paid_leads} onChange={f('paid_leads')} placeholder="0" />
                          <Input label="CPL (R$)" type="number" value={form.paid_cpl} onChange={f('paid_cpl')} placeholder="0,00" />
                          <Input label="Conversões" type="number" value={form.paid_conversions} onChange={f('paid_conversions')} placeholder="0" />
                          <Input label="ROAS" type="number" value={form.paid_roas} onChange={f('paid_roas')} placeholder="0.00" />
                        </>
                      ) : (
                        ([
                          ['Investimento', fmtBRL(selected.paid_investment)],
                          ['Leads', fmt(selected.paid_leads)],
                          ['CPL', fmtBRL(selected.paid_cpl)],
                          ['Conversões', fmt(selected.paid_conversions)],
                          ['ROAS', selected.paid_roas != null ? `${selected.paid_roas}x` : '—'],
                        ] as [string, string][]).map(([label, value]) => <Fato key={label} label={label} value={value} />)
                      )}
                    </div>
                  </Secao>
                )}

                {/* ── Análise por IA ── */}
                <Secao n={proxima()} title="Análise do mês" accent="#2563EB"
                  aside={!editMode && (
                    <button onClick={handleAiAnalysis} disabled={aiLoading} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}
                      title="Gera uma narrativa combinando Instagram e execução do planejamento">
                      {aiLoading
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Gerando...</>
                        : <><Sparkles className="w-3.5 h-3.5" /> {selected.analysis_text ? 'Refazer com IA' : 'Gerar com IA'}</>}
                    </button>
                  )}>
                  <div className="p-5">
                    {editMode ? (
                      <Textarea
                        value={form.analysis_text}
                        onChange={f('analysis_text')}
                        placeholder="O que funcionou, o que não funcionou, próximos passos..."
                        rows={6}
                      />
                    ) : selected.analysis_text ? (
                      <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap max-w-[72ch]" style={{ color: 'var(--sm-text-1)' }}>{selected.analysis_text}</p>
                    ) : (
                      <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>
                        Nenhuma análise ainda. Clique em <strong style={{ color: 'var(--sm-text-1)' }}>Gerar com IA</strong> para um resumo automático combinando Instagram e planejamento.
                      </p>
                    )}
                  </div>
                </Secao>

                {/* ── Anexos ── */}
                <Secao n={proxima()} title={atts.length > 0 ? `Anexos · ${atts.length}` : 'Anexos'}
                  aside={<button onClick={() => setAttOpen(true)} className={ghostBtn} style={ghostStyle}><Plus className="w-3.5 h-3.5" /> Adicionar</button>}>
                  {atts.length === 0 ? (
                    <p className="text-[12.5px] text-center py-6 px-5" style={{ color: 'var(--sm-text-3)' }}>
                      Nenhum anexo ainda. Adicione prints, PDFs ou links de relatórios.
                    </p>
                  ) : (
                    <div>
                      {atts.map((att, i) => (
                        <AttachmentItem key={att.id} att={att} first={i === 0} onDelete={() => handleDeleteAtt(att)} />
                      ))}
                    </div>
                  )}
                </Secao>

              </div>
            )}
          </>
        )}
      </div>

      <CreateReportModal
        clientId={clientId!}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={id => setSelectedId(id)}
      />
      {selected && (
        <AddAttachmentModal reportId={selected.id} open={attOpen} onClose={() => setAttOpen(false)} />
      )}
    </div>
  )
}
