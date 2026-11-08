import { demoProducts } from './demo.js';

const WHATSAPP = '5571991334337';
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalized = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const icons = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.7 7.4L3 20.5l1.4-4.7a8.5 8.5 0 1 1 16.1-4.1Z"/><path d="M8 7.7c.2-.3.6-.2.8.1l1 1.8c.2.3.1.5-.2.8l-.6.6c.7 1.6 1.8 2.7 3.5 3.4l.6-.8c.2-.2.5-.3.8-.1l1.8.9c.3.2.4.5.2.9-.4.8-1.2 1.2-2.1 1-3.5-.7-6.5-3.6-7.1-6.9-.1-.7.3-1.3 1.3-1.7Z"/></svg>',
  diamond: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><path d="m6 7-4 8 14 15 14-15-4-8H6Zm-4 8h28M6 7l10 23L26 7M11 7l5 8 5-8"/></svg>',
};

function safeImage(value, fallback = '/assets/sandalia.jpg') {
  if (typeof value !== 'string') return fallback;
  if (/^\/assets\/[a-zA-Z0-9._/-]+$/.test(value) && !value.includes('..')) return value;
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(value)) return value;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : fallback; } catch { return fallback; }
}

function safeLink(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

function whatsappLink(product) {
  const text = product ? `Olá, Yuri! Tenho interesse neste produto: ${product.name}. Está disponível?` : 'Olá, Yuri! Gostaria de conhecer os sapatos e as joias da loja.';
  return `https://wa.me/${WHATSAPP}?${new URLSearchParams({ text }).toString()}`;
}

function productPrice(product) {
  return product.price !== null && product.price !== undefined && Number.isFinite(Number(product.price)) ? money.format(Number(product.price) / 100) : 'Consulte o valor';
}

function categoryName(category) { return category === 'shoes' ? 'Sapatos' : category === 'jewelry' ? 'Joias' : 'Seleção da loja'; }

function imageFor(product) {
  const fallback = product.category === 'jewelry' ? '/assets/brincos.jpg' : '/assets/sandalia.jpg';
  return safeImage(Array.isArray(product.images) ? product.images[0] : '', fallback);
}

function adMarkup(ad, placement, isDemo) {
  if (!ad && !isDemo) return '';
  const placeholder = !ad || (isDemo && !ad.image_url);
  const body = !placeholder ? `${ad.image_url ? `<img src="${escapeHTML(safeImage(ad.image_url, '/assets/hero.png'))}" alt="${escapeHTML(ad.title || 'Propaganda')}" loading="lazy">` : ''}<span class="shop-ad-title">${escapeHTML(ad.title || 'Destaque da loja')}</span>` : `<span class="shop-ad-kicker">ESPAÇO PARA PROPAGANDA</span>${placement === 'sidebar' ? '<span class="shop-sun" aria-hidden="true"></span>' : ''}<span class="shop-ad-title">Sua campanha aqui</span><span class="shop-ad-note">${placement === 'top' ? 'Um espaço para as suas novidades' : 'Destaques que merecem aparecer'}</span>`;
  const destination = ad && safeLink(ad.target_url);
  const tag = destination ? 'a' : 'div';
  return `<${tag} class="shop-ad shop-ad-${placement} ${placeholder ? 'shop-ad-placeholder' : 'shop-ad-real'}" ${destination ? `href="${escapeHTML(destination)}" target="_blank" rel="noopener noreferrer"` : ''} ${placeholder ? 'aria-label="Exemplo de espaço para propaganda"' : ''}>${body}</${tag}>`;
}

function productCard(product) {
  return `<article class="p-card">
    <button class="p-photo" data-product="${escapeHTML(product.id)}" aria-label="Ver detalhes de ${escapeHTML(product.name)}">
      <img src="${escapeHTML(imageFor(product))}" alt="${escapeHTML(product.name)}" loading="lazy" decoding="async">
      ${product.featured ? '<span class="p-tag">Seleção Yuri</span>' : ''}
      <span class="p-photo-link">Ver detalhes ${icons.arrow}</span>
    </button>
    <div class="p-information"><span class="p-category">${categoryName(product.category)}</span>
    <button class="p-title-button" data-product="${escapeHTML(product.id)}"><h3>${escapeHTML(product.name)}</h3></button>
    <p class="p-price">${escapeHTML(productPrice(product))}</p>
    ${product.available === false ? '<p class="p-unavailable">Consulte a disponibilidade</p>' : ''}
    <a class="p-whatsapp" href="${escapeHTML(whatsappLink(product))}" target="_blank" rel="noopener noreferrer">${icons.whatsapp}<span>${product.available === false ? 'Consultar disponibilidade' : 'Tenho interesse'}</span></a></div>
  </article>`;
}

export async function renderStorefront(root, { products = [], ads = [], mode = 'live' } = {}) {
  const isDemo = mode === 'demo';
  const items = isDemo && !products.length ? demoProducts : products;
  const activeAds = ads.filter((ad) => ad && ad.active !== false);
  const topAds = activeAds.filter((ad) => ad.placement === 'top');
  const sideAds = activeAds.filter((ad) => ad.placement === 'sidebar');
  const hasSideAds = sideAds.length > 0 || isDemo;
  const state = { category: 'all', search: '' };
  const controller = new AbortController();
  const { signal } = controller;
  let previousFocus = null;

  root.innerHTML = `
    ${isDemo ? '<div class="shop-demo"><span>PRÉVIA DA LOJA</span> Produtos e imagens ilustrativos</div>' : ''}
    <div class="shop-top-ads">${topAds.length ? topAds.map((ad) => adMarkup(ad, 'top', isDemo)).join('') : adMarkup(null, 'top', isDemo)}</div>
    <header class="shop-header shop-shell">
      <a class="shop-brand" href="/" aria-label="Yuri Araújo Boutique, início"><span>Yuri Araújo</span><small>BOUTIQUE <b>·</b> SAPATOS & JOIAS</small></a>
      <button class="shop-menu-toggle" aria-label="Abrir menu" aria-expanded="false" aria-controls="shop-navigation">${icons.menu}</button>
      <nav id="shop-navigation" class="shop-navigation" aria-label="Navegação principal"><a href="#inicio">Início</a><button data-category="shoes">Sapatos</button><button data-category="jewelry">Joias</button><a href="#contato">Contato</a></nav>
      <a class="shop-header-contact" href="${escapeHTML(whatsappLink())}" target="_blank" rel="noopener noreferrer">${icons.whatsapp}<span>Fale com Yuri</span></a>
    </header>
    <main id="conteudo" class="shop-shell shop-main ${hasSideAds ? 'shop-main-with-sidebar' : ''}">
      <div class="shop-main-content">
        <section class="shop-hero" id="inicio" aria-labelledby="shop-hero-title">
          <div class="shop-hero-photo" role="presentation"><img src="/assets/hero.png" alt="" fetchpriority="high"></div>
          <div class="shop-hero-copy"><span class="shop-eyebrow"><i></i> ESTILO QUE É SEU</span><h1 id="shop-hero-title">Seu estilo em<br>cada <em>detalhe.</em></h1><p>Sapatos e joias para completar<br class="shop-desktop-break"> o seu visual.</p><a class="shop-primary" href="#produtos">Descubra a coleção ${icons.arrow}</a></div>
          <span class="shop-hero-caption">YURI ARAÚJO BOUTIQUE</span>
        </section>
        <div class="shop-intro-strip"><span>Um novo passo.</span><i></i><span>Um toque de brilho.</span><i></i><span>O seu jeito de ser.</span></div>
        <section id="produtos" class="shop-catalog" aria-labelledby="shop-catalog-title">
          <div class="shop-catalog-heading"><div><span class="shop-eyebrow">NOSSA SELEÇÃO</span><h2 id="shop-catalog-title">Escolha seu <em>favorito.</em></h2></div><span class="shop-catalog-count" aria-live="polite"></span></div>
          <div class="shop-catalog-controls"><div class="shop-filters" aria-label="Categorias de produtos"><button data-category="all" aria-pressed="true">Todos</button><button data-category="shoes" aria-pressed="false">Sapatos</button><button data-category="jewelry" aria-pressed="false">Joias</button></div><form class="shop-search" role="search">${icons.search}<label class="shop-sr-only" for="shop-search-input">Buscar produtos</label><input id="shop-search-input" type="search" name="busca" placeholder="Encontre seu próximo favorito" autocomplete="off"><button class="shop-search-clear" type="button" aria-label="Limpar busca" hidden>${icons.close}</button></form></div>
          <div class="shop-products" aria-live="polite" aria-atomic="false"></div>
          ${isDemo ? '<p class="shop-illustrative">Uma prévia do que vem por aí. Produtos e imagens ilustrativos.</p>' : ''}
        </section>
      </div>
      ${hasSideAds ? `<aside class="shop-sidebar" aria-label="Destaques e contato"><div class="shop-side-ads">${sideAds.length ? sideAds.map((ad) => adMarkup(ad, 'sidebar', isDemo)).join('') : adMarkup(null, 'sidebar', true)}</div><div class="shop-contact-card"><span class="shop-eyebrow">PODEMOS AJUDAR?</span><h2>Fale com Yuri.</h2><p>Quer saber mais sobre uma peça?<br>Vamos conversar.</p><a href="${escapeHTML(whatsappLink())}" target="_blank" rel="noopener noreferrer">${icons.whatsapp}<span>(71) 99133-4337</span></a></div><div class="shop-side-note">${icons.diamond}<p>O detalhe certo<br>faz parte de você.</p></div></aside>` : ''}
    </main>
    <section id="contato" class="shop-bottom-contact"><div class="shop-shell"><div><span class="shop-eyebrow">ATENDIMENTO PELO WHATSAPP</span><h2>Gostou de uma peça?<br><em>Fale com a gente.</em></h2></div><div class="shop-bottom-contact-action"><p>Toque em “Tenho interesse” no produto<br>ou fale diretamente com Yuri.</p><a class="shop-primary" href="${escapeHTML(whatsappLink())}" target="_blank" rel="noopener noreferrer">${icons.whatsapp} Conversar com Yuri ${icons.arrow}</a><span>(71) 99133-4337</span></div></div></section>
    <footer class="shop-footer"><div class="shop-shell"><a class="shop-brand" href="/"><span>Yuri Araújo</span><small>BOUTIQUE <b>·</b> SAPATOS & JOIAS</small></a><p>Seu estilo em cada detalhe.</p><a class="shop-admin-link" href="/admin">Área do administrador ${icons.arrow}</a></div><div class="shop-footer-bottom shop-shell"><span>© ${new Date().getFullYear()} Yuri Araújo Boutique</span><span>Sapatos & joias</span></div></footer>
    <dialog class="p-dialog" aria-labelledby="p-dialog-title"><button class="p-dialog-close" aria-label="Fechar detalhes do produto">${icons.close}</button><div class="p-dialog-content"></div></dialog>`;

  const results = root.querySelector('.shop-products');
  const count = root.querySelector('.shop-catalog-count');
  const dialog = root.querySelector('.p-dialog');
  const input = root.querySelector('#shop-search-input');
  const clear = root.querySelector('.shop-search-clear');
  const menu = root.querySelector('.shop-menu-toggle');
  const navigation = root.querySelector('.shop-navigation');

  function imageFallbacks(element) {
    element.querySelectorAll('img').forEach((img) => {
      img.addEventListener('error', () => {
        img.classList.add('shop-image-failed');
        img.removeAttribute('src');
      }, { once: true, signal });
    });
  }

  function updateProducts() {
    const needle = normalized(state.search.trim());
    const visible = items.filter((p) => (state.category === 'all' || p.category === state.category) && (!needle || normalized(`${p.name} ${p.description} ${categoryName(p.category)}`).includes(needle)));
    count.textContent = `${visible.length} ${visible.length === 1 ? 'peça' : 'peças'}`;
    root.querySelectorAll('.shop-filters [data-category]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.category === state.category)));
    clear.hidden = !state.search;
    const mobileAd = hasSideAds ? `<div class="shop-mobile-ad" aria-label="Destaque da loja">${sideAds.length ? sideAds.map((ad) => adMarkup(ad, 'sidebar', isDemo)).join('') : adMarkup(null, 'sidebar', true)}</div>` : '';
    const productMarkup = visible.map((product, index) => productCard(product) + (index === Math.min(1, visible.length - 1) ? mobileAd : '')).join('');
    results.innerHTML = visible.length ? productMarkup : `<div class="shop-empty">${icons.diamond}<h3>${items.length ? 'Vamos tentar outra busca?' : 'Novidades em breve.'}</h3><p>${items.length ? 'Não encontramos peças com essa seleção.<br>Explore outra categoria ou fale com Yuri.' : 'Estamos preparando a seleção da loja.<br>Fale com Yuri para conhecer os produtos.'}</p>${items.length ? '<button class="shop-reset" type="button">Ver todas as peças</button>' : `<a href="${escapeHTML(whatsappLink())}" target="_blank" rel="noopener noreferrer">Conversar pelo WhatsApp ${icons.arrow}</a>`}</div>`;
    imageFallbacks(results);
  }

  function closeMenu() { menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Abrir menu'); navigation.classList.remove('is-open'); }

  function closeDialog() { dialog.close(); }

  function openProduct(product) {
    previousFocus = document.activeElement;
    const images = Array.isArray(product.images) && product.images.length ? product.images : [imageFor(product)];
    const sizes = Array.isArray(product.sizes) ? product.sizes : [];
    root.querySelector('.p-dialog-content').innerHTML = `<div class="p-dialog-gallery"><img class="p-dialog-main-image" src="${escapeHTML(safeImage(images[0], imageFor(product)))}" alt="${escapeHTML(product.name)}">${images.length > 1 ? `<div class="p-thumbnails">${images.map((src, i) => `<button type="button" data-image="${escapeHTML(safeImage(src, imageFor(product)))}" aria-label="Ver foto ${i + 1} de ${escapeHTML(product.name)}" aria-pressed="${i === 0}"><img src="${escapeHTML(safeImage(src, imageFor(product)))}" alt=""></button>`).join('')}</div>` : ''}</div><div class="p-dialog-info"><span class="shop-eyebrow">${categoryName(product.category)} · YURI ARAÚJO</span><h2 id="p-dialog-title">${escapeHTML(product.name)}</h2><p class="p-dialog-price">${escapeHTML(productPrice(product))}</p><p class="p-description">${escapeHTML(product.description || 'Gostou desta peça? Fale com Yuri para saber mais.')}</p>${sizes.length ? `<div class="p-sizes"><h3>Tamanhos cadastrados</h3><div>${sizes.map((size) => `<span>${escapeHTML(size)}</span>`).join('')}</div><p>Confirme o tamanho desejado no atendimento.</p></div>` : ''}<p class="p-availability"><i class="${product.available === false ? 'is-unavailable' : ''}"></i>${product.available === false ? 'Consulte a disponibilidade com Yuri' : 'Consulte a disponibilidade pelo WhatsApp'}</p><a class="p-whatsapp" href="${escapeHTML(whatsappLink(product))}" target="_blank" rel="noopener noreferrer">${icons.whatsapp}<span>Tenho interesse neste produto</span>${icons.arrow}</a><p class="p-message-note">O WhatsApp abrirá com o nome desta peça na mensagem.</p>${isDemo ? '<p class="p-demo-note">Produto ilustrativo desta prévia.</p>' : ''}</div>`;
    imageFallbacks(dialog);
    if (!dialog.open) dialog.showModal();
  }

  root.addEventListener('click', (event) => {
    const productButton = event.target.closest('[data-product]');
    if (productButton) { const product = items.find((p) => String(p.id) === productButton.dataset.product); if (product) openProduct(product); return; }
    const categoryButton = event.target.closest('[data-category]');
    if (categoryButton) { state.category = categoryButton.dataset.category; updateProducts(); closeMenu(); if (categoryButton.closest('.shop-navigation')) root.querySelector('#produtos').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const resetButton = event.target.closest('.shop-reset');
    if (resetButton) { state.category = 'all'; state.search = ''; input.value = ''; updateProducts(); input.focus(); return; }
    const thumbnail = event.target.closest('[data-image]');
    if (thumbnail) { dialog.querySelector('.p-dialog-main-image').src = thumbnail.dataset.image; dialog.querySelectorAll('[data-image]').forEach((button) => button.setAttribute('aria-pressed', String(button === thumbnail))); }
    if (event.target.closest('.shop-navigation a')) closeMenu();
  }, { signal });
  menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu'); navigation.classList.toggle('is-open', open); }, { signal });
  input.addEventListener('input', () => { state.search = input.value; updateProducts(); }, { signal });
  clear.addEventListener('click', () => { input.value = ''; state.search = ''; updateProducts(); input.focus(); }, { signal });
  root.querySelector('.shop-search').addEventListener('submit', (event) => { event.preventDefault(); updateProducts(); }, { signal });
  root.querySelector('.p-dialog-close').addEventListener('click', closeDialog, { signal });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } }, { signal });
  dialog.addEventListener('close', () => { if (previousFocus?.isConnected) previousFocus.focus(); }, { signal });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); }, { signal });
  imageFallbacks(root);
  updateProducts();
  return () => { if (dialog.open) dialog.close(); controller.abort(); };
}
