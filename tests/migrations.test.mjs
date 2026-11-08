import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { directDatabaseUrl, runMigrations } from '../scripts/db-migrate.mjs';
import { checkDatabase } from '../scripts/db-check.mjs';

const env = { DIRECT_DATABASE_URL: 'postgresql://test:fictional@direct.example.test/store' };

function clientFor(database) {
  return {
    async connect() {}, async end() {},
    async query(sql, params = []) {
      if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] };
      if (!params.length && sql.trim().split(';').filter((part) => part.trim()).length > 1) {
        await database.exec(sql); return { rows: [] };
      }
      return database.query(sql, params);
    },
  };
}

test('migrações exigem conexão direta e preferem DIRECT_DATABASE_URL', () => {
  assert.throws(() => directDatabaseUrl({}), /DIRECT_DATABASE_URL/);
  assert.throws(() => directDatabaseUrl({ DATABASE_URL: 'postgresql://user:secret@ep-foo-pooler.neon.tech/store' }), /pooling desativado/);
  assert.throws(() => directDatabaseUrl({ DIRECT_DATABASE_URL: 'https://example.com' }), /PostgreSQL válido/);
  assert.equal(directDatabaseUrl({ ...env, DATABASE_URL: 'postgresql://user:secret@ep-foo-pooler.neon.tech/store' }), env.DIRECT_DATABASE_URL);
  assert.equal(directDatabaseUrl({ DATABASE_URL: env.DIRECT_DATABASE_URL }), env.DIRECT_DATABASE_URL);
});

test('migrações aplicam esquema, são idempotentes e não inserem produtos demonstrativos', async () => {
  const database = new PGlite();
  const client = clientFor(database);
  try {
    const first = await runMigrations(env, { client });
    assert.ok(first.applied.includes('001_initial.sql'));
    assert.deepEqual((await database.query('SELECT count(*)::int AS total FROM products')).rows, [{ total: 0 }]);
    await database.query("INSERT INTO products (id,name,category,images) VALUES ('00000000-0000-4000-8000-000000000001','Produto existente','shoes','[\"https://example.com/photo.jpg\"]')");
    assert.deepEqual(await runMigrations(env, { client }), { applied: [] });
    assert.equal((await database.query('SELECT name FROM products')).rows[0].name, 'Produto existente');
    const state = await checkDatabase({ DATABASE_URL: env.DIRECT_DATABASE_URL }, { client });
    assert.equal(state.connected, true);
    assert.equal(state.ready, true);
    assert.deepEqual(state.missing, []);
  } finally { await database.close(); }
});

test('checksum de migração aplicada não pode mudar silenciosamente', async () => {
  const database = new PGlite();
  const client = clientFor(database);
  try {
    await runMigrations(env, { client });
    await database.query("UPDATE store_schema_migrations SET checksum = 'alterado' WHERE name = '001_initial.sql'");
    await assert.rejects(runMigrations(env, { client }), (error) => error.code === 'MIGRATION_CHANGED' && /já aplicada/.test(error.message));
    assert.equal((await database.query("SELECT checksum FROM store_schema_migrations WHERE name='001_initial.sql'")).rows[0].checksum, 'alterado');
  } finally { await database.close(); }
});

test('falha do driver não expõe credenciais e fecha a conexão', async () => {
  let closed = false;
  const secret = 'postgresql://private:password@secret-host/private';
  await assert.rejects(runMigrations(env, { client: {
    async connect() { throw Object.assign(new Error(secret), { code: 'ECONNREFUSED' }); },
    async end() { closed = true; },
  } }), (error) => error.code === 'ECONNREFUSED' && !error.message.includes(secret) && !error.message.includes('password'));
  assert.equal(closed, true);
});

test('verificação informa tabelas pendentes sem alterar banco vazio', async () => {
  const database = new PGlite();
  try {
    const state = await checkDatabase({ DATABASE_URL: env.DIRECT_DATABASE_URL }, { client: clientFor(database) });
    assert.equal(state.ready, false);
    assert.deepEqual(state.missing, ['products', 'ads', 'admin_sessions', 'admin_login_attempts']);
    assert.equal((await database.query("SELECT count(*)::int AS total FROM information_schema.tables WHERE table_schema='public'")).rows[0].total, 0);
  } finally { await database.close(); }
});
