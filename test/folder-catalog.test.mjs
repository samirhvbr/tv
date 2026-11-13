import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { FolderCatalog, MAX_FOLDER_ITEMS, isFolderId } from '../server/folder-catalog.mjs';
import { makeTarget, PlexAdapter } from '../server/plex.mjs';

const library = { key: '9', title: 'Other videos', type: 'movie', agent: 'com.plexapp.agents.none', Location: [{ path: '/fixture/library' }] };
function video(id, file, extra = {}) {
  return { ratingKey: String(id), type: 'movie', librarySectionID: 9, title: file?.split(/[\\/]/).at(-1) || `Video ${id}`, duration: 18000,
    Media: [{ container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', Part: [{ key: '/library/parts/1/1/file.mp4', ...(file ? { file } : {}) }] }], ...extra };
}
const releaseItems = () => [1, 2, 3].flatMap(season => [1, 2].map(episode => video(7000 + season * 100 + episode, `/fixture/library/Tulsa.King.2022.S0${season}.1080p.WEB/Tulsa.King.S0${season}E0${episode}.mp4`)));

test('release season folders produce stable local hierarchy and original numeric episode IDs', () => {
  const items = releaseItems();
  items[0].viewCount = 1;
  items[1].viewOffset = 4000;
  items[0].thumb = '/library/metadata/7101/thumb/1';
  const catalog = new FolderCatalog(library, items);
  const [show] = catalog.shows();
  assert.equal(catalog.shows().length, 1);
  assert.equal(show.title, 'Tulsa King'); assert.equal(show.year, 2022);
  assert.equal(show.seasonCount, 3); assert.equal(show.episodeCount, 6); assert.equal(show.watchedCount, 1);
  assert.equal(show.thumb, '/api/art/7101?kind=thumb');
  assert.ok(isFolderId(show.id));
  const seasons = catalog.seasons(show.id);
  assert.deepEqual(seasons.map(season => season.number), [1, 2, 3]);
  assert.ok(seasons.every(season => isFolderId(season.id)));
  assert.deepEqual(catalog.episodes(seasons[0].id).map(episode => episode.id), ['7101', '7102']);
  assert.equal(catalog.episode('7102').viewOffsetMs, 4000);
  assert.ok(!JSON.stringify([show, seasons, catalog.episodes(seasons[0].id)]).includes('/fixture/library'));
  const rebuilt = new FolderCatalog(library, items.toReversed().map(item => ({ ...item, title: 'Changed metadata title' })));
  assert.equal(rebuilt.shows()[0].id, show.id);
  assert.deepEqual(rebuilt.seasons(show.id).map(season => season.id), seasons.map(season => season.id));
});

test('Windows paths, named series parents, Season 1 and S01 share an unambiguous hierarchy', () => {
  const windows = { ...library, Location: [{ path: 'D:\\Videos' }] };
  const catalog = new FolderCatalog(windows, [
    video(1, 'D:\\Videos\\A Show\\Season 1\\A.Show.S01E02.mp4'),
    video(2, 'd:\\Videos\\A Show\\S01\\A.Show.S01E01.mp4'),
    video(3, 'D:\\Videos\\A Show\\Temporada 2\\A.Show.S02E01.mp4'),
    video(4, 'E:\\Videos\\A Show\\Season 1\\A.Show.S01E01.mp4'),
  ]);
  assert.equal(catalog.shows().length, 2, 'separate disk roots must not merge solely by title');
  const show = catalog.shows().find(show => show.episodeCount === 3);
  assert.equal(show.title, 'A Show');
  assert.deepEqual(catalog.seasons(show.id).map(season => season.number), [1, 2]);
  assert.deepEqual(catalog.episodes(catalog.seasons(show.id)[0].id).map(episode => episode.id), ['2', '1']);
});

test('loose season roots use explicit file prefixes and ambiguous videos stay separate', () => {
  const catalog = new FolderCatalog(library, [
    video(1, '/fixture/library/S01/Alpha.S01E01.mp4'),
    video(2, '/fixture/library/S02/Alpha.S02E01.mp4'),
    video(3, '/fixture/library/S01/Beta.S01E01.mp4'),
    video(4, '/fixture/library/S01/S01E02.mp4'),
    video(5, '/fixture/library/S01/S01E03.mp4'),
    video(6, '/fixture/library/Alpha/Season 1/Alpha.S02E01.mp4'),
    video(7, undefined),
  ]);
  const alpha = catalog.shows().find(show => show.title === 'Alpha');
  assert.equal(alpha.seasonCount, 2); assert.equal(alpha.episodeCount, 2);
  assert.equal(catalog.shows().length, 6);
  assert.equal(new Set(['4', '5', '6', '7'].map(id => catalog.episode(id).showId)).size, 4);
  const multiple = video(8, '/fixture/library/Alpha/Season 1/Alpha.S01E01.mp4');
  multiple.Media.push({ Part: [{ file: '/fixture/library/Beta/Season 1/Beta.S01E01.mp4' }] });
  const mixed = new FolderCatalog(library, [multiple, video(9, '/fixture/library/Alpha/Season 1/Alpha.S01E01.mp4')]);
  assert.equal(mixed.shows().length, 2, 'different files of one Plex item cannot establish one series identity');
});

test('item Location can supply the folder and missing watch fields reset authoritative state', () => {
  const item = video(1, undefined, { title: 'Alpha.S01E01', Location: [{ path: '/fixture/library/Alpha/Season 1' }], viewOffset: 5000, viewCount: 1 });
  const catalog = new FolderCatalog(library, [item]);
  assert.equal(catalog.shows()[0].title, 'Alpha');
  assert.equal(catalog.episode('1').episodeNumber, 1);
  catalog.update({ ratingKey: '1', title: 'Updated' });
  assert.equal(catalog.episode('1').watched, false);
  assert.equal(catalog.episode('1').viewOffsetMs, 0);
  assert.equal(catalog.shows()[0].watchedCount, 0);
  assert.throws(() => new FolderCatalog(library, Array(MAX_FOLDER_ITEMS + 1).fill(item)), RangeError);
});

async function fixture(t, options = {}) {
  const items = new Map(releaseItems().map(item => [item.ratingKey, item]));
  items.set('8001', video('8001', '/fixture/movies/Movie.mp4', { librarySectionID: 2 }));
  const requests = []; const controls = { holdNextRead: false, held: undefined, holdObserved: undefined, persist: true, oversized: false };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.test');
    requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams) });
    const send = value => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers['x-plex-token'] !== 'synthetic-token') { res.writeHead(401); res.end(); return; }
    if (url.pathname === '/') return send({ MediaContainer: { friendlyName: 'Synthetic folder fixture' } });
    if (url.pathname === '/library/sections') return send({ MediaContainer: { Directory: [library, { key: '2', title: 'Real movies', type: 'movie', agent: 'tv.plex.agents.movie' }, { key: '3', title: 'Unidentified movies', type: 'movie' }] } });
    if (url.pathname === '/library/sections/9/all') {
      const rows = [...items.values()].filter(item => item.librarySectionID === 9);
      const offset = Number(url.searchParams.get('X-Plex-Container-Start'));
      return send({ MediaContainer: { totalSize: controls.oversized ? 20001 : rows.length, Metadata: rows.slice(offset, offset + 2) } });
    }
    const ids = url.pathname.match(/^\/library\/metadata\/(\d+(?:,\d+)*)$/)?.[1].split(',');
    if (ids) {
      const rows = ids.map(id => items.get(id)).filter(Boolean);
      const snapshot = JSON.parse(JSON.stringify({ MediaContainer: { Metadata: rows } }));
      if (controls.holdNextRead) {
        controls.holdNextRead = false; controls.held = () => send(snapshot); controls.holdObserved?.(); return;
      }
      return send(snapshot);
    }
    if (url.pathname === '/:/timeline') {
      const item = items.get(url.searchParams.get('ratingKey'));
      if (controls.persist) item.viewOffset = Number(url.searchParams.get('time'));
      return send({});
    }
    if (['/:/scrobble', '/:/unscrobble'].includes(url.pathname)) {
      const item = items.get(url.searchParams.get('key'));
      if (controls.persist) {
        if (url.pathname === '/:/scrobble') item.viewCount = 1;
        else { delete item.viewCount; delete item.viewOffset; }
      }
      return send({});
    }
    if (url.pathname === '/library/parts/1/1/file.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); res.end('media'); return; }
    res.writeHead(404); res.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const adapter = await new PlexAdapter(await makeTarget(`http://127.0.0.1:${server.address().port}`, 'synthetic-token'), options).init();
  t.after(async () => { controls.held?.(); await adapter.close(); server.closeAllConnections(); server.close(); });
  return { adapter, items, requests, controls };
}

