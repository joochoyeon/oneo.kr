/* =========================================================================
   ONEO - BRAND 탭
   - 화면 크기에 맞춘 --u 단위 (홈 탭과 동일)
   - 휠 / 키보드 / 터치로 섹션 한 장씩 이동 (모션 겹침 방지 잠금 포함)
   - 섹션 진입 시 등장 모션(.is-active), 푸터 reveal
   ========================================================================= */
(() => {
  'use strict';

  const BASE_H = 800, BASE_W = 1100, U_MIN = 0.55, U_MAX = 2.6;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  function updateUnit() {
    const u = Math.max(U_MIN, Math.min(U_MAX, Math.min(innerHeight / BASE_H, innerWidth / BASE_W)));
    root.style.setProperty('--u', u.toFixed(4) + 'px');
  }
  updateUnit();

  function makeBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      let t = x;
      for (let i = 0; i < 6; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-5) break;
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      return sy(Math.max(0, Math.min(1, t)));
    };
  }
  const ease = makeBezier(0.22, 1, 0.36, 1);

  const scroller = $('#brandScroll');
  const sections = $$('.brand-section');
  const footer = $('#bFooter');
  const LAST = sections.length;            // 마지막 단계 = 푸터

  let current = 0;
  let locked = false, lockTimer = 0, animId = 0;
  const settleTimers = new Map();
  const MOVE_MS = 1000, LOCK_MS = 1100;

  function targetY(i) {
    if (i >= LAST) return scroller.scrollHeight - scroller.clientHeight;   // 푸터가 보이는 맨 아래
    return sections[i].offsetTop;
  }

  /* 섹션 활성 상태: 들어온 섹션만 .is-active, 모션이 끝나면 .is-settled(둥둥/호버 지연 제거) */
  function applyState(index) {
    sections.forEach((sec, i) => {
      const on = i === index;
      if (on === sec.classList.contains('is-active')) return;
      clearTimeout(settleTimers.get(sec));
      sec.classList.remove('is-settled');
      if (on) {
        sec.classList.add('is-active');
        settleTimers.set(sec, setTimeout(() => sec.classList.add('is-settled'), 2400));
      } else {
        sec.classList.remove('is-active');
      }
    });
  }

  function animateTo(y, ms = MOVE_MS) {
    cancelAnimationFrame(animId);
    const from = scroller.scrollTop, dist = y - from;
    if (Math.abs(dist) < 1) return;
    if (REDUCED) { scroller.scrollTop = y; return; }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      scroller.scrollTop = from + dist * ease(p);
      if (p < 1) animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
  }

  function goTo(index, instant = false) {
    index = Math.max(0, Math.min(LAST, index));
    if (index === current && !instant) return;
    current = index;
    // 푸터 단계에서는 배너가 접히며 사라지고(메뉴바 밑에 걸쳐 보이지 않게), 다시 올라오면 재생
    applyState(index >= LAST ? -1 : index);
    if (instant) { cancelAnimationFrame(animId); scroller.scrollTop = targetY(index); return; }
    locked = true;
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => { locked = false; }, LOCK_MS);
    animateTo(targetY(index));
  }

  /* --- 휠 : 트랙패드 관성까지 한 번의 제스처로 묶음 --- */
  let gesture = false, gestureTimer = 0;
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (!dy) return;
    const fresh = !gesture;
    gesture = true;
    clearTimeout(gestureTimer);
    gestureTimer = setTimeout(() => { gesture = false; }, 110);
    if (!fresh || locked || Math.abs(dy) < 4) return;
    goTo(current + Math.sign(dy));
  }, { passive: false });

  /* --- 키보드 --- */
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let dir = 0;
    if (['ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) dir = 1;
    else if (['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) dir = -1;
    else if (e.key === 'Home') { e.preventDefault(); if (!locked) goTo(0); return; }
    else if (e.key === 'End') { e.preventDefault(); if (!locked) goTo(LAST); return; }
    else return;
    e.preventDefault();
    if (!locked) goTo(current + dir);
  });

  /* --- 터치 --- */
  let touchY = null;
  window.addEventListener('touchstart', (e) => { touchY = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
  window.addEventListener('touchmove', (e) => { if (touchY !== null) e.preventDefault(); }, { passive: false });
  window.addEventListener('touchend', (e) => {
    if (touchY === null) return;
    const diff = touchY - e.changedTouches[0].clientY;
    touchY = null;
    if (Math.abs(diff) < 50 || locked) return;
    goTo(current + (diff > 0 ? 1 : -1));
  }, { passive: true });

  /* --- 리사이즈 : 단위 재계산 후 현재 위치로 즉시 정렬 --- */
  let rz = 0;
  window.addEventListener('resize', () => {
    updateUnit();
    clearTimeout(rz);
    rz = setTimeout(() => goTo(current, true), 200);
  });

  /* --- 푸터 reveal --- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
      setTimeout(() => en.target.classList.add('reveal-done'), 1600);
    });
  }, { root: scroller, threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal]').forEach((el) => io.observe(el));

  /* --- 페이지 이동 : 부드럽게 사라진 뒤 이동 --- */
  $$('a[href$=".html"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
      const href = a.getAttribute('href');
      if (href === 'brand.html') { e.preventDefault(); if (!locked) goTo(0); return; }
      e.preventDefault();
      document.body.classList.add('is-leaving');
      setTimeout(() => { location.href = href; }, 360);
    });
  });

  /* --- 시작 : 첫 섹션 등장 --- */
  scroller.scrollTop = 0;
  requestAnimationFrame(() => setTimeout(() => applyState(0), 120));
})();
