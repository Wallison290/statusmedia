import { useState, useEffect } from 'react'
import { Wand2, X, Loader2, Building2, Paperclip, Square, RectangleVertical, Smartphone } from 'lucide-react'
import { cn } from '@/utils/formatters'
import type { ImageSize } from '@/lib/aiProxy'

type Format = 'square' | 'feed_vertical' | 'story'

const FORMATS: { id: Format; label: string; dims: string; size: ImageSize; icon: typeof Square; note?: string }[] = [
  { id: 'square',        label: 'Quadrado',     dims: '1080×1080', size: '1024x1024', icon: Square },
  { id: 'feed_vertical', label: 'Feed vertical', dims: '1080×1350', size: '1024x1536', icon: RectangleVertical },
  { id: 'story',         label: 'Story / Reels', dims: '1080×1920', size: '1024x1536', icon: Smartphone, note: 'gerado em alta resolução vertical' },
]

interface ImageBuilderProps {
  isGenerating: boolean
  activeClientName: string | null
  brandColorPrimary: string | null
  brandColorSecondary: string | null
  canSaveColors: boolean
  onSaveColors: (primary: string, secondary: string) => void
  attachedImages: string[]
  onAttachClick: () => void
  onRemoveAttachedImage: (index: number) => void
  onGenerate: (fullPrompt: string, size: ImageSize) => void
  onCancel: () => void
}

export function ImageBuilder({
  isGenerating, activeClientName, brandColorPrimary, brandColorSecondary, canSaveColors,
  onSaveColors, attachedImages, onAttachClick, onRemoveAttachedImage, onGenerate, onCancel,
}: ImageBuilderProps) {
  const [format, setFormat]           = useState<Format>('square')
  const [description, setDescription] = useState('')
  const [colorPrimary, setColorPrimary]     = useState(brandColorPrimary ?? '')
  const [colorSecondary, setColorSecondary] = useState(brandColorSecondary ?? '')
  const [saved, setSaved] = useState(false)

  // Recarrega as cores do cliente quando ele muda (ex: troca de cliente ativo)
  useEffect(() => {
    setColorPrimary(brandColorPrimary ?? '')
    setColorSecondary(brandColorSecondary ?? '')
    setSaved(false)
  }, [brandColorPrimary, brandColorSecondary])

  const canGenerate = description.trim().length > 0 && !isGenerating

  const handleGenerate = () => {
    if (!canGenerate) return
    const selected = FORMATS.find(f => f.id === format)!
    const parts: string[] = []
    if (colorPrimary || colorSecondary) {
      const colors = [colorPrimary, colorSecondary].filter(Boolean).join(' e ')
      parts.push(`Use as cores da marca: ${colors}.`)
    }
    parts.push(`Formato: ${selected.label} (${selected.dims}).`)
    parts.push(description.trim())
    onGenerate(parts.join(' '), selected.size)
  }

  const handleSaveColors = () => {
    onSaveColors(colorPrimary, colorSecondary)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-sm">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold text-[#0f0f0f]">Criação de Imagens</h1>
            <p className="text-[12px] text-[#888]">Escolha o formato, aplique as cores da marca e descreva a imagem</p>
          </div>
        </div>
        <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-xl text-[#888] hover:bg-[#f0f0f0] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {activeClientName && (
        <div className="mb-5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 border border-emerald-200 text-emerald-700">
          <Building2 className="w-3 h-3" /> {activeClientName}
        </div>
      )}

      {/* Formato */}
      <div className="mb-5">
        <label className="block text-[12px] font-semibold text-[#374151] mb-2">Formato</label>
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map(f => {
            const Icon = f.icon
            const active = format === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-center transition-all',
                  active ? 'border-[#6366f1] bg-[#f5f3ff] ring-1 ring-[#6366f1]' : 'border-[#e0e0e0] bg-white hover:bg-[#fafafa]',
                )}
              >
                <Icon className={cn('w-4 h-4', active ? 'text-[#6366f1]' : 'text-[#888]')} />
                <span className={cn('text-[12px] font-medium', active ? 'text-[#6366f1]' : 'text-[#333]')}>{f.label}</span>
                <span className="text-[10px] text-[#999]">{f.dims}</span>
              </button>
            )
          })}
        </div>
        {FORMATS.find(f => f.id === format)?.note && (
          <p className="text-[10px] text-[#999] mt-1.5">
            ℹ️ {FORMATS.find(f => f.id === format)?.note} — feed vertical e story usam a mesma resolução de geração (limite do modelo de imagem).
          </p>
        )}
      </div>

      {/* Cores da marca */}
      <div className="mb-5">
        <label className="block text-[12px] font-semibold text-[#374151] mb-2">Cores da marca (opcional)</label>
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-2">
            <input type="color" value={colorPrimary || '#6366f1'} onChange={e => setColorPrimary(e.target.value)}
              className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer" />
            <input type="text" value={colorPrimary} onChange={e => setColorPrimary(e.target.value)}
              placeholder="#6366f1" className="w-24 text-[12px] text-gray-700 border-0 border-b border-gray-200 focus:border-gray-400 outline-none bg-transparent" />
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={colorSecondary || '#8b5cf6'} onChange={e => setColorSecondary(e.target.value)}
              className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer" />
            <input type="text" value={colorSecondary} onChange={e => setColorSecondary(e.target.value)}
              placeholder="#8b5cf6" className="w-24 text-[12px] text-gray-700 border-0 border-b border-gray-200 focus:border-gray-400 outline-none bg-transparent" />
          </div>
          {canSaveColors && (colorPrimary || colorSecondary) && (
            <button onClick={handleSaveColors} className="text-[11px] text-[#6366f1] hover:underline">
              {saved ? '✓ Salvo no cliente' : 'Salvar no cliente'}
            </button>
          )}
        </div>
        {!canSaveColors && (
          <p className="text-[10px] text-[#999] mt-1.5">Selecione um cliente ativo no topo para salvar essas cores e reaproveitar depois.</p>
        )}
      </div>

      {/* Referência */}
      <div className="mb-5">
        <label className="block text-[12px] font-semibold text-[#374151] mb-2">Imagem de referência (opcional)</label>
        <div className="flex items-center gap-2 flex-wrap">
          {attachedImages.map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt="" className="w-14 h-14 rounded-xl object-cover border border-[#e0e0e0]" />
              <button onClick={() => onRemoveAttachedImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center shadow">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          <button onClick={onAttachClick}
            className="w-14 h-14 flex items-center justify-center rounded-xl border border-dashed border-[#d0d0d0] text-[#999] hover:border-[#aaa] hover:text-[#666] transition-colors">
            <Paperclip className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Descrição */}
      <div className="mb-6">
        <label className="block text-[12px] font-semibold text-[#374151] mb-2">Descreva a imagem</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          placeholder="Ex: post promocional de Black Friday para loja de roupas, com foco em desconto de 50%..."
          className="w-full rounded-xl border border-[#e0e0e0] px-3.5 py-3 text-[13px] text-[#0f0f0f] placeholder:text-[#aaa] resize-none outline-none focus:border-[#b0b0b0]"
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40"
      >
        {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando imagem...</> : <><Wand2 className="w-4 h-4" /> Gerar imagem</>}
      </button>
    </div>
  )
}
