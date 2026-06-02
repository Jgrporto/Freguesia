# App Shell

## Rotas e arquivos

- Arquivo principal: `src/App.jsx`
- Layout: `src/components/layout/AppLayout.jsx`
- Sidebar: `src/components/layout/AppSidebar.jsx`
- Topbar global: `src/components/layout/AppTopbar.jsx`
- Bridge global: `src/components/layout/SiteNotificationBridge.jsx`
- Historico de atualizacoes: `src/lib/update-history.js`
- Wrappers de pagina: `src/components/layout/PageShell.jsx`, `PageHeader.jsx`, `PageSectionCard.jsx`

## Estrutura

- Sidebar fixa a esquerda com navegacao primaria.
- `Novidades` e `Configuracoes` ficam ancorados no final da sidebar, acima das acoes de shell, sem divisoria adicional entre a navegacao principal e esse bloco.
- Area principal a direita com `Outlet` do React Router.
- Topbar global fixa no topo da area principal, conectada visualmente ao shell lateral.
- Titulo, subtitulo, build atual e notificacoes ficam no topbar.

## Navegacao atual

- Ordem principal:
  - `/dashboard` Dashboard
  - `/` Atendimento
  - `/kanban` Visao Kanban
  - `/quick-replies` Respostas Rapidas
  - `/customers` Base de Clientes
  - `/labels` Etiquetas
  - `/chatbot` Chatbot
  - `/rotinas` Rotinas
  - `/hsms` HSMs
- Itens fixos no final da sidebar:
  - `Novidades`
  - `/settings` Configuracoes

## Responsabilidades

- Controlar o estado de recolhimento da barra lateral.
- Manter a navegacao global consistente.
- Exibir o build atual e o historico de atualizacoes pelo modal de notificacoes.
- Manter `currentBuildLabel` alinhado com a versao da entrada mais recente em `src/lib/update-history.js`.
- Aplicar a base visual compartilhada nas telas de gestao.
- Centralizar alertas globais da sincronizacao NewBr e sons/notificacoes operacionais que precisam continuar ativos em qualquer rota.

## Modal de atualizacoes

- O icone de notificacoes fica na extrema direita do topbar.
- Ao clicar, abre um modal com historico de alteracoes aplicadas.
- O modal mostra:
  - build atual
  - entradas mais recentes
  - resumo e lista curta do que mudou

## Observacoes de manutencao

- Alteracoes de layout global devem ser avaliadas com cuidado por impactarem todas as rotas.
- Mudancas visuais no sidebar e no topbar tambem afetam a tela de atendimento, embora o miolo dela siga excecao propria.
- Novas entregas relevantes devem ser registradas em `src/lib/update-history.js`.
