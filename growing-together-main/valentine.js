/* ═══════════════════════════════════════════════════════════════════════════
   valentine.js — Growing Together
   A one-day romantic layer for 14 February (local date).

   It adds, on top of whatever the season already shows:
     · a soft pink pixel aurora, a heart-shaped constellation, shooting stars
     · a heartbeat glow around the tree + hearts that rise from it
     · drifting rose petals, tap-anywhere heart bursts
     · (cabin lights / heart smoke / cat hearts live in scenery.js)
     · a Valentine banner and a daily Valentine message pool

   Nothing here runs on other days.  To preview on any day open the app with
   ?valentine in the address (no UI is added for it).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var FORCED = /[?&]valentine(=1|=true|&|$)/.test(global.location ? global.location.search : '');
function isDay(d) { return FORCED || (d.getMonth() === 1 && d.getDate() === 14); }

/* ── daily message (rotates by year so every Valentine's Day is different) ── */
var MSGS = [
  'ولنتاینت مبارک عشق من ❤️',
  'تو بهترین اتفاق زندگی منی 💘',
  'هر روز کنار تو، یه ولنتاینه 💕',
  'قلب من خونه‌ی تو شده، بمون 🏡❤️',
  'ما با هم بزرگ می‌شیم، مثل این درخت 🌳💗',
  'امروز بیشتر از دیروز دوستت دارم، کمتر از فردا 💞',
  'اگه عشق یه فصل بود، اسمش تو بود 🌷',
  'ریشه‌هام تو دستای توئه 🌱❤️',
  'کنار تو برف هم گرمه ❄️🔥',
  'دو تا صندلی، یه کلبه، و تو. همین کافیه 🏡💕',
  'تو دلیل لبخندمی، همیشه 😊💖',
  'دنیای من با تو رنگی شده 🌈',
  'عاشقتم، به اندازه‌ی همه‌ی ستاره‌ها ✨',
  'هر ضربان قلبم یه بار اسمتو می‌گه 💓',
  'تو قشنگ‌ترین ادامه‌ی داستان منی 📖❤️',
  'با تو بودن، بهترین کاریه که بلدم 💫',
  'ده سال کمه، می‌خوام تا آخر عمر باهات رشد کنم 🌳💞',
  'امشب آسمون هم برای تو قلب کشیده 💗✨',
  'تو خونه‌ی منی، هرجا که باشی 💘',
  'ولنتاین یه بهانه‌ست؛ دوستت دارم رو هر روز می‌گم 💌',
  'تو شیرین‌ترین قسمت هر روز منی 🍓',
  'همه‌ی قلب‌ها شبیه همن، ولی قلب تو مال منه 💕',
  'بغل تو، قشنگ‌ترین جای دنیاست 🫶',
  'بهم یاد دادی عشق یعنی چی 💝',
];
function message(d) {
  var ds = Math.floor((d - new Date(2000, 0, 1)) / 86400000);
  return MSGS[ds % MSGS.length];
}

/* ── small helpers ── */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bay(x, y) { return (BAYER[((y & 3) << 2) + (x & 3)] + .5) / 16; }
function beat(t) {                                  // "lub-dub", 0..1
  var p = (t % 1.8) / 1.8;
  return Math.exp(-Math.pow((p - .08) * 13, 2)) + .7 * Math.exp(-Math.pow((p - .3) * 13, 2));
}

