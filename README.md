# Bharat AI Research

An open research prototype exploring how trustworthy, efficient AI could help people navigate public services. It brings together two small experiments:

- A **civic participation pilot** for exploring public-service guidance and community proposals.
- An **AI workbench** for testing adaptive routing and selective verification against fixed scenarios.

This is not a government service, public grievance portal, or production-ready platform. Civic tickets, comments, proposals, and demo votes are stored in a local SQLite database at `.data/civic-store.sqlite`; the API is bound to loopback and is not shared with other devices. Existing `.data/civic-store.json` records are imported into SQLite once when the database is first created. Example cards and counts are illustrative and excluded from ticket analytics. The current reporting scope is India only. Comments may carry a self-declared role, but expertise and government affiliation are not verified. Demo votes are non-binding. Popularity and self-selected priority are not moderation, verification, emergency triage, or representative public opinion. Guidance is a simple rule-based preview—not generative AI or official advice.

## Run locally

Requirements: Node.js 18 or later and npm.

```sh
npm install
npm run dev:full
```

Open <http://localhost:5173>. The Vite development server proxies `/api` requests to the local API on port `4174`. The AI workbench's routing API is local and makes no model calls.

To run the services separately, use `npm run api` and `npm run dev` in two terminals.

## Verify

```sh
npm test
npm run build
```

Routing scenarios are in `backend/engine/scenarios.mjs`; the policy is in `backend/engine/router.mjs`. These rules are hypotheses, not a learned difficulty estimator. Tests establish expected behavior, not benchmark superiority.

## Civic prototype

- Create a ticket with a generated `BHR-<year>-<id>` reference and a submitted status.
- Choose India, then the matching state/union territory, district, and optional town/village/locality. State and district dropdowns load from an open dataset that cites the Government of India's IGOD directory; this is a cached convenience list, not a live official submission service. City suggestions for locality come from CountriesNow and are incomplete; locality may be entered manually.
- Optionally enter an Indian PIN code to look up post-office locality, district, and state suggestions. The PIN code is sent to the postal-lookup provider and is not saved on the ticket; verify every suggestion before posting. If lookup fails, location can still be entered manually.
- Optionally request the browser's current location and open a Google Maps preview. The public ticket shares rounded coordinates (about 100 m) by default. Exact coordinates and available altitude are published only when the contributor explicitly opts in. Location permission is optional; the app does not collect GPS in the background.
- Optionally attach one public issue photo. The browser re-encodes it as JPEG to remove image metadata and reduce dimensions; the API checks size and strips JPEG metadata segments again. The optimized upload is limited to 1 MB and stored in the local `.data/civic-media/` directory. Don't include faces, IDs, private documents, or personal details.
- Use optional browser speech-to-text to fill a ticket description or civic-guide question. Browser speech recognition may send audio to its own provider; users are told this before recording and can review the transcript. This demo does not retain audio.
- See a live suggested department based on the selected category, reporting level, and (for education funding) request text. This is a transparent rules-based hint—not AI classification, verified assignment, a direct government submission, or an official contact directory. Budget and funding requests include both a funding category and education-specific routing hints.
- Country and state suggestions, plus optional place-name suggestions, come from the open CountriesNow API through the local server. Successful lookups are cached in memory for 24 hours and concurrent requests are deduplicated. Place names are suggestions only—not official district boundaries—and all location fields can be entered manually if the lookup is unavailable. Only the selected country/state are sent to that provider; report text is not.
- Filter tickets by geography and category; support a ticket or discuss it with a self-declared contributor role.
- Submit public-interest ideas, discuss them, and add a non-binding demo vote. Repeated votes from one browser identifier are idempotent in this prototype.
- See ticket totals and category/place breakdowns derived from actual API tickets, plus an approximate live count of active browser sessions. Presence uses a server-issued, HttpOnly cookie and an in-memory heartbeat that expires after 90 seconds; it does not store names, IP addresses, or ticket content. This is a count of browser sessions, not verified people, and can be inaccurate or manipulated.
- Contributor counts are intentionally not shown because the prototype has no accounts.
- Civic data survives restarts of the local API but remains on this machine. Delete `.data/civic-store.json` only when you intentionally want to discard your local demo data.

