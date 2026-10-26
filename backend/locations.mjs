const upstream = "https://countriesnow.space/api/v0.1";
const postalUpstream = "https://api.postalpincode.in/pincode";
const indiaDistrictsUrl = "https://raw.githubusercontent.com/KTBsomen/Indian-state-district-json/main/india-states-districts-latest.json";
const cacheDuration = 24 * 60 * 60 * 1_000;
const cache = new Map();
const indiaCountry = "India";

async function cached(key, load) {
  const current = cache.get(key);
  if (current && current.expiresAt > Date.now()) return current.value;

  const pending = cache.get(`${key}:pending`);
  if (pending) return pending;

  const request = load().then((value) => {
    cache.set(key, { value, expiresAt: Date.now() + cacheDuration });
    cache.delete(`${key}:pending`);
    return value;
  }).catch((error) => {
    cache.delete(`${key}:pending`);
    throw error;
  });
  cache.set(`${key}:pending`, request);
  return request;
}

async function fetchJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Location provider returned ${response.status}.`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.msg ?? "Location provider rejected the request.");
  return payload.data;
}

async function fetchDocument(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Location provider returned ${response.status}.`);
  return response.json();
}

function assertText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 100) {
    throw Object.assign(new Error(`Enter a valid ${field}.`), { statusCode: 400 });
  }
  return value.trim();
}

export function createLocationService() {
  async function getIndiaAreas() {
    return cached("india-districts", async () => {
      const records = await fetchDocument(indiaDistrictsUrl);
      if (!Array.isArray(records)) throw new Error("India location provider returned an invalid district list.");
      const areas = records
        .filter((entry) => entry && typeof entry.state === "string" && Array.isArray(entry.districts))
        .map((entry) => ({
          state: entry.state.trim(),
          districts: [...new Set(entry.districts.filter((district) => typeof district === "string" && district.trim()).map((district) => district.trim()))]
            .sort((a, b) => a.localeCompare(b)),
        }))
        .filter((entry) => entry.state && entry.districts.length)
        .sort((a, b) => a.state.localeCompare(b.state));
      if (!areas.length) throw new Error("India location provider returned no usable state or district data.");
      return areas;
    });
  }

  async function getIndiaState(state) {
    const stateName = assertText(state, "state");
    const entry = (await getIndiaAreas()).find(({ state: available }) => available.toLowerCase() === stateName.toLowerCase());
    if (!entry) throw Object.assign(new Error("Choose a state from the India state list."), { statusCode: 400 });
    return entry;
  }

  return {
    countries() {
      return [indiaCountry];
    },

    async states(country) {
      const countryName = assertText(country, "country");
      if (countryName.toLowerCase() !== indiaCountry.toLowerCase()) {
        throw Object.assign(new Error("This civic pilot currently supports India only."), { statusCode: 400 });
      }
      return (await getIndiaAreas()).map(({ state }) => state);
    },

    async districts(state) {
      return (await getIndiaState(state)).districts;
    },

    async places(country, state) {
      const countryName = assertText(country, "country");
      if (countryName.toLowerCase() !== indiaCountry.toLowerCase()) {
        throw Object.assign(new Error("This civic pilot currently supports India only."), { statusCode: 400 });
      }
      const { state: stateName } = await getIndiaState(state);
      const key = `places:${countryName.toLowerCase()}:${stateName.toLowerCase()}`;
      return cached(key, async () => {
        const query = new URLSearchParams({ country: countryName, state: stateName });
        const places = await fetchJson(`${upstream}/countries/state/cities/q?${query}`);
        return [...new Set(places.filter((place) => typeof place === "string" && place.trim()))]
          .sort((a, b) => a.localeCompare(b));
      });
    },

    async pincode(value) {
      const pincode = typeof value === "string" ? value.trim() : "";
      if (!/^\d{6}$/.test(pincode)) {
        throw Object.assign(new Error("Enter a valid 6-digit India PIN code."), { statusCode: 400 });
      }
      return cached(`pincode:${pincode}`, async () => {
        const results = await fetchDocument(`${postalUpstream}/${pincode}`);
        const result = Array.isArray(results) ? results[0] : null;
        if (!result || result.Status !== "Success" || !Array.isArray(result.PostOffice) || !result.PostOffice.length) {
          throw Object.assign(new Error("No post offices found for that PIN code."), { statusCode: 404 });
        }
        const uniqueOffices = new Map();
        for (const office of result.PostOffice) {
          if (!office || typeof office.Name !== "string" || typeof office.District !== "string" || typeof office.State !== "string") continue;
          const normalized = { locality: office.Name.trim(), district: office.District.trim(), state: office.State.trim(), pincode };
          if (!normalized.locality || !normalized.district || !normalized.state) continue;
          const key = [normalized.locality, normalized.district, normalized.state].map((part) => part.toLowerCase()).join("|");
          uniqueOffices.set(key, normalized);
        }
        const offices = [...uniqueOffices.values()];
        if (!offices.length) throw Object.assign(new Error("No usable post office details were returned for that PIN code."), { statusCode: 404 });
        return offices;
      });
    },
  };
}
