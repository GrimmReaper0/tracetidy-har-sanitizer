import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
const html = await readFile(new URL('../dist/index.html', import.meta.url));
const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' });
    res.end('Method not allowed'); return;
  }
  if (req.url !== '/' && req.url !== '/index.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' });
    res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(req.method === 'HEAD' ? undefined : html);
});
server.on('error', () => { console.error('Cannot start the local server. Is the port already in use?'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`TraceTidy: http://127.0.0.1:${port} (Ctrl+C to stop)`));
