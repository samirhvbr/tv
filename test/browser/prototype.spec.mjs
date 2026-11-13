import { test, expect } from '@playwright/test';
import { startPlexFixture } from './plex-fixture.mjs';
import { readFile, readdir } from 'node:fs/promises';

const seasonURL = '/#/library/1/show/100/season/101';

async function setWatched(request, id, watched) {
  const config = await (await request.get('/api/config')).json();
  const result = await request.post(`/api/episodes/${id}/watched`, {
    headers: { 'X-CSRF-Token': config.csrfToken, 'X-Connection-Id': config.connectionId || '' },
    data: { watched },
  });
  expect(result.ok()).toBeTruthy();
}

test('series, seasons and explicit parent navigation preserve the document', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.documentInstance = crypto.randomUUID(); });
  await page.goto('/');
  await expect(page.getByText('Modo demonstração', { exact: true })).toBeVisible();
  const documentInstance = await page.evaluate(() => window.documentInstance);
  await page.locator('[data-focus-key="show-100"]').click();
  await expect(page.getByRole('heading', { name: 'Temporadas', exact: true })).toBeVisible();
  await expect(page.locator('.season-card')).toHaveCount(3);
  await page.locator('[data-focus-key="season-101"]').click();
  await expect(page.getByRole('navigation', { name: 'Você está aqui' })).toContainText('SériesTulsa KingTemporada 1');
  await expect(page.locator('.episode-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Ver temporadas', exact: true }).click();
  await expect(page.locator('.season-card')).toHaveCount(3);
  await page.locator('[data-focus-key="season-102"]').click();
  await expect(page.getByRole('navigation', { name: 'Você está aqui' })).toContainText('Temporada 2');
  await page.goBack();
  await expect(page.locator('.season-card')).toHaveCount(3);
  await page.goForward();
  await expect(page.locator('.episode-card')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(page.locator('.season-card')).toHaveCount(3);
  expect(await page.evaluate(() => window.documentInstance)).toBe(documentInstance);
  expect(errors).toEqual([]);
});

