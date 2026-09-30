import { supabase } from '@/integrations/supabase/client'

/**
 * Envia um arquivo e devolve a URL pública dele.
 *
 * Decide sozinho para onde vai:
 *   • imagem, vídeo, áudio e documentos → Cloudflare R2
 *   • o que o R2 não aceita (SVG, tipo desconhecido) → Supabase Storage
 *
 * Por que o R2 para quase tudo: o plano gratuito do Supabase dá só 1 GB de
 * arquivos e 5 GB de tráfego por mês, e as imagens do planejamento sozinhas
 * estouraram esse 1 GB. O R2 dá 10 GB e não cobra tráfego de saída. As URLs do R2 são públicas, então o agendamento do
 * Instagram continua funcionando — a Meta busca o arquivo pela URL.
 */

/** Acima disto o Supabase gratuito recusa. Deixo margem de segurança. */
const LIMITE_SUPABASE = 40 * 1024 * 1024

export type ResultadoUpload = {
  url: string
  destino: 'r2' | 'supabase'
}

// Mesma lista da Edge Function r2-upload-url: as duas precisam bater
const TIPOS_R2 = /^(video|image|audio)\/|^application\/(pdf|zip|x-zip-compressed|msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-|vnd\.oasis\.opendocument\.)|^text\/(plain|csv)$/

export function precisaDoR2(file: File): boolean {
  if (file.type.startsWith('image/svg')) return false
  return TIPOS_R2.test(file.type) || file.size > LIMITE_SUPABASE
}

/**
 * O arquivo já está numa URL pública do R2?
 *
 * Serve para não copiar de novo o que a Meta já consegue baixar. Sem isto, a
 * publicação no Instagram baixaria o vídeo inteiro no navegador só para
 * reenviá-lo — o que, além de lento, estoura o limite do Supabase.
 *
 * Usa a variável quando existe e cai no domínio padrão do R2 quando não —
 * assim funciona sem configuração e continua funcionando com domínio próprio.
 */
const R2_PUBLIC_BASE = import.meta.env.VITE_R2_PUBLIC_URL as string | undefined

export function jaPublicoNoR2(url: string): boolean {
  if (!url) return false
  if (R2_PUBLIC_BASE && url.startsWith(R2_PUBLIC_BASE)) return true
  try {
    return new URL(url).hostname.endsWith('.r2.dev')
  } catch {
    return false
  }
}

const TENTATIVAS_R2 = 3

class FalhaDeRede extends Error {
  constructor() { super('Falha de rede ao enviar o arquivo.') }
}

/** Envia direto ao R2 usando uma URL assinada gerada pela Edge Function. */
async function enviarParaR2(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const { data, error } = await supabase.functions.invoke('r2-upload-url', {
    body: { fileName: file.name, contentType: file.type, sizeBytes: file.size },
  })
  if (error) throw new Error('Não foi possível preparar o envio do vídeo.')
  if (data?.error) throw new Error(data.error)

  const { uploadUrl, publicUrl } = data as { uploadUrl: string; publicUrl: string }

  // XMLHttpRequest em vez de fetch: é o único jeito de ter barra de progresso
  // em upload, e arquivo grande sem progresso parece travado.
  const put = () => new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl, true)
    xhr.setRequestHeader('Content-Type', file.type)

    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Falha no envio (${xhr.status}).`))
    xhr.onerror = () => reject(new FalhaDeRede())
    xhr.send(file)
  })

  // Queda de conexão no meio do envio (Wi-Fi oscilando, 4G) deixava o post
  // salvo sem a imagem. Tenta de novo sozinho antes de desistir; a URL
  // assinada vale 1 hora, então serve para as novas tentativas.
  for (let tentativa = 1; ; tentativa++) {
    try {
      await put()
      break
    } catch (err) {
      if (!(err instanceof FalhaDeRede) || tentativa >= TENTATIVAS_R2) {
        throw err instanceof FalhaDeRede
          ? new Error(`Falha de rede ao enviar o arquivo (${TENTATIVAS_R2} tentativas). Confira a internet e anexe de novo.`)
          : err
      }
      onProgress?.(0)
      await new Promise(r => setTimeout(r, 1500 * tentativa))
    }
  }

  return publicUrl
}

/**
 * Ponto único de upload do sistema.
 *
 * @param bucket  bucket do Supabase usado quando o arquivo NÃO vai para o R2
 * @param path    caminho dentro desse bucket
 */
export async function uploadArquivo(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ResultadoUpload> {
  if (precisaDoR2(file)) {
    const url = await enviarParaR2(file, onProgress)
    return { url, destino: 'r2' }
  }

  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false })
  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  onProgress?.(100)
  return { url: data.publicUrl, destino: 'supabase' }
}
