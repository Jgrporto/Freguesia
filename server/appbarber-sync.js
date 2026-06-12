import { chromium } from 'playwright';

const BASE_URL = 'https://sistema.appbarber.com.br';
const LOGIN_URL = `${BASE_URL}/login.php`;
const CLIENTES_URL = `${BASE_URL}/pages/cadastros/buscaClientes_v4.php`;
const AGENDAMENTOS_URL = `${BASE_URL}/pages/relatorios/buscaAgendamentos.php`;

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

const APPOINTMENT_STATUS_MAP = [
  { code: 1, key: 'pendentes', label: 'Pendente' },
  { code: 2, key: 'resolvidos', label: 'Resolvido' },
  { code: 3, key: 'cancelados', label: 'Cancelado' },
  { code: 5, key: 'ausentes', label: 'Ausente' },
  { code: 4, key: 'bloqueados', label: 'Bloqueado' },
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

const formatDateBr = (date) => {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const day = String(safeDate.getDate()).padStart(2, '0');
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const year = String(safeDate.getFullYear());
  return `${day}/${month}/${year}`;
};

const resolveAppointmentDateRange = (options = {}) => {
  const dataFim = String(
    options.appointmentsEndDate ||
      options.agendamentosDataFim ||
      process.env.APPBARBER_AGENDAMENTOS_DATA_FIM ||
      '',
  ).trim();
  const dataIni = String(
    options.appointmentsStartDate ||
      options.agendamentosDataIni ||
      process.env.APPBARBER_AGENDAMENTOS_DATA_INI ||
      '',
  ).trim();

  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);

  return {
    dataIni: dataIni || formatDateBr(start),
    dataFim: dataFim || formatDateBr(end),
  };
};

async function login(page, username, password) {
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input[name="userid"]', { timeout: 30000 });
  await page.fill('input[name="userid"]', username);
  await page.fill('input[name="password"]', password);

  const loginResponsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes('/php/logar.php') &&
        response.request().method() === 'POST',
      { timeout: 15000 },
    )
    .catch(() => null);

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
      collection: 'clientes',
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