/* ═════════════════ SKY: aurora ═════════════════ */
var aur = { c: null, x: null, t: -9, key: '' };
function drawAurora(ctx, W, H, S, t, phase, animate) {
  var LW = Math.ceil(W / S), LH = Math.ceil(H * .3 / S), key = LW + 'x' + LH;
  if (aur.key !== key) {
    aur.c = document.createElement('canvas'); aur.c.width = LW; aur.c.height = LH;
    aur.x = aur.c.getContext('2d'); aur.key = key; aur.t = -9;
  }
  var tt = animate ? t : 0;
  if (Math.abs(tt - aur.t) > .12) {                  // re-bake ~8×/s, drawing the cached bitmap every frame
    aur.t = tt;
    var img = aur.x.createImageData(LW, LH), d = img.data;
    var amp = phase === 'day' ? .5 : phase === 'night' ? .72 : .62;
    var cols = [[255, 92, 168], [186, 106, 255], [255, 150, 190]];
    for (var y = 0; y < LH; y++) for (var x = 0; x < LW; x++) {
      var u = x / LW, a = 0, r = 0, g = 0, b = 0;
      for (var k = 0; k < 3; k++) {
        var cy = LH * (.3 + .17 * k) + Math.sin(u * 5.2 + tt * .22 + k * 1.7) * LH * .08 + Math.sin(u * 11 - tt * .35 + k) * LH * .03;
        var half = LH * (.17 + .04 * Math.sin(u * 3.4 + k * 2 + tt * .18));
        var dy = (y - cy) / half;
        if (dy > 1 || dy < -1) continue;
        var prof = Math.pow(1 - Math.abs(dy), dy > 0 ? 2.2 : 1.3);
        var ray = .62 + .38 * Math.sin(x * .8 + k * 5 + tt * .6);
        var w = prof * ray * (.5 - k * .09) * amp;
        a += w; r += cols[k][0] * w; g += cols[k][1] * w; b += cols[k][2] * w;
      }
      if (a < .02) continue;
      var q = clamp(a, 0, .5) / .5 * 5, lv = Math.floor(q), fr = q - lv;
      lv = (fr > .42 + (bay(x, y) - .5) * .5 ? lv + 1 : lv) / 5;        // stepped, dithered alpha → pixel look
      var o = (y * LW + x) * 4;
      d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; d[o + 3] = lv * .5 * 255;
    }
    aur.x.putImageData(img, 0, 0);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(aur.c, 0, 0, LW * S, LH * S);
}

/* ═════════════════ SKY: heart constellation + shooting stars ═════════════════ */
function heartPoints(n) {
  var pts = [];
  for (var i = 0; i < n; i++) {
    var a = i / n * Math.PI * 2;
    pts.push([16 * Math.pow(Math.sin(a), 3), -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]);
  }
  return pts;
}
var HP = heartPoints(22);
function drawConstellation(ctx, W, H, S, t, animate) {
  var size = clamp(W * .0125, 4, 7.4);              // css px per heart-unit
  var cx = W / 2, cy = H * .215;
  var P = HP.map(function (p) { return [cx + p[0] * size, cy + p[1] * size]; });
  // faint dotted links
  ctx.fillStyle = '#ff9fc4';
  for (var i = 0; i < P.length; i++) {
    var a = P[i], b = P[(i + 1) % P.length], n = Math.max(2, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / (S * 3)));
    for (var k = 1; k < n; k++) {
      var f = k / n;
      ctx.globalAlpha = .34 + (animate ? .1 * Math.sin(t * 1.2 + i + k) : 0);
      ctx.fillRect(Math.round((a[0] + (b[0] - a[0]) * f) / S) * S, Math.round((a[1] + (b[1] - a[1]) * f) / S) * S, S, S);
    }
  }
  // stars
  for (var j = 0; j < P.length; j++) {
    var tw = animate ? .55 + .45 * Math.sin(t * 1.6 + j * 1.9) : 1, x = Math.round(P[j][0] / S) * S, y = Math.round(P[j][1] / S) * S;
    var big = (j % 4 === 0);
    ctx.globalAlpha = (big ? 1 : .85) * tw;
    ctx.fillStyle = big ? '#fff0f6' : '#ffc2d8';
    ctx.fillRect(x, y, S, S);
    if (big || tw > .85) { ctx.globalAlpha = .55 * tw; ctx.fillRect(x - S, y, S, S); ctx.fillRect(x + S, y, S, S); ctx.fillRect(x, y - S, S, S); ctx.fillRect(x, y + S, S, S); }
  }
  ctx.globalAlpha = 1;
}
function drawShootingStar(ctx, W, H, S, t, animate) {
  if (!animate) return;
  var P = 7.5, cyc = Math.floor(t / P), p = (t % P) / 1.0;      // one streak per cycle, lasting 1s
  if (p > 1) return;
  var sx = W * (.15 + .6 * hash(cyc)), sy = H * (.04 + .1 * hash(cyc + 9)), dx = (hash(cyc + 3) > .5 ? 1 : -1) * W * .32, dy = H * .11;
  var hx = sx + dx * p, hy = sy + dy * p;
  for (var k = 0; k < 14; k++) {
    var f = Math.max(0, p - k * .02);
    ctx.globalAlpha = (1 - k / 14) * (1 - p * .5) * .9;
    ctx.fillStyle = k < 2 ? '#ffffff' : k < 7 ? '#ffc8dc' : '#ff8fb8';
    ctx.fillRect(Math.round((sx + dx * f) / S) * S, Math.round((sy + dy * f) / S) * S, S, S);
  }
  ctx.globalAlpha = 1;
}

