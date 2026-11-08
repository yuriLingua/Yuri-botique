import { createQuery, databaseConfigured } from './database.js';
import { createAuth } from './auth.js';
import { ApiError, readJson, validateAd, validateId, validateProduct } from './validation.js';

const productColumns = 'id::text, name, category, description, price, images, sizes, available, featured, created_at, updated_at';
const adColumns = 'id::text, title, image_url, target_url, placement, active, created_at, updated_at';
const configs = {
  products: { table: 'products', columns: productColumns, singular: 'product', validate: validateProduct, jsonFields: ['images'], order: 'featured DESC, created_at DESC, id DESC' },
  ads: { table: 'ads', columns: adColumns, singular: 'ad', validate: validateAd, jsonFields: [], order: 'created_at DESC, id DESC' },
};

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

async function authorize(request, env, auth) {
  if (!databaseConfigured(env)) {
    throw new ApiError(503, 'Conecte o PostgreSQL para salvar produtos e propagandas. As alterações da demonstração não são gravadas.', 'DATABASE_NOT_CONFIGURED');
  }
  if (!auth.configured) {
    throw new ApiError(503, 'O acesso administrativo ainda precisa ser configurado pelo responsável pela loja.', 'ADMIN_NOT_CONFIGURED');
  }
  const identity = await auth.getIdentity(request);
  if (!identity) throw new ApiError(401, 'Entre com sua conta para acessar a administração.', 'AUTHENTICATION_REQUIRED');
  if (identity.email?.toLowerCase() !== env.ADMIN_EMAIL?.trim().toLowerCase()) throw new ApiError(403, 'Esta conta não tem permissão para administrar a loja.', 'FORBIDDEN');
  const origin = request.headers.get('origin');
  const mutation = !['GET', 'HEAD'].includes(request.method);
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin) || (mutation && env.NODE_ENV === 'production' && !origin)) {
    throw new ApiError(403, 'A solicitação deve ser feita pela própria loja.', 'ORIGIN_REJECTED');
  }
}

function methodNotAllowed(allowed) {
  return json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' }, 405, { Allow: allowed.join(', ') });
}

function dbValue(config, field, value) {
  return config.jsonFields.includes(field) ? JSON.stringify(value) : value;
}

async function mutateResource(request, query, config, id) {
  if (request.method === 'POST') {
    const values = config.validate(await readJson(request));
    const fields = Object.keys(values);
    const parameters = [crypto.randomUUID(), ...fields.map((field) => dbValue(config, field, values[field]))];
    const placeholders = fields.map((field, index) => `$${index + 2}${config.jsonFields.includes(field) ? '::jsonb' : ''}`);
    const rows = await query(`INSERT INTO ${config.table} (id, ${fields.join(', ')}) VALUES ($1::uuid, ${placeholders.join(', ')}) RETURNING ${config.columns}`, parameters);
    return json({ [config.singular]: rows[0] }, 201);
  }
  if (request.method === 'PATCH' || request.method === 'PUT') {
    const values = config.validate(await readJson(request), { partial: request.method === 'PATCH' });
    const fields = Object.keys(values);
    const parameters = [...fields.map((field) => dbValue(config, field, values[field])), id];
    const setters = fields.map((field, index) => `${field} = $${index + 1}${config.jsonFields.includes(field) ? '::jsonb' : ''}`);
    const rows = await query(`UPDATE ${config.table} SET ${setters.join(', ')}, updated_at = now() WHERE id = $${parameters.length}::uuid RETURNING ${config.columns}`, parameters);
    if (!rows.length) throw new ApiError(404, 'O cadastro não foi encontrado.', 'NOT_FOUND');
    return json({ [config.singular]: rows[0] });
  }
  const rows = await query(`DELETE FROM ${config.table} WHERE id = $1::uuid RETURNING id`, [id]);
  if (!rows.length) throw new ApiError(404, 'O cadastro não foi encontrado.', 'NOT_FOUND');
  return json({ ok: true });
}

export async function handleApi(request, env = {}, options = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  const path = url.pathname.replace(/\/$/, '');
  try {
    const auth = options.auth || createAuth(env, { query: options.query });
    const authResponse = await auth.handleRequest(request);
    if (authResponse) return authResponse;
    if (path === '/api/me') {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      const identity = await auth.getIdentity(request);
      return json({
        authenticated: Boolean(identity),
        isAdmin: Boolean(identity && identity.email?.toLowerCase() === env.ADMIN_EMAIL?.trim().toLowerCase()),
        mode: databaseConfigured(env) ? 'live' : 'demo',
        configured: databaseConfigured(env) && auth.configured,
        databaseConfigured: databaseConfigured(env),
        adminConfigured: auth.configured,
        identity,
        authProvider: 'password',
      });
    }
    if (path === '/api/catalog') {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      if (!databaseConfigured(env)) return json({ mode: 'demo', products: [], ads: [] });
      const query = options.query || await createQuery(env);
      const [products, ads] = await Promise.all([
        query(`SELECT ${productColumns} FROM products ORDER BY featured DESC, created_at DESC, id DESC`),
        query(`SELECT ${adColumns} FROM ads WHERE active = true ORDER BY created_at DESC, id DESC`),
      ]);
      return json({ mode: 'live', products, ads });
    }
    const match = /^\/api\/admin\/(products|ads)(?:\/([^/]+))?$/.exec(path);
    if (!match) return json({ error: 'Esta rota não existe.', code: 'NOT_FOUND' }, 404);
    const [, resource, rawId] = match;
    const config = configs[resource];
    const allowed = rawId ? ['GET', 'PATCH', 'PUT', 'DELETE'] : ['GET', 'POST'];
    if (!allowed.includes(request.method)) return methodNotAllowed(allowed);
    await authorize(request, env, auth);
    const id = rawId ? validateId(rawId) : null;
    const query = options.query || await createQuery(env);
    if (request.method === 'GET') {
      const rows = id
        ? await query(`SELECT ${config.columns} FROM ${config.table} WHERE id = $1::uuid`, [id])
        : await query(`SELECT ${config.columns} FROM ${config.table} ORDER BY ${config.order}`);
      if (id && !rows.length) throw new ApiError(404, 'O cadastro não foi encontrado.', 'NOT_FOUND');
      return json(id ? { [config.singular]: rows[0] } : { [resource]: rows });
    }
    return await mutateResource(request, query, config, id);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
    // Nunca repassar erro do driver: ele pode conter SQL, host ou credenciais.
    return json({ error: 'Não foi possível acessar o PostgreSQL. Verifique a conexão e a instalação do banco e tente novamente.', code: 'DATABASE_UNAVAILABLE' }, 503);
  }
}

export default handleApi;
