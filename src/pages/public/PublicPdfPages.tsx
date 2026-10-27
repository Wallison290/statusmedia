// ── PDF da proposta, página por página ───────────────────────────────────────
// PDF dentro de <iframe> não funciona no iPhone nem no Android (mostra só a
// capa ou um botão de baixar). Aqui cada página vira uma imagem com o pdf.js,
// uma embaixo da outra, na largura da tela. O arquivo vem pela função
// crm-proposal-pdf (o R2 público não libera CORS). Se algo falhar, sobra o
// botão de abrir o PDF.

import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, FileText } from 'lucide-react'
import { supabaseUrl } from '@/integrations/supabase/client'
import { MUTED, LINE } from './PublicShell'

export function proposalPdfSrc(token: string) {
  return `${supabaseUrl}/functions/v1/crm-proposal-pdf?t=${token}`
}

export function PublicPdfPages({ token, name }: { token: string; name?: string | null }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [pages, setPages] = useState(0)
  const src = proposalPdfSrc(token)

  useEffect(() => {
    let cancelled = false
    let doc: any = null
    ;(async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist')
        const worker: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        doc = await pdfjs.getDocument({ url: src }).promise
        if (cancelled) return
        setPages(doc.numPages)
        const box = boxRef.current
        if (!box) return
        box.innerHTML = ''
        const width = box.clientWidth || 600
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return
          const page = await doc.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (width / base.width) * dpr })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          canvas.className = 'rounded-lg bg-white shadow-[0_1px_2px_rgba(28,25,23,0.06),0_12px_32px_-12px_rgba(28,25,23,0.18)]'
          canvas.setAttribute('aria-label', `Página ${i} de ${doc.numPages}`)
          box.appendChild(canvas)
          await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise
          if (i === 1 && !cancelled) setState('ok')
        }
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => { cancelled = true; doc?.destroy?.() }
  }, [src])

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
      <div ref={boxRef} className="space-y-4" />
      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap print:hidden">
        <p className="text-[12.5px]" style={{ color: MUTED }}>
          {pages > 0 ? `${pages} ${pages === 1 ? 'página' : 'páginas'}` : ''}
        </p>
        <a href={src} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-2 h-11 px-5 rounded-full border bg-white text-[14px] font-medium hover:opacity-80"
           style={{ borderColor: LINE }}>
          <Download className="w-4 h-4" /> {state === 'error' ? 'Abrir PDF' : 'Baixar PDF'}
        </a>
      </div>
    </div>
  )
}
