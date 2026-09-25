// ── Quadro de assinatura ─────────────────────────────────────────────────────
// Desenho com dedo ou mouse (pointer events cobrem os dois). A imagem sai como
// PNG em data URL, reduzida para no máximo 600px de largura: uma rubrica não
// precisa de mais, e o banco limita o campo a 300 KB.

import { useRef, useEffect, useState } from 'react'
import { Eraser } from 'lucide-react'

interface Props {
  onChange: (dataUrl: string | null) => void
  /** Cores próprias: as páginas públicas são sempre claras, o app pode ser escuro. */
  ink?:        string
  background?: string
  border?:     string
  height?:     number
}

export function SignaturePad({ onChange, ink = '#0f172a', background = '#ffffff', border = '#cbd5e1', height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const last      = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)
  const hasInk = useRef(false)   // ref: o pointerup lê antes do estado re-renderizar

  // Canvas no tamanho real em pixels da tela, senão o traço sai borrado
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width  = rect.width * ratio
    c.height = rect.height * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.2
    ctx.strokeStyle = ink
  }, [ink])

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const p = point(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (!hasInk.current) { hasInk.current = true; setEmpty(false) }
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    if (hasInk.current) onChange(exportPng())
  }

  function exportPng() {
    const src = canvasRef.current!
    const scale = Math.min(1, 600 / src.width)
    const out = document.createElement('canvas')
    out.width  = Math.round(src.width * scale)
    out.height = Math.round(src.height * scale)
    const ctx = out.getContext('2d')!
    // Fundo branco: a imagem vai para um documento, e PNG transparente sumiria
    // no tema escuro do app
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(src, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  function clear() {
    const c = canvasRef.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    hasInk.current = false
    setEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed overflow-hidden" style={{ borderColor: border, background }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height, touchAction: 'none', display: 'block', cursor: 'crosshair' }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          aria-label="Área para desenhar a assinatura"
        />
        {empty && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-[13px]"
                style={{ color: border }}>
            Assine aqui com o dedo ou o mouse
          </span>
        )}
        <span className="absolute left-6 right-6 bottom-8 h-px pointer-events-none" style={{ background: border }} />
      </div>
      <button type="button" onClick={clear} disabled={empty}
              className="mt-1.5 flex items-center gap-1 text-[12px] disabled:opacity-40" style={{ color: '#64748b' }}>
        <Eraser className="w-3.5 h-3.5" /> Limpar
      </button>
    </div>
  )
}
