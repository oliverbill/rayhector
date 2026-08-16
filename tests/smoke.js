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

// stub de Image: o sprite embutido do assets.js "carrega" na hora, para o
// caminho de desenho com drawImage ser exercitado
function ImageStub() { this.complete = true; this.naturalWidth = 68; this.naturalHeight = 96; }
Object.defineProperty(ImageStub.prototype, 'src', { set() {} });

// ---------- carrega os scripts na ordem do index.html ----------
// No browser, `FG` e `window.FG` são o mesmo global; aqui pré-criamos o objeto
// e o passamos também como parâmetro `FG` para os bare references funcionarem.
global.window.FG = {};
// A ordem é a do index.html. As fases e os chefões são opcionais no filtro
// porque o jogo cresce em arquivos: com 1 fase o teste roda igual, com 3 ele
// exercita as três. Só assets/audio/player/enemies/engine são obrigatórios.
const order = [
  'assets.js', 'audio.js',
  'levelkit.js', 'level.js', 'level2.js', 'level3.js',
  'obstacles.js', 'player.js',
  'enemies.js', 'boss1.js', 'boss2.js', 'boss3.js',
  'engine.js',
].filter((f) => fs.existsSync(path.join(DIR, f)));
for (const f of order) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const fn = new Function('window', 'document', 'requestAnimationFrame', 'performance', 'FG', 'Image', src);
  fn(global.window, global.document, global.requestAnimationFrame, global.performance, global.window.FG, ImageStub);
}
const FG = global.window.FG;
if (!FG || !FG.engine || !FG.player || !FG.levels || !FG.enemies || !FG.audio) {
  console.error('FALHOU: módulos ausentes', Object.keys(FG || {}));
  process.exit(1);
}
console.log('carregados: %s · fases: %d', order.join(' '), FG.levels.length);

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

// (a escalada de parede tem teste próprio, com cenário controlado: tests/parede.js)

// ---------- cenário 3: percorre TODAS as fases, lutando e matando cada chefão ----------
// Cada volta: teleporta para a arena, deixa o chefão acordar, briga um pouco
// (para exercitar update/draw de ataque e projétil), mata pelo takeHit e
// confere a transição — 'fase' se ainda há fase na fila, 'victory' na última.
const totalFases = FG.levels.length;
let lumisAntes = 0;

for (let f = 0; f < totalFases; f++) {
  if (FG.engine.levelIndex !== f) {
    throw new Error('esperava estar na fase ' + f + ', estou na ' + FG.engine.levelIndex);
  }
  const lv = FG.level;
  if (FG.engine.state === 'dead') frames(120);

  // cai dentro da arena a partir do alto: funciona em qualquer fase, sem
  // precisar saber a altura do chão dela
  FG.player.x = lv.bossTriggerX + 40; FG.player.y = 60; FG.player.vy = 0;
  for (let k = 0; k < 60; k++) { FG.player.hp = FG.player.maxHp; frames(1); }

  const boss = FG.enemies.boss;
  if (!boss) throw new Error('fase ' + f + ' (' + lv.id + ') não tem chefão em FG.enemies.boss');
  if (boss.id !== lv.bossId) {
    throw new Error('fase ' + lv.id + ' pediu chefão ' + lv.bossId + ' e veio ' + boss.id);
  }
  if (!boss.started) throw new Error('chefão ' + boss.id + ' não disparou dentro da arena');
  frames(90); // intro + primeiro ataque
  if (!boss.active) throw new Error('chefão ' + boss.id + ' não ficou ativo após a intro');

  for (let i = 0; i < 14; i++) {
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
  console.log('fase %d (%s) · chefão %s: hp=%s estado=%s · lumis=%d',
    f, lv.id, boss.id, boss.hp, boss.state, FG.engine.lumis);

  if (typeof boss.takeHit !== 'function') {
    throw new Error('chefão ' + boss.id + ' não expõe takeHit() — o smoke precisa dele para matar');
  }
  let guard = 0;
  while (boss.hp > 0 && guard++ < 100) boss.takeHit();
  if (!boss.dead) throw new Error('chefão ' + boss.id + ': dead não setado com hp 0');

  lumisAntes = FG.engine.lumis;
  frames(240); // morte cinematográfica + overlay
  const esperado = f < totalFases - 1 ? 'fase' : 'victory';
  if (FG.engine.state !== esperado) {
    throw new Error('fase ' + f + ': esperava ' + esperado + ', veio ' + FG.engine.state);
  }
  tap('Space', 2);
  frames(5);
  if (f < totalFases - 1) {
    if (FG.engine.state !== 'playing') throw new Error('não entrou na fase ' + (f + 1) + ': ' + FG.engine.state);
    if (FG.engine.lumis < lumisAntes) {
      throw new Error('as lumis zeraram na troca de fase (eram ' + lumisAntes + ', viraram ' + FG.engine.lumis + ')');
    }
  }
}

// ---------- cenário 4: reinicia da vitória ----------
if (FG.engine.state !== 'playing') throw new Error('restart pós-vitória falhou: ' + FG.engine.state);
if (FG.engine.levelIndex !== 0) throw new Error('restart não voltou para a fase 0: ' + FG.engine.levelIndex);
if (FG.engine.lumis !== 0) throw new Error('lumis não zeraram no restart: ' + FG.engine.lumis);
if (FG.enemies.boss.started) throw new Error('chefão não re-armou no restart');
frames(60);

// ---------- cenário 5: morte por queda e respawn ----------
FG.player.y = FG.level.H + 200; FG.player.vy = 100; FG.player.hp = 1;
frames(5);
if (FG.engine.state !== 'dead') throw new Error('queda com hp 1 não matou: ' + FG.engine.state);
frames(120);
if (FG.engine.state !== 'playing') throw new Error('não respawnou: ' + FG.engine.state);

console.log('SMOKE OK — %d fase(s), todos os cenários passaram', totalFases);
process.exit(0);
