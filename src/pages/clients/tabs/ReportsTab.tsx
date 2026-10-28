import { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, Upload, X, File, FileText, Link2,
  ExternalLink, Save, Pencil, BarChart3, RefreshCw, Instagram, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import { useSubscription } from '@/hooks/useSubscription'
import {
  useClientReports, useCreateReport, useUpdateReport,
  useDeleteReport, useAddReportAttachment, useDeleteReportAttachment,
} from '@/hooks/useReports'
import { supabase } from '@/integrations/supabase/client'
import { callProxy } from '@/lib/aiProxy'
import { checkStorageLimit } from '@/utils/storageGate'
import { TabHeader, PrimaryButton, GhostButton, EmptyState, Eyebrow, cardStyle } from './tabUi'
import { IgInsights, interactionsTotal, igSectionKeys } from '@/components/reports/IgInsights'
import type { ClientReport, ReportAttachment, ReportAttachmentType } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

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

// ─── Form types ───────────────────────────────────────────────────────────────

type ReportForm = {
  followers_start: string; followers_end: string; reach: string
  engagement: string; impressions: string; posts_published: string
  paid_investment: string; paid_leads: string; paid_cpl: string
  paid_conversions: string; paid_roas: string; analysis_text: string
}

const BLANK_FORM: ReportForm = {
  followers_start: '', followers_end: '', reach: '',
  engagement: '', impressions: '', posts_published: '',
  paid_investment: '', paid_leads: '', paid_cpl: '',
  paid_conversions: '', paid_roas: '', analysis_text: '',
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

function hasPaid(r: ClientReport) {
  return r.paid_investment != null || r.paid_leads != null || r.paid_cpl != null
    || r.paid_conversions != null || r.paid_roas != null
}

// ─── Attachment item ──────────────────────────────────────────────────────────

function AttachmentItem({
  att, onDelete,
}: { att: ReportAttachment; onDelete?: () => void }) {
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
            : att.type === 'pdf' ? <FileText className="w-4 h-4" style={{ color: 'var(--sm-text-3)' }} />
            : att.type === 'link' ? <Link2 className="w-4 h-4" style={{ color: 'var(--sm-text-3)' }} />
            : <File className="w-4 h-4" style={{ color: 'var(--sm-text-3)' }} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate" style={{ color: 'var(--sm-text-1)' }}>{att.title}</p>
          {att.description && <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--sm-text-2)' }}>{att.description}</p>}
          <p className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: 'var(--sm-text-3)' }}>
            {att.type === 'imagem' ? 'Imagem' : att.type === 'pdf' ? 'PDF' : 'Link'}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {att.type === 'link' && att.link_url && (
            <a href={att.link_url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--sm-text-3)' }}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {att.file_url && att.type !== 'link' && (
            <a href={att.file_url} download target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--sm-text-3)' }}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {onDelete && (
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              className="w-7 h-7 flex items-center justify-center rounded hover:text-red-400 transition-colors"
              style={{ color: 'var(--sm-text-3)' }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Image lightbox */}
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

// ─── Add Attachment Modal ─────────────────────────────────────────────────────

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
            <label className="block text-[12px] text-zinc-500 mb-1.5">Tipo</label>
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
              <label className="block text-[12px] text-[#64748b] mb-1.5">Arquivo</label>
              {file ? (
                <div className="flex items-center gap-2 p-2.5 rounded-md border border-[color:var(--sm-border)] bg-[color:var(--sm-bg-alt)]">
                  <File className="w-3.5 h-3.5 text-[#64748b] flex-shrink-0" />
                  <span className="text-[12px] text-[color:var(--sm-text-1)] truncate flex-1">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} className="text-[#94a3b8] hover:text-red-700 flex-shrink-0"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 w-full h-9 px-3 rounded-md border border-dashed border-[color:var(--sm-border)] bg-[color:var(--sm-bg-card)] text-[#64748b] text-[12px] hover:border-[#2563EB]/50 hover:bg-black/5 transition-colors">
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

// ─── Create Report Modal ──────────────────────────────────────────────────────

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
            <label className="block text-[12px] text-zinc-500 mb-1.5">Mês</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-[12px] text-zinc-500 mb-1.5">Ano</label>
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

// ─── Peças editoriais do relatório ────────────────────────────────────────────

/** Seção numerada (01, 02…): número em azul, título em Bricolage, fio de 1px. */
function Secao({ n, title, aside, accent, children }: {
  n: string; title: string; aside?: React.ReactNode; accent?: boolean; children: React.ReactNode
}) {
  return (
    <section className="relative rounded-2xl border overflow-hidden" style={cardStyle}>
      {accent && <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r" style={{ background: '#2563EB' }} />}
      <div className="px-5 py-3.5 flex items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--sm-border)' }}>
        <h3 className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: '#2563EB' }}>{n}</span>
          <span className="font-display text-[15px] font-bold truncate" style={{ color: 'var(--sm-text-1)' }}>{title}</span>
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function KpiCell({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="px-5 py-4 min-w-0" style={{ background: 'var(--sm-bg-card)' }}>
      <Eyebrow>{label}</Eyebrow>
      <p className="font-display text-[26px] font-bold leading-none tabular-nums mt-2" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
      {sub && <p className="text-[11.5px] mt-1.5 tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{sub}</p>}
    </div>
  )
}

function Fato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p className="text-[15px] font-semibold tabular-nums mt-1" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
    </div>
  )
}

// ─── Report View / Edit ───────────────────────────────────────────────────────

function ReportDetail({
  report, clientId, onDeleted,
}: { report: ClientReport; clientId: string; onDeleted: () => void }) {
  const { isDark } = useTheme()
  const { toast } = useToast()
  const qc = useQueryClient()
  const updateReport = useUpdateReport()
  const deleteReport = useDeleteReport()
  const deleteAtt = useDeleteReportAttachment()

  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<ReportForm>(toForm(report))
  const [confirmDel, setConfirmDel] = useState(false)
  const [attOpen, setAttOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  // Sync form when switching reports
  useEffect(() => { setForm(toForm(report)); setEditMode(false) }, [report.id])

  // Gera um resumo do mês com IA (OpenAI via ai-proxy) a partir dos números do relatório.
  const handleAiAnalysis = async () => {
    setAiLoading(true)
    try {
      const ig = report.ig_data
      const payload = {
        mes: monthLabel(report.month, report.year),
        seguidores_inicio: report.followers_start,
        seguidores_fim: report.followers_end,
        alcance: report.reach,
        impressoes: report.impressions,
        engajamento_pct: report.engagement,
        posts_publicados: report.posts_published,
        visitas_perfil: ig?.profile_views ?? null,
        contas_engajadas: ig?.accounts_engaged ?? null,
        interacoes: ig?.interactions ?? null,
        top_posts: ig?.top_posts?.map(p => ({ tipo: p.media_type, curtidas: p.likes, comentarios: p.comments, alcance: p.reach })) ?? null,
        demografia: ig?.demographics ?? null,
      }
      const { content } = await callProxy<{ content?: string }>('report-analysis', payload)
      if (!content) throw new Error('A IA não retornou texto.')
      await updateReport.mutateAsync({ id: report.id, analysis_text: content })
      toast('Análise gerada pela IA!', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao gerar análise.', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  // Puxa as métricas do mês direto da conta de Instagram conectada ao cliente.
  const handleAutoGenerate = async () => {
    setSyncing(true)
    try {
      const { data, error } = await supabase.functions.invoke('instagram-report', {
        body: { client_id: clientId, month: report.month, year: report.year },
      })
      if (error) throw error
      if (data && data.ok === false) {
        toast(data.message ?? 'Não foi possível gerar o relatório.', 'error')
        return
      }
      await qc.invalidateQueries({ queryKey: ['client-reports'] })
      const w = data?.warnings?.length ? ` — ${data.warnings.length} métrica(s) sem dado` : ''
      toast(`Relatório atualizado com dados do Instagram${w}.`, 'success')
    } catch (err: any) {
      toast(err.message ?? 'Erro ao gerar relatório.', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const f = (key: keyof ReportForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }))

  const handleSave = async () => {
    try {
      await updateReport.mutateAsync({ id: report.id, ...fromForm(form) })
      toast('Relatório salvo!', 'success')
      setEditMode(false)
    } catch (err: any) { toast(err.message, 'error') }
  }

  const handleDelete = async () => {
    try {
      await deleteReport.mutateAsync(report.id)
      toast('Relatório removido.', 'success')
      onDeleted()
    } catch (err: any) { toast(err.message, 'error') }
  }

  const handleDeleteAtt = async (att: ReportAttachment) => {
    try {
      await deleteAtt.mutateAsync({ id: att.id, fileUrl: att.file_url })
      toast('Anexo removido.', 'success')
    } catch (err: any) { toast(err.message, 'error') }
  }

  const showPaid = hasPaid(report) || editMode
  const atts = report.attachments ?? []
  const ig = report.ig_data
  const empty = !report.ig_synced_at && [report.followers_end, report.reach, report.engagement, report.posts_published].every(v => v == null)
  const growth = report.followers_start != null && report.followers_end != null
  let secao = 0
  const proxima = () => String(++secao).padStart(2, '0')
  // Números na ordem em que as seções aparecem na tela.
  const nVisao    = proxima()
  const nManual   = editMode ? proxima() : ''
  const igNumbers = Object.fromEntries(igSectionKeys(report).map(k => [k, proxima()]))
  const nPago     = showPaid ? proxima() : ''
  const nAnalise  = proxima()
  const nAnexos   = proxima()

  return (
    <div className="space-y-5 min-w-0">

      {/* ── Título do mês + ações ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b" style={{ borderColor: 'var(--sm-border)' }}>
        <div className="min-w-0">
          <Eyebrow>Relatório de performance</Eyebrow>
          <h3 className="font-display text-[28px] font-bold leading-[1.05] tracking-[-0.02em] mt-1.5" style={{ color: 'var(--sm-text-1)' }}>
            {monthLabel(report.month, report.year)}
          </h3>
          <p className="text-[12px] mt-1.5 flex items-center gap-1.5" style={{ color: 'var(--sm-text-3)' }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: report.ig_synced_at ? '#22C55E' : '#94A3B8' }} />
            {report.ig_synced_at
              ? <>Sincronizado com o Instagram em {new Date(report.ig_synced_at).toLocaleDateString('pt-BR')}</>
              : <>Ainda não sincronizado com o Instagram</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {editMode ? (
            <>
              <GhostButton onClick={() => { setEditMode(false); setForm(toForm(report)) }}>
                <X className="w-3.5 h-3.5" /> Cancelar
              </GhostButton>
              <PrimaryButton onClick={handleSave} disabled={updateReport.isPending}>
                <Save className="w-3.5 h-3.5" /> Salvar
              </PrimaryButton>
            </>
          ) : confirmDel ? (
            <>
              <span className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>Excluir relatório?</span>
              <GhostButton onClick={() => setConfirmDel(false)}>Não</GhostButton>
              <button onClick={handleDelete} disabled={deleteReport.isPending}
                className="h-9 px-3.5 rounded-xl border text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2', borderColor: isDark ? 'rgba(239,68,68,0.35)' : '#FECACA', color: isDark ? '#F87171' : '#B91C1C' }}>
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
              <GhostButton onClick={() => { setForm(toForm(report)); setEditMode(true) }}>
                <Pencil className="w-3.5 h-3.5" /> Editar
              </GhostButton>
              <PrimaryButton onClick={handleAutoGenerate} disabled={syncing}
                title="Generate from Instagram — fills reach, followers, engagement, top posts and audience demographics for this month using Instagram Insights (Preencher os dados do mes com a conta de Instagram conectada)">
                {syncing
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Gerando...</>
                  : <><Instagram className="w-3.5 h-3.5" /> Gerar do Instagram</>}
              </PrimaryButton>
            </>
          )}
        </div>
      </div>

      {/* ── 01 Visão geral: faixa de números com divisórias de 1px ── */}
      <Secao n={nVisao} title="Visão geral">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: 'var(--sm-border)' }}>
          <KpiCell label={growth ? 'Novos seguidores' : 'Seguidores'} value={followerDiff(report)}
            sub={growth ? <>{fmt(report.followers_end)} no total</> : undefined} />
          <KpiCell label="Alcance" value={fmt(report.reach)} />
          <KpiCell label="Engajamento" value={report.engagement != null ? `${report.engagement}%` : '—'} />
          <KpiCell label="Posts publicados" value={fmt(report.posts_published)} />
          {ig && (
            <>
              <KpiCell label="Visitas ao perfil" value={fmt(ig.profile_views)} />
              <KpiCell label="Contas engajadas" value={fmt(ig.accounts_engaged)} />
              <KpiCell label="Impressões" value={fmt(report.impressions)} />
              <KpiCell label="Interações totais" value={fmt(interactionsTotal(report))} />
            </>
          )}
        </div>
        {empty && !editMode && (
          <div className="px-5 py-3.5 border-t flex items-center gap-2.5 text-[12.5px]" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
            <Instagram className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Clique em <strong style={{ color: 'var(--sm-text-1)' }}>Gerar do Instagram</strong> para preencher este mês com os dados da conta conectada.</span>
          </div>
        )}
      </Secao>

      {/* ── Edição manual dos números do mês ── */}
      {editMode && (
        <Secao n={nManual} title="Redes sociais">
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Input label="Seguidores (início)" type="number" value={form.followers_start} onChange={f('followers_start')} placeholder="0" />
            <Input label="Seguidores (fim)" type="number" value={form.followers_end} onChange={f('followers_end')} placeholder="0" />
            <Input label="Alcance" type="number" value={form.reach} onChange={f('reach')} placeholder="0" />
            <Input label="Engajamento (%)" type="number" value={form.engagement} onChange={f('engagement')} placeholder="0.00" />
            <Input label="Impressões" type="number" value={form.impressions} onChange={f('impressions')} placeholder="0" />
            <Input label="Posts publicados" type="number" value={form.posts_published} onChange={f('posts_published')} placeholder="0" />
          </div>
        </Secao>
      )}

      {/* ── Insights ricos do Instagram (interações, top posts, audiência) ── */}
      <IgInsights report={report} isDark={isDark} numbers={igNumbers} showKpis={false} />

      {/* ── Tráfego Pago ── */}
      {showPaid && (
        <Secao n={nPago} title="Tráfego pago">
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-5">
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
                ['Investimento', fmtBRL(report.paid_investment)],
                ['Leads', fmt(report.paid_leads)],
                ['CPL', fmtBRL(report.paid_cpl)],
                ['Conversões', fmt(report.paid_conversions)],
                ['ROAS', report.paid_roas != null ? `${report.paid_roas}x` : '—'],
              ] as [string, string][]).map(([label, value]) => <Fato key={label} label={label} value={value} />)
            )}
          </div>
        </Secao>
      )}

      {/* ── Análise do mês ── */}
      <Secao n={nAnalise} title="Análise do mês" accent
        aside={!editMode && (
          <PrimaryButton onClick={handleAiAnalysis} disabled={aiLoading}
            title="Gerar um resumo dos resultados com IA para apresentar ao cliente">
            {aiLoading
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Gerando...</>
              : <><Sparkles className="w-3.5 h-3.5" /> {report.analysis_text ? 'Refazer com IA' : 'Gerar com IA'}</>}
          </PrimaryButton>
        )}>
        <div className="p-5">
          {editMode ? (
            <Textarea
              value={form.analysis_text}
              onChange={e => setForm(p => ({ ...p, analysis_text: e.target.value }))}
              placeholder="O que funcionou, o que não funcionou, próximos passos..."
              rows={6}
            />
          ) : report.analysis_text ? (
            <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap max-w-[75ch]" style={{ color: 'var(--sm-text-1)' }}>{report.analysis_text}</p>
          ) : (
            <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>
              Nenhuma análise ainda. Clique em <strong style={{ color: 'var(--sm-text-1)' }}>Gerar com IA</strong> para um resumo automático, ou em Editar para escrever.
            </p>
          )}
        </div>
      </Secao>

      {/* ── Anexos ── */}
      <Secao n={nAnexos} title={atts.length > 0 ? `Anexos · ${atts.length}` : 'Anexos'}
        aside={<GhostButton onClick={() => setAttOpen(true)}><Plus className="w-3.5 h-3.5" /> Adicionar</GhostButton>}>
        <div className="p-5">
          {atts.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>
              Nenhum anexo ainda. Adicione prints, PDFs ou links de relatórios.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {atts.map(att => (
                <AttachmentItem key={att.id} att={att} onDelete={() => handleDeleteAtt(att)} />
              ))}
            </div>
          )}
        </div>
      </Secao>

      <AddAttachmentModal reportId={report.id} open={attOpen} onClose={() => setAttOpen(false)} />
    </div>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function ReportsTab({ clientId }: { clientId: string }) {
  const { isDark } = useTheme()
  const { data: reports = [], isLoading } = useClientReports(clientId)
  const { data: subData } = useSubscription()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // Auto-select latest report
  useEffect(() => {
    if (reports.length > 0 && !selectedId) setSelectedId(reports[0].id)
  }, [reports])

  const selected = reports.find(r => r.id === selectedId) ?? null

  // ── Gate: Relatórios só nos planos Pro e Agency ─────────────────────────────
  if (!subData?.plan.hasReports) {
    return (
      <EmptyState Icon={BarChart3} title="Relatórios disponíveis no Pro e Agency"
        hint="Faça upgrade para criar e compartilhar relatórios com seus clientes."
        action={<a href="/assinatura" className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold inline-flex items-center text-white" style={{ background: 'var(--sm-primary)' }}>Ver planos</a>} />
    )
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5" aria-busy="true">
        <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
        <div className="h-72 rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
      </div>
    )
  }

  return (
    <section>
      <TabHeader
        title="Resultados"
        subtitle={`${reports.length} ${reports.length === 1 ? 'relatório mensal' : 'relatórios mensais'}`}
        actions={<PrimaryButton onClick={() => setCreateOpen(true)}><Plus className="w-3.5 h-3.5" /> Novo relatório</PrimaryButton>}
      />

      {reports.length === 0 ? (
        <EmptyState Icon={BarChart3} title="Nenhum relatório ainda" hint="Crie o primeiro relatório mensal para este cliente."
          action={<PrimaryButton onClick={() => setCreateOpen(true)}><Plus className="w-3.5 h-3.5" /> Criar primeiro relatório</PrimaryButton>} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 items-start">

          {/* ── Meses: lista fina com barra azul no selecionado ── */}
          <nav aria-label="Meses" className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-1 lg:pb-0 lg:sticky lg:top-4">
            {reports.map(r => {
              const ativo = r.id === selectedId
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  aria-current={ativo ? 'true' : undefined}
                  className="relative flex-shrink-0 lg:w-full text-left px-3.5 h-9 rounded-lg text-[13px] capitalize whitespace-nowrap transition-colors hover:bg-black/5"
                  style={ativo
                    ? { background: 'rgba(37,99,235,0.08)', color: 'var(--sm-text-1)', fontWeight: 600 }
                    : { color: 'var(--sm-text-3)', fontWeight: 500 }}
                >
                  {ativo && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: '#2563EB' }} />}
                  {monthLabel(r.month, r.year)}
                </button>
              )
            })}
          </nav>

          {/* ── Content ── */}
          {selected && (
            <ReportDetail
              key={selected.id}
              report={selected}
              clientId={clientId}
              onDeleted={() => {
                setSelectedId(reports.find(r => r.id !== selected.id)?.id ?? null)
              }}
            />
          )}
        </div>
      )}

      <CreateReportModal
        clientId={clientId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={id => setSelectedId(id)}
      />
    </section>
  )
}
