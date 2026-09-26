// ── Compartilhar proposta ou contrato ────────────────────────────────────────
// O envio é sempre pelo WhatsApp da própria agência: direto pelo sistema quando
// ela conectou o número (CRM › Configurações), ou abrindo a conversa com a
// mensagem pronta quando não conectou. O número da plataforma nunca envia para
// leads (ver cabeçalho da migration 075).
//
// Os botões são links <a>, não window.open: o navegador do celular bloqueia
// janela aberta por script em vários casos, mas nunca um link tocado.

import { Copy, MessageCircle, ExternalLink, AlertTriangle, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { waLink, copyText } from '@/utils/crm'
import { useAgencyWhatsapp, useSendAgencyWhatsapp } from '@/hooks/useAgencyWhatsapp'
import type { CrmLead } from '@/types'

interface Props {
  link:    string
  lead:    CrmLead | null
  message: string          // texto do WhatsApp, já com o link
  hint:    string
  label:   string          // como o envio aparece no histórico ("Proposta", "Contrato")
}

export function CrmShareBox({ link, lead, message, hint, label }: Props) {
  const { toast } = useToast()
  const { data: wa } = useAgencyWhatsapp()
  const send = useSendAgencyWhatsapp()
  // Com o WhatsApp da agência conectado, o envio sai direto daqui
  const direct = wa?.status === 'connected' && !!lead?.whatsapp

  return (
    <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'rgba(37,99,235,0.35)', background: 'rgba(37,99,235,0.06)' }}>
      <p className="text-[12.5px] font-medium" style={{ color: 'var(--sm-text-1)' }}>{hint}</p>

      {direct && lead ? (
        <>
          <Button
            className="w-full h-10 text-[13.5px] font-semibold"
            variant="success"
            disabled={send.isPending}
            onClick={() => send.mutate(
              { lead_id: lead.id, text: message, label },
              {
                onSuccess: () => toast(`Enviado para ${lead.name.split(' ')[0]} pelo seu WhatsApp`, 'success'),
                onError:   (e: any) => toast(e.message, 'error'),
              },
            )}
          >
            {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar para {lead.name.split(' ')[0]} pelo meu WhatsApp
          </Button>
          <a href={waLink(lead.whatsapp!, message)} target="_blank" rel="noreferrer"
             className="block text-center text-[11.5px] underline" style={{ color: 'var(--sm-text-4)' }}>
            ou abrir a conversa no WhatsApp para editar antes
          </a>
        </>
      ) : lead?.whatsapp ? (
        <a
          href={waLink(lead.whatsapp, message)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 h-10 rounded-md text-[13.5px] font-semibold text-white bg-green-600 hover:bg-green-500 transition-colors"
        >
          <MessageCircle className="w-4 h-4" /> Enviar para {lead.name.split(' ')[0]} no WhatsApp
        </a>
      ) : (
        <p className="flex items-start gap-1.5 text-[12px]" style={{ color: '#F5A623' }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {lead
            ? 'Este lead está sem WhatsApp no cadastro. Adicione na ficha dele para enviar por aqui, ou copie o link abaixo.'
            : 'Vincule um lead com WhatsApp para enviar por aqui, ou copie o link abaixo.'}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        <Input readOnly value={link} className="h-8 text-[12px] flex-1 min-w-0 basis-[200px]" onFocus={e => e.target.select()} />
        <Button size="sm" variant="outline" onClick={async () => toast((await copyText(link)) ? 'Link copiado' : 'Não consegui copiar', 'success')}>
          <Copy className="w-3 h-3" /> Copiar link
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a href={link} target="_blank" rel="noreferrer">
            <ExternalLink className="w-3 h-3" /> Ver como o cliente
          </a>
        </Button>
      </div>
    </div>
  )
}

/** Mensagens padrão de envio, usadas no editor e nas listas. */
export function proposalMessage(lead: CrmLead | null, agency: string, link: string) {
  const hi = lead ? `Olá, ${lead.name.trim().split(/\s+/)[0]}!` : 'Olá!'
  return `${hi} Segue a proposta da ${agency}: ${link}\n\nPor ela você vê os detalhes e aprova direto pelo link. Qualquer dúvida, estou por aqui!`
}

export function contractMessage(lead: CrmLead | null, agency: string, link: string) {
  const hi = lead ? `Olá, ${lead.name.trim().split(/\s+/)[0]}!` : 'Olá!'
  return `${hi} Segue o contrato da ${agency} para assinatura: ${link}\n\nÉ só abrir, conferir e assinar pelo celular mesmo.`
}
