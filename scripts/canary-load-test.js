import http from 'k6/http';
import { check, sleep } from 'k6';

// ─────────────────────────────────────────
// Arroyo Seco — Canary Load Test
// Simulates real user traffic against the canary stack
// before allowing traffic cutover.
//
// Usage (GitHub Actions):
//   k6 run scripts/canary-load-test.js
//
// Usage (local dry-run):
//   k6 run --dry-run scripts/canary-load-test.js
// ─────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'https://arroyoseco.online';

export const options = {
  // Ramp from 10 → 20 users, hold, then ramp down
  stages: [
    { duration: '30s', target: 10 },   // ramp up to 10 users
    { duration: '1m', target: 20 },   // hold at 20 users
    { duration: '30s', target: 0 },    // ramp down
  ],

  // Fail the test (and block traffic shift) if:
  thresholds: {
    http_req_failed: ['rate<0.01'],           // <1% error rate
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
// ─────────────────────────────────────────

export default function () {
  // Scenario 1: Login endpoint (POST)
  const loginPayload = JSON.stringify({
    correo: 'loadtest@arroyoseco.test',
    password: 'LoadTest.2026',
  });

  const loginRes = http.post(`${BASE_URL}/api/usuarios/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'login' },
  });

  check(loginRes, {
    'login returns 200 or 401': (r) => r.status === 200 || r.status === 401,
    'login responds in <2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);

  // Scenario 2: Catalog - Get categories (GET)
  const catalogRes = http.get(`${BASE_URL}/api/categorias`, {
    tags: { endpoint: 'categorias' },
  });

  check(catalogRes, {
    'categorias returns 200': (r) => r.status === 200,
    'categorias responds in <2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);

  // Scenario 3: Catalog - Get oferentes (GET)
  const oferentesRes = http.get(`${BASE_URL}/api/oferentes`, {
    tags: { endpoint: 'oferentes' },
  });

  check(oferentesRes, {
    'oferentes returns 200': (r) => r.status === 200,
    'oferentes responds in <2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);

  // Scenario 4: Health check (GET)
  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { endpoint: 'health' },
  });

  check(healthRes, {
    'health returns 200': (r) => r.status === 200,
    'health body contains OK': (r) => r.body && r.body.includes('OK'),
  });

  sleep(1);
}
