import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeHash, parentRoute, filterItems, progressPercent, createSerialQueue } from '../public/model.mjs';

test('a shared season URL preserves its library and show ancestors', () => {
  const route = { libraryId: 'library 1', showId: '42', seasonId: 'season/3' };
  assert.deepEqual(parseRoute(routeHash(route)), route);
  const show = parentRoute(route);
  assert.deepEqual(show, { libraryId: 'library 1', showId: '42' });
  assert.deepEqual(parentRoute(show), { libraryId: 'library 1' });
});

test('malformed or unrelated routes recover instead of opening an incorrect item', () => {
  for (const hash of ['#/show/42', '#/library/1/show', '#/library/1/show/2/nope/3', '#/library/%ZZ']) assert.equal(parseRoute(hash), null);
  assert.deepEqual(parseRoute('#/'), {});
});

test('progress filtering distinguishes partial, complete, and unplayed episodes', () => {
  const episodes = [
    { title: 'A decisão', watched: false, viewOffsetMs: 0, durationMs: 1000 },
    { title: 'O retorno', watched: false, viewOffsetMs: 400, durationMs: 1000 },
    { title: 'O último dia', watched: true, viewOffsetMs: 0, durationMs: 1000 },
  ];
  assert.deepEqual(filterItems(episodes, 'decisao'), [episodes[0]]);
  assert.deepEqual(filterItems(episodes, '', 'started'), [episodes[1]]);
  assert.deepEqual(filterItems(episodes, '', 'unwatched'), episodes.slice(0, 2));
  assert.deepEqual(filterItems(episodes, '', 'watched'), [episodes[2]]);
  assert.equal(progressPercent(episodes[1]), 40);
  assert.equal(progressPercent(episodes[2]), 100);
});

test('a final playback report waits for an in-flight write and survives its failure', async () => {
  const enqueue = createSerialQueue();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const calls = [];
  const first = enqueue(async () => { calls.push('playing'); await blocked; throw new Error('offline'); });
  const stopped = enqueue(async () => { calls.push('stopped'); return 'saved'; });
  await Promise.resolve();
  assert.deepEqual(calls, ['playing']);
  release();
  await assert.rejects(first, /offline/);
  assert.equal(await stopped, 'saved');
  assert.deepEqual(calls, ['playing', 'stopped']);
});
