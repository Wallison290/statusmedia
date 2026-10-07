// ── Página: WhatsApp ───────────────────────────────────────────────────────────

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, CheckCircle2, Loader2,
  Plus, Trash2, ChevronDown, X,
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

// ── Visual ────────────────────────────────────────────────────────────────────
// Padrão editorial do sistema. O verde do WhatsApp fica só em pontos de status;
// botões usam o azul da marca (o verde #25D366 com texto branco tem contraste
// baixo demais para leitura).

const card = { background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' } as const
const eyebrow = 'text-[10.5px] font-semibold uppercase tracking-[0.08em]'
const primaryBtn = 'inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap disabled:opacity-50'
const ghostBtn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl border text-[13px] font-medium hover:bg-black/5 transition-colors whitespace-nowrap'
const ghostStyle = { borderColor: 'var(--sm-border)', color: 'var(--sm-text-2)' } as const
const inputStyle = { background: 'var(--sm-bg-input)', borderColor: 'var(--sm-border)', color: 'var(--sm-text-1)' } as const
const OK = '#22C55E'
const WARN = '#F59E0B'

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

function Switch({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={onClick}
      className="relative block w-9 h-5 p-0 rounded-full transition-colors flex-shrink-0 disabled:cursor-not-allowed"
      style={{ background: on ? 'var(--sm-primary)' : 'var(--sm-border-alt)' }}>
      <span className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

// ── Lista de categorias com chave liga/desliga ───────────────────────────────

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
    <div className={disabled ? 'opacity-50' : ''}>
      {WHATSAPP_CATEGORIES.map((cat, i) => (
        <div key={cat.key}
          className={`flex items-center justify-between gap-3 py-3 ${i > 0 ? 'border-t' : ''}`}
          style={{ borderColor: 'var(--sm-border)' }}>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>{cat.label}</p>
            <p className="text-[12px]" style={{ color: 'var(--sm-text-3)' }}>{cat.hint}</p>
          </div>
          <Switch on={!!value[cat.key]} label={cat.label} disabled={disabled}
            onClick={() => !disabled && onChange(cat.key, !value[cat.key])} />
        </div>
      ))}
    </div>
  )
}

// ── Seção numerada ────────────────────────────────────────────────────────────

function Section({ n, title, description, aside, children }: {
  n: string
  title: string
  description: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="flex items-baseline gap-2">
            <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--sm-text-4)' }}>{n}</span>
            <span className="font-display text-[17px] font-bold" style={{ color: 'var(--sm-text-1)' }}>{title}</span>
          </h2>
          <p className="text-[12.5px] mt-0.5 max-w-[62ch]" style={{ color: 'var(--sm-text-3)' }}>{description}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl border flex flex-col overflow-hidden" style={{ ...card, maxHeight: '85vh' }}>
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <p className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>{mode === 'config' ? 'Passo 2 de 2' : 'Passo 1 de 2'}</p>
            <h2 className="font-display text-[19px] font-bold mt-0.5" style={{ color: 'var(--sm-text-1)' }}>{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors">
            <X className="w-4 h-4" style={{ color: 'var(--sm-text-3)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {mode === 'link' && (
            <>
              <ol className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sm-border)' }}>
                {[
                  'Abra o WhatsApp e entre no grupo desejado',
                  'Toque em "Informações do grupo" → "Convidar via link"',
                  'Copie o link e cole abaixo',
                ].map((t, i) => (
                  <li key={t} className={`flex items-start gap-3 px-3.5 py-2.5 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                    <span className="font-display text-[13px] font-bold tabular-nums w-5 flex-shrink-0" style={{ color: 'var(--sm-text-4)' }}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-[12.5px]" style={{ color: 'var(--sm-text-2)' }}>{t}</span>
                  </li>
                ))}
              </ol>
              <div>
                <label className={`block ${eyebrow} mb-1.5`} style={{ color: 'var(--sm-text-4)' }}>Link do grupo</label>
                <input
                  type="url"
                  placeholder="https://chat.whatsapp.com/..."
                  value={link}
                  onChange={e => setLink(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border text-[13px] outline-none focus:border-[#2563EB]/50 focus:ring-2 focus:ring-[#2563EB]/20 placeholder:text-[color:var(--sm-text-4)]"
                  style={inputStyle}
                />
              </div>
            </>
          )}

          {mode === 'config' && (
            <>
              <div className="relative flex items-center gap-2.5 pl-4 pr-3 py-3 rounded-xl border overflow-hidden" style={{ background: 'var(--sm-bg-alt)', borderColor: 'var(--sm-border)' }}>
                <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r" style={{ background: OK }} />
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: OK }} />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{selected?.name}</p>
                  <p className="text-[11.5px]" style={{ color: 'var(--sm-text-3)' }}>Grupo selecionado</p>
                </div>
              </div>
              <p className="text-[12.5px]" style={{ color: 'var(--sm-text-3)' }}>
                Escolha quais tipos de notificação serão enviadas para este grupo:
              </p>
              <CategoryToggles value={cats} onChange={(k, v) => setCats(prev => ({ ...prev, [k]: v }))} />
            </>
          )}
        </div>

        <div className="px-5 py-3.5 flex items-center justify-end gap-2 border-t" style={{ borderColor: 'var(--sm-border)' }}>
          {mode === 'config' && (
            <button onClick={() => setMode('link')} className={`${ghostBtn} mr-auto`} style={ghostStyle}>Voltar</button>
          )}
          <button onClick={onClose} className={ghostBtn} style={ghostStyle}>Cancelar</button>

          {mode === 'link' && (
            <button onClick={handleResolveLink} disabled={busy || !link.trim()} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {busy ? 'Verificando...' : 'Continuar'}
            </button>
          )}

          {mode === 'config' && (
            <button onClick={handleSave} disabled={addGroup.isPending} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
              {addGroup.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvar grupo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Linha de grupo ────────────────────────────────────────────────────────────

function GroupCard({ group, first }: { group: WhatsappGroup; first: boolean }) {
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

  const totalCats = WHATSAPP_CATEGORIES.length

  return (
    <div className={first ? '' : 'border-t'} style={{ borderColor: 'var(--sm-border)' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sm-bg-alt)' }}>
          <Users className="w-4 h-4" style={{ color: 'var(--sm-text-3)' }} />
        </span>
        <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex-1 min-w-0 text-left">
          <span className="block text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>
            {groupDisplayName(group.group_name)}
          </span>
          <span className="block text-[12px]" style={{ color: 'var(--sm-text-3)' }}>
            {activeCount === totalCats ? 'Todas as categorias ativas' : `${activeCount} categoria${activeCount !== 1 ? 's' : ''} ativa${activeCount !== 1 ? 's' : ''}`}
          </span>
        </button>
        <button onClick={handleDelete} disabled={deleteGroup.isPending} title="Remover grupo" aria-label="Remover grupo"
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-colors"
          style={{ color: 'var(--sm-text-3)' }}>
          <Trash2 className="w-4 h-4" />
        </button>
        <button onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Recolher' : 'Expandir'}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors"
          style={{ color: 'var(--sm-text-3)' }}>
          <ChevronDown className="w-4 h-4 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-2 ml-12">
          <p className={`${eyebrow} pb-1`} style={{ color: 'var(--sm-text-4)' }}>Notificações deste grupo</p>
          <CategoryToggles value={cats} onChange={handleToggle} disabled={updateGroup.isPending} />
        </div>
      )}
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

  const comWhats = clients.filter(c => c.whatsapp).length

  return (
    <div className="min-h-full" style={{ background: 'var(--sm-bg-page)' }}>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-9">

        {/* ── Cabeçalho (no celular, ao lado do menu) ── */}
        <header className="max-md:pl-12 max-md:-mt-[3.25rem]">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sm-text-4)' }}>Comunicação</p>
          <h1 className="font-display text-[28px] md:text-[34px] font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: 'var(--sm-text-1)' }}>
            WhatsApp
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--sm-text-3)' }}>
            Notificações automáticas via WhatsApp para a agência e clientes
          </p>
        </header>

        {/* ── 01: WhatsApp da agência (o número que ENVIA) ── */}
        <CrmWhatsappConnect n="01" />

        {/* ── 02: Onde você recebe os avisos ── */}
        <Section
          n="02"
          title="Conexão"
          description="Onde você recebe os avisos da agência (post publicado, aprovações...). Sem um número aqui, eles chegam no próprio WhatsApp conectado da agência, na conversa “Você”. Se preferir receber com notificação, cadastre um número pessoal diferente."
        >
          <div className="relative rounded-2xl border overflow-hidden" style={card}>
            <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r" style={{ background: isConnected ? OK : WARN }} />

            <div className="flex items-center gap-3 pl-5 pr-4 py-4">
              <div className="flex-1 min-w-0">
                {isConnected ? (
                  <>
                    <p className="font-display text-[18px] font-bold tabular-nums" style={{ color: 'var(--sm-text-1)' }}>{whatsapp}</p>
                    <p className="inline-flex items-center gap-1.5 text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: OK }} /> Verificado · número conectado e ativo
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Nenhum número verificado</p>
                    <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
                      Insira seu número abaixo para começar a receber notificações
                    </p>
                  </>
                )}
              </div>
              {isConnected && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[12.5px] font-medium" style={{ color: 'var(--sm-text-2)' }}>{optIn ? 'Ativo' : 'Pausado'}</span>
                  <Switch on={optIn} onClick={() => setOptIn(!optIn)} label="Receber notificações" />
                </div>
              )}
            </div>

            <div className="pl-5 pr-4 pb-4 pt-3 space-y-2 border-t" style={{ borderColor: 'var(--sm-border)' }}>
              <p className={eyebrow} style={{ color: 'var(--sm-text-4)' }}>{isConnected ? 'Alterar número' : 'Verificar número'}</p>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="DDD + número (ex: 11999998888)"
                  className="flex-1 min-w-0 h-9 px-3 rounded-xl border text-[13px] outline-none focus:border-[#2563EB]/50 focus:ring-2 focus:ring-[#2563EB]/20 placeholder:text-[color:var(--sm-text-4)]"
                  style={inputStyle}
                />
                <button onClick={handleSend} disabled={busy || phone.replace(/\D/g, '').length < 10}
                  className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
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
                    className="flex-1 min-w-0 h-9 px-3 rounded-xl border text-[13px] tracking-widest outline-none focus:ring-2 focus:ring-[#2563EB]/20 placeholder:tracking-normal placeholder:text-[color:var(--sm-text-4)]"
                    style={{ ...inputStyle, borderColor: '#2563EB' }}
                  />
                  <button onClick={handleConfirm} disabled={busy || code.length !== 6} className={primaryBtn} style={{ background: 'var(--sm-primary)' }}>
                    Confirmar
                  </button>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ── 03: Notificações para a agência ── */}
        <Section
          n="03"
          title="Notificações para você"
          description="Receba uma mensagem neste número quando esses eventos acontecerem no sistema."
        >
          <div className="rounded-2xl border px-4 py-1" style={card}>
            <CategoryToggles value={currentPrefs} onChange={handlePrefToggle} disabled={busy || !isConnected || !optIn} />
          </div>
          {(!isConnected || !optIn) && (
            <p className="inline-flex items-center gap-1.5 text-[12px] mt-2" style={{ color: '#B45309' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: WARN }} />
              {!isConnected ? 'Configure o número para ativar as notificações' : 'Ative o toggle acima para receber notificações'}
            </p>
          )}
        </Section>

        {/* ── 04: Notificações para clientes ── */}
        <Section
          n="04"
          title="Notificações para clientes"
          description="Quando um conteúdo for enviado para aprovação ou ajuste concluído, o cliente recebe uma mensagem no WhatsApp dele."
          aside={clients.length > 0 && (
            <span className="text-[12px] tabular-nums flex-shrink-0" style={{ color: 'var(--sm-text-4)' }}>{comWhats} de {clients.length} com WhatsApp</span>
          )}
        >
          {clients.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-6 text-center text-[13px]" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
              Nenhum cliente cadastrado.
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={card}>
              {clients.map((client, i) => (
                <div key={client.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--sm-border)' }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[12.5px] font-bold"
                    style={{ background: 'var(--sm-bg-alt)', color: 'var(--sm-text-2)' }}>
                    {client.company_name[0].toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--sm-text-1)' }}>{client.company_name}</p>
                    <p className="inline-flex items-center gap-1.5 text-[12px] mt-0.5 tabular-nums" style={{ color: 'var(--sm-text-3)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: client.whatsapp ? OK : WARN }} />
                      {client.whatsapp || 'Sem WhatsApp cadastrado'}
                    </p>
                  </div>
                  {!client.whatsapp && (
                    <Link to={`/clients/${client.id}/edit`}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12px] font-semibold hover:bg-black/5 flex-shrink-0"
                      style={{ color: '#2563EB' }}>
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── 05: Grupos ── */}
        <Section
          n="05"
          title="Grupos"
          description="Envie as mesmas notificações para grupos do WhatsApp. Útil para grupos de equipe ou grupos com o cliente."
          aside={isConnected && groups.length > 0 && (
            <button onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12.5px] font-semibold hover:bg-black/5 flex-shrink-0"
              style={{ color: '#2563EB' }}>
              <Plus className="w-3.5 h-3.5" /> Adicionar grupo
            </button>
          )}
        >
          {!isConnected ? (
            <div className="rounded-2xl border border-dashed py-6 text-center text-[13px]" style={{ borderColor: 'var(--sm-border)', color: 'var(--sm-text-3)' }}>
              Configure e verifique o número para poder adicionar grupos.
            </div>
          ) : loadingGroups ? (
            <div className="h-20 rounded-2xl animate-pulse" style={{ background: 'var(--sm-bg-card)' }} />
          ) : groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-8 px-4 text-center" style={{ borderColor: 'var(--sm-border)' }}>
              <Users className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--sm-text-4)' }} />
              <p className="text-[13.5px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>Nenhum grupo configurado</p>
              <p className="text-[12.5px] mt-1" style={{ color: 'var(--sm-text-3)' }}>Adicione um grupo para receber notificações por lá também</p>
              <button onClick={() => setShowAddModal(true)} className={`${primaryBtn} mt-4`} style={{ background: 'var(--sm-primary)' }}>
                <Plus className="w-4 h-4" /> Adicionar grupo
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={card}>
              {groups.map((g, i) => <GroupCard key={g.id} group={g} first={i === 0} />)}
            </div>
          )}
        </Section>

      </div>

      {showAddModal && <AddGroupModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}
