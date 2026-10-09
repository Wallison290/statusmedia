export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  agency_name: string | null
  role: 'agency' | 'client'
  linked_client_id: string | null
  created_at: string
  updated_at: string
  is_admin?: boolean
  // Notificações via WhatsApp (Evolution API)
  whatsapp?: string | null
  whatsapp_opt_in?: boolean
  whatsapp_verified?: boolean
  whatsapp_prefs?: WhatsappPrefs | null
}

export type WhatsappCategory = 'aprovacoes' | 'tarefas' | 'instagram' | 'solicitacoes' | 'crm'
export type WhatsappPrefs = Record<WhatsappCategory, boolean>

export type ClientStatus =
  | 'lead'
  | 'proposta'
  | 'fechado'
  | 'onboarding'
  | 'ativo'
  | 'pausado'
  | 'encerrado'

export type FinancialStatus = 'ativo' | 'vence_em_breve' | 'atrasado' | 'cancelado'

export interface Client {
  id: string
  user_id: string
  company_name: string
  responsible_name: string
  niche: string
  instagram: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  main_objective: string | null
  target_audience: string | null
  tone_of_voice: string | null
  communication_style: string | null
  differentials: string | null
  services_offered: string | null
  forbidden_words: string | null
  observations: string | null
  logo_url: string | null
  brand_color_primary?: string | null    // legado: não é mais editada no cadastro
  brand_color_secondary?: string | null
  status: ClientStatus
  responsible_user_id: string | null
  entry_date: string
  valor_mensal: number | null
  dia_vencimento: number | null
  financial_status: FinancialStatus | null
  last_payment_date: string | null
  manual_status_override: boolean | null
  card_gradient?: string | null
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: string
  client_id: string
  title: string
  completed: boolean
  created_at: string
}

export interface ClientDocument {
  id: string
  client_id: string
  user_id: string
  name: string
  file_url: string
  file_type: string
  file_size: number | null
  created_at: string
}

export interface BriefingData {
  // Empresa
  como_nasceu?: string
  servicos_mais_vende?: string
  servicos_quer_vender?: string
  diferencial_empresa?: string
  concorrentes?: string
  regiao_atendida?: string
  // Público
  quem_compra_hoje?: string
  quem_quer_atrair?: string
  maior_dor?: string
  gatilho_decisao?: string
  // Marketing
  rodou_trafego_pago?: boolean
  teve_agencia?: boolean
  o_que_funcionou?: string
  o_que_nao_funcionou?: string
  // Objetivos
  obj_mais_leads?: boolean
  obj_mais_vendas?: boolean
  obj_autoridade?: boolean
  obj_crescimento_instagram?: boolean
  obj_posicionamento_premium?: boolean
}

export interface ClientBriefing {
  id: string
  client_id: string
  data: BriefingData
  created_at: string
  updated_at: string
}

export interface BrandDNA {
  id: string
  client_id: string
  how_brand_speaks: string | null
  how_brand_not_speaks: string | null
  positioning: string | null
  ideal_language: string | null
  mental_triggers: string | null
  communication_style: string | null
  created_at: string
  updated_at: string
}

export type ContentType =
  | 'post'
  | 'carrossel'
  | 'reels'
  | 'story'
  | 'educativo'
  | 'venda'
  | 'autoridade'
  | 'engajamento'

export type ContentObjective =
  | 'atrair_atencao'
  | 'engajar'
  | 'gerar_autoridade'
  | 'gerar_leads'
  | 'vender'

export type ContentStatus =
  | 'gerado'
  | 'editado'
  | 'aprovado'
  | 'publicado'
  | 'arquivado'

export interface Content {
  id: string
  user_id: string
  client_id: string | null
  term: string
  objective: ContentObjective
  content_type: ContentType
  tone_of_voice: string
  caption_size: 'curto' | 'medio' | 'longo'
  include_emojis: boolean
  include_hashtags: boolean
  additional_notes: string | null
  title: string | null
  subtitle: string | null
  caption: string | null
  cta: string | null
  hashtags: string | null
  keywords: string | null
  visual_suggestion: string | null
  carousel_ideas: string | null
  video_script: string | null
  status: ContentStatus
  version: number
  created_at: string
  updated_at: string
  client?: Client
}

export type PlannerStatus =
  | 'ideia'
  | 'producao'
  | 'revisao'
  | 'aprovado'
  | 'publicado'

export type ApprovalStatus =
  | 'pendente_aprovacao'
  | 'aprovado'
  | 'ajuste_solicitado'
  | 'ajuste_realizado'
  | 'reprovado'