test('Other Videos adapter paginates folders, preserves numeric mutations and refuses real movies', async t => {
  const { adapter, requests } = await fixture(t);
  assert.deepEqual((await adapter.libraries()).items, [{ id: '9', title: 'Other videos', type: 'other', grouping: 'folders' }]);
  const [show] = (await adapter.shows('9')).items;
  const seasons = (await adapter.seasons(show.id)).items;
  const episodes = await adapter.episodes(seasons[1].id);
  assert.deepEqual(episodes.items.map(item => item.id), ['7201', '7202']);
  const playback = await adapter.playback('7201'); assert.equal(playback.mode, 'direct');
  const progress = await adapter.progress('7201', { timeMs: 5000, durationMs: 18000, state: 'paused', sessionId: playback.sessionId });
  assert.equal(progress.viewOffsetMs, 5000); assert.equal(progress.showId, show.id);
  assert.equal((await adapter.watched('7201', true)).watched, true);
  assert.equal((await adapter.seasons(show.id)).items[1].watchedCount, 1);
  assert.equal((await adapter.watched('7201', false)).viewOffsetMs, 0);
  assert.equal((await adapter.episodes(seasons[1].id)).items[0].watched, false);
  await assert.rejects(adapter.getEpisode('8001'), error => error.status === 404);
  await assert.rejects(adapter.playback('8001'), error => error.status === 404);
  await assert.rejects(adapter.shows('2'), error => error.status === 404);
  assert.ok(requests.some(request => request.path === '/library/sections/9/all' && request.query['X-Plex-Container-Start'] === '4'));
  assert.ok(requests.filter(request => request.path === '/library/sections/9/all').every(request => request.query.type === '1'));
  assert.ok(requests.every(request => !request.path.includes('fs_') && !JSON.stringify(request.query).includes('fs_')));
  assert.deepEqual(requests.filter(request => request.method !== 'GET').map(request => request.path), ['/:/timeline', '/:/scrobble', '/:/unscrobble']);
  assert.ok(!JSON.stringify([show, seasons, episodes, playback, progress]).includes('/fixture/'));
});

