import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { makeTarget } from '../server/plex.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function setup(t, options = {}) {
  const server = await createApp({ version: '0.1.0', plexServerUrl: '', plexToken: '', ...options });
  const base = await listen(server);
  t.after(() => server.shutdown());
  const config = await (await fetch(base + '/api/config')).json();
  return { base, server, config, get: path => fetch(base + path, { headers: { 'X-Connection-Id': config.connectionId } }), post: (path, body, extraHeaders = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': config.csrfToken, 'X-Connection-Id': config.connectionId, ...extraHeaders }, body: JSON.stringify(body) }) };
}

async function fakePlex(t, overrides = {}) {
  const requests = [];
  const data = {
    '100': { ratingKey: '100', type: 'show', title: 'Test show', year: 2025, childCount: 1, leafCount: 2, viewedLeafCount: 0, summary: 'A fixture', thumb: '/library/metadata/100/thumb/7' },
    '101': { ratingKey: '101', type: 'season', title: 'Season 1', index: 1, parentRatingKey: '100', leafCount: 2, viewedLeafCount: 0 },
    '1011': { ratingKey: '1011', type: 'episode', title: 'First', index: 1, parentIndex: 1, parentRatingKey: '101', grandparentRatingKey: '100', duration: 100000, viewOffset: 5000, viewCount: 0, Media: [{ container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', Part: [{ key: '/library/parts/99/10/file.mp4' }] }] },
    '1012': { ratingKey: '1012', type: 'episode', title: 'Second', index: 2, parentIndex: 1, parentRatingKey: '101', grandparentRatingKey: '100', duration: 100000, viewOffset: 0, viewCount: 0, Media: [{ container: 'mkv', videoCodec: 'hevc', audioCodec: 'dts', Part: [{ key: '/library/parts/98/10/file.mkv' }] }] },
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://plex.test');
    requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: req.method, headers: req.headers });
    if (overrides.handle?.(req, res, url, data)) return;
    const send = value => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers['x-plex-token'] !== 'test-secret-token') { res.writeHead(401); res.end('test-secret-token rejected'); return; }
    if (url.pathname === '/') send({ MediaContainer: { friendlyName: 'Fixture Plex' } });
    else if (url.pathname === '/library/sections') send({ MediaContainer: { Directory: [{ key: '1', title: 'Series', type: 'show' }, { key: '2', title: 'Movies', type: 'movie' }] } });
    else if (url.pathname === '/library/sections/1/all') send({ MediaContainer: { Metadata: [data['100']] } });
    else if (url.pathname === '/library/metadata/100/children') send({ MediaContainer: { Metadata: [data['101']] } });
    else if (url.pathname === '/library/metadata/101/children') send({ MediaContainer: { Metadata: [data['1011'], data['1012']] } });
    else if (/^\/library\/metadata\/\d+$/.test(url.pathname)) {
      const item = data[url.pathname.split('/').at(-1)];
      if (!item) { res.writeHead(404); res.end('not found'); } else send({ MediaContainer: { Metadata: [item] } });
    } else if (url.pathname === '/:/timeline') {
      const item = data[url.searchParams.get('ratingKey')];
      item.viewOffset = Number(url.searchParams.get('time'));
      // The fixture's server threshold is 95%, not the demo's 90%.
      if (item.viewOffset >= item.duration * 0.95) item.viewCount = 1;
      send({});
    } else if (['/:/scrobble', '/:/unscrobble'].includes(url.pathname)) {
      const item = data[url.searchParams.get('key')];
      item.viewCount = url.pathname === '/:/scrobble' ? 1 : 0;
      if (!item.viewCount) item.viewOffset = 0;
      send({});
    } else if (url.pathname === '/library/metadata/100/thumb/7') { res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': '3' }); res.end('PNG'); }
    else if (url.pathname === '/library/parts/99/10/file.mp4') {
      res.writeHead(req.headers.range ? 206 : 200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', ...(req.headers.range ? { 'Content-Range': 'bytes 2-5/8' } : {}) }); res.end(req.headers.range ? '2345' : '01234567');
    } else if (url.pathname === '/video/:/transcode/universal/stop') { res.writeHead(200); res.end();
    } else if (url.pathname === '/video/:/transcode/universal/start.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1200000\nsession/test/index.m3u8?X-Plex-Token=test-secret-token\n');
    } else if (url.pathname === '/video/:/transcode/universal/session/test/index.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end('#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment0.ts?X-Plex-Token=test-secret-token\n#EXT-X-ENDLIST\n');
    } else if (url.pathname === '/video/:/transcode/universal/session/test/segment0.ts') { res.writeHead(200, { 'Content-Type': 'video/mp2t' }); res.end('segment'); }
    else { res.writeHead(404); res.end('unknown'); }
  });
  const base = await listen(server);
  t.after(() => { server.close(); server.closeAllConnections(); });
  return { base, data, requests };
}

test('demo browses the complete hierarchy and updates progress and counts without reload', async t => {
  const app = await setup(t);
  assert.equal(app.config.mode, 'demo');
  assert.equal(app.config.version, '0.1.0');
  const shows = await (await app.get('/api/libraries/1/shows')).json();
  assert.equal(shows.items.length, 3);
  const seasons = await (await app.get('/api/shows/100/seasons')).json();
  assert.equal(seasons.items.length, 3);
  const episodes = await (await app.get('/api/seasons/101/episodes')).json();
  assert.equal(episodes.items.length, 6);
  assert.equal(episodes.items[2].viewOffsetMs, 7000);
  const progress = await (await app.post('/api/episodes/1013/progress', { timeMs: 17000, durationMs: 18000, state: 'stopped' })).json();
  assert.equal(progress.episode.watched, true);
  assert.equal((await (await app.get('/api/shows/100/seasons')).json()).items[0].watchedCount, 3);
  const reset = await (await app.post('/api/episodes/1013/watched', { watched: false })).json();
  assert.equal(reset.episode.watched, false);
  assert.equal(reset.episode.viewOffsetMs, 0);
  assert.equal((await (await app.get('/api/episodes/1013/playback')).json()).url, '/demo-sample.mp4');
});

test('CSRF, foreign origins, rebinding hosts and malformed mutations are rejected', async t => {
  const app = await setup(t);
  const path = '/api/episodes/1013/watched';
  assert.equal((await fetch(app.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"watched":true}' })).status, 403);
  assert.equal((await app.post(path, { watched: true }, { Origin: 'https://evil.example' })).status, 403);
  const rebindingStatus = await new Promise((resolve, reject) => {
    const request = http.get(app.base + '/api/config', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
  });
  assert.equal(rebindingStatus, 403);
  assert.equal((await fetch(app.base + '/api/config', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await app.post(path, { watched: 'true' })).status, 400);
  assert.equal((await app.post(path, { watched: true, token: 'unexpected' })).status, 400);
  assert.equal((await app.post('/api/episodes/1013/progress', { timeMs: -1, durationMs: 30000, state: 'playing' })).status, 400);
  assert.equal((await app.get('/api/episodes/abc')).status, 400);
  assert.equal((await app.get('/api/episodes/1013?target=http://evil.example')).status, 400);
  assert.equal((await app.post('/api/connect', { serverUrl: 'x'.repeat(17000), token: 'secret' })).status, 413);
});

test('Plex hierarchy, timeline and watched changes use the authenticated server API', async t => {
  const plex = await fakePlex(t);
  const app = await setup(t, { plexServerUrl: plex.base, plexToken: 'test-secret-token' });
  assert.equal(app.config.mode, 'plex'); assert.equal(app.config.serverName, 'Fixture Plex');
  const libraries = await (await app.get('/api/libraries')).json(); assert.equal(libraries.items.length, 1);
  const shows = await (await app.get('/api/libraries/1/shows')).json(); assert.equal(shows.items[0].thumb, '/api/art/100?kind=thumb');
  const seasons = await (await app.get('/api/shows/100/seasons')).json(); assert.equal(seasons.items[0].showId, '100');
  const episodes = await (await app.get('/api/seasons/101/episodes')).json(); assert.equal(episodes.items[0].durationMs, 100000);
  const descriptor = await (await app.get('/api/episodes/1011/playback')).json();
  const progress = await (await app.post('/api/episodes/1011/progress', { timeMs: 92000, durationMs: 100000, state: 'paused' })).json();
  assert.equal(progress.episode.viewOffsetMs, 92000);
  assert.equal(progress.episode.watched, false, 'client must not impose the demo threshold on Plex');
  await app.post('/api/episodes/1011/progress', { timeMs: 96000, durationMs: 100000, state: 'stopped' });
  const timelines = plex.requests.filter(x => x.path === '/:/timeline');
  assert.equal(timelines[0].method, 'POST'); assert.equal(timelines[0].query.time, '92000');
  assert.equal(timelines[0].headers['x-plex-client-identifier'], timelines[1].headers['x-plex-client-identifier']);
  assert.equal(timelines[0].headers['x-plex-session-identifier'], descriptor.sessionId);
  const reset = await (await app.post('/api/episodes/1011/watched', { watched: false })).json();
  assert.equal(reset.episode.watched, false);
  assert.equal(plex.requests.find(x => x.path === '/:/unscrobble').method, 'PUT');
  assert.ok(plex.requests.every(x => x.headers['x-plex-token'] === 'test-secret-token'));
  assert.ok(!JSON.stringify([app.config, libraries, shows, seasons, episodes, descriptor, progress, reset]).includes('test-secret-token'));
});

test('connection credentials stay in server memory and disconnect returns demo mode', async t => {
  const plex = await fakePlex(t); const app = await setup(t);
  const connected = await (await app.post('/api/connect', { serverUrl: plex.base, token: 'test-secret-token' })).json();
  assert.equal(connected.mode, 'plex'); assert.equal(connected.serverUrl, undefined); assert.equal(connected.token, undefined);
  assert.equal((await (await app.post('/api/disconnect', {})).json()).mode, 'demo');
  assert.equal((await (await app.get('/api/config')).json()).mode, 'demo');
});

test('direct media preserves byte ranges and never exposes upstream credentials', async t => {
  const plex = await fakePlex(t); const app = await setup(t, { plexServerUrl: plex.base, plexToken: 'test-secret-token' });
  const descriptor = await (await app.get('/api/episodes/1011/playback')).json();
  const response = await fetch(app.base + descriptor.url, { headers: { Range: 'bytes=2-5' } });
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 2-5/8'); assert.equal(await response.text(), '2345');
  assert.equal(plex.requests.find(x => x.path.includes('/parts/')).headers.range, 'bytes=2-5');
  assert.equal(response.headers.get('x-plex-token'), null);
  assert.equal((await fetch(app.base + descriptor.url, { headers: { Range: 'bytes=0-1,4-5' } })).status, 416);
});

test('HLS playlists and segments use opaque local URLs with tokens removed', async t => {
  const plex = await fakePlex(t); const app = await setup(t, { plexServerUrl: plex.base, plexToken: 'test-secret-token' });
  const descriptor = await (await app.get('/api/episodes/1012/playback')).json(); assert.equal(descriptor.mode, 'transcode');
  const master = await (await app.get(descriptor.url)).text();
  assert.ok(!master.includes('test-secret-token')); assert.ok(!master.includes(plex.base));
  const childURL = master.split('\n').find(x => x.startsWith('/api/'));
  const child = await (await app.get(childURL)).text();
  assert.ok(!child.includes('test-secret-token'));
  const segmentURL = child.split('\n').find(x => x.startsWith('/api/'));
  assert.equal(await (await app.get(segmentURL)).text(), 'segment');
  assert.ok(plex.requests.every(x => !('X-Plex-Token' in x.query)));
  await app.post('/api/episodes/1012/progress', { timeMs: 12000, durationMs: 100000, state: 'stopped', sessionId: descriptor.sessionId });
  const stop = plex.requests.find(x => x.path === '/video/:/transcode/universal/stop');
  assert.equal(stop.query.session, descriptor.sessionId);
  assert.equal(stop.headers['x-plex-session-identifier'], descriptor.sessionId);
  assert.equal((await app.get(segmentURL)).status, 404);
  assert.equal((await app.post('/api/episodes/1012/progress', { timeMs: 12000, durationMs: 100000, state: 'stopped', sessionId: descriptor.sessionId })).status, 200);
  assert.equal(plex.requests.filter(x => x.path === '/video/:/transcode/universal/stop').length, 1);
});

test('disconnect tears down active HLS sessions before discarding their credentials', async t => {
  const plex = await fakePlex(t); const app = await setup(t, { plexServerUrl: plex.base, plexToken: 'test-secret-token' });
  const descriptor = await (await app.get('/api/episodes/1012/playback')).json();
  await app.get(descriptor.url);
  assert.equal((await app.post('/api/disconnect', {})).status, 200);
  const stop = plex.requests.find(x => x.path === '/video/:/transcode/universal/stop');
  assert.equal(stop.query.session, descriptor.sessionId);
  assert.equal(stop.headers['x-plex-token'], 'test-secret-token');
});

test('Plex catalog and children honor totalSize pagination', async t => {
  const plex = await fakePlex(t, { handle(req, res, url, data) {
    if (!['/library/sections/1/all', '/library/metadata/101/children'].includes(url.pathname)) return false;
    const offset = Number(url.searchParams.get('X-Plex-Container-Start'));
    const all = url.pathname.endsWith('/all') ? [data['100'], { ...data['100'], ratingKey: '200', title: 'Second show' }] : [data['1011'], data['1012']];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ MediaContainer: { size: 1, totalSize: 2, offset, Metadata: all.slice(offset, offset + 1) } })); return true;
  } });
  const app = await setup(t, { plexServerUrl: plex.base, plexToken: 'test-secret-token' });
  assert.deepEqual((await (await app.get('/api/libraries/1/shows')).json()).items.map(x => x.id), ['100', '200']);
  assert.deepEqual((await (await app.get('/api/seasons/101/episodes')).json()).items.map(x => x.id), ['1011', '1012']);
  assert.ok(plex.requests.some(x => x.query['X-Plex-Container-Start'] === '1'));
});

test('stale connection mutations cannot write to a newly connected Plex server', async t => {
  const first = await fakePlex(t); const second = await fakePlex(t);
  const app = await setup(t, { plexServerUrl: first.base, plexToken: 'test-secret-token' });
  const connected = await (await app.post('/api/connect', { serverUrl: second.base, token: 'test-secret-token' })).json();
  assert.notEqual(connected.connectionId, app.config.connectionId);
  const stale = await app.post('/api/episodes/1011/progress', { timeMs: 50000, durationMs: 100000, state: 'stopped' });
  assert.equal(stale.status, 409);
  assert.equal((await app.get('/api/episodes/1011/playback')).status, 409);
  assert.equal(second.data['1011'].viewOffset, 5000);
  assert.ok(!second.requests.some(x => x.path === '/:/timeline'));
});

test('simultaneous playbacks of one episode keep independent Plex session identities', async t => {
  const plex = await fakePlex(t); const app = await setup(t, { plexServerUrl: plex.base, plexToken: 'test-secret-token' });
  const first = await (await app.get('/api/episodes/1011/playback')).json();
  const second = await (await app.get('/api/episodes/1011/playback')).json();
  assert.notEqual(first.sessionId, second.sessionId);
  await app.post('/api/episodes/1011/progress', { timeMs: 3000, durationMs: 100000, state: 'paused', sessionId: first.sessionId });
  await app.post('/api/episodes/1011/progress', { timeMs: 6000, durationMs: 100000, state: 'paused', sessionId: second.sessionId });
  const timeline = plex.requests.filter(x => x.path === '/:/timeline');
  assert.equal(timeline[0].headers['x-plex-session-identifier'], first.sessionId);
  assert.equal(timeline[1].headers['x-plex-session-identifier'], second.sessionId);
  assert.equal((await app.post('/api/episodes/1012/progress', { timeMs: 6000, durationMs: 100000, state: 'paused', sessionId: first.sessionId })).status, 409);
  const stopped = { timeMs: 6000, durationMs: 100000, state: 'stopped', sessionId: second.sessionId };
  assert.equal((await app.post('/api/episodes/1011/progress', stopped)).status, 200);
  assert.equal((await app.post('/api/episodes/1011/progress', stopped)).status, 200);
  assert.equal((await app.post('/api/episodes/1011/progress', { ...stopped, state: 'playing' })).status, 409);
});

test('unsafe Plex media references and redirects cannot become arbitrary proxies', async t => {
  const plex = await fakePlex(t, { handle(req, res, url) {
    if (url.pathname === '/library/metadata/100/thumb/7') { res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); res.end(); return true; }
    if (url.pathname === '/video/:/transcode/universal/start.m3u8') { res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }); res.end('#EXTM3U\nhttp://169.254.169.254/latest/meta-data/\n'); return true; }
  } });
  const app = await setup(t, { plexServerUrl: plex.base, plexToken: 'test-secret-token' });
  assert.equal((await app.get('/api/art/100?kind=thumb')).status, 502);
  plex.data['1011'].Media[0].Part[0].key = 'http://evil.example/file.mp4';
  assert.equal((await app.get('/api/episodes/1011/playback')).status, 422);
  const descriptor = await (await app.get('/api/episodes/1012/playback')).json();
  assert.equal((await app.get(descriptor.url)).status, 502);
  assert.ok(plex.requests.every(x => !x.path.includes('latest')));
});

