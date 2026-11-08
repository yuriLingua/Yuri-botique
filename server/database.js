import { ApiError } from './validation.js';

export function databaseConfigured(env = {}) {
  return typeof env.DATABASE_URL === 'string' && env.DATABASE_URL.trim().length > 0;
}

export async function createQuery(env = {}) {
  if (!databaseConfigured(env)) {
    throw new ApiError(503, 'O PostgreSQL ainda não foi conectado. Esta loja está em modo de demonstração.', 'DATABASE_NOT_CONFIGURED');
  }
  let url;
  try { url = new URL(env.DATABASE_URL); } catch {
    throw new ApiError(503, 'A conexão com o PostgreSQL precisa ser configurada pelo responsável pela loja.', 'DATABASE_CONFIGURATION_ERROR');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new ApiError(503, 'A conexão com o PostgreSQL precisa ser configurada pelo responsável pela loja.', 'DATABASE_CONFIGURATION_ERROR');
  }
  // O servidor consulta o PostgreSQL Neon pelo driver HTTP existente.
  // Credenciais permanecem somente no ambiente do servidor.
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(env.DATABASE_URL);
  return async (statement, parameters = []) => sql.query(statement, parameters);
}
