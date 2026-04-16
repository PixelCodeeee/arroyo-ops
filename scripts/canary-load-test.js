import http from 'k6/http';
import { check, sleep } from 'k6';

// ─────────────────────────────────────────
// Arroyo Seco — Canary Load Test
// Adapted for:
//   - GCLB routing (/api/* → backend, else → frontend)
//   - Service rate limits (100 req/15min per IP per service)
//   - Auth service returning 400 for non-existent users
//
// Usage (GitHub Actions):
//   k6 run scripts/canary-load-test.js
//
// Usage (local dry-run):
//   k6 run --dry-run scripts/canary-load-test.js
// ─────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'https://arroyoseco.online';

export const options = {
  // Keep VU count low to stay under rate limits (100 req/15min per service)
  // 5 VUs × ~2 min = ~60 iterations × 3 backend requests = ~180 total
  // Spread across 2 services: ~60 to auth, ~120 to catalog → under 100 each
  stages: [
    { duration: '20s', target: 5 },    // ramp up to 5 users
    { duration: '1m',  target: 5 },    // hold steady
    { duration: '10s', target: 0 },    // ramp down
  ],

  // Fail the test (and block traffic shift) if:
  thresholds: {
    http_req_failed: ['rate<0.01'],           // <1% HTTP error rate
    http_req_duration: ['p(95)<2000'],        // 95th percentile < 2s
  },

  // Optional: send results to k6 Cloud if token is set
  cloud: {
    projectID: __ENV.K6_PROJECT_ID || undefined,
    name: 'Arroyo Seco Canary Load Test',
  },
};

// ─────────────────────────────────────────
// Test Scenarios
// Uses /api/ paths only (GCLB routes /api/* to backend)
// ─────────────────────────────────────────

export default function () {
  // Scenario 1: GCP/Gateway Health Check (routed via /api/)
  // The gateway has a catch-all at GET /api/ that returns 200
  const healthRes = http.get(`${BASE_URL}/api/`, {
    tags: { endpoint: 'gateway_health' },
  });

  check(healthRes, {
    'gateway health returns 200': (r) => r.status === 200,
    'gateway health responds in <2s': (r) => r.timings.duration < 2000,
  });

  sleep(2); // Longer pause to stay under rate limits

  // Scenario 2: Login endpoint (POST)
  // Auth service may return: 200 (success), 400 (bad request),
  // 401 (wrong password), or 404 (user not found)
  // All are valid "the server is working" responses
  const loginPayload = JSON.stringify({
    correo: 'loadtest@arroyoseco.test',
    password: 'LoadTest.2026',
  });

  const loginRes = http.post(`${BASE_URL}/api/usuarios/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'login' },
  });

  check(loginRes, {
    'login returns valid response': (r) =>
      [200, 400, 401, 404].includes(r.status),
    'login is not rate-limited': (r) => r.status !== 429,
    'login responds in <2s': (r) => r.timings.duration < 2000,
  });

  sleep(2);

  // Scenario 3: Catalog - Get categories (GET, public endpoint)
  const catalogRes = http.get(`${BASE_URL}/api/categorias`, {
    tags: { endpoint: 'categorias' },
  });

  check(catalogRes, {
    'categorias returns 200': (r) => r.status === 200,
    'categorias is not rate-limited': (r) => r.status !== 429,
    'categorias responds in <2s': (r) => r.timings.duration < 2000,
  });

  sleep(2);
}
