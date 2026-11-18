/* =========================================================================
   ONEO - MY PAGE
   - --u 단위, 탭 전환(사이드바 / 상단 Cart·Orders·Wishlist), 장바구니·배송·좋아요 렌더링 (localStorage)
   ========================================================================= */
(() => {
  'use strict';
  const BASE_H = 800, BASE_W = 1100, U_MIN = 0.55, U_MAX = 2.6;
  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  function updateUnit() {
    const u = Math.max(U_MIN, Math.min(U_MAX, Math.min(innerHeight / BASE_H, innerWidth / BASE_W)));
    root.style.setProperty('--u', u.toFixed(4) + 'px');
  }
  updateUnit();
  window.addEventListener('resize', updateUnit);

  const scroller = $('#pageScroll');

  /* ---------- 저장소 ---------- */
  function load(key, fallback) {
    let v = null;
    try { v = JSON.parse(localStorage.getItem(key)); } catch (e) { v = null; }
    if (!Array.isArray(v)) {
      v = fallback;
      try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* noop */ }
    }
    return v;
  }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* noop */ } }

  const DEFAULT_CART = [
    { name: 'PROTEIN 20g', option: 'Option: 1EA / 20g', price: 3500, quantity: 1, img: 'img/protein2.webp' },
    { name: 'MATCHA', option: 'Option: 10EA / 10g', price: 35000, quantity: 1, img: 'img/matcha.webp' }
  ];
  const DEFAULT_ORDERS = [
    { name: 'PROTEIN 30g', option: '2026.11.08 / Tracking: CJ 68392019203', price: 3500, status: '배송중', img: 'img/protein4.webp' }
  ];
  const DEFAULT_WISH = [
    { name: 'MATCHA', option: 'Option: 10EA / 20g', price: 35000, img: 'img/matcha.webp' },
    { name: 'GRANOLA', option: 'Option: 6EA / 10g', price: 28000, img: 'img/granola.webp' }
  ];
  let cart = load('oneoCart', DEFAULT_CART);
  let orders = load('oneoOrders', DEFAULT_ORDERS);
  let wish = load('oneoWishlist', DEFAULT_WISH);

  /* 예전 데이터(png / jpg 경로)도 보이도록 */
  const thumbOf = (src) => (src || '').replace(/^(img\/[a-z0-9]+)\.png$/i, '$1.webp');

  /* ---------- 렌더 ---------- */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function makeCard(item, rightBuilder, k) {
    const card = el('div', 'cart-item-card');
    card.style.setProperty('--k', k);
    const left = el('div', 'cart-item-left');
    const box = el('div', 'cart-thumb-box' + (/survey/i.test(item.img || '') ? ' is-survey' : ''));
    const img = el('img', 'cart-thumb-img');
    img.alt = item.name || '';
    img.decoding = 'async';
    img.src = thumbOf(item.img);
    img.addEventListener('error', () => { img.style.display = 'none'; });
    box.appendChild(img);
    const info = el('div', 'cart-item-info');
    info.appendChild(el('h3', 'cart-item-name', item.name || item.title || ''));
    info.appendChild(el('span', 'cart-item-option', item.option || (item.flavor ? `Flavor: ${item.flavor}, Topping: ${item.topping}` : 'Option: Standard')));
    info.appendChild(el('span', 'cart-item-price', 'KRW ' + (Number(item.price) || 0).toLocaleString()));
    left.append(box, info);
    const right = el('div', 'cart-item-right');
    rightBuilder(right, card);
    card.append(left, right);
    return card;
  }
  function removeBtn(onRemove) {
    return (right, card) => {
      const btn = el('button', 'btn-remove-item');
      btn.type = 'button';
      btn.setAttribute('aria-label', '삭제');
      btn.innerHTML = '&times;';
      btn.addEventListener('click', () => {
        card.classList.add('is-removing');
        setTimeout(onRemove, 300);
      });
      right.appendChild(btn);
    };
  }
  function empty(container, text) { container.appendChild(el('div', 'empty-notice', text)); }

  const cartBox = $('#cart-items-container');
  const ordersBox = $('#orders-container');
  const wishBox = $('#wishlist-container');
  const checkoutBar = $('#checkout-bar');
  const totalEl = $('#total-amount-value');

  function bump(id, value) {
    const e = $(id);
    if (e.textContent === String(value)) return;
    e.textContent = value;
    e.classList.remove('is-bump'); void e.offsetWidth; e.classList.add('is-bump');
  }
  function renderCounts() {
    bump('#header-cart-count', cart.length);
    bump('#header-orders-count', orders.length);
    bump('#header-wishlist-count', wish.length);
    $('#cart-title-count').textContent = cart.length;
    $('#wishlist-title-count').textContent = wish.length;
  }
  function renderCart() {
    cartBox.textContent = '';
    let sum = 0;
    cart.forEach((item, i) => {
      sum += (Number(item.price) || 0) * (Number(item.quantity) || 1);
      cartBox.appendChild(makeCard(item, (right, card) => {
        right.appendChild(el('span', 'cart-item-qty', 'QTY:' + (Number(item.quantity) || 1)));
        removeBtn(() => { cart.splice(i, 1); save('oneoCart', cart); renderAll(false); })(right, card);
      }, i));
    });
    if (!cart.length) empty(cartBox, '장바구니가 비어 있습니다.');
    checkoutBar.style.display = cart.length ? 'flex' : 'none';
    checkoutBar.style.setProperty('--k', cart.length);
    totalEl.textContent = 'KRW ' + sum.toLocaleString();
  }
  function renderOrders() {
    ordersBox.textContent = '';
    orders.forEach((o, i) => ordersBox.appendChild(makeCard(o, (right) => {
      right.appendChild(el('span', 'delivery-status-badge', o.status || '배송중'));
    }, i)));
    if (!orders.length) empty(ordersBox, '주문 내역이 없습니다.');
  }
  function renderWish() {
    wishBox.textContent = '';
    wish.forEach((w, i) => wishBox.appendChild(makeCard(w, removeBtn(() => { wish.splice(i, 1); save('oneoWishlist', wish); renderAll(false); }), i)));
    if (!wish.length) empty(wishBox, '좋아요한 상품이 없습니다.');
  }
  function renderAll() { renderCart(); renderOrders(); renderWish(); renderCounts(); }
  renderAll();

  /* ---------- 탭 ---------- */
  const sideItems = $$('.side-menu-item');
  const panels = $$('.panel-section');
  function switchTab(tab) {
    sideItems.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    panels.forEach((p) => {
      const on = p.id === 'panel-' + tab;
      if (on && !p.classList.contains('active')) {
        p.classList.add('switched');
        // 애니메이션을 다시 재생
        p.classList.remove('active'); void p.offsetWidth; p.classList.add('active');
      } else p.classList.toggle('active', on);
    });
    scroller.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const tabParam = new URLSearchParams(location.search).get('tab');
  if (tabParam && ['cart', 'orders', 'wishlist', 'center'].includes(tabParam)) {
    sideItems.forEach((b) => b.classList.toggle('active', b.dataset.tab === tabParam));
    panels.forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tabParam));
  }
  sideItems.forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $$('.stat-item').forEach((s) => s.addEventListener('click', () => switchTab(s.dataset.tabTarget)));

  /* ---------- CHECKOUT : 장바구니 → 배송현황 ---------- */
  $('#checkoutBtn').addEventListener('click', () => {
    if (!cart.length) return;
    const d = new Date();
    const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    cart.forEach((it) => orders.unshift({
      name: it.name,
      option: `${date} / Qty ${Number(it.quantity) || 1} / Tracking: 준비중`,
      price: (Number(it.price) || 0) * (Number(it.quantity) || 1),
      status: '상품준비중',
      img: it.img
    }));
    cart = [];
    save('oneoCart', cart); save('oneoOrders', orders);
    renderAll();
    switchTab('orders');
  });

  /* ---------- 푸터 reveal / 페이지 이동 ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
      setTimeout(() => en.target.classList.add('reveal-done'), 1600);
    });
  }, { root: scroller, threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  $$('.site-footer [data-reveal]').forEach((el2) => io.observe(el2));

  $$('a[href$=".html"]').forEach((a) => a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (href === 'page.html') { scroller.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    document.body.classList.add('is-leaving');
    setTimeout(() => { location.href = href; }, 360);
  }));

  const start = () => requestAnimationFrame(() => {
    root.classList.add('is-ready'); document.body.classList.add('is-ready');
    setTimeout(() => $$('.side-menu-item').forEach((b) => b.classList.add('settled')), 1400);
  });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start);
})();
