// ── Modelos prontos de funil comercial ───────────────────────────────────────
// Servem só como ponto de partida: depois de aplicados, as colunas são normais
// e o usuário renomeia, recolore, reordena, adiciona e exclui à vontade.

import type { CrmStageType, CrmAutomationTrigger, CrmAutomationAction } from '@/types'

export interface CrmTemplateColumn {
  name:       string
  color:      string
  stage_type: CrmStageType
}

export interface CrmTemplate {
  id:          string
  emoji:       string
  name:        string
  description: string
  columns:     CrmTemplateColumn[]
}

// Paleta das etapas — segue o azul do sistema no meio do funil, verde no ganho
// e vermelho no perdido, para o board ser lido de relance.
const C = {
  cinza:   '#64748b',
  azul:    '#2563EB',
  azulC:   '#4F8EF7',
  roxo:    '#8B5CF6',
  ambar:   '#F5A623',
  verde:   '#22C55E',
  vermelho:'#ef4444',
}

export const CRM_TEMPLATES: CrmTemplate[] = [
  {
    id:          'padrao',
    emoji:       '🎯',
    name:        'Funil comercial padrão',
    description: 'O caminho clássico, do primeiro contato ao fechamento. Serve para quase qualquer venda.',
    columns: [
      { name: 'Novo lead',        color: C.cinza,    stage_type: 'normal'  },
      { name: 'Contato feito',    color: C.azulC,    stage_type: 'normal'  },
      { name: 'Qualificado',      color: C.azul,     stage_type: 'normal'  },
      { name: 'Proposta enviada', color: C.roxo,     stage_type: 'normal'  },
      { name: 'Negociação',       color: C.ambar,    stage_type: 'normal'  },
      { name: 'Ganho',            color: C.verde,    stage_type: 'ganho'   },
      { name: 'Perdido',          color: C.vermelho, stage_type: 'perdido' },
    ],
  },
  {
    id:          'agencia',
    emoji:       '📱',
    name:        'Agência / social media',
    description: 'Prospecção ativa com diagnóstico e reunião antes da proposta. É o funil de quem vende serviço recorrente.',
    columns: [
      { name: 'Prospecção',        color: C.cinza,    stage_type: 'normal'  },
      { name: 'Primeiro contato',  color: C.azulC,    stage_type: 'normal'  },
      { name: 'Diagnóstico',       color: C.azul,     stage_type: 'normal'  },
      { name: 'Reunião marcada',   color: C.roxo,     stage_type: 'normal'  },
      { name: 'Proposta',          color: C.ambar,    stage_type: 'normal'  },
      { name: 'Follow-up',         color: C.ambar,    stage_type: 'normal'  },
      { name: 'Contrato assinado', color: C.verde,    stage_type: 'ganho'   },
      { name: 'Perdido',           color: C.vermelho, stage_type: 'perdido' },
    ],
  },
  {
    id:          'whatsapp',
    emoji:       '💬',
    name:        'Vendas por WhatsApp',
    description: 'Para quem vende na conversa: separa quem respondeu, quem se interessou e quem está só enrolando.',
    columns: [
      { name: 'Novo contato',        color: C.cinza,    stage_type: 'normal'  },
      { name: 'Respondeu',           color: C.azulC,    stage_type: 'normal'  },
      { name: 'Interessado',         color: C.azul,     stage_type: 'normal'  },
      { name: 'Orçamento enviado',   color: C.roxo,     stage_type: 'normal'  },
      { name: 'Aguardando resposta', color: C.ambar,    stage_type: 'normal'  },
      { name: 'Venda fechada',       color: C.verde,    stage_type: 'ganho'   },
      { name: 'Sem interesse',       color: C.vermelho, stage_type: 'perdido' },
    ],
  },
  {
    id:          'inbound',
    emoji:       '🧲',
    name:        'Inbound / marketing',
    description: 'Lead que chega sozinho pelo conteúdo ou anúncio, qualificado por MQL e SQL até a demonstração.',
    columns: [
      { name: 'Lead capturado', color: C.cinza,    stage_type: 'normal'  },
      { name: 'MQL',            color: C.azulC,    stage_type: 'normal'  },
      { name: 'SQL',            color: C.azul,     stage_type: 'normal'  },
      { name: 'Demonstração',   color: C.roxo,     stage_type: 'normal'  },
      { name: 'Proposta',       color: C.ambar,    stage_type: 'normal'  },
      { name: 'Cliente',        color: C.verde,    stage_type: 'ganho'   },
      { name: 'Descartado',     color: C.vermelho, stage_type: 'perdido' },
    ],
  },
  {
    id:          'onboarding',
    emoji:       '🤝',
    name:        'Pós-venda / onboarding',
    description: 'O que acontece depois do sim: boas-vindas, briefing e acessos até o cliente estar rodando.',
    columns: [
      { name: 'Contrato assinado', color: C.cinza, stage_type: 'normal' },
      { name: 'Boas-vindas',       color: C.azulC, stage_type: 'normal' },
      { name: 'Briefing',          color: C.azul,  stage_type: 'normal' },
      { name: 'Acessos',           color: C.roxo,  stage_type: 'normal' },
      { name: 'Ativo',             color: C.verde, stage_type: 'ganho'  },
    ],
  },
  {
    id:          'zero',
    emoji:       '✏️',
    name:        'Começar do zero',
    description: 'Uma coluna só. Você monta o funil do seu jeito, do nome à cor.',
    columns: [
      { name: 'Novos leads', color: C.azul, stage_type: 'normal' },
    ],
  },
]

