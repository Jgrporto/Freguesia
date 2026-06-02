# Tela de Atendimento

## Rota e arquivos

- Rota: `/`
- Página: `src/pages/Attendance.jsx`
- Componentes principais:
  - `src/components/chat/ConversationList.jsx`
  - `src/components/chat/ChatWindow.jsx`
  - `src/components/chat/ChatMessage.jsx`
  - `src/components/chat/MessageInput.jsx`
  - `src/components/chat/QuickReplyPicker.jsx`
  - `src/components/chat/TemplatePicker.jsx`
  - `src/components/chat/ContactInfoPanel.jsx`
  - `src/components/chat/ContactAvatar.jsx`

## Regra visual

- Esta tela é exceção ao design system branco das telas de gestão.
- O layout segue a referência de WhatsApp Web:
  - lista de conversas à esquerda
  - chat no centro
  - painel de contato à direita quando aberto
- Mesmo com essa exceção no miolo, a tela continua abaixo do `AppTopbar` global do shell.

## Layout funcional

- Coluna 1: lista de conversas com busca, filtros `Todos`, `Não lidas` e `Resolvidas`, dropdown de serviços, dropdown de etiquetas, badges de janela `24h/HSM`, virtualização e largura ligeiramente maior para ficar mais próxima da referência do WhatsApp Web.
- Coluna 2: cabeçalho do contato, histórico de mensagens, busca interna, reações, reply e composer.
- Coluna 3: dados do contato com visualização clara das etiquetas, histórico local em janelas de 24h e vinculação de etiquetas personalizadas.

## Scrollbars

- A tela usa scrollbars finas e unificadas com o restante da aplicação via `src/index.css`.
- A lista de conversas e a coluna de mensagens herdam a mesma linguagem visual global para manter consistência entre shell e atendimento.

## Dados e consultas

- Conversas: `fetchWhatsappConversations` em `src/lib/whatsapp-api.js`
- Mensagens: `fetchWhatsappMessages` em `src/lib/whatsapp-api.js`
- Serviços e filas: `fetchServices` em `src/lib/services-api.js`
- Cache local:
  - conversas e mensagens em `src/lib/inbox-cache.js`
  - rascunhos por conversa em `src/lib/inbox-cache.js`
- Histórico local: `src/lib/conversation-history.js`
- A tela consome a API existente do WhatsApp via `src/lib/whatsapp-http.js`.

## Funcionalidades ativas

- Buscar conversas por nome, telefone ou última mensagem.
- Filtrar conversas por `Todos`, `Não lidas`, `Resolvidas`, serviço e etiqueta.
- Mostrar no filtro apenas os serviços atribuídos ao usuário autenticado.
- Ocultar conversas que não pertencem a nenhum serviço acessível para o usuário atual.
- Quando `Todos os Serviços` estiver ativo e a conversa pertencer a mais de uma fila acessível, exibir os ícones desses serviços no avatar do contato.
- Abrir conversa com foco imediato no composer.
- Carregar mensagens recentes, buscar histórico antigo e fazer polling incremental.
- Enviar texto, imagem, áudio e template HSM.
- Abrir modal de preview de mídia para anexos selecionados no composer.
- Colar imagem ou vídeo via `Ctrl + V` direto no textarea para abrir o preview.
- O composer limpa o textarea imediatamente ao enviar texto; se o envio falhar, o texto é restaurado no campo.
- A confirmação assíncrona do backend não pode mais limpar o draft atual, para permitir digitação contínua entre envios consecutivos.
- Responder mensagem com preview de citação.
- Buscar texto dentro da conversa aberta.
- Abrir e fechar painel lateral de informações do contato.
- Exibir etiqueta principal da conversa na lista, no cabeçalho do chat e no painel lateral.
- Criar e vincular etiquetas personalizadas direto pelo painel lateral do contato.
- Exibir status da janela de 24 horas e bloquear texto fora da janela.
- Inserir respostas rápidas via comando `/`, inclusive no meio ou no fim do texto já digitado.
- Persistir rascunho local por conversa.
- Exibir anexos com fallback visual quando a mídia da API falhar.
- Abrir imagens, stickers e vídeos do histórico em tela cheia, com navegação lateral e zoom por scroll.
- Fechar a conversa atual com `Esc` e voltar ao estado inicial "Selecione uma conversa".
- Encerrar atendimento por modal com os tipos `Resolvido` e `Falta de interação`.
- Exibir o nome do agente acima das mensagens enviadas para os demais operadores da conversa.
- Persistir um histórico local das mensagens por conversa e agrupá-lo em janelas contínuas de 24h.

## Reações

