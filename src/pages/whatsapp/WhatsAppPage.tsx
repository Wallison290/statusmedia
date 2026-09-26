// ── Página: WhatsApp ───────────────────────────────────────────────────────────

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MessageCircle, Users, CheckCircle2, Loader2,
  Plus, Trash2, ChevronDown, ChevronUp, X, Phone,
  AlertCircle,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { CrmWhatsappConnect } from '@/components/crm/CrmWhatsappConnect'
import { useWhatsappSettings, WHATSAPP_CATEGORIES } from '@/hooks/useWhatsappSettings'
import {
  useWhatsappGroups,
  useAddWhatsappGroup,
  useUpdateWhatsappGroup,
  useDeleteWhatsappGroup,
  useResolveGroupInvite,
  type WhatsappGroup,
  type EvolutionGroup,
} from '@/hooks/useWhatsappGroups'
import { useClients } from '@/hooks/useClients'
import type { WhatsappPrefs } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Se group_name for o JID em si (entrada antiga sem nome), formata como "Grupo #XXXXX" */
function groupDisplayName(name: string): string {
  if (name.endsWith('@g.us')) {
    const numeric = name.replace('@g.us', '')
    return `Grupo #${numeric.slice(-5)}`
  }
  return name
}

const DEFAULT_CATS: WhatsappPrefs = {
  // CRM desligado por padrão nos grupos: um grupo pode ter cliente dentro, e
  // o aviso do CRM traz nome de lead e valor de proposta.
  aprovacoes: true, tarefas: true, instagram: true, solicitacoes: true, crm: false,
}

// ── Category toggles (reutilizável) ──────────────────────────────────────────

