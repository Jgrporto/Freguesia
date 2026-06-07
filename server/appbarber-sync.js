import { chromium } from 'playwright';

const BASE_URL = 'https://sistema.appbarber.com.br';
const LOGIN_URL = `${BASE_URL}/login.php`;
const CLIENTES_URL = `${BASE_URL}/pages/cadastros/buscaClientes_v4.php`;
const CLIENTES_REMOVIDOS_URL = `${BASE_URL}/pages/cadastros/buscaClientesRemovidos.php`;

const CLIENT_COLUMNS = [
  'Nome',
  'CPF',
  'Email',
  'Celular',
  'Telefone',
  'Login',
  'Pontos',
  'Senha',
  'Sexo',
  'Nascimento',
  'Endereco',
  'Bairro',
  'Cidade',
  'Estado',
  'Cep',
  'Codigo',
  'CidCodigo',
  'EstCodigo',
  'Complemento',
  'Obs',
  'Numero',
  'RG',
  'UsuCodigo',
  'Imagem',
  'Cadastro',
  'DiasSemVir',
  'UltimaVisita',
  'ComoSoube',
  'DataEnvLGPD',
  'DataAceiteLGPD',
  '',
  '',
  '',
  '',
];

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const buildDataTablesUrl = (start, length, draw) => {
  const params = new URLSearchParams({
    draw: String(draw),
    start: String(start),
    length: String(length),
    'search[value]': '',
    'search[regex]': 'false',
    _: String(Date.now()),
  });

  CLIENT_COLUMNS.forEach((column, index) => {
    params.set(`columns[${index}][data]`, column);
    params.set(`columns[${index}][name]`, '');
    params.set(`columns[${index}][searchable]`, index >= 30 ? 'false' : 'true');
    params.set(`columns[${index}][orderable]`, index >= 30 ? 'false' : 'true');
    params.set(`columns[${index}][search][value]`, '');
    params.set(`columns[${index}][search][regex]`, 'false');
  });

  return `${CLIENTES_URL}?${params.toString()}`;
};

const buildRemovedClientsUrl = () => {
  const params = new URLSearchParams({
    tipo: '1',
    _: String(Date.now()),
  });

  return `${CLIENTES_REMOVIDOS_URL}?${params.toString()}`;
};

const resolveExecutablePath = (input) => {
  const value = String(input || process.env.APPBARBER_CHROME_PATH || process.env.CHROME_PATH || '').trim();
  return value || undefined;
};

async function login(page, username, password) {
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input[name="userid"]', { timeout: 30000 });
  await page.fill('input[name="userid"]', username);
  await page.fill('input[name="password"]', password);

  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/php/logar.php') && response.request().method() === 'POST',
    { timeout: 60000 },
  );

  await page.click('.btnLogin');
  await loginResponsePromise;

  try {
    await page.waitForFunction(
      () => location.href.includes('index.php') || document.cookie.includes('APPBLZ_ID='),
      { timeout: 60000 },
    );
  } catch {
    const message = await page.evaluate(() => {
      const alert = document.querySelector('.sweet-alert, .swal2-popup');
      return alert?.innerText || document.body?.innerText?.slice(0, 500) || '';
    });
    throw new Error(`Login AppBarber nao gerou sessao autenticada. Mensagem na tela: ${message}`);
  }

  if (!page.url().includes('index.php')) {
    await page.goto(`${BASE_URL}/index.php`, { waitUntil: 'networkidle', timeout: 60000 });
  }
}

