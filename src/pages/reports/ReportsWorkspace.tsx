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

function AttachmentItem({ att, onDelete }: { att: ReportAttachment; onDelete: () => void }) {
  const [imgOpen, setImgOpen] = useState(false)
  const isImg = att.type === 'imagem'

  return (
    <>
      <div
        onClick={() => isImg && setImgOpen(true)}
        className={`group flex items-center gap-3 p-3 rounded-xl transition-all ${isImg ? 'cursor-pointer' : ''}`}
        style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
          {isImg && att.file_url
            ? <img src={att.file_url} alt={att.title} className="w-full h-full object-cover" />
            : att.type === 'pdf' ? <FileText className="w-4 h-4 text-red-500" />
            : att.type === 'link' ? <Link2 className="w-4 h-4 text-blue-500" />
            : <File className="w-4 h-4" style={{ color: 'var(--sm-text-2)' }} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate" style={{ color: 'var(--sm-text-1)' }}>{att.title}</p>
          {att.description && <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--sm-text-2)' }}>{att.description}</p>}
          <p className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: 'var(--sm-text-2)' }}>
            {att.type === 'imagem' ? 'Imagem' : att.type === 'pdf' ? 'PDF' : 'Link'}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {att.type === 'link' && att.link_url && (
            <a href={att.link_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors" style={{ color: 'var(--sm-text-2)' }}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {att.file_url && att.type !== 'link' && (
            <a href={att.file_url} download target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors" style={{ color: 'var(--sm-text-2)' }}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            className="w-7 h-7 flex items-center justify-center rounded hover:text-red-400 transition-colors" style={{ color: 'var(--sm-text-2)' }}>
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

// ── KPI pequeno pro resumo do mês ──────────────────────────────────────────

function PctBadge({ current, prev }: { current: number | null | undefined; prev: number | null | undefined }) {
  if (current == null || prev == null || prev === 0) return null
  const diff = Math.round(((current - prev) / Math.abs(prev)) * 100)
  if (diff === 0) {
    return (
      <span className="text-[10px] font-medium flex items-center gap-0.5" style={{ color: 'var(--sm-text-2)' }}>
        <Minus className="w-2.5 h-2.5" /> 0%
      </span>
    )
  }
  const up = diff > 0
  return (
    <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${up ? 'text-emerald-500' : 'text-red-500'}`}>
      {up ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />} {Math.abs(diff)}%
    </span>
  )
}

function KpiPill({ icon, label, value, delta }: { icon: React.ReactNode; label: string; value: string; delta?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}>
      <div className="opacity-70">{icon}</div>
      <div>
        <div className="flex items-center gap-1.5">
          <p className="text-[14px] font-bold leading-tight" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
          {delta}
        </div>
        <p className="text-[10px]" style={{ color: 'var(--sm-text-2)' }}>{label}</p>
      </div>
    </div>
  )
}

function StatRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] w-20 flex-shrink-0 truncate" style={{ color: 'var(--sm-text-2)' }}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--sm-bg)' }}>
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-semibold w-6 text-right flex-shrink-0" style={{ color: 'var(--sm-text-1)' }}>{count}</span>
    </div>
  )
}

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
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="flex flex-col items-center text-center gap-4 max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-violet-400" />
          </div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Relatórios disponíveis no Pro e Agency</p>
          <a href="/assinatura" className="px-4 py-2 rounded-xl bg-violet-600 text-white text-[12px] font-semibold hover:bg-violet-700 transition-colors">
            Ver planos
          </a>
        </div>
      </div>
    )
  }

  const showPaid = selected ? (hasPaid(selected) || editMode) : false
  const atts = selected?.attachments ?? []

  return (
    <div className="min-h-full p-6" style={{ background: 'var(--sm-bg)' }}>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/reports')}
              className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
              style={{ color: 'var(--sm-text-2)' }}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-[18px] font-bold truncate" style={{ color: 'var(--sm-text-1)' }}>{client?.company_name ?? 'Cliente'}</h1>
              <p className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>Relatório combinado — Instagram, planejamento e IA</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3 h-3" /> Novo relatório
          </Button>
        </div>

        {reportsLoading ? (
          <div className="py-16 text-center text-[12px]" style={{ color: 'var(--sm-text-2)' }}>Carregando...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed" style={{ borderColor: 'var(--sm-border)' }}>
            <BarChart3 className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--sm-text-2)' }} />
            <p className="text-[13px] font-medium" style={{ color: 'var(--sm-text-1)' }}>Nenhum relatório ainda</p>
            <p className="text-[11px] mt-1 mb-4" style={{ color: 'var(--sm-text-2)' }}>Crie o primeiro relatório mensal para este cliente.</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3 h-3" /> Criar primeiro relatório
            </Button>
          </div>
        ) : (
          <>
            {/* ── Lista de meses ── */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {reports.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className="flex-shrink-0 text-left px-3.5 py-2 rounded-xl text-[12px] font-medium transition-all"
                  style={r.id === selectedId
                    ? { background: '#1e293b', color: '#fff', border: '1px solid #1e293b' }
                    : { background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)', border: '1px solid var(--sm-border)' }}
                >
                  {monthLabel(r.month, r.year)}
                </button>
              ))}
            </div>

            {selected && form && (
              <div className="space-y-5">

                {/* ── Ações ── */}
                <div className="flex items-center justify-end gap-2">
                  {editMode ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => { setEditMode(false); setForm(toForm(selected)) }}>
                        <X className="w-3 h-3" /> Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={updateReport.isPending}>
                        <Save className="w-3 h-3" /> Salvar
                      </Button>
                    </>
                  ) : (
                    <>
                      {confirmDel ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px]" style={{ color: 'var(--sm-text-2)' }}>Excluir relatório de {monthLabel(selected.month, selected.year)}?</span>
                          <Button variant="outline" size="sm" onClick={() => setConfirmDel(false)}>Não</Button>
                          <Button size="sm" onClick={handleDelete} disabled={deleteReport.isPending}
                            className="bg-red-50 text-red-800 border-red-200 hover:bg-red-100">
                            Sim, excluir
                          </Button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDel(true)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:text-red-500"
                          style={{ color: 'var(--sm-text-2)' }}
                          title="Excluir relatório deste mês">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <Button variant="outline" size="sm" onClick={handleAutoGenerate} disabled={syncing}
                        title="Preencher com os dados reais da conta de Instagram conectada">
                        {syncing
                          ? <><RefreshCw className="w-3 h-3 animate-spin" /> Sincronizando...</>
                          : <><Instagram className="w-3 h-3" /> Gerar do Instagram</>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                        <Pencil className="w-3 h-3" /> Editar
                      </Button>
                    </>
                  )}
                </div>

                {/* ── Resumo do mês ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  <KpiPill icon={<Users className="w-4 h-4 text-green-600" />} label="Seguidores" value={followerDiff(selected)}
                    delta={<PctBadge current={selected.followers_end} prev={prevReport?.followers_end} />} />
                  <KpiPill icon={<Eye className="w-4 h-4 text-blue-600" />} label="Alcance" value={fmt(selected.reach)}
                    delta={<PctBadge current={selected.reach} prev={prevReport?.reach} />} />
                  <KpiPill icon={<Heart className="w-4 h-4 text-pink-600" />} label="Engajamento" value={selected.engagement != null ? `${selected.engagement}%` : '—'}
                    delta={<PctBadge current={selected.engagement} prev={prevReport?.engagement} />} />
                  <KpiPill icon={<Instagram className="w-4 h-4 text-violet-600" />} label="Posts publicados" value={fmt(selected.posts_published)}
                    delta={<PctBadge current={selected.posts_published} prev={prevReport?.posts_published} />} />
                  <KpiPill icon={<Calendar className="w-4 h-4 text-amber-600" />} label="Planejados" value={String(planning.data?.total ?? 0)} />
                  <KpiPill icon={<CheckCircle2 className="w-4 h-4 text-teal-600" />} label="Publicados (calendário)" value={String(planning.data?.published.length ?? 0)} />
                </div>
                {!prevReport && (
                  <p className="text-[10px] -mt-3" style={{ color: 'var(--sm-text-2)' }}>
                    Sem relatório de {prevMonthLabel} pra comparar a variação.
                  </p>
                )}

                {/* ── Instagram ── */}
                <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
                  <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--sm-border)' }}>
                    <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-2)' }} />
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Redes sociais</p>
                  </div>
                  <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label}>
                          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--sm-text-2)' }}>{label}</p>
                          <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <IgInsights report={selected} isDark={isDark} />

                {/* ── Planejamento ── */}
                <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
                  <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--sm-border)' }}>
                    <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-2)' }} />
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Planejamento</p>
                  </div>
                  <div className="p-5 space-y-5">
                    {planning.isLoading ? (
                      <p className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>Carregando...</p>
                    ) : !planning.data || planning.data.total === 0 ? (
                      <p className="text-[12px] italic" style={{ color: 'var(--sm-text-2)' }}>
                        Nenhum item planejado para este cliente neste mês.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--sm-text-2)' }}>Por status</p>
                            {Object.entries(planning.data.byStatus).map(([status, count]) => (
                              <StatRow key={status} label={statusLabels[status] ?? status} count={count} total={planning.data!.total} />
                            ))}
                          </div>
                          <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--sm-text-2)' }}>Por tipo de conteúdo</p>
                            {Object.entries(planning.data.byContentType).map(([type, count]) => (
                              <StatRow key={type} label={contentTypeLabels[type] ?? type} count={count} total={planning.data!.total} />
                            ))}
                          </div>
                        </div>

                        {planning.data.published.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--sm-text-2)' }}>Publicados no mês</p>
                            <div className="space-y-1">
                              {planning.data.published.map(item => (
                                <button
                                  key={item.id}
                                  onClick={() => navigate('/planner')}
                                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left hover:opacity-80 transition-opacity"
                                  style={{ background: 'var(--sm-bg-alt)' }}
                                >
                                  <span className="text-[12px] truncate" style={{ color: 'var(--sm-text-1)' }}>{item.title}</span>
                                  <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--sm-text-2)' }}>{contentTypeLabels[item.content_type] ?? item.content_type}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>

                {/* ── Tráfego pago ── */}
                {showPaid && (
                  <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
                    <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--sm-border)' }}>
                      <DollarSign className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-2)' }} />
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Tráfego pago</p>
                    </div>
                    <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                        ] as [string, string][]).map(([label, value]) => (
                          <div key={label}>
                            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--sm-text-2)' }}>{label}</p>
                            <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                )}

                {/* ── Análise por IA ── */}
                <section className="rounded-2xl overflow-hidden" style={{
                  background: isDark ? 'rgba(99,102,241,0.08)' : '#eef2ff',
                  border: isDark ? '1px solid rgba(99,102,241,0.25)' : '1px solid #c7d2fe',
                }}>
                  <div className="px-5 py-4 flex items-center justify-between gap-2"
                    style={{ borderBottom: isDark ? '1px solid rgba(99,102,241,0.2)' : '1px solid #ddd6fe' }}>
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Análise do mês</p>
                    </div>
                    {!editMode && (
                      <Button size="sm" onClick={handleAiAnalysis} disabled={aiLoading}
                        className="bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                        title="Gera uma narrativa combinando Instagram e execução do planejamento">
                        {aiLoading
                          ? <><RefreshCw className="w-3 h-3 animate-spin" /> Gerando...</>
                          : <><Sparkles className="w-3 h-3" /> {selected.analysis_text ? 'Refazer com IA' : 'Gerar com IA'}</>}
                      </Button>
                    )}
                  </div>
                  <div className="p-5">
                    {editMode ? (
                      <Textarea
                        value={form.analysis_text}
                        onChange={f('analysis_text')}
                        placeholder="O que funcionou, o que não funcionou, próximos passos..."
                        rows={6}
                      />
                    ) : selected.analysis_text ? (
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--sm-text-1)' }}>{selected.analysis_text}</p>
                    ) : (
                      <p className="text-[12px] italic" style={{ color: isDark ? '#a5b4fc' : '#6366f1b3' }}>
                        Nenhuma análise ainda. Clique em <strong>Gerar com IA</strong> pra um resumo automático combinando Instagram e planejamento.
                      </p>
                    )}
                  </div>
                </section>

                {/* ── Anexos ── */}
                <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
                  <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--sm-border)' }}>
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-2)' }} />
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Anexos</p>
                      {atts.length > 0 && <span className="text-[11px]" style={{ color: 'var(--sm-text-2)' }}>{atts.length}</span>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setAttOpen(true)}>
                      <Plus className="w-3 h-3" /> Adicionar
                    </Button>
                  </div>
                  <div className="p-5">
                    {atts.length === 0 ? (
                      <p className="text-[12px] text-center py-4" style={{ color: 'var(--sm-text-2)' }}>
                        Nenhum anexo ainda. Adicione prints, PDFs ou links de relatórios.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {atts.map(att => (
                          <AttachmentItem key={att.id} att={att} onDelete={() => handleDeleteAtt(att)} />
                        ))}
                      </div>
                    )}
                  </div>
                </section>

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
