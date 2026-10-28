// ── Contrato em blocos ───────────────────────────────────────────────────────
// Lê o texto puro do contrato (o mesmo que é assinado e entra no código
// SHA-256) e o organiza só para exibição: partes, cláusulas numeradas,
// subcláusulas, listas e o fecho com local e data. O texto não muda; se algo
// não se encaixar no padrão, vira parágrafo comum dentro da cláusula.

export type ContractPiece =
  | { kind: 'p'; text: string }
  | { kind: 'sub'; num: string; text: string }        // 2.1. Texto
  | { kind: 'label'; label: string; text: string }    // "Entrada: R$ ..." ou "CRM:" + linha seguinte
  | { kind: 'list'; items: { mark?: string; text: string }[] }

export interface ContractClause { num: string; title: string; pieces: ContractPiece[] }
export interface ContractParty  { role: string; name: string; text: string }

export interface ParsedContract {
  headings: string[]           // linhas de título no topo (CONTRATO DE ...)
  parties:  ContractParty[]    // CONTRATADA / CONTRATANTE
  intro:    ContractPiece[]    // outros parágrafos antes da 1ª cláusula
  clauses:  ContractClause[]
  closing:  string | null      // "Petrolina - PE, 27 de Outubro de 2026."
}

const CLAUSE   = /^(?:CL[ÁA]USULA\s+)?(\d{1,2})(?:ª|º)?\s*[.)–—-]\s*(.+)$/i
const SUB      = /^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\.?\s+(.+)$/
const LETTER   = /^([a-z])\)\s+(.+)$/i
const BULLET   = /^[•\-–]\s+(.+)$/
const PARTY    = /^(CONTRATAD[AO]|CONTRATANTE)\s*:\s*(.+)$/i
const LABEL    = /^([^:]{2,45}):\s*(.*)$/
const DATELINE = /^[^\n]{2,60},\s*\d{1,2}\s+de\s+[A-Za-zçÇ]+\s+de\s+\d{4}\.?$/
const RULE     = /^[_\-=.\s]{6,}$/

const isUpper = (s: string) => /[A-ZÀ-Ý]/.test(s) && s === s.toLocaleUpperCase('pt-BR')

/** Título de cláusula: número + texto em caixa alta e curto ("1. OBJETO DO CONTRATO") */
function clauseHead(line: string) {
  const m = line.match(CLAUSE)
  if (!m || SUB.test(line)) return null
  const title = m[2].trim().replace(/[.:]$/, '')
  return isUpper(title) && title.length <= 80 ? { num: m[1], title } : null
}

function piecesOf(paragraphs: string[][]): ContractPiece[] {
  const out: ContractPiece[] = []
  const pushItem = (item: { mark?: string; text: string }) => {
    const last = out[out.length - 1]
    if (last?.kind === 'list') last.items.push(item)
    else out.push({ kind: 'list', items: [item] })
  }

  for (const lines of paragraphs) {
    // Linhas "a) ..." ou "• ..." dentro do mesmo parágrafo viram uma lista
    if (lines.length > 1 && lines.slice(1).every(l => LETTER.test(l) || BULLET.test(l))) {
      const startsList = LETTER.test(lines[0]) || BULLET.test(lines[0])
      if (!startsList) out.push({ kind: 'p', text: lines[0] })
      for (const l of startsList ? lines : lines.slice(1)) {
        const lm = l.match(LETTER)
        pushItem(lm ? { mark: `${lm[1]})`, text: lm[2] } : { text: l.match(BULLET)![1] })
      }
      continue
    }
    const text = lines.join('\n')
    const first = lines[0]
    const sub = first.match(SUB)
    if (sub) { out.push({ kind: 'sub', num: sub[1], text: [sub[2], ...lines.slice(1)].join('\n') }); continue }

    const letter = lines.length === 1 && first.match(LETTER)
    if (letter) { pushItem({ mark: `${letter[1]})`, text: letter[2] }); continue }
    const bullet = lines.length === 1 && first.match(BULLET)
    if (bullet) { pushItem({ text: bullet[1] }); continue }

    // "CRM:" numa linha e a descrição na seguinte; ou "Entrada: R$ 3.000,00..."
    const lab = first.match(LABEL)
    if (lab && !/^https?$/i.test(lab[1]) && (lab[2] || lines.length > 1) && lab[1].split(' ').length <= 7) {
      out.push({ kind: 'label', label: lab[1].trim(), text: [lab[2], ...lines.slice(1)].filter(Boolean).join('\n') })
      continue
    }

    // Parágrafos curtos terminados em ";" (e o "." que fecha a sequência) são itens
    const prev = out[out.length - 1]
    if (lines.length === 1 && (/;$/.test(first) || (prev?.kind === 'list' && !prev.items[prev.items.length - 1].mark && /;$/.test(prev.items[prev.items.length - 1].text)))
        && first.length <= 260) {
      pushItem({ text: first })
      continue
    }
    out.push({ kind: 'p', text })
  }
  return out
}

