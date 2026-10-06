// ── Verificação de limite de armazenamento antes de uploads ───────────────────

import { supabase } from '@/integrations/supabase/client'
import { PLAN_STORAGE_GB } from '@/config/plans'
import { resolveAgencyId } from '@/hooks/useAuth'

/**
 * Verifica se há espaço disponível para um novo arquivo.
 * Busca o uso atual via edge function e compara com o limite do plano.
 *
 * @param fileSizeBytes - tamanho do arquivo que será enviado
 * @returns { allowed: boolean; message?: string }
 */
export async function checkStorageLimit(fileSizeBytes: number): Promise<{ allowed: boolean; message?: string }> {
  try {
    // Buscar uso atual
    const { data: usageData, error: usageErr } = await supabase.functions.invoke('get-storage-usage', {})
    if (usageErr || !usageData) return { allowed: true } // em caso de erro, não bloqueia

    const usedBytes: number = usageData.usedBytes ?? 0

    // Buscar plano atual
    const { data: { user } } = await supabase.auth.getUser()
    const agencyId = user ? await resolveAgencyId(user.id) : null
    if (!user) return { allowed: true }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sub } = await (supabase as any)
      .from('subscriptions')
      .select('plan')
      .eq('user_id', agencyId!)
      .maybeSingle()

    const planId = sub?.plan ?? 'starter'
    const limitGB = PLAN_STORAGE_GB[planId as keyof typeof PLAN_STORAGE_GB] ?? 10
    const limitBytes = limitGB * 1024 * 1024 * 1024

    if (usedBytes + fileSizeBytes > limitBytes) {
      const usedGB = (usedBytes / (1024 * 1024 * 1024)).toFixed(1)
      return {
        allowed: false,
        message: `Armazenamento cheio (${usedGB} GB / ${limitGB} GB). Faça upgrade do plano para liberar mais espaço.`,
      }
    }

    return { allowed: true }
  } catch {
    // Em caso de qualquer erro inesperado, não bloqueia o upload
    return { allowed: true }
  }
}
