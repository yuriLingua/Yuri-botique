import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import handleApi from '../server/api.js';
import { credentialsConfigured } from '../server/auth.js';
import { MAX_BODY_BYTES } from '../server/validation.js';

const origin = 'https://boutique.example';
const connection = 'postgresql://private-user:never-expose-this@private-db.neon.tech/boutique';
const env = { DATABASE_URL: connection, ADMIN_EMAIL: 'yuri@example.com', ADMIN_PASSWORD: 'test-only-password-strong' };
const ownerHeaders = {
  'content-type': 'application/json',
  cookie: 'test-admin-session=owner',
  origin,
};
const testAuth = (config) => ({
  configured: Boolean(config.DATABASE_URL) && credentialsConfigured(config),
  handleRequest: async () => null,
  getIdentity: async (request) => {
    const cookie = request.headers.get('cookie');
    if (cookie === 'test-admin-session=owner') return { id: 'owner', email: 'yuri@example.com' };
    if (cookie === 'test-admin-session=visitor') return { id: 'visitor', email: 'visitor@example.com' };
    return null;
  },
});
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGmQAAAAASUVORK5CYII=';
const productInput = () => ({
  name: 'Sandália de teste', category: 'shoes', description: 'Produto de teste',
  price: 12990, images: [photo], sizes: ['36', '37'], available: true, featured: false,
});
const adInput = () => ({
  title: 'Campanha de teste', image_url: 'https://images.example/banner.jpg',
  target_url: 'https://example.com/oferta', placement: 'top', active: true,
});

