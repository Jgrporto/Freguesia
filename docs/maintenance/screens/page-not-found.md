# Tela Page Not Found

## Rota e arquivos

- Fallback de rota: `*`
- Arquivo: `src/lib/PageNotFound.jsx`

## Objetivo

Informar que a rota acessada não existe e orientar o retorno ao fluxo principal.

## Layout

- Card centralizado.
- Destaque visual do estado 404.
- Mensagem contextual com o caminho tentado.
- Aviso adicional para administradores autenticados.
- Botão de retorno para a home.

## Funcionalidades

- Ler a rota atual via `useLocation`.
- Validar se o usuário autenticado é admin.
- Exibir nota administrativa quando aplicável.

## Observações de manutenção

- A tela é útil para detectar rotas quebradas durante evolução do frontend.
- O conteúdo exibido ao admin pode ser ajustado para fluxos internos de suporte.
