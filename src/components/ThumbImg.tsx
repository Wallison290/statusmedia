// Imagem leve: tenta a miniatura do R2 (até 480 px, ver lib/thumbs.ts) e, se
// ela ainda não existir, cai para o arquivo original. Para vídeo, `videoSrc`
// mostra a miniatura do primeiro quadro e, sem ela, o <video> como antes.

import { useState } from 'react'
import { Play } from 'lucide-react'
import { thumbUrl } from '@/lib/thumbs'

export function ThumbImg({ src, alt = '', className = '', draggable = false }: {
  src: string; alt?: string; className?: string; draggable?: boolean
}) {
  const thumb = thumbUrl(src)
  const [useOriginal, setUseOriginal] = useState(!thumb)
  return (
    <img
      src={useOriginal ? src : thumb!}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={draggable}
      className={className}
      onError={() => { if (!useOriginal) setUseOriginal(true) }}
    />
  )
}

/** Capa de vídeo: miniatura WebP do primeiro quadro; sem ela, o próprio vídeo. */
export function VideoCover({ src, title, small = false, className = '' }: {
  src: string; title?: string; small?: boolean; className?: string
}) {
  const thumb = thumbUrl(src)
  const [stage, setStage] = useState<'thumb' | 'video' | 'failed'>(thumb ? 'thumb' : 'video')
  const play = (
    <span className={`absolute ${small ? 'top-0.5 right-0.5' : 'top-1.5 right-1.5'} text-white drop-shadow pointer-events-none`}>
      <Play className={small ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} fill="currentColor" />
    </span>
  )
  if (stage === 'failed') {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-center ${small ? 'p-1' : 'p-2'}`}>
        <Play className={small ? 'w-3 h-3' : 'w-4 h-4'} style={{ color: 'var(--sm-text-3)' }} />
        {!small && title && <span className="mt-1 text-[10.5px] leading-tight line-clamp-3" style={{ color: 'var(--sm-text-3)' }}>{title}</span>}
      </div>
    )
  }
  return (
    <span className="relative block w-full h-full">
      {stage === 'thumb'
        ? <img src={thumb!} alt={title ?? ''} loading="lazy" decoding="async" draggable={false}
            className={`w-full h-full object-cover ${className}`} onError={() => setStage('video')} />
        : <video src={`${src}#t=0.5`} muted playsInline preload="metadata" onError={() => setStage('failed')}
            className={`w-full h-full object-cover pointer-events-none ${className}`} />}
      {play}
    </span>
  )
}
