# Yuri Araújo Boutique — Render + Neon

Projeto da loja de sapatos e joias de Yuri Araújo, preparado para repositório Git, hospedagem **Render** e banco **PostgreSQL no Neon**.

Este repositório contém o código e as configurações da loja. A aplicação está publicada no Render e conectada ao PostgreSQL no Neon. Os dados de acesso ficam nas variáveis privadas do serviço Render.

## Endereço da loja

- **Loja:** [yuri-botique.onrender.com](https://yuri-botique.onrender.com/)
- **Administração:** [yuri-botique.onrender.com/admin](https://yuri-botique.onrender.com/admin)

O administrador entra com o e-mail configurado em `ADMIN_EMAIL` e a senha guardada em `ADMIN_PASSWORD` nas variáveis do Render.

O GitHub Pages em `https://yurilingua.github.io/yuri-botique/` encaminha para a aplicação no Render. O arquivo `index.html` na raiz cuida desse encaminhamento; a interface da loja é compilada a partir de `client/index.html`.

## Comece por aqui

1. Extraia o ZIP e envie os arquivos para o repositório: [GUIA-GIT.md](GUIA-GIT.md).
2. Prepare as conexões Neon: [README-BANCO.md](README-BANCO.md).
3. Configure e publique o serviço: [PUBLICAR-RENDER.md](PUBLICAR-RENDER.md).

## Recursos

- Catálogo de sapatos e joias, busca, categorias, detalhes, fotos e tamanhos.
- Botão **Tenho interesse** com nome do produto na mensagem do WhatsApp **(71) 99133-4337**.
- Propagandas no topo e na lateral; destaque entre os produtos no celular.
- Painel em `/admin` para adicionar, editar e excluir produtos e propagandas, enviar fotos e ativar campanhas.
- Confirmação antes de excluir e acesso do administrador por e-mail e senha, com sessões PostgreSQL.

## Rodar no computador

Requer **Node.js 24** e npm.

```sh
npm ci --include=dev
npm run build
npm start
```

Abra o endereço informado no terminal. Sem banco e em desenvolvimento, a interface oferece uma demonstração identificada: as alterações do painel são temporárias e se perdem ao recarregar.

Para usar um banco de desenvolvimento, copie `.env.example` para `.env` e preencha os valores localmente. `npm start` valida a configuração e aplica as migrações antes de iniciar a aplicação conectada. Para os testes:

```sh
npm test
```

Em produção (`NODE_ENV=production`), banco e credenciais administrativas são obrigatórios. Não há senha padrão nem cadastro público de administradores.

## Variáveis

| Nome | Como preencher |
| --- | --- |
| `DATABASE_URL` | Conexão Neon com pooling para a API. |
| `DIRECT_DATABASE_URL` | Conexão Neon direta para migrações. |
| `ADMIN_EMAIL` | E-mail escolhido para entrar no painel. |
| `ADMIN_PASSWORD` | Senha exclusiva com pelo menos 12 caracteres. |
| `NODE_ENV` | `production` no Render. |
| `APP_URL` | Opcional: URL completa da aplicação, especialmente para domínio próprio. No Render, o endereço padrão vem de `RENDER_EXTERNAL_URL`. |

Guarde conexões e senha como segredos no Render. O Render informa `PORT` automaticamente.

## Estrutura

- `client/`: vitrine e painel.
- `server/`: servidor Node, autenticação, API e validação.
- `db/migrations/`: esquema PostgreSQL.
- `scripts/`: build, inicialização e migrações.
- `public/assets/`: imagens, fontes e créditos em `SOURCES.md`.
- `tests/`: testes de funcionamento.
- `render.yaml`: configuração para Render Blueprint.

As fotos e os produtos demonstrativos são ilustrativos. Um banco conectado vazio começa sem produtos; cadastre os itens reais pelo painel. Fotos enviadas são otimizadas no navegador e armazenadas no PostgreSQL, até quatro por produto e 1 MB por imagem.
