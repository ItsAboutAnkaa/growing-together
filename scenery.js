/* ═══════════════════════════════════════════════════════════════════════════
   scenery.js — Growing Together
   Procedural pixel-art environments for AUTUMN and WINTER.

   Everything is generated at runtime from code (no images, no network), at a
   low "logical" resolution that is scaled up with nearest-neighbour so every
   pixel in the scenery shares the same size.  A scene is baked once into
   offscreen canvases (sky + land) and only cheap effects (cabin smoke, window
   flicker, twinkles) are drawn per frame.

   Public API  (window.GTScenery):
     pixelScale(W,H)                      → CSS px per logical pixel
     buildScene(opts)                     → baked scene
     drawFlat / drawSkyLayer / drawLand   → blit baked layers
     drawFX(ctx,scene,t,animate,phase)    → smoke + window flicker
     leafSprites()                        → falling-leaf sprite sets
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

/* ───────────────────────── helpers ───────────────────────── */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const _rc = {};
function rgb(c) {
  if (typeof c !== 'string') return c;
  let v = _rc[c];
  if (!v) { const n = parseInt(c.slice(1), 16); v = _rc[c] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  return v;
}
function mix(a, b, t) {
  a = rgb(a); b = rgb(b);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bay(x, y) { return (BAYER[((y & 3) << 2) + (x & 3)] + .5) / 16; }

/* Pick from a colour ladder with a narrow ordered-dither seam between steps */
function ladder(cols, t, x, y) {
  const n = cols.length;
  t = clamp(t, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(t));
  const f = smooth(.42, .58, t - i);
  return f > bay(x, y) ? cols[i + 1] : cols[i];
}

/* Quantise v (0..1) to n levels, dithering only on the seam; returns 0..1 */
function qd(v, n, x, y) {
  const t = clamp(v, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(t));
  return ((smooth(.42, .58, t - i) > bay(x, y)) ? i + 1 : i) / (n - 1);
}
/* cheap smooth value noise in 0..1 */
function vnoise(x, y, s) {
  return (Math.sin(x * .21 * s + y * .13 * s) + Math.sin(x * .09 * s - y * .23 * s + 1.7) + Math.sin((x + y) * .05 * s + 3.1) + 3) / 6;
}

/* ───────────────────────── pixel surface ───────────────────────── */
function Pix(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
Pix.prototype.set = function (x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  c = rgb(c);
  const i = (y * this.w + x) * 4, d = this.d;
  d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
};
Pix.prototype.has = function (x, y) {
  return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y * this.w + x) * 4 + 3] > 0;
};
Pix.prototype.rect = function (x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
};
Pix.prototype.blit = function (s, dx, dy, flip) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const i = (y * s.w + x) * 4;
    if (!s.d[i + 3]) continue;
    const X = dx + (flip ? s.w - 1 - x : x), Y = dy + y;
    if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
    const o = (Y * this.w + X) * 4;
    this.d[o] = s.d[i]; this.d[o + 1] = s.d[i + 1]; this.d[o + 2] = s.d[i + 2]; this.d[o + 3] = 255;
  }
};
Pix.prototype.canvas = function () {
  const c = document.createElement('canvas');
  c.width = this.w; c.height = this.h;
  c.getContext('2d').putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
  return c;
};

/* ───────────────────────── palettes ───────────────────────── */
const SNOW = { hi: '#f4f9fc', lt: '#dbe8f3', md: '#b4c8de', sh: '#8ea6c6', dp: '#6d86ab' };
const LEAF = {
  orange: ['#5a2418', '#8a3a1a', '#c2561a', '#e0802a', '#f5b24a'],
  gold:   ['#6a4a18', '#9a6a1c', '#d09a28', '#efc345', '#fbe27a'],
  red:    ['#4a1a22', '#7a2a2a', '#a53a30', '#c85a3c', '#e88a5a'],
};
const TINT = { day: { c: '#2c3c6a', a: .22 }, dawn: { c: '#5a5a8a', a: .2 }, dusk: { c: '#4a3a7a', a: .28 }, night: { c: '#0a1236', a: .5 } };
const LIGHT_I = { day: .3, dawn: .55, dusk: .9, night: 1 };