async function fetchJsonInSession(page, url) {
  return await page.evaluate(async (targetUrl) => {
    const response = await fetch(targetUrl, {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Resposta AppBarber nao parece JSON: ${text.slice(0, 300)}`);
    }
  }, url);
}

async function fetchRemovedClientsInSession(page, url) {
  return await page.evaluate(
    async ({ targetUrl, clientColumns }) => {
      const response = await fetch(targetUrl, {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      }

      const markRemoved = (row) => ({
        ...row,
        Removido: true,
        removido: true,
        AppStatus: 'desativado',
        status: 'REMOVED',
        _appbarberCollection: 'removed',
      });

      try {
        const payload = JSON.parse(text);
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];
        return rows.filter((row) => row && typeof row === 'object').map(markRemoved);
      } catch {
        // The removed-customers endpoint currently returns HTML. Parse table rows defensively.
      }

      const parser = new DOMParser();
      const document = parser.parseFromString(text, 'text/html');
      const headerCells = Array.from(document.querySelectorAll('thead th')).map((cell) => cell.textContent.trim());
      const tableRows = Array.from(document.querySelectorAll('tbody tr, tr'));

      return tableRows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (!cells.length) return null;

          const values = cells.map((cell) => cell.textContent.replace(/\s+/g, ' ').trim());
          if (!values.some(Boolean)) return null;

          const parsed = {};
          values.forEach((value, index) => {
            const headerKey = headerCells[index] || '';
            const columnKey = clientColumns[index] || '';
            const fallbackKey = `Coluna${index + 1}`;
            const key = headerKey || columnKey || fallbackKey;
            parsed[key] = value;
            if (columnKey && columnKey !== key) parsed[columnKey] = value;
          });

          return markRemoved(parsed);
        })
        .filter(Boolean);
    },
    { targetUrl: url, clientColumns: CLIENT_COLUMNS },
  );
}

async function fetchClients(page, length, maxPages, onProgress) {
  let start = 0;
  let draw = 1;
  let total = null;
  const rows = [];

  while (true) {
    const payload = await fetchJsonInSession(page, buildDataTablesUrl(start, length, draw));
    const pageRows = Array.isArray(payload?.data) ? payload.data : [];
    rows.push(...pageRows);
    total = payload?.recordsFiltered ?? payload?.recordsTotal ?? total;

    onProgress?.({
      page: draw,
      received: pageRows.length,
      accumulated: rows.length,
      total,
    });

    if (pageRows.length === 0) break;
    if (total !== null && rows.length >= Number(total)) break;
    if (maxPages && draw >= maxPages) break;

    start += length;
    draw += 1;
  }

  return {
    rows,
    pagesLoaded: draw,
    lastPage: total ? Math.ceil(Number(total) / length) : draw,
    totalRows: total ? Number(total) : rows.length,
  };
}

async function fetchRemovedClients(page, onProgress) {
  const rows = await fetchRemovedClientsInSession(page, buildRemovedClientsUrl());

  onProgress?.({
    page: 'removed',
    received: rows.length,
    accumulated: rows.length,
    total: rows.length,
    collection: 'removed',
  });

  return {
    rows,
    pagesLoaded: rows.length ? 1 : 0,
    lastPage: rows.length ? 1 : 0,
    totalRows: rows.length,
  };
}

export async function fetchAllCustomersFromAppBarber(options = {}) {
  const username = String(options.username || process.env.APPBARBER_USER || '').trim();
  const password = String(options.password || process.env.APPBARBER_PASSWORD || '');

  if (!username || !password) {
    throw new Error('Informe usuario e senha do AppBarber.');
  }

  const length = Number.parseInt(String(options.length || process.env.APPBARBER_SYNC_PAGE_SIZE || '1000'), 10);
  const maxPages = Number.parseInt(String(options.maxPages || process.env.APPBARBER_SYNC_MAX_PAGES || '0'), 10) || undefined;
  const headless = String(options.showBrowser || process.env.APPBARBER_SHOW_BROWSER || '').toLowerCase() !== 'true';
  const executablePath = resolveExecutablePath(options.chromePath);

  const browser = await chromium.launch({
    executablePath,
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage({ userAgent: DEFAULT_USER_AGENT });
    await login(page, username, password);
    const activeResult = await fetchClients(page, Number.isFinite(length) && length > 0 ? length : 1000, maxPages, options.onProgress);
    const removedResult = await fetchRemovedClients(page, options.onProgress);

    return {
      rows: [...activeResult.rows, ...removedResult.rows],
      pagesLoaded: activeResult.pagesLoaded + removedResult.pagesLoaded,
      lastPage: activeResult.lastPage,
      totalRows: activeResult.rows.length + removedResult.rows.length,
      activeRows: activeResult.rows.length,
      removedRows: removedResult.rows.length,
      source: 'appbarber',
    };
  } finally {
    await browser.close();
  }
}
