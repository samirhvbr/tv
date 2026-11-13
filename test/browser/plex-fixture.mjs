import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

// A local Plex-shaped fixture; no account or real server is contacted.
export async function startPlexFixture({ hlsFiles } = {}) {
  const media = await readFile(new URL('../../public/demo-sample.mp4', import.meta.url));
  const token = 'browser-fixture-token';
  const reports = [];
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
  if (hlsFiles) for (const item of Object.values(data)) if (item.type === 'episode') {
    item.Media[0].container = 'mkv';
    item.Media[0].videoCodec = 'hevc';
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.test');
    if (req.headers['x-plex-token'] !== token) { res.writeHead(401); res.end(); return; }
    const send = value => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/') return send({ MediaContainer: { friendlyName: 'Plex de teste' } });
    if (url.pathname === '/library/sections') return send({ MediaContainer: { Directory: [{ key: '1', title: 'Séries', type: 'show' }] } });
    if (url.pathname === '/library/sections/1/all') return send({ MediaContainer: { Metadata: [data['900']] } });
    const children = url.pathname.match(/^\/library\/metadata\/(\d+)\/children$/);
    if (children) return send({ MediaContainer: { Metadata: Object.values(data).filter(item => item.parentRatingKey === children[1]) } });
    const metadata = url.pathname.match(/^\/library\/metadata\/(\d+)$/);
    if (metadata && data[metadata[1]]) return send({ MediaContainer: { Metadata: [data[metadata[1]]] } });
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
      item.viewCount = url.pathname === '/:/scrobble' ? 1 : 0;
      if (!item.viewCount) item.viewOffset = 0;
      return send({});
    }
    if (url.pathname === '/video/:/transcode/universal/stop') return send({});
    if (hlsFiles && url.pathname === '/video/:/transcode/universal/start.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000,CODECS="avc1.64001e,mp4a.40.2"\nindex.m3u8\n'); return;
    }
    if (hlsFiles && url.pathname.startsWith('/video/:/transcode/universal/')) {
      const name = url.pathname.split('/').at(-1);
      const asset = hlsFiles[name];
      if (asset) { res.writeHead(200, { 'Content-Type': name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' }); res.end(asset); return; }
    }
    if (url.pathname === '/library/parts/1/1/file.mp4') {
      const match = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = match ? Number(match[1]) : 0;
      const end = match?.[2] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1;
      res.writeHead(match ? 206 : 200, { 'Content-Type': 'video/mp4', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(match ? { 'Content-Range': `bytes ${start}-${end}/${media.length}` } : {}) });
      res.end(media.subarray(start, end + 1)); return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: `http://127.0.0.1:${server.address().port}`, token, data, reports,
    close: () => { server.closeAllConnections(); server.close(); } };
}
