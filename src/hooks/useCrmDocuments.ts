// ── Hook: CRM — propostas e contratos ────────────────────────────────────────
// O total da proposta é recalculado pelo banco a cada gravação; o que a tela
// manda em `total` é ignorado. Documento já respondido (proposta aceita ou
// recusada, contrato assinado) o banco recusa editar: a mensagem de erro dele
// é repassada como está para o toast.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import type { CrmProposal, CrmContract } from '@/types'

// ── Propostas ─────────────────────────────────────────────────────────────────

export function useCrmProposals() {
  const { user } = useAuth()

  return useQuery<CrmProposal[]>({
    queryKey: ['crm_proposals', user?.id],
    enabled:  !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_proposals')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export type CrmProposalInput = Partial<Omit<CrmProposal,
  'id' | 'user_id' | 'total' | 'public_token' | 'created_at' | 'updated_at'>>

export function useSaveCrmProposal() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ id, ...p }: CrmProposalInput & { id?: string }) => {
      const q = id
        ? (supabase as any).from('crm_proposals').update(p).eq('id', id)
        : (supabase as any).from('crm_proposals').insert({ ...p, user_id: user!.id })
      const { data, error } = await q.select().single()
      if (error) throw error
      return data as CrmProposal
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['crm_proposals'] })
      if (p.lead_id) qc.invalidateQueries({ queryKey: ['crm_activities', p.lead_id] })
    },
  })
}

export function useDeleteCrmProposal() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('crm_proposals').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm_proposals'] }),
  })
}

// ── Contratos ─────────────────────────────────────────────────────────────────

export function useCrmContracts() {
  const { user } = useAuth()

  return useQuery<CrmContract[]>({
    queryKey: ['crm_contracts', user?.id],
    enabled:  !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_contracts')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export type CrmContractInput = Partial<Omit<CrmContract,
  'id' | 'user_id' | 'public_token' | 'created_at' | 'updated_at'>>

export function useSaveCrmContract() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ id, ...c }: CrmContractInput & { id?: string }) => {
      const q = id
        ? (supabase as any).from('crm_contracts').update(c).eq('id', id)
        : (supabase as any).from('crm_contracts').insert({ ...c, user_id: user!.id })
      const { data, error } = await q.select().single()
      if (error) throw error
      return data as CrmContract
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['crm_contracts'] })
      if (c.lead_id) qc.invalidateQueries({ queryKey: ['crm_activities', c.lead_id] })
    },
  })
}

export function useDeleteCrmContract() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('crm_contracts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm_contracts'] }),
  })
}

// ── Páginas públicas (sem login) ──────────────────────────────────────────────

export interface PublicAgency { name: string; logo: string | null }

export interface PublicProposal {
  title:          string
  intro:          string | null
  items:          CrmProposal['items']
  discount:       number
  total:          number
  valid_until:    string | null
  payment_terms:  string | null
  status:         CrmProposal['status']
  expired:        boolean
  sent_at:        string | null
  responded_at:   string | null
  responder_name: string | null
  content_hash:   string | null
  lead:           { name: string; company: string | null } | null
  agency:         PublicAgency
}

export async function fetchPublicProposal(token: string): Promise<PublicProposal | null> {
  const { data, error } = await (supabase as any).rpc('get_crm_proposal', { p_token: token })
  if (error) throw error
  return data
}

export async function respondPublicProposal(token: string, accept: boolean, name: string, reason?: string) {
  const { data, error } = await (supabase as any).rpc('respond_crm_proposal', {
    p_token: token, p_accept: accept, p_name: name, p_reason: reason ?? null,
  })
  if (error) throw error
  return data as { ok: boolean; error?: string; status?: string }
}

export interface PublicContract {
  title:              string
  content:            string
  status:             CrmContract['status']
  sent_at:            string | null
  agency_signer_name: string | null
  agency_signature:   string | null
  agency_signed_at:   string | null
  signer_name:        string | null
  signer_document:    string | null
  signature:          string | null
  signed_at:          string | null
  content_hash:       string | null
  sign_ip:            string | null
  agency:             PublicAgency
}

export async function fetchPublicContract(token: string): Promise<PublicContract | null> {
  const { data, error } = await (supabase as any).rpc('get_crm_contract', { p_token: token })
  if (error) throw error
  return data
}

export async function signPublicContract(
  token: string, f: { name: string; document: string; email: string; signature: string },
) {
  const { data, error } = await (supabase as any).rpc('sign_crm_contract', {
    p_token: token, p_name: f.name, p_document: f.document, p_email: f.email, p_signature: f.signature,
  })
  if (error) throw error
  return data as { ok: boolean; error?: string }
}

export interface PublicCaptureForm {
  title:       string
  description: string | null
  thanks:      string
  agency:      PublicAgency
}

export async function fetchCaptureForm(token: string): Promise<PublicCaptureForm | null> {
  const { data, error } = await (supabase as any).rpc('get_crm_capture_form', { p_token: token })
  if (error) throw error
  return data
}

export async function submitCaptureForm(token: string, f: {
  name: string; whatsapp: string; email?: string; company?: string; instagram?: string
  message?: string; source?: string; website?: string
}) {
  const { data, error } = await (supabase as any).rpc('submit_crm_capture', {
    p_token:     token,
    p_name:      f.name,
    p_whatsapp:  f.whatsapp,
    p_email:     f.email || null,
    p_company:   f.company || null,
    p_instagram: f.instagram || null,
    p_message:   f.message || null,
    p_source:    f.source || null,
    p_website:   f.website || null,
  })
  if (error) throw error
  return data as { ok: boolean; error?: string }
}
