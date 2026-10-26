import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const categories = ["Roads", "Water", "Waste", "Public transport", "Health", "Education", "Budget & funding", "Safety", "Environment", "Other"];
const priorities = ["low", "medium", "high"];
const issueStatuses = ["Submitted", "Under review", "Response shared", "Resolved"];
const contributorRoles = ["Community member", "Subject expert (unverified)", "Public authority (unverified)"];

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function publicIssue(issue) {
  const { voterIds, ...publicData } = issue;
  return publicData;
}

function publicIdea(idea) {
  const { voterIds, ...publicData } = idea;
  return publicData;
}

function validateIssue(input) {
  const title = cleanText(input.title, 100);
  const description = cleanText(input.description, 1000);
  const country = cleanText(input.country, 80);
  const state = cleanText(input.state, 80);
  const district = cleanText(input.district, 100);
  const locality = cleanText(input.locality, 100);
  const category = categories.includes(input.category) ? input.category : "";
  const priority = priorities.includes(input.priority) ? input.priority : "";
  const scope = ["locality", "district", "state", "country"].includes(input.scope) ? input.scope : "";
  const location = input.location && typeof input.location === "object" ? input.location : {};
  const latitude = location.latitude;
  const longitude = location.longitude;
  const altitude = location.altitude;
  const hasCoordinates = latitude !== undefined || longitude !== undefined;

  if (title.length < 5 || description.length < 12 || country.toLowerCase() !== "india" || !category || !priority || !scope) {
    throw Object.assign(new Error("Add a title, details, an India location, category, priority, and reporting scope."), { statusCode: 400 });
  }
  if (scope === "state" && !state || scope === "district" && (!state || !district) || scope === "locality" && (!state || !district || !locality)) {
    throw Object.assign(new Error("Choose the location details required for the selected reporting scope."), { statusCode: 400 });
  }
  if (hasCoordinates && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 6 || latitude > 38 || longitude < 68 || longitude > 98)) {
    throw Object.assign(new Error("Enter valid latitude and longitude coordinates within India."), { statusCode: 400 });
  }
  if (altitude !== undefined && (!hasCoordinates || !Number.isFinite(altitude) || altitude < -500 || altitude > 10_000)) {
    throw Object.assign(new Error("Enter a valid altitude with a map location."), { statusCode: 400 });
  }

  return {
    title,
    description,
    country,
    state,
    district,
    locality,
    category,
    priority,
    scope,
    ...(hasCoordinates ? { location: { latitude, longitude, ...(altitude === undefined ? {} : { altitude }) } } : {}),
  };
}

function validatePhotoDataUrl(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 1_400_000) {
    throw Object.assign(new Error("The optimized photo must be smaller than 1 MB."), { statusCode: 400 });
  }
  const match = value.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw Object.assign(new Error("Upload a JPEG photo. The browser optimizes images and removes embedded metadata before upload."), { statusCode: 400 });
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > 1_000_000 || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw Object.assign(new Error("The photo is invalid or exceeds the 1 MB upload limit."), { statusCode: 400 });
  }
  const safeSegments = [bytes.subarray(0, 2)];
  let offset = 2;
  let foundScan = false;
  while (offset < bytes.length - 2) {
    const markerStart = offset;
    if (bytes[offset] !== 0xff) throw Object.assign(new Error("The photo is not a valid JPEG image."), { statusCode: 400 });
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) break;
      const segmentLength = bytes.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) {
        throw Object.assign(new Error("The photo is not a valid JPEG image."), { statusCode: 400 });
      }
      safeSegments.push(bytes.subarray(markerStart, bytes.length));
      foundScan = true;
      break;
    }
    if (marker === 0xd9 || marker === 0xd8 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) {
      safeSegments.push(bytes.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw Object.assign(new Error("The photo is not a valid JPEG image."), { statusCode: 400 });
    }
    const segmentEnd = offset + segmentLength;
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) safeSegments.push(bytes.subarray(markerStart, segmentEnd));
    offset = segmentEnd;
  }
  if (!foundScan) throw Object.assign(new Error("The photo is not a valid JPEG image."), { statusCode: 400 });
  return Buffer.concat(safeSegments);
}

