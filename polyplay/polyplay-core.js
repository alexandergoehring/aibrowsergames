/* Polyplay – gemeinsamer Kern: Grafik, Ton, Eingabe, Rekord, Spielablauf */
(() => {
'use strict';

const W = 320, H = 240;
const PAL = {
  Y:'#ffe000', O:'#ff8a00', K:'#000000', W:'#ffffff', P:'#ff70b0', R:'#ff3030',
  G:'#20b020', g:'#90ff70', B:'#a05020', L:'#f0c080', C:'#00e0ff', M:'#e040ff',
  N:'#a0a0a0', D:'#505050', S:'#ffc890', U:'#2850ff'
};
const PP = window.PP = { W, H, PAL, time: 0, paused: false };

const cv = document.getElementById('screen');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
PP.ctx = ctx;
PP.canvas = cv;

/* ---------- Sprites ---------- */
PP.makeSprite = (rows, map = {}) => {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.' || ch === ' ') return;
    x.fillStyle = map[ch] || PAL[ch] || '#f0f';
    x.fillRect(i, j, 1, 1);
  }));
  return c;
};
PP.mirror = src => {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
  return c;
};
PP.pair = (rows, map) => { const r = PP.makeSprite(rows, map); return { r, l: PP.mirror(r), w: r.width, h: r.height }; };
PP.draw = (img, x, y, scale = 1) => ctx.drawImage(img, Math.round(x), Math.round(y), img.width * scale, img.height * scale);

/* ---------- Ton ---------- */
let ac = null, muted = false;
PP.audioOn = () => {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
  if (ac && ac.state === 'suspended') ac.resume();
};
PP.tone = (f1, f2, dur, type = 'square', vol = 0.1, delay = 0) => {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
};
PP.noise = (dur, vol = 0.15, delay = 0) => {
  if (!ac || muted) return;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = buf; g.gain.value = vol;
  s.connect(g).connect(ac.destination); s.start(ac.currentTime + delay);
};
PP.melody = (notes, len = 0.12, type = 'square', vol = 0.1) =>
  notes.forEach((f, i) => f && PP.tone(f, f, len * 0.9, type, vol, i * len));
const sfx = PP.sfx = {
  tick: () => PP.tone(1800, 1800, 0.03, 'square', 0.05),
  coin: () => { PP.tone(988, 988, 0.08, 'square', 0.1); PP.tone(1319, 1319, 0.3, 'square', 0.1, 0.08); },
  over: () => PP.melody([784, 659, 523, 392, 262], 0.17, 'triangle', 0.15)
};

