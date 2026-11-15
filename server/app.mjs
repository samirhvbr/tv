import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { AppError, makeTarget, PlexAdapter, validId } from './plex.mjs';
import { DemoAdapter } from './demo.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const validCatalogId = value => validId(value) || /^fs_[a-f0-9]{32}$/.test(value);

async function jsonBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new AppError(415, 'Envie os dados no formato JSON.');
  const chunks = await new Promise((resolve, reject) => {
    const chunks = []; let length = 0; let exceeded = false;
    req.on('data', chunk => {
      if (exceeded) return;
      length += chunk.length;
      if (length > 16384) { exceeded = true; chunks.length = 0; reject(new AppError(413, 'A solicitação excedeu o limite.')); }
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(chunks));
    req.on('error', () => reject(new AppError(400, 'A solicitação foi interrompida.')));
  });
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError(400, 'Os dados enviados são inválidos.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(400, 'Os dados enviados são inválidos.');
  return value;
}
function fields(value, allowed) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new AppError(400, 'A solicitação contém campos desconhecidos.');
}
function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
function safeRequest(req) {
  const port = req.socket.localPort;
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  if (port === 80) for (const host of ['127.0.0.1', 'localhost', '[::1]']) allowed.add(host);
  const host = req.headers.host;
  if (!allowed.has(host) || !req.url.startsWith('/') || req.url.startsWith('//')) throw new AppError(403, 'Acesse este aplicativo pelo endereço local.');
  if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new AppError(403, 'Origem da solicitação não permitida.');
  if (req.headers['sec-fetch-site'] && !['none', 'same-origin'].includes(req.headers['sec-fetch-site'])) throw new AppError(403, 'Origem da solicitação não permitida.');
}
function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}
function validRange(value) { return !value || /^bytes=\d*-\d*$/.test(value) && value !== 'bytes=-'; }
async function proxy(res, upstream, image = false) {
  const type = upstream.headers['content-type'] || 'application/octet-stream';
  if (image && !/^image\/(?:jpeg|png|webp|gif)(?:;|$)/i.test(type)) { upstream.destroy(); throw new AppError(502, 'Formato de imagem indisponível.'); }
  const outbound = { 'Content-Type': type };
  for (const name of ['content-length', 'content-range', 'accept-ranges']) if (upstream.headers[name]) outbound[name] = upstream.headers[name];
  res.writeHead(upstream.statusCode, outbound);
  try { await pipeline(upstream, res); } catch { upstream.destroy(); }
}

