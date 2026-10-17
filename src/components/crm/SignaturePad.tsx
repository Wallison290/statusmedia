// ── Quadro de assinatura ─────────────────────────────────────────────────────
// Desenho com dedo ou mouse (pointer events cobrem os dois). A imagem sai como
// PNG em data URL, reduzida para no máximo 600px de largura: uma rubrica não
// precisa de mais, e o banco limita o campo a 300 KB.
//
// No celular o quadro em pé é estreito demais para assinar. Lá o campo vira só
// a prévia, e o botão "Iniciar" abre um quadro em tela cheia deitado: no Android
// a tela trava em paisagem; onde o navegador não deixa travar (iPhone), o quadro
// é girado 90° por CSS enquanto o aparelho estiver em pé.

import { useRef, useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Eraser, PenLine, Check, X } from 'lucide-react'

interface Props {
  onChange: (dataUrl: string | null) => void
  /** Cores próprias: as páginas públicas são sempre claras, o app pode ser escuro. */
  ink?:        string
  background?: string
  border?:     string
  height?:     number
}

// Celular de verdade: toque e a menor dimensão da tela abaixo de tablet
function detectPhone() {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  return !!coarse && Math.min(window.screen.width, window.screen.height) < 600
}

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void }

// ── Traço no canvas ──────────────────────────────────────────────────────────
// `rotated`: o canvas está girado 90° no sentido horário por CSS, então o toque
// na tela precisa ser convertido para o eixo do próprio canvas.
function useInkCanvas(ink: string, rotated = false, onStroke?: (dataUrl: string) => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const last      = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)
  const hasInk = useRef(false)   // ref: o pointerup lê antes do estado re-renderizar

  // Canvas no tamanho real em pixels da tela, senão o traço sai borrado. Mede
  // de novo quando o tamanho muda (celular girando), sem perder o que já foi
  // desenhado.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const fit = () => {
      const ratio = window.devicePixelRatio || 1
      const w = Math.round(c.offsetWidth * ratio)
      const h = Math.round(c.offsetHeight * ratio)
      if (!w || !h || (c.width === w && c.height === h)) return
      let old: HTMLCanvasElement | null = null
      if (hasInk.current) {
        old = document.createElement('canvas')
        old.width = c.width; old.height = c.height
        old.getContext('2d')!.drawImage(c, 0, 0)
      }
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')!
      if (old) ctx.drawImage(old, 0, 0)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.2
      ctx.strokeStyle = ink
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    return () => ro.disconnect()
  }, [ink])

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rotated) return { x: e.clientY - rect.top, y: rect.right - e.clientX }
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
    if (hasInk.current) onStroke?.(exportPng())
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
    const c = canvasRef.current
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    hasInk.current = false
    setEmpty(true)
  }

  return {
    canvasRef, empty, hasInk, exportPng, clear,
    handlers: { onPointerDown: start, onPointerMove: move, onPointerUp: end, onPointerLeave: end, onPointerCancel: end },
  }
}

export function SignaturePad(props: Props) {
  const [phone] = useState(detectPhone)
  return phone ? <PhoneSignaturePad {...props} /> : <InlineSignaturePad {...props} />
}

// ── Computador e tablet: assina direto no campo ──────────────────────────────
function InlineSignaturePad({ onChange, ink = '#0f172a', background = '#ffffff', border = '#cbd5e1', height = 160 }: Props) {
  const pad = useInkCanvas(ink, false, onChange)

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed overflow-hidden" style={{ borderColor: border, background }}>
        <canvas
          ref={pad.canvasRef}
          style={{ width: '100%', height, touchAction: 'none', display: 'block', cursor: 'crosshair' }}
          {...pad.handlers}
          aria-label="Área para desenhar a assinatura"
        />
        {pad.empty && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-[13px]"
                style={{ color: '#8B857C' }}>
            Assine aqui com o dedo ou o mouse
          </span>
        )}
        <span className="absolute left-6 right-6 bottom-8 h-px pointer-events-none" style={{ background: border }} />
      </div>
      <button type="button" onClick={() => { pad.clear(); onChange(null) }} disabled={pad.empty}
              className="mt-1.5 flex items-center gap-1 text-[12px] disabled:opacity-40" style={{ color: '#64748b' }}>
        <Eraser className="w-3.5 h-3.5" /> Limpar
      </button>
    </div>
  )
}

