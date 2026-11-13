import { parseRoute, routeHash, parentRoute, progressPercent, filterItems, createSerialQueue } from './model.mjs';

const $ = selector => document.querySelector(selector);
const main = $('#main');
const snapshots = new Map();
const state = { config: null, libraries: [], route: {}, data: null, search: '', filter: 'all', request: 0, controller: null, events: null, player: null, connectionEpoch: 0, changingConnection: false, bootRequest: 0, reconcileSequence: 0, syncStale: false };
let currentHash = location.hash;
let refreshTimer;
let toastTimer;
let playerCounter = 0;
history.scrollRestoration = 'manual';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function button(text, action, className = 'button', iconName) {
  const node = element('button', className);
  node.type = 'button';
  if (iconName) node.append(icon(iconName));
  node.append(document.createTextNode(text));
  node.addEventListener('click', action);
  return node;
}

function routeLink(text, route, className) {
  const node = element('a', className, text);
  node.href = routeHash(route);
  node.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(route);
  });
  return node;
}

function safeLocalUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = new URL(value, location.origin);
    return parsed.origin === location.origin && ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

function artwork(item) {
  const supplied = safeLocalUrl(item?.art || item?.thumb);
  if (supplied) return supplied;
  const title = (item?.title || '').toLowerCase();
  if (/tulsa|king/.test(title)) return '/assets/tulsa.svg';
  if (/orbit|horizonte|silo|severance|ruptura|espa|dark|expanse/.test(title)) return '/assets/orbit.svg';
  return '/assets/coast.svg';
}

function image(url, className, alt = '') {
  const node = element('img', className);
  node.src = url;
  node.alt = alt;
  node.loading = 'lazy';
  node.addEventListener('error', () => { if (!node.src.endsWith('/assets/coast.svg')) node.src = '/assets/coast.svg'; }, { once: true });
  return node;
}

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}

