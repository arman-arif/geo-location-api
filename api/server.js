'use strict';

const http = require('http');
const data = require('./data');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 500) {
  sendJSON(res, { error: message }, status);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function route(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method.toUpperCase();
  if (method !== 'GET') return null;

  const parts = url.pathname.split('/').filter(Boolean);

  // /countries/:iso2/states/:stateId/cities  (5 parts)
  if (parts[0] === 'countries' && parts.length === 5 && parts[4] === 'cities') {
    return handleCountryStateCities(parts[1], Number(parts[3]), url);
  }
  // /countries/:iso2/states/:stateId  (4 parts)
  if (parts[0] === 'countries' && parts.length === 4 && parts[2] === 'states') {
    return handleCountryState(parts[1], Number(parts[3]), url);
  }
  // /countries/:iso2/states  (3 parts)
  if (parts[0] === 'countries' && parts.length === 3 && parts[2] === 'states') {
    return handleCountryStates(parts[1], url);
  }
  // /countries/:iso2  (2 parts)
  if (parts[0] === 'countries' && parts.length === 2) {
    return handleCountryByIso2(parts[1], url);
  }
  // /countries  (1 part)
  if (parts[0] === 'countries') {
    return handleCountries(url);
  }
  // /cities
  if (parts[0] === 'cities') {
    return handleCities(url);
  }
  // /health
  if (parts[0] === 'health') {
    return handleHealth(url);
  }

  return null; // no match
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleCountries(url) {
  return [200, data.getAllCountries()];
}

function handleHealth(url) {
  const stats = data.getStats();
  return [200, { status: 'ok', ...stats }];
}

function handleCountryByIso2(iso2, url) {
  const country = data.getCountryByIso2(iso2);
  if (!country) return [404, { error: 'Country not found' }];
  return [200, country];
}

function handleCountryStates(iso2, url) {
  const states = data.getStatesByCountryIso2(iso2);
  if (states === null) return [404, { error: 'Country not found' }];
  return [200, states];
}

function handleCountryState(iso2, stateId, url) {
  const country = data.getCountryByIso2(iso2);
  if (!country) return [404, { error: 'Country not found' }];
  const state = data.getStateById(stateId);
  if (!state) return [404, { error: 'State not found' }];
  const stateBelongs = country.states.some(s => s.id === stateId);
  if (!stateBelongs) return [404, { error: 'State not found' }];
  return [200, state];
}

function handleCountryStateCities(iso2, stateId, url) {
  const country = data.getCountryByIso2(iso2);
  if (!country) return [404, { error: 'Country not found' }];
  const state = data.getStateById(stateId);
  if (!state) return [404, { error: 'State not found' }];
  const stateBelongs = country.states.some(s => s.id === stateId);
  if (!stateBelongs) return [404, { error: 'State not found' }];
  const cities = data.getCitiesByStateId(stateId);
  return [200, cities];
}

function handleCities(url) {
  const country_iso2 = url.searchParams.get('country_iso2');
  let state_id = url.searchParams.get('state_id');
  if (state_id !== null && state_id !== '') state_id = Number(state_id);
  else state_id = undefined;
  const search = url.searchParams.get('search');
  const cities = data.getAllCities({
    country_iso2: country_iso2 || undefined,
    state_id: state_id,
    search: search || undefined,
  });
  return [200, cities];
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  try {
    const match = route(req);
    if (match) {
      sendJSON(res, match[1], match[0]);
    } else {
      sendError(res, 'Not Found', 404);
    }
  } catch (err) {
    console.error(err);
    sendError(res, 'Internal Server Error', 500);
  }
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful uncaught error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

module.exports = server;