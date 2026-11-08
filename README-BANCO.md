# Banco PostgreSQL no Neon

Esta versão conecta o PostgreSQL do Neon a um servidor Node no Render. Não é necessário habilitar Neon Auth: o acesso exclusivo do administrador é implementado pela aplicação, por e-mail e senha.

## Obter as duas conexões

1. Acesse [Neon](https://neon.tech) e crie ou selecione o projeto da loja.
2. Abra **Connect** e confira banco, usuário e branch.
3. Ative **Connection pooling** e copie somente a URL iniciada por `postgresql://` para `DATABASE_URL`.
4. Desative **Connection pooling** e copie a conexão direta para `DIRECT_DATABASE_URL`.
5. Preserve os parâmetros de segurança fornecidos pelo Neon. Não copie `psql`, aspas ou comandos ao redor da URL.

As duas URLs devem apontar para o mesmo banco e a mesma branch. A conexão pooled costuma conter `-pooler` no hostname; a direta não contém esse sufixo. Copie cada endereço do Neon em vez de montar a URL manualmente.

No Render, insira os valores nas variáveis de ambiente do serviço. Não coloque conexões no Git nem no código da interface.

## Criar as tabelas

As migrações estão em `db/migrations/`. `npm start` aplica as migrações antes de disponibilizar o servidor, usando a conexão direta. Na primeira publicação, não é necessário colar o SQL manualmente no Neon.

Para aplicar as migrações separadamente em desenvolvimento:

```sh
npm run db:migrate
```

Para conferir o acesso ao banco:

```sh
npm run db:check
```

O instalador usa transação, lock e registro de checksum. Não edite migrações já aplicadas: crie um novo arquivo para cada mudança de esquema. Os scripts não inserem produtos nem anúncios de demonstração.

Antes de publicar uma alteração futura de esquema, teste a migração em uma branch de desenvolvimento do Neon. Use a conexão da branch de teste durante a verificação.

## Dados e acesso

- `products`: nome, categoria, descrição, preço em centavos, fotos, tamanhos, disponibilidade e destaque.
- `ads`: título, imagem, link, posição e ativação.
- Sessões administrativas e controle de tentativas de login, usados pelo acesso do proprietário.

Preço nulo aparece como valor sob consulta. Fotos do painel ficam no PostgreSQL: até quatro por produto e 1 MB por foto. A API rejeita SVG e links executáveis.

Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` no ambiente do Render. A senha exige pelo menos 12 caracteres. Não há senha padrão nem cadastro público de administradores.

Depois da publicação, abra `/admin`, entre com esses dados e cadastre um produto. Recarregue a página e confirme que ele continua cadastrado e aparece na vitrine. Repita a conferência com uma propaganda.

## Se a conexão falhar

Confira se as duas URLs são do mesmo banco e branch, se foram copiadas por completo e se a URL de migração está sem pooling. Verifique as permissões do usuário PostgreSQL e os logs no Render. Não publique conexões ou senhas ao compartilhar mensagens de erro e não desative a verificação TLS.

Em produção, falta de configuração ou erro nas migrações impede a inicialização. A aplicação não informa sucesso quando a gravação no banco falha.
