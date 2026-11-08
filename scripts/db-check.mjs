import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Verificação somente de leitura; não mostra conexão, senhas ou dados da loja. */
export async function checkDatabase(env = process.env, { client: suppliedClient } = {}) {
  const connectionString = String(env.DATABASE_URL || env.DIRECT_DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('Defina DATABASE_URL no ambiente para verificar a conexão.');
  let client = suppliedClient;
  try {
    if (!client) client = new (await import('pg')).default.Client({ connectionString, connectionTimeoutMillis: 15_000 });
    await client.connect?.();
    await client.query('SELECT 1');
    const result = await client.query("SELECT to_regclass('public.products') IS NOT NULL AS products, to_regclass('public.ads') IS NOT NULL AS ads, to_regclass('public.admin_sessions') IS NOT NULL AS admin_sessions, to_regclass('public.admin_login_attempts') IS NOT NULL AS admin_login_attempts");
    const missing = Object.entries(result.rows[0]).filter(([, ready]) => !ready).map(([name]) => name);
    return { connected: true, ready: missing.length === 0, missing };
  } catch {
    throw new Error('Não foi possível verificar o PostgreSQL. Confira DATABASE_URL e o acesso de rede.');
  } finally {
    try { await client?.end?.(); } catch { /* não divulgar mensagens do driver */ }
  }
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) {
  try {
    const state = await checkDatabase();
    if (!state.ready) {
      console.error('Conexão estabelecida. Execute as migrações antes de usar a loja.');
      process.exitCode = 1;
    } else console.log('Conexão com PostgreSQL e tabelas da loja verificadas.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