/* ───────────────────────── hearts (procedural pixel hearts) ───────────────────────── */
const HEART_PAL = {
  red:   ['#ff3d6e', '#ff9db8', '#b8123f'],
  pink:  ['#ff7aa8', '#ffd2e2', '#d6417a'],
  rose:  ['#ff5c8a', '#ffb0c8', '#c02a5e'],
  lilac: ['#d99cff', '#f4defe', '#9a52d6'],
  white: ['#ffe6ef', '#ffffff', '#e8a8c0'],
};
function heartPix(h, pal) {
  const w = (Math.round(h * 1.15) | 1), c = HEART_PAL[pal] || HEART_PAL.red;
  const inside = (i, j) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    const x = ((i + .5) / w * 2 - 1) * 1.22, y = (1 - (j + .5) / h * 2) * 1.12 + .12;
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0;
  };
  const p = new Pix(w, h);
  let hl = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!inside(i, j)) continue;
    const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
    let col = edge ? c[2] : c[0];
    if (!edge && hl < 2 && i <= w * .42 && j <= h * .42) { col = c[1]; hl++; }
    p.set(i, j, col);
  }
  return p;
}
const _hc2 = {};
function heartSprite(h, pal) {
  const k = h + pal;
  return _hc2[k] || (_hc2[k] = heartPix(h, pal).canvas());
}

