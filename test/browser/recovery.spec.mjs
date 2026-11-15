import { test, expect } from '@playwright/test';
import { startPlexFixture } from './plex-fixture.mjs';
import { readFile, readdir } from 'node:fs/promises';

async function connect(request, fixture) {
  const config = await (await request.get('/api/config')).json();
  const response = await request.post('/api/connect', {
    headers: { 'X-CSRF-Token': config.csrfToken }, data: { serverUrl: fixture.url, token: fixture.token },
  });
  expect(response.ok()).toBeTruthy();
}

async function disconnect(request) {
  const config = await (await request.get('/api/config')).json();
  await request.post('/api/disconnect', { headers: { 'X-CSRF-Token': config.csrfToken }, data: {} });
}

test('failed media has bounded recovery and manual retry resumes without replacing the document', async ({ page, request }) => {
  const fixture = await startPlexFixture({ mediaAvailable: false });
  fixture.data['9011'].viewOffset = 6000;
  const descriptors = [];
  const releases = [];
  page.on('request', value => {
    if (value.url().endsWith('/api/episodes/9011/playback')) descriptors.push(value.url());
    if (value.url().endsWith('/api/episodes/9011/release')) releases.push(value.postDataJSON());
  });
  try {
    await connect(request, fixture);
    await page.goto('/#/library/1/show/900/season/901');
    const documentTime = await page.evaluate(() => performance.timeOrigin);
    const route = page.url();
    const card = page.locator('[data-item-id="9011"]');
    await card.getByRole('button', { name: 'Assistir episódio 1:', exact: false }).click();
    // The fixture really rejects the proxied media request; no synthetic DOM error event is dispatched.
    await expect.poll(() => fixture.playback.requests).toBeGreaterThan(0);
    await expect.poll(() => descriptors.length, { timeout: 15000 }).toBe(3);
    const retry = page.getByRole('button', { name: 'Retomar reprodução', exact: true });
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    expect(fixture.reports.every(report => Number(report.time) >= 6000)).toBeTruthy();
    fixture.playback.available = true;
    await retry.click();
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(node => node.readyState), { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThanOrEqual(5.9);
    await video.evaluate(node => node.pause());
    expect(descriptors).toHaveLength(4);
    expect(releases.length).toBeGreaterThanOrEqual(3);
    expect(releases.every(body => typeof body.sessionId === 'string')).toBeTruthy();
    expect(page.url()).toBe(route);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTime);
    await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
    await expect(page.locator('#player-dialog')).not.toBeVisible();
    expect(fixture.data['9011'].viewOffset).toBeGreaterThanOrEqual(5900);
    await expect(card.locator('.episode-status')).toContainText('continuar de 0:06');
    expect(fixture.reports.filter(report => report.state === 'stopped')).toHaveLength(1);
  } finally {
    await disconnect(request);
    fixture.close();
  }
});

test('changing the connection during media recovery disposes the old player without writing to the new server', async ({ page, request }) => {
  const first = await startPlexFixture({ mediaAvailable: false });
  const second = await startPlexFixture();
  first.data['9011'].viewOffset = 7000;
  try {
    await connect(request, first);
    await page.goto('/#/library/1/show/900/season/901');
    const documentTime = await page.evaluate(() => performance.timeOrigin);
    await page.locator('[data-item-id="9011"]').getByRole('button', { name: 'Assistir episódio 1:', exact: false }).click();
    await expect.poll(() => first.playback.requests).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Retomar reprodução', exact: true })).toBeVisible();
    await connect(request, second);
    await expect(page.locator('#player-dialog')).not.toBeVisible();
    await expect(page.locator('[data-focus-key="show-900"]')).toBeVisible();
    expect(second.reports).toEqual([]);
    expect(second.data['9011'].viewOffset).toBe(0);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTime);
  } finally {
    await disconnect(request);
    first.close();
    second.close();
  }
});

test('a malformed proxied HLS playlist can recover into decoded video at its saved position', async ({ page, request }) => {
  const directory = new URL('../fixtures/hls/', import.meta.url);
  const hlsFiles = Object.fromEntries(await Promise.all((await readdir(directory)).map(async name => [name, await readFile(new URL(name, directory))])));
  const fixture = await startPlexFixture({ hlsFiles });
  fixture.data['9012'].viewOffset = 4000;
  fixture.playback.invalidManifest = true;
  let descriptors = 0;
  page.on('request', value => { if (value.url().endsWith('/api/episodes/9012/playback')) descriptors++; });
  try {
    await connect(request, fixture);
    await page.goto('/#/library/1/show/900/season/901');
    const documentTime = await page.evaluate(() => performance.timeOrigin);
    await page.locator('[data-item-id="9012"]').getByRole('button', { name: 'Assistir episódio 2:', exact: false }).click();
    await expect.poll(() => descriptors, { timeout: 15000 }).toBe(3);
    const retry = page.getByRole('button', { name: 'Retomar reprodução', exact: true });
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    fixture.playback.invalidManifest = false;
    await retry.click();
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(node => node.readyState), { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThanOrEqual(3.9);
    await video.evaluate(node => node.pause());
    expect(descriptors).toBe(4);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTime);
    await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
    await expect(page.locator('#player-dialog')).not.toBeVisible();
    expect(fixture.data['9012'].viewOffset).toBeGreaterThanOrEqual(3900);
    expect(fixture.reports.every(report => Number(report.time) >= 4000)).toBeTruthy();
  } finally {
    await disconnect(request);
    fixture.close();
  }
});

test('an interrupted MP4 stream recovers its latest playing position after buffering stalls', async ({ page, request }) => {
  test.setTimeout(45000);
  const fixture = await startPlexFixture();
  fixture.playback.holdAfterBytes = Math.floor(fixture.playback.mediaLength * 0.25);
  let descriptors = 0;
  page.on('request', value => { if (value.url().endsWith('/api/episodes/9011/playback')) descriptors++; });
  try {
    await connect(request, fixture);
    await page.goto('/#/library/1/show/900/season/901');
    const documentTime = await page.evaluate(() => performance.timeOrigin);
    await page.locator('[data-item-id="9011"]').getByRole('button', { name: 'Assistir episódio 1:', exact: false }).click();
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(2);
    await video.evaluate(node => { node.currentTime = 1; return node.play(); });
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThanOrEqual(1);
    fixture.playback.available = false;
    fixture.playback.interrupt();
    await expect.poll(() => descriptors, { timeout: 25000 }).toBe(3);
    const retry = page.getByRole('button', { name: 'Retomar reprodução', exact: true });
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    const savedWhileRecovering = fixture.data['9011'].viewOffset;
    expect(savedWhileRecovering).toBeGreaterThanOrEqual(1000);
    fixture.playback.holdAfterBytes = 0;
    fixture.playback.available = true;
    await retry.click();
    await expect.poll(() => video.evaluate(node => node.readyState), { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => video.evaluate(node => node.currentTime * 1000)).toBeGreaterThanOrEqual(savedWhileRecovering - 100);
    await expect.poll(() => video.evaluate(node => node.paused)).toBeFalsy();
    await video.evaluate(node => node.pause());
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTime);
    await page.getByRole('button', { name: 'Voltar aos episódios', exact: true }).click();
    await expect(page.locator('#player-dialog')).not.toBeVisible();
    expect(fixture.data['9011'].viewOffset).toBeGreaterThanOrEqual(savedWhileRecovering - 100);
    expect(fixture.data['9011'].viewOffset).toBeLessThan(savedWhileRecovering + 1500);
  } finally {
    await disconnect(request);
    fixture.close();
  }
});
