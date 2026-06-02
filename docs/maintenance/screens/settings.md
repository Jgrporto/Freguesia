# Tela Configurações

## Rota e arquivos

- Rota: `/settings`
- Página: `src/pages/Settings.jsx`
- Persistência local: `server/local-api.mjs`

## Objetivo

Centralizar administração de perfil, equipe, funções/departamentos, serviços operacionais e preferências locais de notificação.

## Dados

- Usuário atual: `GET /api/local/auth/me`
- Equipe: `GET /api/local/entities/User`
- Funções: `GET /api/local/entities/Role`
- Serviços: `GET /api/local/entities/Service`
- Logout administrativo: `POST /api/local/auth/logout-user`
- Configuração da sincronização automática da base:
  - `GET /api/local/settings/customer-sync`
  - `PUT /api/local/settings/customer-sync`
- Preferências locais:
  - `saastv:settings:audit:v1`

## Funcionalidades

- Exibir nome, email e função do usuário autenticado.
- Criar, visualizar, editar e apagar usuários da equipe.
- Desconectar um usuário pela coluna `Ações`, invalidando as sessões ativas no backend local.
- Registrar histórico local de alterações por usuário.
- Criar, visualizar, editar e apagar funções/departamentos.
- Criar, visualizar, editar e apagar serviços de atendimento com histórico local.
- Descobrir números do WhatsApp a partir da API principal, APIs adicionais configuradas e números explícitos de fallback para vincular serviços sem editar a massa local manualmente.
- Vincular áudio personalizado a uma etiqueta criada.
- Fazer upload de áudio padrão e áudio personalizado para notificações do navegador.
- Ajustar o intervalo da sincronização automática da base de clientes, com persistência no backend local.
- Controlar acesso granular por bloco da tela de configurações em cada função via `settings_access`.
- Exibir estado visual de salvamento nos fluxos de usuário e função para evitar cliques duplicados.

## Backend local

- `server/local-api.mjs` persiste `Role`, `Service`, `notificationSettings`, `customerSyncSettings` e o bloco `auth`.
- Usuários da equipe usam `password_hash` no `store.json`.
- O frontend nunca recebe a senha em texto puro.
- Alteração de senha invalida as sessões ativas do usuário.