test('deep links retain parent navigation and search/filter work', async ({ page, request }) => {
  await setWatched(request, '1014', false);
  await page.goto(seasonURL);
  await expect(page.getByRole('button', { name: 'Ver temporadas', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar episódio', exact: true }).fill('escolher');
  await expect(page.locator('.episode-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Buscar episódio', exact: true }).fill('');
  await page.getByLabel('Filtrar por progresso').selectOption('watched');
  await expect(page.locator('.episode-card')).toHaveCount(2);
  await page.getByLabel('Filtrar por progresso').selectOption('all');
  await page.getByRole('navigation', { name: 'Você está aqui' }).getByRole('link', { name: 'Tulsa King', exact: true }).click();
  await expect(page.locator('.season-card')).toHaveCount(3);
});

test('keyboard skip link keeps the current route and playback restores focus and scroll', async ({ page }) => {
  await page.goto(seasonURL);
  await expect(page.locator('.episode-card')).toHaveCount(6);
  const currentURL = page.url();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  expect(page.url()).toBe(currentURL);
  const play = page.locator('[data-item-id="1016"]').getByRole('button', { name: 'Assistir episódio 6:', exact: false });
  await play.scrollIntoViewIfNeeded();
  await play.focus();
  const scroll = await page.evaluate(() => scrollY);
  await play.click();
  await expect.poll(() => page.locator('video').evaluate(node => node.readyState)).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
  await expect(page.locator('#player-dialog')).not.toBeVisible();
  await expect(play).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThan(5);
});

test('watch state updates in another open tab without reload', async ({ page, context, request }) => {
  await setWatched(request, '1015', false);
  await page.goto(seasonURL);
  const other = await context.newPage();
  await other.goto(seasonURL);
  const card = page.locator('[data-item-id="1015"]');
  const otherCard = other.locator('[data-item-id="1015"]');
  await expect(card.locator('.episode-status')).toHaveText('Não assistido');
  const originalTime = await other.evaluate(() => performance.timeOrigin);
  await card.getByRole('button', { name: 'Marcar como assistido:', exact: false }).click();
  await expect(card.locator('.episode-status')).toHaveText('Assistido');
  await expect(otherCard.locator('.episode-status')).toHaveText('Assistido');
  expect(await other.evaluate(() => performance.timeOrigin)).toBe(originalTime);
  await other.close();
  await setWatched(request, '1015', false);
});

test('actual video playback saves the final seek and resumes without a document reload', async ({ page, request }) => {
  await setWatched(request, '1014', false);
  await page.goto(seasonURL);
  const originalTime = await page.evaluate(() => performance.timeOrigin);
  const card = page.locator('[data-item-id="1014"]');
  await card.getByRole('button', { name: 'Assistir episódio 4:', exact: false }).click();
  const video = page.locator('video');
  await expect.poll(() => video.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(1);
  await video.evaluate(node => { node.pause(); node.currentTime = 5.5; });
  await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThanOrEqual(5.4);
  await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Perto de casa', exact: true })).not.toBeVisible();
  await expect(card.locator('.episode-status')).toContainText('continuar de 0:05');
  const saved = await (await request.get('/api/episodes/1014')).json();
  expect(saved.episode.viewOffsetMs).toBeGreaterThanOrEqual(5400);
  expect(saved.episode.viewOffsetMs).toBeLessThan(6500);
  await page.getByRole('button', { name: 'Ver temporadas', exact: true }).click();
  await page.locator('[data-focus-key="season-101"]').click();
  await expect(page.locator('[data-item-id="1014"] .episode-status')).toContainText('continuar de 0:05');
  await page.locator('[data-item-id="1014"]').getByRole('button', { name: 'Assistir episódio 4:', exact: false }).click();
  await expect.poll(() => page.locator('video').evaluate(node => node.currentTime)).toBeGreaterThanOrEqual(5.4);
  await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(originalTime);
  await setWatched(request, '1014', false);
});

test('mobile layout keeps breadcrumb, parent action and player controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(seasonURL);
  await expect(page.getByRole('button', { name: 'Ver temporadas', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Ver temporadas', exact: true }).click();
  await expect(page.locator('.season-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Conectar Plex', exact: true }).click();
  await expect(page.getByLabel('Token de acesso do Plex', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar conexão', exact: true }).click();
});

test('a failed final save stays retryable instead of silently losing progress', async ({ page, request }) => {
  await setWatched(request, '1016', false);
  await page.goto(seasonURL);
  await page.locator('[data-item-id="1016"]').getByRole('button', { name: 'Assistir episódio 6:', exact: false }).click();
  const video = page.locator('video');
  await expect.poll(() => video.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(1);
  await video.evaluate(node => { node.pause(); node.currentTime = 4; });
  let failed = false;
  await page.route('**/api/episodes/1016/progress', async route => {
    if (!failed && route.request().postDataJSON()?.state === 'stopped') {
      failed = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
  await expect(page.locator('#player-dialog')).toBeVisible();
  await expect(page.locator('#player-status')).toContainText('Não foi possível salvar');
  await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
  await expect(page.locator('#player-dialog')).not.toBeVisible();
  await expect(page.locator('[data-item-id="1016"] .episode-status')).toContainText('continuar de 0:04');
  await setWatched(request, '1016', false);
});

test('connection form uses the Plex adapter for real video and repeated final stop', async ({ page, request }) => {
  const fixture = await startPlexFixture();
  const outgoing = [];
  page.on('request', value => outgoing.push(value.url()));
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Conectar Plex', exact: true }).click();
    await page.getByLabel('Endereço do servidor', { exact: true }).fill(fixture.url);
    await page.getByLabel('Token de acesso do Plex', { exact: true }).fill(fixture.token);
    await page.getByRole('button', { name: 'Conectar biblioteca', exact: false }).click();
    await expect(page.getByText('Plex de teste', { exact: true })).toBeVisible();
    await expect(page.locator('#plex-token')).toHaveValue('');
    await page.locator('[data-focus-key="show-900"]').click();
    await expect(page.locator('.season-card')).toHaveCount(2);
    await page.locator('[data-focus-key="season-901"]').click();
    const card = page.locator('[data-item-id="9011"]');
    await card.getByRole('button', { name: 'Assistir episódio 1:', exact: false }).click();
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(1);
    await video.evaluate(node => { node.pause(); node.currentTime = 6; });
    await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
    await expect(page.locator('#player-dialog')).not.toBeVisible();
    await expect(card.locator('.episode-status')).toContainText('continuar de 0:06');
    expect(fixture.data['9011'].viewOffset).toBeGreaterThanOrEqual(5900);
    await card.getByRole('button', { name: 'Assistir episódio 1:', exact: false }).click();
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThanOrEqual(5.9);
    await video.evaluate(node => { node.currentTime = 17.7; return node.play(); });
    await expect.poll(() => fixture.reports.some(value => value.state === 'stopped' && Number(value.time) >= 17700)).toBeTruthy();
    await expect(page.locator('#player-dialog')).not.toBeVisible();
    await expect(card.locator('.episode-status')).toHaveText('Assistido');
    expect(fixture.reports.some(value => value.ratingKey === '9011')).toBeTruthy();
    expect(outgoing.some(url => url.includes(fixture.token))).toBeFalsy();
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(fixture.token);
  } finally {
    const config = await (await request.get('/api/config')).json();
    await request.post('/api/disconnect', { headers: { 'X-CSRF-Token': config.csrfToken }, data: {} });
    fixture.close();
  }
});

test('Chrome decodes proxied HLS segments and saves progress through the Plex adapter', async ({ page, request }) => {
  const directory = new URL('../fixtures/hls/', import.meta.url);
  const hlsFiles = Object.fromEntries(await Promise.all((await readdir(directory)).map(async name => [name, await readFile(new URL(name, directory))])));
  const fixture = await startPlexFixture({ hlsFiles });
  try {
    const config = await (await request.get('/api/config')).json();
    const connected = await request.post('/api/connect', { headers: { 'X-CSRF-Token': config.csrfToken }, data: { serverUrl: fixture.url, token: fixture.token } });
    expect(connected.ok()).toBeTruthy();
    await page.goto('/#/library/1/show/900/season/901');
    await page.locator('[data-item-id="9012"]').getByRole('button', { name: 'Assistir episódio 2:', exact: false }).click();
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(node => node.readyState), { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    await video.evaluate(node => { node.pause(); node.currentTime = 4; });
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThanOrEqual(3.9);
    await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
    await expect(page.locator('#player-dialog')).not.toBeVisible();
    await expect(page.locator('[data-item-id="9012"] .episode-status')).toContainText('continuar de 0:04');
    expect(fixture.data['9012'].viewOffset).toBeGreaterThanOrEqual(3900);
  } finally {
    const config = await (await request.get('/api/config')).json();
    await request.post('/api/disconnect', { headers: { 'X-CSRF-Token': config.csrfToken }, data: {} });
    fixture.close();
  }
});