/* ───────────────────────── cabin ───────────────────────── */
const CAB = { w: 48, h: 42 };
function buildCabin(R, glow, val) {
  const p = new Pix(CAB.w, CAB.h);
  const logHi = '#c28a52', logM = '#9a6636', logLo = '#74481f';
  // ── walls (y 21..36) ──
  for (let j = 0; j < 4; j++) {
    const y = 21 + j * 4, ext = (j & 1) ? 1 : 0;
    for (let x = 4 - ext; x <= 43 + ext; x++) {
      const end = x < 4 || x > 43;
      p.set(x, y,     end ? '#9a6636' : logHi);
      p.set(x, y + 1, end ? '#d9ab6c' : logM);
      p.set(x, y + 2, end ? '#d9ab6c' : logM);
      p.set(x, y + 3, end ? '#74481f' : logLo);
    }
    for (let k = 0; k < 4; k++) {                       // wood grain
      p.set(5 + Math.floor(R() * 38), y + 1 + Math.floor(R() * 2), logLo);
      if (R() < .6) p.set(5 + Math.floor(R() * 38), y + 1, '#b27a44');
    }
  }
  for (let x = 4; x <= 43; x++) {                       // eave shadow
    const a = rgb(p.d.slice((21 * p.w + x) * 4, (21 * p.w + x) * 4 + 3));
    p.set(x, 21, mix(a, '#1a1018', .6));
    const b = rgb(p.d.slice((22 * p.w + x) * 4, (22 * p.w + x) * 4 + 3));
    p.set(x, 22, mix(b, '#1a1018', .32));
  }
  // ── foundation + snow bank ──
  for (let x = 3; x <= 44; x++) {
    const blk = Math.floor((x + (R() < 0 ? 1 : 0)) / 5) % 2;
    p.set(x, 37, blk ? '#8a8e99' : '#70747f');
    p.set(x, 38, blk ? '#565a66' : '#4a4e5a');
  }
  for (let x = 1; x <= 46; x++) {
    const lump = Math.round(1.2 + Math.sin(x * .7) * .8 + R() * .8);
    for (let k = 0; k < lump; k++) p.set(x, 39 - k + 0, k === lump - 1 ? SNOW.hi : SNOW.lt);
    p.set(x, 40, SNOW.md); p.set(x, 41, SNOW.sh);
  }
  // ── window ──
  const wx = 10, wy = 26, ww = 8, wh = 7;
  p.rect(wx - 1, wy - 1, ww + 2, wh + 2, '#3a2414');
  const g0 = mix('#c98c3c', '#ffc860', glow), g1 = mix('#e0a850', '#ffe39a', glow);
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) p.set(wx + x, wy + y, y < 2 ? g0 : (x < 3 && y < 4 ? g1 : mix(g0, g1, .5)));
  p.rect(wx + 3, wy, 2, wh, '#6b3f1c'); p.rect(wx, wy + 3, ww, 1, '#6b3f1c');   // muntins
  p.rect(wx - 3, wy - 1, 2, wh + 2, '#3f5d68'); p.rect(wx + ww + 1, wy - 1, 2, wh + 2, '#3f5d68');   // shutters
  p.rect(wx - 3, wy - 1, 1, wh + 2, '#4f7480'); p.rect(wx + ww + 2, wy - 1, 1, wh + 2, '#2f4852');
  p.rect(wx - 2, wy + wh + 1, ww + 4, 1, '#6b4424');                                    // sill
  for (let x = wx - 2; x < wx + ww + 2; x++) if (R() < .75) p.set(x, wy + wh, SNOW.lt);
  // ── door ──
  p.rect(28, 24, 10, 1, '#3a2414'); p.rect(28, 25, 1, 12, '#3a2414'); p.rect(37, 25, 1, 12, '#3a2414');
  for (let x = 29; x <= 36; x++) for (let y = 25; y <= 36; y++) p.set(x, y, ((x - 29) % 3 === 2) ? '#4a2c14' : (x < 32 ? '#7a4f27' : '#6d4523'));
  p.set(34, 31, '#e8bd5a'); p.set(34, 32, '#a0782a');
  p.rect(27, 37, 12, 1, '#9a9ea8');
  for (let x = 28; x < 38; x++) if (R() < .8) p.set(x, 36, SNOW.lt);
  if (val) p.blit(heartPix(5, 'red'), 31, 27);   // Valentine: heart on the door
  // ── chimney (behind roof ridge) ──
  for (let y = 2; y <= 12; y++) for (let x = 29; x <= 34; x++) {
    const row = y >> 1, off = (row & 1) ? 1 : 0;
    let c = ((y & 1) === 1) ? '#4a2420' : (((x - 29 + off) % 3 === 2) ? '#4a2420' : (((x + row) & 1) ? '#8a4036' : '#a85a46'));
    if (x === 34) c = (y & 1) ? '#3a1c1a' : '#5e2a26';
    p.set(x, y, c);
  }
  p.rect(28, 1, 8, 1, '#70747f'); p.rect(28, 1, 8, 1, '#70747f');
  p.rect(29, 0, 6, 1, SNOW.hi); p.set(28, 0, SNOW.lt); p.set(35, 0, SNOW.lt);
  p.set(31, 1, '#2a1a1a'); p.set(32, 1, '#2a1a1a');
  // ── roof (y 9..20, ridge 12..36 widening 1px/row) ──
  const roofM = '#54444f', roofL = '#6a5862', roofD = '#3f3340';
  for (let k = 0; k < 12; k++) {
    const y = 9 + k, L = 12 - k, Rr = 36 + k;
    for (let x = L; x <= Rr; x++) {
      const seam = ((x + (k & 1) * 2) % 4) === 0;
      let c = seam ? roofD : ((k & 1) ? roofL : roofM);
      if (k === 11) c = roofD;
      const depth = 5.4 + Math.sin(x * .85) * 1.3 + Math.cos(x * .37) * .9;
      if (k < depth - 1) c = (k < 2 || x <= L + 1) ? SNOW.hi : SNOW.lt;
      else if (k < depth) c = SNOW.md;
      else if (k < depth + 1) c = mix(roofD, '#2a2036', .4);
      p.set(x, y, c);
    }
  }
  for (const ix of [6, 15, 27, 33, 41]) { p.set(ix, 21, '#d4ebf7'); if (ix % 2) p.set(ix, 22, '#aacfe4'); }
  return p;
}

/* ───────────────────────── chair (front view) ───────────────────────── */
function buildChair() {
  const p = new Pix(9, 11);
  const hi = '#b98a52', mid = '#8a5a30', dk = '#4a2c16';
  for (let x = 1; x <= 7; x++) for (let y = 1; y <= 5; y++) p.set(x, y, y === 1 ? hi : ((x & 1) ? dk : mid));   // slatted back
  p.rect(1, 0, 7, 1, SNOW.hi);
  p.rect(1, 6, 7, 1, '#a5733e'); p.rect(0, 7, 9, 1, '#7a4a26'); p.set(5, 6, SNOW.lt); p.set(6, 6, SNOW.hi);  // seat + snow
  p.rect(0, 4, 2, 1, hi); p.rect(7, 4, 2, 1, hi); p.set(0, 3, SNOW.hi); p.set(8, 3, SNOW.lt);                  // armrests
  p.rect(0, 5, 1, 3, dk); p.rect(8, 5, 1, 3, dk);
  p.rect(1, 8, 1, 3, dk); p.rect(7, 8, 1, 3, dk);                                                             // legs
  return p;
}

