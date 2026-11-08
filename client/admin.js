const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const currency = (value) => value == null ? 'Sob consulta' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
const safeImage = (value) => {
  if (!value) return '';
  if (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value)) return value;
  if (/^\/assets\/[a-z0-9._/-]+$/i.test(value)) return value;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};
const icon = (name) => ({ product: '◇', ad: '▱', exit: '↗', close: '×', check: '✓', plus: '+', search: '⌕' }[name] || '');
const moneyInput = (value) => value == null ? '' : (Number(value) / 100).toFixed(2).replace('.', ',');
const parsePrice = (value) => {
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Informe um preço válido, como 129,90.');
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000000) throw new Error('Informe um preço entre R$ 0 e R$ 1.000.000.');
  return cents;
};

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('Não foi possível interpretar a resposta. Tente novamente.'); }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || data.message || 'Não foi possível concluir a operação.');
  return data;
}

function optimizeImage(file) {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return reject(new Error('Escolha uma imagem JPG, PNG ou WebP.'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('A imagem deve ter até 15 MB antes da otimização.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const ratio = Math.min(1, 1500 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const context = canvas.getContext('2d');
        context.fillStyle = '#faf7f1';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.88;
        let data = canvas.toDataURL('image/jpeg', quality);
        while (data.length > 900000 && quality > 0.3) { quality -= 0.12; data = canvas.toDataURL('image/jpeg', quality); }
        if (data.length > 900000) throw new Error('A imagem continua muito grande. Escolha uma imagem menor.');
        resolve(data);
      } catch (error) { reject(error); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir essa imagem. Escolha outro arquivo.')); };
    img.src = url;
  });
}

export async function renderAdmin(root, props = {}) {
  let disposed = false;
  let me = props.me;
  const state = {
    demo: props.mode === 'demo', entered: false, section: 'products', search: '',
    products: structuredClone(props.products || []), ads: structuredClone(props.ads || []),
    modal: null, busy: false, imageBusy: false, authBusy: false, images: [], formError: '',
  };
  let toastTimer;
  let previousFocus;

  const notify = (message, error = false) => {
    const toast = root.querySelector('.adm-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('is-error', error);
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 5500);
  };

  function closeModal() {
    if (state.busy || state.imageBusy) return;
    root.querySelector('.adm-overlay')?.remove();
    state.modal = null;
    state.images = [];
    document.body.classList.remove('adm-modal-open');
    previousFocus?.focus();
  }

  function login() {
    const isDemo = state.demo;
    const blocked = !isDemo && me?.authenticated && !me?.isAdmin;
    const setupPending = !isDemo && me?.configured === false;
    const form = `<form class="adm-login-form"><label class="adm-login-field" for="adm-email">E-mail do administrador<input id="adm-email" name="email" type="email" autocomplete="username" required maxlength="254" autocapitalize="none" spellcheck="false"></label><label class="adm-login-field" for="adm-password">Senha<input id="adm-password" name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><p class="adm-auth-error" role="alert" hidden></p><button class="adm-primary adm-wide" type="submit">Entrar <span aria-hidden="true">↗</span></button></form>`;
    const setupLinks = '<div class="adm-setup-links"><a href="/guia-postgresql.txt" target="_blank" rel="noopener">Como configurar a loja ↗</a><a href="/schema-postgresql.sql" download>Baixar estrutura do banco</a></div>';
    root.innerHTML = `<main id="conteudo" class="adm-login-shell"><a class="adm-back" href="/">← Voltar para a loja</a><div class="adm-login-card"><a class="adm-login-brand" href="/">Yuri Araújo<span>BOUTIQUE · SAPATOS & JOIAS</span></a><div class="adm-lock" aria-hidden="true">${isDemo ? '◇' : '⌑'}</div><p class="adm-eyebrow">ESPAÇO DO PROPRIETÁRIO</p><h1>Acesso do<br>administrador</h1><p class="adm-login-copy">${isDemo ? 'O painel está pronto para demonstração. Conecte o PostgreSQL para cadastrar e salvar os produtos e as propagandas da sua loja.' : setupPending ? 'O acesso administrativo ainda precisa ser configurado pelo responsável pela loja.' : blocked ? 'Esta conta não tem autorização para administrar a loja. Entre com o e-mail e a senha do administrador.' : 'Entre com seu e-mail e sua senha para gerenciar os produtos e as propagandas da loja.'}</p>${isDemo ? '<div class="adm-login-note"><strong>Conexão PostgreSQL pendente</strong><span>Você pode explorar o painel com dados ilustrativos. Recarregar a página descarta as alterações da demonstração.</span></div><button class="adm-primary adm-wide" type="button" data-action="explore">Explorar painel de demonstração <span aria-hidden="true">↗</span></button>' : setupPending ? '<div class="adm-login-note"><strong>Configuração pendente</strong><span>Configure a conexão com o banco e as credenciais administrativas conforme o guia da loja.</span></div>' : form}${isDemo || setupPending ? setupLinks : ''}<p class="adm-login-foot">Acesso exclusivo para administrar sua loja.</p></div><div class="adm-login-decoration" aria-hidden="true"></div></main>`;
    root.querySelector('[data-action="explore"]')?.addEventListener('click', () => { state.entered = true; panel(); });
    root.querySelector('.adm-login-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.authBusy) return;
      const form = event.currentTarget;
      const error = form.querySelector('.adm-auth-error');
      const button = form.querySelector('[type="submit"]');
      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      if (!email || !password) { error.textContent = 'Informe seu e-mail e sua senha.'; error.hidden = false; return; }
      state.authBusy = true;
      error.hidden = true;
      button.disabled = true; button.textContent = 'Entrando…';
      form.setAttribute('aria-busy', 'true');
      try {
        await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        if (disposed) return;
        me = await request('/api/me');
        if (!me?.authenticated || !me?.isAdmin || me?.configured === false) throw new Error('Não foi possível confirmar o acesso administrativo. Tente novamente.');
        await loadPanel();
      } catch (failure) {
        if (disposed) return;
        // Keep the form and its email visible so a failed request can be retried.
        if (form.isConnected) { error.textContent = failure.message; error.hidden = false; }
      } finally {
        state.authBusy = false;
        if (form.isConnected) { form.elements.password.value = ''; button.disabled = false; button.innerHTML = 'Entrar <span aria-hidden="true">↗</span>'; form.removeAttribute('aria-busy'); }
      }
    });
  }

  async function logout(button) {
    if (state.authBusy) return;
    state.authBusy = true;
    button.disabled = true; button.textContent = 'Saindo…';
    try {
      await request('/api/auth/logout', { method: 'POST', body: '{}' });
      if (disposed) return;
      me = { ...me, authenticated: false, isAdmin: false, identity: null };
      state.entered = false; state.products = []; state.ads = []; state.search = '';
      login();
    } catch (failure) { if (!disposed) notify(failure.message, true); }
    finally { state.authBusy = false; if (button.isConnected) { button.disabled = false; button.textContent = 'Sair'; } }
  }

  async function loadPanel() {
    const [products, ads] = await Promise.all([request('/api/admin/products'), request('/api/admin/ads')]);
    if (disposed) return;
    state.products = products.products || products.items || [];
    state.ads = ads.ads || ads.items || [];
    state.entered = true;
    panel();
  }

  const productRows = (items) => items.map((item) => `<tr><td><div class="adm-product-cell">${safeImage(item.images?.[0]) ? `<img src="${escapeHtml(safeImage(item.images[0]))}" alt="" loading="lazy">` : '<span class="adm-image-placeholder" aria-hidden="true">◇</span>'}<div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(currency(item.price))}</small></div></div></td><td>${item.category === 'shoes' ? 'Sapatos' : 'Joias'}</td><td><span class="adm-status ${item.available ? '' : 'is-off'}">${item.available ? '✓ Disponível' : 'Indisponível'}</span></td><td><div class="adm-row-actions"><button type="button" data-action="edit" data-id="${escapeHtml(item.id)}">Editar</button><button type="button" class="adm-danger-text" data-action="delete" data-id="${escapeHtml(item.id)}">Excluir</button></div></td></tr>`).join('');
  const adRows = (items) => items.map((item) => `<tr><td><div class="adm-product-cell">${safeImage(item.image_url) ? `<img class="adm-ad-thumb" src="${escapeHtml(safeImage(item.image_url))}" alt="" loading="lazy">` : '<span class="adm-image-placeholder" aria-hidden="true">▱</span>'}<div><strong>${escapeHtml(item.title)}</strong><small>${item.placement === 'sidebar' ? 'Lateral da loja' : 'Topo da loja'}</small></div></div></td><td>${item.placement === 'sidebar' ? 'Lateral' : 'Topo'}</td><td><button class="adm-status adm-status-button ${item.active ? '' : 'is-off'}" type="button" data-action="toggle" data-id="${escapeHtml(item.id)}" aria-label="${item.active ? 'Desativar' : 'Ativar'} propaganda ${escapeHtml(item.title)}">${item.active ? '✓ Ativa' : 'Inativa'}</button></td><td><div class="adm-row-actions"><button type="button" data-action="edit" data-id="${escapeHtml(item.id)}">Editar</button><button type="button" class="adm-danger-text" data-action="delete" data-id="${escapeHtml(item.id)}">Excluir</button></div></td></tr>`).join('');

  function panel() {
    if (disposed) return;
    const isProduct = state.section === 'products';
    const list = state[state.section];
    const term = state.search.toLocaleLowerCase('pt-BR');
    const filtered = list.filter((item) => (item.name || item.title || '').toLocaleLowerCase('pt-BR').includes(term));
    root.innerHTML = `<div class="adm-layout"><aside class="adm-sidebar"><a href="/" class="adm-brand">Yuri Araújo<span>BOUTIQUE</span></a><p class="adm-side-label">ADMINISTRAÇÃO</p><nav aria-label="Navegação administrativa"><button class="adm-nav ${isProduct ? 'is-current' : ''}" type="button" data-section="products" ${isProduct ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon('product')}</span>Produtos <small>${state.products.length}</small></button><button class="adm-nav ${!isProduct ? 'is-current' : ''}" type="button" data-section="ads" ${!isProduct ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon('ad')}</span>Propagandas <small>${state.ads.length}</small></button><a class="adm-nav" href="/" target="_blank" rel="noopener"><span aria-hidden="true">↗</span>Ver loja</a></nav><div class="adm-side-bottom"><div class="adm-owner-avatar" aria-hidden="true">YA</div><div><strong>Área do proprietário</strong><small>${state.demo ? 'Modo demonstração' : 'Acesso protegido'}</small></div><button type="button" data-action="${state.demo ? 'leave' : 'logout'}" class="adm-logout">Sair</button></div></aside><main id="conteudo" class="adm-main"><header class="adm-topbar"><span>PAINEL ADMINISTRATIVO</span><a href="/">Voltar à loja ↗</a></header>${state.demo ? '<div class="adm-demo-banner" role="status"><span aria-hidden="true">◇</span><p><strong>Modo demonstração</strong>Demonstração: as alterações são temporárias e não são salvas no banco.</p></div>' : '<div class="adm-live-banner"><span aria-hidden="true">✓</span> Conectado ao PostgreSQL · Alterações salvas na loja</div>'}<section class="adm-workspace"><div class="adm-page-heading"><div><p class="adm-eyebrow">SUA LOJA, DO SEU JEITO</p><h1>${isProduct ? 'Seus produtos' : 'Suas propagandas'}</h1><p>${isProduct ? 'Cuide dos detalhes que fazem cada peça especial.' : 'Dê destaque às novidades e campanhas da sua loja.'}</p></div><button class="adm-primary" type="button" data-action="add"><span aria-hidden="true">+</span> Adicionar ${isProduct ? 'produto' : 'propaganda'}</button></div><div class="adm-list-card"><div class="adm-list-toolbar"><div><h2>${isProduct ? 'Catálogo da loja' : 'Campanhas da loja'}</h2><span>${list.length} ${isProduct ? (list.length === 1 ? 'produto' : 'produtos') : (list.length === 1 ? 'propaganda' : 'propagandas')}</span></div><label class="adm-search"><span aria-hidden="true">⌕</span><input type="search" value="${escapeHtml(state.search)}" placeholder="Buscar ${isProduct ? 'produto' : 'propaganda'}" aria-label="Buscar ${isProduct ? 'produto' : 'propaganda'}"></label></div><div class="adm-table-scroll"><table class="adm-table"><thead><tr><th scope="col">${isProduct ? 'Produto' : 'Propaganda'}</th><th scope="col">${isProduct ? 'Categoria' : 'Posição'}</th><th scope="col">${isProduct ? 'Disponibilidade' : 'Status'}</th><th scope="col">Ações</th></tr></thead><tbody>${isProduct ? productRows(filtered) : adRows(filtered)}</tbody></table>${!filtered.length ? `<div class="adm-empty"><span aria-hidden="true">${isProduct ? '◇' : '▱'}</span><h3>${state.search ? 'Nenhum resultado encontrado' : isProduct ? 'Seu catálogo começa aqui' : 'Um espaço para suas novidades'}</h3><p>${state.search ? 'Tente buscar por outro nome.' : isProduct ? 'Adicione seu primeiro produto com uma foto e os detalhes.' : 'Adicione uma imagem e escolha onde sua propaganda vai aparecer.'}</p>${!state.search ? `<button class="adm-secondary" type="button" data-action="add">Adicionar ${isProduct ? 'produto' : 'propaganda'}</button>` : ''}</div>` : ''}</div></div><p class="adm-workspace-note">${isProduct ? 'O botão “Tenho interesse” usa automaticamente o nome do produto na mensagem do WhatsApp.' : 'No celular, os anúncios laterais aparecem entre os produtos. Você pode ativar ou pausar cada campanha.'}</p></section><footer class="adm-footer"><span>Yuri Araújo Boutique</span><span>Feito para cuidar da sua loja.</span></footer></main><div class="adm-toast" role="status" aria-live="polite"></div></div>`;
    root.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => { state.section = button.dataset.section; state.search = ''; panel(); }));
    root.querySelector('[data-action="leave"]')?.addEventListener('click', () => { state.entered = false; login(); });
    root.querySelector('[data-action="logout"]')?.addEventListener('click', (event) => logout(event.currentTarget));
    root.querySelectorAll('[data-action="add"]').forEach((button) => button.addEventListener('click', () => openEditor()));
    root.querySelectorAll('[data-action="edit"]').forEach((button) => button.addEventListener('click', () => openEditor(list.find((item) => String(item.id) === button.dataset.id))));
    root.querySelectorAll('[data-action="delete"]').forEach((button) => button.addEventListener('click', () => openDelete(list.find((item) => String(item.id) === button.dataset.id))));
    root.querySelectorAll('[data-action="toggle"]').forEach((button) => button.addEventListener('click', () => toggleAd(button.dataset.id, button)));
    root.querySelector('.adm-search input')?.addEventListener('input', (event) => {
      const start = event.target.selectionStart;
      state.search = event.target.value;
      panel();
      const input = root.querySelector('.adm-search input'); input.focus();
      if (input.type !== 'search') input.setSelectionRange(start, start);
    });
  }

  function mountModal(content, kind) {
    previousFocus = document.activeElement;
    state.modal = kind;
    const overlay = document.createElement('div');
    overlay.className = 'adm-overlay';
    overlay.innerHTML = content;
    root.append(overlay);
    document.body.classList.add('adm-modal-open');
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeModal(); });
    overlay.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeModal));
    overlay.querySelector('input, button, select, textarea')?.focus();
  }

  function imageSlots() {
    const host = root.querySelector('.adm-image-previews');
    if (!host) return;
    host.innerHTML = state.images.map((url, index) => `<div class="adm-image-preview"><img src="${escapeHtml(safeImage(url))}" alt="Imagem ${index + 1} do cadastro"><button type="button" data-remove-image="${index}" aria-label="Remover imagem ${index + 1}">×</button>${index === 0 ? '<span>Principal</span>' : ''}</div>`).join('');
    host.querySelectorAll('[data-remove-image]').forEach((button) => button.addEventListener('click', () => { if (state.imageBusy || state.busy) return; state.images.splice(Number(button.dataset.removeImage), 1); imageSlots(); }));
  }

  function setFormError(message) {
    const error = root.querySelector('.adm-form-error');
    if (error) { error.textContent = message; error.hidden = !message; }
  }

  function openEditor(item) {
    const isProduct = state.section === 'products';
    state.images = [...(isProduct ? item?.images || [] : item?.image_url ? [item.image_url] : [])].filter((url) => safeImage(url));
    mountModal(`<section class="adm-dialog adm-editor" role="dialog" aria-modal="true" aria-labelledby="adm-editor-title"><header class="adm-dialog-header"><div><p class="adm-eyebrow">${isProduct ? 'CATÁLOGO' : 'CAMPANHAS'}</p><h2 id="adm-editor-title">${item ? 'Editar' : 'Adicionar'} ${isProduct ? 'produto' : 'propaganda'}</h2></div><button type="button" class="adm-close" data-close aria-label="Fechar formulário">×</button></header><form class="adm-form"><div class="adm-dialog-body"><label class="adm-field">${isProduct ? 'Nome do produto' : 'Título da propaganda'}<input name="name" value="${escapeHtml(isProduct ? item?.name || '' : item?.title || '')}" required maxlength="120" placeholder="${isProduct ? 'Ex.: Sandália nude' : 'Ex.: Novidades da semana'}"></label><div class="adm-field"><span>${isProduct ? 'Fotos do produto' : 'Imagem da propaganda'}</span><div class="adm-image-previews"></div><label class="adm-upload"><span aria-hidden="true">+</span><strong>Escolher ${isProduct ? 'fotos' : 'imagem'}</strong><small>JPG, PNG ou WebP · ${isProduct ? 'até 4 imagens' : '1 imagem'}</small><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" ${isProduct ? 'multiple' : ''}></label><p class="adm-field-note">As imagens são otimizadas antes de salvar.</p></div>${isProduct ? `<div class="adm-form-grid"><label class="adm-field">Categoria<select name="category"><option value="shoes" ${item?.category === 'shoes' || !item ? 'selected' : ''}>Sapatos</option><option value="jewelry" ${item?.category === 'jewelry' ? 'selected' : ''}>Joias</option></select></label><label class="adm-field">Preço (R$)<input name="price" inputmode="decimal" value="${escapeHtml(moneyInput(item?.price))}" placeholder="Ex.: 129,90"><small>Deixe vazio para “Sob consulta”.</small></label></div><label class="adm-field">Descrição<textarea name="description" rows="3" maxlength="3000" placeholder="Conte os detalhes do produto.">${escapeHtml(item?.description || '')}</textarea></label><label class="adm-field adm-sizes">Tamanhos disponíveis<input name="sizes" value="${escapeHtml((item?.sizes || []).join(', '))}" maxlength="200" placeholder="Ex.: 35, 36, 37, 38"><small>Separe por vírgula. Opcional para joias.</small></label><div class="adm-check-row"><label><input type="checkbox" name="available" ${item?.available !== false ? 'checked' : ''}><span>Produto disponível</span></label><label><input type="checkbox" name="featured" ${item?.featured ? 'checked' : ''}><span>Destacar na loja</span></label></div>` : `<label class="adm-field">Link de destino <span class="adm-optional">(opcional)</span><input name="target_url" type="url" value="${escapeHtml(item?.target_url || '')}" maxlength="2048" placeholder="https://..."><small>Abra uma página ou seu WhatsApp ao clicar no anúncio.</small></label><label class="adm-field">Posição na loja<select name="placement"><option value="top" ${item?.placement !== 'sidebar' ? 'selected' : ''}>Topo da loja</option><option value="sidebar" ${item?.placement === 'sidebar' ? 'selected' : ''}>Lateral da loja</option></select></label><div class="adm-check-row"><label><input type="checkbox" name="active" ${item?.active !== false ? 'checked' : ''}><span>Propaganda ativa</span></label></div>`}<p class="adm-form-error" role="alert" hidden></p>${state.demo ? '<p class="adm-form-demo">Demonstração: este cadastro ficará apenas nesta aba.</p>' : ''}</div><footer class="adm-dialog-footer"><button class="adm-secondary" type="button" data-close>Cancelar</button><button class="adm-primary" type="submit">${item ? 'Salvar alterações' : `Adicionar ${isProduct ? 'produto' : 'propaganda'}`}</button></footer></form></section>`, 'edit');
    imageSlots();
    const form = root.querySelector('.adm-form');
    form.elements.category?.addEventListener('change', () => { const sizes = form.querySelector('.adm-sizes'); sizes.classList.toggle('is-jewelry', form.elements.category.value === 'jewelry'); });
    form.elements.photos.addEventListener('change', async (event) => {
      const files = [...event.target.files];
      event.target.value = '';
      if (!files.length || state.imageBusy) return;
      const limit = isProduct ? 4 : 1;
      if (files.length + state.images.length > limit) { setFormError(`Você pode usar até ${limit} ${limit === 1 ? 'imagem. Remova a imagem atual para trocar.' : 'imagens. Remova uma imagem para adicionar outra.'}`); return; }
      state.imageBusy = true;
      const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
      setFormError('');
      try { const optimized = await Promise.all(files.map(optimizeImage)); state.images.push(...optimized); imageSlots(); }
      catch (error) { setFormError(error.message); }
      finally { state.imageBusy = false; submit.disabled = false; }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.busy || state.imageBusy) return;
      setFormError('');
      let payload;
      try {
        const name = form.elements.name.value.trim();
        if (!name) throw new Error('Informe um nome para continuar.');
        if (!state.images.length) throw new Error('Adicione pelo menos uma imagem.');
        if (isProduct) payload = { name, category: form.elements.category.value, description: form.elements.description.value.trim(), price: parsePrice(form.elements.price.value), images: [...state.images], sizes: [...new Set(form.elements.sizes.value.split(',').map((size) => size.trim()).filter(Boolean))], available: form.elements.available.checked, featured: form.elements.featured.checked };
        else {
          const target = form.elements.target_url.value.trim();
          if (target && !/^https?:\/\//i.test(target)) throw new Error('O link da propaganda deve começar com https:// ou http://.');
          payload = { title: name, image_url: state.images[0], target_url: target || '', placement: form.elements.placement.value, active: form.elements.active.checked };
        }
      } catch (error) { setFormError(error.message); return; }
      state.busy = true;
      const submit = form.querySelector('[type="submit"]'); const label = submit.textContent; submit.disabled = true; submit.textContent = 'Salvando…';
      try {
        let saved;
        if (state.demo) saved = { ...item, ...payload, id: item?.id || `demo-${crypto.randomUUID()}`, updated_at: new Date().toISOString() };
        else {
          const result = await request(`/api/admin/${state.section}${item ? `/${encodeURIComponent(item.id)}` : ''}`, { method: item ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
          saved = result.product || result.ad || result.item || result;
          if (!saved?.id) { const data = await request(`/api/admin/${state.section}`); state[state.section] = data[state.section] || data.items || []; }
        }
        if (saved?.id) { const index = state[state.section].findIndex((entry) => entry.id === item?.id); if (index < 0) state[state.section].unshift(saved); else state[state.section][index] = saved; }
        state.busy = false; closeModal(); panel();
        notify(`${isProduct ? 'Produto' : 'Propaganda'} ${item ? (isProduct ? 'atualizado' : 'atualizada') : (isProduct ? 'adicionado' : 'adicionada')}${state.demo ? ' nesta demonstração' : ''}.`);
      } catch (error) { setFormError(error.message); }
      finally { state.busy = false; if (submit.isConnected) { submit.disabled = false; submit.textContent = label; } }
    });
  }

  function openDelete(item) {
    if (!item) return;
    const isProduct = state.section === 'products';
    mountModal(`<section class="adm-dialog adm-confirm" role="dialog" aria-modal="true" aria-labelledby="adm-delete-title"><button type="button" class="adm-close" data-close aria-label="Fechar confirmação">×</button><span class="adm-delete-symbol" aria-hidden="true">×</span><h2 id="adm-delete-title">Excluir ${isProduct ? 'produto' : 'propaganda'}?</h2><p>Deseja excluir <strong>${escapeHtml(item.name || item.title)}</strong>? ${state.demo ? 'A remoção vale apenas para esta demonstração.' : 'Esta ação remove o item da loja.'}</p><p class="adm-form-error" role="alert" hidden></p><div class="adm-confirm-actions"><button class="adm-secondary" type="button" data-close>Cancelar</button><button class="adm-delete-button" type="button" data-confirm-delete>Excluir</button></div></section>`, 'delete');
    root.querySelector('[data-confirm-delete]').addEventListener('click', async (event) => {
      if (state.busy) return;
      state.busy = true; event.target.disabled = true; event.target.textContent = 'Excluindo…';
      try {
        if (!state.demo) await request(`/api/admin/${state.section}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        state[state.section] = state[state.section].filter((entry) => entry.id !== item.id);
        state.busy = false; closeModal(); panel(); notify(`${isProduct ? 'Produto excluído' : 'Propaganda excluída'}${state.demo ? ' nesta demonstração' : ''}.`);
      } catch (error) { setFormError(error.message); }
      finally { state.busy = false; if (event.target.isConnected) { event.target.disabled = false; event.target.textContent = 'Excluir'; } }
    });
    root.querySelector('[data-close]')?.focus();
  }

  async function toggleAd(id, button) {
    if (button.disabled) return;
    const ad = state.ads.find((item) => String(item.id) === id);
    if (!ad) return;
    button.disabled = true;
    try {
      let updated = { ...ad, active: !ad.active };
      if (!state.demo) { const data = await request(`/api/admin/ads/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ active: updated.active }) }); updated = data.ad || data.item || updated; }
      state.ads = state.ads.map((item) => item.id === ad.id ? updated : item); panel(); notify(`Propaganda ${updated.active ? 'ativada' : 'desativada'}${state.demo ? ' nesta demonstração' : ''}.`);
    } catch (error) { notify(error.message, true); button.disabled = false; }
  }

  const keydown = (event) => {
    if (!state.modal) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
    if (event.key === 'Tab') {
      const dialog = root.querySelector('.adm-dialog');
      const focusable = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter((element) => element.offsetParent !== null);
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  document.addEventListener('keydown', keydown);
  if (!me) {
    try { me = await request('/api/me'); } catch { me = { mode: props.mode || 'demo', authenticated: false, isAdmin: false, configured: false }; }
  }
  if (disposed) return () => {};
  state.demo = me?.mode === 'demo' || props.mode === 'demo';
  if (state.demo || !me?.isAdmin) login();
  else {
    root.innerHTML = '<div class="adm-loading" role="status">Carregando sua loja…</div>';
    try {
      await loadPanel();
    } catch (error) { login(); const note = document.createElement('p'); note.className = 'adm-form-error'; note.textContent = error.message; root.querySelector('.adm-login-card')?.append(note); }
  }
  return () => { disposed = true; clearTimeout(toastTimer); document.removeEventListener('keydown', keydown); document.body.classList.remove('adm-modal-open'); };
}
