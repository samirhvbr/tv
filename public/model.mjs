export function parseRoute(hash) {
  try {
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return {};
    if (parts[0] !== 'library' || !parts[1] || ![2, 4, 6].includes(parts.length)) return null;
    if (parts.length >= 4 && (parts[2] !== 'show' || !parts[3])) return null;
    if (parts.length === 6 && (parts[4] !== 'season' || !parts[5])) return null;
    return { libraryId: parts[1], ...(parts[3] && { showId: parts[3] }), ...(parts[5] && { seasonId: parts[5] }) };
  } catch { return null; }
}

export function routeHash(route = {}) {
  if (!route.libraryId) return '#/';
  let value = `#/library/${encodeURIComponent(route.libraryId)}`;
  if (route.showId) value += `/show/${encodeURIComponent(route.showId)}`;
  if (route.showId && route.seasonId) value += `/season/${encodeURIComponent(route.seasonId)}`;
  return value;
}

export function parentRoute(route) {
  if (route.seasonId) return { libraryId: route.libraryId, showId: route.showId };
  return { libraryId: route.libraryId };
}

export function progressPercent(episode) {
  if (episode.watched) return 100;
  if (!(episode.durationMs > 0)) return 0;
  return Math.max(0, Math.min(100, (episode.viewOffsetMs || 0) / episode.durationMs * 100));
}

export function filterItems(items, search = '', status = 'all') {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const query = normalize(search.trim());
  return items.filter(item => {
    const watched = item.watched === true || (item.episodeCount > 0 && item.watchedCount >= item.episodeCount);
    const started = !watched && (item.viewOffsetMs > 0 || item.watchedCount > 0);
    return (!query || normalize(item.title).includes(query) || normalize(`episódio ${item.episodeNumber || ''}`).includes(query))
      && (status === 'all' || (status === 'watched' && watched) || (status === 'unwatched' && !watched) || (status === 'started' && started));
  });
}

// Keep writes ordered even when a previous request fails.
export function createSerialQueue() {
  let tail = Promise.resolve();
  return function enqueue(operation) {
    const result = tail.then(operation, operation);
    tail = result.catch(() => {});
    return result;
  };
}
