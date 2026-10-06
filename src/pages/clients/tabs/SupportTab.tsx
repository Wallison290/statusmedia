import { useState } from 'react'
import {
  Plus, Trash2, Pencil, Save, Phone, Mail,
  MessageCircle, User, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/toast'
import {
  useClientSupportContacts,
  useAddSupportContact,
  useUpdateSupportContact,
  useDeleteSupportContact,
} from '@/hooks/useClientSupport'
import type { ClientSupportContact, ContactType } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email',    label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'outro',    label: 'Outro' },
]

function ContactIcon({ type }: { type: ContactType }) {
  switch (type) {
    case 'whatsapp': return <MessageCircle className="w-3.5 h-3.5 text-green-400" />
    case 'email':    return <Mail          className="w-3.5 h-3.5 text-blue-400" />
    case 'telefone': return <Phone         className="w-3.5 h-3.5 text-zinc-400" />
    default:         return <User          className="w-3.5 h-3.5 text-zinc-500" />
  }
}

function autoLink(type: ContactType, value: string): string {
  const clean = value.trim()
  switch (type) {
    case 'whatsapp': return `https://wa.me/${clean.replace(/\D/g, '')}`
    case 'email':    return `mailto:${clean}`
    case 'telefone': return `tel:${clean.replace(/\s/g, '')}`
    default:         return clean.startsWith('http') ? clean : `https://${clean}`
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SupportTab({ clientId }: { clientId: string }) {
  const { user, agencyId } = useAuth()
  const { data: contacts = [] } = useClientSupportContacts(clientId)
  const addContact    = useAddSupportContact()
  const updateContact = useUpdateSupportContact()
  const deleteContact = useDeleteSupportContact()
  const { toast } = useToast()

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<ClientSupportContact | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const blank = {
    name: '', role: '', contact_type: 'whatsapp' as ContactType,
    contact_value: '', direct_link: '',
  }
  const [form, setForm] = useState(blank)

  const resetForm = () => { setForm(blank); setEditing(null) }

  const openCreate = () => { resetForm(); setModalOpen(true) }

  const openEdit = (c: ClientSupportContact) => {
    setEditing(c)
    setForm({
      name:          c.name,
      role:          c.role || '',
      contact_type:  c.contact_type,
      contact_value: c.contact_value,
      direct_link:   c.direct_link || '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.contact_value.trim() || !user) return
    try {
      const link = form.direct_link.trim() || autoLink(form.contact_type, form.contact_value)

      const payload = {
        name:          form.name.trim(),
        role:          form.role.trim() || null,
        contact_type:  form.contact_type,
        contact_value: form.contact_value.trim(),
        direct_link:   link,
      }

      if (editing) {
        await updateContact.mutateAsync({ id: editing.id, clientId, ...payload })
        toast('Contato atualizado!', 'success')
      } else {
        await addContact.mutateAsync({ user_id: agencyId!, client_id: clientId, ...payload })
        toast('Contato adicionado!', 'success')
      }

      setModalOpen(false)
      resetForm()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleDelete = async (c: ClientSupportContact) => {
    try {
      await deleteContact.mutateAsync({ id: c.id, clientId })
      toast('Contato removido.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setConfirmingId(null)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[13px] font-medium text-zinc-200">Contatos de suporte</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {contacts.length} {contacts.length === 1 ? 'contato' : 'contatos'} — visíveis no portal
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-3 h-3" /> Adicionar contato
        </Button>
      </div>

      {/* Lista */}
      {contacts.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-white/[0.06] rounded-lg">
          <User className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
          <p className="text-[12px] text-zinc-600">Nenhum contato de suporte ainda.</p>
          <p className="text-[11px] text-zinc-700 mt-0.5">
            Adicione WhatsApp, e-mail ou telefone para o cliente entrar em contato.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {contacts.map(c => {
            const link = c.direct_link || autoLink(c.contact_type, c.contact_value)
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-white/[0.06] bg-white/[0.02] group"
              >
                {/* Ícone */}
                <div className="w-8 h-8 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <ContactIcon type={c.contact_type} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-zinc-200 truncate">{c.name}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {c.role ? `${c.role} · ` : ''}
                    {CONTACT_TYPES.find(t => t.value === c.contact_type)?.label}
                    {' · '}{c.contact_value}
                  </p>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => openEdit(c)}
                    className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  {confirmingId === c.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-1"
                      >
                        Não
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-1"
                      >
                        Sim
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(c.id)}
                      className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal criar / editar */}
      <Dialog open={modalOpen} onOpenChange={v => { setModalOpen(v); if (!v) resetForm() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar contato' : 'Adicionar contato'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-1">
            <Input
              label="Nome *"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ex: Ana — Atendimento"
            />

            <Input
              label="Cargo / função (opcional)"
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              placeholder="Ex: Gestora de Conteúdo"
            />

            <div>
              <label className="block text-[12px] text-zinc-500 mb-1.5">Tipo de contato</label>
              <Select
                value={form.contact_type}
                onValueChange={v => setForm(p => ({ ...p, contact_type: v as ContactType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              label="Valor do contato *"
              value={form.contact_value}
              onChange={e => setForm(p => ({ ...p, contact_value: e.target.value }))}
              placeholder={
                form.contact_type === 'whatsapp' ? '+55 11 99999-9999' :
                form.contact_type === 'email'    ? 'contato@statusmedia.com.br' :
                form.contact_type === 'telefone' ? '+55 11 3333-3333' :
                'Valor...'
              }
            />

            <Input
              label="Link direto (opcional — gerado automaticamente se vazio)"
              value={form.direct_link}
              onChange={e => setForm(p => ({ ...p, direct_link: e.target.value }))}
              placeholder="https://wa.me/55..."
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setModalOpen(false); resetForm() }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!form.name.trim() || !form.contact_value.trim()}
            >
              {editing ? (
                <><Save className="w-3 h-3" /> Salvar</>
              ) : (
                <><Plus className="w-3 h-3" /> Adicionar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
