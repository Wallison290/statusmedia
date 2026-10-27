// ── PDF da proposta, página por página ───────────────────────────────────────
// PDF dentro de <iframe> não funciona no iPhone nem no Android (mostra só a
// capa ou um botão de baixar). Aqui o pdf.js desenha cada página, uma embaixo
// da outra, na largura da tela. Quando o cliente amplia com os dedos, as
// páginas à vista são redesenhadas na resolução do zoom (o PDF é vetor, então
// a letra continua nítida), até o limite de memória do celular. O arquivo vem pela função
// crm-proposal-pdf (o R2 público não libera CORS). Se algo falhar, sobra o
// botão de abrir o PDF.

import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, FileText, Maximize2 } from 'lucide-react'
import { supabase, supabaseUrl } from '@/integrations/supabase/client'
import { MUTED, LINE } from './PublicShell'

export function proposalPdfSrc(token: string) {
  return `${supabaseUrl}/functions/v1/crm-proposal-pdf?t=${token}`
}

// preview: rascunho aberto pela agência. A função só entrega com o login dela,
// e o botão de baixar abre o arquivo direto (directUrl).
export function PublicPdfPages({ token, name, preview, directUrl }: { token: string; name?: string | null; preview?: boolean; directUrl?: string | null }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [pages, setPages] = useState(0)
  const src = proposalPdfSrc(token)
  const openUrl = preview && directUrl ? directUrl : src

  useEffect(() => {
    let cancelled = false
    let doc: any = null
    // Cada página guarda o canvas atual e a largura (em px reais) já desenhada
    const sheets: { page: any; canvas: HTMLCanvasElement; drawn: number; busy: boolean }[] = []
    // iPhone recusa canvas acima de ~16,7 milhões de pixels
    const MAX_PIXELS = 16_000_000

    function makeCanvas(i: number, total: number) {
      const canvas = document.createElement('canvas')
      canvas.style.width = '100%'
      canvas.style.height = 'auto'
      canvas.style.display = 'block'
      canvas.className = 'rounded-lg bg-white shadow-[0_1px_2px_rgba(28,25,23,0.06),0_12px_32px_-12px_rgba(28,25,23,0.18)]'
      canvas.setAttribute('aria-label', `Página ${i} de ${total}`)
      return canvas
    }

    /** Desenha a página com `pxWidth` pixels de largura num canvas novo e troca no lugar. */
    async function draw(sheet: (typeof sheets)[number], pxWidth: number, i: number, total: number) {
      const base = sheet.page.getViewport({ scale: 1 })
      let scale = pxWidth / base.width
      const area = base.width * base.height * scale * scale
      if (area > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / area)
      const target = Math.floor(base.width * scale)
      if (sheet.busy || target <= sheet.drawn * 1.05) return
      sheet.busy = true
      try {
        const viewport = sheet.page.getViewport({ scale })
        const canvas = makeCanvas(i, total)
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        await sheet.page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise
        if (cancelled) return
        sheet.canvas.replaceWith(canvas)
        sheet.canvas.width = 0   // libera a memória da versão anterior
        sheet.canvas = canvas
        sheet.drawn = target
      } finally {
        sheet.busy = false
      }
    }

    const cssWidth = () => boxRef.current?.clientWidth || 600
    const dpr = () => Math.min(window.devicePixelRatio || 1, 3)

    // Zoom com os dedos: redesenha só as páginas à vista na nova resolução
    let timer: number | undefined
    function onZoom() {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const zoom = window.visualViewport?.scale ?? 1
        if (zoom <= 1.05) return
        const vv = window.visualViewport
        const top = vv ? vv.pageTop : window.scrollY
        const bottom = top + (vv ? vv.height : window.innerHeight)
        sheets.forEach((sh, idx) => {
          const r = sh.canvas.getBoundingClientRect()
          const pageTop = r.top + window.scrollY
          if (pageTop + r.height < top || pageTop > bottom) return
          draw(sh, cssWidth() * dpr() * Math.min(zoom, 5), idx + 1, sheets.length)
        })
      }, 250)
    }
    window.visualViewport?.addEventListener('resize', onZoom)
    window.visualViewport?.addEventListener('scroll', onZoom)

    ;(async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist')
        const worker: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const session = preview ? (await supabase.auth.getSession()).data.session : null
        doc = await pdfjs.getDocument({ url: src, ...(session ? { httpHeaders: { Authorization: `Bearer ${session.access_token}` } } : {}) }).promise
        if (cancelled) return
        setPages(doc.numPages)
        const box = boxRef.current
        if (!box) return
        box.innerHTML = ''
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return
          const page = await doc.getPage(i)
          const sheet = { page, canvas: makeCanvas(i, doc.numPages), drawn: 0, busy: false }
          box.appendChild(sheet.canvas)
          sheets.push(sheet)
          // Já começa mais nítido que a tela pede (1,5×), para o zoom leve não borrar
          await draw(sheet, cssWidth() * dpr() * 1.5, i, doc.numPages)
          if (i === 1 && !cancelled) setState('ok')
        }
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.visualViewport?.removeEventListener('resize', onZoom)
      window.visualViewport?.removeEventListener('scroll', onZoom)
      doc?.destroy?.()
    }
  }, [src, preview])

  return (
    <div>
      {state === 'loading' && (
        <div className="rounded-2xl border bg-white/60 h-72 flex flex-col items-center justify-center gap-2" style={{ borderColor: LINE }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: MUTED }} />
          <p className="text-[13px]" style={{ color: MUTED }}>Carregando a proposta...</p>
        </div>
      )}
      {state === 'error' && (
        <div className="rounded-2xl border bg-white p-6 flex items-center gap-4" style={{ borderColor: LINE }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--brand-soft)' }}>
            <FileText className="w-5 h-5" style={{ color: 'var(--brand)' }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{name || 'Proposta em PDF'}</p>
            <p className="text-[13px]" style={{ color: MUTED }}>Toque em abrir para ler a proposta completa.</p>
          </div>
        </div>
      )}
      {/* Celular: o leitor de PDF do próprio aparelho amplia sem limite */}
      {state === 'ok' && (
        <a href={openUrl} target="_blank" rel="noopener noreferrer"
           className="sm:hidden mb-3 flex items-center justify-center gap-2 h-11 rounded-full border bg-white text-[14px] font-medium print:hidden"
           style={{ borderColor: LINE }}>
          <Maximize2 className="w-4 h-4" /> Abrir em tela cheia
        </a>
      )}
      <div ref={boxRef} className="space-y-4" />
      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap print:hidden">
        <p className="text-[12.5px]" style={{ color: MUTED }}>
          {pages > 0 ? `${pages} ${pages === 1 ? 'página' : 'páginas'}` : ''}
        </p>
        <a href={openUrl} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-2 h-11 px-5 rounded-full border bg-white text-[14px] font-medium hover:opacity-80"
           style={{ borderColor: LINE }}>
          <Download className="w-4 h-4" /> {state === 'error' ? 'Abrir PDF' : 'Abrir PDF original'}
        </a>
      </div>
    </div>
  )
}
