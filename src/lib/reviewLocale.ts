// ── Modo inglês (App Review da Meta) ──────────────────────────────────────────
// A Meta reprovou o App Review pedindo a interface em inglês no screencast e
// para o revisor testar. O app inteiro é escrito em português e não tem i18n;
// em vez de espalhar t() por dezenas de componentes, este módulo traduz o texto
// já renderizado, por dicionário, e só liga com ?lang=en.
//
// - ?lang=en liga e fica salvo no navegador (sobrevive ao retorno do OAuth do
//   Instagram, que volta sem o parâmetro); ?lang=pt desliga.
// - Desligado, nada roda: clientes reais nunca passam por aqui.
// - Só troca nodeValue de nós de texto e atributos (placeholder/title/aria-label);
//   não cria nem remove nós, então o React continua dono da árvore.
// - Texto que não está no dicionário fica em português. Ao mexer nas telas do
//   fluxo do Instagram (login, sidebar, Instagram, Planejamento, Clientes,
//   Resultados), acrescente aqui os textos novos.

const STORAGE_KEY = 'sm_lang'

const DICT: Record<string, string> = {
  // ── Landing ────────────────────────────────────────────────────────────────
  'Entrar': 'Sign in',
  'Testar 3 dias': 'Try 3 days',
  'Começar teste de 3 dias': 'Start 3-day trial',
  'Para agências e social medias': 'For agencies and social media managers',
  'A agência': 'The whole',
  'inteira sob': 'agency under',
  'controle.': 'control.',
  'Planejamento, aprovação do cliente, Instagram, CRM, contratos e financeiro num só lugar. Sem pular entre planilha, Drive, Trello e grupo de WhatsApp.':
    'Planning, client approval, Instagram, CRM, contracts and finance in one place. No more jumping between spreadsheets, Drive, Trello and WhatsApp groups.',
  'Ver a plataforma por dentro': 'See the platform inside',
  '3 dias de teste': '3-day trial',
  'Sem fidelidade': 'No lock-in',
  'Dados protegidos': 'Protected data',
  'O problema': 'The problem',
  'Você não tem um problema de produção. Tem um problema de': "You don't have a production problem. You have a problem of",
  'A equipe passa mais tempo coordenando do que executando. E cada aba a mais é um pedaço da agência que escapa.':
    'The team spends more time coordinating than doing. And every extra tab is a piece of the agency slipping away.',
  'A plataforma': 'The platform',
  'Do primeiro contato ao post publicado.': 'From first contact to published post.',
  'Cada cliente com o próprio espaço: briefing, arquivos, calendário, aprovações e histórico. Nada se perde entre um mês e outro.':
    'Each client has its own space: briefing, files, calendar, approvals and history. Nothing gets lost from one month to the next.',
  'Planejamento editorial': 'Editorial planning',
  'O mês inteiro de cada cliente numa tela. Arte, legenda, anexos e comentários no mesmo lugar do post.':
    "Each client's whole month on one screen. Artwork, caption, attachments and comments in the same place as the post.",
  'O cliente aprova sozinho': 'The client approves on their own',
  'Portal próprio para cada cliente: vê o carrossel inteiro, aprova ou pede ajuste. Tudo registrado.':
    'A portal for each client: they see the whole carousel, approve or request changes. Everything is recorded.',
  'Publica no Instagram': 'Publishes to Instagram',
  'Aprovou, está agendado. A publicação sai sozinha na data marcada.':
    'Once approved and scheduled, the post is published at the date the user chose.',
  'CRM para vender': 'CRM to sell',
  'Funil de leads, lembrete dos retornos do dia e formulário que joga o lead direto no funil.':
    "Lead pipeline, reminders of the day's follow-ups and a form that drops leads straight into the pipeline.",
  'Proposta aceita pelo link. Contrato assinado pelo celular.': 'Proposal accepted by link. Contract signed on the phone.',
  'E ainda': 'And also',
  'Como funciona': 'How it works',
  'Três passos. No primeiro dia.': 'Three steps. On day one.',
  'WhatsApp da agência': "Agency's WhatsApp",
  'Os avisos saem do': 'Notifications come from',
  'seu': 'your',
  'número.': 'number.',
  'Planos': 'Plans',
  'Do tamanho da sua operação.': 'Sized to your operation.',
  '/mês': '/month',
  'Começar com o': 'Start with',
  'Dúvidas': 'FAQ',
  'Antes de assinar.': 'Before subscribing.',
  'Organize. Produza.': 'Organize. Produce.',
  'Escale.': 'Scale.',
  'Organize. Produza. Escale.': 'Organize. Produce. Scale.',
  'Testar 3 dias grátis': 'Try 3 days free',
  'Sem fidelidade. Cancela quando quiser.': 'No lock-in. Cancel anytime.',
  'A operação inteira da agência num só lugar.': "The agency's entire operation in one place.",
  'Produto': 'Product',
  'Acesso': 'Access',
  'Privacidade': 'Privacy',
  'Termos de uso': 'Terms of use',
  'Voltar ao topo': 'Back to top',
  'Fechar menu': 'Close menu',
  'Abrir menu': 'Open menu',
  'Plataforma': 'Platform',
  'Portal do cliente': 'Client portal',
  'Funil comercial': 'Sales pipeline',
  'Aprovar': 'Approve',
  'Pedir ajuste': 'Request changes',
  'Tarefas e equipe': 'Tasks and team',
  'Relatórios mensais do Instagram': 'Monthly Instagram reports',
  'Financeiro e cobrança': 'Finance and billing',
  'Feed do perfil': 'Profile feed',
  'Biblioteca de conteúdo': 'Content library',
  'Formulário semanal do cliente': 'Weekly client form',
  'Notas por cliente': 'Notes per client',
  'Cadastre o cliente': 'Add the client',
  'Briefing, arquivos, tom de voz e acessos num espaço só dele. O cliente recebe o convite para o portal.':
    'Briefing, files, tone of voice and logins in a space of its own. The client gets an invite to the portal.',
  'Planeje e aprove': 'Plan and approve',
  'Monte o mês no calendário. O cliente aprova pelo portal e você é avisado no WhatsApp.':
    'Build the month on the calendar. The client approves in the portal and you are notified on WhatsApp.',
  'Publique e cresça': 'Publish and grow',
  'Posts saem sozinhos no Instagram, o relatório do mês fica pronto e o CRM traz os próximos clientes.':
    'Scheduled posts go out to Instagram, the monthly report is ready and the CRM brings the next clients.',
  'Ferramentas que a StatusMedia substitui': 'Tools StatusMedia replaces',

  // ── Login ──────────────────────────────────────────────────────────────────
  'Bem-vindo de volta.': 'Welcome back.',
  'Esqueci minha senha': 'Forgot my password',
  'Não tem conta?': "Don't have an account?",
  'Criar conta': 'Create account',
  'É cliente da agência?': "Are you an agency's client?",
  'Crie seu acesso ao portal do cliente': 'Create your client portal access',
  'Criar acesso': 'Create access',
  'StatusMedia. Todos os direitos reservados.': 'StatusMedia. All rights reserved.',
  'Entrando...': 'Signing in...',
  'Senha': 'Password',
  'voce@suaagencia.com.br': 'you@youragency.com',

  // ── Sidebar, header, menu, banners ─────────────────────────────────────────
  'Clientes': 'Clients',
  'Feed do Perfil': 'Profile Feed',
  'Relatórios': 'Reports',
  'Produção': 'Production',
  'Planejamento': 'Planner',
  'Tarefas': 'Tasks',
  'Biblioteca': 'Library',
  'Notas': 'Notes',
  'Canais': 'Channels',
  'Agência': 'Agency',
  'Financeiro': 'Finance',
  'Equipe': 'Team',
  'Armazenamento': 'Storage',
  'Sair': 'Sign out',
  'em breve': 'soon',
  'Em breve': 'Coming soon',
  'Este recurso ainda está em desenvolvimento e será liberado em breve.': 'This feature is still in development and will be released soon.',
  'Expandir menu': 'Expand menu',
  'Recolher menu': 'Collapse menu',
  'Assine agora →': 'Subscribe now →',
  'Não mostrar mais': "Don't show again",
  'Fechar': 'Close',
  'Conectar agora': 'Connect now',
  'Os avisos para você e para os seus clientes não estão saindo pelo WhatsApp.': 'Notifications to you and your clients are not being sent over WhatsApp.',
  'Seu período de teste termina hoje.': 'Your trial ends today.',
  'WhatsApp desconectado': 'WhatsApp disconnected',
  'WhatsApp não conectado': 'WhatsApp not connected',
  'O WhatsApp da agência está desconectado.': "The agency's WhatsApp is disconnected.",
  'O WhatsApp da agência ainda não foi conectado.': "The agency's WhatsApp has not been connected yet.",
  'Meu Perfil': 'My Profile',
  'Clique para alterar a foto': 'Click to change the photo',
  'Nome completo': 'Full name',
  'Nome da agência': 'Agency name',
  'Plano': 'Plan',
  'Aparência da interface': 'Interface appearance',
  'Perfil atualizado!': 'Profile updated!',
  'Bom dia': 'Good morning',
  'Boa tarde': 'Good afternoon',
  'Boa noite': 'Good evening',
  'Usuário': 'User',
  'Tema Claro': 'Light Theme',
  'Tema Escuro': 'Dark Theme',
  'Seu nome': 'Your name',
  'Nome da sua agência': 'Your agency name',
  'Foto, nome e agência': 'Photo, name and agency',
  'Assinatura': 'Subscription',
  'Planos, upgrade e cobrança': 'Plans, upgrade and billing',
  'Alterar Senha': 'Change Password',
  'Enviar e-mail de redefinição': 'Send reset email',
  'Suporte': 'Support',
  'Falar no WhatsApp': 'Chat on WhatsApp',
  'Comunidade': 'Community',
  'Novidades, atualizações e feedbacks': 'News, updates and feedback',
  'Encerrar sessão': 'End session',

  // ── Dashboard ──────────────────────────────────────────────────────────────
  'Período personalizado': 'Custom period',
  'Data inicial': 'Start date',
  'Data final': 'End date',
  'Aplicar': 'Apply',
  'Abrir planejamento': 'Open planner',
  'Nada no calendário neste período.': 'Nothing on the calendar in this period.',
  'Criar um post': 'Create a post',
  'Agenda': 'Schedule',
  'Dia livre no calendário.': 'Free day on the calendar.',
  'Operação': 'Operations',
  'Receita mensal recorrente': 'Monthly recurring revenue',
  'do MRR já recebido este mês': 'of MRR already received this month',
  'Conteúdo': 'Content',
  'Ver detalhes': 'View details',
  'no planejamento →': 'in the planner →',
  'Dia': 'Day',
  'Semana': 'Week',
  'Mês': 'Month',
  'Ano': 'Year',
  'post agendado no período': 'post scheduled in the period',
  'posts agendados no período': 'posts scheduled in the period',
  'Hoje': 'Today',
  'Recebido': 'Received',
  'pago no mês atual': 'paid in the current month',
  'A receber': 'Receivable',
  'vence em breve': 'due soon',
  'Em atraso': 'Overdue',
  'Ticket médio': 'Average ticket',
  'por cliente ativo': 'per active client',
  'você': 'you',
  'Aguardando aprovação': 'Awaiting approval',
  'Aguardando': 'Waiting',
  'posts com o cliente, esperando resposta': 'posts with the client, awaiting reply',
  'nada parado com o cliente': 'nothing pending with the client',
  'Ajustes pedidos': 'Changes requested',
  'Ajustes': 'Changes',
  'o cliente pediu correções': 'the client requested changes',
  'nenhum ajuste pendente': 'no pending changes',
  'Fila do Instagram': 'Instagram queue',
  'Na fila': 'Queued',
  'agendados para o período': 'scheduled for the period',
  'nada agendado no período': 'nothing scheduled in the period',
  'no Instagram, no período': 'on Instagram, in the period',
  'nada publicado ainda': 'nothing published yet',
  'Leads novos': 'New leads',
  'Novos': 'New',
  'entraram no funil no período': 'entered the pipeline in the period',
  'nenhum lead novo no período': 'no new leads in the period',
  'Contatos feitos': 'Contacts made',
  'Contatos': 'Contacts',
  'leads que receberam mensagem pelo CRM': 'leads messaged through the CRM',
  'Follow-ups automáticos': 'Automatic follow-ups',
  'Negócios fechados': 'Deals closed',
  'Fechados': 'Closed',
  'nenhum fechamento ainda': 'no deals closed yet',
  'Aprovados no período': 'Approved in the period',
  'Tarefas em aberto': 'Open tasks',
  'Tarefas atrasadas': 'Overdue tasks',
  'Clientes ativos': 'Active clients',
  'Ver métricas de conteúdo': 'View content metrics',
  'Ver métricas do CRM': 'View CRM metrics',
  'Andamento do CRM': 'CRM progress',
  'Conteúdo e Instagram': 'Content and Instagram',
  'O período': 'The period',
  'onde cada post está': 'where each post is',
  'ciclo atual': 'current cycle',

  // ── Instagram ──────────────────────────────────────────────────────────────
  'Tentativa': 'Attempt',
  'Tentar novamente': 'Try again',
  'Cancelar': 'Cancel',
  'Ver no Instagram': 'View on Instagram',
  'Data': 'Date',
  'Horário': 'Time',
  'Salvar': 'Save',
  'Desconectar esta conta?': 'Disconnect this account?',
  'Sim': 'Yes',
  'Não': 'No',
  'Desconectar': 'Disconnect',
  'Nenhum post aqui': 'No posts here',
  'Ainda não há posts nesta categoria para esta conta.': 'There are no posts in this category for this account yet.',
  'Conectar Instagram': 'Connect Instagram',
  'Escolha de qual cliente é a conta profissional que você vai conectar. Você será levado ao Instagram para autorizar o acesso.':
    'Choose which client owns the professional account you are about to connect. You will be taken to Instagram to authorize access.',
  'Você ainda não tem clientes cadastrados.': "You don't have any clients yet.",
  'Cadastre um cliente antes de conectar o Instagram dele.': "Add a client before connecting their Instagram.",
  'Novo cliente': 'New client',
  'É preciso que a conta seja Business ou Creator. Ao autorizar, o StatusMedia passa a ler o perfil, publicar os conteúdos que você agendar e consultar as métricas para os relatórios. Você pode desconectar quando quiser.':
    'The account must be Business or Creator. Once you authorize, StatusMedia reads the profile, publishes the content you schedule and reads the metrics for the reports. You can disconnect at any time.',
  'Atualizar': 'Refresh',
  'Contas conectadas': 'Connected accounts',
  'Nenhuma conta conectada': 'No connected accounts',
  'Conecte a conta Business ou Creator de um cliente para agendar publicações e gerar relatórios.':
    "Connect a client's Business or Creator account to schedule posts and generate reports.",
  'Ir para Clientes': 'Go to Clients',
  'seguidores': 'followers',
  'ag.': 'sch.',
  'pub.': 'pub.',
  'Reconectar Instagram': 'Reconnect Instagram',
  'A conexão com o Instagram expirou. Reconecte a conta para voltar a publicar.': 'The Instagram connection expired. Reconnect the account to publish again.',
  'A renovação automática não conseguiu estender esta conexão. Reconecte a conta.': 'Automatic renewal could not extend this connection. Reconnect the account.',
  'Imagem': 'Image',
  'Carrossel': 'Carousel',
  'Agendado': 'Scheduled',
  'Publicando': 'Publishing',
  'Publicado': 'Published',
  'Falhou': 'Failed',
  'Cancelado': 'Cancelled',
  'Todos': 'All',
  'Agendados': 'Scheduled',
  'Publicados': 'Published',
  'Falhas': 'Failed',
  'Cancelados': 'Cancelled',
  'às': 'at',
  'Editar data': 'Edit date',
  'Já conectado — reconectar': 'Already connected — reconnect',
  'Conectar conta profissional': 'Connect professional account',
  'Instagram conectado com sucesso!': 'Instagram connected successfully!',
  'Limite de perfis do seu plano atingido. Faça upgrade para conectar mais contas.': "Your plan's profile limit was reached. Upgrade to connect more accounts.",
  'Não foi possível conectar o Instagram. Tente novamente.': 'Could not connect Instagram. Please try again.',
  'Cancelar este post agendado?': 'Cancel this scheduled post?',
  'Post cancelado': 'Post cancelled',
  'Post recolocado na fila — será publicado em instantes.': 'Post re-queued — it will be published in a moment.',
  'Não foi possível reagendar o post.': 'Could not reschedule the post.',
  'Agendamento atualizado!': 'Schedule updated!',
  'Não foi possível alterar a data.': 'Could not change the date.',
  'Detalhes da conta selecionada': 'Selected account details',
  'Selecione uma conta para ver os detalhes': 'Select an account to see the details',
  'Publicação': 'Publishing',
  'Desconectar conta': 'Disconnect account',

  // ── Planner ────────────────────────────────────────────────────────────────
  'A agência corrigiu o conteúdo e está aguardando sua aprovação.': 'The agency revised the content and is awaiting your approval.',
  'A plataforma não publica stories no Instagram. Mesmo aprovado pelo cliente, este item não entra no agendamento — publique o story direto pelo aplicativo.':
    'The platform does not publish stories to Instagram. Even when approved by the client, this item is not scheduled — publish the story directly in the app.',
  'A plataforma não publica stories no Instagram. Mesmo com a aprovação do cliente, este item não entra no agendamento — publique o story direto pelo aplicativo.':
    'The platform does not publish stories to Instagram. Even with client approval, this item is not scheduled — publish the story directly in the app.',
  'Acesse o perfil do cliente → aba': "Open the client's profile → tab",
  'Adicionar ao Planejamento': 'Add to Planner',
  'Adicionar novo post neste dia': 'Add a new post on this day',
  'Agendando...': 'Scheduling...',
  'Agendar no Instagram': 'Schedule on Instagram',
  '"Agendar no Instagram"': '"Schedule on Instagram"',
  'Aguardando nova aprovação do cliente': 'Awaiting new client approval',
  'Ajuste concluído': 'Change completed',
  'Ajuste de Arte marcado como realizado.': 'Artwork change marked as done.',
  'Ajuste de Copy marcado como realizado.': 'Copy change marked as done.',
  'Ajuste marcado como realizado.': 'Change marked as done.',
  'Ajuste realizado pela agência': 'Change made by the agency',
  'Ajuste realizado — aguardando revisão': 'Change made — awaiting review',
  'Ajuste realizado': 'Change made',
  'Ajuste solicitado': 'Change requested',
  'Ajustes pendentes': 'Pending changes',
  'Anexos': 'Attachments',
  'Aprovado e agendado': 'Approved and scheduled',
  'Aprovado pelo cliente': 'Approved by client',
  'Aprovado': 'Approved',
  'Aprovados': 'Approved',
  'Arraste para reordenar': 'Drag to reorder',
  'Arsenal do cliente': "Client's content bank",
  'Arte': 'Artwork',
  'Buscar por título...': 'Search by title...',
  'Calendário': 'Calendar',
  'Capa': 'Cover',
  'Cliente': 'Client',
  'Cliente:': 'Client:',
  'Clique para anexar arquivos': 'Click to attach files',
  'Comentários': 'Comments',
  'Conectado': 'Connected',
  'Confirmar exclusão?': 'Confirm deletion?',
  'Contexto, referências...': 'Context, references...',
  'Conteúdo aguardando aprovação': 'Content awaiting approval',
  'Conteúdo reprovado': 'Content rejected',
  'Crie posts no calendário para visualizar o feed': 'Create posts on the calendar to preview the feed',
  'Data *': 'Date *',
  'Dom': 'Sun',
  'Seg': 'Mon',
  'Ter': 'Tue',
  'Qua': 'Wed',
  'Qui': 'Thu',
  'Sex': 'Fri',
  'Sáb': 'Sat',
  'Editar Post': 'Edit Post',
  'Editar status': 'Edit status',
  'Editar': 'Edit',
  'Edite o post e adicione as mídias na seção "Publicação no Instagram".': 'Edit the post and add the media in the "Instagram publishing" section.',
  'Edite o post e selecione o tipo (Imagem, Carrossel ou Reel) para poder agendar.': 'Edit the post and choose the type (Image, Carousel or Reel) to be able to schedule it.',
  'Enviando': 'Sending',
  'Enviando...': 'Sending...',
  'Enviar ao cliente': 'Send to client',
  'Enviar mensagem': 'Send message',
  'Erro ao agendar.': 'Error while scheduling.',
  'Erro ao enviar.': 'Error while sending.',
  'Este post não está vinculado a um cliente.': 'This post is not linked to a client.',
  'Este post não tem mídia anexada.': 'This post has no media attached.',
  'Ex: Post sobre tendências...': 'E.g.: Post about trends...',
  'Excluir item': 'Delete item',
  'Excluir': 'Delete',
  'Grupos': 'Groups',
  'Hora (opcional)': 'Time (optional)',
  'Ideia': 'Idea',
  'Instagram não conectado': 'Instagram not connected',
  'Instagram → Agendados': 'Instagram → Scheduled',
  'Item removido.': 'Item removed.',
  'Legenda do post...': 'Post caption...',
  'Legenda': 'Caption',
  'Legenda...': 'Caption...',
  'Limite de armazenamento atingido.': 'Storage limit reached.',
  'Limpar': 'Clear',
  'Links de referência': 'Reference links',
  'Mensagem': 'Message',
  'Mostrar todos': 'Show all',
  'Mover para frente': 'Move forward',
  'Mover para trás': 'Move back',
  'Mês anterior': 'Previous month',
  'Próximo mês': 'Next month',
  'Nenhum conteúdo planejado': 'No content planned',
  'Nenhum post neste dia.': 'No posts on this day.',
  'Nenhum post neste mês.': 'No posts this month.',
  'Nenhum resultado para a busca.': 'No results for this search.',
  'Nenhum': 'None',
  'Nenhuma imagem/vídeo anexado. Adicione mídia ao item no planejador.': 'No image/video attached. Add media to the item in the planner.',
  'Notificar cliente': 'Notify client',
  'Novo conteúdo no planejamento': 'New content in the planner',
  'Novo post': 'New post',
  'Novo': 'New',
  'Outros anexos': 'Other attachments',
  'Post agendado no Instagram!': 'Post scheduled on Instagram!',
  'Post agendado!': 'Post scheduled!',
  'Post enviado ao cliente!': 'Post sent to the client!',
  'Post movido para': 'Post moved to',
  'Post salvo internamente!': 'Post saved internally!',
  'Post salvo!': 'Post saved!',
  'Post sem cliente vinculado — não é possível agendar no Instagram.': 'Post has no linked client — it cannot be scheduled on Instagram.',
  'Posts do mês': 'Posts this month',
  'Preencha a data e horário.': 'Fill in the date and time.',
  'Prévia do post': 'Post preview',
  'Publicação no Instagram': 'Instagram publishing',
  'Rascunho': 'Draft',
  'Remover': 'Remove',
  'Reprovado pelo cliente': 'Rejected by client',
  'Reprovado': 'Rejected',
  'Reprovados': 'Rejected',
  'Resposta do Cliente': 'Client response',
  'Revisão': 'Review',
  'Salvando...': 'Saving...',
  'Salvando…': 'Saving…',
  'Salvar e enviar ao cliente': 'Save and send to client',
  'Selecionar conteúdo do arsenal': 'Pick content from the content bank',
  'Selecionar conteúdo': 'Pick content',
  'Selecionar imagem': 'Pick image',
  'Selecionar imagens (até 10)': 'Pick images (up to 10)',
  'Selecionar vídeo': 'Pick video',
  'Selecione um cliente': 'Select a client',
  'Selecione um cliente para ver o feed': 'Select a client to see the feed',
  'Sem cliente': 'No client',
  'Sem mídia configurada': 'No media set',
  'Sem mídia': 'No media',
  'Sim, excluir': 'Yes, delete',
  'Status atualizado!': 'Status updated!',
  'Stories não são agendados': 'Stories are not scheduled',
  'Stories não são agendados.': 'Stories are not scheduled.',
  'Tipo de post não configurado': 'Post type not set',
  'Tipo de post': 'Post type',
  'Tipo': 'Type',
  'Todos os clientes': 'All clients',
  'Todos os status': 'All statuses',
  'Trocar conteúdo': 'Change content',
  'Título *': 'Title *',
  'Use as setas para reordenar': 'Use the arrows to reorder',
  'Use o botão abaixo para adicionar.': 'Use the button below to add.',
  'Veja em': 'See in',
  'Veja o status em': 'See the status in',
  'Verificando Instagram...': 'Checking Instagram...',
  'Verificando conta Instagram...': 'Checking Instagram account...',
  'aprovados': 'approved',
  'com o cliente': 'with the client',
  'está agendado no Instagram e marcado como aprovado — o cliente não vê mais como pendente de aprovação. Acompanhe a publicação na aba':
    'is scheduled on Instagram and marked as approved — the client no longer sees it as pending approval. Follow the publication in the tab',
  'mais': 'more',
  'máx. 50MB por arquivo': 'max. 50MB per file',
  'para conectar a conta.': 'to connect the account.',
  'planejados': 'planned',
  'post planejado': 'planned post',
  'posts planejados': 'planned posts',
  'publicados': 'published',
  'ver mais': 'see more',
  'ver menos': 'see less',
  '· clique em um para ver detalhes': '· click one to see details',
  '✓ Enviado ao cliente': '✓ Sent to client',

  // ── Clientes / perfil do cliente ───────────────────────────────────────────
  'Pendentes': 'Pending',
  'Ativo': 'Active',
  'Pausado': 'Paused',
  'Encerrado': 'Ended',
  'Proposta': 'Proposal',
  'Fechado': 'Closed',
  'Nome (A-Z)': 'Name (A-Z)',
  'Nome (Z-A)': 'Name (Z-A)',
  'Mais recentes': 'Newest',
  'Mais antigos': 'Oldest',
  'Ativos': 'Active',
  'Pausados': 'Paused',
  'Encerrados': 'Ended',
  'Nenhum cliente encontrado': 'No clients found',
  'Nenhum cliente cadastrado': 'No clients yet',
  'Tente outra busca': 'Try another search',
  'Cadastre seu primeiro cliente agora': 'Add your first client now',
  'Mudar cor do banner': 'Change banner color',
  'Excluir cliente': 'Delete client',
  'Excluir?': 'Delete?',
  'Abrir arquivo': 'Open file',
  'Observações': 'Notes',
  '· vence dia': '· due on day',
  'Mensalidade': 'Monthly fee',
  'Vencimento': 'Due date',
  'Status financeiro': 'Financial status',
  'Alterar': 'Change',
  'Conecte a conta Business ou Creator deste cliente para agendar posts.': "Connect this client's Business or Creator account to schedule posts.",
  'Faça upgrade do plano para conectar mais contas de Instagram.': 'Upgrade your plan to connect more Instagram accounts.',
  'Desconectar?': 'Disconnect?',
  'Com o Instagram conectado, você pode agendar posts diretamente pelo modal de planejamento. Basta abrir qualquer post no planejador e usar a aba':
    'With Instagram connected, you can schedule posts straight from the planner. Just open any post in the planner and use the tab',
  'Reconectar / Trocar conta': 'Reconnect / Switch account',
  'Precisa de você': 'Needs you',
  'Próximo post:': 'Next post:',
  'Nada pendente neste cliente agora.': 'Nothing pending for this client right now.',
  'Cliente não encontrado.': 'Client not found.',
  '· desde': '· since',
  'Desde': 'Since',
  'Sobre a marca': 'About the brand',
  'DNA da Marca': 'Brand DNA',
  'Adicionar conteúdo': 'Add content',
  'até': 'to',
  'Nenhum planejamento ainda.': 'No planning yet.',
  'Nenhum post neste período.': 'No posts in this period.',
  'Ver todos os planejamentos →': 'See all planning →',
  'Mídia': 'Media',
  'Adicionar': 'Add',
  'Instagram desconectado.': 'Instagram disconnected.',
  'conteúdo aguardando aprovação': 'content awaiting approval',
  'conteúdos aguardando aprovação': 'contents awaiting approval',
  'ajuste pedido pelo cliente': 'change requested by the client',
  'ajustes pedidos pelo cliente': 'changes requested by the client',
  'tarefa atrasada': 'overdue task',
  'tarefas atrasadas': 'overdue tasks',
  'tarefa em aberto': 'open task',
  'tarefas em aberto': 'open tasks',
  'Visão Geral': 'Overview',
  'Solicitações': 'Requests',
  'Materiais': 'Materials',
  'Canais e resultados': 'Channels and results',
  'Resultados': 'Results',
  'Marca': 'Brand',
  'Formulário': 'Form',
  'item aguardando': 'item waiting',
  'itens aguardando': 'items waiting',
  'Mais': 'More',
  'Limite de perfis Instagram do seu plano atingido. Faça upgrade para conectar mais contas.': "Your plan's Instagram profile limit was reached. Upgrade to connect more accounts.",
  'Autorização negada pelo Instagram. Tente novamente e aceite as permissões solicitadas.': 'Authorization denied on Instagram. Try again and accept the requested permissions.',
  'Falha ao autenticar com o Instagram. Verifique se o aplicativo Meta está configurado corretamente.': 'Failed to authenticate with Instagram. Check that the Meta app is configured correctly.',
  'Não foi possível obter os dados do perfil. Certifique-se de usar uma conta Business ou Creator.': 'Could not read the profile data. Make sure you use a Business or Creator account.',
  'Erro ao salvar a conexão no banco de dados. Tente novamente.': 'Error saving the connection. Please try again.',
  'Link de retorno inválido. Tente conectar novamente.': 'Invalid return link. Please try connecting again.',
  'Erro inesperado ao conectar o Instagram. Tente novamente.': 'Unexpected error connecting Instagram. Please try again.',
  'Erro ao conectar Instagram. Tente novamente.': 'Error connecting Instagram. Please try again.',
  'Reenviar convite': 'Resend invite',
  'Reenviar convite de acesso ao portal': 'Resend portal access invite',
  'Este mês': 'This month',
  'Últimos 3 meses': 'Last 3 months',
  'Próximos 3 meses': 'Next 3 months',
  'Mês específico': 'Specific month',
  'Editar conteúdo': 'Edit content',

  // ── Resultados (relatório mensal) ──────────────────────────────────────────
  'Interações do mês': 'Interactions this month',
  'Top publicações do mês': 'Top posts of the month',
  'Audiência': 'Audience',
  'Gênero': 'Gender',
  'Faixa etária': 'Age range',
  'Principais cidades': 'Top cities',
  'Baixar': 'Download',
  'Adicionar anexo': 'Add attachment',
  'Link externo': 'External link',
  'Arquivo': 'File',
  'Selecionar arquivo': 'Pick file',
  'Novo relatório': 'New report',
  'Criar': 'Create',
  'Sincronizado com o Instagram em': 'Synced with Instagram on',
  'Relatório de performance': 'Performance report',
  'Gerando...': 'Generating...',
  'Gerar do Instagram': 'Generate from Instagram',
  'Excluir relatório?': 'Delete report?',
  'Redes sociais': 'Social media',
  'Tráfego pago': 'Paid traffic',
  'Análise do mês': "Month's analysis",
  'Nenhuma análise ainda. Clique em': 'No analysis yet. Click',
  'Gerar com IA': 'Generate with AI',
  'para um resumo automático, ou em Editar para escrever.': 'for an automatic summary, or Edit to write one.',
  'Nenhum anexo ainda. Adicione prints, PDFs ou links de relatórios.': 'No attachments yet. Add screenshots, PDFs or report links.',
  'Relatórios disponíveis no Pro e Agency': 'Reports are available on Pro and Agency',
  'Faça upgrade para criar e compartilhar relatórios com seus clientes.': 'Upgrade to create and share reports with your clients.',
  'Ver planos': 'See plans',
  'Carregando...': 'Loading...',
  'Nenhum relatório ainda': 'No reports yet',
  'Crie o primeiro relatório mensal para este cliente.': 'Create the first monthly report for this client.',
  'Criar primeiro relatório': 'Create first report',
  'cadastrados': 'registered',
  'Janeiro': 'January',
  'Fevereiro': 'February',
  'Março': 'March',
  'Abril': 'April',
  'Maio': 'May',
  'Junho': 'June',
  'Julho': 'July',
  'Agosto': 'August',
  'Setembro': 'September',
  'Outubro': 'October',
  'Novembro': 'November',
  'Dezembro': 'December',
  'Masculino': 'Male',
  'Feminino': 'Female',
  'Outro': 'Other',
  'Curtidas': 'Likes',
  'Salvamentos': 'Saves',
  'Compartilhamentos': 'Shares',
  'Anexo adicionado!': 'Attachment added!',
  'Relatório criado!': 'Report created!',
  'Já existe um relatório para esse mês.': 'A report for this month already exists.',
  'Análise gerada pela IA!': 'Analysis generated by AI!',
  'Erro ao gerar análise.': 'Error generating analysis.',
  'Não foi possível gerar o relatório.': 'Could not generate the report.',
  'Erro ao gerar relatório.': 'Error generating report.',
  'Relatório salvo!': 'Report saved!',
  'Relatório removido.': 'Report removed.',
  'Anexo removido.': 'Attachment removed.',
  'Seguidores (início)': 'Followers (start)',
  'Seguidores (fim)': 'Followers (end)',
  'Alcance': 'Reach',
  'Engajamento': 'Engagement',
  'Impressões': 'Impressions',
  'Posts publicados': 'Posts published',
  'Investimento': 'Ad spend',
  'Conversões': 'Conversions',
  'Refazer com IA': 'Redo with AI',
  'relatório': 'report',
  'relatórios': 'reports',
  'Visitas ao perfil': 'Profile views',
  'Contas engajadas': 'Accounts engaged',
  'Interações totais': 'Total interactions',
  'Descrição (opcional)': 'Description (optional)',
  'Breve descrição...': 'Short description...',
  'Crescimento de seguidores': 'Follower growth',
  'conteúdos no mês': 'posts in the month',
  'Engajamento (%)': 'Engagement (%)',
  'Investimento (R$)': 'Ad spend (R$)',
  'Gerar um resumo dos resultados com IA para apresentar ao cliente': 'Generate an AI summary of the results to present to the client',
  'O que funcionou, o que não funcionou, próximos passos...': "What worked, what didn't, next steps...",
}

