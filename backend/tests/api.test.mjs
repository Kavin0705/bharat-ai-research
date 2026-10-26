import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCivicStore } from "../civic-store.mjs";
import { createApiServer } from "../server.mjs";

async function withServer(run, locationService = {
  countries: async () => ["India"],
  states: async () => ["Karnataka"],
  districts: async () => ["Mysuru", "Bengaluru Urban"],
  places: async () => ["Mysuru", "Bengaluru"],
  pincode: async () => [{ locality: "Devanahalli", district: "Bengaluru Rural", state: "Karnataka", pincode: "562110" }],
}) {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bharat-civic-test-"));
  const server = createApiServer({ civicStore: createCivicStore(join(dataDirectory, "civic.json")), locationService });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(origin);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(dataDirectory, { recursive: true, force: true });
  }
}

test("India-only location routes return state, district, and locality data from injected providers", async () => {
  const requested = [];
  const locationService = {
    async countries() {
      requested.push("countries");
      return ["India"];
    },
    async states(country) {
      requested.push(`states:${country}`);
      return ["Karnataka"];
    },
    async districts(state) {
      requested.push(`districts:${state}`);
      return ["Mysuru", "Bengaluru Urban"];
    },
    async places(country, state) {
      requested.push(`places:${country}:${state}`);
      return ["Mysuru"];
    },
    async pincode(value) {
      requested.push(`pincode:${value}`);
      return [{ locality: "Devanahalli", district: "Bengaluru Rural", state: "Karnataka", pincode: value }];
    },
  };
  await withServer(async (origin) => {
    const countries = await fetch(`${origin}/api/civic/locations/countries`).then((response) => response.json());
    const states = await fetch(`${origin}/api/civic/locations/states?country=India`).then((response) => response.json());
    const url = new URL(`${origin}/api/civic/locations/places`);
    url.searchParams.set("country", "India");
    url.searchParams.set("state", "Karnataka");
    const places = await fetch(url).then((response) => response.json());

    assert.deepEqual(countries.countries, ["India"]);
    assert.deepEqual(states.states, ["Karnataka"]);
    const districts = await fetch(`${origin}/api/civic/locations/districts?state=Karnataka`).then((response) => response.json());
    const pincode = await fetch(`${origin}/api/civic/locations/pincode?pincode=562110`).then((response) => response.json());
    assert.deepEqual(places.places, ["Mysuru"]);
    assert.deepEqual(districts.districts, ["Mysuru", "Bengaluru Urban"]);
    assert.deepEqual(pincode.offices, [{ locality: "Devanahalli", district: "Bengaluru Rural", state: "Karnataka", pincode: "562110" }]);
    assert.match(places.note, /not authoritative district boundaries/);
    assert.deepEqual(requested, ["countries", "states:India", "places:India:Karnataka", "districts:Karnataka", "pincode:562110"]);
  }, locationService);
});

test("health endpoint identifies the honest preview mode", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      mode: "policy-preview",
      providerConnected: false,
    });
  });
});

