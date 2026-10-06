# App Review da Meta — Instagram

Guia de submissão do StatusMedia para as permissões da **Instagram API with
Instagram Login** (Business Login). Escrito depois de reprovações seguidas: os
itens abaixo cobrem tanto o que o revisor precisa conseguir fazer quanto o que
o vídeo precisa mostrar.

Permissões solicitadas (fonte única em [`src/lib/instagramOAuth.ts`](src/lib/instagramOAuth.ts)):

| Permissão | Onde é usada |
| --- | --- |
| `instagram_business_basic` | `instagram-oauth` → `GET /me`, exibido no perfil do cliente e em `/instagram` |
| `instagram_business_content_publish` | `instagram-publish-cron` → `POST /{ig-user-id}/media` e `/media_publish` |
| `instagram_business_manage_insights` | `instagram-report` → `GET /{ig-user-id}/insights` e `/{media-id}/insights` |

---

## 1. Preparar a conta de teste

**Este é o passo que mais reprovou submissões.** A Edge Function
`instagram-report` recusa planos abaixo de Pro (`403 plan_required`), e toda
conta nova nasce em `starter` com trial de 3 dias (migration `030`). Sem
liberar a conta, o revisor não consegue exercer
`instagram_business_manage_insights` — e a análise da Meta leva de uma a
quatro semanas, tempo suficiente para o trial expirar e a plataforma inteira
travar no `SubscriptionGuard`.

Crie a conta pelo cadastro normal e rode no SQL Editor do Supabase:

```sql
-- Substitua pelo e-mail da conta de teste informada à Meta
update public.subscriptions
set    plan                 = 'agency',
       status               = 'active',
       trial_ends_at        = now() + interval '1 year',
       current_period_end   = now() + interval '1 year',
       cancel_at_period_end = false,
       canceled_at          = null
where  user_id = (select id from auth.users where email = 'revisor@statusmedia.com.br');
```

Confira o resultado antes de submeter:

```sql
select u.email, s.plan, s.status, s.trial_ends_at
from   public.subscriptions s
join   auth.users u on u.id = s.user_id
where  u.email = 'revisor@statusmedia.com.br';
```

Deixe a conta com **pelo menos um cliente cadastrado**, para o revisor não
precisar criar um antes de conectar o Instagram.

## 2. Conta de Instagram para a gravação

- Business ou Creator (conta pessoal não serve).
- **100 seguidores ou mais** — abaixo disso a API não devolve
  `follower_demographics`, e o relatório aparece cheio de travessões, o que o
  revisor lê como "a permissão não faz nada".
- Com publicações no mês que você for escolher no relatório.

## 3. Configurações do app no painel da Meta

| Campo | Valor |
| --- | --- |
| Valid OAuth Redirect URI | `https://<projeto>.supabase.co/functions/v1/instagram-oauth` |
| Deauthorize Callback URL | `https://<projeto>.supabase.co/functions/v1/instagram-deauthorize` |
| Data Deletion Request Callback URL | `https://<projeto>.supabase.co/functions/v1/instagram-deauthorize?type=delete` |
| Data Deletion Instructions URL | `https://statusmedia.com.br/data-deletion` |
| Privacy Policy URL | `https://statusmedia.com.br/privacy` |
| Terms of Service URL | `https://statusmedia.com.br/terms` |
| App Icon | 1024×1024, sem marca da Meta |

Deploy do que este guia adiciona:

```bash
supabase db push
supabase functions deploy instagram-deauthorize --no-verify-jwt
```

O `--no-verify-jwt` é obrigatório: quem chama é a Meta, que não apresenta JWT.
A autorização acontece dentro da função, validando a assinatura do
`signed_request` com o `META_APP_SECRET`.

### Testar os callbacks antes de submeter

A Meta não avisa quando o callback falha — ela só marca o app como não
conforme. Vale simular uma chamada. O script abaixo monta um `signed_request`
válido e dispara os dois endpoints:

