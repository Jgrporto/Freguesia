# Deploy na VPS

## Escopo

Este documento descreve o fluxo operacional para publicar alteracoes deste projeto na VPS usada pelo ambiente `SaasTV`.

## Destino atual

- Host de publicacao: `root@89.117.32.226`
- Diretorio da aplicacao na VPS: `/root/SaasTV`
- Pasta de backup remoto: `/root/SaasTV/.deploy-backups`
- Service do backend local: `saastv-local-api.service`
- Service da stack WhatsApp/Checkout/Painel Agent: `tv-assist-whatsapp.service`

## Premissas

- O operador precisa ter acesso SSH valido ao host.
- Senhas, chaves privadas e tokens nao devem ser versionados neste repositorio.
- O deploy padrao deste projeto e feito no proprio diretorio `/root/SaasTV`, preservando a estrutura de arquivos local.
- Toda atualização enviada para a VPS deve manter as acentuações corretas em português do Brasil na interface e na documentação.
- Os arquivos alterados devem ser salvos em codificação `UTF-8` para evitar texto corrompido ou caracteres quebrados no deploy.

## Quando este fluxo deve ser usado

- Alteracoes em `src/`, `docs/`, `README.md`, `PROJECT_CONTEXT.md` e outros arquivos do frontend.
- Ajustes que dependem de novo `build` Vite para atualizar o conteudo servido em `dist/`.

## Regra critica sobre dados persistidos

- `server/data/store.json` e estado vivo da VPS e nao deve ser sobrescrito em deploys comuns.
- O arquivo local do repositorio pode servir apenas como referencia de desenvolvimento ou massa minima, nunca como fonte canonica de producao.
- So envie `server/data/store.json` para a VPS em manutencao controlada de dados, com backup explicito e restauracao planejada.
- Em publicacoes normais de frontend/backend local, excluir `server/data/store.json` do pacote enviado.

## Fluxo padrao

1. Validar localmente o que sera publicado.
   - Revisar `git diff` e garantir que apenas os arquivos esperados serao enviados.
   - Rodar `npm run build` localmente para pegar regressao obvia antes do upload.

2. Conectar na VPS e confirmar o projeto alvo.
   - Entrar em `root@89.117.32.226`.
   - Confirmar que o deploy sera aplicado em `/root/SaasTV`.

3. Criar backup remoto antes de sobrescrever arquivos.
   - Gerar um timestamp.
   - Copiar para `/root/SaasTV/.deploy-backups/<timestamp>/...` cada arquivo que sera alterado.
   - O backup deve manter a mesma arvore relativa dos arquivos originais.

4. Enviar apenas os arquivos alterados.
   - Preservar o mesmo caminho relativo dentro de `/root/SaasTV`.
   - Nao apagar arquivos remotos sem necessidade.

5. Rebuildar o frontend na VPS.
   - Executar `cd /root/SaasTV && npm run build`.
   - Esse passo atualiza a pasta `dist/` usada pelo ambiente remoto.

6. Validar o resultado minimo do deploy.
   - Confirmar que `dist/index.html` recebeu novo timestamp.
   - Conferir se o build terminou sem erro.
   - Se necessario, abrir a aplicacao publicada no navegador e validar a tela alterada.

## Comandos uteis

### Build local

```bash
npm run build
```

### Deploy automatizado com backup

```powershell
npm run deploy:vps -- -Files server/local-api.mjs,docs/maintenance/deploy-vps.md
```

O script:

- cria backup remoto em `/root/SaasTV/.deploy-backups/<timestamp>`;
- envia apenas os arquivos informados;
- roda `npm run build` na VPS quando houver impacto em frontend;
- reinicia `saastv-local-api.service` se `server/local-api.mjs` mudar;
- reinicia `tv-assist-whatsapp.service` se a stack `server/whatsapp-server.js`, `server/checkout-server.js`, `server/painel-agent-broker.js`, `server/start-all.js`, `package.json` ou `package-lock.json` mudar.

### Build remoto

```bash
cd /root/SaasTV
npm run build
```

### Exemplo de backup remoto

```bash
mkdir -p /root/SaasTV/.deploy-backups/20260505-091838/src/pages
cp /root/SaasTV/src/pages/Attendance.jsx /root/SaasTV/.deploy-backups/20260505-091838/src/pages/Attendance.jsx
```

### Exemplo de verificacao remota

```bash
cd /root/SaasTV
stat -c '%y %n' dist/index.html
git status --short
systemctl status saastv-local-api.service --no-pager
systemctl status tv-assist-whatsapp.service --no-pager
```

## O que precisa ser feito em cada tipo de alteracao

### Alteracao apenas de frontend

- Fazer backup dos arquivos alterados.
- Enviar os arquivos para `/root/SaasTV`.
- Rodar `npm run build` na VPS.

### Alteracao de documentacao

- Enviar os arquivos de `docs/`, `README.md` e/ou `PROJECT_CONTEXT.md`.
- Se nao houver impacto em `src/`, o rebuild nao e tecnicamente obrigatorio, mas pode ser mantido quando o deploy fizer parte de um pacote maior ja rebuildado.

### Alteracao em backend local da aplicacao

Arquivos tipicos:

- `server/local-api.mjs`
- `server.py`
- `server/data/store.json` quando houver manutencao controlada

Nesses casos, alem do upload:

- confirmar qual processo realmente esta em uso na VPS;
- aplicar o restart correspondente ao runtime ativo;
- validar logs e disponibilidade do endpoint afetado.

Observacao:

- Atualmente a VPS usa `saastv-local-api.service` para `server/local-api.mjs`.
- Atualmente a VPS usa `tv-assist-whatsapp.service` para `server/start-all.js`, que sobe `server/whatsapp-server.js`, `server/checkout-server.js` e `server/painel-agent-broker.js`.
- Se houver mudanca estrutural de runtime, valide novamente os units antes de reiniciar.

## Rollback

Se o deploy precisar ser revertido:

1. Identificar o backup criado em `/root/SaasTV/.deploy-backups/<timestamp>`.
2. Restaurar os arquivos afetados para seus caminhos originais.
3. Rodar `npm run build` novamente, se a reversao envolver arquivos do frontend.

### Rollback automatizado

```powershell
npm run rollback:vps -- -Timestamp 20260516-153000
```

O rollback:

- restaura todos os arquivos presentes naquele backup remoto;
- roda `npm run build` na VPS por padrao;
- reinicia `tv-assist-whatsapp.service` e `saastv-local-api.service` por padrao.

## Checklist rapido

- Diff revisado.
- `npm run build` local validado.
- Backup remoto criado.
- Arquivos corretos enviados para `/root/SaasTV`.
- `npm run build` executado na VPS.
- Validacao basica concluida.