test('Plex errors and timeouts do not leak token or upstream response bodies', async t => {
  const plex = await fakePlex(t, { handle(req, res, url) {
    if (url.pathname === '/library/metadata/999') { res.writeHead(500); res.end('secret body test-secret-token'); return true; }
    if (url.pathname === '/library/metadata/998') return true;
  } });
  const app = await setup(t, { plexServerUrl: plex.base, plexToken: 'test-secret-token', requestTimeoutMs: 100 });
  const error = await app.get('/api/episodes/999'); assert.equal(error.status, 502); assert.ok(!(await error.text()).includes('test-secret-token'));
  const timeout = await app.get('/api/episodes/998'); assert.equal(timeout.status, 502);
});

test('explicit server origins reject cloud metadata, credentials and URL paths', async () => {
  for (const url of ['http://169.254.169.254', 'http://[fe80::1]', 'http://[::ffff:a9fe:a9fe]', 'http://100.100.100.200', 'http://user:pass@localhost', 'http://localhost/library', 'http://localhost?x=1', 'file:///tmp/a']) {
    await assert.rejects(() => makeTarget(url, 'token'), error => error.status === 400);
  }
});

test('SSE announces local changes and polling observes progress from other clients', async t => {
  const plex = await fakePlex(t); const app = await setup(t, { plexServerUrl: plex.base, plexToken: 'test-secret-token', pollIntervalMs: 30 });
  await app.get('/api/seasons/101/episodes');
  const controller = new AbortController(); t.after(() => controller.abort());
  const response = await fetch(app.base + '/api/events', { signal: controller.signal });
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  await reader.read();
  plex.data['1012'].viewOffset = 22000;
  const timeout = setTimeout(() => controller.abort(), 2000); t.after(() => clearTimeout(timeout));
  let text = '';
  while (!text.includes('"episodeId":"1012"')) { const chunk = await reader.read(); if (chunk.done) break; text += decoder.decode(chunk.value); }
  assert.match(text, /event: progress/); assert.match(text, /"episodeId":"1012"/);
  await app.post('/api/episodes/1011/watched', { watched: true });
  let local = '';
  while (!local.includes('"episodeId":"1011"')) { const chunk = await reader.read(); if (chunk.done) break; local += decoder.decode(chunk.value); }
  assert.match(local, /"episodeId":"1011"/); controller.abort();
});

test('static files support media ranges and do not expose files outside public', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'tv-public-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>Fixture</title>');
  await writeFile(join(dir, 'demo-sample.mp4'), '0123456789');
  const app = await setup(t, { publicDir: dir });
  assert.equal((await app.get('/')).status, 200);
  const range = await fetch(app.base + '/demo-sample.mp4', { headers: { Range: 'bytes=3-5' } });
  assert.equal(range.status, 206); assert.equal(await range.text(), '345');
  assert.equal((await app.get('/server/plex.mjs')).status, 404);
  assert.equal((await app.get('/%2e%2e%2fserver%2fplex.mjs')).status, 404);
});
