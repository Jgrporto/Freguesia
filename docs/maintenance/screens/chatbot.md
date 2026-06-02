# Tela Chatbot

## Rota e arquivos

- Rota de lista: `/chatbot`
- Rota de edicao: `/chatbot/editar/flow<codigo>`
- Paginas:
  - `src/pages/Chatbot.jsx`
  - `src/pages/ChatbotFlowEditor.jsx`
- API frontend:
  - `src/lib/chatbot-flows-api.js`
- Persistencia local:
  - `server/local-api.mjs`
  - `server/data/store.json`

## Objetivo

Permitir criar, importar, editar, ativar, baixar, excluir e executar fluxos visuais de chatbot usando React Flow.

## Regras atuais

- O codigo do flow e incremental e inicia em `1`.
- A URL de edicao usa o codigo no formato `/chatbot/editar/flow1`.
- O JSON exportado inclui metadados do flow e o estado visual com `nodes`, `edges` e `viewport`.
- Componentes desativados por enquanto:
  - Servico
  - Horario
  - Code
- Todo flow possui o componente fixo `inicio fluxo`, com icone de robo, regra de comparacao e valor gatilho. Ele nao pode ser removido.
- O editor aceita clique para adicionar componentes e arrastar da barra superior para o canvas.
- A tecla `Delete` remove componentes selecionados; `Backspace` nao e usado para exclusao.
- Ao existir alteracao nao salva, a tela bloqueia a saida e exibe aviso para salvar antes.
- Etiquetas de sistema nao aparecem nos dropdowns de adicionar/remover etiqueta do chatbot.
- Variaveis padrao disponiveis para uso em mensagens:
  - `{#usuario}`
  - `{#senha}`
  - `{#plano}`
  - `{#vencimento}`
- Variaveis padrao nao devem ter valor alteravel no editor; variaveis customizadas sao criadas no componente `Setar Variaveis`.

## Componentes do editor

- Inicio: define regra e palavra/valor que dispara o flow.
- Mensagem: envia texto e, quando houver header, envia imagem, video ou documento com upload e preview.
- Audio: envia audio com upload e preview para ouvir.
- Etiqueta: adiciona ou remove etiquetas personalizadas independentes.
- Finalizacao: marca a interacao como encerrada para o bot.
- URA: envia uma mensagem em textarea junto das opcoes como texto, botoes ou lista, conforme suporte do endpoint WhatsApp.
- Setar Variaveis: define variaveis customizadas por nome simples; uso nas mensagens continua no formato `{#variavel}`.
- Redirecionar: aponta para outro componente do flow.
- Espera: pausa a execucao ate o tempo configurado.

## Setas da URA

- `Opcao`: ate 10 saidas por componente URA e permite descricao.
- `Invalido`: somente uma saida por componente URA.
- `Tempo de Espera`: somente uma saida por componente URA.

## Observacoes de manutencao

- O editor importa `@xyflow/react/dist/style.css` e `@fortawesome/fontawesome-free/css/all.min.css`.
- Antes de mudar o modelo de `nodes` ou `edges`, manter compatibilidade com JSONs exportados.
- O backend local executa flows em `/api/local/chatbot/process-conversation` e preserva o seletor do numero WhatsApp (`phoneNumberId`, `displayPhoneNumber`, `routeKey`).
- Eventos de inicio/fim de flow ficam em `/api/local/chatbot/events` e aparecem no centro do chat como mensagens de sistema.
- Uploads do chatbot sao enviados para `/api/local/chatbot/assets` e ficam persistidos no store local para envio posterior.
- Para evitar respostas retroativas, novos disparos exigem mensagem recente; sessoes ativas continuam para URA e espera.
- `server/data/store.json` continua sendo dado vivo da VPS e nao deve ser sobrescrito em deploy comum.
