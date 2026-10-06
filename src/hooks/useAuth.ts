import { useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import type { Profile } from '@/types'

// ── Agência de quem está logado ──────────────────────────────────────────────
// Todo dado da agência pertence ao user_id do dono. Um sócio (aba Equipe →
// Sócios, migration 088) tem login próprio mas opera os dados do dono, então
// tudo que for "de qual agência é isso" — filtros, inserts, pastas de upload —
// usa agencyId, nunca user.id. user.id fica só para o que é da pessoa (o
// próprio perfil e avatar). Cache por usuário: useAuth roda em muitas telas.
const agencyCache = new Map<string, Promise<string>>()

export function resolveAgencyId(userId: string): Promise<string> {
  let p = agencyCache.get(userId)
  if (!p) {
    p = (async () => {
      const { data, error } = await (supabase as any).rpc('current_agency_id')
      if (error) {
        agencyCache.delete(userId)
        return userId
      }
      return (data as string | null) ?? userId
    })()
    agencyCache.set(userId, p)
  }
  return p
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [agencyId, setAgencyId] = useState<string | null>(null)
  // Perfil da agência (do dono): nome da agência, WhatsApp de avisos etc.
  const [agencyProfile, setAgencyProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    // user e agencyId chegam juntos: nenhuma tela chega a ver um user sem a
    // agência resolvida (o que faria filtros rodarem com user_id indefinido).
    async function load(session: Session | null) {
      if (!session?.user) {
        if (!alive) return
        setSession(null)
        setUser(null)
        setProfile(null)
        setAgencyId(null)
        setAgencyProfile(null)
        setLoading(false)
        return
      }
      const [agency, { data }] = await Promise.all([
        resolveAgencyId(session.user.id),
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
      ])
      const own = data as Profile | null
      const owner = agency === session.user.id
        ? own
        : (await supabase.from('profiles').select('*').eq('id', agency).single()).data as Profile | null
      if (!alive) return
      setSession(session)
      setUser(session.user)
      setAgencyId(agency)
      setProfile(own)
      setAgencyProfile(owner ?? own)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session } }) => load(session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') agencyCache.clear()
      load(session)
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data as Profile | null)
    if (!agencyId || agencyId === userId) setAgencyProfile(data as Profile | null)
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email: string, password: string, fullName: string) {
    // Devolve `data` junto: quando a confirmação de email está ligada no
    // Supabase, `data.session` volta null — é assim que a tela de cadastro
    // sabe se deve mandar o usuário para a caixa de entrada ou direto para o app.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error }
  }

  async function refreshProfile() {
    if (!user) return
    await fetchProfile(user.id)
    if (agencyId && agencyId !== user.id) {
      const { data } = await supabase.from('profiles').select('*').eq('id', agencyId).single()
      setAgencyProfile(data as Profile | null)
    }
  }

  const isPartner = !!user && !!agencyId && agencyId !== user.id

  return { user, session, profile, agencyProfile, agencyId, isPartner, loading, signIn, signUp, signOut, resetPassword, refreshProfile }
}