async function enrichClientsWithAppointmentReports(page, rows, options = {}, onProgress) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return safeRows;

  const { dataIni, dataFim } = resolveAppointmentDateRange(options);
  const requestConcurrency = toPositiveInteger(options.agendamentosConcurrency || process.env.APPBARBER_AGENDAMENTOS_CONCURRENCY, 2);

  return await page.evaluate(
    async ({ customers, targetUrl, statuses, dateRange, requestConcurrency: concurrency }) => {
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

      const normalizePhone = (value) => normalizeText(value).replace(/\D/g, '');

      const normalizeName = (value) => normalizeKey(value);

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

        for (const key of ['data', 'aaData', 'rows', 'items', 'results', 'agendamentos', 'appointments']) {
          if (Array.isArray(payload[key])) return payload[key];
        }

        if (payload.data && typeof payload.data === 'object') {
          for (const key of ['data', 'aaData', 'rows', 'items', 'results', 'agendamentos', 'appointments']) {
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

      const fieldValueByMeaning = (record, expectedFragments, options = {}) => {
        const deniedFragments = Array.isArray(options.deniedFragments) ? options.deniedFragments : [];
        const entries = Object.entries(record || {});

        for (const [key, value] of entries) {
          const normalizedKey = normalizeKey(key);
          if (deniedFragments.some((fragment) => normalizedKey.includes(fragment))) continue;
          if (expectedFragments.some((fragment) => normalizedKey.includes(fragment))) {
            const normalizedValue = normalizeText(value);
            if (normalizedValue) return normalizedValue;
          }
        }
        return '';
      };

      const firstByKeys = (record, keys) => {
        for (const wanted of keys.map(normalizeKey)) {
          for (const [key, value] of Object.entries(record || {})) {
            if (normalizeKey(key) === wanted) {
              const normalizedValue = normalizeText(value);
              if (normalizedValue) return normalizedValue;
            }
          }
        }
        return '';
      };

      const extractAppointmentDateValue = (record) =>
        firstByKeys(record, ['DataHora', 'DataAgendamento', 'AgeDataHora', 'AgeData', 'Data', 'DtAgenda', 'Data Agenda']) ||
        fieldValueByMeaning(record, ['datahora', 'dataagendamento', 'agedatahora', 'agedata', 'dtagenda', 'agenda'], {
          deniedFragments: ['cadastro', 'nascimento', 'lgpd'],
        }) ||
        fieldValueByMeaning(record, ['data'], { deniedFragments: ['cadastro', 'nascimento', 'lgpd'] });

      const extractProfessional = (record) =>
        firstByKeys(record, ['Profissional', 'AgeProfissional', 'NomeProfissional', 'ProNome', 'Barbeiro']) ||
        fieldValueByMeaning(record, ['profissional', 'colaborador', 'funcionario', 'barbeiro', 'prestador']);

      const extractService = (record) =>
        firstByKeys(record, ['Servico', 'Serviço', 'AgeServico', 'SerNome', 'NomeServico']) ||
        fieldValueByMeaning(record, ['servico', 'servio', 'procedimento', 'corte']);

      const extractCustomerCode = (record) =>
        firstByKeys(record, ['PesCodigoCliente', 'PesCodigo', 'CliCodigo', 'ClienteCodigo', 'CodCliente', 'CodigoCliente']) ||
        fieldValueByMeaning(record, ['pescodigocliente', 'codigocliente', 'clientecodigo', 'clicodigo', 'codcliente', 'idcliente']);

      const extractCustomerName = (record) =>
        firstByKeys(record, ['Cliente', 'NomeCliente', 'CliNome', 'PesNome', 'Nome']) ||
        fieldValueByMeaning(record, ['nomecliente', 'clinome', 'pesnome']) ||
        fieldValueByMeaning(record, ['cliente'], { deniedFragments: ['codigo', 'id'] });

      const extractCustomerPhone = (record) =>
        firstByKeys(record, ['Celular', 'Telefone', 'Whatsapp', 'WhatsApp', 'CliCelular', 'PesCelular']) ||
        fieldValueByMeaning(record, ['celular', 'telefone', 'whatsapp', 'fone']);

      const phoneLookupKeys = (value) => {
        const digits = normalizePhone(value);
        if (!digits) return [];
        const keys = new Set([digits]);
        if (digits.startsWith('55') && digits.length > 11) keys.add(digits.slice(2));
        if (digits.length >= 11) keys.add(digits.slice(-11));
        if (digits.length >= 10) keys.add(digits.slice(-10));
        return Array.from(keys).filter(Boolean);
      };

      const addToLookup = (map, key, customerIndex) => {
        const normalized = String(key || '').trim();
        if (!normalized) return;
        if (!map.has(normalized)) map.set(normalized, []);
        map.get(normalized).push(customerIndex);
      };

      const customerByCode = new Map();
      const customerByPhone = new Map();
      const customerByName = new Map();

      customers.forEach((customer, index) => {
        addToLookup(customerByCode, normalizeText(customer?.Codigo), index);
        addToLookup(customerByCode, normalizeText(customer?.UsuCodigo), index);
        addToLookup(customerByCode, normalizeText(customer?.sync_key), index);

        phoneLookupKeys(customer?.Celular).forEach((key) => addToLookup(customerByPhone, key, index));
        phoneLookupKeys(customer?.Telefone).forEach((key) => addToLookup(customerByPhone, key, index));
        phoneLookupKeys(customer?.whatsapp).forEach((key) => addToLookup(customerByPhone, key, index));

        addToLookup(customerByName, normalizeName(customer?.Nome), index);
      });

      const findCustomerIndex = (record) => {
        const code = normalizeText(extractCustomerCode(record));
        if (code && customerByCode.has(code)) return customerByCode.get(code)[0];

        for (const phoneKey of phoneLookupKeys(extractCustomerPhone(record))) {
          if (customerByPhone.has(phoneKey)) return customerByPhone.get(phoneKey)[0];
        }

        const name = normalizeName(extractCustomerName(record));
        if (name && customerByName.has(name)) return customerByName.get(name)[0];

        return -1;
      };

      const fetchReportForStatus = async (status) => {
        const body = new URLSearchParams({
          edtDataIni: dateRange.dataIni,
          edtDataFim: dateRange.dataFim,
          tipoStatus: String(status.code),
          AgeProfissional: '',
          AgeServico: '',
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
          throw new Error(`Relatorio ${status.label} retornou HTTP ${response.status}: ${text.slice(0, 300)}`);
        }

        return parseRecords(text).map((record, index) => {
          const dateValue = extractAppointmentDateValue(record);
          const parsedDate = parseDate(dateValue);
          return {
            record,
            sourceIndex: index,
            statusCode: status.code,
            statusKey: status.key,
            statusLabel: status.label,
            dateValue,
            dateTime: parsedDate ? parsedDate.getTime() : null,
            professional: extractProfessional(record),
            service: extractService(record),
            customerCode: extractCustomerCode(record),
            customerName: extractCustomerName(record),
            customerPhone: extractCustomerPhone(record),
          };
        });
      };

      const reports = [];
      let cursor = 0;
      const workers = Array.from({ length: Math.max(1, Math.min(Number(concurrency) || 1, statuses.length)) }, async () => {
        while (cursor < statuses.length) {
          const index = cursor;
          cursor += 1;
          const status = statuses[index];
          const items = await fetchReportForStatus(status);
          reports[index] = { status, items };
        }
      });
      await Promise.all(workers);

      const appointmentsByCustomerIndex = new Map();
      const totalsByStatus = statuses.reduce((acc, status) => ({ ...acc, [status.key]: 0 }), {});
      let unmatched = 0;

      reports.forEach((report) => {
        const items = Array.isArray(report?.items) ? report.items : [];
        totalsByStatus[report.status.key] = items.length;

        items.forEach((appointment) => {
          const customerIndex = findCustomerIndex(appointment.record);
          if (customerIndex < 0) {
            unmatched += 1;
            return;
          }
          if (!appointmentsByCustomerIndex.has(customerIndex)) appointmentsByCustomerIndex.set(customerIndex, []);
          appointmentsByCustomerIndex.get(customerIndex).push(appointment);
        });
      });

      const sortLatestFirst = (a, b) => {
        if (a.dateTime !== null && b.dateTime !== null) return b.dateTime - a.dateTime;
        if (a.dateTime !== null) return -1;
        if (b.dateTime !== null) return 1;
        return a.sourceIndex - b.sourceIndex;
      };

      const sortNextFirst = (a, b) => {
        if (a.dateTime !== null && b.dateTime !== null) return a.dateTime - b.dateTime;
        if (a.dateTime !== null) return -1;
        if (b.dateTime !== null) return 1;
        return a.sourceIndex - b.sourceIndex;
      };

      const now = Date.now();
      const pickNextPending = (items) => {
        const withDate = items.filter((item) => item.dateTime !== null).sort(sortNextFirst);
        return withDate.find((item) => item.dateTime >= now) || withDate[0] || items[0] || null;
      };

      const enrichedCustomers = customers.map((customer, index) => {
        const appointments = appointmentsByCustomerIndex.get(index) || [];
        const pendentes = appointments.filter((item) => item.statusCode === 1);
        const resolvidos = appointments.filter((item) => item.statusCode === 2).sort(sortLatestFirst);
        const cancelados = appointments.filter((item) => item.statusCode === 3).sort(sortLatestFirst);
        const ausentes = appointments.filter((item) => item.statusCode === 5).sort(sortLatestFirst);
        const bloqueados = appointments.filter((item) => item.statusCode === 4).sort(sortLatestFirst);
        const encerrados = [...cancelados, ...ausentes, ...bloqueados].sort(sortLatestFirst);
        const ultimoResolvido = resolvidos[0] || null;
        const proximoPendente = pickNextPending(pendentes);
        const ultimoEncerrado = encerrados[0] || null;

        return {
          ...customer,
          UltimoProfissional: ultimoResolvido?.professional || customer?.UltimoProfissional || '',
          UltimoAgendamento: ultimoResolvido?.dateValue || customer?.UltimoAgendamento || '',
          UltimoAgendamentoResolvido: ultimoResolvido?.dateValue || '',
          UltimoServico: ultimoResolvido?.service || '',
          ProximoAgendamento: proximoPendente?.dateValue || '',
          AgendamentoPendente: pendentes.length > 0 ? 'Sim' : 'Nao',
          AgendamentoPendenteData: proximoPendente?.dateValue || '',
          AgendamentoPendenteProfissional: proximoPendente?.professional || '',
          AgendamentoPendenteServico: proximoPendente?.service || '',
          AgendamentoPendenteTotal: pendentes.length,
          AgendamentosResolvidosTotal: resolvidos.length,
          AgendamentosCanceladosTotal: cancelados.length,
          AgendamentosAusentesTotal: ausentes.length,
          AgendamentosBloqueadosTotal: bloqueados.length,
          AgendamentosEncerradosTotal: encerrados.length,
          UltimoAgendamentoCancelado: cancelados[0]?.dateValue || '',
          UltimoAgendamentoAusente: ausentes[0]?.dateValue || '',
          UltimoAgendamentoBloqueado: bloqueados[0]?.dateValue || '',
          UltimoAgendamentoEncerrado: ultimoEncerrado?.dateValue || '',
          UltimoAgendamentoEncerradoStatus: ultimoEncerrado?.statusLabel || '',
          AppBarberAgendamentosTotal: appointments.length,
          AppBarberAgendamentosPeriodo: `${dateRange.dataIni} - ${dateRange.dataFim}`,
          AppBarberAgendamentosSyncEm: new Date().toISOString(),
        };
      });

      const matchedAppointments = Array.from(appointmentsByCustomerIndex.values()).reduce((sum, items) => sum + items.length, 0);
      return {
        rows: enrichedCustomers,
        summary: {
          periodo: `${dateRange.dataIni} - ${dateRange.dataFim}`,
          pendentes: totalsByStatus.pendentes || 0,
          resolvidos: totalsByStatus.resolvidos || 0,
          cancelados: totalsByStatus.cancelados || 0,
          ausentes: totalsByStatus.ausentes || 0,
          bloqueados: totalsByStatus.bloqueados || 0,
          encerrados: (totalsByStatus.cancelados || 0) + (totalsByStatus.ausentes || 0) + (totalsByStatus.bloqueados || 0),
          total: Object.values(totalsByStatus).reduce((sum, value) => sum + Number(value || 0), 0),
          vinculados: matchedAppointments,
          naoVinculados: unmatched,
          clientesComAgendamento: appointmentsByCustomerIndex.size,
        },
      };
    },
    {
      customers: safeRows,
      targetUrl: AGENDAMENTOS_URL,
      statuses: APPOINTMENT_STATUS_MAP,
      dateRange: { dataIni, dataFim },
      requestConcurrency,
    },
  ).then((result) => {
    onProgress?.({
      page: 'agendamentos',
      received: result.summary?.total || 0,
      accumulated: result.summary?.vinculados || 0,
      total: result.summary?.total || 0,
      collection: 'agendamentos',
      summary: result.summary,
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
  const fetchAppointments =
    String(
      options.fetchAppointments ??
        options.fetchAgendamentos ??
        process.env.APPBARBER_FETCH_AGENDAMENTOS ??
        process.env.APPBARBER_FETCH_APPOINTMENTS ??
        'true',
    ).toLowerCase() !== 'false';

  const browser = await chromium.launch({
    executablePath,
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage({ userAgent: DEFAULT_USER_AGENT });
    await login(page, username, password);
    const result = await fetchClients(page, Number.isFinite(length) && length > 0 ? length : 1000, maxPages, options.onProgress);
    if (!fetchAppointments) return { ...result, source: 'appbarber', agendamentosFetched: false };

    const appointments = await enrichClientsWithAppointmentReports(page, result.rows, options, options.onProgress);
    return {
      ...result,
      rows: appointments.rows,
      source: 'appbarber',
      agendamentosFetched: true,
      agendamentosSummary: appointments.summary,
      agendamentosWithCustomer: appointments.summary?.clientesComAgendamento || 0,
    };
  } finally {
    await browser.close();
  }
}
