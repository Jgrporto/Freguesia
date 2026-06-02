# Deploy na VPS - Freguesia

## Escopo

Este documento descreve como instalar e publicar o projeto Freguesia em uma nova VPS, servindo a SPA pelo Nginx e proxyando a API para `freguesia.hakione.tech`.

## Destino recomendado

- Diretorio da aplicacao: `/root/Freguesia`
- Web root do build: `/var/www/freguesia/current`
- Dominio principal: `freguesia.hakione.tech`
- Alias: `www.freguesia.hakione.tech`
- Backend local: `freguesia-local-api.service` em `127.0.0.1:5053`
- WhatsApp: `freguesia-whatsapp.service` em `127.0.0.1:5050`
- Worker: `freguesia-worker.service`

## DNS necessario

Voce ja criou:

```text
CNAME www.freguesia -> freguesia.hakione.tech
```

Ainda e necessario que o host raiz exista:

```text
A freguesia -> IP_DA_NOVA_VPS
```

Sem esse registro `A`, o `www.freguesia.hakione.tech` pode apontar para `freguesia.hakione.tech`, mas o destino final nao resolve para a VPS.

## Instalar dependencias na VPS

```bash
apt update
apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

## Clonar o projeto

```bash
cd /root
git clone https://github.com/Jgrporto/Freguesia.git Freguesia
cd /root/Freguesia
npm ci
```

## Criar `.env`

```bash
cd /root/Freguesia
nano .env
```

Base minima:

```env
NODE_ENV=production
PORT=5053

SQL_STORE_ENABLED=true
SQL_STORE_DRIVER=sqlite
SQLITE_DB_PATH=server/data/freguesia.sqlite
SQL_STORE_REQUIRE=true
SQL_STORE_DUAL_WRITE_JSON=false
SQL_STORE_CACHE_TTL_MS=1200

WHATSAPP_HTTP_ENABLED=true
WHATSAPP_SCHEDULERS_ENABLED=false
WHATSAPP_STORE_CACHE_TTL_MS=3000
WHATSAPP_SERVER_PORT=5050
CHECKOUT_SERVER_PORT=5051
PANEL_AGENT_PORT=5052

LOCAL_WHATSAPP_API_BASE_URL=http://127.0.0.1:5050
WHATSAPP_API_BASE_URL=http://127.0.0.1:5050
LOCAL_CHECKOUT_API_BASE_URL=http://127.0.0.1:5051
CHECKOUT_API_BASE_URL=http://127.0.0.1:5051
LOCAL_CHECKOUT_TOKEN_API_BASE_URL=http://127.0.0.1:5050
CHECKOUT_TOKEN_API_BASE_URL=http://127.0.0.1:5050
CHECKOUT_WHATSAPP_API_URL=http://127.0.0.1:5050

VITE_LOCAL_API_BASE_URL=/api/local
VITE_WHATSAPP_API_BASE_URL=/api/whatsapp
VITE_APP_BUILD_LABEL=Freguesia
```

Se a base de clientes continuar usando o painel NewBr, configure tambem:

```env
NEWBR_SYNC_BASE_URL=https://painel.newbr.top
NEWBR_SYNC_USERNAME=
NEWBR_SYNC_PASSWORD=
PANEL_NEWBR_BASE_URL=https://painel.newbr.top
PANEL_NEWBR_USERNAME=
PANEL_NEWBR_PASSWORD=
```

## Build e publicacao da SPA

```bash
cd /root/Freguesia
npm run build
mkdir -p /var/www/freguesia/current
rsync -a --delete /root/Freguesia/dist/ /var/www/freguesia/current/
```

## Instalar services systemd

```bash
cp /root/Freguesia/deploy/systemd/freguesia-local-api.service /etc/systemd/system/
cp /root/Freguesia/deploy/systemd/freguesia-whatsapp.service /etc/systemd/system/
cp /root/Freguesia/deploy/systemd/freguesia-worker.service /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now freguesia-local-api.service
systemctl enable --now freguesia-whatsapp.service
systemctl enable --now freguesia-worker.service
```

Validar:

```bash
systemctl status freguesia-local-api.service --no-pager
systemctl status freguesia-whatsapp.service --no-pager
systemctl status freguesia-worker.service --no-pager
curl -i http://127.0.0.1:5053/api/local/health
```

## Nginx

Crie o arquivo:

```bash
nano /etc/nginx/sites-available/freguesia.hakione.tech
```

Conteudo:

```nginx
server {
    listen 80;
    server_name freguesia.hakione.tech www.freguesia.hakione.tech;

    root /var/www/freguesia/current;
    index index.html;

    client_max_body_size 25m;

    location /api/local/ {
        proxy_pass http://127.0.0.1:5053/api/local/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/whatsapp/ {
        proxy_pass http://127.0.0.1:5050/api/whatsapp/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/checkout/ {
        proxy_pass http://127.0.0.1:5051/api/checkout/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Ativar:

```bash
ln -s /etc/nginx/sites-available/freguesia.hakione.tech /etc/nginx/sites-enabled/freguesia.hakione.tech
nginx -t
systemctl reload nginx
```

Validar por host header antes ou durante propagacao:

```bash
curl -I -H "Host: freguesia.hakione.tech" http://127.0.0.1/
curl -i -H "Host: freguesia.hakione.tech" http://127.0.0.1/api/local/health
```

Validar publico:

```bash
curl -I http://freguesia.hakione.tech
curl -i http://freguesia.hakione.tech/api/local/health
```

## HTTPS

Depois que `freguesia.hakione.tech` resolver para a nova VPS:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d freguesia.hakione.tech -d www.freguesia.hakione.tech
```

Validar:

```bash
curl -I https://freguesia.hakione.tech
curl -i https://freguesia.hakione.tech/api/local/health
```

## Deploy incremental

O script local usa `/root/Freguesia` e os services da Freguesia:

```powershell
npm run deploy:vps -- -SshHost root@IP_DA_NOVA_VPS -Files src/pages/Login.jsx,server/local-api.mjs
```

O parametro `-SshHost` e obrigatorio para evitar deploy acidental em uma VPS antiga.

## Rollback

```powershell
npm run rollback:vps -- -Timestamp 20260602-153000 -SshHost root@IP_DA_NOVA_VPS
```

## Checklist rapido

- Registro `A freguesia -> IP_DA_NOVA_VPS` criado.
- `www.freguesia` como CNAME para `freguesia.hakione.tech`.
- Projeto em `/root/Freguesia`.
- `.env` criado sem credenciais herdadas.
- `npm ci` executado.
- `npm run build` executado.
- `dist` copiado para `/var/www/freguesia/current`.
- Services Freguesia ativos.
- `nginx -t` aprovado.
- HTTP validado.
- Certbot executado apos propagacao.
