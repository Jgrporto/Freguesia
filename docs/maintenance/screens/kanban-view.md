# Tela de Visao Kanban

## Rota e arquivos

- Rota: `/kanban`
- Pagina: `src/pages/KanbanView.jsx`

## Objetivo

- Agrupar as conversas por servico/fila operacional.
- Mostrar contagem de conversas ativas, aguardando e nao lidas por coluna.
- Exibir os operadores visiveis naquele servico com base nas conversas em andamento e no usuario autenticado.
- Esta rota nao deve ser confundida com o modo kanban da tela de etiquetas.

## Origem dos dados

- Conversas: `fetchWhatsappConversations` em `src/lib/whatsapp-api.js`
- Usuario autenticado: `useAuth` em `src/lib/AuthContext.jsx`

## Observacoes de manutencao

- O backend atual nao expoe presenca em tempo real de equipe.
- Por isso, a tela usa os agentes vinculados nas conversas ativas como aproximacao operacional dos usuarios atuando em cada servico.
- O kanban de etiquetas vive em `src/pages/Labels.jsx` e usa componentes dedicados em `src/components/kanban`.
- Se surgir uma API de presenca, a substituicao deve acontecer primeiro em `src/pages/KanbanView.jsx`.
