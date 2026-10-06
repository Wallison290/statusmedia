// ── Pix Copia e Cola (BR Code estático) ──────────────────────────────────────
// Padrão EMV do Banco Central. Não usa API de banco: é só um texto montado a
// partir da chave Pix da agência, com valor e identificador. O cliente cola
// no app do banco e paga o valor exato. O dinheiro cai na conta dona da chave.

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'

function field(id: string, value: string) {
  return id + String(value.length).padStart(2, '0') + value
}

/** CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF), como pede o BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Texto sem acento e só com caracteres aceitos pelos apps dos bancos. */
function clean(s: string, max: number) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .\-]/g, '').trim().toUpperCase().slice(0, max)
}

/** Chave no formato que o Pix espera. */
export function formatPixKey(key: string, type: PixKeyType): string {
  const k = key.trim()
  switch (type) {
    case 'cpf':
    case 'cnpj':
      return k.replace(/\D/g, '')
    case 'telefone': {
      const d = k.replace(/\D/g, '')
      return '+' + (d.startsWith('55') && d.length >= 12 ? d : '55' + d)
    }
    case 'email':
      return k.toLowerCase()
    default:
      return k
  }
}

export function buildPixPayload(opts: {
  key: string; keyType: PixKeyType; name: string; city: string
  amount?: number; txid?: string; description?: string
}): string {
  const key = formatPixKey(opts.key, opts.keyType)
  let mai = field('00', 'br.gov.bcb.pix') + field('01', key)
  const desc = opts.description ? clean(opts.description, 40) : ''
  // O campo 26 inteiro cabe em 99 caracteres
  if (desc && mai.length + 4 + desc.length <= 99) mai += field('02', desc)

  const txid = (opts.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  let payload =
    field('00', '01') +
    field('26', mai) +
    field('52', '0000') +
    field('53', '986') +
    (opts.amount && opts.amount > 0 ? field('54', opts.amount.toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', clean(opts.name, 25) || 'RECEBEDOR') +
    field('60', clean(opts.city, 15) || 'BRASIL') +
    field('62', field('05', txid))
  payload += '6304'
  return payload + crc16(payload)
}