// Meses/dias que o date-fns (locale ptBR) escreve nas datas.
const MONTHS: Record<string, string> = {
  janeiro: 'January', fevereiro: 'February', 'março': 'March', abril: 'April', maio: 'May', junho: 'June',
  julho: 'July', agosto: 'August', setembro: 'September', outubro: 'October', novembro: 'November', dezembro: 'December',
  jan: 'Jan', fev: 'Feb', mar: 'Mar', abr: 'Apr', mai: 'May', jun: 'Jun',
  jul: 'Jul', ago: 'Aug', set: 'Sep', out: 'Oct', nov: 'Nov', dez: 'Dec',
}
const WEEKDAYS: Record<string, string> = {
  domingo: 'Sunday', 'segunda-feira': 'Monday', 'terça-feira': 'Tuesday', 'quarta-feira': 'Wednesday',
  'quinta-feira': 'Thursday', 'sexta-feira': 'Friday', 'sábado': 'Saturday',
}
const MONTH_RE = '(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\\.?'
const month = (m: string) => MONTHS[m.toLowerCase().replace('.', '')] ?? m

// Textos com número ou data no meio. Cada regex cobre o nó de texto inteiro.
const PATTERNS: Array<[RegExp, (...m: string[]) => string]> = [
  [/^Conexão até (\d{2}\/[a-z]{3})$/, (_, d) => `Connected until ${d}`],
  [/^Conexão expira em (\d+)d$/, (_, n) => `Connection expires in ${n}d`],
  [/^([\d.,]+) seguidores$/, (_, n) => `${n} followers`],
  [/^([\d.,]+) dias?$/, (_, n) => `${n} day${n === '1' ? '' : 's'}`],
  // "06 de out. às 14:30", "6 de outubro de 2026"
  [new RegExp(`^(\\d{1,2}) de ${MONTH_RE} às (\\d{1,2}:\\d{2})$`, 'i'), (_, d, m, t) => `${month(m)} ${d} at ${t}`],
  [new RegExp(`^(\\d{1,2}) de ${MONTH_RE}(?: de (\\d{4}))?$`, 'i'), (_, d, m, y) => `${month(m)} ${d}${y ? `, ${y}` : ''}`],
  [new RegExp(`^(\\d{1,2}) ${MONTH_RE}(?: (\\d{4}))?$`, 'i'), (_, d, m, y) => `${month(m)} ${d}${y ? ` ${y}` : ''}`],
  // "outubro 2026", "outubro de 2026"
  [new RegExp(`^${MONTH_RE} (?:de )?(\\d{4})$`, 'i'), (_, m, y) => `${month(m)} ${y}`],
  // "segunda-feira, 6 de out."
  [new RegExp(`^(domingo|segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sábado), (\\d{1,2}) de ${MONTH_RE}$`, 'i'),
    (_, w, d, m) => `${WEEKDAYS[w.toLowerCase()]}, ${month(m)} ${d}`],
  [/^(\d{2}\/\d{2}(?:\/\d{2,4})?) às (\d{1,2}:\d{2})$/, (_, d, t) => `${d} at ${t}`],
  [/^(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)( de)? (\d{4})$/,
    (_, m, __, y) => `${month(m)} ${y}`],
]

