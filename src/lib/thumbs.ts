// ── Miniaturas ───────────────────────────────────────────────────────────────
// Toda imagem ou vídeo no R2 ganha uma miniatura WebP de até 480 px em
// `thumbs/<chave original>.webp`, no mesmo bucket. A convenção é fixa, então
// não precisa de coluna no banco: qualquer tela troca a URL original pela da
// miniatura com `thumbUrl()`, e se a miniatura não existir (arquivo antigo
// ainda não processado) a <img> cai para o original (ver ThumbImg).
//
// Por quê: as artes do planejamento têm em média 3,4 MB. Grades com dezenas de
// quadrinhos de 150 px baixavam o arquivo inteiro e travavam tablet e notebook.
//
// Quem cria:
//   • upload novo: uploadArquivo chama gerarMiniatura() com o arquivo local
//     (sem CORS: a imagem/vídeo ainda está no aparelho);
//   • arquivos antigos: script de uma vez (scripts/thumbs-backfill) + edge
//     function thumb-store.

import { supabase } from '@/integrations/supabase/client'

const R2_PUBLIC_BASE = (import.meta.env.VITE_R2_PUBLIC_URL as string | undefined)?.replace(/\/$/, '')
const THUMB_MAX = 480
const THUMB_QUALITY = 0.72
// Versão média (thumbs/md/<chave>.webp): para ver na tela grande (janela do
// post, carrossel, aprovação do cliente). O original segue para o Instagram.
const MEDIUM_MAX = 1080
const MEDIUM_QUALITY = 0.82

/** Chave do arquivo no R2 a partir da URL pública (null se não for do R2). */
export function r2KeyOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const isR2 = (R2_PUBLIC_BASE && url.startsWith(R2_PUBLIC_BASE)) || u.hostname.endsWith('.r2.dev')
    if (!isR2) return null
    const key = decodeURIComponent(u.pathname.replace(/^\//, ''))
    if (!key || key.startsWith('thumbs/')) return null
    return key
  } catch {
    return null
  }
}

/** URL da miniatura (ou null quando o arquivo não está no R2). */
export function thumbUrl(url: string | null | undefined): string | null {
  const key = r2KeyOf(url)
  if (!key) return null
  const base = new URL(url!).origin
  return `${base}/thumbs/${key.split('/').map(encodeURIComponent).join('/')}.webp`
}

/** URL da versão média de 1080 px (ou null quando o arquivo não está no R2). */
export function mediumUrl(url: string | null | undefined): string | null {
  const key = r2KeyOf(url)
  if (!key) return null
  const base = new URL(url!).origin
  return `${base}/thumbs/md/${key.split('/').map(encodeURIComponent).join('/')}.webp`
}

// ── Geração no aparelho de quem envia ───────────────────────────────────────

function canvasToWebp(canvas: HTMLCanvasElement, quality = THUMB_QUALITY): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/webp', quality))
}

function fit(w: number, h: number, max = THUMB_MAX) {
  const scale = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

async function imageThumb(file: File, max = THUMB_MAX, quality = THUMB_QUALITY): Promise<Blob | null> {
  const bmp = await createImageBitmap(file)
  const { w, h } = fit(bmp.width, bmp.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  return canvasToWebp(canvas, quality)
}

async function enviarVariante(key: string, blob: Blob, variant?: 'md') {
  const { data, error } = await supabase.functions.invoke('r2-upload-url', {
    body: { fileName: 'thumb.webp', contentType: 'image/webp', sizeBytes: blob.size, thumbFor: key, ...(variant ? { variant } : {}) },
  })
  if (error || !data?.uploadUrl) return
  await fetch(data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: blob })
}

function videoThumb(file: File): Promise<Blob | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    const done = (b: Blob | null) => { URL.revokeObjectURL(url); resolve(b) }
    const timer = setTimeout(() => done(null), 15_000)
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url
    v.onloadedmetadata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2) }
    v.onseeked = async () => {
      clearTimeout(timer)
      try {
        const { w, h } = fit(v.videoWidth || 480, v.videoHeight || 480)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(v, 0, 0, w, h)
        done(await canvasToWebp(canvas))
      } catch { done(null) }
    }
    v.onerror = () => { clearTimeout(timer); done(null) }
  })
}

/**
 * Gera e envia a miniatura de um arquivo que acabou de ir para o R2.
 * Nunca lança erro: sem miniatura, as telas usam o original.
 */
export async function gerarMiniatura(file: File, publicUrl: string): Promise<void> {
  try {
    const key = r2KeyOf(publicUrl)
    if (!key) return
    const isImg = file.type.startsWith('image/') && !file.type.startsWith('image/svg')
    const isVid = file.type.startsWith('video/')
    if (!isImg && !isVid) return
    const blob = isImg ? await imageThumb(file) : await videoThumb(file)
    if (blob) await enviarVariante(key, blob)
    // Imagem: também a versão média para a tela grande
    if (isImg) {
      const md = await imageThumb(file, MEDIUM_MAX, MEDIUM_QUALITY)
      if (md) await enviarVariante(key, md, 'md')
    }
  } catch { /* miniatura é só otimização */ }
}
