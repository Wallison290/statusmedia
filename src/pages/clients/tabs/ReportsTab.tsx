import { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, Upload, X, File, FileText, Link2,
  ExternalLink, TrendingUp, Users, Eye, Heart, DollarSign,
  Target, Zap, BookOpen, ChevronDown, Save, Pencil,
  BarChart3, ImageIcon, RefreshCw, Instagram, Sparkles,
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

// ─── Metric card ─────────────────────────────────────────────────────────────

const CARD_ACCENT: Record<string, { light: string; dark: string }> = {
  green:  { light: 'border-green-300 bg-green-100',    dark: 'border-green-700/50 bg-green-950/60'   },
  blue:   { light: 'border-blue-300 bg-blue-100',      dark: 'border-blue-700/50 bg-blue-950/60'     },
  pink:   { light: 'border-pink-300 bg-pink-100',      dark: 'border-pink-700/50 bg-pink-950/60'     },
  purple: { light: 'border-purple-300 bg-purple-100',  dark: 'border-purple-700/50 bg-purple-950/60' },
  amber:  { light: 'border-amber-300 bg-amber-100',    dark: 'border-amber-700/50 bg-amber-950/60'   },
  teal:   { light: 'border-teal-300 bg-teal-100',      dark: 'border-teal-700/50 bg-teal-950/60'     },
  sky:    { light: 'border-sky-300 bg-sky-100',        dark: 'border-sky-700/50 bg-sky-950/60'       },
  violet: { light: 'border-violet-300 bg-violet-100',  dark: 'border-violet-700/50 bg-violet-950/60' },
}

function MetricCard({
  icon, label, value, sub, color,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  const { isDark } = useTheme()
  const acc = CARD_ACCENT[color] ?? CARD_ACCENT.blue
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-2.5 ${isDark ? acc.dark : acc.light}`}>
      <div>{icon}</div>
      <div>
        <p className="text-[11px] font-medium" style={{ color: 'var(--sm-text-2)' }}>{label}</p>
        <p className="text-[20px] font-bold leading-tight mt-0.5" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
        {sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>{sub}</p>}
      </div>
    </div>
  )
}

// ─── Instagram insights (dados ricos vindos da API) ───────────────────────────

const GENDER_LABEL: Record<string, string> = { M: 'Masculino', F: 'Feminino', U: 'Outro' }

function Bar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const { isDark } = useTheme()
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] w-24 flex-shrink-0 truncate" style={{ color: 'var(--sm-text-3)' }}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : '#f0f0f0' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: isDark ? '#6b9ed8' : '#29457a' }} />
      </div>
      <span className="text-[11px] font-semibold w-14 text-right flex-shrink-0" style={{ color: 'var(--sm-text-1)' }}>{fmt(value)}{suffix ?? ''}</span>
    </div>
  )
}

function IgInsights({ report }: { report: ClientReport }) {
  const { isDark } = useTheme()
  const ig = report.ig_data
  if (!ig) return null

  const inter = ig.interactions
  const demo  = ig.demographics
  const genderEntries = demo?.gender ? Object.entries(demo.gender).sort((a, b) => b[1] - a[1]) : []
  const genderTotal   = genderEntries.reduce((s, [, v]) => s + v, 0)
  const ageEntries    = demo?.age ? Object.entries(demo.age).sort((a, b) => a[0].localeCompare(b[0])) : []
  const ageMax        = ageEntries.reduce((m, [, v]) => Math.max(m, v), 0)
  const cities        = demo?.cities ?? []
  const cityMax       = cities.reduce((m, c) => Math.max(m, c.value), 0)
  const hasInter      = !!inter && [inter.likes, inter.comments, inter.saves, inter.shares].some(v => v != null)
  const interTotal    = inter ? [inter.likes, inter.comments, inter.saves, inter.shares].reduce<number>((s, v) => s + (v ?? 0), 0) : null
  const hasDemo       = genderEntries.length > 0 || ageEntries.length > 0 || cities.length > 0
  const hasExtraKpis  = ig.profile_views != null || ig.accounts_engaged != null || report.impressions != null || interTotal != null

  return (
    <>
      {/* Visão extra — 4 KPIs preenchem a linha por completo */}
      {hasExtraKpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={<Eye className="w-4 h-4 text-amber-600" />} label="Visitas ao perfil"
            value={fmt(ig.profile_views)} color="amber" />
          <MetricCard icon={<Users className="w-4 h-4 text-teal-600" />} label="Contas engajadas"
            value={fmt(ig.accounts_engaged)} color="teal" />
          <MetricCard icon={<TrendingUp className="w-4 h-4 text-sky-600" />} label="Impressões"
            value={fmt(report.impressions)} color="sky" />
          <MetricCard icon={<Zap className="w-4 h-4 text-violet-600" />} label="Interações totais"
            value={fmt(interTotal)} color="violet" />
        </div>
      )}

      {/* Interações */}
      {hasInter && (
        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--sm-border)' }}>
            <Heart className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-3)' }} />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Interações do mês</p>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              ['Curtidas', inter!.likes],
              ['Comentários', inter!.comments],
              ['Salvamentos', inter!.saves],
              ['Compartilhamentos', inter!.shares],
            ] as [string, number | null][]).map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--sm-text-3)' }}>{label}</p>
                <p className="text-[16px] font-bold" style={{ color: 'var(--sm-text-1)' }}>{fmt(value)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top publicações */}
      {ig.top_posts && ig.top_posts.length > 0 && (
        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--sm-border)' }}>
            <Instagram className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-3)' }} />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Top publicações do mês</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ig.top_posts.map(post => (
              <a key={post.id} href={post.permalink ?? undefined} target="_blank" rel="noopener noreferrer"
                className="group rounded-xl overflow-hidden transition-colors"
                style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}>
                <div className="aspect-square overflow-hidden" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#eee' }}>
                  {post.thumbnail
                    ? <img src={post.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--sm-text-3)' }}><ImageIcon className="w-6 h-6" /></div>}
                </div>
                <div className="p-2.5">
                  {post.media_type && <p className="text-[9px] uppercase tracking-wide mb-1" style={{ color: 'var(--sm-text-3)' }}>{post.media_type}</p>}
                  <div className="flex items-center gap-3 text-[11px] font-medium" style={{ color: 'var(--sm-text-1)' }}>
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-pink-500" /> {fmt(post.likes)}</span>
                    <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3 text-blue-500" /> {fmt(post.reach)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Audiência */}
      {hasDemo && (
        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--sm-border)' }}>
            <Users className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-3)' }} />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Audiência</p>
          </div>
          <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {genderEntries.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--sm-text-3)' }}>Gênero</p>
                {genderEntries.map(([g, v]) => (
                  <Bar key={g} label={GENDER_LABEL[g] ?? g} value={v} max={genderTotal} />
                ))}
              </div>
            )}
            {ageEntries.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--sm-text-3)' }}>Faixa etária</p>
                {ageEntries.map(([a, v]) => (
                  <Bar key={a} label={a} value={v} max={ageMax} />
                ))}
              </div>
            )}
            {cities.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--sm-text-3)' }}>Principais cidades</p>
                {cities.map(c => (
                  <Bar key={c.name} label={c.name} value={c.value} max={cityMax} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  )
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
            : att.type === 'pdf' ? <FileText className="w-4 h-4 text-red-500" />
            : att.type === 'link' ? <Link2 className="w-4 h-4 text-blue-500" />
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
                <div className="flex items-center gap-2 p-2.5 rounded-md border border-[#e8e8e8] bg-[#fafafa]">
                  <File className="w-3.5 h-3.5 text-[#64748b] flex-shrink-0" />
                  <span className="text-[12px] text-[#0f0f0f] truncate flex-1">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} className="text-[#94a3b8] hover:text-red-700 flex-shrink-0"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 w-full h-9 px-3 rounded-md border border-dashed border-[#d0d0d0] bg-white text-[#64748b] text-[12px] hover:border-[#a0a0a0] hover:bg-[#fafafa] transition-colors">
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

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[16px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{monthLabel(report.month, report.year)}</h3>
          {report.ig_synced_at ? (
            <p className="text-[11px] text-[#16a34a] mt-0.5 flex items-center gap-1">
              <Instagram className="w-3 h-3" /> Sincronizado com o Instagram em {new Date(report.ig_synced_at).toLocaleDateString('pt-BR')}
            </p>
          ) : (
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>Relatório de performance</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setEditMode(false); setForm(toForm(report)) }}>
                <X className="w-3 h-3" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateReport.isPending}>
                <Save className="w-3 h-3" /> Salvar
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleAutoGenerate} disabled={syncing}
                title="Generate from Instagram — fills reach, followers, engagement, top posts and audience demographics for this month using Instagram Insights (Preencher os dados do mes com a conta de Instagram conectada)">
                {syncing
                  ? <><RefreshCw className="w-3 h-3 animate-spin" /> Gerando...</>
                  : <><Instagram className="w-3 h-3" /> Gerar do Instagram</>}
              </Button>
              {confirmDel ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400">Excluir relatório?</span>
                  <Button variant="outline" size="sm" onClick={() => setConfirmDel(false)}>Não</Button>
                  <Button size="sm" onClick={handleDelete}
                    className="bg-red-50 text-red-800 border-red-200 hover:bg-red-100">
                    Sim
                  </Button>
                </div>
              ) : (
                <button onClick={() => setConfirmDel(true)}
                  className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <Button variant="outline" size="sm" onClick={() => { setForm(toForm(report)); setEditMode(true) }}>
                <Pencil className="w-3 h-3" /> Editar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          icon={<Users className="w-4 h-4 text-green-600" />}
          label="Crescimento de seguidores"
          value={followerDiff(report)}
          sub={report.followers_end != null ? `${fmt(report.followers_end)} total` : undefined}
          color="green"
        />
        <MetricCard
          icon={<Eye className="w-4 h-4 text-blue-600" />}
          label="Alcance"
          value={fmt(report.reach)}
          color="blue"
        />
        <MetricCard
          icon={<Heart className="w-4 h-4 text-pink-600" />}
          label="Engajamento"
          value={report.engagement != null ? `${report.engagement}%` : '—'}
          color="pink"
        />
        <MetricCard
          icon={<BarChart3 className="w-4 h-4 text-purple-600" />}
          label="Publicados"
          value={report.posts_published != null ? String(report.posts_published) : '—'}
          sub="conteúdos no mês"
          color="purple"
        />
      </div>

      {/* ── Redes Sociais ── */}
      <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--sm-border)' }}>
          <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-3)' }} />
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
            <>
              {([
                ['Seguidores (início)', fmt(report.followers_start)],
                ['Seguidores (fim)', fmt(report.followers_end)],
                ['Alcance', fmt(report.reach)],
                ['Engajamento', report.engagement != null ? `${report.engagement}%` : '—'],
                ['Impressões', fmt(report.impressions)],
                ['Posts publicados', fmt(report.posts_published)],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--sm-text-3)' }}>{label}</p>
                  <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      {/* ── Insights ricos do Instagram ── */}
      <IgInsights report={report} />

      {/* ── Tráfego Pago ── */}
      {showPaid && (
        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--sm-border)' }}>
            <DollarSign className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-3)' }} />
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
              <>
                {([
                  ['Investimento', fmtBRL(report.paid_investment)],
                  ['Leads', fmt(report.paid_leads)],
                  ['CPL', fmtBRL(report.paid_cpl)],
                  ['Conversões', fmt(report.paid_conversions)],
                  ['ROAS', report.paid_roas != null ? `${report.paid_roas}x` : '—'],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--sm-text-3)' }}>{label}</p>
                    <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{value}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Análise do mês ── */}
      <section className="rounded-2xl overflow-hidden"
        style={{
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
              title="Gerar um resumo dos resultados com IA para apresentar ao cliente">
              {aiLoading
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Gerando...</>
                : <><Sparkles className="w-3 h-3" /> {report.analysis_text ? 'Refazer com IA' : 'Gerar com IA'}</>}
            </Button>
          )}
        </div>
        <div className="p-5">
          {editMode ? (
            <Textarea
              value={form.analysis_text}
              onChange={e => setForm(p => ({ ...p, analysis_text: e.target.value }))}
              placeholder="O que funcionou, o que não funcionou, próximos passos..."
              rows={6}
            />
          ) : report.analysis_text ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--sm-text-1)' }}>{report.analysis_text}</p>
          ) : (
            <p className="text-[12px] italic" style={{ color: 'var(--sm-text-2)' }}>
              Nenhuma análise ainda. Clique em <strong>Gerar com IA</strong> para um resumo automático, ou em Editar para escrever.
            </p>
          )}
        </div>
      </section>

      {/* ── Anexos ── */}
      <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--sm-border)' }}>
          <div className="flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-3)' }} />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Anexos</p>
            {atts.length > 0 && (
              <span className="text-[11px]" style={{ color: 'var(--sm-text-3)' }}>{atts.length}</span>
            )}
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
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center">
          <BarChart3 className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-[#0f172a]">Relatórios disponíveis no Pro e Agency</p>
          <p className="text-[12px] text-[#64748b] mt-1">Faça upgrade para criar e compartilhar relatórios com seus clientes.</p>
        </div>
        <a href="/assinatura" className="px-4 py-2 rounded-xl bg-violet-600 text-white text-[12px] font-semibold hover:bg-violet-700 transition-colors">
          Ver planos
        </a>
      </div>
    )
  }

  if (isLoading) {
    return <div className="py-12 text-center text-[12px] text-gray-600">Carregando...</div>
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Resultados</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
            {reports.length} {reports.length === 1 ? 'relatório' : 'relatórios'} cadastrados
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-3 h-3" /> Novo relatório
        </Button>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[#d0d0d0] rounded-2xl">
          <BarChart3 className="w-8 h-8 text-[#c0c0c0] mx-auto mb-3" />
          <p className="text-[13px] font-medium text-[#0f0f0f]">Nenhum relatório ainda</p>
          <p className="text-[11px] text-[#64748b] mt-1 mb-4">
            Crie o primeiro relatório mensal para este cliente.
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3 h-3" /> Criar primeiro relatório
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5 items-start">

          {/* ── Sidebar: month list ── */}
          <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible pb-1 lg:pb-0">
            {reports.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="flex-shrink-0 lg:w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
                style={r.id === selectedId
                  ? {
                      background: isDark ? 'rgba(255,255,255,0.12)' : '#1e293b',
                      color: '#ffffff',
                      border: isDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid #1e293b',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }
                  : {
                      background: 'var(--sm-bg-card)',
                      color: 'var(--sm-text-2)',
                      border: '1px solid var(--sm-border)',
                    }
                }
              >
                {monthLabel(r.month, r.year)}
              </button>
            ))}
          </div>

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
    </div>
  )
}
