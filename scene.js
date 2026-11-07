/* The live sticker background. Same stickers as the video, running in real time so people can drag and throw them.
   form.js talks to it through window.FOFScene. */
(function () {
  'use strict';
  // The form still works without this, so a failed download only costs the decoration.
  if (!window.Matter || !window.FOF_STICKERS) return;
  const { Engine, Body, Bodies, Composite, Events, Query, Sleeping, Vertices } = window.Matter;
  const ASSETS = window.FOF_STICKERS;

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const fxCanvas = document.getElementById('confetti');
  const fx = fxCanvas.getContext('2d');
  const card = document.getElementById('card');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TAU = Math.PI * 2, HZ = 120, DT = 1 / HZ, DT_MS = 1000 / HZ;
  const BG = '#1E1E1E';
  // The squash, stretch and spring settings are the video's Sensible preset. The weight and rebound are tuned for playing with.
  const P = {
    gravity: 3800, friction: 0.6, airDrag: 0.002, spin: 100, heft: 1.6, // heft: resistance to spinning
    stickerScale: 0.88, sizeVariance: 0.04, // Stickers stay close to one size, within 4% of this share of S.
    bounce: 0.45, // The share of a landing's speed that comes back as a rebound. The video uses 0.55.
    contactHold: 0.015, // Seconds a sticker stays down before it rebounds, as in the video.
    squash: 0.35, stretch: 0.05, stiffness: 8.9, wobbleDamping: 0.85, // As in the video: small, stiff and quickly over.
    contactDrag: 5, contactSpinDrag: 9, // How quickly touching stickers lose speed and spin. This is what calms a pile.
    grabSpeed: 16, grabMax: 2200, throwKeep: 0.72, // How a dragged sticker follows, and how much speed it keeps when let go.
  };
  const PAIRS = ['Coral + Purple', 'Coral + Dark Blue', 'Lime + Dark Blue', 'Lime + Purple', 'Kelly Green + Dark Blue', 'Teal + Purple', 'Purple + Lime'].map((name) => ASSETS.combos[name]);
  const CONFETTI_COLOURS = ['#FF7676', '#E4FF97', '#24CB71', '#33DFDF', '#874FFF', '#F5F5F5'];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const vel = (b) => { const v = Body.getVelocity(b); return { x: v.x * 60, y: v.y * 60 }; };
  const setVel = (b, x, y) => Body.setVelocity(b, { x: x / 60, y: y / 60 });

  /* ---------- World ---------- */
  const engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 8 });
  engine.gravity.x = 0; engine.gravity.y = 1; engine.gravity.scale = P.gravity / 1e6;
  const world = engine.world;
  const WALL = 500;
  const floor = Bodies.rectangle(0, 0, 20000, WALL, { isStatic: true, friction: P.friction, restitution: 0 });
  const leftWall = Bodies.rectangle(0, 0, WALL, 20000, { isStatic: true, friction: 0.2, restitution: 0 });
  const rightWall = Bodies.rectangle(0, 0, WALL, 20000, { isStatic: true, friction: 0.2, restitution: 0 });
  Composite.add(world, [floor, leftWall, rightWall]);

  const items = [];
  const byId = new Map();
  const wakeAll = () => { for (const m of items) Sleeping.set(m.body, false); };

  let W = 0, H = 0, DPR = 1, S = 190, fall = 1, toss = 1;
  let dirty = true, paused = false;

  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [canvas, fxCanvas]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    S = W >= 900 ? clamp(W * 0.107, 90, 158) : clamp(W * 0.135, 100, 200);
    // Small screens get gentler gravity. The same pull looks far faster there, and the card hides most of the fall.
    fall = clamp(W / 900, 0.45, 1);
    toss = Math.sqrt(fall); // Throws scale with this, so a sticker still rises the same distance under gentler gravity.
    engine.gravity.scale = (P.gravity * fall) / 1e6;
    Body.setPosition(floor, { x: W / 2, y: H + WALL / 2 });
    Body.setPosition(leftWall, { x: -WALL / 2, y: H / 2 - 5000 });
    Body.setPosition(rightWall, { x: W + WALL / 2, y: H / 2 - 5000 });
    for (const m of items) {
      const p = m.body.position, half = m.w / 2;
      Body.setPosition(m.body, { x: clamp(p.x, half, Math.max(half, W - half)), y: Math.min(p.y, H - m.h / 2) });
      Sleeping.set(m.body, false);
    }
    dirty = true;
  }

  /* ---------- The logo and card are solid when there's room beside them for stickers to fall ---------- */
  const solids = [...document.querySelectorAll('[data-solid]')].map((el) => ({ el, body: null, x: 0, y: 0, w: 0, h: 0 }));
  const KEYLINE = 10;
  const hasGutters = () => (W - card.getBoundingClientRect().width) / 2 >= S * 1.1;

  // A sticker the growing card reaches has nowhere to go, because the piles block both sides. Rather than jam against
  // the floor, it stops colliding and drops off the bottom of the screen. recycleStrays then sends it back in from the top.
  const COLLIDE_ALL = 0xFFFFFFFF, SOLID = 0x0002, PASS_BEHIND = COLLIDE_ALL & ~SOLID;
  function releaseFromUnder(left, top, right, bottom) {
    for (const m of items) {
      const p = m.body.position;
      if (p.x < left || p.x > right || p.y < top || m.body.bounds.min.y >= bottom) continue;
      m.body.collisionFilter.mask = 0;
      Sleeping.set(m.body, false);
    }
  }

  function recycleStrays() {
    const clear = Math.max(0, ...solids.map((s) => (s.body ? s.y + s.h / 2 : 0)));
    for (const m of items) {
      const p = m.body.position;
      // A sticker that fell behind the card becomes solid again once it's below it.
      if (m.passing && m.body.collisionFilter.mask === PASS_BEHIND && m.body.bounds.min.y > clear) {
        m.body.collisionFilter.mask = COLLIDE_ALL;
        m.passing = false;
      }
      if (p.y <= H + 400 && p.x >= -400 && p.x <= W + 400) continue;
      m.body.collisionFilter.mask = COLLIDE_ALL;
      m.passing = false;
      const upright = tooWideForSide(m.w);
      if (upright) { Body.setAngle(m.body, standUp()); Body.setAngularVelocity(m.body, 0); }
      Body.setPosition(m.body, { x: pickX(upright ? m.h : m.w), y: -Math.max(m.w, m.h) });
      setVel(m.body, 0, 200);
      m.x = m.body.position.x; m.y = m.body.position.y; m.a = m.body.angle;
    }
  }

  function syncSolids() {
    const room = hasGutters();
    for (const s of solids) {
      if (!room) {
        if (s.body) { Composite.remove(world, s.body); s.body = null; wakeAll(); }
        continue;
      }
      const r = s.el.getBoundingClientRect();
      const w = r.width + KEYLINE * 2, h = r.height + KEYLINE * 2, x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (!s.body || Math.abs(s.w - w) > 0.5 || Math.abs(s.h - h) > 0.5) {
        if (s.body) Composite.remove(world, s.body);
        releaseFromUnder(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
        s.body = Bodies.rectangle(x, y, w, h, { isStatic: true, friction: P.friction, restitution: 0, collisionFilter: { category: SOLID } });
        Composite.add(world, s.body);
        Object.assign(s, { x, y, w, h });
        wakeAll();
      } else if (Math.abs(s.x - x) > 0.5 || Math.abs(s.y - y) > 0.5) {
        Body.setPosition(s.body, { x, y });
        Object.assign(s, { x, y });
        wakeAll();
      }
    }
  }

  /* ---------- Stickers ---------- */
  const recolour = (svg, primary, secondary) => svg.replace(/#95B9AC|#1E1E1E/gi, (m) => (m.toUpperCase() === '#95B9AC' ? primary : secondary));

  function makeSprite(sticker, pair, w, h) {
    return new Promise((resolve, reject) => {
      const pxW = Math.ceil(w * DPR), pxH = Math.ceil(h * DPR);
      // Sizing the SVG itself keeps it sharp in Safari, which rasterises at the intrinsic size.
      const svg = recolour(sticker.svg, pair.primary, pair.secondary).replace(/<svg width="[^"]*" height="[^"]*"/, `<svg width="${pxW}" height="${pxH}"`);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = pxW; c.height = pxH;
        c.getContext('2d').drawImage(img, 0, 0, pxW, pxH);
        resolve(c);
      };
      img.onerror = () => reject(new Error('Sticker failed to load: ' + sticker.id));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  let bag = [];
  function nextSticker() {
    if (!bag.length) {
      bag = Object.keys(ASSETS.stickers);
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    return ASSETS.stickers[bag.pop()];
  }

  // Stickers fall down the sides of the card, never onto it. With no room at the sides, they can fall anywhere.
  let phi = Math.random(), leftSide = Math.random() < 0.5;
  const evenly = () => { phi = (phi + 0.618034) % 1; return phi; };
  function pickX(w) {
    const half = w / 2;
    if (!hasGutters()) return half + evenly() * Math.max(0, W - w);
    const c = card.getBoundingClientRect();
    leftSide = !leftSide;
    const lo = leftSide ? half : c.right + KEYLINE + half;
    const hi = leftSide ? c.left - KEYLINE - half : W - half;
    return lo < hi ? rand(lo, hi) : (leftSide ? half : W - half);
  }

  // A shape wider than the space beside the card falls standing up, or it would end up resting on top of the card.
  const tooWideForSide = (w) => hasGutters() && w > card.getBoundingClientRect().left - KEYLINE;
  const standUp = () => ((Math.random() < 0.5 ? -1 : 1) * Math.PI) / 2 + rand(-0.1, 0.1);

  // In proportion to the room there is, some of the starting stickers fall behind the card and land underneath it.
  let dropped = 0, droppedUnder = 0;
  function goesUnder(size) {
    if (!hasGutters()) return false;
    const c = card.getBoundingClientRect();
    const gap = H - c.bottom - KEYLINE;
    if (gap < size * 1.1) return false;
    const share = (c.width * gap) / ((W - c.width) * H + c.width * gap);
    return (droppedUnder + 0.5) / (dropped + 1) < share;
  }

  const startingCount = () => {
    const room = hasGutters();
    const free = W * H - (room ? card.getBoundingClientRect().width * H * 0.62 : 0);
    return clamp(Math.round(free / (S * S * 1.52)), 9, room ? 30 : 12);
  };

  // Gets a sticker's image ready. That takes a moment, so they're all prepared before the first one falls.
  async function prepareSticker() {
    const sticker = nextSticker();
    const pair = pick(PAIRS);
    let k = (S / 200) * P.stickerScale * (1 + P.sizeVariance * rand(-1, 1));
    k = Math.min(k, (S * 1.45) / sticker.w); // The widest shapes would otherwise look much bigger than the rest.
    const w = sticker.w * k, h = sticker.h * k;
    try { return { sticker, k, w, h, sprite: await makeSprite(sticker, pair, w, h) }; }
    catch (e) { return null; }
  }

  function addSticker({ sticker, k, w, h, sprite }, y) {
    const under = goesUnder(Math.max(w, h));
    dropped++;
    if (under) droppedUnder++;
    const c = card.getBoundingClientRect();
    const upright = !under && tooWideForSide(w);
    const x = under ? c.left + w / 2 + evenly() * Math.max(0, c.width - w) : pickX(upright ? h : w);
    const verts = Vertices.clockwiseSort(sticker.hull.map(([vx, vy]) => ({ x: vx * k, y: vy * k })));
    const centre = Vertices.centre(verts);
    const body = Body.create({
      position: { x, y: y !== undefined ? y : -Math.max(w, h) * 0.62 - 30 },
      vertices: verts,
      friction: P.friction, frictionStatic: P.friction * 1.1, frictionAir: P.airDrag,
      restitution: 0, density: 0.001, slop: 0.8, // Rebounds are added by hit(). A little slop lets a pile rest without fidgeting.
    });
    Body.setInertia(body, body.inertia * P.heft);
    if (under) body.collisionFilter.mask = PASS_BEHIND;
    Body.setAngle(body, upright ? standUp() : rand(-0.5, 0.5));
    if (!upright) Body.setAngularVelocity(body, ((Math.random() < 0.5 ? -1 : 1) * (P.spin * Math.PI / 180) * rand(0.5, 1)) / 60);
    setVel(body, rand(-30, 30), 260);
    Composite.add(world, body);
    const m = {
      body, sprite, w, h, cx: centre.x, cy: centre.y,
      x: body.position.x, y: body.position.y, a: body.angle, // Where it's drawn, a smoothed version of the physics
      sa: 0, sb: 0, va: 0, vb: 0, // Its squish, and how fast that's changing
      lx: 0, ly: 0, ux: 0, uy: 0, // How far it's shifted, so the side touching stays put
      bx: 0, by: 0, bAt: 0, // A rebound that's on its way
      touching: false, passing: under, // passing: on its way behind the card
    };
    items.push(m);
    byId.set(body.id, m);
    dirty = true;
    return m;
  }

  /* ---------- Squash and stretch, for drawing only. The physics underneath stays rigid. ----------
     The amounts match the video. Each sticker's squash is held as one small tensor, in the sticker's own frame, so hits
     from any direction simply add together and it never has to snap from one axis to another. */
  const w0 = TAU * P.stiffness, zeta = P.wobbleDamping;
  const CONTACT_DRAG = Math.exp(-P.contactDrag * DT), CONTACT_SPIN_DRAG = Math.exp(-P.contactSpinDrag * DT);
  const MAX_SQUISH = 0.12;

  // n points from the sticker towards whatever is pressing on it.
  function squish(m, nx, ny, speed) {
    const push = 0.35 * P.squash * Math.min(1, speed / 2000) * w0;
    const c = Math.cos(m.body.angle), s = Math.sin(m.body.angle);
    const lx = nx * c + ny * s, ly = ny * c - nx * s;
    // Press along n, swell across it.
    m.va -= push * (lx * lx - ly * ly);
    m.vb -= push * 2 * lx * ly;
    // Shift towards the contact: the touching side stays put and the far side comes down to meet it.
    const reach = (Math.abs(lx) * m.w + Math.abs(ly) * m.h) / 2;
    m.ux += push * reach * lx;
    m.uy += push * reach * ly;
  }

  function stepSoft(m) {
    const b = m.body;
    const speed = Math.hypot(b.velocity.x, b.velocity.y) * 60;
    // In the air it eases towards a slight stretch along its path.
    let ta = 0, tb = 0;
    if (!m.touching && speed > 200) {
      const amount = P.stretch * 0.5 * Math.min(1, speed / 3000);
      const th = 2 * (Math.atan2(b.velocity.y, b.velocity.x) - b.angle);
      ta = amount * Math.cos(th); tb = amount * Math.sin(th);
    }
    const k = w0 * w0, d = 2 * zeta * w0;
    m.va += (k * (ta - m.sa) - d * m.va) * DT; m.sa += m.va * DT;
    m.vb += (k * (tb - m.sb) - d * m.vb) * DT; m.sb += m.vb * DT;
    m.ux += (-k * m.lx - d * m.ux) * DT; m.lx += m.ux * DT;
    m.uy += (-k * m.ly - d * m.uy) * DT; m.ly += m.uy * DT;
    const amount = Math.hypot(m.sa, m.sb);
    if (amount > MAX_SQUISH) {
      const over = MAX_SQUISH / amount;
      m.sa *= over; m.sb *= over; m.lx *= over; m.ly *= over;
    }
    // Draw from a smoothed position. Slow movement gets the most smoothing, which is where the solver's tiny
    // corrections would show. Fast movement gets almost none, so it still lands where it should.
    const follow = 1 - Math.exp(-TAU * (5 + speed * 0.025) * DT);
    m.x += (b.position.x - m.x) * follow;
    m.y += (b.position.y - m.y) * follow;
    const turn = 1 - Math.exp(-TAU * (5 + Math.abs(b.angularVelocity) * 480) * DT);
    m.a += (b.angle - m.a) * turn;
  }

  // Landings are dead in the solver, which keeps resting and rubbing contacts calm. A real hit rebounds a moment later.
  function hit(m, nx, ny, vn, share) {
    squish(m, nx, ny, vn);
    const rebound = P.bounce * vn * share * clamp((vn - 300) / 500, 0, 1);
    if (rebound <= 0) return;
    m.bx -= nx * rebound;
    m.by -= ny * rebound;
    if (!m.bAt) m.bAt = simT + P.contactHold;
  }

  let simT = 0;
  Events.on(engine, 'collisionStart', (ev) => {
    for (const pair of ev.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      const ma = byId.get(a.id), mb = byId.get(b.id);
      if (!ma && !mb) continue;
      let nx = pair.collision.normal.x, ny = pair.collision.normal.y;
      if (nx * (b.position.x - a.position.x) + ny * (b.position.y - a.position.y) < 0) { nx = -nx; ny = -ny; }
      const va = vel(a), vb = vel(b);
      const vn = Math.abs((va.x - vb.x) * nx + (va.y - vb.y) * ny);
      if (vn < 120) continue;
      const total = a.mass + b.mass;
      if (ma) hit(ma, nx, ny, vn, mb ? b.mass / total : 1);
      if (mb) hit(mb, -nx, -ny, vn, ma ? a.mass / total : 1);
    }
  });
  Events.on(engine, 'collisionActive', (ev) => {
    for (const pair of ev.pairs) {
      const ma = byId.get(pair.bodyA.id), mb = byId.get(pair.bodyB.id);
      if (ma) ma.touching = true;
      if (mb) mb.touching = true;
    }
  });

  function shockwave(x, y, radius, strength, upBias) {
    for (const m of items) {
      const b = m.body;
      const dx = b.position.x - x, dy = b.position.y - y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > radius) continue;
      const force = strength * (1 - d / radius) * toss;
      Sleeping.set(b, false);
      const v = vel(b);
      setVel(b, v.x + (dx / d) * force * 0.75, v.y + (dy / d) * force * 0.35 - force * upBias);
      Body.setAngularVelocity(b, Body.getAngularVelocity(b) + (rand(-0.5, 0.5) * force) / 14000);
      squish(m, -dx / d, -dy / d, force * 1.4);
    }
  }

  /* ---------- Pointer: stickers only move when they're dragged ---------- */
  const pointer = { x: 0, y: 0, hoverCheck: false };
  let grabbed = null;
  const grabTarget = { x: 0, y: 0 };
  const hitTest = (x, y) => {
    const hits = Query.point(items.map((m) => m.body), { x, y });
    if (!hits.length) return null;
    // The one drawn last is on top.
    return hits.map((b) => byId.get(b.id)).sort((p, q) => items.indexOf(q) - items.indexOf(p))[0];
  };

  function bindPointer() {
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') pointer.hoverCheck = e.target === canvas;
      pointer.x = e.clientX; pointer.y = e.clientY;
      if (grabbed) { grabTarget.x = e.clientX - grabbed.grabX; grabTarget.y = e.clientY - grabbed.grabY; }
    }, { passive: true });

    // A finger on a sticker drags it in any direction. A finger on the background still scrolls the page.
    canvas.addEventListener('touchstart', (e) => {
      const touch = e.changedTouches[0];
      if (!paused && hitTest(touch.clientX, touch.clientY)) e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      if (paused) return;
      const hit = hitTest(e.clientX, e.clientY);
      if (!hit) return;
      grabbed = hit;
      grabbed.grabX = e.clientX - hit.body.position.x;
      grabbed.grabY = e.clientY - hit.body.position.y;
      grabTarget.x = hit.body.position.x; grabTarget.y = hit.body.position.y;
      Sleeping.set(hit.body, false);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* The pointer may already be gone */ }
      canvas.style.cursor = 'grabbing';
    });

    const release = () => {
      if (grabbed) {
        // A throw keeps only part of the drag's speed.
        const v = vel(grabbed.body);
        setVel(grabbed.body, v.x * P.throwKeep, v.y * P.throwKeep);
      }
      grabbed = null;
      canvas.style.cursor = '';
      dirty = true;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  /* ---------- Squiggle confetti, on its own canvas above the card ---------- */
  const STROKES = [
    'M-32 0C-26-17-15-17-9 0S5 17 11 0 26-17 32 0',
    'M-30 8C-22-16-10-16-6 4S10 24 16 4 28-14 32-6',
    'M-28 14L-14-14 0 14 14-14 28 14',
    'M-30 0C-22-20-6-20-6-2S-20 16-20 2 6-18 16-6 26 12 32 2',
  ].map((d) => new Path2D(d));
  const RING = new Path2D('M0-15A15 15 0 1 1 0 15A15 15 0 1 1 0-15Z');
  const STAR = new Path2D('M0-22C3-8 8-3 22 0C8 3 3 8 0 22C-3 8-8 3-22 0C-8-3-3-8 0-22Z');
  const DOT = new Path2D('M0-12A12 12 0 1 1 0 12A12 12 0 1 1 0-12Z');
  let bits = [];
  const quiet = () => reducedMotion || paused;

  function addBit(x, y, vx, vy, delay, scale) {
    const roll = Math.random();
    const shape = roll < 0.68 ? { path: pick(STROKES), stroke: true } : roll < 0.8 ? { path: RING, stroke: true } : roll < 0.92 ? { path: STAR, stroke: false } : { path: DOT, stroke: false };
    bits.push({ ...shape, x, y, vx, vy, delay, a: rand(0, TAU), va: rand(-7, 7), scale: scale * rand(0.75, 1.3), colour: pick(CONFETTI_COLOURS) });
  }
  function burst(x, y, count, power, scale) {
    if (quiet()) return;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + rand(-1.05, 1.05), speed = power * rand(0.45, 1);
      addBit(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0, scale);
    }
  }
  function shower(count, scale) {
    if (quiet()) return;
    for (let i = 0; i < count; i++) addBit(rand(0, W), rand(-90, -30), rand(-70, 70), rand(120, 420), rand(0, 1.3), scale);
  }

  let fxWasActive = false;
  function clearConfetti() {
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    fxWasActive = false;
  }
  function runConfetti(seconds) {
    if (!bits.length) {
      if (fxWasActive) clearConfetti();
      return;
    }
    fxWasActive = true;
    fx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fx.clearRect(0, 0, W, H);
    fx.lineCap = 'round'; fx.lineJoin = 'round';
    const alive = [];
    for (const p of bits) {
      if (p.delay > 0) { p.delay -= seconds; alive.push(p); continue; }
      p.vy += 1500 * seconds;
      p.vx *= 1 - 0.5 * seconds;
      p.x += p.vx * seconds; p.y += p.vy * seconds; p.a += p.va * seconds;
      if (p.y > H + 70) continue;
      alive.push(p);
      fx.save();
      fx.translate(p.x, p.y); fx.rotate(p.a); fx.scale(p.scale, p.scale);
      if (p.stroke) { fx.strokeStyle = p.colour; fx.lineWidth = 7; fx.stroke(p.path); }
      else { fx.fillStyle = p.colour; fx.fill(p.path); }
      fx.restore();
    }
    bits = alive;
  }

  /* ---------- Simulation and drawing ---------- */
  function step() {
    simT += DT;
    if (grabbed) {
      const b = grabbed.body;
      const vx = clamp((grabTarget.x - b.position.x) * P.grabSpeed, -P.grabMax * toss, P.grabMax * toss);
      const vy = clamp((grabTarget.y - b.position.y) * P.grabSpeed, -P.grabMax * toss, P.grabMax * toss);
      setVel(b, vx, vy);
      Body.setAngularVelocity(b, Body.getAngularVelocity(b) * 0.97);
    }
    Engine.update(engine, DT_MS);
    for (const m of items) {
      const b = m.body;
      // Touching stickers lose speed and spin, the way soft things do, so a pile calms down instead of rattling.
      if (m.touching && m !== grabbed && !b.isSleeping) {
        Body.setVelocity(b, { x: b.velocity.x * CONTACT_DRAG, y: b.velocity.y * CONTACT_DRAG });
        Body.setAngularVelocity(b, Body.getAngularVelocity(b) * CONTACT_SPIN_DRAG);
      }
      if (m.bAt && simT >= m.bAt) {
        if (m !== grabbed) {
          const v = vel(b);
          Sleeping.set(b, false);
          setVel(b, v.x + m.bx, v.y + m.by);
        }
        m.bx = m.by = m.bAt = 0;
      }
      stepSoft(m);
      m.touching = false;
    }
    recycleStrays();
  }

  const atRest = (m) => {
    const b = m.body;
    return b.isSleeping && !m.bAt
      && Math.abs(m.sa) + Math.abs(m.sb) < 0.0008 && Math.abs(m.va) + Math.abs(m.vb) < 0.005
      && Math.abs(m.lx) + Math.abs(m.ly) < 0.05 && Math.abs(m.ux) + Math.abs(m.uy) < 0.5
      && Math.abs(m.x - b.position.x) + Math.abs(m.y - b.position.y) < 0.05 && Math.abs(m.a - b.angle) < 0.0005;
  };
  const isLively = () => grabbed || !items.every(atRest);

  function drawSticker(m) {
    const c = Math.cos(m.a), s = Math.sin(m.a);
    ctx.setTransform(DPR * c, DPR * s, -DPR * s, DPR * c, DPR * m.x, DPR * m.y);
    ctx.transform(1 + m.sa, m.sb, m.sb, 1 - m.sa, m.lx, m.ly);
    ctx.drawImage(m.sprite, -m.cx, -m.cy, m.w, m.h);
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    for (const m of items) drawSticker(m);
  }

  // The starting stickers fall one at a time, at a steady pace, over about this long.
  const FALL_SECONDS = 4.2;
  let waiting = [], nextFall = 0, fallGap = 0;
  async function startFalling() {
    const ready = await Promise.all(Array.from({ length: startingCount() }, prepareSticker));
    waiting = ready.filter(Boolean);
    fallGap = clamp((FALL_SECONDS * 1000) / Math.max(1, waiting.length), 120, 240);
    nextFall = performance.now();
  }

  let last = 0, carry = 0;
  function frame(now) {
    window.requestAnimationFrame(frame);
    const elapsed = Math.min(now - last, 50);
    last = now;
    if (paused) {
      if (dirty) { draw(); dirty = false; }
      return;
    }
    syncSolids();
    if (waiting.length && now >= nextFall) {
      addSticker(waiting.shift());
      nextFall = now + fallGap;
    }
    if (pointer.hoverCheck && !grabbed) {
      pointer.hoverCheck = false;
      canvas.style.cursor = hitTest(pointer.x, pointer.y) ? 'grab' : '';
    }
    if (isLively()) {
      carry += elapsed;
      let steps = 0;
      while (carry >= DT_MS && steps < 6) { step(); carry -= DT_MS; steps++; }
      if (steps === 6) carry = 0;
      dirty = true;
    }
    if (dirty) { draw(); dirty = false; }
    runConfetti(elapsed / 1000);
  }

  /* With motion off, settle the pile out of sight and draw it once. */
  function settle(seconds) {
    for (let i = 0; i < HZ * seconds; i++) { Engine.update(engine, DT_MS); recycleStrays(); }
    for (const m of items) {
      Object.assign(m, { x: m.body.position.x, y: m.body.position.y, a: m.body.angle, sa: 0, sb: 0, va: 0, vb: 0, lx: 0, ly: 0, ux: 0, uy: 0, bx: 0, by: 0, bAt: 0 });
    }
  }
  async function drawStillPile() {
    syncSolids();
    const ready = await Promise.all(Array.from({ length: startingCount() }, prepareSticker));
    ready.filter(Boolean).forEach((sticker, i) => addSticker(sticker, -S * (1.2 * i + 1)));
    settle(8);
    draw();
  }

  /* ---------- What the form uses ---------- */
  window.FOFScene = {
    canPause: !reducedMotion,
    start() {
      layout();
      window.addEventListener('resize', () => {
        layout();
        if (reducedMotion || paused) { syncSolids(); settle(2); draw(); }
      });
      if (reducedMotion) { drawStillPile(); return; }
      bindPointer();
      if (paused) {
        drawStillPile();
      } else {
        startFalling();
      }
      last = performance.now();
      window.requestAnimationFrame(frame);
    },
    /* The motion control. While paused nothing moves, falls or bursts. */
    setPaused(on) {
      paused = !!on;
      if (paused) {
        bits = [];
        grabbed = null;
        clearConfetti();
        canvas.style.cursor = '';
      } else {
        syncSolids();
        wakeAll();
        last = performance.now();
      }
      dirty = true;
    },
    /* Runs once the answers are safely saved: confetti, and every sticker hops. */
    celebrate(rect) {
      if (quiet()) return;
      const scale = clamp(W / 1100, 0.72, 1.15);
      const r = rect || { left: W / 2, width: 0, top: H / 2 };
      burst(r.left + r.width / 2, r.top, Math.round(clamp(W / 26, 28, 56)), Math.max(1150, H * 1.55), scale);
      shower(Math.round(clamp(W / 18, 26, 80)), scale);
      shockwave(W / 2, H, Math.max(W, H), 2400, 0.8);
    },
  };
})();
