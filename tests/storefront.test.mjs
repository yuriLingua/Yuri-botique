import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Window } from 'happy-dom';
import { renderStorefront } from '../client/storefront.js';

describe('storefront customer flows', () => {
  let window;
  let root;
  let cleanup;

  beforeEach(() => {
    window = new Window({ url: 'https://boutique.example/' });
    globalThis.window = window;
    globalThis.document = window.document;
    root = document.createElement('div');
    document.body.append(root);
  });

  afterEach(async () => {
    cleanup?.();
    cleanup = undefined;
    await window.happyDOM.close();
    delete globalThis.window;
    delete globalThis.document;
  });

  it('lets customers combine category filters and a case/accent-insensitive search', async () => {
    cleanup = await renderStorefront(root, { mode: 'demo' });
    assert.equal(root.querySelectorAll('.p-card').length, 4);
    assert.match(root.querySelector('.shop-demo').textContent, /ilustrativos/);
    assert.equal(root.querySelector('.shop-hero img').getAttribute('src'), '/assets/hero.png');

    root.querySelector('.shop-filters [data-category="shoes"]').click();
    assert.equal(root.querySelectorAll('.p-card').length, 2);
    assert.equal(root.querySelector('.shop-filters [data-category="shoes"]').getAttribute('aria-pressed'), 'true');

    const search = root.querySelector('input[type="search"]');
    search.value = 'TENIS';
    search.dispatchEvent(new window.Event('input'));
    assert.equal(root.querySelectorAll('.p-card').length, 1);
    assert.match(root.querySelector('.p-card').textContent, /Tênis branco/);

    root.querySelector('.shop-filters [data-category="jewelry"]').click();
    assert.equal(root.querySelectorAll('.p-card').length, 0);
    assert.match(root.querySelector('.shop-empty').textContent, /outra busca/);
    root.querySelector('.shop-reset').click();
    assert.equal(search.value, '');
    assert.equal(root.querySelectorAll('.p-card').length, 4);
  });

  it('opens product details with sizes and preloads the exact product name in Yuri’s WhatsApp', async () => {
    const product = { id: 'shoe-1', name: 'Sandália A&B', category: 'shoes', description: 'Um modelo para conhecer.', price: 15990, images: ['/assets/sandalia.jpg', '/assets/tenis.jpg'], sizes: ['35', '36'], available: true };
    cleanup = await renderStorefront(root, { products: [product] });
    const opener = root.querySelector('.p-photo');
    opener.focus();
    opener.click();

    const dialog = root.querySelector('dialog');
    assert.equal(dialog.open, true);
    assert.equal(dialog.querySelector('h2').textContent, 'Sandália A&B');
    assert.deepEqual([...dialog.querySelectorAll('.p-sizes span')].map((el) => el.textContent), ['35', '36']);
    assert.equal(dialog.querySelector('.p-dialog-price').textContent, 'R$ 159,90');

    const interest = new URL(dialog.querySelector('.p-whatsapp').href);
    assert.equal(interest.hostname, 'wa.me');
    assert.equal(interest.pathname, '/5571991334337');
    assert.equal(interest.searchParams.get('text'), 'Olá, Yuri! Tenho interesse neste produto: Sandália A&B. Está disponível?');

    const secondPhoto = dialog.querySelectorAll('[data-image]')[1];
    secondPhoto.click();
    assert.equal(dialog.querySelector('.p-dialog-main-image').getAttribute('src'), '/assets/tenis.jpg');
    assert.equal(secondPhoto.getAttribute('aria-pressed'), 'true');
    dialog.querySelector('.p-dialog-close').click();
    assert.equal(dialog.open, false);
    assert.equal(document.activeElement, opener);
  });

  it('keeps live empty catalogs empty and shows demo products only in explicit demo mode', async () => {
    cleanup = await renderStorefront(root, { products: [], ads: [], mode: 'live' });
    assert.equal(root.querySelectorAll('.p-card').length, 0);
    assert.equal(root.querySelectorAll('.shop-ad').length, 0);
    assert.equal(root.querySelectorAll('.shop-demo').length, 0);
    assert.match(root.querySelector('.shop-empty').textContent, /Novidades em breve/);
    assert.equal(new URL(root.querySelector('.shop-empty a').href).pathname, '/5571991334337');
  });

  it('places the mobile advertisement between the first and second pair of products', async () => {
    cleanup = await renderStorefront(root, { mode: 'demo' });
    const children = [...root.querySelector('.shop-products').children];
    assert.equal(children.length, 5);
    assert.equal(children[0].classList.contains('p-card'), true);
    assert.equal(children[1].classList.contains('p-card'), true);
    assert.equal(children[2].classList.contains('shop-mobile-ad'), true);
    assert.match(children[2].textContent, /PROPAGANDA/);
    assert.equal(children[3].classList.contains('p-card'), true);
    assert.equal(children[4].classList.contains('p-card'), true);
  });

  it('shows active top and side ads with safe external links and skips inactive campaigns', async () => {
    cleanup = await renderStorefront(root, { ads: [
      { id: 'ad-top', title: 'Novidades da semana', placement: 'top', image_url: 'https://images.example/banner.jpg', target_url: 'https://example.com/novidades', active: true },
      { id: 'ad-side', title: 'Nossa seleção', placement: 'sidebar', image_url: '/assets/colar.jpg', target_url: 'https://example.com/selecao', active: true },
      { id: 'inactive', title: 'Não exibir', placement: 'top', active: false },
    ] });
    const top = root.querySelector('.shop-ad-top');
    const side = root.querySelector('.shop-ad-sidebar');
    assert.equal(top.tagName, 'A');
    assert.equal(side.tagName, 'A');
    assert.equal(top.href, 'https://example.com/novidades');
    assert.equal(side.href, 'https://example.com/selecao');
    assert.match(top.rel, /noopener/);
    assert.match(side.rel, /noreferrer/);
    assert.equal(root.querySelectorAll('.shop-ad').length, 2);
    assert.doesNotMatch(root.textContent, /Não exibir/);
  });

  it('renders stored text as text and refuses JavaScript image and advertisement URLs', async () => {
    const name = '<img src=x onerror=alert(1)> " &';
    cleanup = await renderStorefront(root, {
      products: [{ id: 'id\" onclick=alert(1)', name, category: 'jewelry', description: '<script>alert(2)</script>', images: ['javascript:alert(3)'], price: null, sizes: ['<svg onload=alert(4)>'], available: true }],
      ads: [{ id: 'unsafe', title: '<script>alert(5)</script>', placement: 'top', image_url: 'javascript:alert(6)', target_url: 'javascript:alert(7)', active: true }],
    });
    assert.equal(root.querySelectorAll('script,[onclick],[onerror],[onload]').length, 0);
    assert.equal(root.querySelector('.p-title-button h3').textContent, name);
    assert.equal(root.querySelector('.p-photo img').getAttribute('src'), '/assets/brincos.jpg');
    assert.equal(root.querySelector('.shop-ad-top').tagName, 'DIV');
    root.querySelector('.p-photo').click();
    assert.equal(root.querySelector('.p-description').textContent, '<script>alert(2)</script>');
    assert.equal(root.querySelectorAll('script,[onclick],[onerror],[onload]').length, 0);
  });

  it('opens and closes the mobile navigation with an accessible toggle', async () => {
    cleanup = await renderStorefront(root, { mode: 'demo' });
    const toggle = root.querySelector('.shop-menu-toggle');
    toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(root.querySelector('.shop-navigation').classList.contains('is-open'), true);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  });
});