/* ───────────────────────── orange cat, lying stretched across both seats ───────────────────────── */
function buildCat() {
  const p = new Pix(11, 5);
  const O = '#e8892b', L = '#f7b865', D = '#b45a1a', W = '#fff1dc', K = '#2e1c14', P = '#e8949a';
  const row = (y, x0, x1, c) => { for (let x = x0; x <= x1; x++) p.set(x, y, c); };
  p.set(0, 0, D); p.set(2, 0, D);                                       // ears
  row(1, 0, 3, O); row(1, 4, 8, L);                                     // head / back highlight
  row(2, 0, 3, O); row(2, 4, 9, O); p.set(1, 2, K);                     // closed eye
  row(3, 0, 3, O); row(3, 4, 9, O); p.set(1, 3, P);                     // nose
  p.set(5, 2, D); p.set(7, 2, D); p.set(6, 3, D); p.set(8, 3, D);       // tabby stripes
  row(4, 0, 2, W); row(4, 3, 8, '#f0b070');                             // paws, belly
  p.set(10, 2, O); p.set(10, 3, O); p.set(10, 4, D);                    // tail
  return p;
}

/* ───────────────────────── scene: overlay only (the original sky/ground stay) ───────────────────────── */
function pixelScale(W, H) { return clamp(Math.round(Math.min(W, H) / 260), 2, 3); }

function leafPatch(p, x, y, sz, col, R) {
  const set = LEAF[col];
  const body = set[2 + Math.floor(R() * 2)], lite = set[4], dark = set[1];
  const shapes = { 1: [[0, 0], [1, 0]], 2: [[0, 0], [1, 0], [2, 0]], 3: [[0, 0], [1, 0], [0, 1], [1, 1]], 4: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] };
  const s = shapes[sz];
  s.forEach(([i, j]) => p.set(x + i, y + j, j === 0 ? body : dark));
  if (R() < .6) p.set(x + s[0][0], y + s[0][1], lite);
}

