import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Load data once at module startup
// ---------------------------------------------------------------------------

const RAW = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data/countries+states+cities.json'), 'utf8')
);

// ---------------------------------------------------------------------------
// Build lookup indexes
// ---------------------------------------------------------------------------

/** Map<iso2 string, country object> */
const countryByIso2 = new Map();

/** Map<stateId number, state object> */
const stateById = new Map();

/** Map<iso2 string, state object[]> */
const statesByCountryIso2 = new Map();

/** Map<stateId number, city object[]> */
const citiesByStateId = new Map();

/** Flat array of all cities, each enriched with country_iso2 and state_id */
const allCities = [];

for (const country of RAW) {
  countryByIso2.set(country.iso2, country);

  const states = country.states || [];
  statesByCountryIso2.set(country.iso2, states);

  for (const state of states) {
    stateById.set(state.id, state);
    citiesByStateId.set(state.id, state.cities || []);

    for (const city of state.cities || []) {
      allCities.push(Object.assign({}, city, {
        country_iso2: country.iso2,
        state_id: state.id,
      }));
    }
  }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

const COUNTRY_FIELDS = [
  'id', 'name', 'iso2', 'iso3', 'phonecode', 'capital',
  'currency', 'region', 'subregion', 'latitude', 'longitude', 'emoji',
];

/** Return flat array of country summaries (no nested states/cities). */
export function getAllCountries() {
  return RAW.map(c => {
    const out = {};
    for (const f of COUNTRY_FIELDS) out[f] = c[f];
    return out;
  });
}

/** Return country with states array (no nested cities in each state). */
export function getCountryByIso2(iso2) {
  const country = countryByIso2.get(iso2);
  if (!country) return null;

  const out = {};
  for (const k of Object.keys(country)) out[k] = country[k];

  // Replace states with summaries (no cities)
  out.states = (country.states || []).map(s => {
    const st = {};
    for (const k of Object.keys(s)) {
      if (k !== 'cities') st[k] = s[k];
    }
    return st;
  });

  return out;
}

/** Return array of state summaries for a country (no cities). */
export function getStatesByCountryIso2(iso2) {
  const states = statesByCountryIso2.get(iso2);
  if (!states) return null;

  return states.map(s => {
    const out = {};
    for (const k of Object.keys(s)) {
      if (k !== 'cities') out[k] = s[k];
    }
    return out;
  });
}

/** Return state with cities array. */
export function getStateById(stateId) {
  return stateById.get(stateId) || null;
}

/** Return cities array for a state. */
export function getCitiesByStateId(stateId) {
  return citiesByStateId.get(stateId) || null;
}

/**
 * Return flat filtered city array.
 * Filters: { country_iso2, state_id, search }
 * search is case-insensitive substring match on city.name.
 */
export function getAllCities({ country_iso2, state_id, search } = {}) {
  let result = allCities;

  if (country_iso2) {
    result = result.filter(c => c.country_iso2 === country_iso2);
  }
  if (state_id !== undefined && typeof state_id === 'number') {
    const id = state_id;
    result = result.filter(c => c.state_id === id);
  }
  if (search) {
    const term = search.toLowerCase();
    result = result.filter(c => c.name.toLowerCase().includes(term));
  }

  return result;
}

/** Return { countries, states, cities } counts. */
export function getStats() {
  return {
    countries: RAW.length,
    states: stateById.size,
    cities: allCities.length,
  };
}

export default {
  getAllCountries,
  getCountryByIso2,
  getStatesByCountryIso2,
  getStateById,
  getCitiesByStateId,
  getAllCities,
  getStats,
};
