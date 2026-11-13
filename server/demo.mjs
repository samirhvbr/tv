import { AppError } from './plex.mjs';

export class DemoAdapter {
  constructor() {
    this.serverName = 'Biblioteca de demonstração';
    this.showsData = [
      { id: '100', title: 'Tulsa King', year: 2022, summary: 'Uma biblioteca de exemplo para explorar temporadas, episódios e progresso. Os títulos e o vídeo curto são demonstrativos.', seasonCount: 3 },
      { id: '200', title: 'Horizontes', year: 2025, summary: 'Lugares distantes, histórias próximas. Uma série fictícia para testar sua biblioteca.', seasonCount: 2 },
      { id: '300', title: 'Entre Estações', year: 2024, summary: 'Uma viagem pelas pequenas mudanças do cotidiano. Conteúdo fictício de demonstração.', seasonCount: 1 },
    ];
    this.seasonsData = []; this.episodesData = new Map();
    for (const show of this.showsData) for (let s = 1; s <= show.seasonCount; s++) {
      const season = { id: String(Number(show.id) + s), showId: show.id, title: `Temporada ${s}`, number: s, episodeCount: 6, watchedCount: 0 };
      this.seasonsData.push(season);
      for (let e = 1; e <= 6; e++) {
        const id = String(Number(season.id) * 10 + e);
        this.episodesData.set(id, { id, showId: show.id, seasonId: season.id, title: ['Um novo começo', 'Ponto de partida', 'Caminhos cruzados', 'Perto de casa', 'Tempo de escolher', 'O próximo capítulo'][e - 1], seasonNumber: s, episodeNumber: e, summary: 'Episódio demonstrativo. Reproduza o vídeo curto para experimentar pausa, retomada e progresso sem recarregar a página.', durationMs: 18000, viewOffsetMs: show.id === '100' && s === 1 && e === 3 ? 7000 : 0, watched: show.id === '100' && s === 1 && e <= 2 });
      }
    }
  }
  libraries() { return { items: [{ id: '1', title: 'Séries', type: 'show' }] }; }
  count(show) {
    const episodes = [...this.episodesData.values()].filter(x => x.showId === show.id);
    return { ...show, episodeCount: episodes.length, watchedCount: episodes.filter(x => x.watched).length };
  }
  shows(id) { if (id !== '1') throw new AppError(404, 'Biblioteca não encontrada.'); return { items: this.showsData.map(x => this.count(x)) }; }
  seasons(id) {
    const show = this.showsData.find(x => x.id === id); if (!show) throw new AppError(404, 'Série não encontrada.');
    return { show: this.count(show), items: this.seasonsData.filter(x => x.showId === id).map(x => ({ ...x, watchedCount: [...this.episodesData.values()].filter(e => e.seasonId === x.id && e.watched).length })) };
  }
  episodes(id) {
    const season = this.seasonsData.find(x => x.id === id); if (!season) throw new AppError(404, 'Temporada não encontrada.');
    return { show: this.count(this.showsData.find(x => x.id === season.showId)), season: this.seasons(season.showId).items.find(x => x.id === id), items: [...this.episodesData.values()].filter(x => x.seasonId === id).map(x => ({ ...x })) };
  }
  getEpisode(id) { const item = this.episodesData.get(id); if (!item) throw new AppError(404, 'Episódio não encontrado.'); return { ...item }; }
  progress(id, progress) {
    const item = this.getEpisode(id);
    item.viewOffsetMs = Math.min(progress.timeMs, item.durationMs);
    if (item.viewOffsetMs >= item.durationMs * 0.9) item.watched = true;
    this.episodesData.set(id, item); return { ...item };
  }
  watched(id, watched) { const item = { ...this.getEpisode(id), watched, ...(!watched ? { viewOffsetMs: 0 } : {}) }; this.episodesData.set(id, item); return { ...item }; }
  playback(id) { const episode = this.getEpisode(id); return { url: '/demo-sample.mp4', mimeType: 'video/mp4', durationMs: episode.durationMs, viewOffsetMs: episode.viewOffsetMs, mode: 'direct' }; }
  poll() { return []; }
  close() {}
}
