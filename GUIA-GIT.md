# Colocar o projeto no repositório Git

Extraia o ZIP e envie **os arquivos da pasta extraída**, não o ZIP inteiro. A raiz do repositório deve conter `package.json`, `render.yaml`, `client/`, `server/` e as demais pastas do projeto.

O pacote não contém histórico `.git`, `node_modules`, build `dist`, configuração da antiga hospedagem ou credenciais reais. `.env.example` é um modelo; os valores verdadeiros ficam no Render ou no `.env` local.

## Pelo site do GitHub

1. Crie um repositório vazio, por exemplo `yuri-araujo-boutique`.
2. Na criação, não adicione README, licença ou `.gitignore`: o projeto já contém seus arquivos.
3. Use **Add file → Upload files** e envie o conteúdo extraído.
4. Confira se `.gitignore` e `.env.example` também foram enviados. Ative a exibição de arquivos ocultos no computador se necessário.
5. Clique em **Commit changes**.

Não envie um `.env` preenchido. O `.gitignore` já exclui esse arquivo, as dependências e o build.

Depois conecte o repositório ao Render: [PUBLICAR-RENDER.md](PUBLICAR-RENDER.md).

## Pelo terminal

Dentro da pasta extraída, substitua a URL abaixo pela URL do seu repositório vazio:

```sh
git init
git add .
git commit -m "Adicionar Yuri Araujo Boutique"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/yuri-araujo-boutique.git
git push -u origin main
```

O GitHub pode solicitar autenticação pelo navegador ou token. Use o gerenciador de credenciais; não coloque tokens no código nem na URL do remote.

Para atualizar, revise `git status`, faça um novo commit e envie com `git push`.
