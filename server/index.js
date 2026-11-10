import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.js';
import { createAuth } from './auth.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8' };
const security = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https: http:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
};

export function applicationOrigin(env = {}, incoming) {
  const configured = env.APP_URL || env.RENDER_EXTERNAL_URL;
  if (configured) {
    const parsed = new URL(configured);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Origem da aplicação inválida.');
    return parsed.origin;
  }
  if (env.NODE_ENV === 'production') throw new Error('Defina APP_URL ou RENDER_EXTERNAL_URL antes de iniciar em produção.');
  const host = incoming?.headers.host;
  if (host && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) return 'http://' + host;
  return 'http://127.0.0.1:' + (incoming?.socket.localPort || env.PORT || 3000);
}

function secure(response) {
  for (const [name, value] of Object.entries(security)) response.headers.set(name, value);
  return response;
}

async function send(response, outgoing, head = false) {
  secure(response);
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) if (name !== 'set-cookie') outgoing.setHeader(name, value);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) outgoing.setHeader('Set-Cookie', cookies);
  if (head || !response.body) { outgoing.end(); return; }
  const body = Readable.fromWeb(response.body);
  body.on('error', () => outgoing.destroy());
  body.pipe(outgoing);
}

export function createStoreServer({ env = process.env, query, auth, staticDirectory = path.join(projectRoot, 'dist/client') } = {}) {
  const addresses = new WeakMap();
  // Use the socket address rather than trusting client-supplied forwarding headers.
  // Behind a proxy the limit can be shared; this single-owner panel fails safely.
  const authentication = auth || createAuth(env, { query, getClientAddress: (request) => addresses.get(request) || 'unknown' });
  const server = createServer(async (incoming, outgoing) => {
    try {
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
        await send(new Response('Solicitação inválida.', { status: 400 }), outgoing); return;
      }
      const origin = applicationOrigin(env, incoming);
      const url = new URL(incoming.url, origin);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (name.startsWith('oai-') || name.startsWith('x-internal-') || name === 'host' || value === undefined) continue;
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const method = incoming.method || 'GET';
      const request = new Request(url, { method, headers, ...(!['GET', 'HEAD'].includes(method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}) });
      addresses.set(request, incoming.socket.remoteAddress || 'unknown');
      const apiResponse = await handleApi(request, env, { query, auth: authentication });
      if (apiResponse) { await send(apiResponse, outgoing, method === 'HEAD'); return; }
      if (!['GET', 'HEAD'].includes(method)) { await send(new Response('Método não permitido.', { status: 405, headers: { Allow: 'GET, HEAD' } }), outgoing); return; }
      if (url.pathname === '/healthz') { await send(Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } }), outgoing, method === 'HEAD'); return; }
      if (url.pathname === '/guia-postgresql.txt') {
        await send(new Response(await readFile(path.join(projectRoot, 'README-BANCO.md')), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }), outgoing, method === 'HEAD'); return;
      }
      if (url.pathname === '/schema-postgresql.sql') {
        const files = ['001_initial.sql', '002_admin_sessions.sql'];
        const sql = (await Promise.all(files.map((name) => readFile(path.join(projectRoot, 'db/migrations', name), 'utf8')))).join('\n\n');
        await send(new Response(sql, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="schema-postgresql.sql"', 'Cache-Control': 'no-store' } }), outgoing, method === 'HEAD'); return;
      }
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some((part) => part === '..' || part.startsWith('.'))) {
        await send(new Response('Página não encontrada.', { status: 404 }), outgoing); return;
      }
      const relative = decoded === '/' || decoded === '/admin' || decoded.startsWith('/admin/') ? 'index.html' : decoded.replace(/^\/+/, '');
      const file = path.resolve(staticDirectory, relative);
      if (!file.startsWith(path.resolve(staticDirectory) + path.sep)) { await send(new Response('Página não encontrada.', { status: 404 }), outgoing); return; }
      let info;
      try { info = await stat(file); } catch { await send(new Response('Página não encontrada.', { status: 404 }), outgoing); return; }
      if (!info.isFile()) { await send(new Response('Página não encontrada.', { status: 404 }), outgoing); return; }
      const etag = '"' + info.size.toString(16) + '-' + Math.trunc(info.mtimeMs).toString(16) + '"';
      const responseHeaders = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', ETag: etag, 'Cache-Control': relative === 'index.html' ? 'no-store' : relative.startsWith('assets/') ? 'public, max-age=3600' : 'public, max-age=0, must-revalidate' };
      if (headers.get('if-none-match') === etag) { await send(new Response(null, { status: 304, headers: responseHeaders }), outgoing); return; }
      await send(new Response(method === 'HEAD' ? null : await readFile(file), { headers: responseHeaders }), outgoing, method === 'HEAD');
    } catch {
      if (!outgoing.headersSent) await send(new Response('Não foi possível atender a solicitação. Tente novamente.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }), outgoing);
      else outgoing.destroy();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.maxRequestsPerSocket = 200;
  return server;
}