/* Builds ONLY a transparent layer that sits on the original ground (which starts at 60% of the height). */
function buildScene(o) {
  const S = o.S, LW = Math.ceil(o.W / S), LH = Math.ceil(o.H / S);
  const gT = Math.ceil(o.H * .6 / S);
  const isW = o.season === 'winter';
  const R = rng(isW ? 4321 : 0x6a7);
  const land = new Pix(LW, LH);
  let cabin = null;

  if (!isW) {
    // fallen leaves on the ground: more of them the deeper into autumn
    const cov = o.coverage, area = LW * (LH - gT);
    const wcol = () => { const v = R(); return v < .34 ? 'orange' : v < .62 ? 'gold' : 'red'; };
    const drop = (n, mx, my, rad) => {
      for (let k = 0; k < n; k++) {
        const a = R() * 6.283, d = Math.sqrt(R()) * rad;
        const x = Math.round(mx + Math.cos(a) * d * 1.6), y = Math.round(my + Math.sin(a) * d * .6);
        if (y < gT + 1 || y >= LH || x < 0 || x >= LW) continue;
        const depth = (y - gT) / (LH - gT);
        leafPatch(land, x, y, 1 + Math.min(3, Math.floor(depth * 2.4 + R() * 1.1)), wcol(), R);
      }
    };
    const clusters = Math.round(area / 700 * (.3 + cov));
    for (let i = 0; i < clusters; i++) drop(4 + Math.floor(R() * 8 * (.4 + cov)), R() * LW, gT + 2 + Math.pow(R(), .8) * (LH - gT - 4), 3 + R() * 8);
    drop(Math.round(area / 300 * cov), LW / 2, (gT + LH) / 2, 9999);
  } else {
    // snow cover over the ground, soft crest on top fading to deeper blue toward the bottom
    const edge = ridge(77, gT + 1, 1.6, .08);
    const cols = ['#c6d8ea', '#a9c0da', '#8aa3c6', '#6f87ae', '#5a729a'];
    for (let x = 0; x < LW; x++) {
      const y0 = Math.round(edge(x));
      for (let y = y0; y < LH; y++) {
        const dpt = y - y0;
        land.set(x, y, dpt === 0 ? SNOW.hi : dpt === 1 ? SNOW.lt : ladder(cols, (y - gT) / (LH - gT), x, y));
      }
    }
    for (let i = 0; i < Math.round(LW * (LH - gT) / 2600); i++) {           // a few low drifts
      const my = gT + 8 + Math.floor(Math.pow(R(), .9) * (LH - gT - 14));
      const mx = Math.floor(R() * LW), mw = 8 + Math.floor(R() * 14);
      for (let dx = -mw; dx <= mw; dx++) {
        const s = my - Math.round(1.4 * Math.sqrt(1 - Math.pow(dx / mw, 2)));
        if (land.has(mx + dx, s)) { land.set(mx + dx, s, SNOW.lt); if (dx > -mw * .3) land.set(mx + dx, s + 1, SNOW.sh); }
      }
    }
    for (let i = 0; i < LW * (LH - gT) / 300; i++) {                         // sparkles
      const x = Math.floor(R() * LW), y = gT + Math.floor(R() * (LH - gT));
      if (land.has(x, y)) land.set(x, y, SNOW.hi);
    }

    // cabin standing on the snow, two chairs in front of its door, a cat asleep across them
    const cabX = Math.round((o.W / 2 + Math.min(o.W * .3, 240)) / S);
    const base = gT + 16, cabLeft = cabX - (CAB.w >> 1), top = base - 39;
    land.blit(buildCabin(R, LIGHT_I[o.phase], o.valentine), cabLeft, top);
    const chair = buildChair(), cy = base - 5;
    const c1x = cabLeft + 20, c2x = c1x + chair.w + 3;
    for (const x of [c1x, c2x]) {
      for (let i = 1; i < chair.w; i++) land.set(x + i, cy + chair.h, SNOW.sh);
      for (let i = 2; i < chair.w - 1; i++) land.set(x + i, cy + chair.h + 1, SNOW.md);
    }
    land.blit(chair, c1x, cy); land.blit(chair, c2x, cy);
    land.blit(buildCat(), c1x + 3, cy + 1);
    let lights = null;
    if (o.valentine) {            // string lights along the eave (wire baked, bulbs animated)
      lights = [];
      for (let x = 3; x <= 45; x++) {
        const frac = ((x - 3) % 14) / 14, dy = Math.round(Math.sin(frac * Math.PI) * 2);
        land.set(cabLeft + x, top + 21 + dy, '#2a1a22');
        if ((x - 3) % 3 === 1) lights.push({ x: (cabLeft + x) * S, y: (top + 22 + dy) * S });
      }
    }
    cabin = {
      lights, cat: { x: (c1x + 5) * S, y: (cy + 1) * S },
      win: { x: cabLeft + 10, y: top + 26, w: 8, h: 7 },
      chim: { x: cabLeft + 31.5, y: top },
    };
  }

  // night / dusk tint so the layer sits in the original palette
  const tint = TINT[o.phase], d = land.d, tc = rgb(tint.c);
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) {
    d[i] += (tc[0] - d[i]) * tint.a; d[i + 1] += (tc[1] - d[i + 1]) * tint.a; d[i + 2] += (tc[2] - d[i + 2]) * tint.a;
  }
  // warm window light spilling onto the snow
  if (cabin) {
    const I = LIGHT_I[o.phase], wn = cabin.win, wcx = wn.x + wn.w / 2, wcy = wn.y + wn.h / 2, rad = 15 + I * 6, wc = rgb('#ffb54a');
    for (let y = Math.floor(wcy - rad); y <= Math.ceil(wcy + rad * 1.5); y++) for (let x = Math.floor(wcx - rad * 1.4); x <= Math.ceil(wcx + rad * 1.4); x++) {
      if (x < 0 || y < 0 || x >= LW || y >= LH) continue;
      const i = (y * LW + x) * 4; if (!d[i + 3]) continue;
      const dd = Math.hypot((x - wcx) / 1.3, (y - wcy) / 1.2) / rad;
      if (dd >= 1) continue;
      const m = Math.floor(Math.pow(1 - dd, 1.7) * I * 5 + bay(x, y)) / 5 * .7;
      d[i] += (wc[0] - d[i]) * m; d[i + 1] += (wc[1] - d[i + 1]) * m; d[i + 2] += (wc[2] - d[i + 2]) * m;
    }
  }
  const meta = {};
  if (cabin) meta.fx = { lights: cabin.lights, cat: cabin.cat, win: { x: cabin.win.x * S, y: cabin.win.y * S, w: cabin.win.w * S, h: cabin.win.h * S }, chim: { x: cabin.chim.x * S, y: cabin.chim.y * S } };
  return { S, LW, LH, land: land.canvas(), meta, season: o.season, phase: o.phase };
}

