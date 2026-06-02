# Tela Dashboard

## Rota e arquivos

- Rota: `/dashboard`
- Pagina: `src/pages/Dashboard.jsx`

## Objetivo

Exibir visao consolidada do atendimento com indicadores, evolucao recente e distribuicao operacional.

## Dados

- Fonte principal: conversas consumidas pelo frontend em `src/pages/Dashboard.jsx`
- Normalizacao: `normalizeEntityCollection`

## Observacoes de manutencao

- O dashboard e derivado apenas de conversas.
- Se novos status forem adicionados, rever os calculos de KPI e badges.
- Os graficos usam `recharts`.
