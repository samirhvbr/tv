import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const validId = value => typeof value === 'string' && /^\d{1,20}$/.test(value);
const text = value => typeof value === 'string' ? value.slice(0, 20000) : '';
const integer = value => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
const list = value => Array.isArray(value) ? value : [];

function forbiddenAddress(address) {
  const lower = address.toLowerCase();
  if (lower.includes(':')) {
    if (lower.startsWith('::ffff:')) {
      const tail = lower.slice(7);
      if (isIP(tail) === 4) return forbiddenAddress(tail);
      const parts = tail.split(':');
      if (parts.length !== 2) return true;
      const n = (parseInt(parts[0], 16) * 65536) + parseInt(parts[1], 16);
      return forbiddenAddress([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
    }
    return lower === '::' || /^fe[89ab]/.test(lower) || lower.startsWith('ff') || lower.startsWith('2001:db8:');
  }
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 100 && b === 100 && address === '100.100.100.200');
}

export async function makeTarget(serverUrl, token) {
  let url;
  try { url = new URL(serverUrl); } catch { throw new AppError(400, 'Informe uma URL válida para o Plex.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new AppError(400, 'Use somente a origem HTTP ou HTTPS do servidor Plex.');
  }
  if (typeof token !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(token)) throw new AppError(400, 'Informe um token Plex válido.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try { addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true }); }
  catch { throw new AppError(400, 'Não foi possível localizar o servidor Plex.'); }
  if (!addresses.length || addresses.some(entry => forbiddenAddress(entry.address))) throw new AppError(400, 'Este endereço de servidor não é permitido.');
  // Only this explicitly selected server may use LAN/loopback addresses. Pin DNS
  // for the connection lifetime; neither metadata nor redirects can change it.
  return { url, token, address: addresses[0].address, family: addresses[0].family };
}

export class PlexAdapter {
  constructor(target, { version = '0.1.0', timeoutMs = 10000 } = {}) {
    this.target = target;
    this.version = version;
    this.timeoutMs = timeoutMs;
    this.clientId = `tv-browser-${randomUUID()}`;
    this.serverName = 'Plex';
    this.seasonsSeen = new Set();
    this.episodeStates = new Map();
    this.sessions = new Map();
    this.timelineSessions = new Map();
    this.closed = false;
    this.pending = new Set();
  }

  async request(path, { method = 'GET', query = {}, headers = {}, stream = false } = {}) {
    if (this.closed || this.closing && path !== '/video/:/transcode/universal/stop') throw new AppError(503, 'A conexão com o Plex foi encerrada.');
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\r\n]/.test(path)) throw new AppError(502, 'O Plex retornou um recurso inválido.');
    const url = new URL(path, this.target.url);
    if (url.origin !== this.target.url.origin) throw new AppError(502, 'O Plex retornou um recurso inválido.');
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    url.searchParams.delete('X-Plex-Token');
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      let deadline;
      const req = transport.request(url, {
        method,
        lookup: (_host, options, done) => options.all ? done(null, [{ address: this.target.address, family: this.target.family }]) : done(null, this.target.address, this.target.family),
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': this.target.token,
          'X-Plex-Client-Identifier': this.clientId,
          'X-Plex-Product': 'TV Browser Prototype',
          'X-Plex-Version': this.version,
          'X-Plex-Platform': 'Chrome',
          'X-Plex-Device': 'Browser',
          ...headers,
        },
      }, res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new AppError(res.statusCode === 401 || res.statusCode === 403 ? 401 : res.statusCode === 404 ? 404 : 502,
            res.statusCode === 401 || res.statusCode === 403 ? 'O Plex recusou a conexão. Confira o token.' : 'O Plex não conseguiu atender esta solicitação.'));
          return;
        }
        if (stream) { clearTimeout(deadline); resolve(res); return; }
        const chunks = []; let size = 0;
        res.on('data', chunk => {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) { req.destroy(); reject(new AppError(502, 'A resposta do Plex excedeu o limite.')); }
          else chunks.push(chunk);
        });
        res.on('end', () => {
          clearTimeout(deadline);
          if (!size) { resolve({}); return; }
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch { reject(new AppError(502, 'O Plex retornou uma resposta incompatível.')); }
        });
        res.on('error', () => reject(new AppError(502, 'A conexão com o Plex foi interrompida.')));
      });
      deadline = setTimeout(() => req.destroy(new Error('timeout')), this.timeoutMs);
      deadline.unref();
      this.pending.add(req);
      req.on('close', () => { clearTimeout(deadline); this.pending.delete(req); });
      req.setTimeout(this.timeoutMs, () => req.destroy(new Error('timeout')));
      req.on('error', () => reject(new AppError(502, 'Não foi possível acessar o Plex. Confira o servidor e a rede.')));
      req.end();
    });
  }

  async init() {
    const data = await this.request('/');
    this.serverName = text(data.MediaContainer?.friendlyName) || 'Plex';
    await this.libraries();
    return this;
  }
  async metadata(id, expected) {
    const data = await this.request(`/library/metadata/${id}`);
    const item = list(data.MediaContainer?.Metadata)[0];
    if (!item || String(item.ratingKey) !== id || (expected && item.type !== expected)) throw new AppError(404, 'Este item não foi encontrado.');
    return item;
  }
  async collection(path, key = 'Metadata', query = {}) {
    const items = []; const ids = new Set(); let offset = 0;
    for (let page = 0; page < 100; page++) {
      const data = await this.request(path, { query: { ...query, 'X-Plex-Container-Start': offset, 'X-Plex-Container-Size': 200 } });
      const container = data.MediaContainer || {}; const rows = list(container[key]);
      const total = container.totalSize === undefined ? undefined : integer(container.totalSize);
      if (total > 20000) throw new AppError(422, 'Esta biblioteca excede o limite de 20 mil itens do protótipo.');
      let added = 0;
      for (const row of rows) {
        const id = String(row.ratingKey ?? row.key);
        if (!ids.has(id)) { ids.add(id); items.push(row); added++; }
      }
      if (items.length > 20000) throw new AppError(422, 'Esta biblioteca excede o limite de 20 mil itens do protótipo.');
      offset += rows.length;
      if (total === undefined || offset >= total) return items;
      if (!rows.length || !added) throw new AppError(502, 'O Plex não concluiu a paginação da biblioteca.');
    }
    throw new AppError(422, 'Esta biblioteca excede o limite de páginas do protótipo.');
  }
  artURL(item, kind) { return item[kind] ? `/api/art/${item.ratingKey}?kind=${kind}` : undefined; }
  show(item) {
    return { id: String(item.ratingKey), title: text(item.title), year: integer(item.year), summary: text(item.summary), thumb: this.artURL(item, 'thumb'), art: this.artURL(item, 'art'), seasonCount: integer(item.childCount), episodeCount: integer(item.leafCount), watchedCount: integer(item.viewedLeafCount) };
  }
  season(item) {
    return { id: String(item.ratingKey), showId: String(item.parentRatingKey), title: text(item.title), number: integer(item.index), episodeCount: integer(item.leafCount), watchedCount: integer(item.viewedLeafCount) };
  }
  episode(item) {
    return { id: String(item.ratingKey), showId: String(item.grandparentRatingKey), seasonId: String(item.parentRatingKey), title: text(item.title), seasonNumber: integer(item.parentIndex), episodeNumber: integer(item.index), summary: text(item.summary), durationMs: integer(item.duration), viewOffsetMs: integer(item.viewOffset), watched: integer(item.viewCount) > 0, thumb: this.artURL(item, 'thumb') };
  }
  async libraries() {
    const data = await this.request('/library/sections');
    return { items: list(data.MediaContainer?.Directory).filter(x => x.type === 'show' && validId(String(x.key))).map(x => ({ id: String(x.key), title: text(x.title), type: 'show' })) };
  }
  async shows(id) {
    const data = await this.collection(`/library/sections/${id}/all`, 'Metadata', { type: 2 });
    return { items: data.filter(x => x.type === 'show' && validId(String(x.ratingKey))).map(x => this.show(x)) };
  }
  async seasons(id) {
    const [show, data] = await Promise.all([this.metadata(id, 'show'), this.collection(`/library/metadata/${id}/children`)]);
    return { show: this.show(show), items: data.filter(x => x.type === 'season' && validId(String(x.ratingKey))).map(x => this.season(x)) };
  }
  async episodes(id) {
    const [season, data] = await Promise.all([this.metadata(id, 'season'), this.collection(`/library/metadata/${id}/children`)]);
    if (!validId(String(season.parentRatingKey))) throw new AppError(502, 'O Plex retornou uma série inválida.');
    const show = await this.metadata(String(season.parentRatingKey), 'show');
    const items = data.filter(x => x.type === 'episode' && validId(String(x.ratingKey))).map(x => this.episode(x));
    this.seasonsSeen.add(id);
    if (this.seasonsSeen.size > 12) this.seasonsSeen.delete(this.seasonsSeen.values().next().value);
    for (const item of items) this.episodeStates.set(item.id, `${item.viewOffsetMs}:${item.watched}`);
    return { show: this.show(show), season: this.season(season), items };
  }
  async getEpisode(id) { return this.episode(await this.metadata(id, 'episode')); }
  async progress(id, progress) {
    const playback = progress.sessionId ? this.getSession(progress.sessionId, true) : undefined;
    if (playback && playback.episodeId !== id) throw new AppError(409, 'A sessão de reprodução não corresponde ao episódio.');
    if (playback?.stopped && progress.state !== 'stopped') throw new AppError(409, 'Esta sessão de reprodução já foi encerrada.');
    if (playback?.finalEpisode && progress.state === 'stopped') return { ...playback.finalEpisode };
    const original = await this.getEpisode(id);
    const duration = original.durationMs || progress.durationMs;
    const time = Math.min(progress.timeMs, duration);
    if (!this.timelineSessions.has(id)) this.timelineSessions.set(id, randomUUID());
    const sessionId = progress.sessionId || this.timelineSessions.get(id);
    await this.request('/:/timeline', { method: 'POST', headers: { 'X-Plex-Session-Identifier': sessionId }, query: { ratingKey: id, key: `/library/metadata/${id}`, identifier: 'com.plexapp.plugins.library', time, duration, state: progress.state } });
    if (progress.state === 'stopped') await this.stopSession(sessionId);
    const updated = await this.getEpisode(id);
    // The timeline acknowledgement precedes metadata persistence on some PMS
    // versions. Reflect this acknowledged position immediately, while watched
    // remains the server's decision (including its configured threshold).
    const result = { ...updated, viewOffsetMs: time };
    if (playback && progress.state === 'stopped') playback.finalEpisode = result;
    return result;
  }
  async watched(id, watched) {
    await this.getEpisode(id);
    await this.request(watched ? '/:/scrobble' : '/:/unscrobble', { method: 'PUT', query: { key: id, identifier: 'com.plexapp.plugins.library' } });
    return { ...(await this.getEpisode(id)), watched, ...(!watched ? { viewOffsetMs: 0 } : {}) };
  }
  async poll() {
    const changed = [];
    for (const season of this.seasonsSeen) {
      const data = await this.collection(`/library/metadata/${season}/children`);
      for (const raw of data) {
        if (raw.type !== 'episode' || !validId(String(raw.ratingKey))) continue;
        const item = this.episode(raw); const state = `${item.viewOffsetMs}:${item.watched}`;
        if (this.episodeStates.has(item.id) && this.episodeStates.get(item.id) !== state) changed.push(item.id);
        this.episodeStates.set(item.id, state);
      }
    }
    return changed;
  }
  async artwork(id, kind) {
    const item = await this.metadata(id);
    const path = item[kind];
    if (typeof path !== 'string' || !/^\/library\/metadata\/\d+\/(?:thumb|art)(?:\/\d+)?$/.test(path)) throw new AppError(404, 'Imagem indisponível.');
    return this.request(path, { stream: true, headers: { Accept: 'image/*' } });
  }
  async playback(id) {
    const item = await this.metadata(id, 'episode');
    const media = list(item.Media)[0]; const part = list(media?.Part)[0];
    if (!part || typeof part.key !== 'string' || !/^\/library\/parts\/\d+\/\d+\/file(?:\.[a-z0-9]+)?$/i.test(part.key)) throw new AppError(422, 'Este episódio não tem um arquivo reproduzível.');
    const episode = this.episode(item);
    const direct = ['mp4', 'm4v'].includes(media.container) && media.videoCodec === 'h264' && ['aac', 'mp3'].includes(media.audioCodec);
    const sessionId = randomUUID();
    this.timelineSessions.set(id, sessionId);
    // Keep a bounded set; a descriptor grants access only to this episode.
    for (const [key, value] of this.sessions) if (Date.now() - value.created > 4 * 3600000) { await this.stopSession(key); this.sessions.delete(key); }
    if (this.sessions.size >= 16) { const key = this.sessions.keys().next().value; await this.stopSession(key); this.sessions.delete(key); }
    const session = { id: sessionId, episodeId: id, part: part.key, created: Date.now(), assets: new Map(), reverse: new Map() };
    this.sessions.set(sessionId, session);
    if (direct) return { url: `/api/playback/${sessionId}/file`, mimeType: 'video/mp4', mode: 'direct', sessionId, durationMs: episode.durationMs, viewOffsetMs: episode.viewOffsetMs };
    const query = new URLSearchParams({ path: `/library/metadata/${id}`, mediaIndex: '0', partIndex: '0', protocol: 'hls', directPlay: '0', directStream: '0', videoCodec: 'h264', audioCodec: 'aac', audioChannelCount: '2', videoResolution: '1920x1080', maxVideoBitrate: '12000', videoQuality: '100', session: sessionId, location: 'lan', offset: '0' });
    session.assets.set('master', `/video/:/transcode/universal/start.m3u8?${query}`);
    return { url: `/api/playback/${sessionId}/hls/master`, mimeType: 'application/vnd.apple.mpegurl', mode: 'transcode', sessionId, durationMs: episode.durationMs, viewOffsetMs: episode.viewOffsetMs };
  }
  getSession(id, allowStopped = false) {
    const session = this.sessions.get(id);
    if (!session || !allowStopped && session.stopped || Date.now() - session.created > 4 * 3600000) throw new AppError(404, 'A sessão de reprodução expirou. Abra o episódio novamente.');
    return session;
  }
  async directStream(sessionId, range) {
    return this.request(this.getSession(sessionId).part, { stream: true, headers: { Accept: '*/*', ...(range ? { Range: range } : {}) } });
  }
  async hlsAsset(sessionId, assetId) {
    const session = this.getSession(sessionId); const path = session.assets.get(assetId);
    if (!path) throw new AppError(404, 'Trecho de vídeo indisponível.');
    if (assetId === 'master') session.started = true;
    const response = await this.request(path, { stream: true, headers: {
      Accept: '*/*',
      'X-Plex-Session-Identifier': sessionId,
      'X-Plex-Client-Profile-Extra': 'add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac&replace=true)',
    } });
    if (!/\.m3u8(?:\?|$)/i.test(path) && !/mpegurl/i.test(response.headers['content-type'] || '')) return { response };
    const chunks = []; let size = 0;
    for await (const chunk of response) {
      size += chunk.length;
      if (size > 1024 * 1024) { response.destroy(); throw new AppError(502, 'A lista de reprodução excedeu o limite.'); }
      chunks.push(chunk);
    }
    const manifest = Buffer.concat(chunks).toString('utf8');
    if (!manifest.startsWith('#EXTM3U')) throw new AppError(502, 'O Plex retornou uma lista de reprodução inválida.');
    const rewrite = uri => {
      let url;
      try { url = new URL(uri, new URL(path, this.target.url)); } catch { throw new AppError(502, 'Trecho de vídeo inválido.'); }
      if (url.origin !== this.target.url.origin || !url.pathname.startsWith('/video/:/transcode/') || /%2f|%5c|%2e/i.test(url.pathname) || url.username || url.password || url.hash) throw new AppError(502, 'Trecho de vídeo inválido.');
      for (const key of [...url.searchParams.keys()]) if (key.toLowerCase() === 'x-plex-token') url.searchParams.delete(key);
      const target = url.pathname + url.search;
      let key = session.reverse.get(target);
      if (!key) {
        if (session.assets.size > 10000) throw new AppError(502, 'A lista de reprodução excedeu o limite.');
        key = String(session.assets.size); session.assets.set(key, target); session.reverse.set(target, key);
      }
      return `/api/playback/${sessionId}/hls/${key}`;
    };
    return { manifest: manifest.split(/\r?\n/).map(line => line.startsWith('#') ? line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${rewrite(uri)}"`) : line.trim() ? rewrite(line.trim()) : line).join('\n') };
  }
  async stopSession(id) {
    const session = this.sessions.get(id);
    if (!session || session.stopped) return;
    session.stopped = true;
    if (session.started) {
      try {
        const response = await this.request('/video/:/transcode/universal/stop', { query: { session: id }, stream: true, headers: { 'X-Plex-Session-Identifier': id } });
        response.resume();
      } catch { /* Best effort: PMS may already have expired this session. */ }
    }
  }
  close() {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    for (const request of this.pending) request.destroy();
    this.closePromise = Promise.allSettled([...this.sessions.keys()].map(id => this.stopSession(id))).finally(() => {
      this.closed = true; this.target.token = ''; this.pending.clear(); this.sessions.clear(); this.timelineSessions.clear();
    });
    return this.closePromise;
  }
}