function ridge(seed, base, amp, scale) {
  const r = rng(seed), p = [r() * 6.28, r() * 6.28];
  return x => base + amp * (.65 * Math.sin(x * scale + p[0]) + .35 * Math.sin(x * scale * 2.3 + p[1]));
}

/* ───────────────────────── per-frame drawing ───────────────────────── */
function blitScaled(ctx, img, S) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, img.width * S, img.height * S);
}
function drawLand(ctx, sc) { blitScaled(ctx, sc.land, sc.S); }

/* Smoke puffs: purely a function of time → seamless loop, no state */
const PUFFS = 9, PERIOD = 11;
function drawFX(ctx, sc, t, animate, phase, val) {
  const f = sc.meta && sc.meta.fx;
  if (!f) return;
  const S = sc.S, base = ctx.globalAlpha;
  const tt = animate ? t : 4.2;
  // window flicker: warm lift in three discrete steps
  const fl = animate ? (Math.sin(tt * 2.1) + Math.sin(tt * 5.3 + 1.7) * .6 + Math.sin(tt * 11.7) * .25) : 0;
  const lvl = fl > .9 ? 2 : fl > .1 ? 1 : 0;
  if (lvl) { ctx.fillStyle = lvl === 2 ? 'rgba(255,238,170,.20)' : 'rgba(255,230,150,.09)'; ctx.fillRect(f.win.x, f.win.y, f.win.w, f.win.h); }
  // smoke
  const lightSmoke = phase === 'night' ? ['#7586a6', '#56688c'] : phase === 'dusk' ? ['#c4aabc', '#9a86a0'] : ['#e9eff6', '#c3cfdf'];
  const ox = Math.round(f.chim.x / S), oy = Math.round(f.chim.y / S);
  for (let i = 0; i < PUFFS; i++) {
    const a = ((tt / PERIOD) + i / PUFFS) % 1;
    const rise = a * 34;
    const sway = Math.sin(a * 5.2 + i * 1.9) * (1 + a * 2.2) + a * a * 7;
    const x = Math.round(ox + sway), y = Math.round(oy - 1 - rise);
    const size = a < .14 ? 1 : a < .4 ? 2 : a < .7 ? 3 : 4;                 // radius in logical px
    const alpha = Math.round(Math.pow(1 - a, 1.25) * .8 * 5) / 5;
    if (alpha <= 0) continue;
    if (val && i % 3 === 0) {                                              // Valentine: every third puff is a heart
      const hs = heartSprite(a < .3 ? 5 : a < .65 ? 6 : 8, i % 2 ? 'pink' : 'rose');
      ctx.globalAlpha = alpha * base;
      ctx.drawImage(hs, (x - (hs.width >> 1)) * S, (y - (hs.height >> 1)) * S, hs.width * S, hs.height * S);
      continue;
    }
    ctx.globalAlpha = alpha * base;
    for (let j = -size; j <= size; j++) for (let k = -size; k <= size; k++) {
      const dd = k * k + j * j * 1.15;
      if (dd > size * size + .6) continue;
      const edge = dd > (size - 1) * (size - 1) + .5;
      if (edge && ((k + j + i) & 1)) continue;                                // ragged, pixel-y edge
      ctx.fillStyle = (k + j < -size * .4 && !edge) ? lightSmoke[0] : (edge || k + j > size * .5) ? lightSmoke[1] : lightSmoke[0];
      ctx.fillRect((x + k) * S, (y + j) * S, S, S);
    }
  }
  ctx.globalAlpha = base;
  if (val) {
    if (f.lights) {                                                         // twinkling string lights
      const LC = ['#ff4d79', '#ffd27a', '#ff9fba', '#fff4f8'];
      f.lights.forEach((l, i) => {
        const on = animate ? ((tt * 2.4 + i * .9) % 3) < 2.1 : true;
        const col = LC[i % 4];
        ctx.fillStyle = col;
        if (on) { ctx.globalAlpha = .2 * base; ctx.fillRect(l.x - S, l.y - S, S * 3, S * 3); }
        ctx.globalAlpha = (on ? 1 : .35) * base; ctx.fillRect(l.x, l.y, S, S);
      });
      ctx.globalAlpha = base;
    }
    if (f.cat) {                                                            // little hearts drifting up from the sleeping cat
      for (let k = 0; k < 2; k++) {
        const a = ((tt / 3.6) + k * .5) % 1, hs = heartSprite(4 + k, k ? 'pink' : 'red');
        ctx.globalAlpha = Math.sin(a * Math.PI) * .95 * base;
        ctx.drawImage(hs, Math.round((f.cat.x + (k ? 5 : -2) * S + Math.sin(a * 6 + k) * 2 * S) / S) * S, Math.round((f.cat.y - 6 * S - a * 16 * S) / S) * S, hs.width * S, hs.height * S);
      }
      ctx.globalAlpha = base;
    }
  }
}

