import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

// A local Plex-shaped fixture; no account or real server is contacted.
export async function startPlexFixture({ hlsFiles, otherVideos = false, mediaAvailable = true } = {}) {
  const media = await readFile(new URL('../../public/demo-sample.mp4', import.meta.url));
  const token = 'browser-fixture-token';
  const reports = [];
  const watchActions = [];
  const requests = [];
  const heldStreams = new Set();
  const playback = { available: mediaAvailable, invalidManifest: false, requests: 0, holdAfterBytes: 0,
    mediaLength: media.length, interrupt: () => { for (const response of heldStreams) response.destroy(); } };
  const data = {
    '900': { ratingKey: '900', type: 'show', title: 'Série do servidor de teste', year: 2026, summary: 'Catálogo recebido pela API Plex.', childCount: 2, leafCount: 4 },
  };
  for (let season = 1; season <= 2; season++) {
    const seasonId = String(900 + season);
    data[seasonId] = { ratingKey: seasonId, type: 'season', title: `Temporada ${season}`, index: season, parentRatingKey: '900', leafCount: 2 };
    for (let episode = 1; episode <= 2; episode++) {
      const id = String(Number(seasonId) * 10 + episode);
      data[id] = { ratingKey: id, type: 'episode', title: `História ${season}.${episode}`, index: episode, parentIndex: season, parentRatingKey: seasonId, grandparentRatingKey: '900', duration: 18000, viewOffset: 0, viewCount: 0,
        Media: [{ container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', Part: [{ key: '/library/parts/1/1/file.mp4' }] }] };
    }
  }
  if (otherVideos) for (let season = 1; season <= 3; season++) {
    const number = String(season).padStart(2, '0');
    for (let episode = 1; episode <= 2; episode++) {
      const id = String(7000 + season * 100 + episode);
      const filename = `Tulsa.King.S${number}E${String(episode).padStart(2, '0')}.mp4`;
      data[id] = { ratingKey: id, type: 'movie', librarySectionID: 9, title: filename, duration: 18000,
        viewOffset: id === '7102' ? 4000 : 0, viewCount: id === '7101' ? 1 : 0,
        Media: [{ container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', Part: [{ key: '/library/parts/1/1/file.mp4', file: `/fixture/library/Tulsa.King.2022.S${number}.1080p/${filename}` }] }] };
    }
  }
  if (hlsFiles) for (const item of Object.values(data)) if (item.type === 'episode') {
    item.Media[0].container = 'mkv';
    item.Media[0].videoCodec = 'hevc';
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.test');
    requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: req.method });
    if (req.headers['x-plex-token'] !== token) { res.writeHead(401); res.end(); return; }
    const send = value => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/') return send({ MediaContainer: { friendlyName: 'Plex de teste' } });
    if (url.pathname === '/library/sections') return send({ MediaContainer: { Directory: [
      { key: '1', title: 'Séries', type: 'show' },
      ...(otherVideos ? [{ key: '9', title: 'Vídeos por pastas', type: 'movie', agent: 'com.plexapp.agents.none', Location: [{ path: '/fixture/library' }] }] : []),
    ] } });
    if (url.pathname === '/library/sections/1/all') return send({ MediaContainer: { Metadata: [data['900']] } });
    if (otherVideos && url.pathname === '/library/sections/9/all') return send({ MediaContainer: { Metadata: Object.values(data).filter(item => item.librarySectionID === 9) } });
    const children = url.pathname.match(/^\/library\/metadata\/(\d+)\/children$/);
    if (children) return send({ MediaContainer: { Metadata: Object.values(data).filter(item => item.parentRatingKey === children[1]) } });
    const metadata = url.pathname.match(/^\/library\/metadata\/(\d+(?:,\d+)*)$/);
    if (metadata) {
      const items = metadata[1].split(',').map(id => data[id]).filter(Boolean);
      if (items.length) return send({ MediaContainer: { Metadata: items } });
    }
    if (url.pathname === '/:/timeline') {
      const id = url.searchParams.get('ratingKey');
      const item = data[id];
      if (!item) { res.writeHead(404); res.end(); return; }
      const report = Object.fromEntries(url.searchParams);
      reports.push(report);
      item.viewOffset = Number(report.time);
      if (item.viewOffset >= item.duration * 0.9) item.viewCount = 1;
      return send({});
    }
    if (['/:/scrobble', '/:/unscrobble'].includes(url.pathname)) {
      const item = data[url.searchParams.get('key')];
      if (!item) { res.writeHead(404); res.end(); return; }
      watchActions.push({ id: item.ratingKey, watched: url.pathname === '/:/scrobble' });
      item.viewCount = url.pathname === '/:/scrobble' ? 1 : 0;
      if (!item.viewCount) item.viewOffset = 0;
      return send({});
    }
    if (url.pathname === '/video/:/transcode/universal/stop') return send({});
    if (hlsFiles && url.pathname === '/video/:/transcode/universal/start.m3u8') {
      playback.requests++;
      if (!playback.available) { res.writeHead(503); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      if (playback.invalidManifest) { res.end('#EXTM3U\n'); return; }
      res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000,CODECS="avc1.64001e,mp4a.40.2"\nindex.m3u8\n'); return;
    }
    if (hlsFiles && url.pathname.startsWith('/video/:/transcode/universal/')) {
      const name = url.pathname.split('/').at(-1);
      const asset = hlsFiles[name];
      if (asset) { res.writeHead(200, { 'Content-Type': name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' }); res.end(asset); return; }
    }
    if (url.pathname === '/library/parts/1/1/file.mp4') {
      playback.requests++;
      if (!playback.available) { res.writeHead(503); res.end(); return; }
      const match = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = match ? Number(match[1]) : 0;
      const end = match?.[2] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1;
      res.writeHead(match ? 206 : 200, { 'Content-Type': 'video/mp4', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(match ? { 'Content-Range': `bytes ${start}-${end}/${media.length}` } : {}) });
      if (playback.holdAfterBytes > 0) {
        res.write(media.subarray(start, Math.min(end + 1, start + playback.holdAfterBytes)));
        heldStreams.add(res);
        res.on('close', () => heldStreams.delete(res));
        return;
      }
      res.end(media.subarray(start, end + 1)); return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: `http://127.0.0.1:${server.address().port}`, token, data, reports, watchActions, requests, playback,
    close: () => { server.closeAllConnections(); server.close(); } };
}
