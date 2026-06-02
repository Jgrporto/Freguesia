# Design System de Gestão

## Escopo

Aplica-se a todas as telas de gestão do projeto, com exceção da tela de atendimento.

## Princípios

- Estilo SaaS limpo, profissional e minimalista.
- Fundo principal branco.
- Cards brancos com borda suave, raio de 8px e sombra discreta.
- Tipografia principal em tons escuros com hierarquia clara.
- Espaçamento generoso entre blocos para leitura rápida.

## Tokens principais

- Fundo principal: `#FFFFFF`
- Texto principal: `#333333`
- Texto secundário: `#777777`
- Bordas e separadores: `#E0E0E0`
- Fundo neutro: `#F5F5F5`
- Ação principal: `#25D366`
- Links e destaque secundário: `#1E88E5`
- Sucesso: fundo `#E6F7ED`, texto `#25D366`
- Pendente: fundo `#FFF8E1`, texto `#FFC107`
- Erro: fundo `#F8D7DA`, texto `#DC3545`

## Estrutura comum

- Barra lateral fixa à esquerda.
- Conteúdo principal flexível à direita.
- Cabeçalho de tela com título, descrição e ações.
- Seções internas em cards com borda e sombra leve.

## Componentes padronizados

- `PageShell`: container horizontal e vertical das telas.
- `PageHeader`: título, descrição e bloco de ações.
- `PageSectionCard`: card padrão das seções de conteúdo.
- `Button`, `Input`, `Card` e `Pagination`: ajustados para seguir o guia visual.

## Linguagem

- Toda interface, documentação operacional e texto persistido no frontend deve usar Português do Brasil (`pt-BR`) com acentuação correta.
- Novas telas, modais, `toast`, placeholders, rótulos e descrições não devem introduzir variantes sem acento como `Configuracoes`, `Nao` ou `Historico`.
- Ao editar arquivos legados, normalizar a escrita para `pt-BR` no mesmo escopo da alteração para evitar regressões visuais.

## Exceção

- `Attendance` não segue este design system no miolo da tela.
- O objetivo de `Attendance` continua sendo uma experiência de chat mais próxima do WhatsApp Web.
