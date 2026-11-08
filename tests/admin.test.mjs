import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderAdmin } from '../client/admin.js';

const turn = () => new Promise((resolve) => setTimeout(resolve, 5));
const photo = 'https://images.example.com/product.jpg';
const fixtureProducts = [{ id: 'demo-product', name: 'Sandália nude', category: 'shoes', description: 'Uma sandália.', price: null, images: [photo], sizes: ['36'], available: true, featured: false }];
const fixtureAds = [{ id: 'demo-ad', title: 'Campanha inicial', image_url: photo, target_url: 'https://example.com/', placement: 'top', active: true }];

async function setup(options = {}) {
  const win = new Window({ url: 'https://boutique.test/admin' });
  const globals = { document: globalThis.document, window: globalThis.window, Image: globalThis.Image, fetch: globalThis.fetch, URL: globalThis.URL };
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.Image = class {
    width = 800; height = 800;
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  };
  globalThis.URL = class extends globals.URL { static createObjectURL() { return 'blob:test-image'; } static revokeObjectURL() {} };
  const create = win.document.createElement.bind(win.document);
  win.document.createElement = (tag, ...args) => tag.toLowerCase() === 'canvas' ? {
    width: 0, height: 0,
    getContext() { return { fillStyle: '', fillRect() {}, drawImage() {} }; },
    toDataURL() { return 'data:image/jpeg;base64,/9j/2Q=='; },
  } : create(tag, ...args);
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (options.fetch) return options.fetch(url, init);
    throw new Error('O modo demonstração não deve gravar pela API.');
  };
  const root = win.document.createElement('div'); win.document.body.append(root);
  const cleanup = await renderAdmin(root, {
    mode: options.mode || 'demo', products: fixtureProducts, ads: fixtureAds,
    me: options.me || { authenticated: false, isAdmin: false, configured: false, mode: 'demo' },
  });
  const click = (selector) => { const element = root.querySelector(selector); assert.ok(element, `Elemento esperado: ${selector}`); element.click(); return element; };
  const submit = () => root.querySelector('.adm-form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  const upload = async (type = 'image/jpeg') => {
    const input = root.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [{ type, size: 500, name: type === 'image/svg+xml' ? 'bad.svg' : 'photo.jpg' }] });
    input.dispatchEvent(new win.Event('change', { bubbles: true })); await turn();
  };
  return { win, root, calls, click, submit, upload, finish() { cleanup?.(); win.happyDOM.abort(); Object.assign(globalThis, globals); } };
}

test('admin oferece acesso demo honesto e cria produto com preço em centavos, sem gravar pela API', async () => {
  const ctx = await setup();
  try {
    assert.match(ctx.root.textContent, /Conexão PostgreSQL pendente/);
    ctx.click('[data-action="explore"]');
    assert.match(ctx.root.textContent, /alterações são temporárias e não são salvas no banco/);
    ctx.click('[data-action="add"]');
    const form = ctx.root.querySelector('.adm-form');
    form.elements.name.value = 'Produto novo'; form.elements.price.value = '12,50'; form.elements.sizes.value = '35, 36, 36';
    await ctx.upload(); ctx.submit(); await turn();
    assert.equal(ctx.root.querySelector('.adm-overlay'), null);
    assert.match(ctx.root.textContent, /Produto novo/);
    assert.match(ctx.root.textContent, /12,50/);
    const row = [...ctx.root.querySelectorAll('tbody tr')].find((entry) => entry.textContent.includes('Produto novo'));
    row.querySelector('[data-action="edit"]').click();
    assert.equal(ctx.root.querySelector('[name="price"]').value, '12,50');
    assert.equal(ctx.root.querySelector('[name="sizes"]').value, '35, 36');
    assert.equal(ctx.calls.length, 0);
  } finally { ctx.finish(); }
});

test('admin edita produto, cancela exclusão e exclui somente depois da confirmação', async () => {
  const ctx = await setup();
  try {
    ctx.click('[data-action="explore"]'); ctx.click('[data-action="edit"]');
    ctx.root.querySelector('[name="name"]').value = 'Sandália editada'; ctx.submit(); await turn();
    assert.match(ctx.root.textContent, /Sandália editada/);
    ctx.click('[data-action="delete"]');
    assert.match(ctx.root.querySelector('.adm-confirm').textContent, /Sandália editada/);
    ctx.click('.adm-confirm [data-close]');
    assert.equal(ctx.root.querySelectorAll('tbody tr').length, 1);
    ctx.click('[data-action="delete"]'); ctx.click('[data-confirm-delete]'); await turn();
    assert.equal(ctx.root.querySelectorAll('tbody tr').length, 0);
    assert.match(ctx.root.textContent, /Seu catálogo começa aqui/);
    assert.equal(ctx.calls.length, 0);
  } finally { ctx.finish(); }
});