/* Heartbeat glow behind the tree, built from stepped pixel discs */
function drawTreeGlow(ctx, S, cx, cy, R, t, animate) {
  var pulse = animate ? beat(t) : .4;
  for (var k = 0; k < 6; k++) {
    var r = R * (1 - k / 6) * (1 + .06 * pulse);
    ctx.fillStyle = k < 3 ? '#ff4f8f' : '#ff86b4';
    ctx.globalAlpha = .035 + pulse * .012;
    for (var y = -r; y <= r; y += S) {
      var w = Math.round(Math.sqrt(Math.max(0, r * r - y * y)) / S) * S;
      ctx.fillRect(Math.round((cx - w) / S) * S, Math.round((cy + y) / S) * S, w * 2, S);
    }
  }
  ctx.globalAlpha = 1;
}

/* Called from drawSky, after the stars and before the ground is painted */
function drawSky(ctx, W, H, S, t, animate, phase, geom) {
  ctx.save();
  drawAurora(ctx, W, H, S, t, phase, animate);
  drawConstellation(ctx, W, H, S, t, animate);
  drawShootingStar(ctx, W, H, S, t, animate);
  if (geom) drawTreeGlow(ctx, S, W / 2, geom.baseY - geom.treeSize * .14, Math.min(120, geom.treeSize * .42), t, animate);
  ctx.restore();
}

/* ═════════════════ FOREGROUND: hearts, petals, tap bursts ═════════════════ */
var hearts = [], petals = [], bursts = [], rings = [], acc = { h: 0, p: 0 }, vc = { w: 0, h: 0 };
var HCOLS = ['red', 'pink', 'rose', 'pink', 'lilac', 'white'];

function spawnHeart(W, H, geom) {
  var fromTree = geom && Math.random() < .5, big = Math.random();
  var size = big < .12 ? 9 : big < .45 ? 7 : big < .8 ? 5 : 4;
  var x = fromTree ? W / 2 + (Math.random() - .5) * 36 : Math.random() * W;
  var y = fromTree ? geom.baseY - geom.treeSize * .12 : H + 12;
  hearts.push({
    x0: x, x: x, y: y, t: 0, size: size, pal: HCOLS[Math.floor(Math.random() * HCOLS.length)],
    vy: (size > 6 ? 16 : 24) + Math.random() * 16, swayA: 6 + Math.random() * 14, swayW: .6 + Math.random() * .8, ph: Math.random() * 6.28,
    life: fromTree ? 6 + Math.random() * 3 : 9 + Math.random() * 5, a: size >= 7 ? .95 : .75
  });
}
function spawnPetal(W) {
  var set = GTScenery.petalSprites();
  petals.push({
    spr: set[Math.floor(Math.random() * set.length)], x0: Math.random() * W, x: 0, y: -10, t: Math.random() * 9,
    vy: 22 + Math.random() * 20, swayA: 8 + Math.random() * 16, swayW: .7 + Math.random() * .8, ph: Math.random() * 6.28, fr: .8 + Math.random(), a: .92
  });
}
function burst(x, y) {
  if (bursts.length > 70) return;
  var n = 9 + Math.floor(Math.random() * 4);
  for (var i = 0; i < n; i++) {
    var a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.7, sp = 50 + Math.random() * 90;
    bursts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: .9 + Math.random() * .7, size: Math.random() < .4 ? 5 : 4, pal: HCOLS[Math.floor(Math.random() * HCOLS.length)] });
  }
  rings.push({ x: x, y: y, t: 0 });
}

