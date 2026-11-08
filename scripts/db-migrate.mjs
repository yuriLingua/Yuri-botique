import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

class MigrationError extends Error {
  constructor(message, code) { super(message); this.name = 'MigrationError'; this.code = code; }
}

/** Migrações usam conexão direta, pois dependem da mesma sessão PostgreSQL. */
export function directDatabaseUrl(env = process.env) {
  const value = String(env.DIRECT_DATABASE_URL || env.DATABASE_URL || '').trim();
  if (!value) throw new MigrationError('Defina DIRECT_DATABASE_URL para preparar o PostgreSQL.', 'DATABASE_NOT_CONFIGURED');
  let url;
  try { url = new URL(value); } catch { throw new MigrationError('A conexão direta do PostgreSQL é inválida.', 'INVALID_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new MigrationError('Use um endereço PostgreSQL válido em DIRECT_DATABASE_URL.', 'INVALID_DATABASE_URL');
  }
  if (url.hostname.includes('-pooler')) {
    throw new MigrationError('As migrações precisam da conexão direta. Defina DIRECT_DATABASE_URL com o pooling desativado no Neon.', 'POOLED_MIGRATION_URL');
  }
  return value;
}

/** Aplica apenas migrações novas, em uma transação, sem inserir dados de exemplo. */
export async function runMigrations(env = process.env, { client: suppliedClient } = {}) {
  const connectionString = directDatabaseUrl(env);
  const directory = fileURLToPath(new URL('../db/migrations/', import.meta.url));
  const names = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
  let client = suppliedClient;
  const applied = [];
  let transaction = false;
  try {
    if (!client) client = new (await import('pg')).default.Client({ connectionString, connectionTimeoutMillis: 15_000 });
    await client.connect?.();
    await client.query('BEGIN');
    transaction = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('yuri_araujo_schema_migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS store_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of names) {
      const sql = await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query('SELECT checksum FROM store_schema_migrations WHERE name = $1', [name]);
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum) throw new MigrationError('Uma migração já aplicada foi alterada. Restaure o arquivo original e crie uma nova migração.', 'MIGRATION_CHANGED');
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO store_schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
      applied.push(name);
    }
    await client.query('COMMIT');
    transaction = false;
    return { applied };
  } catch (error) {
    if (transaction) { try { await client.query('ROLLBACK'); } catch { /* preservar erro seguro abaixo */ } }
    if (error instanceof MigrationError) throw error;
    const code = /^[A-Z0-9_]{1,40}$/.test(error?.code || '') ? error.code : 'DATABASE_MIGRATION_FAILED';
    throw new MigrationError('Não foi possível preparar o PostgreSQL. Verifique a conexão direta, as permissões e as migrações.', code);
  } finally {
    try { await client?.end?.(); } catch { /* não divulgar erros do driver */ }
  }
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) {
  try {
    const { applied } = await runMigrations();
    for (const name of applied) console.log(`Migração aplicada: ${name}`);
    console.log('PostgreSQL preparado. Nenhum produto ou propaganda de demonstração foi inserido.');
  } catch (error) {
    console.error(`${error.message} (${error.code})`);
    process.exitCode = 1;
  }
}