```bash
APP_SECRET="<seu META_APP_SECRET>"
FN_URL="https://<projeto>.supabase.co/functions/v1/instagram-deauthorize"
IG_USER_ID="<ig_user_id de uma conta conectada de teste>"

PAYLOAD=$(printf '{"user_id":"%s","algorithm":"HMAC-SHA256","issued_at":%s}' \
  "$IG_USER_ID" "$(date +%s)" \
  | openssl base64 -A | tr '+/' '-_' | tr -d '=')

SIG=$(printf '%s' "$PAYLOAD" \
  | openssl dgst -sha256 -hmac "$APP_SECRET" -binary \
  | openssl base64 -A | tr '+/' '-_' | tr -d '=')

# Desautorização — a conta deve ficar is_active=false
curl -s -X POST "$FN_URL" -d "signed_request=$SIG.$PAYLOAD"; echo

# Exclusão — deve responder {"url":"...","confirmation_code":"..."}
curl -s -X POST "$FN_URL?type=delete" -d "signed_request=$SIG.$PAYLOAD"; echo
```

Uma assinatura errada tem que devolver `401`. Confirme também que o registro
apareceu:

```sql
select confirmation_code, ig_user_id, kind, status, accounts_affected, created_at
from   public.data_deletion_requests
order  by created_at desc
limit  5;
```

Por fim, abra `https://statusmedia.com.br/data-deletion?code=<código>` e veja se
a página mostra o pedido. **Atenção:** o teste de exclusão apaga de verdade a
conta conectada — use uma conta de teste descartável.

## 4. Gravação — regras da Meta

> **Reprovação de 2026-09-07 (as três permissões):** "Screencast não alinhado
> com detalhes do caso de uso". A Meta aprovou o caso de uso; faltou no vídeo
> o **fluxo de login completo da Meta**, o **usuário concedendo a permissão** e
> a **experiência completa** do caso de uso, com a **interface em inglês**.

- 1080p ou mais, monitor com no máximo 1440px de largura.
- **Sem áudio** no arquivo final.
- Gravar a **tela do computador** (OBS), nunca o celular filmando o monitor.
- Começar **deslogado** do StatusMedia e do Instagram. Antes de cada vídeo:
  remover o StatusMedia em Instagram → Configurações → Apps e sites,
  desconectar a conta no StatusMedia e abrir uma janela anônima. Sem isso a
  tela de login e a de permissões do Instagram não aparecem.
- Navegar com o mouse, com cursor aumentado; evitar atalhos de teclado.
- **Interface em inglês:** abrir o site com `?lang=en`
  (`https://www.statusmedia.com.br/?lang=en`). O modo fica salvo no navegador,
  inclusive na volta do OAuth; `?lang=pt` desliga. A tradução é por dicionário
  em `src/lib/reviewLocale.ts`: texto novo nas telas do fluxo precisa entrar
  lá. Mesmo assim, legendar cada passo em inglês.
- **Um arquivo por permissão.** Permissão que não aparece sendo concedida e
  usada é reprovada.
- Mostrar sempre a tela de consentimento do Instagram *e* o resultado do dado
  dentro do app.

## 5. Roteiros

### Vídeo 1 — `instagram_business_basic` (≈2 min)

1. Landing page deslogado → login com as credenciais de teste.
2. Dashboard → **Instagram** na sidebar.
3. Clicar em **Conectar Instagram** → escolher o cliente no modal.
4. Janela de autorização do Instagram: **zoom na lista de permissões**, segurar
   4 segundos, autorizar.
5. De volta ao app: foto, `@username`, nome e seguidores na tela. Zoom.

### Vídeo 2 — `instagram_business_content_publish` (≈3 min)

1. Repetir o bloco de conexão (passos 1–4 acima).
2. **Planejamento** → abrir um item com imagem anexada.
3. Escrever a legenda, escolher data e hora **2 a 3 minutos à frente**, agendar.
4. Página **Instagram**: status `Agendado`.
5. Esperar a virada para `Publicando` e `Publicado` — acelerar 4× com legenda
   avisando, mas **não cortar** a transição.
6. Abrir o permalink: o post no ar no Instagram, mesma legenda.

### Vídeo 3 — `instagram_business_manage_insights` (≈2 min 30)

1. Repetir o bloco de conexão.
2. Abrir o cliente → aba **Resultados/Relatórios** → escolher o mês.
3. Mostrar o relatório **vazio** primeiro (prova que o dado vem da API).
4. Sincronizar com o Instagram.
5. Percorrer devagar: alcance, visitas ao perfil, contas engajadas,
   interações, top publicações, demografia. Zoom em cada bloco.
