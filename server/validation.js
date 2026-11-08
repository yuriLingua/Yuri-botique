export class ApiError extends Error {
  constructor(status, message, code = 'INVALID_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const bad = (message) => { throw new ApiError(400, message, 'VALIDATION_ERROR'); };
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const MAX_IMAGE_BYTES = 1024 * 1024;

export const MAX_BODY_BYTES = 6 * 1024 * 1024;

function text(value, label, { required = true, max = 120, min = 1 } = {}) {
  if (typeof value !== 'string') bad(`${label} deve ser um texto.`);
  const normalized = value.trim();
  if ((required && normalized.length < min) || normalized.length > max) {
    bad(`${label} deve ter ${required ? `entre ${min} e ` : 'no máximo '}${max} caracteres.`);
  }
  return normalized;
}

function bool(value, label) {
  if (typeof value !== 'boolean') bad(`${label} deve ser verdadeiro ou falso.`);
  return value;
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) bad(`${label} inválida.`);
  return value;
}

export function validateExternalUrl(value, label = 'Link', { optional = false } = {}) {
  const normalized = text(value, label, { required: !optional, max: 2048 });
  if (optional && normalized === '') return '';
  let url;
  try { url = new URL(normalized); } catch { bad(`${label} deve começar com https:// ou http://.`); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    bad(`${label} deve ser um endereço HTTP ou HTTPS sem usuário e senha.`);
  }
  return url.href;
}

export function validateImage(value, label = 'Imagem') {
  if (typeof value !== 'string') bad(`${label} inválida.`);
  if (!value.startsWith('data:')) return validateExternalUrl(value, label);
  if (value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64) bad(`${label} deve ter no máximo 1 MB.`);
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) bad(`${label}: use uma imagem PNG, JPEG, WebP ou GIF válida.`);
  let decoded;
  try { decoded = atob(match[2]); } catch { bad(`${label} contém dados inválidos.`); }
  if (decoded.length > MAX_IMAGE_BYTES) bad(`${label} deve ter no máximo 1 MB.`);
  const bytes = (count) => Array.from(decoded.slice(0, count), (character) => character.charCodeAt(0));
  const start = bytes(12);
  const signatureOk = match[1] === 'png'
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => start[index] === byte)
    : match[1] === 'jpeg'
      ? start[0] === 255 && start[1] === 216 && start[2] === 255
      : match[1] === 'gif'
        ? ['GIF87a', 'GIF89a'].includes(decoded.slice(0, 6))
        : decoded.slice(0, 4) === 'RIFF' && decoded.slice(8, 12) === 'WEBP';
  if (!signatureOk) bad(`${label} não corresponde ao formato informado.`);
  return value;
}

function images(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) bad('Adicione entre 1 e 4 fotos ao produto.');
  return value.map((image, index) => validateImage(image, `Foto ${index + 1}`));
}

function sizes(value) {
  if (!Array.isArray(value) || value.length > 30) bad('Informe no máximo 30 tamanhos.');
  return [...new Set(value.map((size) => text(size, 'Tamanho', { max: 20 })))];
}

function price(value) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000) bad('O preço deve ser um valor em centavos, entre zero e R$ 1.000.000,00, ou nulo.');
  return value;
}

const productFields = {
  name: (value) => text(value, 'Nome do produto', { min: 2, max: 120 }),
  category: (value) => oneOf(value, ['shoes', 'jewelry'], 'Categoria'),
  description: (value) => text(value, 'Descrição', { required: false, max: 3000 }),
  price,
  images,
  sizes,
  available: (value) => bool(value, 'Disponibilidade'),
  featured: (value) => bool(value, 'Destaque'),
};

const adFields = {
  title: (value) => text(value, 'Título da propaganda', { min: 2, max: 120 }),
  image_url: (value) => validateImage(value),
  target_url: (value) => validateExternalUrl(value, 'Link de destino', { optional: true }),
  placement: (value) => oneOf(value, ['top', 'sidebar'], 'Posição'),
  active: (value) => bool(value, 'Ativação'),
};

function record(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Envie um objeto JSON válido.');
}

function validateFields(input, fields, defaults, partial) {
  record(input);
  for (const field of Object.keys(input)) {
    if (!own(fields, field)) bad(`Campo não permitido: ${field.slice(0, 80)}.`);
  }
  const output = partial ? {} : { ...defaults };
  for (const [field, parse] of Object.entries(fields)) {
    if (own(input, field)) output[field] = parse(input[field]);
  }
  if (partial && Object.keys(output).length === 0) bad('Informe pelo menos um campo para alterar.');
  if (!partial) {
    for (const field of Object.keys(fields)) {
      if (!own(output, field)) bad(`O campo ${field} é obrigatório.`);
    }
  }
  return output;
}

export function validateProduct(input, { partial = false } = {}) {
  return validateFields(input, productFields, {
    description: '', price: null, sizes: [], available: true, featured: false,
  }, partial);
}

export function validateAd(input, { partial = false } = {}) {
  return validateFields(input, adFields, { target_url: '', active: true }, partial);
}

export function validateId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, 'Identificador inválido.', 'INVALID_ID');
  }
  return value;
}

export async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new ApiError(415, 'Envie os dados como application/json.', 'UNSUPPORTED_MEDIA_TYPE');
  }
  const declaredSize = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_BYTES) {
    throw new ApiError(413, 'O envio excedeu o limite de 6 MB.', 'BODY_TOO_LARGE');
  }
  if (!request.body) bad('Envie os dados do cadastro.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ApiError(413, 'O envio excedeu o limite de 6 MB.', 'BODY_TOO_LARGE');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(body)); }
  catch { bad('O JSON enviado é inválido.'); }
}