test('admin cria, edita, pausa e exclui propaganda em memória', async () => {
  const ctx = await setup();
  try {
    ctx.click('[data-action="explore"]'); ctx.click('[data-section="ads"]');
    ctx.click('[data-action="add"]');
    let form = ctx.root.querySelector('.adm-form');
    form.elements.name.value = 'Nova campanha'; form.elements.target_url.value = 'https://example.com/novidades'; form.elements.placement.value = 'sidebar';
    await ctx.upload(); ctx.submit(); await turn();
    assert.equal(ctx.root.querySelectorAll('tbody tr').length, 2);
    assert.match(ctx.root.textContent, /Nova campanha/);
    let row = [...ctx.root.querySelectorAll('tbody tr')].find((entry) => entry.textContent.includes('Nova campanha'));
    row.querySelector('[data-action="edit"]').click();
    form = ctx.root.querySelector('.adm-form');
    assert.equal(form.elements.placement.value, 'sidebar');
    form.elements.name.value = 'Campanha atualizada'; ctx.submit(); await turn();
    row = [...ctx.root.querySelectorAll('tbody tr')].find((entry) => entry.textContent.includes('Campanha atualizada'));
    row.querySelector('[data-action="toggle"]').click(); await turn();
    row = [...ctx.root.querySelectorAll('tbody tr')].find((entry) => entry.textContent.includes('Campanha atualizada'));
    assert.match(row.textContent, /Inativa/);
    row.querySelector('[data-action="delete"]').click(); ctx.click('[data-confirm-delete]'); await turn();
    assert.doesNotMatch(ctx.root.querySelector('tbody').textContent, /Campanha atualizada/);
    assert.equal(ctx.calls.length, 0);
  } finally { ctx.finish(); }
});

