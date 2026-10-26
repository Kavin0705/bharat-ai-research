const defaultTtlMs = 90_000;

export function createPresenceTracker({ now = Date.now, ttlMs = defaultTtlMs } = {}) {
  const sessions = new Map();

  function pruneExpiredSessions() {
    const cutoff = now() - ttlMs;
    for (const [sessionId, lastSeen] of sessions) {
      if (lastSeen <= cutoff) sessions.delete(sessionId);
    }
  }

  return {
    heartbeat(sessionId) {
      pruneExpiredSessions();
      sessions.set(sessionId, now());
      return sessions.size;
    },
    count() {
      pruneExpiredSessions();
      return sessions.size;
    },
  };
}
