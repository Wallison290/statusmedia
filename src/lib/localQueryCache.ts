// ── Cópia local de consultas que abrem telas ─────────────────────────────────
// Abrir o CRM esperava, uma atrás da outra: login → conta → assinatura → tela
// → colunas e leads. Guardando a última resposta no navegador, a tela aparece
// na hora com o que já se sabia e o React Query busca a versão nova por trás
// (initialDataUpdatedAt: 0 = sempre velha, então sempre busca ao abrir).
//
// Só para leitura rápida: o banco (RLS) continua sendo quem libera os dados, e
// a cópia some ao sair da conta.

const PREFIX = 'sm_qc:'

export function readLocalCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

export function writeLocalCache(key: string, data: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(data)) } catch { /* sem espaço ou sem storage */ }
}

export function clearLocalCache() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k))
  } catch { /* sem storage */ }
}

/** Opções para um useQuery começar pela cópia local e sempre atualizar ao abrir. */
export function localCacheOptions<T>(key: string | null) {
  return {
    initialData: () => (key ? readLocalCache<T>(key) : undefined),
    initialDataUpdatedAt: 0,
  }
}
