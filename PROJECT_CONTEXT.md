# Contexto do Projeto Freguesia

## Objetivo

Aplicacao web independente para a operacao Freguesia, com foco em:

- fila de conversas
- acompanhamento de status
- painel de indicadores
- respostas rapidas
- configuracoes de equipe, servicos e notificacoes
- autenticacao local com sessao persistida
- rotinas de disparo HSM
- base de clientes sincronizada com o painel configurado

## Stack atual

- Vite
- React 18
- React Router
- TanStack Query
- Tailwind CSS
- Radix UI / shadcn
- API local Node em `server/local-api.mjs`
- SQLite por padrao em `server/data/freguesia.sqlite`

## Integracao da aplicacao

O frontend centraliza o acesso ao backend local em `src/lib/local-api.js`.
As chamadas autenticadas usam cookie HttpOnly com `credentials: include`.

As respostas de listas da integracao podem chegar como array puro ou payload envelopado
(`items`, `rows`, `data`, `results`). O frontend normaliza isso em
`src/lib/entity-collections.js` quando necessario.

## Fluxos principais

1. `Login`
   - autentica usuarios locais
   - persiste a sessao via cookie `freguesia_session`
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
   - consome a base persistida da integracao configurada

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
- `server/data/freguesia.sqlite` e a tabela `freguesia_json_store` persistem o estado quando SQLite esta habilitado.
- O login da SPA e 100% local.
- O backend emite cookie HttpOnly para autenticacao.
- A opcao `Manter-me conectado` usa expiracao longa de sessao.
- O endpoint administrativo de logout invalida as sessoes do usuario selecionado no servidor.

## Deploy na VPS

- Diretorio alvo recomendado: `/root/Freguesia`.
- Dominio recomendado: `freguesia.hakione.tech`.
- Services recomendados:
  - `freguesia-local-api.service`
  - `freguesia-whatsapp.service`
  - `freguesia-worker.service`
- O fluxo operacional esta documentado em `docs/maintenance/deploy-vps.md`.
Toda atualizacao publicada deve preservar UTF-8 e acentuacoes corretas em portugues do Brasil.