/** Creates a loopback HTTP server. Credentials remain in its current adapter. */
export async function createApp(options = {}) {
  const publicDir = resolve(options.publicDir || resolve(root, 'public'));
  const version = options.version || (await readFile(resolve(root, 'version.md'), 'utf8')).match(/\d+\.\d+\.\d+/)?.[0] || '0.0.0';
  const csrfToken = randomBytes(32).toString('hex');
  const clients = new Set(); const mutationQueues = new Map();
  const attempts = []; let connecting = false; let polling = false;
  const makePlex = async (serverUrl, token) => new PlexAdapter(await makeTarget(serverUrl, token), { version, timeoutMs: options.requestTimeoutMs || 10000 }).init();
  let adapter = new DemoAdapter(); let mode = 'demo'; let connectionId = randomUUID();
  const serverUrl = options.plexServerUrl ?? process.env.PLEX_SERVER_URL;
  const token = options.plexToken ?? process.env.PLEX_TOKEN;
  if (serverUrl || token) {
    if (!serverUrl || !token) throw new AppError(400, 'Configure PLEX_SERVER_URL e PLEX_TOKEN juntos.');
    adapter = await makePlex(serverUrl, token); mode = 'plex';
  }
  const config = () => ({ mode, serverName: adapter.serverName, version, csrfToken, connectionId });
  function emit(event, data) { for (const client of clients) client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
  async function mutate(key, action) {
    const previous = mutationQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    mutationQueues.set(key, next);
    try { return await next; } finally { if (mutationQueues.get(key) === next) mutationQueues.delete(key); }
  }
  async function serveStatic(req, res, path) {
    let decoded;
    try { decoded = decodeURIComponent(path); } catch { throw new AppError(400, 'Endereço inválido.'); }
    if (decoded.includes('\0') || decoded.includes('\\')) throw new AppError(404, 'Arquivo não encontrado.');
    const file = resolve(publicDir, `.${decoded === '/' ? '/index.html' : decoded}`);
    if (!file.startsWith(publicDir + sep) || !TYPES[extname(file)]) throw new AppError(404, 'Arquivo não encontrado.');
    let info;
    try { info = await stat(file); } catch { throw new AppError(404, 'Arquivo não encontrado.'); }
    if (!info.isFile()) throw new AppError(404, 'Arquivo não encontrado.');
    let start = 0; let end = info.size - 1; let status = 200;
    if (req.headers.range) {
      if (!validRange(req.headers.range)) throw new AppError(416, 'Intervalo de reprodução inválido.');
      const [first, last] = req.headers.range.slice(6).split('-');
      if (!first) start = Math.max(0, info.size - Number(last));
      else { start = Number(first); if (last) end = Math.min(Number(last), end); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) { res.setHeader('Content-Range', `bytes */${info.size}`); throw new AppError(416, 'Intervalo de reprodução inválido.'); }
      status = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    }
    res.writeHead(status, { 'Content-Type': TYPES[extname(file)], 'Content-Length': info.size ? end - start + 1 : 0, 'Accept-Ranges': 'bytes' });
    if (req.method === 'HEAD' || !info.size) { res.end(); return; }
    try { await pipeline(createReadStream(file, { start, end }), res); } catch { /* Client closed the media connection. */ }
  }
  const server = http.createServer(async (req, res) => {
    headers(res);
    try {
      safeRequest(req);
      const url = new URL(req.url, 'http://localhost'); const path = url.pathname;
      const isApi = path.startsWith('/api/');
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) throw new AppError(405, 'Método não permitido.');
      if (isApi && req.method === 'HEAD') throw new AppError(405, 'Método não permitido.');
      if (isApi && [...url.searchParams.keys()].some(key => path.startsWith('/api/art/') ? key !== 'kind' : true)) throw new AppError(400, 'Parâmetro desconhecido.');
      if (req.method === 'POST') {
        const received = req.headers['x-csrf-token'];
        if (typeof received !== 'string' || !/^[a-f0-9]{64}$/.test(received) || !timingSafeEqual(Buffer.from(received), Buffer.from(csrfToken))) throw new AppError(403, 'Reabra a página para enviar esta solicitação.');
      }
      if (req.method === 'GET' && path === '/api/config') { json(res, config()); return; }
      if (req.method === 'POST' && path === '/api/connect') {
        const body = await jsonBody(req); fields(body, ['serverUrl', 'token']);
        if (typeof body.serverUrl !== 'string' || body.serverUrl.length > 2048) throw new AppError(400, 'Informe uma URL válida para o Plex.');
        while (attempts.length && attempts[0] < Date.now() - 60000) attempts.shift();
        if (connecting || attempts.length >= 10) throw new AppError(429, 'Aguarde um momento antes de tentar conectar novamente.');
        attempts.push(Date.now()); connecting = true;
        try {
          const next = await makePlex(body.serverUrl, body.token);
          const previous = adapter; adapter = next; mode = 'plex'; connectionId = randomUUID(); await previous.close();
          emit('connection', { mode, connectionId }); json(res, config());
        } finally { connecting = false; }
        return;
      }
      if (req.method === 'POST' && path === '/api/disconnect') {
        if (connecting) throw new AppError(409, 'Aguarde a tentativa de conexão terminar.');
        const body = await jsonBody(req); fields(body, []);
        const previous = adapter; adapter = new DemoAdapter(); mode = 'demo'; connectionId = randomUUID(); await previous.close(); emit('connection', { mode, connectionId }); json(res, config()); return;
      }
      if (req.method === 'GET' && path === '/api/events') {
        if (clients.size >= 16) throw new AppError(429, 'Há muitas abas abertas. Feche uma delas e tente novamente.');
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });
        res.write(': connected\n\n'); clients.add(res);
        req.on('close', () => clients.delete(res)); return;
      }
      if (req.method === 'GET' && path === '/api/libraries') { json(res, await adapter.libraries()); return; }
      const hierarchy = path.match(/^\/api\/(libraries|shows|seasons)\/([^/]+)\/(shows|seasons|episodes)$/);
      if (req.method === 'GET' && hierarchy) {
        const [, group, id, action] = hierarchy;
        if (!(group === 'libraries' ? validId(id) : validCatalogId(id)) || !{ libraries: 'shows', shows: 'seasons', seasons: 'episodes' }[group] || { libraries: 'shows', shows: 'seasons', seasons: 'episodes' }[group] !== action) throw new AppError(400, 'Identificador inválido.');
        json(res, await adapter[action](id)); return;
      }
      const episodeRoute = path.match(/^\/api\/episodes\/([^/]+)(?:\/(progress|watched|playback|release))?$/);
      if (episodeRoute) {
        const [, id, action] = episodeRoute;
        if (!validId(id)) throw new AppError(400, 'Identificador inválido.');
        if ((req.method === 'POST' || action === 'playback') && req.headers['x-connection-id'] !== connectionId) throw new AppError(409, 'A conexão mudou. Atualize a biblioteca.');
        const selected = adapter;
        if (req.method === 'GET' && !action) { json(res, { episode: await selected.getEpisode(id) }); return; }
        if (req.method === 'GET' && action === 'playback') { json(res, await selected.playback(id)); return; }
        if (req.method === 'POST' && action === 'release') {
          const body = await jsonBody(req); fields(body, ['sessionId']);
          if (typeof body.sessionId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.sessionId)) throw new AppError(400, 'Sessão de reprodução inválida.');
          // Recovery retires media without reporting a second, stale timeline.
          if (selected.getSession) {
            const session = selected.getSession(body.sessionId, true);
            if (session.episodeId !== id) throw new AppError(409, 'A sessão de reprodução não corresponde ao episódio.');
            await mutate(`${selected.clientId}:${id}`, () => selected.stopSession(body.sessionId));
          } else if (mode !== 'demo') throw new AppError(404, 'Sessão de reprodução indisponível.');
          if (selected !== adapter) throw new AppError(409, 'A conexão mudou. Atualize a biblioteca.');
          json(res, { released: true }); return;
        }
        if (req.method === 'POST' && ['progress', 'watched'].includes(action)) {
          const body = await jsonBody(req);
          if (action === 'progress') {
            fields(body, ['timeMs', 'durationMs', 'state', 'sessionId']);
            if (body.sessionId !== undefined && (typeof body.sessionId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.sessionId))) throw new AppError(400, 'Sessão de reprodução inválida.');
            if (!Number.isSafeInteger(body.timeMs) || body.timeMs < 0 || body.timeMs > 604800000 || !Number.isSafeInteger(body.durationMs) || body.durationMs < 1 || body.durationMs > 604800000 || !['playing', 'paused', 'stopped'].includes(body.state)) throw new AppError(400, 'Progresso inválido.');
          } else { fields(body, ['watched']); if (typeof body.watched !== 'boolean') throw new AppError(400, 'Estado de episódio inválido.'); }
          const updated = await mutate(`${selected.clientId || 'demo'}:${id}`, () => action === 'progress' ? selected.progress(id, body) : selected.watched(id, body.watched));
          if (selected !== adapter) throw new AppError(409, 'A conexão mudou. Atualize a biblioteca.');
          emit('progress', { episodeId: id }); json(res, { episode: updated }); return;
        }
        throw new AppError(405, 'Método não permitido.');
      }
      const artRoute = path.match(/^\/api\/art\/([^/]+)$/);
      if (req.method === 'GET' && artRoute) {
        if (!validId(artRoute[1]) || !['thumb', 'art'].includes(url.searchParams.get('kind'))) throw new AppError(400, 'Imagem inválida.');
        if (!adapter.artwork) throw new AppError(404, 'Imagem indisponível.');
        await proxy(res, await adapter.artwork(artRoute[1], url.searchParams.get('kind')), true); return;
      }
      const streamRoute = path.match(/^\/api\/playback\/([a-f0-9-]{36})\/(file|hls\/(master|\d+))$/);
      if (req.method === 'GET' && streamRoute) {
        if (!adapter.directStream) throw new AppError(404, 'Reprodução indisponível.');
        if (!validRange(req.headers.range)) throw new AppError(416, 'Intervalo de reprodução inválido.');
        if (streamRoute[2] === 'file') await proxy(res, await adapter.directStream(streamRoute[1], req.headers.range));
        else {
          const asset = await adapter.hlsAsset(streamRoute[1], streamRoute[3]);
          if (asset.manifest !== undefined) { res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }); res.end(asset.manifest); }
          else await proxy(res, asset.response);
        }
        return;
      }
      if (isApi || req.method === 'POST') throw new AppError(404, 'Recurso não encontrado.');
      await serveStatic(req, res, path);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      json(res, { error: error instanceof AppError ? error.message : 'Não foi possível concluir a solicitação.' }, error instanceof AppError ? error.status : 500);
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  const timer = setInterval(async () => {
    if (!clients.size || polling) return;
    polling = true; const selected = adapter;
    try { for (const id of await selected.poll()) if (selected === adapter) emit('progress', { episodeId: id }); }
    catch { if (selected === adapter) emit('sync-error', { message: 'A atualização do Plex está temporariamente indisponível.' }); }
    finally { polling = false; }
  }, options.pollIntervalMs || 10000);
  const heartbeat = setInterval(() => { for (const client of clients) client.write(': heartbeat\n\n'); }, 15000);
  timer.unref(); heartbeat.unref();
  server.on('close', () => { clearInterval(timer); clearInterval(heartbeat); adapter.close(); for (const client of clients) client.end(); });
  server.shutdown = () => { clearInterval(timer); clearInterval(heartbeat); for (const client of clients) client.end(); server.close(); server.closeAllConnections(); };
  return server;
}
