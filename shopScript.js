/* =========================================================================
   ONEO - SHOP 탭
   - --u 단위, 탭 필터(카드 전환 모션), 노란 인디케이터, 카드 클릭 → detail.html, 푸터 reveal
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

  const scroller = $('#shopScroll');
  const tabs = $$('.tab-btn');
  const cards = $$('.product-card');
  const grid = $('#product-grid');
  const titleEl = $('#section-title');
  const indicator = $('#tabIndicator');
  const tabsWrap = $('#categoryTabs');

  let current = 'protein';
  let switching = false;

  function moveIndicator() {
    const active = $('.tab-btn.active');
    if (!active) return;
    indicator.style.left = active.offsetLeft + 'px';
    indicator.style.width = active.offsetWidth + 'px';
  }

  /* 보이는 카드에 순서(--i)를 매겨 차례로 등장 */
  function showCards(category, replay) {
    let i = 0;
    cards.forEach((card) => {
      const match = category === 'all' || card.dataset.category === category;
      card.classList.toggle('is-hidden', !match);
      card.classList.remove('is-in', 'is-done');
      if (match) { card.style.setProperty('--i', i++); }
    });
    // 레이아웃 반영 후 등장
    void grid.offsetWidth;
    requestAnimationFrame(() => {
      cards.forEach((card) => {
        if (card.classList.contains('is-hidden')) return;
        card.classList.add('is-in');
        const delay = 1000 + parseFloat(card.style.getPropertyValue('--i')) * 70;
        setTimeout(() => card.classList.add('is-done'), delay + 100);
      });
    });
  }

  function setCategory(category, label) {
    if (switching || category === current) return;
    switching = true;
    current = category;
    tabs.forEach((b) => b.classList.toggle('active', b.dataset.category === category));
    moveIndicator();

    grid.classList.add('is-switching');
    titleEl.classList.add('is-swapping');
    setTimeout(() => {
      titleEl.textContent = category === 'all' ? 'All Products' : label;
      titleEl.classList.remove('is-swapping');
      // 제목이 위로 사라진 상태에서 아래에서 다시 올라오도록
      titleEl.style.transition = 'none';
      titleEl.style.translate = '0 110%';
      void titleEl.offsetWidth;
      titleEl.style.transition = '';
      titleEl.style.translate = '';
      grid.classList.remove('is-switching');
      showCards(category);
      scroller.scrollTo({ top: Math.min(scroller.scrollTop, 0), behavior: 'auto' });
      setTimeout(() => { switching = false; }, 350);
    }, 260);
  }

  tabs.forEach((btn) => btn.addEventListener('click', () => setCategory(btn.dataset.category, btn.textContent.trim())));

  /* 카드 클릭 → detail.html (기존 쿼리스트링 방식 그대로) */
  function openDetail(card) {
    const name = card.querySelector('.product-name')?.textContent || '';
    const desc = card.querySelector('.product-desc')?.textContent || '';
    const priceText = card.querySelector('.product-price')?.textContent || '0';
    const imgSrc = card.querySelector('.product-img')?.src || '';
    const badge = card.dataset.category || 'protein';
    const price = priceText.replace(/[^0-9]/g, '');
    const href = `detail.html?name=${encodeURIComponent(name)}&price=${price}&desc=${encodeURIComponent(desc)}&badge=${encodeURIComponent(badge)}&img=${encodeURIComponent(imgSrc)}`;
    document.body.classList.add('is-leaving');
    setTimeout(() => { location.href = href; }, 320);
  }
  cards.forEach((card) => {
    card.addEventListener('click', () => openDetail(card));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(card); } });
  });

  /* 푸터 reveal */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
      setTimeout(() => en.target.classList.add('reveal-done'), 1600);
    });
  }, { root: scroller, threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  $$('.site-footer [data-reveal]').forEach((el) => io.observe(el));

  /* 페이지 이동 부드럽게 */
  $$('a[href$=".html"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href === 'shop.html') { scroller.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      document.body.classList.add('is-leaving');
      setTimeout(() => { location.href = href; }, 360);
    });
  });

  window.addEventListener('resize', () => { updateUnit(); requestAnimationFrame(moveIndicator); });

  /* 시작 : 폰트가 자리 잡은 뒤 인디케이터 위치 계산 → 등장 */
  function start() {
    moveIndicator();
    indicator.style.transition = 'none';
    moveIndicator();
    void indicator.offsetWidth;
    indicator.style.transition = '';
    root.classList.add('is-ready');
    document.body.classList.add('is-ready');
    showCards(current);
  }
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(start));
})();