/* ───────────────────────── falling-leaf sprites ───────────────────────── */
const LEAF_SHAPES = {
  petal: ['.11.', '1121', '1111', '.11.'],
  petalS: ['.1.', '121', '.1.'],
  maple: ['...1...', '.1.1.1.', '1111111', '.11211.', '1111111', '..121..', '...3...'],
  oak:   ['..11..', '.1111.', '11211.', '.1111.', '112111', '.1111.', '..33..'],
  round: ['.111.', '11211', '11211', '.111.', '..3..'],
  birch: ['..1..', '.121.', '11211', '.111.', '..3..'],
  tiny:  ['.1.', '111', '.3.'],
};
const LEAF_COLS = [
  ['#c2561a', '#e0802a', '#5a2418'], ['#e0802a', '#f5b24a', '#7a3a1a'], ['#d09a28', '#fbe27a', '#6a4a18'],
  ['#a53a30', '#e88a5a', '#4a1a22'], ['#8a4a22', '#c08040', '#3e2412'], ['#efc345', '#fff0a0', '#8a6a1c'],
];
function makeLeaf(shape, cols, size) {
  const rows = LEAF_SHAPES[shape], h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    x.fillStyle = ch === '1' ? cols[0] : ch === '2' ? cols[1] : cols[2];
    x.fillRect(i, j, 1, 1);
  }));
  // eight tumble frames: face-on → edge-on → mirrored
  const frames = [];
  const scales = [1, .72, .4, .72, 1, .72, .4, .72];
  const flips = [0, 0, 0, 0, 1, 1, 1, 1];
  scales.forEach((s, n) => {
    const hh = Math.max(2, Math.round(h * s));
    const f = document.createElement('canvas'); f.width = w; f.height = hh;
    const fx = f.getContext('2d'); fx.imageSmoothingEnabled = false;
    if (flips[n]) { fx.translate(w, 0); fx.scale(-1, 1); }
    fx.drawImage(c, 0, 0, w, h, 0, 0, w, hh);
    frames.push(f);
  });
  return { frames, w, h, small: size === 'small' };
}
let _leafSets = null;
function leafSprites() {
  if (_leafSets) return _leafSets;
  const sets = [];
  LEAF_COLS.forEach((cols, i) => {
    sets.push(makeLeaf(i % 2 ? 'birch' : 'round', cols, 'big'));
    sets.push(makeLeaf('tiny', cols, 'small'));
    sets.push(makeLeaf('tiny', cols, 'small'));
  });
  return (_leafSets = sets);
}

let _petals = null;
function petalSprites() {
  if (_petals) return _petals;
  const cols = [['#e8334a', '#ff7a98', '#8a1238'], ['#ff6fa0', '#ffc0d6', '#a3295a'], ['#c2224f', '#ff5a80', '#6a0f2c'], ['#ff8fb8', '#ffd6e6', '#b03a6a']];
  _petals = [];
  cols.forEach(c => { _petals.push(makeLeaf('petal', c, 'big')); _petals.push(makeLeaf('petalS', c, 'small')); });
  return _petals;
}

global.GTScenery = { heartSprite, petalSprites, pixelScale, buildScene, drawLand, drawFX, leafSprites };
})(window);