// Cores oferecidas no seletor de cor da coluna
export const CRM_COLUMN_COLORS = [
  C.cinza, C.azulC, C.azul, C.roxo, C.ambar, C.verde, C.vermelho, '#0ea5e9', '#ec4899', '#14b8a6',
]

// Origens sugeridas no cadastro do lead (o campo aceita texto livre)
export const CRM_SOURCES = [
  'Indicação',
  'Instagram',
  'WhatsApp',
  'Prospecção ativa',
  'Tráfego pago',
  'Site',
  'Evento',
  'Formulário',
  'Outro',
]

// ── Motivos de perda ──────────────────────────────────────────────────────────
// Lista curta de propósito: com opções demais ninguém escolhe e tudo vira
// "Outro", e o relatório de motivos deixa de dizer alguma coisa.
export const CRM_LOST_REASONS = [
  'Preço acima do orçamento',
  'Fechou com outra agência',
  'Parou de responder',
  'Não é o momento',
  'Decidiu fazer internamente',
  'Fora do perfil atendido',
]

// ── Mensagens prontas de WhatsApp ─────────────────────────────────────────────
// Variáveis: {nome}, {primeiro_nome}, {empresa}, {agencia}. O banco usa as
// mesmas chaves nas automações, então um texto funciona nos dois lugares.
export const CRM_DEFAULT_MESSAGES = [
  {
    title: 'Primeiro contato',
    text:  'Oi, {primeiro_nome}! Aqui é da {agencia}. Vi que você se interessou pelos nossos serviços e queria entender melhor o momento da {empresa}. Podemos conversar rapidinho?',
  },
  {
    title: 'Agendar reunião',
    text:  '{primeiro_nome}, que tal marcarmos 20 minutos para eu te mostrar como podemos ajudar a {empresa}? Qual o melhor dia e horário para você?',
  },
  {
    title: 'Retorno da proposta',
    text:  'Oi, {primeiro_nome}! Conseguiu dar uma olhada na proposta que enviei? Fico à disposição para tirar qualquer dúvida.',
  },
  {
    title: 'Retomar contato',
    text:  'Oi, {primeiro_nome}, tudo bem? Passando para saber se ainda faz sentido conversarmos sobre o marketing da {empresa}.',
  },
]

// ── Modelo de contrato ────────────────────────────────────────────────────────
// Ponto de partida genérico para prestação de serviços de marketing. Não é
// orientação jurídica: a tela de configurações pede para revisar com um
// advogado antes do primeiro uso.
export const CRM_CONTRACT_VARIABLES: { key: string; label: string }[] = [
  { key: '{{cliente_nome}}',        label: 'Nome do contato' },
  { key: '{{cliente_empresa}}',     label: 'Empresa do cliente' },
  { key: '{{cliente_email}}',       label: 'E-mail do cliente' },
  { key: '{{cliente_whatsapp}}',    label: 'WhatsApp do cliente' },
  { key: '{{agencia_nome}}',        label: 'Nome da agência' },
  { key: '{{servicos}}',            label: 'Itens da proposta' },
  { key: '{{valor_total}}',         label: 'Valor total da proposta' },
  { key: '{{condicoes_pagamento}}', label: 'Condições de pagamento' },
  { key: '{{data_hoje}}',           label: 'Data de hoje' },
]

export const CRM_DEFAULT_CONTRACT = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARKETING DIGITAL

CONTRATADA: {{agencia_nome}}.
CONTRATANTE: {{cliente_empresa}}, representada por {{cliente_nome}}, com CPF/CNPJ e e-mail informados na assinatura eletrônica deste documento.

1. OBJETO
A CONTRATADA prestará à CONTRATANTE os seguintes serviços:
{{servicos}}

2. VALOR E PAGAMENTO
Pelos serviços, a CONTRATANTE pagará o valor de {{valor_total}}.
Condições de pagamento: {{condicoes_pagamento}}.

3. OBRIGAÇÕES DA CONTRATADA
a) Executar os serviços com qualidade e dentro dos prazos combinados;
b) Submeter os conteúdos à aprovação da CONTRATANTE antes da publicação;
c) Manter sigilo sobre as informações da CONTRATANTE a que tiver acesso.

