// Miniaturas dos arquivos antigos do R2 (ver src/lib/thumbs.ts).
// Roda fora do notebook (VPS), num container descartável:
//   docker run --rm -v $PWD:/work -w /work -e THUMB_SECRET=... -e FN_URL=... node:22 \
//     sh -c "apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null && npm i --silent sharp && node backfill.mjs"
// Entrada: list.json = [{ url, kind: 'image' | 'video' }]
// Para cada arquivo: baixa, reduz para WebP de até 480 px (vídeo: quadro em
// 0,5 s via ffmpeg) e envia para a edge function thumb-store.

import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'

const run = promisify(execFile)
const FN_URL = process.env.FN_URL
const SECRET = process.env.THUMB_SECRET
const list = JSON.parse(fs.readFileSync('list.json', 'utf8'))
const CONCURRENCY = 3

const keyOf = url => decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))

async function thumbFor(item, i) {
  const key = keyOf(item.url)
  // Já existe? (segunda rodada não refaz)
  const head = await fetch(`${new URL(item.url).origin}/thumbs/${key.split('/').map(encodeURIComponent).join('/')}.webp`, { method: 'HEAD' })
  if (head.ok) return 'existe'

  const res = await fetch(item.url)
  if (!res.ok) return `baixar ${res.status}`
  const buf = Buffer.from(await res.arrayBuffer())

  let input = buf
  if (item.kind === 'video') {
    const src = `/tmp/v${i}`, frame = `/tmp/f${i}.png`
    fs.writeFileSync(src, buf)
    try {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.5', '-i', src, '-frames:v', '1', frame])
      input = fs.readFileSync(frame)
    } finally {
      fs.rmSync(src, { force: true }); fs.rmSync(frame, { force: true })
    }
  }

  const webp = await sharp(input, { failOn: 'none' }).rotate()
    .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72 }).toBuffer()

  const up = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-thumb-secret': SECRET },
    body: JSON.stringify({ key, data: webp.toString('base64') }),
  })
  return up.ok ? `ok ${(buf.length / 1048576).toFixed(1)}MB→${Math.round(webp.length / 1024)}KB` : `enviar ${up.status} ${await up.text()}`
}

let next = 0, ok = 0, fail = 0
async function worker() {
  while (next < list.length) {
    const i = next++
    try {
      const r = await thumbFor(list[i], i)
      if (r.startsWith('ok') || r === 'existe') ok++; else fail++
      console.log(`${i + 1}/${list.length} ${r}`)
    } catch (e) {
      fail++
      console.log(`${i + 1}/${list.length} erro ${e.message}`)
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
console.log(`FIM ok=${ok} falhas=${fail}`)
