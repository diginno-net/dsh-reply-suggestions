import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { BUILTIN_RATES, modelFamily, PRICE_SOURCE, PRICE_CHECKED_AT, validPriceSnapshot } from './pricing.mjs';
import { validatePriceSchedule } from './common.mjs';

export const PRICE_INTERVAL_MS = 7 * 86400000;
export const PRICE_RETRY_MS = 86400000;
export const PRICE_FETCH_URL = PRICE_SOURCE + '/';
const MAX_BYTES = 2 * 1024 * 1024;
const clean = value => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');

// Expand table spans before selecting cells by model and billing category, never by currency-conversion guesses.
export function parseOfficialPrices(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > MAX_BYTES) throw new Error('format');
  const tables = [...html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    .filter(match => /deepseek-flash/.test(match[1]) && /deepseek-v4-pro/.test(match[1]));
  if (tables.length !== 1) throw new Error('format');
  const grid = [];
  for (const [rowIndex, row] of [...tables[0][1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].entries()) {
    grid[rowIndex] ??= []; let col = 0;
    for (const cell of row[1].matchAll(/<(?:td|th)\b([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi)) {
      while (grid[rowIndex][col] !== undefined) col++;
      const span = name => Number(cell[1].match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, 'i'))?.[1] ?? 1);
      const rows = span('rowspan'), cols = span('colspan');
      if (rows < 1 || cols < 1 || rows > 50 || cols > 20 || rowIndex > 100) throw new Error('format');
      for (let y = 0; y < rows; y++) {
        grid[rowIndex + y] ??= [];
        for (let x = 0; x < cols; x++) {
          if (grid[rowIndex + y][col + x] !== undefined) throw new Error('format');
          grid[rowIndex + y][col + x] = clean(cell[2]);
        }
      }
      col += cols;
    }
  }
  const header = grid.find(row => row.includes('deepseek-v4-pro') && row.some(cell => /^deepseek-flash(?:\(\d+\))?$/.test(cell)));
  if (!header) throw new Error('format');
  const modelCols = { flash: header.findIndex(cell => /^deepseek-flash(?:\(\d+\))?$/.test(cell)), pro: header.indexOf('deepseek-v4-pro') };
  const rates = { flash: { offPeak: {}, peak: {} }, pro: { offPeak: {}, peak: {} } };
  for (const row of grid) {
    const category = row.find(cell => /^百万tokens(?:输入|输出)/i.test(cell));
    if (!category) continue;
    const key = /^百万tokens输入\(缓存命中\)$/i.test(category) ? 'cache'
      : /^百万tokens输入\(缓存未命中\)$/i.test(category) ? 'input' : /^百万tokens输出$/i.test(category) ? 'output' : null;
    const tier = row.includes('空闲时段') ? 'offPeak' : row.includes('高峰时段') ? 'peak' : null;
    if (!key || !tier) throw new Error('format');
    for (const [model, col] of Object.entries(modelCols)) {
      const match = row[col]?.match(/^(\d+(?:\.\d+)?)元$/);
      if (!match || rates[model][tier][key] !== undefined) throw new Error('format');
      rates[model][tier][key] = Number(match[1]);
    }
  }
  for (const [modelKey, rate] of Object.entries(rates)) {
    if (!validPriceSnapshot({ ...BUILTIN_RATES[modelKey], ...rate })) throw new Error('format');
  }
  return rates;
}

export async function fetchOfficialPrices({ signal, fetcher = globalThis.fetch } = {}) {
  const response = await fetcher(PRICE_FETCH_URL, { signal, redirect: 'error', credentials: 'omit', headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error('http');
  if (!/^text\/html\b/i.test(response.headers.get('content-type') ?? '')) throw new Error('format');
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('format');
  const reader = response.body?.getReader(); if (!reader) throw new Error('format');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > MAX_BYTES) throw new Error('format');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return parseOfficialPrices(Buffer.concat(chunks).toString('utf8'));
}

const messages = { format: '官方价格页格式变化，未替换已有价格', http: '官方价格页暂时无法访问',
  network: '网络不可用或请求超时', storage: '价格记录未能保存到本机' };
export function createPriceStore(file, { clock = () => new Date(), fetchPrices = fetchOfficialPrices,
  io = { appendFile, mkdir, readFile }, intervalMs = PRICE_INTERVAL_MS, retryMs = PRICE_RETRY_MS, autoUpdate = true } = {}) {
  let rates = structuredClone(BUILTIN_RATES), checkedAt = PRICE_CHECKED_AT;
  let lastCheckedAt = null, lastAttemptAt = null, error = null, persistent = true, cacheReadable = true, flight = null, disposed = false;
  let controller, pending = [], writeQueue = Promise.resolve(), lastSettingsAt = null;
  const apply = event => {
    if (event.status === 'settings') {
      if (!lastSettingsAt || event.at >= lastSettingsAt) {
        lastSettingsAt = event.at; autoUpdate = event.autoUpdate; intervalMs = event.intervalDays * 86400000;
      }
      return;
    }
    if (event.status === 'ok' && (!lastCheckedAt || event.at >= lastCheckedAt)) {
      rates = event.rates; checkedAt = event.at.slice(0, 10); lastCheckedAt = event.at;
    }
    if (!lastAttemptAt || event.at >= lastAttemptAt) { lastAttemptAt = event.at; error = event.status === 'ok' ? null : event.error; }
  };
  const valid = event => event?.version === 1 && typeof event.at === 'string' && Number.isFinite(Date.parse(event.at))
    && Date.parse(event.at) <= clock().getTime() && (event.status === 'ok' && ['flash', 'pro'].every(key =>
      validPriceSnapshot(event.rates?.[key]) && event.rates[key].modelKey === key)
      || event.status === 'failed' && Object.hasOwn(messages, event.error)
      || event.status === 'settings' && typeof event.autoUpdate === 'boolean'
        && Number.isInteger(event.intervalDays) && event.intervalDays >= 1 && event.intervalDays <= 30);
  const load = async () => {
    let contents;
    try { contents = await io.readFile(file, 'utf8'); }
    catch (cause) { if (cause.code !== 'ENOENT') { cacheReadable = false; persistent = false; } return; }
    cacheReadable = true;
    for (const line of contents.split('\n')) {
      if (!line.trim()) continue;
      try { const event = JSON.parse(line); if (valid(event)) apply(event); else cacheReadable = false; }
      catch { cacheReadable = false; }
    }
    if (!cacheReadable) persistent = false;
  };
  const ready = load();
  const next = () => new Date((lastAttemptAt ? Date.parse(lastAttemptAt) : 0)
    + (error ? retryMs : intervalMs)).toISOString();
  const status = () => ({ currency: 'CNY', source: PRICE_SOURCE, checkedAt, lastCheckedAt, lastAttemptAt,
    nextCheckAt: autoUpdate && lastAttemptAt ? next() : null, autoUpdate,
    intervalDays: intervalMs / 86400000, updating: Boolean(flight), error: error ? messages[error] : null, persistent });
  const save = (event, { retry = true } = {}) => {
    if (retry) pending.push(event);
    const job = writeQueue.then(async () => {
      const batch = retry ? [...pending] : [...pending, event];
      if (!batch.length) return true;
      try {
        await io.mkdir(dirname(file), { recursive: true });
        await io.appendFile(file, '\n' + batch.map(value => JSON.stringify(value)).join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
        pending.splice(0, retry ? batch.length : batch.length - 1); persistent = cacheReadable; return true;
      } catch { persistent = false; return false; }
    });
    writeQueue = job.then(() => {});
    return job;
  };
  return {
    async status() { await ready; return status(); },
    async quote(provider, model) { await ready; const key = modelFamily(provider, model); return key ? structuredClone(rates[key]) : null; },
    async setSchedule(input) {
      const schedule = validatePriceSchedule(input);
      await ready;
      if (disposed) throw new Error('Price service unavailable');
      const event = { version: 1, at: clock().toISOString(), status: 'settings', ...schedule };
      if (!await save(event, { retry: false })) {
        throw new Error('Price schedule could not be saved');
      }
      apply(event); return status();
    },
    async refresh({ force = false } = {}) {
      await ready;
      if (disposed) return status();
      if (flight) return flight;
      await load(); // Another profile may have checked more recently.
      if (disposed) return status();
      if (flight) return flight;
      if (!force && !autoUpdate) return status();
      if (!force && lastAttemptAt && clock().getTime() < Date.parse(next())) return status();
      controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      flight = (async () => {
        try {
          const fetched = await fetchPrices({ signal });
          if (signal.aborted || disposed) throw new Error('network');
          const at = clock().toISOString(), updated = {};
          for (const key of ['flash', 'pro']) {
            const rate = fetched[key];
            if (!rate || !validPriceSnapshot({ ...BUILTIN_RATES[key], ...rate })) throw new Error('format');
            const values = value => ['offPeak', 'peak'].flatMap(tier => ['input', 'cache', 'output'].map(field => value?.[tier]?.[field]));
            const unchanged = JSON.stringify(values(rate)) === JSON.stringify(values(rates[key]));
            const id = 'remote-' + createHash('sha256').update(JSON.stringify([key, values(rate)])).digest('hex');
            updated[key] = { ...rates[key], ...rate, id: unchanged ? rates[key].id : id,
              from: unchanged ? rates[key].from : at, checkedAt: at.slice(0, 10) };
            if (!validPriceSnapshot(updated[key])) throw new Error('format');
          }
          const event = { version: 1, at, status: 'ok', rates: updated }; apply(event);
          if (!await save(event)) error = 'storage';
        } catch (cause) {
          if (!disposed) {
            const event = { version: 1, at: clock().toISOString(), status: 'failed', error: Object.hasOwn(messages, cause?.message) ? cause.message : 'network' };
            apply(event); await save(event);
          }
        } finally { flight = null; }
        return status();
      })();
      return flight;
    },
    dispose() { disposed = true; controller?.abort(); },
  };
}
