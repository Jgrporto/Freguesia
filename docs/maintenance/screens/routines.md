# Tela Rotinas

## Rota e arquivos

- Rota: `/rotinas`
- Pagina: `src/pages/Rotinas.jsx`
- Componentes: `src/components/routines/*`
- API frontend: `src/lib/routines-api.js`
- Backend: `server/local-api.mjs`

## Estrutura da tela

- Topo com titulo, descricao e botao `Nova Rotina`.
- Cards: `Total Rotinas`, `Ativas`, `Pausadas`, `Ultimos envios OK`.
- Busca `Buscar rotinas...`.
- Coluna esquerda com cards resumidos das rotinas.
- Coluna direita com `Log operacional` e botao `Atualizar`.

## Modal

`Nova Rotina` abre um modal centralizado com overlay escuro. O corpo tem rolagem interna e o rodape fica fixo com `Cancelar` e `Salvar rotina`.

Secoes:

- Dados da rotina.
- Regra de execucao.
- Configuracao de disparo ou configuracao de etiqueta.
- Agenda semanal.
- Excecoes.
- Envio manual, apenas para rotina de disparo salva.
- Resumo lateral.
- Previa da rotina, apenas para disparo.

O timezone fica fixo internamente como `America/Sao_Paulo` e nao aparece no formulario. O campo `Publico da rotina` tambem nao aparece.

## Tipos

- `Rotina de Disparo`: envia HSM pela API oficial do WhatsApp.
- `Rotina de Etiqueta`: aplica/remove etiquetas e nao envia mensagem.
- `Rotina de Follow Up`: envia mensagem apenas para contatos da etiqueta-alvo configurada na rotina, como `Lead` ou `SQL`, cuja ultima mensagem do cliente esteja dentro da janela configurada.

## Regras e datas

Regras suportadas:

- `before_cut`: envio antes do corte, usando a data do proximo agendamento.
- `after_cut`: envio apos corte, usando o ultimo agendamento resolvido.
- `before_birthday`: envio antes do aniversario, usando a data de nascimento.
- `after_birthday`: envio apos aniversario, usando a data de nascimento.

As regras legadas `before_due`, `after_due` e `after_installation` ainda podem ser lidas pelo backend para compatibilidade com rotinas antigas, mas nao devem ser usadas em novas rotinas.

`ruleDays = 0` significa no proprio dia base.

Campos usados na base de clientes:

- Proximo agendamento/corte futuro: `ProximoAgendamento`, com fallback para `AgendamentoPendenteData`.
- Ultimo corte realizado: `UltimoAgendamentoResolvido`.
- Aniversario: `Nascimento`.

Na execucao agendada, o backend calcula a data alvo por cliente:

- `before_cut`: proximo agendamento menos `ruleDays`.
- `after_cut`: ultimo agendamento resolvido mais `ruleDays`.
- `before_birthday`: aniversario do ano corrente menos `ruleDays`.
- `after_birthday`: aniversario do ano corrente mais `ruleDays`.

Para `before_cut`, a protecao generica contra clientes com agendamento pendente nao bloqueia o disparo, porque o agendamento pendente e a propria referencia da regra.

## Agenda semanal e excecoes

Cada dia (`Seg` a `Dom`) possui:

- ativo/inativo;
- horario especifico.

Excecoes sao datas `YYYY-MM-DD` em que a rotina nao roda mesmo quando o dia e horario estao liberados.

## Intervalo

O intervalo exibido no formulario e sempre em segundos: `Intervalo entre disparos (segundos)`. O backend persiste tambem `sendIntervalMs` para compatibilidade, calculado a partir de `sendIntervalSeconds`.

## HSMs e resposta rapida

- Rotinas de disparo usam os HSMs persistidos em `/hsms`.
- Sobrescritas de parametros e midia ficam somente na rotina.
- O HSM original nao e alterado.
- A resposta rapida alternativa lista somente itens com categoria `Disparo`.
- Se nao houver resposta rapida de disparo, o modal mostra mensagem amigavel.
- A previa renderiza header, midia, body, footer e botoes visuais semelhantes ao WhatsApp.
- Parametros de botoes sao aplicados na previa quando existirem.
- Midia especifica da rotina fica em `hsm.mediaOverride` e nao altera o HSM original.
- Quando o HSM tem header de imagem, video ou documento, o modal exibe botao de upload `Enviar midia`; nao se deve digitar URL manualmente como fluxo principal.

## Previsao de clientes afetados

A previsao nao roda durante a edicao para evitar lentidao no formulario. Ela aparece ao clicar em `Executar` no card da rotina.

O fluxo de execucao manual:

- abre um modal com `POST /api/local/routines/:id/preview`;
- mostra os clientes afetados pela regra do dia;
- permite selecionar quais clientes devem receber;
- confirma pelo endpoint `POST /api/local/routines/:id/manual-run`;
- registra logs em tempo real.

A previsao usa a mesma base oficial de clientes de `/customers`.

Para rotina de disparo, o backend:

