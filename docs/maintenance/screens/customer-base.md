# Tela Base de Clientes

## Rota e arquivos

- Rota: `/customers`
- Pagina: `src/pages/CustomerBase.jsx`
- Apoio:
  - `src/lib/customer-base.js`
  - `src/lib/customer-sync-api.js`
  - `server/local-api.mjs`
  - `server/data/store.json`

## Objetivo

Apresentar uma base operacional de clientes persistida na VPS, sincronizada com o NewBr e vinculada internamente as conversas do WhatsApp para filtro e disparo.

## Layout

- Cabecalho com os botoes `Sincronizar NewBr` e `Logs`.
- Primeiro card com filtros e acoes de lote.
- Segundo card com tabela de clientes e paginacao simples.
- Modal para disparo em massa.
- Modal de logs com execucoes, erros e resumo da base sincronizada.

## Dados

- Fonte principal: `GET /api/local/customers`
- Estado da sincronizacao: `GET /api/local/customers/sync`
- Logs: `GET /api/local/customers/logs`
- Importacao browser-first para persistencia local: `POST /api/local/customers/import`
- Inicio da sync browser-first: `POST /api/local/customers/sync/browser-start`
- Registro de falha browser-first: `POST /api/local/customers/sync/browser-failure`
- O frontend usa o navegador atual para autenticar no NewBr, paginar os clientes e seguir a sincronizacao em segundo plano dentro da SPA mesmo com troca de rota.
- Ao final da coleta no navegador, o frontend envia o lote pronto para `POST /api/local/customers/import`.
- A sincronizacao automatica segue a mesma estrategia browser-first: enquanto houver uma aba da SPA aberta, o `SiteNotificationBridge` monitora `nextScheduledAt` e dispara a nova coleta no navegador com as credenciais locais ja salvas.
- Vinculo auxiliar de conversa: `fetchWhatsappConversations` em `src/lib/whatsapp-api.js`
- Persistencia: `server/data/store.json`
- A base persistida tambem alimenta as etiquetas automaticas em `src/lib/labels.js`.

## Funcionalidades

- Buscar por usuario, nome, revendedor, plano ou telefone.
- Filtrar por vencimento, status, plano, teste, conexoes e conversa.
- Selecionar clientes por pagina ou individualmente.
- Exibir colunas `username`, `whatsapp`, `reseller`, `package`, `connections`, `expires_at` e `status`.
- Exibir mensagem de erro abaixo do botao de sincronizacao quando o navegador nao conseguir autenticar ou quando o NewBr bloquear a tentativa.
- Registrar logs de sucesso e falha com resumo da carga.
- Executar sincronizacao manual pelo navegador do operador e persistir o resultado na VPS.
- Executar sincronizacao automatica pelo navegador quando a janela agendada chegar e houver uma sessao da SPA aberta com credenciais locais salvas.
- Manter a sincronizacao manual rodando em segundo plano no frontend mesmo se o operador navegar para outras telas da aplicacao.
- Manter a sincronizacao automatica rodando em segundo plano no frontend mesmo se o operador trocar de rota dentro da aplicacao.
- Preservar a ultima base valida caso a sincronizacao atual falhe no meio do processo.
- Exibir notificacao curta no canto da tela ao iniciar a sincronizacao e atualizar para `Sincronizacao realizada com sucesso.` por 5 segundos quando a carga concluir.
- Copiar referencia NewBr e referencia interna de conversa.
- Abrir disparo individual ou em massa.
- Criar mensagens de saida usando o WhatsApp vinculado.

## Estados internos

- `filters`
- `page`
- `selectedIds`
- `dispatchTargets`
- `dispatchMessage`
- `dispatchOpen`
- `dispatchSending`
- `logsOpen`
- `syncStarting`

## Observacoes de manutencao

- A tela nao usa mais clientes sintetizados a partir de conversa.
- A consolidacao final e a persistencia ficam em `server/local-api.mjs`, mas a coleta principal do NewBr agora parte do navegador em `src/lib/customer-sync-api.js`.
- O backend local nao faz mais polling automatico do NewBr por conta propria; ele apenas guarda o estado publico da sync, o proximo horario previsto, os logs e a base consolidada.
- A acao manual da tela nao precisa mais ficar aberta ate o fim da carga: depois do clique, o processamento segue em background no frontend enquanto a SPA continuar carregada.
- A sync automatica depende de pelo menos uma aba autenticada da aplicacao continuar aberta, porque o login no NewBr e refeito no navegador usando as credenciais salvas localmente nesse dispositivo.
- A persistencia do `store.json` grava primeiro em arquivo temporario e so substitui a base quando a carga completa termina.
- O frontend continua operando mesmo durante a sync; a tabela so troca para a nova base quando o backend conclui a reconciliacao.
- Assim que a nova base fica persistida na VPS, as telas de etiquetas e atendimento passam a recalcular `Lead`, `SQL`, `Pos-venda`, `Cliente` e `Cancelados` sobre a carga mais recente.
- Mudancas nas chaves do payload do NewBr devem ser revisadas primeiro em `collectNewbrCustomersInBrowser`, `normalizeCustomerRow`, `extractCustomerField` e `findExpiryDate`.
