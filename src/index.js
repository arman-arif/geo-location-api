/**
 * Cloudflare Worker entry point for geo-location API.
 * D1 binding (env.DB) provides SQLite access.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      return await route(parts, url, request, env);
    } catch (err) {
      return json({ error: err.message || 'Internal Server Error' }, 500);
    }
  }
};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

async function route(parts, url, request, env) {
  const n = parts.length;

  // longest paths first
  if (n === 5 && parts[0] === 'countries' && parts[2] === 'states' && parts[4] === 'cities') {
    return handleCountriesIso2StatesStateIdCities(parts[1], parts[3], env);
  }
  if (n === 4 && parts[0] === 'countries' && parts[2] === 'states') {
    return handleCountriesIso2StatesStateId(parts[1], parts[3], env);
  }
  if (n === 3 && parts[0] === 'countries' && parts[2] === 'states') {
    return handleCountriesIso2States(parts[1], env);
  }
  if (n === 1 && parts[0] === 'countries') {
    return handleCountries(env);
  }
  if (n === 2 && parts[0] === 'countries') {
    return handleCountriesIso2(parts[1], env);
  }
  if (n === 1 && parts[0] === 'cities') {
    return handleCities(url, env);
  }
  if (n === 1 && parts[0] === 'health') {
    return handleHealth(env);
  }

  return notFound('Not Found');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data, status = 200) {
  return Response.json(data, { status });
}

function notFound(msg = 'Not Found') {
  return json({ error: msg }, 404);
}

function getParam(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  return raw;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

async function handleHealth(env) {
  const c = await env.DB.prepare('SELECT count(*) as n FROM countries').first();
  const s = await env.DB.prepare('SELECT count(*) as n FROM states').first();
  const t = await env.DB.prepare('SELECT count(*) as n FROM cities').first();
  return json({ status: 'ok', countries: c.n, states: s.n, cities: t.n });
}

// ---------------------------------------------------------------------------
// GET /countries
// ---------------------------------------------------------------------------

async function handleCountries(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, iso2, iso3, phonecode, capital, currency, region, subregion, latitude, longitude, emoji FROM countries'
  ).all();
  return json(results);
}

// ---------------------------------------------------------------------------
// GET /countries/:iso2
// ---------------------------------------------------------------------------

async function handleCountriesIso2(iso2, env) {
  const country = await env.DB.prepare('SELECT * FROM countries WHERE iso2 = ?').bind(iso2).first();
  if (!country) return notFound('Country not found');

  const { results: states } = await env.DB.prepare('SELECT * FROM states WHERE country_id = ?').bind(country.id).all();
  return json({ ...country, states });
}

// ---------------------------------------------------------------------------
// GET /countries/:iso2/states
// ---------------------------------------------------------------------------

async function handleCountriesIso2States(iso2, env) {
  // verify country exists
  const country = await env.DB.prepare('SELECT id FROM countries WHERE iso2 = ?').bind(iso2).first();
  if (!country) return notFound('Country not found');

  const { results: states } = await env.DB.prepare('SELECT * FROM states WHERE country_id = ?').bind(country.id).all();
  return json(states);
}

// ---------------------------------------------------------------------------
// GET /countries/:iso2/states/:stateId
// ---------------------------------------------------------------------------

async function handleCountriesIso2StatesStateId(iso2, stateId, env) {
  // cross-country verification
  const cross = await env.DB.prepare(
    'SELECT c.id as country_id FROM countries c JOIN states s ON s.country_id = c.id WHERE c.iso2 = ? AND s.id = ?'
  ).bind(iso2, stateId).first();
  if (!cross) return notFound('State not found');

  const state = await env.DB.prepare('SELECT * FROM states WHERE id = ?').bind(stateId).first();
  const { results: cities } = await env.DB.prepare('SELECT * FROM cities WHERE state_id = ?').bind(stateId).all();

  return json({ ...state, cities });
}

// ---------------------------------------------------------------------------
// GET /countries/:iso2/states/:stateId/cities
// ---------------------------------------------------------------------------

async function handleCountriesIso2StatesStateIdCities(iso2, stateId, env) {
  // cross-country verification
  const cross = await env.DB.prepare(
    'SELECT c.id as country_id FROM countries c JOIN states s ON s.country_id = c.id WHERE c.iso2 = ? AND s.id = ?'
  ).bind(iso2, stateId).first();
  if (!cross) return notFound('State not found');

  const { results: cities } = await env.DB.prepare('SELECT * FROM cities WHERE state_id = ?').bind(stateId).all();
  return json(cities);
}

// ---------------------------------------------------------------------------
// GET /cities?country_iso2=&state_id=&search=
// ---------------------------------------------------------------------------

async function handleCities(url, env) {
  const countryIso2 = getParam(url.searchParams.get('country_iso2'));
  const stateIdParam = getParam(url.searchParams.get('state_id'));
  const search = getParam(url.searchParams.get('search'));

  let stateId = null;
  if (stateIdParam !== null) {
    stateId = Number(stateIdParam);
    if (isNaN(stateId)) return json({ error: 'state_id must be a number' }, 400);
  }

  const { results } = await env.DB.prepare(
    `SELECT ci.*, st.id as state_id, st.name as state_name, co.iso2 as country_iso2
     FROM cities ci
     JOIN states st ON st.id = ci.state_id
     JOIN countries co ON co.id = st.country_id
     WHERE 1=1
       AND (?1 IS NULL OR co.iso2 = ?1)
       AND (?2 IS NULL OR st.id = ?2)
       AND (?3 IS NULL OR LOWER(ci.name) LIKE '%' || LOWER(?3) || '%')`
  ).bind(countryIso2, stateId, search).all();

  return json(results);
}