test('poll reads real movie state and updates virtual counts even when Plex omits zero values', async t => {
  const { adapter, items } = await fixture(t);
  const [show] = (await adapter.shows('9')).items;
  const [season] = (await adapter.seasons(show.id)).items;
  await adapter.episodes(season.id);
  Object.assign(items.get('7101'), { viewOffset: 8000, viewCount: 1 });
  assert.deepEqual(await adapter.poll(), ['7101']);
  assert.equal((await adapter.shows('9')).items[0].watchedCount, 1);
  delete items.get('7101').viewCount; delete items.get('7101').viewOffset;
  assert.deepEqual(await adapter.poll(), ['7101']);
  assert.equal((await adapter.shows('9')).items[0].watchedCount, 0);
  assert.equal((await adapter.getEpisode('7101')).viewOffsetMs, 0);
});

test('show counts refresh external watched changes before any season has been visited', async t => {
  const { adapter, items } = await fixture(t);
  const [show] = (await adapter.shows('9')).items;
  assert.equal(show.watchedCount, 0); assert.equal(adapter.seasonsSeen.size, 0);
  items.get('7302').viewCount = 1;
  assert.equal((await adapter.shows('9')).items[0].watchedCount, 1);
  delete items.get('7302').viewCount;
  assert.equal((await adapter.shows('9')).items[0].watchedCount, 0);
});

