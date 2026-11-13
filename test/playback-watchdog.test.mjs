import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackWatchdog } from '../public/playback-recovery.mjs';

test('a playing video that stops advancing is detected after the stall interval', () => {
  let clock = 0;
  const watchdog = createPlaybackWatchdog({ stallMs: 12000, now: () => clock });
  const video = { currentTime: 4, playing: true, paused: false, seeking: false, ended: false };
  assert.equal(watchdog.observe(video), false);
  clock = 11999;
  assert.equal(watchdog.observe(video), false);
  clock = 12000;
  assert.equal(watchdog.observe(video), true);
  clock = 12500;
  assert.equal(watchdog.observe(video), false);
  clock = 24000;
  assert.equal(watchdog.observe({ ...video, currentTime: 4.2 }), false);
  clock = 35000;
  assert.equal(watchdog.observe({ ...video, currentTime: 4.2 }), false);
});

test('paused, seeking, hidden, unloaded and ended videos do not trigger false recovery', () => {
  let clock = 0;
  const watchdog = createPlaybackWatchdog({ stallMs: 1000, now: () => clock });
  const video = { currentTime: 4, playing: true, paused: false, seeking: false, ended: false };
  for (const inactive of [{ paused: true }, { seeking: true }, { hidden: true }, { ready: false }, { ended: true }, { playing: false }]) {
    clock += 2000;
    assert.equal(watchdog.observe({ ...video, ...inactive }), false);
    clock += 900;
    assert.equal(watchdog.observe(video), false);
  }
  clock += 2000;
  watchdog.reset();
  assert.equal(watchdog.observe(video), false);
});