describe('PostgreSQL API', () => {
  let db;
  let schema;
  const query = async (statement, parameters = []) => (await db.query(statement, parameters)).rows;

  async function api(path, { method = 'GET', body, headers = ownerHeaders, config = env, executor = query } = {}) {
    const request = new Request(`${origin}${path}`, {
      method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const response = await handleApi(request, config, { query: executor, auth: testAuth(config) });
    return { response, status: response.status, data: await response.json() };
  }

  before(async () => {
    schema = await readFile(new URL('../db/migrations/001_initial.sql', import.meta.url), 'utf8');
    db = new PGlite();
    await db.exec(schema);
  });
  beforeEach(async () => { await db.exec('TRUNCATE products, ads'); });
  after(async () => { await db.close(); });

  test('schema pode ser reaplicado sem alterar os cadastros', async () => {
    const created = await api('/api/admin/products', { method: 'POST', body: productInput() });
    assert.equal(created.status, 201);
    await db.exec(schema);
    assert.equal((await api('/api/catalog')).data.products.length, 1);
  });

  test('sem banco retorna demonstração e impede gravações', async () => {
    const catalog = await api('/api/catalog', { config: {} });
    assert.deepEqual(catalog.data, { mode: 'demo', products: [], ads: [] });
    const result = await api('/api/admin/products', { method: 'POST', body: productInput(), config: {} });
    assert.equal(result.status, 503);
    assert.equal(result.data.code, 'DATABASE_NOT_CONFIGURED');
    assert.equal((await api('/api/me', { config: {} })).data.configured, false);
  });

  test('administração exige identidade e autorização configurada no servidor', async () => {
    assert.equal((await api('/api/admin/products', { headers: {} })).status, 401);
    assert.equal((await api('/api/admin/products', { headers: { ...ownerHeaders, cookie: 'test-admin-session=visitor' } })).status, 403);
    const unconfigured = await api('/api/admin/products', { config: { DATABASE_URL: connection } });
    assert.equal(unconfigured.status, 503);
    assert.equal(unconfigured.data.code, 'ADMIN_NOT_CONFIGURED');
    const identified = await api('/api/me');
    assert.equal(identified.data.isAdmin, true);
    assert.equal(identified.data.identity.id, 'owner');
    const differentOwner = { ...env, ADMIN_EMAIL: 'another@example.com' };
    assert.equal((await api('/api/admin/products', { config: differentOwner })).status, 403);
    assert.equal((await api('/api/admin/products', { headers: { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'yuri@example.com' } })).status, 401);
  });

  test('origem externa não pode alterar cadastros mesmo com identidade', async () => {
    const result = await api('/api/admin/products', {
      method: 'POST', body: productInput(), headers: { ...ownerHeaders, origin: 'https://other.example' },
    });
    assert.equal(result.status, 403);
    assert.equal(result.data.code, 'ORIGIN_REJECTED');
    assert.equal((await api('/api/admin/products')).data.products.length, 0);
  });

  test('produto passa por cadastro, leitura, edição e exclusão', async () => {
    const created = await api('/api/admin/products', { method: 'POST', body: productInput() });
    assert.equal(created.status, 201);
    const { product } = created.data;
    assert.match(product.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(product.images, [photo]);
    assert.deepEqual(product.sizes, ['36', '37']);
    assert.equal(product.price, 12990);
    const changed = await api(`/api/admin/products/${product.id}`, {
      method: 'PATCH', body: { price: null, available: false, featured: true, sizes: ['38', '38', '39'] },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.product.name, product.name);
    assert.equal(changed.data.product.price, null);
    assert.deepEqual(changed.data.product.sizes, ['38', '39']);
    assert.equal((await api(`/api/admin/products/${product.id}`)).data.product.available, false);
    assert.equal((await api('/api/catalog', { headers: {} })).data.products[0].featured, true);
    assert.equal((await api(`/api/admin/products/${product.id}`, { method: 'DELETE' })).data.ok, true);
    assert.equal((await api(`/api/admin/products/${product.id}`)).status, 404);
  });

  test('propaganda passa por CRUD e só aparece publicamente quando ativa', async () => {
    const created = await api('/api/admin/ads', { method: 'POST', body: adInput() });
    assert.equal(created.status, 201);
    const { ad } = created.data;
    assert.equal((await api('/api/catalog')).data.ads.length, 1);
    const changed = await api(`/api/admin/ads/${ad.id}`, { method: 'PATCH', body: { active: false, placement: 'sidebar', target_url: '' } });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.ad.placement, 'sidebar');
    assert.equal((await api('/api/catalog')).data.ads.length, 0);
    assert.equal((await api('/api/admin/ads')).data.ads.length, 1);
    assert.equal((await api(`/api/admin/ads/${ad.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await api(`/api/admin/ads/${ad.id}`)).status, 404);
  });

  test('validação impede preços inválidos, campos extras e identificadores injetados', async () => {
    for (const change of [{ price: -1 }, { price: 1.5 }, { category: 'other' }, { id: 'forced-id' }, { images: [] }]) {
      assert.equal((await api('/api/admin/products', { method: 'POST', body: { ...productInput(), ...change } })).status, 400);
    }
    assert.equal((await api('/api/admin/products/not-an-id')).status, 400);
    assert.equal((await api('/api/admin/products/1%27%20OR%20true--', { method: 'DELETE' })).status, 400);
    const injectionName = "'; DROP TABLE products; --";
    const created = await api('/api/admin/products', { method: 'POST', body: { ...productInput(), name: injectionName } });
    assert.equal(created.status, 201);
    assert.equal((await api('/api/catalog')).data.products[0].name, injectionName);
  });

  test('imagens e links executáveis são rejeitados', async () => {
    for (const image of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGgxPm9pPC9oMT4=', 'file:///etc/passwd']) {
      assert.equal((await api('/api/admin/products', { method: 'POST', body: { ...productInput(), images: [image] } })).status, 400);
    }
    for (const target of ['javascript:alert(1)', 'data:text/html,test', '//other.example', 'https://name:password@example.com']) {
      assert.equal((await api('/api/admin/ads', { method: 'POST', body: { ...adInput(), target_url: target } })).status, 400);
    }
  });

  test('erros de conexão não expõem credenciais, SQL nem detalhes do driver', async () => {
    const unavailable = await api('/api/catalog', {
      executor: async () => { throw new Error(`driver: ${connection}; SELECT * FROM products`); },
    });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.data.code, 'DATABASE_UNAVAILABLE');
    const content = JSON.stringify(unavailable.data);
    for (const secret of ['never-expose-this', 'private-db', 'SELECT', 'postgresql://']) assert.equal(content.includes(secret), false);
    assert.equal(unavailable.response.headers.get('cache-control'), 'no-store');
  });

  test('corpo excessivo é recusado pelo tamanho declarado e pelo conteúdo real', async () => {
    const declared = await api('/api/admin/products', {
      method: 'POST', body: productInput(), headers: { ...ownerHeaders, 'content-length': String(MAX_BODY_BYTES + 1) },
    });
    assert.equal(declared.status, 413);
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(MAX_BODY_BYTES));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    } });
    const request = new Request(`${origin}/api/admin/products`, { method: 'POST', headers: ownerHeaders, body: stream, duplex: 'half' });
    const response = await handleApi(request, env, { query, auth: testAuth(env) });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, 'BODY_TOO_LARGE');
  });

  test('métodos indevidos e JSON malformado retornam erros de requisição', async () => {
    const invalidMethod = await api('/api/catalog', { method: 'POST' });
    assert.equal(invalidMethod.status, 405);
    assert.equal(invalidMethod.response.headers.get('allow'), 'GET');
    const request = new Request(`${origin}/api/admin/products`, { method: 'POST', headers: ownerHeaders, body: '{invalid' });
    assert.equal((await handleApi(request, env, { query, auth: testAuth(env) })).status, 400);
    const wrongType = new Request(`${origin}/api/admin/products`, { method: 'POST', headers: { ...ownerHeaders, 'content-type': 'text/plain' }, body: '{}' });
    assert.equal((await handleApi(wrongType, env, { query, auth: testAuth(env) })).status, 415);
  });
});
