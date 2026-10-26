import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createCivicStore } from "./civic-store.mjs";
import { createLocationService } from "./locations.mjs";
import { createPresenceTracker } from "./presence.mjs";
import { chooseStrategy } from "./engine/router.mjs";
import { scenarios } from "./engine/scenarios.mjs";

const port = Number(process.env.API_PORT ?? 4174);
const maxBodyBytes = 2_000_000;
const dataPath = resolve(process.env.CIVIC_DB_PATH ?? ".data/civic-store.sqlite");
const legacyDataPath = resolve(process.env.CIVIC_DATA_PATH ?? ".data/civic-store.json");

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBodyBytes) {
      throw Object.assign(new Error("Request body is too large."), { statusCode: 413 });
    }
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw Object.assign(new Error("Request must contain valid JSON."), { statusCode: 400 });
  }
}

export function createApiServer({
  civicStore = createCivicStore(dataPath, { legacyJsonPath: legacyDataPath }),
  locationService = createLocationService(),
  presenceTracker = createPresenceTracker(),
} = {}) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, {
        status: "ok",
        mode: "policy-preview",
        providerConnected: false,
      });
    }

    if (request.method === "GET" && url.pathname === "/api/scenarios") {
      return sendJson(response, 200, { scenarios });
    }

    if (url.pathname.startsWith("/api/civic/")) {
      try {
        if (request.method === "POST" && url.pathname === "/api/civic/presence") {
          const cookie = (request.headers.cookie ?? "").split(";")
            .map((part) => part.trim())
            .find((part) => part.startsWith("civic_presence="));
          const existingId = cookie?.slice("civic_presence=".length);
          const sessionId = existingId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existingId)
            ? existingId
            : randomUUID();
          const headers = cookie && sessionId === existingId
            ? {}
            : {
                "set-cookie": `civic_presence=${sessionId}; Max-Age=90; Path=/api/civic/presence; HttpOnly; SameSite=Lax${request.socket.encrypted ? "; Secure" : ""}`,
              };
          const activeNow = presenceTracker.heartbeat(sessionId);
          return sendJson(response, 200, { activeNow }, headers);
        }
        if (request.method === "GET" && url.pathname === "/api/civic/locations/countries") {
          return sendJson(response, 200, { countries: await locationService.countries(), source: "India pilot scope" });
        }
        if (request.method === "GET" && url.pathname === "/api/civic/locations/states") {
          return sendJson(response, 200, {
            states: await locationService.states(url.searchParams.get("country")),
            source: "Indian government directory dataset via GitHub",
            cachedHours: 24,
          });
        }
        if (request.method === "GET" && url.pathname === "/api/civic/locations/districts") {
          return sendJson(response, 200, {
            districts: await locationService.districts(url.searchParams.get("state")),
            source: "IGOD state and district directory dataset",
            cachedHours: 24,
          });
        }
        if (request.method === "GET" && url.pathname === "/api/civic/locations/places") {
          return sendJson(response, 200, {
            places: await locationService.places(url.searchParams.get("country"), url.searchParams.get("state")),
            source: "CountriesNow",
            cachedHours: 24,
            note: "Place names are suggestions, not authoritative district boundaries.",
          });
        }
        if (request.method === "GET" && url.pathname === "/api/civic/locations/pincode") {
          return sendJson(response, 200, {
            offices: await locationService.pincode(url.searchParams.get("pincode")),
            source: "India post-office PIN directory",
            cachedHours: 24,
          });
        }
        const mediaMatch = url.pathname.match(/^\/api\/civic\/media\/([0-9a-f-]{36})$/i);
        if (request.method === "GET" && mediaMatch) {
          const media = civicStore.getMedia?.(mediaMatch[1]);
          if (!media) return sendJson(response, 404, { error: "Photo not found." });
          response.writeHead(200, {
            "content-type": "image/jpeg",
            "content-length": media.length,
            "cache-control": "public, max-age=86400, immutable",
            "x-content-type-options": "nosniff",
          });
          response.end(media);
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/civic/stats") {
          return sendJson(response, 200, await civicStore.getStats());
        }
        if (request.method === "GET" && url.pathname === "/api/civic/issues") {
          const filters = {
            country: url.searchParams.get("country") ?? "",
            state: url.searchParams.get("state") ?? "",
            district: url.searchParams.get("district") ?? "",
            locality: url.searchParams.get("locality") ?? "",
            category: url.searchParams.get("category") ?? "",
          };
          return sendJson(response, 200, { issues: await civicStore.listIssues(filters) });
        }
        if (request.method === "POST" && url.pathname === "/api/civic/issues") {
          const ticket = await civicStore.createIssue(await readJson(request));
          return sendJson(response, 201, { ticket });
        }

        const issueSupportMatch = url.pathname.match(/^\/api\/civic\/issues\/([^/]+)\/support$/);
        if (request.method === "POST" && issueSupportMatch) {
          const body = await readJson(request);
          const ticket = await civicStore.supportIssue(decodeURIComponent(issueSupportMatch[1]), body.voterId);
          return sendJson(response, 200, { ticket });
        }

        const issueCommentMatch = url.pathname.match(/^\/api\/civic\/issues\/([^/]+)\/comments$/);
        if (request.method === "POST" && issueCommentMatch) {
          const result = await civicStore.addIssueComment(decodeURIComponent(issueCommentMatch[1]), await readJson(request));
          return sendJson(response, 201, result);
        }

        if (request.method === "GET" && url.pathname === "/api/civic/ideas") {
          return sendJson(response, 200, { ideas: await civicStore.listIdeas() });
        }
        if (request.method === "POST" && url.pathname === "/api/civic/ideas") {
          const idea = await civicStore.createIdea(await readJson(request));
          return sendJson(response, 201, { idea });
        }

        const ideaVoteMatch = url.pathname.match(/^\/api\/civic\/ideas\/([^/]+)\/vote$/);
        if (request.method === "POST" && ideaVoteMatch) {
          const body = await readJson(request);
          const idea = await civicStore.voteForIdea(decodeURIComponent(ideaVoteMatch[1]), body.voterId);
          return sendJson(response, 200, { idea });
        }

        const ideaCommentMatch = url.pathname.match(/^\/api\/civic\/ideas\/([^/]+)\/comments$/);
        if (request.method === "POST" && ideaCommentMatch) {
          const result = await civicStore.addIdeaComment(decodeURIComponent(ideaCommentMatch[1]), await readJson(request));
          return sendJson(response, 201, result);
        }
      } catch (error) {
        if (url.pathname.startsWith("/api/civic/locations/") && !error.statusCode) {
          console.error("Location provider request failed:", error);
          return sendJson(response, 502, { error: "Location lookup is temporarily unavailable. You can still enter a place name manually." });
        }
        if (error.statusCode === 413) {
          return sendJson(response, 413, { error: "Request body must be under 2 MB." });
        }
        if (error.statusCode >= 400 && error.statusCode < 500) {
          return sendJson(response, error.statusCode, { error: error.message });
        }
        console.error("Civic API request failed:", error);
        return sendJson(response, 500, { error: "Civic data is temporarily unavailable." });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/route") {
      try {
        const body = await readJson(request);
        const task = typeof body.task === "string" ? body.task.trim() : "";
        const risk = ["low", "medium", "high"].includes(body.risk) ? body.risk : "low";
        if (!task || task.length > 2_000) {
          return sendJson(response, 400, { error: "Enter a task between 1 and 2,000 characters." });
        }
        return sendJson(response, 200, {
          ...chooseStrategy(task, risk),
          providerConnected: false,
          modelCalls: 0,
        });
      } catch {
        return sendJson(response, 400, { error: "Request must contain valid JSON under 8 KB." });
      }
    }

    return sendJson(response, 404, { error: "Route not found." });
  });
  server.on("close", () => civicStore.close?.());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApiServer().listen(port, "127.0.0.1", () => {
    console.log(`Bharat AI API listening on http://127.0.0.1:${port}`);
  });
}