#!/usr/bin/env node
/**
 * Build SQLite database from countries+states+cities.json
 * Uses better-sqlite3 for safe, fast parameterized inserts.
 * Outputs: geo.db (SQLite), geo.sql (dump for D1 import)
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JSON_FILE = path.join(__dirname, '..', 'countries+states+cities.json');
const DB_FILE   = path.join(__dirname, '..', 'db/geo.db');
const SQL_FILE  = path.join(__dirname, '..', 'db/geo.sql');

// Clean up existing files
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
if (fs.existsSync(SQL_FILE)) fs.unlinkSync(SQL_FILE);

// Open database with performance pragmas
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 100000');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 30000000000');
db.pragma('page_size = 4096');

// --- Schema ---
db.exec(`
CREATE TABLE countries (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  iso2 TEXT UNIQUE NOT NULL,
  iso3 TEXT,
  phonecode TEXT,
  capital TEXT,
  currency TEXT,
  region TEXT,
  subregion TEXT,
  latitude TEXT,
  longitude TEXT,
  emoji TEXT
);
CREATE TABLE states (
  id INTEGER PRIMARY KEY,
  country_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  iso2 TEXT,
  latitude TEXT,
  longitude TEXT
);
CREATE TABLE cities (
  id INTEGER PRIMARY KEY,
  state_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  latitude TEXT,
  longitude TEXT
);
CREATE INDEX idx_states_country ON states(country_id);
CREATE INDEX idx_cities_state  ON cities(state_id);
CREATE INDEX idx_cities_name   ON cities(name);
`);

// Write schema to SQL dump
fs.writeFileSync(SQL_FILE, `-- Cloudflare D1 geo-location database dump
-- Generated: ${new Date().toISOString()}

CREATE TABLE countries (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  iso2 TEXT UNIQUE NOT NULL,
  iso3 TEXT,
  phonecode TEXT,
  capital TEXT,
  currency TEXT,
  region TEXT,
  subregion TEXT,
  latitude TEXT,
  longitude TEXT,
  emoji TEXT
);
CREATE TABLE states (
  id INTEGER PRIMARY KEY,
  country_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  iso2 TEXT,
  latitude TEXT,
  longitude TEXT
);
CREATE TABLE cities (
  id INTEGER PRIMARY KEY,
  state_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  latitude TEXT,
  longitude TEXT
);
CREATE INDEX idx_states_country ON states(country_id);
CREATE INDEX idx_cities_state  ON cities(state_id);
CREATE INDEX idx_cities_name   ON cities(name);
`);

// --- Prepared statements ---
const insertCountry = db.prepare(
  'INSERT INTO countries (id,name,iso2,iso3,phonecode,capital,currency,region,subregion,latitude,longitude,emoji) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
);
const insertState = db.prepare(
  'INSERT INTO states (id,country_id,name,iso2,latitude,longitude) VALUES (?,?,?,?,?,?)'
);
const insertCity = db.prepare(
  'INSERT INTO cities (id,state_id,name,latitude,longitude) VALUES (?,?,?,?,?)'
);

// --- Transaction-wrapped bulk insert helpers ---
const insertCountries = db.transaction((countries) => {
  for (const c of countries) {
    insertCountry.run(
      c.id, c.name, c.iso2,
      c.iso3 || null, c.phonecode || null, c.capital || null,
      c.currency || null, c.region || null, c.subregion || null,
      c.latitude || null, c.longitude || null, c.emoji || null
    );
  }
});

const insertStates = db.transaction((countryRows) => {
  for (const r of countryRows) {
    insertState.run(r.id, r.country_id, r.name, r.iso2 || null, r.latitude || null, r.longitude || null);
  }
});

const insertCities = db.transaction((cityRows) => {
  for (const r of cityRows) {
    insertCity.run(r.id, r.state_id, r.name, r.latitude || null, r.longitude || null);
  }
});

// --- Read JSON ---
console.log('Reading JSON...');
const raw = fs.readFileSync(JSON_FILE, 'utf8');
const countries = JSON.parse(raw);
console.log(`Loaded ${countries.length} countries`);

// --- Insert countries ---
console.log('Inserting countries...');
insertCountries(countries);
console.log(`  ${countries.length} countries inserted`);

// Append country inserts to SQL dump
const countrySql = countries.map(c => {
  const vals = [
    c.id, c.name, c.iso2,
    c.iso3 || null, c.phonecode || null, c.capital || null,
    c.currency || null, c.region || null, c.subregion || null,
    c.latitude || null, c.longitude || null, c.emoji || null
  ];
  return `INSERT INTO countries VALUES (${vals.map(v => v === null ? 'NULL' : JSON.stringify(String(v))).join(',')});`;
}).join('\n');
fs.appendFileSync(SQL_FILE, countrySql + '\n');

// --- Insert states ---
console.log('Inserting states...');
const stateRows = [];
let totalStates = 0;
for (const c of countries) {
  for (const s of (c.states || [])) {
    stateRows.push({ id: s.id, country_id: c.id, name: s.name, iso2: s.iso2, latitude: s.latitude, longitude: s.longitude });
    totalStates++;
  }
}
insertStates(stateRows);
console.log(`  ${totalStates} states inserted`);

// Append state inserts to SQL dump
const stateSql = stateRows.map(r => {
  const vals = [r.id, r.country_id, r.name, r.iso2 || null, r.latitude || null, r.longitude || null];
  return `INSERT INTO states VALUES (${vals.map(v => v === null ? 'NULL' : JSON.stringify(String(v))).join(',')});`;
}).join('\n');
fs.appendFileSync(SQL_FILE, stateSql + '\n');

// --- Insert cities ---
console.log('Inserting cities...');
const cityRows = [];
let totalCities = 0;
for (const c of countries) {
  for (const s of (c.states || [])) {
    for (const city of (s.cities || [])) {
      cityRows.push({ id: city.id, state_id: s.id, name: city.name, latitude: city.latitude, longitude: city.longitude });
      totalCities++;
    }
  }
}
insertCities(cityRows);
console.log(`  ${totalCities} cities inserted`);

// Append city inserts to SQL dump
const citySql = cityRows.map(r => {
  const vals = [r.id, r.state_id, r.name, r.latitude || null, r.longitude || null];
  return `INSERT INTO cities VALUES (${vals.map(v => v === null ? 'NULL' : JSON.stringify(String(v))).join(',')});`;
}).join('\n');
fs.appendFileSync(SQL_FILE, citySql + '\n');

// --- VACUUM ---
console.log('Running VACUUM...');
db.exec('VACUUM');

// --- Verify counts ---
console.log('\n=== Verification ===');
const counts = {
  countries: db.prepare('SELECT count(*) as n FROM countries').get().n,
  states:    db.prepare('SELECT count(*) as n FROM states').get().n,
  cities:    db.prepare('SELECT count(*) as n FROM cities').get().n,
};
for (const [t, n] of Object.entries(counts)) {
  console.log(`  ${t}: ${n} rows`);
}

const dbSize = fs.statSync(DB_FILE).size;
const sqlSize = fs.statSync(SQL_FILE).size;
console.log(`\ngeo.db:  ${(dbSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`geo.sql: ${(sqlSize / 1024 / 1024).toFixed(2)} MB`);

const expected = { countries: 250, states: 5308, cities: 156025 };
let ok = true;
for (const [t, n] of Object.entries(expected)) {
  if (counts[t] !== n) {
    console.error(`  FAIL: ${t} expected ${n}, got ${counts[t]}`);
    ok = false;
  }
}
if (ok) console.log('\nAll counts match expected values.');

// Close database
db.close();
