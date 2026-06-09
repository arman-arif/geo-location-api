'use strict';

const http = require('http');
const { spawn } = require('child_process');

const PORT = 3547;
const BASE = `http://localhost:${PORT}`;

let server;
let pass = 0;
let fail = 0;

function request(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body: body });
        }
      });
    }).on('error', reject);
  });
}

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS  ${msg}`);
    pass++;
  } else {
    console.log(`  FAIL  ${msg}`);
    fail++;
  }
}

async function run() {
  // 1. GET /health
  let r = await request('/health');
  assert(r.status === 200, 'GET /health → 200');
  assert(r.body.status === 'ok', 'GET /health has status ok');
  assert(typeof r.body.countries === 'number', 'GET /health has countries');
  assert(typeof r.body.states === 'number', 'GET /health has states');
  assert(typeof r.body.cities === 'number', 'GET /health has cities');

  // 2. GET /countries
  r = await request('/countries');
  assert(r.status === 200, 'GET /countries → 200');
  assert(Array.isArray(r.body), 'GET /countries returns array');
  assert(r.body.length >= 200, `GET /countries length >= 200 (got ${r.body.length})`);
  const c = r.body[0];
  assert(c && typeof c.id !== 'undefined', 'GET /countries items have id');
  assert(c && typeof c.name === 'string', 'GET /countries items have name');
  assert(c && typeof c.iso2 === 'string', 'GET /countries items have iso2');

  // 3. GET /countries/US
  r = await request('/countries/US');
  assert(r.status === 200, 'GET /countries/US → 200');
  assert(r.body.name === 'United States', `GET /countries/US name is "United States" (got "${r.body.name}")`);
  assert(Array.isArray(r.body.states), 'GET /countries/US has states array');

  // 4. GET /countries/XX → 404
  r = await request('/countries/XX');
  assert(r.status === 404, 'GET /countries/XX → 404');

  // 5. GET /countries/US/states
  r = await request('/countries/US/states');
  assert(r.status === 200, 'GET /countries/US/states → 200');
  assert(Array.isArray(r.body), 'GET /countries/US/states returns array');
  const s = r.body[0];
  assert(s && typeof s.id !== 'undefined', 'GET /countries/US/states items have id');
  assert(s && typeof s.name === 'string', 'GET /countries/US/states items have name');

  // 6. GET /countries/XX/states → 404
  r = await request('/countries/XX/states');
  assert(r.status === 404, 'GET /countries/XX/states → 404');

  // 7. GET /countries/US/states/1416 (California)
  r = await request('/countries/US/states/1416');
  assert(r.status === 200, 'GET /countries/US/states/1416 → 200');
  assert(typeof r.body.name === 'string' && r.body.name.includes('California'),
    `GET /countries/US/states/1416 name contains "California" (got "${r.body.name}")`);
  assert(Array.isArray(r.body.cities), 'GET /countries/US/states/1416 has cities array');

  // 8. GET /countries/US/states/999999 → 404
  r = await request('/countries/US/states/999999');
  assert(r.status === 404, 'GET /countries/US/states/999999 → 404');

  // 9. GET /countries/CA/states/1416 → 404 (California is US, not Canada)
  r = await request('/countries/CA/states/1416');
  assert(r.status === 404, 'GET /countries/CA/states/1416 → 404');

  // 10. GET /countries/US/states/1416/cities
  r = await request('/countries/US/states/1416/cities');
  assert(r.status === 200, 'GET /countries/US/states/1416/cities → 200');
  assert(Array.isArray(r.body), 'GET /countries/US/states/1416/cities returns array');
  const city = r.body[0];
  assert(city && typeof city.id !== 'undefined', 'GET /countries/US/states/1416/cities items have id');
  assert(city && typeof city.name === 'string', 'GET /countries/US/states/1416/cities items have name');

  // 11. GET /cities
  r = await request('/cities');
  assert(r.status === 200, 'GET /cities → 200');
  assert(Array.isArray(r.body), 'GET /cities returns array');
  assert(r.body.length >= 1000, `GET /cities length >= 1000 (got ${r.body.length})`);

  // 12. GET /cities?country_iso2=US
  r = await request('/cities?country_iso2=US');
  assert(r.status === 200, 'GET /cities?country_iso2=US → 200');
  assert(r.body.every(c => c.country_iso2 === 'US'),
    'GET /cities?country_iso2=US all cities have country_iso2 === "US"');

  // 13. GET /cities?state_id=1416
  r = await request('/cities?state_id=1416');
  assert(r.status === 200, 'GET /cities?state_id=1416 → 200');
  assert(r.body.every(c => c.state_id === 1416),
    'GET /cities?state_id=1416 all cities have state_id === 1416');

  // 14. GET /cities?search=los
  r = await request('/cities?search=los');
  assert(r.status === 200, 'GET /cities?search=los → 200');
  const losCity = r.body.find(c => /los/i.test(c.name));
  assert(losCity !== undefined, 'GET /cities?search=los at least one city matches /los/i');

  // 15. GET /nonexistent → 404
  r = await request('/nonexistent');
  assert(r.status === 404, 'GET /nonexistent → 404');

  // Summary
  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  server.kill();
  process.exit(fail > 0 ? 1 : 0);
}

// Start server then run tests
server = spawn('node', ['server.js'], {
  env: { ...process.env, PORT },
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', (d) => {
  const line = d.toString();
  if (line.includes('Server running')) run().catch((err) => {
    console.error('Test error:', err);
    server.kill();
    process.exit(1);
  });
});

server.stderr.on('data', (d) => {
  console.error('SERVER ERROR:', d.toString());
});

setTimeout(() => {
  console.error('Server did not start in time');
  server.kill();
  process.exit(1);
}, 10000);
