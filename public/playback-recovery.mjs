// A paused, seeking, hidden, or finished player is not a stalled player.
export function createPlaybackWatchdog({ stallMs = 12000, now = () => performance.now() } = {}) {
  let lastTime = null;
  let lastProgressAt = now();
  return {
    reset() { lastTime = null; lastProgressAt = now(); },
    observe({ currentTime, playing, paused, seeking, ended, ready = true, hidden = false }) {
      const timestamp = now();
      if (!ready || !playing || paused || seeking || ended || hidden) {
        lastTime = currentTime;
        lastProgressAt = timestamp;
        return false;
      }
      if (lastTime === null || Math.abs(currentTime - lastTime) >= 0.05) {
        lastTime = currentTime;
        lastProgressAt = timestamp;
        return false;
      }
      if (timestamp - lastProgressAt < stallMs) return false;
      lastProgressAt = timestamp;
      return true;
    },
  };
}
