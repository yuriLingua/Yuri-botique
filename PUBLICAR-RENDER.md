# Publicar no Render com banco Neon

O fluxo é **repositório Git → Render → PostgreSQL no Neon**. O Git guarda o código, o Render executa a aplicação e o Neon guarda os cadastros.

## 1. Preparar código e banco

Envie o conteúdo extraído do ZIP para GitHub, GitLab ou Bitbucket: [GUIA-GIT.md](GUIA-GIT.md).

Obtenha as conexões pooled e direta do mesmo banco Neon e da mesma branch: [README-BANCO.md](README-BANCO.md).

## 2. Criar o serviço

No Render, importe `render.yaml` pela opção **Blueprint**, selecionando seu repositório, ou crie um **Web Service** manualmente.

Na criação manual:

| Campo | Valor |
| --- | --- |
| Runtime | Node |
| Branch | A branch do repositório, normalmente `main`. |
| Root Directory | Vazio, quando os arquivos do projeto estiverem na raiz do repositório. |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |

Escolha a região e o plano no painel. Consulte as condições atuais do Render; serviços gratuitos podem hibernar e levar mais tempo no primeiro acesso.

## 3. Preencher as variáveis

Configure antes da primeira inicialização:

| Nome | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `DATABASE_URL` | URL Neon com Connection pooling ativado. |
| `DIRECT_DATABASE_URL` | URL Neon com Connection pooling desativado. |
| `ADMIN_EMAIL` | E-mail escolhido para o painel. |
| `ADMIN_PASSWORD` | Senha exclusiva com pelo menos 12 caracteres. |

Conexões e senha são segredos. O `render.yaml` pede esses valores no painel; não inclui credenciais reais.

O Render fornece `PORT` e `RENDER_EXTERNAL_URL`. Para domínio próprio, configure `APP_URL` com o endereço completo da loja, por exemplo `https://loja.seudominio.com`, e ajuste o domínio no Render.

## 4. Publicar e conferir

Inicie a publicação. O build prepara a interface; na inicialização, a aplicação valida as variáveis, aplica as migrações e abre a porta fornecida pelo Render.

Quando o serviço estiver disponível:

1. Abra a URL informada pelo Render.
2. Acesse `/admin` e entre com `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
3. Adicione um produto com foto e salve.
4. Recarregue a página e confira o produto no painel e na vitrine.
5. Adicione uma propaganda de topo ou lateral e confira sua exibição.
6. Toque em **Tenho interesse** e confira a mensagem para o WhatsApp **(71) 99133-4337**.

O catálogo conectado começa vazio. Não são inseridos produtos demonstrativos no banco.

## Atualizar

Envie as mudanças para a branch conectada ao Render e publique a nova versão. Teste alterações de banco em uma branch de desenvolvimento do Neon antes de aplicá-las em produção. Não altere migrações já aplicadas.

Se a inicialização falhar, consulte os logs: confira as variáveis, as conexões do mesmo banco/branch e as credenciais do administrador. Não desative TLS para contornar erro de conexão.
