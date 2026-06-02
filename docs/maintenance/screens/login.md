# Tela Login

## Rota e arquivos

- Rota: `/login`
- Pagina: `src/pages/Login.jsx`
- Auth context: `src/lib/AuthContext.jsx`
- Backend: `server/local-api.mjs`

## Objetivo

Autenticar usuarios locais, persistir a sessao e redirecionar o operador para a rota originalmente solicitada.

## Dados e fluxo

- Login: `POST /api/local/auth/login`
- Sessao atual: `GET /api/local/auth/me`
- Logout: `POST /api/local/auth/logout`
- Persistencia: cookie HttpOnly com expiracao controlada pela opcao `Manter-me conectado`

## Observacoes de manutencao

- Em ambiente HTTPS, o cookie de sessao sai com flag `Secure`.
- O backend aplica limite de tentativas e bloqueio progressivo contra brute force.
- A credencial padrao de migracao do admin local e `admin` / `admin`.
