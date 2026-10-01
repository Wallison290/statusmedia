// ── Esconder valores do CRM ──────────────────────────────────────────────────
// O "olho" do cabeçalho do CRM troca os valores em reais por "R$ ****" em todas
// as telas, para mostrar o funil em reunião ou compartilhando a tela. Fica
// lembrado neste navegador. Campos de edição e o que vai para a IA continuam
// com o valor real: só a exibição muda.

import { useSyncExternalStore } from 'react'
import { fmtBRL } from '@/utils/crm'

const KEY = 'sm_crm_hide_values'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

let hidden = read()

export function setHideValues(v: boolean) {
  hidden = v
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* modo privado: vale só nesta visita */ }
  listeners.forEach(l => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useHideValues(): boolean {
  return useSyncExternalStore(subscribe, () => hidden, () => false)
}

export const HIDDEN_MONEY = 'R$ ****'

/** fmtBRL que respeita o "olho": use em tudo que só MOSTRA valor. */
export function useMoney() {
  const hide = useHideValues()
  return (n: number, cents = false) => (hide ? HIDDEN_MONEY : fmtBRL(n, cents))
}