function translate(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  let out = DICT[trimmed]
  if (out === undefined) {
    for (const [re, fn] of PATTERNS) {
      const m = trimmed.match(re)
      if (m) { out = fn(...m); break }
    }
  }
  if (out === undefined || out === trimmed) return null
  const lead  = text.match(/^\s*/)![0]
  const trail = text.match(/\s*$/)![0]
  return lead + out + trail
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE'])
const ATTRS = ['placeholder', 'title', 'aria-label'] as const

function skipped(el: Element | null): boolean {
  for (let n = el; n; n = n.parentElement) {
    if (SKIP.has(n.tagName) || (n as HTMLElement).isContentEditable) return true
  }
  return false
}

function translateText(node: Text) {
  if (skipped(node.parentElement)) return
  const t = translate(node.nodeValue ?? '')
  if (t !== null) node.nodeValue = t
}

function translateAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (!v) continue
    const t = translate(v)
    if (t !== null) el.setAttribute(a, t)
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { translateText(root as Text); return }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const el = root as Element
  if (SKIP.has(el.tagName)) { translateAttrs(el); return }
  translateAttrs(el)
  el.querySelectorAll('[placeholder],[title],[aria-label]').forEach(translateAttrs)
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = tw.nextNode(); n; n = tw.nextNode()) translateText(n as Text)
}

