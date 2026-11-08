import './shared.css';
import './storefront.css';
import './admin.css';
import { demoProducts, demoAds } from './demo.js';
import { renderStorefront } from './storefront.js';
import { renderAdmin } from './admin.js';

const root = document.querySelector('#app');

async function start() {
  const isAdmin = /^\/admin(?:\/|$)/.test(location.pathname);
  document.title = isAdmin ? 'Administrador | Yuri Araújo Boutique' : 'Yuri Araújo Boutique | Sapatos & Joias';
  try {
    if (isAdmin) {
      const meResponse = await fetch('/api/me', { headers: { Accept: 'application/json' } });
      if (!meResponse.ok) throw new Error('Não foi possível verificar o acesso administrativo.');
      const me = await meResponse.json();
      await renderAdmin(root, { mode: me.mode, products: me.mode === 'demo' ? structuredClone(demoProducts) : [], ads: me.mode === 'demo' ? structuredClone(demoAds) : [], me });
      return;
    }
    const response = await fetch('/api/catalog', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Não foi possível carregar a loja agora.');
    const catalog = await response.json();
    const products = catalog.mode === 'demo' ? structuredClone(demoProducts) : catalog.products;
    const ads = catalog.mode === 'demo' ? structuredClone(demoAds) : catalog.ads;
    await renderStorefront(root, { products, ads, mode: catalog.mode });
  } catch (error) {
    root.innerHTML = '<main class="load-error" id="conteudo"><span class="initial-brand">Yuri Araújo</span><p>Não foi possível abrir esta página agora.</p><p>Tente novamente ou fale com Yuri pelo WhatsApp.</p><button type="button" id="retry-load">Tentar novamente</button><a href="https://wa.me/5571991334337" target="_blank" rel="noopener noreferrer">Falar com Yuri</a></main>';
    document.querySelector('#retry-load').addEventListener('click', () => location.reload());
    console.error('Falha ao carregar a loja:', error?.message);
  }
}
start();
