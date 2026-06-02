# Tela Respostas Rapidas

## Rota e arquivos

- Rota: `/quick-replies`
- Pagina: `src/pages/QuickReplies.jsx`

## Objetivo

Gerenciar respostas rapidas utilizadas no atendimento para agilizar respostas e padronizar comunicacao.

## Dados

- Fonte: `GET /api/local/entities/QuickReply`
- Escrita:
  - `POST /api/local/entities/QuickReply`
  - `PUT /api/local/entities/QuickReply/:id`
  - `DELETE /api/local/entities/QuickReply/:id`

## Observacoes de manutencao

- O mesmo conjunto de respostas rapidas e consumido pelo `QuickReplyPicker` na tela de atendimento.
- Qualquer mudanca estrutural na entidade deve ser refletida em `QuickReplyPicker.jsx`.
