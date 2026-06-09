# Geo Location API

A lightweight REST API for querying countries, states, and cities from a bundled dataset. Built with Node.js using only the native `http` module — zero dependencies, no `package.json` required.

## Prerequisites

- [Node.js](https://nodejs.org/) (any recent version)

## Getting Started

Start the server:

```bash
node api/server.js
```

The server starts on port **3000** by default. To use a different port, set the `PORT` environment variable:

```bash
PORT=8080 node api/server.js
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check with dataset counts |
| `GET` | `/countries` | List all countries (flat, no nested data) |
| `GET` | `/countries/:iso2` | Get a single country by ISO 3166-1 alpha-2 code |
| `GET` | `/countries/:iso2/states` | List all states for a country |
| `GET` | `/countries/:iso2/states/:stateId` | Get a single state by ID, with its cities |
| `GET` | `/countries/:iso2/states/:stateId/cities` | List all cities in a state |
| `GET` | `/cities` | List all cities (flat list) |

### Response Shapes

**`GET /health`**
```json
{
  "status": "ok",
  "countries": 250,
  "states": 5308,
  "cities": 156025
}
```

**`GET /countries`**
```json
[
  {
    "id": 1,
    "name": "Afghanistan",
    "iso2": "AF",
    "iso3": "AFG",
    "phonecode": "93",
    "capital": "Kabul",
    "currency": "AFN",
    "region": "Asia",
    "subregion": "Southern Asia",
    "latitude": 33.0,
    "longitude": 65.0,
    "emoji": "🇦🇫"
  },
  ...
]
```

**`GET /countries/:iso2`**
```json
{
  "id": 233,
  "name": "United States",
  "iso2": "US",
  "iso3": "USA",
  "phonecode": "1",
  "capital": "Washington, D.C.",
  "currency": "USD",
  "region": "Americas",
  "subregion": "Northern America",
  "latitude": 38.0,
  "longitude": -97.0,
  "emoji": "🇺🇸",
  "states": [
    {
      "id": 1416,
      "name": "California",
      "iso2": "CA",
      "latitude": 36.7783,
      "longitude": -119.4179
    },
    ...
  ]
}
```

**`GET /countries/:iso2/states`**
```json
[
  {
    "id": 1416,
    "name": "California",
    "iso2": "CA",
    "latitude": 36.7783,
    "longitude": -119.4179
  },
  ...
]
```

**`GET /countries/:iso2/states/:stateId`**
```json
{
  "id": 1416,
  "name": "California",
  "iso2": "CA",
  "latitude": 36.7783,
  "longitude": -119.4179,
  "cities": [
    {
      "id": 16856,
      "name": "Los Angeles",
      "latitude": 34.0522,
      "longitude": -118.2437
    },
    ...
  ]
}
```

**`GET /countries/:iso2/states/:stateId/cities`**
```json
[
  {
    "id": 16856,
    "name": "Los Angeles",
    "latitude": 34.0522,
    "longitude": -118.2437
  },
  ...
]
```

**`GET /cities`**
```json
[
  {
    "id": 16856,
    "name": "Los Angeles",
    "latitude": 34.0522,
    "longitude": -118.2437,
    "country_iso2": "US",
    "state_id": 1416
  },
  ...
]
```

## Query Parameters

The `/cities` endpoint supports optional filters:

| Parameter | Description |
|-----------|-------------|
| `country_iso2` | Filter by country ISO 3166-1 alpha-2 code (e.g., `US`, `CA`) |
| `state_id` | Filter by state ID (e.g., `1416`) |
| `search` | Case-insensitive substring match on city name (e.g., `los` matches "Los Angeles") |

Filters can be combined. All parameters are optional.

## Error Responses

**404 Not Found**
```json
{
  "error": "Country not found"
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal Server Error"
}
```

## Data Source

The API reads from `api/countries+states+cities.json`, a bundled dataset containing:

- **250** countries
- **5,308** states/provinces
- **156,025** cities

Country and state records include geographic coordinates and metadata (capital, currency, region, etc.). City records include name and coordinates, and are enriched with `country_iso2` and `state_id` when returned through the API.

## Running Tests

A test suite is included in `api/test.js`. It starts the server on port `3547`, runs assertions against all endpoints, and exits with code `0` on success or `1` on failure.

```bash
node api/test.js
```

## Example Usage

```bash
# Health check
curl http://localhost:3000/health

# List all countries
curl http://localhost:3000/countries

# Get a specific country
curl http://localhost:3000/countries/US

# List states in a country
curl http://localhost:3000/countries/US/states

# Get a specific state (e.g., California)
curl http://localhost:3000/countries/US/states/1416

# List cities in a state
curl http://localhost:3000/countries/US/states/1416/cities

# Search cities with query parameters
curl "http://localhost:3000/cities?country_iso2=US&search=los"
```