- aplica os filtros/audience da rotina;
- ignora planos com texto `TESTE`, seguindo a regra do legado `tv-assist-studio`;
- remove telefones duplicados;
- ignora clientes sem telefone valido;
- calcula a data de execucao por cliente;
- retorna apenas os clientes cuja execucao cai na data de referencia de hoje em `America/Sao_Paulo`;
- informa contadores de duplicados, telefone invalido, cliente sem data e cliente fora da regra.

Para rotina de etiqueta, a previsao usa as atribuicoes atuais de etiquetas/conversas para estimar os contatos que serao alterados.

A resposta retorna:

- `forecast.totalCandidates`;
- `forecast.affectedCount`;
- `forecast.referenceDate`;
- `forecast.targetDate`, quando aplicavel;
- `forecast.ignored`;
- `forecast.items`, limitado para manter a tela leve.

Rotinas migradas do `tv-assist-studio` usam a fonte viva `/api/routines` do legado. Como o legado esta com `SQL_STORE_ENABLED=true`, a fonte correta e a chave `routines` do SQL store, nao o arquivo JSON local defasado.

Quando uma rotina usa `{{checkoutoken}}`, `{{checkouttoken}}` ou `{{checkoutlink}}`, o token e gerado somente no backend durante a execucao do disparo, antes de chamar a API oficial do WhatsApp. A previsualizacao mostra apenas um marcador, para nao criar tokens reais sem envio.

## Envio manual

Rotinas de disparo salvas exibem `Envio manual`.

Fluxo:

- Abre modal secundario de selecao de clientes da base `/customers`.
- Busca por nome, telefone ou documento quando existir.
- Permite selecionar um ou mais clientes.
- Exibe resumo com rotina, HSM, quantidade e intervalo.
- Executa `POST /api/local/routines/:id/manual-run`.
- O backend remove telefones duplicados, ignora clientes sem telefone valido, respeita o intervalo em segundos e registra logs.
- O envio manual nao depende da regra de vencimento/instalacao.

## Etiquetas

Rotinas de etiqueta usam o catalogo atual de etiquetas do SaaSTV:

- etiquetas para adicionar;
- etiquetas para remover.

Na execucao, o backend evita trabalho duplicado e registra quantos contatos/conversas foram alterados.

## Follow Up

A rotina de Follow Up deve obedecer simultaneamente:

- etiqueta-alvo configurada na rotina de Follow Up, como `Lead` ou `SQL`;
- ultima mensagem enviada pelo cliente dentro da janela de 10h a 24h;
- limite de envios por contato definido em `followUp.maxSendsPerCustomer`.

Mensagens enviadas pelo bot/agente nao reabrem a janela de 24h para essa rotina. A referencia de janela e sempre a ultima mensagem do cliente.

## Logs em tempo real

Logs usam SSE:

- Historico inicial: `GET /api/local/routines/logs`.
- Stream: `GET /api/local/routines/logs/stream`.
- O frontend insere novos eventos sem refetch da tela inteira.
- O botao `Atualizar` permanece como fallback.
- A tela limita a renderizacao a ate 200 logs.

Eventos registrados:

- rotina criada;
- rotina atualizada;
- rotina apagada;
- execucao iniciada;
- cliente localizado/ignorado;
- envio iniciado;
- envio concluido ou falho;
- intervalo aguardado;
- resumo final.

Estados visuais:

- botao de execucao com loading;
- badge `Executando`;
- borda realcada no card em execucao;
- logs `running` com destaque e animacao leve;
- confirmacao antes de apagar rotina.

## Endpoints

- `GET /api/local/routines`
- `POST /api/local/routines`
- `POST /api/local/routines/preview`
- `PUT /api/local/routines/:id`
- `DELETE /api/local/routines/:id`
- `POST /api/local/routines/:id/preview`
- `POST /api/local/routines/:id/run-now`
- `POST /api/local/routines/:id/manual-run`
- `GET /api/local/routines/logs`
- `GET /api/local/routines/logs/stream`

## Persistencia

O estado fica em `server/data/store.json`, na chave `routines`:

- `routines.items`
- `routines.logs`
- `routines.lastSchedulerRunAt`

A estrutura atual suporta:

- `type`
- `status`
- `rule`
- `ruleDays`
- `weeklySchedule`
- `exceptions`
- `sendIntervalSeconds`
- `hsm`
- `quickReplyId`
- `labelActions`

Normalizadores mantem compatibilidade com rotinas antigas. Nunca sobrescrever `server/data/store.json` em deploy.

## Testes

- Abrir `/rotinas` e verificar cards, busca, listagem e log operacional.
- Abrir `Nova Rotina` e confirmar modal com rolagem interna e rodape fixo.
- Criar rotina de disparo com HSM, parametros, midia e intervalo em segundos.
- Criar rotina de etiqueta com adicionar/remover etiquetas.
- Executar envio manual selecionando clientes.
- Confirmar logs em tempo real.
- Editar rotina existente sem duplicar.
- Rodar `npm run build` e `node --check server/local-api.mjs`.
