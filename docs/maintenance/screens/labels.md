# Tela de Etiquetas

## Rota e arquivos

- Rota: `/labels`
- Pagina: `src/pages/Labels.jsx`
- Utilitarios principais:
  - `src/lib/labels.js`
  - `src/lib/customer-base.js`
- Componentes auxiliares:
  - `src/components/labels/LabelBadge.jsx`
  - `src/components/labels/LabelFormDialog.jsx`

## Objetivo

- Consolidar as etiquetas automaticas derivadas da base NewBr e recalculadas continuamente sobre a base persistida na VPS.
- Permitir criacao de etiquetas personalizadas com titulo, descricao e cor, persistidas no backend local.
- Exibir as conversas associadas por etiqueta em modo cards ou kanban.
- O modo kanban desta tela representa as etiquetas como colunas e os contatos como cards arrastaveis.
- Respeitar a visibilidade dos servicos atribuidos ao usuario autenticado, ocultando conversas fora das filas permitidas.

## Regras atuais

- Etiquetas de sistema:
  - `Lead`
  - `SQL`
  - `Cliente`
  - `Pos-venda`
  - `Cancelados`
- As etiquetas de sistema sao mutuamente exclusivas e derivadas por `src/lib/labels.js`.
- `Lead` considera numero que nao existe na base principal de clientes ou numero presente apenas como trial/teste (`isTrial = Sim`) ainda nao vencido.
- `SQL` considera numero que existe na base apenas como trial/teste (`isTrial = Sim`) e ja esta vencido.
- Se o mesmo numero existir mais de uma vez na base, uma vez como trial e outra como cliente confirmado, o numero e tratado como `Cliente`, nunca como `SQL`.
- Quando a sincronizacao da base NewBr encontra um contato antes tratado como `Lead`, a etiqueta sai automaticamente de `Lead` e passa a ser recalculada como `Pos-venda`, `Cliente` ou `Cancelado` conforme os dados persistidos.
- `Pos-venda` considera cliente recente na base sincronizada, usando exclusivamente a data de criacao encontrada na base do cliente, dentro de ate 30 dias.
- `Cancelados` considera clientes com vencimento ha pelo menos 1 dia.
- `Cliente`, `Pos-venda` e `Cancelados` nao dependem apenas de uma nova sync: continuam sendo reavaliadas em tempo de execucao a partir da data atual e da ultima base persistida.
- As telas que consomem etiquetas usam polling curto de 3 segundos da base local para refletir mudancas de sincronizacao sem esperar recarga manual.
- Etiquetas personalizadas ficam persistidas no backend local da VPS e deixam de depender de `localStorage` para o estado canonico.
- A tela `/labels` agora tambem filtra as conversas pela mesma regra de servicos usada no atendimento.

## Persistencia

- Estado canonico:
  - `server/local-api.mjs`
  - `server/data/store.json`
- Estrutura persistida no backend local:
  - `labels.customLabels`
  - `labels.assignments`
  - `labels.stageAssignments`
- Endpoints locais:
  - `GET /api/local/labels`
  - `POST /api/local/labels`
  - `PUT /api/local/labels/:id`
  - `DELETE /api/local/labels/:id`
  - `PUT /api/local/labels/assignments/:conversationId`
  - `PUT /api/local/labels/stages/:conversationId`
  - `POST /api/local/labels/import`
- O frontend ainda le o `localStorage` legado apenas para migracao automatica de etiquetas antigas para o `store.json`.

## Estado atual do layout

- A visao `Cards` em `/labels` ficou mais enxuta e prioriza leitura rapida das etiquetas.
- O kanban interno desta pagina foi simplificado para reduzir peso visual e de renderizacao.
- Cada coluna do kanban carrega 20 conversas por vez e expande sob demanda com `Carregar mais 20`.
- O card de lead mostra somente avatar, nome, telefone/data, ultima mensagem e atalho principal para WhatsApp.
- Acoes secundarias do card foram movidas para um menu de contexto para reduzir DOM e ruido visual.

## Otimizacoes recentes

- `src/components/kanban/KanbanBoard.jsx` usa filtros memoizados e callbacks estaveis.
- `src/components/kanban/KanbanColumn.jsx` e `src/components/kanban/KanbanLeadCard.jsx` foram encapsulados com `React.memo`.
- As colunas usam rolagem vertical propria e o quadro preserva rolagem horizontal entre etiquetas.
- Os cards passaram a usar `contain: layout style paint` para isolar melhor o custo de renderizacao.

## Observacoes de manutencao

- Qualquer alteracao nas regras de derivacao deve manter coerencia com:
  - `src/pages/Attendance.jsx`
  - `src/components/chat/ConversationList.jsx`
  - `src/components/chat/ContactInfoPanel.jsx`
- Mudancas nas filas e na visibilidade operacional tambem precisam manter coerencia com:
  - `src/lib/services.js`
  - `src/lib/services-api.js`
  - `src/pages/Settings.jsx`
- A derivacao automatica continua no frontend, mas depende da ultima base persistida em `server/data/store.json` e do polling ativo das telas.
- Mudancas na persistencia compartilhada de etiquetas devem ser refletidas em:
  - `server/local-api.mjs`
  - `src/lib/labels-api.js`
  - `src/lib/labels.js`
- Etiquetas de sistema nao devem ser persistidas como estagio manual da conversa. A coluna/etiqueta de sistema deve vir sempre do recalcule automatico sobre a base de clientes, e o backend deve descartar qualquer estagio `system-*` legado.
- O kanban desta pagina reutiliza componentes de `src/components/kanban`.
- A rota `/kanban` continua reservada ao kanban operacional por filas e nao deve ser reaproveitada para etiquetas.
