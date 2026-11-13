import { createApp } from './app.mjs';

const port = Number(process.env.PORT || 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exitCode = 1;
} else {
  try {
    const server = await createApp();
    server.on('error', () => { console.error('The local server could not start. Check whether its port is available.'); process.exitCode = 1; server.shutdown(); });
    server.listen(port, '127.0.0.1', () => console.log(`TV prototype: http://127.0.0.1:${port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.shutdown());
  } catch {
    console.error('The prototype could not start. Check PLEX_SERVER_URL and PLEX_TOKEN, or remove both to use demo mode.');
    process.exitCode = 1;
  }
}
