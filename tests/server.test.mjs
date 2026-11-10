import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createStoreServer } from '../server/index.js';
import { validateConfiguration } from '../server/start.mjs';

test('Render Node: loja → login → API → PostgreSQL → catálogo → logout', async () => {
  const db = new PGlite();
  await db.exec(await readFile(new URL('../db/migrations/001_initial.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../db/migrations/002_admin_sessions.sql', import.meta.url), 'utf8'));
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const env = { DATABASE_URL: 'postgresql://test:test@fixture-pooler.neon.tech/test', ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: 'fixture-password-strong-24' };
  const server = createStoreServer({ env, query });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = (path, options) => fetch(origin + path, options);
  let cookie = '';
  const mutate = (path, method, data, additional = {}) => get(path, { method, headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie, ...additional }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  try {
    for (const path of ['/', '/admin', '/admin/']) {
      const response = await get(path);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      if (path === '/admin') {
        const policy = new Map(response.headers.get('content-security-policy').split(';').map((directive) => {
          const [name, ...sources] = directive.trim().split(/\s+/);
          return [name, sources];
        }));
        assert.ok(policy.get('img-src').includes('blob:'), 'A prévia da foto selecionada precisa permitir URLs blob:');
        assert.deepEqual(policy.get('script-src'), ["'self'"], 'A permissão para fotos não pode liberar scripts blob:');
        assert.deepEqual(policy.get('object-src'), ["'none'"]);
      }
      assert.match(await response.text(), /Yuri Araújo Boutique/);
    }
    assert.equal((await get('/healthz')).status, 200);
    assert.equal((await get('/.env')).status, 404);
    assert.equal((await get('/%2eenv')).status, 404);
    const image = await get('/assets/hero.png');
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual([...new Uint8Array(await image.arrayBuffer()).slice(0, 4)], [137, 80, 78, 71]);
    const css = await get('/app.css');
    assert.match(css.headers.get('content-type'), /text\/css/);
    assert.ok((await css.text()).length > 1000);
    const sql = await get('/schema-postgresql.sql');
    assert.match(await sql.text(), /CREATE TABLE IF NOT EXISTS admin_sessions/);
    assert.equal((await get('/api/admin/products', { headers: { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': env.ADMIN_EMAIL } })).status, 401);
    assert.equal((await (await get('/api/me')).json()).authenticated, false);
    assert.equal((await mutate('/api/auth/login', 'POST', { email: env.ADMIN_EMAIL, password: 'wrong-password' })).status, 401);
    const login = await mutate('/api/auth/login', 'POST', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    cookie = login.headers.get('set-cookie').split(';')[0];
    const me = await (await get('/api/me', { headers: { Cookie: cookie } })).json();
    assert.equal(me.isAdmin, true);
    assert.equal(me.mode, 'live');
    const createdResponse = await mutate('/api/admin/products', 'POST', { name: 'Sandália de teste', category: 'shoes', description: 'Descrição cadastrada', price: 15590, images: ['https://images.example.test/sandalia.jpg'], sizes: ['36', '37'], available: true, featured: false });
    assert.equal(createdResponse.status, 201);
    const { product } = await createdResponse.json();
    const stored = await (await get('/api/catalog')).json();
    assert.equal(stored.products[0].name, 'Sandália de teste');
    assert.equal(stored.products[0].price, 15590);
    assert.equal((await mutate(`/api/admin/products/${product.id}`, 'PATCH', { price: 100 }, { Origin: 'https://outsider.example' })).status, 403);
    assert.equal((await mutate(`/api/admin/products/${product.id}`, 'PATCH', { price: null })).status, 200);
    const adResponse = await mutate('/api/admin/ads', 'POST', { title: 'Propaganda cadastrada', image_url: 'https://images.example.test/anuncio.jpg', target_url: '', placement: 'sidebar', active: true });
    assert.equal(adResponse.status, 201);
    const { ad } = await adResponse.json();
    assert.equal((await (await get('/api/catalog')).json()).ads.length, 1);
    assert.equal((await mutate(`/api/admin/ads/${ad.id}`, 'PATCH', { active: false })).status, 200);
    assert.equal((await (await get('/api/catalog')).json()).ads.length, 0);
    assert.equal((await mutate(`/api/admin/ads/${ad.id}`, 'DELETE')).status, 200);
    assert.equal((await mutate(`/api/admin/products/${product.id}`, 'DELETE')).status, 200);
    const logout = await mutate('/api/auth/logout', 'POST');
    assert.equal(logout.status, 200);
    assert.equal((await get('/api/admin/products', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await (await get('/api/catalog')).json()).products.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});

test('Produção exige PostgreSQL, migração direta, credenciais e origem HTTPS', () => {
  assert.throws(() => validateConfiguration({ NODE_ENV: 'production' }), /DATABASE_URL/);
  const config = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://fixture:fixture@fixture-pooler.neon.tech/test', DIRECT_DATABASE_URL: 'postgresql://fixture:fixture@fixture.neon.tech/test', ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: 'fixture-password-strong-24', RENDER_EXTERNAL_URL: 'https://example.onrender.com' };
  assert.equal(validateConfiguration(config).port, 3000);
  assert.throws(() => validateConfiguration({ ...config, ADMIN_PASSWORD: 'weak' }), /ADMIN_PASSWORD/);
  assert.throws(() => validateConfiguration({ ...config, APP_URL: 'http://example.test' }), /HTTPS/);
});
