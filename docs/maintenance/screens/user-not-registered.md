# Tela User Not Registered

## Rota e arquivos

- Tela auxiliar acionada por `AuthContext`
- Arquivo: `src/components/UserNotRegisteredError.jsx`

## Objetivo

Bloquear o acesso quando o usuário autenticado não possui autorização na base da aplicação.

## Layout

- Card centralizado.
- Ícone de alerta em destaque.
- Título e descrição curtos.
- Lista de verificações recomendadas.

## Funcionalidades

- Não possui ações assíncronas.
- Exibe instruções estáticas para validação de acesso.

## Observações de manutenção

- A decisão de exibir esta tela vem de `src/lib/AuthContext.jsx`.
- Se a estratégia de autenticação mudar, revisar o gatilho que leva a este componente.