- O comportamento visual das reações fica em `src/components/chat/ChatMessage.jsx`.
- No hover da mensagem aparece apenas o botão sutil de reação ao lado do balão.
- Ao clicar nesse botão, abre apenas uma pill horizontal de emojis em camada `fixed`, centralizada em relação ao balão.
- A animação da pill parte do próprio ponto de ativação: quando abre acima, sobe a partir do ícone de reação; quando precisa abrir abaixo por falta de espaço, inverte o sentido sem quebrar o fluxo.
- Se a mensagem estiver próxima do topo da viewport, a pill abre abaixo da mensagem.
- A contenção visual da pill usa como boundary a própria coluna central de mensagens (`data-chat-overlay-boundary="true"` em `ChatWindow.jsx`), evitando invadir a lista de conversas.
- Se a pill encostar nas bordas laterais ou superior/inferior dessa área, ela reajusta `top/left` para continuar totalmente visível e não ser cortada pelo container do chat.
- O hover serve apenas para revelar o botão de reação; depois de aberta, a pill permanece disponível durante a interação.
- A pill fecha ao:
  - selecionar uma reação
  - clicar fora
- A área ativa da pill considera o balão, o botão de reação, o badge aplicado e a própria pill; ao sair dessa área o fechamento ocorre com atraso curto para evitar flicker.
- Reações persistidas ficam centralizadas logo abaixo da bolha em formato compacto, seguindo a referência visual do WhatsApp Web.
- O badge de reação fica no fluxo normal da conversa, em um bloco próprio abaixo da mensagem, para evitar colisão com a mensagem seguinte.
- O conjunto rápido atual usa:
  - `👍`
  - `❤️`
  - `😂`
  - `😮`
  - `😢`
  - `🙏`
- A regra funcional atual é uma reação por atendente por mensagem:
  - clicar em outro emoji troca a reação existente
  - clicar no mesmo emoji remove
- O backend atual usa `POST /api/whatsapp/messages/react` e já implementa `toggle/replace`.

## Menu de contexto

- O menu de contexto das mensagens fica em `src/components/chat/ChatMessage.jsx`.
- Ele abre no `onContextMenu` do balão da mensagem e usa `position: fixed`.
- O posicionamento respeita o mesmo boundary da coluna central do chat para não invadir a lista de conversas nem sair da área visível.
- As opções atuais são:
  - `Responder`
  - `Reagir`
  - `Encaminhar`
  - `Informações`
  - `Excluir`
- `Responder` reaproveita o fluxo de citação do `MessageInput.jsx`.
- `Reagir` fecha o menu e abre a pill de reações existente.
- `Encaminhar`, `Informações` e `Excluir` são callbacks controlados pelo `ChatWindow.jsx`; no estado atual ainda funcionam como stubs com `toast`/`console`.
- O menu fecha ao:
  - clicar fora
  - selecionar uma opção
  - pressionar `Escape`
- A navegação por teclado suporta:
  - `ArrowUp`
  - `ArrowDown`
  - `Enter`

## Limitações atuais

- O frontend não altera prioridade, departamento, tags ou notas; o painel lateral é somente leitura.
- As etiquetas personalizadas agora ficam persistidas no backend local (`server/data/store.json`) e sincronizadas entre as telas pela API local.
- As etiquetas automáticas são recalculadas a cada leitura da conversa com base na última base NewBr persistida e na data atual.
- A visibilidade por serviço atualmente usa a intersecção entre as etiquetas da conversa e as etiquetas exigidas pelo serviço.
- Quando a conversa já traz `display_phone_number` ou `phone_number_id`, a visibilidade do serviço passa a exigir também compatibilidade com os números vinculados naquele serviço.
- Se a conversa ainda não trouxer a linha de origem de forma estável, a tela mantém fallback para a regra anterior baseada em etiquetas, evitando ocultar atendimentos legados.
- O backend atual não expõe envio de documento e vídeo por esta tela.
- O backend atual também não expõe envio de sticker nem `view once` pelo painel, então a UI bloqueia esses fluxos com feedback explícito.
- Fotos de perfil oficiais da Meta ainda não passam por um proxy/cache dedicado do backend.
- A lista de conversas ainda chega inteira da API; a virtualização reduz custo de renderização, mas não substitui paginação no backend.

## Observações de manutenção

- A tela depende de forte sincronização entre `Attendance.jsx`, `ChatWindow.jsx` e `ContactInfoPanel.jsx`.
- Mudanças no formato de conversa, mensagem, anexo ou reação devem ser validadas em:
  - `src/lib/whatsapp-api.js`
  - `src/components/chat/ChatWindow.jsx`
  - `src/components/chat/ChatMessage.jsx`
- O fluxo de envio usa UI otimista com reconciliação posterior. Se houver regressão de duplicação, revisar primeiro:
  - `createOptimisticMessage`
  - `mergeMessages`
  - `commitSendSuccess`
- O fluxo de reações também usa reconciliação local temporária para evitar sumiço visual durante polling.
- Se a API de mensagens ainda não refletir a reação do agente, o frontend preserva a reação localmente até que o backend passe a devolvê-la no payload:
  - `pending_agent_reaction`
  - `pending_agent_reaction_at`
  - `resolveMergedReactions`
- O arquivamento local do histórico usa `src/lib/conversation-history.js` sobre a entidade local `Message`; qualquer evolução futura de histórico definitivo deve manter compatibilidade de leitura.
- O layout desta tela é mais sensível a regressão visual que o restante das telas de gestão.