export function parseContract(content: string): ParsedContract {
  const raw = content.replace(/\r\n/g, '\n').split('\n').map(l => l.trim())

  // Fecho: a última linha "Cidade, DD de Mês de AAAA." e tudo depois dela
  // (dados das partes e linhas de assinatura, que a página já mostra)
  let closing: string | null = null
  let end = raw.length
  for (let i = raw.length - 1; i >= 0; i--) {
    if (DATELINE.test(raw[i])) { closing = raw[i]; end = i; break }
  }
  // Modelo padrão termina só com a data ("27 de outubro de 2026.")
  if (!closing) {
    const lastIdx = raw.map((l, i) => (l ? i : -1)).filter(i => i >= 0).pop()
    if (lastIdx !== undefined && /^\d{1,2}\s+de\s+\S+\s+de\s+\d{4}\.?$/i.test(raw[lastIdx])) { closing = raw[lastIdx]; end = lastIdx }
  }

  // Parágrafos = blocos separados por linha em branco; título de cláusula sempre abre bloco
  const paras: string[][] = []
  let cur: string[] = []
  for (const l of raw.slice(0, end)) {
    if (!l || RULE.test(l)) { if (cur.length) paras.push(cur); cur = []; continue }
    if (clauseHead(l)) { if (cur.length) paras.push(cur); paras.push([l]); cur = []; continue }
    // Subcláusula (2.1.) e parte (CONTRATANTE:) sempre começam um bloco novo
    if (cur.length && (SUB.test(l) || PARTY.test(l))) { paras.push(cur); cur = [] }
    cur.push(l)
  }
  if (cur.length) paras.push(cur)

  const headings: string[] = []
  const parties: ContractParty[] = []
  const introParas: string[][] = []
  const clauses: ContractClause[] = []
  let clauseParas: string[][] | null = null

  const flush = () => {
    if (clauseParas && clauses.length) clauses[clauses.length - 1].pieces = piecesOf(clauseParas)
  }

  for (const p of paras) {
    const head = p.length === 1 ? clauseHead(p[0]) : null
    if (head) {
      flush()
      clauses.push({ ...head, pieces: [] })
      clauseParas = []
      continue
    }
    if (clauseParas) { clauseParas.push(p); continue }

    // Antes da 1ª cláusula: títulos em caixa alta, partes e introdução
    const party = p[0].match(PARTY)
    if (party) {
      const text = [party[2], ...p.slice(1)].join(' ')
      parties.push({ role: party[1].toUpperCase(), name: text.split(/,|\s+[–—-]\s+/)[0].replace(/\.$/, '').trim(), text })
      continue
    }
    if (!parties.length && !introParas.length && p.every(l => isUpper(l) && l.length <= 120)) {
      headings.push(...p)
      continue
    }
    introParas.push(p)
  }
  flush()

  return { headings, parties, intro: piecesOf(introParas), clauses, closing }
}
