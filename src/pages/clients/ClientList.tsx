import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Users, Instagram, Trash2, ChevronDown, Palette, Upload, ImageIcon } from 'lucide-react'
import { useClients, useDeleteClient, checkClientDeletion } from '@/hooks/useClients'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'
import { useQueryClient } from '@tanstack/react-query'

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
  const { agencyId } = useAuth()

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
      const path = `${agencyId}/banner_${clientId}.${ext}`
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

  // Situação do cliente = ponto + texto (padrão editorial: cor só como sinal)
  const STATUS_DOT: Record<string, string> = {
    ativo: '#22C55E', pausado: '#F59E0B', encerrado: '#EF4444', lead: '#3B82F6',
    proposta: '#8B5CF6', fechado: '#14B8A6', onboarding: '#F97316',
  }
  const counts = {
    all: clients.length,
    ativo: clients.filter(c => c.status === 'ativo').length,
    pausado: clients.filter(c => c.status === 'pausado').length,
    encerrado: clients.filter(c => c.status === 'encerrado').length,
  }
  const totals = Object.values(stats).reduce(
    (t, s) => ({ pendentes: t.pendentes + s.pendentes, ajustes: t.ajustes + s.ajuste_solicitado }),
    { pendentes: 0, ajustes: 0 },
  )

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <div className="px-4 sm:px-6 pt-4 md:pt-6 pb-12 max-w-7xl mx-auto">

        {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
        <header className="mb-6 max-md:pl-12 max-md:-mt-[3.25rem] flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Carteira</p>
            <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>
              Clientes
            </h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
              {counts.ativo} ativo{counts.ativo !== 1 ? 's' : ''}
              {totals.pendentes > 0 && <> · <strong style={{ color: 'var(--sm-text-1)' }}>{totals.pendentes}</strong> conteúdo{totals.pendentes !== 1 ? 's' : ''} esperando aprovação</>}
              {totals.ajustes > 0 && <> · {totals.ajustes} ajuste{totals.ajustes !== 1 ? 's' : ''} pedido{totals.ajustes !== 1 ? 's' : ''}</>}
            </p>
          </div>
          <Link to="/clients/new"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-95 max-md:hidden"
            style={{ background: '#2563EB' }}>
            <Plus className="w-4 h-4" /> Novo cliente
          </Link>
        </header>

        {/* ── Filtros, busca e ordenação ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="flex gap-1 p-1 rounded-xl overflow-x-auto scrollbar-none max-w-full" style={{ background: 'var(--sm-bg-alt)' }}>
            {([
              { value: 'all', label: 'Todos' }, { value: 'ativo', label: 'Ativos' },
              { value: 'pausado', label: 'Pausados' }, { value: 'encerrado', label: 'Encerrados' },
            ] as const).map(f => (
              <button key={f.value} onClick={() => setFilter(f.value)} aria-pressed={filter === f.value}
                className="h-8 px-3 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-colors"
                style={filter === f.value ? { background: 'var(--sm-bg-card)', color: 'var(--sm-text-1)' } : { color: 'var(--sm-text-3)' }}>
                {f.label} <span className="tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{counts[f.value]}</span>
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
            <input type="text" placeholder="Buscar por nome, @, segmento ou e-mail" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl text-[13px] outline-none border transition-colors focus:border-[#2563EB]/60"
              style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' }} />
          </div>

          <div className="relative">
            <button onClick={() => setShowSort(o => !o)}
              className="h-10 px-3.5 rounded-xl border text-[13px] inline-flex items-center gap-2 transition-colors hover:border-[#2563EB]/50"
              style={{ background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' }}>
              {sortLabel} <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--sm-text-4)' }} />
            </button>
            {showSort && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border overflow-hidden py-1 shadow-2xl"
                  style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
                  {SORT_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => { setSort(o.value); setShowSort(false) }}
                      className="w-full text-left px-4 py-2 text-[13px] hover:bg-black/5"
                      style={{ color: sort === o.value ? '#2563EB' : 'var(--sm-text-2)', fontWeight: sort === o.value ? 600 : 400 }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <Link to="/clients/new" aria-label="Novo cliente"
            className="md:hidden inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-[13px] font-semibold text-white"
            style={{ background: '#2563EB' }}>
            <Plus className="w-4 h-4" /> Novo
          </Link>
        </div>

        {/* ── Carregando ─────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-[236px] rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
            ))}
          </div>
        )}

        {/* ── Vazio ──────────────────────────────────────────────────────────── */}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-2xl border py-20 px-6 flex flex-col items-center text-center gap-3"
            style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
            <Users className="w-8 h-8" style={{ color: 'var(--sm-text-4)' }} />
            <p className="font-display text-[18px] font-bold" style={{ color: 'var(--sm-text-1)' }}>
              {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            </p>
            <p className="text-[13px]" style={{ color: 'var(--sm-text-3)' }}>
              {search ? 'Tente outra busca.' : 'Cadastre o primeiro cliente para começar a planejar.'}
            </p>
            {!search && (
              <Link to="/clients/new" className="mt-1 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: '#2563EB' }}>
                <Plus className="w-4 h-4" /> Novo cliente
              </Link>
            )}
          </div>
        )}

        {/* ── Cartões ────────────────────────────────────────────────────────── */}
        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {filtered.map((client, i) => {
                const cfg          = STATUS_CFG[client.status] || STATUS_CFG.ativo
                const initials     = client.company_name.slice(0, 2).toUpperCase()
                // Banco tem prioridade; localStorage é fallback enquanto o schema cache recarrega
                const localGradient = (() => { try { return localStorage.getItem(`banner_${client.id}`) } catch { return null } })()
                const gradientId    = client.card_gradient || localGradient || DEFAULT_GRADIENT_ID
                const bannerStyle   = getBannerStyle(gradientId)
                const st            = stats[client.id] || { pendentes: 0, aprovados: 0, ajuste_solicitado: 0, reprovado: 0 }
                const isPickerOpen  = pickerOpen === client.id
                const isSaving      = saving === client.id
                // Cor só no número que pede atenção; zero fica apagado
                const metrics = [
                  { label: 'Pendentes', value: st.pendentes, color: '#3B82F6' },
                  { label: 'Aprovados', value: st.aprovados, color: '#22C55E' },
                  { label: 'Ajustes', value: st.ajuste_solicitado, color: '#8B5CF6' },
                  { label: 'Reprovados', value: st.reprovado, color: '#EF4444' },
                ]

                return (
                  <motion.div
                    key={client.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    className="group relative rounded-2xl border overflow-hidden cursor-pointer transition-colors hover:border-[#2563EB]/50"
                    style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}
                  >
                    {/* Capa (cor ou imagem escolhida pela agência) */}
                    <div className="relative h-20" style={bannerStyle}>
                      <button
                        onClick={e => { e.stopPropagation(); setPickerOpen(isPickerOpen ? null : client.id) }}
                        className="absolute top-2.5 left-2.5 z-10 w-8 h-8 rounded-full bg-black/25 hover:bg-black/45 backdrop-blur-sm flex items-center justify-center transition-opacity md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                        title="Mudar a capa" aria-label="Mudar a capa"
                      >
                        {isSaving
                          ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <Palette className="w-3.5 h-3.5 text-white" />}
                      </button>
                      <button
                        onClick={e => handleDelete(e, client.id, client.company_name)}
                        className="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-black/25 hover:bg-red-600/85 backdrop-blur-sm flex items-center justify-center transition-opacity md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                        title="Excluir cliente" aria-label="Excluir cliente"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-white" />
                      </button>

                      {isPickerOpen && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); setPickerOpen(null) }} />
                          <div className="absolute top-12 left-2.5 z-40 rounded-2xl border shadow-2xl p-3.5 w-[228px]"
                            style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}
                            onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1 mb-3 rounded-lg p-0.5" style={{ background: 'var(--sm-bg-alt)' }}>
                              {(['cores', 'imagem'] as const).map(tab => (
                                <button key={tab} onClick={e => { e.stopPropagation(); setPickerTab(tab) }}
                                  className="flex-1 h-7 rounded-md text-[11.5px] font-semibold transition-colors"
                                  style={pickerTab === tab ? { background: 'var(--sm-bg-card)', color: 'var(--sm-text-1)' } : { color: 'var(--sm-text-3)' }}>
                                  {tab === 'cores' ? 'Cores' : 'Imagem'}
                                </button>
                              ))}
                            </div>
                            {pickerTab === 'cores' ? (
                              <div className="grid grid-cols-6 gap-1.5">
                                {GRADIENTS.map(g => (
                                  <button key={g.id} onClick={e => { e.stopPropagation(); changeBanner(client.id, g.id) }}
                                    className="w-7 h-7 rounded-full transition-transform hover:scale-110 relative"
                                    style={{ background: `linear-gradient(135deg, ${g.preview[0]} 0%, ${g.preview[1]} 100%)` }}
                                    title={g.id} aria-label={`Capa ${g.id}`}>
                                    {gradientId === g.id && (
                                      <span className="absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 2px var(--sm-bg-card), 0 0 0 4px #2563EB' }} />
                                    )}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div>
                                <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                                  onChange={e => { const file = e.target.files?.[0]; if (file) changeBannerImage(client.id, file); e.target.value = '' }} />
                                <button onClick={e => { e.stopPropagation(); imageInputRef.current?.click() }}
                                  className="w-full h-20 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1 transition-colors hover:border-[#2563EB]"
                                  style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
                                  <Upload className="w-5 h-5" />
                                  <span className="text-[11.5px] font-medium">Enviar imagem</span>
                                  <span className="text-[10.5px]" style={{ color: 'var(--sm-text-4)' }}>JPG, PNG ou WEBP</span>
                                </button>
                                {gradientId.startsWith('url:') && (
                                  <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--sm-text-3)' }}>
                                    <ImageIcon className="w-3 h-3" style={{ color: '#22C55E' }} /> Imagem ativa
                                    <button onClick={e => { e.stopPropagation(); changeBanner(client.id, DEFAULT_GRADIENT_ID) }}
                                      className="ml-auto font-semibold" style={{ color: '#EF4444' }}>Remover</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* Logo sobre a capa */}
                      <div className="absolute -bottom-6 left-4 z-10">
                        {client.logo_url ? (
                          <img src={client.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover"
                            style={{ boxShadow: '0 0 0 3px var(--sm-bg-card)' }} />
                        ) : (
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-[15px] select-none"
                            style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)', boxShadow: '0 0 0 3px var(--sm-bg-card)' }}>
                            {initials}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Corpo */}
                    <div className="pt-8 px-4 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-[17px] font-bold leading-tight truncate" style={{ color: 'var(--sm-text-1)' }}>
                          {client.company_name}
                        </h3>
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium whitespace-nowrap mt-1" style={{ color: 'var(--sm-text-3)' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_DOT[client.status] ?? '#94A3B8' }} />
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-[12px] mt-1 truncate flex items-center gap-1.5" style={{ color: 'var(--sm-text-3)' }}>
                        <span className="truncate">{client.niche}</span>
                        {client.instagram && (
                          <>
                            <span style={{ color: 'var(--sm-text-4)' }}>·</span>
                            <Instagram className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }} />
                            <span className="truncate">@{client.instagram.replace('@', '')}</span>
                          </>
                        )}
                      </p>

                      {/* Régua de aprovação: 4 números separados por linhas finas */}
                      <div className="mt-4 grid grid-cols-4 border-t" style={{ borderColor: 'var(--sm-border)' }}>
                        {metrics.map((m, idx) => (
                          <div key={m.label} className={`pt-3 ${idx ? 'pl-3 border-l' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                            <p className="font-display text-[20px] font-bold tabular-nums leading-none"
                              style={{ color: m.value ? 'var(--sm-text-1)' : 'var(--sm-text-4)' }}>
                              {m.value}
                            </p>
                            <p className="text-[10.5px] mt-1.5 flex items-center gap-1 truncate" style={{ color: 'var(--sm-text-4)' }}>
                              {m.value > 0 && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.color }} />}
                              {m.label}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