function validateIdea(input) {
  const title = cleanText(input.title, 100);
  const description = cleanText(input.description, 1200);
  const category = categories.includes(input.category) ? input.category : "";
  const country = cleanText(input.country, 80);
  if (title.length < 5 || description.length < 15 || !category || country.toLowerCase() !== "india") {
    throw Object.assign(new Error("Add an idea title, details, category, and choose India."), { statusCode: 400 });
  }
  return { title, description, category, country };
}

export function createCivicStore(path, { legacyJsonPath } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const mediaDirectory = join(dirname(path), "civic-media");
  mkdirSync(mediaDirectory, { recursive: true });
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS civic_records (
      record_type TEXT NOT NULL CHECK (record_type IN ('issue', 'idea')),
      record_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL CHECK (json_valid(payload)),
      PRIMARY KEY (record_type, record_id)
    );
    CREATE INDEX IF NOT EXISTS civic_records_order
      ON civic_records (record_type, created_at DESC);
  `);

  const readRows = database.prepare("SELECT record_type, payload FROM civic_records ORDER BY created_at DESC");
  const countRows = database.prepare("SELECT COUNT(*) AS count FROM civic_records");
  const insertRow = database.prepare(`
    INSERT INTO civic_records (record_type, record_id, created_at, payload)
    VALUES (@recordType, @recordId, @createdAt, @payload)
  `);

  function readStore() {
    const store = { issues: [], ideas: [] };
    for (const row of readRows.all()) {
      const record = JSON.parse(row.payload);
      store[row.record_type === "issue" ? "issues" : "ideas"].push(record);
    }
    return store;
  }

  const writeStore = database.transaction((store) => {
    database.prepare("DELETE FROM civic_records").run();
    for (const [recordType, records] of [["issue", store.issues], ["idea", store.ideas]]) {
      for (const record of records) {
        insertRow.run({
          recordType,
          recordId: record.id,
          createdAt: record.createdAt ?? new Date(0).toISOString(),
          payload: JSON.stringify(record),
        });
      }
    }
  });

  if (legacyJsonPath && existsSync(legacyJsonPath) && countRows.get().count === 0) {
    const legacyStore = JSON.parse(readFileSync(legacyJsonPath, "utf8"));
    writeStore({
      issues: Array.isArray(legacyStore.issues) ? legacyStore.issues : [],
      ideas: Array.isArray(legacyStore.ideas) ? legacyStore.ideas : [],
    });
  }

  function update(mutator) {
    return database.transaction(() => {
      const store = readStore();
      const result = mutator(store);
      writeStore(store);
      return result;
    }).immediate();
  }

  function read(selector) {
    return selector(readStore());
  }

  return {
    async listIssues(filters = {}) {
      return read((store) => store.issues
        .filter((issue) => !filters.country || issue.country === filters.country)
        .filter((issue) => !filters.state || issue.state === filters.state)
        .filter((issue) => !filters.district || issue.district === filters.district)
        .filter((issue) => !filters.locality || issue.locality === filters.locality)
        .filter((issue) => !filters.category || issue.category === filters.category)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(publicIssue));
    },

    async getStats() {
      return read((store) => {
        const categoriesCount = {};
        const placesCount = {};
        const statusesCount = {};
        for (const issue of store.issues) {
          categoriesCount[issue.category] = (categoriesCount[issue.category] ?? 0) + 1;
          const place = [issue.locality, issue.district, issue.state, issue.country].filter(Boolean).join(", ");
          placesCount[place] = (placesCount[place] ?? 0) + 1;
          statusesCount[issue.status] = (statusesCount[issue.status] ?? 0) + 1;
        }
        const categories = Object.entries(categoriesCount)
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count);
        const places = Object.entries(placesCount)
          .map(([place, count]) => ({ place, count }))
          .sort((a, b) => b.count - a.count);
        return {
          totalTickets: store.issues.length,
          openTickets: store.issues.filter((issue) => issue.status !== "Resolved").length,
          categories,
          places,
          statuses: statusesCount,
        };
      });
    },

    async supportIssue(id, voterId) {
      const safeVoterId = cleanText(voterId, 80);
      if (safeVoterId.length < 12) throw Object.assign(new Error("Could not identify this demo support."), { statusCode: 400 });
      return update((store) => {
        const issue = store.issues.find((item) => item.id === id);
        if (!issue) throw Object.assign(new Error("Ticket not found."), { statusCode: 404 });
        if (!issue.voterIds.includes(safeVoterId)) {
          issue.voterIds.push(safeVoterId);
          issue.likes += 1;
          issue.updatedAt = new Date().toISOString();
        }
        return publicIssue(issue);
      });
    },

    async createIssue(input) {
      const data = validateIssue(input);
      const photoBytes = validatePhotoDataUrl(input.photoDataUrl);
      const photoId = photoBytes ? randomUUID() : null;
      const photoPath = photoId ? join(mediaDirectory, `${photoId}.jpg`) : null;
      if (photoBytes && photoPath) writeFileSync(photoPath, photoBytes, { flag: "wx", mode: 0o600 });
      try {
        return update((store) => {
          const createdAt = new Date().toISOString();
          const ticket = {
            id: `BHR-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
            ...data,
            ...(photoId ? { photoUrl: `/api/civic/media/${photoId}` } : {}),
            status: "Submitted",
            likes: 0,
            voterIds: [],
            comments: [],
            createdAt,
            updatedAt: createdAt,
          };
          store.issues.unshift(ticket);
          return publicIssue(ticket);
        });
      } catch (error) {
        if (photoPath && existsSync(photoPath)) unlinkSync(photoPath);
        throw error;
      }
    },

    getMedia(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      try {
        return readFileSync(join(mediaDirectory, `${id}.jpg`));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },

    async addIssueComment(id, input) {
      const text = cleanText(input.text, 500);
      const role = contributorRoles.includes(input.role) ? input.role : contributorRoles[0];
      if (text.length < 2) throw Object.assign(new Error("Write a comment before posting."), { statusCode: 400 });
      return update((store) => {
        const issue = store.issues.find((item) => item.id === id);
        if (!issue) throw Object.assign(new Error("Ticket not found."), { statusCode: 404 });
        const comment = { id: randomUUID(), text, role, createdAt: new Date().toISOString() };
        issue.comments.push(comment);
        issue.updatedAt = comment.createdAt;
        return { issue: publicIssue(issue), comment };
      });
    },

    async listIdeas() {
      return read((store) => [...store.ideas]
        .sort((a, b) => b.votes - a.votes || new Date(b.createdAt) - new Date(a.createdAt))
        .map(publicIdea));
    },

    async createIdea(input) {
      const data = validateIdea(input);
      return update((store) => {
        const idea = {
          id: randomUUID(),
          ...data,
          votes: 0,
          voterIds: [],
          comments: [],
          createdAt: new Date().toISOString(),
        };
        store.ideas.unshift(idea);
        return publicIdea(idea);
      });
    },

    async voteForIdea(id, voterId) {
      const safeVoterId = cleanText(voterId, 80);
      if (safeVoterId.length < 12) throw Object.assign(new Error("Could not identify this demo vote."), { statusCode: 400 });
      return update((store) => {
        const idea = store.ideas.find((item) => item.id === id);
        if (!idea) throw Object.assign(new Error("Idea not found."), { statusCode: 404 });
        if (!idea.voterIds.includes(safeVoterId)) {
          idea.voterIds.push(safeVoterId);
          idea.votes += 1;
        }
        return publicIdea(idea);
      });
    },

    async addIdeaComment(id, input) {
      const text = cleanText(input.text, 500);
      const role = contributorRoles.includes(input.role) ? input.role : contributorRoles[0];
      if (text.length < 2) throw Object.assign(new Error("Write a comment before posting."), { statusCode: 400 });
      return update((store) => {
        const idea = store.ideas.find((item) => item.id === id);
        if (!idea) throw Object.assign(new Error("Idea not found."), { statusCode: 404 });
        const comment = { id: randomUUID(), text, role, createdAt: new Date().toISOString() };
        idea.comments.push(comment);
        return { idea: publicIdea(idea), comment };
      });
    },
    close() {
      database.close();
    },
  };
}
