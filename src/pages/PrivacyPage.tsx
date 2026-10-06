export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <picture>
          <source srcSet="/logo-icon.avif" type="image/avif" />
          <source srcSet="/logo-icon.webp" type="image/webp" />
          <img src="/logo-icon.png" alt="" width={32} height={32} className="w-8 h-8 object-contain" />
        </picture>
        <span className="font-semibold text-[#0f0f0f]">
          Status<span className="text-[#29457a]">Media</span>
        </span>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-[#0f0f0f] mb-2">Política de Privacidade</h1>
        <p className="text-sm text-gray-400 mb-10">Última atualização: setembro de 2026</p>

        <div className="prose prose-gray max-w-none space-y-8 text-[15px] leading-relaxed text-gray-700">

          <section>
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">1. Sobre o StatusMedia</h2>
            <p>
              O StatusMedia é uma plataforma de gestão de redes sociais e marketing digital desenvolvida para agências e profissionais de marketing. Permitimos que nossos usuários conectem suas contas do Instagram e de outras redes sociais para agendar publicações, gerenciar conteúdo e acompanhar métricas.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">2. Dados que Coletamos</h2>
            <p>Ao usar o StatusMedia, podemos coletar os seguintes dados:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Dados de conta:</strong> nome, endereço de e-mail e informações de perfil fornecidas no cadastro.</li>
              <li><strong>Dados do Instagram:</strong> nome de usuário, foto de perfil, número de seguidores, dados necessários para a publicação de conteúdo e métricas agregadas da conta e das publicações, obtidos por meio da autorização OAuth do Instagram.</li>
              <li><strong>Conteúdo agendado:</strong> imagens, vídeos, legendas e horários de publicação criados pelos usuários.</li>
              <li><strong>Dados de uso:</strong> logs de acesso, ações realizadas na plataforma e preferências de configuração.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">3. Como Usamos os Dados</h2>
            <p>Utilizamos os dados coletados exclusivamente para:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Fornecer, operar e melhorar os serviços do StatusMedia.</li>
              <li>Publicar conteúdo agendado nas redes sociais conectadas, conforme autorizado pelo usuário.</li>
              <li>Exibir informações do perfil do Instagram dentro da plataforma.</li>
              <li>Enviar notificações relacionadas ao funcionamento da plataforma.</li>
              <li>Cumprir obrigações legais e regulatórias.</li>
            </ul>
            <p className="mt-3">
              <strong>Não vendemos, alugamos nem compartilhamos seus dados pessoais com terceiros para fins de marketing.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">4. Uso dos Dados do Instagram</h2>
            <p>
              Ao conectar sua conta do Instagram ao StatusMedia, você nos autoriza a acessar as informações necessárias para o funcionamento da plataforma, conforme as permissões concedidas durante o processo de autorização OAuth. Isso inclui:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Informações básicas do perfil</strong> (<code>instagram_business_basic</code>): identificador da conta, nome de usuário, nome, foto de perfil e número de seguidores, usados para identificar qual conta está conectada e como destino de todas as demais chamadas.</li>
              <li><strong>Publicação de conteúdo</strong> (<code>instagram_business_content_publish</code>): publicação, no horário que você agendar, dos conteúdos que você mesmo criou e aprovou na plataforma.</li>
              <li><strong>Métricas da conta e das publicações</strong> (<code>instagram_business_manage_insights</code>): alcance, visitas ao perfil, contas engajadas, interações, desempenho das publicações do período e dados demográficos agregados do público, usados exclusivamente para montar os relatórios mensais do cliente.</li>
            </ul>
            <p className="mt-3">
              Esses dados são utilizados somente para as funcionalidades descritas e nunca são compartilhados sem seu consentimento explícito. Você pode revogar o acesso a qualquer momento desconectando sua conta na seção Instagram do StatusMedia, ou removendo o StatusMedia em <em>Instagram → Configurações → Aplicativos e sites</em>.
            </p>
            <p className="mt-3">
              O uso dos dados do Instagram está em conformidade com as <a href="https://developers.facebook.com/policy/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Políticas da Plataforma Meta</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">5. Armazenamento e Segurança</h2>
            <p>
              Seus dados são armazenados em servidores seguros fornecidos pelo Supabase, com criptografia em trânsito (TLS) e em repouso. Os tokens de acesso do Instagram são armazenados de forma segura e utilizados exclusivamente para executar ações autorizadas por você.
            </p>
            <p className="mt-3">
              Adotamos medidas técnicas e organizacionais para proteger seus dados contra acesso não autorizado, alteração, divulgação ou destruição.
            </p>
            <p className="mt-3">
              Para operar a plataforma, contamos com os seguintes prestadores de serviço (operadores), que tratam dados apenas em nosso nome e para as finalidades abaixo:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Supabase Inc.</strong> (Estados Unidos e Brasil): banco de dados, autenticação e funções de servidor. Armazena os dados da conta, os tokens de acesso e as métricas do Instagram.</li>
              <li><strong>OpenAI, L.L.C.</strong> (Estados Unidos): geração do resumo escrito do relatório mensal, somente quando você clica em "Gerar com IA". Enviamos apenas números agregados do mês (seguidores, alcance, impressões, engajamento, visitas ao perfil, interações, desempenho das principais publicações e percentuais demográficos agregados). Não enviamos nome de usuário, identificadores da conta, tokens de acesso nem conteúdo das publicações. Pela política da OpenAI para a API, esses dados não são usados para treinar modelos.</li>
              <li><strong>Vercel Inc.</strong> (Estados Unidos): hospedagem do site e da aplicação web.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">6. Retenção de Dados</h2>
            <p>
              Mantemos seus dados enquanto sua conta estiver ativa. Se você solicitar a exclusão da conta, removeremos seus dados pessoais em até 30 dias, exceto quando houver obrigação legal de retenção.
            </p>
          </section>

          <section id="exclusao-de-dados">
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">7. Exclusão de Dados e Revogação de Acesso</h2>
            <p>Você pode interromper o acesso e apagar os dados a qualquer momento:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Desconectar o Instagram:</strong> na seção Instagram do StatusMedia, clique em desconectar. O token de acesso deixa de ser usado imediatamente.</li>
              <li><strong>Remover pelo Instagram:</strong> em <em>Configurações → Aplicativos e sites</em>, remova o StatusMedia. Recebemos o aviso de remoção e desativamos a conexão automaticamente.</li>
              <li><strong>Excluir os dados:</strong> siga as instruções da página <a href="/data-deletion" className="text-blue-600 underline">Exclusão de dados</a> ou escreva para o e-mail abaixo. Concluímos a exclusão em até 30 dias.</li>
            </ul>
            <p className="mt-3">
              A exclusão remove o token de acesso, os dados de perfil e as métricas do Instagram que armazenamos, além dos conteúdos e agendamentos vinculados à conta — exceto o que precisarmos reter por obrigação legal.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">8. Seus Direitos</h2>
            <p>Você tem o direito de:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Acessar os dados que mantemos sobre você.</li>
              <li>Solicitar a correção de informações incorretas.</li>
              <li>Solicitar a exclusão dos seus dados.</li>
              <li>Revogar o acesso ao Instagram a qualquer momento.</li>
              <li>Exportar seus dados em formato portátil.</li>
            </ul>
            <p className="mt-3">Para exercer esses direitos, entre em contato: <a href="mailto:wallisonsilva290@gmail.com" className="text-blue-600 underline">wallisonsilva290@gmail.com</a></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">9. Cookies</h2>
            <p>
              Utilizamos cookies essenciais para manter sua sessão autenticada e preferências de configuração. Não utilizamos cookies de rastreamento para fins publicitários.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">10. Alterações nesta Política</h2>
            <p>
              Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos os usuários sobre mudanças significativas por e-mail ou por aviso na plataforma. O uso continuado dos serviços após as alterações constitui aceite da nova política.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f0f0f] mb-3">11. Contato</h2>
            <p>
              Dúvidas sobre esta Política de Privacidade? Entre em contato:<br />
              <strong>StatusMedia</strong><br />
              E-mail: <a href="mailto:wallisonsilva290@gmail.com" className="text-blue-600 underline">wallisonsilva290@gmail.com</a>
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-100 py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} StatusMedia. Todos os direitos reservados.
      </footer>
    </div>
  )
}
