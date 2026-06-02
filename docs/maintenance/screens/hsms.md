# Tela HSMs

## Rota e arquivos

- Rota: `/hsms`
- Pagina: `src/pages/Hsms.jsx`
- Componente principal: `src/components/hsm/HsmSection.jsx`
- Integracao: `src/lib/hsm-api.js`

## Objetivo

Gerenciar templates HSM locais, sincronizar com Meta e permitir criacao, edicao, visualizacao e remocao.

## Layout

- Card principal com titulo, descricao e botao `Sincronizar Meta`.
- Barra de busca por nome e CTA `Criar HSM`.
- Tabela paginada com acoes, codigo, nome, categoria, descricao, preview, ativo, status e data.
- Rodape da lista com paginacao e aumento de itens por pagina.
- Modal amplo com formulario completo e preview lateral.

## Dados

- Leitura local: `fetchLocalHsms`
- Sincronizacao remota: `fetchMetaHsms`
- Persistencia local: `saveLocalHsm`, `replaceLocalHsms`, `deleteLocalHsm`
- Persistencia visual auxiliar: `readHsmUiState`, `writeHsmUiState`, `removeHsmUiState`
- Upload: `uploadHsmMedia`

Os campos necessarios para `Iniciar conversa` e `Rotinas` devem ficar no payload persistido do HSM: descricao, ativo, header, midia padrao, body, footer, botoes e parametros. O `localStorage` pode complementar a experiencia visual, mas nao deve ser a fonte unica de dados funcionais.

## Funcionalidades

- Buscar templates por nome.
- Alternar paginacao iniciando em 10 itens por pagina.
- Aumentar a quantidade exibida por pagina em passos de 10.
- Sincronizar templates da Meta com o armazenamento local.
- Criar, editar, visualizar e apagar HSM.
- Definir categoria, idioma, header, body, footer, botoes e ativo.
- Fazer upload de midia para header.
- Renderizar preview da mensagem.
- Servir como fonte canonica de templates para a tela `/rotinas`.

## Observacoes de manutencao

- O formulario concentra muita regra de negocio no proprio componente.
- Mudancas de payload da Meta devem ser refletidas nos mapeadores:
  - `mapLocalItemToTemplate`
  - `mapRemoteItemToTemplate`
  - `toLocalPayload`
- A criacao remota depende das limitacoes da API expostas em `getMetaSaveNote`.
