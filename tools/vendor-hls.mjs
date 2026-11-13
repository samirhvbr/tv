import { copyFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// The runtime bundle is tracked so ordinary startup needs no npm packages.
const source = new URL('../node_modules/hls.js/dist/hls.min.js', import.meta.url);
const destination = new URL('../public/vendor/hls.min.js', import.meta.url);
const content = await readFile(source);
if (process.argv.includes('--check')) {
  const tracked = await readFile(destination);
  if (!content.equals(tracked)) throw new Error('The tracked HLS bundle differs from the pinned npm package.');
} else {
  await copyFile(source, destination);
}
console.log(`hls.js SHA-256 ${createHash('sha256').update(content).digest('hex')}`);
