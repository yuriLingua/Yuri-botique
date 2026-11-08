import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { credentialsConfigured } from './auth.js';
import { databaseConfigured } from './database.js';
import { applicationOrigin, createStoreServer } from './index.js';
import { runMigrations } from '../scripts/db-migrate.mjs';

export function validateConfiguration(env = process.env) {
  if (env.NODE_ENV === 'production') {
    if (!databaseConfigured(env)) throw new Error('Defina o segredo DATABASE_URL do PostgreSQL Neon no Render.');
    if (!env.DIRECT_DATABASE_URL?.trim()) throw new Error('Defina o segredo DIRECT_DATABASE_URL, conexão direta usada nas migrações.');
    if (!credentialsConfigured(env)) throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD com pelo menos 12 caracteres no Render.');
    if (!applicationOrigin(env).startsWith('https://')) throw new Error('APP_URL ou RENDER_EXTERNAL_URL deve usar HTTPS em produção.');
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT precisa ser uma porta válida.');
  return { port };
}

export async function start(env = process.env) {
  const { port } = validateConfiguration(env);
  await access(fileURLToPath(new URL('../dist/client/index.html', import.meta.url)));
  if (databaseConfigured(env)) {
    const { applied } = await runMigrations(env);
    console.log(`Banco preparado; ${applied.length} migração(ões) aplicada(s).`);
  } else {
    console.log('Demonstração local: PostgreSQL ausente. Alterações não são persistidas.');
  }
  const server = createStoreServer({ env });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  console.log(env.NODE_ENV === 'production' ? 'Loja iniciada no Render.' : `Loja local: http://localhost:${port}`);
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8_000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  start().catch((error) => {
    const safe = /^(Defina |PORT |APP_URL |Origem da |Não foi possível |A migração |A conexão |Use )/.test(error?.message || '');
    console.error(safe ? error.message : 'Não foi possível iniciar a loja. Confira a configuração, as migrações e o build.');
    process.exitCode = 1;
  });
}