export interface PlannerAttachment {
  id: string
  planner_id: string
  user_id: string
  file_name: string
  file_type: string
  file_url: string
  file_size: number | null
  sort_order: number
  is_ig_media: boolean
  created_at: string
}

export interface PlannerLink {
  id: string
  planner_id: string
  user_id: string
  url: string
  label: string | null
  created_at: string
}

export interface PlannerItem {
  id: string
  user_id: string
  client_id: string | null
  content_id: string | null
  title: string
  content_type: ContentType
  scheduled_date: string
  scheduled_time?: string | null
  status: PlannerStatus
  notes: string | null
  // Controle de envio ao cliente
  sent_to_client?: boolean | null
  // Aprovação geral (legado + calculada)
  approval_status: ApprovalStatus | null
  client_feedback: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  // Aprovação separada — Arte (imagem/vídeo)
  art_approval_status?: ApprovalStatus | null
  art_feedback?: string | null
  // Aprovação separada — Copy (texto/legenda)
  copy_approval_status?: ApprovalStatus | null
  copy_feedback?: string | null
  asset_id?: string | null
  ig_post_type?: 'IMAGE' | 'CAROUSEL_ALBUM' | 'REELS' | null
  ig_scheduled?: boolean
  created_at: string
  updated_at: string
  client?: Client
  attachments?: PlannerAttachment[]
  links?: PlannerLink[]
}

export type TaskStatus = 'a_fazer' | 'em_andamento' | 'revisao' | 'concluido'
export type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente'

export interface TaskLink {
  id:    string
  label: string
  url:   string
  type:  'link' | 'imagem' | 'video' | 'arquivo' | 'pasta'
}

export interface Task {
  id: string
  user_id: string
  client_id: string | null
  title: string
  description: string | null
  due_date: string | null
  due_time: string | null
  priority: TaskPriority
  status: TaskStatus
  assignee: string | null
  assignee_id?: string | null
  collaborator_note: string | null
  delivery_url: string | null
  task_links: TaskLink[] | null
  crm_lead_id?: string | null
  created_at: string
  updated_at: string
  client?: Client
}

export type LibraryCategory = 'ideia' | 'gancho' | 'cta' | 'template'

