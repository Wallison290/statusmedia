# CRM completo: o que mudou e como publicar

O CRM deixou de ser só um quadro de leads. Agora ele lembra de tudo que aconteceu, manda proposta e contrato por link, captura lead sozinho, age sozinho com automações e mostra onde o funil vaza.

Boa parte das ideias veio do "Sistema" (base Gestão Dev): histórico de proposta, aceite por link com prova do conteúdo, assinatura eletrônica, motor de automações com trava contra execução duplicada, captura de lead sem duplicar contato e assistente de IA pelo WhatsApp. Foi tudo reescrito para o formato da StatusMedia (React + Supabase).

## O que tem de novo

| Onde | O quê |
|---|---|
| Funil | Histórico com data em cada lead, motivo de perda, arquivar, selo de "parado há X dias", filtro "Retornos de hoje", abrir a ficha pelo link do aviso |
| Ficha do lead | Histórico, tarefas do lead, propostas e contratos, mensagens prontas de WhatsApp, "Sugerir mensagem" com IA |
| Propostas (`/crm/propostas`) | Itens, desconto, validade; o cliente aceita ou recusa pelo link e o card vai sozinho para "ganho" |
| Contratos (`/crm/contratos`) | Gerado do modelo já preenchido; cliente assina pelo link com CPF/CNPJ e rubrica |
| Automações (`/crm/automacoes`) | "Quando X, faça Y", com receitas prontas |
| Relatórios (`/crm/relatorios`) | Meta do mês, conversão, ticket, tempo por etapa, motivos de perda, origem, responsável |
| Configurações (`/crm/configuracoes`) | Formulário de captura, lembrete diário, mensagens prontas, padrões da proposta, modelo de contrato |
| Avisos | Sininho e WhatsApp: retornos do dia (8h), lead novo, proposta aberta/aceita/recusada, contrato assinado |
| WhatsApp | Mandar "CRM quem eu preciso chamar hoje?" para o número da StatusMedia |

Nenhuma mensagem automática vai para o lead pelo número da plataforma (ele é compartilhado por todas as agências). As automações entregam a mensagem pronta para a agência enviar do próprio WhatsApp.

## Como publicar (nesta ordem)

1. **Banco de dados.** No SQL Editor do Supabase, rodar um de cada vez:
   - `supabase/migrations/073_crm_historico.sql`
   - `supabase/migrations/074_crm_propostas_contratos.sql`
   - `supabase/migrations/075_crm_captura_automacoes.sql`

   São seguras para rodar de novo. A 073 agenda o lembrete das 8h se o `pg_cron` estiver ligado (a mensagem de retorno avisa).

2. **Funções**
   ```bash
   supabase functions deploy notify-whatsapp
   supabase functions deploy crm-whatsapp-assistant --no-verify-jwt
   supabase secrets set CRM_ASSISTANT_SECRET=<texto aleatório longo>
   ```

3. **Assistente pelo WhatsApp (opcional).** No painel da UazAPI, webhook de mensagens recebidas:
   `https://<ref>.supabase.co/functions/v1/crm-whatsapp-assistant?secret=<CRM_ASSISTANT_SECRET>`
   Antes, confira se a instância já não tem outro webhook configurado: trocar a URL desliga o anterior.

4. **App.** Só depois dos passos 1 e 2, juntar a branch `crm-completo` na `main` (isso publica na Vercel).
   Se o app subir antes do banco, as telas novas do CRM dão erro.

## Revisar antes de usar com clientes

- O modelo de contrato em Configurações é genérico. Revise com um advogado.
- A assinatura é eletrônica simples (nome, documento, e-mail, rubrica, data, IP e código do texto). Serve para contrato de prestação de serviço; não substitui certificado digital.
