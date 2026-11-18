/* =========================================================================
   ONEO landing — myScript.js (정리/최적화 버전)

   [이 파일에서 바뀐 핵심]
   1. 화면 크기 대응: 노트북(높이 800 기준)에서 만든 디자인을 아이맥 27인치(2560x1440)에서도
      똑같은 비율로 보이게 --u(디자인 1px) 단위를 계산해서 CSS 에 넣어줌.
   2. 히어로 가루 캔버스: 파티클마다 getBoundingClientRect/atan2/sqrt/sin 을 매 프레임 부르던 것을
      전부 미리 계산 + 색상별 배치 그리기 → 프레임당 비용 대폭 감소. 화면 밖/탭 숨김 때 정지.
   3. 섹션 이동: 휠/키보드/터치를 한 번에 한 섹션씩 처리하는 컨트롤러(잠금) → 모션 겹침 방지.
   4. 섹션 8 패키지: width/top 을 매 스크롤마다 바꾸던 것(리플로우) → transform 만 사용 + rAF.
   5. 중복/죽은 코드 정리 (window scroll 에 걸려 한 번도 안 불리던 products 핸들러 등).
   ========================================================================= */

(() => {
  'use strict';

  /* -----------------------------------------------------------------------
     0. 공통 설정 / 유틸
     ----------------------------------------------------------------------- */

  // 디자인 기준 화면 (노트북 브라우저 뷰포트). 달라 보이면 이 숫자만 조정하세요.
  const BASE_H = 800;
  const BASE_W = 1100;      // 가로가 이보다 좁아지면 축소
  const U_MIN = 0.55;
  const U_MAX = 2.6;

  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  let U = 1; // 현재 "디자인 1px" 이 실제로 몇 px 인지

  function updateUnit() {
    const h = window.innerHeight;
    const w = window.innerWidth;
    U = Math.max(U_MIN, Math.min(U_MAX, Math.min(h / BASE_H, w / BASE_W)));
    root.style.setProperty('--u', U.toFixed(4) + 'px');
  }
  updateUnit();

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // CSS 의 cubic-bezier(0.22, 1, 0.36, 1) 와 같은 곡선 → 로고/슬로건 이동 모션과 페이지 스크롤이 같은 호흡
  function makeBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t) => ((ay * t + by) * t + cy) * t;
    const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      let t = x;
      for (let i = 0; i < 6; i++) {
        const dx = sampleX(t) - x;
        if (Math.abs(dx) < 1e-5) break;
        const d = slopeX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= dx / d;
      }
      return sampleY(Math.max(0, Math.min(1, t)));
    };
  }
  const easeSection = makeBezier(0.22, 1, 0.36, 1);

  /* -----------------------------------------------------------------------
     1. 주요 요소
     ----------------------------------------------------------------------- */
  const scrollContainer = $('.scroll-container');
  const sharedLogo = $('#sharedBrandLogo');
  const sharedSlogan = $('#sharedMainSlogan');
  const sections = $$('.scroll-container > section, .scroll-container > footer');
  const sec = {};
  for (let i = 1; i <= 12; i++) sec[i] = document.getElementById('sec' + i);

  // 한 장씩 넘어가는 구간: sec1 ~ sec7 (+ sec8 진입). sec8 안쪽부터는 자유 스크롤.
  const stepSections = [sec[1], sec[2], sec[3], sec[4], sec[5], sec[6], sec[7], sec[8]];
  const LAST_STEP = stepSections.length - 1; // 7 (= sec8)

  /* -----------------------------------------------------------------------
     2. 섹션 1 : 가루 파티클 (성능 최적화 버전)
     ----------------------------------------------------------------------- */
  const canvas = $('#powderCanvas');
  const ctx = canvas.getContext('2d');

  const powderColors = [
    'rgba(254, 235, 141, 0.96)',
    'rgba(255, 243, 176, 0.88)',
    'rgba(238, 217, 120, 0.85)',
    'rgba(255, 248, 204, 0.78)',
    'rgba(218, 196, 102, 0.70)'
  ];

  const mouse = {
    x: -9999, y: -9999, prevX: -9999, prevY: -9999,
    vx: 0, vy: 0, radius: 130, isMoving: false, moveTimer: null
  };

  // 클릭 시 퍼지는 충격파
  const pulse = { x: 0, y: 0, power: 0 };

  let particles = [];
  let colorBounds = [];          // 색상별로 정렬된 파티클 구간
  let heroW = 0, heroH = 0;
  let heroRAF = 0;
  let heroVisible = true;
  let heroInView = true;
  let heroStopTimer = null;

  class PowderParticle {
    constructor(x, y, scale) {
      this.originX = x + (Math.random() - 0.5) * 2.2 * scale;
      this.originY = y + (Math.random() - 0.5) * 2.2 * scale;

      this.x = this.originX + (Math.random() - 0.5) * 40 * scale;
      this.y = this.originY + (Math.random() - 0.5) * 40 * scale;
      this.vx = 0;
      this.vy = 0;

      this.size = (Math.random() * 1.3 + 0.8) * scale;
      this.colorIndex = Math.floor(Math.random() * powderColors.length);

      this.ease = 0.035 + Math.random() * 0.025;
      this.friction = 0.88 + Math.random() * 0.04;
      this.waveStrength = (5.0 + Math.random() * 2.5) * scale;

      // 중심 기준 거리/각도는 원점이 고정이라 한 번만 계산
      const dx = this.originX - heroW / 2;
      const dy = this.originY - heroH * 0.46;
      const dist = Math.sqrt(dx * dx + dy * dy) / scale; // 파동 간격도 디자인 단위로 통일
      const ang = Math.atan2(dy, dx);
      this.rx = Math.cos(ang);
      this.ry = Math.sin(ang);

      // sin(a - t) = sin(a)cos(t) - cos(a)sin(t) → 시간 항만 프레임마다 계산하면 됨
      const waveOffset = Math.random() * Math.PI * 2;
      const p1 = dist * 0.035 + waveOffset;
      const p2 = dist * 0.055 + 1.5;
      const p3 = dist * 0.018 + 3.0;
      this.s1 = Math.sin(p1); this.c1 = Math.cos(p1);
      this.s2 = Math.sin(p2); this.c2 = Math.cos(p2);
      this.s3 = Math.sin(p3); this.c3 = Math.cos(p3);
    }
  }

  function initParticles() {
    particles = [];
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    heroW = rect.width;
    heroH = rect.height;
    canvas.width = Math.round(heroW * dpr);
    canvas.height = Math.round(heroH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    mouse.radius = 130 * U;

    // 글자 크기도 화면(U)에 비례 (기존: 최대 280px 고정 → 27인치에서 작아 보이던 문제)
    const fontSize = Math.min(heroW * 0.17, 280 * U);
    const centerX = heroW / 2;
    const centerY = heroH * 0.46;
    const lineHeight = fontSize * 0.96;

    // 글자가 있는 띠 영역만 샘플링 (전체 화면 getImageData 보다 훨씬 가벼움)
    const bandTop = Math.max(0, Math.floor(centerY - fontSize * 1.5));
    const bandH = Math.min(Math.ceil(fontSize * 3), Math.ceil(heroH - bandTop));

    const off = document.createElement('canvas');
    off.width = Math.round(heroW);
    off.height = bandH;
    const offCtx = off.getContext('2d', { willReadFrequently: true });

    offCtx.font = `700 ${fontSize}px 'Oswald', sans-serif`;
    offCtx.fillStyle = '#FFFFFF';
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    if ('letterSpacing' in offCtx) offCtx.letterSpacing = `${-4 * (fontSize / 245)}px`;

    offCtx.fillText('A lifestyle', centerX, centerY - lineHeight / 2 - bandTop);
    offCtx.fillText('I create', centerX, centerY + lineHeight / 2 - bandTop);

    const data = offCtx.getImageData(0, 0, off.width, off.height).data;
    const gap = Math.max(2, Math.round(3 * (fontSize / 245))); // 파티클 개수는 화면 크기와 무관하게 거의 일정
    const scale = fontSize / 245;

    for (let y = 0; y < off.height; y += gap) {
      for (let x = 0; x < off.width; x += gap) {
        if (data[(y * off.width + x) * 4 + 3] > 128) {
          particles.push(new PowderParticle(x, y + bandTop, scale));
          if (Math.random() > 0.5) particles.push(new PowderParticle(x + 1.2 * scale, y + bandTop + 1.2 * scale, scale));
        }
      }
    }

    // 색상 순으로 정렬 → fillStyle 을 5번만 바꾸고 그리기
    particles.sort((a, b) => a.colorIndex - b.colorIndex);
    colorBounds = [];
    let start = 0;
    for (let c = 0; c < powderColors.length; c++) {
      let end = start;
      while (end < particles.length && particles[end].colorIndex === c) end++;
      colorBounds.push([start, end]);
      start = end;
    }
  }

  function animateHero(time) {
    heroRAF = requestAnimationFrame(animateHero);

    ctx.clearRect(0, 0, heroW, heroH);

    // 시간 항 (프레임당 6번만 계산)
    const T1 = time * 0.003, T2 = time * 0.0022, T3 = time * 0.0015;
    const cT1 = Math.cos(T1), sT1 = Math.sin(T1);
    const cT2 = Math.cos(T2), sT2 = Math.sin(T2);
    const cT3 = Math.cos(T3), sT3 = Math.sin(T3);

    const mouseActive = mouse.isMoving;
    const mx = mouse.x, my = mouse.y, mr = mouse.radius, mr2 = mr * mr;
    const mvx = mouse.vx, mvy = mouse.vy;
    const pulseOn = pulse.power > 0.02;
    const pr = 420 * U, pr2 = pr * pr;

    for (let c = 0; c < colorBounds.length; c++) {
      const [from, to] = colorBounds[c];
      ctx.fillStyle = powderColors[c];

      for (let i = from; i < to; i++) {
        const p = particles[i];

        if (mouseActive) {
          const dx = mx - (p.x + p.size * 0.5);
          const dy = my - (p.y + p.size * 0.5);
          const d2 = dx * dx + dy * dy;
          if (d2 < mr2) {
            const distance = Math.sqrt(d2);
            const force = (mr - distance) / mr;
            const angle = Math.atan2(dy, dx);
            const ca = Math.cos(angle), sa = Math.sin(angle);

            p.vx -= ca * force * 5.5 * U;
            p.vy -= sa * force * 5.5 * U;
            p.vx += (-sa * force * 4.2 + mvx * force * 0.28) * U;
            p.vy += (ca * force * 4.2 + mvy * force * 0.28) * U;
            p.vx += (Math.random() - 0.5) * force * 3.0 * U;
            p.vy += (Math.random() - 0.5) * force * 3.0 * U;
          }
        }

        // 클릭 충격파: 클릭 지점에서 바깥으로 밀어냄
        if (pulseOn) {
          const dx = p.x - pulse.x;
          const dy = p.y - pulse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < pr2 && d2 > 1) {
            const distance = Math.sqrt(d2);
            const f = (1 - distance / pr) * pulse.power * 9 * U;
            p.vx += (dx / distance) * f;
            p.vy += (dy / distance) * f;
          }
        }

        const r1 = p.s1 * cT1 - p.c1 * sT1;
        const r2 = p.s2 * cT2 - p.c2 * sT2;
        const r3 = p.s3 * cT3 - p.c3 * sT3;
        const wave = (r1 * 0.45 + r2 * 0.35 + r3 * 0.2) * p.waveStrength;

        p.vx += (p.originX + p.rx * wave - p.x) * p.ease;
        p.vy += (p.originY + p.ry * wave - p.y) * p.ease;
        p.vx *= p.friction;
        p.vy *= p.friction;
        p.x += p.vx;
        p.y += p.vy;

        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }

    mouse.vx *= 0.85;
    mouse.vy *= 0.85;
    pulse.power *= 0.9;
  }

  function startHero() {
    if (heroRAF || REDUCED_MOTION && particles.length === 0) return;
    heroRAF = requestAnimationFrame(animateHero);
  }
  function stopHero() {
    cancelAnimationFrame(heroRAF);
    heroRAF = 0;
  }
  function syncHeroRunning() {
    if (heroInView && heroVisible) startHero();
    else stopHero();
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (mouse.prevX !== -9999) {
      mouse.vx = cx - mouse.prevX;
      mouse.vy = cy - mouse.prevY;
    }
    mouse.x = mouse.prevX = cx;
    mouse.y = mouse.prevY = cy;
    mouse.isMoving = true;

    clearTimeout(mouse.moveTimer);
    mouse.moveTimer = setTimeout(() => { mouse.isMoving = false; }, 120);
  });

  canvas.addEventListener('mouseleave', () => {
    mouse.isMoving = false;
    mouse.x = mouse.y = mouse.prevX = mouse.prevY = -9999;
  });

  // [추가 인터랙션] 클릭하면 가루가 사방으로 터졌다가 다시 모임
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    pulse.x = e.clientX - rect.left;
    pulse.y = e.clientY - rect.top;
    pulse.power = 1;
  });

  // 터치 기기: 손가락 위치도 마우스처럼 처리
  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!t) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = t.clientX - rect.left;
    mouse.y = t.clientY - rect.top;
    mouse.isMoving = true;
    clearTimeout(mouse.moveTimer);
    mouse.moveTimer = setTimeout(() => { mouse.isMoving = false; }, 120);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    heroVisible = !document.hidden;
    syncHeroRunning();
    syncEndingRunning();
  });

  /* -----------------------------------------------------------------------
     3. 자동 롤링 갤러리
     ----------------------------------------------------------------------- */
  class AutoRollingGallery {
    constructor(selector, intervalMs = 3000) {
      this.container = $(selector);
      this.images = this.container ? $$('.rolling-img', this.container) : [];
      this.currentIndex = 0;
      this.intervalMs = intervalMs;
      this.timer = null;
    }
    next() {
      if (this.images.length === 0) return;
      this.images[this.currentIndex].classList.remove('active');
      this.currentIndex = (this.currentIndex + 1) % this.images.length;
      this.images[this.currentIndex].classList.add('active');
    }
    start() {
      if (this.timer || this.images.length <= 1) return;
      this.timer = setInterval(() => this.next(), this.intervalMs);
    }
    stop() {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  const storyGallery = new AutoRollingGallery('[data-rolling="story"]', 3000);
  const mixGallery = new AutoRollingGallery('[data-rolling="mix"]', 3000);

  /* -----------------------------------------------------------------------
     4. 섹션 상태 머신 (공유 로고 / 슬로건 / 각 섹션 is-active)
        - 기존: IntersectionObserver(0.55) 가 스크롤 도중에 반응 → 빠르게 넘기면 모션이 겹침
        - 변경: 이동을 "시작하는 순간" 한 번만 상태를 바꿈 (컨트롤러가 이동 중엔 입력 잠금)
     ----------------------------------------------------------------------- */
  const activeTargets = [sec[3], sec[4], sec[5], sec[6], sec[7]];
  const sharedMix = $('#sharedMixGallery');
  let currentIndex = 0;
  let prevIndex = 0;

  // 섹션 5 갤러리가 섹션 6 으로 "그대로" 올라가도록 하는 공유 레이어 상태
  function setGalleryState(index, prev) {
    if (!sharedMix) return;
    const g = sharedMix.classList;
    // 섹션 5 로 처음 들어올 때만 살짝 늦게 등장 (점선/슬로건이 먼저), 나머지 이동은 지연 없이
    sharedMix.style.setProperty('--gd', index === 4 && prev < 4 ? '0.55s' : '0s');
    g.remove('pos-mix', 'pos-strip', 'pos-exit');
    if (index === 4) g.add('pos-mix');
    else if (index === 5) g.add('pos-strip');
    else if (index >= 6) g.add('pos-exit');
  }

  function applySectionState(index) {
    const target = stepSections[Math.min(index, LAST_STEP)];
    setGalleryState(index, prevIndex);
    prevIndex = index;

    activeTargets.forEach((s) => { if (s && s !== target) s.classList.remove('is-active'); });

    const logo = sharedLogo.classList;
    const slogan = sharedSlogan.classList;

    switch (index) {
      case 0: // sec1
        logo.remove('pos-intro', 'pos-story', 'pos-exit');
        slogan.remove('pos-center', 'pos-top', 'pos-exit');
        storyGallery.stop(); mixGallery.stop();
        break;
      case 1: // sec2
        logo.remove('pos-story', 'pos-exit'); logo.add('pos-intro');
        slogan.remove('pos-center', 'pos-top', 'pos-exit');
        storyGallery.stop(); mixGallery.stop();
        break;
      case 2: // sec3
        logo.remove('pos-intro', 'pos-exit'); logo.add('pos-story');
        slogan.remove('pos-center', 'pos-top', 'pos-exit');
        sec[3].classList.add('is-active');
        storyGallery.start(); mixGallery.stop();
        break;
      case 3: // sec4
        logo.remove('pos-intro', 'pos-story'); logo.add('pos-exit');
        slogan.remove('pos-top', 'pos-exit'); slogan.add('pos-center');
        sec[4].classList.add('is-active');
        storyGallery.stop(); mixGallery.stop();
        break;
      case 4: // sec5
        logo.remove('pos-intro', 'pos-story'); logo.add('pos-exit');
        slogan.remove('pos-center', 'pos-exit'); slogan.add('pos-top');
        sec[5].classList.add('is-active');
        storyGallery.stop(); mixGallery.start();
        break;
      case 5: // sec6
      case 6: // sec7
        logo.remove('pos-intro', 'pos-story'); logo.add('pos-exit');
        slogan.remove('pos-center', 'pos-top'); slogan.add('pos-exit');
        (index === 5 ? sec[6] : sec[7]).classList.add('is-active');
        storyGallery.stop(); mixGallery.stop();
        break;
      default: // sec8 이후
        logo.remove('pos-intro', 'pos-story'); logo.add('pos-exit');
        slogan.remove('pos-center', 'pos-top'); slogan.add('pos-exit');
        storyGallery.stop(); mixGallery.stop();
    }

    document.body.classList.toggle('on-hero', index === 0);
    $$('.section-dot').forEach((d, i) => d.classList.toggle('is-active', i === Math.min(index, LAST_STEP)));
    const dots = $('.section-dots');
    if (dots) dots.classList.toggle('is-visible', index <= LAST_STEP);

    heroInView = index === 0;
    clearTimeout(heroStopTimer);
    if (heroInView) syncHeroRunning();
    else heroStopTimer = setTimeout(syncHeroRunning, 1250);
  }

  /* -----------------------------------------------------------------------
     5. 섹션 이동 컨트롤러 (휠 / 키보드 / 터치 / 도트 / 로고)
     ----------------------------------------------------------------------- */
  const MOVE_MS = 1050;     // 이동 시간 = 공유 로고/슬로건 CSS 전환(1.05s)과 동일
  const LOCK_MS = 1150;     // 이동 후 입력 잠금 (모션 겹침 방지)
  let locked = false;
  let lockTimer = null;
  let scrollAnimId = 0;
  let programmatic = false;

  function sectionTop(i) { return stepSections[i].offsetTop; }

  function animateScrollTo(y, ms = MOVE_MS) {
    cancelAnimationFrame(scrollAnimId);
    const from = scrollContainer.scrollTop;
    const dist = y - from;
    if (Math.abs(dist) < 1) return;
    if (REDUCED_MOTION) { scrollContainer.scrollTop = y; return; }

    const t0 = performance.now();
    programmatic = true;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      scrollContainer.scrollTop = from + dist * easeSection(p);
      if (p < 1) scrollAnimId = requestAnimationFrame(step);
      else programmatic = false;
    };
    scrollAnimId = requestAnimationFrame(step);
  }

  function goTo(index, { instant = false } = {}) {
    index = Math.max(0, Math.min(LAST_STEP, index));
    if (index === currentIndex && !instant) return;

    currentIndex = index;
    applySectionState(index);

    if (instant) {
      cancelAnimationFrame(scrollAnimId);
      programmatic = false;
      scrollContainer.scrollTop = sectionTop(index);
      return;
    }

    locked = true;
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => { locked = false; }, LOCK_MS);
    animateScrollTo(sectionTop(index));
  }

  // 현재 스크롤 위치가 sec8 의 "맨 위"(= sec7 로 되돌아갈 수 있는 위치)인지
  function atEndingTop() {
    return scrollContainer.scrollTop <= sectionTop(LAST_STEP) + 4;
  }

  // 이 입력을 우리가 가로채서 섹션 단위로 처리해야 하는가?
  function shouldIntercept(direction) {
    if (locked) return true;                       // 이동 중에는 어떤 입력도 네이티브로 흘려보내지 않음
    if (currentIndex < LAST_STEP) return true;     // sec1 ~ sec7
    return direction < 0 && atEndingTop();         // sec8 맨 위에서 위로 → sec7 로 복귀
  }

  // --- 휠 (맥 트랙패드/매직마우스의 관성 스크롤까지 "한 번의 제스처"로 묶음) ---
  let gestureActive = false;
  let gestureTimer = null;
  let swallowGesture = false;
  let lastNativeWheel = 0;   // 우리가 가로채지 않고 브라우저에 맡긴 마지막 휠 시각

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // 핀치 줌은 그대로
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // 파이어폭스 등 "줄" 단위 보정
    const dir = Math.sign(dy);
    if (dir === 0) return;

    // 가로 스크롤 제스처 무시
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

    const intercept = swallowGesture || shouldIntercept(dir);
    if (!intercept) { lastNativeWheel = performance.now(); return; }

    e.preventDefault();

    const newGesture = !gestureActive;
    gestureActive = true;
    swallowGesture = true;
    clearTimeout(gestureTimer);
    gestureTimer = setTimeout(() => {
      gestureActive = false;
      swallowGesture = false;
    }, 110);

    if (!newGesture || locked) return;
    if (Math.abs(dy) < 4) return;
    // 자유 스크롤 관성이 sec8 맨 위에 닿은 순간 sec7 로 튕겨 올라가는 것 방지
    if (performance.now() - lastNativeWheel < 180) return;

    goTo(currentIndex + dir);
  }, { passive: false });

  // --- 키보드 ---
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    let dir = 0;
    if (['ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) dir = 1;
    else if (['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) dir = -1;
    else if (e.key === 'Home') { e.preventDefault(); if (!locked) goTo(0); return; }
    else return;

    if (!shouldIntercept(dir)) return;
    e.preventDefault();
    if (!locked) goTo(currentIndex + dir);
  });

  // --- 터치 (스와이프) ---
  let touchStartY = null;
  window.addEventListener('touchstart', (e) => {
    touchStartY = e.touches.length === 1 ? e.touches[0].clientY : null;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (touchStartY === null) return;
    const dir = touchStartY - e.touches[0].clientY > 0 ? 1 : -1;
    if (shouldIntercept(dir)) e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (touchStartY === null) return;
    const diff = touchStartY - e.changedTouches[0].clientY;
    touchStartY = null;
    if (Math.abs(diff) < 50) return;
    const dir = diff > 0 ? 1 : -1;
    if (!locked && shouldIntercept(dir)) goTo(currentIndex + dir);
  }, { passive: true });

  // --- 도트 / 로고 클릭 ---
  $$('.section-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      if (locked) return;
      goTo(parseInt(dot.dataset.index, 10));
    });
  });
  const logoLink = $('.logo-link');
  if (logoLink) {
    logoLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentIndex === 0 && scrollContainer.scrollTop < 4) return;
      if (currentIndex > LAST_STEP || scrollContainer.scrollTop > sectionTop(LAST_STEP)) {
        currentIndex = LAST_STEP; // 자유 스크롤 구간에서 올 때도 상태가 꼬이지 않도록
      }
      goTo(0);
      // 먼 거리 이동은 더 길게 보이도록
      animateScrollTo(0, Math.min(1800, MOVE_MS + Math.abs(scrollContainer.scrollTop) * 0.12));
    });
  }

  // 자유 스크롤 구간(sec8 이후)에서 위로 올라와 sec8 최상단에 닿았을 때 상태 동기화
  // → 네이티브 스크롤(마우스 휠 단일 노치, 스크롤바 등)로 위치가 바뀌어도 currentIndex 가 어긋나지 않게
  let syncRAF = 0;
  scrollContainer.addEventListener('scroll', () => {
    if (programmatic) return;
    if (syncRAF) return;
    syncRAF = requestAnimationFrame(() => {
      syncRAF = 0;
      if (locked) return;
      const top = scrollContainer.scrollTop;
      if (currentIndex >= LAST_STEP && top > sectionTop(LAST_STEP) - 4) return;
      // 가장 가까운 섹션으로 상태 보정
      let nearest = 0, best = Infinity;
      stepSections.forEach((s, i) => {
        const d = Math.abs(s.offsetTop - top);
        if (d < best) { best = d; nearest = i; }
      });
      if (nearest !== currentIndex && best < window.innerHeight * 0.5) {
        currentIndex = nearest;
        applySectionState(nearest);
      }
    });
  }, { passive: true });

  /* -----------------------------------------------------------------------
     6. 섹션 7 : 설문지 3D 플립 / 체크 / 단백질 계산 / 장바구니
     ----------------------------------------------------------------------- */
  const surveyStage = $('#surveyStage');
  const surveyCard = $('#surveyCard');
  const surveyScene = $('#surveyCardScene');
  const surveyFrontFace = $('.survey-card-front');
  const flipPrevBtn = $('#flipPrevBtn');
  const flipNextBtn = $('#flipNextBtn');
  const calcProteinDisplay = $('#calcProteinDisplay');
  const flavorHandwriting = $('#flavorHandwriting');
  const toppingHandwriting = $('#toppingHandwriting');
  const surveyOrderBtn = $('#surveyOrderBtn');

  const surveyData = {
    flavor: null, topping: null, meals: [], purpose: null,
    deficitTotal: 0, proteinGrams: 15
  };

  let completeTimer = null;
  let flipBusy = false; // 플립 애니메이션 중 연타해서 상태가 꼬이는 것 방지

  function setSurveyFlipped(isFlipped) {
    if (!surveyCard || !surveyStage) return;
    if (flipBusy) return;
    flipBusy = true;
    setTimeout(() => { flipBusy = false; }, 650);

    if (isFlipped) {
      surveyCard.classList.add('is-flipped');
      surveyStage.classList.add('is-expanded');
    } else {
      surveyCard.classList.remove('is-flipped');
      surveyStage.classList.remove('is-expanded', 'is-completed');
    }
  }

  if (flipNextBtn && flipPrevBtn) {
    flipNextBtn.addEventListener('click', () => setSurveyFlipped(true));
    flipPrevBtn.addEventListener('click', () => setSurveyFlipped(false));
    if (surveyFrontFace) surveyFrontFace.addEventListener('click', () => setSurveyFlipped(true));
  }

  // [추가 인터랙션] 앞면 카드: 마우스를 따라 살짝 기우는 틸트
  if (surveyScene && surveyFrontFace && !REDUCED_MOTION) {
    surveyFrontFace.addEventListener('mousemove', (e) => {
      const r = surveyFrontFace.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      surveyScene.style.setProperty('--tilt-y', (nx * 9).toFixed(2) + 'deg');
      surveyScene.style.setProperty('--tilt-x', (-ny * 9).toFixed(2) + 'deg');
    });
    surveyFrontFace.addEventListener('mouseleave', () => {
      surveyScene.style.setProperty('--tilt-y', '0deg');
      surveyScene.style.setProperty('--tilt-x', '0deg');
    });
  }

  function renderHandwriting(targetEl, text) {
    if (!targetEl) return;
    targetEl.classList.remove('is-written');
    if (text) {
      targetEl.textContent = text;
      void targetEl.offsetWidth;
      targetEl.classList.add('is-written');
    } else {
      targetEl.textContent = '';
    }
  }

  function updateSurveyCalculation() {
    const purpose = surveyData.purpose || '식사';

    let skipAdd = 25;
    let mealAdd = 5;
    if (purpose === '다이어트') { skipAdd = 20; mealAdd = 5; }
    else if (purpose === '운동') { skipAdd = 30; mealAdd = 10; }

    let totalDeficit = 0;
    ['아침', '점심', '저녁'].forEach((meal) => {
      totalDeficit += surveyData.meals.includes(meal) ? mealAdd : skipAdd;
    });
    surveyData.deficitTotal = totalDeficit;

    let recommendedGrams;
    if (totalDeficit <= 15) recommendedGrams = 5;
    else if (totalDeficit <= 30) recommendedGrams = 10;
    else if (totalDeficit <= 45) recommendedGrams = 15;
    else if (totalDeficit <= 60) recommendedGrams = 20;
    else if (totalDeficit <= 75) recommendedGrams = 25;
    else recommendedGrams = 35;

    surveyData.proteinGrams = recommendedGrams;

    if (calcProteinDisplay) {
      const prevVal = calcProteinDisplay.textContent;
      calcProteinDisplay.textContent = recommendedGrams;
      if (prevVal !== String(recommendedGrams)) {
        calcProteinDisplay.classList.remove('is-updated');
        void calcProteinDisplay.offsetWidth;
        calcProteinDisplay.classList.add('is-updated');
      }
    }

    try { localStorage.setItem('oneoSurveySelection', JSON.stringify(surveyData)); } catch (e) { /* 사생활 보호 모드 등 */ }
  }

  function checkSurveyCompletion() {
    if (!surveyStage) return;
    const isAllChecked =
      Boolean(surveyData.flavor) && Boolean(surveyData.topping) &&
      surveyData.meals.length > 0 && Boolean(surveyData.purpose);

    clearTimeout(completeTimer);
    if (isAllChecked) {
      completeTimer = setTimeout(() => surveyStage.classList.add('is-completed'), 350);
    } else {
      surveyStage.classList.remove('is-completed');
    }
  }

  $$('.check-hotspot').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();

      const group = btn.dataset.group;
      const value = btn.dataset.value;
      const scriptText = btn.dataset.script || '';

      if (group === 'meals') {
        btn.classList.toggle('is-checked');
        if (btn.classList.contains('is-checked')) {
          if (!surveyData.meals.includes(value)) surveyData.meals.push(value);
        } else {
          surveyData.meals = surveyData.meals.filter((item) => item !== value);
        }
      } else {
        const wasChecked = btn.classList.contains('is-checked');
        $$(`.check-hotspot[data-group="${group}"]`).forEach((b) => b.classList.remove('is-checked'));

        if (!wasChecked) {
          btn.classList.add('is-checked');
          surveyData[group] = value;
          if (group === 'flavor') renderHandwriting(flavorHandwriting, scriptText);
          if (group === 'topping') renderHandwriting(toppingHandwriting, scriptText);
        } else {
          surveyData[group] = null;
          if (group === 'flavor') renderHandwriting(flavorHandwriting, '');
          if (group === 'topping') renderHandwriting(toppingHandwriting, '');
        }
      }

      updateSurveyCalculation();
      checkSurveyCompletion();
    });
  });

  // 주문하기 → 장바구니 저장 후 마이페이지(page.html)로 이동
  // (기존 'mypage.html' 은 파일이 없어 404 였음 → page.html 로 수정)
  if (surveyOrderBtn) {
    surveyOrderBtn.addEventListener('click', () => {
      updateSurveyCalculation();

      let cart = [];
      try { cart = JSON.parse(localStorage.getItem('oneoCart')) || []; } catch (e) { cart = []; }

      const newItem = {
        id: Date.now(),
        title: `ONEO 커스텀 쉐이크 (${surveyData.proteinGrams}g)`,
        img: 'img/survey.webp',
        flavor: surveyData.flavor,
        topping: surveyData.topping,
        purpose: surveyData.purpose,
        meals: [...surveyData.meals],
        proteinGrams: surveyData.proteinGrams,
        kitCount: 3,
        quantity: 1,
        price: 39000
      };

      const existingIndex = cart.findIndex((item) =>
        item.flavor === newItem.flavor && item.topping === newItem.topping &&
        item.purpose === newItem.purpose && item.proteinGrams === newItem.proteinGrams
      );

      if (existingIndex > -1) cart[existingIndex].quantity = (cart[existingIndex].quantity || 1) + 1;
      else cart.push(newItem);

      try { localStorage.setItem('oneoCart', JSON.stringify(cart)); } catch (e) { /* noop */ }

      // 버튼이 눌린 느낌 → 페이지가 부드럽게 사라지며 이동
      surveyOrderBtn.disabled = true;
      document.body.classList.add('is-leaving');
      setTimeout(() => { window.location.href = 'page.html?tab=cart'; }, 380);
    });
  }

  /* -----------------------------------------------------------------------
     7. 섹션 8 : 가루가 모여 글자가 되고, 패키지가 스크롤에 맞춰 작아짐
     ----------------------------------------------------------------------- */
  const endingCanvas = $('#endingPowderCanvas');
  const endingCtx = endingCanvas ? endingCanvas.getContext('2d') : null;
  const scalingPackage = $('#scalingPackage');
  const endingLogo = $('#endingLogo');

  const grayPowderColors = [
    'rgba(121, 121, 121, 0.95)',
    'rgba(112, 112, 112, 0.90)',
    'rgba(132, 132, 132, 0.85)',
    'rgba(104, 104, 104, 0.82)'
  ];

  let endingParticles = [];
  let endingBounds = [];
  let endingRAF = 0;
  let endingStartTime = 0;
  let endingW = 0, endingH = 0;
  let endingDone = false;     // 글자가 완성되면 루프 정지 (기존: 영원히 매 프레임 다시 그림)
  let endingVisible = false;
  let endingEnterTimer = null;
  let endingText = { fontSize: 100, letterSpacing: '-2px', centerX: 0, centerY: 0 };

  // 타임라인(ms): 가루가 모이는 시간 / 글씨로 바뀌는 시간
  const GATHER_MAX = 2100;        // 모든 입자가 자리 잡는 시점
  const FADE_START = 1250;        // 글씨가 서서히 나타나기 시작
  const FADE_LEN = 1500;          // 가루 → 글씨 크로스페이드 길이
  const easeOutQuart = (k) => 1 - Math.pow(1 - k, 4);
  const smooth = (k) => k * k * (3 - 2 * k);

  class GrayGatherParticle {
    constructor(targetX, targetY, scale) {
      this.targetX = targetX;
      this.targetY = targetY;
      this.scale = scale;
      this.baseSize = (Math.random() * 0.9 + 1.0) * scale;
      this.colorIndex = Math.floor(Math.random() * grayPowderColors.length);
      // 프레임 수가 아니라 "시간" 기준 → 5K 화면에서 프레임이 떨어져도 속도가 같음
      this.delay = Math.random() * 380;
      this.dur = 1100 + Math.random() * 620;
      this.scatter();
    }
    scatter() {
      const angle = Math.random() * Math.PI * 2;
      const spreadDist = (35 + Math.random() * 130) * this.scale;
      this.sx = this.targetX + Math.cos(angle) * spreadDist;
      this.sy = this.targetY + Math.sin(angle) * (spreadDist * 0.5);
    }
  }

  function applyEndingTextStyle(c, width, height) {
    const fontSize = Math.max(64 * U, Math.min(width * 0.072, 134 * U));
    const letterSpacing = `${-0.02 * fontSize}px`;
    c.font = `700 ${fontSize}px 'Oswald', sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if ('letterSpacing' in c) c.letterSpacing = letterSpacing;
    endingText = { fontSize, letterSpacing, centerX: width / 2, centerY: height * 0.22 };
  }

  function initEndingParticles() {
    if (!endingCanvas || !endingCtx) return;
    endingParticles = [];

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    endingW = width;
    endingH = height;

    endingCanvas.width = Math.round(width * dpr);
    endingCanvas.height = Math.round(height * dpr);
    endingCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    applyEndingTextStyle(endingCtx, width, height);

    // 글자 띠만 샘플링
    const bandTop = Math.max(0, Math.floor(endingText.centerY - endingText.fontSize));
    const bandH = Math.min(Math.ceil(endingText.fontSize * 2), height - bandTop);

    const off = document.createElement('canvas');
    off.width = Math.round(width);
    off.height = bandH;
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    applyEndingTextStyle(offCtx, width, height);
    offCtx.fillStyle = '#797979';
    offCtx.fillText('A lifestyle I create', endingText.centerX, endingText.centerY - bandTop);

    const data = offCtx.getImageData(0, 0, off.width, off.height).data;
    const gap = Math.max(2, Math.round(2 * U));
    const scale = U;

    for (let y = 0; y < off.height; y += gap) {
      for (let x = 0; x < off.width; x += gap) {
        if (data[(y * off.width + x) * 4 + 3] > 100) {
          endingParticles.push(new GrayGatherParticle(x, y + bandTop, scale));
        }
      }
    }

    endingParticles.sort((a, b) => a.colorIndex - b.colorIndex);
    endingBounds = [];
    let start = 0;
    for (let c = 0; c < grayPowderColors.length; c++) {
      let end = start;
      while (end < endingParticles.length && endingParticles[end].colorIndex === c) end++;
      endingBounds.push([start, end]);
      start = end;
    }
  }

  function drawEndingSolid(alpha) {
    endingCtx.save();
    endingCtx.globalAlpha = alpha;
    applyEndingTextStyle(endingCtx, endingW, endingH);
    endingCtx.fillStyle = '#797979';
    endingCtx.fillText('A lifestyle I create', endingText.centerX, endingText.centerY);
    endingCtx.restore();
  }

  function animateEnding(timestamp) {
    if (!endingStartTime) endingStartTime = timestamp;
    const t = timestamp - endingStartTime;

    // 0 → 1 : 가루 → 글씨 (smoothstep 으로 시작/끝이 부드럽게)
    const fade = smooth(Math.max(0, Math.min(1, (t - FADE_START) / FADE_LEN)));

    endingCtx.clearRect(0, 0, endingW, endingH);

    if (fade < 1) {
      endingCtx.globalAlpha = 1 - fade;     // 글씨가 나타나는 만큼 가루는 같이 옅어짐 (갑자기 사라지지 않음)
      for (let c = 0; c < endingBounds.length; c++) {
        const [from, to] = endingBounds[c];
        endingCtx.fillStyle = grayPowderColors[c];
        for (let i = from; i < to; i++) {
          const p = endingParticles[i];
          const k = Math.max(0, Math.min(1, (t - p.delay) / p.dur));
          const e = easeOutQuart(k);             // 끝에서 속도가 0 으로 수렴 → 툭 멈추는 느낌 없음
          endingCtx.fillRect(p.sx + (p.targetX - p.sx) * e, p.sy + (p.targetY - p.sy) * e, p.baseSize, p.baseSize);
        }
      }
      endingCtx.globalAlpha = 1;
    }

    if (fade > 0) drawEndingSolid(fade);

    if (fade >= 1) {
      // 완성: 한 장만 그려두고 루프 종료 (시각적으로 마지막 프레임과 동일)
      endingCtx.clearRect(0, 0, endingW, endingH);
      drawEndingSolid(1);
      endingDone = true;
      endingRAF = 0;
      return;
    }
    endingRAF = requestAnimationFrame(animateEnding);
  }

  function syncEndingRunning() {
    if (!endingCanvas) return;
    if (endingVisible && !endingDone && !document.hidden) {
      if (!endingRAF) endingRAF = requestAnimationFrame(animateEnding);
    } else {
      cancelAnimationFrame(endingRAF);
      endingRAF = 0;
    }
  }

  function startEndingGatherSequence() {
    if (!sec[8] || !endingCanvas) return;
    cancelAnimationFrame(endingRAF);
    endingRAF = 0;

    endingStartTime = 0;
    endingDone = false;
    endingVisible = true;
    sec[8].classList.add('is-active');

    if (endingParticles.length === 0) initEndingParticles();
    else endingParticles.forEach((p) => p.scatter());

    // 글자가 어느 정도 모인 뒤에 패키지가 떠오르도록 (글자 모션 · 이미지 모션 겹침 방지)
    clearTimeout(endingEnterTimer);
    endingEnterTimer = setTimeout(() => {
      if (scalingPackage) scalingPackage.classList.add('is-entered');
      updatePackageScroll();
    }, 1500);

    syncEndingRunning();
  }

  function resetEndingGatherSequence() {
    if (!sec[8]) return;
    endingVisible = false;
    clearTimeout(endingEnterTimer);
    cancelAnimationFrame(endingRAF);
    endingRAF = 0;
    endingStartTime = 0;
    endingDone = false;
    sec[8].classList.remove('is-active');
    if (scalingPackage) {
      scalingPackage.classList.remove('is-entered');
      scalingPackage.style.opacity = '0';
    }
    if (endingLogo) endingLogo.classList.remove('is-visible');
    if (endingCtx) endingCtx.clearRect(0, 0, endingW, endingH);
  }

  // 섹션 8 스크롤 진행도 → 패키지 transform (리플로우 없음)
  let pkgRAF = 0;
  function updatePackageScroll() {
    pkgRAF = 0;
    if (!sec[8] || !scalingPackage) return;

    const rect = sec[8].getBoundingClientRect();
    const winH = window.innerHeight;
    const range = Math.max(1, rect.height - winH);
    const progress = Math.max(0, Math.min(1, -rect.top / range));

    const inRange = rect.top <= 4 && rect.bottom >= winH * 0.1;
    const shown = inRange && scalingPackage.classList.contains('is-entered');
    scalingPackage.style.opacity = shown ? '1' : '0';

    let topVh, scale;
    if (progress < 0.3) {
      topVh = 62 - (progress / 0.3) * 12;   // 62vh → 50vh 로 올라옴
      scale = 1;
    } else {
      topVh = 50;
      scale = 1 - ((progress - 0.3) / 0.7) * (45 / 95);  // 95vw → 50vw 로 작아짐
    }
    scalingPackage.style.transform =
      `translate3d(-50%, calc(${topVh}vh - 50%), 0) scale(${scale.toFixed(4)})`;

    if (endingLogo) endingLogo.classList.toggle('is-visible', progress > 0.92 && rect.bottom >= winH * 0.1);
  }
  function requestPackageUpdate() {
    if (!pkgRAF) pkgRAF = requestAnimationFrame(updatePackageScroll);
  }
  scrollContainer.addEventListener('scroll', requestPackageUpdate, { passive: true });

  if (sec[8] && endingCanvas) {
    const sec8Observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) resetEndingGatherSequence();
        else if (entry.intersectionRatio >= 0.2 && !endingVisible) startEndingGatherSequence();
      });
    }, { root: scrollContainer, threshold: [0, 0.2] });

    document.fonts.ready.then(() => {
      initEndingParticles();
      sec8Observer.observe(sec[8]);
    });
  }

  /* -----------------------------------------------------------------------
     8. 섹션 9~12 : 스크롤 등장(reveal), 마퀴/슬라이더 화면 밖 정지, Products 헤더 전환
     ----------------------------------------------------------------------- */
  // 8-1. reveal
  const revealEls = $$('[data-reveal]');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add('is-in');
      revealObserver.unobserve(el);
      // 등장 후엔 지연값 제거(호버 반응이 느려지지 않게)
      setTimeout(() => el.classList.add('reveal-done'), 1600);
    });
  }, { root: scrollContainer, threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  revealEls.forEach((el) => revealObserver.observe(el));

  // 8-2. 화면 밖 장식 애니메이션 정지
  const offscreenObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle('is-offscreen', !entry.isIntersecting));
  }, { root: scrollContainer, threshold: 0 });
  [sec[6], sec[9], sec[11]].forEach((s) => s && offscreenObserver.observe(s));

  // 8-3. Products: 제품 스크롤 영역이 화면 중앙 근처에 오면 부드럽게 "스냅 + 정착",
  //      그때 Products 글씨는 위로 사라져서 제품 그래픽이 더 잘 보이게 함.
  if (sec[9]) {
    const marqueeWrap = $('.marquee-wrapper', sec[9]);
    let prodRAF = 0;
    let snapArmed = true;       // 한 번 스냅한 뒤, 중앙에서 충분히 멀어질 때까지는 다시 끌어당기지 않음
    let snapTimer = null;

    // 제품 줄의 세로 중심이 화면 중앙에 오는 scrollTop
    const centerTarget = () =>
      sec[9].offsetTop + marqueeWrap.offsetTop + marqueeWrap.offsetHeight / 2 - window.innerHeight / 2;

    const updateProducts = () => {
      prodRAF = 0;
      if (!marqueeWrap) return;

      const H = window.innerHeight;
      const top = scrollContainer.scrollTop;
      const target = centerTarget();
      const offset = target - top;                       // +: 제품 줄이 중앙보다 아래, -: 위
      const startOffset = target - sec[9].offsetTop;     // 섹션 9 맨 위에 있을 때의 offset

      // 제목 사라짐 : 섹션 9 맨 위(0) → 제품 줄 중앙(1) 진행도로 판단 (히스테리시스로 깜빡임 방지)
      const p = (startOffset - offset) / Math.max(1, startOffset);
      const hidden = sec[9].classList.contains('is-scrolled');
      if (!hidden && p > 0.55) sec[9].classList.add('is-scrolled');
      else if (hidden && p < 0.35) sec[9].classList.remove('is-scrolled');

      // 스냅
      const zone = 0.12 * H;
      if (Math.abs(offset) > 0.4 * H) snapArmed = true;   // 충분히 벗어났으면 다시 스냅 가능

      const free = currentIndex >= LAST_STEP && !locked && !programmatic;
      if (free && snapArmed && Math.abs(offset) < zone && Math.abs(offset) > 1) {
        snapArmed = false;
        locked = true;                    // 정착하는 동안 휠 입력(관성 포함)은 삼켜서 서로 싸우지 않게
        clearTimeout(snapTimer);
        snapTimer = setTimeout(() => { locked = false; }, 950);
        animateScrollTo(target, 820);
      }
    };

    scrollContainer.addEventListener('scroll', () => {
      if (!prodRAF) prodRAF = requestAnimationFrame(updateProducts);
    }, { passive: true });
  }

  // 8-4. Offline Store 슬라이더 (보일 때만 돌고, 클릭/도트로 이동 가능)
  const slides = $$('.offline-slide');
  const dots = $$('.slider-dots .dot');
  const offlineSlider = $('.offline-slider');

  if (slides.length > 1) {
    const slideInterval = 4000;
    let idx = 0;
    let timer = null;

    if (offlineSlider) offlineSlider.style.setProperty('--slide-ms', slideInterval + 'ms');

    const go = (i) => {
      idx = (i + slides.length) % slides.length;
      slides.forEach((s, n) => s.classList.toggle('active', n === idx));
      dots.forEach((d, n) => {
        d.classList.remove('active');
        if (n === idx) { void d.offsetWidth; d.classList.add('active'); } // 진행 바 재시작
      });
    };
    const start = () => { stop(); timer = setInterval(() => go(idx + 1), slideInterval); };
    const stop = () => { clearInterval(timer); timer = null; };

    dots.forEach((d, n) => d.addEventListener('click', (e) => { e.stopPropagation(); go(n); start(); }));
    if (offlineSlider) offlineSlider.addEventListener('click', () => { go(idx + 1); start(); });

    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { go(idx); start(); }
        else stop();
      });
    }, { root: scrollContainer, threshold: 0.25 }).observe(sec[10]);
  }

  /* -----------------------------------------------------------------------
     9. 리사이즈 (한 번에 디바운스해서 처리)
     ----------------------------------------------------------------------- */
  const onResize = debounce(() => {
    updateUnit();

    stopHero();
    initParticles();
    syncHeroRunning();

    const wasRunning = endingVisible;
    cancelAnimationFrame(endingRAF);
    endingRAF = 0;
    initEndingParticles();
    if (wasRunning) {
      endingStartTime = 0;
      endingDone = false;
      syncEndingRunning();
    }

    // 섹션 높이가 바뀌므로 현재 섹션 위치로 다시 맞춤
    if (currentIndex < LAST_STEP) scrollContainer.scrollTop = sectionTop(currentIndex);
    updatePackageScroll();
  }, 200);
  window.addEventListener('resize', () => {
    updateUnit();       // 단위는 즉시 갱신 (레이아웃이 바로 따라오도록)
    onResize();         // 캔버스/파티클은 디바운스
  });

  /* -----------------------------------------------------------------------
     10. 시작
     ----------------------------------------------------------------------- */
  document.fonts.ready.then(() => {
    initParticles();
    canvas.classList.add('is-ready');
    applySectionState(0);
    updatePackageScroll();
  });

  // 폰트 로딩이 늦어도 화면이 비지 않도록 안전장치
  window.addEventListener('load', () => {
    if (particles.length === 0) {
      initParticles();
      canvas.classList.add('is-ready');
      syncHeroRunning();
    }
    updateSurveyCalculation();
  });
})();