export interface LibraryItem {
  id: string
  user_id: string
  category: LibraryCategory
  title: string
  content: string
  niche: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

export interface ContentGeneratorForm {
  client_id: string | null
  term: string
  objective: ContentObjective
  content_type: ContentType
  tone_of_voice: string
  caption_size: 'curto' | 'medio' | 'longo'
  include_emojis: boolean
  include_hashtags: boolean
  additional_notes: string
}

export interface GeneratedContent {
  title: string
  subtitle: string
  caption: string
  cta: string
  hashtags: string
  keywords: string
  visual_suggestion: string
  carousel_ideas: string
  video_script: string
}

export interface ContentAsset {
  id: string
  user_id: string
  client_id: string | null       // null = library-only (sem cliente)
  category: string | null        // tag livre de organização
  title: string
  caption: string | null
  content_type: ContentType
  media_url: string | null
  link_url?: string | null
  observations: string | null
  created_at: string
  updated_at: string
  // joined
  client?: { id: string; company_name: string }
}

export type MaterialType = 'pdf' | 'imagem' | 'video' | 'link' | 'documento' | 'outro'
export type ContactType = 'whatsapp' | 'email' | 'telefone' | 'outro'

export interface ClientMaterial {
  id: string
  user_id: string
  client_id: string
  title: string
  description: string | null
  type: MaterialType
  file_url: string | null
  link_url: string | null
  file_size: number | null
  folder_name: string | null   // organização em pastas (requer migration)
  created_at: string
  updated_at: string
}

export type ClientMaterialWithClient = ClientMaterial & {
  client?: { id: string; company_name: string }
}

export interface ClientSupportContact {
  id: string
  user_id: string
  client_id: string
  name: string
  role: string | null
  contact_type: ContactType
  contact_value: string
  direct_link: string | null
  created_at: string
}

export type ReportAttachmentType = 'imagem' | 'pdf' | 'link'

export interface ReportAttachment {
  id: string
  report_id: string
  user_id: string
  type: ReportAttachmentType
  title: string
  description: string | null
  file_url: string | null
  link_url: string | null
  file_size: number | null
  created_at: string
}

export interface IgTopPost {
  id: string
  permalink: string | null
  thumbnail: string | null
  media_type: string | null
  caption: string | null
  likes: number
  comments: number
  reach: number | null
}

export interface IgReportData {
  profile_views: number | null
  accounts_engaged: number | null
  interactions: {
    likes: number | null
    comments: number | null
    saves: number | null
    shares: number | null
  } | null
  top_posts: IgTopPost[]
  demographics: {
    gender: Record<string, number> | null
    age: Record<string, number> | null
    cities: { name: string; value: number }[] | null
  } | null
  synced_at?: string
}

export interface ClientReport {
  id: string
  client_id: string
  user_id: string
  month: number
  year: number
  followers_start: number | null
  followers_end: number | null
  reach: number | null
  engagement: number | null
  impressions: number | null
  posts_published: number | null
  paid_investment: number | null
  paid_leads: number | null
  paid_cpl: number | null
  paid_conversions: number | null
  paid_roas: number | null
  analysis_text: string | null
  auto_generated?: boolean
  ig_synced_at?: string | null
  ig_data?: IgReportData | null
  created_at: string
  updated_at: string
  attachments?: ReportAttachment[]
}

export type NotificationType =
  | 'NEW_CONTENT'
  | 'APPROVAL_REQUEST'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMMENT'
  | 'ADJUSTMENT_DONE'

export interface Notification {
  id: string
  user_id: string
  client_id: string | null
  type: NotificationType
  title: string
  message: string
  link: string | null
  is_read: boolean
  created_at: string
}

export interface NoteChecklistItem {
  id: string
  text: string
  done: boolean
}

export type NoteType   = 'interna' | 'ideia' | 'solicitacao'
export type NoteOrigin = 'agency' | 'client'

export interface Note {
  id: string
  user_id: string
  client_id: string | null
  type: NoteType
  origin: NoteOrigin
  title: string
  content: string | null
  checklist: NoteChecklistItem[]
  created_at: string
  updated_at: string
  client?: { id: string; company_name: string }
}

export interface DashboardStats {
  total_clients: number
  contents_this_week: number
  pending_tasks: number
  overdue_tasks: number
  contents_in_production: number
  active_clients: number
}

// ── CRM (funil comercial) ─────────────────────────────────────────────────────

export type CrmStageType = 'normal' | 'ganho' | 'perdido'

export type CrmTemperature = 'frio' | 'morno' | 'quente'

export interface CrmColumn {
  id:         string
  user_id:    string
  name:       string
  color:      string
  position:   number
  stage_type: CrmStageType
  win_probability?: number | null   // 0-100: previsão de vendas
  created_at: string
  updated_at: string
}

export interface CrmLead {
  id:                  string
  user_id:             string
  column_id:           string
  position:            number
  name:                string
  company:             string | null
  whatsapp:            string | null
  email:               string | null
  instagram:           string | null
  source:              string | null
  estimated_value:     number | null
  estimated_cost?:     number | null   // custos/taxas do serviço; líquido = valor - custo
  awaiting_reply_since?: string | null  // o lead respondeu e espera a agência
  opted_out_at?:       string | null    // pediu para não receber mais mensagens
  meeting_at?:         string | null
  meeting_reminded_at?: string | null
  tags?:               string[]
  custom?:             Record<string, string | number | boolean | null>
  renewal_at?:         string | null    // pós-venda: data de renovação do contrato
  temperature:         CrmTemperature | null
  responsible_user_id: string | null
  next_contact_at:     string | null
  notes:               string | null
  converted_client_id: string | null
  archived_at:         string | null
  lost_reason:         string | null
  stage_entered_at:    string
  closed_at:           string | null
  created_at:          string
  updated_at:          string
  // Follow-up automático (migration 080)
  followup_paused?:    boolean
  followup_offer_id?:  string | null
  followup_done?:      number[]
  followup_last_at?:   string | null
}

/** Briefing do que a agência vende: base das mensagens do follow-up automático. */
export interface CrmOffer {
  id:         string
  user_id:    string
  name:       string
  product:    string | null
  audience:   string | null
  problem:    string | null
  solution:   string | null
  price:      string | null
  proof:      string | null
  tips:       string | null
  tone:       string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

/** Mensagem da conversa de WhatsApp com o lead. */
export interface CrmMessage {
  id:            string
  lead_id:       string
  direction:     'in' | 'out'
  text:          string
  source:        'whatsapp' | 'sistema' | 'followup'
  followup_step: number | null
  sent_at:       string
}

/** Tipos que a agência registra à mão; os demais o banco grava sozinho. */
export type CrmManualActivityKind = 'nota' | 'ligacao' | 'whatsapp' | 'reuniao' | 'email'

export type CrmActivityKind =
  | CrmManualActivityKind
  | 'criado' | 'etapa' | 'ganho' | 'perdido' | 'reaberto'
  | 'arquivado' | 'restaurado' | 'convertido'
  | 'tarefa' | 'tarefa_concluida'
  | 'proposta' | 'contrato' | 'captura' | 'automacao'

export interface CrmActivity {
  id:         string
  user_id:    string
  lead_id:    string
  kind:       CrmActivityKind
  content:    string | null
  meta:       Record<string, any>
  created_at: string
}

export interface CrmProposalItem {
  description: string
  details?:    string
  quantity:    number
  unit_price:  number
  recurring?:  boolean   // mensal: aparece como "/mês" para o cliente
}

export type CrmProposalStatus = 'rascunho' | 'enviada' | 'visualizada' | 'aceita' | 'recusada'

export interface CrmProposal {
  id:             string
  user_id:        string
  lead_id:        string | null
  title:          string
  intro:          string | null
  items:          CrmProposalItem[]
  discount:       number
  total:          number
  valid_until:    string | null
  payment_terms:  string | null
  internal_notes: string | null
  status:         CrmProposalStatus
  public_token:   string
  sent_at:        string | null
  viewed_at:      string | null
  view_count:     number
  responded_at:   string | null
  responder_name: string | null
  reject_reason:  string | null
  content_hash:   string | null
  response_meta:  Record<string, any> | null
  created_at:     string
  updated_at:     string
}

export type CrmContractStatus = 'rascunho' | 'enviado' | 'assinado' | 'cancelado'

export interface CrmContract {
  id:                 string
  user_id:            string
  lead_id:            string | null
  proposal_id:        string | null
  title:              string
  content:            string
  status:             CrmContractStatus
  public_token:       string
  agency_signer_name: string | null
  agency_signature:   string | null
  agency_signed_at:   string | null
  sent_at:            string | null
  viewed_at:          string | null
  signer_name:        string | null
  signer_document:    string | null
  signer_email:       string | null
  signature:          string | null
  signed_at:          string | null
  content_hash:       string | null
  sign_meta:          Record<string, any> | null
  created_at:         string
  updated_at:         string
}

export interface CrmMessageTemplate {
  title: string
  text:  string
}

/** Campo personalizado do lead, definido pela agência. */
export interface CrmCustomField {
  key:   string
  label: string
  type:  'text' | 'number' | 'bool'
}

export interface CrmSettings {
  user_id:             string
  daily_digest:        boolean
  goal_monthly_value:  number | null
  goal_monthly_deals:  number | null
  message_templates:   CrmMessageTemplate[] | null
  contract_template:   string | null
  proposal_defaults:   { valid_days?: number; payment_terms?: string; intro?: string }
  capture_enabled:     boolean
  capture_token:       string
  capture_column_id:   string | null
  capture_title:       string | null
  capture_description: string | null
  capture_thanks:      string | null
  brand_color:         string | null   // #RRGGBB: cor da agência nas páginas do cliente
  brand_logo_url:      string | null
  followup_enabled?:   boolean
  meeting_reminder?:   boolean
  custom_fields?:      CrmCustomField[]
  followup_columns?:   Record<string, string>  // degrau -> etapa do funil ("none" = não mover)
  wa_first_contact_label?:      string | null   // id da etiqueta do WhatsApp Business
  wa_first_contact_label_name?: string | null
  created_at:          string
  updated_at:          string
}

export type CrmAutomationTrigger =
  | 'lead_criado' | 'lead_formulario' | 'lead_entrou_etapa' | 'lead_parado'
  | 'proposta_visualizada' | 'proposta_aceita' | 'proposta_recusada' | 'contrato_assinado'

export type CrmAutomationAction =
  | 'criar_tarefa' | 'notificar' | 'lembrete_whatsapp'
  | 'mover_etapa' | 'agendar_contato' | 'definir_temperatura'

export interface CrmAutomation {
  id:                string
  user_id:           string
  name:              string
  is_active:         boolean
  trigger_type:      CrmAutomationTrigger
  trigger_column_id: string | null
  trigger_days:      number | null
  action_type:       CrmAutomationAction
  action_params:     Record<string, any>
  run_count:         number
  last_run_at:       string | null
  last_error:        string | null
  created_at:        string
  updated_at:        string
}
