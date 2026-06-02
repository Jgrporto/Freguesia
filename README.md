# Freguesia Atendimento

Painel web independente para atendimento, conversas WhatsApp, respostas rapidas, HSMs, rotinas e base de clientes da operacao Freguesia.

## Requisitos

- Node.js 20+
- npm 10+
- Nginx para publicacao em producao

## Configuracao local

1. Instale as dependencias:
   `npm install`
2. Crie um arquivo `.env.local` na raiz do projeto.
3. Configure as URLs da aplicacao:

```env
VITE_WHATSAPP_API_BASE_URL=http://localhost:5250
VITE_WHATSAPP_API_ADDITIONAL_BASE_URLS=
VITE_WHATSAPP_KNOWN_NUMBERS=
VITE_LOCAL_API_BASE_URL=http://localhost:5253/api/local
VITE_APP_BUILD_LABEL=
```

## Backend local

```env
PORT=5253
SQL_STORE_ENABLED=true
SQL_STORE_DRIVER=sqlite
SQLITE_DB_PATH=server/data/freguesia.sqlite
SQL_STORE_REQUIRE=true
LOCAL_WHATSAPP_API_BASE_URL=http://127.0.0.1:5250
LOCAL_CHECKOUT_API_BASE_URL=http://127.0.0.1:5251
LOCAL_CHECKOUT_TOKEN_API_BASE_URL=http://127.0.0.1:5250
```

As variaveis `NEWBR_*` continuam existindo por compatibilidade com a integracao atual de base de clientes. Na nova VPS, defina usuario e senha no `.env`; o projeto nao carrega mais credenciais antigas por padrao.

## Login local

- Rota: `/login`
- Sessao: cookie HttpOnly emitido por `server/local-api.mjs`
- Cookie: `freguesia_session`
- Credencial inicial de migracao: `admin` / `admin`

## Execucao

```bash
npm run dev
npm run build
npm run preview
```

## Estrutura principal

- `src/pages`: telas da aplicacao
- `src/components`: componentes de layout, chat, rotinas e dashboard
- `src/lib/local-api.js`: cliente compartilhado da API local
- `src/lib/local-auth.js`: login, logout e consulta da sessao local
- `server/local-api.mjs`: API local com persistencia e autenticacao
- `server/whatsapp-server.js`: WhatsApp, HSMs e rotinas
- `server/checkout-server.js`: checkout
- `server/freguesia-worker.js`: worker de agendamentos

## Deploy

O fluxo de VPS e Nginx esta em `docs/maintenance/deploy-vps.md`.