test('an older read finishing after a write cannot undo the acknowledged folder state', async t => {
  let now = 1000;
  const { adapter, items, controls } = await fixture(t, { now: () => now });
  const [show] = (await adapter.shows('9')).items;
  const [season] = (await adapter.seasons(show.id)).items;
  await adapter.episodes(season.id);
  const held = new Promise(resolve => { controls.holdObserved = resolve; });
  controls.holdNextRead = true;
  const polling = adapter.poll(); await held;
  await adapter.watched('7101', true);
  controls.held(); controls.held = undefined;
  await polling;
  assert.equal(adapter.folderCatalogs.get('9').catalog.shows()[0].watchedCount, 1, 'the old response itself cannot overwrite the current cached state');
  assert.equal((await adapter.shows('9')).items[0].watchedCount, 1);
  assert.equal((await adapter.getEpisode('7101')).watched, true);
  controls.persist = false;
  await adapter.progress('7101', { timeMs: 6000, durationMs: 18000, state: 'paused' });
  assert.equal((await adapter.getEpisode('7101')).viewOffsetMs, 6000, 'brief persistence lag must not move progress backwards');
  now += 10001;
  assert.equal((await adapter.getEpisode('7101')).viewOffsetMs, 0, 'Plex remains authoritative after the acknowledgement window');
  delete items.get('7101').viewCount;
  assert.equal((await adapter.getEpisode('7101')).watched, false);
});

test('a removed virtual season does not stop polling progress in the remaining seasons', async t => {
  let now = 1000;
  const { adapter, items } = await fixture(t, { now: () => now, folderCacheTtlMs: 100 });
  const [show] = (await adapter.shows('9')).items;
  const seasons = (await adapter.seasons(show.id)).items;
  await adapter.episodes(seasons[0].id); await adapter.episodes(seasons[1].id);
  items.delete('7101'); items.delete('7102');
  items.get('7201').viewOffset = 7000;
  now += 101;
  assert.deepEqual(await adapter.poll(), ['7201']);
  assert.ok(!adapter.seasonsSeen.has(seasons[0].id));
  assert.ok(adapter.seasonsSeen.has(seasons[1].id));
});

test('folder cache expires, deep IDs rebuild, limits are enforced, and only twelve seasons are observed', async t => {
  let now = 1000;
  const { adapter, items, controls } = await fixture(t, { now: () => now, folderCacheTtlMs: 100 });
  const [show] = (await adapter.shows('9')).items;
  const [season] = (await adapter.seasons(show.id)).items;
  adapter.folderCatalogs.clear();
  assert.equal((await adapter.episodes(season.id)).items.length, 2, 'a direct virtual-season URL can rebuild its lookup');
  items.set('7401', video('7401', '/fixture/library/Tulsa.King.2022.S04.1080p/Tulsa.King.S04E01.mp4'));
  assert.equal((await adapter.shows('9')).items[0].seasonCount, 3);
  now += 101;
  assert.equal((await adapter.shows('9')).items[0].seasonCount, 4);
  for (let i = 5; i <= 15; i++) items.set(String(7000 + i * 100 + 1), video(7000 + i * 100 + 1, `/fixture/library/Tulsa.King.2022.S${i}.1080p/Tulsa.King.S${i}E01.mp4`));
  now += 101;
  const seasons = (await adapter.seasons(show.id)).items;
  for (const item of seasons) await adapter.episodes(item.id);
  assert.equal(adapter.seasonsSeen.size, 12);
  assert.ok(!adapter.seasonsSeen.has(season.id));
  controls.oversized = true; now += 101;
  await assert.rejects(adapter.shows('9'), error => error.status === 422);
});
