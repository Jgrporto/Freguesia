import { chromium } from 'playwright';

const BASE_URL = 'https://sistema.appbarber.com.br';
const LOGIN_URL = `${BASE_URL}/login.php`;
const CLIENTES_URL = `${BASE_URL}/pages/cadastros/buscaClientes_v4.php`;
const PRONTUARIO_URL = `${BASE_URL}/pages/cadastros/buscaAgendamentoProntuariov2.php`;

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

const resolveExecutablePath = (input) => {
  const value = String(input || process.env.APPBARBER_CHROME_PATH || process.env.CHROME_PATH || '').trim();
  return value || undefined;
};

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

async function enrichClientsWithLatestProfessional(page, rows, concurrency, onProgress) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return safeRows;

  return await page.evaluate(
    async ({ customers, targetUrl, requestConcurrency }) => {
      const normalizeText = (value) =>
        String(value ?? '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const normalizeKey = (value) =>
        normalizeText(value)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/gi, '')
          .toLowerCase();

      const parseDate = (value) => {
        const raw = normalizeText(value);
        if (!raw || raw === '0000-00-00' || raw === '00/00/0000') return null;

        const brDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (brDate) {
          const date = new Date(
            Number(brDate[3]),
            Number(brDate[2]) - 1,
            Number(brDate[1]),
            Number(brDate[4] || 0),
            Number(brDate[5] || 0),
            Number(brDate[6] || 0),
          );
          return Number.isNaN(date.getTime()) ? null : date;
        }

        const sqlDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (sqlDate) {
          const date = new Date(
            Number(sqlDate[1]),
            Number(sqlDate[2]) - 1,
            Number(sqlDate[3]),
            Number(sqlDate[4] || 0),
            Number(sqlDate[5] || 0),
            Number(sqlDate[6] || 0),
          );
          return Number.isNaN(date.getTime()) ? null : date;
        }

        const timestamp = Date.parse(raw);
        return Number.isFinite(timestamp) ? new Date(timestamp) : null;
      };

      const extractArray = (payload) => {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return [];

        for (const key of ['data', 'rows', 'items', 'results', 'agendamentos', 'prontuario']) {
          if (Array.isArray(payload[key])) return payload[key];
        }

        if (payload.data && typeof payload.data === 'object') {
          for (const key of ['data', 'rows', 'items', 'results', 'agendamentos', 'prontuario']) {
            if (Array.isArray(payload.data[key])) return payload.data[key];
          }
        }

        return [];
      };

      const parseHtmlRows = (text) => {
        const parser = new DOMParser();
        const document = parser.parseFromString(text, 'text/html');
        const headers = Array.from(document.querySelectorAll('thead th')).map((cell) => normalizeText(cell.textContent));

        return Array.from(document.querySelectorAll('tbody tr, tr'))
          .map((row) => {
            const cells = Array.from(row.querySelectorAll('td'));
            if (!cells.length) return null;
            const values = cells.map((cell) => normalizeText(cell.textContent));
            if (!values.some(Boolean)) return null;

            return values.reduce((record, value, index) => {
              record[headers[index] || `Coluna${index + 1}`] = value;
              return record;
            }, {});
          })
          .filter(Boolean);
      };

      const parseRecords = (text) => {
        try {
          return extractArray(JSON.parse(text)).filter((record) => record && typeof record === 'object');
        } catch {
          return parseHtmlRows(text);
        }
      };

      const fieldValueByMeaning = (record, expectedFragments) => {
        for (const [key, value] of Object.entries(record || {})) {
          const normalizedKey = normalizeKey(key);
          if (expectedFragments.some((fragment) => normalizedKey.includes(fragment))) {
            const normalizedValue = normalizeText(value);
            if (normalizedValue) return normalizedValue;
          }
        }
        return '';
      };

      const extractProfessional = (record) =>
        fieldValueByMeaning(record, ['profissional', 'colaborador', 'funcionario', 'barbeiro', 'prestador']);

      const extractDateValue = (record) =>
        fieldValueByMeaning(record, ['datahora', 'dataagendamento', 'agendamento', 'agedata', 'data', 'inicio', 'hora']);

      const resolveLatestAppointment = (records) => {
        const enriched = records
          .map((record, index) => {
            const dateValue = extractDateValue(record);
            const date = parseDate(dateValue);
            return {
              record,
              index,
              dateValue,
              dateTime: date ? date.getTime() : null,
              professional: extractProfessional(record),
            };
          })
          .filter((item) => item.professional || item.dateValue);

        if (!enriched.length) return null;

        enriched.sort((a, b) => {
          if (a.dateTime !== null && b.dateTime !== null) return b.dateTime - a.dateTime;
          if (a.dateTime !== null) return -1;
          if (b.dateTime !== null) return 1;
          return a.index - b.index;
        });

        return enriched[0];
      };

      const fetchLatestForCustomer = async (customer) => {
        const customerCode = normalizeText(customer?.Codigo || customer?.UsuCodigo || customer?.sync_key || '');
        if (!customerCode) return customer;

        const body = new URLSearchParams({
          pescodigocliente: customerCode,
          tipo: '1',
          agecodigo: '',
          dataini: '',
          datafim: '',
          pescodigoprofissional: '',
          sercodigo: '',
        });

        const response = await fetch(targetUrl, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body,
        });

        const text = await response.text();
        if (!response.ok) {
          return {
            ...customer,
            ProntuarioErro: `HTTP ${response.status}`,
          };
        }

        const records = parseRecords(text);
        const latest = resolveLatestAppointment(records);

        return {
          ...customer,
          UltimoProfissional: latest?.professional || '',
          UltimoAgendamento: latest?.dateValue || '',
          ProntuarioTotal: records.length,
          ProntuarioCodigoCliente: customerCode,
        };
      };

      const results = new Array(customers.length);
      let cursor = 0;

      const worker = async () => {
        while (cursor < customers.length) {
          const index = cursor;
          cursor += 1;
          results[index] = await fetchLatestForCustomer(customers[index]);
        }
      };

      const workers = Array.from(
        { length: Math.max(1, Math.min(Number(requestConcurrency) || 1, customers.length)) },
        () => worker(),
      );

      await Promise.all(workers);
      return results;
    },
    {
      customers: safeRows,
      targetUrl: PRONTUARIO_URL,
      requestConcurrency: concurrency,
    },
  ).then((result) => {
    const withProfessional = result.filter((row) => String(row?.UltimoProfissional || '').trim()).length;
    onProgress?.({
      page: 'prontuario',
      received: withProfessional,
      accumulated: result.length,
      total: result.length,
      collection: 'prontuario',
    });
    return result;
  });
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
  const fetchProntuario =
    String(options.fetchProntuario ?? process.env.APPBARBER_FETCH_PRONTUARIO ?? 'true').toLowerCase() !== 'false';
  const prontuarioConcurrency = toPositiveInteger(options.prontuarioConcurrency || process.env.APPBARBER_PRONTUARIO_CONCURRENCY, 4);

  const browser = await chromium.launch({
    executablePath,
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage({ userAgent: DEFAULT_USER_AGENT });
    await login(page, username, password);
    const result = await fetchClients(page, Number.isFinite(length) && length > 0 ? length : 1000, maxPages, options.onProgress);
    if (!fetchProntuario) return result;

    const rows = await enrichClientsWithLatestProfessional(page, result.rows, prontuarioConcurrency, options.onProgress);
    return {
      ...result,
      rows,
      source: 'appbarber',
      prontuarioFetched: true,
      prontuarioWithProfessional: rows.filter((row) => String(row?.UltimoProfissional || '').trim()).length,
    };
  } finally {
    await browser.close();
  }
}
