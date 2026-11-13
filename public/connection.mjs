export function normalizeServerUrl(value) {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input || input.length > 2048 || /[\x00-\x20]/.test(input)) {
    throw new Error('Informe um endereço válido, como http://servidor:32400 ou servidor:32400.');
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input) && !/^https?:\/\//i.test(input)) {
    throw new Error('Use um endereço HTTP ou HTTPS para o servidor Plex.');
  }
  let url;
  try { url = new URL(/^https?:\/\//i.test(input) ? input : `http://${input}`); }
  catch { throw new Error('Informe um endereço válido, como http://servidor:32400 ou servidor:32400.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use o endereço HTTP ou HTTPS sem usuário ou senha na URL.');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Informe somente o endereço e a porta do servidor, sem páginas, parâmetros ou fragmentos.');
  }
  return url.origin;
}

export function requirePlexConnection(value, expectedId) {
  if (value?.mode !== 'plex' || typeof value.connectionId !== 'string' || !value.connectionId
    || expectedId !== undefined && value.connectionId !== expectedId) {
    throw new Error('Não foi possível confirmar a conexão com o Plex. Confira os dados e tente novamente.');
  }
  return value;
}
