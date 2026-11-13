import { test, expect } from '@playwright/test';
import { startPlexFixture } from './plex-fixture.mjs';

async function disconnect(request) {
  const config = await (await request.get('/api/config')).json();
  await request.post('/api/disconnect', { headers: { 'X-CSRF-Token': config.csrfToken }, data: {} });
}

async function openConnection(page, address, token) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Conectar Plex', exact: true }).click();
  await page.getByLabel('Endereço do servidor', { exact: true }).fill(address);
  await page.getByLabel('Token de acesso do Plex', { exact: true }).fill(token);
}

test('Tab and Enter after the token connect a bare host and port instead of activating demo mode', async ({ page, request }) => {
  const fixture = await startPlexFixture();
  const operations = [];
  page.on('request', value => {
    const path = new URL(value.url()).pathname;
    if (['/api/connect', '/api/disconnect'].includes(path)) operations.push(path);
  });
  try {
    await openConnection(page, fixture.url.replace(/^http:\/\//, ''), fixture.token);
    await expect(page.locator('#disconnect')).not.toBeVisible();
    await page.getByLabel('Token de acesso do Plex', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Conectar biblioteca', exact: false })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Plex de teste', { exact: true })).toBeVisible();
    await expect(page.locator('#connection-dialog')).not.toBeVisible();
    expect(operations).toEqual(['/api/connect']);
    expect((await (await request.get('/api/config')).json()).mode).toBe('plex');
    await page.getByRole('button', { name: 'Gerenciar conexão', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Desconectar Plex', exact: true })).toBeVisible();
  } finally {
    await disconnect(request);
    fixture.close();
  }
});

test('a rejected token keeps the connection error visible and the server in demo mode', async ({ page, request }) => {
  const fixture = await startPlexFixture();
  try {
    await openConnection(page, fixture.url, 'rejected-synthetic-token');
    await page.getByRole('button', { name: 'Conectar biblioteca', exact: false }).click();
    await expect(page.locator('#connection-error')).toBeVisible();
    await expect(page.locator('#connection-error')).toContainText('token');
    await expect(page.locator('#connection-dialog')).toBeVisible();
    await expect(page.locator('#plex-token')).toHaveValue('');
    expect((await (await request.get('/api/config')).json()).mode).toBe('demo');
    await expect(page.locator('#toast')).not.toContainText('Biblioteca conectada');
  } finally {
    await disconnect(request);
    fixture.close();
  }
});

test('an invalid address is explained inline before sending credentials', async ({ page }) => {
  let posted = false;
  page.on('request', value => { if (value.url().endsWith('/api/connect')) posted = true; });
  await openConnection(page, 'this is not a server', 'synthetic-input');
  await page.getByRole('button', { name: 'Conectar biblioteca', exact: false }).click();
  await expect(page.locator('#connection-error')).toBeVisible();
  await expect(page.locator('#connection-error')).toContainText('endereço');
  await expect(page.locator('#connection-dialog')).toBeVisible();
  expect(posted).toBeFalsy();
});

test('HTTP 200 with demo mode is not presented as a successful Plex connection', async ({ page, request }) => {
  await page.route('**/api/connect', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'demo', connectionId: 'fixture-demo' }),
  }));
  await openConnection(page, 'http://192.0.2.10:32400', 'synthetic-input');
  await page.getByRole('button', { name: 'Conectar biblioteca', exact: false }).click();
  await expect(page.locator('#connection-error')).toBeVisible();
  await expect(page.locator('#connection-error')).toContainText('confirmar');
  await expect(page.locator('#connection-dialog')).toBeVisible();
  await expect(page.locator('#toast')).not.toContainText('Biblioteca conectada');
  expect((await (await request.get('/api/config')).json()).mode).toBe('demo');
});

test('a claimed Plex connection is checked against the current gateway configuration', async ({ page }) => {
  await page.route('**/api/connect', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'plex', connectionId: 'fixture-connection' }),
  }));
  await openConnection(page, 'http://192.0.2.10:32400', 'synthetic-input');
  await page.getByRole('button', { name: 'Conectar biblioteca', exact: false }).click();
  await expect(page.locator('#connection-error')).toBeVisible();
  await expect(page.locator('#connection-error')).toContainText('confirmar');
  await expect(page.locator('#connection-dialog')).toBeVisible();
  await expect(page.getByText('Modo demonstração', { exact: true })).toBeVisible();
  await expect(page.locator('#toast')).not.toContainText('Biblioteca conectada');
});

test('a different connection identity cannot confirm the submitted Plex connection', async ({ page }) => {
  await page.route('**/api/connect', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'plex', connectionId: 'fixture-submitted' }),
  }));
  await openConnection(page, 'http://192.0.2.10:32400', 'synthetic-input');
  await page.route('**/api/config', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'plex', connectionId: 'fixture-replaced' }),
  }));
  await page.getByRole('button', { name: 'Conectar biblioteca', exact: false }).click();
  await expect(page.locator('#connection-error')).toBeVisible();
  await expect(page.locator('#connection-error')).toContainText('confirmar');
  await expect(page.locator('#connection-dialog')).toBeVisible();
  await expect(page.locator('#toast')).not.toContainText('Biblioteca conectada');
});
