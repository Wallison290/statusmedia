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

/** Registra uma falha de upload (ver migration 086). Nunca atrapalha o envio. */
async function registrarFalha(file: File, info: { stage: string; message: string; http_status?: number | null; attempt?: number; recovered?: boolean }) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await (supabase as any).from('upload_errors').insert({
      user_id: user.id,
      stage: info.stage,
      message: info.message.slice(0, 500),
      http_status: info.http_status ?? null,
      attempt: info.attempt ?? null,
      file_name: file.name.slice(0, 200),
      file_type: file.type || null,
      file_size: file.size,
      online: typeof navigator !== 'undefined' ? navigator.onLine : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      page: typeof location !== 'undefined' ? location.origin + location.pathname : null,
      recovered: info.recovered ?? false,
    })
  } catch { /* registro é só diagnóstico */ }
}

/** Pede ao servidor a URL assinada do R2 (uma nova a cada tentativa). */
async function prepararR2(file: File) {
  const { data, error } = await supabase.functions.invoke('r2-upload-url', {
    body: { fileName: file.name, contentType: file.type, sizeBytes: file.size },
  })
  if (error) {
    // A função devolve { error } com status de erro: pega o motivo real
    const ctx = (error as any).context
    const status: number | null = ctx?.status ?? null
    const detail = await ctx?.json?.().then((j: any) => j?.error).catch(() => null)
    throw Object.assign(new Error(detail ?? error.message ?? 'Não foi possível preparar o envio.'), { stage: 'preparar', status })
  }
  if (data?.error) throw Object.assign(new Error(data.error), { stage: 'preparar', status: null })
  return data as { uploadUrl: string; publicUrl: string }
}

/** PUT direto no R2 com barra de progresso e tempo máximo (rede parada não trava a tela). */
function enviarPut(url: string, file: File, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', file.type)
    // 1 minuto + 1 segundo a cada 200 KB: 6 MB têm ~90 s, 500 MB ~45 min
    xhr.timeout = 60_000 + Math.ceil(file.size / 200_000) * 1000

    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(Object.assign(new Error(`Cloudflare recusou o envio (${xhr.status}).`), { stage: 'enviar', status: xhr.status }))
    xhr.onerror   = () => reject(Object.assign(new FalhaDeRede(), { stage: 'enviar', status: 0 }))
    xhr.ontimeout = () => reject(Object.assign(new Error('O envio demorou demais e foi interrompido.'), { stage: 'enviar', status: 0 }))
    xhr.send(file)
  })
}

/**
 * Envia ao R2. Cada tentativa pede uma URL nova (se a anterior foi recusada,
 * a próxima não repete o mesmo erro) e espera um pouco mais que a anterior.
 */
async function enviarParaR2(file: File, onProgress?: (pct: number) => void): Promise<string> {
  let ultimo: any = null
  for (let tentativa = 1; tentativa <= TENTATIVAS_R2; tentativa++) {
    try {
      const { uploadUrl, publicUrl } = await prepararR2(file)
      await enviarPut(uploadUrl, file, onProgress)
      return publicUrl
    } catch (err: any) {
      ultimo = err
      await registrarFalha(file, { stage: err?.stage ?? 'enviar', message: err?.message ?? String(err), http_status: err?.status ?? null, attempt: tentativa })
      onProgress?.(0)
      if (tentativa < TENTATIVAS_R2) await new Promise(r => setTimeout(r, 1500 * tentativa))
    }
  }
  throw ultimo ?? new Error('Falha ao enviar o arquivo.')
}

async function enviarParaSupabase(bucket: string, path: string, file: File, onProgress?: (pct: number) => void) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  onProgress?.(100)
  return data.publicUrl
}

/**
 * Ponto único de upload do sistema.
 *
 * @param bucket  bucket do Supabase usado quando o arquivo NÃO vai para o R2
 *                (e como reserva quando o R2 falha)
 * @param path    caminho dentro desse bucket
 */
export async function uploadArquivo(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ResultadoUpload> {
  if (precisaDoR2(file)) {
    try {
      const url = await enviarParaR2(file, onProgress)
      return { url, destino: 'r2' }
    } catch (err: any) {
      // Reserva: o R2 falhou em todas as tentativas. Arquivo que cabe no
      // Supabase vai por lá, para o post não ficar sem a mídia.
      if (file.size > LIMITE_SUPABASE) {
        throw new Error(`${err?.message ?? 'Falha ao enviar.'} Confira a internet e anexe de novo.`)
      }
      try {
        const url = await enviarParaSupabase(bucket, path, file, onProgress)
        await registrarFalha(file, { stage: 'enviar', message: `R2 falhou (${err?.message ?? ''}); salvo pela reserva no Supabase`, recovered: true })
        return { url, destino: 'supabase' }
      } catch (err2: any) {
        await registrarFalha(file, { stage: 'supabase', message: err2?.message ?? String(err2) })
        throw new Error(`${err?.message ?? 'Falha ao enviar.'} A reserva também falhou: ${err2?.message ?? ''}`)
      }
    }
  }

  try {
    return { url: await enviarParaSupabase(bucket, path, file, onProgress), destino: 'supabase' }
  } catch (err: any) {
    await registrarFalha(file, { stage: 'supabase', message: err?.message ?? String(err) })
    throw err
  }
}
