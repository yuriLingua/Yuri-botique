import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createAuth, credentialsConfigured } from '../server/auth.js';

const origin = 'https://boutique.test';
const env = { DATABASE_URL: 'postgresql://example.invalid/test', ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'A-long-test-password-5842', NODE_ENV: 'production' };
let db;
const query = async (text, parameters = []) => (await db.query(text, parameters)).rows;
const authFor = (overrides = {}, options = {}) => createAuth({ ...env, ...overrides }, { query, getClientAddress: () => '192.0.2.14', ...options });
const request = (path, { body, method = 'POST', headers = {} } = {}) => new Request(origin + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
const login = (auth, body = { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }, headers = {}) => auth.handleRequest(request('/api/auth/login', { body, headers }));
const cookieOf = (response) => response.headers.get('set-cookie').split(';')[0];
const identity = (auth, cookie) => auth.getIdentity(request('/api/me', { method: 'GET', headers: { Cookie: cookie } }));
const clear = () => db.exec('DELETE FROM admin_sessions; DELETE FROM admin_login_attempts;');

before(async () => {
  db = new PGlite();
  await db.exec(await readFile(new URL('../db/migrations/002_admin_sessions.sql', import.meta.url), 'utf8'));
});
after(async () => db.close());

test('login cria sessão opaca protegida; banco guarda somente hash e sessão restaura em outra instância', async () => {
  await clear();
  const auth = authFor();
  const response = await login(auth);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^__Host-yuri_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/);
  const token = cookieOf(response).split('=')[1];
  const rows = await query('SELECT * FROM admin_sessions');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, createHash('sha256').update(token).digest('hex'));
  assert.doesNotMatch(JSON.stringify(rows), new RegExp(token));
  assert.equal(JSON.stringify(rows).includes(env.ADMIN_PASSWORD), false);
  assert.deepEqual(await identity(auth, cookieOf(response)), { id: 'owner', email: env.ADMIN_EMAIL });
  assert.deepEqual(await identity(authFor(), cookieOf(response)), { id: 'owner', email: env.ADMIN_EMAIL });
});

test('logout revoga sessão persistente e limpa cookie; cookie falso ou headers Sites não autenticam', async () => {
  await clear();
  const auth = authFor();
  const response = await login(auth);
  const cookie = cookieOf(response);
  assert.equal(await identity(auth, '__Host-yuri_session=' + 'a'.repeat(43)), null);
  const forged = request('/api/me', { method: 'GET', headers: { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': env.ADMIN_EMAIL } });
  assert.equal(await auth.getIdentity(forged), null);
  const logout = await auth.handleRequest(request('/api/auth/logout', { headers: { Cookie: cookie } }));
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(await identity(auth, cookie), null);
});

test('sessões expiradas e mudança de senha invalidam sessões anteriores', async () => {
  await clear();
  const auth = authFor();
  const first = await login(auth);
  const cookie = cookieOf(first);
  const changed = authFor({ ADMIN_PASSWORD: 'Another-long-test-password-452' });
  assert.equal(await identity(changed, cookie), null);
  assert.ok(await identity(auth, cookie));
  await query("UPDATE admin_sessions SET expires_at = now() - interval '1 second'");
  assert.equal(await identity(auth, cookie), null);
});

test('senhas incorretas e contas desconhecidas dão erro genérico; limite persistente bloqueia sexta tentativa', async () => {
  await clear();
  let auth = authFor();
  let response = await login(auth, { email: 'other@example.com', password: env.ADMIN_PASSWORD });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'INVALID_CREDENTIALS');
  for (let index = 0; index < 4; index++) {
    auth = authFor();
    response = await login(auth, { email: env.ADMIN_EMAIL, password: 'incorrect-password' });
    assert.equal(response.status, 401);
  }
  response = await login(authFor(), { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '900');
  await query("UPDATE admin_login_attempts SET window_started_at = now() - interval '16 minutes'");
  response = await login(authFor());
  assert.equal(response.status, 200);
});

test('origem externa e ausência Origin em produção são bloqueadas antes de verificar credenciais', async () => {
  await clear();
  const auth = authFor();
  assert.equal((await login(auth, undefined, { Origin: 'https://other.test' })).status, 403);
  assert.equal((await login(auth, undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const absent = new Request(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
  assert.equal((await auth.handleRequest(absent)).status, 403);
  assert.equal((await query('SELECT * FROM admin_login_attempts')).length, 0);
});

test('configuração ausente ou fraca falha fechada, sem senha padrão', async () => {
  await clear();
  assert.equal(credentialsConfigured({}), false);
  assert.equal(credentialsConfigured({ ...env, ADMIN_PASSWORD: 'short' }), false);
  assert.equal(credentialsConfigured({ ...env, ADMIN_EMAIL: 'invalid' }), false);
  for (const overrides of [{ DATABASE_URL: '' }, { ADMIN_PASSWORD: '' }, { ADMIN_PASSWORD: 'short' }, { ADMIN_EMAIL: '' }]) {
    const auth = authFor(overrides);
    assert.equal(auth.configured, false);
    assert.equal((await login(auth)).status, 503);
    assert.equal(await auth.getIdentity(request('/api/me', { method: 'GET' })), null);
  }
});

test('requisições inválidas são limitadas e falhas do banco não vazam credenciais', async () => {
  await clear();
  const auth = authFor();
  assert.equal(await auth.handleRequest(request('/api/catalog', { method: 'GET' })), null);
  assert.equal((await auth.handleRequest(request('/api/auth/login', { method: 'GET' }))).status, 405);
  assert.equal((await login(auth, '{')).status, 400);
  assert.equal((await login(auth, { email: env.ADMIN_EMAIL, password: 'x'.repeat(20_000) })).status, 413);
  assert.equal((await login(auth, { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }, { 'Content-Type': 'text/plain' })).status, 415);
  const unavailable = authFor({}, { query: async () => { throw new Error('postgresql://secret:password@private.example/db'); } });
  const response = await login(unavailable);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private|secret|postgresql:\/\//);
});
