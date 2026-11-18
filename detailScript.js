/* =========================================================================
   ONEO - PRODUCT DETAIL
   - 쿼리스트링(name/price/desc/badge/img)으로 받은 제품 정보 반영
   - 제품 이미지 2장을 꽉 채워 자동 크로스페이드
   - 수량/총액, 장바구니, 바로 구매
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

  const scroller = $('#detailScroll');
  const params = new URLSearchParams(location.search);
  const name = params.get('name') || 'PROTEIN 15g';
  const price = parseInt(params.get('price'), 10) || 3500;
  const desc = params.get('desc');
  const badge = params.get('badge');
  const imgParam = params.get('img') || '';

  /* 제품 키 (예: .../img/protein3.webp → protein3) */
  const m = imgParam.match(/\/([a-z0-9]+)\.(?:webp|png|jpg)(?:\?|$)/i);
  const key = m ? m[1] : 'protein1';

  $('.detail-product-name').textContent = name;
  if (desc) $('.detail-product-desc').textContent = desc;
  if (badge) $('.detail-badge').textContent = badge;
  document.title = 'ONEO - ' + name;
  const priceEl = $('.price-value');
  priceEl.dataset.price = price;
  priceEl.textContent = 'KRW ' + price.toLocaleString();

  const imgs = $$('.detail-main-img');
  imgs.forEach((im, i) => { im.src = `img/detail/${key}_${i + 1}.webp`; im.alt = `${name} 이미지 ${i + 1}`; });

  /* 이미지 자동 전환 */
  let idx = 0;
  setInterval(() => {
    idx = (idx + 1) % imgs.length;
    imgs.forEach((im, i) => im.classList.toggle('is-current', i === idx));
  }, 4500);

  /* 수량 / 총액 */
  let qty = 1;
  const countEl = $('#quantity-count');
  const totalEl = $('#total-price-value');
  totalEl.textContent = 'KRW ' + price.toLocaleString();
  function renderTotal() {
    countEl.textContent = qty;
    totalEl.textContent = 'KRW ' + (price * qty).toLocaleString();
    totalEl.classList.remove('is-bump'); void totalEl.offsetWidth; totalEl.classList.add('is-bump');
  }
  $('#minus-btn').addEventListener('click', () => { if (qty > 1) { qty--; renderTotal(); } });
  $('#plus-btn').addEventListener('click', () => { qty++; renderTotal(); });

  /* 장바구니 (page.html 이 읽는 oneoCart 형식) */
  function addToCart() {
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem('oneoCart')) || []; } catch (e) { cart = []; }
    const found = cart.findIndex((it) => it.name === name);
    if (found > -1) cart[found].quantity = (Number(cart[found].quantity) || 1) + qty;
    else cart.push({ name, option: 'Option: 1EA', price, quantity: qty, img: `img/${key}.webp` });
    try { localStorage.setItem('oneoCart', JSON.stringify(cart)); } catch (e) { /* noop */ }
  }
  function go(href) {
    document.body.classList.add('is-leaving');
    setTimeout(() => { location.href = href; }, 360);
  }
  const cartBtn = $('#cartBtn');
  cartBtn.addEventListener('click', () => {
    addToCart();
    cartBtn.textContent = '담았어요 ✓';
    cartBtn.classList.add('is-added');
    setTimeout(() => { cartBtn.textContent = '장바구니'; cartBtn.classList.remove('is-added'); }, 1400);
  });
  $('#buyBtn').addEventListener('click', () => { addToCart(); go('page.html?tab=cart'); });

  /* 하단 상세 영역: 스크롤로 들어오면 등장 / 푸터 reveal */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
      if (en.target.hasAttribute('data-reveal')) setTimeout(() => en.target.classList.add('reveal-done'), 1600);
    });
  }, { root: scroller, threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.site-footer [data-reveal]').forEach((el) => io.observe(el));
  // 상세 이미지 영역은 매우 길어서 비율 대신 "조금이라도 보이면" 등장
  const subIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); subIO.unobserve(en.target); } });
  }, { root: scroller, threshold: 0, rootMargin: '0px 0px -10% 0px' });
  $$('.detail-sub-section').forEach((el) => subIO.observe(el));

  $$('a[href$=".html"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      go(a.getAttribute('href'));
    });
  });

  /* 우측 점 : 위 / 상세 정보로 이동, 스크롤 위치에 따라 활성 표시 */
  const dots = $$('#detailDots .section-dot');
  const info = $('.detail-sub-section');
  function infoTop() { return info.offsetTop - 120 * parseFloat(getComputedStyle(root).getPropertyValue('--u')); }
  dots.forEach((d) => d.addEventListener('click', () => {
    // 위 점 = 맨 위, 아래 점 = 맨 아래(푸터까지)
    const top = d.dataset.target === 'top' ? 0 : scroller.scrollHeight - scroller.clientHeight;
    scroller.scrollTo({ top, behavior: 'smooth' });
  }));
  function syncDots() {
    const max = scroller.scrollHeight - scroller.clientHeight;
    const lower = scroller.scrollTop > Math.min(infoTop() - innerHeight * 0.45, max * 0.5);
    dots[0].classList.toggle('is-active', !lower);
    dots[1].classList.toggle('is-active', lower);
  }
  scroller.addEventListener('scroll', syncDots, { passive: true });
  syncDots();

  /* 시작 */
  const start = () => requestAnimationFrame(() => { root.classList.add('is-ready'); document.body.classList.add('is-ready'); });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start);
})();
