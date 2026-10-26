import test from "node:test";
import assert from "node:assert/strict";
import { createPresenceTracker } from "../presence.mjs";
import { createApiServer } from "../server.mjs";

async function withPresenceServer(run, presenceTracker) {
  const server = createApiServer({
    civicStore: { close() {} },
    presenceTracker,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(origin);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("presence counts temporary anonymous browser sessions and expires idle sessions", async () => {
  let now = 1_000;
  const presenceTracker = createPresenceTracker({ now: () => now, ttlMs: 90_000 });

  await withPresenceServer(async (origin) => {
    const firstResponse = await fetch(`${origin}/api/civic/presence`, { method: "POST" });
    const firstCookie = firstResponse.headers.get("set-cookie");
    assert.match(firstCookie, /^civic_presence=[0-9a-f-]+;/);
    assert.match(firstCookie, /HttpOnly/);
    assert.match(firstCookie, /Max-Age=90/);
    assert.deepEqual(await firstResponse.json(), { activeNow: 1 });

    const firstSessionHeartbeat = await fetch(`${origin}/api/civic/presence`, {
      method: "POST",
      headers: { cookie: firstCookie.split(";")[0] },
    });
    assert.equal(firstSessionHeartbeat.headers.get("set-cookie"), null);
    assert.deepEqual(await firstSessionHeartbeat.json(), { activeNow: 1 });

    const secondResponse = await fetch(`${origin}/api/civic/presence`, { method: "POST" });
    assert.deepEqual(await secondResponse.json(), { activeNow: 2 });

    now += 90_001;
    const refreshedResponse = await fetch(`${origin}/api/civic/presence`, {
      method: "POST",
      headers: { cookie: firstCookie.split(";")[0] },
    });
    assert.deepEqual(await refreshedResponse.json(), { activeNow: 1 });
    assert.equal(presenceTracker.count(), 1);
  }, presenceTracker);
});
