// Smoke test headless do Fagulho: stubs de DOM/canvas, carrega os 5 scripts
// e roda o jogo por milhares de frames simulando input real.
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');

// ---------- stub de canvas/context ----------
function makeGradient() { return { addColorStop() {} }; }
function makeCtx() {
  const base = {
    canvas: null,
    save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    arc() {}, ellipse() {}, rect() {}, fill() {}, stroke() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    translate() {}, rotate() {}, scale() {}, setTransform() {}, transform() {},
    drawImage() {}, measureText() { return { width: 10 }; },
    createLinearGradient: makeGradient, createRadialGradient: makeGradient,
    createPattern() { return {}; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
    putImageData() {}, setLineDash() {},
  };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      return undefined; // propriedades tipo fillStyle: gravadas via set
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function makeCanvas(w, h) {
  const c = { width: w || 300, height: h || 150, style: {} };
  const ctx = makeCtx();
  ctx.canvas = c;
  c.getContext = () => ctx;
  return c;
}

// ---------- stub de window/document ----------
const listeners = {};
global.window = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener() {},
};
global.document = {
  getElementById: (id) => (id === 'game' ? gameCanvas : null),
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {}),
};
const gameCanvas = makeCanvas(960, 540);

let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; };
global.performance = global.performance || { now: () => 0 };
// setInterval real do node funciona (música nem inicia: sem AudioContext)

// window.FG etc.
global.window.AudioContext = undefined;
global.window.webkitAudioContext = undefined;

// ---------- carrega os scripts na ordem do index.html ----------
// No browser, `FG` e `window.FG` são o mesmo global; aqui pré-criamos o objeto
// e o passamos também como parâmetro `FG` para os bare references funcionarem.
global.window.FG = {};
const order = ['audio.js', 'level.js', 'player.js', 'enemies.js', 'engine.js'];
for (const f of order) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const fn = new Function('window', 'document', 'requestAnimationFrame', 'performance', 'FG', src);
  fn(global.window, global.document, global.requestAnimationFrame, global.performance, global.window.FG);
}
const FG = global.window.FG;
if (!FG || !FG.engine || !FG.player || !FG.level || !FG.enemies || !FG.audio) {
  console.error('FALHOU: módulos ausentes', Object.keys(FG || {}));
  process.exit(1);
}

// ---------- helpers de simulação ----------
let now = 0;
function frames(n) {
  for (let i = 0; i < n; i++) {
    now += 16.7;
    const cb = rafCb; rafCb = null;
    cb(now);
    if (!rafCb) throw new Error('loop parou de agendar rAF');
  }
}
function key(code, down) {
  const evs = listeners.keydown && !down ? listeners.keyup : listeners.keydown;
  const list = down ? listeners.keydown : listeners.keyup;
  for (const fn of list || []) fn({ code, preventDefault() {} });
}
function tap(code, framesHeld) {
  key(code, true); frames(framesHeld || 2); key(code, false);
}

// ---------- cenário 1: menu → jogar ----------
frames(30); // menu animando
if (FG.engine.state !== 'menu') throw new Error('estado inicial != menu: ' + FG.engine.state);
tap('Space', 2);
frames(5);
if (FG.engine.state !== 'playing') throw new Error('não entrou em playing: ' + FG.engine.state);

// ---------- cenário 2: correr, pular, planar, socar por 20s ----------
key('ArrowRight', true);
for (let burst = 0; burst < 12; burst++) {
  frames(40);
  tap('Space', 3); frames(6); tap('Space', 3);      // pulo duplo
  key('Space', true); frames(20); key('Space', false); // planar
  tap('KeyX', 3);                                    // soco
}
key('ArrowRight', false);
frames(30);
console.log('pós-passeio: x=%s hp=%s lumis=%s estado=%s',
  Math.round(FG.player.x), FG.player.hp, FG.engine.lumis, FG.engine.state);

// ---------- cenário 3: teleporta perto do boss e luta ----------
if (FG.engine.state === 'dead') frames(120); // deixa respawnar
FG.player.x = 6400; FG.player.y = 560; FG.player.vy = 0; FG.player.hp = FG.player.maxHp;
frames(10);
if (!FG.enemies.boss.started) throw new Error('boss não disparou com player em x=6400');
frames(90); // intro + primeiro ataque
if (!FG.enemies.boss.active) throw new Error('boss não ficou ativo após a intro');
// simula 20s de briga com movimento e socos
for (let i = 0; i < 20; i++) {
  key(i % 2 ? 'ArrowLeft' : 'ArrowRight', true);
  frames(30);
  key(i % 2 ? 'ArrowLeft' : 'ArrowRight', false);
  tap('Space', 3); tap('KeyX', 3);
  frames(30);
  if (FG.player.hp <= 0 || FG.engine.state === 'dead') {
    FG.player.hp = FG.player.maxHp; // "cheats" para continuar exercitando código
    if (FG.engine.state === 'dead') frames(120);
  }
}
console.log('luta: bossHp=%s estado boss=%s player hp=%s',
  FG.enemies.boss.hp, FG.enemies.boss.state, FG.player.hp);

// ---------- cenário 4: mata o boss via takeHit e confere vitória ----------
while (FG.enemies.boss.hp > 0) FG.enemies.boss.takeHit();
if (!FG.enemies.boss.dead) throw new Error('boss.dead não setado com hp 0');
frames(200); // morte cinematográfica (2.5s) + overlay
if (FG.engine.state !== 'victory') throw new Error('não chegou em victory: ' + FG.engine.state);

// ---------- cenário 5: reinicia da vitória ----------
tap('Space', 2);
frames(5);
if (FG.engine.state !== 'playing') throw new Error('restart pós-vitória falhou: ' + FG.engine.state);
if (FG.engine.lumis !== 0) throw new Error('lumis não zeraram no restart: ' + FG.engine.lumis);
if (FG.enemies.boss.started) throw new Error('boss não re-armou no restart');
frames(60);

// ---------- cenário 6: morte por queda e respawn ----------
FG.player.y = FG.level.H + 200; FG.player.vy = 100; FG.player.hp = 1;
frames(5);
if (FG.engine.state !== 'dead') throw new Error('queda com hp 1 não matou: ' + FG.engine.state);
frames(120);
if (FG.engine.state !== 'playing') throw new Error('não respawnou: ' + FG.engine.state);

console.log('SMOKE OK — todos os cenários passaram');
process.exit(0);
