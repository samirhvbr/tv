import { createHash } from 'node:crypto';

export const FOLDER_CACHE_TTL_MS = 60000;
export const MAX_FOLDER_ITEMS = 20000;
export const isFolderId = id => typeof id === 'string' && /^fs_[a-f0-9]{32}$/.test(id);
export const isOtherVideos = library => library?.type === 'movie' && library.agent === 'com.plexapp.agents.none';
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
const text = value => typeof value === 'string' ? value.slice(0, 20000) : '';
const array = value => Array.isArray(value) ? value : [];
const idFor = (...parts) => `fs_${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)}`;
const name = value => text(value).replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
const canonical = value => name(value).toLocaleLowerCase('en-US');
const compare = (a, b) => a.localeCompare(b, 'pt-BR', { numeric: true });
const artURL = (item, kind) => item[kind] ? `/api/art/${item.ratingKey}?kind=${kind}` : undefined;

// Parse paths as data, independently of the operating system running Node.
// Neither a path nor any raw Plex object is exposed by the public projections.
function pathInfo(value) {
  if (typeof value !== 'string' || value.length > 16384 || /[\x00-\x1f]/.test(value)) return undefined;
  const path = value.replace(/\\/g, '/');
  if (!path.startsWith('/') && !/^[a-z]:\//i.test(path)) return undefined;
  const parts = path.split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..')) return undefined;
  const windows = /^[a-z]:\//i.test(path) || path.startsWith('//');
  const prefix = windows ? (path.startsWith('//') ? '//' : '') : '/';
  const key = prefix + parts.join('/');
  return { parts, key: windows ? key.toLowerCase() : key, windows, prefix };
}
function folderPath(path, parts) {
  const value = path.prefix + parts.join('/');
  return path.windows ? value.toLowerCase() : value;
}
function titleParts(value) {
  const cleaned = name(value);
  const year = cleaned.match(/^(.*?)\s*\(?((?:19|20)\d{2})\)?$/);
  return year && year[1].trim() ? { title: year[1].trim(), year: Number(year[2]) } : { title: cleaned, year: 0 };
}
function seasonMarker(value) {
  const bare = value.match(/^(?:s|season[ ._-]*|temporada[ ._-]*)(\d{1,3})(?=$|[ ._-])/i);
  if (bare) return { number: Number(bare[1]) };
  const release = value.match(/^(.+?)[ ._-]+(?:s(\d{1,3})|season[ ._-]*(\d{1,3})|temporada[ ._-]*(\d{1,3}))(?=$|[ ._-])/i);
  return release ? { prefix: release[1], number: Number(release[2] ?? release[3] ?? release[4]) } : undefined;
}
function episodeMarker(value) {
  const found = value.match(/^(.*?)(?:[ ._-]|^)s(\d{1,3})e(\d{1,4})(?!\d)/i);
  return found ? { prefix: found[1], season: Number(found[2]), episode: Number(found[3]) } : undefined;
}
function inferPath(value, library) {
  const path = pathInfo(value);
  if (!path || path.parts.length < 2) return undefined;
  const directories = path.parts.slice(0, -1);
  const folder = directories.at(-1);
  const file = path.parts.at(-1).replace(/\.[^.]+$/, '');
  const season = seasonMarker(folder);
  const episode = episodeMarker(file);
  const roots = array(library.Location).map(location => pathInfo(location.path)?.key).filter(Boolean);
  if (season && episode && season.number !== episode.season) return undefined;
  let showKey; let label; let seasonNumber = season?.number ?? episode?.season ?? 0;
  if (season?.prefix) {
    label = season.prefix;
    showKey = ['release', folderPath(path, directories.slice(0, -1)), canonical(label)];
  } else if (season && directories.length > 1) {
    const parent = folderPath(path, directories.slice(0, -1));
    if (roots.includes(parent) || roots.includes(folderPath(path, directories))) {
      if (!episode?.prefix) return undefined;
      label = episode.prefix;
      showKey = ['loose', parent, canonical(label)];
    } else {
      label = directories.at(-2);
      showKey = ['folder', parent];
    }
  } else if (season) {
    // A bare Season 1 root carries no series identity: keep the video separate.
    return undefined;
  } else {
    const directory = folderPath(path, directories);
    if (roots.includes(directory)) {
      if (!episode?.prefix) return undefined;
      label = episode.prefix;
      showKey = ['loose', directory, canonical(label)];
    } else {
      label = folder;
      showKey = ['folder', directory];
    }
  }
  if (episode?.prefix && season && canonical(titleParts(episode.prefix).title) !== canonical(titleParts(label).title)) return undefined;
  const title = titleParts(label);
  if (!title.title) return undefined;
  return { showKey, ...title, seasonNumber, episodeNumber: episode?.episode ?? 0 };
}
function grouping(item, library) {
  let paths = array(item.Media).flatMap(media => array(media.Part).map(part => part.file)).filter(path => typeof path === 'string');
  if (!paths.length) {
    paths = array(item.Location).map(location => location.path).filter(path => typeof path === 'string').map(path => {
      if (/\.(?:mp4|m4v|mkv|avi|mov|ts|m2ts|webm)$/i.test(path)) return path;
      const title = text(item.title).replace(/[\\/]/g, ' ');
      return `${path.replace(/[\\/]+$/, '')}/${title}.mp4`;
    });
  }
  const inferred = paths.map(path => inferPath(path, library));
  const first = inferred[0];
  if (first && inferred.every(entry => entry && JSON.stringify(entry) === JSON.stringify(first))) return first;
  // Missing, conflicting or ambiguous paths never join otherwise unrelated files.
  return { showKey: ['unclassified', String(item.ratingKey)], title: text(item.title) || 'Vídeo sem identificação', year: 0, seasonNumber: 0, episodeNumber: 0, unclassified: true };
}

export class FolderCatalog {
  constructor(library, items) {
    if (items.length > MAX_FOLDER_ITEMS) throw new RangeError('Folder catalog item limit exceeded');
    this.libraryId = String(library.key);
    this.records = new Map();
    this.showNodes = new Map();
    this.seasonNodes = new Map();
    for (const raw of items) {
      const id = String(raw.ratingKey);
      if (raw.type !== 'movie' || !/^\d{1,20}$/.test(id) || this.records.has(id)) continue;
      const group = grouping(raw, library);
      const showId = idFor(this.libraryId, 'show', group.showKey);
      const seasonId = idFor(this.libraryId, 'season', group.showKey, group.seasonNumber);
      if (!this.showNodes.has(showId)) this.showNodes.set(showId, { id: showId, title: group.title, year: group.year, unclassified: !!group.unclassified, seasonIds: [], episodeIds: [] });
      if (!this.seasonNodes.has(seasonId)) {
        this.seasonNodes.set(seasonId, { id: seasonId, showId, number: group.seasonNumber, episodeIds: [] });
        this.showNodes.get(showId).seasonIds.push(seasonId);
      }
      this.showNodes.get(showId).episodeIds.push(id);
      this.seasonNodes.get(seasonId).episodeIds.push(id);
      this.records.set(id, { raw, showId, seasonId, seasonNumber: group.seasonNumber, episodeNumber: group.episodeNumber });
    }
  }
  update(item) {
    const record = this.records.get(String(item.ratingKey));
    if (record) record.raw = { ...record.raw, ...item, viewOffset: number(item.viewOffset), viewCount: number(item.viewCount) };
  }
  episode(id) {
    const record = this.records.get(id);
    if (!record) return undefined;
    const item = record.raw;
    return { id, showId: record.showId, seasonId: record.seasonId, title: text(item.title), seasonNumber: record.seasonNumber, episodeNumber: record.episodeNumber, summary: text(item.summary), durationMs: number(item.duration), viewOffsetMs: number(item.viewOffset), watched: number(item.viewCount) > 0, thumb: artURL(item, 'thumb') };
  }
  watchedCount(ids) { return ids.reduce((count, id) => count + (number(this.records.get(id)?.raw.viewCount) > 0 ? 1 : 0), 0); }
  show(id) {
    const node = this.showNodes.get(id);
    if (!node) return undefined;
    const representative = this.records.get(node.episodeIds[0]).raw;
    return { id, title: node.title, year: node.year, summary: node.unclassified ? 'Vídeo sem agrupamento seguro por pasta.' : 'Temporadas organizadas a partir das suas pastas.', thumb: artURL(representative, 'thumb'), art: artURL(representative, 'art'), seasonCount: node.seasonIds.length, episodeCount: node.episodeIds.length, watchedCount: this.watchedCount(node.episodeIds), grouping: 'folders' };
  }
  season(id) {
    const node = this.seasonNodes.get(id);
    return node ? { id, showId: node.showId, title: node.number ? `Temporada ${node.number}` : 'Vídeos', number: node.number, episodeCount: node.episodeIds.length, watchedCount: this.watchedCount(node.episodeIds) } : undefined;
  }
  shows() { return [...this.showNodes.keys()].map(id => this.show(id)).sort((a, b) => compare(a.title, b.title) || compare(a.id, b.id)); }
  seasons(id) { return (this.showNodes.get(id)?.seasonIds || []).map(key => this.season(key)).sort((a, b) => a.number - b.number); }
  episodes(id) { return (this.seasonNodes.get(id)?.episodeIds || []).map(key => this.episode(key)).sort((a, b) => a.episodeNumber - b.episodeNumber || compare(a.title, b.title) || compare(a.id, b.id)); }
}
