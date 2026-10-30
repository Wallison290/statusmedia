// ── Cópia local das consultas (todas as telas do sistema) ────────────────────
// Ao abrir ou atualizar a página, as telas mostram na hora os últimos dados
// conhecidos e o React Query busca a versão nova por trás (os dados vêm
// "velhos" de propósito: dataUpdatedAt antigo → staleTime vencido → busca).
// Antes, só o CRM fazia isso (localQueryCache); as outras telas esperavam o
// banco e mostravam blocos cinzas piscando.
//
// Fica no IndexedDB do navegador (cabe muito mais que o localStorage), por
// usuário: só é carregada para quem salvou, e some ao sair da conta. O banco
// (RLS) continua sendo quem libera os dados; isto é só para leitura rápida.

import { dehydrate, hydrate, type QueryClient, type Query } from '@tanstack/react-query'

const DB_NAME = 'statusmedia'
const STORE   = 'kv'
const KEY     = 'rq-cache'
const MAX_AGE = 3 * 24 * 60 * 60 * 1000   // 3 dias: mais velho que isso, descarta
const VERSION = 1                          // mudou o formato dos dados? sobe o número

// Consultas que não valem guardar (pesadas, de outra conta ou de vida curta)
const SKIP = new Set(['ig_profile', 'admin', 'storage_usage'])

type Saved = { v: number; userId: string; savedAt: number; state: unknown }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearPersistedQueries() {
  try {
    const db = await openDb()
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY)
  } catch { /* sem IndexedDB (modo privado) */ }
}

function shouldSave(q: Query) {
  if (q.state.status !== 'success' || q.state.data === undefined) return false
  const head = String(q.queryKey[0] ?? '')
  return !SKIP.has(head)
}

/**
 * Liga a cópia local para o usuário logado: carrega o que ele já tinha e passa
 * a salvar (com espera de 1,5 s para juntar várias atualizações numa escrita).
 * Devolve a função que desliga.
 */
export function persistQueries(qc: QueryClient, userId: string): () => void {
  let stopped = false
  let timer: number | undefined

  idbGet<Saved>(KEY).then(saved => {
    if (stopped || !saved) return
    if (saved.v !== VERSION || saved.userId !== userId || Date.now() - saved.savedAt > MAX_AGE) return
    // hydrate não sobrescreve consulta que já tem dado mais novo (veio do banco)
    hydrate(qc, saved.state)
  }).catch(() => { /* sem IndexedDB: segue sem cópia */ })

  const save = () => {
    if (stopped) return
    try {
      const state = dehydrate(qc, { shouldDehydrateQuery: shouldSave })
      idbSet(KEY, { v: VERSION, userId, savedAt: Date.now(), state } satisfies Saved).catch(() => {})
    } catch { /* dado que não serializa: pula esta rodada */ }
  }

  const unsub = qc.getQueryCache().subscribe(event => {
    if (event.type !== 'updated' || event.action.type !== 'success') return
    window.clearTimeout(timer)
    timer = window.setTimeout(save, 1500)
  })

  return () => { stopped = true; window.clearTimeout(timer); unsub() }
}
