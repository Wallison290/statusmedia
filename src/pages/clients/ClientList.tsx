import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Users, Instagram, Trash2, ChevronDown, Palette, Clock, CheckCircle, FileEdit, XCircle, Upload, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useClients, useDeleteClient, checkClientDeletion } from '@/hooks/useClients'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Gradientes disponíveis ───────────────────────────────────────────────────

const GRADIENTS = [
  // ── Vibrantes ──────────────────────────────────────────────────────────────
  { id: 'sunset',       value: 'linear-gradient(135deg, #f97316 0%, #fbbf24 100%)',   preview: ['#f97316', '#fbbf24'] },
  { id: 'ocean',        value: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',   preview: ['#3b82f6', '#06b6d4'] },
  { id: 'violet',       value: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',   preview: ['#8b5cf6', '#ec4899'] },
  { id: 'emerald',      value: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',   preview: ['#10b981', '#06b6d4'] },
  { id: 'rose',         value: 'linear-gradient(135deg, #f43f5e 0%, #fb923c 100%)',   preview: ['#f43f5e', '#fb923c'] },
  { id: 'indigo',       value: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',   preview: ['#4f46e5', '#7c3aed'] },
  { id: 'lime',         value: 'linear-gradient(135deg, #84cc16 0%, #3fa06e 100%)',   preview: ['#84cc16', '#3fa06e'] },
  { id: 'pink-purple',  value: 'linear-gradient(135deg, #f9a8d4 0%, #c084fc 100%)',   preview: ['#f9a8d4', '#c084fc'] },
  { id: 'amber-orange', value: 'linear-gradient(135deg, #fcd34d 0%, #fb923c 100%)',   preview: ['#fcd34d', '#fb923c'] },
  { id: 'teal-sky',     value: 'linear-gradient(135deg, #6ee7b7 0%, #38bdf8 100%)',   preview: ['#6ee7b7', '#38bdf8'] },
  { id: 'navy',         value: 'linear-gradient(135deg, #1e293b 0%, #3b82f6 100%)',   preview: ['#1e293b', '#3b82f6'] },
  { id: 'coral',        value: 'linear-gradient(135deg, #e94560 0%, #fcd34d 100%)',   preview: ['#e94560', '#fcd34d'] },
  // ── Metálicos ─────────────────────────────────────────────────────────────
  { id: 'gold',         value: 'linear-gradient(135deg, #92400e 0%, #fbbf24 50%, #b45309 100%)', preview: ['#a16207', '#fbbf24'] },
  { id: 'silver',       value: 'linear-gradient(135deg, #64748b 0%, #e2e8f0 50%, #94a3b8 100%)', preview: ['#94a3b8', '#e2e8f0'] },
  { id: 'bronze',       value: 'linear-gradient(135deg, #7c2d12 0%, #c2732a 50%, #92400e 100%)', preview: ['#92400e', '#c2732a'] },
  { id: 'chrome',       value: 'linear-gradient(135deg, #1e293b 0%, #94a3b8 50%, #334155 100%)', preview: ['#334155', '#94a3b8'] },
  { id: 'rose-gold',    value: 'linear-gradient(135deg, #9f1239 0%, #f9a8d4 50%, #be185d 100%)', preview: ['#be185d', '#f9a8d4'] },
  // ── Escuros / Pretos ──────────────────────────────────────────────────────
  { id: 'midnight',     value: 'linear-gradient(135deg, #0f0f0f 0%, #1e293b 100%)',   preview: ['#0f0f0f', '#1e293b'] },
  { id: 'obsidian',     value: 'linear-gradient(135deg, #0f0f0f 0%, #374151 100%)',   preview: ['#111827', '#374151'] },
  { id: 'dark-purple',  value: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%)',   preview: ['#1e1b4b', '#4c1d95'] },
  { id: 'dark-teal',    value: 'linear-gradient(135deg, #042f2e 0%, #0f766e 100%)',   preview: ['#042f2e', '#0f766e'] },
  { id: 'pure-black',   value: 'linear-gradient(135deg, #000000 0%, #111111 100%)',   preview: ['#000000', '#1a1a1a'] },
]

const DEFAULT_GRADIENT_ID = 'sunset'

/** Retorna o estilo CSS do banner (gradiente ou imagem de fundo) */
function getBannerStyle(id: string | null | undefined): React.CSSProperties {
  if (!id) return { background: GRADIENTS[0].value }
  if (id.startsWith('url:')) {
    return {
      backgroundImage:    `url(${id.slice(4)})`,
      backgroundSize:     'cover',
      backgroundPosition: 'center',
    }
  }
  const found = GRADIENTS.find(g => g.id === id)
  return { background: found ? found.value : GRADIENTS[0].value }
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; dot: string; badge: string; badgeLight: string }> = {
  ativo:      { label: 'Ativo',       dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25', badgeLight: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pausado:    { label: 'Pausado',     dot: 'bg-amber-400',   badge: 'bg-amber-500/10 text-amber-300 border-amber-500/25',       badgeLight: 'bg-amber-50 text-amber-700 border-amber-200'       },
  encerrado:  { label: 'Encerrado',   dot: 'bg-red-400',     badge: 'bg-red-500/10 text-red-300 border-red-500/25',             badgeLight: 'bg-red-50 text-red-700 border-red-200'             },
  lead:       { label: 'Lead',        dot: 'bg-blue-400',    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/25',          badgeLight: 'bg-blue-50 text-blue-700 border-blue-200'          },
  proposta:   { label: 'Proposta',    dot: 'bg-violet-400',  badge: 'bg-violet-500/10 text-violet-300 border-violet-500/25',    badgeLight: 'bg-violet-50 text-violet-700 border-violet-200'    },
  fechado:    { label: 'Fechado',     dot: 'bg-teal-400',    badge: 'bg-teal-500/10 text-teal-300 border-teal-500/25',          badgeLight: 'bg-teal-50 text-teal-700 border-teal-200'          },
  onboarding: { label: 'Onboarding', dot: 'bg-orange-400',  badge: 'bg-orange-500/10 text-orange-300 border-orange-500/25',   badgeLight: 'bg-orange-50 text-orange-700 border-orange-200'   },
}

const SORT_OPTIONS = [
  { value: 'nome_az', label: 'Nome (A-Z)'    },
  { value: 'nome_za', label: 'Nome (Z-A)'    },
  { value: 'recente', label: 'Mais recentes' },
  { value: 'antigo',  label: 'Mais antigos'  },
]

// ─── Tipos de stats ───────────────────────────────────────────────────────────

interface ClientStats {
  pendentes:         number
  aprovados:         number
  ajuste_solicitado: number
  reprovado:         number
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ClientList() {
  const { data: clients = [], isLoading } = useClients()
  const deleteClient = useDeleteClient()
  const { toast }    = useToast()
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const { user }     = useAuth()
  const { isDark }   = useTheme()

  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState<'all' | 'ativo' | 'pausado' | 'encerrado'>('all')
  const [sort, setSort]             = useState('nome_az')
  const [showSort, setShowSort]     = useState(false)
  const [stats, setStats]           = useState<Record<string, ClientStats>>({})
  const [pickerOpen, setPickerOpen] = useState<string | null>(null)
  const [pickerTab, setPickerTab]   = useState<'cores' | 'imagem'>('cores')
  const [saving, setSaving]         = useState<string | null>(null)
  const imageInputRef               = useRef<HTMLInputElement>(null)

  // ── Carrega stats do planner por cliente ──────────────────────────────────
  useEffect(() => {
    if (!clients.length) return
    async function fetchStats() {
      const { data } = await supabase
        .from('planner')
        .select('client_id, approval_status')
        .in('client_id', clients.map(c => c.id))

      if (!data) return
      const map: Record<string, ClientStats> = {}
      clients.forEach(c => {
        map[c.id] = { pendentes: 0, aprovados: 0, ajuste_solicitado: 0, reprovado: 0 }
      })
      data.forEach((row: any) => {
        if (!row.client_id || !map[row.client_id]) return
        const as = row.approval_status
        if (!as || as === 'pendente_aprovacao' || as === 'ajuste_realizado') {
          map[row.client_id].pendentes++
        } else if (as === 'aprovado') {
          map[row.client_id].aprovados++
        } else if (as === 'ajuste_solicitado') {
          map[row.client_id].ajuste_solicitado++
        } else if (as === 'reprovado') {
          map[row.client_id].reprovado++
        }
      })
      setStats(map)
    }
    fetchStats()
  }, [clients.map(c => c.id).join()])

  // ── Troca gradiente: tenta Supabase (update direto e RPC), cai em localStorage ──
  async function changeBanner(clientId: string, gradientId: string) {
    if (saving === clientId) return
    setPickerOpen(null)
    setSaving(clientId)

    // 1. Salva localmente de imediato → feedback visual instantâneo em qualquer cenário
    try { localStorage.setItem(`banner_${clientId}`, gradientId) } catch {}

    // 2. Tenta update direto (funciona após PostgREST reiniciado)
    let saved = false
    try {
      const { error } = await (supabase.from('clients') as any)
        .update({ card_gradient: gradientId, updated_at: new Date().toISOString() })
        .eq('id', clientId)
      if (!error) saved = true
    } catch {}

    // 3. Fallback: RPC (também funciona após PostgREST reiniciado)
    if (!saved) {
      try {
        const { error } = await (supabase.rpc as any)('update_client_gradient', {
          p_client_id:   clientId,
          p_gradient_id: gradientId,
        })
        if (!error) saved = true
      } catch {}
    }

    if (!saved) {
      // PostgREST ainda com schema cache antigo — localStorage garantiu o valor localmente
      console.warn('[changeBanner] banco indisponível, usando localStorage. Reinicie o PostgREST no painel do Supabase.')
    }

    // 4. Sempre atualiza a UI com o valor local
    await queryClient.invalidateQueries({ queryKey: ['clients'] })
    setSaving(null)
  }

  // ── Upload de imagem como banner ──────────────────────────────────────────
  async function changeBannerImage(clientId: string, file: File) {
    if (saving === clientId) return
    setPickerOpen(null)
    setSaving(clientId)
    try {
      const ext  = file.name.split('.').pop() || 'jpg'
      const path = `${user?.id}/banner_${clientId}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('client-logos')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage
        .from('client-logos')
        .getPublicUrl(path)
      const imageId = `url:${publicUrl}`
      try { localStorage.setItem(`banner_${clientId}`, imageId) } catch {}
      await (supabase.from('clients') as any)
        .update({ card_gradient: imageId, updated_at: new Date().toISOString() })
        .eq('id', clientId)
      await queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast('Imagem do banner atualizada!', 'success')
    } catch (err: any) {
      toast(err.message || 'Erro ao enviar imagem', 'error')
    } finally {
      setSaving(null)
    }
  }

  // ── Filtragem e ordenação ─────────────────────────────────────────────────
  const filtered = clients
    .filter(c => {
      const q = search.toLowerCase()
      const matchSearch =
        c.company_name.toLowerCase().includes(q) ||
        c.responsible_name.toLowerCase().includes(q) ||
        c.niche.toLowerCase().includes(q) ||
        (c.instagram || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      const matchFilter = filter === 'all' || c.status === filter
      return matchSearch && matchFilter
    })
    .sort((a, b) => {
      if (sort === 'nome_az') return a.company_name.localeCompare(b.company_name)
      if (sort === 'nome_za') return b.company_name.localeCompare(a.company_name)
      if (sort === 'recente') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sort === 'antigo')  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return 0
    })

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    // Avisa o que se perde junto: o acesso do cliente ao portal. Se a consulta
    // falhar, cai na confirmação simples em vez de travar a exclusão.
    const info = await checkClientDeletion(id).catch(() => ({ hasPortal: false, duplicates: 0 }))
    const lines = [`Excluir "${name}"? Esta ação não pode ser desfeita.`]
    if (info.hasPortal) {
      lines.push('', 'ATENÇÃO: este cadastro tem acesso ao portal ativo. O cliente perde o login e vai precisar de um convite novo.')
    }
    if (info.duplicates > 0) {
      lines.push('', `Existe ${info.duplicates === 1 ? 'outro cadastro' : `mais ${info.duplicates} cadastros`} com o mesmo e-mail. Confira qual deles tem o acesso ao portal antes de excluir.`)
    }
    if (!confirm(lines.join('\n'))) return
    try {
      await deleteClient.mutateAsync(id)
      toast('Cliente excluído.', 'success')
    } catch (err: any) {
      toast(err.message || 'Erro ao excluir cliente.', 'error')
    }
  }

  const sortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label || 'Nome (A-Z)'

  return (
    <div className="min-h-full flex flex-col">

      {/* ── Conteúdo ─────────────────────────────────────────────────────────── */}
      <div className="flex-1" style={{ background: 'var(--sm-bg-page)' }}>
        <div className="px-4 sm:px-6 pt-6 pb-12 space-y-5">

          {/* ── Toolbar ───────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">

              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--sm-text-3)' }} />
              <input
                type="text"
                placeholder="Buscar por nome, @handle, segmento ou email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all shadow-sm"
                style={{ background: 'var(--sm-bg-input)', border: '1px solid var(--sm-border)', color: 'var(--sm-text-1)' }}
              />
            </div>

            <div className="relative">
              <button
                onClick={() => setShowSort(o => !o)}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[13px] hover:border-[#2563EB] transition-colors shadow-sm"
                style={{ background: 'var(--sm-bg-input)', border: '1px solid var(--sm-border)', color: 'var(--sm-text-1)' }}
              >
                {sortLabel} <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-3)' }} />
              </button>
              {showSort && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl shadow-lg overflow-hidden py-1" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
                    {SORT_OPTIONS.map(o => (
                      <button
                        key={o.value}
                        onClick={() => { setSort(o.value); setShowSort(false) }}
                        className="w-full text-left px-4 py-2 text-[13px] transition-colors"
                        style={{ color: sort === o.value ? '#2563EB' : 'var(--sm-text-2)', fontWeight: sort === o.value ? 600 : 400 }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <Link
              to="/clients/new"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-medium bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" /> Novo cliente
            </Link>
          </div>

          {/* ── Filtros ───────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { value: 'all',       label: 'Todos'      },
              { value: 'ativo',     label: 'Ativos'     },
              { value: 'pausado',   label: 'Pausados'   },
              { value: 'encerrado', label: 'Encerrados' },
            ] as const).map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all border"
                style={filter === f.value
                  ? { background: '#2563EB', borderColor: '#2563EB', color: '#ffffff' }
                  : { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }
                }
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* ── Skeleton ─────────────────────────────────────────────────────── */}
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden shadow-sm animate-pulse" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
                  <div className="h-28" style={{ background: 'var(--sm-bg-alt)' }} />
                  <div className="p-5 pt-10 space-y-3">
                    <div className="h-4 rounded-lg w-3/4" style={{ background: 'var(--sm-bg-alt)' }} />
                    <div className="h-3 rounded-lg w-1/2" style={{ background: 'var(--sm-bg-alt)' }} />
                    <div className="h-3 rounded-full w-1/3" style={{ background: 'var(--sm-bg-alt)' }} />
                    <div className="pt-3 mt-4 grid grid-cols-2 gap-2" style={{ borderTop: '1px solid var(--sm-border)' }}>
                      {[...Array(4)].map((_, j) => (
                        <div key={j} className="h-12 rounded-xl" style={{ background: 'var(--sm-bg-alt)' }} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Empty state ───────────────────────────────────────────────────── */}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}>
                <Users className="w-8 h-8" style={{ color: 'var(--sm-text-3)' }} />
              </div>
              <div className="text-center">
                <p className="text-[15px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
                  {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
                </p>
                <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
                  {search ? 'Tente outra busca' : 'Cadastre seu primeiro cliente agora'}
                </p>
              </div>
              {!search && (
                <Link
                  to="/clients/new"
                  className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-sm font-medium bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors mt-2"
                >
                  <Plus className="w-4 h-4" /> Novo cliente
                </Link>
              )}
            </div>
          )}

          {/* ── Grid de cards ─────────────────────────────────────────────────── */}
          {!isLoading && filtered.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              <AnimatePresence>
                {filtered.map((client, i) => {
                  const cfg          = STATUS_CFG[client.status] || STATUS_CFG.ativo
                  const initials     = client.company_name.slice(0, 2).toUpperCase()
                  // Banco tem prioridade; localStorage é fallback enquanto schema cache recarrega
                  const localGradient = (() => { try { return localStorage.getItem(`banner_${client.id}`) } catch { return null } })()
                  const gradientId    = client.card_gradient || localGradient || DEFAULT_GRADIENT_ID
                  const bannerStyle   = getBannerStyle(gradientId)
                  const clientStats  = stats[client.id] || { pendentes: 0, aprovados: 0, ajuste_solicitado: 0, reprovado: 0 }
                  const isPickerOpen = pickerOpen === client.id
                  const isSaving     = saving === client.id

                  return (
                    <motion.div
                      key={client.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                      whileHover={{ y: -4, transition: { duration: 0.18 } }}
                      onClick={() => navigate(`/clients/${client.id}`)}
                      className="rounded-2xl shadow-sm hover:shadow-xl transition-all cursor-pointer overflow-hidden group relative"
                      style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}
                    >

                      {/* ── Banner gradiente / imagem ─────────────────────────── */}
                      <div
                        className="relative h-28 flex-shrink-0"
                        style={bannerStyle}
                      >
                        <div className="absolute inset-0 bg-black/5 rounded-t-2xl" />

                        {/* Botão paleta */}
                        <button
                          onClick={e => { e.stopPropagation(); setPickerOpen(isPickerOpen ? null : client.id) }}
                          className="absolute top-3 left-3 z-10 w-7 h-7 rounded-full bg-white/25 hover:bg-white/55 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                          title="Mudar cor do banner"
                        >
                          {isSaving
                            ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Palette className="w-3.5 h-3.5 text-white drop-shadow" />}
                        </button>

                        {/* Botão deletar */}
                        <button
                          onClick={e => handleDelete(e, client.id, client.company_name)}
                          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/25 hover:bg-red-500/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                          title="Excluir cliente"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-white drop-shadow" />
                        </button>

                        {/* ── Banner picker (Cores / Imagem) ─────────────────── */}
                        {isPickerOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={e => { e.stopPropagation(); setPickerOpen(null) }}
                            />
                            <div
                              className="absolute top-11 left-3 z-40 rounded-2xl shadow-2xl p-3.5 w-[220px]"
                              style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)' }}
                              onClick={e => e.stopPropagation()}
                            >
                              {/* Abas */}
                              <div className="flex gap-1 mb-3 rounded-lg p-0.5" style={{ background: 'var(--sm-bg-alt)' }}>
                                {(['cores', 'imagem'] as const).map(tab => (
                                  <button
                                    key={tab}
                                    onClick={e => { e.stopPropagation(); setPickerTab(tab) }}
                                    className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-colors capitalize ${
                                      pickerTab === tab
                                        ? 'bg-[#2563EB] text-white shadow-sm'
                                        : ''
                                    }`}
                                    style={pickerTab !== tab ? { color: 'var(--sm-text-3)' } : {}}
                                  >
                                    {tab === 'cores' ? '🎨 Cores' : '🖼️ Imagem'}
                                  </button>
                                ))}
                              </div>

                              {pickerTab === 'cores' ? (
                                /* ── Grid de gradientes ── */
                                <div className="grid grid-cols-6 gap-1.5">
                                  {GRADIENTS.map(g => (
                                    <button
                                      key={g.id}
                                      onClick={e => { e.stopPropagation(); changeBanner(client.id, g.id) }}
                                      className="w-7 h-7 rounded-full transition-transform hover:scale-110 active:scale-95 relative flex-shrink-0"
                                      style={{ background: `linear-gradient(135deg, ${g.preview[0]} 0%, ${g.preview[1]} 100%)` }}
                                      title={g.id}
                                    >
                                      {gradientId === g.id && !gradientId.startsWith('url:') && (
                                        <span className="absolute inset-0 rounded-full ring-2 ring-white ring-offset-[2px] ring-offset-[#2563EB]" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                /* ── Upload de imagem ── */
                                <div>
                                  <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => {
                                      const file = e.target.files?.[0]
                                      if (file) changeBannerImage(client.id, file)
                                      e.target.value = ''
                                    }}
                                  />
                                  <button
                                    onClick={e => { e.stopPropagation(); imageInputRef.current?.click() }}
                                    className="w-full h-20 rounded-xl border-2 border-dashed hover:border-[#2563EB] hover:bg-[#2563EB]/10 flex flex-col items-center justify-center gap-1.5 transition-colors group"
                                    style={{ borderColor: 'var(--sm-border)' }}
                                  >
                                    <Upload className="w-5 h-5 text-[#94a3b8] group-hover:text-[#60A5FA] transition-colors" />
                                    <span className="text-[11px] text-[#94a3b8] group-hover:text-[#60A5FA] transition-colors font-medium">
                                      Clique para enviar
                                    </span>
                                    <span className="text-[10px] text-[#64748b]">JPG, PNG, WEBP</span>
                                  </button>
                                  {gradientId.startsWith('url:') && (
                                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#64748b]">
                                      <ImageIcon className="w-3 h-3 text-emerald-500" />
                                      <span>Imagem ativa</span>
                                      <button
                                        onClick={e => { e.stopPropagation(); changeBanner(client.id, DEFAULT_GRADIENT_ID) }}
                                        className="ml-auto text-red-400 hover:text-red-600 font-medium"
                                      >
                                        Remover
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* ── Avatar ────────────────────────────────────────── */}
                        <div className="absolute -bottom-7 left-5 z-10">
                          {client.logo_url ? (
                            <img
                              src={client.logo_url}
                              alt={client.company_name}
                              className="w-16 h-16 rounded-2xl object-cover border-[3px] border-white shadow-lg"
                            />
                          ) : (
                            <div
                              className="w-16 h-16 rounded-2xl border-[3px] border-white shadow-lg flex items-center justify-center text-white font-bold text-lg select-none"
                              style={{ background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(8px)' }}
                            >
                              {initials}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Body ──────────────────────────────────────────────── */}
                      <div className="pt-10 px-5 pb-5">

                        {/* Nome + status */}
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                            <h3 className="text-[14px] font-semibold leading-snug truncate" style={{ color: 'var(--sm-text-1)' }}>
                              {client.company_name}
                            </h3>
                          </div>
                          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${isDark ? cfg.badge : cfg.badgeLight}`}>
                            {cfg.label}
                          </span>
                        </div>

                        {/* Handle */}
                        {client.instagram && (
                          <div className="flex items-center gap-1.5 ml-4 mb-2.5">
                            <Instagram className="w-3 h-3 text-pink-500 flex-shrink-0" />
                            <span className="text-[12px] truncate" style={{ color: 'var(--sm-text-3)' }}>
                              @{client.instagram.replace('@', '')}
                            </span>
                          </div>
                        )}

                        {/* Nicho */}
                        <div className="ml-4 mb-4">
                          <span className="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full max-w-full truncate" style={{ color: 'var(--sm-text-2)', background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}>
                            {client.niche}
                          </span>
                        </div>

                        <div className="mb-3" style={{ borderTop: '1px solid var(--sm-border)' }} />

                        {/* ── Métricas premium 2×2 ── */}
                        {(() => {
                          const mc = isDark ? {
                            pending:  { bg: 'rgba(37,99,235,0.10)',  border: 'rgba(37,99,235,0.22)',  icon: '#60a5fa', label: '#93c5fd', count: '#dbeafe' },
                            approved: { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.22)',  icon: '#22c55e', label: '#86efac', count: '#dcfce7' },
                            adjust:   { bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.22)', icon: '#a78bfa', label: '#c4b5fd', count: '#ede9fe' },
                            rejected: { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.22)',  icon: '#f87171', label: '#fca5a5', count: '#fee2e2' },
                          } : {
                            pending:  { bg: 'rgba(37,99,235,0.08)',  border: 'rgba(37,99,235,0.30)',  icon: '#2563eb', label: '#1d4ed8', count: '#1e3a8a' },
                            approved: { bg: 'rgba(22,163,74,0.08)',  border: 'rgba(22,163,74,0.30)',  icon: '#16a34a', label: '#15803d', count: '#14532d' },
                            adjust:   { bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.30)', icon: '#7c3aed', label: '#6d28d9', count: '#4c1d95' },
                            rejected: { bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.30)',  icon: '#dc2626', label: '#b91c1c', count: '#7f1d1d' },
                          }
                          return (
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border" style={{ background: mc.pending.bg, borderColor: mc.pending.border }}>
                                <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: mc.pending.icon }} />
                                <span className="text-[11px] font-medium leading-tight flex-1 truncate" style={{ color: mc.pending.label }}>Pendentes</span>
                                <span className="text-[15px] font-semibold flex-shrink-0" style={{ color: mc.pending.count }}>{clientStats.pendentes}</span>
                              </div>
                              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border" style={{ background: mc.approved.bg, borderColor: mc.approved.border }}>
                                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: mc.approved.icon }} />
                                <span className="text-[11px] font-medium leading-tight flex-1 truncate" style={{ color: mc.approved.label }}>Aprovados</span>
                                <span className="text-[15px] font-semibold flex-shrink-0" style={{ color: mc.approved.count }}>{clientStats.aprovados}</span>
                              </div>
                              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border" style={{ background: mc.adjust.bg, borderColor: mc.adjust.border }}>
                                <FileEdit className="w-3.5 h-3.5 flex-shrink-0" style={{ color: mc.adjust.icon }} />
                                <span className="text-[11px] font-medium leading-tight flex-1 truncate" style={{ color: mc.adjust.label }}>Ajustes</span>
                                <span className="text-[15px] font-semibold flex-shrink-0" style={{ color: mc.adjust.count }}>{clientStats.ajuste_solicitado}</span>
                              </div>
                              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border" style={{ background: mc.rejected.bg, borderColor: mc.rejected.border }}>
                                <XCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: mc.rejected.icon }} />
                                <span className="text-[11px] font-medium leading-tight flex-1 truncate" style={{ color: mc.rejected.label }}>Reprovados</span>
                                <span className="text-[15px] font-semibold flex-shrink-0" style={{ color: mc.rejected.count }}>{clientStats.reprovado}</span>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