SQLite gives this local Node prototype transactional persistence without adding a separate Java/H2 runtime. The database is still a local development store, not a shared or horizontally scalable service. For a real shared service, run a managed relational database with migrations, add authentication and authorization, moderation, rate limits, audit events, backups, monitoring, and verified government workflows before exposing public writes. A generated ticket number is only a record in this prototype; it is not an official grievance registration.

The live presence count is held only in the API process and is lost when that process restarts. It is suitable as a demo pulse, not an audience metric or service-level signal. A multi-instance deployment would need a short-TTL shared store and abuse controls; do not add persistent identity tracking just to make this counter work across servers.

Location data sources: [India state/district directory dataset](https://github.com/KTBsomen/Indian-state-district-json) (MIT-licensed dataset, citing [IGOD](https://igod.gov.in/sg/district/states)), [CountriesNow](https://countriesnow.space/) for optional city-name suggestions, and the third-party [India Post PIN-code lookup API](https://api.postalpincode.in/) for optional post-office suggestions. PIN-code lookups send only the PIN code; issue text is not sent. Successful location lookups are cached in memory for 24 hours. Google Maps is opened only when a user clicks the map preview link.

The civic interface has English, Hindi, Bengali, Tamil, and Telugu UI translations. This translates interface labels and built-in category names only; user-submitted tickets, comments, and ideas stay in their original language. It does not automatically translate user content.

## Trust, safety, and scale

Privacy and safety are design requirements from the first prototype—not a task to defer until after launch. This demo has no accounts or verified public authority. Optional public photos and map coordinates are attached to tickets only when the contributor chooses them; exact coordinates require a separate opt-in. Do not enter personal or sensitive information. For emergencies, contact local emergency services.

Before accepting real reports or serving a large audience, the project needs, at minimum:

1. A privacy and threat assessment, clear consent and retention rules, abuse reporting, moderation, and a human appeal path.
2. Secure identity and authorization where necessary; validated APIs, rate limits, audit trails, encrypted storage, backups, and incident response.
3. A reviewed deployment architecture: stateless services behind a CDN/load balancer, a managed relational store for durable records, background queues for slow work, and managed object storage for public photos. Load-test and monitor before setting capacity claims.
4. Verified official integrations and jurisdiction data. Until then, guidance must point users to check official channels and must never imply a report was filed or resolved.
5. An AI service behind a replaceable backend adapter, grounded in maintained official sources, with citations, uncertainty/abstention, human review for consequential cases, multilingual evaluation, and privacy controls. No AI should decide eligibility, enforcement, or a person's access to services.
6. Independent security, accessibility, legal, and community review before public launch.

The current prototype is **not** ready for large-scale or sensitive use. Add infrastructure only when the product requirements and measurements justify it; do not collect citizen data to validate a visual demo.

## Research sequence

1. Establish a capable single-model baseline on the fixed scenarios.
2. Add a model adapter with fixed prompts, model versions, decoding settings, and scoring criteria.
3. Compare task success, latency, cost per successful task, model calls, and failures.
4. Publish methodology, raw results, limitations, and environment details before claiming improvement.

The project-specific workflow is documented in [.github/agents/adaptive-ai-research.agent.md](.github/agents/adaptive-ai-research.agent.md).

## Contributing

First-time contributors can start with [CONTRIBUTING.md](./CONTRIBUTING.md). Please use synthetic examples only—never commit credentials, private datasets, or real people's reports. Model, dataset, and infrastructure licenses are separate from this repository's Apache-2.0 code license.

## Share the project

Suggested X/Twitter post:

> I’m building Bharat AI Research: an open, early-stage effort to explore trustworthy AI and better ways to navigate public services in India. The civic demo is only a prototype—no real reports, government connection, or AI model yet. If you care about privacy, accessibility, civic tech, or responsible AI, please contribute code, research, design, or feedback: https://github.com/Kavin0705/bharat-ai-research