// O modo fica salvo no navegador: sem um aviso, quem gravou o vídeo da Meta
// continuava vendo a tela meio em inglês sem saber por quê. Fica fora do
// React (o texto não está no dicionário, então não é traduzido) e some ao voltar.
function showExitButton() {
  const btn = document.createElement('button')
  btn.setAttribute('data-review-exit', '')
  btn.textContent = 'Modo inglês (App Review) · Voltar para português'
  btn.style.cssText = [
    'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483647',
    'padding:8px 12px', 'border-radius:999px', 'border:1px solid rgba(255,255,255,.25)',
    'background:#0F172A', 'color:#fff', 'font:600 12px/1.2 system-ui,sans-serif',
    'box-shadow:0 6px 20px rgba(0,0,0,.35)', 'cursor:pointer',
  ].join(';')
  btn.onclick = () => {
    try { localStorage.setItem(STORAGE_KEY, 'pt') } catch { /* sem storage */ }
    const url = new URL(window.location.href)
    url.searchParams.delete('lang')
    window.location.replace(url.toString())
  }
  document.body.appendChild(btn)
}

export function isEnglishMode(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'en' } catch { return false }
}

export function initReviewLocale() {
  try {
    const lang = new URLSearchParams(window.location.search).get('lang')
    if (lang === 'en' || lang === 'pt') localStorage.setItem(STORAGE_KEY, lang)
  } catch { /* storage bloqueado: segue em português */ }
  if (!isEnglishMode()) return

  document.documentElement.lang = 'en'
  walk(document.body)
  showExitButton()
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') translateText(r.target as Text)
      else if (r.type === 'attributes') translateAttrs(r.target as Element)
      else r.addedNodes.forEach(walk)
    }
  }).observe(document.body, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: [...ATTRS],
  })
}
