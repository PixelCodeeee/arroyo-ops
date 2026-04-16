import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// ─────────────────────────────────────────
// Arroyo Seco — Canary Health Validation
//
// Purpose: Verify canary stack is ALIVE and RESPONDING
// before allowing traffic shift. This is NOT a stress test.
//
// Key insight: downstream services (auth, catalog, etc.)
// see all requests from the Gateway's Docker IP, so the
// 100 req/15min rate limit is per-service GLOBAL.
// A 429 = "server is running" = PASS.
//
// A real failure is: timeout, 5xx, or connection refused.
// ─────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'https://arroyoseco.online';

// Custom metric: track only real server errors (5xx, timeouts)
const serverErrors = new Rate('server_errors');

export const options = {
  stages: [
    { duration: '20s', target: 3 },
    { duration: '40s', target: 3 },
    { duration: '10s', target: 0 },
  ],

  thresholds: {
    // Only fail if we get ACTUAL server errors (5xx/timeouts)
    server_errors: ['rate<0.01'],             // <1% real errors
    http_req_duration: ['p(95)<3000'],         // 95th percentile < 3s
  },

  cloud: {
    projectID: __ENV.K6_PROJECT_ID || undefined,
    name: 'Arroyo Seco Canary Health Check',
  },
};

export default function () {
  // ─── Test 1: Gateway Health (direct, no proxy) ───
  const healthRes = http.get(`${BASE_URL}/api/`, {
    tags: { endpoint: 'gateway_health' },
  });

  const healthOk = healthRes.status === 200;
  serverErrors.add(healthRes.status >= 500 || healthRes.status === 0);

  check(healthRes, {
    'gateway is alive (200)': (r) => r.status === 200,
  });

  sleep(1);

  // ─── Test 2: Login endpoint (via proxy) ───
  const loginPayload = JSON.stringify({
    correo: 'loadtest@arroyoseco.test',
    password: 'LoadTest.2026',
  });

  const loginRes = http.post(`${BASE_URL}/api/usuarios/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'login' },
  });

  // 429 = rate limited (server IS alive), 4xx = valid auth response
  // Only 5xx or 0 (timeout/connection refused) = real problem
  serverErrors.add(loginRes.status >= 500 || loginRes.status === 0);

  check(loginRes, {
    'auth-service responds (not 5xx)': (r) => r.status > 0 && r.status < 500,
    'auth-service latency ok': (r) => r.timings.duration < 3000,
  });

  sleep(1);

  // ─── Test 3: Catalog endpoint (via proxy) ───
  const catalogRes = http.get(`${BASE_URL}/api/categorias`, {
    tags: { endpoint: 'categorias' },
  });

  serverErrors.add(catalogRes.status >= 500 || catalogRes.status === 0);

  check(catalogRes, {
    'catalog-service responds (not 5xx)': (r) => r.status > 0 && r.status < 500,
    'catalog-service latency ok': (r) => r.timings.duration < 3000,
  });

  sleep(1);
}
