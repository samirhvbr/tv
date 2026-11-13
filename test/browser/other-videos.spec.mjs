import { test, expect } from '@playwright/test';
import { startPlexFixture } from './plex-fixture.mjs';

async function connect(request, fixture) {
  const config = await (await request.get('/api/config')).json();
  const response = await request.post('/api/connect', {
    headers: { 'X-CSRF-Token': config.csrfToken },
    data: { serverUrl: fixture.url, token: fixture.token },
  });
  expect(response.ok()).toBeTruthy();
}

async function disconnect(request) {
  const config = await (await request.get('/api/config')).json();
  await request.post('/api/disconnect', { headers: { 'X-CSRF-Token': config.csrfToken }, data: {} });
}

test('Other Videos release folders expose seasons while writes retain the original Plex IDs', async ({ page, context, request }) => {
  const fixture = await startPlexFixture({ otherVideos: true });
  let other;
  try {
    await connect(request, fixture);
    await page.goto('/#/library/9');
    const documentTime = await page.evaluate(() => performance.timeOrigin);
    await expect(page.locator('.show-card')).toHaveCount(1);
    await page.locator('.show-card').click();
    await expect(page.locator('.season-card')).toHaveCount(3);
    const seasonLinks = await page.locator('.season-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    expect(new Set(seasonLinks).size).toBe(3);
    await page.locator('.season-card').nth(1).click();
    await expect(page.locator('.episode-card')).toHaveCount(2);
    await expect(page.getByRole('navigation', { name: 'Você está aqui' })).toContainText('Temporada 2');
    const deepLink = page.url();
    const episode = page.locator('[data-item-id="7201"]');
    await episode.getByRole('button', { name: 'Assistir episódio 1:', exact: false }).click();
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(1);
    await video.evaluate(node => { node.pause(); node.currentTime = 5.5; });
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThanOrEqual(5.4);
    await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
    await expect(page.locator('#player-dialog')).not.toBeVisible();
    await expect(episode.locator('.episode-status')).toContainText('continuar de 0:05');
    expect(fixture.data['7201'].viewOffset).toBeGreaterThanOrEqual(5400);
    expect(fixture.reports.some(report => report.ratingKey === '7201' && report.state === 'stopped')).toBeTruthy();
    expect(fixture.reports.every(report => /^\d+$/.test(report.ratingKey))).toBeTruthy();

    await episode.getByRole('button', { name: 'Marcar como assistido:', exact: false }).click();
    await expect(episode.locator('.episode-status')).toHaveText('Assistido');
    expect(fixture.watchActions).toContainEqual({ id: '7201', watched: true });
    await page.getByRole('button', { name: 'Ver temporadas', exact: true }).click();
    await expect(page.locator('.season-card')).toHaveCount(3);
    await page.goBack();
    await expect(episode.locator('.episode-status')).toHaveText('Assistido');
    expect(page.url()).toBe(deepLink);
    await page.goForward();
    await expect(page.locator('.season-card')).toHaveCount(3);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTime);

    other = await context.newPage();
    await other.goto(deepLink);
    await expect(other.locator('[data-item-id="7201"] .episode-status')).toHaveText('Assistido');
    const otherTime = await other.evaluate(() => performance.timeOrigin);
    const external = other.locator('[data-item-id="7202"] .episode-status');
    await expect(external).toHaveText('Não assistido');
    // Mutating the fake upstream models another Plex client; no local write or focus event causes this refresh.
    fixture.data['7202'].viewOffset = 17000;
    fixture.data['7202'].viewCount = 1;
    await expect(external).toHaveText('Assistido', { timeout: 15000 });
    expect(other.url()).toBe(deepLink);
    expect(await other.evaluate(() => performance.timeOrigin)).toBe(otherTime);
    await other.getByRole('button', { name: 'Ver temporadas', exact: true }).click();
    await expect(other.locator('.season-card')).toHaveCount(3);
  } finally {
    await other?.close();
    await disconnect(request);
    fixture.close();
  }
});