function frame(c, W, H, S, dt, animate, particlesOn, t, geom) {
  if (vc.w !== W || vc.h !== H) { c.width = W; c.height = H; vc.w = W; vc.h = H; }
  var ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  if (animate && particlesOn) {
    acc.h += dt * 1.1; acc.p += dt * .9;
    while (acc.h >= 1) { acc.h--; if (hearts.length < 16) spawnHeart(W, H, geom); }
    while (acc.p >= 1) { acc.p--; if (petals.length < 11) spawnPetal(W); }
  }
  // hearts
  hearts = hearts.filter(function (h) { return h.t < h.life && h.y > -20; });
  hearts.forEach(function (h) {
    if (animate) { h.t += dt; h.y -= h.vy * dt; h.x = h.x0 + Math.sin(h.t * h.swayW + h.ph) * h.swayA; }
    var f = clamp(h.t / .9, 0, 1) * clamp((h.life - h.t) / (h.life * .3), 0, 1);
    var s = GTScenery.heartSprite(h.size, h.pal), sc = 1 + (h.size >= 7 ? .06 * beat(t + h.ph) : 0);
    ctx.globalAlpha = h.a * f;
    ctx.drawImage(s, Math.round(h.x / S) * S, Math.round(h.y / S) * S, s.width * S, s.height * S);
  });
  // petals
  petals = petals.filter(function (p) { return p.y < H + 12; });
  petals.forEach(function (p) {
    if (animate) { p.t += dt; p.y += p.vy * dt; p.x = p.x0 + Math.sin(p.t * p.swayW + p.ph) * p.swayA + p.t * 3; }
    var fr = p.spr.frames[Math.floor(p.t * p.fr * 8 + p.ph * 2) & 7];
    ctx.globalAlpha = p.a;
    ctx.drawImage(fr, Math.round(p.x / S) * S, Math.round(p.y / S) * S, fr.width * S, fr.height * S);
  });
  // tap bursts
  bursts = bursts.filter(function (b) { return b.t < b.life; });
  bursts.forEach(function (b) {
    b.t += dt; b.vy -= 26 * dt; b.vx *= (1 - 1.6 * dt); b.vy *= (1 - 1.2 * dt); b.x += b.vx * dt; b.y += b.vy * dt;
    var s = GTScenery.heartSprite(b.size, b.pal);
    ctx.globalAlpha = clamp(1 - b.t / b.life, 0, 1);
    ctx.drawImage(s, Math.round(b.x / S) * S, Math.round(b.y / S) * S, s.width * S, s.height * S);
  });
  rings = rings.filter(function (r) { return r.t < .6; });
  rings.forEach(function (r) {
    r.t += dt;
    var rad = r.t / .6 * 46;
    ctx.globalAlpha = (1 - r.t / .6) * .8; ctx.fillStyle = '#ff9fc4';
    for (var k = 0; k < 28; k++) { var a = k / 28 * 6.283; ctx.fillRect(Math.round((r.x + Math.cos(a) * rad) / S) * S, Math.round((r.y + Math.sin(a) * rad) / S) * S, S, S); }
  });
  ctx.globalAlpha = 1;
}

/* tap / click anywhere (except controls) sends a little burst of hearts */
var _armed = false;
function arm(isActive) {
  if (_armed) return; _armed = true;
  document.addEventListener('pointerdown', function (e) {
    if (!isActive()) return;
    if (e.target && e.target.closest && e.target.closest('#settBtn,#settPanel,#ringsPanel,#overlay,#installBanner,.sett-btn,.toggle')) return;
    burst(e.clientX, e.clientY);
  }, { passive: true });
}

global.GTValentine = { isDay: isDay, message: message, drawSky: drawSky, frame: frame, arm: arm, beat: beat };
})(window);
