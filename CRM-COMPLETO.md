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
| Configurações (`/crm/configuracoes`) | Áreas de Follow-up, WhatsApp e avisos, Entrada de leads, Propostas e contratos, com explicações e exemplos |
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

## Estilo dos follow-ups automáticos

Em **CRM → Configurações → Follow-up**, a configuração segue quatro etapas:

1. **Conte o que você vende:** cadastre o serviço. Nome e descrição são obrigatórios; preço, resultados e outras informações ficam em campos opcionais.
2. **Defina como conversar:** escolha o tom, o tamanho e o encerramento. As referências de 1, 3, 7 e 14 dias ficam em abas. Orientações extras e objetivos personalizados são opcionais.
3. **Confira uma mensagem na prática:** gere uma prévia para um lead, sem enviar mensagem.
4. **Revise e ative os envios:** confira as regras e o estado da conexão. A tela informa o que falta e permite pausar a automação mesmo com um rascunho em edição.

Trocar de área preserva os rascunhos enquanto a página permanece aberta. Configurações com botão de salvar só entram em uso depois da gravação. As opções com gravação automática têm essa informação junto ao campo. Os períodos de 1, 3, 7 e 14 dias continuam fixos.

Clique em **Salvar mensagens e estilo** para aplicar aos próximos envios. Tom, tamanho, encerramento e orientações valem para todos os briefings da agência. Objetivos e mensagens de referência ficam vinculados ao serviço selecionado. A opção **Usar o tom do briefing** respeita o tom de cada serviço; os demais tons escolhidos têm prioridade sobre ele. Objetivos em branco usam a abordagem padrão do contato.

**Sugerir as 4 mensagens** gera quatro sugestões com o briefing cadastrado. Cada botão **Usar referência** aplica apenas aquela sugestão ao rascunho; revise, edite e salve. A mensagem manual é o norte da intenção e do estilo. Antes de cada envio, a IA analisa as últimas 100 mensagens registradas (até 2.000 caracteres por mensagem), prioriza necessidades, dúvidas, objeções e assuntos recentes e pode reformular abertura, argumentos e encerramento. Nomes, preços, condições e resultados precisam estar confirmados no briefing ou no histórico real. Não há treinamento permanente do modelo: a leitura do contexto é atualizada em cada geração.

**Testar com um lead** permite escolher um lead do serviço e um contato da cadência para gerar uma prévia com as orientações atuais, inclusive alterações ainda não salvas. A prévia não envia WhatsApp, não move o card e não consome degraus da cadência. No envio real, a mensagem é gerada novamente com o histórico atualizado. Se o lead falou por último, a prévia avisa que o follow-up automático aguarda a resposta da agência.

Cada geração de sugestões (os quatro contatos juntos) ou prévia usa 1 unidade da cota de mensagens com IA. A função `crm-followup-compose` exige sessão válida, consulta o CRM sob RLS e só utiliza a agência autorizada para contabilizar a cota.

Todos os follow-ups são enviados sem emojis ou carinhas. A geração recebe essa regra e o texto passa por uma limpeza antes do envio. Respostas que ficam vazias após a limpeza não são enviadas.

O redesenho visual das configurações usa os campos e funções existentes. Ele é publicado pelo frontend no GitHub e não exige nova migration nem atualização das funções no Supabase. Para instalar o recurso de referências em um projeto que ainda não o tenha, siga esta ordem:

1. Aplicar somente `supabase/migrations/20261011020541_crm_followup_style.sql` no projeto correspondente. Ela adiciona a preferência à tabela existente e preserva as policies por agência. O timestamp corresponde ao registro aplicado no histórico remoto.
2. Publicar a função `crm-followup`, incluindo o arquivo compartilhado `supabase/functions/_shared/followup-style.ts`:
   ```bash
   supabase functions deploy crm-followup --no-verify-jwt
   ```
3. Publicar a função autenticada `crm-followup-compose`, incluindo `followup-style.ts` e `plans.ts`:
   ```bash
   supabase functions deploy crm-followup-compose
   ```
4. Enviar o frontend atualizado ao GitHub (`main`); o deploy existente atualiza o site automaticamente. A configuração precisa da nova coluna para ser salva.

Para validar a geração e a remoção de emojis localmente, use Node.js 24 ou superior:

```bash
node --test supabase/functions/_shared/followup-style.test.ts
npm run build
```