4. OBRIGAÇÕES DA CONTRATANTE
a) Fornecer as informações, acessos e materiais necessários à execução dos serviços;
b) Aprovar ou solicitar ajustes nos conteúdos em até 2 (dois) dias úteis;
c) Efetuar os pagamentos nas datas acordadas.

5. VIGÊNCIA E RESCISÃO
Este contrato vigora por prazo indeterminado a partir da data da assinatura. Qualquer das partes pode encerrá-lo mediante aviso prévio de 30 (trinta) dias, por escrito.

6. RESULTADOS
Os serviços de marketing são obrigação de meio. A CONTRATADA não garante resultados específicos de alcance, seguidores ou vendas.

7. ASSINATURA ELETRÔNICA
As partes reconhecem a validade da assinatura eletrônica deste documento, nos termos da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020.

{{data_hoje}}.`

// ── Automações: catálogo ──────────────────────────────────────────────────────
// Os identificadores precisam bater com os CHECKs da migration 075. Rótulo e
// explicação ficam aqui porque só a tela precisa deles.

export const CRM_TRIGGERS: { id: CrmAutomationTrigger; label: string; hint: string; column?: boolean; days?: boolean }[] = [
  { id: 'lead_criado',          label: 'Um lead novo é cadastrado',          hint: 'Qualquer lead, cadastrado à mão ou pelo formulário.' },
  { id: 'lead_formulario',      label: 'Um lead preenche o formulário',      hint: 'Inclusive quem já era lead e preencheu de novo.' },
  { id: 'lead_entrou_etapa',    label: 'O lead entra numa etapa',            hint: 'Arrastado ou movido por outra automação.', column: true },
  { id: 'lead_parado',          label: 'O lead fica parado numa etapa',      hint: 'Verificado todo dia às 8h.', column: true, days: true },
  { id: 'proposta_visualizada', label: 'O cliente abre a proposta',          hint: 'Só a primeira vez que ele abre.' },
  { id: 'proposta_aceita',      label: 'O cliente aceita a proposta',        hint: 'O card já vai sozinho para a etapa de ganho.' },
  { id: 'proposta_recusada',    label: 'O cliente recusa a proposta',        hint: 'Com o motivo que ele escreveu.' },
  { id: 'contrato_assinado',    label: 'O cliente assina o contrato',        hint: 'Assinatura feita pelo link.' },
]

export const CRM_ACTIONS: { id: CrmAutomationAction; label: string; hint: string }[] = [
  { id: 'criar_tarefa',        label: 'Criar uma tarefa',                  hint: 'Aparece em Tarefas e na ficha do lead.' },
  { id: 'lembrete_whatsapp',   label: 'Me lembrar de mandar um WhatsApp',  hint: 'Você recebe a mensagem pronta e envia do seu número com um toque.' },
  { id: 'notificar',           label: 'Me avisar',                         hint: 'No sininho e no seu WhatsApp.' },
  { id: 'agendar_contato',     label: 'Agendar o próximo contato',         hint: 'Entra no lembrete diário na data certa.' },
  { id: 'mover_etapa',         label: 'Mover o lead para outra etapa',     hint: 'Bom para encadear com outras automações.' },
  { id: 'definir_temperatura', label: 'Mudar a temperatura do lead',       hint: 'Frio, morno ou quente.' },
]

// Receitas prontas: um clique cria a automação já preenchida
export const CRM_AUTOMATION_RECIPES: {
  name: string; trigger_type: CrmAutomationTrigger; action_type: CrmAutomationAction
  trigger_days?: number; action_params: Record<string, any>
}[] = [
  {
    name: 'Responder lead do formulário na hora',
    trigger_type: 'lead_formulario', action_type: 'lembrete_whatsapp',
    action_params: { message: CRM_DEFAULT_MESSAGES[0].text },
  },
  {
    name: 'Tarefa de primeiro contato',
    trigger_type: 'lead_criado', action_type: 'criar_tarefa',
    action_params: { title: 'Primeiro contato com {nome}', due_in_days: 0, priority: 'alta' },
  },
  {
    name: 'Ligar quando abrirem a proposta',
    trigger_type: 'proposta_visualizada', action_type: 'criar_tarefa',
    action_params: { title: 'Ligar para {nome}: acabou de abrir a proposta', due_in_days: 0, priority: 'urgente' },
  },
  {
    name: 'Cobrar retorno de lead parado',
    trigger_type: 'lead_parado', trigger_days: 5, action_type: 'lembrete_whatsapp',
    action_params: { message: CRM_DEFAULT_MESSAGES[3].text },
  },
  {
    name: 'Onboarding depois do contrato',
    trigger_type: 'contrato_assinado', action_type: 'criar_tarefa',
    action_params: { title: 'Iniciar onboarding de {empresa}', due_in_days: 1, priority: 'alta' },
  },
]