6. Opcional e forte: o mesmo relatório no portal do cliente.

## 6. Textos de caso de uso

Um texto próprio por permissão — a Meta reprova cópia entre elas. Em inglês.

**`instagram_business_basic`** — StatusMedia is used by social media agencies to
manage the Instagram presence of their clients. After a client authorizes the
connection through Business Login for Instagram, we read `id`, `username`,
`name`, `profile_picture_url` and `followers_count` and display them on the
client's profile, so the operator can confirm which account is connected before
scheduling anything. The account id is also the target of every publishing and
insights call. Without it the agency cannot tell one connected client account
from another, and no other Instagram call is possible.

**`instagram_business_content_publish`** — Agencies plan a month of content for
each client inside StatusMedia, get it approved by the client in a dedicated
portal, and schedule the approved post for a specific date and time. At that
time our backend creates a media container and publishes it to the client's
Instagram professional account. Images, carousels and reels are supported. Every
publication originates from an explicit user action — an operator writing the
caption and choosing the time — and can be cancelled or rescheduled until it
runs. Without it the agency has to leave the platform and post manually at the
scheduled hour, which is the core problem StatusMedia solves.

**`instagram_business_manage_insights`** — Agencies owe their clients a monthly
performance report. StatusMedia builds it automatically: for the selected month
we read account insights (reach, profile views, accounts engaged, total
interactions), per-media insights for the posts published in that period, and
follower demographics by gender, age and city. These numbers populate the
client's monthly report, delivered in the client's own portal alongside the
agency's written analysis. Without it the agency has to copy metrics by hand
from the Instagram app into a spreadsheet every month, for every client.

## 7. Instruções de teste para o revisor

Cole no campo de instruções da submissão, em inglês:

```
1. Open https://www.statusmedia.com.br/?lang=en (the ?lang=en parameter
   switches the interface to English) and click "Sign in".
2. Sign in with the test credentials provided below.
   Email: <e-mail da conta de teste>
   Password: <senha>
   Please use these credentials — do not create a new account, as new accounts
   start on a limited plan.
3. In the left sidebar, click "Instagram".
4. Click the blue "Conectar Instagram" (Connect Instagram) button in the top
   right, then pick a client from the list.
5. Authorize the Instagram Business account in the Instagram window.
   -> instagram_business_basic: the profile picture, username, name and
      follower count appear on the account card.
6. Go to "Planejamento" (Planner), open a content card, write a caption, pick a
   time a few minutes ahead and click to schedule. Back in "Instagram", the
   post moves from Agendado (Scheduled) to Publicado (Published).
   -> instagram_business_content_publish
7. Go to "Clientes" (Clients), open the client, and open the "Resultados"
   (Results) tab. Pick a month and click the button to pull Instagram data.
   -> instagram_business_manage_insights: reach, profile views, accounts
      engaged, interactions, top posts and audience demographics are filled in.
```

## 8. Checklist final

- [ ] Conta de teste em `plan='agency'`, `status='active'`, validade longa
- [ ] Conta de teste já tem ao menos um cliente cadastrado
- [ ] Conta de Instagram Business com 100+ seguidores e posts no mês escolhido
- [ ] `supabase db push` aplicado (migration `070`)
- [ ] `instagram-deauthorize` publicada com `--no-verify-jwt`
- [ ] Os quatro campos de URL preenchidos no painel da Meta e abrindo deslogado
- [ ] `/privacy` cita as três permissões
- [ ] `/data-deletion` abre sem login
- [ ] Três vídeos, 1080p, sem áudio, legendados em inglês
- [ ] Cada vídeo mostra o consentimento e o resultado da sua permissão
- [ ] Um texto de caso de uso diferente por permissão
- [ ] Verificação de negócio concluída
- [ ] Uma chamada bem-sucedida de cada permissão nos últimos 30 dias (gravar os
      vídeos já cumpre isso)

---

### Referências

- [Screen Recordings](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/)
- [App Review Submission Guide](https://developers.facebook.com/docs/app-review/submission-guide/)
- [Instagram Platform — App Review](https://developers.facebook.com/docs/instagram-platform/app-review)
- [Instagram Platform — Insights](https://developers.facebook.com/docs/instagram-platform/insights)
