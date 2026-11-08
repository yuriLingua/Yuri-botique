import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createQuery, databaseConfigured } from './database.js';
import { ApiError } from './validation.js';

const deriveKey = promisify(scrypt);
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_LOGIN_BYTES = 16 * 1024;
const LOGIN_LIMIT = 5;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const normalizedEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function credentialsConfigured(env = {}) {
  const email = normalizedEmail(env.ADMIN_EMAIL);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length >= 12 && Buffer.byteLength(env.ADMIN_PASSWORD) <= 1024;
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}

function rejectForeignOrigin(request, production) {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin) || (production && !origin)) {
    throw new ApiError(403, 'A solicitação deve ser feita pela própria loja.', 'ORIGIN_REJECTED');
  }
}

async function loginPayload(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new ApiError(415, 'Envie os dados como application/json.', 'UNSUPPORTED_MEDIA_TYPE');
  }
  if (Number(request.headers.get('content-length')) > MAX_LOGIN_BYTES) throw new ApiError(413, 'O formulário excedeu o tamanho permitido.', 'BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Informe e-mail e senha.', 'INVALID_LOGIN');
  const parts = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_LOGIN_BYTES) { await reader.cancel(); throw new ApiError(413, 'O formulário excedeu o tamanho permitido.', 'BODY_TOO_LARGE'); }
    parts.push(value);
  }
  let payload;
  try { payload = JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new ApiError(400, 'O formulário enviado é inválido.', 'INVALID_LOGIN'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.email !== 'string' || typeof payload.password !== 'string'
    || payload.email.length > 254 || Buffer.byteLength(payload.password) > 1024 || Object.keys(payload).some((key) => !['email', 'password'].includes(key))) {
    throw new ApiError(400, 'Informe um e-mail e uma senha válidos.', 'INVALID_LOGIN');
  }
  return { email: normalizedEmail(payload.email), password: payload.password };
}

export function createAuth(env = {}, options = {}) {
  const production = env.NODE_ENV === 'production';
  const configured = databaseConfigured(env) && credentialsConfigured(env);
  const email = normalizedEmail(env.ADMIN_EMAIL);
  const cookieName = production ? '__Host-yuri_session' : 'yuri_session';
  let queryPromise;
  let proofPromise;
  const query = async (statement, parameters = []) => {
    const execute = options.query || await (queryPromise ||= createQuery(env));
    return execute(statement, parameters);
  };
  const proof = () => proofPromise ||= (async () => {
    // The derived key stays in process memory; the database receives only its HMAC version marker.
    const key = await deriveKey(env.ADMIN_PASSWORD, 'yuri-admin-password:v1:' + email, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return { key, version: createHmac('sha256', key).update('yuri-admin-session:v1:' + email).digest('hex') };
  })();
  const sessionToken = (request) => {
    const matches = (request.headers.get('cookie') || '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(cookieName + '='));
    if (matches.length !== 1) return null;
    const value = matches[0].slice(cookieName.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  };
  const sessionCookie = (token = '', seconds = 0) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${production ? '; Secure' : ''}`;
  const unavailable = () => new ApiError(503, 'Não foi possível verificar o acesso administrativo. Tente novamente.', 'AUTH_UNAVAILABLE');

  async function getIdentity(request) {
    if (!configured) return null;
    const token = sessionToken(request);
    if (!token) return null;
    try {
      const { version } = await proof();
      const rows = await query('SELECT email FROM admin_sessions WHERE token_hash = $1 AND credential_hash = $2 AND expires_at > now()', [digest(token), version]);
      return rows.length && rows[0].email === email ? { id: 'owner', email } : null;
    } catch { throw unavailable(); }
  }

  async function consumeAttempt(request, submittedEmail) {
    const rawAddress = typeof options.getClientAddress === 'function' ? options.getClientAddress(request) : 'unknown';
    const address = typeof rawAddress === 'string' && rawAddress.length <= 200 ? rawAddress : 'unknown';
    const buckets = [digest('ip:' + address), digest('email:' + submittedEmail)];
    // Check the IP first so a blocked caller cannot fill the table with arbitrary email buckets.
    for (const bucket of buckets) {
      const rows = await query(`INSERT INTO admin_login_attempts (bucket_hash, attempts, window_started_at)
        VALUES ($1, 1, now())
        ON CONFLICT (bucket_hash) DO UPDATE SET
          attempts = CASE WHEN admin_login_attempts.window_started_at <= now() - interval '15 minutes' THEN 1 ELSE LEAST(admin_login_attempts.attempts + 1, 6) END,
          window_started_at = CASE WHEN admin_login_attempts.window_started_at <= now() - interval '15 minutes' THEN now() ELSE admin_login_attempts.window_started_at END
        RETURNING attempts`, [bucket]);
      if (Number(rows[0]?.attempts) > LOGIN_LIMIT) {
        throw new ApiError(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.', 'LOGIN_RATE_LIMITED');
      }
    }
    return buckets;
  }

  async function handleRequest(request) {
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    if (!['/api/auth/login', '/api/auth/logout'].includes(path)) return null;
    if (request.method !== 'POST') return json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    let clearCookie = false;
    try {
      rejectForeignOrigin(request, production);
      if (path === '/api/auth/logout') {
        clearCookie = true;
        const token = sessionToken(request);
        if (token && configured) await query('DELETE FROM admin_sessions WHERE token_hash = $1', [digest(token)]);
        return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie() });
      }
      if (!configured) throw new ApiError(503, 'Configure o PostgreSQL, ADMIN_EMAIL e uma ADMIN_PASSWORD de pelo menos 12 caracteres no servidor.', 'ADMIN_NOT_CONFIGURED');
      const payload = await loginPayload(request);
      const buckets = await consumeAttempt(request, payload.email);
      const expected = await proof();
      const candidate = await deriveKey(payload.password, 'yuri-admin-password:v1:' + email, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      const passwordMatches = timingSafeEqual(candidate, expected.key);
      // A constant-time password comparison also runs for an unknown email.
      if (payload.email !== email || !passwordMatches) throw new ApiError(401, 'E-mail ou senha inválidos.', 'INVALID_CREDENTIALS');
      const token = randomBytes(32).toString('base64url');
      await query("DELETE FROM admin_sessions WHERE expires_at <= now()", []);
      await query("DELETE FROM admin_login_attempts WHERE window_started_at <= now() - interval '1 day'", []);
      await query("INSERT INTO admin_sessions (token_hash, credential_hash, email, expires_at) VALUES ($1, $2, $3, now() + interval '8 hours')", [digest(token), expected.version, email]);
      await Promise.all(buckets.map((bucket) => query('DELETE FROM admin_login_attempts WHERE bucket_hash = $1', [bucket])));
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, SESSION_SECONDS) });
    } catch (error) {
      const failure = error instanceof ApiError ? error : unavailable();
      return json({ error: failure.message, code: failure.code }, failure.status, {
        ...(failure.status === 429 ? { 'Retry-After': '900' } : {}),
        ...(clearCookie ? { 'Set-Cookie': sessionCookie() } : {}),
      });
    }
  }

  return { configured, handleRequest, getIdentity };
}
