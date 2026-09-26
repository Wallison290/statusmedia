// ── Conectar o WhatsApp da agência ───────────────────────────────────────────
// Aparece na página WhatsApp e em CRM › Configurações. A agência escaneia o QR
// code com o próprio celular, como no WhatsApp Web. Esse número passa a enviar
// tudo em nome da agência: avisos de conteúdo para os clientes, avisos de post
// publicado e o CRM (ver supabase/functions/_shared/whatsapp.ts).
// Some da tela quando o recurso não está disponível para a conta.

import { Loader2, Smartphone, CheckCircle2, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  useAgencyWhatsapp, useConnectAgencyWhatsapp, useDisconnectAgencyWhatsapp,
} from '@/hooks/useAgencyWhatsapp'

function fmtPhone(p?: string | null) {
  if (!p) return ''
  const d = p.startsWith('55') ? p.slice(2) : p
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : p
}

export function CrmWhatsappConnect() {
  const { toast } = useToast()
  const { data, isLoading } = useAgencyWhatsapp({ poll: true })
  const connect    = useConnectAgencyWhatsapp()
  const disconnect = useDisconnectAgencyWhatsapp()

  if (isLoading || !data || (!data.available && !data.hasInstance)) return null

  const qr = data.qrcode ? (data.qrcode.startsWith('data:') ? data.qrcode : `data:image/png;base64,${data.qrcode}`) : null

  return (
    <section className="rounded-xl border p-4 sm:p-5 space-y-3" style={{ background: 'var(--sm-bg-card)', borderColor: 'var(--sm-border)' }}>
      <div>
        <h2 className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--sm-text-1)' }}>
          <Smartphone className="w-4 h-4" style={{ color: '#22C55E' }} /> Meu WhatsApp
        </h2>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--sm-text-3)' }}>
          Conecte o WhatsApp da agência. Por ele saem os avisos de conteúdo para os seus clientes, os avisos de post publicado e as mensagens, propostas e contratos do CRM. Enquanto não conectar, tudo continua saindo pelo número da StatusMedia.
        </p>
      </div>

      {data.status === 'connected' ? (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl px-3 py-2.5" style={{ background: 'rgba(34,197,94,0.08)' }}>
          <p className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--sm-text-1)' }}>
            <CheckCircle2 className="w-4 h-4" style={{ color: '#22C55E' }} />
            Conectado{data.phone ? `: ${fmtPhone(data.phone)}` : ''}{data.profile_name ? ` (${data.profile_name})` : ''}
          </p>
          <Button size="sm" variant="ghost" disabled={disconnect.isPending} onClick={() => {
            if (!window.confirm('Desconectar o WhatsApp da agência do CRM?')) return
            disconnect.mutate(undefined, { onError: (e: any) => toast(e.message, 'error') })
          }}>
            <Unplug className="w-3.5 h-3.5" /> Desconectar
          </Button>
        </div>
      ) : data.status === 'connecting' && qr ? (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <img src={qr} alt="QR code para conectar o WhatsApp" className="w-56 h-56 rounded-xl bg-white p-2" />
          <ol className="text-[12.5px] space-y-1.5 list-decimal pl-4" style={{ color: 'var(--sm-text-2)' }}>
            <li>Abra o WhatsApp da agência no celular</li>
            <li>Toque em <strong>Mais opções</strong> (⋮) ou <strong>Configurações</strong></li>
            <li>Toque em <strong>Dispositivos conectados</strong> e depois em <strong>Conectar dispositivo</strong></li>
            <li>Aponte a câmera para este QR code</li>
            <li className="list-none -ml-4 pt-1 flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--sm-text-4)' }}>
              <Loader2 className="w-3 h-3 animate-spin" /> Esperando a leitura. Esta tela atualiza sozinha.
            </li>
          </ol>
        </div>
      ) : (
        <Button onClick={() => connect.mutate(undefined, { onError: (e: any) => toast(e.message, 'error') })} disabled={connect.isPending}>
          {connect.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
          Conectar meu WhatsApp
        </Button>
      )}

      <p className="text-[11px]" style={{ color: 'var(--sm-text-4)' }}>
        Use para conversas e envios individuais. Disparo em massa para quem não tem seu número salvo pode fazer o WhatsApp bloquear o número. O sistema limita os envios por hora para proteger você.
      </p>
    </section>
  )
}
