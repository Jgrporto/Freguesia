# Manutencao do Frontend

Este diretorio concentra a documentacao operacional das telas do projeto e os guias de manutencao do ambiente.

## Estrutura

- `deploy-vps.md`: fluxo operacional para publicar alteracoes na VPS em `/root/SaasTV`.
- `design-system.md`: diretrizes visuais aplicadas nas telas fora de atendimento.
- `screens/app-shell.md`: estrutura global da aplicacao.
- `screens/attendance.md`: tela de atendimento, com excecao visual inspirada no WhatsApp Web.
- `screens/dashboard.md`: visao geral operacional.
- `screens/kanban-view.md`: agrupamento operacional das filas por servico.
- `screens/customer-base.md`: base de clientes e disparos.
- `screens/chatbot.md`: fluxogramas de chatbot e editor React Flow.
- `screens/routines.md`: rotinas de disparo HSM com base de clientes.
- `screens/labels.md`: etiquetas automaticas e personalizadas.
- `screens/login.md`: autenticacao local e persistencia de sessao.
- `screens/quick-replies.md`: gestao de respostas rapidas.
- `screens/hsms.md`: gestao de templates HSM.
- `screens/settings.md`: perfil, equipe, logout administrativo e preferencias.
- `screens/page-not-found.md`: fallback de rota inexistente.
- `screens/user-not-registered.md`: acesso restrito para usuario sem liberacao.

## Observacoes

- A referencia principal de rotas esta em `src/App.jsx`.
- O shell compartilhado esta em `src/components/layout`.
- As telas fora de atendimento usam `PageShell`, `PageHeader` e `PageSectionCard`.
- A tela de atendimento mantem sua identidade propria e nao segue o mesmo layout de gestao.
- O processo de publicacao na VPS esta documentado em `deploy-vps.md`.
