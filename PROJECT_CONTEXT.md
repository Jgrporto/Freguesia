# Contexto do Projeto +TV

## Objetivo

Aplicacao web para operacao de atendimento, com foco em:

- fila de conversas
- acompanhamento de status
- painel de indicadores
- respostas rapidas
- configuracoes de equipe, servicos e notificacoes
- autenticacao local com sessao persistida

## Stack atual

- Vite
- React 18
- React Router
- TanStack Query
- Tailwind CSS
- Radix UI / shadcn
- API local Node em `server/local-api.mjs`

## Integracao da aplicacao

O frontend centraliza o acesso ao backend local em `src/lib/local-api.js`.
As chamadas autenticadas usam cookie HttpOnly com `credentials: include`.

As respostas de listas da integracao podem chegar como array puro ou payload envelopado
(`items`, `rows`, `data`, `results`). O frontend normaliza isso em
`src/lib/entity-collections.js` quando necessario.

## Fluxos principais

1. `Login`
   - autentica usuarios locais
   - persiste a sessao via cookie
   - redireciona o usuario para a rota solicitada
2. `Atendimento`
   - lista conversas
   - abre a janela de chat
   - atualiza status e notas
3. `Dashboard`
   - consolida indicadores e tabelas
4. `Visao Kanban`
   - agrupa filas por servico
   - mostra operadores visiveis em cada frente
5. `Etiquetas`
   - exibe etiquetas automaticas e personalizadas
   - alterna entre cards e colunas estilo kanban
6. `Respostas Rapidas`
   - cria, edita e remove templates
7. `HSMs`
   - lista templates HSM locais
   - sincroniza templates com a Meta
   - edita metadados complementares do template
8. `Rotinas`
   - agenda e executa disparos de HSM pelo backend
   - usa HSMs persistidos em `/hsms`
   - resolve o publico pela base oficial de clientes em `/customers`
9. `Configuracoes`
   - exibe dados do usuario e equipe
   - desconecta administrativamente sessoes de outros usuarios
10. `Base de Clientes`
   - lista clientes em tabela paginada
   - aplica filtros locais
   - consome base persistida sincronizada com o NewBr

## Variaveis de ambiente locais

```env
VITE_WHATSAPP_API_BASE_URL=http://localhost:5050
VITE_WHATSAPP_API_ADDITIONAL_BASE_URLS=
VITE_WHATSAPP_KNOWN_NUMBERS=
VITE_LOCAL_API_BASE_URL=http://localhost:5053/api/local
VITE_APP_BUILD_LABEL=
```

## Backend local

- `server/local-api.mjs` roda como API local em Node.
- O arquivo `server/data/store.json` persiste:
  - usuarios locais
  - hashes de senha
  - sessoes autenticadas
  - conversas e mensagens locais
  - clientes sincronizados do NewBr
  - rotinas de disparo HSM e logs de execucao
  - etiquetas personalizadas e seus vinculos
  - estado da sincronizacao
  - logs das execucoes
- O login da SPA e 100% local.
- O backend emite cookie HttpOnly para autenticacao.
- A opcao `Manter-me conectado` usa expiracao longa de sessao.
- O endpoint administrativo de logout invalida as sessoes do usuario selecionado no servidor.

## Comandos uteis

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Deploy na VPS

- O fluxo operacional de publicacao remota esta documentado em `docs/maintenance/deploy-vps.md`.
- Toda atualizacao publicada deve preservar as acentuacoes corretas em portugues do Brasil.
- Os arquivos de interface e manutencao devem ser mantidos em `UTF-8`.
- O diretorio alvo atual da aplicacao na VPS e `/root/SaasTV`.