test("civic API creates tickets and returns real statistics", async () => {
  await withServer(async (origin) => {
    const initialStats = await fetch(`${origin}/api/civic/stats`).then((response) => response.json());
    assert.equal(initialStats.totalTickets, 0);

    const createResponse = await fetch(`${origin}/api/civic/issues`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Broken public streetlight",
        description: "Streetlight has not worked for several evenings.",
        category: "Safety",
        priority: "medium",
        country: "India",
        state: "Karnataka",
        district: "Mysuru",
        locality: "Sample locality",
        scope: "locality",
        location: { latitude: 12.9716, longitude: 77.5946, altitude: 900 },
        photoDataUrl: `data:image/jpeg;base64,${Buffer.from([
          0xff, 0xd8, 0xff, 0xe1, 0, 8, 69, 88, 73, 70, 0, 0,
          0xff, 0xda, 0, 2, 0x11, 0xff, 0xd9,
        ]).toString("base64")}`,
      }),
    });
    const { ticket } = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.match(ticket.id, /^BHR-\d{4}-[A-F0-9]{8}$/);
    assert.equal(ticket.status, "Submitted");
    assert.equal(ticket.comments.length, 0);
    assert.deepEqual(ticket.location, { latitude: 12.9716, longitude: 77.5946, altitude: 900 });
    assert.match(ticket.photoUrl, /^\/api\/civic\/media\/[0-9a-f-]{36}$/i);
    const photoResponse = await fetch(`${origin}${ticket.photoUrl}`);
    const photoBytes = Buffer.from(await photoResponse.arrayBuffer());
    assert.equal(photoResponse.headers.get("content-type"), "image/jpeg");
    assert.equal(photoBytes.includes(Buffer.from("EXIF")), false);

    const invalidLocationResponse = await fetch(`${origin}/api/civic/issues`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "A problem with a non-India map pin",
        description: "This test location is outside of the India pilot bounds.",
        category: "Safety",
        priority: "medium",
        country: "India",
        state: "Karnataka",
        district: "Mysuru",
        locality: "Sample locality",
        scope: "locality",
        location: { latitude: 0, longitude: 0 },
      }),
    });
    assert.equal(invalidLocationResponse.status, 400);

    const stats = await fetch(`${origin}/api/civic/stats`).then((response) => response.json());
    assert.equal(stats.totalTickets, 1);
    assert.equal(stats.openTickets, 1);
    assert.deepEqual(stats.categories, [{ category: "Safety", count: 1 }]);

    const filteredIssues = await fetch(`${origin}/api/civic/issues?state=Karnataka&district=Mysuru`).then((response) => response.json());
    assert.equal(filteredIssues.issues.length, 1);
    assert.equal(filteredIssues.issues[0].id, ticket.id);

    const commentResponse = await fetch(`${origin}/api/civic/issues/${ticket.id}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Please include a nearby public landmark.", role: "Public authority (unverified)" }),
    });
    const { issue: commentedTicket } = await commentResponse.json();
    assert.equal(commentResponse.status, 201);
    assert.equal(commentedTicket.comments[0].role, "Public authority (unverified)");

    const support = () => fetch(`${origin}/api/civic/issues/${ticket.id}/support`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ voterId: "civic-browser-test-identifier" }),
    });
    assert.equal((await support()).status, 200);
    const repeatSupport = await support().then((response) => response.json());
    assert.equal(repeatSupport.ticket.likes, 1);
    assert.equal("voterIds" in repeatSupport.ticket, false);
  });
});

test("civic records survive creating a new store instance", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bharat-civic-persist-"));
  const dataPath = join(dataDirectory, "civic.sqlite");
  try {
    const firstStore = createCivicStore(dataPath);
    const ticket = await firstStore.createIssue({
      title: "Public tap needs repair",
      description: "The public drinking water tap is leaking continuously.",
      category: "Water",
      priority: "low",
      country: "India",
      scope: "country",
    });
    firstStore.close();
    const secondStore = createCivicStore(dataPath);
    const tickets = await secondStore.listIssues();
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].id, ticket.id);
    secondStore.close();
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("SQLite store migrates existing JSON demo records once", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bharat-civic-migration-"));
  const legacyPath = join(dataDirectory, "civic-store.json");
  const databasePath = join(dataDirectory, "civic-store.sqlite");
  const legacyTicket = {
    id: "BHR-2026-LEGACY01",
    title: "Existing report",
    description: "An older local demo ticket.",
    category: "Roads",
    priority: "low",
    scope: "country",
    country: "India",
    status: "Submitted",
    likes: 0,
    voterIds: [],
    comments: [],
    createdAt: new Date().toISOString(),
  };
  try {
    await writeFile(legacyPath, JSON.stringify({ issues: [legacyTicket], ideas: [] }));
    const store = createCivicStore(databasePath, { legacyJsonPath: legacyPath });
    const migrated = await store.listIssues();
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0].id, legacyTicket.id);
    store.close();
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("civic API rejects reports outside the India pilot scope", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/civic/issues`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Public park repairs",
        description: "The public park needs maintenance.",
        category: "Other",
        priority: "low",
        country: "United States",
        scope: "country",
      }),
    });
    assert.equal(response.status, 400);
  });
});

test("civic ticket validation rejects incomplete location hierarchy", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/civic/issues`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Missing location",
        description: "This report has no state or district.",
        category: "Roads",
        priority: "low",
        country: "India",
        scope: "locality",
      }),
    });
    assert.equal(response.status, 400);
  });
});

test("civic tickets accept the budget and funding category", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/civic/issues`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Improve rural school funding",
        description: "Publish an accessible explanation of school budget priorities.",
        category: "Budget & funding",
        priority: "medium",
        country: "India",
        scope: "country",
      }),
    });
    assert.equal(response.status, 201);
    const { ticket } = await response.json();
    assert.equal(ticket.category, "Budget & funding");
  });
});

test("idea votes are idempotent per demo browser identifier", async () => {
  await withServer(async (origin) => {
    const createResponse = await fetch(`${origin}/api/civic/ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Publish public transport service updates",
        description: "Share reliable service changes through a public, accessible updates page.",
        category: "Public transport",
        country: "India",
      }),
    });
    const { idea } = await createResponse.json();
    const vote = () => fetch(`${origin}/api/civic/ideas/${idea.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ voterId: "demo-browser-identifier-1234" }),
    });
    assert.equal((await vote()).status, 200);
    assert.equal((await vote()).status, 200);
    const ideas = await fetch(`${origin}/api/civic/ideas`).then((response) => response.json());
    assert.equal(ideas.ideas[0].votes, 1);
    assert.equal("voterIds" in ideas.ideas[0], false);
  });
});

test("scenario endpoint returns the fixed starter set", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/scenarios`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.scenarios.length, 8);
  });
});

test("route endpoint returns a policy preview without model calls", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "Review a production deployment", risk: "low" }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.strategy, "careful_plan");
    assert.equal(payload.providerConnected, false);
    assert.equal(payload.modelCalls, 0);
  });
});

test("route endpoint rejects missing tasks", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "  " }),
    });
    assert.equal(response.status, 400);
  });
});