test('admin rejeita imagem SVG e link javascript sem fechar formulário', async () => {
  const ctx = await setup();
  try {
    ctx.click('[data-action="explore"]'); ctx.click('[data-action="add"]');
    await ctx.upload('image/svg+xml');
    assert.match(ctx.root.querySelector('.adm-form-error').textContent, /JPG, PNG ou WebP/);
    assert.equal(ctx.root.querySelectorAll('.adm-image-preview').length, 0);
    ctx.click('.adm-dialog-header [data-close]'); ctx.click('[data-section="ads"]'); ctx.click('[data-action="edit"]');
    ctx.root.querySelector('[name="target_url"]').value = 'javascript:alert(1)'; ctx.submit(); await turn();
    assert.match(ctx.root.querySelector('.adm-form-error').textContent, /https:\/\//);
    assert.ok(ctx.root.querySelector('.adm-overlay'));
    assert.equal(ctx.calls.length, 0);
  } finally { ctx.finish(); }
});

test('admin live sem autorização oferece login local e não carrega controles CRUD', async () => {
  const ctx = await setup({ mode: 'live', me: { mode: 'live', authenticated: true, isAdmin: false, configured: true } });
  try {
    assert.match(ctx.root.textContent, /não tem autorização/);
    assert.equal(ctx.root.querySelector('[data-action="explore"]'), null);
    assert.equal(ctx.root.querySelector('[data-action="add"]'), null);
    assert.ok(ctx.root.querySelector('.adm-login-form'));
    assert.equal(ctx.root.querySelector('[name="email"]').autocomplete, 'username');
    assert.equal(ctx.root.querySelector('[name="password"]').autocomplete, 'current-password');
    assert.equal(ctx.root.querySelector('a[href*="chatgpt"]'), null);
    assert.equal(ctx.calls.length, 0);
  } finally { ctx.finish(); }
});

test('admin autentica por e-mail e senha, restaura a sessão e encerra acesso pelo logout', async () => {
  let signedIn = false;
  const ctx = await setup({
    mode: 'live', me: { mode: 'live', authenticated: false, isAdmin: false, configured: true },
    fetch: async (url, init) => {
      let payload;
      if (url === '/api/auth/login') { signedIn = true; payload = { ok: true }; }
      else if (url === '/api/auth/logout') { signedIn = false; payload = { ok: true }; }
      else if (url === '/api/me') payload = { mode: 'live', authenticated: signedIn, isAdmin: signedIn, configured: true };
      else payload = url.endsWith('products') ? { products: fixtureProducts } : { ads: fixtureAds };
      return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  try {
    const form = ctx.root.querySelector('.adm-login-form');
    form.elements.email.value = 'yuri@example.com'; form.elements.password.value = 'senha-forte-para-o-teste';
    form.dispatchEvent(new ctx.win.Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new ctx.win.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(ctx.calls.filter((entry) => entry.url === '/api/auth/login').length, 1);
    await turn();
    const login = ctx.calls.find((entry) => entry.url === '/api/auth/login');
    assert.equal(login.init.method, 'POST');
    assert.equal(login.init.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(login.init.body), { email: 'yuri@example.com', password: 'senha-forte-para-o-teste' });
    assert.ok(ctx.calls.find((entry) => entry.url === '/api/me'));
    assert.match(ctx.root.textContent, /Seus produtos/);
    assert.ok(ctx.root.querySelector('[data-action="add"]'));
    assert.ok(ctx.root.querySelector('#conteudo'));
    ctx.click('[data-action="logout"]'); await turn();
    assert.equal(signedIn, false);
    assert.equal(ctx.calls.find((entry) => entry.url === '/api/auth/logout').init.method, 'POST');
    assert.ok(ctx.root.querySelector('.adm-login-form'));
    assert.equal(ctx.root.querySelector('[data-action="add"]'), null);
    assert.equal(ctx.root.querySelector('[name="password"]').value, '');
  } finally { ctx.finish(); }
});

test('admin preserva formulário em falhas de login e mantém o painel quando logout falha', async () => {
  const ctx = await setup({
    mode: 'live', me: { mode: 'live', authenticated: false, isAdmin: false, configured: true },
    fetch: async () => new Response(JSON.stringify({ error: 'E-mail ou senha inválidos.' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
  });
  try {
    const form = ctx.root.querySelector('.adm-login-form');
    form.elements.email.value = 'yuri@example.com'; form.elements.password.value = 'incorreta';
    form.dispatchEvent(new ctx.win.Event('submit', { bubbles: true, cancelable: true })); await turn();
    assert.match(ctx.root.querySelector('.adm-auth-error').textContent, /E-mail ou senha inválidos/);
    assert.equal(ctx.root.querySelector('[name="email"]').value, 'yuri@example.com');
    assert.equal(ctx.root.querySelector('[name="password"]').value, '');
    assert.equal(ctx.root.querySelector('[type="submit"]').disabled, false);
    assert.equal(ctx.root.querySelector('[data-action="add"]'), null);
  } finally { ctx.finish(); }
  const live = await setup({
    mode: 'live', me: { mode: 'live', authenticated: true, isAdmin: true, configured: true },
    fetch: async (url) => new Response(JSON.stringify(url === '/api/auth/logout' ? { error: 'Não foi possível encerrar a sessão.' } : url.endsWith('products') ? { products: fixtureProducts } : { ads: fixtureAds }), { status: url === '/api/auth/logout' ? 503 : 200, headers: { 'Content-Type': 'application/json' } }),
  });
  try {
    live.click('[data-action="logout"]'); await turn();
    assert.match(live.root.textContent, /Não foi possível encerrar a sessão/);
    assert.ok(live.root.querySelector('[data-action="add"]'));
    assert.equal(live.root.querySelector('[data-action="logout"]').disabled, false);
  } finally { live.finish(); }
});

test('admin informa configuração incompleta sem oferecer autenticação nem demonstração falsa', async () => {
  const ctx = await setup({ mode: 'live', me: { mode: 'live', authenticated: false, isAdmin: false, configured: false, databaseConfigured: true, adminConfigured: false } });
  try {
    assert.match(ctx.root.textContent, /Configuração pendente/);
    assert.equal(ctx.root.querySelector('.adm-login-form'), null);
    assert.equal(ctx.root.querySelector('[data-action="explore"]'), null);
    assert.equal(ctx.root.querySelector('[data-action="add"]'), null);
    assert.ok(ctx.root.querySelector('a[href="/guia-postgresql.txt"]'));
    assert.equal(ctx.calls.length, 0);
  } finally { ctx.finish(); }
});

test('admin live envia PATCH com preço normalizado e preserva formulário quando a API falha', async () => {
  let fail = false;
  const ctx = await setup({
    mode: 'live', me: { mode: 'live', authenticated: true, isAdmin: true, configured: true },
    fetch: async (url, init) => {
      if (init.method === 'PATCH') return new Response(JSON.stringify(fail ? { error: 'Conexão indisponível.' } : { product: { ...fixtureProducts[0], ...JSON.parse(init.body) } }), { status: fail ? 503 : 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(url.endsWith('products') ? { products: fixtureProducts } : { ads: fixtureAds }), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  try {
    ctx.click('[data-action="edit"]'); ctx.root.querySelector('[name="price"]').value = '12,50'; ctx.submit(); await turn();
    assert.equal(JSON.parse(ctx.calls.find((entry) => entry.init.method === 'PATCH').init.body).price, 1250);
    fail = true;
    ctx.click('[data-action="edit"]'); ctx.submit(); await turn();
    assert.match(ctx.root.querySelector('.adm-form-error').textContent, /Conexão indisponível/);
    assert.ok(ctx.root.querySelector('.adm-overlay'));
    assert.equal(ctx.root.querySelector('.adm-form [type="submit"]').disabled, false);
  } finally { ctx.finish(); }
});