function CategoryToggles({
  value,
  onChange,
  disabled,
}: {
  value: WhatsappPrefs
  onChange: (k: keyof WhatsappPrefs, v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      {WHATSAPP_CATEGORIES.map(cat => (
        <label
          key={cat.key}
          className={`flex items-center justify-between gap-3 cursor-pointer rounded-xl px-3 py-2.5 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#1F2937]/40'}`}
          style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}
        >
          <div>
            <p className="text-[13px] font-medium" style={{ color: 'var(--sm-text-1)' }}>{cat.label}</p>
            <p className="text-[11px]" style={{ color: 'var(--sm-text-2)' }}>{cat.hint}</p>
          </div>
          <div
            onClick={() => !disabled && onChange(cat.key, !value[cat.key])}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${value[cat.key] ? 'bg-[#22C55E]' : 'bg-[#374151]'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value[cat.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </label>
      ))}
    </div>
  )
}

// ── Modal: adicionar grupo ────────────────────────────────────────────────────
// Tenta resolver link de convite; se a API não suportar, cai no modo lista.

function AddGroupModal({ onClose }: { onClose: () => void }) {
  const { toast }      = useToast()
  const resolveInvite  = useResolveGroupInvite()
  const addGroup       = useAddWhatsappGroup()

  type Mode = 'link' | 'config'
  const [mode, setMode]         = useState<Mode>('link')
  const [link, setLink]         = useState('')
  const [selected, setSelected] = useState<EvolutionGroup | null>(null)
  const [cats, setCats]         = useState<WhatsappPrefs>(DEFAULT_CATS)

  async function handleResolveLink() {
    try {
      const group = await resolveInvite.mutateAsync(link.trim())
      setSelected(group)
      setMode('config')
    } catch (err: any) {
      const msg: string = err?.message ?? ''
      toast(msg || 'Link inválido ou grupo não encontrado. Verifique o link e tente novamente.', 'error')
    }
  }

  async function handleSave() {
    if (!selected) return
    try {
      await addGroup.mutateAsync({ group_jid: selected.jid, group_name: selected.name, categories: cats })
      toast(`Grupo "${selected.name}" adicionado!`, 'success')
      onClose()
    } catch (err: any) {
      toast(err?.message ?? 'Erro ao salvar grupo', 'error')
    }
  }

  const busy = resolveInvite.isPending
  const title = mode === 'config' ? 'Configurar notificações' : 'Adicionar grupo'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--sm-bg-card)', border: '1px solid var(--sm-border)', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--sm-border)' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#22C55E20' }}>
              <Users className="w-4 h-4 text-[#22C55E]" />
            </div>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#1F2937] transition-colors">
            <X className="w-4 h-4" style={{ color: 'var(--sm-text-2)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Modo link ── */}
          {mode === 'link' && (
            <>
              <div className="rounded-xl p-3 space-y-1" style={{ background: '#25D36610', border: '1px solid #25D36630' }}>
                <p className="text-[13px] font-medium" style={{ color: 'var(--sm-text-1)' }}>Como adicionar um grupo:</p>
                <ol className="text-[12px] space-y-1 list-decimal list-inside" style={{ color: 'var(--sm-text-2)' }}>
                  <li>Abra o WhatsApp e entre no grupo desejado</li>
                  <li>Toque em "Informações do grupo" → "Convidar via link"</li>
                  <li>Copie o link e cole abaixo</li>
                </ol>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold" style={{ color: 'var(--sm-text-2)' }}>LINK DO GRUPO</label>
                <input
                  type="url"
                  placeholder="https://chat.whatsapp.com/..."
                  value={link}
                  onChange={e => setLink(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                  style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)', color: 'var(--sm-text-1)' }}
                />
              </div>
            </>
          )}

          {/* ── Modo config ── */}
          {mode === 'config' && (
            <>
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: '#22C55E15', border: '1px solid #22C55E30' }}>
                <CheckCircle2 className="w-4 h-4 text-[#22C55E] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{selected?.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--sm-text-2)' }}>Grupo selecionado</p>
                </div>
              </div>
              <p className="text-[13px]" style={{ color: 'var(--sm-text-2)' }}>
                Escolha quais tipos de notificação serão enviadas para este grupo:
              </p>
              <CategoryToggles value={cats} onChange={(k, v) => setCats(prev => ({ ...prev, [k]: v }))} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--sm-border)' }}>
          {mode === 'config' && (
            <button
              onClick={() => setMode('link')}
              className="px-4 py-2 rounded-xl text-[13px] font-medium transition-colors"
              style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)', border: '1px solid var(--sm-border)' }}
            >
              Voltar
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[13px] font-medium transition-colors"
            style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)', border: '1px solid var(--sm-border)' }}
          >
            Cancelar
          </button>

          {mode === 'link' && (
            <button
              onClick={handleResolveLink}
              disabled={busy || !link.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-colors disabled:opacity-40"
              style={{ background: '#25D366' }}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {busy ? 'Verificando...' : 'Continuar'}
            </button>
          )}

          {mode === 'config' && (
            <button
              onClick={handleSave}
              disabled={addGroup.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: '#25D366' }}
            >
              {addGroup.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvar grupo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Group Card ────────────────────────────────────────────────────────────────

function GroupCard({ group }: { group: WhatsappGroup }) {
  const { toast }    = useToast()
  const updateGroup  = useUpdateWhatsappGroup()
  const deleteGroup  = useDeleteWhatsappGroup()
  const [expanded, setExpanded] = useState(false)
  const [cats, setCats] = useState<WhatsappPrefs>(group.categories)

  async function handleToggle(k: keyof WhatsappPrefs, v: boolean) {
    const next = { ...cats, [k]: v }
    setCats(next)
    await updateGroup.mutateAsync({ id: group.id, categories: next }).catch(() => {
      setCats(cats)
      toast('Erro ao salvar preferência', 'error')
    })
  }

  async function handleDelete() {
    const displayName = groupDisplayName(group.group_name)
    if (!confirm(`Remover grupo "${displayName}"?`)) return
    await deleteGroup.mutateAsync(group.id)
    toast(`Grupo "${displayName}" removido`, 'success')
  }

  const activeCount = Object.values(cats).filter(Boolean).length

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}
    >
      {/* Header do card */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: '#25D36620', border: '1px solid #25D36640' }}>
          <Users className="w-4.5 h-4.5 text-[#25D366]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>
            {groupDisplayName(group.group_name)}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--sm-text-2)' }}>
            {activeCount === 4 ? 'Todas as categorias ativas' : `${activeCount} categoria${activeCount !== 1 ? 's' : ''} ativa${activeCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleteGroup.isPending}
          className="p-1.5 rounded-lg hover:bg-[#EF444420] hover:text-[#EF4444] transition-colors mr-1"
          style={{ color: 'var(--sm-text-2)' }}
          title="Remover grupo"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--sm-text-2)' }}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Categorias expandíveis */}
      {expanded && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--sm-border)' }}>
          <p className="text-[11px] pt-3 pb-2 font-medium" style={{ color: 'var(--sm-text-2)' }}>
            NOTIFICAÇÕES DESTE GRUPO
          </p>
          <CategoryToggles
            value={cats}
            onChange={handleToggle}
            disabled={updateGroup.isPending}
          />
        </div>
      )}
    </div>
  )
}

// ── Seção com título ──────────────────────────────────────────────────────────

function Section({ title, description, children }: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{title}</h2>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-2)' }}>{description}</p>
      </div>
      {children}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export function WhatsAppPage() {
  const { toast } = useToast()
  const {
    whatsapp, optIn, verified, prefs, busy,
    setOptIn, savePrefs, sendCode, confirmCode,
  } = useWhatsappSettings()

  const { data: groups = [], isLoading: loadingGroups } = useWhatsappGroups()
  const { data: clients = [] } = useClients()
  const [showAddModal, setShowAddModal] = useState(false)
  const [localPrefs, setLocalPrefs]     = useState<WhatsappPrefs | null>(null)
  const [phone, setPhone]               = useState(whatsapp)
  const [code, setCode]                 = useState('')
  const [stage, setStage]               = useState<'idle' | 'code'>('idle')

  const currentPrefs = localPrefs ?? prefs
  const isConnected  = !!whatsapp && verified

  async function handleSend() {
    try {
      await sendCode(phone)
      setStage('code')
      toast('Código enviado pelo WhatsApp!', 'success')
    } catch (err: any) { toast(err.message, 'error') }
  }

  async function handleConfirm() {
    try {
      await confirmCode(code)
      setStage('idle')
      setCode('')
      toast('WhatsApp verificado! Você já recebe as notificações.', 'success')
    } catch (err: any) { toast(err.message, 'error') }
  }

  async function handlePrefToggle(k: keyof WhatsappPrefs, v: boolean) {
    const next = { ...currentPrefs, [k]: v }
    setLocalPrefs(next)
    await savePrefs(next).catch(() => {
      setLocalPrefs(null)
      toast('Erro ao salvar preferência', 'error')
    })
  }

  return (
    <div className="min-h-full p-6" style={{ background: 'var(--sm-bg)' }}>
      <div className="max-w-2xl mx-auto space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: '#25D36620', border: '1px solid #25D36640' }}>
            <MessageCircle className="w-5 h-5 text-[#25D366]" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: 'var(--sm-text-1)' }}>WhatsApp</h1>
            <p className="text-[13px]" style={{ color: 'var(--sm-text-2)' }}>
              Notificações automáticas via WhatsApp para a agência e clientes
            </p>
          </div>
        </div>

        {/* ── Bloco 0: WhatsApp da agência (o número que ENVIA) ───────────────── */}
        <CrmWhatsappConnect />

        {/* ── Bloco 1: Conexão ───────────────────────────────────────────────── */}
        <Section
          title="Conexão"
          description="Onde você recebe os avisos da agência (post publicado, aprovações...). Sem um número aqui, eles chegam no próprio WhatsApp conectado da agência, na conversa “Você”. Se preferir receber com notificação, cadastre um número pessoal diferente."
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}
          >
            {/* Status atual */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: isConnected ? '#16A34A20' : '#F59E0B30' }}
              >
                {isConnected
                  ? <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
                  : <Phone className="w-5 h-5 text-[#B45309]" />
                }
              </div>
              <div className="flex-1 min-w-0">
                {isConnected ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{whatsapp}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#16A34A20] text-[#16A34A]">Verificado</span>
                    </div>
                    <p className="text-[12px] text-[#16A34A] mt-0.5">Número conectado e ativo</p>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Nenhum número verificado</p>
                    <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-2)' }}>
                      Insira seu número abaixo para começar a receber notificações
                    </p>
                  </>
                )}
              </div>
              {isConnected && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[12px]" style={{ color: 'var(--sm-text-2)' }}>
                    {optIn ? 'Ativo' : 'Pausado'}
                  </span>
                  <div
                    onClick={() => setOptIn(!optIn)}
                    className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${optIn ? 'bg-[#22C55E]' : 'bg-[#374151]'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${optIn ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              )}
            </div>

            {/* Formulário de verificação */}
            <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid var(--sm-border)' }}>
              <p className="text-[11px] pt-3 font-medium" style={{ color: 'var(--sm-text-2)' }}>
                {isConnected ? 'ALTERAR NÚMERO' : 'VERIFICAR NÚMERO'}
              </p>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="DDD + número (ex: 11999998888)"
                  className="flex-1 h-9 px-3 rounded-xl text-[13px] outline-none transition-colors"
                  style={{
                    background: 'var(--sm-bg)',
                    border: '1px solid var(--sm-border)',
                    color: 'var(--sm-text-1)',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={busy || phone.replace(/\D/g, '').length < 10}
                  className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                  style={{ background: '#25D366' }}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isConnected ? 'Reverificar' : 'Verificar'}
                </button>
              </div>

              {stage === 'code' && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Código de 6 dígitos recebido no WhatsApp"
                    className="flex-1 h-9 px-3 rounded-xl text-[13px] tracking-widest outline-none"
                    style={{
                      background: 'var(--sm-bg)',
                      border: '1px solid #25D36660',
                      color: 'var(--sm-text-1)',
                    }}
                  />
                  <button
                    onClick={handleConfirm}
                    disabled={busy || code.length !== 6}
                    className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ background: '#25D366' }}
                  >
                    Confirmar
                  </button>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ── Bloco 2: Notificações para a agência ──────────────────────────── */}
        <Section
          title="Notificações para você"
          description="Receba uma mensagem neste número quando esses eventos acontecerem no sistema."
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}
          >
            <div className="p-4">
              <CategoryToggles
                value={currentPrefs}
                onChange={handlePrefToggle}
                disabled={busy || !isConnected || !optIn}
              />
            </div>
            {(!isConnected || !optIn) && (
              <div className="px-4 pb-4">
                <p className="text-[11px] text-center py-2 rounded-xl" style={{ background: '#F59E0B20', color: '#B45309', border: '1px solid #F59E0B50' }}>
                  {!isConnected ? 'Configure o número para ativar as notificações' : 'Ative o toggle acima para receber notificações'}
                </p>
              </div>
            )}
          </div>
        </Section>

        {/* ── Bloco 3: Notificações para clientes ───────────────────────────── */}
        <Section
          title="Notificações para clientes"
          description="Quando um conteúdo for enviado para aprovação ou ajuste concluído, o cliente recebe uma mensagem no WhatsApp dele."
        >
          {/* Lista de clientes */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold px-1" style={{ color: 'var(--sm-text-2)' }}>
              CLIENTES ({clients.filter(c => c.whatsapp).length} de {clients.length} com WhatsApp)
            </p>
            {clients.length === 0 ? (
              <div
                className="text-center py-5 rounded-2xl text-[13px]"
                style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)', color: 'var(--sm-text-2)' }}
              >
                Nenhum cliente cadastrado.
              </div>
            ) : (
              <div className="space-y-1.5">
                {clients.map(client => (
                  <div
                    key={client.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)' }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
                      style={{ background: client.whatsapp ? '#16A34A20' : 'var(--sm-border)', color: client.whatsapp ? '#16A34A' : 'var(--sm-text-2)' }}
                    >
                      {client.company_name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--sm-text-1)' }}>
                        {client.company_name}
                      </p>
                      {client.whatsapp ? (
                        <p className="text-[11px] mt-0.5 text-[#16A34A]">{client.whatsapp}</p>
                      ) : (
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--sm-text-2)' }}>Sem WhatsApp cadastrado</p>
                      )}
                    </div>
                    {client.whatsapp ? (
                      <CheckCircle2 className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
                    ) : (
                      <Link
                        to={`/clients/${client.id}/edit`}
                        className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg flex-shrink-0 transition-colors"
                        style={{ background: '#F59E0B20', color: '#B45309', border: '1px solid #F59E0B60' }}
                      >
                        <AlertCircle className="w-3 h-3" />
                        Adicionar
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* ── Bloco 4: Grupos ────────────────────────────────────────────────── */}
        <Section
          title="Grupos"
          description="Envie as mesmas notificações para grupos do WhatsApp. Útil para grupos de equipe ou grupos com o cliente."
        >
          {!isConnected && (
            <div
              className="text-center py-6 rounded-2xl text-[13px]"
              style={{ background: 'var(--sm-bg-alt)', border: '1px solid var(--sm-border)', color: 'var(--sm-text-2)' }}
            >
              Configure e verifique o número para poder adicionar grupos.
            </div>
          )}

          {isConnected && (
            <>
              {loadingGroups ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sm-text-2)' }} />
                </div>
              ) : (
                <div className="space-y-3">
                  {groups.length === 0 ? (
                    <div
                      className="text-center py-8 rounded-2xl space-y-3"
                      style={{ background: 'var(--sm-bg-alt)', border: '1px dashed var(--sm-border)' }}
                    >
                      <div className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center"
                        style={{ background: '#25D36615', border: '1px solid #25D36630' }}>
                        <Users className="w-5 h-5 text-[#25D366]" />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
                          Nenhum grupo configurado
                        </p>
                        <p className="text-[12px] mt-1" style={{ color: 'var(--sm-text-2)' }}>
                          Adicione um grupo para receber notificações por lá também
                        </p>
                      </div>
                    </div>
                  ) : (
                    groups.map(g => <GroupCard key={g.id} group={g} />)
                  )}

                  <button
                    onClick={() => setShowAddModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-semibold transition-colors"
                    style={{
                      background: '#25D36615',
                      border: '1px dashed #25D36640',
                      color: '#25D366',
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar grupo
                  </button>
                </div>
              )}
            </>
          )}
        </Section>

      </div>

      {showAddModal && <AddGroupModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}