async function api(path, options = {}) {
  const { signal, method = 'GET', body, keepalive = false, connectionId = state.config?.connectionId } = options;
  const headers = method === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': state.config?.csrfToken || '' } : {};
  if (/\/api\/episodes\/[^/]+\/(progress|watched|playback)$/.test(path) && connectionId) headers['X-Connection-Id'] = connectionId;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
  try {
    const response = await fetch(path, {
      method, signal: controller.signal, keepalive, credentials: 'same-origin', cache: 'no-store',
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403 ? 'A conexão não foi autorizada. Confira o endereço e o token.' : response.status === 404 ? 'Este item não está disponível na biblioteca.' : response.status === 409 ? 'A conexão mudou. Abra novamente o episódio na biblioteca atual.' : 'Não foi possível acessar o servidor. Confira a conexão e tente novamente.');
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (timedOut) throw new Error('O servidor demorou para responder. Tente novamente.');
    if (error instanceof TypeError) throw new Error('A conexão foi interrompida. Confira o servidor e tente novamente.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function saveView() {
  if (!currentHash) return;
  const focus = state.player?.focus || document.activeElement?.dataset.focusKey;
  snapshots.set(currentHash, { scroll: window.scrollY, focus, search: state.search, filter: state.filter });
}

function navigate(route) {
  saveView();
  const hash = routeHash(route);
  if (location.hash === hash) return;
  location.hash = hash;
}

function restoreView(snapshot) {
  requestAnimationFrame(() => {
    window.scrollTo(0, snapshot?.scroll || 0);
    if (snapshot?.focus) {
      const target = [...main.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === snapshot.focus);
      target?.focus({ preventScroll: true });
    }
  });
}

function loading() {
  const wrapper = element('div', 'loading-state');
  wrapper.setAttribute('role', 'status');
  wrapper.append(element('span', 'spinner'), element('p', '', 'Preparando sua biblioteca…'));
  main.replaceChildren(wrapper);
}

function messageView(title, description, actionText, action, error = false) {
  const wrapper = element('div', error ? 'error-state' : 'empty-state');
  wrapper.append(icon(error ? 'refresh' : 'grid'), element('h2', '', title), element('p', '', description));
  if (actionText) wrapper.append(button(actionText, action, 'button button-primary'));
  return wrapper;
}

function updateConnection() {
  const demo = state.config.mode === 'demo';
  const stale = !demo && state.syncStale;
  $('#connection-state').textContent = demo ? 'Modo demonstração' : stale ? 'Plex · sincronização pendente' : state.config.serverName || 'Plex conectado';
  $('#connection-state').classList.toggle('connected', !demo && !stale);
  $('#connection-state').classList.toggle('stale', stale);
  $('#connection-state').title = stale ? 'Não foi possível atualizar o progresso. Os últimos dados disponíveis continuam na tela.' : '';
  $('#connect-top').textContent = demo ? 'Conectar Plex' : 'Gerenciar conexão';
  $('#footer-mode').textContent = demo ? 'Catálogo e vídeo de demonstração' : 'Conectado à sua biblioteca Plex';
  $('#disconnect').hidden = demo;
}

function setSyncStale(stale) {
  state.syncStale = stale;
  if (state.config) updateConnection();
}

async function bootstrap() {
  const bootRequest = ++state.bootRequest;
  state.connectionEpoch++;
  state.controller?.abort();
  state.request++;
  state.data = null;
  state.events?.close();
  loading();
  try {
    const config = await api('/api/config');
    if (bootRequest !== state.bootRequest) return;
    state.config = config;
    state.syncStale = false;
    updateConnection();
    const result = await api('/api/libraries');
    if (bootRequest !== state.bootRequest) return;
    state.libraries = result.items.filter(library => ['show', 'shows', 'tv', 'TV Shows'].includes(library.type));
    connectEvents();
    if (!state.libraries.length) {
      main.replaceChildren(messageView('Nenhuma biblioteca de séries', 'No Plex, a biblioteca precisa ser do tipo Séries de TV. Uma biblioteca chamada “Séries”, mas criada como Outros vídeos, não agrupa temporadas e episódios.', 'Verificar conexão', openConnection));
      return;
    }
    const route = parseRoute(location.hash);
    if (route && !route.libraryId) {
      history.replaceState(null, '', routeHash({ libraryId: state.libraries[0].id }));
    }
    await loadRoute();
  } catch (error) {
    if (bootRequest !== state.bootRequest) return;
    main.replaceChildren(messageView('Não conseguimos abrir sua biblioteca', error.message, 'Tentar novamente', bootstrap, true));
  }
}

async function fetchRouteData(route, signal) {
  if (route.seasonId) return { kind: 'episodes', ...await api(`/api/seasons/${encodeURIComponent(route.seasonId)}/episodes`, { signal }) };
  if (route.showId) return { kind: 'seasons', ...await api(`/api/shows/${encodeURIComponent(route.showId)}/seasons`, { signal }) };
  return { kind: 'shows', ...await api(`/api/libraries/${encodeURIComponent(route.libraryId)}/shows`, { signal }) };
}

async function loadRoute() {
  const request = ++state.request;
  state.controller?.abort();
  state.controller = new AbortController();
  const route = parseRoute(location.hash);
  currentHash = location.hash;
  const snapshot = snapshots.get(currentHash);
  state.search = snapshot?.search || '';
  state.filter = snapshot?.filter || 'all';
  if (!route?.libraryId || !state.libraries.some(library => String(library.id) === route.libraryId)) {
    main.replaceChildren(messageView('Vamos voltar à biblioteca?', 'Este endereço não corresponde a uma biblioteca disponível.', 'Ver séries', () => navigate({ libraryId: state.libraries[0]?.id })));
    return;
  }
  state.route = route;
  loading();
  try {
    const data = await fetchRouteData(route, state.controller.signal);
    if (request !== state.request) return;
    state.data = data;
    setSyncStale(false);
    render();
    restoreView(snapshot);
  } catch (error) {
    if (error.name === 'AbortError' || request !== state.request) return;
    const wrapper = messageView('Não foi possível abrir este conteúdo', error.message, 'Tentar novamente', loadRoute, true);
    wrapper.append(button('Voltar à biblioteca', () => navigate({ libraryId: state.route.libraryId }), 'button'));
    main.replaceChildren(wrapper);
  }
}

function breadcrumb() {
  const nav = element('nav', 'breadcrumb');
  nav.setAttribute('aria-label', 'Você está aqui');
  nav.append(routeLink('Séries', { libraryId: state.route.libraryId }));
  if (state.route.showId && state.data.show) {
    nav.append(icon('chevron'), routeLink(state.data.show.title, { libraryId: state.route.libraryId, showId: state.route.showId }));
  }
  if (state.route.seasonId && state.data.season) {
    nav.append(icon('chevron'), element('span', '', state.data.season.title || `Temporada ${state.data.season.number}`));
  }
  nav.lastElementChild?.setAttribute('aria-current', 'page');
  return nav;
}

function createHero(show) {
  const episodes = state.data.kind === 'episodes';
  const hero = element('section', `hero${episodes ? ' compact' : ''}`);
  hero.append(image(artwork(show), 'hero-art'));
  const content = element('div', 'hero-content');
  content.append(element('p', 'eyebrow', episodes ? 'SUA PRÓXIMA HISTÓRIA' : state.data.kind === 'seasons' ? 'TODAS AS TEMPORADAS. UM SÓ LUGAR.' : 'ENCONTRE SUA PRÓXIMA HISTÓRIA'));
  content.append(element('h1', '', show.title));
  const meta = element('div', 'hero-meta');
  if (show.year) meta.append(element('span', '', show.year));
  if (show.seasonCount) meta.append(element('span', '', `${show.seasonCount} temporada${show.seasonCount === 1 ? '' : 's'}`));
  if (show.episodeCount) meta.append(element('span', '', `${show.episodeCount} episódios`));
  content.append(meta);
  content.append(element('p', 'hero-summary', show.summary || 'Todas as temporadas, seus episódios e o ponto onde você parou. Escolha a próxima história.'));
  const actions = element('div', 'hero-actions');
  if (episodes && state.data.items.length) {
    const next = nextEpisode();
    actions.append(button(next.viewOffsetMs > 0 && !next.watched ? `Continuar · episódio ${next.episodeNumber}` : `Assistir · episódio ${next.episodeNumber}`, () => openPlayer(nextEpisode()), 'button button-primary hero-play', 'play'));
  } else if (state.data.kind === 'shows') {
    actions.append(button('Explorar temporadas', () => navigate({ libraryId: state.route.libraryId, showId: show.id }), 'button button-primary', 'play'));
  } else {
    actions.append(button('Escolher temporada', () => $('#catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 'button button-primary', 'grid'));
  }
  content.append(actions);
  hero.append(content);
  if (state.config.mode === 'demo') hero.append(element('span', 'hero-label', 'DEMONSTRAÇÃO · ARTE ORIGINAL'));
  return hero;
}

function nextEpisode() {
  if (state.data?.kind !== 'episodes') return null;
  return state.data.items.find(item => !item.watched && item.viewOffsetMs > 0) || state.data.items.find(item => !item.watched) || state.data.items[0];
}

function updateHeroProgress() {
  const control = $('.hero-play');
  const next = nextEpisode();
  if (!control || !next) return;
  const label = next.viewOffsetMs > 0 && !next.watched ? `Continuar · episódio ${next.episodeNumber}` : `Assistir · episódio ${next.episodeNumber}`;
  control.replaceChildren(icon('play'), document.createTextNode(label));
}

function render() {
  const fragment = document.createDocumentFragment();
  fragment.append(breadcrumb());
  if (state.route.showId) {
    const back = button(state.route.seasonId ? 'Ver temporadas' : 'Ver séries', () => navigate(parentRoute(state.route)), 'button button-quiet back-link', 'arrow');
    back.dataset.focusKey = 'parent';
    fragment.append(back);
  }
  const show = state.data.show || state.data.items[0];
  if (show) fragment.append(createHero(show));
  const section = element('section', 'catalog-section');
  section.id = 'catalog-section';
  const header = element('div', 'section-header');
  const group = element('div');
  const line = element('div', 'section-title-group');
  const title = state.data.kind === 'shows' ? 'Sua biblioteca' : state.data.kind === 'seasons' ? 'Temporadas' : state.data.season?.title || `Temporada ${state.data.season?.number || ''}`;
  line.append(element('h2', '', title), element('span', 'count'));
  group.append(line, element('p', 'section-description', state.data.kind === 'shows' ? 'Suas séries organizadas, do primeiro ao último episódio.' : state.data.kind === 'seasons' ? 'Escolha uma temporada para continuar.' : 'Seu progresso acompanha você. Sem recarregar a página.'));
  header.append(group);
  if (state.data.kind === 'shows' && state.libraries.length > 1) {
    const select = element('select', 'library-select');
    select.setAttribute('aria-label', 'Biblioteca');
    for (const library of state.libraries) { const option = element('option', '', library.title); option.value = library.id; option.selected = String(library.id) === state.route.libraryId; select.append(option); }
    select.addEventListener('change', () => navigate({ libraryId: select.value }));
    header.append(select);
  }
  section.append(header, createToolbar());
  const list = element('div', state.data.kind === 'episodes' ? 'episode-list' : 'cards');
  list.id = 'catalog';
  section.append(list);
  fragment.append(section);
  main.replaceChildren(fragment);
  main.classList.add('main-fade');
  renderCatalog();
}

function createToolbar() {
  const toolbar = element('div', 'toolbar');
  const search = element('label', 'search-box');
  search.append(icon('search'));
  const input = element('input');
  input.type = 'search';
  input.id = 'catalog-search';
  input.placeholder = state.data.kind === 'episodes' ? 'Buscar episódio' : state.data.kind === 'seasons' ? 'Buscar temporada' : 'Buscar na biblioteca';
  input.setAttribute('aria-label', input.placeholder);
  input.value = state.search;
  input.dataset.focusKey = 'search';
  input.addEventListener('input', () => { state.search = input.value; renderCatalog(); saveView(); });
  search.append(input);
  const select = element('select', 'status-select');
  select.setAttribute('aria-label', 'Filtrar por progresso');
  select.dataset.focusKey = 'filter';
  for (const [value, text] of [['all', 'Todos'], ['unwatched', 'Não assistidos'], ['started', 'Em andamento'], ['watched', 'Assistidos']]) {
    const option = element('option', '', text);
    option.value = value;
    option.selected = state.filter === value;
    select.append(option);
  }
  select.addEventListener('change', () => { state.filter = select.value; renderCatalog(); saveView(); });
  toolbar.append(search, select);
  return toolbar;
}

function renderCatalog() {
  const list = $('#catalog');
  if (!list || !state.data) return;
  const items = filterItems(state.data.items, state.search, state.filter);
  $('.count').textContent = `${items.length} ${state.data.kind === 'episodes' ? 'episódios' : state.data.kind === 'seasons' ? 'temporadas' : 'séries'}`;
  if (!items.length) {
    list.replaceChildren(messageView(state.data.items.length ? 'Nenhum resultado por aqui' : 'Ainda não há conteúdo', state.data.items.length ? 'Tente outro nome ou mude o filtro de progresso.' : 'Confira se a biblioteca foi escaneada no Plex e se esta temporada tem episódios disponíveis.', state.search || state.filter !== 'all' ? 'Limpar filtros' : 'Atualizar biblioteca', () => {
      if (state.search || state.filter !== 'all') { state.search = ''; state.filter = 'all'; $('#catalog-search').value = ''; $('.status-select').value = 'all'; renderCatalog(); }
      else loadRoute();
    }));
    return;
  }
  list.replaceChildren(...items.map(item => state.data.kind === 'episodes' ? episodeCard(item) : catalogCard(item)));
}

function catalogCard(item) {
  const season = state.data.kind === 'seasons';
  const route = season ? { ...state.route, seasonId: item.id } : { libraryId: state.route.libraryId, showId: item.id };
  const card = routeLink('', route, `show-card${season ? ' season-card' : ''}`);
  card.dataset.focusKey = `${season ? 'season' : 'show'}-${item.id}`;
  card.dataset.itemId = item.id;
  const poster = element('div', 'poster');
  poster.append(image(artwork(season ? state.data.show : item), 'poster-image'));
  poster.append(element('span', 'poster-kicker', season ? state.data.show.title : state.config.mode === 'demo' ? 'SUA BIBLIOTECA · DEMO' : 'SUA BIBLIOTECA'));
  poster.append(element('span', 'poster-title', item.title));
  if (season) poster.append(element('span', 'season-number', String(item.number).padStart(2, '0')));
  const info = element('div', 'card-info');
  const text = element('div');
  text.append(element('h3', '', item.title), element('p', '', season ? `${item.episodeCount || 0} episódios` : [item.year, item.seasonCount ? `${item.seasonCount} temporada${item.seasonCount === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')));
  const arrow = icon('chevron'); arrow.classList.add('card-arrow');
  info.append(text, arrow);
  card.append(poster, info, element('div', 'card-status'));
  const track = element('div', 'small-progress'); track.append(element('span')); card.append(track);
  updateAggregateCard(card, item);
  return card;
}

function updateAggregateCard(card, item) {
  const watched = item.watchedCount || 0;
  const total = item.episodeCount || 0;
  card.querySelector('.card-status').textContent = watched ? `${watched} de ${total} assistidos` : 'Pronto para começar';
  card.querySelector('.small-progress > span').style.width = `${total ? Math.min(100, watched / total * 100) : 0}%`;
}

function episodeLabel(episode) {
  if (episode.watched) return 'Assistido';
  if (episode.viewOffsetMs > 0) return `${Math.round(progressPercent(episode))}% assistido · continuar de ${formatTime(episode.viewOffsetMs)}`;
  return 'Não assistido';
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function episodeCard(episode) {
  const card = element('article', 'episode-card');
  card.dataset.itemId = episode.id;
  const play = button('', () => openPlayer(findEpisode(episode.id)), 'episode-art');
  play.setAttribute('aria-label', `Assistir episódio ${episode.episodeNumber}: ${episode.title}`);
  play.dataset.focusKey = `episode-${episode.id}`;
  play.append(image(safeLocalUrl(episode.thumb) || artwork(state.data.show), ''), icon('play'));
  const text = element('div', 'episode-info');
  const durationLabel = episode.durationMs < 60000 ? `${Math.round(episode.durationMs / 1000)} S` : `${Math.round(episode.durationMs / 60000)} MIN`;
  text.append(element('p', 'episode-number', `EPISÓDIO ${String(episode.episodeNumber).padStart(2, '0')}  ·  ${durationLabel}`));
  const title = button(episode.title, () => openPlayer(findEpisode(episode.id)), 'episode-title');
  title.dataset.focusKey = `title-${episode.id}`;
  text.append(title, element('p', 'episode-summary', episode.summary || 'Escolha reproduzir para começar este episódio.'), element('p', 'episode-status'));
  const track = element('div', 'small-progress'); track.append(element('span')); text.append(track);
  const actions = element('div', 'episode-actions');
  const watched = button('', () => toggleWatched(episode.id, watched), 'watched-button');
  watched.dataset.focusKey = `watched-${episode.id}`;
  watched.append(icon('check'));
  actions.append(watched);
  card.append(play, text, actions);
  updateEpisodeCard(card, episode);
  return card;
}

function findEpisode(id) { return state.data.items.find(item => String(item.id) === String(id)); }

function updateEpisodeCard(card, episode) {
  card.querySelector('.episode-status').textContent = episodeLabel(episode);
  card.querySelector('.small-progress > span').style.width = `${progressPercent(episode)}%`;
  const watched = card.querySelector('.watched-button');
  watched.classList.toggle('is-watched', !!episode.watched);
  watched.setAttribute('aria-pressed', String(!!episode.watched));
  watched.setAttribute('aria-label', `${episode.watched ? 'Marcar como não assistido' : 'Marcar como assistido'}: ${episode.title}`);
  watched.title = episode.watched ? 'Marcar como não assistido' : 'Marcar como assistido';
}

function applyEpisode(episode) {
  if (!episode || state.data?.kind !== 'episodes') return;
  state.reconcileSequence++;
  const index = state.data.items.findIndex(item => String(item.id) === String(episode.id));
  if (index < 0) return;
  state.data.items[index] = episode;
  const card = [...main.querySelectorAll('.episode-card')].find(node => node.dataset.itemId === String(episode.id));
  if (card) updateEpisodeCard(card, episode);
  updateHeroProgress();
}

async function toggleWatched(id, control) {
  const episode = findEpisode(id);
  if (!episode || control.disabled) return;
  control.disabled = true;
  const request = state.request;
  state.reconcileSequence++;
  try {
    const result = await api(`/api/episodes/${encodeURIComponent(id)}/watched`, { method: 'POST', body: { watched: !episode.watched } });
    if (request === state.request) {
      applyEpisode(result.episode);
      if (state.filter !== 'all') { const key = control.dataset.focusKey; renderCatalog(); [...main.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === key)?.focus({ preventScroll: true }); }
    }
    notify(result.episode.watched ? 'Episódio marcado como assistido.' : 'Episódio marcado como não assistido.');
  } catch (error) { notify(error.message); }
  finally { control.disabled = false; }
}

async function refreshVisible() {
  if (!state.data || !state.route.libraryId || document.hidden) return;
  const request = state.request;
  const sequence = ++state.reconcileSequence;
  try {
    const data = await fetchRouteData(state.route);
    if (request !== state.request || sequence !== state.reconcileSequence) return;
    setSyncStale(false);
    state.data = data;
    updateHeroProgress();
    // Updating status leaves playback, focus, route, and scroll untouched.
    for (const card of main.querySelectorAll('[data-item-id]')) {
      const item = data.items.find(value => String(value.id) === card.dataset.itemId);
      if (item) data.kind === 'episodes' ? updateEpisodeCard(card, item) : updateAggregateCard(card, item);
    }
    if (!state.player && state.filter !== 'all') {
      const focus = document.activeElement?.dataset.focusKey;
      renderCatalog();
      [...main.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === focus)?.focus({ preventScroll: true });
    }
  } catch { if (request === state.request && sequence === state.reconcileSequence) setSyncStale(true); }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshVisible, 180);
}

function connectEvents() {
  state.events?.close();
  state.events = new EventSource('/api/events');
  state.events.addEventListener('progress', scheduleRefresh);
  state.events.addEventListener('sync-error', () => setSyncStale(true));
  state.events.addEventListener('connection', () => {
    if (state.changingConnection) return;
    state.connectionEpoch++;
    if (state.player) {
      disposePlayer(state.player);
      state.player = null;
      notify('A conexão mudou. Abra novamente o episódio na biblioteca atual.');
    }
    snapshots.clear();
    history.replaceState(null, '', '#/');
    bootstrap();
  });
}

async function openPlayer(episode) {
  if (!episode || state.player) return;
  saveView();
  const dialog = $('#player-dialog');
  const body = $('#player-body');
  const session = { id: ++playerCounter, epoch: state.connectionEpoch, connectionId: state.config.connectionId, episode, enqueue: createSerialQueue(), timer: null, video: null, closing: false, ready: false, focus: document.activeElement?.dataset.focusKey };
  state.player = session;
  $('#player-title').textContent = episode.title;
  $('#player-context').textContent = `${state.data.show.title} · T${episode.seasonNumber} E${episode.episodeNumber}`;
  $('#player-status').textContent = 'Preparando reprodução…';
  $('#player-demo').textContent = state.config.mode === 'demo' ? 'Vídeo de teste · catálogo demonstrativo' : '';
  body.replaceChildren(element('span', 'spinner'));
  dialog.showModal();
  try {
    const playback = await api(`/api/episodes/${encodeURIComponent(episode.id)}/playback`, { connectionId: session.connectionId });
    if (state.player !== session) return;
    const url = safeLocalUrl(playback.url);
    if (!url) throw new Error('O servidor retornou um endereço de reprodução inválido.');
    const video = element('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', `Reproduzir ${episode.title}`);
    const hls = /mpegurl/i.test(playback.mimeType || '') || /\.m3u8(?:\?|$)/i.test(url);
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl');
    if (hls && !nativeHls && !window.Hls?.isSupported()) throw new Error('Este navegador não oferece reprodução HLS compatível. Tente um navegador atualizado ou uma versão MP4/H.264 no Plex.');
    session.video = video;
    session.playback = playback;
    video.addEventListener('loadedmetadata', () => {
      if (state.player !== session) return;
      const resumeMs = episode.watched ? 0 : playback.viewOffsetMs || episode.viewOffsetMs || 0;
      if (resumeMs > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(resumeMs / 1000, Math.max(0, video.duration - 1));
      session.ready = true;
      $('#player-status').textContent = resumeMs > 0 ? `Retomando em ${formatTime(resumeMs)}` : 'Pronto para assistir';
      video.play().catch(() => { $('#player-status').textContent = 'Pressione reproduzir para começar.'; });
    }, { once: true });
    video.addEventListener('play', () => reportProgress(session, 'playing').catch(() => {}));
    video.addEventListener('pause', () => { if (!session.closing && !video.ended) reportProgress(session, 'paused').catch(() => {}); });
    video.addEventListener('seeked', () => reportProgress(session, video.paused ? 'paused' : 'playing').catch(() => {}));
    video.addEventListener('ended', () => { if (state.player === session) closePlayer(); });
    video.addEventListener('error', () => { $('#player-status').textContent = 'Não foi possível reproduzir este formato. Tente uma versão MP4/H.264 compatível com o navegador.'; });
    session.timer = setInterval(() => { if (!video.paused && !video.ended) reportProgress(session, 'playing').catch(() => {}); }, 10000);
    body.replaceChildren(video);
    if (hls && !nativeHls) {
      const hlsPlayer = new window.Hls({ enableWorker: false });
      session.hls = hlsPlayer;
      hlsPlayer.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data.fatal && state.player === session) $('#player-status').textContent = 'A transmissão foi interrompida. Volte aos episódios e tente novamente.';
      });
      hlsPlayer.loadSource(url);
      hlsPlayer.attachMedia(video);
    } else video.src = url;
  } catch (error) {
    if (state.player !== session) return;
    body.replaceChildren(messageView('Não foi possível iniciar o vídeo', error.message, 'Voltar aos episódios', closePlayer, true));
    $('#player-status').textContent = 'Reprodução indisponível';
  }
}

function reportProgress(session, playbackState, keepalive = false) {
  if (!session.video || !session.ready) return Promise.resolve();
  const payload = {
    timeMs: Math.round(session.video.currentTime * 1000),
    durationMs: Number.isFinite(session.video.duration) ? Math.round(session.video.duration * 1000) : session.episode.durationMs,
    state: playbackState,
    ...(session.playback?.sessionId && { sessionId: session.playback.sessionId }),
  };
  // Capture the position before enqueueing so a delayed request never reports a later event's time.
  return session.enqueue(async () => {
    if (session.epoch !== state.connectionEpoch) return;
    try {
      const result = await api(`/api/episodes/${encodeURIComponent(session.episode.id)}/progress`, { method: 'POST', body: payload, keepalive, connectionId: session.connectionId });
      if (state.player === session && session.epoch === state.connectionEpoch) {
        applyEpisode(result.episode);
        $('#player-status').textContent = playbackState === 'stopped' ? 'Progresso salvo' : `Progresso salvo · ${formatTime(payload.timeMs)}`;
      }
      return result;
    } catch (error) {
      if (state.player === session) $('#player-status').textContent = 'Não foi possível salvar o progresso. Tente voltar novamente para reenviar.';
      throw error;
    }
  });
}

async function closePlayer() {
  const session = state.player;
  if (!session || session.closing) return;
  session.closing = true;
  clearInterval(session.timer);
  $('#close-player').disabled = true;
  session.video?.pause();
  try {
    await reportProgress(session, 'stopped');
    disposePlayer(session);
    state.player = null;
    await refreshVisible();
    const target = [...main.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === session.focus);
    target?.focus({ preventScroll: true });
  } catch (error) {
    if (error.status === 409) {
      disposePlayer(session);
      state.player = null;
      history.replaceState(null, '', '#/');
      bootstrap();
      notify(error.message);
    } else {
      notify('O vídeo está pausado. Tente voltar novamente para salvar seu progresso.');
      session.closing = false;
    }
  } finally { $('#close-player').disabled = false; }
}

function disposePlayer(session) {
  session.closing = true;
  clearInterval(session.timer);
  session.video?.pause();
  session.hls?.destroy();
  session.video?.removeAttribute('src');
  session.video?.load();
  $('#player-dialog').close();
  $('#player-body').replaceChildren();
}

function openConnection() {
  $('#connection-error').hidden = true;
  $('#plex-token').value = '';
  $('#connection-dialog').showModal();
}

$('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  main.focus({ preventScroll: true });
  main.scrollIntoView({ block: 'start' });
});
$('#library-nav').addEventListener('click', () => navigate({ libraryId: state.route.libraryId || state.libraries[0]?.id }));
$('.brand').addEventListener('click', event => { event.preventDefault(); navigate({ libraryId: state.route.libraryId || state.libraries[0]?.id }); });
$('#connection-nav').addEventListener('click', openConnection);
$('#connect-top').addEventListener('click', openConnection);
$('.close-connection').addEventListener('click', () => $('#connection-dialog').close());
$('#connection-dialog').addEventListener('close', () => { $('#plex-token').value = ''; });
$('#connection-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = $('#connect-submit');
  if (submit.disabled) return;
  submit.disabled = true;
  state.changingConnection = true;
  $('#connection-error').hidden = true;
  const body = { serverUrl: $('#server-url').value.trim(), token: $('#plex-token').value.trim() };
  $('#plex-token').value = '';
  try {
    await api('/api/connect', { method: 'POST', body });
    body.token = '';
    $('#connection-dialog').close();
    snapshots.clear();
    history.replaceState(null, '', '#/');
    await bootstrap();
    notify('Biblioteca conectada. Escolha uma série para começar.');
  } catch (error) {
    body.token = '';
    $('#connection-error').textContent = error.message;
    $('#connection-error').hidden = false;
  } finally { submit.disabled = false; state.changingConnection = false; }
});
$('#disconnect').addEventListener('click', async () => {
  $('#disconnect').disabled = true;
  state.changingConnection = true;
  try {
    await api('/api/disconnect', { method: 'POST', body: {} });
    $('#connection-dialog').close();
    snapshots.clear();
    history.replaceState(null, '', '#/');
    await bootstrap();
    notify('Demonstração ativada.');
  } catch (error) { notify(error.message); }
  finally { $('#disconnect').disabled = false; state.changingConnection = false; }
});
$('#close-player').addEventListener('click', closePlayer);
$('#player-dialog').addEventListener('cancel', event => { event.preventDefault(); closePlayer(); });
window.addEventListener('hashchange', async () => {
  saveView();
  if (state.player) await closePlayer();
  if (!state.player) loadRoute();
  else history.replaceState(null, '', currentHash);
});
window.addEventListener('focus', scheduleRefresh);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.player) reportProgress(state.player, state.player.video?.paused ? 'paused' : 'playing', true).catch(() => {});
  else scheduleRefresh();
});
window.addEventListener('pagehide', () => { if (state.player) reportProgress(state.player, 'stopped', true).catch(() => {}); });

document.addEventListener('keydown', event => {
  if ($('dialog[open]') || /^(INPUT|SELECT|TEXTAREA|VIDEO)$/.test(event.target.tagName)) return;
  if (event.key === 'Escape' && state.route.showId) { event.preventDefault(); navigate(parentRoute(state.route)); return; }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const controls = [...main.querySelectorAll('a.show-card, .episode-art')];
  if (!controls.includes(document.activeElement)) return;
  const rect = document.activeElement.getBoundingClientRect();
  const origin = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  const candidates = controls.filter(node => node !== document.activeElement).map(node => {
    const box = node.getBoundingClientRect();
    const x = box.x + box.width / 2 - origin.x, y = box.y + box.height / 2 - origin.y;
    return { node, forward: x * direction[0] + y * direction[1], perpendicular: Math.abs(x * direction[1] + y * direction[0]) };
  }).filter(item => item.forward > 5).sort((a, b) => a.forward + a.perpendicular * 3 - b.forward - b.perpendicular * 3);
  if (candidates[0]) { event.preventDefault(); candidates[0].node.focus(); }
});

bootstrap();
