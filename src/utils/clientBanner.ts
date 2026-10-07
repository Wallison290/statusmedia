// Capa do cliente (cor em degradê ou imagem), escolhida pela agência na lista
// de clientes e repetida no topo do perfil. Fonte única para as duas telas.

export const GRADIENTS = [
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

export const DEFAULT_GRADIENT_ID = 'sunset'

/** Estilo CSS da capa (degradê ou imagem de fundo). */
export function getBannerStyle(id: string | null | undefined): React.CSSProperties {
  if (!id) return { background: GRADIENTS[0].value }
  if (id.startsWith('url:')) {
    return { backgroundImage: `url(${id.slice(4)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  const found = GRADIENTS.find(g => g.id === id)
  return { background: found ? found.value : GRADIENTS[0].value }
}

/** Capa efetiva do cliente: banco primeiro; localStorage cobre o cache antigo do PostgREST. */
export function clientBannerId(client: { id: string; card_gradient?: string | null }): string {
  let local: string | null = null
  try { local = localStorage.getItem(`banner_${client.id}`) } catch { /* sem storage */ }
  return client.card_gradient || local || DEFAULT_GRADIENT_ID
}

/** Cores da situação do cliente (ponto + texto, nunca etiqueta cheia). */
export const CLIENT_STATUS: Record<string, { label: string; color: string }> = {
  ativo:      { label: 'Ativo',      color: '#22C55E' },
  pausado:    { label: 'Pausado',    color: '#F59E0B' },
  encerrado:  { label: 'Encerrado',  color: '#EF4444' },
  lead:       { label: 'Lead',       color: '#3B82F6' },
  proposta:   { label: 'Proposta',   color: '#8B5CF6' },
  fechado:    { label: 'Fechado',    color: '#14B8A6' },
  onboarding: { label: 'Onboarding', color: '#F97316' },
}
