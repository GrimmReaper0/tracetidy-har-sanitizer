/** Synthetic, non-production fixture. Every credential and identity is fake. */
export function createDemoHar() {
  const definitions = [
    ['GET', 'https://app.example.test/dashboard', 200, 0, 168, 15432, 'text/html'],
    ['GET', 'https://app.example.test/assets/app.css', 200, 90, 82, 8460, 'text/css'],
    ['GET', 'https://app.example.test/assets/app.js', 200, 105, 284, 138400, 'application/javascript'],
    ['GET', 'https://api.example.test/v1/profile?email=alex%40example.test', 200, 390, 186, 920, 'application/json'],
    ['GET', 'https://api.example.test/v1/projects?token=DEMO_ONLY_NOT_A_REAL_SECRET&limit=20', 200, 395, 1240, 6840, 'application/json'],
    ['GET', 'https://api.example.test/v1/notifications', 503, 405, 2170, 184, 'application/json'],
    ['GET', 'https://cdn.example.test/avatar/alex.png', 200, 430, 248, 24200, 'image/png'],
    ['POST', 'https://api.example.test/v1/events', 202, 610, 112, 2, 'application/json'],
    ['GET', 'https://api.example.test/v1/projects/42/activity', 200, 1650, 745, 3270, 'application/json'],
    ['GET', 'https://api.example.test/v1/notifications?retry=1', 200, 2900, 430, 1230, 'application/json'],
    ['POST', 'https://api.example.test/v1/session/refresh', 401, 3400, 180, 64, 'application/json'],
    ['GET', 'https://api.example.test/v1/stream', 0, 3600, 320, -1, 'text/event-stream'],
  ];
  return {
    log: {
      version: '1.2', creator: { name: 'Synthetic fixture', version: '1.0' },
      browser: { name: 'Demo Browser', version: '1.0' },
      pages: [{ id: 'private-page-id', title: 'Alex Example - private dashboard', startedDateTime: '2026-01-01T10:00:00.000Z', pageTimings: { onContentLoad: 612, onLoad: 2400 } }],
      entries: definitions.map(([method, url, status, start, time, bytes, mimeType], i) => ({
        pageref: 'private-page-id', startedDateTime: new Date(Date.UTC(2026, 0, 1, 10) + start).toISOString(), time,
        request: {
          method, url, httpVersion: 'HTTP/2',
          headers: [{ name: 'Authorization', value: 'Bearer DEMO_ONLY_NOT_A_REAL_SECRET' }, { name: 'Cookie', value: 'session=DEMO_SESSION' }, { name: 'User-Agent', value: 'Synthetic demo browser' }],
          cookies: [{ name: 'session', value: 'DEMO_SESSION' }],
          queryString: [...new URL(url).searchParams].map(([name, value]) => ({ name, value })),
          ...(method === 'POST' ? { postData: { mimeType: 'application/json', text: '{"email":"alex@example.test","note":"DEMO_PRIVATE_BODY"}' } } : {}),
          headersSize: 300, bodySize: method === 'POST' ? 70 : 0,
        },
        response: {
          status, statusText: status === 200 ? 'OK' : 'Synthetic response', httpVersion: 'HTTP/2',
          headers: [{ name: 'Content-Type', value: mimeType }, { name: 'Set-Cookie', value: 'session=DEMO_RESPONSE_SESSION; HttpOnly' }],
          cookies: [{ name: 'session', value: 'DEMO_RESPONSE_SESSION' }],
          content: { size: Math.max(bytes, 0), mimeType, text: 'DEMO_PRIVATE_RESPONSE_BODY' },
          redirectURL: '', headersSize: 150, bodySize: bytes,
        },
        cache: { beforeRequest: { lastAccess: '2026-01-01T09:00:00.000Z', eTag: 'DEMO_PRIVATE_ETAG', hitCount: 1 } },
        timings: { blocked: 0, dns: i < 3 ? 12 : -1, connect: i < 3 ? 24 : -1, ssl: i < 3 ? 15 : -1, send: 2, wait: time - (i < 3 ? 46 : 10), receive: 8 },
        serverIPAddress: '192.0.2.10', connection: 'DEMO_PRIVATE_CONNECTION',
        _initiator: { type: 'script', url: 'https://app.example.test/private/account/alex' },
      })),
    },
  };
}