// ── Celular: campo vira prévia, assinatura em tela cheia deitada ─────────────
function PhoneSignaturePad({ onChange, ink = '#0f172a', background = '#ffffff', border = '#cbd5e1', height = 160 }: Props) {
  const [open, setOpen]       = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  async function start() {
    setOpen(true)
    // Tela cheia e trava em paisagem precisam sair do mesmo toque do usuário.
    // Onde não houver suporte (iPhone), o quadro gira por CSS.
    try {
      const el = document.documentElement
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
      await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape')
    } catch { /* sem suporte: fica a rotação por CSS */ }
  }

  function close() {
    setOpen(false)
    try { (screen.orientation as LockableOrientation | undefined)?.unlock?.() } catch { /* nada a desfazer */ }
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }

  function done(dataUrl: string | null) {
    if (dataUrl) { setPreview(dataUrl); onChange(dataUrl) }
    close()
  }

  return (
    <div>
      <button type="button" onClick={start}
              className="mb-2 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-medium text-white"
              style={{ background: '#2563EB' }}>
        <PenLine className="w-4 h-4" /> {preview ? 'Assinar novamente' : 'Iniciar assinatura'}
      </button>
      <button type="button" onClick={start} aria-label="Abrir área de assinatura"
              className="relative block w-full rounded-xl border-2 border-dashed overflow-hidden"
              style={{ borderColor: border, background, height }}>
        {preview ? (
          <img src={preview} alt="Sua assinatura" className="w-full h-full object-contain" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-[13px]" style={{ color: '#8B857C' }}>
            Toque em "Iniciar assinatura" para assinar com o celular deitado
          </span>
        )}
      </button>
      <button type="button" onClick={() => { setPreview(null); onChange(null) }} disabled={!preview}
              className="mt-1.5 flex items-center gap-1 text-[12px] disabled:opacity-40" style={{ color: '#64748b' }}>
        <Eraser className="w-3.5 h-3.5" /> Limpar
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={o => { if (!o) close() }}>
        <DialogPrimitive.Portal>
          {open && <LandscapeBoard ink={ink} background={background} border={border} onDone={done} onCancel={close} />}
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  )
}

function LandscapeBoard({ ink, background, border, onDone, onCancel }: {
  ink: string; background: string; border: string
  onDone: (dataUrl: string | null) => void
  onCancel: () => void
}) {
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const update = () => setView({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('orientationchange', update) }
  }, [])

  // Aparelho em pé (a trava não pegou): gira o quadro para ele ficar deitado
  const rotated = view.h > view.w
  const pad = useInkCanvas(ink, rotated)

  const frame: React.CSSProperties = rotated
    ? { position: 'fixed', top: 0, left: 0, width: view.h, height: view.w,
        transform: `translateX(${view.w}px) rotate(90deg)`, transformOrigin: 'top left' }
    : { position: 'fixed', inset: 0 }

  return (
    <DialogPrimitive.Content
      aria-describedby={undefined}
      onEscapeKeyDown={onCancel}
      className="z-[100] flex flex-col outline-none"
      style={{ ...frame, background, color: '#0f172a' }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: border }}>
        <DialogPrimitive.Title className="flex-1 min-w-0 truncate text-[14px] font-medium">
          Assine no espaço abaixo
        </DialogPrimitive.Title>
        <button type="button" onClick={pad.clear} disabled={pad.empty}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-40" style={{ color: '#64748b' }}>
          <Eraser className="w-4 h-4" /> Limpar
        </button>
        <button type="button" onClick={onCancel}
                className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[13px]" style={{ borderColor: border, color: '#334155' }}>
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button type="button" disabled={pad.empty}
                onClick={() => onDone(pad.hasInk.current ? pad.exportPng() : null)}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
                style={{ background: '#2563EB' }}>
          <Check className="w-4 h-4" /> Concluir
        </button>
      </div>
      <div className="relative flex-1 min-h-0">
        <canvas
          ref={pad.canvasRef}
          style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block' }}
          {...pad.handlers}
          aria-label="Área para desenhar a assinatura"
        />
        {pad.empty && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-[14px]"
                style={{ color: '#8B857C' }}>
            Assine aqui com o dedo
          </span>
        )}
        <span className="absolute left-10 right-10 bottom-[22%] h-px pointer-events-none" style={{ background: border }} />
      </div>
    </DialogPrimitive.Content>
  )
}