/* ---------- Text ---------- */
PP.txt = (s, x, y, color = '#fff', size = 8, align = 'left') => {
  ctx.font = `${size}px "Press Start 2P", monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(s, Math.round(x), Math.round(y));
};
PP.pad = (n, l = 5) => String(Math.max(0, Math.floor(n))).padStart(l, '0');
PP.blinkOn = (period = 1, duty = 0.6) => PP.time % period < period * duty;

/* ---------- Rekord ---------- */
PP.record = key => {
  let v = 0;
  try { v = parseInt(localStorage.getItem(key), 10) || 0; } catch (e) { /* ohne Speicher */ }
  return {
    get value() { return v; },
    submit(s) {
      if (s <= v) return false;
      v = s;
      try { localStorage.setItem(key, String(v)); } catch (e) { /* egal */ }
      return true;
    }
  };
};

/* ---------- Eingabe ---------- */
const keys = PP.keys = { left: false, right: false, up: false, down: false, fire: false };
const pressed = new Set();
PP.pressed = k => pressed.delete(k);
PP.clearPressed = () => pressed.clear();
PP.press = k => { pressed.add(k); };
PP.canPause = () => false;
PP.onTap = null;   // (x, y) in Spielkoordinaten

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'fire', Enter: 'fire'
};
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (k) {
    e.preventDefault();
    if (!keys[k]) pressed.add(k);
    keys[k] = true;
    PP.audioOn();
  }
  if (e.code === 'KeyP' && PP.canPause()) PP.paused = !PP.paused;
  if (e.code === 'KeyM') muted = !muted;
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  if (PP.canPause()) PP.paused = true;
});

document.querySelectorAll('#touch [data-k]').forEach(b => {
  const k = b.dataset.k;
  const down = e => { e.preventDefault(); PP.audioOn(); if (!keys[k]) pressed.add(k); keys[k] = true; b.classList.add('on'); };
  const up = e => { e.preventDefault(); keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointerleave', up);
  b.addEventListener('pointercancel', up);
});
cv.addEventListener('pointerdown', e => {
  PP.audioOn();
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
  if (PP.onTap && PP.onTap(x, y)) return;
  pressed.add('tap');
});

/* ---------- Skalierung ---------- */
const wrap = document.getElementById('wrap');
function fit() {
  const avW = wrap.clientWidth;
  const avH = window.innerHeight - 200;
  let s = Math.min(avW / W, Math.max(avH, 240) / H);
  if (s >= 1) s = Math.floor(s);
  cv.style.width = Math.floor(W * s) + 'px';
  cv.style.height = Math.floor(H * s) + 'px';
}
addEventListener('resize', fit);
fit();

/* ---------- Anzeige ---------- */
PP.hud = (score, timeLeft, record) => {
  PP.txt('PUNKTE', 4, 2, PAL.C); PP.txt(PP.pad(score), 56, 2, '#fff');
  if (timeLeft != null) {
    const t = Math.ceil(timeLeft);
    PP.txt('ZEIT', 134, 2, PAL.C);
    PP.txt(String(t).padStart(2, '0'), 170, 2, t <= 10 && PP.blinkOn(0.5, 0.5) ? PAL.R : '#fff');
  }
  PP.txt('REKORD', 212, 2, PAL.C); PP.txt(PP.pad(record), 276, 2, PAL.Y);
};
PP.dim = (a = 0.7, y = 12, h = H - 12) => { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, y, W, h); };

/* ---------- Spielablauf ----------
   cfg: {
     recordKey, time (Sekunden oder null),
     reset(g)          neues Spiel vorbereiten
     update(dt, g)     Spiel läuft; g.end() beendet
     draw(g)           Spielbild
     attract(g)        Titelbild (optional attractUpdate(dt, g))
     overLines(g)      [[text, farbe], …] für den Endbildschirm
   } */
PP.arcade = cfg => {
  const rec = PP.record(cfg.recordKey);
  const g = {
    state: 'attract', stateT: 0, score: 0, timeLeft: cfg.time, newRecord: false, lastTick: 0, record: rec,
    end(reason) {
      if (g.state !== 'play') return;
      g.state = 'over'; g.stateT = 0; g.endReason = reason || '';
      g.newRecord = rec.submit(g.score);
      sfx.over();
    },
    addTime(s) { if (g.timeLeft != null) g.timeLeft += s; }
  };
  PP.canPause = () => g.state === 'play';

  const startPressed = () => PP.pressed('fire') | PP.pressed('tap');
  function start() {
    g.score = 0; g.timeLeft = cfg.time; g.newRecord = false; g.lastTick = 0; g.endReason = '';
    PP.clearPressed();
    cfg.reset(g);
    g.state = 'play'; g.stateT = 0;
    sfx.coin();
  }

  function update(dt) {
    g.stateT += dt;
    if (g.state === 'attract') {
      if (cfg.attractUpdate) cfg.attractUpdate(dt, g);
      if (startPressed()) start();
      return;
    }
    if (g.state === 'over') {
      if (cfg.overUpdate) cfg.overUpdate(dt, g);
      if (startPressed() && g.stateT > 1.5) start();
      else if (g.stateT > 12) { g.state = 'attract'; g.stateT = 0; if (cfg.attractReset) cfg.attractReset(g); }
      return;
    }
    if (g.timeLeft != null) {
      g.timeLeft -= dt;
      const sec = Math.ceil(g.timeLeft);
      if (sec <= 10 && sec > 0 && sec !== g.lastTick) { g.lastTick = sec; sfx.tick(); }
      if (g.timeLeft <= 0) { g.timeLeft = 0; g.end('time'); return; }
    }
    cfg.update(dt, g);
    PP.pressed('tap');
  }

  function render() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (g.state === 'attract') {
      cfg.attract(g);
      PP.hud(0, null, rec.value);
      if (PP.blinkOn()) PP.txt('LEERTASTE = MUENZE EINWERFEN', W / 2, 222, PAL.Y, 8, 'center');
      return;
    }
    cfg.draw(g);
    PP.hud(g.score, g.timeLeft, rec.value);
    if (g.state === 'over') {
      PP.dim(0.78, 14, 212);
      PP.txt('SPIELENDE', W / 2, 44, PAL.R, 16, 'center');
      const lines = cfg.overLines ? cfg.overLines(g) : [];
      [['PUNKTE ' + PP.pad(g.score), '#fff'], ...lines].forEach(([s, c], i) => PP.txt(s, W / 2, 80 + i * 18, c || '#fff', 8, 'center'));
      if (g.newRecord && PP.blinkOn(0.6, 0.66)) PP.txt('NEUER REKORD!', W / 2, 166, PAL.Y, 8, 'center');
      if (g.stateT > 1.5 && PP.blinkOn()) PP.txt('LEERTASTE = NEUES SPIEL', W / 2, 192, PAL.C, 8, 'center');
    }
  }
  PP.run(update, render);
  return g;
};

/* ---------- Hauptschleife ---------- */
PP.run = (update, render) => {
  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    PP.time += dt;
    if (PP.paused) {
      if (PP.pressed('fire') || PP.pressed('tap')) PP.paused = false;
      render();
      PP.dim(0.7, 90, 50);
      PP.txt('PAUSE', W / 2, 100, PAL.Y, 16, 'center');
      PP.txt('LEERTASTE = WEITER', W / 2, 124, '#fff', 8, 'center');
    } else {
      update(dt);
      render();
    }
    requestAnimationFrame(frame);
  }
  const fontReady = document.fonts ? document.fonts.load('8px "Press Start 2P"').catch(() => {}) : Promise.resolve();
  Promise.race([fontReady, new Promise(r => setTimeout(r, 1500))]).then(() => requestAnimationFrame(frame));
};

PP.rand = (a, b) => a + Math.random() * (b - a);
PP.pick = arr => arr[Math.floor(Math.random() * arr.length)];
PP.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
})();
